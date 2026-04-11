import gspread
from google.oauth2.service_account import Credentials
import pandas as pd
from datetime import datetime, timedelta

# =============================================
# CONFIGURAZIONE
# =============================================

ALLENATORI_PER_SQUADRA = {
    "U13 Elite":    ["Lele", "Vanin"],
    "U13 Reg":      ["Vanin", "Bellato"],
    "U14 Elite":    ["Checco", "Pedron"],
    "U15 Gold":     ["Red", "Lele"],
    "U17 Ecc":      ["Mauro", "Cris"],
    "U19 Ecc":      ["Paolo", "Red", "Vanin"],
    "Amazzoni U19": ["Checco"],
    "Serie B":      ["Paolo", "Red", "Puk", "Vanin", "Bellato"],
}

GIORNI_UNDER_GIOVANI = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"]
GIORNI_TUTTI = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]
DURATA_MINIMA_GIOVANI = 60  # minuti

SQUADRE_SENIOR = ["U17 Ecc", "U19 Ecc", "Amazzoni U19", "Serie B"]
SQUADRE_PRIORITA_ASSOLUTA = ["Serie B"]


# =============================================
# FUNZIONI DI SUPPORTO
# =============================================

def str_to_time(orario):
    return datetime.strptime(str(orario).strip(), "%H:%M").time()

def time_to_minutes(t):
    return t.hour * 60 + t.minute

def minutes_to_time_str(m):
    h = m // 60
    mi = m % 60
    return f"{h:02d}:{mi:02d}"

def durata_minuti(ora_inizio, ora_fine):
    return time_to_minutes(str_to_time(ora_fine)) - time_to_minutes(str_to_time(ora_inizio))

def c_e_conflitto(inizio_a, fine_a, inizio_b, fine_b):
    return str_to_time(inizio_a) < str_to_time(fine_b) and str_to_time(fine_a) > str_to_time(inizio_b)

def giorni_disponibili(squadra):
    if squadra in SQUADRE_SENIOR:
        return GIORNI_TUTTI
    return GIORNI_UNDER_GIOVANI

def durata_minima(squadra):
    if squadra in SQUADRE_SENIOR:
        return None  # durata originale, non si riduce
    return DURATA_MINIMA_GIOVANI

def allenatori_liberi(squadra, giorno, ora_inizio, ora_fine, orario_fisso):
    allenatori_squadra = ALLENATORI_PER_SQUADRA.get(squadra, [])
    allenatori_occupati = set()

    eventi_giorno = orario_fisso[orario_fisso["giorno"] == giorno]
    for _, evento in eventi_giorno.iterrows():
        if c_e_conflitto(ora_inizio, ora_fine, evento["ora_inizio"], evento["ora_fine"]):
            for allenatore in str(evento["allenatori"]).split("-"):
                allenatori_occupati.add(allenatore.strip())

    liberi = [a for a in allenatori_squadra if a not in allenatori_occupati]
    return liberi


# =============================================
# TROVA SLOT LIBERI
# =============================================

def trova_slot_liberi(squadra, durata_necessaria, orario_fisso, palestre_preferite=None):
    giorni = giorni_disponibili(squadra)
    durata_min = durata_minima(squadra) or durata_necessaria
    palestre = palestre_preferite or ["palasport", "sanvi"]
    slot_trovati = []

    for giorno in giorni:
        for palestra in palestre:
            eventi = orario_fisso[
                (orario_fisso["giorno"] == giorno) &
                (orario_fisso["palestra"] == palestra)
            ].sort_values("ora_inizio")

            # Orario disponibile palestra: 15:00 - 22:00
            inizio_giornata = 15 * 60
            fine_giornata = 22 * 60

            # Costruisci lista blocchi occupati
            blocchi = []
            for _, ev in eventi.iterrows():
                blocchi.append((
                    time_to_minutes(str_to_time(ev["ora_inizio"])),
                    time_to_minutes(str_to_time(ev["ora_fine"]))
                ))

            # Trova buchi tra i blocchi
            cursore = inizio_giornata
            for blocco_inizio, blocco_fine in sorted(blocchi):
                if blocco_inizio > cursore:
                    spazio = blocco_inizio - cursore
                    if spazio >= durata_min:
                        ora_i = minutes_to_time_str(cursore)
                        ora_f = minutes_to_time_str(cursore + min(durata_necessaria, spazio))
                        liberi = allenatori_liberi(squadra, giorno, ora_i, ora_f, orario_fisso)
                        if liberi:
                            slot_trovati.append({
                                "giorno": giorno,
                                "palestra": palestra,
                                "ora_inizio": ora_i,
                                "ora_fine": ora_f,
                                "allenatori_disponibili": ", ".join(liberi),
                                "durata": min(durata_necessaria, spazio)
                            })
                cursore = max(cursore, blocco_fine)

            # Controlla spazio dopo l'ultimo blocco
            if cursore < fine_giornata:
                spazio = fine_giornata - cursore
                if spazio >= durata_min:
                    ora_i = minutes_to_time_str(cursore)
                    ora_f = minutes_to_time_str(cursore + min(durata_necessaria, spazio))
                    liberi = allenatori_liberi(squadra, giorno, ora_i, ora_f, orario_fisso)
                    if liberi:
                        slot_trovati.append({
                            "giorno": giorno,
                            "palestra": palestra,
                            "ora_inizio": ora_i,
                            "ora_fine": ora_f,
                            "allenatori_disponibili": ", ".join(liberi),
                            "durata": min(durata_necessaria, spazio)
                        })

    return slot_trovati


