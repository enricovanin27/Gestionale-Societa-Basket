import gspread
from google.oauth2.service_account import Credentials
import pandas as pd

from datetime import datetime

def str_to_time(orario):
    return datetime.strptime(str(orario).strip(), "%H:%M").time()

# 1. CONNESSIONE A GOOGLE SHEETS
scopes = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds = Credentials.from_service_account_file("credenziali.json", scopes=scopes)
client = gspread.authorize(creds)

# 2. APRI IL FOGLIO
foglio = client.open("Oderzo Basket - Gestione Spazi")

# 3. LEGGI I DATI
orario_fisso = pd.DataFrame(foglio.worksheet("Orario Fisso").get_all_records())
partite = pd.DataFrame(foglio.worksheet("Partite").get_all_records())

# 4. CONTROLLA CONFLITTI
risultati = []

for _, partita in partite.iterrows():
    giorno = partita["Giorno"].lower()
    palestra = partita["Palestra"].lower()
    squadra = partita["Squadra"]
    ora_inizio = partita["Ora Inizio"]
    ora_fine = partita["Ora Fine"]

    # Filtra orario fisso per giorno e palestra
    stessa_palestra = orario_fisso[
        (orario_fisso["giorno"] == giorno) &
        (orario_fisso["palestra"] == palestra)
    ]

    # Trova conflitti di orario
    conflitti = []
    for _, evento in stessa_palestra.iterrows():
        if str_to_time(evento["ora_inizio"]) < str_to_time(ora_fine) and \
           str_to_time(evento["ora_fine"]) > str_to_time(ora_inizio):
            conflitti.append(f"{evento['squadra']} ({evento['ora_inizio']}-{evento['ora_fine']})")

    # Costruisci risultato
    if conflitti:
        conflitti_testo = " | ".join(conflitti)
        suggerimento = f"Conflitto con: {conflitti_testo}. Valuta di spostare questi allenamenti."
    else:
        suggerimento = "✅ Nessun conflitto — slot libero!"

    risultati.append([
        f"{squadra} - {giorno} {ora_inizio}-{ora_fine} @ {palestra}",
        conflitti_testo if conflitti else "Nessuno",
        suggerimento
    ])

# 5. SCRIVI RISULTATI SU GOOGLE SHEETS
foglio_risultati = foglio.worksheet("Risultati")
foglio_risultati.clear()
foglio_risultati.append_row(["Partita", "Conflitti trovati", "Suggerimento"])
for riga in risultati:
    foglio_risultati.append_row(riga)

print("✅ Analisi completata. Controlla il foglio Risultati su Google Sheets.")
