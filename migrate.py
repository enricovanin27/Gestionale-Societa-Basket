"""
migrate.py — Migra i dati da Google Sheets a Supabase.

Uso:
    python migrate.py <SUPABASE_URL> <SUPABASE_KEY>

Oppure esportando le variabili d'ambiente:
    set SUPABASE_URL=https://xxx.supabase.co
    set SUPABASE_KEY=eyJ...
    python migrate.py

Lo script usa upsert su tutte le tabelle, quindi è idempotente:
puoi eseguirlo più volte senza duplicare i dati.
"""

import sys
import os
import pandas as pd
import gspread
from google.oauth2.service_account import Credentials


# ── Recupera credenziali Supabase ────────────────────────────────────────────

def _get_supabase_creds() -> tuple[str, str]:
    # 1) Argomenti da riga di comando
    if len(sys.argv) == 3:
        return sys.argv[1], sys.argv[2]

    # 2) Variabili d'ambiente
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_KEY", ""))
    if url and key:
        return url, key

    # 3) secrets.toml — usa service_role se disponibile, altrimenti anon key
    try:
        import toml
        secrets_path = os.path.join(".streamlit", "secrets.toml")
        if os.path.exists(secrets_path):
            with open(secrets_path, "r", encoding="utf-8-sig") as f:
                secrets = toml.load(f)
            sb = secrets.get("supabase", {})
            url = sb.get("url", "")
            # Preferisce service_role (bypassa RLS), fallback su anon key
            key = sb.get("service_role_key", sb.get("key", ""))
            if url and key:
                return url, key
    except Exception:
        pass

    print("Errore: credenziali Supabase non trovate.")
    print("Uso: python migrate.py <SUPABASE_URL> <SUPABASE_SERVICE_ROLE_KEY>")
    print("     oppure aggiungi service_role_key in [supabase] dentro secrets.toml")
    sys.exit(1)


# ── Connessione a Google Sheets ──────────────────────────────────────────────

def _connetti_sheets():
    """
    Legge le credenziali GCP da secrets.toml (come fa Streamlit)
    oppure da una variabile d'ambiente GOOGLE_CREDS_JSON.
    """
    import json, toml

    # Prova prima secrets.toml
    secrets_path = os.path.join(".streamlit", "secrets.toml")
    print(f"  [DEBUG] Cerco secrets in: {os.path.abspath(secrets_path)}")
    print(f"  [DEBUG] File esiste: {os.path.exists(secrets_path)}")
    if os.path.exists(secrets_path):
        with open(secrets_path, "r", encoding="utf-8-sig") as f:
            secrets = toml.load(f)
        sa_info = secrets.get("gcp_service_account", {})
        print(f"  [DEBUG] gcp_service_account trovato: {bool(sa_info)}")
    else:
        raw = os.environ.get("GOOGLE_CREDS_JSON", "")
        if not raw:
            raise RuntimeError(
                "Credenziali Google non trovate.\n"
                "Crea .streamlit/secrets.toml oppure imposta GOOGLE_CREDS_JSON."
            )
        sa_info = json.loads(raw)

    print("  [DEBUG] Creo Credentials Google ...")
    scopes = [
        "https://spreadsheets.google.com/feeds",
        "https://www.googleapis.com/auth/drive",
    ]
    creds  = Credentials.from_service_account_info(sa_info, scopes=scopes)
    print("  [DEBUG] gspread.authorize ...")
    client = gspread.authorize(creds)
    print("  [DEBUG] Apro il foglio 'Oderzo Basket - Gestione Spazi' ...")
    foglio = client.open("Oderzo Basket - Gestione Spazi")
    print("  [DEBUG] Foglio aperto OK")
    return foglio


