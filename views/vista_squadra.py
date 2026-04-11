"""
Vista pubblica per genitori e giocatori.
Accessibile senza login tramite ?squadra=NomeSquadra nell'URL.
Mostra orario allenamenti + calendario partite della squadra, in sola lettura.
"""
import streamlit as st
from datetime import datetime, timedelta, date
from collections import defaultdict
from logic import GIORNI_SETTIMANA, parse_data
from sheets import carica_tutti_i_dati, leggi_foglio
from views._components import get_team_color


_GIORNO_LABEL = {
    "lunedi": "Lunedì", "martedi": "Martedì", "mercoledi": "Mercoledì",
    "giovedi": "Giovedì", "venerdi": "Venerdì", "sabato": "Sabato", "domenica": "Domenica",
}
_GIORNI_ORDER = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]


def _card(titolo, sottotitolo, orario, luogo, bg, extra_line="", conflict=False):
    conflict_note = (
        "<div style='color:#FFD700;font-size:0.78em;font-weight:600;margin-top:3px'>"
        "⚠️ Attenzione: orario in fase di definizione</div>"
    ) if conflict else ""
    st.markdown(
        f"<div style='background:{bg};border-radius:12px;padding:12px 16px;"
        f"margin:5px 0;box-shadow:0 2px 10px rgba(0,0,0,0.20)'>"
        f"<div style='display:flex;justify-content:space-between;align-items:center'>"
        f"<span style='color:white;font-weight:800;font-size:1.05em'>{titolo}</span>"
        f"<span style='color:rgba(255,255,255,0.95);font-weight:700'>⏰ {orario}</span>"
        f"</div>"
        f"<div style='color:rgba(255,255,255,0.8);font-size:0.87em;margin-top:5px'>"
        f"{sottotitolo}"
        f"</div>"
        f"{'<div style=color:rgba(255,255,255,0.75);font-size:0.85em;margin-top:3px>' + extra_line + '</div>' if extra_line else ''}"
        f"{conflict_note}"
        f"</div>",
        unsafe_allow_html=True,
    )


