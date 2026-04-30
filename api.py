"""
FastAPI minima — scheduling + parsing PDF FIP.
Avvia con: uvicorn api:app --reload --port 8000
"""

import os
import json
import httpx
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pywebpush import webpush, WebPushException

from logic import genera_orario_settimanale, estrai_partite_da_pdf

SUPABASE_URL         = os.getenv('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
VAPID_PRIVATE_KEY    = os.getenv('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC_KEY     = os.getenv('VAPID_PUBLIC_KEY', '')
VAPID_SUBJECT        = os.getenv('VAPID_SUBJECT', 'mailto:info@example.com')

app = FastAPI(title="Oderzo Basket API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.delete("/api/admin/delete-user/{user_id}")
async def delete_user(user_id: str):
    """Elimina utente da auth.users (usa service role)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {"error": "Backend non configurato"}

    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey":        SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
            timeout=15,
        )
    if resp.status_code not in (200, 204):
        detail = resp.json() if resp.content else {}
        return {"error": detail.get("message", "Errore eliminazione utente")}
    return {"ok": True}


@app.post("/api/admin/create-user")
async def create_user(payload: dict):
    """Crea utente Supabase senza fare login come lui (usa service role)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {"error": "Backend non configurato"}

    body = {
        "email":          payload["email"],
        "password":       payload["password"],
        "email_confirm":  True,
        "user_metadata":  payload.get("user_metadata", {}),
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            json=body,
            headers={
                "apikey":         SUPABASE_SERVICE_KEY,
                "Authorization":  f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type":   "application/json",
            },
            timeout=15,
        )
    if resp.status_code not in (200, 201):
        return {"error": resp.json().get("message", "Errore creazione utente")}
    return {"user": resp.json()}


@app.post("/api/scheduling")
async def scheduling(vincoli: dict):
    """Genera orario settimanale ottimale dalla logica CP in logic.py."""
    try:
        result = genera_orario_settimanale(vincoli)
        return {"success": True, **result}
    except Exception as e:
        return {"success": False, "error": str(e), "assegnazioni": [], "avvisi": []}


@app.post("/api/notifica/allenamento")
async def notifica_allenamento(payload: dict):
    """Invia push notification a tutti i genitori della squadra quando un allenamento è annullato."""
    if not VAPID_PRIVATE_KEY or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {"sent": 0, "skipped": "VAPID or Supabase keys not configured"}

    squadra    = payload.get("squadra", "")
    societa_id = payload.get("societa_id", "")
    titolo     = payload.get("titolo", "Allenamento annullato")
    corpo      = payload.get("corpo", f"Allenamento {squadra} annullato")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/push_subscriptions",
                params={"societa_id": f"eq.{societa_id}", "squadre": f"cs.{{\"{squadra}\"}}"},
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                timeout=10,
            )
            subscriptions = resp.json() if resp.status_code == 200 else []
    except Exception as e:
        return {"sent": 0, "error": str(e)}

    sent = 0
    for row in subscriptions:
        sub = row.get("subscription")
        if not sub:
            continue
        try:
            webpush(
                subscription_info=sub,
                data=json.dumps({"title": titolo, "body": corpo}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent += 1
        except WebPushException:
            pass

    return {"sent": sent}


@app.post("/api/fip/estrai")
async def estrai_fip(
    pdf: UploadFile = File(...),
    societa: str = Form(default="Oderzo"),
):
    """Estrae partite da un PDF FIP (formato A o B)."""
    try:
        pdf_bytes = await pdf.read()
        partite, errore, doa_estratte = estrai_partite_da_pdf(pdf_bytes, societa)
        return {
            "success": errore is None,
            "partite": partite,
            "errore": errore,
            "doa_estratte": doa_estratte,
        }
    except Exception as e:
        return {"success": False, "partite": [], "errore": str(e), "doa_estratte": []}
