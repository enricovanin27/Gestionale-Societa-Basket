"""
Importazione calendario FIP (provvisorio e definitivo).
- Provvisorio: analizza vs conflitti e DOA → imposta stato automaticamente
- Definitivo: confronta con provvisorio esistente → aggiorna stati
NON tocca il sistema email né il parser PDF.
"""

import streamlit as st
from datetime import datetime, date
from logic import (
    GIORNI_SETTIMANA, calcola_slot, c_e_conflitto,
    estrai_partite_da_pdf, notifica_nuova_partita,
    partita_in_doa, motivo_fuori_doa,
    trova_date_alternative_doa, confronta_calendari,
)
from database import (
    leggi_squadre, leggi_orario_fisso, leggi_palestre, leggi_allenatori,
    leggi_calendario, leggi_doa, salva_doa, salva_doa_lista,
    carica_tutti_i_dati_db, invalida_cache,
    scrivi_evento, aggiorna_evento, aggiorna_stato_partita,
)

_GIORNI_NOMI = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]
_GIORNI_ABBR = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]

_STATO_BADGE = {
    "provvisoria": "🕐 Provvisoria",
    "confermata":  "✅ Confermata",
    "da_spostare": "⚠️ Da spostare",
    "in_attesa":   "⏳ In attesa",
    "definitiva":  "🏆 Definitiva",
}


def _stagione_corrente() -> str:
    oggi = date.today()
    if oggi.month >= 9:
        return f"{oggi.year}-{oggi.year + 1}"
    return f"{oggi.year - 1}-{oggi.year}"


# ── DOA DA PDF (formato B) ───────────────────────────────────────────────────

def _render_doa_estratte(squadra: str):
    """Mostra le DOA estratte automaticamente dal PDF formato B e permette di salvarle."""
    info = st.session_state.get("doa_estratte_pdf")
    if not info or info.get("squadra") != squadra:
        return
    doa_list = info.get("doa", [])
    if not doa_list:
        return

    fasce = ", ".join(
        f"**{d['giorno'].capitalize()}** {d['ora_inizio']}–{d['ora_fine']}"
        for d in doa_list
    )
    st.info(f"📋 DOA rilevate automaticamente dal PDF: {fasce}")
    if st.button("💾 Salva DOA dal PDF", key="btn_salva_doa_pdf"):
        stagione = _stagione_corrente()
        if salva_doa_lista(squadra, doa_list, stagione):
            st.success("✅ DOA salvate!")
            del st.session_state["doa_estratte_pdf"]
            st.rerun()
        else:
            st.error("❌ Errore nel salvataggio DOA.")


# ── DOA CONFIGURATOR ──────────────────────────────────────────────────────────

