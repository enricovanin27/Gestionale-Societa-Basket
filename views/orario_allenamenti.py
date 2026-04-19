import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
from logic import GIORNI, GIORNI_SETTIMANA, c_e_conflitto, parse_data, _norm, trova_conflitti_allenamenti, trova_conflitti_allenatore_slot, controlla_conflitti_slot, trova_slot_liberi_data
from database import (
    carica_tutti_i_dati_db, invalida_cache,
    scrivi_evento, aggiorna_evento, elimina_evento,
    leggi_orario_settimana,
)
# LEGACY: from sheets import (
#     carica_tutti_i_dati, leggi_foglio, scrivi_riga, elimina_riga, aggiorna_riga,
# )
from views._components import get_team_color, get_palestra_tipo_color, FLAG_EMOJIS
import json
import streamlit.components.v1 as components

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
# Conflict-check helpers (usati nelle form di modifica e aggiunta)
# ─────────────────────────────────────────────────────────────────────────────

def _check_e_mostra_slot(
    data_str, squadra, palestra, ora_inizio, ora_fine, giorno_norm,
    orario_fisso, orario_settimana_df, calendario, df_allenatori,
    exclude_sett_id=None,
) -> dict:
    """Mostra indicatore real-time (✅/❌/⚠️) e ritorna i conflitti trovati."""
    if not all([data_str, squadra, palestra, ora_inizio, ora_fine, giorno_norm]):
        return {"palestra": [], "allenatore": [], "doppio": None}
    conf = controlla_conflitti_slot(
        data_str, squadra, palestra, ora_inizio, ora_fine, giorno_norm,
        orario_fisso, orario_settimana_df, calendario, df_allenatori, exclude_sett_id,
    )
    n_pal = len(conf["palestra"])
    n_all = len(conf["allenatore"])
    ha_dop = conf["doppio"] is not None

    if n_pal == 0 and n_all == 0 and not ha_dop:
        st.success("✅ Slot libero — nessun conflitto rilevato")
    else:
        for c in conf["palestra"]:
            st.error(
                f"❌ **CONFLITTO PALESTRA:** {palestra} è già occupata dalle "
                f"{c['ora_inizio']} alle {c['ora_fine']} da **{c['squadra']}**"
            )
        for c in conf["allenatore"]:
            st.warning(
                f"⚠️ **CONFLITTO ALLENATORE:** {c['nome']} è già impegnato dalle "
                f"{c['ora_inizio']} alle {c['ora_fine']} con **{c['squadra_o_evento']}**"
            )
        if ha_dop:
            dp = conf["doppio"]
            src_label = {"partita": "partita", "fisso": "allenamento", "settimana": "allenamento"}.get(dp.get("source", ""), "evento")
            st.warning(
                f"⚠️ **ATTENZIONE:** {squadra} ha già un {src_label} oggi dalle "
                f"{dp['ora_inizio']} alle {dp['ora_fine']}"
            )
    return conf


