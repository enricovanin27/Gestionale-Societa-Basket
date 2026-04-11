import time
import streamlit as st
from datetime import datetime
from logic import GIORNI
from sheets import (
    leggi_foglio, scrivi_riga, scrivi_righe_batch,
    carica_tutti_i_dati, aggiorna_riga, elimina_riga,
)
from views._components import get_team_color

# Abbreviazioni per la colonna Giorni nella tabella
_GIORNI_ABBR = {g: g[:2] for g in GIORNI}   # "Lunedi" → "Lu", ecc.


def _parse_time(val, default="00:00"):
    try:
        return datetime.strptime(str(val).strip(), "%H:%M").time()
    except Exception:
        return datetime.strptime(default, "%H:%M").time()


def _int_safe(val, default=0):
    try:
        return int(float(str(val).strip().replace(",", ".")))
    except Exception:
        return default


def _find_col(df, *keywords):
    """Trova il nome colonna che contiene una delle keyword (case-insensitive)."""
    for kw in keywords:
        for c in df.columns:
            if kw.lower() in c.lower():
                return c
    return None


def _render_tabella_azioni(df, foglio: str, key: str, cols_mostra=None):
    """
    Renderizza un DataFrame come tabella con pulsante 🗑️ per ogni riga.

    Parameters
    ----------
    df          : DataFrame da visualizzare
    foglio      : nome del foglio Google (usato da elimina_riga)
    key         : prefisso univoco per i widget
    cols_mostra : lista di nomi colonna da mostrare (None = auto, esclude le
                  colonne GIORNI e le compatta in una colonna "Giorni")
    """
    if df.empty:
        return

    day_cols = [c for c in df.columns if c in GIORNI]

    if cols_mostra is None:
        base_cols = [c for c in df.columns if c not in day_cols]
    else:
        base_cols = [c for c in cols_mostra if c in df.columns]

    has_giorni = bool(day_cols)
    display_cols = base_cols + (["Giorni"] if has_giorni else [])
    n_data = len(display_cols)

    # Larghezze: ogni colonna dati peso 3, Azioni peso 1
    widths = [3] * n_data + [1]

    # ── Intestazione ──────────────────────────────────────────────
    hcols = st.columns(widths)
    for i, name in enumerate(display_cols):
        hcols[i].markdown(f"**{name}**")
    hcols[-1].markdown("**Azioni**")
    st.markdown(
        "<hr style='border:none;border-top:2px solid #ddd;margin:4px 0 6px 0'>",
        unsafe_allow_html=True,
    )

    # ── Righe ─────────────────────────────────────────────────────
    for idx, (_, row) in enumerate(df.iterrows()):
        confirm_key = f"{key}_confirm_{idx}"

        if st.session_state.get(confirm_key):
            # ── Conferma inline ────────────────────────────────────
            cc = st.columns([5, 2, 2])
            cc[0].warning("⚠️ **Sei sicuro?** L'eliminazione è irreversibile.")
            with cc[1]:
                if st.button(
                    "✅ Sì, elimina",
                    key=f"{key}_yes_{idx}",
                    type="primary",
                    use_container_width=True,
                ):
                    if elimina_riga(foglio, idx + 1):
                        del st.session_state[confirm_key]
                        carica_tutti_i_dati.clear()
                        leggi_foglio.clear()
                        time.sleep(0.5)
                        st.rerun()
            with cc[2]:
                if st.button(
                    "❌ Annulla",
                    key=f"{key}_no_{idx}",
                    use_container_width=True,
                ):
                    del st.session_state[confirm_key]
                    st.rerun()
        else:
            # ── Riga normale ───────────────────────────────────────
            rcols = st.columns(widths)
            for i, col_name in enumerate(display_cols):
                if col_name == "Giorni":
                    abbrs = [
                        _GIORNI_ABBR.get(g, g[:2])
                        for g in day_cols
                        if str(row.get(g, "NO")).upper() == "SI"
                    ]
                    rcols[i].markdown(" · ".join(abbrs) if abbrs else "—")
                else:
                    val = str(row.get(col_name, ""))
                    rcols[i].markdown(val if val and val not in ("nan", "None") else "—")

            if rcols[-1].button("🗑️", key=f"{key}_del_{idx}", help="Elimina riga"):
                st.session_state[confirm_key] = True
                st.rerun()

        st.markdown(
            "<hr style='border:none;border-top:1px solid #eee;margin:3px 0'>",
            unsafe_allow_html=True,
        )