def _render_doa_configurator(squadra: str):
    """Mostra e permette di configurare le DOA per una categoria."""
    stagione = _stagione_corrente()
    doa_df = leggi_doa(categoria=squadra, stagione=stagione)

    with st.expander("📋 DOA — Disponibilità Orario Accordate", expanded=doa_df.empty):
        if not doa_df.empty:
            st.success(f"✅ DOA salvate per **{squadra}** ({stagione}):")
            for _, d in doa_df.iterrows():
                st.markdown(
                    f"- **{d['giorno'].capitalize()}**: "
                    f"{str(d['ora_inizio'])[:5]} – {str(d['ora_fine'])[:5]}"
                )
            st.markdown("---")
            st.markdown("**Modifica DOA:**")
        else:
            st.warning("⚠️ Nessuna DOA configurata. Le partite senza DOA saranno marcate come **da spostare**.")
            st.markdown("**Configura le disponibilità orarie accordate:**")

        giorni_attuali = set(doa_df["giorno"].str.lower().tolist()) if not doa_df.empty else set()
        gcols = st.columns(7)
        giorni_sel = []
        for i, (g, lbl) in enumerate(zip(_GIORNI_NOMI, _GIORNI_ABBR)):
            with gcols[i]:
                if st.checkbox(lbl, value=(g in giorni_attuali), key=f"doa_{squadra}_{g}"):
                    giorni_sel.append(g)

        ora_inizio_def = "15:00"
        ora_fine_def   = "21:00"
        if not doa_df.empty:
            ora_inizio_def = str(doa_df.iloc[0].get("ora_inizio", "15:00"))[:5]
            ora_fine_def   = str(doa_df.iloc[0].get("ora_fine",   "21:00"))[:5]

        c1, c2 = st.columns(2)
        with c1:
            ora_min = st.text_input("Orario minimo", value=ora_inizio_def, key=f"doa_min_{squadra}",
                                    placeholder="es. 15:00")
        with c2:
            ora_max = st.text_input("Orario massimo", value=ora_fine_def, key=f"doa_max_{squadra}",
                                    placeholder="es. 21:00")

        if st.button("💾 Salva DOA", key=f"btn_doa_{squadra}"):
            if not giorni_sel:
                st.error("Seleziona almeno un giorno.")
            elif not ora_min or not ora_max:
                st.error("Inserisci orario minimo e massimo.")
            else:
                if salva_doa(squadra, giorni_sel, ora_min, ora_max, stagione):
                    st.success("✅ DOA salvate!")
                    st.rerun()


# ── ANALISI PARTITE ───────────────────────────────────────────────────────────

def _analizza_partite(partite_mod, squadra, df_squadre, orario_fisso, doa_list):
    """
    Analizza ogni partita vs conflitti allenamenti e DOA.
    Returns: list of (partita, stato, note_str)
    """
    riga_sq = df_squadre[df_squadre["Categoria"] == squadra]
    minuti_risc, durata = 30, 105
    if not riga_sq.empty:
        try:
            minuti_risc = int(riga_sq.iloc[0]["Minuti Riscaldamento"])
            durata      = int(riga_sq.iloc[0]["Durata Partita"])
        except Exception:
            pass

    risultati = []
    for p in partite_mod:
        motivi = []

        # Calcola slot
        try:
            ora_inizio_slot, _ = calcola_slot(p["ora"], minuti_risc, durata)
            ora_fine_slot, _   = calcola_slot(p["ora"], 0, minuti_risc + durata)
            _, ora_fine_slot   = calcola_slot(p["ora"], minuti_risc, durata)
        except Exception:
            ora_inizio_slot = p["ora"]
            ora_fine_slot   = p["ora"]

        # Conflitti con orario fisso (solo casa)
        ha_conflitti = False
        if p["casa_fuori"] == "Casa" and not orario_fisso.empty:
            palestra_lower = p["luogo"].lower().strip()
            mask = (
                (orario_fisso["giorno"].str.lower().str.strip() == p["giorno"].lower()) &
                (orario_fisso["palestra"].str.lower().str.strip() == palestra_lower)
            )
            for _, ev in orario_fisso[mask].iterrows():
                if c_e_conflitto(ora_inizio_slot, ora_fine_slot,
                                 str(ev["ora_inizio"]), str(ev["ora_fine"])):
                    ha_conflitti = True
                    motivi.append(
                        f"Conflitto allenamento {ev.get('squadra','?')} "
                        f"({ev['ora_inizio']}–{ev['ora_fine']})"
                    )
                    break

        # Check DOA
        in_doa = partita_in_doa(p["giorno"], p["ora"], doa_list)
        if not in_doa and doa_list:
            motivi.append(motivo_fuori_doa(p["giorno"], p["ora"], doa_list))

        stato = "da_spostare" if (ha_conflitti or (not in_doa and doa_list)) else "provvisoria"
        risultati.append((p, stato, "; ".join(motivi)))

    return risultati


# ── RIEPILOGO POST-IMPORT ─────────────────────────���──────────────────────────

