import streamlit as st
import pandas as pd
from datetime import date
from logic import parse_data, GIORNI_SETTIMANA, _norm
from sheets import carica_tutti_i_dati
from views._components import get_team_color

MESI_IT = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
]


def _ore_to_min(s: str) -> int:
    try:
        h, m = str(s).strip().split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return 9999


def _tipo_label(tipo: str) -> tuple:
    t = str(tipo)
    if "CONFLITTO" in t:
        prefisso = "⚠️ "
    elif "[PROV]" in t:
        prefisso = "🕐 "
    elif "[DA SPOSTARE]" in t:
        prefisso = "🔄 "
    else:
        prefisso = ""

    if "Partita in Casa" in t:
        return prefisso + "🏠", "Partita in casa"
    if "Fuori Casa" in t or "Partita Fuori" in t:
        return prefisso + "🚌", "Partita trasferta"
    if "Allenamento" in t:
        return "🔄", "Allenamento spostato"
    return "📅", t.strip()


def _render_oggi(orario_fisso: pd.DataFrame, df_cal: pd.DataFrame, oggi: date):
    """Sezione 'Oggi': card colorate per allenamenti e partite del giorno."""
    oggi_giorno = GIORNI_SETTIMANA[oggi.weekday()]

    # Allenamenti fissi di oggi
    allenamenti_oggi = pd.DataFrame()
    if not orario_fisso.empty and "giorno" in orario_fisso.columns:
        mask = orario_fisso["giorno"].str.lower().str.strip() == oggi_giorno
        allenamenti_oggi = orario_fisso[mask].copy()
        if not allenamenti_oggi.empty:
            try:
                allenamenti_oggi = allenamenti_oggi.sort_values(
                    "ora_inizio", key=lambda x: x.map(_ore_to_min)
                )
            except Exception:
                pass

    # Partite di oggi dal calendario
    partite_oggi = []
    if not df_cal.empty:
        for _, row in df_cal.iterrows():
            if parse_data(row.get("Data", "")) == oggi:
                partite_oggi.append(row)

    n_total = len(allenamenti_oggi) + len(partite_oggi)

    if n_total == 0:
        st.info("Nessun allenamento né partita programmata per oggi.")
        return

    # Raggruppa in righe da 4 card
    items = []
    for _, ev in allenamenti_oggi.iterrows():
        items.append(("fisso", ev))
    for row in partite_oggi:
        items.append(("partita", row))

    per_row = 4
    for i in range(0, len(items), per_row):
        batch = items[i:i + per_row]
        cols = st.columns(len(batch))
        for col, (kind, ev) in zip(cols, batch):
            with col:
                if kind == "fisso":
                    team       = str(ev.get("squadra",    "")).strip()
                    ora_i      = str(ev.get("ora_inizio", "")).strip()
                    ora_f      = str(ev.get("ora_fine",   "")).strip()
                    pal        = str(ev.get("palestra",   "")).strip().capitalize()
                    allenatori = str(ev.get("allenatori", "")).strip()
                    color = get_team_color(team)
                    st.markdown(
                        f"""<div style="background:{color};border-radius:12px;
                                    padding:14px 16px;
                                    box-shadow:0 3px 10px rgba(0,0,0,0.2)">
                          <div style="color:white;font-weight:800;font-size:1.05em">
                            🏀 {team}
                          </div>
                          <div style="color:rgba(255,255,255,0.92);font-size:0.9em;margin-top:5px">
                            ⏰ {ora_i} → {ora_f}
                          </div>
                          <div style="color:rgba(255,255,255,0.78);font-size:0.85em">
                            🏟️ {pal}
                          </div>
                          {"<div style='color:rgba(255,255,255,0.65);font-size:0.8em'>👤 " + allenatori + "</div>" if allenatori else ""}
                        </div>""",
                        unsafe_allow_html=True,
                    )
                else:
                    tipo    = str(ev.get("Tipo",      ""))
                    squadra = str(ev.get("Squadra",   ""))
                    ora     = str(ev.get("Ora Inizio",""))
                    pal     = str(ev.get("Palestra",  ""))
                    is_casa = "Casa" in tipo
                    bg      = "#0D3B6E" if is_casa else "#4A235A"
                    icon    = "🏠" if is_casa else "🚌"
                    lbl     = "In Casa" if is_casa else "Trasferta"
                    border  = "#FF4444" if "CONFLITTO" in tipo else "rgba(255,255,255,0.2)"
                    st.markdown(
                        f"""<div style="background:{bg};border-radius:12px;
                                    padding:14px 16px;border-left:4px solid {border};
                                    box-shadow:0 3px 10px rgba(0,0,0,0.2)">
                          <div style="color:white;font-weight:800;font-size:1.05em">
                            {icon} Partita {lbl}
                          </div>
                          <div style="color:rgba(255,255,255,0.92);font-size:0.9em;margin-top:5px">
                            🏀 {squadra}
                          </div>
                          <div style="color:rgba(255,255,255,0.82);font-size:0.88em">
                            ⏰ {ora}
                          </div>
                          {"<div style='color:rgba(255,255,255,0.7);font-size:0.83em'>🏟️ " + pal + "</div>" if pal else ""}
                        </div>""",
                        unsafe_allow_html=True,
                    )


