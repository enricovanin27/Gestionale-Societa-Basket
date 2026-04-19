"""
📋 Gestione Calendario FIP
Stati: provvisoria → confermata (appare nel calendario) / da_spostare (conflitti o fuori DOA)
"""

import streamlit as st
import pandas as pd
from datetime import date, datetime, timedelta

from database import (
    leggi_calendario,
    leggi_doa,
    invalida_cache,
    aggiorna_stato_partita,
    aggiorna_evento,
    cancella_partite_fip,
    carica_tutti_i_dati_db,
)
from logic import (
    motivo_fuori_doa,
    partita_in_doa,
    calcola_slot,
    slot_liberi_per_giornata,
    parse_data,
    GIORNI_SETTIMANA,
)

_STATI_BADGE = {
    "provvisoria": ("🕐", "#5d6d7e", "Provvisoria"),
    "confermata":  ("✅", "#1e8449", "Confermata"),
    "da_spostare": ("⚠️", "#c0392b", "Da spostare"),
}
_STATI_ORDINE = ["da_spostare", "provvisoria", "confermata"]


def _badge(stato: str) -> str:
    emoji, color, label = _STATI_BADGE.get(stato, ("❓", "#555", stato))
    return (
        f"<span style='background:{color};color:white;font-size:0.75em;"
        f"font-weight:700;padding:2px 8px;border-radius:10px'>{emoji} {label}</span>"
    )


def _stagione_corrente() -> str:
    oggi = date.today()
    return f"{oggi.year}-{oggi.year+1}" if oggi.month >= 9 else f"{oggi.year-1}-{oggi.year}"


def _giorno_da_data(data_str: str) -> str:
    try:
        return GIORNI_SETTIMANA[date.fromisoformat(data_str).weekday()]
    except Exception:
        return ""


def _messaggio_whatsapp(squadra: str, avversario: str, data_fmt: str,
                         giorno: str, ora: str, casa_fuori: str,
                         note_db: str, doa_list: list) -> str:
    """Genera testo pronto da incollare su WhatsApp per chiedere uno spostamento."""
    problema = note_db if note_db and note_db not in ("None", "") else ""
    if not problema and doa_list:
        problema = motivo_fuori_doa(giorno, ora, doa_list)

    if "casa" in casa_fuori.lower():
        intestazione = f"la partita *{squadra} - {avversario}* del *{giorno.capitalize()} {data_fmt} alle {ora}*"
        contesto = "ospitarvi in quell'orario non rientra nelle nostre disponibilità concordate (DOA)"
    else:
        intestazione = f"la partita *{avversario} - {squadra}* del *{giorno.capitalize()} {data_fmt} alle {ora}*"
        contesto = "quell'orario non rientra nelle nostre disponibilità (DOA)"

    if problema:
        contesto = f"{contesto}: _{problema}_"

    # Formatta le DOA come fasce leggibili
    fasce_doa = ""
    if doa_list:
        fasce_doa = "\nLe nostre disponibilità: " + ", ".join(
            f"{d['giorno'].capitalize()} {d['ora_inizio']}–{d['ora_fine']}"
            for d in doa_list
        )

    return (
        f"Buongiorno, sono [nome] di Oderzo Basket 🏀\n\n"
        f"In riferimento a {intestazione}, {contesto}.{fasce_doa}\n\n"
        f"Sareste disponibili a concordare un orario diverso?\n"
        f"Grazie mille per la collaborazione! 🙏\n"
        f"Oderzo Basket"
    )


