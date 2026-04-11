import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
from logic import (
    GIORNI_SETTIMANA, is_settimana_prossima,
    trova_date_alternative, trova_slot_liberi, c_e_conflitto,
    parse_data, calcola_slot, str_to_time, time_to_minutes,
)
from sheets import (
    leggi_foglio, carica_tutti_i_dati,
    scrivi_riga, scrivi_righe_batch, aggiorna_riga, elimina_riga,
)
from views._components import render_sposta_allenamenti, build_spostamento_rows
import views.gestione_partite as _page_inserisci
import views.importa_pdf      as _page_pdf


# ── Helpers visuali ───────────────────────────────────────────────────────────

def _tipo_emoji(tipo: str) -> str:
    t = str(tipo)
    if "CONFLITTO" in t:    return "🔴"
    if "[PROV]" in t:       return "🟡"
    if "[DA SPOSTARE]" in t: return "🟠"
    if "Fuori Casa" in t:   return "🔵"
    if "Casa" in t:         return "🟢"
    if "Allenamento" in t:  return "⚪"
    return "⬜"


def _tipo_short(tipo: str) -> str:
    t = str(tipo)
    t = t.replace("⚠️ Partita in Casa (CONFLITTO DA RISOLVERE)", "⚠️ CONFLITTO")
    t = t.replace("Partita in Casa",   "🏠 Casa")
    t = t.replace("Partita Fuori Casa","🚌 Fuori Casa")
    t = t.replace("Allenamento spostato", "🔄 Allenamento")
    t = t.replace("[PROV] ",   "🕐 ")
    t = t.replace("[DA SPOSTARE] ", "🔄 ")
    return t


def _stile_tipo(tipo: str) -> str:
    t = str(tipo)
    if "CONFLITTO" in t:
        return "background-color:#f8d7da;color:#721c24"
    if "[PROV]" in t or "Provvisorio" in t:
        return "background-color:#fff3cd;color:#856404"
    if "[DA SPOSTARE]" in t:
        return "background-color:#ffe5d0;color:#6c3b00"
    if "Fuori Casa" in t or "Fuori" in t:
        return "background-color:#cce5ff;color:#004085"
    if "Casa" in t:
        return "background-color:#d4edda;color:#155724"
    if "Allenamento" in t:
        return "background-color:#e2e3e5;color:#383d41"
    return "background-color:#f8f9fa;color:#333"


# ── Tabella interattiva (con pulsanti ✏️ 🗑️) ─────────────────────────────────

# Pesi colonne: [emoji, Data, Squadra, Tipo, Orario, Palestra, ✏️, 🗑️]
_W = [1, 2, 3, 4, 2, 2, 1, 1]
_H = ["",  "Data", "Squadra", "Tipo", "Orario", "Palestra", "", ""]


def _conflitti_inline(ev, orario_fisso: pd.DataFrame, df_cal: pd.DataFrame) -> list:
    """
    Restituisce una lista breve (max 3) di stringhe che descrivono
    con cosa l'evento 'ev' è in conflitto — usata negli avvisi inline.
    """
    giorno_ev   = str(ev.get("Giorno",   "")).lower()
    palestra_ev = str(ev.get("Palestra", "")).lower()
    ora_i       = str(ev.get("Ora Inizio", ""))
    ora_f       = str(ev.get("Ora Fine",   ""))
    squadra_ev  = str(ev.get("Squadra",   ""))
    items = []

    # 1) Allenamenti fissi (orario_fisso)
    if not orario_fisso.empty:
        mask = (
            (orario_fisso["giorno"].str.lower().str.strip()   == giorno_ev) &
            (orario_fisso["palestra"].str.lower().str.strip() == palestra_ev)
        )
        for _, of in orario_fisso[mask].iterrows():
            if c_e_conflitto(ora_i, ora_f,
                             str(of.get("ora_inizio", "")),
                             str(of.get("ora_fine",   ""))):
                items.append(
                    f"all. **{of.get('squadra','')}** "
                    f"{of.get('ora_inizio','')}–{of.get('ora_fine','')}"
                )

    # 2) Altri eventi nel Calendario Definitivo
    if not df_cal.empty and "Giorno" in df_cal.columns:
        for _, cal_ev in df_cal.iterrows():
            if str(cal_ev.get("Squadra", "")) == squadra_ev:
                continue
            if str(cal_ev.get("Giorno",   "")).lower() != giorno_ev:
                continue
            if str(cal_ev.get("Palestra", "")).lower() != palestra_ev:
                continue
            if c_e_conflitto(ora_i, ora_f,
                             str(cal_ev.get("Ora Inizio", "")),
                             str(cal_ev.get("Ora Fine",   ""))):
                items.append(
                    f"**{cal_ev.get('Squadra','')}** "
                    f"{cal_ev.get('Ora Inizio','')}–{cal_ev.get('Ora Fine','')}"
                )
            if len(items) >= 3:
                break

    return items[:3]


