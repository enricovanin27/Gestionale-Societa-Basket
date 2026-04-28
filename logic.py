"""
Funzioni pure di logica — nessuna dipendenza da Streamlit.
Le credenziali email vengono impostate da app.py dopo l'import:
    import logic
    logic.EMAIL_MITTENTE = st.secrets["email"]["mittente"]
    logic.EMAIL_PASSWORD  = st.secrets["email"]["password"]
"""

import pandas as pd
from datetime import datetime, timedelta
import pdfplumber
import re
import io
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Impostate da app.py all'avvio
EMAIL_MITTENTE = ""
EMAIL_PASSWORD = ""

GIORNI = ["Lunedi", "Martedi", "Mercoledi", "Giovedi", "Venerdi", "Sabato", "Domenica"]
GIORNI_SETTIMANA = {
    0: "lunedi", 1: "martedi", 2: "mercoledi",
    3: "giovedi", 4: "venerdi", 5: "sabato", 6: "domenica"
}

FASCE_ORARIE = {
    "Pomeriggio presto": ("15:00", "18:00"),
    "Pomeriggio tardi":  ("18:00", "20:00"),
    "Sera":              ("20:00", "22:00"),
}

_SCHED_SLOT_BASE = 15 * 60  # 15:00 in minuti
_SCHED_SLOT_SZ   = 15       # minuti per slot


def _slot_idx(time_str: str) -> int:
    """Converte HH:MM in indice slot (0 = 15:00, 1 = 15:15, ...)."""
    m = time_to_minutes(str_to_time(time_str))
    return (m - _SCHED_SLOT_BASE) // _SCHED_SLOT_SZ


# =============================================
# SCHEDULING AUTOMATICO
# =============================================

def genera_orario_settimanale(vincoli: dict) -> dict:
    """
    Genera un orario settimanale con constraint propagation.

    vincoli = {
      'palestre':  {nome_pal: {giorno_lower: [slot_indices_disponibili]}},
      'allenatori': {nome: {'giorni_no': [giorni_lower]}},
      'squadre': [{
        nome, min_all, max_all, durata_slot (n. slot da 15min),
        palestra_pref, fascia_pref, giorno_riposo (lower), priorita,
        allenatori: [nomi_completi]
      }],
      'doppi': [{giocatore, squadra_principale, squadra_secondaria}]
    }
    Returns {'assegnazioni': [...], 'avvisi': [...]}
    """
    DAYS = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]
    FASCE_ORDER = list(FASCE_ORARIE.keys())

    # Precomputa indici slot per ogni fascia
    fasce_slots = {
        fname: (_slot_idx(t_start), _slot_idx(t_end))
        for fname, (t_start, t_end) in FASCE_ORARIE.items()
    }

    # Griglia disponibilità palestre: {pal: {day: set di slot_idx disponibili}}
    pal_avail: dict = {}
    for pal, giorni in vincoli.get("palestre", {}).items():
        pal_avail[pal] = {day: set(giorni.get(day, [])) for day in DAYS}

    # Slot occupati: {pal: {day: set di slot_idx presi}}
    occupied: dict = {pal: {day: set() for day in DAYS} for pal in pal_avail}

    # Allenatori impegnati: {nome: {day: set di slot_idx}}
    all_busy: dict = {}

    # Giorni assegnati per squadra: {nome: set di days}
    team_days: dict = {}

    # Mappa doppi: {squadra: set di partner}
    doppi_map: dict = {}
    for d in vincoli.get("doppi", []):
        sp = d.get("squadra_principale", "")
        ss = d.get("squadra_secondaria", "")
        if sp and ss:
            doppi_map.setdefault(sp, set()).add(ss)
            doppi_map.setdefault(ss, set()).add(sp)

    # STEP 2 — Ordina per priorità, poi per meno opzioni (constraint propagation)
    def _count_opts(sq):
        pref   = sq.get("palestra_pref", "")
        riposo = (sq.get("giorno_riposo") or "").lower().strip()
        fascia = sq.get("fascia_pref", "Pomeriggio tardi")
        dur    = sq.get("durata_slot", 6)
        fs, fe = fasce_slots.get(fascia, (0, 28))
        pals   = ([pref] if pref in pal_avail else []) or list(pal_avail.keys())
        count  = 0
        for day in DAYS:
            if day == riposo:
                continue
            for p in pals:
                avail = pal_avail[p].get(day, set())
                for s in range(fs, max(fs, fe - dur + 1)):
                    if set(range(s, s + dur)).issubset(avail):
                        count += 1
        return count

    squadre_sorted = sorted(
        vincoli.get("squadre", []),
        key=lambda sq: (-sq.get("priorita", 5), _count_opts(sq)),
    )

    assegnazioni: list = []
    avvisi:       list = []

    # STEP 3 — Assegna slot
    for sq in squadre_sorted:
        nome     = sq["nome"]
        min_all  = sq.get("min_all", 2)
        max_all  = sq.get("max_all", 4)
        dur      = sq.get("durata_slot", 6)
        pal_pref = sq.get("palestra_pref", "")
        fascia_p = sq.get("fascia_pref", "Pomeriggio tardi")
        riposo   = (sq.get("giorno_riposo") or "").lower().strip()
        all_nomi = sq.get("allenatori", [])

        team_days[nome] = set()
        assegnati = 0

        # Giorni bloccati da TUTTI i coach della squadra
        giorni_no_coach: set = set()
        for a in all_nomi:
            for gno in vincoli.get("allenatori", {}).get(a, {}).get("giorni_no", []):
                giorni_no_coach.add(gno.lower().strip())

        # Ordine palestre: preferita → altre
        if pal_pref and pal_pref in pal_avail:
            pal_order = [pal_pref] + [p for p in pal_avail if p != pal_pref]
        else:
            pal_order = list(pal_avail.keys())

        # Ordine fasce: preferita → espansione
        fascia_order = [fascia_p] + [f for f in FASCE_ORDER if f != fascia_p]

        for _attempt in range(max_all):
            if assegnati >= max_all:
                break

            # Giorni dove i partner hanno già un allenamento → preferiti
            partner_days_count: dict = {}
            for partner in doppi_map.get(nome, set()):
                for pd_ in team_days.get(partner, set()):
                    partner_days_count[pd_] = partner_days_count.get(pd_, 0) + 1

            avail_days = [
                d for d in DAYS
                if d != riposo
                and d not in giorni_no_coach
                and d not in team_days[nome]
            ]
            days_sorted = sorted(avail_days, key=lambda d: -partner_days_count.get(d, 0))

            found = False
            for fascia in fascia_order:
                if found:
                    break
                fs, fe = fasce_slots.get(fascia, (0, 28))
                search_range = range(fs, max(fs, fe - dur + 1))

                for giorno in days_sorted:
                    if found:
                        break
                    for pal in pal_order:
                        if found:
                            break
                        avail = pal_avail[pal][giorno]
                        occ   = occupied[pal][giorno]

                        for start_s in search_range:
                            slots_needed = set(range(start_s, start_s + dur))
                            if not slots_needed.issubset(avail):
                                continue
                            if slots_needed & occ:
                                continue
                            # Verifica allenatori liberi
                            coach_ok = True
                            for a in all_nomi:
                                if slots_needed & all_busy.get(a, {}).get(giorno, set()):
                                    coach_ok = False
                                    break
                            if not coach_ok:
                                continue

                            # Assegna!
                            oi = minutes_to_time_str(_SCHED_SLOT_BASE + start_s * _SCHED_SLOT_SZ)
                            of = minutes_to_time_str(_SCHED_SLOT_BASE + (start_s + dur) * _SCHED_SLOT_SZ)
                            occupied[pal][giorno] |= slots_needed
                            team_days[nome].add(giorno)
                            for a in all_nomi:
                                all_busy.setdefault(a, {}).setdefault(giorno, set())
                                all_busy[a][giorno] |= slots_needed

                            assegnazioni.append({
                                "squadra":    nome,
                                "giorno":     giorno,
                                "palestra":   pal,
                                "ora_inizio": oi,
                                "ora_fine":   of,
                                "allenatori": " - ".join(all_nomi),
                            })
                            assegnati += 1
                            found = True
                            break

        # STEP 4 — Avvisi per vincoli non rispettati
        if assegnati < min_all:
            target_str = f" (target: {max_all})" if max_all > min_all else ""
            avvisi.append(
                f"⚠️ {nome}: assegnati {assegnati} allenamenti "
                f"su {min_all} richiesti{target_str}"
            )

    return {"assegnazioni": assegnazioni, "avvisi": avvisi}


