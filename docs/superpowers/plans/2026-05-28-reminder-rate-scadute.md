# Reminder Automatici Rate Scadute — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inviare automaticamente un'email di promemoria/sollecito ai genitori per le rate non pagate, raggruppando tutte le rate per genitore in una sola email giornaliera.

**Architecture:** Supabase Edge Function (`send-reminders`) in TypeScript/Deno invocata ogni giorno alle 08:00 UTC da pg_cron via `net.http_post`. La funzione interroga `quote JOIN giocatori JOIN societa`, filtra per le finestre temporali rilevanti (−7gg, 0gg, +3gg, +10gg), raggruppa per `email_genitore` e invia una email per genitore via Resend API.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), pg_cron, pg_net, Resend API, supabase-js v2.

---

## File Map

| File | Azione | Responsabilità |
|------|--------|----------------|
| `supabase/functions/send-reminders/index.ts` | Crea | Logica completa: query DB → filtra → raggruppa → invia email |
| `supabase/config.toml` | Crea | Config locale Supabase CLI |

---

## Task 1 — Installa Supabase CLI e inizializza il progetto

**Files:**
- Crea: `supabase/config.toml` (generato automaticamente)

- [ ] **Step 1: Installa Supabase CLI globalmente**

```powershell
npm install -g supabase
```

Verifica:
```powershell
supabase --version
```
Output atteso: `2.x.x` o superiore.

- [ ] **Step 2: Inizializza il progetto Supabase**

```powershell
cd D:\PYTHON\PROGETTO_ODERZO
supabase init
```

Output atteso: `Generated supabase/config.toml`

Se chiede conferma su directory non vuota, rispondi `y`.

- [ ] **Step 3: Collega il progetto al tuo Supabase remoto**

```powershell
supabase link --project-ref csrpnozltwozcstyxsok
```

Inserisci la **database password** quando richiesto (la trovi in Supabase Dashboard → Settings → Database → Connection string, campo "Password").

Output atteso: `Finished supabase link.`

- [ ] **Step 4: Commit**

```powershell
git add supabase/config.toml
git commit -m "chore: inizializza Supabase CLI"
```

---

## Task 2 — Crea la Edge Function `send-reminders`

**Files:**
- Crea: `supabase/functions/send-reminders/index.ts`

- [ ] **Step 1: Crea la struttura della funzione**

```powershell
supabase functions new send-reminders
```

Output atteso: directory `supabase/functions/send-reminders/` creata con `index.ts` vuoto.

- [ ] **Step 2: Sostituisci il contenuto di `index.ts` con la logica completa**