def render():
    squadra = st.session_state.get("squadra_pubblica", "")

    if st.button("🔄 Aggiorna", key="vs_refresh"):
        carica_tutti_i_dati.clear()
        leggi_foglio.clear()
        st.rerun()

    color = get_team_color(squadra)

    # ── Header ─────────────────────────────────────────────────────────
    st.markdown(
        f"<div style='background:linear-gradient(135deg,{color},{color}cc);"
        f"border-radius:14px;padding:20px 28px;margin-bottom:24px;"
        f"box-shadow:0 4px 16px rgba(0,0,0,0.25)'>"
        f"<div style='color:white;font-size:1.8em;font-weight:900;letter-spacing:0.5px'>"
        f"🏀 {squadra}</div>"
        f"<div style='color:rgba(255,255,255,0.8);font-size:0.95em;margin-top:4px'>"
        f"Oderzo Basket — Programma della stagione</div>"
        f"</div>",
        unsafe_allow_html=True,
    )

    dati         = carica_tutti_i_dati()
    orario_fisso = dati.get("Orario Fisso",          __import__("pandas").DataFrame())
    calendario   = dati.get("Calendario Definitivo", __import__("pandas").DataFrame())
    oggi         = datetime.today().date()

    tab1, tab2 = st.tabs(["📅 Allenamenti", "🏆 Partite"])

    # ═══════════════ TAB 1 — ALLENAMENTI FISSI ══════════════════════════
    with tab1:
        st.markdown(
            "<div style='background:#1a3a5c;color:white;padding:8px 16px;"
            "border-radius:8px;margin:0 0 16px 0;font-weight:700'>📅 Orario allenamenti settimanale</div>",
            unsafe_allow_html=True,
        )

        if orario_fisso.empty or "squadra" not in orario_fisso.columns:
            st.info("Nessun allenamento configurato.")
        else:
            df_sq = orario_fisso[
                orario_fisso["squadra"].str.strip().str.lower() == squadra.lower()
            ]
            if df_sq.empty:
                st.info("Nessun allenamento configurato per questa squadra.")
            else:
                trovato = False
                for g in _GIORNI_ORDER:
                    gruppo = df_sq[df_sq["giorno"].str.lower().str.strip() == g]
                    if gruppo.empty:
                        continue
                    trovato = True
                    st.markdown(
                        f"<div style='background:#1a3a5c;color:white;padding:6px 14px;"
                        f"border-radius:8px;margin:14px 0 6px 0;font-weight:700'>"
                        f"📅 {_GIORNO_LABEL[g]}</div>",
                        unsafe_allow_html=True,
                    )
                    for _, ev in gruppo.iterrows():
                        oi  = str(ev.get("ora_inizio", "")).strip()
                        of  = str(ev.get("ora_fine",   "")).strip()
                        pal = str(ev.get("palestra",   "")).strip().capitalize()
                        cond = str(ev.get("condivisione", ev.get("tipo", ""))).strip().upper() == "SI"
                        bg   = "#1a6b50" if cond else color
                        extra = "🤝 Condivisione palestra" if cond else ""
                        _card(
                            titolo=f"🏀 Allenamento",
                            sottotitolo=f"🏟️ {pal}",
                            orario=f"{oi} → {of}" if oi else "—",
                            luogo=pal,
                            bg=bg,
                            extra_line=extra,
                        )
                if not trovato:
                    st.info("Nessun allenamento configurato per questa squadra.")

    # ═══════════════ TAB 2 — PARTITE ════════════════════════════════════
    with tab2:
        st.markdown(
            "<div style='background:#1a3a5c;color:white;padding:8px 16px;"
            "border-radius:8px;margin:0 0 16px 0;font-weight:700'>🏆 Calendario partite — stagione completa</div>",
            unsafe_allow_html=True,
        )

        if calendario.empty or "Squadra" not in calendario.columns:
            st.info("Nessuna partita inserita.")
        else:
            df_cal = calendario[
                calendario["Squadra"].str.strip().str.lower() == squadra.lower()
            ].copy()

            if df_cal.empty:
                st.info("Nessuna partita inserita per questa squadra.")
            else:
                # Parse date e ordina
                df_cal["_dt"] = df_cal["Data"].apply(parse_data)
                df_cal = df_cal[df_cal["_dt"].notna()].sort_values("_dt")

                # Raggruppa per settimana ISO
                per_sett = defaultdict(list)
                for _, ev in df_cal.iterrows():
                    iso = ev["_dt"].isocalendar()
                    per_sett[(iso[0], iso[1])].append(ev)

                if not per_sett:
                    st.info("Nessuna partita con data valida.")
                else:
                    for (iso_year, iso_week) in sorted(per_sett.keys()):
                        evs    = per_sett[(iso_year, iso_week)]
                        lun_s  = date.fromisocalendar(iso_year, iso_week, 1)
                        dom_s  = lun_s + timedelta(days=6)
                        is_curr = lun_s <= oggi <= dom_s
                        is_past = dom_s < oggi
                        n       = len(evs)

                        label_exp = (
                            f"{'📍 ' if is_curr else ''}{'🕘 ' if is_past else ''}"
                            f"{lun_s.strftime('%d/%m')} → {dom_s.strftime('%d/%m/%Y')}  "
                            f"({n} partita{'e' if n > 1 else ''})"
                        )

                        with st.expander(label_exp, expanded=is_curr):
                            for ev in sorted(evs, key=lambda x: (x["_dt"], str(x.get("Ora Inizio", "")))):
                                tipo_ev     = str(ev.get("Tipo", ""))
                                is_conflict = "CONFLITTO" in tipo_ev
                                is_casa     = "Casa" in tipo_ev
                                avversario  = str(ev.get("Avversario", "")).strip()
                                oi          = str(ev.get("Ora Inizio", "")).strip()
                                of          = str(ev.get("Ora Fine",   "")).strip()
                                luogo       = str(ev.get("Palestra" if is_casa else "Luogo",
                                                          ev.get("Luogo", ev.get("Palestra", "")))).strip()
                                data_ev     = ev["_dt"]
                                g_lbl       = _GIORNO_LABEL.get(GIORNI_SETTIMANA.get(data_ev.weekday(), ""), "")

                                if is_conflict:
                                    bg_card = "#8B0000"
                                elif is_casa:
                                    bg_card = "#0D3B6E"
                                else:
                                    bg_card = "#4A235A"

                                emoji      = "🏠" if is_casa else "🚌"
                                tipo_label = "In casa" if is_casa else "Trasferta"
                                sottotit   = f"📅 {g_lbl} {data_ev.strftime('%d/%m/%Y')} &nbsp;·&nbsp; {emoji} {tipo_label}"
                                if luogo:
                                    sottotit += f" &nbsp;·&nbsp; 🏟️ {luogo}"

                                _card(
                                    titolo=f"⚔️ vs {avversario}" if avversario else "Partita",
                                    sottotitolo=sottotit,
                                    orario=f"{oi} → {of}" if oi else "—",
                                    luogo=luogo,
                                    bg=bg_card,
                                    conflict=is_conflict,
                                )