def _render_riepilogo():
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

    partite = ril.get("partite", [])
    if not partite:
        st.info("Nessuna partita nel riepilogo.")
        return

    n_conf  = sum(1 for p in partite if p.get("stato") == "confermata")
    n_sposta = sum(1 for p in partite if p.get("stato") == "da_spostare")
    n_def   = sum(1 for p in partite if p.get("stato") == "definitiva")

    c1, c2, c3 = st.columns(3)
    if n_conf:
        c1.success(f"✅ {n_conf} {'partita confermata' if n_conf == 1 else 'partite confermate'}")
    if n_sposta:
        c2.warning(f"⚠️ {n_sposta} {'partita da spostare' if n_sposta == 1 else 'partite da spostare'}")
    if n_def:
        c3.info(f"🏆 {n_def} definitiv{'a' if n_def == 1 else 'e'}")

    import pandas as _pd
    cols_show = ["data", "ora", "casa_fuori", "avversario", "stato"]
    df_ril = _pd.DataFrame(partite)
    df_ril = df_ril[[c for c in cols_show if c in df_ril.columns]]
    df_ril = df_ril.rename(columns={
        "data": "Data", "ora": "Ora", "casa_fuori": "C/F",
        "avversario": "Avversario", "stato": "Stato",
    })

    st.dataframe(df_ril, use_container_width=True, hide_index=True)
    st.caption(f"Totale: {len(partite)} gare importate.")

    if st.button("🗑️ Cancella riepilogo", key="_ril_clear"):
        del st.session_state["import_riepilogo"]
        st.rerun()


# ── RENDER ────────────────────────────────────────────────────────────────────