def render():
    oggi = date.today()
    giorno_it = GIORNI_SETTIMANA[oggi.weekday()].capitalize()
    data_it = f"{oggi.day} {MESI_IT[oggi.month - 1]} {oggi.year}"

    st.markdown(
        "<h1 style='margin-bottom:2px'>🏀 Oderzo Basket — Gestione Stagione</h1>",
        unsafe_allow_html=True,
    )
    st.markdown(
        f"<p style='color:#888;font-size:1.05em;margin-top:0'>"
        f"📆 <strong>{giorno_it}</strong>, {data_it}</p>",
        unsafe_allow_html=True,
    )

    if st.button("🔄 Aggiorna", key="home_refresh", help="Ricarica i dati da Google Sheets"):
        carica_tutti_i_dati.clear()
        st.rerun()

    st.markdown("---")

    # ── Carica tutti i dati ───────────────────────────────────────
    dati        = carica_tutti_i_dati()
    df_cal      = dati.get("Calendario Definitivo", pd.DataFrame())
    orario_fisso = dati.get("Orario Fisso", pd.DataFrame())

    # ── Contatori stagione ────────────────────────────────────────
    n_casa = n_fuori = n_spostati = n_conflitti = 0
    eventi_futuri = []

    if not df_cal.empty and "Tipo" in df_cal.columns:
        tipo_col = df_cal["Tipo"].astype(str)
        n_casa      = int(tipo_col.str.contains("Partita in Casa",  na=False).sum())
        n_fuori     = int(tipo_col.str.contains("Fuori Casa",        na=False).sum())
        n_spostati  = int(tipo_col.str.contains("Allenamento spostato", na=False).sum())
        n_conflitti = int(tipo_col.str.contains("CONFLITTO",         na=False).sum())

        for _, row in df_cal.iterrows():
            data_ev = parse_data(row.get("Data", ""))
            if data_ev is not None and data_ev >= oggi:
                eventi_futuri.append({
                    "data":     data_ev,
                    "data_str": data_ev.strftime("%d/%m/%Y"),
                    "giorno":   str(row.get("Giorno", "")).capitalize(),
                    "squadra":  str(row.get("Squadra", "")),
                    "tipo":     str(row.get("Tipo", "")),
                    "ora":      str(row.get("Ora Inizio", "")),
                })
        eventi_futuri.sort(key=lambda x: (x["data"], x["ora"]))

    # ── Sezione OGGI ──────────────────────────────────────────────
    st.markdown("### 📍 Oggi")
    _render_oggi(orario_fisso, df_cal, oggi)

    st.markdown("---")

    # ── Layout 3 colonne ──────────────────────────────────────────
    col1, col2, col3 = st.columns(3)

    # ── Colonna 1: Prossimi eventi ────────────────────────────────
    with col1:
        with st.container(border=True):
            st.markdown("#### 📅 Prossimi eventi")
            prossimi = eventi_futuri[:5]
            if not prossimi:
                st.info("Nessun evento programmato.")
            else:
                for ev in prossimi:
                    emoji, etichetta = _tipo_label(ev["tipo"])
                    is_conflict = "CONFLITTO" in ev["tipo"]
                    bg = "#3D0000" if is_conflict else "#1a3a5c"
                    st.markdown(
                        f"""<div style="background:{bg};border-radius:8px;
                                    padding:8px 12px;margin:4px 0">
                          <div style="color:white;font-weight:700;font-size:0.92em">
                            {emoji} {ev['squadra']}
                          </div>
                          <div style="color:rgba(255,255,255,0.8);font-size:0.82em">
                            {ev['giorno']} {ev['data_str']} &nbsp;·&nbsp; {ev['ora']}
                          </div>
                          <div style="color:rgba(255,255,255,0.55);font-size:0.76em">
                            {etichetta}
                          </div>
                        </div>""",
                        unsafe_allow_html=True,
                    )

    # ── Colonna 2: Conflitti aperti ───────────────────────────────
    with col2:
        with st.container(border=True):
            st.markdown("#### ⚠️ Conflitti aperti")
            if n_conflitti == 0:
                st.success("Nessun conflitto da risolvere.")
            else:
                st.error(
                    f"**{n_conflitti}** conflict{'o' if n_conflitti == 1 else 'i'} "
                    f"da risolvere"
                )
                if st.button(
                    "📋 Vai al Calendario",
                    key="home_vai_calendario",
                    use_container_width=True,
                    type="primary",
                ):
                    st.session_state["nav_radio"] = "📋 Calendario Definitivo"
                    st.rerun()

    # ── Colonna 3: Stagione in corso ──────────────────────────────
    with col3:
        with st.container(border=True):
            st.markdown("#### 📊 Stagione in corso")
            if df_cal.empty:
                st.info("Nessun dato disponibile.")
            else:
                st.metric("🏠 Partite in casa",      n_casa)
                st.metric("🚌 Partite fuori casa",   n_fuori)
                st.metric("🔄 Allenamenti spostati", n_spostati)