# =============================================
# UTILITÀ ORARI
# =============================================

def _norm(s: str) -> str:
    """Normalizza stringa per confronti robusti: lowercase + strip."""
    return str(s).strip().lower()


def str_to_time(orario):
    s = str(orario).strip()
    for fmt in ["%H:%M", "%H:%M:%S"]:
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            continue
    raise ValueError(f"Formato orario non riconosciuto: {orario!r}")

def time_to_minutes(t):
    return t.hour * 60 + t.minute

def minutes_to_time_str(m):
    return f"{m // 60:02d}:{m % 60:02d}"

def c_e_conflitto(inizio_a, fine_a, inizio_b, fine_b):
    try:
        return str_to_time(str(inizio_a)) < str_to_time(str(fine_b)) and \
               str_to_time(str(fine_a)) > str_to_time(str(inizio_b))
    except:
        return False


def trova_conflitti_allenamenti(orario_fisso) -> list:
    """
    Trova coppie di allenamenti fissi che si sovrappongono nello stesso giorno e palestra.
    Ritorna lista di dict con i dettagli del conflitto.
    """
    if orario_fisso is None or orario_fisso.empty:
        return []
    conflitti = []
    rows = list(orario_fisso.iterrows())
    for i, (idx_a, ev_a) in enumerate(rows):
        giorno_a = _norm(ev_a.get("giorno", ""))
        pal_a    = _norm(ev_a.get("palestra", ""))
        oi_a     = str(ev_a.get("ora_inizio", "")).strip()
        of_a     = str(ev_a.get("ora_fine",   "")).strip()
        if not giorno_a or not pal_a or not oi_a or not of_a:
            continue
        for idx_b, ev_b in rows[i + 1:]:
            if _norm(ev_b.get("giorno",    "")) != giorno_a:
                continue
            if _norm(ev_b.get("palestra",  "")) != pal_a:
                continue
            oi_b = str(ev_b.get("ora_inizio", "")).strip()
            of_b = str(ev_b.get("ora_fine",   "")).strip()
            if c_e_conflitto(oi_a, of_a, oi_b, of_b):
                cond_a = _norm(ev_a.get("condivisione", ev_a.get("tipo", "")))
                cond_b = _norm(ev_b.get("condivisione", ev_b.get("tipo", "")))
                if cond_a == "si" and cond_b == "si":
                    continue  # condivisione volontaria — non è un conflitto
                # Zone diverse nella stessa palestra → non è un conflitto
                zona_a = _norm(str(ev_a.get("zona", "") or ""))
                zona_b = _norm(str(ev_b.get("zona", "") or ""))
                if zona_a and zona_b and zona_a != zona_b:
                    continue
                conflitti.append({
                    "giorno":       giorno_a,
                    "palestra":     str(ev_a.get("palestra", "")).strip(),
                    "squadra_a":    str(ev_a.get("squadra", "")).strip(),
                    "ora_inizio_a": oi_a,
                    "ora_fine_a":   of_a,
                    "squadra_b":    str(ev_b.get("squadra", "")).strip(),
                    "ora_inizio_b": oi_b,
                    "ora_fine_b":   of_b,
                    "idx_a":        idx_a,
                    "idx_b":        idx_b,
                })
    return conflitti

def calcola_slot(ora_partita_str, minuti_risc, durata_partita):
    t = datetime.strptime(ora_partita_str, "%H:%M")
    inizio_slot = t - timedelta(minutes=int(minuti_risc))
    fine_slot = t + timedelta(minutes=int(durata_partita))
    return inizio_slot.strftime("%H:%M"), fine_slot.strftime("%H:%M")


# =============================================
# LOGICA SQUADRE / ALLENATORI
# =============================================

def giorni_disponibili_squadra(squadra, df_squadre):
    if df_squadre.empty:
        return [g.lower() for g in GIORNI]
    riga = df_squadre[df_squadre["Categoria"] == squadra]
    if riga.empty:
        return [g.lower() for g in GIORNI]
    giorni = []
    for g in GIORNI:
        val = str(riga.iloc[0].get(g, "")).strip().upper()
        if val in ["SI", "SÌ", "1", "TRUE", "X", "S"]:
            giorni.append(g.lower())
    return giorni if giorni else [g.lower() for g in GIORNI]

def allenatori_squadra(squadra, df_allenatori):
    if df_allenatori.empty:
        return []
    risultato = []
    for _, row in df_allenatori.iterrows():
        # Rimuove eventuale ruolo inline: "U18 (Capo allenatore)" → "U18"
        squadre = [s.split("(")[0].strip()
                   for s in str(row.get("Squadre", "")).split(",")]
        if squadra in squadre:
            nome = str(row.get("Nome", "")).strip()
            cognome = str(row.get("Cognome", "")).strip()
            risultato.append(f"{nome} {cognome}".strip())
    return risultato

def trova_conflitti_allenatore_slot(squadra, giorno, ora_inizio, ora_fine, orario_fisso, df_allenatori):
    """
    Verifica se uno degli allenatori della squadra è già impegnato
    in un'altra squadra nello stesso slot orario nell'orario fisso.

    Returns: lista di dict {allenatore, altra_squadra, ora_inizio, ora_fine}
    """
    if orario_fisso is None or orario_fisso.empty or df_allenatori is None or df_allenatori.empty:
        return []

    # Ricava i cognomi degli allenatori della squadra corrente
    cognomi_squadra = []
    for _, row in df_allenatori.iterrows():
        sq_list = [s.split("(")[0].strip() for s in str(row.get("Squadre", "")).split(",")]
        if squadra in sq_list:
            cognome = str(row.get("Cognome", "")).strip()
            if cognome:
                cognomi_squadra.append(cognome)

    if not cognomi_squadra:
        return []

    conflitti = []
    mask = orario_fisso["giorno"].str.lower().str.strip() == _norm(giorno)
    for _, ev in orario_fisso[mask].iterrows():
        sq_ev = str(ev.get("squadra", "")).strip()
        if _norm(sq_ev) == _norm(squadra):
            continue  # stessa squadra, ignora
        if not c_e_conflitto(ora_inizio, ora_fine,
                             str(ev.get("ora_inizio", "")),
                             str(ev.get("ora_fine", ""))):
            continue
        all_ev = [a.strip() for a in str(ev.get("allenatori", "")).split("-") if a.strip()]
        for cognome in cognomi_squadra:
            for ae in all_ev:
                # Confronto flessibile: cognome contenuto nel nome o viceversa
                if _norm(cognome) in _norm(ae) or _norm(ae) in _norm(cognome):
                    conflitti.append({
                        "allenatore": cognome,
                        "squadra":    sq_ev,
                        "ora_inizio": str(ev.get("ora_inizio", "")),
                        "ora_fine":   str(ev.get("ora_fine", "")),
                    })
                    break  # un match per allenatore è sufficiente

    return conflitti