def render(as_tab: bool = False, dati: dict = None):
    if not as_tab:
        st.header("📄 Importa Calendario FIP")

    # ── Tipo di calendario ──────────────────────────���──────────────────
    tipo_import = st.radio(
        "Tipo di calendario da importare",
        ["📋 Provvisorio FIP", "✅ Definitivo FIP"],
        horizontal=True,
        key="tipo_import_radio",
    )
    is_provvisorio = tipo_import == "📋 Provvisorio FIP"

    if is_provvisorio:
        st.markdown("Carica il PDF del **calendario provvisorio** FIP. Le partite verranno analizzate automaticamente vs conflitti e DOA.")
    else:
        st.markdown("Carica il PDF del **calendario definitivo** FIP. Verrà confrontato con il provvisorio già importato.")

    # ── Caricamento dati ───────────────────────────────────────────────
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
        squadra_sel = st.selectbox("A quale squadra si riferisce questo calendario?", squadre_lista, key="imp_squadra")
    with col2:
        nome_societa = st.text_input("Nome società da cercare nel PDF", value="Oderzo", key="imp_societa")

    # ── DOA configurator (solo per provvisorio) ────────────────────────
    if is_provvisorio and squadra_sel:
        _render_doa_estratte(squadra_sel)
        _render_doa_configurator(squadra_sel)

    # ── Upload PDF ──────────────────────────────────────────────────────
    pdf_file = st.file_uploader("Carica il PDF FIP", type=["pdf"], key="imp_pdf")

    if pdf_file and st.button("🔍 Estrai partite", type="primary", key="imp_estrai"):
        with st.spinner("Lettura PDF in corso..."):
            pdf_bytes = pdf_file.read()

            import pdfplumber, io as _io
            testo_debug = ""
            try:
                with pdfplumber.open(_io.BytesIO(pdf_bytes)) as pdf_debug:
                    for pag in pdf_debug.pages:
                        testo_debug += (pag.extract_text() or "") + "\n"
            except Exception:
                pass
            linee_debug = [l for l in testo_debug.split("\n") if l.strip()]

            partite, errore, doa_estratte = estrai_partite_da_pdf(pdf_bytes, nome_societa)

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

        if doa_estratte:
            st.session_state["doa_estratte_pdf"] = {"doa": doa_estratte, "squadra": squadra_sel}

        st.session_state["partite_pdf"]  = partite
        st.session_state["squadra_pdf"]  = squadra_sel
        st.session_state["tipo_imp_pdf"] = "provvisorio" if is_provvisorio else "definitivo"

    if "partite_pdf" not in st.session_state:
        _render_riepilogo()
        return

    partite     = st.session_state["partite_pdf"]
    squadra_sel = st.session_state.get("squadra_pdf", squadra_sel)
    tipo_imp    = st.session_state.get("tipo_imp_pdf", "provvisorio")

    st.markdown("---")

    # ══════════════════════════════���═══════════════════════════════════���═
    # FLUSSO PROVVISORIO
    # ════════════════════════════════════════════════════════════════════
    if tipo_imp == "provvisorio":
        st.subheader("📋 Partite estratte — verifica e modifica")
        st.info("Controlla i dati. Dopo l'importazione verranno analizzate automaticamente vs conflitti e DOA.")

        partite_mod = []
        for i, p in enumerate(partite):
            with st.expander(
                f"{'🏠' if p['casa_fuori'] == 'Casa' else '🚌'} "
                f"{p['data_display']} — {p['ora']} — {p['casa_fuori']} vs {p['avversario']}"
            ):
                c1, c2, c3 = st.columns(3)
                with c1:
                    data_mod = st.text_input("Data (DD/MM/YYYY)", value=p["data_display"], key=f"pp_data_{i}")
                    ora_mod  = st.text_input("Ora partita",        value=p["ora"],          key=f"pp_ora_{i}")
                with c2:
                    cf_mod  = st.radio("Casa/Fuori", ["Casa", "Fuori"],
                                       index=0 if p["casa_fuori"] == "Casa" else 1,
                                       key=f"pp_cf_{i}", horizontal=True)
                    avv_mod = st.text_input("Avversario", value=p["avversario"], key=f"pp_avv_{i}")
                with c3:
                    if cf_mod == "Casa":
                        idx_pal = 0
                        if p["luogo"] in palestre_lista:
                            idx_pal = palestre_lista.index(p["luogo"])
                        luogo_mod = st.selectbox(
                            "Palestra", palestre_lista if palestre_lista else [p["luogo"]],
                            index=idx_pal, key=f"pp_luogo_{i}",
                        )
                    else:
                        luogo_mod = st.text_input("Luogo trasferta", value=p["luogo"], key=f"pp_luogo_{i}")

                try:
                    data_obj  = datetime.strptime(data_mod, "%d/%m/%Y")
                    data_iso  = data_obj.strftime("%Y-%m-%d")
                    giorno_c  = GIORNI_SETTIMANA[data_obj.weekday()]
                except Exception:
                    data_iso = p["data"]
                    giorno_c = p["giorno"]

                partite_mod.append({
                    "nr_gara": p["nr_gara"], "data": data_iso, "data_display": data_mod,
                    "giorno": giorno_c, "ora": ora_mod, "casa_fuori": cf_mod,
                    "avversario": avv_mod, "luogo": luogo_mod,
                })

        st.markdown("---")

        if st.button("✅ Analizza e importa provvisorio", type="primary", key="imp_btn_prov"):
            orario_fisso = leggi_orario_fisso()
            doa_df       = leggi_doa(categoria=squadra_sel, stagione=_stagione_corrente())
            doa_list     = doa_df.to_dict("records") if not doa_df.empty else []

            analisi = _analizza_partite(partite_mod, squadra_sel, df_squadre, orario_fisso, doa_list)

            riga_sq = df_squadre[df_squadre["Categoria"] == squadra_sel]
            minuti_risc, durata = 30, 105
            if not riga_sq.empty:
                try:
                    minuti_risc = int(riga_sq.iloc[0]["Minuti Riscaldamento"])
                    durata      = int(riga_sq.iloc[0]["Durata Partita"])
                except Exception:
                    pass

            successi = errori = 0
            riepilogo_partite = []

            for p, stato, note in analisi:
                try:
                    _, ora_fine = calcola_slot(p["ora"], minuti_risc, durata)

                    tipo_str = "Partita in Casa" if p["casa_fuori"] == "Casa" else "Partita Fuori Casa"
                    dati_ev = {
                        "data":        p["data"],
                        "giorno":      p["giorno"],
                        "squadra":     squadra_sel,
                        "tipo":        tipo_str,
                        "avversario":  p["avversario"],
                        "ora_inizio":  p["ora"],
                        "ora_fine":    ora_fine,
                        "casa_fuori":  "Casa" if p["casa_fuori"] == "Casa" else "Fuori Casa",
                        "palestra":    p["luogo"],
                        "stato":       stato,
                        "tipo_import": "provvisorio",
                        "note":        note,
                    }
                    if scrivi_evento("calendario", dati_ev):
                        successi += 1
                        riepilogo_partite.append({
                            "data": p["data_display"], "ora": p["ora"],
                            "casa_fuori": p["casa_fuori"], "avversario": p["avversario"],
                            "stato": stato,
                        })
                    else:
                        errori += 1
                except Exception as exc:
                    errori += 1
                    st.warning(f"Errore {p.get('data_display','?')}: {exc}")

            if successi > 0:
                n_da_spostare = sum(1 for _, st_, _ in analisi if st_ == "da_spostare")
                n_prov        = sum(1 for _, st_, _ in analisi if st_ == "provvisoria")

                st.success(f"✅ {successi} partite importate.")
                col_a, col_b = st.columns(2)
                if n_prov:
                    col_a.info(f"🕐 {n_prov} **provvisorie** — da confermare")
                if n_da_spostare:
                    col_b.warning(f"⚠️ {n_da_spostare} **da spostare** — conflitti o fuori DOA")
                if n_da_spostare:
                    st.info("Vai a **📋 Gestione Calendario FIP** per gestirle.")

                st.session_state["import_riepilogo"] = {
                    "squadra": squadra_sel, "partite": riepilogo_partite,
                }
                # Notifiche email allenatori
                df_all = leggi_allenatori()
                for p, _, _ in analisi:
                    notifica_nuova_partita(
                        squadra_sel, p["data_display"], p["giorno"],
                        p["ora"], p["luogo"], p["casa_fuori"], df_all,
                    )
                invalida_cache()
                del st.session_state["partite_pdf"]
                st.balloons()
            else:
                st.error("❌ Nessuna partita importata.")
            if errori:
                st.warning(f"⚠️ {errori} partite non importate.")

    # ════════════════════════════════════════════════════════════════════
    # FLUSSO DEFINITIVO
    # ════════════════════════════════════════════════════════════════════
    else:
        st.subheader("✅ Partite estratte — Confronto con provvisorio")

        cal_prov = leggi_calendario()
        confronto = confronta_calendari(partite, cal_prov, squadra_sel)

        n_conf   = len(confronto["confermate"])
        n_mod    = len(confronto["modificate"])
        n_nuove  = len(confronto["nuove"])
        n_rim    = len(confronto["rimosse"])

        col1, col2, col3, col4 = st.columns(4)
        col1.metric("✅ Confermate",  n_conf)
        col2.metric("🔄 Modificate",  n_mod)
        col3.metric("🆕 Nuove",       n_nuove)
        col4.metric("🗑️ Rimosse",     n_rim)

        # Dettaglio modifiche
        if confronto["confermate"]:
            with st.expander(f"✅ {n_conf} partite confermate senza modifiche"):
                for p_n, row_id in confronto["confermate"]:
                    st.markdown(
                        f"✅ **{squadra_sel}** — "
                        f"{p_n.get('data_display', p_n.get('data','?'))} alle {p_n.get('ora','?')} "
                        f"vs {p_n.get('avversario','?')}"
                    )

        if confronto["modificate"]:
            with st.expander(f"🔄 {n_mod} partite con modifiche", expanded=True):
                for p_n, row_id, diff in confronto["modificate"]:
                    st.markdown(
                        f"🔄 **{squadra_sel}** — "
                        f"{p_n.get('data_display', p_n.get('data','?'))} vs {p_n.get('avversario','?')} "
                        f"→ _{diff}_"
                    )

        if confronto["nuove"]:
            with st.expander(f"🆕 {n_nuove} partite nuove (non nel provvisorio)"):
                for p_n in confronto["nuove"]:
                    st.markdown(
                        f"🆕 **{squadra_sel}** — "
                        f"{p_n.get('data_display', p_n.get('data','?'))} alle {p_n.get('ora','?')} "
                        f"vs {p_n.get('avversario','?')}"
                    )

        if confronto["rimosse"]:
            with st.expander(f"🗑️ {n_rim} partite nel provvisorio non più presenti"):
                for row_id in confronto["rimosse"]:
                    row = cal_prov.loc[row_id]
                    st.markdown(
                        f"🗑️ **{squadra_sel}** — "
                        f"{row.get('Data','?')} vs {row.get('Avversario','?')}"
                    )

        st.markdown("---")

        if st.button("✅ Importa Calendario Definitivo", type="primary", key="imp_btn_def"):
            riga_sq = df_squadre[df_squadre["Categoria"] == squadra_sel]
            minuti_risc, durata = 30, 105
            if not riga_sq.empty:
                try:
                    minuti_risc = int(riga_sq.iloc[0]["Minuti Riscaldamento"])
                    durata      = int(riga_sq.iloc[0]["Durata Partita"])
                except Exception:
                    pass

            successi = 0

            # Confermate: aggiorna stato a 'definitiva'
            for p_n, row_id in confronto["confermate"]:
                aggiorna_stato_partita(row_id, "definitiva")
                successi += 1

            # Modificate: aggiorna data/ora/stato
            for p_n, row_id, diff in confronto["modificate"]:
                try:
                    _, ora_fine = calcola_slot(p_n["ora"], minuti_risc, durata)
                    aggiorna_evento("calendario", row_id, {
                        "data":        p_n["data"],
                        "giorno":      p_n["giorno"],
                        "ora_inizio":  p_n["ora"],
                        "ora_fine":    ora_fine,
                        "stato":       "definitiva",
                        "tipo_import": "definitivo",
                        "note":        f"Modificata dal definitivo: {diff}",
                    })
                    successi += 1
                except Exception as exc:
                    st.warning(f"Errore aggiornamento: {exc}")

            # Nuove: inserisci come definitivo
            for p_n in confronto["nuove"]:
                try:
                    _, ora_fine = calcola_slot(p_n["ora"], minuti_risc, durata)
                    tipo_str = "Partita in Casa" if p_n["casa_fuori"] == "Casa" else "Partita Fuori Casa"
                    scrivi_evento("calendario", {
                        "data":        p_n["data"],
                        "giorno":      p_n["giorno"],
                        "squadra":     squadra_sel,
                        "tipo":        tipo_str,
                        "avversario":  p_n["avversario"],
                        "ora_inizio":  p_n["ora"],
                        "ora_fine":    ora_fine,
                        "casa_fuori":  "Casa" if p_n["casa_fuori"] == "Casa" else "Fuori Casa",
                        "palestra":    p_n["luogo"],
                        "stato":       "definitiva",
                        "tipo_import": "definitivo",
                        "note":        "Nuova nel calendario definitivo",
                    })
                    successi += 1
                except Exception as exc:
                    st.warning(f"Errore inserimento nuova: {exc}")

            st.success(
                f"✅ Calendario definitivo importato! "
                f"{successi} partite aggiornate."
            )
            invalida_cache()
            del st.session_state["partite_pdf"]
            st.balloons()

    _render_riepilogo()
