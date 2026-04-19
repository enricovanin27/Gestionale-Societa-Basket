"""
Sezione "👥 Gestione Utenti" — visibile solo agli admin.
Permette di: listare utenti, aggiungere nuovi utenti, cambiare ruolo, disabilitare.
"""

import time
import streamlit as st
from database import (
    lista_utenti, registra_utente,
    aggiorna_ruolo_utente, disabilita_utente,
)

_RUOLI_DISPONIBILI = ["admin", "allenatore", "genitore"]

_RUOLO_BADGE = {
    "admin":     "<span style='background:#c0392b;color:white;font-size:0.75em;font-weight:700;padding:2px 8px;border-radius:10px'>🔑 Admin</span>",
    "allenatore":"<span style='background:#2980b9;color:white;font-size:0.75em;font-weight:700;padding:2px 8px;border-radius:10px'>👤 Allenatore</span>",
    "genitore":  "<span style='background:#27ae60;color:white;font-size:0.75em;font-weight:700;padding:2px 8px;border-radius:10px'>👨‍👩‍👧 Genitore</span>",
}


def render():
    # Blocca accesso non-admin
    if st.session_state.get("ruolo") != "admin":
        st.error("⛔ Accesso riservato agli amministratori.")
        return

    st.markdown(
        "<div style='background:linear-gradient(135deg,#8B0000,#c0392b);color:white;"
        "padding:18px 24px;border-radius:12px;margin-bottom:20px'>"
        "<h2 style='margin:0;color:white'>👥 Gestione Utenti</h2>"
        "<p style='margin:4px 0 0 0;opacity:0.85;font-size:0.95em'>"
        "Aggiungi utenti, cambia ruolo, abilita/disabilita account</p>"
        "</div>",
        unsafe_allow_html=True,
    )

    # ── Avviso service_role_key ───────────────────────────────────────────────
    try:
        from database import _leggi_secrets_toml
        try:
            srk = st.secrets["supabase"].get("service_role_key", "")
        except Exception:
            srk = _leggi_secrets_toml().get("supabase", {}).get("service_role_key", "")

        if not srk:
            st.warning(
                "⚠️ **service_role_key non configurata.**  \n"
                "Le funzioni di gestione utenti richiedono la chiave di servizio Supabase.  \n"
                "Aggiungila in `.streamlit/secrets.toml`:  \n"
                "```toml\n[supabase]\nservice_role_key = \"eyJ...\"\n```  \n"
                "Trovi la chiave in **Supabase → Settings → API → service_role**."
            )
    except Exception:
        pass

    tab_lista, tab_aggiungi = st.tabs(["📋 Utenti registrati", "➕ Aggiungi utente"])

    # ═══════════════════════════════════════════════════════════════
    # TAB 1 — LISTA UTENTI
    # ═══════════════════════════════════════════════════════════════
    with tab_lista:
        if st.button("🔄 Aggiorna lista", key="refresh_utenti"):
            st.rerun()

        with st.spinner("Caricamento utenti..."):
            utenti = lista_utenti()

        if not utenti:
            st.info("Nessun utente trovato (o service_role_key non configurata).")
        else:
            st.caption(f"**{len(utenti)} utenti** registrati in Supabase Auth.")
            st.markdown("---")

            # Utente corrente (non mostrare pulsanti su se stesso)
            io_id = st.session_state.get("utente_id", "")

            for i, u in enumerate(utenti):
                uid     = u["id"]
                attivo  = u["attivo"]
                ruolo_u = u.get("ruolo", "allenatore")
                nome_u  = f"{u.get('nome', '')} {u.get('cognome', '')}".strip() or "—"
                email_u = u.get("email", "—")
                sono_io = uid == io_id

                with st.expander(
                    f"{'🟢' if attivo else '🔴'} {nome_u}  ·  {email_u}",
                    expanded=False,
                ):
                    c1, c2 = st.columns([3, 2])
                    with c1:
                        st.markdown(f"**Email:** {email_u}")
                        st.markdown(
                            f"**Ruolo attuale:** "
                            + _RUOLO_BADGE.get(ruolo_u, ruolo_u),
                            unsafe_allow_html=True,
                        )
                        st.markdown(f"**Stato:** {'✅ Attivo' if attivo else '❌ Disabilitato'}")
                        if sono_io:
                            st.caption("_(sei tu — non puoi modificare il tuo account da qui)_")

                    with c2:
                        if not sono_io:
                            # Cambio ruolo
                            idx_ruolo = _RUOLI_DISPONIBILI.index(ruolo_u) if ruolo_u in _RUOLI_DISPONIBILI else 1
                            nuovo_ruolo = st.selectbox(
                                "Ruolo",
                                _RUOLI_DISPONIBILI,
                                index=idx_ruolo,
                                key=f"ruolo_sel_{i}",
                            )
                            if st.button(
                                "💾 Salva ruolo",
                                key=f"btn_ruolo_{i}",
                                use_container_width=True,
                            ):
                                if aggiorna_ruolo_utente(uid, nuovo_ruolo):
                                    st.success(f"✅ Ruolo aggiornato a **{nuovo_ruolo}**.")
                                    time.sleep(0.5)
                                    st.rerun()

                            st.markdown("")

                            # Disabilita / riabilita
                            confirm_key = f"confirm_ban_{i}"
                            if st.session_state.get(confirm_key):
                                azione = "disabilitare" if attivo else "riabilitare"
                                st.warning(f"Vuoi davvero {azione} **{nome_u}**?")
                                col_y, col_n = st.columns(2)
                                with col_y:
                                    if st.button("✅ Sì", key=f"ban_yes_{i}", type="primary", use_container_width=True):
                                        if disabilita_utente(uid, disabilita=attivo):
                                            st.session_state.pop(confirm_key, None)
                                            stato = "disabilitato" if attivo else "riabilitato"
                                            st.success(f"✅ Utente {stato}.")
                                            time.sleep(0.5)
                                            st.rerun()
                                with col_n:
                                    if st.button("❌ No", key=f"ban_no_{i}", use_container_width=True):
                                        st.session_state.pop(confirm_key, None)
                                        st.rerun()
                            else:
                                label_btn = "🔒 Disabilita" if attivo else "🔓 Riabilita"
                                btn_type  = "primary" if not attivo else "secondary"
                                if st.button(
                                    label_btn,
                                    key=f"btn_ban_{i}",
                                    use_container_width=True,
                                ):
                                    st.session_state[confirm_key] = True
                                    st.rerun()

    # ═══════════════════════════════════════════════════════════════
    # TAB 2 — AGGIUNGI UTENTE
    # ═══════════════════════════════════════════════════════════════
    with tab_aggiungi:
        st.markdown("#### ➕ Nuovo utente")
        st.caption(
            "L'email verrà confermata automaticamente — non è necessaria la verifica via email. "
            "Comunica la password all'utente in modo sicuro."
        )

        with st.form("form_nuovo_utente"):
            c1, c2 = st.columns(2)
            with c1:
                new_nome = st.text_input("Nome", placeholder="Mario")
            with c2:
                new_cognome = st.text_input("Cognome", placeholder="Rossi")

            new_email = st.text_input("Email", placeholder="mario.rossi@esempio.it")

            new_pwd = st.text_input(
                "Password",
                type="password",
                placeholder="Almeno 6 caratteri",
            )

            new_ruolo = st.selectbox(
                "Ruolo",
                _RUOLI_DISPONIBILI,
                index=1,
                help="admin = accesso completo · allenatore = vede le sue squadre · genitore = solo lettura",
            )

            st.markdown("")
            aggiungi = st.form_submit_button(
                "➕ Crea utente",
                type="primary",
                use_container_width=True,
            )

        if aggiungi:
            errori = []
            if not new_nome:
                errori.append("Nome mancante.")
            if not new_cognome:
                errori.append("Cognome mancante.")
            if not new_email or "@" not in new_email:
                errori.append("Email non valida.")
            if not new_pwd or len(new_pwd) < 6:
                errori.append("Password troppo corta (minimo 6 caratteri).")

            if errori:
                for e in errori:
                    st.error(f"❌ {e}")
            else:
                with st.spinner("Creazione utente in corso..."):
                    ok, err = registra_utente(
                        new_email.strip().lower(),
                        new_pwd,
                        new_nome.strip(),
                        new_cognome.strip(),
                        new_ruolo,
                    )
                if ok:
                    st.success(
                        f"✅ Utente **{new_nome} {new_cognome}** ({new_ruolo}) creato con successo!  \n"
                        f"Email: `{new_email}`"
                    )
                else:
                    st.error(f"❌ {err}")
