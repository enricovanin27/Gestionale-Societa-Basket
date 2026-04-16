import streamlit as st
from datetime import datetime, timedelta
from logic import (
    GIORNI_SETTIMANA, calcola_slot, giorni_disponibili_squadra,
    trova_squadre_senza_allenamento, trova_date_alternative,
    trova_slot_liberi,
    c_e_conflitto,
    trova_conflitti_allenatore_slot,
    notifica_nuova_partita, notifica_allenamento_spostato, notifica_conflitto,
)
from database import (
    carica_tutti_i_dati_db, invalida_cache,
    scrivi_evento, scrivi_eventi_batch, reset_form,
)
# LEGACY: from sheets import carica_tutti_i_dati, scrivi_riga, scrivi_righe_batch, leggi_foglio, reset_form
from views._components import render_sposta_allenamenti, build_spostamento_dicts


def _render_allenamenti_settimana(partita, orario_fisso, df_squadre, df_allenatori, df_palestre):
    """
    Mostra gli allenamenti fissi della settimana per la palestra scelta e
    permette di spostarli su un nuovo slot con un clic.
    """
    palestra = partita.get("palestra", "")
    if not palestra or orario_fisso.empty:
        return

    filtro = orario_fisso[orario_fisso["palestra"].str.lower().str.strip() == palestra.strip().lower()]
    if filtro.empty:
        return

    try:
        data_partita = datetime.strptime(partita["data"], "%Y-%m-%d").date()
    except Exception:
        return

    lun = data_partita - timedelta(days=data_partita.weekday())   # lunedì
    dom = lun + timedelta(days=6)
    settimana = [lun + timedelta(days=i) for i in range(7)]

    st.markdown("---")
    st.markdown("#### 🔄 Allenamenti questa settimana da spostare")
    st.caption(
        f"Palestra **{palestra}** &nbsp;·&nbsp; "
        f"settimana dal {lun.strftime('%d/%m')} al {dom.strftime('%d/%m/%Y')}"
    )

    trovati = 0
    for idx, (_, ev) in enumerate(filtro.iterrows()):
        giorno_ev  = str(ev.get("giorno",    "")).lower().strip()
        squadra_ev = str(ev.get("squadra",   "")).strip()
        ora_i      = str(ev.get("ora_inizio","")).strip()
        ora_f      = str(ev.get("ora_fine",  "")).strip()

        # Data effettiva nella settimana
        data_ev = None
        for d in settimana:
            if GIORNI_SETTIMANA[d.weekday()] == giorno_ev:
                data_ev = d
                break
        if data_ev is None:
            continue

        trovati += 1

        # Durata allenamento in minuti
        try:
            t_i = datetime.strptime(ora_i, "%H:%M")
            t_f = datetime.strptime(ora_f, "%H:%M")
            durata_ev = int((t_f - t_i).total_seconds() / 60)
        except Exception:
            durata_ev = 90

        with st.container(border=True):
            c1, c2 = st.columns([4, 3])
            with c1:
                st.markdown(
                    f"🏀 **{squadra_ev}**  \n"
                    f"📅 {giorno_ev.capitalize()} {data_ev.strftime('%d/%m')} "
                    f"&nbsp;·&nbsp; ⏱️ {ora_i} → {ora_f}"
                )

            with c2:
                slots = trova_slot_liberi(
                    squadra_ev, durata_ev,
                    orario_fisso, df_squadre, df_allenatori, df_palestre,
                )
                if not slots:
                    st.warning("Nessuno slot libero disponibile.")
                    continue

                opzioni = ["— Seleziona slot —"] + [
                    f"{s['giorno'].capitalize()} {s['ora_inizio']}-{s['ora_fine']} @ {s['palestra']}"
                    for s in slots[:6]
                ]
                scelta = st.selectbox(
                    "Nuovo slot",
                    opzioni,
                    key=f"sposta_sett_{idx}",
                    label_visibility="collapsed",
                )
                if st.button(
                    "📅 Sposta",
                    key=f"btn_sposta_sett_{idx}",
                    use_container_width=True,
                ):
                    if scelta == "— Seleziona slot —":
                        st.warning("⚠️ Seleziona uno slot prima di spostare.")
                    else:
                        slot_idx = opzioni.index(scelta) - 1
                        if 0 <= slot_idx < len(slots):
                            s = slots[slot_idx]
                            if scrivi_evento("calendario", {
                                "data":       data_ev.strftime("%Y-%m-%d"),
                                "giorno":     giorno_ev,
                                "squadra":    squadra_ev,
                                "tipo":       "Allenamento spostato",
                                "avversario": "",
                                "ora_inizio": s["ora_inizio"],
                                "ora_fine":   s["ora_fine"],
                                "casa_fuori": "Casa",
                                "palestra":   s["palestra"],
                            }):
                                notifica_allenamento_spostato(
                                    squadra_ev, s["giorno"], s["ora_inizio"],
                                    s["palestra"], df_allenatori,
                                )
                                st.success(
                                    f"✅ **{squadra_ev}** spostato a "
                                    f"{s['giorno'].capitalize()} {s['ora_inizio']} "
                                    f"@ {s['palestra']}"
                                )
                                invalida_cache()

    if trovati == 0:
        st.info("Nessun allenamento fisso trovato per questa palestra nella settimana selezionata.")