# ═══════════════════════════════════════════════════════════════
#  PALESTRE
# ═══════════════════════════════════════════════════════════════

def _pagina_palestre():
    st.subheader("🏟️ Palestre")
    if st.button("🔄 Aggiorna dati", key="refresh_palestre"):
        carica_tutti_i_dati.clear()
        leggi_foglio.clear()
        st.rerun()

    df = leggi_foglio("Palestre")
    if not df.empty:
        _render_tabella_azioni(df, "Palestre", "pal")

    # ── AGGIUNGI ──────────────────────────────────────────────────
    st.markdown("#### ➕ Aggiungi palestra")
    nome = st.text_input("Nome palestra", key="new_pal_nome")
    c1, c2 = st.columns(2)
    with c1:
        ora_inizio = st.time_input("Orario inizio", value=_parse_time("15:00"), key="new_pal_oi")
    with c2:
        ora_fine = st.time_input("Orario fine", value=_parse_time("22:00"), key="new_pal_of")
    st.markdown("**Giorni disponibili:**")
    gcols = st.columns(7)
    giorni_sel = {}
    for i, g in enumerate(GIORNI):
        with gcols[i]:
            giorni_sel[g] = "SI" if st.checkbox(g[:3], key=f"new_pal_{g}") else "NO"
    if st.button("➕ Aggiungi palestra", type="primary", key="btn_add_pal"):
        if nome:
            riga = [nome, ora_inizio.strftime("%H:%M"), ora_fine.strftime("%H:%M")]
            riga += [giorni_sel[g] for g in GIORNI]
            if scrivi_riga("Palestre", riga):
                st.success(f"✅ Palestra '{nome}' salvata con successo!")
                carica_tutti_i_dati.clear()
                leggi_foglio.clear()
                time.sleep(1)
                st.rerun()
        else:
            st.warning("Inserisci il nome.")

    # ── MODIFICA ─────────────────────────────────────────────────
    if df.empty:
        return
    st.markdown("---")
    st.markdown("#### ✏️ Modifica palestra")
    opzioni = ["— Seleziona palestra —"] + df["Nome"].tolist()
    sel = st.selectbox("Seleziona palestra da modificare", opzioni, key="sel_mod_pal")
    if sel == "— Seleziona palestra —":
        return

    pos = df["Nome"].tolist().index(sel)
    row = df.iloc[pos]

    col_oi = _find_col(df, "inizio") or (df.columns[1] if len(df.columns) > 1 else None)
    col_of = _find_col(df, "fine")   or (df.columns[2] if len(df.columns) > 2 else None)
    val_oi = str(row[col_oi]) if col_oi else "15:00"
    val_of = str(row[col_of]) if col_of else "22:00"

    with st.form(f"mod_pal_{sel}"):
        nome_mod = st.text_input("Nome palestra", value=str(row.get("Nome", sel)))
        c1, c2 = st.columns(2)
        with c1:
            ora_i_mod = st.time_input("Orario inizio", value=_parse_time(val_oi, "15:00"))
        with c2:
            ora_f_mod = st.time_input("Orario fine", value=_parse_time(val_of, "22:00"))
        st.markdown("**Giorni disponibili:**")
        gcols2 = st.columns(7)
        giorni_mod = {}
        for i, g in enumerate(GIORNI):
            with gcols2[i]:
                val_g = g in df.columns and str(row.get(g, "NO")).upper() == "SI"
                giorni_mod[g] = "SI" if st.checkbox(g[:3], value=val_g, key=f"mod_pal_{sel}_{g}") else "NO"
        cs, _ = st.columns(2)
        with cs:
            salva = st.form_submit_button("💾 Salva modifiche", type="primary", use_container_width=True)

    if salva:
        nuova = [nome_mod, ora_i_mod.strftime("%H:%M"), ora_f_mod.strftime("%H:%M")]
        nuova += [giorni_mod[g] for g in GIORNI]
        if aggiorna_riga("Palestre", pos + 1, nuova):
            st.success(f"✅ Palestra '{nome_mod}' aggiornata!")
            carica_tutti_i_dati.clear()
            leggi_foglio.clear()
            time.sleep(1)
            st.rerun()


