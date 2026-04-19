"""
Scheduling Automatico Allenamenti — Versione 1 (Suggeritore).
Accessibile solo agli admin tramite la voce "⚙️ Scheduling" nel menu.
"""

import streamlit as st
import pandas as pd
from datetime import time as dtime

from logic import (
    GIORNI, FASCE_ORARIE,
    genera_orario_settimanale,
    minutes_to_time_str, time_to_minutes, str_to_time,
)
from database import (
    leggi_palestre, leggi_allenatori, leggi_squadre,
    invalida_cache, scrivi_eventi_batch, get_client,
)
from views._components import get_team_color

# ── Costanti slot ──────────────────────────────────────────────────────────────
_GIORNI_L    = [g.lower() for g in GIORNI]
_SLOT_BASE   = 15 * 60       # 15:00 in minuti
_SLOT_SZ     = 15            # minuti per slot
_N_SLOTS     = 28            # da 15:00 a 22:00 = 28 slot da 15 min
_SLOT_LABELS = [minutes_to_time_str(_SLOT_BASE + i * _SLOT_SZ) for i in range(_N_SLOTS)]
_FASCE_NOMI  = list(FASCE_ORARIE.keys())

# Opzioni durata allenamento in slot → label
_DUR_VALS   = [4, 5, 6, 7, 8]
_DUR_LABELS = ["4 slot — 60 min", "5 slot — 75 min", "6 slot — 90 min",
               "7 slot — 105 min", "8 slot — 120 min"]


# ── Session state helpers ──────────────────────────────────────────────────────

def _v() -> dict:
    """Restituisce (e crea se assente) il dizionario vincoli in session_state."""
    if "sched_vincoli" not in st.session_state:
        st.session_state["sched_vincoli"] = {
            "palestre":   {},
            "allenatori": {},
            "squadre":    [],
            "doppi":      [],
        }
    return st.session_state["sched_vincoli"]


def _init_from_db(df_palestre, df_allenatori, df_squadre):
    """Popola i vincoli con valori di default dal DB (solo al primo accesso)."""
    v = _v()

    # Palestre: inizializza slot da orario_inizio/orario_fine e giorni DB
    if not v["palestre"] and not df_palestre.empty:
        for _, row in df_palestre.iterrows():
            nome = str(row.get("Nome", "")).strip()
            if not nome:
                continue
            try:
                oi_m = time_to_minutes(str_to_time(str(row.get("Orario Inizio", "15:00"))))
                of_m = time_to_minutes(str_to_time(str(row.get("Orario Fine",   "22:00"))))
            except Exception:
                oi_m, of_m = _SLOT_BASE, _SLOT_BASE + _N_SLOTS * _SLOT_SZ
            slots_def = [
                i for i in range(_N_SLOTS)
                if _SLOT_BASE + i * _SLOT_SZ >= oi_m
                and _SLOT_BASE + (i + 1) * _SLOT_SZ <= of_m
            ]
            v["palestre"][nome] = {
                g_l: (list(slots_def) if str(row.get(g_p, "NO")).upper() == "SI" else [])
                for g_l, g_p in zip(_GIORNI_L, GIORNI)
            }

    # Allenatori: inizializza senza giorni bloccati
    if not v["allenatori"] and not df_allenatori.empty:
        for _, row in df_allenatori.iterrows():
            nome = (
                f"{str(row.get('Nome','')).strip()} "
                f"{str(row.get('Cognome','')).strip()}"
            ).strip()
            if nome:
                v["allenatori"].setdefault(nome, {"giorni_no": []})

    # Squadre: inizializza con valori di default
    if not v["squadre"] and not df_squadre.empty:
        for _, row in df_squadre.iterrows():
            cat = str(row.get("Categoria", "")).strip()
            if cat:
                v["squadre"].append({
                    "nome":         cat,
                    "min_all":      2,
                    "max_all":      4,
                    "durata_slot":  6,
                    "palestra_pref": "",
                    "fascia_pref":  "Pomeriggio tardi",
                    "giorno_riposo": "",
                    "priorita":     5,
                })


# ══════════════════════════════════════════════════════════════════════════════
#  TAB SETUP — PALESTRE
# ══════════════════════════════════════════════════════════════════════════════

