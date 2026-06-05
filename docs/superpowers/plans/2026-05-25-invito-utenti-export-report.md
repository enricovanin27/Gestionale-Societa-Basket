# Invito Utenti + Export Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semplificare l'invito utenti tramite email magica Supabase ed aggiungere stampa PDF via browser per report segreteria (certificati, quote) e presenze (admin + allenatore).

**Architecture:** Hook generico `usePrintWindow` per la stampa; componente condiviso `InvitaUtenteForm` con prop `ruoliConsentiti` usato sia da Admin che Segreteria; pulsanti stampa integrati nei componenti esistenti senza nuove route.

**Tech Stack:** React 18, Supabase JS SDK v2 (`supabaseAdmin.auth.admin.inviteUserByEmail`), TanStack Query v5, Lucide Icons, Tailwind CSS, date-fns

---

## File Map

| File | Azione |
|---|---|
| `frontend/src/hooks/usePrintWindow.js` | **NUOVO** — hook generico stampa |
| `frontend/src/components/InvitaUtenteForm.jsx` | **NUOVO** — form invito condiviso |
| `frontend/src/pages/SetupPage.jsx` | **MODIFICA** — sostituisce form invito con il componente |
| `frontend/src/pages/secretary/ImpostazioniSocieta.jsx` | **MODIFICA** — aggiunge sezione Gestione Accessi |
| `frontend/src/pages/secretary/SegreteriaDashboard.jsx` | **MODIFICA** — pulsanti stampa cert + quote |
| `frontend/src/pages/admin/PresenzeAdmin.jsx` | **MODIFICA** — pulsante stampa matrice presenze |
| `frontend/src/pages/StatistichePage.jsx` | **MODIFICA** — pulsante stampa matrice presenze (coach) |

---

## Task 1: Hook `usePrintWindow`

**Files:**
- Create: `frontend/src/hooks/usePrintWindow.js`

- [ ] **Step 1: Crea il file**