def _render_tabella_interattiva(df_view: pd.DataFrame, key_prefix: str = "tab"):
    """
    Renders df_view as interactive rows (st.columns) with ✏️ and 🗑️ per row.
    df_view must preserve the original pandas RangeIndex of the unfiltered df.
    """
    if df_view.empty:
        st.info("Nessun evento da mostrare.")
        return

    # Intestazione
    hcols = st.columns(_W)
    for i, h in enumerate(_H):
        if h:
            hcols[i].markdown(f"**{h}**")
    st.markdown(
        "<hr style='border:none;border-top:2px solid #ddd;margin:3px 0 6px 0'>",
        unsafe_allow_html=True,
    )

    _is_admin_tab = st.session_state.get("ruolo", "admin") == "admin"

    for row_label, row in df_view.iterrows():
        tipo = str(row.get("Tipo", ""))
        confirm_key = f"{key_prefix}_del_confirm_{row_label}"

        if _is_admin_tab and st.session_state.get(confirm_key):
            # ── Conferma eliminazione inline ────────────────────────
            cc = st.columns([5, 2, 2])
            cc[0].warning(
                f"⚠️ Elimina **{row.get('Squadra','')}** "
                f"del {row.get('Data','')}?"
            )
            with cc[1]:
                if st.button(
                    "✅ Sì, elimina",
                    key=f"{key_prefix}_del_yes_{row_label}",
                    type="primary",
                    use_container_width=True,
                ):
                    if elimina_riga("Calendario Definitivo", row_label + 1):
                        st.session_state.pop(confirm_key, None)
                        carica_tutti_i_dati.clear()
                        leggi_foglio.clear()
                        st.rerun()
            with cc[2]:
                if st.button(
                    "❌ Annulla",
                    key=f"{key_prefix}_del_no_{row_label}",
                    use_container_width=True,
                ):
                    st.session_state.pop(confirm_key, None)
                    st.rerun()
        else:
            # ── Riga normale ────────────────────────────────────────
            _w = _W if _is_admin_tab else _W[:-2]
            rcols = st.columns(_w)
            rcols[0].markdown(_tipo_emoji(tipo))
            rcols[1].markdown(str(row.get("Data", "")))
            rcols[2].markdown(f"**{row.get('Squadra', '')}**")
            rcols[3].markdown(_tipo_short(tipo))
            ora_i = str(row.get("Ora Inizio", ""))
            ora_f = str(row.get("Ora Fine", ""))
            rcols[4].markdown(f"{ora_i}–{ora_f}" if ora_i else "—")
            rcols[5].markdown(str(row.get("Palestra", "")) or "—")

            if _is_admin_tab:
                if rcols[6].button("✏️", key=f"{key_prefix}_edit_{row_label}", help="Modifica"):
                    st.session_state["modifica_evento_idx"] = int(row_label)
                    st.session_state.pop("_conferma_elimina_ev", None)
                    st.rerun()
                if rcols[7].button("🗑️", key=f"{key_prefix}_del_{row_label}", help="Elimina"):
                    st.session_state[confirm_key] = True
                    st.rerun()

        st.markdown(
            "<hr style='border:none;border-top:1px solid #eee;margin:2px 0'>",
            unsafe_allow_html=True,
        )


# ── Pagina modifica evento ─────────────────────────────────────────────────────