# ═══════════════════════════════════════════════════════════════
#  CARD HELPERS
# ═══════════════════════════════════════════════════════════════

def _coaches_per_squadra(squadra: str, df_allenatori) -> list:
    """Restituisce [(nome, ruolo), ...] ordinati: capo prima, poi assistenti."""
    result = []
    if df_allenatori is None or df_allenatori.empty:
        return result
    for _, row in df_allenatori.iterrows():
        sq_ruoli = _parse_sq_ruoli(str(row.get("Squadre", "")))
        if squadra not in sq_ruoli:
            continue
        nome = f"{str(row.get('Nome','')).strip()} {str(row.get('Cognome','')).strip()}".strip()
        if not nome:
            continue
        result.append((nome, sq_ruoli[squadra]))
    result.sort(key=lambda x: (0 if x[1] == "Capo allenatore" else 1, x[0]))
    return result


def _render_cards_grid(items, render_fn, n_cols=3):
    """Mostra una lista di item in una griglia di n_cols colonne."""
    for i in range(0, len(items), n_cols):
        batch = items[i:i + n_cols]
        cols = st.columns(n_cols)
        for j, item in enumerate(batch):
            with cols[j]:
                render_fn(item)


# ═══════════════════════════════════════════════════════════════
#  SQUADRE
# ═══════════════════════════════════════════════════════════════

