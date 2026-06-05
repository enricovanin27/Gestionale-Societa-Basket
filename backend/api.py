"""
FastAPI minima — scheduling + parsing PDF FIP.
Avvia con: uvicorn api:app --reload --port 8000
"""

import os
import json
import re
import unicodedata
from datetime import datetime
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


def to_slug(nome: str) -> str:
    """Converte nome società in slug URL-safe (es. 'Oderzo Basket' → 'oderzo-basket')."""
    nome = unicodedata.normalize('NFD', nome.lower())
    nome = ''.join(c for c in nome if unicodedata.category(c) != 'Mn')
    nome = nome.strip()
    # Prima converti ogni sequenza di spazi in un singolo trattino
    nome = re.sub(r'\s+', '-', nome)
    # Poi rimuovi (senza sostituire) i caratteri non ammessi
    nome = re.sub(r'[^a-z0-9-]', '', nome)
    # Collassa trattini multipli in un solo trattino
    nome = re.sub(r'-+', '-', nome)
    nome = nome.strip('-')
    return nome


async def get_unique_slug(client, base_slug: str) -> str:
    """Restituisce uno slug univoco: se 'oderzo-basket' esiste, ritorna 'oderzo-basket-2'."""
    slug = base_slug
    for i in range(2, 100):
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/societa",
            params={"slug": f"eq.{slug}", "select": "slug"},
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
            timeout=10,
        )
        rows = resp.json() if resp.status_code == 200 else []
        if not rows:
            return slug
        slug = f"{base_slug}-{i}"
    raise ValueError("Impossibile generare slug univoco dopo 99 tentativi")


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