def _mostra_alternativi_ui(
    data_str, palestra, ora_inizio, ora_fine, giorno_norm,
    orario_fisso, orario_settimana_df, df_palestre, key_pfx,
):
    """Mostra slot alternativi liberi e ritorna (oi, of) scelto, o (None, None)."""
    oi_m = _ore_to_min(ora_inizio) or 0
    of_m = _ore_to_min(ora_fine)   or 0
    durata = max(30, of_m - oi_m)
    slots = trova_slot_liberi_data(
        data_str, palestra, durata, orario_fisso, orario_settimana_df, df_palestre, giorno_norm,
    )
    if not slots:
        st.info(f"💡 Nessuno slot libero disponibile per **{palestra}** in questa data.")
        return None, None
    st.markdown(f"**💡 Slot liberi disponibili per {palestra}:**")
    labels = [f"{s['ora_inizio']} – {s['ora_fine']}" for s in slots]
    chosen = st.selectbox("🔄 Scegli slot alternativo", labels, key=f"{key_pfx}_altsel")
    idx = labels.index(chosen)
    return slots[idx]["ora_inizio"], slots[idx]["ora_fine"]


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
            edit_key   = f"_edit_ev_{e['row_label']}_{e['source']}"
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

                    # ── Indicatore real-time slot ──────────────────────
                    _conf_rt = _check_e_mostra_slot(
                        e["data"], e["squadra"], new_pal, new_oi, new_of, e["giorno_norm"],
                        orario_fisso, orario_settimana, calendario, df_allenatori,
                        exclude_sett_id=(rl if fonte == "settimana" else None),
                    )
                    _has_conf = (len(_conf_rt["palestra"]) > 0 or
                                 len(_conf_rt["allenatore"]) > 0 or
                                 _conf_rt["doppio"] is not None)

                    _sc_pend_key = f"_sc_pend_{rl}"

                    def _sc_do_save(dati_save, is_fisso, row_label):
                        if is_fisso:
                            ok = scrivi_evento("orario_settimana", dati_save)
                        else:
                            ok = aggiorna_evento("orario_settimana", row_label, dati_save)
                        if ok:
                            invalida_cache()
                        st.session_state.pop(_sc_pend_key, None)
                        st.session_state.pop(edit_key, None)
                        st.rerun()

                    if st.session_state.get(_sc_pend_key):
                        _pd = st.session_state[_sc_pend_key]
                        _alt_oi, _alt_of = _mostra_alternativi_ui(
                            e["data"], new_pal, new_oi, new_of, e["giorno_norm"],
                            orario_fisso, orario_settimana, df_palestre, f"sc_{rl}",
                        )
                        _cc1, _cc2, _cc3 = st.columns(3)
                        with _cc1:
                            if st.button("🔄 Usa slot alternativo", key=f"_sc_alt_{rl}",
                                         use_container_width=True, disabled=(_alt_oi is None)):
                                _d2 = dict(_pd)
                                _d2["ora_inizio"] = _alt_oi
                                _d2["ora_fine"]   = _alt_of
                                _d2["flag"] = _pd.get("flag", "normale")
                                _sc_do_save(_d2, fonte == "fisso", rl)
                        with _cc2:
                            if st.button("⚠️ Salva comunque", key=f"_sc_force_{rl}",
                                         use_container_width=True):
                                _d2 = dict(_pd)
                                _d2["flag"] = "conflitto"
                                _sc_do_save(_d2, fonte == "fisso", rl)
                        with _cc3:
                            if st.button("✖ Annulla", key=f"_ef_cancel_{rl}",
                                         use_container_width=True):
                                st.session_state.pop(_sc_pend_key, None)
                                st.session_state.pop(edit_key, None)
                                st.rerun()
                    else:
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
                                    nuovi_dati["data"] = e["data"]
                                if _has_conf:
                                    st.session_state[_sc_pend_key] = nuovi_dati
                                    st.rerun()
                                else:
                                    _sc_do_save(nuovi_dati, fonte == "fisso", rl)
                        with sb2:
                            if st.button("✖ Annulla", key=f"_ef_cancel2_{rl}",
                                         use_container_width=True):
                                st.session_state.pop(edit_key, None)
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
                        # Numero bottoni: ✏️ + ❌/🗑️
                        c1, c2, c3 = st.columns([9, 1, 1])
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
                elif e["source"] in ("fisso", "settimana"):
                    _render_event_card(e, key_suffix=key_suf)
                else:
                    _render_event_card(e, key_suffix=key_suf)

    if not qualcosa:
        st.info("Nessun evento per i filtri selezionati.")

    # ── Riepilogo modifiche settimana corrente ───────────────────────
    st.markdown("---")
    st.markdown(
        f"<div style='background:#1a3a5c;color:white;"
        f"padding:9px 16px;border-radius:8px;margin:6px 0 10px 0;"
        f"font-weight:700;font-size:1.0em'>"
        f"📋 Riepilogo modifiche — settimana corrente"
        f"</div>",
        unsafe_allow_html=True,
    )
    st.caption("Confronto tra la **settimana tipo** e quanto effettivamente in programma questa settimana.")

    # Classifica gli override della settimana corrente
    rp_ann: list = []
    rp_mod: list = []
    rp_ext: list = []

    if orario_settimana is not None and not orario_settimana.empty:
        for _rp_id, _rp_row in orario_settimana.iterrows():
            _rp_ds = str(_rp_row.get("data", ""))
            try:
                _rp_d = datetime.strptime(_rp_ds, "%Y-%m-%d").date()
            except Exception:
                continue
            if _rp_d not in settimana:
                continue
            _rp_sq = str(_rp_row.get("squadra", "")).strip()
            _rp_g  = GIORNI_SETTIMANA[_rp_d.weekday()]
            _rp_fe = None
            if not orario_fisso.empty:
                for _, _fe in orario_fisso.iterrows():
                    if (_norm(str(_fe.get("squadra", ""))) == _norm(_rp_sq) and
                            _norm(str(_fe.get("giorno", ""))) == _rp_g):
                        _rp_fe = _fe
                        break
            _rp_entry = {
                "data": _rp_d, "squadra": _rp_sq,
                "g_label": _GIORNI_LABEL.get(_rp_g, ""),
                "row": _rp_row, "fisso_ev": _rp_fe,
            }
            if bool(_rp_row.get("annullato", False)):
                rp_ann.append(_rp_entry)
            elif _rp_fe is not None:
                rp_mod.append(_rp_entry)
            else:
                rp_ext.append(_rp_entry)

    # Conta fissi totali questa settimana per calcolare i confermati
    _n_fissi_settimana = 0
    if not orario_fisso.empty:
        for _fd in settimana:
            _fg = GIORNI_SETTIMANA[_fd.weekday()]
            _n_fissi_settimana += sum(
                1 for _, _fe in orario_fisso.iterrows()
                if _norm(str(_fe.get("giorno", ""))) == _fg
            )
    _n_confermati = max(0, _n_fissi_settimana - len(rp_mod) - len(rp_ann))

    _rc1, _rc2, _rc3, _rc4 = st.columns(4)
    with _rc1:
        st.metric("✅ Confermati", _n_confermati)
    with _rc2:
        st.metric("🔄 Modificati", len(rp_mod))
    with _rc3:
        st.metric("❌ Annullati", len(rp_ann))
    with _rc4:
        st.metric("➕ Extra", len(rp_ext))

    if not rp_mod and not rp_ann and not rp_ext:
        st.info("✅ Nessuna modifica rispetto alla settimana tipo.")
    else:
        if rp_ann:
            st.markdown("**❌ Annullati questa settimana:**")
            for _e in sorted(rp_ann, key=lambda x: (x["data"], x["squadra"])):
                _e_fi = (str(_e["fisso_ev"].get("ora_inizio", "")).strip()
                         if _e["fisso_ev"] is not None
                         else str(_e["row"].get("ora_inizio", "")).strip())
                st.markdown(f"&nbsp;&nbsp;- **{_e['squadra']}**: {_e['g_label']} {_e_fi} annullato")
        if rp_mod:
            st.markdown("**🔄 Modificati questa settimana:**")
            for _e in sorted(rp_mod, key=lambda x: (x["data"], x["squadra"])):
                _e_rw  = _e["row"]
                _e_fe  = _e["fisso_ev"]
                _e_oi  = str(_e_rw.get("ora_inizio", "")).strip()
                _e_of  = str(_e_rw.get("ora_fine",   "")).strip()
                _e_pal = str(_e_rw.get("palestra",   "")).strip()
                _e_foi = str(_e_fe.get("ora_inizio", "")).strip()
                _e_fof = str(_e_fe.get("ora_fine",   "")).strip()
                _e_fpl = str(_e_fe.get("palestra",   "")).strip()
                _e_diffs = []
                if _e_oi != _e_foi or _e_of != _e_fof:
                    _e_diffs.append(f"orario {_e_foi}–{_e_fof} → {_e_oi}–{_e_of}")
                if _norm(_e_pal) != _norm(_e_fpl):
                    _e_diffs.append(f"palestra {_e_fpl.capitalize()} → {_e_pal.capitalize()}")
                if _norm(str(_e_rw.get("allenatori", ""))) != _norm(str(_e_fe.get("allenatori", ""))):
                    _e_diffs.append("allenatori modificati")
                _e_diffs_str = ", ".join(_e_diffs) if _e_diffs else "modificato"
                st.markdown(
                    f"&nbsp;&nbsp;- **{_e['squadra']}**: "
                    f"{_e['g_label']} {_e['data'].strftime('%d/%m')} — {_e_diffs_str}"
                )
        if rp_ext:
            st.markdown("**➕ Extra questa settimana:**")
            for _e in sorted(rp_ext, key=lambda x: (x["data"], x["squadra"])):
                _e_rw  = _e["row"]
                _e_oi  = str(_e_rw.get("ora_inizio", "")).strip()
                _e_of  = str(_e_rw.get("ora_fine",   "")).strip()
                _e_pal = str(_e_rw.get("palestra",   "")).strip().capitalize()
                st.markdown(
                    f"&nbsp;&nbsp;- **{_e['squadra']}**: "
                    f"{_e['g_label']} {_e['data'].strftime('%d/%m')} {_e_oi}–{_e_of} @ {_e_pal}"
                )