def controlla_conflitti_slot(
    data_str: str,
    squadra: str,
    palestra: str,
    ora_inizio: str,
    ora_fine: str,
    giorno_norm: str,
    orario_fisso,
    orario_settimana_df,
    calendario,
    df_allenatori,
    exclude_sett_id=None,
) -> dict:
    """
    Controlla i 3 tipi di conflitti per uno slot in orario_settimana.
    Returns {
      'palestra':  [{squadra, ora_inizio, ora_fine, source}, ...],
      'allenatore':[{nome, squadra_o_evento, ora_inizio, ora_fine, tipo}, ...],
      'doppio':    {ora_inizio, ora_fine, source} | None
    }
    """
    result = {"palestra": [], "allenatore": [], "doppio": None}
    if not ora_inizio or not ora_fine or not palestra:
        return result

    pal_norm = _norm(palestra)
    sq_norm  = _norm(squadra)
    g_norm   = _norm(giorno_norm)

    cognomi_sq: list = []
    if df_allenatori is not None and not getattr(df_allenatori, "empty", True):
        for _, ar in df_allenatori.iterrows():
            sq_list = [s.split("(")[0].strip() for s in str(ar.get("Squadre", "")).split(",")]
            if squadra in sq_list:
                cog = str(ar.get("Cognome", "")).strip()
                if cog:
                    cognomi_sq.append(cog)

    def _coaches_in_common(all_str: str) -> list:
        all_ev = [a.strip() for a in str(all_str).split("-") if a.strip()]
        found = []
        for cog in cognomi_sq:
            for ae in all_ev:
                if _norm(cog) in _norm(ae) or _norm(ae) in _norm(cog):
                    found.append(cog)
                    break
        return found

    seen_pal: set = set()
    seen_all: set = set()

    def _add_pal(sq_ev, oi, of, src):
        k = (_norm(sq_ev), oi)
        if k not in seen_pal:
            seen_pal.add(k)
            result["palestra"].append({"squadra": sq_ev, "ora_inizio": oi, "ora_fine": of, "source": src})

    def _add_all(nome, sq_ev, oi, of, tipo):
        k = (_norm(nome), _norm(sq_ev))
        if k not in seen_all:
            seen_all.add(k)
            result["allenatore"].append({"nome": nome, "squadra_o_evento": sq_ev,
                                          "ora_inizio": oi, "ora_fine": of, "tipo": tipo})

    # ── Orario settimana per quella data ──────────────────────────────────────
    if orario_settimana_df is not None and not getattr(orario_settimana_df, "empty", True):
        for row_id, row in orario_settimana_df.iterrows():
            if exclude_sett_id is not None and row_id == exclude_sett_id:
                continue
            if bool(row.get("annullato", False)):
                continue
            if str(row.get("data", "")) != data_str:
                continue
            r_sq  = str(row.get("squadra",    "")).strip()
            r_pal = _norm(str(row.get("palestra", "")).strip())
            r_oi  = str(row.get("ora_inizio", "")).strip()
            r_of  = str(row.get("ora_fine",   "")).strip()
            if not c_e_conflitto(ora_inizio, ora_fine, r_oi, r_of):
                continue
            if _norm(r_sq) == sq_norm:
                if result["doppio"] is None:
                    result["doppio"] = {"ora_inizio": r_oi, "ora_fine": r_of, "source": "settimana"}
            else:
                if r_pal == pal_norm:
                    cond = str(row.get("condivisione", "NO")).strip().upper()
                    if cond != "SI":
                        _add_pal(r_sq, r_oi, r_of, "settimana")
                for cog in _coaches_in_common(str(row.get("allenatori", ""))):
                    _add_all(cog, r_sq, r_oi, r_of, "allenamento")

    # ── Orario fisso per quel giorno (dove non c'è override) ─────────────────
    if orario_fisso is not None and not getattr(orario_fisso, "empty", True):
        for _, ev in orario_fisso.iterrows():
            if _norm(str(ev.get("giorno", ""))) != g_norm:
                continue
            ev_sq  = str(ev.get("squadra", "")).strip()
            ev_pal = _norm(str(ev.get("palestra", "")).strip())
            ev_oi  = str(ev.get("ora_inizio", "")).strip()
            ev_of  = str(ev.get("ora_fine",   "")).strip()
            # Salta se c'è già un override/annullamento in orario_settimana per questa data
            has_override = False
            if orario_settimana_df is not None and not getattr(orario_settimana_df, "empty", True):
                for _, sr in orario_settimana_df.iterrows():
                    if (str(sr.get("data", "")) == data_str and
                            _norm(str(sr.get("squadra", ""))) == _norm(ev_sq)):
                        has_override = True
                        break
            if has_override:
                continue
            if not c_e_conflitto(ora_inizio, ora_fine, ev_oi, ev_of):
                continue
            if _norm(ev_sq) == sq_norm:
                if result["doppio"] is None:
                    result["doppio"] = {"ora_inizio": ev_oi, "ora_fine": ev_of, "source": "fisso"}
            else:
                if ev_pal == pal_norm:
                    cond = str(ev.get("condivisione", ev.get("tipo", "NO"))).strip().upper()
                    if cond != "SI":
                        _add_pal(ev_sq, ev_oi, ev_of, "fisso")
                for cog in _coaches_in_common(str(ev.get("allenatori", ""))):
                    _add_all(cog, ev_sq, ev_oi, ev_of, "allenamento")

    # ── Calendario partite per quella data ───────────────────────────────────
    if calendario is not None and not getattr(calendario, "empty", True):
        cal_day = calendario[calendario["Data"] == data_str] if "Data" in calendario.columns else pd.DataFrame()
        for _, ev in cal_day.iterrows():
            ev_sq = str(ev.get("Squadra", "")).strip()
            ev_oi = str(ev.get("Ora Inizio", "")).strip()
            ev_of = str(ev.get("Ora Fine",   "")).strip()
            if not c_e_conflitto(ora_inizio, ora_fine, ev_oi, ev_of):
                continue
            if _norm(ev_sq) == sq_norm:
                if result["doppio"] is None:
                    result["doppio"] = {"ora_inizio": ev_oi, "ora_fine": ev_of, "source": "partita"}
            elif cognomi_sq and df_allenatori is not None and not getattr(df_allenatori, "empty", True):
                for _, ar in df_allenatori.iterrows():
                    sq_list = [s.split("(")[0].strip() for s in str(ar.get("Squadre", "")).split(",")]
                    if ev_sq in sq_list:
                        cog = str(ar.get("Cognome", "")).strip()
                        if cog in cognomi_sq:
                            _add_all(cog, ev_sq, ev_oi, ev_of, "partita")

    return result


