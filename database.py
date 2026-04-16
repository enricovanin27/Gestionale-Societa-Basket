"""
Connessione a Supabase — usata da tutte le pagine al posto di Google Sheets.

Le credenziali vengono lette da st.secrets:
    st.secrets["supabase"]["url"]
    st.secrets["supabase"]["key"]

Fuori da Streamlit (migrate.py, script CLI) passa url e key esplicitamente:
    from database import get_client
    client = get_client(url="https://...", key="...")
"""

import sys
import pathlib
import streamlit as st
import pandas as pd
from supabase import create_client, Client

try:
    import tomllib as _tomllib
except ImportError:
    try:
        import tomli as _tomllib  # type: ignore
    except ImportError:
        _tomllib = None  # type: ignore


def _leggi_secrets_toml() -> dict:
    """Legge .streamlit/secrets.toml con tomllib come fallback a st.secrets."""
    if _tomllib is None:
        return {}
    secrets_path = pathlib.Path(__file__).parent / ".streamlit" / "secrets.toml"
    if not secrets_path.exists():
        return {}
    try:
        with open(secrets_path, "rb") as f:
            return _tomllib.load(f)
    except Exception:
        return {}

# Giorni in formato Google Sheets (PascalCase)
_GIORNI_GS = ["Lunedi", "Martedi", "Mercoledi", "Giovedi", "Venerdi", "Sabato", "Domenica"]
# Mappa lowercase → PascalCase per i giorni
_GIORNI_RINOMINA = {g.lower(): g for g in _GIORNI_GS}

# Mappa nome foglio Google → nome tabella Supabase
TABELLE = {
    "Squadre":               "squadre",
    "Palestre":              "palestre",
    "Allenatori":            "allenatori",
    "Orario Fisso":          "orario_fisso",
    "Calendario Definitivo": "calendario",
}


@st.cache_resource
def _get_supabase_client() -> Client:
    """Singleton Supabase client per l'app Streamlit (credenziali da st.secrets).
    Usa service_role_key se disponibile (bypassa RLS), altrimenti anon key.
    Se st.secrets non è disponibile, legge da .streamlit/secrets.toml via tomllib.
    """
    try:
        url = st.secrets["supabase"]["url"]
        key = st.secrets["supabase"].get("service_role_key") or st.secrets["supabase"]["key"]
    except Exception:
        _s = _leggi_secrets_toml().get("supabase", {})
        url = _s.get("url", "")
        key = _s.get("service_role_key") or _s.get("key", "")
    return create_client(url, key)


def get_client(url: str | None = None, key: str | None = None) -> Client:
    """
    Restituisce il client Supabase.
    - Senza argomenti: usa @st.cache_resource (percorso Streamlit).
    - Con url e key espliciti: crea un nuovo client (per migrate.py e script CLI).
    """
    if url is not None and key is not None:
        return create_client(url, key)
    return _get_supabase_client()


def test_connessione(url: str | None = None, key: str | None = None) -> bool:
    """
    Verifica che la connessione a Supabase funzioni facendo una query
    sulla tabella 'squadre'.  Stampa OK o ERRORE.

    Ritorna True se la connessione ha avuto successo, False altrimenti.
    """
    try:
        client = get_client(url=url, key=key)
        client.table("squadre").select("id").limit(1).execute()
        print("Supabase: OK")
        return True
    except Exception as e:
        print(f"Supabase: ERRORE — {e}")
        return False


# ── Helper ────────────────────────────────────────────────────────────────────

def _strip_seconds(s) -> str:
    """Normalizza "HH:MM:SS" → "HH:MM". Ritorna "" per None/vuoto."""
    s = str(s or "").strip()
    if not s or s in ("None", "nan"):
        return ""
    if len(s) >= 5 and s[2] == ":":
        return s[:5]
    return s


def _drop_meta(df: pd.DataFrame) -> pd.DataFrame:
    """Rimuove le colonne create_at/updated_at se presenti."""
    return df.drop(columns=["created_at", "updated_at"], errors="ignore")


# ── Lettura tabelle ───────────────────────────────────────────────────────────

@st.cache_data(ttl=30)
def leggi_squadre() -> pd.DataFrame:
    """
    Legge la tabella 'squadre' da Supabase.
    Ritorna un DataFrame con indice = id Supabase e colonne compatibili con Google Sheets:
    Categoria, Minuti Riscaldamento, Durata Partita, Lunedi, ..., Domenica
    """
    try:
        db = get_client()
        resp = db.table("squadre").select("*").order("id").execute()
        rows = resp.data or []
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df = df.set_index("id")
        df = _drop_meta(df)
        df = df.rename(columns={
            "categoria":            "Categoria",
            "minuti_riscaldamento": "Minuti Riscaldamento",
            "durata_partita":       "Durata Partita",
            **_GIORNI_RINOMINA,
        })
        return df
    except Exception as e:
        print(f"Errore leggi_squadre: {e}", file=sys.stderr)
        return pd.DataFrame()


