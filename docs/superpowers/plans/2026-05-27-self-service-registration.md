# Self-Service Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere a una nuova società di registrarsi su EVO in autonomia: dal form alla email Supabase con link "Imposta password", senza intervento manuale del super_admin.

**Architecture:** Nuovo endpoint FastAPI `POST /api/register-society` che usa il `SUPABASE_SERVICE_ROLE_KEY` già configurato per creare società, invitare l'utente admin via Supabase invite API, e creare il profilo. Il frontend chiama il backend invece di Supabase direttamente. `useAuth.jsx` rileva `#type=invite` nell'URL e mostra la schermata "Imposta password" già esistente.

**Tech Stack:** Python 3 / FastAPI / httpx / pytest · React / Vite / TailwindCSS · Supabase Auth invite API

---

## File Map

| File | Tipo | Responsabilità |
|------|------|----------------|
| `backend/api.py` | Modifica | Aggiunge `to_slug`, `get_unique_slug`, `register_society` endpoint |
| `backend/requirements.txt` | Modifica | Aggiunge `pytest>=8.0.0`, `pytest-asyncio>=0.23.0`, `resend>=2.0.0` |
| `backend/tests/__init__.py` | Crea | Package marker (file vuoto) |
| `backend/tests/test_register_society.py` | Crea | Test per `to_slug` e `get_unique_slug` |
| `frontend/src/pages/RegistrazionePage.jsx` | Modifica | Chiama backend; rimuove `toSlug` e import `supabase` |
| `frontend/src/hooks/useAuth.jsx` | Modifica | Rileva `#type=invite` → `setIsPasswordRecovery(true)` |
| `frontend/src/pages/LandingPage.jsx` | Modifica | Aggiorna testo sezione registrazione |

---

## Task 1: Setup pytest + helper functions con TDD

**Files:**
- Crea: `backend/tests/__init__.py`
- Crea: `backend/tests/test_register_society.py`
- Modifica: `backend/requirements.txt`
- Modifica: `backend/api.py`

- [ ] **Step 1.1: Aggiungi dipendenze test a requirements.txt**

Apri `backend/requirements.txt` e sostituisci l'intero contenuto con:

```
pandas>=2.0.0
pdfplumber>=0.11.0
fastapi>=0.111.0
uvicorn>=0.29.0
python-multipart>=0.0.9
pywebpush>=2.0.0
httpx>=0.27.0
resend>=2.0.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
```

- [ ] **Step 1.2: Installa le nuove dipendenze**

Esegui nella cartella `backend/`:
```bash
pip install resend pytest pytest-asyncio
```

Output atteso: `Successfully installed resend-... pytest-... pytest-asyncio-...`

- [ ] **Step 1.3: Crea il package di test**

Crea `backend/tests/__init__.py` — file completamente vuoto.

- [ ] **Step 1.4: Scrivi i test PRIMA di implementare**

Crea `backend/tests/test_register_society.py` con questo contenuto:

```python
"""Test per le funzioni helper di register_society."""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api import to_slug


class TestToSlug:
    def test_basic(self):
        assert to_slug("Oderzo Basket") == "oderzo-basket"

    def test_accenti(self):
        assert to_slug("Società Sportiva") == "societa-sportiva"

    def test_spazi_multipli(self):
        assert to_slug("  Basket   Club  ") == "basket-club"

    def test_caratteri_speciali(self):
        assert to_slug("ASD Basket & Co.") == "asd-basket--co"

    def test_gia_slug(self):
        assert to_slug("oderzo-basket") == "oderzo-basket"

    def test_numeri(self):
        assert to_slug("Basket 2026") == "basket-2026"

    def test_uppercase(self):
        assert to_slug("TREVISO BASKET") == "treviso-basket"
```

- [ ] **Step 1.5: Esegui i test — devono fallire**

Nella cartella `backend/`:
```bash
pytest tests/test_register_society.py -v
```

Output atteso: `ImportError` o `AttributeError: module 'api' has no attribute 'to_slug'`  
Questo conferma che i test sono scritti correttamente e non passano ancora.

- [ ] **Step 1.6: Implementa `to_slug` in `api.py`**

Apri `backend/api.py`. Dopo le import esistenti (riga ~12, dopo `import httpx`), aggiungi:

```python
import re
import unicodedata
from datetime import datetime
```

Poi, dopo la riga `VAPID_SUBJECT = ...` (riga ~19) e prima di `app = FastAPI(...)`, aggiungi:

```python
def to_slug(nome: str) -> str:
    """Converte nome società in slug URL-safe (es. 'Oderzo Basket' → 'oderzo-basket')."""
    nome = unicodedata.normalize('NFD', nome.lower())
    nome = ''.join(c for c in nome if unicodedata.category(c) != 'Mn')
    nome = re.sub(r'[^a-z0-9\s-]', '', nome)
    nome = nome.strip()
    nome = re.sub(r'\s+', '-', nome)
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
```