def _render_modifica_evento():
    idx = st.session_state.get("modifica_evento_idx")
    if idx is None:
        return

    df        = leggi_foglio("Calendario Definitivo")
    df_squadre = leggi_foglio("Squadre")
    df_palestre = leggi_foglio("Palestre")

    if df.empty or idx >= len(df):
        st.warning("Evento non trovato.")
        st.session_state.pop("modifica_evento_idx", None)
        return

    evento = df.iloc[idx]
    squadra = str(evento.get("Squadra", ""))
    tipo_ev  = str(evento.get("Tipo", ""))

    # ── Intestazione ────────────────────────────────────────────────
    st.header("✏️ Modifica evento")
    st.markdown(
        f"{_tipo_emoji(tipo_ev)} &nbsp;"
        f"**{squadra}** &nbsp;·&nbsp; "
        f"{evento.get('Data','')} &nbsp;·&nbsp; "
        f"{evento.get('Ora Inizio','')}–{evento.get('Ora Fine','')} "
        f"@ {evento.get('Palestra','')}"
    )
    st.markdown("---")

    squadre_lista  = df_squadre["Categoria"].tolist() if not df_squadre.empty else [squadra]
    palestre_lista = df_palestre["Nome"].tolist() if not df_palestre.empty else []
    tipo_opzioni = [
        "Partita in Casa",
        "Partita Fuori Casa",
        "Allenamento spostato",
        "⚠️ Partita in Casa (CONFLITTO DA RISOLVERE)",
    ]

    col1, col2 = st.columns(2)
    with col1:
        nuova_squadra = st.selectbox(
            "Squadra", squadre_lista,
            index=squadre_lista.index(squadra) if squadra in squadre_lista else 0,
            key="medit_squadra",
        )
        try:
            _data_def = datetime.strptime(str(evento.get("Data", "")), "%Y-%m-%d").date()
        except Exception:
            _data_def = datetime.today().date()
        nuova_data_dt = st.date_input("Data", value=_data_def, key="medit_data")
        nuova_data = nuova_data_dt.strftime("%Y-%m-%d")

        nuovo_tipo = st.selectbox(
            "Tipo", tipo_opzioni,
            index=tipo_opzioni.index(tipo_ev) if tipo_ev in tipo_opzioni else 0,
            key="medit_tipo",
        )
        nuovo_avversario = st.text_input(
            "Avversario",
            value=str(evento.get("Avversario", "")),
            key="medit_avversario",
        )

    with col2:
        try:
            _ora_i = datetime.strptime(str(evento.get("Ora Inizio", "08:00")), "%H:%M").time()
        except Exception:
            _ora_i = datetime.strptime("08:00", "%H:%M").time()
        try:
            _ora_f = datetime.strptime(str(evento.get("Ora Fine", "10:00")), "%H:%M").time()
        except Exception:
            _ora_f = datetime.strptime("10:00", "%H:%M").time()
        nuovo_orario_i = st.time_input("Ora inizio", value=_ora_i, key="medit_ora_i").strftime("%H:%M")
        nuovo_orario_f = st.time_input("Ora fine",   value=_ora_f, key="medit_ora_f").strftime("%H:%M")

        tutte_palestre = palestre_lista + ["Fuori Casa"]
        pal_ev = str(evento.get("Palestra", ""))
        nuova_palestra = st.selectbox(
            "Palestra", tutte_palestre,
            index=tutte_palestre.index(pal_ev) if pal_ev in tutte_palestre else 0,
            key="medit_palestra",
        )
        nuovo_luogo = st.text_input(
            "Luogo (trasferta)",
            value=str(evento.get("Luogo", "")),
            key="medit_luogo",
        )

    # ── Pulsanti azione ──────────────────────────────────────────────
    st.markdown("---")
    ca, cb, cc = st.columns([3, 3, 2])

    with ca:
        if st.button("💾 Salva modifiche", type="primary", use_container_width=True):
            giorno_nuovo = GIORNI_SETTIMANA[nuova_data_dt.weekday()]
            if aggiorna_riga(
                "Calendario Definitivo", idx + 1,
                [nuova_data, giorno_nuovo, nuova_squadra, nuovo_tipo,
                 nuovo_avversario, nuovo_orario_i, nuovo_orario_f,
                 nuova_palestra, nuovo_luogo],
            ):
                st.success("✅ Evento aggiornato!")
                carica_tutti_i_dati.clear()
                leggi_foglio.clear()
                st.session_state.pop("modifica_evento_idx", None)
                st.session_state.pop("_conferma_elimina_ev", None)
                st.rerun()

    with cb:
        if st.button("🗑️ Elimina evento", use_container_width=True):
            st.session_state["_conferma_elimina_ev"] = True

    with cc:
        if st.button("← Torna", use_container_width=True):
            st.session_state.pop("modifica_evento_idx", None)
            st.session_state.pop("_conferma_elimina_ev", None)
            st.rerun()

    # ── Conferma eliminazione ────────────────────────────────────────
    if st.session_state.get("_conferma_elimina_ev"):
        st.warning("⚠️ **Sei sicuro?** L'eliminazione è irreversibile.")
        c1, c2 = st.columns(2)
        with c1:
            if st.button(
                "✅ Sì, elimina",
                key="conf_el_ev",
                type="primary",
                use_container_width=True,
            ):
                if elimina_riga("Calendario Definitivo", idx + 1):
                    st.success("✅ Eliminato!")
                    carica_tutti_i_dati.clear()
                    leggi_foglio.clear()
                    st.session_state.pop("modifica_evento_idx", None)
                    st.session_state.pop("_conferma_elimina_ev", None)
                    st.rerun()
        with c2:
            if st.button("❌ Annulla", key="annulla_el_ev", use_container_width=True):
                st.session_state.pop("_conferma_elimina_ev", None)
                st.rerun()


# ── Pagina risolvi conflitto ───────────────────────────────────────────────────

