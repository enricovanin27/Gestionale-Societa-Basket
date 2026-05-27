# Design: Registrazione Self-Service Nuova Società

*Data: 27 maggio 2026*

---

## Obiettivo

Permettere a una nuova società sportiva di registrarsi e accedere all'app EVO in autonomia, senza intervento manuale del super_admin. Il flusso deve essere completamente automatico: dal form di registrazione all'email con link per impostare la password.

## Contesto

Attualmente `RegistrazionePage.jsx` chiama `supabase.from('societa').insert(...)` direttamente dal frontend senza autenticazione. La RLS di Supabase blocca questa operazione → il form fallisce silenziosamente. Il backend FastAPI ha già `SUPABASE_SERVICE_ROLE_KEY` configurato e un pattern identico (`/api/admin/create-user`, `/api/admin/delete-user`).

---

## Architettura

```
[RegistrazionePage.jsx]
        |
        | POST /api/register-society
        v
[backend/api.py]
        |
        |── 1. Crea società       → POST /rest/v1/societa           (service role)
        |── 2. Invita utente      → POST /auth/v1/invite            (service role)
        |── 3. Crea profilo       → POST /rest/v1/profiles          (service role)
        |── 4. Notifica super_admin → Resend API                    (RESEND_API_KEY)
        v
[Supabase manda email "Imposta password" all'admin della nuova società]
        |
        v
[Admin clicca link → app riceve #type=invite → mostra NuovaPasswordPage]
        |
        v
[Admin imposta password → accede come admin della sua società]
```

---

## Backend: `POST /api/register-society`

### Request body
```json
{
  "nome":        "Oderzo Basket",
  "ref_nome":    "Mario",
  "ref_cognome": "Rossi",
  "ref_email":   "mario@oderzo.it",
  "ref_citta":   "Oderzo"
}
```

### Response
```json
{ "ok": true }
// oppure
{ "error": "Questa email è già registrata" }
```

### Flusso interno (5 step con rollback)

**Step 1 – Validazione**
- `nome` e `ref_email` non vuoti, email formato valido
- Genera `slug` dal nome (funzione `to_slug`: lowercase, rimuovi accenti, spazi → trattini)
- Se slug già esiste in `societa`, appendi `-2`, `-3`, ecc.

**Step 2 – Crea società**
- `POST {SUPABASE_URL}/rest/v1/societa` con service role
- Campi: `nome`, `slug`, `piano: 'free'`, `stato: 'attiva'`, `ref_nome`, `ref_cognome`, `ref_email`, `ref_citta`
- Salva `societa_id` dalla risposta

**Step 3 – Invita utente admin**
- `POST {SUPABASE_URL}/auth/v1/invite` con service role
- Body: `{ "email": ref_email, "data": { "nome": ref_nome, "cognome": ref_cognome } }`
- Supabase manda automaticamente l'email "Accetta l'invito" con link per impostare la password
- Salva `user_id` dalla risposta

**Step 4 – Crea profilo**
- `POST {SUPABASE_URL}/rest/v1/profiles` con service role
- Campi: `id: user_id`, `nome: ref_nome`, `cognome: ref_cognome`, `email: ref_email`, `ruolo: 'admin'`, `societa_id`

**Step 5 – Notifica super_admin (opzionale)**
- Se `RESEND_API_KEY` è configurato: manda email a `enricovanin27@gmail.com` con: nome società, città, email referente, data/ora registrazione
- Se non configurato: skip silenzioso (logga solo a console)

### Rollback
- Se step 3 o 4 fallisce dopo che la società è stata creata (step 2): DELETE sulla società appena creata, restituisci errore
- Se step 4 (profilo) fallisce dopo invito: tenta DELETE utente via `/auth/v1/admin/users/{user_id}` + DELETE società, poi errore

### Dipendenza Python
```
pip install resend  # solo se si usa la notifica email
```
Aggiungere a `requirements.txt`.

---

## Frontend: `RegistrazionePage.jsx`

### Cosa cambia
- Rimuovere import `supabase`
- Aggiungere import `API_BASE` da `../lib/constants`
- `handleSubmit`: sostituire la chiamata Supabase con `fetch(API_BASE + '/api/register-society', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(form) })`
- La funzione `toSlug` nel frontend può essere rimossa (lo slug è generato dal backend)
- Gestire risposta: `{ ok: true }` → `setDone(true)`, `{ error: "..." }` → `setError(...)`

### Testo success state (cambia)
- **Prima**: "Il nostro team attiverà il tuo account entro 24 ore."
- **Dopo**: "Controlla la tua email: riceverai un link per impostare la password e accedere."

### Testo nella landing page (cambia)
- `SectionRegistrazione`: rimuovere la riga "Attivazione entro 24h" dal footer del card
- Aggiungere: "Accesso immediato · Controlla l'email"

### Cosa NON cambia
- Form fields (nome, ref_nome, ref_cognome, ref_email, ref_citta)
- Look & feel (gradiente, stile EVO)
- Routing (`/registrati` già presente in `App.jsx`)

---

## Auth: gestione link di invito

### Problema
Quando l'utente clicca il link Supabase, la URL contiene `#type=invite`. L'utente è loggato ma non ha ancora una password. Se si disconnette non può rientrare.

### Soluzione: riuso di `NuovaPasswordPage`
In `useAuth.jsx`, nel blocco `useEffect` di `getSession()` (riga 54), aggiungere dopo `setLoading(false)`:

```js
// Detect invite link (es. /registrati#access_token=...&type=invite)
const hash = new URLSearchParams(window.location.hash.substring(1))
if (hash.get('type') === 'invite') {
  setIsPasswordRecovery(true)
}
```

Questo riusa il componente `NuovaPasswordPage` già esistente in `App.jsx`. Zero nuovi componenti.

---

## Variabili d'ambiente necessarie

Già esistenti (nessuna aggiunta obbligatoria):
- `SUPABASE_URL` — già presente
- `SUPABASE_SERVICE_ROLE_KEY` — già presente
- `VITE_API_URL` — già presente (frontend)

Nuova (opzionale):
- `RESEND_API_KEY` — solo se si vuole la notifica email al super_admin

---

## File modificati

| File | Tipo modifica |
|------|--------------|
| `backend/api.py` | Aggiunta endpoint `POST /api/register-society` |
| `backend/requirements.txt` | Aggiunta `resend` (opzionale) |
| `frontend/src/pages/RegistrazionePage.jsx` | Chiama backend invece di Supabase diretto |
| `frontend/src/hooks/useAuth.jsx` | Detect `type=invite` hash → `setIsPasswordRecovery(true)` |
| `frontend/src/pages/LandingPage.jsx` | Aggiorna testo `SectionRegistrazione` |

---

## Cosa NON è in scope

- Pagina di gestione del piano/abbonamento
- Email personalizzata Supabase (si usa il template di default)
- Onboarding guidato post-registrazione (wizard squadre, ecc.)
- Validazione unicità email lato frontend (lo fa il backend)

---

## Criteri di successo

1. Un utente può compilare il form su `/registrati` e ricevere l'email Supabase entro 1 minuto
2. Cliccando il link nell'email, vede la schermata "Imposta nuova password"
3. Dopo aver impostato la password, accede come admin della sua società
4. Nessun intervento del super_admin richiesto
5. Se l'email è già registrata, il form mostra un messaggio di errore chiaro