- [ ] **Step 1.7: Esegui i test — devono passare**

```bash
pytest tests/test_register_society.py -v
```

Output atteso:
```
test_register_society.py::TestToSlug::test_basic PASSED
test_register_society.py::TestToSlug::test_accenti PASSED
test_register_society.py::TestToSlug::test_spazi_multipli PASSED
test_register_society.py::TestToSlug::test_caratteri_speciali PASSED
test_register_society.py::TestToSlug::test_gia_slug PASSED
test_register_society.py::TestToSlug::test_numeri PASSED
test_register_society.py::TestToSlug::test_uppercase PASSED
7 passed in ...s
```

- [ ] **Step 1.8: Commit**

```bash
git add backend/requirements.txt backend/tests/__init__.py backend/tests/test_register_society.py backend/api.py
git commit -m "feat: add to_slug helper and test setup for register-society"
```

---

## Task 2: Endpoint `POST /api/register-society`

**Files:**
- Modifica: `backend/api.py`

- [ ] **Step 2.1: Aggiungi l'endpoint in `api.py`**

Alla fine di `backend/api.py`, prima dell'endpoint `@app.post("/api/fip/estrai")` o in fondo al file, aggiungi:

```python
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
    if "@" not in ref_email or "." not in ref_email.split("@")[-1]:
        return {"error": "Formato email non valido"}

    societa_id = None
    user_id    = None

    service_headers = {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
    }

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
            return {"error": "Errore creazione società nel database"}

        soc_data   = soc_resp.json()
        societa_id = (soc_data[0] if isinstance(soc_data, list) else soc_data)["id"]

        # ── Step 3: invita utente admin (Supabase manda email automaticamente) ─
        inv_resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/invite",
            json={
                "email": ref_email,
                "data":  {"nome": ref_nome, "cognome": ref_cognome},
            },
            headers=service_headers,
            timeout=15,
        )
        if inv_resp.status_code not in (200, 201):
            # Rollback società
            await client.delete(
                f"{SUPABASE_URL}/rest/v1/societa",
                params={"id": f"eq.{societa_id}"},
                headers=service_headers,
                timeout=10,
            )
            err_msg = (inv_resp.json().get("msg", "") or inv_resp.json().get("message", "")).lower()
            if "already" in err_msg:
                return {"error": "Questa email è già registrata su EVO"}
            return {"error": "Errore creazione account utente. Riprova."}

        user_id = inv_resp.json().get("id")

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
            # Rollback: elimina utente e società
            await client.delete(
                f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers=service_headers,
                timeout=10,
            )
            await client.delete(
                f"{SUPABASE_URL}/rest/v1/societa",
                params={"id": f"eq.{societa_id}"},
                headers=service_headers,
                timeout=10,
            )
            return {"error": "Errore creazione profilo utente"}

        # ── Step 5: notifica super_admin (opzionale) ──────────────────────────
        resend_key = os.getenv("RESEND_API_KEY", "")
        if resend_key:
            try:
                import resend as resend_lib
                resend_lib.api_key = resend_key
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
            except Exception as e:
                print(f"[register-society] Notifica email non inviata: {e}")

    return {"ok": True}
```

- [ ] **Step 2.2: Riavvia il backend e verifica health**

Nella cartella `backend/`:
```bash
uvicorn api:app --reload --port 8000
```

In un altro terminale:
```bash
curl http://localhost:8000/api/health
```

Output atteso: `{"status":"ok"}`

- [ ] **Step 2.3: Testa il nuovo endpoint manualmente con curl**

Con il backend avviato, esegui (sostituisci con una email reale che puoi controllare):

```bash
curl -s -X POST http://localhost:8000/api/register-society \
  -H "Content-Type: application/json" \
  -d '{"nome":"Test Basket","ref_nome":"Mario","ref_cognome":"Rossi","ref_email":"LA_TUA_EMAIL@test.com","ref_citta":"Treviso"}' | python -m json.tool
```

Output atteso (successo): `{"ok": true}`  
Output atteso (email già usata): `{"error": "Questa email è già registrata su EVO"}`  
Output atteso (campi mancanti): `{"error": "Tutti i campi obbligatori devono essere compilati"}`

Verifica su Supabase Dashboard → Authentication → Users: deve comparire il nuovo utente con stato "Invited".  
Verifica su Supabase Dashboard → Table Editor → `societa`: deve comparire la nuova riga.  
Verifica su Supabase Dashboard → Table Editor → `profiles`: deve comparire la riga con `ruolo: admin`.

- [ ] **Step 2.4: Commit**

```bash
git add backend/api.py
git commit -m "feat: POST /api/register-society - self-service society onboarding"
```