def _leggi_foglio(foglio, nome: str) -> pd.DataFrame:
    print(f"  [DEBUG] Leggo foglio '{nome}' ...")
    try:
        ws   = foglio.worksheet(nome)
        dati = ws.get_all_values()
        print(f"  [DEBUG] Righe raw lette: {len(dati)}")
        if not dati:
            return pd.DataFrame()
        righe = [r for r in dati if any(c.strip() for c in r)]
        if not righe:
            return pd.DataFrame()
        headers = righe[0]
        print(f"  [DEBUG] Colonne: {headers}")
        df = pd.DataFrame(righe[1:], columns=headers) if len(righe) > 1 else pd.DataFrame(columns=headers)
        print(f"  [DEBUG] Righe dati: {len(df)}")
        return df
    except Exception as e:
        print(f"  WARN  Impossibile leggere '{nome}': {e}")
        return pd.DataFrame()


# ── Helper ───────────────────────────────────────────────────────────────────

def _str(val) -> str:
    s = str(val).strip()
    return "" if s.lower() in ("nan", "none") else s


def _si_no(val) -> str:
    return "SI" if str(val).strip().upper() in ("SI", "SÌ", "1", "TRUE", "X", "S") else "NO"


def _time_or_none(val: str):
    """Normalizza HH:MM — ritorna None se vuoto."""
    s = _str(val)
    if not s:
        return None
    if len(s) == 5 and s[2] == ":":
        return s
    return None


def _find_col(df: pd.DataFrame, *keywords) -> str | None:
    for kw in keywords:
        for c in df.columns:
            if kw.lower() in c.lower():
                return c
    return None


GIORNI = ["Lunedi", "Martedi", "Mercoledi", "Giovedi", "Venerdi", "Sabato", "Domenica"]
GIORNI_DB = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]


# ── Migrazioni singole ───────────────────────────────────────────────────────

def _migra_squadre(supabase, foglio):
    print("\n[SQUADRE] Migrazione ...")
    df = _leggi_foglio(foglio, "Squadre")
    if df.empty:
        print("  Nessun dato.")
        return

    col_cat  = _find_col(df, "categoria")
    col_risc = _find_col(df, "riscaldamento", "risc")
    col_dur  = _find_col(df, "durata")

    records = []
    for _, row in df.iterrows():
        cat = _str(row.get(col_cat or "Categoria", ""))
        if not cat:
            continue
        rec = {
            "categoria":            cat,
            "minuti_riscaldamento": int(float(_str(row.get(col_risc, 30)) or 30)),
            "durata_partita":       int(float(_str(row.get(col_dur,  105)) or 105)),
        }
        for g, gdb in zip(GIORNI, GIORNI_DB):
            rec[gdb] = _si_no(row.get(g, "NO"))
        records.append(rec)

    if records:
        seen = {}
        for r in records:
            seen[r["categoria"]] = r
        records = list(seen.values())
        print(f"  [DEBUG] Invio {len(records)} record a Supabase (squadre) ...")
        resp = supabase.table("squadre").upsert(records, on_conflict="categoria").execute()
        print(f"  [DEBUG] Risposta Supabase: {resp}")
        print(f"  OK  {len(records)} squadre inserite/aggiornate.")
    else:
        print("  Nessuna riga valida.")