def trova_slot_liberi_data(
    data_str: str,
    palestra: str,
    durata_minuti: int,
    orario_fisso,
    orario_settimana_df,
    df_palestre=None,
    giorno_norm: str = None,
) -> list:
    """
    Trova gli slot liberi per una data e palestra specifica considerando
    orario_fisso (template) e orario_settimana (override per quella data).
    Returns: [{"ora_inizio": "HH:MM", "ora_fine": "HH:MM"}, ...]
    """
    if giorno_norm is None:
        try:
            from datetime import datetime as _dtt
            d = _dtt.strptime(data_str, "%Y-%m-%d").date()
            giorno_norm = GIORNI_SETTIMANA[d.weekday()]
        except Exception:
            return []

    pal_norm = _norm(palestra)
    occupati: list = []

    if orario_fisso is not None and not getattr(orario_fisso, "empty", True):
        for _, ev in orario_fisso.iterrows():
            if _norm(str(ev.get("giorno", ""))) != _norm(giorno_norm):
                continue
            if _norm(str(ev.get("palestra", ""))) != pal_norm:
                continue
            ev_sq = _norm(str(ev.get("squadra", "")))
            has_ov = False
            if orario_settimana_df is not None and not getattr(orario_settimana_df, "empty", True):
                for _, sr in orario_settimana_df.iterrows():
                    if str(sr.get("data", "")) == data_str and _norm(str(sr.get("squadra", ""))) == ev_sq:
                        has_ov = True
                        if not bool(sr.get("annullato", False)) and _norm(str(sr.get("palestra", ""))) == pal_norm:
                            try:
                                occupati.append((
                                    time_to_minutes(str_to_time(str(sr.get("ora_inizio", "")))),
                                    time_to_minutes(str_to_time(str(sr.get("ora_fine",   "")))),
                                ))
                            except Exception:
                                pass
                        break
            if not has_ov:
                try:
                    occupati.append((
                        time_to_minutes(str_to_time(str(ev.get("ora_inizio", "")))),
                        time_to_minutes(str_to_time(str(ev.get("ora_fine",   "")))),
                    ))
                except Exception:
                    pass

    if orario_settimana_df is not None and not getattr(orario_settimana_df, "empty", True):
        for _, sr in orario_settimana_df.iterrows():
            if str(sr.get("data", "")) != data_str:
                continue
            if bool(sr.get("annullato", False)):
                continue
            if _norm(str(sr.get("palestra", ""))) != pal_norm:
                continue
            sr_sq = _norm(str(sr.get("squadra", "")))
            is_fisso = False
            if orario_fisso is not None and not getattr(orario_fisso, "empty", True):
                for _, ev in orario_fisso.iterrows():
                    if _norm(str(ev.get("giorno", ""))) == _norm(giorno_norm) and _norm(str(ev.get("squadra", ""))) == sr_sq:
                        is_fisso = True
                        break
            if not is_fisso:
                try:
                    occupati.append((
                        time_to_minutes(str_to_time(str(sr.get("ora_inizio", "")))),
                        time_to_minutes(str_to_time(str(sr.get("ora_fine",   "")))),
                    ))
                except Exception:
                    pass

    occupati.sort()

    ora_start = 15 * 60
    ora_end   = 22 * 60
    if df_palestre is not None and not getattr(df_palestre, "empty", True):
        pr = df_palestre[df_palestre["Nome"].str.lower() == palestra.lower()]
        if not pr.empty:
            try:
                ora_start = time_to_minutes(str_to_time(str(pr.iloc[0]["Orario Inizio"])))
                ora_end   = time_to_minutes(str_to_time(str(pr.iloc[0]["Orario Fine"])))
            except Exception:
                pass

    liberi: list = []
    cursore = ora_start
    for oi, of in sorted(set(occupati)):
        if oi > cursore and oi - cursore >= durata_minuti:
            liberi.append({
                "ora_inizio": minutes_to_time_str(cursore),
                "ora_fine":   minutes_to_time_str(cursore + durata_minuti),
            })
        cursore = max(cursore, of)
    if cursore + durata_minuti <= ora_end:
        liberi.append({
            "ora_inizio": minutes_to_time_str(cursore),
            "ora_fine":   minutes_to_time_str(cursore + durata_minuti),
        })
    return liberi


def allenatori_liberi(squadra, giorno, ora_inizio, ora_fine, orario_fisso, df_allenatori):
    tutti = allenatori_squadra(squadra, df_allenatori)
    occupati = set()
    if not orario_fisso.empty:
        eventi = orario_fisso[orario_fisso["giorno"].str.lower().str.strip() == _norm(giorno)]
        for _, ev in eventi.iterrows():
            if c_e_conflitto(ora_inizio, ora_fine, ev["ora_inizio"], ev["ora_fine"]):
                for a in str(ev.get("allenatori", "")).split("-"):
                    occupati.add(a.strip())
    return [a for a in tutti if a not in occupati]


# =============================================
# SCHEDULING / RICERCA SLOT
# =============================================

def trova_slot_liberi(squadra, durata_minuti_tot, orario_fisso, df_squadre, df_allenatori, df_palestre):
    giorni = giorni_disponibili_squadra(squadra, df_squadre)
    slot_trovati = []
    if not df_palestre.empty:
        # Ordina: Principale → Secondaria → Esterna → altro
        _tipo_ord = {"Principale": 0, "Secondaria": 1, "Esterna": 2}
        _df_pal = df_palestre.copy()
        if "Tipo" in _df_pal.columns:
            _df_pal["_ord"] = _df_pal["Tipo"].map(lambda t: _tipo_ord.get(str(t), 3))
            _df_pal = _df_pal.sort_values("_ord")
        palestre_lista = _df_pal["Nome"].tolist()
    else:
        palestre_lista = ["palasport", "sanvi"]

    for giorno in giorni:
        for palestra in palestre_lista:
            eventi = pd.DataFrame()
            if not orario_fisso.empty:
                eventi = orario_fisso[
                    (orario_fisso["giorno"].str.lower().str.strip() == _norm(giorno)) &
                    (orario_fisso["palestra"].str.lower().str.strip() == _norm(palestra))
                ].sort_values("ora_inizio")

            blocchi = []
            for _, ev in eventi.iterrows():
                try:
                    blocchi.append((
                        time_to_minutes(str_to_time(ev["ora_inizio"])),
                        time_to_minutes(str_to_time(ev["ora_fine"]))
                    ))
                except:
                    continue

            ora_start = 15 * 60
            ora_end = 22 * 60
            if not df_palestre.empty:
                riga_p = df_palestre[df_palestre["Nome"].str.lower() == palestra.lower()]
                if not riga_p.empty:
                    try:
                        ora_start = time_to_minutes(str_to_time(str(riga_p.iloc[0]["Orario Inizio"])))
                        ora_end = time_to_minutes(str_to_time(str(riga_p.iloc[0]["Orario Fine"])))
                    except:
                        pass

            cursore = ora_start
            for blocco_inizio, blocco_fine in sorted(blocchi):
                if blocco_inizio > cursore:
                    spazio = blocco_inizio - cursore
                    if spazio >= durata_minuti_tot:
                        ora_i = minutes_to_time_str(cursore)
                        ora_f = minutes_to_time_str(cursore + durata_minuti_tot)
                        liberi = allenatori_liberi(squadra, giorno, ora_i, ora_f, orario_fisso, df_allenatori)
                        if liberi:
                            slot_trovati.append({
                                "giorno": giorno, "palestra": palestra,
                                "ora_inizio": ora_i, "ora_fine": ora_f,
                                "allenatori": ", ".join(liberi)
                            })
                cursore = max(cursore, blocco_fine)

            if cursore + durata_minuti_tot <= ora_end:
                ora_i = minutes_to_time_str(cursore)
                ora_f = minutes_to_time_str(cursore + durata_minuti_tot)
                liberi = allenatori_liberi(squadra, giorno, ora_i, ora_f, orario_fisso, df_allenatori)
                if liberi:
                    slot_trovati.append({
                        "giorno": giorno, "palestra": palestra,
                        "ora_inizio": ora_i, "ora_fine": ora_f,
                        "allenatori": ", ".join(liberi)
                    })
    return slot_trovati