# ─────────────────────────────────────────────────────────────────────────────
# Tab NEW — Prossima Settimana
# ─────────────────────────────────────────────────────────────────────────────

def _render_prossima_settimana(
    orario_fisso: pd.DataFrame,
    df_palestre: pd.DataFrame = None,
    df_allenatori: pd.DataFrame = None,
    df_squadre: pd.DataFrame = None,
    calendario: pd.DataFrame = None,
):
    """Tab Prossima Settimana — tutti gli allenamenti della settimana tipo come
    base, con pulsanti per modificare, annullare, aggiungere extra per la sola
    settimana prossima, riepilogo differenze e messaggio WhatsApp."""

    oggi      = datetime.today().date()
    lun       = oggi - timedelta(days=oggi.weekday())
    lun_prox  = lun + timedelta(days=7)
    dom_prox  = lun_prox + timedelta(days=6)
    sett_prox = [lun_prox + timedelta(days=i) for i in range(7)]

    st.markdown(
        f"<div style='background:linear-gradient(135deg,#1a4a2e,#2e7d52);color:white;"
        f"padding:8px 16px;border-radius:8px;margin:0 0 14px 0;font-weight:700;font-size:1.0em'>"
        f"📅 Prossima settimana &nbsp;·&nbsp; "
        f"{lun_prox.strftime('%d/%m')} → {dom_prox.strftime('%d/%m/%Y')}"
        f"</div>",
        unsafe_allow_html=True,
    )
    st.caption(
        "Tutti gli allenamenti della **settimana tipo** come punto di partenza. "
        "Le modifiche vengono salvate in `orario_settimana` e **non alterano il template fisso**."
    )

    is_admin = st.session_state.get("ruolo", "admin") == "admin"

    # Carica overrides per la prossima settimana
    os_prox = leggi_orario_settimana(
        data_inizio=lun_prox.strftime("%Y-%m-%d"),
        data_fine=dom_prox.strftime("%Y-%m-%d"),
    )

    palestre_lista: list = []
    if df_palestre is not None and not df_palestre.empty and "Nome" in df_palestre.columns:
        palestre_lista = df_palestre["Nome"].tolist()

    # Costruisci indice override: (data_str, squadra_norm) → (row_id, row)
    sett_lookup_prox: dict = {}
    if not os_prox.empty:
        for row_id, row in os_prox.iterrows():
            data_s = str(row.get("data", ""))
            sq_s   = _norm(str(row.get("squadra", "")).strip())
            sett_lookup_prox.setdefault(data_s, {})[sq_s] = (row_id, row)

    # Costruisci eventi per giorno partendo da orario_fisso
    eventi_prox: dict = {d: [] for d in sett_prox}
    inclusi_override_prox: set = set()

    if not orario_fisso.empty:
        for row_label, ev in orario_fisso.iterrows():
            g = _norm(ev.get("giorno", ""))
            for d in sett_prox:
                if GIORNI_SETTIMANA[d.weekday()] != g:
                    continue
                data_str = d.strftime("%Y-%m-%d")
                sq_str   = str(ev.get("squadra", "")).strip()
                sq_norm  = _norm(sq_str)
                override_entry = sett_lookup_prox.get(data_str, {}).get(sq_norm)

                if override_entry:
                    sett_id, sett_row = override_entry
                    inclusi_override_prox.add((data_str, sq_norm))
                    is_ann = bool(sett_row.get("annullato", False))
                    eventi_prox[d].append({
                        "squadra":      sq_str,
                        "giorno_norm":  g,
                        "giorno_label": _GIORNI_LABEL.get(g, ""),
                        "data":         data_str,
                        "fisso_id":     row_label,
                        "fisso_ev":     ev,
                        "sett_id":      sett_id,
                        "sett_row":     sett_row,
                        "annullato":    is_ann,
                        "is_override":  not is_ann,
                        "is_extra":     False,
                        "ora_inizio":   str(sett_row.get("ora_inizio", ev.get("ora_inizio", ""))).strip(),
                        "ora_fine":     str(sett_row.get("ora_fine",   ev.get("ora_fine",   ""))).strip(),
                        "palestra":     str(sett_row.get("palestra",   ev.get("palestra",   ""))).strip(),
                        "allenatori":   str(sett_row.get("allenatori", ev.get("allenatori", ""))).strip(),
                        "fisso_oi":     str(ev.get("ora_inizio", "")).strip(),
                        "fisso_of":     str(ev.get("ora_fine",   "")).strip(),
                        "fisso_pal":    str(ev.get("palestra",   "")).strip(),
                        "fisso_all":    str(ev.get("allenatori", "")).strip(),
                    })
                else:
                    _fisso_pal = str(ev.get("palestra", "")).strip()
                    eventi_prox[d].append({
                        "squadra":      sq_str,
                        "giorno_norm":  g,
                        "giorno_label": _GIORNI_LABEL.get(g, ""),
                        "data":         data_str,
                        "fisso_id":     row_label,
                        "fisso_ev":     ev,
                        "sett_id":      None,
                        "sett_row":     None,
                        "annullato":    False,
                        "is_override":  False,
                        "is_extra":     False,
                        "ora_inizio":   str(ev.get("ora_inizio", "")).strip(),
                        "ora_fine":     str(ev.get("ora_fine",   "")).strip(),
                        "palestra":     _fisso_pal,
                        "allenatori":   str(ev.get("allenatori", "")).strip(),
                        "fisso_oi":     str(ev.get("ora_inizio", "")).strip(),
                        "fisso_of":     str(ev.get("ora_fine",   "")).strip(),
                        "fisso_pal":    _fisso_pal,
                        "fisso_all":    str(ev.get("allenatori", "")).strip(),
                    })

    # Aggiungi extra (in orario_settimana ma NON override di fisso)
    if not os_prox.empty:
        for row_id, sett_row in os_prox.iterrows():
            data_s = str(sett_row.get("data", ""))
            sq_s   = _norm(str(sett_row.get("squadra", "")).strip())
            if (data_s, sq_s) in inclusi_override_prox:
                continue
            if sett_row.get("annullato", False):
                continue
            try:
                d = datetime.strptime(data_s, "%Y-%m-%d").date()
            except Exception:
                continue
            if d not in sett_prox:
                continue
            g = GIORNI_SETTIMANA[d.weekday()]
            sq_str = str(sett_row.get("squadra", "")).strip()
            eventi_prox[d].append({
                "squadra":      sq_str,
                "giorno_norm":  g,
                "giorno_label": _GIORNI_LABEL.get(g, ""),
                "data":         data_s,
                "fisso_id":     None,
                "fisso_ev":     None,
                "sett_id":      row_id,
                "sett_row":     sett_row,
                "annullato":    False,
                "is_override":  False,
                "is_extra":     True,
                "ora_inizio":   str(sett_row.get("ora_inizio", "")).strip(),
                "ora_fine":     str(sett_row.get("ora_fine",   "")).strip(),
                "palestra":     str(sett_row.get("palestra",   "")).strip(),
                "allenatori":   str(sett_row.get("allenatori", "")).strip(),
                "fisso_oi": "", "fisso_of": "", "fisso_pal": "", "fisso_all": "",
            })

    # ── Render per giorno ────────────────────────────────────────────────
    for d in sett_prox:
        evs = sorted(eventi_prox[d], key=lambda e: _ore_to_min(e["ora_inizio"]) or 0)
        g_key   = GIORNI_SETTIMANA[d.weekday()]
        g_label = _GIORNI_LABEL.get(g_key, "")
        d_fmt   = d.strftime("%d/%m/%Y")

        st.markdown(
            f"<div style='background:#1a3a5c;color:white;"
            f"padding:7px 14px;border-radius:7px;margin:14px 0 6px 0;"
            f"font-weight:700;font-size:1.05em'>"
            f"📅 {g_label} &nbsp;·&nbsp; {d_fmt}"
            f"</div>",
            unsafe_allow_html=True,
        )

        if not evs:
            st.caption("Nessun allenamento programmato.")
            continue

        for ri, e in enumerate(evs):
            sq      = e["squadra"]
            sett_id = e["sett_id"]
            key_suf = f"p4_{d}_{ri}"
            edit_key = f"_p4_edit_{d}_{sq}"
            delc_key = f"_p4_delc_{d}_{sq}"

            if e["annullato"]:
                st.markdown(
                    f"<div style='background:#555;border-radius:10px;padding:9px 14px;"
                    f"margin:4px 0;opacity:0.85'>"
                    f"<div style='display:flex;justify-content:space-between'>"
                    f"<span style='color:#ccc;font-weight:700;text-decoration:line-through'>🏀 {sq}</span>"
                    f"<span style='color:#f90;font-size:0.88em'>❌ ANNULLATO</span>"
                    f"</div>"
                    f"<div style='color:#aaa;font-size:0.83em;margin-top:3px'>"
                    f"⏰ {e['fisso_oi']} → {e['fisso_of']}"
                    f"{(' &nbsp;&nbsp; 🏟️ ' + e['fisso_pal'].capitalize()) if e['fisso_pal'] else ''}"
                    f"{(' &nbsp;&nbsp; 👤 ' + e['fisso_all']) if e['fisso_all'] else ''}"
                    f"</div></div>",
                    unsafe_allow_html=True,
                )
                if is_admin and sett_id is not None:
                    if st.button("↩️ Ripristina", key=f"_p4_rip_{key_suf}"):
                        elimina_evento("orario_settimana", sett_id)
                        invalida_cache()
                        st.rerun()

            elif is_admin and st.session_state.get(edit_key):
                with st.container():
                    st.markdown(
                        f"<div style='background:#1a3a5c;border-radius:8px;padding:8px 14px;margin:4px 0'>"
                        f"<span style='color:white;font-weight:700'>✏️ Modifica — {sq} · {g_label} {d_fmt}</span>"
                        f"<small style='color:#7ec8f7'> (solo prossima settimana)</small></div>",
                        unsafe_allow_html=True,
                    )
                    _pc1, _pc2, _pc3 = st.columns(3)
                    with _pc1:
                        try:
                            _poi = datetime.strptime(e["ora_inizio"] or "18:00", "%H:%M").time()
                        except Exception:
                            _poi = datetime.strptime("18:00", "%H:%M").time()
                        _new_oi = st.time_input("⏰ Ora inizio", value=_poi, key=f"_p4_oi_{key_suf}").strftime("%H:%M")
                    with _pc2:
                        try:
                            _pof = datetime.strptime(e["ora_fine"] or "19:30", "%H:%M").time()
                        except Exception:
                            _pof = datetime.strptime("19:30", "%H:%M").time()
                        _new_of = st.time_input("⏰ Ora fine", value=_pof, key=f"_p4_of_{key_suf}").strftime("%H:%M")
                    with _pc3:
                        _pal_cur = e["palestra"].strip()
                        _pal_ls  = palestre_lista if palestre_lista else ([_pal_cur] if _pal_cur else [""])
                        _pal_ix  = _pal_ls.index(_pal_cur) if _pal_cur in _pal_ls else 0
                        _new_pal = st.selectbox("🏟️ Palestra", _pal_ls, index=_pal_ix, key=f"_p4_pal_{key_suf}")

                    _ao: list = []
                    if df_allenatori is not None and not df_allenatori.empty:
                        for _, _ar in df_allenatori.iterrows():
                            if sq in [s.split("(")[0].strip() for s in str(_ar.get("Squadre", "")).split(",")]:
                                _cg = str(_ar.get("Cognome", "")).strip()
                                if _cg:
                                    _ao.append(_cg)
                    _ac = [a.strip() for a in e["allenatori"].split("-") if a.strip()]
                    _ad = [a for a in _ac if a in _ao] or _ao
                    _new_all = st.multiselect("👤 Allenatori", options=_ao or _ac, default=_ad, key=f"_p4_all_{key_suf}")

                    # ── Indicatore real-time slot ──────────────────────
                    _ps_conf_rt = _check_e_mostra_slot(
                        e["data"], sq, _new_pal, _new_oi, _new_of, e["giorno_norm"],
                        orario_fisso, os_prox, calendario, df_allenatori,
                        exclude_sett_id=(sett_id if sett_id is not None else None),
                    )
                    _ps_has_conf = (len(_ps_conf_rt["palestra"]) > 0 or
                                    len(_ps_conf_rt["allenatore"]) > 0 or
                                    _ps_conf_rt["doppio"] is not None)

                    _ps_pend_key = f"_ps_pend_{d}_{sq}"

                    def _ps_do_save(dati_save, sid):
                        if sid is not None:
                            ok = aggiorna_evento("orario_settimana", sid, dati_save)
                        else:
                            ok = scrivi_evento("orario_settimana", dati_save)
                        if ok:
                            invalida_cache()
                        st.session_state.pop(_ps_pend_key, None)
                        st.session_state.pop(edit_key, None)
                        st.rerun()

                    if st.session_state.get(_ps_pend_key):
                        _pd = st.session_state[_ps_pend_key]
                        _alt_oi, _alt_of = _mostra_alternativi_ui(
                            e["data"], _new_pal, _new_oi, _new_of, e["giorno_norm"],
                            orario_fisso, os_prox, df_palestre, f"ps_{d}_{sq}",
                        )
                        _pcc1, _pcc2, _pcc3 = st.columns(3)
                        with _pcc1:
                            if st.button("🔄 Usa slot alternativo", key=f"_ps_alt_{key_suf}",
                                         use_container_width=True, disabled=(_alt_oi is None)):
                                _d2 = dict(_pd)
                                _d2["ora_inizio"] = _alt_oi
                                _d2["ora_fine"]   = _alt_of
                                _ps_do_save(_d2, sett_id)
                        with _pcc2:
                            if st.button("⚠️ Salva comunque", key=f"_ps_force_{key_suf}",
                                         use_container_width=True):
                                _d2 = dict(_pd)
                                _d2["flag"] = "conflitto"
                                _ps_do_save(_d2, sett_id)
                        with _pcc3:
                            if st.button("✖ Annulla", key=f"_p4_cancel_{key_suf}",
                                         use_container_width=True):
                                st.session_state.pop(_ps_pend_key, None)
                                st.session_state.pop(edit_key, None)
                                st.rerun()
                    else:
                        _sb1, _sb2 = st.columns(2)
                        with _sb1:
                            if st.button("💾 Salva", key=f"_p4_save_{key_suf}", type="primary", use_container_width=True):
                                _dati_new = {
                                    "data": e["data"], "giorno": e["giorno_norm"],
                                    "palestra": _new_pal, "squadra": sq,
                                    "ora_inizio": _new_oi, "ora_fine": _new_of,
                                    "allenatori": " - ".join(_new_all),
                                    "condivisione": "NO", "annullato": False,
                                    "flag": "normale", "zona": "",
                                }
                                if _ps_has_conf:
                                    st.session_state[_ps_pend_key] = _dati_new
                                    st.rerun()
                                else:
                                    _ps_do_save(_dati_new, sett_id)
                        with _sb2:
                            if st.button("✖ Annulla", key=f"_p4_cancel2_{key_suf}", use_container_width=True):
                                st.session_state.pop(edit_key, None)
                                st.rerun()

            else:
                oi  = e["ora_inizio"]
                of  = e["ora_fine"]
                pal = e["palestra"].capitalize() if e["palestra"] else "—"
                all_str = e["allenatori"]
                bg = get_team_color(sq)

                if e["is_override"]:
                    badge_html = "<span style='background:rgba(255,255,255,0.15);color:#a0d4ff;font-size:0.75em;padding:2px 6px;border-radius:10px;margin-left:6px'>✎ modificato</span>"
                elif e["is_extra"]:
                    badge_html = "<span style='background:rgba(255,255,255,0.15);color:#a0ffb0;font-size:0.75em;padding:2px 6px;border-radius:10px;margin-left:6px'>★ extra</span>"
                else:
                    badge_html = ""

                card_html = (
                    f"<div style='background:{bg};border-radius:10px;padding:10px 15px;"
                    f"margin:4px 0;box-shadow:0 2px 8px rgba(0,0,0,0.22)'>"
                    f"<div style='display:flex;justify-content:space-between;align-items:center'>"
                    f"<span style='color:white;font-weight:800;font-size:1.0em'>🏀 {sq}{badge_html}</span>"
                    f"<span style='color:rgba(255,255,255,0.95);font-weight:700;font-size:0.9em'>⏰ {oi} → {of}</span>"
                    f"</div>"
                    f"<div style='color:rgba(255,255,255,0.82);font-size:0.85em;margin-top:4px'>"
                    f"🏟️ {pal}{(' &nbsp;&nbsp; 👤 ' + all_str) if all_str else ''}"
                    f"</div></div>"
                )

                if is_admin:
                    if st.session_state.get(delc_key):
                        _dc = st.columns([5, 1, 1])
                        if e["is_extra"]:
                            _dc[0].warning(f"⚠️ Elimina extra **{sq}**?")
                        else:
                            _dc[0].warning(f"⚠️ Annulla **{sq}** solo la prossima settimana?")
                        with _dc[1]:
                            if st.button("✅", key=f"_p4_dely_{key_suf}", type="primary", use_container_width=True):
                                if e["is_extra"] and sett_id is not None:
                                    elimina_evento("orario_settimana", sett_id)
                                elif e["is_override"] and sett_id is not None:
                                    aggiorna_evento("orario_settimana", sett_id, {
                                        "data": e["data"], "giorno": e["giorno_norm"],
                                        "palestra": e["fisso_pal"], "squadra": sq,
                                        "ora_inizio": e["fisso_oi"], "ora_fine": e["fisso_of"],
                                        "allenatori": e["fisso_all"],
                                        "condivisione": "NO", "annullato": True,
                                        "flag": "annullato", "zona": "",
                                    })
                                else:
                                    scrivi_evento("orario_settimana", {
                                        "data": e["data"], "giorno": e["giorno_norm"],
                                        "palestra": e["fisso_pal"].lower(), "squadra": sq,
                                        "ora_inizio": e["fisso_oi"], "ora_fine": e["fisso_of"],
                                        "allenatori": e["fisso_all"],
                                        "condivisione": "NO", "annullato": True,
                                        "flag": "annullato", "zona": "",
                                    })
                                invalida_cache()
                                st.session_state.pop(delc_key, None)
                                st.rerun()
                        with _dc[2]:
                            if st.button("✖", key=f"_p4_deln_{key_suf}", use_container_width=True):
                                st.session_state.pop(delc_key, None)
                                st.rerun()
                    else:
                        _wc = st.columns([8, 1, 1])
                        with _wc[0]:
                            st.markdown(card_html, unsafe_allow_html=True)
                        with _wc[1]:
                            st.write("")
                            if st.button("✏️", key=f"_p4_edit_btn_{key_suf}", help="Modifica (solo prossima settimana)", use_container_width=True):
                                st.session_state[edit_key] = True
                                st.rerun()
                        with _wc[2]:
                            st.write("")
                            _btn_icon = "🗑️" if e["is_extra"] else "❌"
                            _btn_help = "Elimina extra" if e["is_extra"] else "Annulla solo prossima settimana"
                            if st.button(_btn_icon, key=f"_p4_del_btn_{key_suf}", help=_btn_help, use_container_width=True):
                                st.session_state[delc_key] = True
                                st.rerun()
                        if e["is_override"] and sett_id is not None:
                            if st.button("↩️ Ripristina fisso", key=f"_p4_rev_{key_suf}", help="Annulla la modifica e torna al template fisso"):
                                elimina_evento("orario_settimana", sett_id)
                                invalida_cache()
                                st.rerun()
                else:
                    st.markdown(card_html, unsafe_allow_html=True)

    # ── Aggiungi allenamento extra ────────────────────────────────────────
    st.markdown("---")
    with st.expander("➕ Aggiungi allenamento extra — prossima settimana"):
        st.caption(
            f"L'allenamento verrà aggiunto **solo per la prossima settimana** "
            f"({lun_prox.strftime('%d/%m')} → {dom_prox.strftime('%d/%m/%Y')}) "
            f"in `orario_settimana`, senza modificare il template fisso."
        )
        _sq_opts  = df_squadre["Categoria"].tolist() if df_squadre is not None and not df_squadre.empty and "Categoria" in df_squadre.columns else []
        _pal_opts = palestre_lista

        ep_c1, ep_c2 = st.columns(2)
        with ep_c1:
            ep_squadra = st.selectbox("🏀 Squadra", ["— Seleziona —"] + _sq_opts, key="_p4_ep_sq")
        with ep_c2:
            ep_giorno_label = st.selectbox("📅 Giorno", ["— Seleziona —"] + [_GIORNI_LABEL[g] for g in _GIORNI_ORDER], key="_p4_ep_g")

        if ep_squadra != "— Seleziona —" and ep_giorno_label != "— Seleziona —":
            ep_giorno_norm = next((g for g in _GIORNI_ORDER if _GIORNI_LABEL[g] == ep_giorno_label), "")
            _wdm = {g: i for i, g in enumerate(_GIORNI_ORDER)}
            ep_data     = lun_prox + timedelta(days=_wdm.get(ep_giorno_norm, 0))
            ep_data_str = ep_data.strftime("%Y-%m-%d")
            st.info(f"📅 Data: **{ep_data.strftime('%d/%m/%Y')}** ({ep_giorno_label})")

            ep_c3, ep_c4 = st.columns(2)
            with ep_c3:
                ep_oi = st.time_input("⏰ Ora inizio", value=datetime.strptime("18:00", "%H:%M").time(), key="_p4_ep_oi").strftime("%H:%M")
            with ep_c4:
                ep_of = st.time_input("⏰ Ora fine",   value=datetime.strptime("19:30", "%H:%M").time(), key="_p4_ep_of").strftime("%H:%M")

            ep_pal = st.selectbox("🏟️ Palestra", (["— Seleziona —"] + _pal_opts) if _pal_opts else ["— Seleziona —"], key="_p4_ep_pal")

            _ep_all_opts: list = []
            if df_allenatori is not None and not df_allenatori.empty:
                for _, _ar in df_allenatori.iterrows():
                    if ep_squadra in [s.split("(")[0].strip() for s in str(_ar.get("Squadre", "")).split(",")]:
                        _cg = str(_ar.get("Cognome", "")).strip()
                        if _cg:
                            _ep_all_opts.append(_cg)
            ep_all_sel = st.multiselect("👤 Allenatori", options=_ep_all_opts, default=_ep_all_opts, key="_p4_ep_all")
            ep_cond    = st.checkbox("🤝 Condivide la palestra", key="_p4_ep_cond")

            # ── Indicatore real-time slot per extra ────────────────────
            _ep_conf_rt = {"palestra": [], "allenatore": [], "doppio": None}
            if ep_pal != "— Seleziona —":
                _ep_conf_rt = _check_e_mostra_slot(
                    ep_data_str, ep_squadra, ep_pal, ep_oi, ep_of, ep_giorno_norm,
                    orario_fisso, os_prox, calendario, df_allenatori,
                )
            _ep_has_conf = (len(_ep_conf_rt["palestra"]) > 0 or
                            len(_ep_conf_rt["allenatore"]) > 0 or
                            _ep_conf_rt["doppio"] is not None)

            _ep_pend_key = "_pe_pend"

            if st.session_state.get(_ep_pend_key):
                _epd = st.session_state[_ep_pend_key]
                _ep_alt_oi, _ep_alt_of = _mostra_alternativi_ui(
                    ep_data_str, ep_pal, ep_oi, ep_of, ep_giorno_norm,
                    orario_fisso, os_prox, df_palestre, "pe",
                )
                _ec1, _ec2, _ec3 = st.columns(3)
                with _ec1:
                    if st.button("🔄 Usa slot alternativo", key="_pe_alt",
                                 use_container_width=True, disabled=(_ep_alt_oi is None)):
                        _d2 = dict(_epd)
                        _d2["ora_inizio"] = _ep_alt_oi
                        _d2["ora_fine"]   = _ep_alt_of
                        ok = scrivi_evento("orario_settimana", _d2)
                        if ok:
                            invalida_cache()
                        st.session_state.pop(_ep_pend_key, None)
                        st.success(f"✅ Allenamento extra aggiunto: {ep_squadra} · {ep_data.strftime('%d/%m/%Y')} · {_ep_alt_oi}–{_ep_alt_of}")
                        st.rerun()
                with _ec2:
                    if st.button("⚠️ Salva comunque", key="_pe_force",
                                 use_container_width=True):
                        _d2 = dict(_epd)
                        _d2["flag"] = "conflitto"
                        ok = scrivi_evento("orario_settimana", _d2)
                        if ok:
                            invalida_cache()
                        st.session_state.pop(_ep_pend_key, None)
                        st.success(f"✅ Allenamento extra aggiunto (con conflitto): {ep_squadra} · {ep_data.strftime('%d/%m/%Y')}")
                        st.rerun()
                with _ec3:
                    if st.button("✖ Annulla", key="_pe_cancel",
                                 use_container_width=True):
                        st.session_state.pop(_ep_pend_key, None)
                        st.rerun()
            else:
                if st.button(
                    f"💾 Salva — {ep_squadra} · {ep_giorno_label} · {ep_oi}–{ep_of}",
                    type="primary", use_container_width=True,
                    disabled=(ep_pal == "— Seleziona —"), key="_p4_ep_salva",
                ):
                    _ep_dati = {
                        "data": ep_data_str, "giorno": ep_giorno_norm, "palestra": ep_pal,
                        "squadra": ep_squadra, "ora_inizio": ep_oi, "ora_fine": ep_of,
                        "allenatori": " - ".join(ep_all_sel),
                        "condivisione": "SI" if ep_cond else "NO",
                        "annullato": False, "flag": "normale", "zona": "",
                    }
                    if _ep_has_conf:
                        st.session_state[_ep_pend_key] = _ep_dati
                        st.rerun()
                    else:
                        ok = scrivi_evento("orario_settimana", _ep_dati)
                        if ok:
                            invalida_cache()
                            st.success(f"✅ Allenamento extra aggiunto: {ep_squadra} · {ep_data.strftime('%d/%m/%Y')} · {ep_oi}–{ep_of}")
                            st.rerun()
                        else:
                            st.error("❌ Errore nel salvataggio. Riprova.")

    # ── Riepilogo differenze ─────────────────────────────────────────────
    st.markdown("---")
    st.markdown("### 📋 MODIFICHE PROSSIMA SETTIMANA")

    confermati: list = []
    modificati: list = []
    annullati:  list = []
    extra:      list = []

    for d in sett_prox:
        for e in eventi_prox[d]:
            if e["annullato"]:
                annullati.append(e)
            elif e["is_extra"]:
                extra.append(e)
            elif e["is_override"]:
                modificati.append(e)
            else:
                confermati.append(e)

    _ms1, _ms2, _ms3, _ms4 = st.columns(4)
    with _ms1:
        st.metric("✅ Confermati", len(confermati))
    with _ms2:
        st.metric("🔄 Modificati", len(modificati))
    with _ms3:
        st.metric("❌ Annullati", len(annullati))
    with _ms4:
        st.metric("➕ Extra", len(extra))

    st.markdown("---")

    if confermati:
        st.markdown(f"**✅ Confermati senza modifiche:** {len(confermati)} allenamenti")

    if modificati:
        st.markdown("**🔄 Modificati:**")
        for e in modificati:
            diffs = []
            if e["ora_inizio"] != e["fisso_oi"] or e["ora_fine"] != e["fisso_of"]:
                diffs.append(f"orario {e['fisso_oi']}–{e['fisso_of']} → {e['ora_inizio']}–{e['ora_fine']}")
            if _norm(e["palestra"]) != _norm(e["fisso_pal"]):
                diffs.append(f"palestra {e['fisso_pal'].capitalize()} → {e['palestra'].capitalize()}")
            if _norm(e["allenatori"]) != _norm(e["fisso_all"]):
                diffs.append("allenatori modificati")
            diffs_str = ", ".join(diffs) if diffs else "modificato"
            st.markdown(f"&nbsp;&nbsp;- **{e['squadra']}**: {diffs_str} ({e['giorno_label']} {e['data']})")

    if annullati:
        st.markdown("**❌ Annullati:**")
        for e in annullati:
            st.markdown(f"&nbsp;&nbsp;- **{e['squadra']}**: {e['giorno_label']} {e['fisso_oi']} annullato")

    if extra:
        st.markdown("**➕ Extra:**")
        for e in extra:
            st.markdown(f"&nbsp;&nbsp;- **{e['squadra']}**: {e['giorno_label']} {e['ora_inizio']}–{e['ora_fine']} @ {e['palestra'].capitalize()}")

    if not modificati and not annullati and not extra:
        st.info("✅ Nessuna modifica rispetto al solito.")

    # ── Messaggio WhatsApp ────────────────────────────────────────────────
    st.markdown("---")
    st.markdown("#### 📱 Messaggio WhatsApp")

    lun_str = lun_prox.strftime("%d/%m/%Y")
    dom_str = dom_prox.strftime("%d/%m/%Y")

    if not modificati and not annullati and not extra:
        wa_msg = (
            f"🏀 ODERZO BASKET — Settimana {lun_str} - {dom_str}\n"
            f"✅ Nessuna modifica. Orario invariato rispetto al solito."
        )
    else:
        lines = [
            f"🏀 ODERZO BASKET — SETTIMANA {lun_str} - {dom_str}",
            "📋 MODIFICHE RISPETTO AL SOLITO:",
        ]
        if modificati:
            lines.append("")
            lines.append("🔄 ALLENAMENTI SPOSTATI:")
            for e in modificati:
                diffs = []
                if e["ora_inizio"] != e["fisso_oi"] or e["ora_fine"] != e["fisso_of"]:
                    diffs.append(f"orario {e['fisso_oi']}–{e['fisso_of']} → {e['ora_inizio']}–{e['ora_fine']}")
                if _norm(e["palestra"]) != _norm(e["fisso_pal"]):
                    diffs.append(f"palestra {e['fisso_pal'].capitalize()} → {e['palestra'].capitalize()}")
                diffs_str = ", ".join(diffs) if diffs else "modificato"
                lines.append(f"- {e['squadra']}: {diffs_str}")
        if annullati:
            lines.append("")
            lines.append("❌ ALLENAMENTI ANNULLATI:")
            for e in annullati:
                lines.append(f"- {e['squadra']}: {e['giorno_label']} {e['fisso_oi']} annullato")
        if extra:
            lines.append("")
            lines.append("➕ ALLENAMENTI EXTRA:")
            for e in extra:
                lines.append(f"- {e['squadra']}: {e['giorno_label']} {e['ora_inizio']}–{e['ora_fine']} {e['palestra'].capitalize()}")
        lines.append("")
        lines.append("✅ Tutto il resto rimane invariato.")
        wa_msg = "\n".join(lines)

    st.text_area("Anteprima:", value=wa_msg, height=200, key="_p4_wa_preview")

    _wa_escaped = json.dumps(wa_msg)
    components.html(
        f"""<button onclick="
            navigator.clipboard.writeText({_wa_escaped}).then(() => {{
                this.innerText = '✅ Copiato negli appunti!';
                this.style.background = '#27ae60';
                setTimeout(() => {{
                    this.innerText = '📱 Copia messaggio WhatsApp';
                    this.style.background = '#25D366';
                }}, 2500);
            }}).catch(() => {{
                this.innerText = '⚠️ Copia manuale — seleziona il testo sopra';
                setTimeout(() => {{ this.innerText = '📱 Copia messaggio WhatsApp'; }}, 3000);
            }});
        " style="background:#25D366;color:white;font-weight:700;font-size:1em;
            border:none;border-radius:8px;padding:11px 24px;cursor:pointer;
            box-shadow:0 2px 8px rgba(0,0,0,0.18);width:100%;margin-top:6px">
            📱 Copia messaggio WhatsApp
        </button>""",
        height=60,
    )


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
        tab_settimana, tab_prox, tab_tipo, tab_configura = st.tabs(
            ["📅 Settimana corrente", "📅 Prossima Settimana", "📊 Settimana tipo", "⚙️ Configura allenamenti"]
        )
        with tab_configura:
            _render_configura(orario_fisso, df_squadre, df_palestre, df_allenatori)
    else:
        tab_settimana, tab_prox, tab_tipo = st.tabs(
            ["📅 Settimana corrente", "📅 Prossima Settimana", "📊 Settimana tipo"]
        )

    with tab_settimana:
        _render_settimana_corrente(
            orario_fisso, calendario, df_palestre, conflicting_labels,
            orario_settimana, df_allenatori, df_squadre,
        )

    with tab_prox:
        _render_prossima_settimana(orario_fisso, df_palestre, df_allenatori, df_squadre, calendario)

    with tab_tipo:
        _render_settimana_tipo(orario_fisso, conflicting_labels)