@st.cache_data(ttl=30)
def leggi_palestre() -> pd.DataFrame:
    """
    Legge la tabella 'palestre' da Supabase.
    Colonne: Nome, Orario Inizio, Orario Fine, Lunedi, ..., Domenica
    """
    try:
        db = get_client()
        resp = db.table("palestre").select("*").order("id").execute()
        rows = resp.data or []
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df = df.set_index("id")
        df = _drop_meta(df)
        df["orario_inizio"] = df["orario_inizio"].apply(_strip_seconds)
        df["orario_fine"]   = df["orario_fine"].apply(_strip_seconds)
        df = df.rename(columns={
            "nome":          "Nome",
            "orario_inizio": "Orario Inizio",
            "orario_fine":   "Orario Fine",
            "tipo":          "Tipo",
            "zone":          "Zone",
            **_GIORNI_RINOMINA,
        })
        # Fallback per colonne aggiunte dopo la creazione della tabella
        if "Tipo" not in df.columns:
            df["Tipo"] = "Principale"
        if "Zone" not in df.columns:
            df["Zone"] = ""
        return df
    except Exception as e:
        print(f"Errore leggi_palestre: {e}", file=sys.stderr)
        return pd.DataFrame()


@st.cache_data(ttl=30)
def leggi_allenatori() -> pd.DataFrame:
    """
    Legge la tabella 'allenatori' da Supabase.
    Colonne: Nome, Cognome, Email, Squadre
    """
    try:
        db = get_client()
        resp = db.table("allenatori").select("*").order("id").execute()
        rows = resp.data or []
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df = df.set_index("id")
        df = _drop_meta(df)
        df = df.rename(columns={
            "nome":    "Nome",
            "cognome": "Cognome",
            "email":   "Email",
            "squadre": "Squadre",
        })
        return df
    except Exception as e:
        print(f"Errore leggi_allenatori: {e}", file=sys.stderr)
        return pd.DataFrame()


@st.cache_data(ttl=30)
def leggi_orario_fisso() -> pd.DataFrame:
    """
    Legge la tabella 'orario_fisso' da Supabase.
    Colonne: giorno, palestra, squadra, ora_inizio, ora_fine, allenatori, condivisione
    (lowercase, compatibili con come le views le usano già)
    """
    try:
        db = get_client()
        resp = db.table("orario_fisso").select("*").order("id").execute()
        rows = resp.data or []
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df = df.set_index("id")
        df = _drop_meta(df)
        df["ora_inizio"] = df["ora_inizio"].apply(_strip_seconds)
        df["ora_fine"]   = df["ora_fine"].apply(_strip_seconds)
        # Fallback colonne aggiuntive
        if "zona" not in df.columns:
            df["zona"] = ""
        return df
    except Exception as e:
        print(f"Errore leggi_orario_fisso: {e}", file=sys.stderr)
        return pd.DataFrame()


@st.cache_data(ttl=30)
def leggi_calendario() -> pd.DataFrame:
    """
    Legge la tabella 'calendario' da Supabase.
    Colonne compatibili con Google Sheets:
    Data, Giorno, Squadra, Tipo, Avversario, Ora Inizio, Ora Fine, Casa/Fuori,
    Palestra, Luogo (alias di Palestra)
    """
    try:
        db = get_client()
        resp = db.table("calendario").select("*").order("id").execute()
        rows = resp.data or []
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df = df.set_index("id")
        df = _drop_meta(df)
        df["ora_inizio"] = df["ora_inizio"].apply(_strip_seconds)
        df["ora_fine"]   = df["ora_fine"].apply(_strip_seconds)
        # Converti data in stringa YYYY-MM-DD (già in questo formato su Supabase)
        df["data"] = df["data"].astype(str)
        df = df.rename(columns={
            "data":       "Data",
            "giorno":     "Giorno",
            "squadra":    "Squadra",
            "tipo":       "Tipo",
            "avversario": "Avversario",
            "ora_inizio": "Ora Inizio",
            "ora_fine":   "Ora Fine",
            "casa_fuori": "Casa/Fuori",
            "palestra":   "Palestra",
        })
        # Aggiungi colonna "Luogo" come alias di "Palestra"
        # (alcune views cercano "Luogo" per le trasferte)
        df["Luogo"] = df["Palestra"]
        return df
    except Exception as e:
        print(f"Errore leggi_calendario: {e}", file=sys.stderr)
        return pd.DataFrame()