def trova_date_alternative(data_originale, squadra, palestra, ora_inizio_slot, ora_fine_slot,
                            orario_fisso, calendario, df_squadre, giorni_range=5):
    date_libere = []
    giorni_ok = giorni_disponibili_squadra(squadra, df_squadre)
    try:
        data_dt = datetime.strptime(str(data_originale), "%Y-%m-%d")
    except ValueError:
        try:
            data_dt = datetime.strptime(str(data_originale), "%d/%m/%Y")
        except ValueError:
            return []

    for delta in range(1, giorni_range + 1):
        for segno in [-1, 1]:
            data_prova = data_dt + timedelta(days=delta * segno)
            giorno_prova = GIORNI_SETTIMANA[data_prova.weekday()]
            if giorno_prova not in giorni_ok:
                continue
            ha_conflitto = False
            if not orario_fisso.empty:
                for _, ev in orario_fisso[
                    (orario_fisso["giorno"].str.lower().str.strip() == _norm(giorno_prova)) &
                    (orario_fisso["palestra"].str.lower().str.strip() == _norm(palestra))
                ].iterrows():
                    if c_e_conflitto(ora_inizio_slot, ora_fine_slot, ev["ora_inizio"], ev["ora_fine"]):
                        ha_conflitto = True
                        break
            if not ha_conflitto and not calendario.empty:
                for _, ev in calendario[
                    (calendario["Data"] == data_prova.strftime("%Y-%m-%d")) &
                    (calendario["Casa/Fuori"].str.lower() == "casa")
                ].iterrows():
                    if c_e_conflitto(ora_inizio_slot, ora_fine_slot,
                                     str(ev["Ora Inizio"]), str(ev["Ora Fine"])):
                        ha_conflitto = True
                        break
            if not ha_conflitto:
                date_libere.append({
                    "data": data_prova.strftime("%d/%m/%Y"),
                    "data_raw": data_prova.strftime("%Y-%m-%d"),
                    "giorno": giorno_prova.capitalize(),
                    "palestra": palestra
                })

    date_libere.sort(key=lambda x: abs(
        (datetime.strptime(x["data_raw"], "%Y-%m-%d") - data_dt).days
    ))
    return date_libere[:5]

def slot_liberi_per_giornata(data_dt, palestra: str, orario_fisso, doa_list: list) -> list:
    """
    Restituisce le finestre orarie libere per una data e palestra specifiche.
    Se doa_list è configurata, usa solo le finestre DOA come orario disponibile.
    Se palestra è vuota, usa solo le finestre DOA senza controllare orario_fisso.
    Returns: list of {"data": "YYYY-MM-DD", "data_fmt": "DD/MM/YYYY",
                       "giorno": "sabato", "ora_inizio": "16:00", "ora_fine": "18:30"}
    """
    giorno = GIORNI_SETTIMANA[data_dt.weekday()]

    # Finestre di disponibilità: DOA se configurate, altrimenti 08:00-22:00
    if doa_list:
        finestre = [
            d for d in doa_list if _norm(d.get("giorno", "")) == _norm(giorno)
        ]
        if not finestre:
            return []
    else:
        finestre = [{"ora_inizio": "08:00", "ora_fine": "22:00"}]

    # Slot occupati dall'orario fisso per quella palestra e quel giorno
    occupati = []
    if palestra and orario_fisso is not None and not orario_fisso.empty:
        mask = (
            (orario_fisso["giorno"].str.lower().str.strip() == _norm(giorno)) &
            (orario_fisso["palestra"].str.lower().str.strip() == _norm(palestra))
        )
        for _, ev in orario_fisso[mask].iterrows():
            try:
                oi = time_to_minutes(str_to_time(str(ev["ora_inizio"])))
                of = time_to_minutes(str_to_time(str(ev["ora_fine"])))
                occupati.append((oi, of))
            except Exception:
                pass
    occupati.sort()

    data_iso = data_dt.strftime("%Y-%m-%d")
    data_fmt = data_dt.strftime("%d/%m/%Y")
    liberi = []

    for finestra in finestre:
        try:
            f_start = time_to_minutes(str_to_time(str(finestra["ora_inizio"])[:5]))
            f_end   = time_to_minutes(str_to_time(str(finestra["ora_fine"])[:5]))
        except Exception:
            continue

        cursore = f_start
        for oi, of in occupati:
            if oi >= f_end:
                break
            if oi > cursore:
                liberi.append({
                    "data": data_iso, "data_fmt": data_fmt, "giorno": giorno,
                    "ora_inizio": minutes_to_time_str(cursore),
                    "ora_fine":   minutes_to_time_str(oi),
                })
            cursore = max(cursore, of)
        if cursore < f_end:
            liberi.append({
                "data": data_iso, "data_fmt": data_fmt, "giorno": giorno,
                "ora_inizio": minutes_to_time_str(cursore),
                "ora_fine":   minutes_to_time_str(f_end),
            })

    return liberi


def trova_squadre_senza_allenamento(squadra_fuori, giorno, ora_inizio, ora_fine, orario_fisso, df_squadre):
    if orario_fisso.empty or df_squadre.empty:
        return []
    palestra_squadra = orario_fisso[orario_fisso["squadra"].str.lower().str.strip() == _norm(squadra_fuori)]
    palestre_liberate = palestra_squadra[
        palestra_squadra["giorno"].str.lower().str.strip() == _norm(giorno)
    ]["palestra"].unique().tolist()
    suggerimenti = []
    for sq in df_squadre["Categoria"].tolist():
        if sq != squadra_fuori:
            giorni_sq = giorni_disponibili_squadra(sq, df_squadre)
            if giorno.lower() in giorni_sq:
                for palestra in palestre_liberate:
                    suggerimenti.append({
                        "squadra": sq, "palestra": palestra,
                        "ora_inizio": ora_inizio, "ora_fine": ora_fine
                    })
    return suggerimenti


