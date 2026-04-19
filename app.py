import streamlit as st
import logic
from logic import is_settimana_prossima, trova_conflitti_allenamenti
from database import (
    leggi_calendario, leggi_orario_fisso, reset_form, _leggi_secrets_toml,
    login_utente, logout_utente, reset_password_email,
)
# LEGACY: from sheets import leggi_foglio, reset_form

import views.home                as page_home
import views.calendario          as page_calendario
import views.vista_allenatore    as page_allenatore
import views.setup               as page_setup
import views.orario_allenamenti  as page_allenamenti
import views.vista_squadra       as page_squadra
import views.gestione_utenti         as page_utenti
import views.gestione_calendario_fip as page_fip
import views.scheduling              as page_scheduling

try:
    logic.EMAIL_MITTENTE = st.secrets["email"]["mittente"]
    logic.EMAIL_PASSWORD  = st.secrets["email"]["password"]
except Exception:
    _s = _leggi_secrets_toml()
    logic.EMAIL_MITTENTE = _s.get("email", {}).get("mittente", logic.EMAIL_MITTENTE)
    logic.EMAIL_PASSWORD  = _s.get("email", {}).get("password", logic.EMAIL_PASSWORD)

st.set_page_config(page_title="Gestione Società Sportiva", page_icon="🏀", layout="wide")

# ── VISTA PUBBLICA SQUADRA (nessun login, accesso via ?squadra=NomeSquadra) ──
try:
    squadra_param = st.query_params.get("squadra", "")
except Exception:
    squadra_param = ""

if squadra_param:
    st.session_state["ruolo"]            = "squadra"
    st.session_state["squadra_pubblica"] = squadra_param
    page_squadra.render()
    st.stop()


# ── SCHERMATA DI LOGIN ────────────────────────────────────────────────────────

def _render_login():
    """Schermata di login con email e password."""
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.markdown(
            "<div style='text-align:center;margin-bottom:24px'>"
            "<span style='font-size:3em'>🏀</span>"
            "<h2 style='margin:8px 0 4px 0'>Oderzo Basket</h2>"
            "<p style='color:#888;margin:0'>Gestione Società Sportiva</p>"
            "</div>",
            unsafe_allow_html=True,
        )

        with st.form("form_login", clear_on_submit=False):
            email = st.text_input(
                "Email",
                placeholder="nome@esempio.it",
                key="login_email_input",
            )
            password = st.text_input(
                "Password",
                type="password",
                placeholder="Password",
                key="login_pwd_input",
            )
            accedi = st.form_submit_button(
                "Accedi",
                type="primary",
                use_container_width=True,
            )

        if accedi:
            if not email or not password:
                st.error("Inserisci email e password.")
            else:
                with st.spinner("Accesso in corso..."):
                    ok, user_dict, err = login_utente(email.strip().lower(), password)
                if ok:
                    st.session_state["autenticato"]    = True
                    st.session_state["ruolo"]          = user_dict["ruolo"]
                    st.session_state["utente_email"]   = user_dict["email"]
                    st.session_state["utente_nome"]    = user_dict["nome"]
                    st.session_state["utente_cognome"] = user_dict["cognome"]
                    st.session_state["utente_id"]      = user_dict["user_id"]
                    st.rerun()
                else:
                    st.error(f"❌ {err}")

        # Link "Hai dimenticato la password?"
        with st.expander("🔑 Hai dimenticato la password?"):
            st.markdown("Inserisci la tua email per ricevere il link di reset.")
            email_reset = st.text_input(
                "Email",
                placeholder="nome@esempio.it",
                key="reset_email_input",
            )
            if st.button("Invia email di reset", key="btn_reset_pwd"):
                if not email_reset:
                    st.warning("Inserisci la tua email.")
                else:
                    ok_r, msg_r = reset_password_email(email_reset.strip().lower())
                    if ok_r:
                        st.success(f"✅ {msg_r}")
                    else:
                        st.error(f"❌ {msg_r}")

        # ── FALLBACK LEGACY (password singola, solo emergenza) ─────────────────
        # Mantenuto come backup nel caso Supabase Auth non sia ancora configurato.
        # Commentato una volta che il nuovo sistema è operativo.
        # with st.expander("🔧 Accesso di emergenza (admin)"):
        #     pwd_em = st.text_input("Password di emergenza", type="password", key="emergency_pwd")
        #     if st.button("Accedi (emergenza)", key="btn_emergency"):
        #         try:
        #             pwd_admin = st.secrets["app"]["password"]
        #         except Exception:
        #             pwd_admin = _leggi_secrets_toml().get("app", {}).get("password", "oderzo2026")
        #         if pwd_em == pwd_admin:
        #             st.session_state["autenticato"] = True
        #             st.session_state["ruolo"]       = "admin"
        #             st.session_state["utente_nome"] = "Admin"
        #             st.session_state["utente_email"] = ""
        #             st.rerun()
        #         else:
        #             st.error("Password errata.")


if not st.session_state.get("autenticato"):
    _render_login()
    st.stop()

# ── Retrocompatibilità sessioni pre-auth ─────────────────────────────────────
if "ruolo" not in st.session_state:
    st.session_state["ruolo"] = "admin"