@app.post("/api/register-society")
async def register_society(payload: dict):
    """
    Registrazione self-service nuova società.
    Crea: società in DB → utente admin via Supabase invite → profilo → notifica super_admin.
    Rollback automatico se uno step intermedio fallisce.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return {"error": "Backend non configurato"}

    # ── Validazione input ─────────────────────────────────────────────────────
    nome        = payload.get("nome", "").strip()
    ref_email   = payload.get("ref_email", "").strip().lower()
    ref_nome    = payload.get("ref_nome", "").strip()
    ref_cognome = payload.get("ref_cognome", "").strip()
    ref_citta   = payload.get("ref_citta", "").strip() or None

    if not nome or not ref_email or not ref_nome or not ref_cognome:
        return {"error": "Tutti i campi obbligatori devono essere compilati"}
    _EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
    if not _EMAIL_RE.match(ref_email):
        return {"error": "Formato email non valido"}

    societa_id = None
    user_id    = None

    service_headers = {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
    }

    try:
        async with httpx.AsyncClient() as client:

            # ── Step 1: slug univoco ──────────────────────────────────────────────
            try:
                slug = await get_unique_slug(client, to_slug(nome))
            except ValueError:
                return {"error": "Errore generazione identificativo società"}

            # ── Step 2: crea società ──────────────────────────────────────────────
            soc_resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/societa",
                json={
                    "nome":        nome,
                    "slug":        slug,
                    "piano":       "free",
                    "stato":       "attiva",
                    "ref_nome":    ref_nome,
                    "ref_cognome": ref_cognome,
                    "ref_email":   ref_email,
                    "ref_citta":   ref_citta,
                },
                headers={**service_headers, "Prefer": "return=representation"},
                timeout=15,
            )
            if soc_resp.status_code not in (200, 201):
                print(f"[register-society] ERRORE società — status={soc_resp.status_code} body={soc_resp.text}")
                if soc_resp.status_code == 409:
                    return {"error": "Una società con questo nome è già registrata su EVO. Prova con un nome leggermente diverso (es. 'Paese Basket ASD')."}
                return {"error": "Errore creazione società nel database"}

            soc_data   = soc_resp.json()
            societa_id = (soc_data[0] if isinstance(soc_data, list) else soc_data)["id"]

            # ── Step 3: genera link invito senza SMTP Supabase (mandiamo noi l'email) ─
            link_resp = await client.post(
                f"{SUPABASE_URL}/auth/v1/admin/generate_link",
                json={
                    "type":  "invite",
                    "email": ref_email,
                    "data":  {"nome": ref_nome, "cognome": ref_cognome},
                },
                headers=service_headers,
                timeout=15,
            )
            if link_resp.status_code not in (200, 201):
                print(f"[register-society] ERRORE generate_link — status={link_resp.status_code} body={link_resp.text}")
                # Rollback società
                del_soc = await client.delete(
                    f"{SUPABASE_URL}/rest/v1/societa",
                    params={"id": f"eq.{societa_id}"},
                    headers=service_headers,
                    timeout=10,
                )
                if del_soc.status_code not in (200, 204):
                    print(f"[register-society] WARN: rollback società {societa_id} fallito: {del_soc.status_code}")
                link_body = link_resp.json() if link_resp.content else {}
                err_msg = (link_body.get("msg", "") or link_body.get("message", "")).lower()
                if "already" in err_msg:
                    return {"error": "Questa email è già registrata su EVO"}
                return {"error": "Errore creazione account utente. Riprova."}

            link_data   = link_resp.json()
            user_id     = link_data.get("id")
            action_link = (
                link_data.get("action_link")
                or link_data.get("properties", {}).get("action_link", "")
            )
            print(f"[register-society] Utente creato: {user_id} — link generato: {'sì' if action_link else 'NO'}")

            # ── Step 4: crea profilo ──────────────────────────────────────────────
            prof_resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/profiles",
                json={
                    "id":         user_id,
                    "nome":       ref_nome,
                    "cognome":    ref_cognome,
                    "email":      ref_email,
                    "ruolo":      "admin",
                    "societa_id": str(societa_id),
                },
                headers={**service_headers, "Prefer": "return=representation"},
                timeout=15,
            )
            if prof_resp.status_code not in (200, 201):
                print(f"[register-society] ERRORE profilo — status={prof_resp.status_code} body={prof_resp.text}")
                # Rollback: elimina utente e società
                del_user = await client.delete(
                    f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                    headers=service_headers,
                    timeout=10,
                )
                if del_user.status_code not in (200, 204):
                    print(f"[register-society] WARN: rollback utente {user_id} fallito: {del_user.status_code}")
                del_soc2 = await client.delete(
                    f"{SUPABASE_URL}/rest/v1/societa",
                    params={"id": f"eq.{societa_id}"},
                    headers=service_headers,
                    timeout=10,
                )
                if del_soc2.status_code not in (200, 204):
                    print(f"[register-society] WARN: rollback società {societa_id} fallito: {del_soc2.status_code}")
                return {"error": "Errore creazione profilo utente"}

            # ── Step 5: invia email via Resend (invito utente + notifica admin) ───
            resend_key = os.getenv("RESEND_API_KEY", "")
            if resend_key:
                try:
                    import resend as resend_lib
                    resend_lib.api_key = resend_key

                    # 5a — email di benvenuto al referente con il link per impostare la password
                    if action_link:
                        resend_lib.Emails.send({
                            "from":    "EVO <onboarding@resend.dev>",
                            "to":      [ref_email],
                            "subject": "Benvenuto su EVO — imposta la tua password",
                            "html":    f"""
                                <div style="font-family:sans-serif;max-width:520px;margin:auto">
                                  <h2 style="color:#f97316">Ciao {ref_nome}! 🏀</h2>
                                  <p>La tua società <b>{nome}</b> è stata registrata su <b>EVO</b>.</p>
                                  <p>Clicca il pulsante qui sotto per impostare la password e accedere:</p>
                                  <p style="margin:28px 0">
                                    <a href="{action_link}"
                                       style="background:#f97316;color:white;padding:14px 28px;
                                              border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">
                                      Imposta la tua password
                                    </a>
                                  </p>
                                  <p style="color:#888;font-size:12px">
                                    Il link è valido per 24 ore.<br>
                                    Se non hai richiesto questa registrazione, ignora questa email.
                                  </p>
                                </div>
                            """,
                        })
                        print(f"[register-society] Email invito inviata a {ref_email}")
                    else:
                        print(f"[register-society] WARN: action_link vuoto, email invito non inviata")

                    # 5b — notifica al super_admin
                    resend_lib.Emails.send({
                        "from":    "EVO <onboarding@resend.dev>",
                        "to":      ["enricovanin27@gmail.com"],
                        "subject": f"[EVO] Nuova registrazione: {nome}",
                        "html":    f"""
                            <h2>Nuova società registrata su EVO 🏀</h2>
                            <table>
                              <tr><td><b>Società</b></td><td>{nome}</td></tr>
                              <tr><td><b>Referente</b></td><td>{ref_nome} {ref_cognome}</td></tr>
                              <tr><td><b>Email</b></td><td>{ref_email}</td></tr>
                              <tr><td><b>Città</b></td><td>{ref_citta or 'N/D'}</td></tr>
                              <tr><td><b>Data</b></td><td>{datetime.now().strftime('%d/%m/%Y %H:%M')}</td></tr>
                            </table>
                        """,
                    })
                except Exception as mail_err:
                    print(f"[register-society] Email Resend non inviata: {mail_err}")
            else:
                print(f"[register-society] WARN: RESEND_API_KEY non configurata, email non inviata")

        return {"ok": True}

    except Exception as e:
        print(f"[register-society] ECCEZIONE NON GESTITA: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return {"error": "Errore interno del server. Riprova tra qualche istante."}
