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
        # Fallback colonne FIP (aggiunte dalla migration_fip.sql)
        if "stato" not in df.columns:
            df["stato"] = "provvisoria"
        if "tipo_import" not in df.columns:
            df["tipo_import"] = "manuale"
        if "note" not in df.columns:
            df["note"] = ""
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
    leggi_doa.clear()


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


def cancella_partite_fip(squadra: str = None) -> int:
    """
    Cancella le partite FIP (tipo_import in provvisorio/definitivo) dal calendario.
    Se squadra è specificata, cancella solo le partite di quella squadra.
    Returns: numero di righe cancellate, -1 se errore.
    """
    try:
        db = get_client()
        q = db.table("calendario").delete().in_("tipo_import", ["provvisorio", "definitivo"])
        if squadra:
            q = q.eq("squadra", squadra)
        resp = q.execute()
        _get_supabase_client.cache_clear() if hasattr(_get_supabase_client, "cache_clear") else None
        return len(resp.data) if resp.data else 0
    except Exception as e:
        print(f"Errore cancella_partite_fip: {e}", file=sys.stderr)
        return -1


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


# ── DOA — Disponibilità Orario Accordate ─────────────────────────────────────

@st.cache_data(ttl=60)
def leggi_doa(categoria: str = None, stagione: str = None) -> pd.DataFrame:
    """
    Legge la tabella 'doa' da Supabase.
    Filtri opzionali per categoria e stagione.
    """
    try:
        db = get_client()
        q = db.table("doa").select("*").order("categoria").order("giorno")
        if categoria:
            q = q.eq("categoria", categoria)
        if stagione:
            q = q.eq("stagione", stagione)
        resp = q.execute()
        rows = resp.data or []
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df = df.set_index("id")
        return _drop_meta(df)
    except Exception as e:
        print(f"Errore leggi_doa: {e}", file=sys.stderr)
        return pd.DataFrame()


def salva_doa(categoria: str, giorni: list, ora_inizio: str, ora_fine: str,
              stagione: str = None) -> bool:
    """
    Salva le DOA per una categoria (cancella le precedenti e reinserisce).
    """
    if stagione is None:
        from datetime import date as _date
        oggi = _date.today()
        stagione = f"{oggi.year}-{oggi.year + 1}" if oggi.month >= 9 else f"{oggi.year - 1}-{oggi.year}"
    try:
        db = get_client()
        db.table("doa").delete().eq("categoria", categoria).eq("stagione", stagione).execute()
        for giorno in giorni:
            db.table("doa").insert({
                "categoria":  categoria,
                "giorno":     giorno,
                "ora_inizio": ora_inizio,
                "ora_fine":   ora_fine,
                "stagione":   stagione,
            }).execute()
        leggi_doa.clear()
        return True
    except Exception as e:
        st.error(f"Errore salva_doa: {e}")
        return False


def salva_doa_lista(categoria: str, doa_lista: list, stagione: str = None) -> bool:
    """
    Salva DOA con orari diversi per giorno (es. sabato 16-21, domenica 09:30-19).
    doa_lista: [{giorno, ora_inizio, ora_fine}, ...]
    Cancella le DOA esistenti per (categoria, stagione) e reinserisce.
    """
    if stagione is None:
        from datetime import date as _date
        oggi = _date.today()
        stagione = f"{oggi.year}-{oggi.year + 1}" if oggi.month >= 9 else f"{oggi.year - 1}-{oggi.year}"
    try:
        db = get_client()
        db.table("doa").delete().eq("categoria", categoria).eq("stagione", stagione).execute()
        for entry in doa_lista:
            db.table("doa").insert({
                "categoria":  categoria,
                "giorno":     entry["giorno"],
                "ora_inizio": entry["ora_inizio"],
                "ora_fine":   entry["ora_fine"],
                "stagione":   stagione,
            }).execute()
        leggi_doa.clear()
        return True
    except Exception as e:
        print(f"Errore salva_doa_lista: {e}", file=sys.stderr)
        return False


def aggiorna_stato_partita(row_id: int, stato: str, note: str = None) -> bool:
    """Aggiorna stato (e opzionalmente note) di una partita nel calendario."""
    dati: dict = {"stato": stato}
    if note is not None:
        dati["note"] = note
    return aggiorna_evento("calendario", row_id, dati)


# ── AUTENTICAZIONE UTENTI ─────────────────────────────────────────────────────
# Tutte le operazioni di auth usano get_client() — già testato e funzionante.
# Con service_role_key configurata, supporta anche le API auth.admin.*.