if "form_key" not in st.session_state:
    st.session_state["form_key"] = 0
if "fuori_casa" not in st.session_state:
    st.session_state["fuori_casa"] = False

ruolo = st.session_state["ruolo"]

# ── NAVIGAZIONE in base al ruolo ──────────────────────────────────────────────
_NAV_ADMIN = [
    "🏠 Home",
    "🏀 Orario Allenamenti",
    "📋 Calendario Partite",
    "📋 Gestione Calendario FIP",
    "👤 Vista Allenatore",
    "⚙️ Setup",
    "👥 Gestione Utenti",
    "🗓️ Scheduling",
]
_NAV_ALLENATORE = [
    "🏠 Home",
    "🏀 Orario Allenamenti",
    "📋 Calendario Partite",
    "📋 Gestione Calendario FIP",
    "👤 Vista Allenatore",
]
_NAV_GENITORE = [
    "📋 Calendario Partite",
]

if ruolo == "admin":
    _NAV_OPTIONS = _NAV_ADMIN
elif ruolo == "allenatore":
    _NAV_OPTIONS = _NAV_ALLENATORE
else:
    _NAV_OPTIONS = _NAV_GENITORE

if st.session_state.get("nav_radio") not in _NAV_OPTIONS:
    st.session_state["nav_radio"] = _NAV_OPTIONS[0]

# ── SIDEBAR ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("🏀 Gestione Società")

    # Badge ruolo
    _BADGE = {
        "admin":     ("<span style='background:#c0392b;color:white;font-size:0.78em;"
                      "font-weight:700;padding:3px 10px;border-radius:12px'>🔑 Admin</span>"),
        "allenatore":("<span style='background:#2980b9;color:white;font-size:0.78em;"
                      "font-weight:700;padding:3px 10px;border-radius:12px'>👤 Allenatore</span>"),
        "genitore":  ("<span style='background:#27ae60;color:white;font-size:0.78em;"
                      "font-weight:700;padding:3px 10px;border-radius:12px'>👨‍👩‍👧 Genitore</span>"),
    }
    st.markdown(_BADGE.get(ruolo, _BADGE["genitore"]), unsafe_allow_html=True)
    st.markdown("---")

    # Alert conflitti (solo se ha accesso al calendario)
    if ruolo in ("admin", "allenatore"):
        df_cal = leggi_calendario()
        if not df_cal.empty and "Tipo" in df_cal.columns:
            conflitti_df = df_cal[df_cal["Tipo"].str.contains("CONFLITTO", na=False)]
            n_urgenti = sum(1 for _, r in conflitti_df.iterrows() if is_settimana_prossima(r.get("Data", "")))
            n_totali  = len(conflitti_df)
            if n_urgenti > 0:
                st.error(f"🚨 {n_urgenti} conflitti partite URGENTI")
            elif n_totali > 0:
                st.warning(f"⚠️ {n_totali} conflitti partite da risolvere")

        df_of = leggi_orario_fisso()
        n_conf_all = len(trova_conflitti_allenamenti(df_of))
        if n_conf_all > 0:
            st.error(f"🚨 {n_conf_all} conflitti tra allenamenti")

    sezione = st.radio(
        "nav",
        _NAV_OPTIONS,
        label_visibility="collapsed",
        key="nav_radio",
    )
    st.markdown("---")

    # ── Profilo utente ────────────────────────────────────────────
    nome_display = st.session_state.get("utente_nome", "")
    cognome_display = st.session_state.get("utente_cognome", "")
    email_display = st.session_state.get("utente_email", "")
    nome_completo = f"{nome_display} {cognome_display}".strip() or email_display or "Utente"

    st.markdown(
        f"<div style='background:#1a3a5c;border-radius:10px;padding:10px 14px;"
        f"margin-bottom:8px'>"
        f"<div style='color:white;font-weight:700;font-size:0.95em'>{nome_completo}</div>"
        f"<div style='color:rgba(255,255,255,0.6);font-size:0.78em;margin-top:2px'>"
        f"{email_display}</div>"
        f"</div>",
        unsafe_allow_html=True,
    )

    if st.button("🚪 Esci", use_container_width=True):
        logout_utente()
        for k in list(st.session_state.keys()):
            del st.session_state[k]
        st.rerun()

    st.caption("Gestione Società Sportiva v3.1")

# ── RESET STATE AL CAMBIO PAGINA ─────────────────────────────────────────────
if st.session_state.get("_pagina_corrente") != sezione:
    reset_form()
    st.session_state["_pagina_corrente"] = sezione

# ── ROUTING ──────────────────────────────────────────────────────────────────
PAGINE = {
    "🏠 Home":                       page_home.render,
    "🏀 Orario Allenamenti":         page_allenamenti.render,
    "📋 Calendario Partite":         page_calendario.render,
    "📋 Gestione Calendario FIP":    page_fip.render,
    "👤 Vista Allenatore":           page_allenatore.render,
    "⚙️ Setup":                      page_setup.render,
    "👥 Gestione Utenti":            page_utenti.render,
    "🗓️ Scheduling":                 page_scheduling.render,
}

PAGINE[sezione]()
