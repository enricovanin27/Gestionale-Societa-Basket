# Lead Capture + AI WhatsApp Follow-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere alla landing page un form di richiesta demo che salva il lead su Supabase, invia un'email di ringraziamento al lead via Resend, chiama Claude Haiku per generare un messaggio WhatsApp personalizzato, e notifica il fondatore con un bottone wa.me precompilato.

**Architecture:** Form React → Supabase Edge Function `handle-lead` → INSERT leads table + Resend (2 email) + Anthropic API (1 chiamata). Tutto in una sola Edge Function Deno, best-effort per email/AI dopo che il lead è salvato.

**Tech Stack:** React + Vite (frontend), Supabase Edge Functions (Deno), Resend API, Anthropic claude-haiku-4-5-20251001, PostgreSQL (Supabase)

---

## File map

| File | Azione |
|---|---|
| `supabase/migrations/supabase_migration_leads.sql` | Crea tabella `leads` |
| `supabase/functions/handle-lead/index.ts` | Edge Function completa |
| `frontend/src/pages/LandingPage.jsx` | Modifica `SectionContatti` |

---

## Task 1: Tabella leads

**Files:**
- Create: `supabase/migrations/supabase_migration_leads.sql`

- [ ] **Step 1.1 — Crea il file di migrazione**

Crea `supabase/migrations/supabase_migration_leads.sql` con questo contenuto esatto:

```sql
-- Tabella leads: richieste demo dalla landing page
CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  nome        TEXT NOT NULL,
  societa     TEXT NOT NULL,
  email       TEXT NOT NULL,
  telefono    TEXT NOT NULL,
  status      TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted'))
);

-- RLS abilitata: nessuna policy pubblica, solo service_role può accedere
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Index per query per data (futuro dashboard leads)
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
```

- [ ] **Step 1.2 — Esegui su Supabase**

Apri [supabase.com](https://supabase.com) → tuo progetto → **SQL Editor** → incolla il contenuto del file → **Run**.

Verifica che non ci siano errori e che la tabella `leads` appaia in **Table Editor**.

- [ ] **Step 1.3 — Commit**

```bash
git add supabase/migrations/supabase_migration_leads.sql
git commit -m "feat: tabella leads per richieste demo landing page"
```

---

## Task 2: Edge Function handle-lead

**Files:**
- Create: `supabase/functions/handle-lead/index.ts`

- [ ] **Step 2.1 — Crea la directory**

```bash
mkdir -p supabase/functions/handle-lead
```

- [ ] **Step 2.2 — Crea l'Edge Function**

Crea `supabase/functions/handle-lead/index.ts` con questo contenuto:

```typescript
// supabase/functions/handle-lead/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Env vars ──────────────────────────────────────────────────────────────────
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SR_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const OWNER_EMAIL       = Deno.env.get('OWNER_EMAIL') ?? 'enricovanin27@gmail.com'
const FROM_EMAIL        = 'EVO <onboarding@resend.dev>'   // cambia con dominio verificato

// ── CORS headers (la funzione è chiamata dal browser) ─────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// ── Normalizza telefono per wa.me ─────────────────────────────────────────────
// Input: qualsiasi formato (+39 347 123 4567, 0347-123-4567, ecc.)
// Output: 39XXXXXXXXXX (senza +, senza spazi)
function normalizeTelefono(tel: string): string {
  let digits = tel.replace(/\D/g, '') // rimuovi tutto tranne cifre
  if (digits.startsWith('0039')) digits = digits.slice(4)
  if (digits.startsWith('39') && digits.length === 12) return digits
  if (!digits.startsWith('39')) digits = '39' + digits
  return digits
}

// ── Email ringraziamento al lead ──────────────────────────────────────────────
function buildEmailLead(nome: string, societa: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:auto;color:#1a1a1a">
      <div style="background:linear-gradient(135deg,#d97706,#b45309);padding:28px 32px;border-radius:12px 12px 0 0">
        <div style="font-size:28px;font-weight:900;color:white;letter-spacing:-1px">EV<span style="color:#fde68a">O</span> 🏀</div>
      </div>
      <div style="background:white;padding:32px;border:1px solid #f3f4f6;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 16px;color:#92400e">Ciao ${nome}!</h2>
        <p style="margin:0 0 12px;color:#374151;line-height:1.6">
          Grazie per aver richiesto una demo di <strong>EVO</strong> per <strong>${societa}</strong>.
        </p>
        <p style="margin:0 0 12px;color:#374151;line-height:1.6">
          Abbiamo ricevuto la tua richiesta e ti contatteremo a breve su
          <strong>WhatsApp</strong> per rispondere a tutte le tue domande.
        </p>
        <p style="margin:0 0 24px;color:#374151;line-height:1.6">
          Nel frattempo puoi già esplorare l'app con il tuo account di prova.
        </p>
        <p style="margin:0;color:#6b7280;font-size:14px">
          A presto,<br/>
          <strong style="color:#92400e">Il team EVO 🏀</strong>
        </p>
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:16px">
        © 2026 EVO · Il gestionale per il basket italiano
      </p>
    </div>`
}

