import streamlit as st
from datetime import datetime
from logic import GIORNI_SETTIMANA, calcola_slot, c_e_conflitto, estrai_partite_da_pdf, notifica_nuova_partita
from database import (
    leggi_squadre, leggi_orario_fisso, leggi_palestre, leggi_allenatori, leggi_calendario,
    carica_tutti_i_dati_db, invalida_cache, scrivi_evento,
)
# LEGACY: from sheets import leggi_foglio, scrivi_riga, carica_tutti_i_dati


def _render_riepilogo():
    """Sezione riepilogo gare importate nell'ultima sessione."""
    ril = st.session_state.get("import_riepilogo")
    if not ril:
        return

    st.markdown("---")
    st.markdown(
        f"<div style='background:linear-gradient(135deg,#0d3b6e,#1a5276);color:white;"
        f"padding:10px 18px;border-radius:10px;margin:8px 0 14px 0;font-weight:800'>"
        f"📋 Riepilogo gare importate — {ril['squadra']}</div>",
        unsafe_allow_html=True,
    )

    partite: list = ril.get("partite", [])
    if not partite:
        st.info("Nessuna partita nel riepilogo.")
        return

    col_f1, col_f2 = st.columns(2)
    with col_f1:
        stati_disponibili = sorted({p["stato"] for p in partite})
        filtro_stato = st.selectbox(
            "Filtra per stato",
            ["Tutti"] + stati_disponibili,
            key="_ril_stato",
        )
    with col_f2:
        cf_opts = sorted({p["casa_fuori"] for p in partite})
        filtro_cf = st.selectbox(
            "Filtra per Casa/Fuori",
            ["Tutti"] + cf_opts,
            key="_ril_cf",
        )

    filtrate = [
        p for p in partite
        if (filtro_stato == "Tutti" or p["stato"] == filtro_stato)
        and (filtro_cf == "Tutti" or p["casa_fuori"] == filtro_cf)
    ]

    if not filtrate:
        st.info("Nessuna partita corrisponde ai filtri.")
        return

    import pandas as _pd
    df_ril = _pd.DataFrame(filtrate)[[
        "nr_gara", "data", "ora", "casa_fuori", "avversario", "stato"
    ]].rename(columns={
        "nr_gara":   "Nr. Gara",
        "data":      "Data",
        "ora":       "Ora",
        "casa_fuori":"Casa/Fuori",
        "avversario":"Avversario",
        "stato":     "Stato",
    })

    st.dataframe(
        df_ril,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Nr. Gara":   st.column_config.TextColumn("Nr. Gara",   width="small"),
            "Data":       st.column_config.TextColumn("📅 Data",    width="small"),
            "Ora":        st.column_config.TextColumn("⏰ Ora",     width="small"),
            "Casa/Fuori": st.column_config.TextColumn("📍 C/F",     width="small"),
            "Avversario": st.column_config.TextColumn("⚔️ Avversario", width="large"),
            "Stato":      st.column_config.TextColumn("🔖 Stato",   width="medium"),
        },
    )
    st.caption(f"Totale: {len(filtrate)} gare mostrate su {len(partite)} importate.")

    if st.button("🗑️ Cancella riepilogo", key="_ril_clear"):
        del st.session_state["import_riepilogo"]
        st.rerun()