def _tab_palestre():
    v = _v()
    st.markdown("### 🏟️ Disponibilità Palestre")
    st.caption(
        "Ogni riga = uno slot da 15 minuti. **Spuntato (✓)** = palestra disponibile. "
        "Premi **💾 Salva** per confermare le modifiche."
    )

    if not v["palestre"]:
        st.warning("Nessuna palestra configurata. Vai in **⚙️ Setup > Palestre** prima.")
        return

    for nome_pal, giorni_slots in list(v["palestre"].items()):
        with st.expander(f"🏟️ {nome_pal}", expanded=False):
            # DataFrame iniziale da session state
            init_data = {
                g_p: [i in set(giorni_slots.get(g_l, [])) for i in range(_N_SLOTS)]
                for g_l, g_p in zip(_GIORNI_L, GIORNI)
            }
            df_init = pd.DataFrame(init_data, index=_SLOT_LABELS)

            edited = st.data_editor(
                df_init,
                key=f"sched_pal_{nome_pal}",
                use_container_width=True,
                height=min(460, 40 + _N_SLOTS * 14),
                column_config={
                    g_p: st.column_config.CheckboxColumn(g_p[:3], default=False)
                    for g_p in GIORNI
                },
            )

            c1, c2, c3 = st.columns([1, 1, 4])
            if c1.button("💾 Salva", key=f"save_pal_{nome_pal}", type="primary"):
                for g_l, g_p in zip(_GIORNI_L, GIORNI):
                    v["palestre"][nome_pal][g_l] = [
                        i for i, val in enumerate(edited[g_p]) if val
                    ]
                st.success(f"✅ Disponibilità **{nome_pal}** salvata!")

            if c2.button("✅ Tutti", key=f"allpal_{nome_pal}", help="Abilita tutti gli slot"):
                for g_l in _GIORNI_L:
                    v["palestre"][nome_pal][g_l] = list(range(_N_SLOTS))
                st.session_state.pop(f"sched_pal_{nome_pal}", None)
                st.rerun()

            if c3.button("❌ Nessuno", key=f"nopal_{nome_pal}", help="Disabilita tutti gli slot"):
                for g_l in _GIORNI_L:
                    v["palestre"][nome_pal][g_l] = []
                st.session_state.pop(f"sched_pal_{nome_pal}", None)
                st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
#  TAB SETUP — ALLENATORI
# ══════════════════════════════════════════════════════════════════════════════

def _tab_allenatori():
    v = _v()
    st.markdown("### 👤 Indisponibilità Allenatori")
    st.caption(
        "Spunta i giorni in cui ogni allenatore **NON può venire**. "
        "Se allena più squadre, questo viene gestito automaticamente dall'algoritmo."
    )

    if not v["allenatori"]:
        st.warning("Nessun allenatore. Aggiungilo in **⚙️ Setup > Allenatori**.")
        return

    for nome, info in list(v["allenatori"].items()):
        with st.expander(f"👤 {nome}", expanded=False):
            giorni_no_cur = set(info.get("giorni_no", []))
            gcols = st.columns(7)
            nuovi_no = []
            for i, (g_l, g_p) in enumerate(zip(_GIORNI_L, GIORNI)):
                with gcols[i]:
                    checked = st.checkbox(
                        g_p[:3],
                        value=g_l in giorni_no_cur,
                        key=f"all_no_{nome}_{g_l}",
                        help=f"Non disponibile {g_p}",
                    )
                    if checked:
                        nuovi_no.append(g_l)

            if st.button("💾 Salva", key=f"save_all_{nome}", type="primary"):
                v["allenatori"][nome]["giorni_no"] = nuovi_no
                st.success(f"✅ Vincoli **{nome}** salvati!")


# ══════════════════════════════════════════════════════════════════════════════
#  TAB SETUP — SQUADRE
# ══════════════════════════════════════════════════════════════════════════════