def render(as_tab: bool = False, dati: dict = None):
    if not as_tab:
        st.header("📅 Inserisci Partita")
    form_key = st.session_state.get("form_key", 0)
    if dati is None:
        dati = carica_tutti_i_dati_db()
    df_squadre = dati["Squadre"]
    df_allenatori = dati["Allenatori"]
    df_palestre = dati["Palestre"]
    orario_fisso = dati["Orario Fisso"]

    if df_squadre.empty:
        st.warning("⚠️ Nessuna squadra configurata.")
        return

    squadre_lista  = df_squadre["Categoria"].tolist()
    palestre_lista = df_palestre["Nome"].tolist() if not df_palestre.empty else []

    data_default = datetime.today().date()
    if "data_selezionata" in st.session_state:
        try:
            data_default = datetime.strptime(st.session_state["data_selezionata"], "%Y-%m-%d").date()
        except:
            pass

    # ── SEZIONE 1: Squadra e tipo ──────────────────────────────────
    st.markdown("##### 🏀 Squadra")
    squadra = st.selectbox(
        "Squadra",
        ["— Seleziona squadra —"] + squadre_lista,
        key=f"squadra_{form_key}",
        label_visibility="collapsed",
    )
    casa_fuori = st.radio("Tipo partita", ["🏠 Casa", "🚌 Fuori Casa"], horizontal=True, key=f"casafuori_{form_key}")

    # ── SEZIONE 2: Data e orario ───────────────────────────────────
    st.markdown("##### 📅 Data e orario")
    col1, col2 = st.columns(2)
    with col1:
        data = st.date_input("Data partita", value=data_default, key=f"data_{form_key}")
    with col2:
        ora_partita = st.time_input("Ora inizio partita", value=datetime.strptime("18:00", "%H:%M").time(), key=f"ora_{form_key}")

    # ── SEZIONE 3: Luogo ───────────────────────────────────────────
    st.markdown("##### 📍 Luogo")
    if casa_fuori == "🏠 Casa":
        palestra_sel = st.selectbox(
            "Palestra",
            ["— Seleziona palestra —"] + palestre_lista,
            key=f"palestra_{form_key}",
            label_visibility="collapsed",
        )
        palestra = None if palestra_sel == "— Seleziona palestra —" else palestra_sel
        luogo = palestra or ""
    else:
        luogo = st.text_input("Luogo trasferta (città / impianto)", key=f"luogo_{form_key}", label_visibility="collapsed")
        palestra = None

    # ── SEZIONE 4: Avversario ──────────────────────────────────────
    st.markdown("##### ⚔️ Avversario")
    avversario = st.text_input("Nome squadra avversaria", key=f"avversario_{form_key}",
                               label_visibility="collapsed", placeholder="es. Treviso Basket")

    riga_squadra = df_squadre[df_squadre["Categoria"] == squadra]
    minuti_risc, durata = 30, 105
    if not riga_squadra.empty:
        try:
            minuti_risc = int(riga_squadra.iloc[0]["Minuti Riscaldamento"])
            durata = int(riga_squadra.iloc[0]["Durata Partita"])
        except:
            pass

    ora_partita_str = ora_partita.strftime("%H:%M")
    e_trasferta = casa_fuori == "🚌 Fuori Casa"
    if not e_trasferta:
        ora_inizio_slot, ora_fine_slot = calcola_slot(ora_partita_str, minuti_risc, durata)
    else:
        # Trasferta: nessuno slot palestra, usa solo l'orario della partita
        ora_inizio_slot = ora_partita_str
        ora_fine_slot   = ora_partita_str
    durata_totale = minuti_risc + durata
    giorno = GIORNI_SETTIMANA[data.weekday()]

    # ── RIEPILOGO VISIVO (solo con squadra valida) ─────────────────
    st.markdown("---")
    if squadra != "— Seleziona squadra —":
        luogo_display = luogo if luogo else "—"
        avversario_display = avversario if avversario else "—"
        tipo_label = "🏠 Casa" if casa_fuori == "🏠 Casa" else "🚌 Fuori Casa"
        slot_line = (
            f"&emsp;⏱️ &nbsp;Slot palestra: <strong style=\"color:#fff\">{ora_inizio_slot} → {ora_fine_slot}</strong>"
            if not e_trasferta else ""
        )
        st.markdown(
            f"""
            <div style="background:linear-gradient(135deg,#1a3a5c,#0d2137);
                        border-left:4px solid #4a9eff;border-radius:8px;
                        padding:14px 18px;margin:4px 0 12px 0">
              <div style="font-size:1.05em;font-weight:700;color:#ffffff;margin-bottom:8px">
                🏀 {squadra} &nbsp;vs&nbsp; <span style="color:#7ec8f7">{avversario_display}</span>
                &nbsp;·&nbsp; {tipo_label}
              </div>
              <div style="color:#b8d4f0;font-size:0.92em;line-height:2">
                📅 &nbsp;<strong style="color:#fff">{giorno.capitalize()}</strong>
                &nbsp;{data.strftime("%d/%m/%Y")}
                &emsp;🕐 &nbsp;Partita: <strong style="color:#fff">{ora_partita_str}</strong>
                {slot_line}<br>
                📍 &nbsp;{luogo_display}
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        if casa_fuori == "🏠 Casa":
            giorni_ok = giorni_disponibili_squadra(squadra, df_squadre)
            if giorno not in giorni_ok:
                st.error(f"❌ {squadra} non può giocare in casa il {giorno.capitalize()}.")
                return

    if casa_fuori == "🏠 Casa" and not palestra:
        st.warning("⚠️ Seleziona una palestra per continuare.")

    if st.button("🔍 Analizza disponibilità", type="primary", key=f"analizza_{form_key}", use_container_width=True):
        if squadra == "— Seleziona squadra —":
            st.error("⚠️ Seleziona una squadra prima di analizzare.")
            return
        if casa_fuori == "🏠 Casa" and not palestra:
            st.warning("⚠️ Seleziona una palestra prima di analizzare.")
            return
        with st.spinner("Analisi in corso..."):
            calendario = dati["Calendario Definitivo"]

            # ── Controllo allenatori in due posti ──────────────────────
            conflitti_all = trova_conflitti_allenatore_slot(
                squadra, giorno, ora_inizio_slot, ora_fine_slot,
                orario_fisso, df_allenatori,
            )
            st.session_state["conflitti_allenatori"] = conflitti_all

            if casa_fuori == "🚌 Fuori Casa":
                suggerimenti = trova_squadre_senza_allenamento(squadra, giorno, ora_inizio_slot, ora_fine_slot, orario_fisso, df_squadre)
                st.session_state.update({"fuori_casa": True, "suggerimenti_fuori": suggerimenti})
            else:
                conflitti = []
                if not orario_fisso.empty:
                    for _, ev in orario_fisso[
                        (orario_fisso["giorno"].str.lower().str.strip() == giorno.lower()) &
                        (orario_fisso["palestra"].str.lower().str.strip() == palestra.lower())
                    ].iterrows():
                        if c_e_conflitto(ora_inizio_slot, ora_fine_slot, ev["ora_inizio"], ev["ora_fine"]):
                            conflitti.append({"squadra": ev["squadra"], "ora_inizio": ev["ora_inizio"], "ora_fine": ev["ora_fine"], "tipo": "Allenamento fisso"})
                if not calendario.empty:
                    for _, ev in calendario[
                        (calendario["Giorno"].str.lower().str.strip() == giorno.lower()) &
                        (calendario["Casa/Fuori"].str.lower() == "casa")
                    ].iterrows():
                        if c_e_conflitto(ora_inizio_slot, ora_fine_slot, str(ev["Ora Inizio"]), str(ev["Ora Fine"])):
                            conflitti.append({"squadra": ev["Squadra"], "ora_inizio": ev["Ora Inizio"], "ora_fine": ev["Ora Fine"], "tipo": ev["Tipo"]})
                date_alt = trova_date_alternative(data, squadra, palestra, ora_inizio_slot, ora_fine_slot, orario_fisso, calendario, df_squadre) if conflitti else []
                st.session_state.update({"fuori_casa": False, "conflitti": conflitti, "date_alternative": date_alt})

            st.session_state.update({
                "partita": {"squadra": squadra, "giorno": giorno, "palestra": palestra or "", "data": str(data),
                            "ora_partita": ora_partita_str, "ora_inizio": ora_inizio_slot, "ora_fine": ora_fine_slot,
                            "luogo": luogo, "durata_totale": durata_totale, "avversario": avversario},
                "orario_fisso": orario_fisso, "df_squadre": df_squadre,
                "df_allenatori": df_allenatori, "df_palestre": df_palestre
            })

    # ── AVVISO ALLENATORI IN DUE POSTI ───────────────────────────
    conflitti_all = st.session_state.get("conflitti_allenatori", [])
    if conflitti_all and "partita" in st.session_state:
        for cf in conflitti_all:
            st.warning(
                f"⚠️ **ATTENZIONE:** **{cf['allenatore']}** è già impegnato in questo orario "
                f"con **{cf['squadra']}** ({cf['ora_inizio']}–{cf['ora_fine']})."
            )
        st.info("ℹ️ Puoi comunque procedere — questa è solo una segnalazione.")

    # ── RISULTATO: FUORI CASA ──────────────────────────────────────
    if st.session_state.get("fuori_casa") and "partita" in st.session_state:
        partita = st.session_state["partita"]
        suggerimenti = st.session_state.get("suggerimenti_fuori", [])
        st.divider()
        st.success("🚌 Partita fuori casa — nessun conflitto di palestra.")
        if suggerimenti:
            with st.container(border=True):
                st.markdown("💡 **Slot liberato — squadre che potrebbero allenarsi:**")
                for s in suggerimenti[:5]:
                    st.markdown(f"&nbsp;&nbsp;✅ **{s['squadra']}** — {s['palestra']} &nbsp;{s['ora_inizio']}–{s['ora_fine']}")
        if st.button("✅ Aggiungi al Calendario Definitivo", key="salva_fuori", use_container_width=True):
            with st.spinner("Salvataggio in corso..."):
                # Trasferta: nessuno slot palestra — salva solo l'orario della partita
                if scrivi_evento("calendario", {
                    "data": partita["data"], "giorno": partita["giorno"], "squadra": partita["squadra"],
                    "tipo": "Partita Fuori Casa", "avversario": partita.get("avversario", ""),
                    "ora_inizio": partita["ora_partita"], "ora_fine": partita["ora_partita"],
                    "casa_fuori": "Fuori Casa", "palestra": partita["luogo"],
                }):
                    st.success("✅ Salvata!")
                    df_all = dati["Allenatori"]
                    ok, err = notifica_nuova_partita(partita["squadra"], partita["data"], partita["giorno"], partita["ora_partita"], partita["luogo"], "Fuori", df_all)
                    if ok:
                        st.info("📧 Notifica inviata agli allenatori.")
                    st.balloons()
                    invalida_cache()
                    reset_form()
                    st.rerun()

    # ── RISULTATO: CASA ────────────────────────────────────────────
    if not st.session_state.get("fuori_casa", True) and "conflitti" in st.session_state:
        conflitti = st.session_state["conflitti"]
        partita = st.session_state["partita"]
        date_alt = st.session_state.get("date_alternative", [])
        orario_fisso_ss = st.session_state["orario_fisso"]
        df_squadre_ss = st.session_state["df_squadre"]
        df_allenatori_ss = st.session_state["df_allenatori"]
        df_palestre_ss = st.session_state["df_palestre"]

        st.divider()

        if not conflitti:
            st.success(
                f"✅ **Slot libero!**  \n"
                f"Nessun conflitto per **{partita['squadra']}**  \n"
                f"📅 {partita['giorno'].capitalize()} {partita['data']} &nbsp;·&nbsp; "
                f"🕐 {partita['ora_partita']} &nbsp;·&nbsp; "
                f"⏱️ slot {partita['ora_inizio']}–{partita['ora_fine']}"
            )
            if st.button("✅ Aggiungi al Calendario Definitivo", key="salva_casa", use_container_width=True):
                with st.spinner("Salvataggio in corso..."):
                    if scrivi_evento("calendario", {
                        "data": partita["data"], "giorno": partita["giorno"], "squadra": partita["squadra"],
                        "tipo": "Partita in Casa", "avversario": partita.get("avversario", ""),
                        "ora_inizio": partita["ora_partita"], "ora_fine": partita["ora_fine"],
                        "casa_fuori": "Casa", "palestra": partita["palestra"],
                    }):
                        st.success("✅ Salvata!")
                        df_all = dati["Allenatori"]
                        ok, err = notifica_nuova_partita(partita["squadra"], partita["data"], partita["giorno"], partita["ora_partita"], partita["palestra"], "Casa", df_all)
                        if ok:
                            st.info("📧 Notifica inviata agli allenatori.")
                        st.balloons()
                        invalida_cache()
                        reset_form()
                        st.rerun()
        else:
            st.error(f"⚠️ Trovati **{len(conflitti)} conflitti** per lo slot {partita['ora_inizio']}–{partita['ora_fine']}")

            if date_alt:
                st.markdown("#### 📅 Date alternative libere")
                cols = st.columns(min(len(date_alt), 4))
                for i, d in enumerate(date_alt):
                    with cols[i % 4]:
                        if st.button(f"📅 {d['giorno']}\n{d['data']}", key=f"data_alt_{i}", use_container_width=True):
                            st.session_state["data_selezionata"] = d["data_raw"]
                            reset_form()
                            st.rerun()

            st.markdown("#### 🔄 Sposta gli allenamenti in conflitto")
            ha_bloccanti, scelte = render_sposta_allenamenti(
                conflitti, partita["durata_totale"],
                orario_fisso_ss, df_squadre_ss, df_allenatori_ss, df_palestre_ss,
            )

            st.markdown("---")
            if not ha_bloccanti:
                if st.button("✅ Sposta allenamenti e salva partita", type="primary", key="conferma", use_container_width=True):
                    tutti_ok = all(v[0] != "— Seleziona slot —" for v in scelte.values() if v[0] != "__nessuno__")
                    if not tutti_ok:
                        st.warning("⚠️ Seleziona uno slot per ogni conflitto.")
                    else:
                        with st.spinner("Salvataggio in corso..."):
                            dict_partita = {
                                "data": partita["data"], "giorno": partita["giorno"],
                                "squadra": partita["squadra"], "tipo": "Partita in Casa",
                                "avversario": partita.get("avversario", ""),
                                "ora_inizio": partita["ora_partita"], "ora_fine": partita["ora_fine"],
                                "casa_fuori": "Casa", "palestra": partita["palestra"],
                            }
                            dicts_spostamenti = build_spostamento_dicts(partita["data"], scelte)
                            if scrivi_eventi_batch("calendario", [dict_partita] + dicts_spostamenti):
                                st.success("✅ Salvato!")
                                df_all = dati["Allenatori"]
                                ok, err = notifica_nuova_partita(partita["squadra"], partita["data"], partita["giorno"], partita["ora_partita"], partita["palestra"], "Casa", df_all)
                                if ok:
                                    st.info("📧 Notifica partita inviata agli allenatori.")
                                for nome_sq, (scelta_s, slot_list_s, opzioni_s) in scelte.items():
                                    if scelta_s in ("__nessuno__", "— Seleziona slot —"):
                                        continue
                                    try:
                                        idx_s = opzioni_s.index(scelta_s) - 1
                                    except ValueError:
                                        continue
                                    if 0 <= idx_s < len(slot_list_s):
                                        s_ev = slot_list_s[idx_s]
                                        ok2, _ = notifica_allenamento_spostato(nome_sq, s_ev["giorno"], s_ev["ora_inizio"], s_ev["palestra"], df_all)
                                        if ok2:
                                            st.info(f"📧 Notifica spostamento inviata per {nome_sq}.")
                                st.balloons()
                                invalida_cache()
                                reset_form()
                                st.rerun()

            if st.button("⚠️ Salva con conflitto da risolvere", key="salva_conflitto", use_container_width=True):
                scrivi_evento("calendario", {
                    "data": partita["data"], "giorno": partita["giorno"], "squadra": partita["squadra"],
                    "tipo": "⚠️ Partita in Casa (CONFLITTO DA RISOLVERE)",
                    "avversario": partita.get("avversario", ""),
                    "ora_inizio": partita["ora_partita"], "ora_fine": partita["ora_fine"],
                    "casa_fuori": "Casa", "palestra": partita["palestra"],
                })
                df_all = dati["Allenatori"]
                notifica_conflitto(partita["squadra"], partita["data"], df_all)
                st.warning("⚠️ Salvata con conflitto — notifica inviata agli allenatori.")
                invalida_cache()
                reset_form()
                st.rerun()

        # ── Allenamenti settimana da spostare (sempre visibile dopo analisi) ──
        _render_allenamenti_settimana(
            partita, orario_fisso_ss, df_squadre_ss, df_allenatori_ss, df_palestre_ss,
        )