// ── Email notifica al fondatore ───────────────────────────────────────────────
function buildEmailOwner(
  nome: string, societa: string, email: string,
  telefono: string, waMsg: string, waLink: string,
  createdAt: string
): string {
  const dataOra = new Date(createdAt).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'
  })

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:auto;color:#1a1a1a">
      <div style="background:linear-gradient(135deg,#d97706,#b45309);padding:20px 28px;border-radius:12px 12px 0 0">
        <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Nuovo lead</div>
        <div style="font-size:22px;font-weight:900;color:white">🏀 EVO · Richiesta demo</div>
      </div>

      <div style="background:white;padding:28px;border:1px solid #f3f4f6">
        <!-- Dati lead -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:12px;color:#9ca3af;font-weight:600;width:100px">Nome</td>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#111">${nome}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:12px;color:#9ca3af;font-weight:600">Società</td>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111">${societa}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:12px;color:#9ca3af;font-weight:600">Email</td>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#2563eb">
              <a href="mailto:${email}" style="color:#2563eb">${email}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:12px;color:#9ca3af;font-weight:600">Telefono</td>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111">${telefono}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:12px;color:#9ca3af;font-weight:600">Ricevuto</td>
            <td style="padding:8px 0;font-size:14px;color:#111">${dataOra}</td>
          </tr>
        </table>

        <!-- Messaggio WhatsApp generato da Claude -->
        <div style="margin-bottom:20px">
          <div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
            💬 Messaggio WhatsApp suggerito da Claude AI
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #d97706;border-radius:8px;padding:16px;font-size:14px;line-height:1.7;color:#374151;font-family:monospace;white-space:pre-wrap">${waMsg}</div>
        </div>

        <!-- Bottone wa.me -->
        <a href="${waLink}"
          style="display:block;background:#25d366;color:white;text-align:center;padding:16px 24px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:8px">
          📲 Invia su WhatsApp →
        </a>
        <p style="text-align:center;font-size:11px;color:#9ca3af;margin:0">
          Si aprirà WhatsApp con il messaggio precompilato — puoi modificarlo prima di inviare
        </p>
      </div>

      <div style="background:#f9fafb;padding:12px 28px;border:1px solid #f3f4f6;border-top:none;border-radius:0 0 12px 12px;text-align:right">
        <span style="font-size:11px;color:#9ca3af">EVO Lead System · ${dataOra}</span>
      </div>
    </div>`
}

// ── Handler principale ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }

  try {
    // 1. Parse body
    const body = await req.json().catch(() => null)
    if (!body) {
      return new Response(JSON.stringify({ error: 'Body non valido' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const { nome, societa, email, telefono } = body as Record<string, string>

    // 2. Validazione
    if (!nome?.trim() || !societa?.trim() || !email?.trim() || !telefono?.trim()) {
      return new Response(JSON.stringify({ error: 'Tutti i campi sono obbligatori' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Email non valida' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // 3. Salva lead su Supabase (service_role bypassa RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SR_KEY)
    const { data: lead, error: dbError } = await supabase
      .from('leads')
      .insert({ nome: nome.trim(), societa: societa.trim(), email: email.trim(), telefono: telefono.trim() })
      .select('id, created_at')
      .single()

    if (dbError) throw new Error(`DB error: ${dbError.message}`)

    // Da qui in poi: best-effort (errori loggati ma non bloccano la risposta)

    // 4. Email ringraziamento al lead
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email.trim()],
          subject: `Grazie ${nome.trim()}, abbiamo ricevuto la tua richiesta 🏀`,
          html: buildEmailLead(nome.trim(), societa.trim()),
        }),
      })
      if (!res.ok) console.error('[handle-lead] Resend lead email error:', await res.text())
      else console.log(`[handle-lead] ✅ Email ringraziamento inviata a ${email}`)
    } catch (e) {
      console.error('[handle-lead] Resend lead email exception:', e)
    }

    // 5. Genera messaggio WhatsApp con Claude Haiku
    let waMsg = `Ciao ${nome.trim()}! 👋 Sono Enrico di EVO. Ho visto che hai richiesto una demo per ${societa.trim()} — grazie mille per l'interesse! Volevo sapere se hai avuto modo di esplorare l'app e se tutto era chiaro. Hai domande su qualche funzionalità? Se preferisci possiamo anche fare una breve chiamata. Fammi sapere! 🏀`

    try {
      const prompt = `Sei un assistente commerciale per EVO, un'app gestionale per società di basket italiane. Scrivi un messaggio WhatsApp breve (max 120 parole), cordiale e professionale per contattare un potenziale cliente che ha richiesto una demo.