```typescript
// supabase/functions/send-reminders/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SR_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Finestre temporali (in giorni, positivo = quota scaduta)
const WINDOWS = [
  { min: -8, max: -6, label: '⏰ Scade tra 7 giorni' },
  { min: -1, max:  1, label: '⚠️ Scade oggi'         },
  { min:  2, max:  4, label: '🔴 Primo sollecito'     },
  { min:  9, max: 11, label: '🔴 Secondo sollecito'   },
]

function getStato(dataScadenza: string): string | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sc = new Date(dataScadenza)
  sc.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - sc.getTime()) / 86_400_000)
  for (const w of WINDOWS) {
    if (diff >= w.min && diff <= w.max) return w.label
  }
  return null
}

function formatData(d: string): string {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function buildHtml(societaNome: string, rate: Array<{
  giocatore_nome: string; giocatore_cognome: string
  tipo: string; descrizione: string | null
  importo: number; data_scadenza: string; stato: string
}>): string {
  const righe = rate.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${r.giocatore_nome} ${r.giocatore_cognome}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${r.tipo}${r.descrizione ? ` — ${r.descrizione}` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">€ ${Number(r.importo).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${formatData(r.data_scadenza)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${r.stato}</td>
    </tr>`).join('')

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
      <h2 style="color:#f97316">🏀 Rate da saldare — ${societaNome}</h2>
      <p>Gentile genitore,</p>
      <p>Le ricordiamo che sono presenti rate da saldare:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0">
        <thead>
          <tr style="background:#f5f5f5;text-align:left">
            <th style="padding:8px 12px">Giocatore</th>
            <th style="padding:8px 12px">Tipo</th>
            <th style="padding:8px 12px">Importo</th>
            <th style="padding:8px 12px">Scadenza</th>
            <th style="padding:8px 12px">Stato</th>
          </tr>
        </thead>
        <tbody>${righe}</tbody>
      </table>
      <p>Per informazioni o pagamenti, contatti la segreteria della sua società sportiva.</p>
      <p style="margin-top:32px;color:#888;font-size:12px">
        ${societaNome} — gestito con <b>EVO</b>
      </p>
    </div>`
}

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SR_KEY)

    // Recupera tutte le quote non pagate con dati giocatore e società
    const { data: rows, error } = await supabase
      .from('quote')
      .select(`
        id, tipo, descrizione, importo, data_scadenza,
        giocatori ( nome, cognome, email_genitore ),
        societa  ( nome )
      `)
      .eq('pagato', false)
      .not('data_scadenza', 'is', null)

    if (error) throw new Error(`DB error: ${error.message}`)

    // Raggruppa per email_genitore → una email per genitore
    type Rata = {
      giocatore_nome: string; giocatore_cognome: string
      tipo: string; descrizione: string | null
      importo: number; data_scadenza: string; stato: string
    }
    const groups = new Map<string, { societaNome: string; rate: Rata[] }>()

    for (const q of (rows ?? []) as any[]) {
      const email = q.giocatori?.email_genitore
      if (!email) continue
      const stato = getStato(q.data_scadenza)
      if (!stato) continue

      if (!groups.has(email)) {
        groups.set(email, { societaNome: q.societa?.nome ?? 'Società', rate: [] })
      }
      groups.get(email)!.rate.push({
        giocatore_nome:    q.giocatori.nome,
        giocatore_cognome: q.giocatori.cognome,
        tipo:              q.tipo,
        descrizione:       q.descrizione,
        importo:           q.importo,
        data_scadenza:     q.data_scadenza,
        stato,
      })
    }

    let sent = 0, errors = 0

    for (const [email, group] of groups) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'EVO <onboarding@resend.dev>',
          to:      [email],
          subject: `Rate in scadenza — ${group.societaNome}`,
          html:    buildHtml(group.societaNome, group.rate),
        }),
      })

      if (res.ok) {
        sent++
        console.log(`[send-reminders] ✅ Inviata a ${email} (${group.rate.length} rate)`)
      } else {
        errors++
        const body = await res.text()
        console.error(`[send-reminders] ❌ Errore per ${email}: ${body}`)
      }
    }

    console.log(`[send-reminders] Fine: ${sent} email inviate, ${errors} errori, ${groups.size} genitori totali`)
    return new Response(JSON.stringify({ sent, errors, total: groups.size }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[send-reminders] ECCEZIONE:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 3: Commit**

```powershell
git add supabase/functions/send-reminders/index.ts
git commit -m "feat: edge function send-reminders per rate scadute"
```

---

## Task 3 — Configura il secret RESEND_API_KEY su Supabase

**Files:** nessun file — solo configurazione remota.

- [ ] **Step 1: Imposta il secret sulla Edge Function**

```powershell
cd D:\PYTHON\PROGETTO_ODERZO
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
```

Sostituisci `re_xxxxxxxxxxxx` con la tua API key Resend (quella nel file `.env` come `RESEND_API_KEY`).

Output atteso:
```
Finished supabase secrets set.
```

- [ ] **Step 2: Verifica che il secret sia impostato**

```powershell
supabase secrets list
```

Output atteso: deve comparire `RESEND_API_KEY` nella lista (il valore è nascosto).

---

## Task 4 — Deploy della funzione

**Files:** nessun file da modificare.

- [ ] **Step 1: Deploy su Supabase**

```powershell
cd D:\PYTHON\PROGETTO_ODERZO
supabase functions deploy send-reminders --no-verify-jwt
```

Il flag `--no-verify-jwt` permette alla funzione di essere chiamata da pg_cron senza token utente.

Output atteso:
```
Deploying Function send-reminders ...
Done: Functions deployed.
```

- [ ] **Step 2: Test manuale — verifica che la funzione risponda**

```powershell
supabase functions invoke send-reminders --no-verify-jwt
```

Output atteso (anche se non ci sono rate in scadenza oggi):
```json
{"sent": 0, "errors": 0, "total": 0}
```

Se vedi `{"error": "..."}` copia il messaggio e verifica i log:
```powershell
supabase functions logs send-reminders
```

---

## Task 5 — Inserisci dati di test e verifica l'invio email

**Files:** nessun file — SQL nel SQL Editor di Supabase.

- [ ] **Step 1: Inserisci una quota di test nel SQL Editor**

Sostituisci `<SOCIETA_ID>` e `<GIOCATORE_ID>` con valori reali dal tuo DB (usa una quota di un giocatore con `email_genitore` non null).

```sql
-- Trova un giocatore con email_genitore
SELECT id, nome, cognome, email_genitore, societa_id
FROM giocatori
WHERE email_genitore IS NOT NULL
LIMIT 5;