# =============================================
# UTILITÀ DATE
# =============================================

def is_settimana_prossima(data_str):
    try:
        try:
            data = datetime.strptime(str(data_str), "%Y-%m-%d").date()
        except:
            data = datetime.strptime(str(data_str), "%d/%m/%Y").date()
        oggi = datetime.today().date()
        inizio_prossima = oggi + timedelta(days=(7 - oggi.weekday()))
        fine_prossima = inizio_prossima + timedelta(days=6)
        return inizio_prossima <= data <= fine_prossima
    except:
        return False

def parse_data(data_str):
    for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"]:
        try:
            return datetime.strptime(str(data_str).strip(), fmt).date()
        except:
            continue
    return None


# =============================================
# MODULO 3 — LETTURA PDF FIP
# =============================================

# ── Formato B — helpers ───────────────────────────────────────────────────────

def _cerca_orario_squadra_b(tabella_linee: list, nome_lower: str) -> dict | None:
    """
    Cerca l'orario preferito di una squadra nelle righe della tabella formato B.
    Trova l'ancora temporale (DAY HH:MM) più vicina alla posizione del nome nel testo.
    """
    _re_ancora = re.compile(r'(LUN|MAR|MER|GIO|VEN|SAB|DOM)\s+(\d{2}:\d{2})', re.IGNORECASE)
    _giorni = {
        "LUN": "lunedi", "MAR": "martedi", "MER": "mercoledi",
        "GIO": "giovedi", "VEN": "venerdi", "SAB": "sabato", "DOM": "domenica",
    }
    # Parole significative: lunghezza ≥ 4, senza punti (esclude abbreviazioni tipo U.S., POL.)
    parole = [p for p in nome_lower.split() if len(p) >= 4 and "." not in p]
    if not parole:
        parole = [p for p in nome_lower.split() if len(p) >= 3]

    for linea in tabella_linee:
        linea_lower = linea.lower()
        pos = -1
        for parola in parole:
            idx = linea_lower.find(parola)
            if idx >= 0:
                pos = idx
                break
        if pos < 0:
            continue
        anchors = list(_re_ancora.finditer(linea))
        if not anchors:
            continue
        best = min(anchors, key=lambda a: abs(a.start() - pos))
        return {"giorno": _giorni.get(best.group(1).upper(), best.group(1).lower()), "ora": best.group(2)}
    return None


def _estrai_doa_formato_b(testo: str) -> list:
    """
    Estrae le DOA dal testo del PDF formato B.
    Cerca pattern tipo "sabato con inizio dalle 16:00 alle 21:00".
    Returns: list of {giorno, ora_inizio, ora_fine}
    """
    _giorni_it = {
        "lunedi": "lunedi", "lunedì": "lunedi",
        "martedi": "martedi", "martedì": "martedi",
        "mercoledi": "mercoledi", "mercoledì": "mercoledi",
        "giovedi": "giovedi", "giovedì": "giovedi",
        "venerdi": "venerdi", "venerdì": "venerdi",
        "sabato": "sabato",
        "domenica": "domenica",
    }
    pattern = re.compile(
        r'(lunedì?|martedì?|mercoledì?|giovedì?|venerdì?|sabato|domenica)'
        r'.{0,80}?dalle\s+(?:ore\s+)?(\d{1,2}[:.]\d{2})'
        r'.{0,30}?alle\s+(?:ore\s+)?(\d{1,2}[:.]\d{2})',
        re.IGNORECASE,
    )
    risultati = []
    for m in pattern.finditer(testo.replace("\n", " ")):
        giorno = _giorni_it.get(m.group(1).lower(), m.group(1).lower())
        ora_i = m.group(2).replace(".", ":")
        ora_f = m.group(3).replace(".", ":")
        if not any(r["giorno"] == giorno for r in risultati):
            risultati.append({"giorno": giorno, "ora_inizio": ora_i, "ora_fine": ora_f})
    return risultati


def _estrai_partite_formato_b(testo: str, nome_societa: str = "oderzo") -> tuple:
    """
    Parser formato B FIP: tabella orari preferiti in cima + giornate raggruppate per data.
    Returns (partite, errore)
    """
    nome_lower = nome_societa.lower().strip()
    linee = [l.strip() for l in testo.split("\n")]

    _re_ancora = re.compile(r'(LUN|MAR|MER|GIO|VEN|SAB|DOM)\s+(\d{2}:\d{2})', re.IGNORECASE)

    # 1. Raccogli le righe della tabella (quelle con ≥2 ancore temporali)
    tabella_linee = [l for l in linee if len(list(_re_ancora.finditer(l))) >= 2]

    # 2. Parse giornate e partite
    re_data_giornata = re.compile(r'(\d{2}/\d{2}/\d{4})\s+(\d+)\s*[ªa°\u00AA\u00B0]?')
    re_partita = re.compile(r'^(.+?)\s+-\s+(.+)$')

    data_corrente = None
    giornata_corrente = None
    partite = []

    for linea in linee:
        m_dg = re_data_giornata.search(linea)
        if m_dg:
            # Conferma che la riga sia quasi solo data+giornata (poco testo extra)
            extra = re.sub(r'\s+', '', linea[:m_dg.start()] + linea[m_dg.end():])
            if len(extra) <= 3:
                data_corrente = m_dg.group(1)
                giornata_corrente = m_dg.group(2)
                continue

        if data_corrente is None:
            continue

        # Salta intestazioni di sezione (es. "ANDATA", "RITORNO")
        if re.fullmatch(r'[A-ZÀÈÌÒÙ\s/]+', linea) and len(linea) <= 15:
            continue

        m_p = re_partita.match(linea)
        if not m_p:
            continue

        sq_casa = m_p.group(1).strip()
        sq_fuori = m_p.group(2).strip()

        if nome_lower not in sq_casa.lower() and nome_lower not in sq_fuori.lower():
            continue

        if nome_lower in sq_casa.lower():
            casa_fuori = "Casa"
            avversario = sq_fuori
            orario = _cerca_orario_squadra_b(tabella_linee, nome_lower)
        else:
            casa_fuori = "Fuori"
            avversario = sq_casa
            orario = _cerca_orario_squadra_b(tabella_linee, sq_casa.lower())

        try:
            data_obj = datetime.strptime(data_corrente, "%d/%m/%Y")
            # Le date nel grid FIP sono domeniche di riferimento.
            # Se la squadra di casa preferisce il sabato, la gara è il giorno prima.
            if orario:
                _dow_pref = {"sabato": 5, "domenica": 6}.get(orario.get("giorno", ""), -1)
                _dow_grid = data_obj.weekday()
                if _dow_pref >= 0 and _dow_pref != _dow_grid:
                    delta = _dow_pref - _dow_grid
                    if abs(delta) <= 2:
                        data_obj = data_obj + timedelta(days=delta)
            data_iso = data_obj.strftime("%Y-%m-%d")
            data_display_calc = data_obj.strftime("%d/%m/%Y")
            giorno = GIORNI_SETTIMANA[data_obj.weekday()]
        except Exception:
            data_iso = data_corrente
            data_display_calc = data_corrente
            giorno = orario.get("giorno", "") if orario else ""

        partite.append({
            "nr_gara":      f"G{giornata_corrente}",
            "data":         data_iso,
            "data_display": data_display_calc,
            "giorno":       giorno,
            "ora":          orario["ora"] if orario else "00:00",
            "casa_fuori":   casa_fuori,
            "avversario":   avversario,
            "luogo":        "",
            "stato":        "Provvisorio",
            "giornata":     giornata_corrente,
        })

    if not partite:
        return [], f"Nessuna partita trovata per '{nome_societa}' nel PDF (formato B)."
    return partite, None


