"""
Funzioni di accesso a Google Sheets — condivise da tutte le pagine.
"""
import streamlit as st
import gspread
from google.oauth2.service_account import Credentials
import pandas as pd


@st.cache_resource
def connetti_sheets():
    scopes = ["https://spreadsheets.google.com/feeds",
              "https://www.googleapis.com/auth/drive"]
    creds = Credentials.from_service_account_info(dict(st.secrets["gcp_service_account"]), scopes=scopes)
    client = gspread.authorize(creds)
    return client.open("Oderzo Basket - Gestione Spazi")


@st.cache_data(ttl=30)
def leggi_foglio(nome):
    try:
        foglio = connetti_sheets()
        ws = foglio.worksheet(nome)
        dati = ws.get_all_values()
        if not dati:
            return pd.DataFrame()
        # Salta le righe completamente vuote in cima per trovare la vera intestazione
        righe_non_vuote = [r for r in dati if any(cell.strip() for cell in r)]
        if not righe_non_vuote:
            return pd.DataFrame()
        headers = righe_non_vuote[0]
        righe = righe_non_vuote[1:]
        if not righe:
            return pd.DataFrame(columns=headers)
        return pd.DataFrame(righe, columns=headers)
    except Exception as e:
        st.error(f"Errore lettura {nome}: {e}")
        return pd.DataFrame()


@st.cache_data(ttl=30)
def carica_tutti_i_dati():
    foglio = connetti_sheets()
    def _leggi(nome):
        try:
            ws = foglio.worksheet(nome)
            dati = ws.get_all_values()
            if not dati:
                return pd.DataFrame()
            # Salta le righe completamente vuote in cima per trovare la vera intestazione
            righe_non_vuote = [r for r in dati if any(cell.strip() for cell in r)]
            if not righe_non_vuote:
                return pd.DataFrame()
            headers = righe_non_vuote[0]
            righe = righe_non_vuote[1:]
            return pd.DataFrame(righe, columns=headers) if righe else pd.DataFrame(columns=headers)
        except Exception as e:
            st.error(f"Errore lettura {nome}: {e}")
            return pd.DataFrame()
    return {
        "Squadre":               _leggi("Squadre"),
        "Allenatori":            _leggi("Allenatori"),
        "Palestre":              _leggi("Palestre"),
        "Orario Fisso":          _leggi("Orario Fisso"),
        "Calendario Definitivo": _leggi("Calendario Definitivo"),
    }


def scrivi_riga(nome_foglio, riga):
    try:
        foglio = connetti_sheets()
        ws = foglio.worksheet(nome_foglio)
        tutti_valori = ws.get_all_values()
        # Trova l'ultima riga con dati reali (ignora righe vuote ovunque si trovino)
        ultima_riga_dati = 0
        for i, r in enumerate(tutti_valori):
            if any(cell.strip() for cell in r):
                ultima_riga_dati = i + 1  # indice 1-based
        prossima_riga = ultima_riga_dati + 1
        ws.update([[str(v) for v in riga]], f"A{prossima_riga}",
                  value_input_option="USER_ENTERED")
        return True
    except Exception as e:
        st.error(f"Errore salvataggio: {e}")
        return False


def scrivi_righe_batch(nome_foglio, righe):
    """Scrive più righe in un'unica chiamata API (atomica lato rete)."""
    if not righe:
        return True
    try:
        foglio = connetti_sheets()
        ws = foglio.worksheet(nome_foglio)
        ws.append_rows([[str(v) for v in riga] for riga in righe],
                       value_input_option="USER_ENTERED")
        return True
    except Exception as e:
        st.error(f"Errore salvataggio batch: {e}")
        return False


def elimina_riga(nome_foglio, indice_riga):
    try:
        foglio = connetti_sheets()
        ws = foglio.worksheet(nome_foglio)
        tutti_valori = ws.get_all_values()
        righe_reali = [i+1 for i, r in enumerate(tutti_valori) if any(c.strip() for c in r)]
        if indice_riga < len(righe_reali):
            ws.delete_rows(righe_reali[indice_riga])
            return True
        return False
    except Exception as e:
        st.error(f"Errore eliminazione: {e}")
        return False


def aggiorna_riga(nome_foglio, indice_riga, nuova_riga):
    try:
        foglio = connetti_sheets()
        ws = foglio.worksheet(nome_foglio)
        tutti_valori = ws.get_all_values()
        righe_reali = [i+1 for i, r in enumerate(tutti_valori) if any(c.strip() for c in r)]
        if indice_riga < len(righe_reali):
            row_num = righe_reali[indice_riga]
            ws.update(f"A{row_num}", [[str(v) for v in nuova_riga]])
            return True
        return False
    except Exception as e:
        st.error(f"Errore aggiornamento: {e}")
        return False


def reset_form():
    keys_to_delete = ["conflitti", "fuori_casa", "partita", "suggerimenti_fuori",
                      "orario_fisso", "df_squadre", "df_allenatori", "df_palestre",
                      "date_alternative", "data_selezionata", "risolvi_conflitto_idx"]
    for k in keys_to_delete:
        if k in st.session_state:
            del st.session_state[k]
    st.session_state["form_key"] = st.session_state.get("form_key", 0) + 1