def _render_risolvi_conflitto():
    idx = st.session_state.get("risolvi_conflitto_idx")
    if idx is None:
        return

    df          = leggi_foglio("Calendario Definitivo")
    orario_fisso = leggi_foglio("Orario Fisso")
    df_squadre  = leggi_foglio("Squadre")
    df_allenatori = leggi_foglio("Allenatori")
    df_palestre = leggi_foglio("Palestre")
    calendario  = leggi_foglio("Calendario Definitivo")

    if df.empty or idx >= len(df):
        st.warning("Evento non trovato.")
        return

    evento     = df.iloc[idx]
    squadra    = evento["Squadra"]
    palestra   = evento.get("Palestra", "")
    ora_inizio = evento.get("Ora Inizio", "")
    ora_fine   = evento.get("Ora Fine", "")
    data       = evento.get("Data", "")
    giorno     = evento.get("Giorno", "")

    st.header(f"🔧 Risolvi conflitto — {squadra}")
    st.markdown(f"**Partita:** {giorno.capitalize()} {data} | {ora_inizio}-{ora_fine} @ {palestra}")
    st.markdown("---")

    riga_squadra = df_squadre[df_squadre["Categoria"] == squadra]
    minuti_risc, durata = 30, 105
    if not riga_squadra.empty:
        try:
            minuti_risc = int(riga_squadra.iloc[0]["Minuti Riscaldamento"])
            durata      = int(riga_squadra.iloc[0]["Durata Partita"])
        except Exception:
            pass

    date_alt = trova_date_alternative(
        data, squadra, palestra, ora_inizio, ora_fine,
        orario_fisso, calendario, df_squadre,
    )

    # ── RISOLUZIONE AUTOMATICA ──────────────────────────────────────
    st.markdown(
        "<div style='background:#0d2137;border:2px solid #4a9eff;border-radius:10px;"
        "padding:14px 18px;margin-bottom:16px'>"
        "<span style='color:#4a9eff;font-size:1.1em;font-weight:800'>🤖 Risoluzione automatica</span>"
        "<br><span style='color:#b8d4f0;font-size:0.9em'>L'app analizza il conflitto e propone "
        "la soluzione più semplice con un solo clic.</span></div>",
        unsafe_allow_html=True,
    )

    # Calcola il piano automatico
    piano_key = f"_piano_auto_{idx}"
    if piano_key not in st.session_state:
        if date_alt:
            # Strategia 1: sposta la partita
            d0 = date_alt[0]
            st.session_state[piano_key] = {
                "tipo":  "sposta_partita",
                "label": f"Sposta la partita a **{d0['giorno']} {d0['data']}** "
                         f"(prima data libera vicina)",
                "data":  d0,
            }
        else:
            # Strategia 2: sposta allenamenti in conflitto al primo slot libero
            _conflitti_fissi = []
            giorno_norm_tmp  = str(giorno).strip().lower()
            pal_norm_tmp     = str(palestra).strip().lower()
            try:
                _si, _sf = calcola_slot(str(ora_inizio), minuti_risc, durata)
            except Exception:
                _si, _sf = str(ora_inizio), str(ora_fine)
            if not orario_fisso.empty:
                mask_tmp = (
                    (orario_fisso["giorno"].str.lower().str.strip()   == giorno_norm_tmp) &
                    (orario_fisso["palestra"].str.lower().str.strip() == pal_norm_tmp)
                )
                for _, ev_tmp in orario_fisso[mask_tmp].iterrows():
                    if c_e_conflitto(_si, _sf, ev_tmp["ora_inizio"], ev_tmp["ora_fine"]):
                        sq_tmp = str(ev_tmp.get("squadra", "")).strip()
                        try:
                            dur_tmp = (
                                time_to_minutes(str_to_time(ev_tmp["ora_fine"])) -
                                time_to_minutes(str_to_time(ev_tmp["ora_inizio"]))
                            )
                        except Exception:
                            dur_tmp = 90
                        slots_tmp = trova_slot_liberi(
                            sq_tmp, dur_tmp, orario_fisso,
                            df_squadre, df_allenatori, df_palestre,
                        )
                        _conflitti_fissi.append({
                            "squadra": sq_tmp,
                            "dur":     dur_tmp,
                            "slot":    slots_tmp[0] if slots_tmp else None,
                        })

            risolvibili = [c for c in _conflitti_fissi if c["slot"]]
            irrisolvibili = [c for c in _conflitti_fissi if not c["slot"]]

            if risolvibili:
                righe_desc = []
                for c in risolvibili:
                    s = c["slot"]
                    righe_desc.append(
                        f"• **{c['squadra']}** → {s['giorno'].capitalize()} "
                        f"{s['ora_inizio']}–{s['ora_fine']} @ {s['palestra']}"
                    )
                if irrisolvibili:
                    righe_desc.append(
                        f"⚠️ Nessuno slot trovato per: "
                        + ", ".join(c["squadra"] for c in irrisolvibili)
                    )
                st.session_state[piano_key] = {
                    "tipo":        "sposta_allenamenti",
                    "label":       "\n".join(righe_desc),
                    "conflitti":   risolvibili,
                    "parziale":    bool(irrisolvibili),
                }
            else:
                st.session_state[piano_key] = {"tipo": "impossibile"}

    piano = st.session_state.get(piano_key, {"tipo": "impossibile"})

    if piano["tipo"] == "impossibile":
        st.warning(
            "Nessuna soluzione automatica trovata. "
            "Usa le opzioni manuali qui sotto."
        )
    else:
        if piano["tipo"] == "sposta_partita":
            d0 = piano["data"]
            st.success(f"**Piano:** {piano['label']}")
        else:
            st.success(f"**Piano — sposta allenamenti:**\n\n{piano['label']}")

        col_a, col_b = st.columns([3, 1])
        with col_a:
            if st.button(
                "🚀 Esegui automaticamente",
                type="primary",
                use_container_width=True,
                key="auto_risolvi_btn",
            ):
                ok = False
                if piano["tipo"] == "sposta_partita":
                    d0 = piano["data"]
                    nuova_riga = [
                        d0["data_raw"], d0["giorno"].lower(), squadra,
                        "Partita in Casa", ora_inizio, ora_fine,
                        palestra, evento.get("Luogo", palestra),
                    ]
                    ok = aggiorna_riga("Calendario Definitivo", idx + 1, nuova_riga)
                elif piano["tipo"] == "sposta_allenamenti":
                    righe_new = []
                    for c in piano["conflitti"]:
                        s = c["slot"]
                        righe_new.append([
                            data, giorno, c["squadra"],
                            "Allenamento spostato", "",
                            s["ora_inizio"], s["ora_fine"], "Casa", s["palestra"],
                        ])
                    aggiorna_riga(
                        "Calendario Definitivo", idx + 1,
                        [data, giorno, squadra, "Partita in Casa",
                         ora_inizio, ora_fine, palestra, evento.get("Luogo", palestra)],
                    )
                    if righe_new:
                        scrivi_righe_batch("Calendario Definitivo", righe_new)
                    ok = True

                if ok:
                    carica_tutti_i_dati.clear()
                    leggi_foglio.clear()
                    st.session_state.pop(piano_key, None)
                    st.session_state.pop("risolvi_conflitto_idx", None)
                    st.success("✅ Conflitto risolto!")
                    st.rerun()
        with col_b:
            if st.button("🔄 Ricalcola", use_container_width=True, key="auto_ricalcola"):
                st.session_state.pop(piano_key, None)
                st.rerun()

    st.markdown("---")
    st.markdown("**Oppure gestisci manualmente:**")
    st.markdown("---")

    if date_alt:
        st.subheader("📅 Opzione 1 — Sposta la partita in una data libera")
        cols = st.columns(len(date_alt))
        for i, d in enumerate(date_alt):
            with cols[i]:
                if st.button(f"📅 {d['giorno']}\n{d['data']}", key=f"risolvi_data_{i}"):
                    nuova_riga = [d["data_raw"], d["giorno"].lower(), squadra,
                                  "Partita in Casa", ora_inizio, ora_fine,
                                  palestra, evento.get("Luogo", palestra)]
                    if aggiorna_riga("Calendario Definitivo", idx + 1, nuova_riga):
                        st.success("✅ Partita spostata!")
                        del st.session_state["risolvi_conflitto_idx"]
                        st.rerun()

    # ── Ricalcola lo slot completo (con riscaldamento) ─────────────
    # L'ora salvata nel foglio è l'ora partita, ma il conflitto può
    # coinvolgere la fascia di riscaldamento che la precede.
    try:
        slot_inizio, slot_fine = calcola_slot(str(ora_inizio), minuti_risc, durata)
    except Exception:
        slot_inizio, slot_fine = str(ora_inizio), str(ora_fine)

    st.markdown(
        f"Slot occupato (con riscaldamento {minuti_risc}'): "
        f"**{slot_inizio} → {slot_fine}**",
    )

    # ── Mostra con cosa è in conflitto ─────────────────────────────
    conflitti = []
    giorno_norm = str(giorno).strip().lower()
    palestra_norm = str(palestra).strip().lower()

    if not orario_fisso.empty:
        mask_of = (
            (orario_fisso["giorno"].str.lower().str.strip()   == giorno_norm) &
            (orario_fisso["palestra"].str.lower().str.strip() == palestra_norm)
        )
        for _, ev in orario_fisso[mask_of].iterrows():
            if c_e_conflitto(slot_inizio, slot_fine, ev["ora_inizio"], ev["ora_fine"]):
                conflitti.append({
                    "squadra":    str(ev.get("squadra", "")),
                    "ora_inizio": str(ev.get("ora_inizio", "")),
                    "ora_fine":   str(ev.get("ora_fine", "")),
                    "tipo":       "Allenamento fisso",
                })

    if not calendario.empty:
        # Cerca anche per palestra, non solo per Casa/Fuori
        mask_cal = (
            calendario["Giorno"].str.lower().str.strip() == giorno_norm
        )
        if "Palestra" in calendario.columns:
            mask_cal = mask_cal & (
                calendario["Palestra"].str.lower().str.strip() == palestra_norm
            )
        elif "Casa/Fuori" in calendario.columns:
            mask_cal = mask_cal & (
                calendario["Casa/Fuori"].str.lower() == "casa"
            )
        for row_label, ev in calendario[mask_cal].iterrows():
            if row_label == idx:
                continue
            if c_e_conflitto(slot_inizio, slot_fine,
                             str(ev.get("Ora Inizio", "")), str(ev.get("Ora Fine", ""))):
                conflitti.append({
                    "squadra":    str(ev.get("Squadra", "")),
                    "ora_inizio": str(ev.get("Ora Inizio", "")),
                    "ora_fine":   str(ev.get("Ora Fine", "")),
                    "tipo":       str(ev.get("Tipo", "Evento calendario")),
                })

    st.markdown("##### ⚠️ In conflitto con:")
    if not conflitti:
        st.info(
            "Nessun conflitto trovato nell'orario fisso per questa palestra e giorno. "
            f"(giorno: *{giorno_norm}*, palestra: *{palestra_norm}*, "
            f"slot: {slot_inizio}–{slot_fine})"
        )
    else:
        for c in conflitti:
            st.markdown(
                f"- **{c['squadra']}** &nbsp;·&nbsp; "
                f"{c['ora_inizio']}–{c['ora_fine']} &nbsp;·&nbsp; "
                f"*{c['tipo']}*"
            )
    st.markdown("---")

    st.subheader("🔄 Opzione 2 — Sposta gli allenamenti in conflitto")
    if not conflitti:
        st.info("Nessun allenamento spostabile trovato.")
    else:
        durata_totale = minuti_risc + durata
        _, scelte = render_sposta_allenamenti(
            conflitti, durata_totale,
            orario_fisso, df_squadre, df_allenatori, df_palestre,
            key_prefix="risolvi_",
        )


        if st.button("✅ Conferma e risolvi", type="primary"):
            tutti_ok = all(v[0] != "— Seleziona slot —" for v in scelte.values() if v[0] != "__nessuno__")
            if not tutti_ok:
                st.warning("⚠️ Seleziona uno slot per ogni allenamento.")
            else:
                aggiorna_riga("Calendario Definitivo", idx + 1,
                              [data, giorno, squadra, "Partita in Casa",
                               ora_inizio, ora_fine, palestra, evento.get("Luogo", palestra)])
                righe_spostamenti = build_spostamento_rows(data, scelte)
                if righe_spostamenti:
                    scrivi_righe_batch("Calendario Definitivo", righe_spostamenti)
                st.success("✅ Conflitto risolto!")
                del st.session_state["risolvi_conflitto_idx"]
                st.rerun()

    st.markdown("---")
    if st.button("← Torna al Calendario"):
        del st.session_state["risolvi_conflitto_idx"]
        st.rerun()