def _render_slot_liberi(row_id: int, data_str: str, palestra: str,
                         doa_list: list, orario_fisso) -> None:
    """Mostra le finestre orarie libere nelle prossime 5 settimane e permette di selezionarne una."""
    try:
        data_base = datetime.strptime(data_str, "%Y-%m-%d") if "-" in data_str \
                    else datetime.strptime(data_str, "%d/%m/%Y")
    except Exception:
        data_base = datetime.today()

    # Raccogli slot liberi per i prossimi 35 giorni
    tutti_slot = []
    for delta in range(0, 36):
        data_prova = data_base + timedelta(days=delta)
        slot_giorno = slot_liberi_per_giornata(data_prova, palestra, orario_fisso, doa_list)
        tutti_slot.extend(slot_giorno)

    if not tutti_slot:
        st.info("Nessuno slot libero trovato nelle prossime 5 settimane (verifica le DOA).")
        return

    # Mostra solo i 5 slot liberi più vicini
    slot_key = f"slot_sel_{row_id}"
    sel_slot = st.session_state.get(slot_key)

    if sel_slot:
        st.success(f"✅ Slot selezionato: **{sel_slot['data']}** — ora inizio proposta: **{sel_slot['ora']}**")
        st.caption("Modifica l'ora sotto se vuoi, poi clicca 💾 Salva.")
    else:
        st.markdown("**📅 Prossimi slot liberi — scegli uno:**")
        for slot in tutti_slot[:5]:
            giorno_cap = slot["giorno"].capitalize()
            label = f"{giorno_cap} {slot['data_fmt']} &nbsp; 🟢 {slot['ora_inizio']}–{slot['ora_fine']}"
            col_lbl, col_btn = st.columns([4, 1])
            col_lbl.markdown(label, unsafe_allow_html=True)
            _slot_key_btn = f"usa_{row_id}_{slot['data']}_{slot['ora_inizio'].replace(':','')}"
            if col_btn.button("Usa ▶", key=_slot_key_btn, use_container_width=True):
                st.session_state[slot_key] = {
                    "data": slot["data_fmt"],
                    "ora":  slot["ora_inizio"],
                }
                # Pre-imposta anche i campi text_input
                st.session_state[f"mod_data_{row_id}"] = slot["data_fmt"]
                st.session_state[f"mod_ora_{row_id}"]  = slot["ora_inizio"]
                st.rerun()