@st.cache_data(ttl=30)
def leggi_orario_settimana(data_inizio: str = None, data_fine: str = None) -> pd.DataFrame:
    """
    Legge la tabella 'orario_settimana' da Supabase.
    Override/variazioni specifici per data (non template fisso).
    Colonne: data, giorno, palestra, squadra, ora_inizio, ora_fine,
             allenatori, condivisione, annullato
    Parametri opzionali per filtrare per range di date (YYYY-MM-DD).
    """
    try:
        db = get_client()
        q = db.table("orario_settimana").select("*").order("data").order("ora_inizio")
        if data_inizio:
            q = q.gte("data", data_inizio)
        if data_fine:
            q = q.lte("data", data_fine)
        resp = q.execute()
        rows = resp.data or []
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df = df.set_index("id")
        df = _drop_meta(df)
        df["ora_inizio"] = df["ora_inizio"].apply(_strip_seconds)
        df["ora_fine"]   = df["ora_fine"].apply(_strip_seconds)
        df["data"]       = df["data"].astype(str)
        if "annullato" not in df.columns:
            df["annullato"] = False
        # Fallback colonne aggiuntive
        if "flag" not in df.columns:
            df["flag"] = "normale"
        if "zona" not in df.columns:
            df["zona"] = ""
        return df
    except Exception as e:
        print(f"Errore leggi_orario_settimana: {e}", file=sys.stderr)
        return pd.DataFrame()


def carica_tutti_i_dati_db() -> dict:
    """
    Equivalente di carica_tutti_i_dati() di sheets.py, ma legge da Supabase.
    Non è cachata perché le singole leggi_* sono già @st.cache_data.
    """
    return {
        "Squadre":               leggi_squadre(),
        "Palestre":              leggi_palestre(),
        "Allenatori":            leggi_allenatori(),
        "Orario Fisso":          leggi_orario_fisso(),
        "Calendario Definitivo": leggi_calendario(),
    }


def invalida_cache():
    """Invalida tutte le cache di lettura da Supabase."""
    leggi_squadre.clear()
    leggi_palestre.clear()
    leggi_allenatori.clear()
    leggi_orario_fisso.clear()
    leggi_orario_settimana.clear()
    leggi_calendario.clear()


# ── Scrittura / aggiornamento / eliminazione ──────────────────────────────────

def scrivi_evento(tabella: str, dati: dict) -> bool:
    """
    Inserisce una nuova riga nella tabella Supabase indicata.

    Parameters
    ----------
    tabella : str   nome tabella Supabase ("squadre", "palestre", ...)
    dati    : dict  colonne e valori da inserire (chiavi = nomi colonne Supabase)

    Returns True se OK, False se errore.
    """
    try:
        db = get_client()
        db.table(tabella).insert(dati).execute()
        return True
    except Exception as e:
        st.error(f"Errore scrivi_evento({tabella}): {e}")
        return False


def aggiorna_evento(tabella: str, row_id: int, dati: dict) -> bool:
    """
    Aggiorna la riga con id=row_id nella tabella Supabase indicata.

    Parameters
    ----------
    tabella : str   nome tabella Supabase
    row_id  : int   valore della colonna 'id' da aggiornare
    dati    : dict  colonne e nuovi valori (chiavi = nomi colonne Supabase)

    Returns True se OK, False se errore.
    """
    try:
        db = get_client()
        db.table(tabella).update(dati).eq("id", row_id).execute()
        return True
    except Exception as e:
        st.error(f"Errore aggiorna_evento({tabella}, id={row_id}): {e}")
        return False


def elimina_evento(tabella: str, row_id: int) -> bool:
    """
    Elimina la riga con id=row_id dalla tabella Supabase indicata.

    Returns True se OK, False se errore.
    """
    try:
        db = get_client()
        db.table(tabella).delete().eq("id", row_id).execute()
        return True
    except Exception as e:
        st.error(f"Errore elimina_evento({tabella}, id={row_id}): {e}")
        return False


def scrivi_eventi_batch(tabella: str, lista_dati: list) -> bool:
    """
    Inserisce più righe in una sola chiamata.

    Parameters
    ----------
    tabella    : str        nome tabella Supabase
    lista_dati : list[dict] lista di dict, ognuno = una riga

    Returns True se OK, False se errore.
    """
    if not lista_dati:
        return True
    try:
        db = get_client()
        db.table(tabella).insert(lista_dati).execute()
        return True
    except Exception as e:
        st.error(f"Errore scrivi_eventi_batch({tabella}): {e}")
        return False


def reset_form():
    """Resetta le chiavi di sessione usate dal form inserimento partita."""
    keys_to_delete = [
        "conflitti", "fuori_casa", "partita", "suggerimenti_fuori",
        "orario_fisso", "df_squadre", "df_allenatori", "df_palestre",
        "date_alternative", "data_selezionata", "risolvi_conflitto_idx",
    ]
    for k in keys_to_delete:
        if k in st.session_state:
            del st.session_state[k]
    st.session_state["form_key"] = st.session_state.get("form_key", 0) + 1


if __name__ == "__main__":
    if len(sys.argv) == 3:
        test_connessione(url=sys.argv[1], key=sys.argv[2])
    else:
        print("Uso: python database.py <SUPABASE_URL> <SUPABASE_KEY>")
        print("Oppure, dentro Streamlit, le credenziali vengono lette da st.secrets.")
