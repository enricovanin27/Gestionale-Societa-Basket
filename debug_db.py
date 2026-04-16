"""
Script di debug — esegui con:
    python debug_db.py
"""
import toml, os
from supabase import create_client

secrets_path = os.path.join(".streamlit", "secrets.toml")
with open(secrets_path, "r", encoding="utf-8-sig") as f:
    secrets = toml.load(f)

sb = secrets["supabase"]
url = sb["url"]
key = sb.get("service_role_key") or sb["key"]

print(f"URL: {url}")
print(f"Key role: {'service_role' if 'service_role_key' in sb else 'anon'}")
print()

client = create_client(url, key)

for tabella in ["orario_fisso"]:
    try:
        resp = client.table(tabella).select("*").limit(5).execute()
        n = len(resp.data or [])
        print(f"[{tabella}]  {n} righe (prime 5)")
        if n > 0:
            print(f"  Colonne: {list(resp.data[0].keys())}")
            for row in resp.data:
                print(f"  → giorno={repr(row.get('giorno'))}  palestra={repr(row.get('palestra'))}  squadra={repr(row.get('squadra'))}  ora_inizio={repr(row.get('ora_inizio'))}  ora_fine={repr(row.get('ora_fine'))}")
    except Exception as e:
        print(f"[{tabella}]  ERRORE: {e}")
    print()