def _pagina_squadre(df_allenatori=None):
    st.subheader("👥 Squadre")
    if st.button("🔄 Aggiorna dati", key="refresh_squadre"):
        carica_tutti_i_dati.clear()
        leggi_foglio.clear()
        st.rerun()

    df = leggi_foglio("Squadre")

    # ── CARD SQUADRE ──────────────────────────────────────────────
    if not df.empty:
        def _card_sq(item):
            idx, row = item
            nome_sq  = str(row.get("Categoria", "")).strip()
            color    = get_team_color(nome_sq)
            coaches  = _coaches_per_squadra(nome_sq, df_allenatori)

            # Righe allenatori
            if coaches:
                righe_html = ""
                for nome_c, ruolo in coaches:
                    if ruolo == "Capo allenatore":
                        righe_html += (
                            f"<div style='color:white;font-weight:700;font-size:0.9em'>"
                            f"👤 {nome_c}</div>"
                        )
                    else:
                        etichetta = ruolo if ruolo else "Assistente"
                        righe_html += (
                            f"<div style='color:rgba(255,255,255,0.75);font-size:0.88em'>"
                            f"👤 {nome_c} "
                            f"<span style='font-size:0.82em'>({etichetta})</span></div>"
                        )
            else:
                righe_html = "<div style='color:rgba(255,255,255,0.45);font-size:0.82em;font-style:italic'>Nessun allenatore assegnato</div>"

            st.markdown(
                f"""<div style="background:{color};border-radius:12px;padding:14px 16px;
                            box-shadow:0 2px 8px rgba(0,0,0,0.2);margin-bottom:4px">
                  <div style="color:white;font-weight:800;font-size:1.1em;margin-bottom:8px">
                    🏀 {nome_sq}
                  </div>
                  {righe_html}
                </div>""",
                unsafe_allow_html=True,
            )
            confirm_key = f"sq_confirm_{idx}"
            if st.session_state.get(confirm_key):
                cc = st.columns([2, 1, 1])
                cc[0].warning("Eliminare?")
                if cc[1].button("✅ Sì", key=f"sq_yes_{idx}", type="primary", use_container_width=True):
                    elimina_riga("Squadre", idx + 1)
                    st.session_state.pop(confirm_key, None)
                    carica_tutti_i_dati.clear()
                    leggi_foglio.clear()
                    time.sleep(0.5)
                    st.rerun()
                if cc[2].button("❌ No", key=f"sq_no_{idx}", use_container_width=True):
                    st.session_state.pop(confirm_key, None)
                    st.rerun()
            else:
                if st.button("🗑️ Elimina", key=f"sq_del_{idx}", use_container_width=True):
                    st.session_state[f"sq_confirm_{idx}"] = True
                    st.rerun()

        _render_cards_grid(list(enumerate(row for _, row in df.iterrows())), _card_sq)
        st.markdown("---")

    # ── AGGIUNGI ──────────────────────────────────────────────────
    st.markdown("#### ➕ Aggiungi squadra")
    st.caption("Minuti riscaldamento, durata partita e giorni disponibili si configurano nella sezione **Modifica** qui sotto, oppure quando si inserisce una partita.")
    categoria = st.text_input("Nome categoria", key="new_sq_cat")

    if st.button("➕ Aggiungi squadra", type="primary", key="btn_add_sq"):
        if categoria:
            # Valori di default — configurabili in seguito tramite Modifica
            riga = [categoria, 30, 105] + ["SI"] * len(GIORNI)
            ok = scrivi_riga("Squadre", riga)
            if ok:
                st.success(f"✅ Squadra '{categoria}' salvata con successo!")
                carica_tutti_i_dati.clear()
                leggi_foglio.clear()
                time.sleep(1)
                st.rerun()
        else:
            st.warning("Inserisci il nome.")

    # ── MODIFICA ─────────────────────────────────────────────────
    if df.empty:
        return
    st.markdown("---")
    st.markdown("#### ✏️ Modifica squadra")
    opzioni = ["— Seleziona squadra —"] + df["Categoria"].tolist()
    sel = st.selectbox("Seleziona squadra da modificare", opzioni, key="sel_mod_sq")
    if sel == "— Seleziona squadra —":
        return

    pos = df["Categoria"].tolist().index(sel)
    row = df.iloc[pos]

    col_risc = _find_col(df, "riscaldamento", "risc")
    col_dur  = _find_col(df, "durata")
    val_risc = _int_safe(row[col_risc], 30) if col_risc else 30
    val_dur  = _int_safe(row[col_dur],  105) if col_dur  else 105

    with st.form(f"mod_sq_{sel}"):
        cat_mod = st.text_input("Nome categoria", value=str(row.get("Categoria", sel)))
        c1, c2 = st.columns(2)
        with c1:
            risc_mod = st.number_input("Minuti riscaldamento", min_value=0, value=val_risc, step=5)
        with c2:
            dur_mod = st.number_input("Durata partita (minuti)", min_value=30, value=val_dur, step=5)
        st.markdown("**Giorni in cui può giocare:**")
        gcols2 = st.columns(7)
        giorni_mod = {}
        for i, g in enumerate(GIORNI):
            with gcols2[i]:
                val_g = g in df.columns and str(row.get(g, "NO")).upper() == "SI"
                giorni_mod[g] = "SI" if st.checkbox(g[:3], value=val_g, key=f"mod_sq_{sel}_{g}") else "NO"
        cs, _ = st.columns(2)
        with cs:
            salva = st.form_submit_button("💾 Salva modifiche", type="primary", use_container_width=True)

    if salva:
        nuova = [cat_mod, risc_mod, dur_mod]
        nuova += [giorni_mod[g] for g in GIORNI]
        if aggiorna_riga("Squadre", pos + 1, nuova):
            st.success(f"✅ Squadra '{cat_mod}' aggiornata!")
            carica_tutti_i_dati.clear()
            leggi_foglio.clear()
            time.sleep(1)
            st.rerun()


# ═══════════════════════════════════════════════════════════════
#  ALLENATORI
# ═══════════════════════════════════════════════════════════════

