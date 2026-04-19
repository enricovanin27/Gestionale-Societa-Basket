import time
import streamlit as st
from datetime import datetime
from logic import GIORNI
from database import (
    leggi_squadre, leggi_palestre, leggi_allenatori,
    carica_tutti_i_dati_db, invalida_cache,
    scrivi_evento, aggiorna_evento, elimina_evento,
)
# LEGACY: from sheets import (
#     leggi_foglio, scrivi_riga, scrivi_righe_batch,
#     carica_tutti_i_dati, aggiorna_riga, elimina_riga,
# )
from views._components import get_team_color

# Giorni in ordine per la mappatura lista → dict
_GIORNI_DB = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]

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
    df          : DataFrame da visualizzare (indice = id Supabase)
    foglio      : nome tabella Supabase (es. "palestre")
    key         : prefisso univoco per i widget
    cols_mostra : lista di nomi colonna da mostrare (None = auto, esclude le
                  colonne GIORNI e le compatta in una colonna "Giorni")
    """
    from database import TABELLE
    tabella = TABELLE.get(foglio, foglio)
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
    for idx, (row_id, row) in enumerate(df.iterrows()):
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
                    if elimina_evento(tabella, row_id):
                        del st.session_state[confirm_key]
                        invalida_cache()
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

_PALESTRA_TIPI = ["Principale", "Secondaria", "Esterna"]


def _pagina_palestre():
    st.subheader("🏟️ Palestre")
    st.caption(
        "**Tipo:** Principale = palestra primaria (es. Palasport), "
        "Secondaria = alternativa (es. San Vincenzo), "
        "Esterna = fuori sede (es. Sansovino). "
        "Nella ricerca slot liberi le palestre vengono proposte in quest'ordine."
    )
    if st.button("🔄 Aggiorna dati", key="refresh_palestre"):
        invalida_cache()
        st.rerun()

    df = leggi_palestre()
    if not df.empty:
        _TIPO_PAL_COLOR = {"Principale": "#0D3B6E", "Secondaria": "#4A235A", "Esterna": "#2C3E50"}
        day_cols = [c for c in df.columns if c in GIORNI]
        for _pi, (_row_id, _pr) in enumerate(df.iterrows()):
            _confirm_k = f"pal_confirm_{_pi}"
            _pnome  = str(_pr.get("Nome", "")).strip()
            _ptipo  = str(_pr.get("Tipo", "Principale")).strip()
            _poi    = str(_pr.get("Orario Inizio", "")).strip()
            _pof    = str(_pr.get("Orario Fine",   "")).strip()
            _pzone  = str(_pr.get("Zone", "")).strip()
            _pgiorni = " · ".join(g[:2] for g in day_cols if str(_pr.get(g, "NO")).upper() == "SI") or "—"
            _pbg    = _TIPO_PAL_COLOR.get(_ptipo, "#1a3a5c")
            _pzone_html = (f"<div style='color:rgba(255,255,255,0.7);font-size:0.82em;margin-top:3px'>📍 {_pzone}</div>"
                           if _pzone else "")
            _card_p_html = (
                f"<div style='background:{_pbg};border-radius:12px;padding:14px 16px;"
                f"box-shadow:0 2px 8px rgba(0,0,0,0.2);margin-bottom:4px'>"
                f"<div style='display:flex;justify-content:space-between;align-items:center'>"
                f"<span style='color:white;font-weight:800;font-size:1.1em'>🏟️ {_pnome}</span>"
                f"<span style='background:rgba(255,255,255,0.15);color:white;font-size:0.78em;"
                f"padding:2px 9px;border-radius:10px'>{_ptipo}</span>"
                f"</div>"
                f"<div style='color:rgba(255,255,255,0.8);font-size:0.85em;margin-top:6px'>"
                f"⏰ {_poi} – {_pof} &nbsp;&nbsp; 📅 {_pgiorni}"
                f"</div>"
                f"{_pzone_html}"
                f"</div>"
            )
            if st.session_state.get(_confirm_k):
                _cc = st.columns([5, 2, 2])
                _cc[0].warning("⚠️ **Sei sicuro?** L'eliminazione è irreversibile.")
                with _cc[1]:
                    if st.button("✅ Sì, elimina", key=f"pal_yes_{_pi}", type="primary", use_container_width=True):
                        if elimina_evento("palestre", _row_id):
                            del st.session_state[_confirm_k]
                            invalida_cache()
                            time.sleep(0.5)
                            st.rerun()
                with _cc[2]:
                    if st.button("❌ Annulla", key=f"pal_no_{_pi}", use_container_width=True):
                        del st.session_state[_confirm_k]
                        st.rerun()
            else:
                _c1p, _c2p = st.columns([10, 1])
                with _c1p:
                    st.markdown(_card_p_html, unsafe_allow_html=True)
                with _c2p:
                    st.write("")
                    if st.button("🗑️", key=f"pal_del_{_pi}", help="Elimina palestra"):
                        st.session_state[_confirm_k] = True
                        st.rerun()

    # ── AGGIUNGI ──────────────────────────────────────────────────
    st.markdown("#### ➕ Aggiungi palestra")
    nome = st.text_input("Nome palestra", key="new_pal_nome")
    c1, c2, c3 = st.columns(3)
    with c1:
        ora_inizio = st.time_input("Orario inizio", value=_parse_time("15:00"), key="new_pal_oi")
    with c2:
        ora_fine = st.time_input("Orario fine", value=_parse_time("22:00"), key="new_pal_of")
    with c3:
        tipo_pal = st.selectbox("Tipo", _PALESTRA_TIPI, key="new_pal_tipo")
    zone_pal = st.text_input(
        "Zone della palestra (separate da virgola, es. Campo principale,Zona fisica)",
        key="new_pal_zone",
        placeholder="es. Campo principale,Zona fisica/pesi",
    )
    st.markdown("**Giorni disponibili:**")
    gcols = st.columns(7)
    giorni_sel = {}
    for i, g in enumerate(GIORNI):
        with gcols[i]:
            giorni_sel[g] = "SI" if st.checkbox(g[:3], key=f"new_pal_{g}") else "NO"
    if st.button("➕ Aggiungi palestra", type="primary", key="btn_add_pal"):
        if nome:
            dati = {
                "nome": nome,
                "orario_inizio": ora_inizio.strftime("%H:%M"),
                "orario_fine":   ora_fine.strftime("%H:%M"),
                "tipo":          tipo_pal,
                "zone":          zone_pal.strip(),
                **{g_db: giorni_sel[g] for g, g_db in zip(GIORNI, _GIORNI_DB)},
            }
            if scrivi_evento("palestre", dati):
                st.success(f"✅ Palestra '{nome}' salvata con successo!")
                invalida_cache()
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
    row_id = df.index[pos]  # Supabase id

    col_oi = _find_col(df, "inizio") or (df.columns[1] if len(df.columns) > 1 else None)
    col_of = _find_col(df, "fine")   or (df.columns[2] if len(df.columns) > 2 else None)
    val_oi = str(row[col_oi]) if col_oi else "15:00"
    val_of = str(row[col_of]) if col_of else "22:00"

    with st.form(f"mod_pal_{sel}"):
        nome_mod = st.text_input("Nome palestra", value=str(row.get("Nome", sel)))
        c1, c2, c3 = st.columns(3)
        with c1:
            ora_i_mod = st.time_input("Orario inizio", value=_parse_time(val_oi, "15:00"))
        with c2:
            ora_f_mod = st.time_input("Orario fine", value=_parse_time(val_of, "22:00"))
        with c3:
            _tipo_cur = str(row.get("Tipo", "Principale"))
            _tipo_idx = _PALESTRA_TIPI.index(_tipo_cur) if _tipo_cur in _PALESTRA_TIPI else 0
            tipo_mod = st.selectbox("Tipo", _PALESTRA_TIPI, index=_tipo_idx)
        zone_mod = st.text_input(
            "Zone della palestra (separate da virgola)",
            value=str(row.get("Zone", "")),
        )
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
        dati = {
            "nome": nome_mod,
            "orario_inizio": ora_i_mod.strftime("%H:%M"),
            "orario_fine":   ora_f_mod.strftime("%H:%M"),
            "tipo":          tipo_mod,
            "zone":          zone_mod.strip(),
            **{g_db: giorni_mod[g] for g, g_db in zip(GIORNI, _GIORNI_DB)},
        }
        if aggiorna_evento("palestre", row_id, dati):
            st.success(f"✅ Palestra '{nome_mod}' aggiornata!")
            invalida_cache()
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
        invalida_cache()
        st.rerun()

    df = leggi_squadre()

    # ── CARD SQUADRE ──────────────────────────────────────────────
    if not df.empty:
        def _card_sq(item):
            idx, row = item
            sq_row_id = row.name  # Supabase id (df index)
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
                    elimina_evento("squadre", sq_row_id)
                    st.session_state.pop(confirm_key, None)
                    invalida_cache()
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
        # Note: row.name preserves Supabase id even in enumerate
        st.markdown("---")

    # ── AGGIUNGI ──────────────────────────────────────────────────
    st.markdown("#### ➕ Aggiungi squadra")
    st.caption("Minuti riscaldamento, durata partita e giorni disponibili si configurano nella sezione **Modifica** qui sotto, oppure quando si inserisce una partita.")
    categoria = st.text_input("Nome categoria", key="new_sq_cat")

    if st.button("➕ Aggiungi squadra", type="primary", key="btn_add_sq"):
        if categoria:
            # Valori di default — configurabili in seguito tramite Modifica
            dati = {
                "categoria": categoria,
                "minuti_riscaldamento": 30,
                "durata_partita": 105,
                **{g_db: "SI" for g_db in _GIORNI_DB},
            }
            ok = scrivi_evento("squadre", dati)
            if ok:
                st.success(f"✅ Squadra '{categoria}' salvata con successo!")
                invalida_cache()
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
    row_id = df.index[pos]  # Supabase id

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
        dati = {
            "categoria": cat_mod,
            "minuti_riscaldamento": int(risc_mod),
            "durata_partita": int(dur_mod),
            **{g_db: giorni_mod[g] for g, g_db in zip(GIORNI, _GIORNI_DB)},
        }
        if aggiorna_evento("squadre", row_id, dati):
            st.success(f"✅ Squadra '{cat_mod}' aggiornata!")
            invalida_cache()
            time.sleep(1)
            st.rerun()


# ═══════════════════════════════════════════════════════════════
#  ALLENATORI
# ═══════════════════════════════════════════════════════════════

def _pagina_allenatori(df_squadre):
    st.subheader("👤 Allenatori")
    if st.button("🔄 Aggiorna dati", key="refresh_allenatori"):
        invalida_cache()
        st.rerun()

    df = leggi_allenatori()

    # ── CARD ALLENATORI ───────────────────────────────────────────
    if not df.empty:
        def _card_all(item):
            idx, row = item
            all_row_id = row.name  # Supabase id
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
                    elimina_evento("allenatori", all_row_id)
                    st.session_state.pop(confirm_key, None)
                    invalida_cache()
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
            if scrivi_evento("allenatori", {"nome": nome, "cognome": cognome, "email": "", "squadre": ""}):
                st.success(f"✅ Allenatore '{nome} {cognome}' salvato!")
                invalida_cache()
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
    all_row_id = df.index[pos]  # Supabase id

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
        dati = {
            "nome":    nome_mod,
            "cognome": cognome_mod,
            "email":   str(row.get("Email",   "")),
            "squadre": str(row.get("Squadre", "")).strip(),
        }
        if aggiorna_evento("allenatori", all_row_id, dati):
            st.success(f"✅ Allenatore '{nome_mod} {cognome_mod}' aggiornato!")
            invalida_cache()
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
    for row_id, row in df_allenatori.iterrows():
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

        aggiorna_evento("allenatori", row_id, {
            "nome":    str(row.get("Nome",  "")),
            "cognome": str(row.get("Cognome", "")),
            "email":   str(row.get("Email", "")),
            "squadre": _format_sq_ruoli(sq_ruoli),
        })


def _pagina_assegnazioni(df_squadre, df_allenatori):
    st.subheader("🔗 Assegnazioni Allenatore ↔ Squadra")

    if st.button("🔄 Aggiorna dati", key="refresh_assign"):
        invalida_cache()
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
            invalida_cache()
            time.sleep(0.5)
        st.success(f"✅ Assegnazioni aggiornate per **{sel}**.")
        st.rerun()


# ═══════════════════════════════════════════════════════════════
#  RENDER
# ═══════════════════════════════════════════════════════════════

def render():
    st.header("⚙️ Setup")

    df_allenatori = leggi_allenatori()
    df_squadre    = leggi_squadre()

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