# ── Card partite ──────────────────────────────────────────────────────────────

_TIPO_BG = {
    "casa":      "#0D3B6E",
    "fuori":     "#4A235A",
    "conflitto": "#8B0000",
    "prov":      "#7D4A00",
    "altro":     "#2C3E50",
}


def _card_bg(tipo: str) -> str:
    t = str(tipo)
    if "CONFLITTO" in t:    return _TIPO_BG["conflitto"]
    if "[PROV]" in t:       return _TIPO_BG["prov"]
    if "Fuori Casa" in t:   return _TIPO_BG["fuori"]
    if "Casa" in t:         return _TIPO_BG["casa"]
    return _TIPO_BG["altro"]


def _render_evento_card(row_label, row, key_prefix: str):
    """Render un singolo evento del calendario come card colorata con ✏️ e 🗑️."""
    tipo     = str(row.get("Tipo", ""))
    squadra  = str(row.get("Squadra", ""))
    data_str = str(row.get("Data", ""))
    giorno   = str(row.get("Giorno", "")).capitalize()
    ora_i    = str(row.get("Ora Inizio", ""))
    ora_f    = str(row.get("Ora Fine", ""))
    palestra = str(row.get("Palestra", ""))
    avvers   = str(row.get("Avversario", "")).strip()
    bg       = _card_bg(tipo)

    badge_tipo = _tipo_short(tipo)
    avvers_html = (
        f"<div style='color:rgba(255,255,255,0.75);font-size:0.82em;margin-top:2px'>"
        f"vs {avvers}</div>"
    ) if avvers else ""
    conf_badge = (
        "<span style='background:#FFD700;color:#000;font-size:0.75em;"
        "font-weight:700;padding:2px 7px;border-radius:4px;margin-left:6px'>"
        "⚠️ CONFLITTO</span>"
    ) if "CONFLITTO" in tipo else ""

    card_html = (
        f"<div style='background:{bg};border-radius:10px;padding:10px 15px;"
        f"margin:5px 0;box-shadow:0 2px 8px rgba(0,0,0,0.25)'>"
        f"<div style='display:flex;justify-content:space-between;align-items:center'>"
        f"<span style='color:white;font-weight:800;font-size:1.05em'>"
        f"{squadra}{conf_badge}"
        f"</span>"
        f"<span style='color:rgba(255,255,255,0.9);font-weight:700;font-size:0.9em'>"
        f"⏰ {ora_i}–{ora_f}"
        f"</span>"
        f"</div>"
        f"<div style='color:rgba(255,255,255,0.8);font-size:0.85em;margin-top:5px;"
        f"display:flex;gap:16px;flex-wrap:wrap'>"
        f"<span>📅 {giorno} {data_str}</span>"
        f"<span>🏟️ {palestra or '—'}</span>"
        f"<span>{badge_tipo}</span>"
        f"</div>"
        f"{avvers_html}"
        f"</div>"
    )

    confirm_key  = f"{key_prefix}_del_{row_label}"
    _is_admin_cv = st.session_state.get("ruolo", "admin") == "admin"

    if _is_admin_cv and st.session_state.get(confirm_key):
        cc = st.columns([5, 1, 1])
        cc[0].warning(f"Elimina **{squadra}** del {data_str}?")
        with cc[1]:
            if st.button("✅", key=f"{key_prefix}_delyes_{row_label}",
                         type="primary", use_container_width=True):
                if elimina_riga("Calendario Definitivo", row_label + 1):
                    st.session_state.pop(confirm_key, None)
                    carica_tutti_i_dati.clear()
                    leggi_foglio.clear()
                    st.rerun()
        with cc[2]:
            if st.button("✖", key=f"{key_prefix}_delno_{row_label}",
                         use_container_width=True):
                st.session_state.pop(confirm_key, None)
                st.rerun()
    elif _is_admin_cv:
        c1, c2, c3 = st.columns([9, 1, 1])
        with c1:
            st.markdown(card_html, unsafe_allow_html=True)
        with c2:
            st.write("")
            if st.button("✏️", key=f"{key_prefix}_edit_{row_label}", help="Modifica",
                         use_container_width=True):
                st.session_state["modifica_evento_idx"] = int(row_label)
                st.session_state.pop("_conferma_elimina_ev", None)
                st.rerun()
        with c3:
            st.write("")
            if st.button("🗑️", key=f"{key_prefix}_delbtn_{row_label}",
                         help="Elimina", use_container_width=True):
                st.session_state[confirm_key] = True
                st.rerun()
    else:
        st.markdown(card_html, unsafe_allow_html=True)