def _pagina_allenatori(df_squadre):
    st.subheader("👤 Allenatori")
    if st.button("🔄 Aggiorna dati", key="refresh_allenatori"):
        carica_tutti_i_dati.clear()
        leggi_foglio.clear()
        st.rerun()

    df = leggi_foglio("Allenatori")

    # ── CARD ALLENATORI ───────────────────────────────────────────
    if not df.empty:
        def _card_all(item):
            idx, row = item
            nome_c   = f"{str(row.get('Nome','')).strip()} {str(row.get('Cognome','')).strip()}".strip()
            sq_ruoli = _parse_sq_ruoli(str(row.get("Squadre", "")))

            if sq_ruoli:
                righe_html = ""
                for sq, ruolo in sq_ruoli.items():
                    color_sq = get_team_color(sq)
                    if ruolo == "Capo allenatore":
                        righe_html += (
                            f"<div style='margin:3px 0'>"
                            f"<span style='background:{color_sq};color:white;border-radius:6px;"
                            f"padding:2px 9px;font-size:0.84em;font-weight:700'>"
                            f"🏀 {sq} — <b>Capo</b></span></div>"
                        )
                    else:
                        etichetta = ruolo if ruolo else "Assistente"
                        righe_html += (
                            f"<div style='margin:3px 0'>"
                            f"<span style='background:{color_sq};color:rgba(255,255,255,0.85);"
                            f"border-radius:6px;padding:2px 9px;font-size:0.84em;font-weight:400'>"
                            f"🏀 {sq} — {etichetta}</span></div>"
                        )
            else:
                righe_html = "<div style='color:rgba(255,255,255,0.45);font-size:0.82em;font-style:italic'>Nessuna squadra assegnata</div>"

            st.markdown(
                f"""<div style="background:#1a3a5c;border-radius:12px;padding:14px 16px;
                            box-shadow:0 2px 8px rgba(0,0,0,0.2);margin-bottom:4px">
                  <div style="color:white;font-weight:800;font-size:1.1em;margin-bottom:8px">
                    👤 {nome_c}
                  </div>
                  {righe_html}
                </div>""",
                unsafe_allow_html=True,
            )
            confirm_key = f"all_confirm_{idx}"
            if st.session_state.get(confirm_key):
                cc = st.columns([2, 1, 1])
                cc[0].warning("Eliminare?")
                if cc[1].button("✅ Sì", key=f"all_yes_{idx}", type="primary", use_container_width=True):
                    elimina_riga("Allenatori", idx + 1)
                    st.session_state.pop(confirm_key, None)
                    carica_tutti_i_dati.clear()
                    leggi_foglio.clear()
                    time.sleep(0.5)
                    st.rerun()
                if cc[2].button("❌ No", key=f"all_no_{idx}", use_container_width=True):
                    st.session_state.pop(confirm_key, None)
                    st.rerun()
            else:
                if st.button("🗑️ Elimina", key=f"all_del_{idx}", use_container_width=True):
                    st.session_state[f"all_confirm_{idx}"] = True
                    st.rerun()

        _render_cards_grid(list(enumerate(row for _, row in df.iterrows())), _card_all)
        st.markdown("---")

    # ── AGGIUNGI ──────────────────────────────────────────────────
    st.markdown("#### ➕ Aggiungi allenatore")
    st.caption("Squadre e ruolo si assegnano nel tab **🔗 Assegnazioni**.")
    c1, c2 = st.columns(2)
    with c1:
        nome = st.text_input("Nome", key="new_all_nome")
    with c2:
        cognome = st.text_input("Cognome", key="new_all_cognome")

    if st.button("➕ Aggiungi allenatore", type="primary", key="btn_add_all"):
        if nome and cognome:
            if scrivi_riga("Allenatori", [nome, cognome, "", ""]):
                st.success(f"✅ Allenatore '{nome} {cognome}' salvato!")
                carica_tutti_i_dati.clear()
                leggi_foglio.clear()
                time.sleep(1)
                st.rerun()
        else:
            st.warning("Inserisci nome e cognome.")

    # ── MODIFICA ─────────────────────────────────────────────────
    if df.empty:
        return
    st.markdown("---")
    st.markdown("#### ✏️ Modifica allenatore")
    squadre_disp = df_squadre["Categoria"].tolist() if not df_squadre.empty else []
    etichette = ["— Seleziona allenatore —"] + [
        f"{r.get('Nome', '')} {r.get('Cognome', '')}".strip()
        for _, r in df.iterrows()
    ]
    sel = st.selectbox("Seleziona allenatore da modificare", etichette, key="sel_mod_all")
    if sel == "— Seleziona allenatore —":
        return

    pos = etichette.index(sel) - 1
    row = df.iloc[pos]

    with st.form(f"mod_all_{sel}"):
        c1, c2 = st.columns(2)
        with c1:
            nome_mod = st.text_input("Nome", value=str(row.get("Nome", "")))
        with c2:
            cognome_mod = st.text_input("Cognome", value=str(row.get("Cognome", "")))
        cs, _ = st.columns(2)
        with cs:
            salva = st.form_submit_button("💾 Salva modifiche", type="primary", use_container_width=True)

    if salva:
        # Preserva Squadre (con ruoli inline) — si gestisce solo in Assegnazioni
        nuova = [
            nome_mod,
            cognome_mod,
            str(row.get("Email",   "")),
            str(row.get("Squadre", "")).strip(),
        ]
        if aggiorna_riga("Allenatori", pos + 1, nuova):
            st.success(f"✅ Allenatore '{nome_mod} {cognome_mod}' aggiornato!")
            carica_tutti_i_dati.clear()
            leggi_foglio.clear()
            time.sleep(1)
            st.rerun()