Lead: ${nome.trim()}, società "${societa.trim()}"

Il messaggio deve:
- Iniziare con "Ciao ${nome.trim()}! 👋"
- Presentarti come il team di EVO
- Dire che hai visto la richiesta di demo
- Chiedere se ha avuto modo di esplorare l'app
- Chiedere se ha domande o vuole una chiamata rapida
- Finire con tono amichevole, non commerciale
- Non usare emoji eccessive (max 2-3)

Rispondi SOLO con il testo del messaggio, senza prefissi o spiegazioni.`

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (aiRes.ok) {
        const aiData = await aiRes.json()
        waMsg = aiData.content?.[0]?.text?.trim() ?? waMsg
        console.log('[handle-lead] ✅ Messaggio WhatsApp generato da Claude')
      } else {
        console.error('[handle-lead] Claude API error:', await aiRes.text())
      }
    } catch (e) {
      console.error('[handle-lead] Claude API exception:', e)
    }

    // 6. Costruisci link wa.me
    const telNorm = normalizeTelefono(telefono.trim())
    const waLink = `https://wa.me/${telNorm}?text=${encodeURIComponent(waMsg)}`

    // 7. Email notifica al fondatore
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [OWNER_EMAIL],
          subject: `🏀 Nuovo lead EVO: ${nome.trim()} — ${societa.trim()}`,
          html: buildEmailOwner(nome.trim(), societa.trim(), email.trim(), telefono.trim(), waMsg, waLink, lead.created_at),
        }),
      })
      if (!res.ok) console.error('[handle-lead] Resend owner email error:', await res.text())
      else console.log(`[handle-lead] ✅ Notifica inviata a ${OWNER_EMAIL}`)
    } catch (e) {
      console.error('[handle-lead] Resend owner email exception:', e)
    }

    return new Response(JSON.stringify({ success: true, id: lead.id }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[handle-lead] ECCEZIONE:', e)
    return new Response(JSON.stringify({ error: 'Errore interno. Riprova tra poco.' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2.3 — Configura i secret su Supabase**

Esegui nel terminale (sostituisci i valori reali):

```bash
# RESEND_API_KEY: da resend.com → API Keys
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx

# ANTHROPIC_API_KEY: da console.anthropic.com → API Keys
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxx

# OWNER_EMAIL: la tua email per le notifiche
supabase secrets set OWNER_EMAIL=enricovanin27@gmail.com
```

Verifica che i secret siano impostati:
```bash
supabase secrets list
```
Dovresti vedere `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `OWNER_EMAIL` nella lista.

- [ ] **Step 2.4 — Deploy dell'Edge Function**

```bash
supabase functions deploy handle-lead --no-verify-jwt
```

Output atteso:
```
Deploying Function handle-lead...
Done: handle-lead
```

- [ ] **Step 2.5 — Test con curl**

Sostituisci `YOUR_PROJECT_REF` con il ref del tuo progetto Supabase (visibile in Settings → General):

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/handle-lead" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Test Lead","societa":"Basket Test","email":"test@example.com","telefono":"3471234567"}'
```

Output atteso:
```json
{"success":true,"id":"uuid-del-lead"}
```

Verifica anche:
- Tabella `leads` su Supabase → deve contenere il record inserito
- La tua casella email → deve aver ricevuto l'email di notifica con bottone WhatsApp

- [ ] **Step 2.6 — Commit**

```bash
git add supabase/functions/handle-lead/index.ts
git commit -m "feat: edge function handle-lead — salva lead, email Resend, messaggio WA con Claude"
```

---

## Task 3: Form nella LandingPage

**Files:**
- Modify: `frontend/src/pages/LandingPage.jsx` — solo funzione `SectionContatti`

- [ ] **Step 3.1 — Sostituisci SectionContatti in LandingPage.jsx**

Trova e sostituisci l'intera funzione `SectionContatti` (dalla riga `function SectionContatti()` fino alla parentesi graffa di chiusura) con questo codice:

```jsx
function SectionContatti() {
  const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-lead`

  const [form, setForm]     = useState({ nome: '', societa: '', email: '', telefono: '' })
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
  const [errMsg, setErrMsg] = useState('')

  const allFilled = Object.values(form).every(v => v.trim().length > 0)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!allFilled || status === 'loading') return
    setStatus('loading')
    setErrMsg('')
    try {
      const res = await fetch(FN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore sconosciuto')
      setStatus('success')
    } catch (err) {
      setErrMsg(err.message ?? 'Errore di rete. Riprova.')
      setStatus('error')
    }
  }

  const inp = [
    'w-full bg-white/20 border border-white/30 rounded-xl px-4 py-3',
    'text-sm text-white placeholder-white/40',
    'focus:outline-none focus:ring-2 focus:ring-white/50 transition-all',
  ].join(' ')

  return (
    <section id="contatti" className="px-6 py-14 border-b-2 border-amber-900" style={GRAD}>
      <div className="max-w-md mx-auto text-center">
        <SectionLabel light>Richiedi una demo</SectionLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
          Porta EVO nella tua società.
        </h2>
        <p className="text-[14px] text-white/75 leading-relaxed mb-8">
          Lascia i tuoi dati: ti contatteremo su WhatsApp entro 24 ore
          per una demo personalizzata, senza impegno.
        </p>

        {status === 'success' ? (
          /* ── Stato successo ── */
          <div className="bg-white/15 border border-white/25 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-black text-white mb-2">Richiesta inviata!</h3>
            <p className="text-sm text-white/75 leading-relaxed">
              Controlla la tua email per la conferma.<br />
              Ti contatteremo presto su <strong>WhatsApp</strong> 📲
            </p>
          </div>
        ) : (
          /* ── Form ── */
          <form onSubmit={handleSubmit} className="bg-white/15 rounded-2xl p-6 border border-white/25 text-left space-y-3">
            <div>
              <label className="text-[11px] font-bold text-amber-200 mb-1.5 block uppercase tracking-wide">
                Nome e cognome *
              </label>
              <input
                type="text" name="nome" value={form.nome} onChange={handleChange}
                placeholder="Mario Rossi" required className={inp} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-200 mb-1.5 block uppercase tracking-wide">
                Società sportiva *
              </label>
              <input
                type="text" name="societa" value={form.societa} onChange={handleChange}
                placeholder="Basket Treviso ASD" required className={inp} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-200 mb-1.5 block uppercase tracking-wide">
                Email *
              </label>
              <input
                type="email" name="email" value={form.email} onChange={handleChange}
                placeholder="mario@baskettreviso.it" required className={inp} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-200 mb-1.5 block uppercase tracking-wide">
                Telefono (WhatsApp) *
              </label>
              <input
                type="tel" name="telefono" value={form.telefono} onChange={handleChange}
                placeholder="347 123 4567" required className={inp} />
            </div>

            {status === 'error' && (
              <p className="text-xs text-red-300 bg-red-900/30 rounded-lg px-3 py-2">{errMsg}</p>
            )}

            <button
              type="submit"
              disabled={!allFilled || status === 'loading'}
              className="w-full py-4 bg-white text-amber-800 rounded-xl text-[15px] font-extrabold shadow-lg
                hover:bg-amber-50 active:scale-95 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 mt-2">
              {status === 'loading'
                ? '⏳ Invio in corso...'
                : '📲 Richiedi la demo gratuita →'}
            </button>
            <p className="text-center text-[11px] text-white/35 mt-1">
              Ti contatteremo su WhatsApp · Nessun impegno
            </p>
          </form>
        )}

        {/* Link accedi */}
        <div className="mt-8 pt-6 border-t border-white/15">
          <p className="text-sm text-white/50 mb-3">Hai già un account?</p>
          <Link to="/login"
            className="inline-block px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl border border-white/30 transition-colors text-sm">
            Accedi →
          </Link>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3.2 — Verifica che il build compili**

```bash
cd frontend
npm run build
```

Output atteso: `✓ built in X.XXs` senza errori.

- [ ] **Step 3.3 — Test visivo in locale**

```bash
npm run dev
```

Apri `http://localhost:5173` → scorri fino a `#contatti` → verifica:
- I 4 campi appaiono correttamente
- Il bottone è disabilitato (grigio) con i campi vuoti
- Il bottone diventa arancione quando tutti i campi sono compilati

**Non fare ancora submit in locale** (l'Edge Function è su Supabase prod — funziona, ma usa le email vere).

- [ ] **Step 3.4 — Commit**

```bash
git add frontend/src/pages/LandingPage.jsx
git commit -m "feat: form richiesta demo con 4 campi in LandingPage"
```

---

## Task 4: Test end-to-end e push

- [ ] **Step 4.1 — Test completo con dati reali**

Apri l'app in produzione (o avvia locale e usa l'URL Supabase prod):
1. Vai su `#contatti`
2. Compila: nome = `Test Demo`, società = `Basket Test ASD`, email = una tua email, telefono = il tuo numero reale
3. Clicca "Richiedi la demo gratuita →"
4. Verifica spinner → messaggio "✓ Richiesta inviata!"

Controlla:
- [ ] Tabella `leads` su Supabase → record inserito con tutti i campi
- [ ] Casella `test@...` → email di ringraziamento ricevuta con layout arancione
- [ ] Casella `enricovanin27@gmail.com` → email di notifica con dati lead, messaggio WhatsApp generato da Claude, bottone verde "📲 Invia su WhatsApp"
- [ ] Clicca il bottone → si apre WhatsApp con numero e messaggio precompilato

- [ ] **Step 4.2 — Push al repo**

```bash
git push origin feat/quote-template-dirigente-prep-standby
```

Il deploy in produzione si aggiorna automaticamente al prossimo push (se Vercel/Netlify è configurato sul branch).

---

## Note finali

**Dominio email Resend:** Attualmente la funzione usa `onboarding@resend.dev` (dominio sandbox Resend, consegna solo all'email verificata sull'account). Per inviare a qualsiasi email, vai su resend.com → Domains → aggiungi e verifica il tuo dominio (es. `evo-basket.it`) e cambia `FROM_EMAIL` in `EVO <noreply@evo-basket.it>`.

**Fallback messaggio WhatsApp:** Se la chiamata a Claude fallisce (rete, rate limit), la funzione usa un messaggio di default pre-scritto in italiano — il lead viene comunque salvato e la notifica viene inviata.
