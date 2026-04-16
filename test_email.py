"""
Script di test per verificare la connessione SMTP.
Legge le credenziali da .streamlit/secrets.toml (mai in git).
Esecuzione: python test_email.py
"""
import tomllib
import pathlib
import logic

secrets_path = pathlib.Path(__file__).parent / ".streamlit" / "secrets.toml"
with open(secrets_path, "rb") as f:
    secrets = tomllib.load(f)

logic.EMAIL_MITTENTE = secrets["email"]["mittente"]
logic.EMAIL_PASSWORD  = secrets["email"]["password"]

destinatario = logic.EMAIL_MITTENTE  # manda a se stesso come test
ok, err = logic.manda_email(
    [destinatario],
    "Test Oderzo Basket",
    "Test email funzionante — credenziali SMTP OK."
)

if ok:
    print(f"Email inviata con successo a {destinatario}")
else:
    print(f"Errore: {err}")