# ═══════════════════════════════════════════════════════════════
#  ASSEGNAZIONI  (allenatore ↔ squadra + ruolo per squadra)
# ═══════════════════════════════════════════════════════════════

_RUOLI = ["Capo allenatore", "Assistente"]


def _parse_sq_ruoli(squadre_str: str) -> dict:
    """
    Legge la colonna Squadre con ruoli inline.
    'U18 (Capo allenatore), U15 (Assistente)' → {'U18': 'Capo allenatore', 'U15': 'Assistente'}
    Compatibile con vecchio formato 'U18, U15' (ruolo = '').
    """
    result = {}
    for part in str(squadre_str).split(","):
        part = part.strip()
        if not part:
            continue
        if "(" in part and part.endswith(")"):
            team  = part[:part.rfind("(")].strip()
            ruolo = part[part.rfind("(") + 1:-1].strip()
        else:
            team  = part
            ruolo = ""
        if team:
            result[team] = ruolo
    return result


def _format_sq_ruoli(sq_ruoli: dict) -> str:
    """{'U18': 'Capo allenatore', 'U15': 'Assistente'} → 'U18 (Capo allenatore), U15 (Assistente)'"""
    parts = []
    for sq, ru in sq_ruoli.items():
        parts.append(f"{sq} ({ru})" if ru else sq)
    return ", ".join(parts)


def _salva_assegnazione(squadra: str, nuovi: dict, df_allenatori):
    """
    nuovi: {nome_coach: ruolo} per i coach da assegnare a questa squadra.
    Ruolo e squadra vengono salvati inline nella colonna Squadre:
    es. 'U18 (Capo allenatore), U15 (Assistente)'
    """
    for pos, (_, row) in enumerate(df_allenatori.iterrows()):
        nome = f"{str(row.get('Nome', '')).strip()} {str(row.get('Cognome', '')).strip()}".strip()
        if not nome:
            continue
        sq_ruoli = _parse_sq_ruoli(str(row.get("Squadre", "")))

        era          = squadra in sq_ruoli
        deve         = nome in nuovi
        ruolo_nuovo  = nuovi.get(nome, "")
        ruolo_cambia = deve and sq_ruoli.get(squadra, "") != ruolo_nuovo

        if era == deve and not ruolo_cambia:
            continue  # nessuna variazione

        if deve:
            sq_ruoli[squadra] = ruolo_nuovo
        else:
            sq_ruoli.pop(squadra, None)

        aggiorna_riga("Allenatori", pos + 1, [
            str(row.get("Nome",  "")),
            str(row.get("Cognome", "")),
            str(row.get("Email", "")),
            _format_sq_ruoli(sq_ruoli),
        ])