```js
// frontend/src/hooks/usePrintWindow.js
export function usePrintWindow() {
  return function printWindow(titolo, htmlBody, intestazioneSocieta = '') {
    const win = window.open('', '_blank')
    if (!win) {
      alert('Pop-up bloccato dal browser. Consenti i pop-up per questa pagina per stampare.')
      return
    }
    win.document.write(`<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>${titolo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    h1 { font-size: 14px; margin-bottom: 4px; }
    .societa { font-size: 10px; color: #555; margin-bottom: 16px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10px; }
    thead th { background: #f3f4f6; font-size: 9px; text-transform: uppercase;
               letter-spacing: 0.04em; padding: 5px 6px; border: 1px solid #d1d5db; text-align: left; }
    tbody td { border: 1px solid #e5e7eb; padding: 4px 6px; vertical-align: middle; }
    .center { text-align: center; }
    .ok  { color: #16a34a; font-weight: bold; }
    .ko  { color: #9ca3af; }
    .red { color: #dc2626; font-weight: 600; }
    .orange { color: #ea580c; }
    .summary { margin-top: 12px; font-size: 10px; font-weight: 600; color: #374151; }
    .footer { margin-top: 20px; font-size: 9px; color: #9ca3af;
              border-top: 1px solid #e5e7eb; padding-top: 6px; }
    @media print { body { padding: 10mm; } @page { margin: 10mm; } }
  </style>
</head>
<body>
  ${intestazioneSocieta ? `<div class="societa">${intestazioneSocieta}</div>` : ''}
  <h1>${titolo}</h1>
  ${htmlBody}
  <div class="footer">Stampato il ${new Date().toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })}</div>
</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/usePrintWindow.js
git commit -m "feat: add usePrintWindow hook for browser-based PDF printing"
```

---

## Task 2: Componente `InvitaUtenteForm`

**Files:**
- Create: `frontend/src/components/InvitaUtenteForm.jsx`

- [ ] **Step 1: Crea il file**

```jsx
// frontend/src/components/InvitaUtenteForm.jsx
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, CheckCircle2 } from 'lucide-react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const RUOLO_LABELS = {
  admin:       'Amministratore',
  allenatore:  'Allenatore',
  segreteria:  'Segreteria',
  genitore:    'Genitore',
  giocatore:   'Giocatore',
  preparatore: 'Preparatore atletico',
}

const EMPTY_FORM = {
  email: '', nome: '', cognome: '', ruolo: '',
  squadra: '', squadra2: '', squadra3: '',
  genitore_squadra: '', genitore_squadra2: '', genitore_squadra3: '',
  giocatoreId: '', societa_id: '',
}

export default function InvitaUtenteForm({ ruoliConsentiti, onSuccess }) {
  const { societaId, isSuperAdmin } = useAuth()
  const qc = useQueryClient()
  const [form, setForm]       = useState({ ...EMPTY_FORM, ruolo: ruoliConsentiti[0] ?? '' })
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState(null)
  const [ok, setOk]           = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Squadre della società
  const { data: squadre = [] } = useQuery({
    queryKey: ['squadre-nomi-invita', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('squadre').select('categoria')
        .eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 5 * 60 * 1000,
  })

  // Giocatori attivi — usati per il collegamento (genitore→figlio o account→giocatore)
  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-link', societaId],
    enabled: !!societaId && (form.ruolo === 'genitore' || form.ruolo === 'giocatore'),
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, user_id, genitore_user_id')
        .eq('societa_id', societaId).eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
  const giocatoriGenitore   = giocatori.filter(g => !g.genitore_user_id)
  const giocatoriGiocatore  = giocatori.filter(g => !g.user_id)

  // Lista società — solo super_admin che invita un admin
  const { data: societaList = [] } = useQuery({
    queryKey: ['societa-list'],
    enabled: isSuperAdmin && form.ruolo === 'admin',
    queryFn: async () => {
      const { data } = await supabase.from('societa').select('id, nome').order('nome')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email.trim() || !form.ruolo) return
    setLoading(true)
    setErr(null)
    try {
      if (!supabaseAdmin) throw new Error('Service role key non configurata (VITE_SUPABASE_SERVICE_ROLE_KEY)')

      const targetSocietaId = (isSuperAdmin && form.ruolo === 'admin' && form.societa_id)
        ? form.societa_id : societaId
      if (!targetSocietaId) throw new Error('Nessuna società associata al tuo account.')

      // 1. Invita via email magica
      const { data: invData, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        form.email.trim(),
        {
          data: {
            ruolo:      form.ruolo,
            nome:       form.nome.trim()    || null,
            cognome:    form.cognome.trim() || null,
            societa_id: targetSocietaId,
          },
          redirectTo: window.location.origin + '/login',
        }
      )
      if (invErr) throw invErr
      const newUserId = invData.user?.id
      if (!newUserId) throw new Error('Utente invitato ma ID non ricevuto')

      // 2. Inserisce profilo
      const profileData = {
        id: newUserId, email: form.email.trim(),
        nome: form.nome.trim() || null, cognome: form.cognome.trim() || null,
        ruolo: form.ruolo, societa_id: targetSocietaId, attivo: true,
      }
      if (form.ruolo === 'genitore') {
        profileData.genitore_squadra  = form.genitore_squadra  || null
        profileData.genitore_squadra2 = form.genitore_squadra2 || null
        profileData.genitore_squadra3 = form.genitore_squadra3 || null
      }
      if (form.ruolo === 'giocatore') {
        profileData.squadra  = form.squadra  || null
        profileData.squadra2 = form.squadra2 || null
        profileData.squadra3 = form.squadra3 || null
      }
      const { error: profErr } = await supabase
        .from('profiles').upsert([profileData], { onConflict: 'id' })
      if (profErr) throw profErr

      // 3. Side-effect: collega giocatore
      if (form.ruolo === 'giocatore' && form.giocatoreId) {
        await supabase.from('giocatori').update({ user_id: newUserId }).eq('id', form.giocatoreId)
        qc.invalidateQueries({ queryKey: ['giocatori-link', societaId] })
      }
      if (form.ruolo === 'genitore' && form.giocatoreId) {
        await supabase.from('giocatori').update({ genitore_user_id: newUserId }).eq('id', form.giocatoreId)
        qc.invalidateQueries({ queryKey: ['giocatori-link', societaId] })
      }

      // 4. Side-effect: crea riga allenatori
      if (form.ruolo === 'allenatore') {
        await supabase.from('allenatori').upsert([{
          nome: form.nome.trim(), cognome: form.cognome.trim(),
          email: form.email.trim(), squadre_capo: '', squadre_vice: '',
          societa_id: targetSocietaId,
        }], { onConflict: 'email' })
      }

      qc.invalidateQueries({ queryKey: ['setup-utenti'] })
      setOk(true)
      setTimeout(() => {
        setOk(false)
        setForm({ ...EMPTY_FORM, ruolo: ruoliConsentiti[0] ?? '' })
        onSuccess?.()
      }, 3500)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'
  const sel = inp + ' bg-white'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Email */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Email *</label>
        <input type="email" required className={inp}
          value={form.email} onChange={e => set('email', e.target.value)}
          placeholder="mario.rossi@esempio.com" />
      </div>

      {/* Nome + Cognome */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Nome</label>
          <input className={inp} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Mario" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Cognome</label>
          <input className={inp} value={form.cognome} onChange={e => set('cognome', e.target.value)} placeholder="Rossi" />
        </div>
      </div>

      {/* Ruolo */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Ruolo</label>
        <select className={sel} value={form.ruolo} onChange={e => set('ruolo', e.target.value)}>
          {ruoliConsentiti.map(r => (
            <option key={r} value={r}>{RUOLO_LABELS[r] ?? r}</option>
          ))}
        </select>
      </div>

      {/* Società — solo super_admin che invita admin */}
      {isSuperAdmin && form.ruolo === 'admin' && (
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Società</label>
          <select className={sel} value={form.societa_id} onChange={e => set('societa_id', e.target.value)}>
            <option value="">— usa la mia società —</option>
            {societaList.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
      )}

      {/* Campi squadra — giocatore */}
      {form.ruolo === 'giocatore' && (<>
        {[['squadra','Squadra *'],['squadra2','Squadra 2 (opz.)'],['squadra3','Squadra 3 (opz.)']].map(([k, label]) => (
          <div key={k}>
            <label className="text-xs text-gray-400 mb-1 block">{label}</label>
            <select className={sel} value={form[k]} onChange={e => set(k, e.target.value)}>
              <option value="">— nessuna —</option>
              {squadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Collega a giocatore esistente (opz.)</label>
          <select className={sel} value={form.giocatoreId} onChange={e => set('giocatoreId', e.target.value)}>
            <option value="">— non collegare —</option>
            {giocatoriGiocatore.map(g => (
              <option key={g.id} value={g.id}>{g.cognome} {g.nome} ({g.squadra})</option>
            ))}
          </select>
        </div>
      </>)}

      {/* Campi squadra — genitore */}
      {form.ruolo === 'genitore' && (<>
        {[['genitore_squadra','Squadra figlio *'],['genitore_squadra2','Squadra figlio 2 (opz.)'],['genitore_squadra3','Squadra figlio 3 (opz.)']].map(([k, label]) => (
          <div key={k}>
            <label className="text-xs text-gray-400 mb-1 block">{label}</label>
            <select className={sel} value={form[k]} onChange={e => set(k, e.target.value)}>
              <option value="">— nessuna —</option>
              {squadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Collega a giocatore figlio (opz.)</label>
          <select className={sel} value={form.giocatoreId} onChange={e => set('giocatoreId', e.target.value)}>
            <option value="">— non collegare —</option>
            {giocatoriGenitore.map(g => (
              <option key={g.id} value={g.id}>{g.cognome} {g.nome} ({g.squadra})</option>
            ))}
          </select>
        </div>
      </>)}

      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

      <button type="submit"
        disabled={loading || !form.email.trim() || !form.ruolo}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60 active:scale-95 transition-transform">
        {ok
          ? <><CheckCircle2 size={16} /> Email inviata!</>
          : loading ? 'Invio in corso...'
          : <><UserPlus size={16} /> Invia invito</>}
      </button>

      {ok && (
        <p className="text-xs text-green-600 text-center bg-green-50 rounded-lg px-3 py-2">
          ✅ Email di invito inviata a <strong>{form.email}</strong>.<br />
          L'utente riceverà un link per impostare la propria password.
        </p>
      )}
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/InvitaUtenteForm.jsx
git commit -m "feat: add InvitaUtenteForm shared component with Supabase email magic link invite"
```

---

## Task 3: Aggiorna Admin SetupPage — sostituisce form invito

**Files:**
- Modify: `frontend/src/pages/SetupPage.jsx`

- [ ] **Step 1: Aggiungi import `InvitaUtenteForm` in cima al file**

Trova la riga (circa riga 9):
```js
import { supabase, supabaseAdmin } from '../lib/supabase'
```
Aggiungi subito dopo:
```js
import InvitaUtenteForm from '../components/InvitaUtenteForm'
```

- [ ] **Step 2: Rimuovi la funzione `handleInvite` da `UtentiTab` (righe 1052–1133)**

Elimina l'intera funzione:
```js
async function handleInvite(e) {
  // ... tutto il corpo fino alla chiusura }
}
```

- [ ] **Step 3: Rimuovi gli stati e funzioni solo dell'invite nel form password**

Dentro `UtentiTab`, rimuovi queste righe (circa 812–833):
```js
const [inviteForm, setInviteForm]   = useState({ ... })
const [inviting, setInviting]       = useState(false)
const [inviteErr, setInviteErr]     = useState(null)
const [inviteOk, setInviteOk]       = useState(false)
const [showPwd,   setShowPwd]       = useState(false)
const [copied,    setCopied]        = useState(false)
const setI = (k, v) => setInviteForm(f => ({ ...f, [k]: v }))

function generatePwd() { ... }
function copyPwd() { ... }
```
Mantieni: `const [showInvite, setShowInvite] = useState(false)` e `const [deleteErr, setDeleteErr] = useState(null)`.

- [ ] **Step 4: Nel JSX sostituisci il blocco `{showInvite && (...)}` con `InvitaUtenteForm`**

Trova il blocco che contiene il vecchio form (cerca `showInvite &&` e il `<form onSubmit={handleInvite}`). Sostituisci l'intera sezione con:

```jsx
{showInvite && (
  <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-semibold text-gray-800">Invita nuovo utente</p>
      <button
        onClick={() => setShowInvite(false)}
        className="text-xs text-gray-400 hover:text-gray-600">
        Chiudi ✕
      </button>
    </div>
    <InvitaUtenteForm
      ruoliConsentiti={['admin', 'allenatore', 'segreteria', 'genitore', 'giocatore', 'preparatore']}
      onSuccess={() => setShowInvite(false)}
    />
  </div>
)}
```

- [ ] **Step 5: Avvia dev server e verifica**

```bash
cd frontend && npm run dev
```

Vai su `/admin/setup/utenti` → clicca "Invita" → compila email + ruolo → premi "Invia invito". Verifica su Supabase Dashboard → Authentication → Users che l'utente appaia come "Invited" (non "Confirmed"). Verifica che arrivato l'email.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/SetupPage.jsx
git commit -m "feat: switch admin invite from manual password to Supabase email magic link"
```

---

## Task 4: Aggiungi invito in ImpostazioniSocieta (Segreteria)

**Files:**
- Modify: `frontend/src/pages/secretary/ImpostazioniSocieta.jsx`

- [ ] **Step 1: Aggiungi import**

In cima al file, dopo gli import esistenti:
```js
import InvitaUtenteForm from '../../components/InvitaUtenteForm'
```

- [ ] **Step 2: Aggiungi sezione "Gestione Accessi" nel JSX**

Trova la chiusura del `<div className="px-4 pb-24 max-w-2xl">` (è il wrapper principale, contiene tutti i card + il pulsante Salva). Inserisci questo blocco **dopo** il pulsante Salva e **prima** della chiusura `</div>`:

```jsx
{/* Gestione Accessi */}
<div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
    👥 Gestione Accessi
  </p>
  <p className="text-xs text-gray-400 mb-3">
    Invita genitori e giocatori. Riceveranno un'email con il link per accedere all'app.
  </p>
  <InvitaUtenteForm ruoliConsentiti={['genitore', 'giocatore']} />
</div>
```

- [ ] **Step 3: Verifica**

Vai su `/secretary/impostazioni` → scorri in fondo → verifica che la sezione "Gestione Accessi" sia visibile con il form di invito limitato a Genitore/Giocatore.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/secretary/ImpostazioniSocieta.jsx
git commit -m "feat: add user invite section to secretary settings (genitore/giocatore only)"
```

---

## Task 5: Pulsanti stampa in SegreteriaDashboard

**Files:**
- Modify: `frontend/src/pages/secretary/SegreteriaDashboard.jsx`

- [ ] **Step 1: Aggiungi import**

```js
import { Printer } from 'lucide-react'
import { usePrintWindow } from '../../hooks/usePrintWindow'
```

- [ ] **Step 2: Inizializza il hook dentro il componente**

Subito dopo `const navigate = useNavigate()`:
```js
const printWindow = usePrintWindow()
```

- [ ] **Step 3: Aggiungi funzione `printCert` prima del `return`**

```js
function printCert() {
  const tutti = [
    ...certScaduti.map(g => ({
      ...g,
      stato: `SCADUTO (${-differenceInDays(parseISO(g.cert_medico_scadenza), today)}gg fa)`,
      colorClass: 'red',
    })),
    ...certInScad.map(g => ({
      ...g,
      stato: `In scadenza (${differenceInDays(parseISO(g.cert_medico_scadenza), today)}gg)`,
      colorClass: 'orange',
    })),
  ]
  const rows = tutti.map(g => `
    <tr>
      <td>${g.cognome} ${g.nome}</td>
      <td>${g.squadra ?? '—'}</td>
      <td>${g.cert_medico_scadenza
        ? format(parseISO(g.cert_medico_scadenza), 'd/MM/yyyy')
        : '—'}</td>
      <td class="${g.colorClass}">${g.stato}</td>
    </tr>`).join('')
  printWindow(
    `Certificati Medici — ${format(today, 'd MMMM yyyy', { locale: it })}`,
    `<table>
      <thead><tr>
        <th>Cognome Nome</th><th>Squadra</th><th>Scadenza</th><th>Stato</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="summary">${tutti.length} giocatori con certificato da rinnovare</p>`,
    societaNome ?? ''
  )
}
```

- [ ] **Step 4: Aggiungi funzione `printQuote` prima del `return`**

```js
function printQuote() {
  const totale = quoteScadute.reduce((s, q) => s + (q.importo ?? 0), 0)
  const rows = quoteScadute.map(q => {
    const g = giocatoreMap[q.giocatore_id]
    return `<tr>
      <td>${g ? `${g.cognome} ${g.nome}` : '—'}</td>
      <td>${g?.squadra ?? '—'}</td>
      <td>${q.descrizione ?? q.tipo ?? '—'}</td>
      <td class="center">€ ${(q.importo ?? 0).toFixed(2)}</td>
      <td class="red">${q.data_scadenza
        ? format(parseISO(q.data_scadenza), 'd/MM/yyyy')
        : '—'}</td>
    </tr>`
  }).join('')
  printWindow(
    `Quote Non Pagate — ${format(today, 'd MMMM yyyy', { locale: it })}`,
    `<table>
      <thead><tr>
        <th>Giocatore</th><th>Squadra</th><th>Descrizione</th>
        <th>Importo</th><th>Scadenza</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="summary">
      Totale non pagato: € ${totale.toFixed(2)} — ${quoteScadute.length} rate
    </p>`,
    societaNome ?? ''
  )
}
```

- [ ] **Step 5: Sostituisci intestazione sezione "Certificati scaduti"**

Trova:
```jsx
<p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
  <AlertTriangle size={12} /> Certificati scaduti ({certScaduti.length})
</p>
```
Sostituisci con:
```jsx
<div className="flex items-center justify-between mb-2 px-1">
  <p className="text-xs font-semibold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
    <AlertTriangle size={12} /> Certificati scaduti ({certScaduti.length})
  </p>
  <button onClick={printCert}
    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
    <Printer size={12} /> Stampa
  </button>
</div>
```

- [ ] **Step 6: Sostituisci intestazione sezione "Certificati in scadenza"**

Trova:
```jsx
<p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
  <AlertTriangle size={12} /> In scadenza entro 30 giorni ({certInScad.length})
</p>
```
Sostituisci con:
```jsx
<div className="flex items-center justify-between mb-2 px-1">
  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
    <AlertTriangle size={12} /> In scadenza entro 30 giorni ({certInScad.length})
  </p>
  <button onClick={printCert}
    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
    <Printer size={12} /> Stampa
  </button>
</div>
```

- [ ] **Step 7: Sostituisci intestazione sezione "Quote scadute"**

Trova:
```jsx
<p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
  <AlertTriangle size={12} /> Quote scadute non pagate ({quoteScadute.length})
</p>
```
Sostituisci con:
```jsx
<div className="flex items-center justify-between mb-2 px-1">
  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider flex items-center gap-1.5">
    <AlertTriangle size={12} /> Quote scadute non pagate ({quoteScadute.length})
  </p>
  <button onClick={printQuote}
    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
    <Printer size={12} /> Stampa
  </button>
</div>
```

- [ ] **Step 8: Verifica**

Vai su `/secretary` → espandi "Cert. scaduti" → clicca "Stampa" → deve aprirsi una nuova finestra con la tabella e il dialogo di stampa del browser. Ripeti per quote.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/secretary/SegreteriaDashboard.jsx
git commit -m "feat: add print buttons for certificates and overdue fees in secretary dashboard"
```

---

## Task 6: Report presenze matriciale in PresenzeAdmin (Admin)

**Files:**
- Modify: `frontend/src/pages/admin/PresenzeAdmin.jsx`

- [ ] **Step 1: Aggiungi import**

Aggiungi in cima al file (dopo gli import esistenti):
```js
import { Printer } from 'lucide-react'
import { usePrintWindow } from '../../hooks/usePrintWindow'
```

- [ ] **Step 2: Modifica la firma di `SquadraDetail` per aggiungere `useState` e hook**

`SquadraDetail` usa già `useQuery` e `useMemo`. Aggiungi `useState` agli import React se non già presente (è nel file come `import { useState, useMemo } from 'react'` ✅).

Dentro la funzione `SquadraDetail`, dopo `const { societaId } = useAuth()` (già presente), aggiungi:
```js
const { societaNome } = useAuth()
const printWindow     = usePrintWindow()
const [isPrinting, setIsPrinting] = useState(false)
```

- [ ] **Step 3: Aggiungi funzione `handlePrint` dentro `SquadraDetail`**

Inseriscila dopo la dichiarazione di `mediaSquadra` (useMemo):

```js
async function handlePrint() {
  setIsPrinting(true)
  try {
    // Giocatori della squadra (già caricati, riusiamo gli stessi ids)
    const ids = giocatoriPresenze.map(g => g.id)
    if (!ids.length) return

    // Fetch presenze individuali per data (i dati aggregati non bastano)
    const { data: raw } = await supabase
      .from('presenze_allenamento')
      .select('giocatore_id, data, presente')
      .in('giocatore_id', ids)
      .gte('data', fromDate)
      .lte('data', toDate)
      .order('data')

    const presenze = raw ?? []

    // Date uniche ordinate
    const dates = [...new Set(presenze.map(p => p.data))].sort()
    if (!dates.length) {
      alert('Nessuna presenza registrata nel periodo selezionato.')
      return
    }

    // Matrice [giocatoreId][data] → presente (bool) | undefined
    const matrix = {}
    for (const p of presenze) {
      if (!matrix[p.giocatore_id]) matrix[p.giocatore_id] = {}
      matrix[p.giocatore_id][p.data] = p.presente
    }

    const fontSize = dates.length > 15 ? 'font-size:8px;' : ''

    const headerCols = dates.map(d =>
      `<th class="center" style="min-width:28px">${
        new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
      }</th>`
    ).join('')

    const rows = giocatoriPresenze.map(g => {
      const presRow  = matrix[g.id] ?? {}
      const totali   = dates.filter(d => presRow[d] !== undefined).length
      const presenti = dates.filter(d => presRow[d] === true).length
      const pct      = totali > 0 ? Math.round(presenti * 100 / totali) : null
      const cells = dates.map(d => {
        if (presRow[d] === undefined) return '<td class="center" style="color:#ccc">—</td>'
        return presRow[d] ? '<td class="center ok">✓</td>' : '<td class="center ko">·</td>'
      }).join('')
      return `<tr>
        <td><strong>${g.cognome}</strong> ${g.nome}</td>
        ${cells}
        <td class="center">${totali > 0 ? `${presenti}/${totali}` : '—'}</td>
        <td class="center" style="font-weight:bold">${pct !== null ? pct + '%' : '—'}</td>
      </tr>`
    }).join('')

    const media = mediaSquadra  // già calcolata dal useMemo esistente

    printWindow(
      `Presenze — ${squadra}`,
      `<p style="font-size:10px;color:#555;margin-bottom:8px">
        Periodo: <strong>${fromDate}</strong> → <strong>${toDate}</strong>
        &nbsp;·&nbsp; ${giocatoriPresenze.length} giocatori
        &nbsp;·&nbsp; ${dates.length} allenamenti registrati
      </p>
      <div style="overflow-x:auto;${fontSize}">
        <table>
          <thead>
            <tr>
              <th style="min-width:120px">Giocatore</th>
              ${headerCols}
              <th class="center">Tot.</th>
              <th class="center">%</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="background:#f9fafb;font-weight:bold">
              <td>Media squadra</td>
              ${dates.map(() => '<td></td>').join('')}
              <td></td>
              <td class="center">${media !== null ? media + '%' : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>`,
      societaNome ?? ''
    )
  } finally {
    setIsPrinting(false)
  }
}
```

- [ ] **Step 4: Sostituisci l'header di `SquadraDetail` per aggiungere il pulsante stampa**

Trova:
```jsx
<div className={`flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100 border-l-4 ${col.border}`}>
  <button onClick={onBack} className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg">
    <ChevronLeft size={18} />
  </button>
  <span className="font-semibold text-gray-800 text-sm flex-1">{squadra}</span>
  {mediaSquadra !== null && (
    <span className="text-xs text-gray-500">
      Media: <strong className="text-gray-700">{mediaSquadra}%</strong>
    </span>
  )}
</div>
```
Sostituisci con:
```jsx
<div className={`flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100 border-l-4 ${col.border}`}>
  <button onClick={onBack} className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg">
    <ChevronLeft size={18} />
  </button>
  <span className="font-semibold text-gray-800 text-sm flex-1">{squadra}</span>
  {mediaSquadra !== null && (
    <span className="text-xs text-gray-500 hidden sm:inline">
      Media: <strong className="text-gray-700">{mediaSquadra}%</strong>
    </span>
  )}
  <button
    onClick={handlePrint}
    disabled={isPrinting}
    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50 px-2 py-1 rounded-lg border border-gray-200"
  >
    <Printer size={13} />
    <span>{isPrinting ? '...' : 'Stampa'}</span>
  </button>
</div>
```

- [ ] **Step 5: Verifica**

Vai su `/admin/presenze` → seleziona una squadra → clicca "Stampa" → deve aprirsi la finestra con la tabella `✓/·` a colonne-date × righe-giocatori.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/PresenzeAdmin.jsx
git commit -m "feat: add attendance matrix print report to admin PresenzeAdmin"
```

---

## Task 7: Report presenze matriciale in StatistichePage (Coach + Admin)

**Files:**
- Modify: `frontend/src/pages/StatistichePage.jsx`

- [ ] **Step 1: Aggiungi import**

```js
import { Printer } from 'lucide-react'
import { usePrintWindow } from '../hooks/usePrintWindow'
```

- [ ] **Step 2: Aggiungi hook e `societaNome` dentro il componente**

Modifica la riga esistente:
```js
const { societaId, isAdmin, squadreAllenatore } = useAuth()
```
In:
```js
const { societaId, isAdmin, squadreAllenatore, societaNome } = useAuth()
```

Aggiungi dopo `const [refDate, setRefDate] = useState(new Date())`:
```js
const printWindow = usePrintWindow()
```

- [ ] **Step 3: Aggiungi funzione `printSquadra` dentro il componente (prima del `return`)**

```js
function printSquadra(squadra, lista) {
  // Date uniche per questa squadra nel mese selezionato (da presenzeAl già caricato)
  const dates = [...new Set(
    presenzeAl
      .filter(p => lista.some(g => g.id === p.giocatore_id))
      .map(p => p.data)
  )].sort()

  if (!dates.length) {
    alert('Nessuna presenza registrata per questa squadra nel mese selezionato.')
    return
  }

  // Matrice [giocatoreId][data] → presente
  const matrix = {}
  for (const p of presenzeAl.filter(p => lista.some(g => g.id === p.giocatore_id))) {
    if (!matrix[p.giocatore_id]) matrix[p.giocatore_id] = {}
    matrix[p.giocatore_id][p.data] = p.presente
  }

  const fontSize = dates.length > 15 ? 'font-size:8px;' : ''

  const headerCols = dates.map(d =>
    `<th class="center" style="min-width:28px">${
      new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
    }</th>`
  ).join('')

  const sortedLista = [...lista].sort((a, b) => a.cognome.localeCompare(b.cognome))

  const rows = sortedLista.map(g => {
    const presRow  = matrix[g.id] ?? {}
    const totali   = dates.filter(d => presRow[d] !== undefined).length
    const presenti = dates.filter(d => presRow[d] === true).length
    const pct      = totali > 0 ? Math.round(presenti * 100 / totali) : null
    const cells = dates.map(d => {
      if (presRow[d] === undefined) return '<td class="center" style="color:#ccc">—</td>'
      return presRow[d] ? '<td class="center ok">✓</td>' : '<td class="center ko">·</td>'
    }).join('')
    return `<tr>
      <td><strong>${g.cognome}</strong> ${g.nome}</td>
      ${cells}
      <td class="center">${totali > 0 ? `${presenti}/${totali}` : '—'}</td>
      <td class="center" style="font-weight:bold">${pct !== null ? pct + '%' : '—'}</td>
    </tr>`
  }).join('')

  const conDati = sortedLista.map(g => {
    const presRow = matrix[g.id] ?? {}
    const tot  = dates.filter(d => presRow[d] !== undefined).length
    const pres = dates.filter(d => presRow[d] === true).length
    return tot > 0 ? Math.round(pres * 100 / tot) : null
  }).filter(v => v !== null)
  const media = conDati.length > 0
    ? Math.round(conDati.reduce((a, b) => a + b, 0) / conDati.length)
    : null

  printWindow(
    `Presenze — ${squadra} — ${format(refDate, 'MMMM yyyy', { locale: it })}`,
    `<p style="font-size:10px;color:#555;margin-bottom:8px">
      ${lista.length} giocatori &nbsp;·&nbsp; ${dates.length} allenamenti registrati
    </p>
    <div style="overflow-x:auto;${fontSize}">
      <table>
        <thead>
          <tr>
            <th style="min-width:120px">Giocatore</th>
            ${headerCols}
            <th class="center">Tot.</th>
            <th class="center">%</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="background:#f9fafb;font-weight:bold">
            <td>Media squadra</td>
            ${dates.map(() => '<td></td>').join('')}
            <td></td>
            <td class="center">${media !== null ? media + '%' : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>`,
    societaNome ?? ''
  )
}
```

- [ ] **Step 4: Aggiungi pulsante "Stampa" nell'header di ogni squadra nel JSX**

Trova il blocco (circa riga 165):
```jsx
<div className="flex items-center justify-between mb-2">
  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{squadra}</h2>
  <span className="text-xs text-gray-400">
    {totAl} allenament{totAl === 1 ? 'o' : 'i'}
  </span>
</div>
```
Sostituisci con:
```jsx
<div className="flex items-center justify-between mb-2">
  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{squadra}</h2>
  <div className="flex items-center gap-3">
    <span className="text-xs text-gray-400">
      {totAl} allenament{totAl === 1 ? 'o' : 'i'}
    </span>
    {totAl > 0 && (
      <button
        onClick={() => printSquadra(squadra, lista)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"
      >
        <Printer size={12} /> Stampa
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 5: Verifica (come allenatore o admin)**

Vai su `/admin` (o login come allenatore) → cerca la sezione statistiche/presenze → seleziona mese con dati → clicca "Stampa" su una squadra → verifica tabella matriciale.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/StatistichePage.jsx
git commit -m "feat: add monthly attendance matrix print report to StatistichePage (coach/admin)"
```

---

## Task 8: Push finale

- [ ] **Step 1: Verifica stato git**

```bash
git log --oneline -8
```

Expected (7 nuovi commit):
```
feat: add monthly attendance matrix print report to StatistichePage (coach/admin)
feat: add attendance matrix print report to admin PresenzeAdmin
feat: add print buttons for certificates and overdue fees in secretary dashboard
feat: add user invite section to secretary settings (genitore/giocatore only)
feat: switch admin invite from manual password to Supabase email magic link
feat: add InvitaUtenteForm shared component with Supabase email magic link invite
feat: add usePrintWindow hook for browser-based PDF printing
```

- [ ] **Step 2: Push**

```bash
git push origin master
```

---

## Self-Review

**Copertura spec:**
- ✅ `usePrintWindow` hook — Task 1
- ✅ `InvitaUtenteForm` con `ruoliConsentiti` — Task 2
- ✅ Email magica `inviteUserByEmail` — Task 2 + 3
- ✅ Admin usa InvitaUtenteForm (tutti i ruoli) — Task 3
- ✅ Segreteria usa InvitaUtenteForm (genitore/giocatore) — Task 4
- ✅ Print quote non pagate — Task 5
- ✅ Print certificati scaduti + in scadenza — Task 5
- ✅ Print presenze matrice admin — Task 6
- ✅ Print presenze matrice coach — Task 7
- ✅ Nessuna libreria aggiuntiva — tutto in-browser ✅

**Placeholder:** nessuno trovato.

**Consistenza tipi:**
- `printWindow(titolo, htmlBody, intestazioneSocieta)` — firma identica in tutti i task ✅
- `InvitaUtenteForm` props: `ruoliConsentiti: string[]`, `onSuccess?: () => void` — usate uguale in Task 3 e 4 ✅
- `giocatoriPresenze` in Task 6 proviene dalla query esistente in `SquadraDetail` — `.map(g => g.id)` funziona perché la query già restituisce `id, nome, cognome` ✅
- `presenzeAl` in Task 7 è già in scope nel componente `StatistichePage` con i campi `giocatore_id, squadra, data, presente` ✅
