import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
from logic import GIORNI, GIORNI_SETTIMANA, c_e_conflitto, parse_data, _norm, trova_conflitti_allenamenti, trova_conflitti_allenatore_slot
from database import (
    carica_tutti_i_dati_db, invalida_cache,
    scrivi_evento, aggiorna_evento, elimina_evento,
    leggi_orario_settimana,
)
# LEGACY: from sheets import (
#     carica_tutti_i_dati, leggi_foglio, scrivi_riga, elimina_riga, aggiorna_riga,
# )
from views._components import get_team_color, get_palestra_tipo_color, FLAG_EMOJIS

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
    is_allenamento = e["source"] in ("fisso", "settimana")

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
    # Flag e palestra tipo
    flag_emoji   = FLAG_EMOJIS.get(e.get("flag", "normale"), "")
    pal_tipo     = e.get("palestra_tipo", "Principale") if is_allenamento else "Principale"
    pal_border   = (f"border-left:4px solid {get_palestra_tipo_color(pal_tipo)};"
                    if pal_tipo != "Principale" else "")
    zona_str     = str(e.get("zona", "")).strip() if is_allenamento else ""
    zona_line    = (
        f"<div style='color:rgba(255,255,255,0.7);font-size:0.78em;margin-top:2px'>"
        f"📍 {zona_str}</div>"
    ) if zona_str else ""
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

    coach_conf = e.get("coach_conflict")
    if coach_conf:
        nomi_coach = ", ".join(sorted(coach_conf))
        coach_note = (
            f"<div style='color:#FFD700;font-size:0.78em;font-weight:600;margin-top:3px'>"
            f"⚠️ {nomi_coach} — doppio impegno nello stesso orario"
            f"</div>"
        )
    else:
        coach_note = ""

    card_html = (
        f"<div style='background:{bg};border-radius:10px;padding:10px 15px;"
        f"margin:4px 0;box-shadow:0 2px 8px rgba(0,0,0,0.22);{pal_border}'>"
        f"<div style='display:flex;justify-content:space-between;align-items:center'>"
        f"<span style='color:white;font-weight:800;font-size:1.0em'>"
        f"{'🏀' if is_allenamento else ''} {(flag_emoji + ' ') if flag_emoji else ''}{e['squadra']}{badge}"
        f"</span>"
        f"<span style='color:rgba(255,255,255,0.95);font-weight:700;font-size:0.9em'>⏰ {orario}</span>"
        f"</div>"
        f"<div style='color:rgba(255,255,255,0.82);font-size:0.85em;margin-top:4px'>"
        f"🏟️ {pal}{(' &nbsp;&nbsp; 👤 ' + all_str) if all_str else ''}"
        f"</div>"
        f"{zona_line}"
        f"{cond_line}"
        f"{coach_note}"
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
                                conflicting_labels: set = None,
                                orario_settimana: pd.DataFrame = None,
                                df_allenatori: pd.DataFrame = None,
                                df_squadre: pd.DataFrame = None):
    oggi = datetime.today().date()
    lun  = oggi - timedelta(days=oggi.weekday())
    dom  = lun + timedelta(days=6)
    settimana = [lun + timedelta(days=i) for i in range(7)]

    # Mappa nome_palestra_norm → tipo (per colorare bordo card)
    _pal_tipo_map: dict = {}
    if df_palestre is not None and not df_palestre.empty and "Tipo" in df_palestre.columns:
        for _, _pr in df_palestre.iterrows():
            _pal_tipo_map[_norm(str(_pr.get("Nome", "")))] = str(_pr.get("Tipo", "Principale"))

    st.markdown(
        f"<div style='background:#1a3a5c;color:white;padding:8px 16px;"
        f"border-radius:8px;margin:0 0 14px 0;font-weight:700;font-size:1.0em'>"
        f"📅 Settimana corrente &nbsp;·&nbsp; {lun.strftime('%d/%m')} → {dom.strftime('%d/%m/%Y')}"
        f"</div>",
        unsafe_allow_html=True,
    )
    st.caption("Le modifiche qui si applicano **solo a questa settimana** e non alterano il template fisso.")

    # ── filtri ───────────────────────────────────────────────────────
    col_f1, col_f2 = st.columns(2)
    with col_f1:
        squadre_all = set()
        if not orario_fisso.empty and "squadra" in orario_fisso.columns:
            squadre_all.update(orario_fisso["squadra"].dropna().str.strip().unique())
        if orario_settimana is not None and not orario_settimana.empty and "squadra" in orario_settimana.columns:
            squadre_all.update(orario_settimana["squadra"].dropna().str.strip().unique())
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

    # ── Indicizza eventi di orario_settimana per (data_str, squadra_norm) ──
    # sett_lookup: data_str → { squadra_norm → (row_id, row) }
    sett_lookup: dict = {}
    sett_extra: dict  = {}   # eventi nuovi (non override di fisso)
    if orario_settimana is not None and not orario_settimana.empty:
        for row_id, row in orario_settimana.iterrows():
            data_s = str(row.get("data", ""))
            sq_s   = _norm(str(row.get("squadra", "")).strip())
            sett_lookup.setdefault(data_s, {})[sq_s] = (row_id, row)

    # ── costruisci eventi raggruppati per giorno ──────────────────────
    eventi_per_giorno = {d: [] for d in settimana}

    # Set di (data_str, squadra_norm) già inclusi tramite override
    inclusi_override = set()

    if not orario_fisso.empty:
        for row_label, ev in orario_fisso.iterrows():
            g = _norm(ev.get("giorno", ""))
            for d in settimana:
                if GIORNI_SETTIMANA[d.weekday()] != g:
                    continue
                data_str = d.strftime("%Y-%m-%d")
                sq_norm  = _norm(str(ev.get("squadra", "")).strip())

                override_entry = sett_lookup.get(data_str, {}).get(sq_norm)

                if override_entry:
                    sett_id, sett_row = override_entry
                    inclusi_override.add((data_str, sq_norm))
                    if sett_row.get("annullato", False):
                        # Allenamento cancellato per questa settimana
                        eventi_per_giorno[d].append({
                            "tipo":         "❌ Allenamento annullato",
                            "squadra":      str(sett_row.get("squadra", ev.get("squadra", ""))).strip(),
                            "ora_inizio":   str(ev.get("ora_inizio", "")).strip(),
                            "ora_fine":     str(ev.get("ora_fine",   "")).strip(),
                            "palestra":     str(ev.get("palestra",   "")).strip().capitalize(),
                            "allenatori":   str(ev.get("allenatori", "")).strip(),
                            "giorno_norm":  g,
                            "is_conflict":  False,
                            "cal_idx":      None,
                            "source":       "settimana",
                            "row_label":    sett_id,
                            "data":         data_str,
                            "fisso_id":     row_label,
                            "condivisione": False,
                            "annullato":    True,
                            "flag":         "annullato",
                            "zona":         "",
                            "palestra_tipo": "Principale",
                        })
                    else:
                        # Override attivo per questa settimana
                        _ov_pal = str(sett_row.get("palestra", ev.get("palestra", ""))).strip()
                        eventi_per_giorno[d].append({
                            "tipo":         "🏀 Allenamento",
                            "squadra":      str(sett_row.get("squadra", ev.get("squadra", ""))).strip(),
                            "ora_inizio":   str(sett_row.get("ora_inizio", "")).strip(),
                            "ora_fine":     str(sett_row.get("ora_fine",   "")).strip(),
                            "palestra":     _ov_pal.capitalize(),
                            "allenatori":   str(sett_row.get("allenatori", ev.get("allenatori", ""))).strip(),
                            "giorno_norm":  g,
                            "is_conflict":  False,
                            "cal_idx":      None,
                            "source":       "settimana",
                            "row_label":    sett_id,
                            "data":         data_str,
                            "fisso_id":     row_label,
                            "condivisione": str(sett_row.get("condivisione", "NO")).strip().upper() == "SI",
                            "annullato":    False,
                            "is_override":  True,
                            "flag":         str(sett_row.get("flag", "normale")),
                            "zona":         str(sett_row.get("zona", "")).strip(),
                            "palestra_tipo": _pal_tipo_map.get(_norm(_ov_pal), "Principale"),
                        })
                else:
                    # Template fisso (nessun override questa settimana)
                    _fisso_pal = str(ev.get("palestra", "")).strip()
                    eventi_per_giorno[d].append({
                        "tipo":         "🏀 Allenamento",
                        "squadra":      str(ev.get("squadra",    "")).strip(),
                        "ora_inizio":   str(ev.get("ora_inizio", "")).strip(),
                        "ora_fine":     str(ev.get("ora_fine",   "")).strip(),
                        "palestra":     _fisso_pal.capitalize(),
                        "allenatori":   str(ev.get("allenatori", "")).strip(),
                        "giorno_norm":  g,
                        "is_conflict":  row_label in _conf_labels,
                        "cal_idx":      None,
                        "source":       "fisso",
                        "row_label":    row_label,
                        "data":         data_str,
                        "fisso_id":     row_label,
                        "condivisione": str(ev.get("condivisione", ev.get("tipo", ""))).strip().upper() == "SI",
                        "annullato":    False,
                        "is_override":  False,
                        "flag":         "normale",
                        "zona":         str(ev.get("zona", "")).strip(),
                        "palestra_tipo": _pal_tipo_map.get(_norm(_fisso_pal), "Principale"),
                    })

    # ── Aggiungi eventi orario_settimana NON override di fisso ──────
    if orario_settimana is not None and not orario_settimana.empty:
        for row_id, sett_row in orario_settimana.iterrows():
            data_s = str(sett_row.get("data", ""))
            sq_s   = _norm(str(sett_row.get("squadra", "")).strip())
            if (data_s, sq_s) in inclusi_override:
                continue
            try:
                d = datetime.strptime(data_s, "%Y-%m-%d").date()
            except Exception:
                continue
            if d not in settimana:
                continue
            if sett_row.get("annullato", False):
                continue
            g = GIORNI_SETTIMANA[d.weekday()]
            _extra_pal = str(sett_row.get("palestra", "")).strip()
            eventi_per_giorno[d].append({
                "tipo":         "🏀 Allenamento (extra)",
                "squadra":      str(sett_row.get("squadra", "")).strip(),
                "ora_inizio":   str(sett_row.get("ora_inizio", "")).strip(),
                "ora_fine":     str(sett_row.get("ora_fine",   "")).strip(),
                "palestra":     _extra_pal.capitalize(),
                "allenatori":   str(sett_row.get("allenatori", "")).strip(),
                "giorno_norm":  g,
                "is_conflict":  False,
                "cal_idx":      None,
                "source":       "settimana",
                "row_label":    row_id,
                "data":         data_s,
                "fisso_id":     None,
                "condivisione": str(sett_row.get("condivisione", "NO")).strip().upper() == "SI",
                "annullato":    False,
                "is_override":  False,
                "flag":         str(sett_row.get("flag", "normale")),
                "zona":         str(sett_row.get("zona", "")).strip(),
                "palestra_tipo": _pal_tipo_map.get(_norm(_extra_pal), "Principale"),
            })

    if not calendario.empty:
        for cal_id, ev in calendario.iterrows():
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
                "cal_idx":     cal_id,
                "source":      "calendario",
                "row_label":   None,
                "data":        str(ev.get("Data", "")),
                "fisso_id":    None,
                "annullato":   False,
                "condivisione": False,
                "is_override": False,
            })

    # ── Calcola coach_conflict per ogni giorno ────────────────────────
    for d, evs_d in eventi_per_giorno.items():
        allenamenti_d = [
            e for e in evs_d
            if e["source"] in ("fisso", "settimana") and not e.get("annullato")
        ]
        for idx_a, ea in enumerate(allenamenti_d):
            coaches_a = {c.strip().lower() for c in ea["allenatori"].split("-") if c.strip()}
            if not coaches_a:
                continue
            for eb in allenamenti_d[idx_a + 1:]:
                coaches_b = {c.strip().lower() for c in eb["allenatori"].split("-") if c.strip()}
                comuni = coaches_a & coaches_b
                if comuni and c_e_conflitto(ea["ora_inizio"], ea["ora_fine"],
                                            eb["ora_inizio"], eb["ora_fine"]):
                    ea.setdefault("coach_conflict", set()).update(comuni)
                    eb.setdefault("coach_conflict", set()).update(comuni)

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
            edit_key      = f"_edit_ev_{e['row_label']}_{e['source']}"
            flag_mode_key = f"_flag_mode_{e['row_label']}_{e['source']}_{e.get('data','')}"
            is_editing = is_admin and e["source"] in ("fisso", "settimana") and not e.get("annullato") and st.session_state.get(edit_key)

            if is_editing:
                # ── form inline di modifica ──────────────────────────
                rl = e["row_label"]
                fonte = e["source"]  # "fisso" o "settimana"
                with st.container():
                    nota_fonte = (
                        " <small style='color:#7ec8f7'>(modifica solo per questa settimana)</small>"
                        if fonte == "fisso" else
                        " <small style='color:#a0d080'>(evento specifico questa settimana)</small>"
                    )
                    st.markdown(
                        f"<div style='background:#1a3a5c;border-radius:8px;padding:10px 14px;margin:4px 0'>"
                        f"<span style='color:white;font-weight:700'>✏️ Modifica — {e['squadra']}</span>"
                        f"{nota_fonte}</div>",
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

                    # ── Flag ─────────────────────────────────────────
                    _ef_flag_opts = list(FLAG_EMOJIS.keys())
                    _ef_flag_cur  = e.get("flag", "normale")
                    _ef_flag_idx  = _ef_flag_opts.index(_ef_flag_cur) if _ef_flag_cur in _ef_flag_opts else 0
                    new_flag = st.selectbox(
                        "🚩 Flag allenamento",
                        _ef_flag_opts,
                        index=_ef_flag_idx,
                        key=f"_ef_flag_{rl}",
                        format_func=lambda x: f"{FLAG_EMOJIS[x]} {x}" if FLAG_EMOJIS.get(x) else x,
                    )

                    # ── Zona palestra ─────────────────────────────────
                    _ef_zone_opts: list = []
                    if df_palestre is not None and not df_palestre.empty:
                        _ef_pal_row = df_palestre[
                            df_palestre["Nome"].str.lower() == _norm(new_pal)
                        ]
                        if not _ef_pal_row.empty:
                            _ef_zone_str = str(_ef_pal_row.iloc[0].get("Zone", "")).strip()
                            if _ef_zone_str:
                                _ef_zone_opts = [z.strip() for z in _ef_zone_str.split(",") if z.strip()]
                    _ef_zona_cur = e.get("zona", "")
                    if _ef_zone_opts:
                        _ef_z_full = [""] + _ef_zone_opts
                        _ef_z_idx  = _ef_z_full.index(_ef_zona_cur) if _ef_zona_cur in _ef_z_full else 0
                        new_zona = st.selectbox(
                            "📍 Zona palestra",
                            _ef_z_full,
                            index=_ef_z_idx,
                            key=f"_ef_zona_{rl}",
                            format_func=lambda x: x if x else "— Nessuna zona specifica —",
                        )
                    else:
                        new_zona = _ef_zona_cur

                    # ── Allenatori (auto-caricati dalla squadra) ──────
                    _all_opts = []
                    if df_allenatori is not None and not df_allenatori.empty:
                        for _, _ar in df_allenatori.iterrows():
                            _sq_list = [s.split("(")[0].strip()
                                        for s in str(_ar.get("Squadre", "")).split(",")]
                            if e["squadra"] in _sq_list:
                                _cog = str(_ar.get("Cognome", "")).strip()
                                if _cog:
                                    _all_opts.append(_cog)
                    _all_cur = [a.strip() for a in e["allenatori"].split("-") if a.strip()]
                    _all_def = [a for a in _all_cur if a in _all_opts] or _all_opts
                    new_allenatori_sel = st.multiselect(
                        "👤 Allenatori",
                        options=_all_opts if _all_opts else _all_cur,
                        default=_all_def,
                        key=f"_ef_all_{rl}",
                    )
                    new_allenatori = " - ".join(new_allenatori_sel) if new_allenatori_sel else e["allenatori"]

                    sb1, sb2 = st.columns(2)
                    with sb1:
                        if st.button("💾 Salva", key=f"_ef_save_{rl}",
                                     type="primary", use_container_width=True):
                            nuovi_dati = {
                                "giorno":       e["giorno_norm"],
                                "palestra":     new_pal,
                                "squadra":      e["squadra"],
                                "ora_inizio":   new_oi,
                                "ora_fine":     new_of,
                                "allenatori":   new_allenatori,
                                "condivisione": "SI" if new_cond else "NO",
                                "annullato":    False,
                                "flag":         new_flag,
                                "zona":         new_zona,
                            }
                            if fonte == "fisso":
                                # Crea override in orario_settimana per questa data
                                nuovi_dati["data"] = e["data"]
                                ok = scrivi_evento("orario_settimana", nuovi_dati)
                            else:
                                # Aggiorna entry esistente in orario_settimana
                                ok = aggiorna_evento("orario_settimana", rl, nuovi_dati)
                            if ok:
                                invalida_cache()
                            st.session_state.pop(edit_key, None)
                            st.rerun()
                    with sb2:
                        if st.button("✖ Annulla", key=f"_ef_cancel_{rl}",
                                     use_container_width=True):
                            st.session_state.pop(edit_key, None)
                            st.rerun()
            elif (is_admin and e["source"] in ("fisso", "settimana")
                  and not e.get("annullato")
                  and st.session_state.get(flag_mode_key)):
                # ── modalità cambio flag ──────────────────────────────
                fc1, fc2, fc3 = st.columns([5, 1, 1])
                with fc1:
                    _f_opts = list(FLAG_EMOJIS.keys())
                    _f_cur  = e.get("flag", "normale")
                    _f_idx  = _f_opts.index(_f_cur) if _f_cur in _f_opts else 0
                    new_quick_flag = st.selectbox(
                        "🚩 Flag",
                        _f_opts,
                        index=_f_idx,
                        key=f"_fq_sel_{e['row_label']}_{e['source']}",
                        format_func=lambda x: (
                            f"{FLAG_EMOJIS[x]} {x}" if FLAG_EMOJIS.get(x) else x
                        ),
                        label_visibility="collapsed",
                    )
                with fc2:
                    if st.button("💾", key=f"_fq_save_{e['row_label']}_{e.get('data','')}",
                                 help="Salva flag", use_container_width=True):
                        _fdati = {"flag": new_quick_flag}
                        if e["source"] == "fisso":
                            _fdati.update({
                                "data": e["data"], "giorno": e["giorno_norm"],
                                "palestra": e["palestra"].lower(),
                                "squadra": e["squadra"],
                                "ora_inizio": e["ora_inizio"],
                                "ora_fine": e["ora_fine"],
                                "allenatori": e["allenatori"],
                                "condivisione": "SI" if e.get("condivisione") else "NO",
                                "annullato": False,
                                "zona": e.get("zona", ""),
                            })
                            scrivi_evento("orario_settimana", _fdati)
                        else:
                            aggiorna_evento("orario_settimana", e["row_label"], _fdati)
                        invalida_cache()
                        st.session_state.pop(flag_mode_key, None)
                        st.rerun()
                with fc3:
                    if st.button("✖", key=f"_fq_cancel_{e['row_label']}_{e.get('data','')}",
                                 use_container_width=True):
                        st.session_state.pop(flag_mode_key, None)
                        st.rerun()
            else:
                # ── card normale + bottoni ────────────────────────────
                if e.get("annullato"):
                    # Allenamento cancellato questa settimana — mostra card grigia + ripristina
                    rl = e["row_label"]
                    st.markdown(
                        f"<div style='background:#555;border-radius:10px;padding:8px 14px;"
                        f"margin:4px 0;opacity:0.7'>"
                        f"<span style='color:#ccc;font-weight:700;text-decoration:line-through'>"
                        f"🏀 {e['squadra']} — {e['ora_inizio']} → {e['ora_fine']}</span>"
                        f"&nbsp;&nbsp;<span style='color:#f90;font-size:0.85em'>❌ ANNULLATO questa settimana</span>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )
                    if is_admin and st.button("↩️ Ripristina", key=f"_ripristina_{key_suf}", use_container_width=False):
                        if elimina_evento("orario_settimana", rl):
                            invalida_cache()
                        st.rerun()
                elif is_admin and e["source"] in ("fisso", "settimana"):
                    del_confirm_key = f"_del_confirm_set_{e['row_label']}_{e['source']}"
                    if st.session_state.get(del_confirm_key):
                        cc = st.columns([5, 1, 1])
                        if e["source"] == "fisso":
                            cc[0].warning(f"⚠️ Annulla **{e['squadra']}** solo questa settimana?")
                        else:
                            cc[0].warning(f"⚠️ Elimina **{e['squadra']}** da questa settimana?")
                        with cc[1]:
                            if st.button("✅", key=f"_del_yes_{key_suf}",
                                         type="primary", use_container_width=True):
                                if e["source"] == "fisso":
                                    # Crea entry annullato in orario_settimana
                                    scrivi_evento("orario_settimana", {
                                        "data":         e["data"],
                                        "giorno":       e["giorno_norm"],
                                        "palestra":     e["palestra"].lower(),
                                        "squadra":      e["squadra"],
                                        "ora_inizio":   e["ora_inizio"],
                                        "ora_fine":     e["ora_fine"],
                                        "allenatori":   e["allenatori"],
                                        "condivisione": "SI" if e.get("condivisione") else "NO",
                                        "annullato":    True,
                                        "flag":         "annullato",
                                        "zona":         e.get("zona", ""),
                                    })
                                else:
                                    # Elimina da orario_settimana
                                    elimina_evento("orario_settimana", e["row_label"])
                                invalida_cache()
                                st.session_state.pop(del_confirm_key, None)
                                st.rerun()
                        with cc[2]:
                            if st.button("✖", key=f"_del_no_{key_suf}",
                                         use_container_width=True):
                                st.session_state.pop(del_confirm_key, None)
                                st.rerun()
                    else:
                        # Numero bottoni: fisso → ✏️ + ❌ annulla;  settimana → ✏️ + 🗑️  + 🚩 flag
                        c1, c2, c3, c4 = st.columns([8, 1, 1, 1])
                        with c1:
                            badge = ""
                            if e["source"] == "settimana" and e.get("is_override"):
                                badge = " <span style='font-size:0.78em;color:#a0d080'>✎ modificato</span>"
                            elif e["source"] == "settimana":
                                badge = " <span style='font-size:0.78em;color:#a0d080'>★ extra</span>"
                            if badge:
                                st.markdown(badge, unsafe_allow_html=True)
                            _render_event_card(e, key_suffix=key_suf)
                        with c2:
                            st.write("")
                            if st.button("✏️", key=f"_edit_btn_sc_{key_suf}",
                                         help="Modifica slot (solo questa settimana)" if e["source"] == "fisso"
                                              else "Modifica slot",
                                         use_container_width=True):
                                st.session_state[edit_key] = True
                                st.rerun()
                        with c3:
                            st.write("")
                            btn_help = "Annulla solo questa settimana" if e["source"] == "fisso" else "Rimuovi da questa settimana"
                            btn_icon = "❌" if e["source"] == "fisso" else "🗑️"
                            if st.button(btn_icon, key=f"_del_btn_{key_suf}",
                                         help=btn_help, use_container_width=True):
                                st.session_state[del_confirm_key] = True
                                st.rerun()
                        with c4:
                            st.write("")
                            if st.button("🚩", key=f"_flag_btn_{key_suf}",
                                         help="Cambia flag allenamento",
                                         use_container_width=True):
                                st.session_state[flag_mode_key] = True
                                st.rerun()
                elif e["source"] in ("fisso", "settimana"):
                    _render_event_card(e, key_suffix=key_suf)
                else:
                    _render_event_card(e, key_suffix=key_suf)

    if not qualcosa:
        st.info("Nessun evento per i filtri selezionati.")

    # ── Prossima settimana ────────────────────────────────────────────
    lun_prox = lun + timedelta(days=7)
    dom_prox = lun_prox + timedelta(days=6)
    sett_prox = [lun_prox + timedelta(days=i) for i in range(7)]

    # Carica overrides settimana prossima
    os_prox = leggi_orario_settimana(
        data_inizio=lun_prox.strftime("%Y-%m-%d"),
        data_fine=dom_prox.strftime("%Y-%m-%d"),
    )
    sl_prox: dict = {}
    if not os_prox.empty:
        for _rid, _rw in os_prox.iterrows():
            _ds = str(_rw.get("data", ""))
            _sq = _norm(str(_rw.get("squadra", "")).strip())
            sl_prox.setdefault(_ds, {})[_sq] = (_rid, _rw)

    evts_prox: dict = {d: [] for d in sett_prox}
    inc_prox: set   = set()

    if not orario_fisso.empty:
        for _rl, _ev in orario_fisso.iterrows():
            _g = _norm(_ev.get("giorno", ""))
            for _d in sett_prox:
                if GIORNI_SETTIMANA[_d.weekday()] != _g:
                    continue
                _ds   = _d.strftime("%Y-%m-%d")
                _sqn  = _norm(str(_ev.get("squadra", "")).strip())
                _ov   = sl_prox.get(_ds, {}).get(_sqn)
                if _ov:
                    _oid, _orw = _ov
                    inc_prox.add((_ds, _sqn))
                    if not _orw.get("annullato", False):
                        _p = str(_orw.get("palestra", _ev.get("palestra", ""))).strip()
                        evts_prox[_d].append({
                            "squadra":  str(_orw.get("squadra", _ev.get("squadra", ""))).strip(),
                            "ora_inizio": str(_orw.get("ora_inizio", "")).strip(),
                            "ora_fine":   str(_orw.get("ora_fine", "")).strip(),
                            "palestra":   _p.capitalize(),
                            "allenatori": str(_orw.get("allenatori", _ev.get("allenatori", ""))).strip(),
                            "flag":       str(_orw.get("flag", "normale")),
                            "zona":       str(_orw.get("zona", "")).strip(),
                            "palestra_tipo": _pal_tipo_map.get(_norm(_p), "Principale"),
                        })
                else:
                    _p = str(_ev.get("palestra", "")).strip()
                    evts_prox[_d].append({
                        "squadra":    str(_ev.get("squadra", "")).strip(),
                        "ora_inizio": str(_ev.get("ora_inizio", "")).strip(),
                        "ora_fine":   str(_ev.get("ora_fine", "")).strip(),
                        "palestra":   _p.capitalize(),
                        "allenatori": str(_ev.get("allenatori", "")).strip(),
                        "flag":       "normale",
                        "zona":       str(_ev.get("zona", "")).strip(),
                        "palestra_tipo": _pal_tipo_map.get(_norm(_p), "Principale"),
                    })

    if not os_prox.empty:
        for _rid, _rw in os_prox.iterrows():
            _ds = str(_rw.get("data", ""))
            _sq = _norm(str(_rw.get("squadra", "")).strip())
            if (_ds, _sq) in inc_prox or _rw.get("annullato", False):
                continue
            try:
                _d = datetime.strptime(_ds, "%Y-%m-%d").date()
            except Exception:
                continue
            if _d not in evts_prox:
                continue
            _p = str(_rw.get("palestra", "")).strip()
            evts_prox[_d].append({
                "squadra":    str(_rw.get("squadra", "")).strip(),
                "ora_inizio": str(_rw.get("ora_inizio", "")).strip(),
                "ora_fine":   str(_rw.get("ora_fine", "")).strip(),
                "palestra":   _p.capitalize(),
                "allenatori": str(_rw.get("allenatori", "")).strip(),
                "flag":       str(_rw.get("flag", "normale")),
                "zona":       str(_rw.get("zona", "")).strip(),
                "palestra_tipo": _pal_tipo_map.get(_norm(_p), "Principale"),
            })

    # Partite in casa settimana prossima
    if not calendario.empty:
        for _cid, _cev in calendario.iterrows():
            from logic import parse_data as _pd2
            _dev = _pd2(_cev.get("Data", ""))
            if _dev is None or _dev not in evts_prox:
                continue
            _tip = str(_cev.get("Tipo", ""))
            if "Casa" not in _tip and "CONFLITTO" not in _tip:
                continue
            evts_prox[_dev].append({
                "squadra":    str(_cev.get("Squadra", "")).strip(),
                "ora_inizio": str(_cev.get("Ora Inizio", "")).strip(),
                "ora_fine":   str(_cev.get("Ora Fine", "")).strip(),
                "palestra":   str(_cev.get("Palestra", "")).strip(),
                "allenatori": "",
                "flag":       "normale",
                "zona":       "",
                "palestra_tipo": "Principale",
                "_is_partita": True,
                "_tipo_partita": _tip,
            })

    st.markdown("---")
    st.markdown(
        f"<div style='background:linear-gradient(135deg,#1a4a2e,#2e7d52);color:white;"
        f"padding:10px 18px;border-radius:10px;margin:6px 0 14px 0;"
        f"font-weight:800;font-size:1.1em'>"
        f"📅 Prossima settimana &nbsp;·&nbsp; "
        f"{lun_prox.strftime('%d/%m')} → {dom_prox.strftime('%d/%m/%Y')}"
        f"</div>",
        unsafe_allow_html=True,
    )

    _any_prox = False
    for _d in sett_prox:
        _evs = [_e for _e in evts_prox[_d] if _match(_e)]
        if not _evs:
            continue
        _evs.sort(key=lambda _e: _ore_to_min(_e["ora_inizio"]) or 0)
        _any_prox = True
        _gk  = GIORNI_SETTIMANA[_d.weekday()]
        _glb = _GIORNI_LABEL.get(_gk, "")
        st.markdown(
            f"<div style='background:#1a4a2e;color:white;"
            f"padding:6px 14px;border-radius:7px;margin:12px 0 5px 0;"
            f"font-weight:700;font-size:1.0em'>"
            f"📅 {_glb} &nbsp;·&nbsp; {_d.strftime('%d/%m/%Y')}</div>",
            unsafe_allow_html=True,
        )
        for _e in _evs:
            if _e.get("_is_partita"):
                _tip = _e["_tipo_partita"]
                _icon = "⚠️" if "CONFLITTO" in _tip else "🏠"
                _lbl  = "Partita"
                _color = "#8B0000" if "CONFLITTO" in _tip else "#0D3B6E"
            else:
                _fe    = FLAG_EMOJIS.get(_e["flag"], "")
                _icon  = f"🏀 {_fe}" if _fe else "🏀"
                _lbl   = _e["squadra"]
                _color = _pal_tipo_map  # override below
                _pt    = _e.get("palestra_tipo", "Principale")
                _border = f"border-left:4px solid {get_palestra_tipo_color(_pt)};" if _pt != "Principale" else ""
                _color  = get_team_color(_e["squadra"])
                st.markdown(
                    f"<div style='background:{_color};border-radius:10px;"
                    f"padding:9px 14px;margin:4px 0;opacity:0.9;{_border}'>"
                    f"<div style='display:flex;justify-content:space-between'>"
                    f"<span style='color:white;font-weight:800'>{_icon} {_e['squadra']}</span>"
                    f"<span style='color:rgba(255,255,255,0.95);font-weight:700'>"
                    f"⏰ {_e['ora_inizio']} → {_e['ora_fine']}</span>"
                    f"</div>"
                    f"<div style='color:rgba(255,255,255,0.8);font-size:0.85em;margin-top:3px'>"
                    f"🏟️ {_e['palestra']}"
                    f"{(' &nbsp;&nbsp; 👤 ' + _e['allenatori']) if _e['allenatori'] else ''}"
                    f"</div>"
                    f"</div>",
                    unsafe_allow_html=True,
                )
                continue
            st.markdown(
                f"<div style='background:{_color};border-radius:10px;"
                f"padding:9px 14px;margin:4px 0'>"
                f"<span style='color:white;font-weight:800'>{_icon} {_lbl}</span>"
                f"<span style='color:rgba(255,255,255,0.8);font-size:0.85em;margin-left:8px'>"
                f"⏰ {_e['ora_inizio']} — 🏟️ {_e['palestra']}</span>"
                f"</div>",
                unsafe_allow_html=True,
            )
    if not _any_prox:
        st.info("Nessun evento programmato per la prossima settimana con i filtri selezionati.")

    # ── Allenamento extra settimana prossima ──────────────────────────
    if st.session_state.get("ruolo", "admin") == "admin":
        st.markdown("---")
        with st.expander("➕ Aggiungi allenamento extra — settimana prossima"):
            lun_prox = lun + timedelta(days=7)
            dom_prox = lun_prox + timedelta(days=6)
            st.caption(
                f"L'allenamento verrà aggiunto **solo per la settimana prossima** "
                f"({lun_prox.strftime('%d/%m')} → {dom_prox.strftime('%d/%m/%Y')}) "
                f"in `orario_settimana`, senza modificare il template fisso."
            )

            # Carica opzioni squadre e palestre
            _sq_opts = []
            if df_squadre is not None and not df_squadre.empty and "Categoria" in df_squadre.columns:
                _sq_opts = df_squadre["Categoria"].tolist()
            _pal_opts = []
            if df_palestre is not None and not df_palestre.empty and "Nome" in df_palestre.columns:
                _pal_opts = df_palestre["Nome"].tolist()

            ep_col1, ep_col2 = st.columns(2)
            with ep_col1:
                ep_squadra = st.selectbox(
                    "🏀 Squadra", ["— Seleziona —"] + _sq_opts, key="_ep_squadra"
                )
            with ep_col2:
                _giorni_prox_labels = [_GIORNI_LABEL[g] for g in _GIORNI_ORDER]
                ep_giorno_label = st.selectbox(
                    "📅 Giorno", ["— Seleziona —"] + _giorni_prox_labels, key="_ep_giorno"
                )

            if ep_squadra != "— Seleziona —" and ep_giorno_label != "— Seleziona —":
                ep_giorno_norm = next(
                    (g for g in _GIORNI_ORDER if _GIORNI_LABEL[g] == ep_giorno_label), ""
                )
                # Calcola la data esatta nella settimana prossima
                _weekday_map = {g: i for i, g in enumerate(_GIORNI_ORDER)}
                ep_data = lun_prox + timedelta(days=_weekday_map.get(ep_giorno_norm, 0))
                ep_data_str = ep_data.strftime("%Y-%m-%d")
                st.info(f"📅 Data: **{ep_data.strftime('%d/%m/%Y')}** ({ep_giorno_label})")

                ep_col3, ep_col4 = st.columns(2)
                with ep_col3:
                    ep_oi = st.time_input(
                        "⏰ Ora inizio",
                        value=datetime.strptime("18:00", "%H:%M").time(),
                        key="_ep_oi",
                    ).strftime("%H:%M")
                with ep_col4:
                    ep_of = st.time_input(
                        "⏰ Ora fine",
                        value=datetime.strptime("19:30", "%H:%M").time(),
                        key="_ep_of",
                    ).strftime("%H:%M")

                ep_pal = st.selectbox(
                    "🏟️ Palestra",
                    ["— Seleziona —"] + _pal_opts if _pal_opts else ["— Seleziona —"],
                    key="_ep_pal",
                )

                # Allenatori auto-caricati dalla squadra
                _ep_all_opts = []
                if df_allenatori is not None and not df_allenatori.empty:
                    for _, _ar in df_allenatori.iterrows():
                        _sq_list = [s.split("(")[0].strip()
                                    for s in str(_ar.get("Squadre", "")).split(",")]
                        if ep_squadra in _sq_list:
                            _cog = str(_ar.get("Cognome", "")).strip()
                            if _cog:
                                _ep_all_opts.append(_cog)
                ep_all_sel = st.multiselect(
                    "👤 Allenatori",
                    options=_ep_all_opts,
                    default=_ep_all_opts,
                    key="_ep_all",
                )
                ep_cond = st.checkbox(
                    "🤝 Condivide la palestra", key="_ep_cond"
                )

                # Flag allenamento extra
                _ep_flag_opts = list(FLAG_EMOJIS.keys())
                ep_flag = st.selectbox(
                    "🚩 Flag",
                    _ep_flag_opts,
                    index=0,
                    key="_ep_flag",
                    format_func=lambda x: f"{FLAG_EMOJIS[x]} {x}" if FLAG_EMOJIS.get(x) else x,
                )

                # Zona palestra extra
                _ep_zone_opts: list = []
                if _pal_opts and ep_pal != "— Seleziona —" and df_palestre is not None and not df_palestre.empty:
                    _ep_pal_row = df_palestre[df_palestre["Nome"] == ep_pal]
                    if not _ep_pal_row.empty:
                        _ep_z_str = str(_ep_pal_row.iloc[0].get("Zone", "")).strip()
                        if _ep_z_str:
                            _ep_zone_opts = [z.strip() for z in _ep_z_str.split(",") if z.strip()]
                ep_zona = ""
                if _ep_zone_opts:
                    ep_zona = st.selectbox(
                        "📍 Zona palestra",
                        [""] + _ep_zone_opts,
                        key="_ep_zona",
                        format_func=lambda x: x if x else "— Nessuna zona specifica —",
                    )

                ep_disabled = ep_pal == "— Seleziona —"
                if st.button(
                    f"💾 Salva allenamento extra — {ep_squadra} · {ep_giorno_label} · {ep_oi}–{ep_of}",
                    type="primary",
                    use_container_width=True,
                    disabled=ep_disabled,
                    key="_ep_salva",
                ):
                    ok = scrivi_evento("orario_settimana", {
                        "data":         ep_data_str,
                        "giorno":       ep_giorno_norm,
                        "palestra":     ep_pal,
                        "squadra":      ep_squadra,
                        "ora_inizio":   ep_oi,
                        "ora_fine":     ep_of,
                        "allenatori":   " - ".join(ep_all_sel),
                        "condivisione": "SI" if ep_cond else "NO",
                        "annullato":    False,
                        "flag":         ep_flag,
                        "zona":         ep_zona,
                    })
                    if ok:
                        invalida_cache()
                        st.success(
                            f"✅ Allenamento extra aggiunto: {ep_squadra} · "
                            f"{ep_data.strftime('%d/%m/%Y')} · {ep_oi}–{ep_of}"
                        )
                        st.rerun()
                    else:
                        st.error("❌ Errore nel salvataggio. Riprova.")


# ─────────────────────────────────────────────────────────────────────────────
# Tab 2 — Settimana tipo
# ─────────────────────────────────────────────────────────────────────────────

def _render_settimana_tipo(orario_fisso: pd.DataFrame, conflicting_labels: set = None):
    """Mostra il template settimanale degli allenamenti fissi."""
    st.caption(
        "**Settimana tipo** = template fisso che si ripete ogni settimana. "
        "Per modificarlo definitivamente usa il tab ⚙️ Configura. "
        "Per variare solo una settimana specifica, vai su 📅 Settimana corrente."
    )
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
    orario_fisso:  pd.DataFrame,
    df_squadre:    pd.DataFrame,
    df_palestre:   pd.DataFrame,
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

    # ── Zona palestra (se configurata) ───────────────────────────────
    cfg_zona = ""
    if not df_palestre.empty:
        _cfg_pal_row = df_palestre[df_palestre["Nome"] == palestra]
        if not _cfg_pal_row.empty:
            _cfg_zone_str = str(_cfg_pal_row.iloc[0].get("Zone", "")).strip()
            if _cfg_zone_str:
                _cfg_zone_list = [z.strip() for z in _cfg_zone_str.split(",") if z.strip()]
                cfg_zona = st.selectbox(
                    "📍 Zona palestra (opzionale — zone diverse non generano conflitti)",
                    [""] + _cfg_zone_list,
                    key="cfg_zona",
                    format_func=lambda x: x if x else "— Nessuna zona specifica —",
                )

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

    # ── Controllo: stessa squadra già presente in questo giorno ────────
    squadra_gia_in_giorno = False
    if not orario_fisso.empty:
        mask_sq_g = (
            (orario_fisso["squadra"].str.lower().str.strip() == squadra.lower()) &
            (orario_fisso["giorno"].str.lower().str.strip()  == giorno_norm)
        )
        if orario_fisso[mask_sq_g].shape[0] > 0:
            squadra_gia_in_giorno = True
            st.error(
                f"❌ **{squadra}** ha già un allenamento fissato il **{giorno}**. "
                "Non è possibile aggiungerne un secondo nello stesso giorno."
            )

    # ── Controllo: allenatore già impegnato in un altro slot? ──────────
    conflitti_coach = trova_conflitti_allenatore_slot(
        squadra, giorno_norm, ora_inizio_palestra, ora_fine_palestra,
        orario_fisso, df_allenatori,
    )
    if conflitti_coach:
        for cf in conflitti_coach:
            st.warning(
                f"⚠️ **ATTENZIONE:** **{cf['allenatore']}** è già impegnato in questo orario "
                f"con **{cf['squadra']}** ({cf['ora_inizio']}–{cf['ora_fine']})."
            )

    if st.button(
        f"💾 Salva  —  {squadra} · {giorno} · {ora_inizio_palestra}–{ora_fine_palestra}",
        type="primary",
        use_container_width=True,
        disabled=not dentro_orario or squadra_gia_in_giorno,
        key="cfg_salva",
    ):
        ok = scrivi_evento("orario_fisso", {
            "giorno":       giorno_norm,
            "palestra":     palestra,
            "squadra":      squadra,
            "ora_inizio":   ora_inizio_palestra,
            "ora_fine":     ora_fine_palestra,
            "allenatori":   allenatori_str,
            "condivisione": "SI" if condivisione else "NO",
            "zona":         cfg_zona,
        })
        if ok:
            invalida_cache()
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
                        elimina_evento("orario_fisso", row_label)
                        st.session_state.pop(confirm_key, None)
                        invalida_cache()
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
        invalida_cache()
        st.rerun()

    dati = carica_tutti_i_dati_db()
    orario_fisso  = dati.get("Orario Fisso",          pd.DataFrame())
    calendario    = dati.get("Calendario Definitivo", pd.DataFrame())
    df_squadre    = dati.get("Squadre",               pd.DataFrame())
    df_palestre   = dati.get("Palestre",              pd.DataFrame())
    df_allenatori = dati.get("Allenatori",            pd.DataFrame())

    # Carica eventi specifici della settimana corrente
    from datetime import date as _date
    _oggi = _date.today()
    _lun  = _oggi - timedelta(days=_oggi.weekday())
    _dom  = _lun + timedelta(days=6)
    orario_settimana = leggi_orario_settimana(
        data_inizio=_lun.strftime("%Y-%m-%d"),
        data_fine=_dom.strftime("%Y-%m-%d"),
    )

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
        _render_settimana_corrente(
            orario_fisso, calendario, df_palestre, conflicting_labels,
            orario_settimana, df_allenatori, df_squadre,
        )

    with tab_tipo:
        _render_settimana_tipo(orario_fisso, conflicting_labels)