# ── Parser principale con rilevamento automatico formato ─────────────────────

def estrai_partite_da_pdf(pdf_bytes, nome_societa="oderzo"):
    """
    Estrae le partite da un PDF FIP.
    Rileva automaticamente il formato:
      - Formato A: numeri gara a 4-5 cifre (es. 17169)
      - Formato B: sezione ANDATA + giornate raggruppate per data

    Returns (partite, errore, doa_estratte)
      doa_estratte è non-vuoto solo nel formato B.
    """
    testo_completo = ""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for pagina in pdf.pages:
                testo = pagina.extract_text()
                if testo:
                    testo_completo += testo + "\n"
    except Exception as e:
        return [], f"Errore lettura PDF: {e}", []

    if not testo_completo:
        return [], "PDF vuoto o non leggibile.", []

    # ── Rilevamento formato ──────────────────────────────────────────────────
    _ha_nr_gara  = bool(re.search(r'^\d{4,5}\s+.+\d{2}/\d{2}/\d{4}', testo_completo, re.MULTILINE))
    _ha_andata   = bool(re.search(r'\bANDATA\b', testo_completo, re.IGNORECASE))
    _ha_giornate = bool(re.search(r'\d{2}/\d{2}/\d{4}\s+\d+\s*[ªa°\u00AA\u00B0]', testo_completo))

    if not _ha_nr_gara and (_ha_andata or _ha_giornate):
        partite, errore = _estrai_partite_formato_b(testo_completo, nome_societa)
        doa_estratte = _estrai_doa_formato_b(testo_completo)
        return partite, errore, doa_estratte

    # ── Formato A (parser originale) ─────────────────────────────────────────
    mappa_giorni = {
        "Dom": "domenica", "Sab": "sabato", "Lun": "lunedi",
        "Mar": "martedi", "Mer": "mercoledi", "Gio": "giovedi", "Ven": "venerdi"
    }

    linee = testo_completo.split("\n")
    nome_lower = nome_societa.lower()
    partite = []
    i = 0

    parole_luogo = ["via", "piazzale", "palestra", "palasport", "pal.", "vicolo",
                    "scuola", "c.s.", "arcostruttura", "palazzetto"]

    while i < len(linee):
        linea = linee[i].strip()

        match = re.match(
            r'^(\d{4,5})\s+(.+?)\s+(Dom|Sab|Lun|Mar|Mer|Gio|Ven)\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})',
            linea
        )

        if match:
            nr_gara = match.group(1)
            testo_squadre = match.group(2)
            giorno_abbr = match.group(3)
            data_str = match.group(4)
            ora_str = match.group(5)
            giorno = mappa_giorni.get(giorno_abbr, giorno_abbr.lower())

            riga_1 = linee[i+1].strip() if i+1 < len(linee) else ""
            riga_2 = linee[i+2].strip() if i+2 < len(linee) else ""

            riga_1_e_luogo = any(p in riga_1.lower() for p in parole_luogo)
            luogo = riga_1 if riga_1_e_luogo else riga_2

            testo_partita = testo_squadre + " " + riga_1
            if nome_lower not in testo_partita.lower():
                i += 1
                continue

            # Determina casa/fuori dalla posizione nel testo squadre rispetto al trattino:
            # ODERZO a sinistra del " - " = CASA, a destra = FUORI
            _ts_lower = testo_squadre.lower()
            _dash_pos = _ts_lower.find(' - ')
            _nome_pos = _ts_lower.find(nome_lower)
            if _dash_pos >= 0 and _nome_pos >= 0:
                casa_fuori = "Casa" if _nome_pos < _dash_pos else "Fuori"
            else:
                casa_fuori = "Casa" if nome_lower in luogo.lower() else "Fuori"

            testo_upper = testo_squadre.upper()
            pos_calorflex = testo_upper.find("CALORFLEX ODERZO")
            if pos_calorflex >= 0:
                if pos_calorflex == 0:
                    avversario = testo_squadre[len("CALORFLEX ODERZO"):].strip()
                    if not avversario and riga_1 and not riga_1_e_luogo:
                        avversario = riga_1
                else:
                    avversario = testo_squadre[:pos_calorflex].strip()
            else:
                pos_oderzo = testo_upper.find("ODERZO")
                if pos_oderzo >= 0:
                    if pos_oderzo == 0:
                        avversario = testo_squadre[pos_oderzo + 6:].strip()
                    else:
                        avversario = testo_squadre[:pos_oderzo].strip()
                else:
                    avversario = "Da verificare"

            if not avversario:
                avversario = "Da verificare"

            try:
                data_obj = datetime.strptime(data_str, "%d/%m/%Y")
                data_iso = data_obj.strftime("%Y-%m-%d")
            except:
                data_iso = data_str

            partite.append({
                "nr_gara": nr_gara,
                "data": data_iso,
                "data_display": data_str,
                "giorno": giorno,
                "ora": ora_str,
                "casa_fuori": casa_fuori,
                "avversario": avversario,
                "luogo": luogo,
                "stato": "Provvisorio"
            })

        i += 1

    if not partite:
        return [], f"Nessuna partita trovata per '{nome_societa}' nel PDF.", []

    return partite, None, []


# =============================================
# MODULO 4 — EMAIL AUTOMATICHE
# =============================================