def _render_cards_list(df: pd.DataFrame, key_prefix: str = "card"):
    """Render tutti gli eventi di df come sequenza di card ordinate per data."""
    if df.empty:
        st.info("Nessun evento da mostrare.")
        return
    df_s = df.copy()
    df_s["_dt"] = df_s["Data"].apply(
        lambda x: pd.Timestamp(parse_data(x)) if parse_data(x) else pd.NaT
    )
    df_sorted = df_s.sort_values("_dt")
    for row_label, row in df_sorted.iterrows():
        _render_evento_card(row_label, row, key_prefix)


def _render_cards_settimanale(df: pd.DataFrame, key_prefix: str = "csett"):
    """Render le partite della settimana corrente (lun–dom)."""
    oggi = datetime.today().date()
    lun  = oggi - timedelta(days=oggi.weekday())
    dom  = lun + timedelta(days=6)

    st.markdown(
        f"<div style='background:#1a3a5c;color:white;padding:8px 16px;"
        f"border-radius:8px;margin:0 0 14px 0;font-weight:700;font-size:1.0em'>"
        f"📅 Settimana corrente &nbsp;·&nbsp; {lun.strftime('%d/%m')} → {dom.strftime('%d/%m/%Y')}"
        f"</div>",
        unsafe_allow_html=True,
    )

    if df.empty:
        st.info("Nessuna partita in programma questa settimana.")
        return

    df_s = df.copy()
    df_s["_dt"] = df_s["Data"].apply(
        lambda x: pd.Timestamp(parse_data(x)) if parse_data(x) else pd.NaT
    )
    mask = (df_s["_dt"].dt.date >= lun) & (df_s["_dt"].dt.date <= dom)
    df_week = df_s[mask].sort_values("_dt")

    if df_week.empty:
        st.info("Nessuna partita in programma questa settimana.")
        return

    for row_label, row in df_week.iterrows():
        _render_evento_card(row_label, row, key_prefix)


