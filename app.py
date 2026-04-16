import pathlib
import streamlit as st
import logic
from logic import is_settimana_prossima, trova_conflitti_allenamenti
from database import leggi_calendario, leggi_orario_fisso, reset_form, _leggi_secrets_toml
# LEGACY: from sheets import leggi_foglio, reset_form

import views.home                as page_home
import views.calendario          as page_calendario
import views.vista_allenatore    as page_allenatore
import views.setup               as page_setup
import views.orario_allenamenti  as page_allenamenti
import views.vista_squadra       as page_squadra

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

# ── LOGIN ─────────────────────────────────────────────────────────────────────
if not st.session_state.get("autenticato"):
    st.title("🏀 Oderzo Basket — Gestione Spazi")
    st.markdown("---")
    pwd = st.text_input("Password", type="password", placeholder="Inserisci la password")
    if st.button("Accedi", type="primary", use_container_width=True):
        try:
            pwd_admin      = st.secrets["app"]["password"]
            pwd_allenatore = st.secrets["app"].get("password_allenatori", "oderzo-staff")
        except Exception:
            _s = _leggi_secrets_toml().get("app", {})
            pwd_admin      = _s.get("password", "oderzo2026")
            pwd_allenatore = _s.get("password_allenatori", "oderzo-staff")

        if pwd == pwd_admin:
            st.session_state["autenticato"] = True
            st.session_state["ruolo"]       = "admin"
            st.rerun()
        elif pwd == pwd_allenatore:
            st.session_state["autenticato"] = True
            st.session_state["ruolo"]       = "allenatore"
            st.rerun()
        else:
            st.error("❌ Password errata.")
    st.stop()

# Garantisce retrocompatibilità: sessioni già aperte prima dell'introduzione del ruolo
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
    "👤 Vista Allenatore",
    "⚙️ Setup",
]
_NAV_ALLENATORE = [
    "🏠 Home",
    "🏀 Orario Allenamenti",
    "📋 Calendario Partite",
    "👤 Vista Allenatore",
]
_NAV_OPTIONS = _NAV_ADMIN if ruolo == "admin" else _NAV_ALLENATORE

if st.session_state.get("nav_radio") not in _NAV_OPTIONS:
    st.session_state["nav_radio"] = _NAV_OPTIONS[0]

# ── SIDEBAR ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("🏀 Gestione Società")

    # Badge ruolo
    if ruolo == "admin":
        st.markdown(
            "<span style='background:#c0392b;color:white;font-size:0.78em;"
            "font-weight:700;padding:3px 10px;border-radius:12px'>🔑 Admin</span>",
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            "<span style='background:#2980b9;color:white;font-size:0.78em;"
            "font-weight:700;padding:3px 10px;border-radius:12px'>👤 Allenatore</span>",
            unsafe_allow_html=True,
        )

    st.markdown("---")

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

    if st.button("🚪 Esci", use_container_width=True):
        for k in list(st.session_state.keys()):
            del st.session_state[k]
        st.rerun()

    st.caption("Gestione Società Sportiva v3.0")

# ── RESET STATE AL CAMBIO PAGINA ─────────────────────────────────────────────
if st.session_state.get("_pagina_corrente") != sezione:
    reset_form()
    st.session_state["_pagina_corrente"] = sezione

# ── ROUTING ──────────────────────────────────────────────────────────────────
PAGINE = {
    "🏠 Home":               page_home.render,
    "🏀 Orario Allenamenti": page_allenamenti.render,
    "📋 Calendario Partite": page_calendario.render,
    "👤 Vista Allenatore":   page_allenatore.render,
    "⚙️ Setup":              page_setup.render,
}

PAGINE[sezione]()
