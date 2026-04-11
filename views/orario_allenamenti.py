import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
from logic import GIORNI, GIORNI_SETTIMANA, c_e_conflitto, parse_data, _norm, trova_conflitti_allenamenti
from sheets import (
    carica_tutti_i_dati, leggi_foglio, scrivi_riga, elimina_riga, aggiorna_riga,
)
from views._components import get_team_color

_GIORNI_ORDER = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]
_GIORNI_LABEL = {
    "lunedi": "Lunedì", "martedi": "Martedì", "mercoledi": "Mercoledì",
    "giovedi": "Giovedì", "venerdi": "Venerdì", "sabato": "Sabato", "domenica": "Domenica",
}

_DURATE = {"1h": 60, "1h 30'": 90, "2h": 120}
_FISICO = {"Nessuna": 0, "30'": 30, "45'": 45, "60'": 60}

_COLORI_DURATA = {
    "1h":     "#2196F3",
    "1h 30'": "#4CAF50",
    "2h":     "#9C27B0",
}
_COLORI_FISICO = {
    "Nessuna": "#607D8B",
    "30'":     "#FF9800",
    "45'":     "#FF5722",
    "60'":     "#F44336",
}


def _ore_to_min(s: str):
    try:
        h, m = str(s).strip().split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return None


def _min_to_ore(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


# ─────────────────────────────────────────────────────────────────────────────
# Card evento colorata
# ─────────────────────────────────────────────────────────────────────────────

def _render_event_card(e: dict, key_suffix: str):
    """Render un evento (allenamento o partita) come card colorata."""
    is_allenamento = e["source"] == "fisso"

    if e["is_conflict"]:
        bg = "#8B0000"
    elif is_allenamento and e.get("condivisione"):
        bg = "#1a6b50"
    elif is_allenamento:
        bg = get_team_color(e["squadra"])
    elif "Casa" in e["tipo"]:
        bg = "#0D3B6E"
    else:
        bg = "#4A235A"

    orario   = f"{e['ora_inizio']} → {e['ora_fine']}" if e["ora_inizio"] else "—"
    pal      = e["palestra"] or "—"
    all_str  = e["allenatori"]
    cond_badge = " <span style='font-size:0.82em'>🤝</span>" if (is_allenamento and e.get("condivisione")) else ""
    badge    = "" if is_allenamento else f"<span style='font-weight:400;font-size:0.82em;color:rgba(255,255,255,0.75)'> · {e['tipo']}</span>"
    if e["is_conflict"]:
        if e["cal_idx"] is not None:
            _cmsg = "⚠️ CONFLITTO con partita — premi 🔧 per risolvere"
        else:
            _cmsg = "⚠️ CONFLITTO tra allenamenti — modifica orario o palestra con ✏️"
        conflict_note = (
            f"<div style='color:#FFD700;font-size:0.78em;font-weight:600;margin-top:3px'>"
            f"{_cmsg}</div>"
        )
    else:
        conflict_note = ""

    cond_line = (
        "<div style='color:rgba(255,255,255,0.9);font-size:0.80em;margin-top:3px'>"
        "🤝 Condivisione palestra</div>"
    ) if (is_allenamento and e.get("condivisione")) else ""

    card_html = (
        f"<div style='background:{bg};border-radius:10px;padding:10px 15px;"
        f"margin:4px 0;box-shadow:0 2px 8px rgba(0,0,0,0.22)'>"
        f"<div style='display:flex;justify-content:space-between;align-items:center'>"
        f"<span style='color:white;font-weight:800;font-size:1.0em'>"
        f"{'🏀' if is_allenamento else ''} {e['squadra']}{badge}"
        f"</span>"
        f"<span style='color:rgba(255,255,255,0.95);font-weight:700;font-size:0.9em'>⏰ {orario}</span>"
        f"</div>"
        f"<div style='color:rgba(255,255,255,0.82);font-size:0.85em;margin-top:4px'>"
        f"🏟️ {pal}{(' &nbsp;&nbsp; 👤 ' + all_str) if all_str else ''}"
        f"</div>"
        f"{cond_line}"
        f"{conflict_note}"
        f"</div>"
    )

    if e["is_conflict"] and e["cal_idx"] is not None:
        c1, c2 = st.columns([9, 1])
        with c1:
            st.markdown(card_html, unsafe_allow_html=True)
        with c2:
            st.write("")
            if st.button("🔧", key=f"os_risolvi_{key_suffix}", help="Risolvi conflitto", use_container_width=True):
                st.session_state["risolvi_conflitto_idx"] = e["cal_idx"]
                st.session_state["nav_radio"] = "📋 Calendario Partite"
                st.rerun()
    else:
        st.markdown(card_html, unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────────────────
# Tab 1 — Settimana corrente
# ─────────────────────────────────────────────────────────────────────────────

def _render_settimana_corrente(orario_fisso: pd.DataFrame, calendario: pd.DataFrame,
                                df_palestre: pd.DataFrame = None,
                                conflicting_labels: set = None):
    oggi = datetime.today().date()
    lun  = oggi - timedelta(days=oggi.weekday())
    dom  = lun + timedelta(days=6)
    settimana = [lun + timedelta(days=i) for i in range(7)]

    st.markdown(
        f"<div style='background:#1a3a5c;color:white;padding:8px 16px;"
        f"border-radius:8px;margin:0 0 14px 0;font-weight:700;font-size:1.0em'>"
        f"📅 Settimana corrente &nbsp;·&nbsp; {lun.strftime('%d/%m')} → {dom.strftime('%d/%m/%Y')}"
        f"</div>",
        unsafe_allow_html=True,
    )

    # ── filtri ───────────────────────────────────────────────────────
    col_f1, col_f2 = st.columns(2)
    with col_f1:
        squadre_all = set()
        if not orario_fisso.empty and "squadra" in orario_fisso.columns:
            squadre_all.update(orario_fisso["squadra"].dropna().str.strip().unique())
        if not calendario.empty and "Squadra" in calendario.columns:
            squadre_all.update(calendario["Squadra"].dropna().str.strip().unique())
        filtro_sq = st.selectbox("🏀 Squadra", ["Tutte"] + sorted(squadre_all), key="os_filtro_sq")

    with col_f2:
        allenatori_all = set()
        if not orario_fisso.empty and "allenatori" in orario_fisso.columns:
            for v in orario_fisso["allenatori"].dropna():
                for a in str(v).split("-"):
                    a = a.strip()
                    if a:
                        allenatori_all.add(a)
        filtro_all = st.selectbox("👤 Allenatore", ["Tutti"] + sorted(allenatori_all), key="os_filtro_all")

    st.markdown("---")

    # Lista palestre per il form di modifica
    palestre_lista = []
    if df_palestre is not None and not df_palestre.empty and "Nome" in df_palestre.columns:
        palestre_lista = df_palestre["Nome"].tolist()

    _conf_labels = conflicting_labels or set()

    # ── costruisci eventi raggruppati per giorno ──────────────────────
    eventi_per_giorno = {d: [] for d in settimana}

    if not orario_fisso.empty:
        for row_label, ev in orario_fisso.iterrows():
            g = _norm(ev.get("giorno", ""))
            for d in settimana:
                if GIORNI_SETTIMANA[d.weekday()] == g:
                    eventi_per_giorno[d].append({
                        "tipo":         "🏀 Allenamento",
                        "squadra":      str(ev.get("squadra",    "")).strip(),
                        "ora_inizio":   str(ev.get("ora_inizio", "")).strip(),
                        "ora_fine":     str(ev.get("ora_fine",   "")).strip(),
                        "palestra":     str(ev.get("palestra",   "")).strip().capitalize(),
                        "allenatori":   str(ev.get("allenatori", "")).strip(),
                        "giorno_norm":  g,
                        "is_conflict":  row_label in _conf_labels,
                        "cal_idx":      None,
                        "source":       "fisso",
                        "row_label":    row_label,
                        "condivisione": str(ev.get("condivisione", ev.get("tipo", ""))).strip().upper() == "SI",
                    })

    if not calendario.empty:
        for i, (_, ev) in enumerate(calendario.iterrows()):
            data_ev = parse_data(ev.get("Data", ""))
            if data_ev is None or data_ev not in eventi_per_giorno:
                continue
            tipo        = str(ev.get("Tipo", ""))
            is_conflict = "CONFLITTO" in tipo
            # Solo partite in casa (usano la palestra → possono confliggere)
            if "Casa" not in tipo and not is_conflict:
                continue
            emoji       = "⚠️" if is_conflict else "🏠"
            eventi_per_giorno[data_ev].append({
                "tipo":        f"{emoji} Partita",
                "squadra":     str(ev.get("Squadra",    "")).strip(),
                "ora_inizio":  str(ev.get("Ora Inizio", "")).strip(),
                "ora_fine":    str(ev.get("Ora Fine",   "")).strip(),
                "palestra":    str(ev.get("Palestra",   "")).strip(),
                "allenatori":  "",
                "giorno_norm": "",
                "is_conflict": is_conflict,
                "cal_idx":     i,
                "source":      "calendario",
                "row_label":   None,
            })

    # ── applica filtri ────────────────────────────────────────────────
    def _match(e):
        if filtro_sq != "Tutte" and e["squadra"].lower() != filtro_sq.lower():
            return False
        if filtro_all != "Tutti":
            nomi = [a.strip().lower() for a in e["allenatori"].split("-")]
            if filtro_all.lower() not in nomi:
                return False
        return True

    # ── render giorno per giorno ──────────────────────────────────────
    qualcosa = False
    for d in settimana:
        evs = [e for e in eventi_per_giorno[d] if _match(e)]
        if not evs:
            continue
        evs.sort(key=lambda e: _ore_to_min(e["ora_inizio"]) or 0)

        qualcosa = True
        is_oggi   = d == oggi
        is_domani = d == oggi + timedelta(days=1)
        g_key     = GIORNI_SETTIMANA[d.weekday()]
        g_label   = _GIORNI_LABEL.get(g_key, "")
        ha_conf   = any(e["is_conflict"] for e in evs)

        if is_oggi:
            hdr_bg, prefix = "#c0392b", "🔴 OGGI —"
        elif is_domani:
            hdr_bg, prefix = "#d68910", "🟡 DOMANI —"
        elif ha_conf:
            hdr_bg, prefix = "#922b21", "⚠️"
        else:
            hdr_bg, prefix = "#1a3a5c", ""

        st.markdown(
            f"<div style='background:{hdr_bg};color:white;"
            f"padding:7px 14px;border-radius:7px;margin:14px 0 6px 0;"
            f"font-weight:700;font-size:1.05em'>"
            f"{prefix} {g_label} &nbsp;·&nbsp; {d.strftime('%d/%m/%Y')}"
            f"</div>",
            unsafe_allow_html=True,
        )

        is_admin = st.session_state.get("ruolo", "admin") == "admin"

        for ri, e in enumerate(evs):
            key_suf = f"{d}_{ri}"
            edit_key = f"_edit_fisso_{e['row_label']}"
            is_editing = is_admin and e["source"] == "fisso" and st.session_state.get(edit_key)

            if is_editing:
                # ── form inline di modifica ──────────────────────────
                rl = e["row_label"]
                with st.container():
                    st.markdown(
                        f"<div style='background:#1a3a5c;border-radius:8px;padding:10px 14px;margin:4px 0'>"
                        f"<span style='color:white;font-weight:700'>✏️ Modifica — {e['squadra']}</span>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )
                    ef_col1, ef_col2, ef_col3 = st.columns(3)
                    with ef_col1:
                        try:
                            _oi = datetime.strptime(e["ora_inizio"], "%H:%M").time()
                        except Exception:
                            _oi = datetime.strptime("18:00", "%H:%M").time()
                        new_oi = st.time_input("⏰ Ora inizio", value=_oi,
                                               key=f"_ef_oi_{rl}").strftime("%H:%M")
                    with ef_col2:
                        try:
                            _of = datetime.strptime(e["ora_fine"], "%H:%M").time()
                        except Exception:
                            _of = datetime.strptime("19:30", "%H:%M").time()
                        new_of = st.time_input("⏰ Ora fine", value=_of,
                                               key=f"_ef_of_{rl}").strftime("%H:%M")
                    with ef_col3:
                        pal_opts = palestre_lista if palestre_lista else [e["palestra"]]
                        pal_idx = pal_opts.index(e["palestra"]) if e["palestra"] in pal_opts else 0
                        new_pal = st.selectbox("🏟️ Palestra", pal_opts, index=pal_idx,
                                               key=f"_ef_pal_{rl}")

                    new_cond = st.checkbox(
                        "🤝 Condivide la palestra con un'altra squadra",
                        value=e.get("condivisione", False),
                        key=f"_ef_cond_{rl}",
                    )

                    sb1, sb2 = st.columns(2)
                    with sb1:
                        if st.button("💾 Salva", key=f"_ef_save_{rl}",
                                     type="primary", use_container_width=True):
                            ok = aggiorna_riga("Orario Fisso", rl + 1, [
                                e["giorno_norm"],
                                new_pal,
                                e["squadra"],
                                new_oi,
                                new_of,
                                e["allenatori"],
                                "SI" if new_cond else "NO",
                            ])
                            if ok:
                                carica_tutti_i_dati.clear()
                                leggi_foglio.clear()
                            st.session_state.pop(edit_key, None)
                            st.rerun()
                    with sb2:
                        if st.button("✖ Annulla", key=f"_ef_cancel_{rl}",
                                     use_container_width=True):
                            st.session_state.pop(edit_key, None)
                            st.rerun()
            else:
                # ── card normale + bottoni modifica/elimina per allenamenti ──
                if is_admin and e["source"] == "fisso":
                    del_confirm_key = f"_del_confirm_fisso_{e['row_label']}"
                    if st.session_state.get(del_confirm_key):
                        cc = st.columns([5, 1, 1])
                        cc[0].warning(
                            f"⚠️ Elimina **{e['squadra']}** — {e['giorno_norm'].capitalize()}?"
                        )
                        with cc[1]:
                            if st.button("✅", key=f"_del_yes_{key_suf}",
                                         type="primary", use_container_width=True):
                                if elimina_riga("Orario Fisso", e["row_label"] + 1):
                                    carica_tutti_i_dati.clear()
                                    leggi_foglio.clear()
                                st.session_state.pop(del_confirm_key, None)
                                st.rerun()
                        with cc[2]:
                            if st.button("✖", key=f"_del_no_{key_suf}",
                                         use_container_width=True):
                                st.session_state.pop(del_confirm_key, None)
                                st.rerun()
                    else:
                        c1, c2, c3 = st.columns([10, 1, 1])
                        with c1:
                            _render_event_card(e, key_suffix=key_suf)
                        with c2:
                            st.write("")
                            if st.button("✏️", key=f"_edit_btn_{key_suf}",
                                         help="Modifica slot", use_container_width=True):
                                st.session_state[edit_key] = True
                                st.rerun()
                        with c3:
                            st.write("")
                            if st.button("🗑️", key=f"_del_btn_{key_suf}",
                                         help="Elimina allenamento", use_container_width=True):
                                st.session_state[del_confirm_key] = True
                                st.rerun()
                elif e["source"] == "fisso":
                    # allenatore: solo lettura, niente bottoni
                    _render_event_card(e, key_suffix=key_suf)
                else:
                    _render_event_card(e, key_suffix=key_suf)

    if not qualcosa:
        st.info("Nessun evento per i filtri selezionati.")


# ─────────────────────────────────────────────────────────────────────────────
# Tab 2 — Settimana tipo
# ─────────────────────────────────────────────────────────────────────────────

def _render_settimana_tipo(orario_fisso: pd.DataFrame, conflicting_labels: set = None):
    """Mostra il template settimanale degli allenamenti fissi."""
    if orario_fisso.empty:
        st.info("Nessun allenamento fisso configurato.")
        return

    # ── filtri ───────────────────────────────────────────────────────
    col_f1, col_f2 = st.columns(2)
    with col_f1:
        squadre_all = sorted(orario_fisso["squadra"].dropna().str.strip().unique().tolist()) \
            if "squadra" in orario_fisso.columns else []
        filtro_sq = st.selectbox("🏀 Squadra", ["Tutte"] + squadre_all, key="tipo_filtro_sq")
    with col_f2:
        allenatori_all = set()
        if "allenatori" in orario_fisso.columns:
            for v in orario_fisso["allenatori"].dropna():
                for a in str(v).split("-"):
                    a = a.strip()
                    if a:
                        allenatori_all.add(a)
        filtro_all = st.selectbox("👤 Allenatore", ["Tutti"] + sorted(allenatori_all),
                                  key="tipo_filtro_all")

    st.markdown("---")

    # ── applica filtri ───────────────────────────────────────────────
    df = orario_fisso.copy()
    if filtro_sq != "Tutte":
        df = df[df["squadra"].str.strip().str.lower() == filtro_sq.lower()]
    if filtro_all != "Tutti":
        df = df[df["allenatori"].apply(
            lambda v: filtro_all.lower() in [a.strip().lower() for a in str(v).split("-")]
        )]

    trovato = False
    for g in _GIORNI_ORDER:
        mask = df["giorno"].str.lower().str.strip() == g
        gruppo = df[mask]
        if gruppo.empty:
            continue
        trovato = True
        gruppo_sorted = gruppo.sort_values("ora_inizio")

        st.markdown(
            f"<div style='background:#1a3a5c;color:white;padding:8px 16px;"
            f"border-radius:8px;margin:16px 0 8px 0;font-weight:700;font-size:1.05em'>"
            f"📅 {_GIORNI_LABEL[g]}</div>",
            unsafe_allow_html=True,
        )

        _conf_tipo = conflicting_labels or set()
        for row_idx, ev in gruppo_sorted.iterrows():
            team       = str(ev.get("squadra",    "")).strip()
            oi         = str(ev.get("ora_inizio", "")).strip()
            of         = str(ev.get("ora_fine",   "")).strip()
            pal        = str(ev.get("palestra",   "")).strip().capitalize()
            coach      = str(ev.get("allenatori", "")).strip()
            is_conf    = row_idx in _conf_tipo
            cond_si    = str(ev.get("condivisione", ev.get("tipo", ""))).strip().upper() == "SI"
            color      = "#8B0000" if is_conf else ("#1a6b50" if cond_si else get_team_color(team))
            conf_badge = (
                "<div style='color:#FFD700;font-size:0.78em;font-weight:600;margin-top:3px'>"
                "⚠️ CONFLITTO tra allenamenti — vai in Settimana corrente e usa ✏️ per modificare"
                "</div>"
            ) if is_conf else ""
            cond_line_html = (
                "<div style='color:rgba(255,255,255,0.9);font-size:0.80em;margin-top:3px'>"
                "🤝 Condivisione palestra</div>"
            ) if cond_si else ""

            st.markdown(
                f"<div style='background:{color};border-radius:10px;padding:10px 15px;"
                f"margin:4px 0;box-shadow:0 2px 6px rgba(0,0,0,0.18)'>"
                f"<div style='display:flex;justify-content:space-between;align-items:center'>"
                f"<span style='color:white;font-weight:800;font-size:1.05em'>🏀 {team}</span>"
                f"<span style='color:rgba(255,255,255,0.95);font-weight:700'>⏰ {oi} → {of}</span>"
                f"</div>"
                f"<div style='color:rgba(255,255,255,0.8);font-size:0.86em;margin-top:4px'>"
                f"🏟️ {pal}{(' &nbsp;&nbsp; 👤 ' + coach) if coach else ''}"
                f"</div>"
                f"{cond_line_html}"
                f"{conf_badge}"
                f"</div>",
                unsafe_allow_html=True,
            )

    if not trovato:
        st.info("Nessun allenamento trovato per i filtri selezionati.")


# ─────────────────────────────────────────────────────────────────────────────
# Tab 3 — Configura allenamenti
# ─────────────────────────────────────────────────────────────────────────────

def _big_button_row(options: list, colors: dict, state_key: str):
    """Bottoni grandi colorati — simula toggle. Ritorna l'opzione selezionata."""
    if state_key not in st.session_state:
        st.session_state[state_key] = options[0]

    cols = st.columns(len(options))
    for col, opt in zip(cols, options):
        selected  = st.session_state[state_key] == opt
        color     = colors.get(opt, "#888")
        bg        = color if selected else f"{color}22"
        border    = f"3px solid {color}"
        text_col  = "white" if selected else color
        shadow    = "0 2px 8px rgba(0,0,0,0.22)" if selected else "none"

        col.markdown(
            f"<div style='background:{bg};border:{border};border-radius:12px;"
            f"padding:18px 8px;text-align:center;"
            f"font-size:1.15em;font-weight:800;color:{text_col};"
            f"box-shadow:{shadow};margin-bottom:2px'>"
            f"{opt}"
            f"</div>",
            unsafe_allow_html=True,
        )
        if col.button(
            f"{'✔ ' if selected else ''}{opt}",
            key=f"_bb_{state_key}_{opt}",
            use_container_width=True,
            type="primary" if selected else "secondary",
        ):
            st.session_state[state_key] = opt
            st.rerun()

    return st.session_state[state_key]


def _render_configura(
    orario_fisso: pd.DataFrame,
    df_squadre:   pd.DataFrame,
    df_palestre:  pd.DataFrame,
    df_allenatori: pd.DataFrame,
):
    if st.session_state.pop("_cfg_saved_msg", None):
        saved_info = st.session_state.pop("_cfg_saved_info", "")
        st.success(f"✅ Allenamento salvato! {saved_info}")

    st.markdown("---")

    col1, col2, col3 = st.columns(3)
    with col1:
        squadre  = df_squadre["Categoria"].tolist() if not df_squadre.empty else []
        squadra  = st.selectbox("🏀 Squadra",  ["— Seleziona —"] + squadre,  key="cfg_squadra")
    palestre_lista = df_palestre["Nome"].tolist() if not df_palestre.empty else []
    with col2:
        palestra = st.selectbox("🏟️ Palestra", ["— Seleziona —"] + palestre_lista, key="cfg_palestra")
    with col3:
        giorno   = st.selectbox(
            "📅 Giorno",
            ["— Seleziona —"] + [_GIORNI_LABEL[g] for g in _GIORNI_ORDER],
            key="cfg_giorno",
        )

    if squadra == "— Seleziona —" or palestra == "— Seleziona —" or giorno == "— Seleziona —":
        st.info("Seleziona squadra, palestra e giorno per continuare.")
        st.markdown("---")
        _render_lista_corrente(orario_fisso)
        return

    giorno_norm = next((g for g in _GIORNI_ORDER if _GIORNI_LABEL[g] == giorno), "")

    allenatori_sq = []
    if not df_allenatori.empty:
        for _, row in df_allenatori.iterrows():
            sq_list = [s.strip() for s in str(row.get("Squadre", "")).split(",")]
            if squadra in sq_list:
                cognome = str(row.get("Cognome", "")).strip()
                if cognome:
                    allenatori_sq.append(cognome)

    allenatori_sel = st.multiselect(
        "👤 Allenatori",
        options=allenatori_sq,
        default=allenatori_sq,
        key="cfg_allenatori",
    )

    st.markdown("---")

    ora_pal_start, ora_pal_end = "15:00", "22:00"
    if not df_palestre.empty:
        riga_p = df_palestre[df_palestre["Nome"].str.lower() == palestra.lower()]
        if not riga_p.empty:
            ora_pal_start = str(riga_p.iloc[0].get("Orario Inizio", "15:00")).strip() or "15:00"
            ora_pal_end   = str(riga_p.iloc[0].get("Orario Fine",   "22:00")).strip() or "22:00"

    try:
        _start_def = datetime.strptime(ora_pal_start, "%H:%M").time()
    except Exception:
        _start_def = datetime.strptime("15:00", "%H:%M").time()

    ora_inizio = st.time_input(
        f"⏰ Ora inizio  (palestra disponibile {ora_pal_start}–{ora_pal_end})",
        value=_start_def,
        key="cfg_ora_i",
    ).strftime("%H:%M")

    st.markdown("---")

    st.markdown("### ⏱️ Durata allenamento tecnico (in palestra)")
    durata_sel = _big_button_row(list(_DURATE.keys()), _COLORI_DURATA, "cfg_durata")
    durata_min = _DURATE[durata_sel]

    st.markdown("---")

    st.markdown("### 🏋️ Parte fisica aggiuntiva")
    st.caption("Il lavoro fisico si svolge fuori dalla palestra — non conta nello slot palestra")
    fisico_sel = _big_button_row(list(_FISICO.keys()), _COLORI_FISICO, "cfg_fisico")
    fisico_min = _FISICO[fisico_sel]

    fisico_quando = "Dopo"
    if fisico_min > 0:
        st.markdown("**🔀 Quando si svolge la parte fisica?**")
        col_pa, col_pb = st.columns(2)
        _fq_key = "cfg_fisico_quando"
        if _fq_key not in st.session_state:
            st.session_state[_fq_key] = "Dopo"

        for _col, _val, _emoji, _desc in [
            (col_pa, "Prima", "🏃 Prima", "Fisico → poi Palestra"),
            (col_pb, "Dopo",  "🏀 Dopo",  "Palestra → poi Fisico"),
        ]:
            _sel = st.session_state[_fq_key] == _val
            _bg  = "#1a3a5c" if _sel else "#f0f2f6"
            _fg  = "white"   if _sel else "#333"
            _bdr = "#4a9eff" if _sel else "#ccc"
            _fw  = "800"     if _sel else "500"
            _col.markdown(
                f"<div style='background:{_bg};color:{_fg};"
                f"border:2px solid {_bdr};border-radius:10px;padding:12px;"
                f"text-align:center;font-weight:{_fw};margin-bottom:4px'>"
                f"{_emoji}<br><small>{_desc}</small>"
                f"</div>",
                unsafe_allow_html=True,
            )
            if _col.button(
                f"{'✔ ' if _sel else ''}{_val}",
                key=f"_fq_{_val}",
                use_container_width=True,
                type="primary" if _sel else "secondary",
            ):
                st.session_state[_fq_key] = _val
                st.rerun()

        fisico_quando = st.session_state[_fq_key]

    st.markdown("---")

    start_m = _ore_to_min(ora_inizio) or 0

    if fisico_min > 0 and fisico_quando == "Prima":
        gin_m  = start_m + fisico_min
        gfin_m = gin_m   + durata_min
        ora_inizio_palestra = _min_to_ore(gin_m)
        ora_fine_palestra   = _min_to_ore(gfin_m)
        fine_totale_m       = gfin_m
    else:
        gin_m  = start_m
        gfin_m = start_m + durata_min
        ora_inizio_palestra = _min_to_ore(gin_m)
        ora_fine_palestra   = _min_to_ore(gfin_m)
        fine_totale_m       = gfin_m + fisico_min

    ora_fine_totale = _min_to_ore(fine_totale_m)

    pal_end_m     = _ore_to_min(ora_pal_end) or (22 * 60)
    dentro_orario = gfin_m <= pal_end_m

    if dentro_orario:
        if fisico_min == 0:
            st.success(
                f"✅ **Slot palestra:** {ora_inizio_palestra} → {ora_fine_palestra}  ({durata_min}')"
            )
        elif fisico_quando == "Prima":
            st.success(
                f"✅ **Timeline:**  \n"
                f"🏋️ Fisico fuori: **{ora_inizio}** → **{ora_inizio_palestra}**  ({fisico_min}')  \n"
                f"🏀 Palestra: **{ora_inizio_palestra}** → **{ora_fine_palestra}**  ({durata_min}')  \n"
                f"Fine totale: **{ora_fine_totale}**"
            )
        else:
            st.success(
                f"✅ **Timeline:**  \n"
                f"🏀 Palestra: **{ora_inizio_palestra}** → **{ora_fine_palestra}**  ({durata_min}')  \n"
                f"🏋️ Fisico fuori: **{ora_fine_palestra}** → **{ora_fine_totale}**  ({fisico_min}')  \n"
                f"Fine totale: **{ora_fine_totale}**"
            )
    else:
        st.error(
            f"⚠️ Slot palestra **{ora_inizio_palestra} → {ora_fine_palestra}** supera "
            f"la chiusura ({ora_pal_end}). Riduci la durata o anticipa l'orario."
        )

    if not orario_fisso.empty:
        mask = (
            (orario_fisso["giorno"].str.lower().str.strip()   == giorno_norm) &
            (orario_fisso["palestra"].str.lower().str.strip() == palestra.strip().lower())
        )
        conflitti_slot = []
        for _, ev in orario_fisso[mask].iterrows():
            sq_ev = str(ev.get("squadra", "")).strip()
            if _norm(sq_ev) == _norm(squadra):
                continue
            if c_e_conflitto(
                ora_inizio_palestra, ora_fine_palestra,
                ev.get("ora_inizio", ""), ev.get("ora_fine", ""),
            ):
                conflitti_slot.append(
                    f"**{sq_ev}** ({ev.get('ora_inizio','')}–{ev.get('ora_fine','')})"
                )
        if conflitti_slot:
            st.warning(
                "⚠️ Sovrapposizione con altri allenamenti in **" + palestra + "**:  \n"
                + "  \n".join(f"• {c}" for c in conflitti_slot)
            )

    st.markdown("---")

    condivisione = st.checkbox(
        "🤝 Condivide la palestra con un'altra squadra (non genera conflitto)",
        key="cfg_condivisione",
    )

    allenatori_str = " - ".join(allenatori_sel)
    if st.button(
        f"💾 Salva  —  {squadra} · {giorno} · {ora_inizio_palestra}–{ora_fine_palestra}",
        type="primary",
        use_container_width=True,
        disabled=not dentro_orario,
        key="cfg_salva",
    ):
        ok = scrivi_riga("Orario Fisso", [
            giorno_norm,
            palestra,
            squadra,
            ora_inizio_palestra,
            ora_fine_palestra,
            allenatori_str,
            "SI" if condivisione else "NO",
        ])
        if ok:
            carica_tutti_i_dati.clear()
            leggi_foglio.clear()
            st.session_state["_cfg_saved_msg"]  = True
            st.session_state["_cfg_saved_info"] = (
                f"{squadra} · {giorno} · {ora_inizio_palestra}–{ora_fine_palestra}"
            )
            st.rerun()

    st.markdown("---")
    _render_lista_corrente(orario_fisso)


def _render_lista_corrente(orario_fisso: pd.DataFrame):
    """Lista allenamenti configurati come card colorate, raggruppati per giorno."""
    st.markdown("#### 📋 Allenamenti configurati")
    if orario_fisso.empty:
        st.info("Nessun allenamento fisso configurato.")
        return

    trovato = False
    for g in _GIORNI_ORDER:
        mask   = orario_fisso["giorno"].str.lower().str.strip() == g
        gruppo = orario_fisso[mask]
        if gruppo.empty:
            continue
        trovato = True

        st.markdown(
            f"<div style='background:#1a3a5c;color:white;padding:6px 12px;"
            f"border-radius:6px;margin:12px 0 6px 0;font-weight:700'>"
            f"📅 {_GIORNI_LABEL[g]}</div>",
            unsafe_allow_html=True,
        )

        for row_i, (row_label, ev) in enumerate(gruppo.iterrows()):
            confirm_key = f"of_del_confirm_{row_label}"
            team_name  = str(ev.get("squadra",    "")).strip()
            ora_i      = str(ev.get("ora_inizio", "")).strip()
            ora_f      = str(ev.get("ora_fine",   "")).strip()
            pal        = str(ev.get("palestra",   "")).strip().capitalize()
            allenatori = str(ev.get("allenatori", "")).strip()
            color      = get_team_color(team_name)

            _is_admin_lista = st.session_state.get("ruolo", "admin") == "admin"
            card_html = (
                f"<div style='background:{color};border-radius:10px;"
                f"padding:10px 15px;margin:4px 0;"
                f"box-shadow:0 2px 6px rgba(0,0,0,0.18)'>"
                f"<div style='display:flex;justify-content:space-between;align-items:center'>"
                f"<span style='color:white;font-weight:800;font-size:1.05em'>🏀 {team_name}</span>"
                f"<span style='color:rgba(255,255,255,0.95);font-weight:700'>⏰ {ora_i} → {ora_f}</span>"
                f"</div>"
                f"<div style='color:rgba(255,255,255,0.8);font-size:0.86em;margin-top:4px'>"
                f"🏟️ {pal}{(' &nbsp;&nbsp; 👤 ' + allenatori) if allenatori else ''}"
                f"</div>"
                f"</div>"
            )
            if _is_admin_lista and st.session_state.get(confirm_key):
                cc = st.columns([6, 1.5, 1.5])
                cc[0].warning(
                    f"Elimina **{team_name}** — {_GIORNI_LABEL[g]} {ora_i}–{ora_f}?"
                )
                with cc[1]:
                    if st.button("✅ Sì", key=f"of_del_yes_{row_label}",
                                 type="primary", use_container_width=True):
                        elimina_riga("Orario Fisso", row_label + 1)
                        st.session_state.pop(confirm_key, None)
                        carica_tutti_i_dati.clear()
                        leggi_foglio.clear()
                        st.rerun()
                with cc[2]:
                    if st.button("❌ No", key=f"of_del_no_{row_label}", use_container_width=True):
                        st.session_state.pop(confirm_key, None)
                        st.rerun()
            elif _is_admin_lista:
                c1, c2 = st.columns([10, 1])
                with c1:
                    st.markdown(card_html, unsafe_allow_html=True)
                with c2:
                    st.write("")
                    if st.button("🗑️", key=f"of_del_{row_label}", help="Elimina"):
                        st.session_state[confirm_key] = True
                        st.rerun()
            else:
                st.markdown(card_html, unsafe_allow_html=True)

    if not trovato:
        st.info("Nessun allenamento configurato.")


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def render():
    st.markdown(
        "<div style='background:linear-gradient(135deg,#0d2137,#1a3a5c);"
        "border-radius:12px;padding:16px 24px;margin-bottom:20px'>"
        "<span style='color:white;font-size:1.6em;font-weight:800'>🏀 Orario Allenamenti</span>"
        "</div>",
        unsafe_allow_html=True,
    )

    if st.button("🔄 Aggiorna dati", key="refresh_orario_all"):
        carica_tutti_i_dati.clear()
        leggi_foglio.clear()
        st.rerun()

    dati = carica_tutti_i_dati()
    orario_fisso  = dati.get("Orario Fisso",          pd.DataFrame())
    calendario    = dati.get("Calendario Definitivo", pd.DataFrame())
    df_squadre    = dati.get("Squadre",               pd.DataFrame())
    df_palestre   = dati.get("Palestre",              pd.DataFrame())
    df_allenatori = dati.get("Allenatori",            pd.DataFrame())

    # ── Conflitti tra allenamenti ─────────────────────────────────
    conflitti_all = trova_conflitti_allenamenti(orario_fisso)
    conflicting_labels = set()
    for c in conflitti_all:
        conflicting_labels.add(c["idx_a"])
        conflicting_labels.add(c["idx_b"])

    if conflitti_all:
        with st.container():
            st.error(f"🚨 **{len(conflitti_all)} conflitto/i tra allenamenti rilevato/i**")
            for c in conflitti_all:
                g_label = c["giorno"].capitalize()
                st.markdown(
                    f"&nbsp;&nbsp;⚠️ **{g_label}** @ {c['palestra'].capitalize()} &nbsp;|&nbsp; "
                    f"**{c['squadra_a']}** {c['ora_inizio_a']}–{c['ora_fine_a']} "
                    f"↔ **{c['squadra_b']}** {c['ora_inizio_b']}–{c['ora_fine_b']}"
                )
            st.caption("Vai in **Settimana corrente** e usa ✏️ per modificare orario o palestra.")
        st.markdown("")

    is_admin = st.session_state.get("ruolo", "admin") == "admin"

    if is_admin:
        tab_settimana, tab_tipo, tab_configura = st.tabs(
            ["📅 Settimana corrente", "📊 Settimana tipo", "⚙️ Configura allenamenti"]
        )
        with tab_configura:
            _render_configura(orario_fisso, df_squadre, df_palestre, df_allenatori)
    else:
        tab_settimana, tab_tipo = st.tabs(
            ["📅 Settimana corrente", "📊 Settimana tipo"]
        )

    with tab_settimana:
        _render_settimana_corrente(orario_fisso, calendario, df_palestre, conflicting_labels)

    with tab_tipo:
        _render_settimana_tipo(orario_fisso, conflicting_labels)