# ── render principale ──────────────────────────────────────────────────────────

def render():
    _is_admin_render = st.session_state.get("ruolo", "admin") == "admin"
    # Sotto-pagine esclusive (solo admin)
    if _is_admin_render and "risolvi_conflitto_idx" in st.session_state:
        _render_risolvi_conflitto()
        return
    if _is_admin_render and "modifica_evento_idx" in st.session_state:
        _render_modifica_evento()
        return

    st.markdown(
        "<div style='background:linear-gradient(135deg,#0d2137,#1a3a5c);"
        "border-radius:12px;padding:16px 24px;margin-bottom:20px'>"
        "<span style='color:white;font-size:1.6em;font-weight:800'>📋 Calendario Partite</span>"
        "</div>",
        unsafe_allow_html=True,
    )
    dati = carica_tutti_i_dati()

    df_raw       = dati.get("Calendario Definitivo", pd.DataFrame())
    orario_fisso = dati.get("Orario Fisso", pd.DataFrame())

    # ── Prepara df e filtri solo se ci sono dati ──────────────────
    df_filtrato = pd.DataFrame()

    if not df_raw.empty:
        df = df_raw.copy()
        df["_sort_dt"] = df["Data"].apply(
            lambda x: pd.Timestamp(parse_data(x)) if parse_data(x) else pd.Timestamp("2099-01-01")
        )
        df = df.sort_values("_sort_dt").drop(columns=["_sort_dt"]).reset_index(drop=True)

        # ── CONTATORI ─────────────────────────────────────────────
        tipo_col = df["Tipo"].astype(str) if "Tipo" in df.columns else pd.Series([""] * len(df))
        n_casa  = int(tipo_col.str.contains("Partita in Casa",  na=False).sum())
        n_fuori = int(tipo_col.str.contains("Fuori Casa",       na=False).sum())
        n_conf  = int(tipo_col.str.contains("CONFLITTO",        na=False).sum())
        n_prov  = int((tipo_col.str.contains(r"\[PROV\]", na=False) |
                       tipo_col.str.contains("Provvisorio", na=False)).sum())

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("🏠 In casa",    n_casa)
        c2.metric("🚌 Fuori casa", n_fuori)
        c3.metric("⚠️ Conflitti",  n_conf,
                  delta=f"{n_conf} da risolvere" if n_conf else None,
                  delta_color="inverse" if n_conf else "off")
        c4.metric("🕐 Provvisorie", n_prov,
                  delta=f"{n_prov} da confermare" if n_prov else None,
                  delta_color="inverse" if n_prov else "off")
        st.markdown("---")

        # ── AVVISI CONFLITTI ──────────────────────────────────────
        if "Tipo" in df.columns:
            conflitti_urgenti = [
                (i, row) for i, (_, row) in enumerate(df.iterrows())
                if "CONFLITTO" in str(row.get("Tipo", "")) and is_settimana_prossima(row.get("Data", ""))
            ]
            conflitti_normali = [
                (i, row) for i, (_, row) in enumerate(df.iterrows())
                if "CONFLITTO" in str(row.get("Tipo", "")) and not is_settimana_prossima(row.get("Data", ""))
            ]
            _is_admin_conf = st.session_state.get("ruolo", "admin") == "admin"
            if conflitti_urgenti:
                st.error(f"🚨 **URGENTE — {len(conflitti_urgenti)} conflitti nella settimana prossima!**")
                for real_idx, ev in conflitti_urgenti:
                    con = _conflitti_inline(ev, orario_fisso, df)
                    con_str = "  \n&nbsp;&nbsp;&nbsp;&nbsp;↔ " + " &amp; ".join(con) if con else ""
                    if _is_admin_conf:
                        col1, col2 = st.columns([4, 1])
                        with col1:
                            st.markdown(
                                f"🔴 **{ev['Squadra']}** — {ev.get('Data','')} "
                                f"{ev.get('Ora Inizio','')}–{ev.get('Ora Fine','')} "
                                f"@ {ev.get('Palestra','')}{con_str}"
                            )
                        with col2:
                            if st.button("🔧 Risolvi", key=f"risolvi_urgente_{real_idx}"):
                                st.session_state["risolvi_conflitto_idx"] = real_idx
                                st.rerun()
                    else:
                        st.markdown(
                            f"🔴 **{ev['Squadra']}** — {ev.get('Data','')} "
                            f"{ev.get('Ora Inizio','')}–{ev.get('Ora Fine','')} "
                            f"@ {ev.get('Palestra','')}{con_str}"
                        )
            if conflitti_normali:
                st.warning(f"⚠️ **{len(conflitti_normali)} conflitti da risolvere**")
                for real_idx, ev in conflitti_normali:
                    con = _conflitti_inline(ev, orario_fisso, df)
                    con_str = "  \n&nbsp;&nbsp;&nbsp;&nbsp;↔ " + " &amp; ".join(con) if con else ""
                    if _is_admin_conf:
                        col1, col2 = st.columns([4, 1])
                        with col1:
                            st.markdown(
                                f"🟡 **{ev['Squadra']}** — {ev.get('Data','')} "
                                f"{ev.get('Ora Inizio','')}–{ev.get('Ora Fine','')} "
                                f"@ {ev.get('Palestra','')}{con_str}"
                            )
                        with col2:
                            if st.button("🔧 Risolvi", key=f"risolvi_{real_idx}"):
                                st.session_state["risolvi_conflitto_idx"] = real_idx
                                st.rerun()
                    else:
                        st.markdown(
                            f"🟡 **{ev['Squadra']}** — {ev.get('Data','')} "
                            f"{ev.get('Ora Inizio','')}–{ev.get('Ora Fine','')} "
                            f"@ {ev.get('Palestra','')}{con_str}"
                        )
            if conflitti_urgenti or conflitti_normali:
                st.markdown("---")

        # ── FILTRI ────────────────────────────────────────────────
        col1, col2 = st.columns(2)
        with col1:
            squadre = ["Tutte"] + sorted(df["Squadra"].unique().tolist())
            squadra_filtro = st.selectbox("Filtra per squadra", squadre, key="cal_filtro_sq")
        with col2:
            tipi = ["Tutti"] + sorted(df["Tipo"].unique().tolist())
            tipo_filtro = st.selectbox("Filtra per tipo", tipi, key="cal_filtro_tipo")

        df_filtrato = df.copy()
        if squadra_filtro != "Tutte":
            df_filtrato = df_filtrato[df_filtrato["Squadra"] == squadra_filtro]
        if tipo_filtro != "Tutti":
            df_filtrato = df_filtrato[df_filtrato["Tipo"] == tipo_filtro]

        st.caption(f"Totale eventi: {len(df_filtrato)}")
        st.markdown(
            '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px 0;font-size:0.82em">'
            '<span style="background:#d4edda;color:#155724;padding:2px 8px;border-radius:4px">🟢 Casa</span>'
            '<span style="background:#cce5ff;color:#004085;padding:2px 8px;border-radius:4px">🔵 Fuori Casa</span>'
            '<span style="background:#fff3cd;color:#856404;padding:2px 8px;border-radius:4px">🟡 Provvisoria</span>'
            '<span style="background:#f8d7da;color:#721c24;padding:2px 8px;border-radius:4px">🔴 Conflitto</span>'
            '</div>',
            unsafe_allow_html=True,
        )

    # ── TABS — in base al ruolo ───────────────────────────────────
    _is_admin_cal = st.session_state.get("ruolo", "admin") == "admin"

    if _is_admin_cal:
        tab_completo, tab_settimane, tab_inserisci, tab_pdf = st.tabs([
            "📋 Calendario completo",
            "📅 Partite della Settimana",
            "➕ Inserisci Partita",
            "📄 Importa Calendario FIP",
        ])
        with tab_inserisci:
            _page_inserisci.render(as_tab=True, dati=dati)
        with tab_pdf:
            _page_pdf.render(as_tab=True, dati=dati)
    else:
        tab_completo, tab_settimane = st.tabs([
            "📋 Calendario completo",
            "📅 Partite della Settimana",
        ])

    with tab_completo:
        _render_cards_list(df_filtrato, key_prefix="cal")

    with tab_settimane:
        _render_cards_settimanale(df_filtrato, key_prefix="sett")