def _migra_palestre(supabase, foglio):
    print("\n[PALESTRE] Migrazione ...")
    df = _leggi_foglio(foglio, "Palestre")
    if df.empty:
        print("  Nessun dato.")
        return

    col_nome = _find_col(df, "nome")
    col_oi   = _find_col(df, "inizio")
    col_of   = _find_col(df, "fine")

    records = []
    for _, row in df.iterrows():
        nome = _str(row.get(col_nome or "Nome", ""))
        if not nome:
            continue
        oi = _time_or_none(row.get(col_oi, "15:00")) or "15:00"
        of = _time_or_none(row.get(col_of, "22:00")) or "22:00"
        rec = {
            "nome":         nome,
            "orario_inizio": oi,
            "orario_fine":   of,
        }
        for g, gdb in zip(GIORNI, GIORNI_DB):
            rec[gdb] = _si_no(row.get(g, "NO"))
        records.append(rec)

    if records:
        # Deduplica per nome (tieni l'ultima occorrenza)
        seen = {}
        for r in records:
            seen[r["nome"]] = r
        records = list(seen.values())
        nomi = [r["nome"] for r in records]
        print(f"  [DEBUG] Palestre dopo dedup: {nomi}")
        print(f"  [DEBUG] Invio {len(records)} record a Supabase (palestre) ...")
        resp = supabase.table("palestre").upsert(records, on_conflict="nome").execute()
        print(f"  [DEBUG] Risposta Supabase: {resp}")
        print(f"  OK  {len(records)} palestre inserite/aggiornate.")
    else:
        print("  Nessuna riga valida.")


def _migra_allenatori(supabase, foglio):
    print("\n[ALLENATORI] Migrazione ...")
    df = _leggi_foglio(foglio, "Allenatori")
    if df.empty:
        print("  Nessun dato.")
        return

    records = []
    for _, row in df.iterrows():
        nome    = _str(row.get("Nome", ""))
        cognome = _str(row.get("Cognome", ""))
        if not nome and not cognome:
            continue
        records.append({
            "nome":    nome,
            "cognome": cognome,
            "email":   _str(row.get("Email", "")),
            "squadre": _str(row.get("Squadre", "")),
        })

    if records:
        seen = {}
        for r in records:
            seen[(r["nome"], r["cognome"])] = r
        records = list(seen.values())
        print(f"  [DEBUG] Invio {len(records)} record a Supabase (allenatori) ...")
        resp = supabase.table("allenatori").upsert(records, on_conflict="nome,cognome").execute()
        print(f"  [DEBUG] Risposta Supabase: {resp}")
        print(f"  OK  {len(records)} allenatori inseriti/aggiornati.")
    else:
        print("  Nessuna riga valida.")


def _migra_orario_fisso(supabase, foglio):
    print("\n[ORARIO FISSO] Migrazione ...")
    df = _leggi_foglio(foglio, "Orario Fisso")
    if df.empty:
        print("  Nessun dato.")
        return

    col_giorno    = _find_col(df, "giorno")
    col_palestra  = _find_col(df, "palestra")
    col_squadra   = _find_col(df, "squadra")
    col_ora_i     = _find_col(df, "ora_inizio", "inizio")
    col_ora_f     = _find_col(df, "ora_fine", "fine")
    col_all       = _find_col(df, "allenatori", "allenatore")
    col_cond      = _find_col(df, "condivisione")

    print(f"  [DEBUG] Colonne rilevate: giorno={col_giorno}, palestra={col_palestra}, "
          f"squadra={col_squadra}, ora_inizio={col_ora_i}, ora_fine={col_ora_f}")

    records = []
    for _, row in df.iterrows():
        giorno    = _str(row.get(col_giorno or "giorno", "")).lower()
        palestra  = _str(row.get(col_palestra or "palestra", ""))
        squadra   = _str(row.get(col_squadra or "squadra", ""))
        ora_i     = _time_or_none(row.get(col_ora_i or "ora_inizio", ""))
        ora_f     = _time_or_none(row.get(col_ora_f or "ora_fine", ""))
        if not (giorno and palestra and squadra and ora_i and ora_f):
            continue
        records.append({
            "giorno":       giorno,
            "palestra":     palestra,
            "squadra":      squadra,
            "ora_inizio":   ora_i,
            "ora_fine":     ora_f,
            "allenatori":   _str(row.get(col_all or "allenatori", "")),
            "condivisione": _si_no(row.get(col_cond or "condivisione", "NO")),
        })

    if records:
        seen = {}
        for r in records:
            seen[(r["giorno"], r["palestra"], r["squadra"], r["ora_inizio"])] = r
        records = list(seen.values())
        print(f"  [DEBUG] Invio {len(records)} record a Supabase (orario_fisso) ...")
        resp = supabase.table("orario_fisso").upsert(
            records, on_conflict="giorno,palestra,squadra,ora_inizio"
        ).execute()
        print(f"  [DEBUG] Risposta Supabase: {resp}")
        print(f"  OK  {len(records)} slot orario inseriti/aggiornati.")
    else:
        print("  Nessuna riga valida.")