def login_utente(email: str, password: str):
    """
    Autentica un utente via Supabase Auth (email + password).
    Returns (success: bool, user_dict: dict, errore: str)
    user_dict contiene: email, user_id, nome, cognome, ruolo
    """
    try:
        client = get_client()
        resp = client.auth.sign_in_with_password({"email": email, "password": password})
        if resp.user:
            meta = resp.user.user_metadata or {}
            user_dict = {
                "email":    resp.user.email,
                "user_id":  str(resp.user.id),
                "nome":     meta.get("nome", ""),
                "cognome":  meta.get("cognome", ""),
                "ruolo":    meta.get("ruolo", "allenatore"),
            }
            return True, user_dict, ""
        return False, {}, "Login fallito."
    except Exception as e:
        err = str(e).lower()
        if "invalid login credentials" in err or "invalid_credentials" in err:
            return False, {}, "Email o password errata."
        if "email not confirmed" in err or "email_not_confirmed" in err:
            return False, {}, "Email non confermata. Contatta l'amministratore."
        if "user not found" in err:
            return False, {}, "Utente non trovato."
        return False, {}, f"Errore di autenticazione: {str(e)}"


def registra_utente(email: str, password: str, nome: str, cognome: str, ruolo: str):
    """
    Registra un nuovo utente in Supabase Auth (operazione admin).
    L'email viene auto-confermata — non serve verifica via email.
    Richiede service_role_key in secrets.
    Returns (success: bool, errore: str)
    """
    try:
        client = get_client()
        resp = client.auth.admin.create_user({
            "email":         email,
            "password":      password,
            "email_confirm": True,
            "user_metadata": {"nome": nome, "cognome": cognome, "ruolo": ruolo},
        })
        if resp.user:
            return True, ""
        return False, "Registrazione fallita senza errore specifico."
    except Exception as e:
        err = str(e).lower()
        if "already registered" in err or "already exists" in err or "duplicate" in err:
            return False, "Questa email è già registrata."
        return False, f"Errore: {str(e)}"


def logout_utente():
    """Cancella i dati di sessione dell'utente corrente da st.session_state."""
    keys_auth = [
        "autenticato", "ruolo", "utente_email", "utente_nome",
        "utente_cognome", "utente_id",
    ]
    for k in keys_auth:
        st.session_state.pop(k, None)


def utente_corrente() -> dict:
    """Restituisce i dati dell'utente loggato da st.session_state."""
    return {
        "email":   st.session_state.get("utente_email", ""),
        "nome":    st.session_state.get("utente_nome", ""),
        "cognome": st.session_state.get("utente_cognome", ""),
        "ruolo":   st.session_state.get("ruolo", ""),
        "user_id": st.session_state.get("utente_id", ""),
    }


def lista_utenti() -> list:
    """
    Restituisce tutti gli utenti registrati in Supabase Auth.
    Solo per admin — richiede service_role_key.
    """
    try:
        client = get_client()
        resp = client.auth.admin.list_users()
        raw = resp if isinstance(resp, list) else getattr(resp, "users", [])
        users = []
        for u in raw:
            meta = (u.user_metadata or {}) if hasattr(u, "user_metadata") else {}
            banned = getattr(u, "banned_until", None)
            users.append({
                "id":      str(u.id),
                "email":   u.email or "",
                "nome":    meta.get("nome", ""),
                "cognome": meta.get("cognome", ""),
                "ruolo":   meta.get("ruolo", "allenatore"),
                "attivo":  banned is None,
            })
        return users
    except Exception as e:
        st.error(f"Errore lista_utenti: {e}")
        return []


def aggiorna_ruolo_utente(user_id: str, nuovo_ruolo: str) -> bool:
    """Cambia il ruolo di un utente (merge dei metadati, non sovrascrive)."""
    try:
        client = get_client()
        user_resp = client.auth.admin.get_user_by_id(user_id)
        u = getattr(user_resp, "user", user_resp)
        meta = (u.user_metadata or {}) if u else {}
        meta["ruolo"] = nuovo_ruolo
        client.auth.admin.update_user_by_id(user_id, {"user_metadata": meta})
        return True
    except Exception as e:
        st.error(f"Errore aggiorna_ruolo_utente: {e}")
        return False


def disabilita_utente(user_id: str, disabilita: bool = True) -> bool:
    """Banna (disabilita) o sbanna (riabilita) un utente da Supabase Auth."""
    try:
        client = get_client()
        ban_duration = "876600h" if disabilita else "none"
        client.auth.admin.update_user_by_id(user_id, {"ban_duration": ban_duration})
        return True
    except Exception as e:
        st.error(f"Errore disabilita_utente: {e}")
        return False


def reset_password_email(email: str):
    """
    Invia un'email di reset password tramite Supabase Auth.
    Returns (success: bool, messaggio: str)
    """
    try:
        client = get_client()
        client.auth.reset_password_for_email(email)
        return True, "Email di reset inviata. Controlla la tua casella di posta."
    except Exception as e:
        return False, f"Errore: {str(e)}"


if __name__ == "__main__":
    if len(sys.argv) == 3:
        test_connessione(url=sys.argv[1], key=sys.argv[2])
    else:
        print("Uso: python database.py <SUPABASE_URL> <SUPABASE_KEY>")
        print("Oppure, dentro Streamlit, le credenziali vengono lette da st.secrets.")
