# Lead Capture + AI Follow-up via WhatsApp

**Data:** 2026-06-27  
**Stato:** Approvato — pronto per implementazione  

---

## Obiettivo

Permettere a un potenziale cliente di richiedere una demo di EVO dalla landing page, ricevere immediatamente un'email di conferma, e ricevere un messaggio WhatsApp personalizzato (generato da Claude AI) inviato dal fondatore con un solo click.

---

## Flusso completo

```
Visitatore compila form sulla landing page
    │
    ▼
POST → Supabase Edge Function "handle-lead"
    │
    ├─ 1. INSERT in tabella `leads` (status = 'new')
    ├─ 2. Resend API → email di ringraziamento al lead
    ├─ 3. Claude Haiku API → genera messaggio WhatsApp personalizzato
    └─ 4. Resend API → email di notifica al fondatore con:
              • dati lead
              • messaggio WhatsApp generato (copiabile)
              • bottone "📲 Invia su WhatsApp" (wa.me link precompilato)
```

---

## Componenti

### 1. Form — `LandingPage.jsx` (sezione `#contatti`)

Sostituisce il solo link email attuale. Campi:

| Campo | Tipo | Validazione |
|---|---|---|
| Nome e cognome | text | obbligatorio |
| Società | text | obbligatorio |
| Email | email | obbligatorio, formato email |
| Telefono | tel | obbligatorio, usato per wa.me |

**Comportamento:**
- Submit button disabilitato finché tutti i campi sono validi
- Al submit: spinner + "Invio in corso..."
- Successo: "✓ Richiesta inviata! Ti contatteremo presto su WhatsApp."
- Errore: messaggio di errore inline, form rimane compilato

**Chiamata:** `POST https://{project}.supabase.co/functions/v1/handle-lead`  
Body JSON: `{ nome, societa, email, telefono }`  
Headers: `Authorization: Bearer {SUPABASE_ANON_KEY}`

---

### 2. Tabella Supabase — `leads`

```sql
CREATE TABLE leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  nome        TEXT NOT NULL,
  societa     TEXT NOT NULL,
  email       TEXT NOT NULL,
  telefono    TEXT NOT NULL,
  status      TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted'))
);

-- RLS: solo service_role può leggere/scrivere
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
-- nessuna policy pubblica: l'Edge Function usa service_role
```

---

### 3. Edge Function — `supabase/functions/handle-lead/index.ts`

**Runtime:** Deno (standard Supabase Edge Function)  
**Secret env vars:**
- `RESEND_API_KEY` — chiave API Resend
- `ANTHROPIC_API_KEY` — chiave API Claude
- `OWNER_EMAIL` — `enricovanin27@gmail.com`
- `SUPABASE_SERVICE_ROLE_KEY` — per INSERT con bypass RLS

**Logica:**

```
1. Parse body → { nome, societa, email, telefono }
2. Validazione campi (tutti presenti, email valida)
3. Supabase client (service_role) → INSERT in leads
4. Resend → email ringraziamento al lead
5. Anthropic → genera messaggio WhatsApp (max 120 parole)
6. Costruisce wa.me link: https://wa.me/39{telefono_pulito}?text={encoded}
7. Resend → email notifica al fondatore (HTML con dati + messaggio + bottone)
8. Return { success: true }
```

**Gestione errori:** se qualsiasi step fallisce dopo l'INSERT, logga l'errore ma restituisce 200 al form (il lead è salvato). Gli step email/AI sono best-effort.

---

### 4. Prompt Claude (Haiku)

```
Sei un assistente commerciale per EVO, un'app gestionale per società 
di basket italiane. Scrivi un messaggio WhatsApp breve (max 120 parole), 
cordiale e professionale per contattare un potenziale cliente che ha 
richiesto una demo.

Lead: {nome}, società "{societa}"

Il messaggio deve:
- Iniziare con "Ciao {nome}! 👋"
- Presentarti come il team di EVO
- Dire che hai visto la richiesta di demo
- Chiedere se ha avuto modo di esplorare l'app
- Chiedere se ha domande o vuole una chiamata rapida
- Finire con tono amichevole, non commerciale
- Non usare emoji eccessive (max 2-3)

Rispondi SOLO con il testo del messaggio, senza prefissi o spiegazioni.
```

**Modello:** `claude-haiku-4-5-20251001` (veloce, economico, ~€0.001/chiamata)

---

### 5. Email ringraziamento al lead

**From:** `EVO <noreply@evo-basket.it>` (dominio da configurare su Resend)  
**Subject:** `Grazie {nome}, abbiamo ricevuto la tua richiesta 🏀`  
**Corpo:** testo semplice + HTML

```
Ciao {nome}!

Grazie per aver richiesto una demo di EVO per {societa}.

Abbiamo ricevuto la tua richiesta e ti contatteremo 
a breve su WhatsApp per rispondere a tutte le tue domande.

Nel frattempo puoi già esplorare l'app con il tuo account.

A presto,
Il team EVO 🏀
```

---

### 6. Email notifica al fondatore

**From:** `EVO Leads <noreply@evo-basket.it>`  
**To:** `enricovanin27@gmail.com`  
**Subject:** `🏀 Nuovo lead: {nome} — {societa}`  
**Corpo HTML:**

- Header arancione con "Nuovo lead EVO"
- Card dati: nome, società, email, telefono, data/ora
- Box grigio con messaggio WhatsApp generato da Claude (font monospace, selezionabile)
- Bottone verde "📲 Invia su WhatsApp →" → `https://wa.me/39{tel}?text={encoded}`
- Footer: "Lead #N · {data}"

---

## Servizi esterni da configurare

| Servizio | Uso | Piano | Setup |
|---|---|---|---|
| **Resend** | Invio email | Free (3.000/mese) | Registrazione + API key + dominio |
| **Anthropic API** | Genera messaggio WhatsApp | Pay-per-use (~€0.001/lead) | API key da console.anthropic.com |

---

## Cosa NON è incluso in questo scope

- Dashboard leads nell'app (possibile fase 2)
- Tracking automatico status "contacted" (manuale per ora)
- Conversazione AI bidirezionale WhatsApp (richiede WhatsApp Business API — fase 3)
- Rate limiting / anti-spam sul form (assumiamo volume basso)

---

## File da creare/modificare

| File | Azione |
|---|---|
| `frontend/src/pages/LandingPage.jsx` | Modifica sezione contatti |
| `supabase/functions/handle-lead/index.ts` | Crea Edge Function |
| `supabase/migrations/20260627_leads.sql` | Crea tabella leads |
| `.env.example` | Aggiungi RESEND_API_KEY, ANTHROPIC_API_KEY |

---

## Note implementative

- Il numero di telefono va normalizzato: rimuovere spazi, trattini, prefisso `+39` se già presente, e ricostruire `39XXXXXXXXXX` per wa.me
- L'Edge Function deve avere CORS abilitato per le chiamate dal frontend
- Usare `fetch` nativo Deno per chiamare Resend e Anthropic (no npm packages)