def _tab_squadre(df_palestre):
    v = _v()
    st.markdown("### 🏀 Parametri Scheduling — Squadre")
    st.caption(
        "Configura i vincoli per ogni squadra. "
        "**Priorità 10** = viene schedulata per prima (es. Serie B)."
    )

    if not v["squadre"]:
        st.warning("Nessuna squadra. Aggiungila in **⚙️ Setup > Squadre**.")
        return

    palestre_opts = [""] + (
        df_palestre["Nome"].tolist() if not df_palestre.empty else list(v["palestre"].keys())
    )
    riposo_opts = ["Nessuno"] + GIORNI

    for idx, sq in enumerate(v["squadre"]):
        nome = sq["nome"]
        with st.expander(f"🏀 {nome} — Priorità {sq['priorita']}", expanded=False):
            c1, c2 = st.columns(2)

            with c1:
                min_all = st.number_input(
                    "Min allenamenti/settimana", 1, 7,
                    value=int(sq.get("min_all", 2)), step=1,
                    key=f"sq_min_{idx}",
                )
                dur_val = sq.get("durata_slot", 6)
                dur_idx = _DUR_VALS.index(dur_val) if dur_val in _DUR_VALS else 2
                dur_sel = st.selectbox(
                    "Durata allenamento",
                    options=range(len(_DUR_LABELS)),
                    format_func=lambda i: _DUR_LABELS[i],
                    index=dur_idx,
                    key=f"sq_dur_{idx}",
                )
                pal_cur = sq.get("palestra_pref", "")
                pal_idx = palestre_opts.index(pal_cur) if pal_cur in palestre_opts else 0
                palestra_pref = st.selectbox(
                    "Palestra preferita", palestre_opts,
                    index=pal_idx, key=f"sq_pal_{idx}",
                )
                rip_cur = sq.get("giorno_riposo", "")
                rip_disp = rip_cur.capitalize() if rip_cur else "Nessuno"
                rip_idx = riposo_opts.index(rip_disp) if rip_disp in riposo_opts else 0
                giorno_riposo = st.selectbox(
                    "Giorno di riposo fisso", riposo_opts,
                    index=rip_idx, key=f"sq_rip_{idx}",
                )

            with c2:
                max_all = st.number_input(
                    "Max allenamenti/settimana", 1, 7,
                    value=int(sq.get("max_all", 4)), step=1,
                    key=f"sq_max_{idx}",
                )
                fascia_cur = sq.get("fascia_pref", "Pomeriggio tardi")
                fascia_idx = _FASCE_NOMI.index(fascia_cur) if fascia_cur in _FASCE_NOMI else 1
                fascia_pref = st.radio(
                    "Fascia oraria preferita", _FASCE_NOMI,
                    index=fascia_idx, key=f"sq_fascia_{idx}",
                )
                priorita = st.slider(
                    "Priorità (10 = massima)", 1, 10,
                    value=int(sq.get("priorita", 5)), key=f"sq_prio_{idx}",
                )

            if st.button("💾 Salva", key=f"save_sq_{idx}", type="primary"):
                min_v, max_v = int(min_all), int(max_all)
                if min_v > max_v:
                    st.error("Il minimo non può superare il massimo.")
                else:
                    v["squadre"][idx].update({
                        "min_all":       min_v,
                        "max_all":       max_v,
                        "durata_slot":   _DUR_VALS[dur_sel],
                        "palestra_pref": palestra_pref or "",
                        "fascia_pref":   fascia_pref,
                        "giorno_riposo": "" if giorno_riposo == "Nessuno" else giorno_riposo.lower(),
                        "priorita":      int(priorita),
                    })
                    st.success(f"✅ Parametri **{nome}** salvati!")


# ══════════════════════════════════════════════════════════════════════════════
#  TAB SETUP — DOPPI ALLENAMENTI
# ══════════════════════════════════════════════════════════════════════════════