# =============================================
# MAIN
# =============================================

# 1. Connessione Google Sheets
scopes = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds = Credentials.from_service_account_file("credenziali.json", scopes=scopes)
client = gspread.authorize(creds)
foglio = client.open("Oderzo Basket - Gestione Spazi")

# 2. Leggi dati
orario_fisso = pd.DataFrame(foglio.worksheet("Orario Fisso").get_all_records())
partite = pd.DataFrame(foglio.worksheet("Partite").get_all_records())

# 3. Analisi conflitti e suggerimenti
risultati = []

for _, partita in partite.iterrows():
    giorno = str(partita["Giorno"]).lower().strip()
    palestra = str(partita["Palestra"]).lower().strip()
    squadra = str(partita["Squadra"]).strip()
    ora_inizio = str(partita["Ora Inizio"]).strip()
    ora_fine = str(partita["Ora Fine"]).strip()

    # Priorità assoluta — non analizzare
    if squadra in SQUADRE_PRIORITA_ASSOLUTA:
        risultati.append([
            f"{squadra} - {giorno} {ora_inizio}-{ora_fine} @ {palestra}",
            "—",
            "⚡ PRIORITÀ ASSOLUTA — non spostabile"
        ])
        continue

    # Trova conflitti
    stessa_palestra = orario_fisso[
        (orario_fisso["giorno"] == giorno) &
        (orario_fisso["palestra"] == palestra)
    ]

    conflitti = []
    for _, evento in stessa_palestra.iterrows():
        if c_e_conflitto(ora_inizio, ora_fine, evento["ora_inizio"], evento["ora_fine"]):
            # Serie B non si sposta mai
            if any(sq in str(evento["squadra"]) for sq in SQUADRE_PRIORITA_ASSOLUTA):
                conflitti.append(f"⚡ {evento['squadra']} ({evento['ora_inizio']}-{evento['ora_fine']}) — NON SPOSTABILE")
            else:
                conflitti.append(f"{evento['squadra']} ({evento['ora_inizio']}-{evento['ora_fine']})")

    if not conflitti:
        risultati.append([
            f"{squadra} - {giorno} {ora_inizio}-{ora_fine} @ {palestra}",
            "Nessuno",
            "✅ Slot libero — nessun conflitto!"
        ])
        continue

    # Per ogni conflitto trova slot alternativi
    suggerimenti = []
    for conflitto in conflitti:
        if "NON SPOSTABILE" in conflitto:
            suggerimenti.append(f"❌ {conflitto}")
            continue

        nome_squadra_conflitto = conflitto.split("(")[0].strip()
        durata = durata_minuti(ora_inizio, ora_fine)
        slot = trova_slot_liberi(nome_squadra_conflitto, durata, orario_fisso, [palestra, "sanvi", "palasport"])

        if slot:
            opzioni = [f"{s['giorno']} {s['ora_inizio']}-{s['ora_fine']} @ {s['palestra']} (allenatori: {s['allenatori_disponibili']})" for s in slot[:3]]
            suggerimenti.append(f"Sposta {nome_squadra_conflitto} in uno di questi slot: " + " | ".join(opzioni))
        else:
            suggerimenti.append(f"⚠️ Nessuno slot trovato per {nome_squadra_conflitto} — verifica manualmente")

    risultati.append([
        f"{squadra} - {giorno} {ora_inizio}-{ora_fine} @ {palestra}",
        " | ".join(conflitti),
        " \n".join(suggerimenti)
    ])

# 4. Scrivi risultati su Google Sheets
foglio_risultati = foglio.worksheet("Risultati")
foglio_risultati.clear()
foglio_risultati.append_row(["Partita", "Conflitti trovati", "Suggerimento"])
for riga in risultati:
    foglio_risultati.append_row(riga)

print("✅ Analisi completata. Controlla il foglio Risultati su Google Sheets.")
