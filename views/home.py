import streamlit as st
import pandas as pd
from datetime import date, timedelta
from logic import parse_data, GIORNI_SETTIMANA, _norm
from database import carica_tutti_i_dati_db, invalida_cache, leggi_orario_settimana
# LEGACY: from sheets import carica_tutti_i_dati
from views._components import get_team_color, FLAG_EMOJIS

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


def _render_oggi(
    orario_fisso: pd.DataFrame,
    df_cal: pd.DataFrame,
    oggi: date,
    orario_settimana: pd.DataFrame = None,
    squadre_filter: set = None,
):
    """
    Vista 'Oggi': tabella compatta Ora | Squadra | Tipo | Palestra | Allenatori.
    squadre_filter: se non None, mostra solo le squadre nell'insieme (per vista allenatore).
    """
    oggi_giorno = GIORNI_SETTIMANA[oggi.weekday()]
    oggi_str    = oggi.strftime("%Y-%m-%d")

    # ── Costruisci override lookup per oggi ───────────────────────────
    sett_today: dict = {}
    if orario_settimana is not None and not orario_settimana.empty:
        for _, srow in orario_settimana.iterrows():
            if str(srow.get("data", "")) == oggi_str:
                _sqn = _norm(str(srow.get("squadra", "")).strip())
                sett_today[_sqn] = srow

    rows: list = []
    inclusi: set = set()

    # ── Allenamenti fissi con overrides ───────────────────────────────
    if not orario_fisso.empty and "giorno" in orario_fisso.columns:
        mask = orario_fisso["giorno"].str.lower().str.strip() == oggi_giorno
        for _, ev in orario_fisso[mask].iterrows():
            sqn  = _norm(str(ev.get("squadra", "")).strip())
            ov   = sett_today.get(sqn)
            if ov is not None:
                inclusi.add(sqn)
                if ov.get("annullato", False):
                    continue  # saltato questa settimana
                sq   = str(ov.get("squadra",  ev.get("squadra",  ""))).strip()
                ora  = str(ov.get("ora_inizio","")).strip()[:5]
                pal  = str(ov.get("palestra",  ev.get("palestra",""))).strip().capitalize()
                all_ = str(ov.get("allenatori",ev.get("allenatori",""))).strip()
                flag = FLAG_EMOJIS.get(str(ov.get("flag","normale")), "")
            else:
                sq   = str(ev.get("squadra",   "")).strip()
                ora  = str(ev.get("ora_inizio", "")).strip()[:5]
                pal  = str(ev.get("palestra",   "")).strip().capitalize()
                all_ = str(ev.get("allenatori", "")).strip()
                flag = ""
            if squadre_filter and _norm(sq) not in squadre_filter:
                continue
            rows.append({
                "Ora": ora, "Squadra": f"{flag} {sq}".strip() if flag else sq,
                "Tipo": "🏀 Allenamento", "Palestra": pal, "Allenatori": all_,
            })

    # ── Allenamenti extra di oggi (orario_settimana non fisso) ────────
    if orario_settimana is not None and not orario_settimana.empty:
        for _, srow in orario_settimana.iterrows():
            if str(srow.get("data", "")) != oggi_str:
                continue
            sqn = _norm(str(srow.get("squadra", "")).strip())
            if sqn in inclusi or srow.get("annullato", False):
                continue
            sq   = str(srow.get("squadra",   "")).strip()
            ora  = str(srow.get("ora_inizio", "")).strip()[:5]
            pal  = str(srow.get("palestra",   "")).strip().capitalize()
            all_ = str(srow.get("allenatori", "")).strip()
            flag = FLAG_EMOJIS.get(str(srow.get("flag", "normale")), "")
            if squadre_filter and _norm(sq) not in squadre_filter:
                continue
            rows.append({
                "Ora": ora, "Squadra": f"{flag} {sq}".strip() if flag else sq,
                "Tipo": "🏀 Allenamento (extra)", "Palestra": pal, "Allenatori": all_,
            })

    # ── Partite di oggi ───────────────────────────────────────────────
    if not df_cal.empty:
        for _, ev in df_cal.iterrows():
            if parse_data(ev.get("Data", "")) != oggi:
                continue
            sq    = str(ev.get("Squadra",    "")).strip()
            if squadre_filter and _norm(sq) not in squadre_filter:
                continue
            tipo  = str(ev.get("Tipo",       ""))
            ora   = str(ev.get("Ora Inizio", "")).strip()[:5]
            pal   = str(ev.get("Palestra",   "")).strip()
            if "Casa" in tipo:
                tipo_lbl = "🏠 Partita Casa"
            elif "Fuori" in tipo:
                tipo_lbl = "🚌 Partita Trasferta"
            else:
                tipo_lbl = "📅 Partita"
            if "CONFLITTO" in tipo:
                tipo_lbl = "⚠️ " + tipo_lbl
            rows.append({
                "Ora": ora, "Squadra": sq,
                "Tipo": tipo_lbl, "Palestra": pal, "Allenatori": "",
            })

    if not rows:
        st.info("Nessun allenamento né partita programmata per oggi.")
        return

    # Ordina per orario crescente
    rows.sort(key=lambda r: _ore_to_min(r["Ora"]) if r["Ora"] else 9999)

    for row in rows:
        tipo = row["Tipo"]
        if "CONFLITTO" in tipo:
            bg = "#8B0000"
        elif "ANNULLATO" in tipo.upper() or "annullato" in tipo:
            bg = "#555555"
        elif "extra" in tipo.lower():
            bg = "#1a4a2e"
        elif "Partita" in tipo:
            bg = "#0D3B6E" if "Casa" in tipo else "#4A235A"
        else:
            bg = "#1a3a5c"

        all_html = (
            f" &nbsp;&nbsp; 👤 {row['Allenatori']}"
            if row["Allenatori"] and row["Allenatori"] not in ("", "nan", "None")
            else ""
        )
        pal_html = row["Palestra"] if row["Palestra"] and row["Palestra"] not in ("", "nan") else "—"

        st.markdown(
            f"<div style='background:{bg};border-radius:10px;padding:10px 15px;"
            f"margin:5px 0;box-shadow:0 2px 8px rgba(0,0,0,0.22)'>"
            f"<div style='display:flex;justify-content:space-between;align-items:center'>"
            f"<span style='color:white;font-weight:800;font-size:1.0em'>"
            f"{tipo} &nbsp; <span style='font-weight:600'>{row['Squadra']}</span></span>"
            f"<span style='color:rgba(255,255,255,0.95);font-weight:700;font-size:0.9em'>"
            f"⏰ {row['Ora']}</span>"
            f"</div>"
            f"<div style='color:rgba(255,255,255,0.8);font-size:0.85em;margin-top:4px'>"
            f"🏟️ {pal_html}{all_html}"
            f"</div>"
            f"</div>",
            unsafe_allow_html=True,
        )


