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
    palestre_lista = df_palestre["Nome"].tolist() if not df_palestre.empty else ["palasport", "sanvi"]

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

def estrai_partite_da_pdf(pdf_bytes, nome_societa="oderzo"):
    testo_completo = ""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for pagina in pdf.pages:
                testo = pagina.extract_text()
                if testo:
                    testo_completo += testo + "\n"
    except Exception as e:
        return [], f"Errore lettura PDF: {e}"

    if not testo_completo:
        return [], "PDF vuoto o non leggibile."

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
        return [], f"Nessuna partita trovata per '{nome_societa}' nel PDF."

    return partite, None


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

def notifica_conflitto(squadra, data, df_allenatori):
    email_list = trova_email_allenatori(squadra, df_allenatori)
    if not email_list:
        return False, "Nessun allenatore con email trovato"
    oggetto = f"Basketball Oderzo - Conflitto da risolvere {squadra} {data}"
    corpo = f"""Ciao,\n\nc e un conflitto nel calendario:\n\nSquadra: {squadra}\nData: {data}\n\nAccedi all app e vai su Calendario Definitivo per risolvere.\n\nOderzo Basket"""
    return manda_email(email_list, oggetto, corpo)