def manda_email(destinatari, oggetto, corpo):
    if not EMAIL_MITTENTE or not EMAIL_PASSWORD:
        return False, "Credenziali email non configurate in st.secrets"
    if not destinatari:
        return False, "Nessun destinatario"
    try:
        msg = MIMEMultipart()
        msg["From"] = EMAIL_MITTENTE
        msg["To"] = ", ".join(destinatari)
        msg["Subject"] = oggetto
        msg.attach(MIMEText(corpo, "plain", "utf-8"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_MITTENTE, EMAIL_PASSWORD)
            server.sendmail(EMAIL_MITTENTE, destinatari, msg.as_string())
        return True, None
    except Exception as e:
        return False, str(e)

def trova_email_allenatori(squadra, df_allenatori):
    email_list = []
    if df_allenatori.empty:
        return email_list
    for _, row in df_allenatori.iterrows():
        squadre = [s.split("(")[0].strip()
                   for s in str(row.get("Squadre", "")).split(",")]
        if squadra in squadre:
            email = str(row.get("Email", "")).strip()
            if email and "@" in email:
                email_list.append(email)
    return email_list

def notifica_nuova_partita(squadra, data, giorno, ora, luogo, casa_fuori, df_allenatori):
    email_list = trova_email_allenatori(squadra, df_allenatori)
    if not email_list:
        return False, "Nessun allenatore con email trovato"
    tipo = "IN CASA" if casa_fuori == "Casa" else "IN TRASFERTA"
    oggetto = f"Basketball Oderzo - Nuova partita {squadra} {data}"
    corpo = f"""Ciao,\n\ne stata inserita una nuova partita:\n\nSquadra: {squadra}\nData: {data} ({giorno})\nOra: {ora}\nTipo: {tipo}\nLuogo: {luogo}\n\nControlla l app per i dettagli.\n\nOderzo Basket"""
    return manda_email(email_list, oggetto, corpo)

def notifica_allenamento_spostato(squadra, giorno_nuovo, ora_nuova, palestra_nuova, df_allenatori):
    email_list = trova_email_allenatori(squadra, df_allenatori)
    if not email_list:
        return False, "Nessun allenatore con email trovato"
    oggetto = f"Basketball Oderzo - Allenamento spostato {squadra}"
    corpo = f"""Ciao,\n\nun allenamento e stato spostato:\n\nSquadra: {squadra}\nNuovo giorno: {giorno_nuovo}\nNuovo orario: {ora_nuova}\nPalestra: {palestra_nuova}\n\nOderzo Basket"""
    return manda_email(email_list, oggetto, corpo)

# =============================================
# MODULO 5 — DOA E CALENDARIO FIP
# =============================================

def partita_in_doa(giorno: str, ora_partita: str, doa_list: list) -> bool:
    """
    Verifica se l'orario di una partita rientra nelle DOA.
    doa_list: lista di dict {giorno, ora_inizio, ora_fine}
    Returns True se dentro DOA, True anche se doa_list è vuota (nessuna restrizione).
    """
    if not doa_list:
        return True
    giorno_l = _norm(giorno)
    rilevanti = [d for d in doa_list if _norm(d.get("giorno", "")) == giorno_l]
    if not rilevanti:
        return False  # giorno non nelle DOA
    try:
        t_partita = str_to_time(ora_partita)
        for doa in rilevanti:
            t_min = str_to_time(str(doa.get("ora_inizio", "00:00"))[:5])
            t_max = str_to_time(str(doa.get("ora_fine",   "23:59"))[:5])
            if t_min <= t_partita <= t_max:
                return True
    except Exception:
        pass
    return False


def motivo_fuori_doa(giorno: str, ora_partita: str, doa_list: list) -> str:
    """Descrive perché una partita è fuori DOA."""
    if not doa_list:
        return ""
    giorno_l = _norm(giorno)
    rilevanti = [d for d in doa_list if _norm(d.get("giorno", "")) == giorno_l]
    if not rilevanti:
        giorni_ok = sorted({d.get("giorno", "").capitalize() for d in doa_list})
        return f"Giorno non nelle DOA (disponibili: {', '.join(giorni_ok)})"
    fasce = [f"{d.get('ora_inizio','?')}–{d.get('ora_fine','?')}" for d in rilevanti]
    return f"Orario {ora_partita} fuori DOA (finestra: {', '.join(fasce)})"


def trova_date_alternative_doa(
    data_originale, squadra, palestra, ora_inizio_slot, ora_fine_slot,
    orario_fisso, calendario, df_squadre, doa_list, giorni_range=21,
):
    """
    Come trova_date_alternative ma filtra i risultati dentro le DOA.
    Se doa_list è vuota, si comporta come trova_date_alternative.
    """
    tutte = trova_date_alternative(
        data_originale, squadra, palestra, ora_inizio_slot, ora_fine_slot,
        orario_fisso, calendario, df_squadre, giorni_range,
    )
    if not doa_list:
        return tutte
    risultati = []
    for d in tutte:
        giorno = _norm(d.get("giorno", ""))
        rilevanti = [doa for doa in doa_list if _norm(doa.get("giorno", "")) == giorno]
        if rilevanti:
            risultati.append(d)
    return risultati


def confronta_calendari(nuove_partite: list, cal_df, squadra: str) -> dict:
    """
    Confronta le partite del calendario definitivo (nuove_partite) con quelle
    provvisorie esistenti nel DataFrame cal_df filtrato per squadra.

    Returns dict con chiavi:
        'confermate': list of (p_nuova, row_id)
        'modificate': list of (p_nuova, row_id, descrizione_diff)
        'nuove':      list of p_nuova
        'rimosse':    list of row_id
    """
    result = {"confermate": [], "modificate": [], "nuove": [], "rimosse": []}

    if cal_df is None or cal_df.empty:
        result["nuove"] = list(nuove_partite)
        return result

    mask = cal_df["Squadra"].str.strip() == squadra
    if "tipo_import" in cal_df.columns:
        mask = mask & (cal_df["tipo_import"] == "provvisorio")
    esistenti = cal_df[mask].copy()

    if esistenti.empty:
        result["nuove"] = list(nuove_partite)
        return result

    matched = set()

    for p_nuova in nuove_partite:
        data_n  = p_nuova.get("data", "")
        avv_n   = _norm(p_nuova.get("avversario", ""))
        best_id = None
        best_sc = 0

        for row_id, row in esistenti.iterrows():
            if row_id in matched:
                continue
            data_e = str(row.get("Data", ""))
            avv_e  = _norm(str(row.get("Avversario", "")))
            score  = 0

            # Stessa data
            if data_n == data_e:
                score += 3
            else:
                try:
                    diff = abs((
                        datetime.strptime(data_n, "%Y-%m-%d") -
                        datetime.strptime(data_e, "%Y-%m-%d")
                    ).days)
                    if diff <= 7:
                        score += 1
                except Exception:
                    pass

            # Stesso avversario (match parziale)
            if avv_n and avv_e and (avv_n in avv_e or avv_e in avv_n):
                score += 2

            if score > best_sc:
                best_sc = score
                best_id = row_id

        if best_id is not None and best_sc >= 2:
            matched.add(best_id)
            row = esistenti.loc[best_id]
            diffs = []

            data_e = str(row.get("Data", ""))
            ora_e  = str(row.get("Ora Inizio", ""))

            if data_n != data_e:
                try:
                    dn = datetime.strptime(data_n, "%Y-%m-%d").strftime("%d/%m")
                    de = datetime.strptime(data_e, "%Y-%m-%d").strftime("%d/%m")
                    diffs.append(f"data: {de} → {dn}")
                except Exception:
                    diffs.append("data cambiata")

            if p_nuova.get("ora", "") != ora_e[:5]:
                diffs.append(f"ora: {ora_e[:5]} → {p_nuova.get('ora','')}")

            if diffs:
                result["modificate"].append((p_nuova, best_id, ", ".join(diffs)))
            else:
                result["confermate"].append((p_nuova, best_id))
        else:
            result["nuove"].append(p_nuova)

    for row_id in esistenti.index:
        if row_id not in matched:
            result["rimosse"].append(row_id)

    return result


def notifica_conflitto(squadra, data, df_allenatori):
    email_list = trova_email_allenatori(squadra, df_allenatori)
    if not email_list:
        return False, "Nessun allenatore con email trovato"
    oggetto = f"Basketball Oderzo - Conflitto da risolvere {squadra} {data}"
    corpo = f"""Ciao,\n\nc e un conflitto nel calendario:\n\nSquadra: {squadra}\nData: {data}\n\nAccedi all app e vai su Calendario Definitivo per risolvere.\n\nOderzo Basket"""
    return manda_email(email_list, oggetto, corpo)