_STATI_FIP = {
    "da_spostare": ("⚠️", "#c0392b"),
    "provvisoria": ("🕐", "#5d6d7e"),
    "confermata":  ("✅", "#1e8449"),
}


def _render_fip_dashboard(df_cal: pd.DataFrame, oggi: date):
    """Riquadro '📊 Stato Calendario FIP' nella home."""
    _go_fip = False
    with st.container(border=True):
        st.markdown("#### 📊 Stato Calendario FIP")

        if df_cal.empty or "tipo_import" not in df_cal.columns:
            st.info("Nessuna partita FIP importata.")
            return

        df_fip = df_cal[df_cal["tipo_import"].isin(["provvisorio", "definitivo"])].copy()

        if df_fip.empty:
            st.info("Nessuna partita FIP importata ancora.")
            return

        totale = len(df_fip)
        contatori = df_fip["stato"].value_counts().to_dict()
        n_confermate = contatori.get("confermata", 0)

        # Barra di progresso
        progresso = n_confermate / totale if totale > 0 else 0
        st.markdown(
            f"**Calendario completato:** {n_confermate}/{totale} partite confermate"
        )
        st.progress(progresso)

        # Contatori per stato in colonnine
        cols = st.columns(len(_STATI_FIP))
        for col, (stato, (emoji, color)) in zip(cols, _STATI_FIP.items()):
            n = contatori.get(stato, 0)
            col.markdown(
                f"<div style='text-align:center'>"
                f"<div style='font-size:1.1em'>{emoji}</div>"
                f"<div style='font-weight:700;color:{color};font-size:1em'>{n}</div>"
                f"<div style='font-size:0.7em;color:#aaa'>{stato}</div>"
                f"</div>",
                unsafe_allow_html=True,
            )

        # Partite urgenti questa settimana (da_spostare entro 7 giorni)
        fine_settimana = oggi + timedelta(days=7)
        urgenti = []
        for _, row in df_fip.iterrows():
            if row.get("stato") != "da_spostare":
                continue
            data_ev = parse_data(row.get("Data", ""))
            if data_ev is not None and oggi <= data_ev <= fine_settimana:
                urgenti.append(row)

        if urgenti:
            st.markdown("---")
            st.markdown(f"**🚨 {len(urgenti)} partite urgenti questa settimana:**")
            for row in urgenti:
                data_str = str(row.get("Data", ""))
                try:
                    data_fmt = date.fromisoformat(data_str).strftime("%d/%m")
                except Exception:
                    data_fmt = data_str
                ora  = str(row.get("Ora Inizio", ""))[:5]
                sq   = str(row.get("Squadra", ""))
                avv  = str(row.get("Avversario", ""))
                stato_row = str(row.get("stato", ""))
                emoji_s, color_s = _STATI_FIP.get(stato_row, ("❓", "#555"))
                st.markdown(
                    f"<div style='background:#3d1010;border-radius:6px;padding:6px 10px;"
                    f"margin:3px 0;font-size:0.85em'>"
                    f"{emoji_s} <strong>{sq}</strong> vs {avv} — {data_fmt} {ora}"
                    f"</div>",
                    unsafe_allow_html=True,
                )
        elif n_confermate < totale:
            st.markdown("---")
            n_da_spostare = contatori.get("da_spostare", 0)
            if n_da_spostare > 0:
                st.warning(f"{n_da_spostare} partite da spostare — nessuna urgente questa settimana.")
            else:
                st.success("Nessuna partita urgente questa settimana.")

        # Link rapido alla pagina
        _go_fip = st.button("📋 Apri Gestione Calendario FIP", key="home_fip_link",
                            use_container_width=True)
    if _go_fip:
        st.session_state["nav_radio"] = "📋 Gestione Calendario FIP"
        st.rerun()
    return


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

    if st.button("🔄 Aggiorna", key="home_refresh", help="Ricarica i dati da Supabase"):
        invalida_cache()
        st.rerun()

    st.markdown("---")

    # ── Carica tutti i dati ───────────────────────────────────────
    dati         = carica_tutti_i_dati_db()
    df_cal       = dati.get("Calendario Definitivo", pd.DataFrame())
    orario_fisso = dati.get("Orario Fisso", pd.DataFrame())
    # Override settimana corrente (per allenamenti modificati/extra/annullati)
    orario_settimana_oggi = leggi_orario_settimana(
        data_inizio=oggi.strftime("%Y-%m-%d"),
        data_fine=oggi.strftime("%Y-%m-%d"),
    )

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
    _render_oggi(orario_fisso, df_cal, oggi, orario_settimana_oggi)

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

    st.markdown("---")

    # ── Dashboard Stato Calendario FIP ───────────────────────────────────────
    ruolo = st.session_state.get("ruolo", "genitore")
    if ruolo in ("admin", "allenatore"):
        _render_fip_dashboard(df_cal, oggi)