def _tab_doppi():
    v = _v()
    st.markdown("### 👥 Giocatori con Doppio Allenamento")
    st.caption(
        "Elenca i giocatori che si allenano con due squadre. "
        "L'algoritmo cercherà di mettere le due squadre **nello stesso giorno**."
    )

    squadre_nomi = [sq["nome"] for sq in v["squadre"]]

    if v["doppi"]:
        st.markdown("**Giocatori configurati:**")
        for di, d in enumerate(list(v["doppi"])):
            c1, c2, c3, c4 = st.columns([2, 2, 2, 1])
            c1.markdown(f"👤 **{d.get('giocatore', '')}**")
            c2.markdown(f"Principale: {d.get('squadra_principale', '')}")
            c3.markdown(f"Secondaria: {d.get('squadra_secondaria', '')}")
            if c4.button("🗑️", key=f"del_doppio_{di}", help="Rimuovi"):
                v["doppi"].pop(di)
                st.rerun()
        st.markdown("---")

    st.markdown("**➕ Aggiungi giocatore:**")
    c1, c2, c3 = st.columns(3)
    with c1:
        gioc = st.text_input("Nome giocatore", key="new_doppio_gioc")
    with c2:
        sq_p = st.selectbox("Squadra principale", ["—"] + squadre_nomi, key="new_doppio_sqp")
    with c3:
        sq_s_opts = [s for s in squadre_nomi if s != sq_p and sq_p != "—"]
        sq_s = st.selectbox("Squadra secondaria", ["—"] + sq_s_opts, key="new_doppio_sqs")

    if st.button("➕ Aggiungi", type="primary", key="btn_add_doppio"):
        if gioc.strip() and sq_p != "—" and sq_s != "—":
            v["doppi"].append({
                "giocatore":         gioc.strip(),
                "squadra_principale": sq_p,
                "squadra_secondaria": sq_s,
            })
            st.success(f"✅ {gioc.strip()} aggiunto!")
            st.rerun()
        else:
            st.warning("Compila tutti i campi.")


# ══════════════════════════════════════════════════════════════════════════════
#  GENERAZIONE — helpers
# ══════════════════════════════════════════════════════════════════════════════

def _parse_sq_ruoli_inline(squadre_str: str) -> dict:
    """'U18 (Capo allenatore), U15' → {'U18': 'Capo allenatore', 'U15': ''}"""
    result = {}
    for part in str(squadre_str).split(","):
        part = part.strip()
        if not part:
            continue
        if "(" in part and part.endswith(")"):
            team  = part[:part.rfind("(")].strip()
            ruolo = part[part.rfind("(") + 1:-1].strip()
        else:
            team, ruolo = part, ""
        if team:
            result[team] = ruolo
    return result


def _build_vincoli_algo(v: dict, df_allenatori) -> dict:
    """Arricchisce v['squadre'] con la lista allenatori letta dal DB."""
    sq_coaches: dict = {}
    if not df_allenatori.empty:
        for _, row in df_allenatori.iterrows():
            nome = (
                f"{str(row.get('Nome','')).strip()} "
                f"{str(row.get('Cognome','')).strip()}"
            ).strip()
            for sq in _parse_sq_ruoli_inline(str(row.get("Squadre", ""))):
                sq_coaches.setdefault(sq, []).append(nome)

    squadre_enriched = [
        {**sq, "allenatori": sq_coaches.get(sq["nome"], [])}
        for sq in v["squadre"]
    ]
    return {
        "palestre":   v["palestre"],
        "allenatori": v["allenatori"],
        "squadre":    squadre_enriched,
        "doppi":      v["doppi"],
    }


def _check_conflicts(asgn_list: list) -> list:
    """Rileva conflitti palestra/orario e squadra doppia nello stesso giorno."""
    conflitti = []
    n = len(asgn_list)
    for i in range(n):
        a = asgn_list[i]
        for j in range(i + 1, n):
            b = asgn_list[j]
            if a["giorno"] != b["giorno"]:
                continue
            # Stessa squadra nello stesso giorno
            if a["squadra"] == b["squadra"]:
                conflitti.append(
                    f"⚠️ Squadra **{a['squadra']}** ha due allenamenti "
                    f"il **{a['giorno'].capitalize()}**"
                )
                continue
            # Stessa palestra, orari sovrapposti
            if a["palestra"] == b["palestra"]:
                try:
                    ai = time_to_minutes(str_to_time(a["ora_inizio"]))
                    af = time_to_minutes(str_to_time(a["ora_fine"]))
                    bi = time_to_minutes(str_to_time(b["ora_inizio"]))
                    bf = time_to_minutes(str_to_time(b["ora_fine"]))
                    if ai < bf and af > bi:
                        conflitti.append(
                            f"⚠️ Palestra **{a['palestra']}** il "
                            f"**{a['giorno'].capitalize()}**: "
                            f"{a['squadra']} {a['ora_inizio']}–{a['ora_fine']} "
                            f"si sovrappone con {b['squadra']} "
                            f"{b['ora_inizio']}–{b['ora_fine']}"
                        )
                except Exception:
                    pass
    return conflitti


