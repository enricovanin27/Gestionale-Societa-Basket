import streamlit as st
import pandas as pd
from datetime import datetime, timedelta, date
from collections import defaultdict
from logic import GIORNI_SETTIMANA, parse_data, _norm
from database import carica_tutti_i_dati_db, invalida_cache, leggi_orario_settimana
# LEGACY: from sheets import carica_tutti_i_dati, leggi_foglio
from views._components import get_team_color
from views.home import _render_oggi


_GIORNO_LABEL = {
    "lunedi":    "Lunedì",   "martedi":  "Martedì",  "mercoledi": "Mercoledì",
    "giovedi":   "Giovedì",  "venerdi":  "Venerdì",  "sabato":    "Sabato",
    "domenica":  "Domenica",
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _card_evento(tipo, squadra, ora_inizio, ora_fine, luogo, is_conflict=False,
                 is_allenamento=False, avversario=""):
    if is_conflict:
        bg = "#8B0000"
    elif is_allenamento:
        bg = get_team_color(squadra)
    elif "Casa" in tipo:
        bg = "#0D3B6E"
    else:
        bg = "#4A235A"

    orario = f"{ora_inizio} → {ora_fine}" if ora_inizio else "—"
    if is_allenamento:
        emoji = "🏀"
        tipo_label = "Allenamento"
    elif "Casa" in tipo:
        emoji = "🏠"
        tipo_label = "Casa"
    else:
        emoji = "🚌"
        tipo_label = "Trasferta"

    avv_line = (
        f"<div style='color:rgba(255,255,255,0.9);font-size:0.88em;margin-top:3px'>"
        f"⚔️ vs <strong>{avversario}</strong></div>"
    ) if avversario and not is_allenamento else ""

    conflict_note = (
        "<div style='color:#FFD700;font-size:0.78em;font-weight:600;margin-top:3px'>"
        "⚠️ CONFLITTO — vai al Calendario Partite per risolvere</div>"
    ) if is_conflict else ""

    st.markdown(
        f"<div style='background:{bg};border-radius:10px;padding:10px 15px;"
        f"margin:4px 0;box-shadow:0 2px 8px rgba(0,0,0,0.22)'>"
        f"<div style='display:flex;justify-content:space-between;align-items:center'>"
        f"<span style='color:white;font-weight:800;font-size:1.0em'>"
        f"{emoji} {squadra}"
        f"<span style='font-weight:400;font-size:0.82em;color:rgba(255,255,255,0.75)'> · {tipo_label}</span>"
        f"</span>"
        f"<span style='color:rgba(255,255,255,0.95);font-weight:700;font-size:0.9em'>⏰ {orario}</span>"
        f"</div>"
        f"<div style='color:rgba(255,255,255,0.82);font-size:0.85em;margin-top:4px'>"
        f"🏟️ {luogo or '—'}"
        f"</div>"
        f"{avv_line}"
        f"{conflict_note}"
        f"</div>",
        unsafe_allow_html=True,
    )


def _intestazione_giorno(data_ev, oggi):
    g_lbl = _GIORNO_LABEL.get(GIORNI_SETTIMANA.get(data_ev.weekday(), ""), "")
    prefisso = ""
    if data_ev == oggi:
        prefisso = "🔴 OGGI — "
    elif data_ev == oggi + timedelta(days=1):
        prefisso = "🟡 DOMANI — "
    st.markdown(
        f"<div style='background:#1a3a5c;color:white;padding:8px 16px;"
        f"border-radius:8px;margin:16px 0 8px 0;font-weight:700;font-size:1.05em'>"
        f"📅 {prefisso}{g_lbl} {data_ev.strftime('%d/%m/%Y')}</div>",
        unsafe_allow_html=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main render
# ─────────────────────────────────────────────────────────────────────────────

def render():
    st.markdown(
        "<div style='background:linear-gradient(135deg,#1a3a5c,#2d6a9f);color:white;"
        "padding:18px 24px;border-radius:12px;margin-bottom:20px'>"
        "<h2 style='margin:0;color:white'>👤 Vista Allenatore</h2>"
        "<p style='margin:4px 0 0 0;opacity:0.85;font-size:0.95em'>"
        "Calendario personale, allenamenti e partite della stagione</p>"
        "</div>",
        unsafe_allow_html=True,
    )

    if st.button("🔄 Aggiorna dati", key="refresh_vista_allenatore"):
        invalida_cache()
        st.rerun()

    dati          = carica_tutti_i_dati_db()
    df_allenatori = dati["Allenatori"]
    if df_allenatori.empty:
        st.warning("⚠️ Nessun allenatore configurato.")
        return

    nomi = [
        f"{r['Nome']} {r['Cognome']}".strip()
        for _, r in df_allenatori.iterrows()
        if r.get("Nome") and r.get("Cognome")
    ]
    nomi.insert(0, "— Seleziona il tuo nome —")

    try:
        saved = st.query_params.get("allenatore", "")
    except Exception:
        saved = ""
    default_idx = nomi.index(saved) if saved in nomi else 0

    allenatore_sel = st.selectbox("👤 Chi sei?", nomi, index=default_idx, key="va_nome")

    if allenatore_sel == "— Seleziona il tuo nome —":
        st.info("👆 Seleziona il tuo nome per vedere il tuo calendario personale.")
        return

    try:
        st.query_params["allenatore"] = allenatore_sel
    except Exception:
        pass

    riga_all = df_allenatori[
        (df_allenatori["Nome"] + " " + df_allenatori["Cognome"]).str.strip() == allenatore_sel
    ]
    if riga_all.empty:
        st.error("Allenatore non trovato.")
        return

    cognome_all          = str(riga_all.iloc[0].get("Cognome",  "")).strip()
    squadre_seguite      = [s.strip() for s in str(riga_all.iloc[0].get("Squadre", "")).split(",") if s.strip()]
    squadre_seguite_low  = [s.lower() for s in squadre_seguite]

    orario_fisso = dati["Orario Fisso"]
    calendario   = dati["Calendario Definitivo"]
    oggi         = datetime.today().date()

    # ── Card profilo ────────────────────────────────────────────────────
    badges_html = "".join(
        f"<span style='background:{get_team_color(sq)};color:white;font-weight:700;"
        f"font-size:0.88em;padding:4px 14px;border-radius:20px;margin:3px 4px 3px 0;"
        f"display:inline-block'>🏀 {sq}</span>"
        for sq in squadre_seguite
    ) or "<span style='color:rgba(255,255,255,0.65)'>Nessuna squadra associata</span>"

    st.markdown(
        f"<div style='background:linear-gradient(135deg,#1a3a5c,#2d6a9f);border-radius:12px;"
        f"padding:16px 20px;margin:0 0 20px 0;box-shadow:0 2px 10px rgba(0,0,0,0.25)'>"
        f"<div style='color:white;font-size:1.25em;font-weight:800;margin-bottom:10px'>"
        f"👋 Ciao, {allenatore_sel}!</div>"
        f"<div style='margin-top:4px'>"
        f"<span style='color:rgba(255,255,255,0.7);font-size:0.85em'>Squadre seguite:</span><br>"
        f"<div style='margin-top:6px'>{badges_html}</div>"
        f"</div></div>",
        unsafe_allow_html=True,
    )

    # ── Sezione OGGI ────────────────────────────────────────────────────
    st.markdown("### 📍 Oggi")
    orario_settimana_oggi_va = leggi_orario_settimana(
        data_inizio=oggi.strftime("%Y-%m-%d"),
        data_fine=oggi.strftime("%Y-%m-%d"),
    )
    _render_oggi(
        orario_fisso, calendario, oggi,
        orario_settimana=orario_settimana_oggi_va,
        squadre_filter={s.lower() for s in squadre_seguite},
    )
    st.markdown("---")

    # ── Tabs ────────────────────────────────────────────────────────────
    tab1, tab2 = st.tabs(["📅 Settimana corrente", "📋 Calendario partite"])

    # ═══════════════ TAB 1 — SETTIMANA CORRENTE ═══════════════════════════
    with tab1:
        lun = oggi - timedelta(days=oggi.weekday())
        dom = lun + timedelta(days=6)

        st.markdown(
            f"<div style='background:#1a3a5c;color:white;padding:8px 16px;"
            f"border-radius:8px;margin:0 0 14px 0;font-weight:700;font-size:1.0em'>"
            f"📅 Settimana {lun.strftime('%d/%m')} → {dom.strftime('%d/%m/%Y')}"
            f"</div>",
            unsafe_allow_html=True,
        )

        filtro_sq1 = st.selectbox("🏀 Filtra squadra", ["Tutte"] + squadre_seguite, key="va_t1_sq")

        eventi_sett = []

        # Allenamenti fissi
        if not orario_fisso.empty and cognome_all:
            for _, ev in orario_fisso.iterrows():
                all_ev = [a.strip() for a in str(ev.get("allenatori", "")).split("-")]
                if cognome_all not in all_ev:
                    continue
                giorno_ev = str(ev.get("giorno", "")).lower().strip()
                for i in range(7):
                    d = lun + timedelta(days=i)
                    if GIORNI_SETTIMANA[d.weekday()] == giorno_ev:
                        eventi_sett.append({
                            "data": d, "tipo": "Allenamento",
                            "squadra":    str(ev.get("squadra",   "")).strip(),
                            "ora_inizio": str(ev.get("ora_inizio","")).strip(),
                            "ora_fine":   str(ev.get("ora_fine",  "")).strip(),
                            "luogo":      str(ev.get("palestra",  "")).strip(),
                            "is_conflict": False, "is_allenamento": True,
                        })

        # Partite in casa
        if not calendario.empty:
            for _, ev in calendario.iterrows():
                sq_ev   = str(ev.get("Squadra", "")).strip()
                if sq_ev.lower() not in squadre_seguite_low:
                    continue
                data_ev = parse_data(ev.get("Data", ""))
                if data_ev is None or not (lun <= data_ev <= dom):
                    continue
                tipo_ev     = str(ev.get("Tipo", ""))
                is_conflict = "CONFLITTO" in tipo_ev
                if "Casa" not in tipo_ev and not is_conflict:
                    continue
                eventi_sett.append({
                    "data": data_ev, "tipo": tipo_ev,
                    "squadra":    sq_ev,
                    "ora_inizio": str(ev.get("Ora Inizio", "")).strip(),
                    "ora_fine":   str(ev.get("Ora Fine",   "")).strip(),
                    "luogo":      str(ev.get("Palestra",   "")).strip(),
                    "is_conflict": is_conflict, "is_allenamento": False,
                })

        # Filtro + sort
        if filtro_sq1 != "Tutte":
            eventi_vis = [e for e in eventi_sett if e["squadra"].lower() == filtro_sq1.lower()]
        else:
            eventi_vis = list(eventi_sett)
        eventi_vis.sort(key=lambda x: (x["data"], x["ora_inizio"]))

        if not eventi_vis:
            st.info("Nessun evento questa settimana per i filtri selezionati.")
        else:
            data_prec = None
            for e in eventi_vis:
                if e["data"] != data_prec:
                    data_prec = e["data"]
                    _intestazione_giorno(e["data"], oggi)
                _card_evento(
                    tipo=e["tipo"], squadra=e["squadra"],
                    ora_inizio=e["ora_inizio"], ora_fine=e["ora_fine"],
                    luogo=e["luogo"], is_conflict=e["is_conflict"],
                    is_allenamento=e["is_allenamento"],
                )

        # ── WhatsApp ──
        st.markdown("---")
        st.markdown(
            "<div style='background:#1a3a5c;color:white;padding:8px 16px;"
            "border-radius:8px;margin:0 0 14px 0;font-weight:700;font-size:1.0em'>"
            "📱 Condividi su WhatsApp</div>",
            unsafe_allow_html=True,
        )

        if not squadre_seguite:
            st.info("Nessuna squadra associata a questo allenatore.")
        else:
            sq_wa = st.selectbox(
                "A chi vuoi mandare il messaggio?",
                options=squadre_seguite,
                key="va_wa_sq",
            )

            ev_wa = sorted(
                [e for e in eventi_sett if e["squadra"].lower() == sq_wa.lower()],
                key=lambda x: (x["data"], x["ora_inizio"]),
            )

            righe = [
                f"🏀 *ODERZO BASKET — {sq_wa}*",
                f"📅 {lun.strftime('%d/%m')} → {dom.strftime('%d/%m/%Y')}",
                "",
                "*Programma settimanale:*",
                "━━━━━━━━━━━━━━━━━━━━━━━━",
            ]
            if not ev_wa:
                righe.append("Nessun evento questa settimana.")
            else:
                data_prec_wa = None
                for e in ev_wa:
                    if e["data"] != data_prec_wa:
                        data_prec_wa = e["data"]
                        g_lbl_wa = _GIORNO_LABEL.get(
                            GIORNI_SETTIMANA.get(e["data"].weekday(), ""), ""
                        ).upper()
                        righe.append(f"\n📆 *{g_lbl_wa} {e['data'].strftime('%d/%m')}*")
                    if e["is_allenamento"]:
                        ora_wa = f"{e['ora_inizio']}–{e['ora_fine']}" if e["ora_inizio"] else ""
                        righe.append(f"  🏀 Allenamento | {ora_wa} @ {e['luogo']}")
                    else:
                        tipo_wa = "Partita in casa" if "Casa" in e["tipo"] else "Partita (conflitto)"
                        ora_wa  = f"{e['ora_inizio']}–{e['ora_fine']}" if e["ora_inizio"] else ""
                        righe.append(f"  🏠 {tipo_wa} | {ora_wa} @ {e['luogo']}")
            righe += ["", "━━━━━━━━━━━━━━━━━━━━━━━━", "_Oderzo Basket App_"]
            testo_wa = "\n".join(righe)

            st.text_area("", testo_wa, height=260, label_visibility="collapsed", key="va_wa_text")
            st.download_button(
                "💾 Scarica .txt",
                data=testo_wa,
                file_name=f"programma_{sq_wa.replace(' ', '_')}.txt",
                mime="text/plain",
                key="va_wa_dl",
            )

    # ═══════════════ TAB 2 — CALENDARIO PARTITE ══════════════════════════
    with tab2:
        st.markdown(
            "<div style='background:#1a3a5c;color:white;padding:8px 16px;"
            "border-radius:8px;margin:0 0 14px 0;font-weight:700;font-size:1.0em'>"
            "📋 Calendario partite — stagione completa</div>",
            unsafe_allow_html=True,
        )

        filtro_sq2 = st.selectbox("🏀 Filtra squadra", ["Tutte"] + squadre_seguite, key="va_t2_sq")

        # Raccoglie tutte le partite (casa + trasferta)
        partite = []
        if not calendario.empty:
            for _, ev in calendario.iterrows():
                sq_ev = str(ev.get("Squadra", "")).strip()
                if sq_ev.lower() not in squadre_seguite_low:
                    continue
                data_ev = parse_data(ev.get("Data", ""))
                if data_ev is None:
                    continue
                tipo_ev     = str(ev.get("Tipo", ""))
                is_conflict = "CONFLITTO" in tipo_ev
                is_casa     = "Casa" in tipo_ev
                luogo_ev    = str(ev.get("Palestra" if is_casa else "Luogo",
                                         ev.get("Luogo", ev.get("Palestra", "")))).strip()
                partite.append({
                    "data":        data_ev,
                    "tipo":        tipo_ev,
                    "squadra":     sq_ev,
                    "avversario":  str(ev.get("Avversario", "")).strip(),
                    "ora_inizio":  str(ev.get("Ora Inizio", "")).strip(),
                    "ora_fine":    str(ev.get("Ora Fine",   "")).strip(),
                    "luogo":       luogo_ev,
                    "is_conflict": is_conflict,
                })

        if filtro_sq2 != "Tutte":
            partite_vis = [e for e in partite if e["squadra"].lower() == filtro_sq2.lower()]
        else:
            partite_vis = list(partite)

        partite_vis.sort(key=lambda x: (x["data"], x["ora_inizio"]))

        if not partite_vis:
            st.info("Nessuna partita trovata per i filtri selezionati.")
        else:
            per_sett = defaultdict(list)
            for e in partite_vis:
                iso = e["data"].isocalendar()
                per_sett[(iso[0], iso[1])].append(e)

            for (iso_year, iso_week) in sorted(per_sett.keys()):
                evs     = per_sett[(iso_year, iso_week)]
                lun_s   = date.fromisocalendar(iso_year, iso_week, 1)
                dom_s   = lun_s + timedelta(days=6)
                is_curr = lun_s <= oggi <= dom_s
                n_conf  = sum(1 for e in evs if e["is_conflict"])
                n_casa  = sum(1 for e in evs if "Casa" in e["tipo"])
                n_trasf = len(evs) - n_casa

                label_exp = (
                    f"{'📍 ' if is_curr else ''}"
                    f"Sett. {iso_week} · {lun_s.strftime('%d/%m')} → {dom_s.strftime('%d/%m/%Y')}"
                    f"  🏠 {n_casa}  🚌 {n_trasf}"
                    f"{'  ⚠️ ' + str(n_conf) if n_conf else ''}"
                )

                with st.expander(label_exp, expanded=is_curr):
                    data_prec2 = None
                    for e in sorted(evs, key=lambda x: (x["data"], x["ora_inizio"])):
                        if e["data"] != data_prec2:
                            data_prec2 = e["data"]
                            g_lbl2 = _GIORNO_LABEL.get(GIORNI_SETTIMANA.get(e["data"].weekday(), ""), "")
                            st.markdown(
                                f"<div style='color:#2d6a9f;font-weight:700;font-size:0.95em;"
                                f"margin:10px 0 4px 0'>📅 {g_lbl2} {e['data'].strftime('%d/%m/%Y')}</div>",
                                unsafe_allow_html=True,
                            )
                        _card_evento(
                            tipo=e["tipo"], squadra=e["squadra"],
                            ora_inizio=e["ora_inizio"], ora_fine=e["ora_fine"],
                            luogo=e["luogo"], is_conflict=e["is_conflict"],
                            is_allenamento=False, avversario=e["avversario"],
                        )