def render(as_tab: bool = False, dati: dict = None):
    if not as_tab:
        st.header("📄 Importa Calendario FIP")
    st.markdown("Carica il PDF del calendario provvisorio FIP per una squadra. L'app estrae automaticamente le partite di Oderzo.")

    if dati is not None:
        df_squadre  = dati.get("Squadre",  leggi_squadre())
        df_palestre = dati.get("Palestre", leggi_palestre())
    else:
        df_squadre  = leggi_squadre()
        df_palestre = leggi_palestre()
    squadre_lista  = df_squadre["Categoria"].tolist()  if not df_squadre.empty  else []
    palestre_lista = df_palestre["Nome"].tolist()       if not df_palestre.empty else []

    col1, col2 = st.columns(2)
    with col1:
        squadra_sel = st.selectbox("A quale squadra si riferisce questo calendario?", squadre_lista)
    with col2:
        nome_societa = st.text_input("Nome società da cercare nel PDF", value="Oderzo")

    pdf_file = st.file_uploader("Carica il PDF FIP", type=["pdf"])

    if pdf_file and st.button("🔍 Estrai partite", type="primary"):
        with st.spinner("Lettura PDF in corso..."):
            pdf_bytes = pdf_file.read()
            print(f"[DEBUG PDF] File: {pdf_file.name}, dimensione: {len(pdf_bytes)} bytes")

            import pdfplumber, io as _io
            testo_debug = ""
            try:
                with pdfplumber.open(_io.BytesIO(pdf_bytes)) as pdf_debug:
                    n_pag = len(pdf_debug.pages)
                    print(f"[DEBUG PDF] Pagine trovate: {n_pag}")
                    for i, pag in enumerate(pdf_debug.pages):
                        t = pag.extract_text() or ""
                        testo_debug += t + "\n"
                        print(f"[DEBUG PDF] Pagina {i+1}: {len(t)} caratteri estratti")
            except Exception as ex_pdf:
                print(f"[DEBUG PDF] Errore lettura PDF: {ex_pdf}")

            linee_debug = [l for l in testo_debug.split("\n") if l.strip()]
            print(f"[DEBUG PDF] Totale righe non vuote: {len(linee_debug)}")
            if linee_debug:
                print(f"[DEBUG PDF] Prime 5 righe: {linee_debug[:5]}")

            partite, errore = estrai_partite_da_pdf(pdf_bytes, nome_societa)
            print(f"[DEBUG PDF] estrai_partite_da_pdf → partite={len(partite) if partite else 0}, errore={errore!r}")

        if errore:
            st.error(f"❌ {errore}")
            with st.expander("🔍 Debug: prime righe estratte dal PDF"):
                for riga in linee_debug[:30]:
                    st.code(riga)
            return

        if not partite:
            st.warning("Nessuna partita trovata. Verifica il nome della società.")
            with st.expander("🔍 Debug: prime righe estratte dal PDF"):
                for riga in linee_debug[:30]:
                    st.code(riga)
            return

        st.success(f"✅ Trovate {len(partite)} partite!")
        st.session_state["partite_pdf"] = partite
        st.session_state["squadra_pdf"] = squadra_sel

    if "partite_pdf" not in st.session_state:
        return

    partite = st.session_state["partite_pdf"]
    squadra_sel = st.session_state.get("squadra_pdf", "")

    st.markdown("---")
    st.subheader("📋 Partite estratte — verifica e modifica")
    st.info("Controlla i dati estratti e correggi eventuali errori prima di importare.")

    partite_modificate = []

    for i, p in enumerate(partite):
        with st.expander(f"{'🏠' if p['casa_fuori'] == 'Casa' else '🚌'} {p['data_display']} — {p['ora']} — {p['casa_fuori']}"):
            col1, col2, col3 = st.columns(3)
            with col1:
                data_mod = st.text_input("Data (DD/MM/YYYY)", value=p["data_display"], key=f"pdf_data_{i}")
                ora_mod = st.text_input("Ora partita", value=p["ora"], key=f"pdf_ora_{i}")
            with col2:
                cf_mod = st.radio("Casa/Fuori", ["Casa", "Fuori"],
                                  index=0 if p["casa_fuori"] == "Casa" else 1,
                                  key=f"pdf_cf_{i}", horizontal=True)
                avv_mod = st.text_input("Avversario", value=p["avversario"], key=f"pdf_avv_{i}")
            with col3:
                # Partita in Casa → selectbox palestre; Fuori → testo libero
                if cf_mod == "Casa":
                    luogo_default_idx = 0
                    if p["luogo"] in palestre_lista:
                        luogo_default_idx = palestre_lista.index(p["luogo"])
                    luogo_mod = st.selectbox(
                        "Palestra (Casa)",
                        palestre_lista if palestre_lista else [p["luogo"]],
                        index=luogo_default_idx,
                        key=f"pdf_luogo_{i}",
                    )
                else:
                    luogo_mod = st.text_input(
                        "Luogo trasferta (estratto dal PDF)",
                        value=p["luogo"],
                        key=f"pdf_luogo_{i}",
                    )
                stato_mod = st.selectbox("Stato", ["Provvisorio", "Confermato", "Da spostare"],
                                         key=f"pdf_stato_{i}")

            try:
                data_obj = datetime.strptime(data_mod, "%d/%m/%Y")
                data_iso = data_obj.strftime("%Y-%m-%d")
                giorno_calc = GIORNI_SETTIMANA[data_obj.weekday()]
            except:
                data_iso = p["data"]
                giorno_calc = p["giorno"]

            partite_modificate.append({
                "nr_gara": p["nr_gara"],
                "data": data_iso,
                "data_display": data_mod,
                "giorno": giorno_calc,
                "ora": ora_mod,
                "casa_fuori": cf_mod,
                "avversario": avv_mod,
                "luogo": luogo_mod,
                "stato": stato_mod
            })

    st.markdown("---")

    riga_squadra = df_squadre[df_squadre["Categoria"] == squadra_sel]
    minuti_risc, durata = 30, 105
    if not riga_squadra.empty:
        try:
            minuti_risc = int(riga_squadra.iloc[0]["Minuti Riscaldamento"])
            durata = int(riga_squadra.iloc[0]["Durata Partita"])
        except:
            pass

    if st.button("✅ Importa tutte nel Calendario Definitivo", type="primary"):
        successi = 0
        errori = 0
        log_errori = []
        orario_fisso = leggi_orario_fisso()
        calendario = leggi_calendario()

        for p in partite_modificate:
            try:
                print(f"[DEBUG IMPORT] Elaboro: {p['data_display']} {p['ora']} vs {p['avversario']}")

                # Validazione ora
                if not p["ora"] or ":" not in p["ora"]:
                    msg = f"Ora non valida: {p['ora']!r}"
                    print(f"[DEBUG IMPORT] ❌ {msg}")
                    log_errori.append(f"{p['data_display']}: {msg}")
                    errori += 1
                    continue

                ora_inizio_slot, ora_fine_slot = calcola_slot(p["ora"], minuti_risc, durata)
                print(f"[DEBUG IMPORT] Slot: {ora_inizio_slot}→{ora_fine_slot}")

                ha_conflitti = False
                if p["casa_fuori"] == "Casa" and not orario_fisso.empty:
                    df_palestre = leggi_palestre()
                    palestra_casa = df_palestre["Nome"].iloc[0] if not df_palestre.empty else "palasport"
                    for _, ev in orario_fisso[
                        (orario_fisso["giorno"] == p["giorno"]) &
                        (orario_fisso["palestra"] == palestra_casa.lower())
                    ].iterrows():
                        if c_e_conflitto(ora_inizio_slot, ora_fine_slot, ev["ora_inizio"], ev["ora_fine"]):
                            ha_conflitti = True
                            break

                tipo = f"{'Partita in Casa' if p['casa_fuori'] == 'Casa' else 'Partita Fuori Casa'}"
                if ha_conflitti:
                    tipo = f"⚠️ {tipo} (CONFLITTO DA RISOLVERE)"
                if p["stato"] == "Provvisorio":
                    tipo = f"[PROV] {tipo}"
                elif p["stato"] == "Da spostare":
                    tipo = f"[DA SPOSTARE] {tipo}"

                dati_ev = {
                    "data": p["data"], "giorno": p["giorno"], "squadra": squadra_sel,
                    "tipo": tipo, "avversario": p["avversario"],
                    "ora_inizio": p["ora"], "ora_fine": ora_fine_slot,
                    "casa_fuori": "Casa" if p["casa_fuori"] == "Casa" else "Fuori Casa",
                    "palestra": p["luogo"],
                }
                print(f"[DEBUG IMPORT] scrivi_evento('calendario', {dati_ev})")

                if scrivi_evento("calendario", dati_ev):
                    successi += 1
                    print(f"[DEBUG IMPORT] ✅ Salvata: {p['data_display']}")
                else:
                    errori += 1
                    log_errori.append(f"{p['data_display']}: scrivi_evento ha restituito False")
                    print(f"[DEBUG IMPORT] ❌ scrivi_evento False: {p['data_display']}")
            except Exception as exc:
                errori += 1
                msg = f"{p.get('data_display','?')}: {type(exc).__name__}: {exc}"
                log_errori.append(msg)
                print(f"[DEBUG IMPORT] ❌ Eccezione: {msg}")

        if successi > 0:
            # Salva riepilogo in session state per la sezione sottostante
            st.session_state["import_riepilogo"] = {
                "squadra": squadra_sel,
                "partite": [
                    {
                        "nr_gara":   p.get("nr_gara", "—"),
                        "data":      p.get("data_display", p.get("data", "")),
                        "ora":       p.get("ora", ""),
                        "casa_fuori":p.get("casa_fuori", ""),
                        "avversario":p.get("avversario", ""),
                        "stato":     p.get("stato", ""),
                    }
                    for p in partite_modificate
                ],
            }
            st.success(f"✅ {successi} partite importate nel Calendario Definitivo!")
            if errori > 0:
                st.warning(f"⚠️ {errori} partite non importate — verifica manualmente.")
                if log_errori:
                    with st.expander("🔍 Dettaglio errori"):
                        for e_msg in log_errori:
                            st.code(e_msg)
            df_all = leggi_allenatori()
            email_ok = 0
            email_err = []
            for p in partite_modificate:
                ok, err = notifica_nuova_partita(
                    squadra_sel, p["data_display"], p["giorno"],
                    p["ora"], p["luogo"], p["casa_fuori"], df_all
                )
                if ok:
                    email_ok += 1
                elif err:
                    email_err.append(err)
            if email_ok > 0:
                st.info(f"📧 {email_ok} notifiche inviate agli allenatori.")
            elif email_err:
                st.warning(f"⚠️ Email non inviate: {email_err[0]}")
            invalida_cache()
            del st.session_state["partite_pdf"]
            st.balloons()
        else:
            st.error("❌ Nessuna partita importata. Riprova.")
            if log_errori:
                with st.expander("🔍 Dettaglio errori"):
                    for e_msg in log_errori:
                        st.code(e_msg)

    # ── Riepilogo gare importate ──────────────────────────────────────
    _render_riepilogo()

    st.markdown("**Oppure importa singolarmente:**")
    for i, p in enumerate(partite_modificate):
        col1, col2 = st.columns([4, 1])
        with col1:
            emoji = "🏠" if p["casa_fuori"] == "Casa" else "🚌"
            st.markdown(f"{emoji} **{p['data_display']}** {p['ora']} — vs {p['avversario']} — *{p['stato']}*")
        with col2:
            if st.button("➕", key=f"importa_singola_{i}"):
                riga_sq = df_squadre[df_squadre["Categoria"] == squadra_sel]
                min_r, dur = 30, 105
                if not riga_sq.empty:
                    try:
                        min_r = int(riga_sq.iloc[0]["Minuti Riscaldamento"])
                        dur = int(riga_sq.iloc[0]["Durata Partita"])
                    except:
                        pass
                _, ora_fine = calcola_slot(p["ora"], min_r, dur)
                tipo = f"{'Partita in Casa' if p['casa_fuori'] == 'Casa' else 'Partita Fuori Casa'}"
                if p["stato"] == "Provvisorio":
                    tipo = f"[PROV] {tipo}"
                if scrivi_evento("calendario", {
                    "data": p["data"], "giorno": p["giorno"], "squadra": squadra_sel,
                    "tipo": tipo, "avversario": p["avversario"],
                    "ora_inizio": p["ora"], "ora_fine": ora_fine,
                    "casa_fuori": "Casa" if p["casa_fuori"] == "Casa" else "Fuori Casa",
                    "palestra": p["luogo"],
                }):
                    st.success(f"✅ Partita del {p['data_display']} importata!")
                    df_all = leggi_allenatori()
                    ok, err = notifica_nuova_partita(squadra_sel, p["data_display"], p["giorno"], p["ora"], p["luogo"], p["casa_fuori"], df_all)
                    if ok:
                        st.info("📧 Notifica inviata agli allenatori.")
                    elif err:
                        st.warning(f"⚠️ Email non inviata: {err}")
                    invalida_cache()
