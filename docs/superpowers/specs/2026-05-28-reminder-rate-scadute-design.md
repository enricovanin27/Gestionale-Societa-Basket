# Spec: Reminder Automatici Rate Scadute
*Data: 2026-05-28*

---

## Obiettivo

Inviare automaticamente email di promemoria e sollecito ai genitori per le rate non pagate, senza intervento manuale della segreteria.

---

## Architettura

**Supabase Edge Function** (`send-reminders`) invocata ogni giorno alle 08:00 da **pg_cron**.

```
pg_cron (ogni giorno ore 8:00)
    ↓
Supabase Edge Function "send-reminders" (TypeScript/Deno)
    ↓
Query: quote (pagato=false) JOIN giocatori (email_genitore)
    ↓
Raggruppa per email_genitore
    ↓
Resend API → 1 email per genitore
```

Nessuna dipendenza dal backend Python. Gira nel cloud Supabase, sempre attivo.

---

## Logica di selezione

La funzione gira ogni mattina e controlla tutte le `quote` dove `pagato = false`.
Per ogni quota calcola `diff = oggi - data_scadenza` (in giorni, positivo = scaduta):

| `diff` | Tipo reminder | Oggetto email |
|--------|--------------|---------------|
| `-7` (±1) | Promemoria | ⏰ Promemoria: rata in scadenza tra 7 giorni |
| `0` (±1) | Scadenza oggi | ⚠️ La rata scade oggi |
| `+3` (±1) | Primo sollecito | 🔴 Sollecito: rata scaduta |
| `+10` (±1) | Secondo sollecito | 🔴 Secondo sollecito: rata non pagata |

La tolleranza ±1 giorno copre eventuali micro-ritardi nel cron (es. la funzione gira alle 8:05 invece che alle 8:00).

Dopo il secondo sollecito (10 giorni dopo) non vengono più inviati reminder automatici — la segreteria gestisce il caso manualmente.

---

## Raggruppamento email

Un genitore riceve **una sola email al giorno**, anche se ha più rate in stati diversi. L'email elenca tutte le rate rilevanti con il rispettivo stato.

Esempio corpo email:
```
Gentile Mario Rossi,

Le ricordiamo che sono presenti rate non saldate per suo/a figlio/a:

• Luca Rossi — Mensile Ottobre — €80,00 — scaduta il 15/10/2026
• Luca Rossi — Mensile Novembre — €80,00 — scaduta il 15/11/2026

Per informazioni contatti la segreteria.

EVO — [Nome Società]
```

---

## Dati necessari

### Tabelle coinvolte

**`quote`**
- `id`, `giocatore_id`, `societa_id`
- `tipo`, `descrizione`, `importo`
- `data_scadenza`, `pagato`

**`giocatori`**
- `id`, `nome`, `cognome`
- `email_genitore` (può essere null → quota saltata)

**`societa`**
- `id`, `nome` (usato nel footer dell'email)

### Query principale

```sql
SELECT
  q.id, q.tipo, q.descrizione, q.importo, q.data_scadenza,
  g.nome AS giocatore_nome, g.cognome AS giocatore_cognome,
  g.email_genitore,
  s.nome AS societa_nome
FROM quote q
JOIN giocatori g ON g.id = q.giocatore_id
JOIN societa s ON s.id = q.societa_id
WHERE q.pagato = false
  AND q.data_scadenza IS NOT NULL
  AND g.email_genitore IS NOT NULL
```

---

## Struttura file

```
supabase/
  functions/
    send-reminders/
      index.ts        ← logica principale
  config.toml         ← pg_cron setup (già esistente o da creare)
```

---

## Configurazione pg_cron

```sql
-- Eseguire una volta nel SQL Editor di Supabase
select cron.schedule(
  'send-reminders-daily',
  '0 8 * * *',   -- ogni giorno alle 8:00 UTC (= 10:00 ora italiana in estate)
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
```

---

## Variabili d'ambiente Edge Function

| Variabile | Valore |
|-----------|--------|
| `RESEND_API_KEY` | API key Resend (`re_...`) |
| `SUPABASE_URL` | Iniettata automaticamente da Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Iniettata automaticamente da Supabase |

---

## Gestione errori

| Caso | Comportamento |
|------|--------------|
| `email_genitore` null | Quota saltata silenziosamente |
| `data_scadenza` null | Quota saltata silenziosamente |
| Giocatore non trovato | Quota saltata con `console.error` |
| Resend fallisce su una email | Log errore, si continua con le altre |
| Funzione crasha | pg_cron riprova domani; Supabase logga l'errore |

---

## Test

1. Inserire una quota con `data_scadenza = oggi - 3 giorni` e `pagato = false`
2. Invocare la funzione manualmente via `supabase functions invoke send-reminders`
3. Verificare che l'email arrivi al `email_genitore` corrispondente
4. Segnare la quota come pagata e riverificare che non venga più inviata

---

## Fuori scope

- Reminder via SMS o push notification
- Configurazione per-società della sequenza di reminder
- Storico email inviate (per ora solo log Supabase)
- Unsubscribe per i genitori