# ══════════════════════════════════════════════════════════════════════════════
#  VISUALIZZAZIONE GRIGLIA SETTIMANALE
# ══════════════════════════════════════════════════════════════════════════════

def _render_grid(asgn_list: list):
    """Calendario settimanale HTML con celle colorate per squadra (step 30 min)."""
    STEP = 30
    n_rows = (_N_SLOTS * _SLOT_SZ) // STEP
    row_labels = [minutes_to_time_str(_SLOT_BASE + i * STEP) for i in range(n_rows)]

    # Lookup: (giorno_l, row_label) → lista di assegnazioni che coprono quel slot
    lookup: dict = {}
    for a in asgn_list:
        g  = a["giorno"].lower()
        oi = time_to_minutes(str_to_time(a["ora_inizio"]))
        of = time_to_minutes(str_to_time(a["ora_fine"]))
        for ri, rl in enumerate(row_labels):
            rm = _SLOT_BASE + ri * STEP
            if oi <= rm < of:
                lookup.setdefault((g, rl), []).append(a)

    has_sun = any(a["giorno"].lower() == "domenica" for a in asgn_list)
    giorni_show = _GIORNI_L[:-1] + (["domenica"] if has_sun else [])

    TH = "padding:5px 3px;background:#0D3B6E;color:white;text-align:center;font-size:0.78em"
    TD_T = "padding:3px 4px;border:1px solid #e4e4e4;color:#aaa;font-size:0.7em;white-space:nowrap"
    TD_E = "border:1px solid #e4e4e4;background:#fafafa;min-width:80px;height:22px"
    TD_F = "border:1px solid #e4e4e4;padding:2px;min-width:80px"

    html = [f"<div style='overflow-x:auto'><table style='border-collapse:collapse;width:100%'>"]
    html.append(f"<tr><th style='{TH};min-width:48px'>Ora</th>")
    for g_l in giorni_show:
        g_p = g_l.capitalize()
        html.append(f"<th style='{TH};min-width:88px'>{g_p[:3]}</th>")
    html.append("</tr>")

    for rl in row_labels:
        html.append(f"<tr><td style='{TD_T}'>{rl}</td>")
        for g in giorni_show:
            entries = lookup.get((g, rl), [])
            if entries:
                cell_parts = []
                for e in entries:
                    bg  = get_team_color(e["squadra"])
                    sq  = e["squadra"]
                    pal = e["palestra"]
                    cell_parts.append(
                        f"<div style='background:{bg};color:white;border-radius:3px;"
                        f"padding:1px 4px;margin:1px;font-size:0.7em;white-space:nowrap;"
                        f"overflow:hidden;text-overflow:ellipsis' title='{pal}'>{sq}</div>"
                    )
                html.append(f"<td style='{TD_F}'>{''.join(cell_parts)}</td>")
            else:
                html.append(f"<td style='{TD_E}'></td>")
        html.append("</tr>")

    html.append("</table></div>")
    st.markdown("".join(html), unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
#  MODIFICA MANUALE
# ══════════════════════════════════════════════════════════════════════════════

def _modifica_manuale(edit_list: list, v: dict):
    st.caption(
        "Rimuovi, aggiungi o sposta allenamenti. "
        "I conflitti vengono mostrati in tempo reale nel riquadro sopra."
    )

    palestre_opts = list(v["palestre"].keys()) or ["—"]
    squadre_opts  = [sq["nome"] for sq in v["squadre"]] or ["—"]

    # ── Lista allenamenti con pulsante rimuovi ─────────────────────────────
    if not edit_list:
        st.info("Nessun allenamento nel piano corrente.")
    else:
        # Header compatto
        h1, h2, h3, h4, h5, h6 = st.columns([2, 1, 2, 1, 1, 0.6])
        for hcol, label in zip([h1,h2,h3,h4,h5,h6],
                               ["Squadra","Giorno","Palestra","Inizio","Fine",""]):
            hcol.markdown(f"**{label}**")
        st.markdown("<hr style='margin:4px 0'>", unsafe_allow_html=True)

        for ei, entry in enumerate(list(edit_list)):
            c1, c2, c3, c4, c5, c6 = st.columns([2, 1, 2, 1, 1, 0.6])
            color = get_team_color(entry["squadra"])
            c1.markdown(
                f"<span style='background:{color};color:white;padding:2px 7px;"
                f"border-radius:5px;font-size:0.82em'>{entry['squadra']}</span>",
                unsafe_allow_html=True,
            )
            c2.markdown(entry["giorno"].capitalize())
            c3.markdown(entry["palestra"])
            c4.markdown(entry["ora_inizio"])
            c5.markdown(entry["ora_fine"])
            if c6.button("🗑️", key=f"del_asgn_{ei}", help="Rimuovi questo allenamento"):
                edit_list.pop(ei)
                st.session_state["sched_edit"] = edit_list
                st.rerun()

    # ── Aggiungi allenamento ───────────────────────────────────────────────
    st.markdown("---")
    st.markdown("**➕ Aggiungi allenamento:**")
    c1, c2, c3 = st.columns(3)
    with c1:
        sq_new  = st.selectbox("Squadra", squadre_opts, key="mod_sq_new")
        g_new   = st.selectbox("Giorno", GIORNI, key="mod_g_new")
    with c2:
        pal_new = st.selectbox("Palestra", palestre_opts, key="mod_pal_new")
        dur_idx = st.selectbox(
            "Durata", range(len(_DUR_LABELS)),
            format_func=lambda i: _DUR_LABELS[i],
            index=2, key="mod_dur_new",
        )
    with c3:
        oi_new  = st.time_input("Ora inizio", value=dtime(17, 0), key="mod_oi_new")

    if st.button("➕ Aggiungi allenamento", key="btn_add_asgn", use_container_width=True):
        dur_min = _DUR_VALS[dur_idx] * _SLOT_SZ
        oi_m    = oi_new.hour * 60 + oi_new.minute
        of_str  = minutes_to_time_str(oi_m + dur_min)
        new_e   = {
            "squadra":    sq_new,
            "giorno":     g_new.lower(),
            "palestra":   pal_new,
            "ora_inizio": oi_new.strftime("%H:%M"),
            "ora_fine":   of_str,
            "allenatori": "",
        }
        edit_list.append(new_e)
        st.session_state["sched_edit"] = edit_list
        st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
#  SALVATAGGIO SU SUPABASE
# ══════════════════════════════════════════════════════════════════════════════

def _salva_orario(asgn_list: list, sostituisci: bool):
    if sostituisci:
        try:
            db = get_client()
            db.table("orario_fisso").delete().neq("id", 0).execute()
        except Exception as e:
            st.error(f"Errore durante l'eliminazione dell'orario esistente: {e}")
            return

    righe = [
        {
            "giorno":       a["giorno"].lower(),
            "palestra":     a["palestra"],
            "squadra":      a["squadra"],
            "ora_inizio":   a["ora_inizio"],
            "ora_fine":     a["ora_fine"],
            "allenatori":   a.get("allenatori", ""),
            "condivisione": "no",
            "zona":         "",
        }
        for a in asgn_list
    ]

    if scrivi_eventi_batch("orario_fisso", righe):
        invalida_cache()
        st.success(f"✅ {len(righe)} allenamenti salvati come orario tipo!")
        st.session_state.pop("sched_result", None)
        st.session_state.pop("sched_edit",   None)
        st.rerun()
    else:
        st.error("Errore durante il salvataggio.")


# ══════════════════════════════════════════════════════════════════════════════
#  TAB GENERA & RISULTATO
# ══════════════════════════════════════════════════════════════════════════════

def _tab_genera(v: dict, df_allenatori):
    st.markdown("### 🚀 Genera Orario Settimanale")

    if not v["palestre"]:
        st.error("Configura prima le **palestre** nel tab ⚙️ Setup.")
        return
    if not v["squadre"]:
        st.error("Configura prima le **squadre** nel tab ⚙️ Setup.")
        return

    col_btn, col_info = st.columns([1, 3])
    with col_btn:
        genera = st.button("🚀 Genera Orario", type="primary", use_container_width=True)
    with col_info:
        st.caption(
            "L'algoritmo assegna gli allenamenti rispettando disponibilità palestre, "
            "vincoli allenatori, fasce orarie e priorità squadre."
        )

    if genera:
        vincoli = _build_vincoli_algo(v, df_allenatori)
        with st.spinner("Generazione orario in corso..."):
            result = genera_orario_settimanale(vincoli)
        st.session_state["sched_result"] = result
        st.session_state["sched_edit"]   = list(result["assegnazioni"])
        st.rerun()

    result = st.session_state.get("sched_result")
    if not result:
        st.info(
            "Configura i vincoli nel tab **⚙️ Setup Vincoli** e premi **Genera Orario**."
        )
        return

    edit_list: list = st.session_state.get("sched_edit", list(result["assegnazioni"]))

    # ── Avvisi algoritmo ──────────────────────────────────────────────────
    if result["avvisi"]:
        for av in result["avvisi"]:
            st.warning(av)
    else:
        st.success(
            f"✅ Orario generato — **{len(edit_list)} allenamenti** assegnati, nessun avviso."
        )

    # ── Conflitti in tempo reale ──────────────────────────────────────────
    conflitti = _check_conflicts(edit_list)
    if conflitti:
        with st.expander(f"⚠️ {len(conflitti)} conflitto/i rilevato/i", expanded=True):
            for c in conflitti:
                st.error(c)

    # ── Calendario visivo ─────────────────────────────────────────────────
    st.markdown("#### 📅 Calendario Settimanale")
    _render_grid(edit_list)

    # ── Dettaglio e modifica ──────────────────────────────────────────────
    st.markdown("#### 📋 Dettaglio & Modifica")
    tab_res, tab_mod = st.tabs(["📋 Lista allenamenti", "✏️ Modifica manuale"])

    with tab_res:
        if edit_list:
            df_show = pd.DataFrame(edit_list)[
                ["squadra", "giorno", "palestra", "ora_inizio", "ora_fine", "allenatori"]
            ].copy()
            df_show.columns = ["Squadra", "Giorno", "Palestra", "Inizio", "Fine", "Allenatori"]
            df_show["Giorno"] = df_show["Giorno"].str.capitalize()
            df_show = df_show.sort_values(["Giorno", "Inizio"]).reset_index(drop=True)
            st.dataframe(df_show, use_container_width=True, hide_index=True)
        else:
            st.info("Nessun allenamento nel piano.")

    with tab_mod:
        _modifica_manuale(edit_list, v)

    # ── Salva come orario tipo ────────────────────────────────────────────
    st.markdown("---")
    st.markdown("#### ✅ Salva come Orario Tipo")

    col_opt, col_save = st.columns([2, 1])
    with col_opt:
        sostituisci = st.checkbox(
            "Sostituisci l'orario fisso esistente (elimina e riscrivi tutto)",
            value=True, key="sched_sostituisci",
        )
        if not sostituisci:
            st.caption(
                "⚠️ In modalità *aggiungi* potrebbero crearsi duplicati se l'orario "
                "era già stato salvato in precedenza."
            )
    with col_save:
        if st.button(
            "✅ Conferma e Salva",
            type="primary",
            use_container_width=True,
            disabled=bool(conflitti),
            key="btn_salva_orario",
        ):
            _salva_orario(edit_list, sostituisci)

    if conflitti:
        st.caption("⛔ Risolvi i conflitti prima di salvare.")


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def render():
    st.header("⚙️ Scheduling Automatico")

    df_palestre   = leggi_palestre()
    df_allenatori = leggi_allenatori()
    df_squadre    = leggi_squadre()

    v = _v()
    _init_from_db(df_palestre, df_allenatori, df_squadre)

    tab_setup, tab_genera = st.tabs(["⚙️ Setup Vincoli", "🚀 Genera & Risultato"])

    with tab_setup:
        sub_pal, sub_all, sub_sq, sub_dop = st.tabs([
            "🏟️ Palestre",
            "👤 Allenatori",
            "🏀 Squadre",
            "👥 Doppi Allenamento",
        ])
        with sub_pal:
            _tab_palestre()
        with sub_all:
            _tab_allenatori()
        with sub_sq:
            _tab_squadre(df_palestre)
        with sub_dop:
            _tab_doppi()

    with tab_genera:
        _tab_genera(v, df_allenatori)
