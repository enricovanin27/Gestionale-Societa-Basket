import streamlit as st
from datetime import datetime
from logic import GIORNI_SETTIMANA, calcola_slot, c_e_conflitto, estrai_partite_da_pdf, notifica_nuova_partita
from sheets import leggi_foglio, scrivi_riga, carica_tutti_i_dati


def render(as_tab: bool = False, dati: dict = None):
    if not as_tab:
        st.header("📄 Importa Calendario FIP")
    st.markdown("Carica il PDF del calendario provvisorio FIP per una squadra. L'app estrae automaticamente le partite di Oderzo.")

    if dati is not None:
        df_squadre = dati.get("Squadre", leggi_foglio("Squadre"))
    else:
        df_squadre = leggi_foglio("Squadre")
    squadre_lista = df_squadre["Categoria"].tolist() if not df_squadre.empty else []

    col1, col2 = st.columns(2)
    with col1:
        squadra_sel = st.selectbox("A quale squadra si riferisce questo calendario?", squadre_lista)
    with col2:
        nome_societa = st.text_input("Nome società da cercare nel PDF", value="Oderzo")

    pdf_file = st.file_uploader("Carica il PDF FIP", type=["pdf"])

    if pdf_file and st.button("🔍 Estrai partite", type="primary"):
        with st.spinner("Lettura PDF in corso..."):
            pdf_bytes = pdf_file.read()
            partite, errore = estrai_partite_da_pdf(pdf_bytes, nome_societa)

        if errore:
            st.error(f"❌ {errore}")
            return

        if not partite:
            st.warning("Nessuna partita trovata. Verifica il nome della società.")
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
                data_mod = st.text_input("Data (DD/MM/YYYY)", value=p["data_display"], key=f"data_{i}")
                ora_mod = st.text_input("Ora partita", value=p["ora"], key=f"ora_{i}")
            with col2:
                cf_mod = st.radio("Casa/Fuori", ["Casa", "Fuori"],
                                  index=0 if p["casa_fuori"] == "Casa" else 1,
                                  key=f"cf_{i}", horizontal=True)
                avv_mod = st.text_input("Avversario", value=p["avversario"], key=f"avv_{i}")
            with col3:
                luogo_mod = st.text_input("Luogo", value=p["luogo"], key=f"luogo_{i}")
                stato_mod = st.selectbox("Stato", ["Provvisorio", "Confermato", "Da spostare"],
                                         key=f"stato_{i}")

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
        orario_fisso = leggi_foglio("Orario Fisso")
        calendario = leggi_foglio("Calendario Definitivo")

        for p in partite_modificate:
            try:
                ora_inizio_slot, ora_fine_slot = calcola_slot(p["ora"], minuti_risc, durata)
                ha_conflitti = False
                if p["casa_fuori"] == "Casa" and not orario_fisso.empty:
                    df_palestre = leggi_foglio("Palestre")
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

                if scrivi_riga("Calendario Definitivo", [
                    p["data"], p["giorno"], squadra_sel,
                    tipo, p["avversario"], p["ora"], ora_fine_slot,
                    "Casa" if p["casa_fuori"] == "Casa" else "Fuori Casa",
                    p["luogo"]
                ]):
                    successi += 1
                else:
                    errori += 1
            except Exception:
                errori += 1

        if successi > 0:
            st.success(f"✅ {successi} partite importate nel Calendario Definitivo!")
            if errori > 0:
                st.warning(f"⚠️ {errori} partite non importate — verifica manualmente.")
            df_all = leggi_foglio("Allenatori")
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
            carica_tutti_i_dati.clear()
            leggi_foglio.clear()
            del st.session_state["partite_pdf"]
            st.balloons()
        else:
            st.error("❌ Nessuna partita importata. Riprova.")

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
                if scrivi_riga("Calendario Definitivo", [
                    p["data"], p["giorno"], squadra_sel,
                    tipo, p["avversario"], p["ora"], ora_fine,
                    "Casa" if p["casa_fuori"] == "Casa" else "Fuori Casa",
                    p["luogo"]
                ]):
                    st.success(f"✅ Partita del {p['data_display']} importata!")
                    df_all = leggi_foglio("Allenatori")
                    ok, err = notifica_nuova_partita(squadra_sel, p["data_display"], p["giorno"], p["ora"], p["luogo"], p["casa_fuori"], df_all)
                    if ok:
                        st.info("📧 Notifica inviata agli allenatori.")
                    elif err:
                        st.warning(f"⚠️ Email non inviata: {err}")
                    carica_tutti_i_dati.clear()
                    leggi_foglio.clear()