def _pagina_assegnazioni(df_squadre, df_allenatori):
    st.subheader("🔗 Assegnazioni Allenatore ↔ Squadra")

    if st.button("🔄 Aggiorna dati", key="refresh_assign"):
        carica_tutti_i_dati.clear()
        leggi_foglio.clear()
        st.rerun()

    if df_squadre.empty or df_allenatori.empty:
        if df_squadre.empty:
            st.warning("⚠️ Nessuna **squadra** registrata — aggiungila nel tab **Squadre**.")
        if df_allenatori.empty:
            st.warning("⚠️ Nessun **allenatore** registrato — aggiungilo nel tab **Allenatori**.")
        st.info("Una volta aggiunti entrambi, torna qui per collegarli.")
        return

    squadre_lista = df_squadre["Categoria"].tolist()
    sel = st.selectbox("🏀 Seleziona squadra", ["— Seleziona —"] + squadre_lista, key="assign_sel_sq")
    if sel == "— Seleziona —":
        st.info("Seleziona una squadra per vedere e modificare gli allenatori assegnati.")
        return

    # Legge assegnazioni e ruoli attuali per questa squadra
    tutti_coaches   = []
    assegnati_ora   = {}   # nome → ruolo attuale
    for _, row in df_allenatori.iterrows():
        nome = f"{str(row.get('Nome','')).strip()} {str(row.get('Cognome','')).strip()}".strip()
        if not nome:
            continue
        tutti_coaches.append(nome)
        sq_ruoli = _parse_sq_ruoli(str(row.get("Squadre", "")))
        if sel in sq_ruoli:
            assegnati_ora[nome] = sq_ruoli[sel] or _RUOLI[0]

    st.caption(f"Spunta i coach da assegnare a **{sel}** e scegli il loro ruolo.")
    st.markdown(
        "<div style='display:grid;grid-template-columns:2fr 1fr 2fr;"
        "font-weight:700;padding:4px 0;border-bottom:2px solid #ddd;margin-bottom:4px'>"
        "<span>Allenatore</span><span>Assegnato</span><span>Ruolo</span></div>",
        unsafe_allow_html=True,
    )

    nuovi = {}   # nome → ruolo (solo per i coach selezionati)
    for nome in tutti_coaches:
        c1, c2, c3 = st.columns([2, 1, 2])
        c1.markdown(nome)
        assegnato = c2.checkbox(
            "assegna", value=(nome in assegnati_ora),
            key=f"asgn_chk_{sel}_{nome}", label_visibility="collapsed",
        )
        if assegnato:
            default_ruolo = assegnati_ora.get(nome, _RUOLI[0])
            ruolo = c3.radio(
                "ruolo", _RUOLI,
                index=_RUOLI.index(default_ruolo),
                key=f"asgn_role_{sel}_{nome}",
                horizontal=True,
                label_visibility="collapsed",
            )
            nuovi[nome] = ruolo

    st.markdown("---")
    if st.button("💾 Salva assegnazione", type="primary", key="btn_save_assign", use_container_width=True):
        with st.spinner("Salvataggio in corso..."):
            _salva_assegnazione(sel, nuovi, df_allenatori)
            carica_tutti_i_dati.clear()
            leggi_foglio.clear()
            time.sleep(0.5)
        st.success(f"✅ Assegnazioni aggiornate per **{sel}**.")
        st.rerun()


# ═══════════════════════════════════════════════════════════════
#  RENDER
# ═══════════════════════════════════════════════════════════════

def render():
    st.header("⚙️ Setup")

    df_allenatori = leggi_foglio("Allenatori")
    df_squadre    = leggi_foglio("Squadre")

    tab_pal, tab_sq_all = st.tabs(["🏟️ Palestre", "👥 Squadre & Allenatori"])

    with tab_pal:
        _pagina_palestre()

    with tab_sq_all:
        sub_sq, sub_all, sub_assign = st.tabs(["👥 Squadre", "👤 Allenatori", "🔗 Assegnazioni"])
        with sub_sq:
            _pagina_squadre(df_allenatori)
        with sub_all:
            _pagina_allenatori(df_squadre)
        with sub_assign:
            _pagina_assegnazioni(df_squadre, df_allenatori)
