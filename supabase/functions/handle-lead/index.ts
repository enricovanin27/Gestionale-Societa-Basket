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
  if (digits.startsWith('0')) digits = digits.slice(1)    // rimuovi 0 iniziale (formato domestico)
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