def _render_card(row_id: int, row: pd.Series, doa_list: list,
                 df_squadre: pd.DataFrame, orario_fisso):
    stato      = str(row.get("stato", "provvisoria"))
    squadra    = str(row.get("Squadra", ""))
    avversario = str(row.get("Avversario", ""))
    data_str   = str(row.get("Data", ""))
    ora        = str(row.get("Ora Inizio", ""))[:5]
    casa_fuori = str(row.get("Casa/Fuori", ""))
    note_db    = str(row.get("note", ""))

    try:
        data_fmt = date.fromisoformat(data_str).strftime("%d/%m/%Y")
        giorno   = _giorno_da_data(data_str).capitalize()
    except Exception:
        data_fmt = data_str
        giorno   = ""

    is_casa = "casa" in casa_fuori.lower()
    cf_badge = (
        "<span style='background:#1a5276;color:white;font-size:0.75em;"
        "font-weight:700;padding:2px 8px;border-radius:10px'>🏠 IN CASA</span>"
        if is_casa else
        "<span style='background:#4a235a;color:white;font-size:0.75em;"
        "font-weight:700;padding:2px 8px;border-radius:10px'>🚌 FUORI CASA</span>"
    )
    header = (
        f"{_badge(stato)} &nbsp; {cf_badge} &nbsp; "
        f"**{squadra}** vs {avversario} "
        f"&nbsp;·&nbsp; {giorno} {data_fmt} ore {ora}"
    )

    with st.container(border=True):
        st.markdown(header, unsafe_allow_html=True)

        # Avviso conflitto / DOA
        ha_problema = (
            (note_db and note_db not in ("None", "")) or
            (doa_list and not partita_in_doa(giorno.lower(), ora, doa_list))
        )
        if ha_problema and stato != "confermata":
            motivo_vis = note_db if note_db and note_db not in ("None", "") else ""
            if not motivo_vis and doa_list:
                motivo_vis = motivo_fuori_doa(giorno.lower(), ora, doa_list)
            if motivo_vis:
                st.markdown(
                    f"<div style='background:#4d1010;border-radius:6px;padding:6px 10px;"
                    f"margin:4px 0;font-size:0.85em;color:#f5b7b1'>⚠️ {motivo_vis}</div>",
                    unsafe_allow_html=True,
                )

        # ── Azioni ────────────────────────────────────────────────────────────
        if stato in ("provvisoria", "da_spostare"):
            col_conf, col_edit, col_wa = st.columns([1, 1, 1])

            # Conferma
            with col_conf:
                if st.button("✅ Conferma", key=f"conf_{row_id}", use_container_width=True):
                    if aggiorna_stato_partita(row_id, "confermata"):
                        invalida_cache()
                        st.rerun()
                    else:
                        st.error("Errore nel salvataggio.")

            # Modifica data/ora
            with col_edit:
                if st.button("✏️ Modifica", key=f"mod_btn_{row_id}", use_container_width=True):
                    key_toggle = f"show_mod_{row_id}"
                    st.session_state[key_toggle] = not st.session_state.get(key_toggle, False)

            # Messaggio WhatsApp (solo se c'è un problema)
            with col_wa:
                if ha_problema:
                    if st.button("💬 WhatsApp", key=f"wa_btn_{row_id}", use_container_width=True):
                        key_wa = f"show_wa_{row_id}"
                        st.session_state[key_wa] = not st.session_state.get(key_wa, False)

            # Panel modifica data/ora
            if st.session_state.get(f"show_mod_{row_id}", False):
                with st.container():
                    palestra = str(row.get("Palestra", ""))
                    if is_casa:
                        st.markdown("**Quando è libero il palasport:**")
                        _render_slot_liberi(row_id, data_str, palestra, doa_list, orario_fisso)
                        st.markdown("**Oppure inserisci manualmente:**")
                    else:
                        st.info("Partita fuori casa — scegli una data che rientra nelle DOA di Oderzo.")
                    slot_sel = st.session_state.get(f"slot_sel_{row_id}", {})
                    c1, c2 = st.columns(2)
                    with c1:
                        nuova_data = st.text_input(
                            "Data (GG/MM/AAAA)",
                            value=slot_sel.get("data", data_fmt),
                            key=f"mod_data_{row_id}",
                        )
                    with c2:
                        nuova_ora = st.text_input(
                            "Ora partita",
                            value=slot_sel.get("ora", ora),
                            key=f"mod_ora_{row_id}",
                        )
                    if st.button("💾 Salva", key=f"mod_save_{row_id}"):
                        try:
                            d_obj = datetime.strptime(nuova_data.strip(), "%d/%m/%Y")
                            data_iso   = d_obj.strftime("%Y-%m-%d")
                            giorno_new = GIORNI_SETTIMANA[d_obj.weekday()]

                            # Ricalcola ora_fine con parametri squadra (default 30+105)
                            minuti_risc, durata = 30, 105
                            if not df_squadre.empty:
                                riga_sq = df_squadre[df_squadre["Categoria"] == squadra]
                                if not riga_sq.empty:
                                    try:
                                        minuti_risc = int(riga_sq.iloc[0]["Minuti Riscaldamento"])
                                        durata      = int(riga_sq.iloc[0]["Durata Partita"])
                                    except Exception:
                                        pass
                            _, ora_fine_new = calcola_slot(nuova_ora.strip(), minuti_risc, durata)

                            ok = aggiorna_evento("calendario", row_id, {
                                "data":       data_iso,
                                "giorno":     giorno_new,
                                "ora_inizio": nuova_ora.strip(),
                                "ora_fine":   ora_fine_new,
                            })
                            if ok:
                                st.success("✅ Aggiornato.")
                                st.session_state.pop(f"show_mod_{row_id}", None)
                                invalida_cache()
                                st.rerun()
                            else:
                                st.error("Errore nel salvataggio.")
                        except ValueError:
                            st.error("Formato data non valido. Usa GG/MM/AAAA.")

            # Panel messaggio WhatsApp
            if ha_problema and st.session_state.get(f"show_wa_{row_id}", False):
                msg = _messaggio_whatsapp(
                    squadra, avversario, data_fmt, giorno.lower(),
                    ora, casa_fuori, note_db, doa_list,
                )
                st.text_area(
                    "Copia e incolla su WhatsApp:",
                    value=msg,
                    height=200,
                    key=f"wa_text_{row_id}",
                )

        else:
            # Partita confermata: solo pulsante per annullare conferma
            if st.button("↩️ Annulla conferma", key=f"rev_{row_id}"):
                if aggiorna_stato_partita(row_id, "provvisoria"):
                    invalida_cache()
                    st.rerun()