def _migra_calendario(supabase, foglio):
    print("\n[CALENDARIO] Migrazione ...")
    df = _leggi_foglio(foglio, "Calendario Definitivo")
    if df.empty:
        print("  Nessun dato.")
        return

    records = []
    skippati = 0
    for _, row in df.iterrows():
        data_raw = _str(row.get("Data", ""))
        squadra  = _str(row.get("Squadra", ""))
        tipo     = _str(row.get("Tipo", ""))
        if not (data_raw and squadra and tipo):
            skippati += 1
            continue

        # Normalizza data in formato ISO YYYY-MM-DD
        data_iso = None
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"):
            try:
                from datetime import datetime
                data_iso = datetime.strptime(data_raw, fmt).strftime("%Y-%m-%d")
                break
            except ValueError:
                continue
        if not data_iso:
            skippati += 1
            continue

        casa_fuori = _str(row.get("Casa/Fuori", ""))
        # Normalizza valori non standard → stringa vuota
        if casa_fuori not in ("Casa", "Fuori Casa", "Allenamento spostato"):
            print(f"  [DEBUG] casa_fuori inatteso '{casa_fuori}' → normalizzato a ''")
            casa_fuori = ""

        # La colonna si chiama "Luogo" nel foglio (non "Palestra")
        palestra = _str(row.get("Luogo", row.get("Palestra", "")))

        records.append({
            "data":       data_iso,
            "giorno":     _str(row.get("Giorno", row.get("giorno", ""))).lower(),
            "squadra":    squadra,
            "tipo":       tipo,
            "avversario": _str(row.get("Avversario", "")),
            "ora_inizio": _time_or_none(row.get("Ora Inizio", "")),
            "ora_fine":   _time_or_none(row.get("Ora Fine", "")),
            "casa_fuori": casa_fuori,
            "palestra":   palestra,
        })

    if records:
        print(f"  [DEBUG] Invio {len(records)} record a Supabase (calendario) ...")
        resp = supabase.table("calendario").insert(records).execute()
        print(f"  [DEBUG] Risposta Supabase: {resp}")
        print(f"  OK  {len(records)} eventi inseriti.")
        if skippati:
            print(f"  WARN  {skippati} righe saltate (dati mancanti).")
    else:
        print("  Nessuna riga valida.")


# ── Entry point ──────────────────────────────────────────────────────────────

def main():
    url, key = _get_supabase_creds()
    print(f"[DEBUG] URL Supabase: {url}")
    print(f"[DEBUG] Key (prime 20 car.): {key[:20]}...")

    print("\nConnessione a Supabase ...")
    try:
        from database import get_client
        supabase = get_client(url=url, key=key)
        print("[DEBUG] Client Supabase creato OK")
    except Exception as e:
        print(f"[ERRORE] Creazione client Supabase: {e}")
        raise

    print("\nConnessione a Google Sheets ...")
    try:
        foglio = _connetti_sheets()
        print("[DEBUG] Google Sheets connesso OK")
    except Exception as e:
        print(f"[ERRORE] Google Sheets: {e}")
        raise

    print("\n--- Inizio migrazioni ---")
    _migra_squadre(supabase, foglio)
    _migra_palestre(supabase, foglio)
    _migra_allenatori(supabase, foglio)
    _migra_orario_fisso(supabase, foglio)
    _migra_calendario(supabase, foglio)

    print("\nMigrazione completata.")


if __name__ == "__main__":
    main()
