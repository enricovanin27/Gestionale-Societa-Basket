"""
Script one-shot per creare il primo utente admin su Supabase Auth.
Esegui con:  python crea_primo_admin.py
"""

import sys
import pathlib

try:
    import tomllib as _tomllib
except ImportError:
    try:
        import tomli as _tomllib
    except ImportError:
        _tomllib = None

from supabase import create_client

# ── Legge credenziali da .streamlit/secrets.toml ─────────────────────────────
def _leggi_secrets():
    if _tomllib is None:
        sys.exit("Errore: installa tomli  →  pip install tomli")
    path = pathlib.Path(__file__).parent / ".streamlit" / "secrets.toml"
    if not path.exists():
        sys.exit(f"Errore: file non trovato → {path}")
    with open(path, "rb") as f:
        return _tomllib.load(f)

secrets = _leggi_secrets()
sb = secrets.get("supabase", {})
url = sb.get("url", "")
key = sb.get("service_role_key", "") or sb.get("key", "")

if not url or not key:
    sys.exit("Errore: url o key Supabase mancanti in secrets.toml")

client = create_client(url, key)

# ── Input interattivo ─────────────────────────────────────────────────────────
print("\n=== Crea primo utente Admin ===\n")
nome     = input("Nome:     ").strip()
cognome  = input("Cognome:  ").strip()
email    = input("Email:    ").strip().lower()
password = input("Password: ").strip()

if not all([nome, cognome, email, password]):
    sys.exit("Errore: tutti i campi sono obbligatori.")
if len(password) < 6:
    sys.exit("Errore: la password deve essere di almeno 6 caratteri.")

# ── Creazione utente via Admin API ────────────────────────────────────────────
try:
    resp = client.auth.admin.create_user({
        "email":         email,
        "password":      password,
        "email_confirm": True,
        "user_metadata": {
            "nome":    nome,
            "cognome": cognome,
            "ruolo":   "admin",
        },
    })
    if resp.user:
        print(f"\n✅ Admin creato con successo!")
        print(f"   Email:  {resp.user.email}")
        print(f"   ID:     {resp.user.id}")
        print(f"\nOra puoi fare il login nell'app con queste credenziali.\n")
    else:
        print("❌ Creazione fallita senza errore specifico.")
except Exception as e:
    err = str(e).lower()
    if "already registered" in err or "already exists" in err:
        print(f"\n⚠️  L'email '{email}' è già registrata.")
        print("   Usa Gestione Utenti nell'app per cambiarne il ruolo.\n")
    else:
        print(f"\n❌ Errore: {e}\n")