def render():
    ruolo = st.session_state.get("ruolo", "genitore")
    if ruolo == "genitore":
        st.warning("Accesso non autorizzato.")
        return

    st.markdown("## 📋 Gestione Calendario FIP")

    col_ref, col_pulisci, _ = st.columns([1, 1, 4])
    with col_ref:
        if st.button("🔄 Aggiorna"):
            invalida_cache()
            st.rerun()
    with col_pulisci:
        if st.button("🗑️ Pulisci tutto", type="secondary"):
            st.session_state["gcf_confirm_pulisci"] = True

    if st.session_state.get("gcf_confirm_pulisci"):
        st.warning("⚠️ Stai per cancellare **tutte le partite FIP**. Questa operazione è irreversibile.")
        cc1, cc2, _ = st.columns([1, 1, 4])
        with cc1:
            if st.button("✅ Conferma cancellazione", type="primary"):
                n = cancella_partite_fip()
                invalida_cache()
                st.session_state.pop("gcf_confirm_pulisci", None)
                if n >= 0:
                    st.success(f"✅ Cancellate {n} partite FIP.")
                else:
                    st.error("Errore durante la cancellazione.")
                st.rerun()
        with cc2:
            if st.button("❌ Annulla"):
                st.session_state.pop("gcf_confirm_pulisci", None)
                st.rerun()

    # ── Carica dati ───────────────────────────────────────────────────────────
    df_cal = leggi_calendario()
    dati         = carica_tutti_i_dati_db()
    df_squadre   = dati.get("Squadre",      pd.DataFrame())
    orario_fisso = dati.get("Orario Fisso", pd.DataFrame())

    if df_cal.empty:
        st.info("Nessun dato. Importa le partite dalla sezione 📥 Importa PDF.")
        return

    mask_fip = df_cal["tipo_import"].isin(["provvisorio", "definitivo"])
    df_fip = df_cal[mask_fip].copy()

    if df_fip.empty:
        st.info("Nessuna partita FIP importata. Usa 📥 Importa PDF per caricare il calendario.")
        return

    # Normalizza stati sconosciuti (in_attesa/definitiva → provvisoria)
    df_fip["stato"] = df_fip["stato"].apply(
        lambda s: s if s in _STATI_BADGE else "provvisoria"
    )

    # ── Contatori ─────────────────────────────────────────────────────────────
    contatori = df_fip["stato"].value_counts().to_dict()
    c1, c2, c3 = st.columns(3)
    for col, stato_key in zip([c1, c2, c3], _STATI_ORDINE):
        n = contatori.get(stato_key, 0)
        emoji, color, label = _STATI_BADGE[stato_key]
        col.markdown(
            f"<div style='text-align:center;background:{color}22;border:1px solid {color}55;"
            f"border-radius:8px;padding:8px 4px'>"
            f"<div style='font-size:1.4em'>{emoji}</div>"
            f"<div style='font-weight:700;font-size:1.3em'>{n}</div>"
            f"<div style='font-size:0.75em;color:#aaa'>{label}</div>"
            f"</div>",
            unsafe_allow_html=True,
        )

    st.markdown("---")

    # ── Filtro squadra ────────────────────────────────────────────────────────
    squadre_lista = sorted(df_fip["Squadra"].dropna().unique().tolist())
    sq_sel = st.multiselect("Squadra", squadre_lista, key="gcf_sq", placeholder="Tutte")
    df_vis = df_fip[df_fip["Squadra"].isin(sq_sel)] if sq_sel else df_fip.copy()

    if df_vis.empty:
        st.info("Nessuna partita corrisponde ai filtri.")
        return

    # Ordina per data
    df_vis = df_vis.copy()
    df_vis["_ord_dt"] = pd.to_datetime(df_vis["Data"], errors="coerce")
    df_vis = df_vis.sort_values("_ord_dt", na_position="last").drop(columns=["_ord_dt"])

    # ── Cache DOA per squadra ─────────────────────────────────────────────────
    _doa_cache: dict = {}

    # ── Render per gruppo stato ───────────────────────────────────────────────
    for stato_gruppo in _STATI_ORDINE:
        gruppo = df_vis[df_vis["stato"] == stato_gruppo]
        if gruppo.empty:
            continue

        emoji_g, color_g, label_g = _STATI_BADGE[stato_gruppo]
        st.markdown(
            f"<h4 style='color:{color_g};margin-top:20px'>{emoji_g} {label_g} ({len(gruppo)})</h4>",
            unsafe_allow_html=True,
        )

        for row_id, row in gruppo.iterrows():
            squadra = str(row.get("Squadra", ""))
            if squadra not in _doa_cache:
                doa_df = leggi_doa(categoria=squadra, stagione=_stagione_corrente())
                _doa_cache[squadra] = doa_df.to_dict("records") if not doa_df.empty else []

            _render_card(row_id, row, _doa_cache[squadra], df_squadre, orario_fisso)
