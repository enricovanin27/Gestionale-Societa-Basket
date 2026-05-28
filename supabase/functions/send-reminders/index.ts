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