---

## Task 3: Frontend — Aggiorna `RegistrazionePage.jsx`

**Files:**
- Modifica: `frontend/src/pages/RegistrazionePage.jsx`

- [ ] **Step 3.1: Sostituisci l'intero file**

Apri `frontend/src/pages/RegistrazionePage.jsx` e sostituisci completamente con:

```jsx
// frontend/src/pages/RegistrazionePage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../lib/constants'

const GRADIENT = { background: 'linear-gradient(160deg, #c2410c 0%, #d97706 50%, #f59e0b 100%)' }

const inp = 'w-full bg-white border-[1.5px] border-amber-200 rounded-xl px-3.5 py-3 text-sm ' +
  'text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500'

export default function RegistrazionePage() {
  const navigate  = useNavigate()
  const [form, setForm] = useState({
    nome: '', ref_nome: '', ref_cognome: '', ref_email: '', ref_citta: '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [done,    setDone]    = useState(false)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/register-society`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          nome:        form.nome.trim(),
          ref_nome:    form.ref_nome.trim(),
          ref_cognome: form.ref_cognome.trim(),
          ref_email:   form.ref_email.trim().toLowerCase(),
          ref_citta:   form.ref_citta.trim() || null,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setDone(true)
    } catch {
      setError('Impossibile contattare il server. Controlla la connessione e riprova.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={GRADIENT}>
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-black text-stone-900 mb-3">Registrazione completata!</h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-6">
            Controlla la tua email: riceverai un link per impostare la password e accedere subito.
            <br /><br />
            <span className="text-xs text-stone-400">
              Non trovi l'email? Controlla la cartella spam.
            </span>
          </p>
          <button onClick={() => navigate('/')}
            className="w-full py-3.5 text-white rounded-xl font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
            Torna alla home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={GRADIENT}>
      {/* Navbar minimale */}
      <nav className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg">🏀</div>
          <span className="font-black text-xl text-white tracking-tight">EVO</span>
        </button>
        <button onClick={() => navigate('/')} className="text-white/70 text-sm font-medium">
          ← Torna alla home
        </button>
      </nav>

      <div className="px-6 pb-12">
        <h1 className="text-2xl font-black text-white mb-1">Registra la tua società</h1>
        <p className="text-sm text-white/75 mb-6">
          Compila il modulo e ricevi subito le credenziali per accedere.
        </p>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Nome società *</label>
              <input value={form.nome} onChange={e => setF('nome', e.target.value)}
                className={inp} placeholder="es. Oderzo Basket" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Nome *</label>
                <input value={form.ref_nome} onChange={e => setF('ref_nome', e.target.value)}
                  className={inp} placeholder="Mario" required />
              </div>
              <div>
                <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Cognome *</label>
                <input value={form.ref_cognome} onChange={e => setF('ref_cognome', e.target.value)}
                  className={inp} placeholder="Rossi" required />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Email *</label>
              <input type="email" value={form.ref_email} onChange={e => setF('ref_email', e.target.value)}
                className={inp} placeholder="mario.rossi@societa.it" required />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Città</label>
              <input value={form.ref_citta} onChange={e => setF('ref_citta', e.target.value)}
                className={inp} placeholder="es. Oderzo (facoltativo)" />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-4 text-white rounded-xl text-[15px] font-extrabold shadow-md
                disabled:opacity-60 active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
              {loading ? 'Creazione account...' : 'Registra la tua società →'}
            </button>
            <p className="text-center text-[11px] text-stone-400">
              Accesso immediato · Controlla email · Nessuna carta di credito
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3.2: Verifica nel browser**

Avvia il frontend (se non è già avviato):
```bash
cd frontend && npm run dev
```

Vai su `http://localhost:5173/registrati`.

- Verifica che il form si carichi correttamente
- Prova a inviare con campi vuoti → deve bloccare per `required` HTML5
- Prova a inviare con dati validi → deve mostrare la schermata di successo con testo aggiornato
- Prova con una email già registrata → deve mostrare il messaggio di errore rosso

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/pages/RegistrazionePage.jsx
git commit -m "feat: RegistrazionePage calls backend instead of direct Supabase insert"
```

---

## Task 4: Frontend — Rileva link invito in `useAuth.jsx`

**Files:**
- Modifica: `frontend/src/hooks/useAuth.jsx`

- [ ] **Step 4.1: Aggiungi il rilevamento `type=invite`**

Apri `frontend/src/hooks/useAuth.jsx`. Trova il blocco `useEffect` che chiama `supabase.auth.getSession()` (attualmente riga ~54):

```js
useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    setUser(session?.user ?? null)
    if (session?.user) {
      const p = await fetchProfile(session.user.id)
      setProfile(p)
    }
    setLoading(false)
  })
}, [])
```

Sostituiscilo con:

```js
useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    setUser(session?.user ?? null)
    if (session?.user) {
      const p = await fetchProfile(session.user.id)
      setProfile(p)
    }
    // Se l'utente ha cliccato un link di invito Supabase, mostra la schermata
    // "Imposta password" (riusa NuovaPasswordPage già esistente in App.jsx)
    const hash = new URLSearchParams(window.location.hash.substring(1))
    if (hash.get('type') === 'invite') {
      setIsPasswordRecovery(true)
    }
    setLoading(false)
  })
}, [])
```

- [ ] **Step 4.2: Commit**

```bash
git add frontend/src/hooks/useAuth.jsx
git commit -m "feat: detect type=invite in URL hash to show password setup screen"
```

---

## Task 5: Frontend — Aggiorna testo `LandingPage.jsx`

**Files:**
- Modifica: `frontend/src/pages/LandingPage.jsx`

- [ ] **Step 5.1: Aggiorna testo in `SectionRegistrazione`**

Apri `frontend/src/pages/LandingPage.jsx`. Trova la riga con il testo del footer del card di registrazione (riga ~290):

```jsx
<p className="text-center mt-3 text-[11px] text-white/50">
  Attivazione entro 24h · Supporto incluso · Dati sicuri