-- Inserisci una quota con scadenza 3 giorni fa (primo sollecito)
INSERT INTO quote (giocatore_id, societa_id, tipo, descrizione, importo, data_scadenza, pagato)
VALUES (
  '<GIOCATORE_ID>',
  '<SOCIETA_ID>',
  'mensile',
  'Test reminder',
  80.00,
  (CURRENT_DATE - INTERVAL '3 days')::date,
  false
)
RETURNING id;
```

Annota l'`id` restituito — ti servirà per cancellare il record dopo il test.

- [ ] **Step 2: Invoca la funzione e verifica l'email**

```powershell
supabase functions invoke send-reminders --no-verify-jwt
```

Output atteso:
```json
{"sent": 1, "errors": 0, "total": 1}
```

Controlla la casella email del genitore (o la tua se stai usando l'email di test con Resend).

- [ ] **Step 3: Cancella la quota di test**

```sql
DELETE FROM quote WHERE id = '<ID_RESTITUITO_SOPRA>';
```

---

## Task 6 — Configura pg_cron per l'esecuzione giornaliera

**Files:** nessun file — SQL nel SQL Editor di Supabase.

- [ ] **Step 1: Abilita le estensioni necessarie**

Nel SQL Editor di Supabase, esegui:

```sql
-- pg_cron: esecuzione schedulata
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_net: HTTP requests da SQL
CREATE EXTENSION IF NOT EXISTS pg_net;
```

Se restituisce errore "already exists", è normale — le estensioni erano già abilitate.

- [ ] **Step 2: Crea il job giornaliero**

Copia la `SUPABASE_SERVICE_ROLE_KEY` dal file `.env` (quella lunga `eyJ...`) e incollala al posto di `<SERVICE_ROLE_KEY>`:

```sql
SELECT cron.schedule(
  'send-reminders-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://csrpnozltwozcstyxsok.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 3: Verifica che il job sia stato creato**

```sql
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'send-reminders-daily';
```

Output atteso: una riga con `schedule = '0 8 * * *'`.

- [ ] **Step 4: Commit finale**

```powershell
git add supabase/
git commit -m "feat: deploy edge function send-reminders + pg_cron giornaliero"
```

---

## Verifica finale

Dopo 24 ore (o la mattina successiva alle 10:00 ora italiana) controlla i log della funzione:

```powershell
supabase functions logs send-reminders --tail
```

Dovresti vedere righe tipo:
```
[send-reminders] ✅ Inviata a mario.rossi@gmail.com (2 rate)
[send-reminders] Fine: 3 email inviate, 0 errori, 3 genitori totali
```

---

## Come disabilitare il job (se serve)

```sql
SELECT cron.unschedule('send-reminders-daily');
```