</p>
```

Sostituisci con:

```jsx
<p className="text-center mt-3 text-[11px] text-white/50">
  Accesso immediato · Controlla email · Dati sicuri
</p>
```

- [ ] **Step 5.2: Aggiorna la descrizione nella stessa sezione**

Trova la riga (riga ~284):
```jsx
<p className="text-[13px] text-white/75 leading-snug mb-5">
  Compila il modulo, il nostro team configura la tua società entro 24 ore.
  Nessuna carta di credito richiesta.
</p>
```

Sostituisci con:

```jsx
<p className="text-[13px] text-white/75 leading-snug mb-5">
  Compila il modulo e ricevi subito un'email per impostare la password.
  Nessuna carta di credito richiesta.
</p>
```

- [ ] **Step 5.3: Commit**

```bash
git add frontend/src/pages/LandingPage.jsx
git commit -m "feat: update landing page text for instant registration"
```

---

## Task 6: Verifica end-to-end

- [ ] **Step 6.1: Avvia backend e frontend**

Terminale 1 (backend):
```bash
cd backend && uvicorn api:app --reload --port 8000
```

Terminale 2 (frontend):
```bash
cd frontend && npm run dev
```

- [ ] **Step 6.2: Test flusso completo**

1. Vai su `http://localhost:5173/` → clicca "Registra la tua società"
2. Compila il form con una **email reale** che puoi controllare
3. Clicca "Registra la tua società →"
4. Verifica: schermata success con testo "Controlla la tua email"
5. Controlla la casella email → deve arrivare email da Supabase con oggetto "You have been invited"
6. Clicca il link nell'email
7. Verifica: app si apre sulla schermata "Imposta nuova password" (NuovaPasswordPage)
8. Imposta una password
9. Verifica: redirect alla home → login come admin della società appena creata

- [ ] **Step 6.3: Test errore email duplicata**

1. Torna su `/registrati`
2. Usa la stessa email del test precedente
3. Verifica: messaggio rosso "Questa email è già registrata su EVO"

- [ ] **Step 6.4: Verifica Supabase Dashboard**

- Authentication → Users: utente con email registrata, stato "Active"
- Table Editor → `societa`: riga con `stato: 'attiva'`
- Table Editor → `profiles`: riga con `ruolo: 'admin'`, `societa_id` corretto

- [ ] **Step 6.5: Commit finale**

```bash
git add .
git commit -m "feat: self-service society registration - complete flow working"
```

---

## Note operative

### Variabili d'ambiente necessarie

Il backend deve avere queste env var già configurate (dovrebbero esserlo):
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Per la notifica email (opzionale — skippa se non vuoi ora):
```
RESEND_API_KEY=re_xxxx
```
Crea account su [resend.com](https://resend.com) → API Keys → Create key. Gratis fino a 3.000 email/mese. La prima email di test va a `onboarding@resend.dev`, accettata solo da Resend verso l'email dell'account owner.

### Nota sull'URL dell'email invite Supabase

Il link nell'email di invito Supabase redirige a `SITE_URL` configurato nel progetto Supabase (Settings → Authentication → Site URL). In sviluppo locale deve essere `http://localhost:5173`. In produzione deve essere l'URL dell'app deployata. Verifica questa impostazione se il link non funziona.

### Se `profiles` dà errore 409 (duplicate key)

Il profilo esiste già (da test precedenti). Vai su Supabase Dashboard → Table Editor → `profiles`, cancella la riga con quell'email, poi ritesta.
