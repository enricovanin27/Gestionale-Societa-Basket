# Semplificazione Setup Segreteria — Piano di Implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fixare bug UUID e dropdown squadre, sostituire il form giocatori con un wizard 3-step che include invito genitore, spostare Resoconto in QuotePage, aggiungere CertificatiPage per panoramica certificati.

**Architecture:** Modifiche esclusivamente al layer frontend React. Nessun cambiamento al backend o al DB. Il wizard `GiocatoreWizard.jsx` sostituisce il modal in `GiocatoriPage`. La funzione `certStatus()` viene estratta in `utils/certStatus.js` e condivisa tra `GiocatoriPage` e `CertificatiPage`. Il resoconto viene incorporato come sezione collapsible in `QuotePage`. `CertificatiPage` riusa il pattern lista-squadre → drill-down di `QuotePage`.

**Tech Stack:** React 18, TanStack Query v5, Supabase JS + supabaseAdmin, Tailwind CSS, Lucide React, React Router v6, date-fns

**Nota test:** Il progetto non ha infrastruttura di test automatici. Ogni task include passi di verifica manuale (`cd frontend && npm run dev`).

---

## File Map

| File | Azione |
|------|--------|
| `frontend/src/utils/certStatus.js` | CREA — funzione `certStatus()` condivisa |
| `frontend/src/pages/secretary/GiocatoreForm.jsx` | MODIFICA — fix UUID (`genitore_user_id`), fix squadre da tabella ufficiale |
| `frontend/src/pages/secretary/GiocatoriPage.jsx` | MODIFICA — fix save handler, importa `certStatus` da utils, usa `GiocatoreWizard` |
| `frontend/src/pages/secretary/GiocatoreWizard.jsx` | CREA — wizard 3 step (squadra → anagrafica → genitore/account) |
| `frontend/src/pages/secretary/QuotePage.jsx` | MODIFICA — aggiunge sezione resoconto collapsible in fondo |
| `frontend/src/pages/secretary/CertificatiPage.jsx` | CREA — lista squadre → drill-down stato cert per giocatore |
| `frontend/src/layouts/SecretaryLayout.jsx` | MODIFICA — rimuove Resoconto dal nav, aggiunge Certificati |
| `frontend/src/App.jsx` | MODIFICA — aggiunge route `/secretary/certificati` |

---

### Task 1: Fix bug UUID e fix squadre in GiocatoreForm

**Files:**
- Modify: `frontend/src/pages/secretary/GiocatoreForm.jsx`
- Modify: `frontend/src/pages/secretary/GiocatoriPage.jsx`

- [ ] **Step 1.1: Fix `EMPTY` — imposta `genitore_user_id: null` invece di `''`**

In `GiocatoreForm.jsx` riga 6–14, sostituisci l'intera costante `EMPTY`:

```js
const EMPTY = {
  cognome: '', nome: '', data_nascita: '', luogo_nascita: '', codice_fiscale: '',
  indirizzo: '', citta: '', cap: '', provincia: '',
  nome_genitore: '', cognome_genitore: '', codice_fiscale_genitore: '',
  telefono: '', email_genitore: '',
  squadra: '', squadra2: '', squadra3: '', numero_maglia: '',
  data_iscrizione: '', cert_medico_scadenza: '',
  genitore_user_id: null,   // era '', causa crash UUID in Supabase
}
```

- [ ] **Step 1.2: Fix squadre dropdown — usa tabella `squadre` ufficiale invece dei giocatori esistenti**

In `GiocatoreForm.jsx` righe 27–45, sostituisci l'intera query `squadreList`:

```js
const { data: squadreList = [] } = useQuery({
  queryKey: ['squadre-segreteria', societaId],
  enabled: !!societaId,
  staleTime: 5 * 60_000,
  queryFn: async () => {
    const { data } = await supabase
      .from('squadre')
      .select('categoria')
      .eq('societa_id', societaId)
      .order('categoria')
    return (data ?? []).map(r => r.categoria).filter(Boolean)
  },
})
```

- [ ] **Step 1.3: Aggiorna `datalist` per usare `squadreList` direttamente (non è cambiato nulla nel JSX, ma verifica che `datalist` usi ancora `squadreList`)**

Il JSX riga 69–71 usa già `{squadreList.map(...)}` — nessuna modifica necessaria lì.

- [ ] **Step 1.4: Fix save handler in `GiocatoriPage.jsx` — garantisce `genitore_user_id: null`**

In `GiocatoriPage.jsx` funzione `handleAddGiocatore` (righe 29–51), aggiorna l'oggetto passato a `.insert()`:

```js
async function handleAddGiocatore(formData) {
  setSavingAdd(true)
  try {
    const { error } = await supabase.from('giocatori').insert([{
      ...formData,
      societa_id:           societaId,
      attivo:               true,
      squadra2:             formData.squadra2             || null,
      squadra3:             formData.squadra3             || null,
      data_nascita:         formData.data_nascita         || null,
      data_iscrizione:      formData.data_iscrizione      || null,
      cert_medico_scadenza: formData.cert_medico_scadenza || null,
      numero_maglia:        formData.numero_maglia ? parseInt(formData.numero_maglia) : null,
      genitore_user_id:     formData.genitore_user_id     || null,  // ← FIX: era mancante
    }])
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
    setShowAdd(false)
  } catch (err) {
    alert('Errore: ' + err.message)
  } finally {
    setSavingAdd(false)
  }
}
```

- [ ] **Step 1.5: Verifica manuale**

```bash
cd frontend && npm run dev
```
1. Vai su `/secretary/giocatori`
2. Clicca `+` per aggiungere un giocatore
3. Compila cognome, nome, squadra (verifica che il datalist mostri le squadre dalla tabella ufficiale)
4. Lascia "Account app" su "Nessun account" (select vuoto)
5. Clicca Salva → nessun errore UUID

- [ ] **Step 1.6: Commit**

```bash
git add frontend/src/pages/secretary/GiocatoreForm.jsx \
        frontend/src/pages/secretary/GiocatoriPage.jsx
git commit -m "fix: UUID crash e dropdown squadre in GiocatoreForm

- genitore_user_id default null invece di '' (fix 'invalid input syntax for type uuid')
- squadre caricate da tabella squadre ufficiale invece da giocatori esistenti
- fix save handler in GiocatoriPage per garantire genitore_user_id null"
```

---

### Task 2: Estrai `certStatus` in utility condivisa

**Files:**
- Create: `frontend/src/utils/certStatus.js`
- Modify: `frontend/src/pages/secretary/GiocatoriPage.jsx`

- [ ] **Step 2.1: Crea `frontend/src/utils/certStatus.js`**

```js
import { differenceInDays, parseISO } from 'date-fns'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

/**
 * Restituisce stato, label e flag urgenza per una data di scadenza certificato medico.
 * @param {string|null} dataScadenza - data in formato 'yyyy-MM-dd' o null
 * @returns {{ label: string, cls: string, urgente: boolean }}
 */
export function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'N/D', cls: 'bg-gray-100 text-gray-500', urgente: false }
  const diff = differenceInDays(parseISO(dataScadenza), new Date())
  if (diff < 0)  return { label: 'Scaduto',   cls: 'bg-red-100 text-red-700',       urgente: true }
  if (diff < 30) return { label: `${diff}gg`,  cls: 'bg-orange-100 text-orange-700', urgente: true }
  return {
    label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }),
    cls:   'bg-green-100 text-green-700',
    urgente: false,
  }
}
```

- [ ] **Step 2.2: Aggiorna `GiocatoriPage.jsx` — importa da utils e rimuovi la definizione locale**

Aggiungi l'import in cima (dopo gli import esistenti):

```js
import { certStatus } from '../../utils/certStatus'
```

Rimuovi le righe 13–19 di `GiocatoriPage.jsx` (la funzione `certStatus` locale):

```js
// ELIMINA questo blocco:
function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'N/D', cls: 'bg-gray-100 text-gray-500', urgente: false }
  const diff = differenceInDays(parseISO(dataScadenza), new Date())
  if (diff < 0)  return { label: 'Scaduto',    cls: 'bg-red-100 text-red-700',    urgente: true }
  if (diff < 30) return { label: `${diff}gg`,  cls: 'bg-orange-100 text-orange-700', urgente: true }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-green-100 text-green-700', urgente: false }
}
```

- [ ] **Step 2.3: Verifica che `GiocatoriPage` funzioni ancora**

```bash
cd frontend && npm run dev
```
Naviga su `/secretary/giocatori` → seleziona una squadra → verifica che i badge stato certificato siano ancora visibili e colorati correttamente.

- [ ] **Step 2.4: Commit**

```bash
git add frontend/src/utils/certStatus.js \
        frontend/src/pages/secretary/GiocatoriPage.jsx
git commit -m "refactor: estrai certStatus in utils/certStatus.js

Funzione condivisa tra GiocatoriPage e la futura CertificatiPage"
```

---

### Task 3: Crea `GiocatoreWizard.jsx` — struttura e Step 1 (Squadra)

**Files:**
- Create: `frontend/src/pages/secretary/GiocatoreWizard.jsx`

- [ ] **Step 3.1: Crea il file con struttura base, stato, Step 1**

Crea `frontend/src/pages/secretary/GiocatoreWizard.jsx`:

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase, supabaseAdmin } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

// ─── Stato iniziale ────────────────────────────────────────────────────────────

const STEP1_EMPTY = {
  squadra: '', squadra2: '', squadra3: '',
  numero_maglia: '', data_iscrizione: '',
}

const STEP2_EMPTY = {
  cognome: '', nome: '',
  data_nascita: '', luogo_nascita: '', codice_fiscale: '',
  indirizzo: '', citta: '', cap: '', provincia: '',
  cert_medico_scadenza: '',
}

const STEP3_EMPTY = {
  nome_genitore: '', cognome_genitore: '', codice_fiscale_genitore: '',
  telefono: '', email_genitore: '',
  accountOption: 'invite',  // 'invite' | 'link' | 'skip'
  genitore_user_id: null,
}

// ─── Stili condivisi ───────────────────────────────────────────────────────────

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'
const sec = 'text-xs font-bold text-gray-400 uppercase tracking-widest mb-3'

// ─── Indicatore step ──────────────────────────────────────────────────────────

function StepIndicator({ step }) {
  const steps = ['Squadra', 'Anagrafica', 'Genitore']
  return (
    <div className="flex gap-2 mb-6">
      {steps.map((label, i) => {
        const n = i + 1
        const done    = step > n
        const current = step === n
        return (
          <div key={n} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              done    ? 'bg-green-500 text-white' :
              current ? 'bg-purple-600 text-white' :
                        'bg-gray-200 text-gray-400'
            }`}>
              {done ? '✓' : n}
            </div>
            <span className={`text-[10px] font-medium ${current ? 'text-purple-600' : 'text-gray-400'}`}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1: Squadra ──────────────────────────────────────────────────────────

function Step1({ data, onChange, onNext, onCancel, squadreList }) {
  const canNext = !!data.squadra.trim()
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Squadra principale *</label>
        <select
          className={inp}
          value={data.squadra}
          onChange={e => onChange({ ...data, squadra: e.target.value })}
          required
        >
          <option value="">— Seleziona squadra —</option>
          {squadreList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {squadreList.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            Nessuna squadra configurata. L'admin deve aggiungere le squadre dal Setup.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Squadra 2 <span className="text-gray-300">(opz.)</span></label>
          <select
            className={inp}
            value={data.squadra2}
            onChange={e => onChange({ ...data, squadra2: e.target.value })}
          >
            <option value="">— nessuna —</option>
            {squadreList.filter(s => s !== data.squadra).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Squadra 3 <span className="text-gray-300">(opz.)</span></label>
          <select
            className={inp}
            value={data.squadra3}
            onChange={e => onChange({ ...data, squadra3: e.target.value })}
          >
            <option value="">— nessuna —</option>
            {squadreList.filter(s => s !== data.squadra && s !== data.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">N° maglia <span className="text-gray-300">(opz.)</span></label>
          <input
            type="number" min="1" max="99" className={inp}
            value={data.numero_maglia}
            onChange={e => onChange({ ...data, numero_maglia: e.target.value })}
            placeholder="es. 7"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Data iscrizione <span className="text-gray-300">(opz.)</span></label>
          <input
            type="date" className={inp}
            value={data.data_iscrizione}
            onChange={e => onChange({ ...data, data_iscrizione: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
          Annulla
        </button>
        <button type="button" onClick={onNext} disabled={!canNext}
          className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1 active:scale-95 transition-transform">
          Avanti <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Step 2: Anagrafica ────────────────────────────────────────────────────────

function Step2({ data, onChange, onNext, onBack }) {
  const canNext = !!data.cognome.trim() && !!data.nome.trim()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Cognome *</label>
          <input className={inp} value={data.cognome} onChange={e => onChange({ ...data, cognome: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
          <input className={inp} value={data.nome} onChange={e => onChange({ ...data, nome: e.target.value })} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Data nascita</label>
          <input type="date" className={inp} value={data.data_nascita} onChange={e => onChange({ ...data, data_nascita: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Luogo nascita</label>
          <input className={inp} value={data.luogo_nascita} onChange={e => onChange({ ...data, luogo_nascita: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Codice fiscale</label>
        <input
          className={inp + ' uppercase font-mono'}
          value={data.codice_fiscale}
          onChange={e => onChange({ ...data, codice_fiscale: e.target.value.toUpperCase() })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Indirizzo</label>
          <input className={inp} value={data.indirizzo} onChange={e => onChange({ ...data, indirizzo: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Città</label>
          <input className={inp} value={data.citta} onChange={e => onChange({ ...data, citta: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">CAP</label>
          <input className={inp} value={data.cap} onChange={e => onChange({ ...data, cap: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Provincia</label>
          <input className={inp} value={data.provincia} onChange={e => onChange({ ...data, provincia: e.target.value })} maxLength={2} />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Scad. certificato medico</label>
        <input type="date" className={inp} value={data.cert_medico_scadenza}
          onChange={e => onChange({ ...data, cert_medico_scadenza: e.target.value })} />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBack}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1">
          <ChevronLeft size={16} /> Indietro
        </button>
        <button type="button" onClick={onNext} disabled={!canNext}
          className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1 active:scale-95 transition-transform">
          Avanti <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Step 3: Genitore + Account ───────────────────────────────────────────────

function Step3({ data, onChange, onSave, onSaveSkip, onBack, saving, genitori }) {
  const emailFilled = !!data.email_genitore.trim()

  return (
    <div className="space-y-5">

      {/* Dati contatto */}
      <section>
        <p className={sec}>Genitore / Tutore</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Cognome</label>
              <input className={inp} value={data.cognome_genitore} onChange={e => onChange({ ...data, cognome_genitore: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nome</label>
              <input className={inp} value={data.nome_genitore} onChange={e => onChange({ ...data, nome_genitore: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Codice fiscale genitore</label>
            <input className={inp + ' uppercase font-mono'} value={data.codice_fiscale_genitore}
              onChange={e => onChange({ ...data, codice_fiscale_genitore: e.target.value.toUpperCase() })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefono</label>
              <input type="tel" className={inp} value={data.telefono} onChange={e => onChange({ ...data, telefono: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input type="email" className={inp} value={data.email_genitore}
                onChange={e => onChange({ ...data, email_genitore: e.target.value })} />
            </div>
          </div>
        </div>
      </section>

      {/* Account app */}
      <section>
        <p className={sec}>Account app</p>
        <div className="space-y-2">

          {/* Opzione: invia invito */}
          <label className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
            data.accountOption === 'invite' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'
          }`}>
            <input type="radio" name="accountOption" value="invite" className="mt-0.5 accent-purple-600"
              checked={data.accountOption === 'invite'}
              onChange={() => onChange({ ...data, accountOption: 'invite' })} />
            <div>
              <p className="text-sm font-semibold text-gray-800">Invia invito via email</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Il genitore riceve un link per creare la password e accedere all'app.
                {!emailFilled && <span className="text-amber-600"> (inserisci l'email sopra)</span>}
              </p>
            </div>
          </label>

          {/* Opzione: collega esistente */}
          <label className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
            data.accountOption === 'link' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'
          }`}>
            <input type="radio" name="accountOption" value="link" className="mt-0.5 accent-purple-600"
              checked={data.accountOption === 'link'}
              onChange={() => onChange({ ...data, accountOption: 'link', genitore_user_id: null })} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Collega account esistente</p>
              <p className="text-xs text-gray-500 mt-0.5">Il genitore è già registrato in app.</p>
              {data.accountOption === 'link' && (
                <select className={inp + ' mt-2'} value={data.genitore_user_id ?? ''}
                  onChange={e => onChange({ ...data, genitore_user_id: e.target.value || null })}>
                  <option value="">— Seleziona genitore —</option>
                  {genitori.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.cognome} {g.nome}{g.email ? ` (${g.email})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </label>

          {/* Opzione: salta */}
          <label className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
            data.accountOption === 'skip' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'
          }`}>
            <input type="radio" name="accountOption" value="skip" className="mt-0.5 accent-purple-600"
              checked={data.accountOption === 'skip'}
              onChange={() => onChange({ ...data, accountOption: 'skip', genitore_user_id: null })} />
            <div>
              <p className="text-sm font-semibold text-gray-800">Salta — aggiungi in seguito</p>
              <p className="text-xs text-gray-500 mt-0.5">Il giocatore viene salvato senza account genitore.</p>
            </div>
          </label>
        </div>
      </section>

      {/* Azioni */}
      <div className="flex gap-3 pt-2 pb-2">
        <button type="button" onClick={onBack}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1">
          <ChevronLeft size={16} /> Indietro
        </button>
        {data.accountOption === 'skip' ? (
          <button type="button" onClick={onSaveSkip} disabled={saving}
            className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform">
            {saving ? 'Salvataggio...' : 'Salva senza account'}
          </button>
        ) : (
          <button type="button" onClick={onSave} disabled={saving || (data.accountOption === 'invite' && !emailFilled) || (data.accountOption === 'link' && !data.genitore_user_id)}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform">
            {saving ? 'Salvataggio...' : data.accountOption === 'invite' ? '✉️ Salva e invia invito' : '🔗 Salva e collega account'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Componente principale ─────────────────────────────────────────────────────

export default function GiocatoreWizard({ onDone, onCancel }) {
  const { societaId } = useAuth()
  const [step,    setStep]    = useState(1)
  const [step1,   setStep1]   = useState(STEP1_EMPTY)
  const [step2,   setStep2]   = useState(STEP2_EMPTY)
  const [step3,   setStep3]   = useState(STEP3_EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState(null)

  const { data: squadreList = [] } = useQuery({
    queryKey: ['squadre-segreteria', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
  })

  const { data: genitori = [] } = useQuery({
    queryKey: ['genitori-profiles', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles').select('id, nome, cognome, email')
        .eq('societa_id', societaId)
        .or('ruolo.eq.genitore,ruoli_extra.cs.{genitore}')
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  async function saveGiocatore(accountOption) {
    setSaving(true)
    setSaveErr(null)
    try {
      // 1. Inserisci giocatore
      const { data: inserted, error: insertErr } = await supabase
        .from('giocatori')
        .insert([{
          societa_id:           societaId,
          attivo:               true,
          squadra:              step1.squadra,
          squadra2:             step1.squadra2             || null,
          squadra3:             step1.squadra3             || null,
          numero_maglia:        step1.numero_maglia ? parseInt(step1.numero_maglia) : null,
          data_iscrizione:      step1.data_iscrizione      || null,
          cognome:              step2.cognome,
          nome:                 step2.nome,
          data_nascita:         step2.data_nascita         || null,
          luogo_nascita:        step2.luogo_nascita        || null,
          codice_fiscale:       step2.codice_fiscale       || null,
          indirizzo:            step2.indirizzo            || null,
          citta:                step2.citta                || null,
          cap:                  step2.cap                  || null,
          provincia:            step2.provincia            || null,
          cert_medico_scadenza: step2.cert_medico_scadenza || null,
          nome_genitore:        step3.nome_genitore        || null,
          cognome_genitore:     step3.cognome_genitore     || null,
          codice_fiscale_genitore: step3.codice_fiscale_genitore || null,
          telefono:             step3.telefono             || null,
          email_genitore:       step3.email_genitore       || null,
          genitore_user_id:     null, // verrà aggiornato dopo se necessario
        }])
        .select('id')
        .single()
      if (insertErr) throw insertErr
      const giocatoreId = inserted.id

      // 2. Gestione account
      if (accountOption === 'invite') {
        if (!supabaseAdmin) throw new Error('Service role key non configurata (VITE_SUPABASE_SERVICE_ROLE_KEY). Impossibile inviare l\'invito.')
        const { data: invData, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          step3.email_genitore.trim(),
          {
            data: {
              ruolo:      'genitore',
              nome:       step3.nome_genitore.trim()    || null,
              cognome:    step3.cognome_genitore.trim() || null,
              societa_id: societaId,
            },
            redirectTo: window.location.origin + '/login',
          }
        )
        if (invErr) throw invErr
        const newUserId = invData.user?.id
        if (newUserId) {
          // Crea profilo genitore
          await supabase.from('profiles').upsert([{
            id:               newUserId,
            email:            step3.email_genitore.trim(),
            nome:             step3.nome_genitore.trim()    || null,
            cognome:          step3.cognome_genitore.trim() || null,
            ruolo:            'genitore',
            societa_id:       societaId,
            attivo:           true,
            genitore_squadra: step1.squadra  || null,
            genitore_squadra2: step1.squadra2 || null,
            genitore_squadra3: step1.squadra3 || null,
          }], { onConflict: 'id' })
          // Collega al giocatore
          await supabase.from('giocatori').update({ genitore_user_id: newUserId }).eq('id', giocatoreId)
        }
      } else if (accountOption === 'link' && step3.genitore_user_id) {
        await supabase.from('giocatori').update({ genitore_user_id: step3.genitore_user_id }).eq('id', giocatoreId)
      }
      // accountOption === 'skip': niente da fare

      onDone()
    } catch (err) {
      setSaveErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-5 pt-4 pb-2">
      <StepIndicator step={step} />

      {saveErr && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          {saveErr}
        </div>
      )}

      {step === 1 && (
        <Step1
          data={step1} onChange={setStep1}
          onNext={() => setStep(2)} onCancel={onCancel}
          squadreList={squadreList}
        />
      )}
      {step === 2 && (
        <Step2
          data={step2} onChange={setStep2}
          onNext={() => setStep(3)} onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <Step3
          data={step3} onChange={setStep3}
          onSave={() => saveGiocatore(step3.accountOption)}
          onSaveSkip={() => saveGiocatore('skip')}
          onBack={() => setStep(2)}
          saving={saving}
          genitori={genitori}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3.2: Verifica che il file non abbia errori di sintassi**

```bash
cd frontend && npm run dev
```

Il dev server non deve mostrare errori di compilazione nel terminale (il wizard non è ancora integrato, ma deve compilare senza errori).

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/pages/secretary/GiocatoreWizard.jsx
git commit -m "feat: aggiungi GiocatoreWizard 3-step (squadra → anagrafica → genitore)"
```

---

### Task 4: Integra `GiocatoreWizard` in `GiocatoriPage`

**Files:**
- Modify: `frontend/src/pages/secretary/GiocatoriPage.jsx`

Il FAB `+` apre il wizard invece del vecchio modal con `GiocatoreForm`.

- [ ] **Step 4.1: Aggiungi import wizard e rimuovi import GiocatoreForm**

In `GiocatoriPage.jsx`, sostituisci:
```js
import GiocatoreForm from './GiocatoreForm'
```
con:
```js
import GiocatoreWizard from './GiocatoreWizard'
```

- [ ] **Step 4.2: Rimuovi stati non più necessari**

Rimuovi le seguenti righe da `GiocatoriPage.jsx`:
```js
const [savingAdd, setSavingAdd] = useState(false)
```
e la funzione `handleAddGiocatore` (righe 29–51) — il wizard gestisce il salvataggio internamente.

- [ ] **Step 4.3: Sostituisci il modal con il wizard**

Sostituisci l'intera costante `modal` (il blocco JSX che usava `GiocatoreForm`) con:

```jsx
const modal = showAdd && (
  <div className="fixed inset-0 bg-black/40 z-[200] overflow-y-auto">
    <div className="min-h-full flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Nuovo giocatore</h2>
          <button onClick={() => setShowAdd(false)}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <GiocatoreWizard
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
            qc.invalidateQueries({ queryKey: ['quote-nonpagate-map', societaId] })
            setShowAdd(false)
          }}
          onCancel={() => setShowAdd(false)}
        />
      </div>
    </div>
  </div>
)
```

- [ ] **Step 4.4: Verifica il flusso completo**

```bash
cd frontend && npm run dev
```
1. Vai su `/secretary/giocatori`
2. Clicca `+` → si apre la modale con il wizard
3. **Step 1**: seleziona una squadra → clicca Avanti
4. **Step 2**: inserisci cognome e nome → clicca Avanti
5. **Step 3**: scegli "Salta" → clicca "Salva senza account"
6. La modale si chiude, il giocatore appare nella lista della squadra selezionata
7. Ripeti con "Invia invito" (se VITE_SUPABASE_SERVICE_ROLE_KEY è configurata): inserisci email genitore → "Salva e invia invito" → verifica che non ci siano errori UUID

- [ ] **Step 4.5: Commit**

```bash
git add frontend/src/pages/secretary/GiocatoriPage.jsx
git commit -m "feat: sostituisce modal GiocatoreForm con GiocatoreWizard in GiocatoriPage"
```

---

### Task 5: Resoconto come sezione collapsible in `QuotePage`

**Files:**
- Modify: `frontend/src/pages/secretary/QuotePage.jsx`

- [ ] **Step 5.1: Aggiungi import necessari a `QuotePage.jsx`**

Aggiungi in cima (dopo gli import esistenti):

```js
import { ChevronDown, ChevronUp, Printer } from 'lucide-react'
import { format, parseISO, endOfMonth } from 'date-fns'
import { usePrintWindow } from '../../hooks/usePrintWindow'
```

- [ ] **Step 5.2: Aggiungi stati per resoconto nel componente `QuotePage`**

All'interno del componente `QuotePage`, dopo gli stati esistenti (`const [saving, setSaving] = useState(false)`), aggiungi:

```js
// ── Resoconto ─────────────────────────────────────────────────────────────────
const printWindow = usePrintWindow()
const today = new Date()
const [resoOpen,  setResoOpen]  = useState(false)
const [resoAnno,  setResoAnno]  = useState(today.getFullYear())
const [resoMese,  setResoMese]  = useState(today.getMonth() + 1)

const meseStart = `${resoAnno}-${String(resoMese).padStart(2, '0')}-01`
const meseEnd   = format(endOfMonth(new Date(resoAnno, resoMese - 1, 1)), 'yyyy-MM-dd')
const meseLabel = format(new Date(resoAnno, resoMese - 1, 1), 'MMMM yyyy', { locale: it })
const isFuture  = new Date(resoAnno, resoMese - 1, 1) > today

const METODO_LABEL = { contanti: 'Contanti', bonifico: 'Bonifico', pos: 'POS / Carta' }

const { data: pagamentiReso = [], isLoading: loadingReso } = useQuery({
  queryKey: ['resoconto-pagamenti', societaId, resoAnno, resoMese],
  enabled: !!societaId && resoOpen,
  queryFn: async () => {
    const { data } = await supabase
      .from('quote')
      .select(`
        id, tipo, descrizione, importo, data_pagamento, metodo_pagamento, numero_ricevuta,
        giocatore_id,
        giocatori!inner(nome, cognome, squadra)
      `)
      .eq('societa_id', societaId)
      .eq('pagato', true)
      .gte('data_pagamento', meseStart)
      .lte('data_pagamento', meseEnd)
      .order('data_pagamento')
      .order('numero_ricevuta', { ascending: true, nullsFirst: false })
    return data ?? []
  },
  staleTime: 2 * 60 * 1000,
})

const totaleReso = pagamentiReso.reduce((s, p) => s + (p.importo ?? 0), 0)

function prevMeseReso() {
  if (resoMese === 1) { setResoMese(12); setResoAnno(a => a - 1) }
  else setResoMese(m => m - 1)
}
function nextMeseReso() {
  if (resoMese === 12) { setResoMese(1); setResoAnno(a => a + 1) }
  else setResoMese(m => m + 1)
}

function printResoconto() {
  const rows = pagamentiReso.map(p => {
    const g = p.giocatori
    const numRic = p.numero_ricevuta
      ? `${resoAnno}-${String(p.numero_ricevuta).padStart(4, '0')}`
      : '—'
    return '<tr>' +
      '<td>' + numRic + '</td>' +
      '<td>' + (g ? g.cognome + ' ' + g.nome : '—') + '</td>' +
      '<td>' + (g?.squadra ?? '—') + '</td>' +
      '<td>' + (p.descrizione ?? p.tipo ?? '—') + '</td>' +
      '<td>' + (METODO_LABEL[p.metodo_pagamento] ?? '—') + '</td>' +
      '<td>' + (p.data_pagamento ? format(parseISO(p.data_pagamento), 'd/MM/yyyy') : '—') + '</td>' +
      '<td class="right">€ ' + (p.importo ?? 0).toFixed(2) + '</td>' +
      '</tr>'
  }).join('')
  printWindow(
    'Resoconto Pagamenti — ' + meseLabel,
    '<table><thead><tr><th>Ricevuta</th><th>Giocatore</th><th>Squadra</th>' +
    '<th>Descrizione</th><th>Metodo</th><th>Data</th><th>Importo</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<p class="summary">Totale incassato: € ' + totaleReso.toFixed(2) +
    ' — ' + pagamentiReso.length + ' pagamenti</p>',
    ''
  )
}
```

- [ ] **Step 5.3: Aggiungi la sezione resoconto in fondo alla vista lista squadre**

Nella vista lista squadre (`return ( <div>...` all'altezza della riga `{fab}` finale), aggiungi questo blocco **dopo** la `div` con la lista squadre e **prima** di `{fab}`:

```jsx
{/* ── Sezione Resoconto ──────────────────────────────────────────────── */}
<div className="px-4 pb-6 mt-4">
  <button
    onClick={() => setResoOpen(v => !v)}
    className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 active:bg-gray-50 transition-colors"
  >
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
        <Printer size={16} className="text-purple-600" />
      </div>
      <div className="text-left">
        <p className="text-sm font-semibold text-gray-900">Riepilogo mensile</p>
        <p className="text-xs text-gray-400">Pagamenti registrati per periodo</p>
      </div>
    </div>
    {resoOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
  </button>

  {resoOpen && (
    <div className="mt-3 space-y-3">
      {/* Selettore mese */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
        <button onClick={prevMeseReso} className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-transform">
          <ChevronLeft size={18} className="text-gray-600" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900 capitalize">{meseLabel}</p>
          <p className="text-xs text-gray-400">
            {loadingReso ? '…' : `${pagamentiReso.length} pagamenti`}
          </p>
        </div>
        <button onClick={nextMeseReso} disabled={isFuture}
          className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-transform disabled:opacity-30">
          <ChevronRight size={18} className="text-gray-600" />
        </button>
      </div>

      {loadingReso ? (
        <p className="text-center text-xs text-gray-400 py-4">Caricamento...</p>
      ) : pagamentiReso.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-6 capitalize">
          Nessun pagamento registrato in {meseLabel}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs text-purple-500 font-medium uppercase tracking-wider">Totale incassato</p>
              <p className="text-xl font-extrabold text-purple-700">€ {totaleReso.toFixed(2)}</p>
            </div>
            <button onClick={printResoconto}
              className="flex items-center gap-2 bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-semibold active:scale-95 transition-transform">
              <Printer size={14} /> Stampa tutto
            </button>
          </div>
          <div className="space-y-2">
            {pagamentiReso.map(p => {
              const g = p.giocatori
              const numRic = p.numero_ricevuta
                ? `${resoAnno}-${String(p.numero_ricevuta).padStart(4, '0')}`
                : null
              const dataPag = p.data_pagamento
                ? format(parseISO(p.data_pagamento), 'd MMM', { locale: it })
                : '—'
              return (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {g ? `${g.cognome} ${g.nome}` : 'Sconosciuto'}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{p.descrizione ?? p.tipo}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-gray-400">{dataPag}</span>
                      {g?.squadra && <span className="text-[11px] text-gray-400">· {g.squadra}</span>}
                      {p.metodo_pagamento && (
                        <span className="text-[11px] text-gray-400">· {METODO_LABEL[p.metodo_pagamento] ?? p.metodo_pagamento}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">€ {(p.importo ?? 0).toFixed(2)}</p>
                    {numRic && (
                      <button onClick={() => { const url = `/secretary/ricevuta/${p.id}`; const win = window.open(url, '_blank'); if (!win) window.location.href = url }}
                        className="flex items-center gap-0.5 text-[10px] text-purple-500 hover:text-purple-700 mt-0.5 ml-auto">
                        <Printer size={10} /> {numRic}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 5.4: Verifica**

```bash
cd frontend && npm run dev
```
1. Vai su `/secretary/quote`
2. Verifica che la lista squadre sia visibile
3. Scrolla in fondo → vedi la card "Riepilogo mensile"
4. Clicca per espandere → appare il selettore mese e la lista pagamenti
5. Il pulsante "Stampa tutto" apre la finestra di stampa

- [ ] **Step 5.5: Commit**

```bash
git add frontend/src/pages/secretary/QuotePage.jsx
git commit -m "feat: integra resoconto come sezione collapsible in fondo a QuotePage"
```

---

### Task 6: Crea `CertificatiPage`

**Files:**
- Create: `frontend/src/pages/secretary/CertificatiPage.jsx`

- [ ] **Step 6.1: Crea il file**

Crea `frontend/src/pages/secretary/CertificatiPage.jsx`:

```jsx
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, parseISO, format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight, ChevronLeft, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { certStatus } from '../../utils/certStatus'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function CertificatiPage() {
  const { societaId } = useAuth()
  const navigate = useNavigate()
  const [selectedSquadra, setSelectedSquadra] = useState(null)

  const { data: squadre = [], isLoading: loadingS } = useQuery({
    queryKey: ['squadre-segreteria', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(s => s.categoria)
    },
  })

  const { data: giocatori = [], isLoading: loadingG } = useQuery({
    queryKey: ['segreteria-giocatori', societaId],
    enabled: !!societaId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, cert_medico_scadenza')
        .eq('societa_id', societaId).eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  // Statistiche per squadra
  const squadraStats = useMemo(() => {
    const result = {}
    for (const s of squadre) {
      const inSquadra = giocatori.filter(g => g.squadra === s || g.squadra2 === s || g.squadra3 === s)
      const scaduti   = inSquadra.filter(g => {
        if (!g.cert_medico_scadenza) return false
        return differenceInDays(parseISO(g.cert_medico_scadenza), new Date()) < 0
      }).length
      const inScadenza = inSquadra.filter(g => {
        if (!g.cert_medico_scadenza) return false
        const d = differenceInDays(parseISO(g.cert_medico_scadenza), new Date())
        return d >= 0 && d < 30
      }).length
      const mancanti = inSquadra.filter(g => !g.cert_medico_scadenza).length
      result[s] = { nGiocatori: inSquadra.length, scaduti, inScadenza, mancanti }
    }
    return result
  }, [squadre, giocatori])

  const giocatoriInSquadra = useMemo(() => {
    if (!selectedSquadra) return []
    return giocatori.filter(g =>
      g.squadra === selectedSquadra || g.squadra2 === selectedSquadra || g.squadra3 === selectedSquadra
    )
  }, [selectedSquadra, giocatori])

  const isLoading = loadingS || loadingG

  // ── Vista drill-down squadra ─────────────────────────────────────────────────

  if (selectedSquadra !== null) {
    return (
      <div>
        <PageHeader title={selectedSquadra} subtitle={`${giocatoriInSquadra.length} atleti`} />
        <div className="px-4 pt-3 pb-2">
          <button onClick={() => setSelectedSquadra(null)}
            className="flex items-center gap-1 text-sm text-purple-600 font-medium">
            <ChevronLeft size={16} /> Tutte le squadre
          </button>
        </div>
        {isLoading ? <LoadingSpinner /> : (
          <div className="px-4 space-y-2 pb-28">
            {giocatoriInSquadra.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-16">Nessun giocatore in questa squadra</p>
            )}
            {giocatoriInSquadra.map(g => {
              const cert = certStatus(g.cert_medico_scadenza)
              return (
                <button key={g.id}
                  onClick={() => navigate(`/secretary/giocatori/${g.id}`)}
                  className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3 active:bg-gray-50 transition-colors text-left">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-purple-700">
                      {(g.cognome?.[0] ?? '')}{(g.nome?.[0] ?? '')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{g.cognome} {g.nome}</p>
                    {g.cert_medico_scadenza && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Scad. {format(parseISO(g.cert_medico_scadenza), 'd MMM yyyy', { locale: it })}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${cert.cls}`}>
                    {cert.label}
                  </span>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Vista lista squadre ──────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Certificati Medici" subtitle="Panoramica per squadra" />
      {isLoading ? <LoadingSpinner /> : (
        <div className="px-4 pt-4 space-y-2 pb-28">
          {squadre.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-16">Nessuna squadra configurata</p>
          )}
          {squadre.map(s => {
            const st = squadraStats[s] ?? {}
            const tuttoOk = (st.scaduti ?? 0) === 0 && (st.inScadenza ?? 0) === 0 && (st.mancanti ?? 0) === 0
            return (
              <button key={s} onClick={() => setSelectedSquadra(s)}
                className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors text-left">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Shield size={18} className="text-purple-600" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{st.nGiocatori ?? 0} atleti</p>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  {(st.scaduti ?? 0) > 0 && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                      {st.scaduti} scadut{st.scaduti === 1 ? 'o' : 'i'}
                    </span>
                  )}
                  {(st.inScadenza ?? 0) > 0 && (
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                      {st.inScadenza} in scadenza
                    </span>
                  )}
                  {(st.mancanti ?? 0) > 0 && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
                      {st.mancanti} N/D
                    </span>
                  )}
                  {tuttoOk && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                      In ordine ✓
                    </span>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6.2: Commit**

```bash
git add frontend/src/pages/secretary/CertificatiPage.jsx
git commit -m "feat: aggiungi CertificatiPage — panoramica certificati medici per squadra"
```

---

### Task 7: Routing e navigazione

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/layouts/SecretaryLayout.jsx`

- [ ] **Step 7.1: Aggiungi route in `App.jsx`**

In `App.jsx`, aggiungi l'import di `CertificatiPage` con gli altri import segreteria (righe 24–31):

```js
import CertificatiPage from './pages/secretary/CertificatiPage'
```

Nel blocco `<Route path="/secretary" ...>` (riga 179–187), aggiungi la route certificati e rimuovi la route resoconto:

```jsx
{/* prima: */}
<Route path="resoconto"       element={<ResocontoPage />} />

{/* dopo: */}
<Route path="certificati"     element={<CertificatiPage />} />
{/* la route /secretary/resoconto viene rimossa — il contenuto è ora in QuotePage */}
```

Il blocco route segreteria diventa:

```jsx
<Route path="/secretary" element={<ProtectedRoute requiredRole="segreteria"><SecretaryLayout /></ProtectedRoute>}>
  <Route index                  element={<SegreteriaDashboard />} />
  <Route path="giocatori"       element={<GiocatoriPage />} />
  <Route path="giocatori:id"   element={<GiocatoreDetail />} />
  <Route path="bacheca"         element={<BachecaPage />} />
  <Route path="quote"           element={<QuotePage />} />
  <Route path="certificati"     element={<CertificatiPage />} />
  <Route path="impostazioni"    element={<ImpostazioniSocieta />} />
</Route>
```

Rimuovi anche l'import di `ResocontoPage` se non è usato altrove:
```js
// Rimuovi: import ResocontoPage from './pages/secretary/ResocontoPage'
```

- [ ] **Step 7.2: Aggiorna `SecretaryLayout.jsx`**

Sostituisci l'intero contenuto di `frontend/src/layouts/SecretaryLayout.jsx`:

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Bell, Receipt, Settings, Shield } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'
import GuideDrawer from '../components/GuideDrawer'
import AppSidebar from '../components/AppSidebar'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl min-w-[44px] ${
    isActive ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function SecretaryLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  const sidebarItems = [
    { to: '/secretary',              end: true, icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/secretary/giocatori',               icon: Users,           label: 'Giocatori' },
    { to: '/secretary/quote',                   icon: Receipt,         label: 'Quote Squadre' },
    { to: '/secretary/certificati',             icon: Shield,          label: 'Certificati' },
    { to: '/secretary/bacheca',                 icon: Bell,            label: 'Bacheca', badge: unread },
    { to: '/secretary/impostazioni',            icon: Settings,        label: 'Impostazioni' },
  ]
  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar items={sidebarItems} accentColor="purple" />
      <div className="pb-20 lg:pb-0 lg:pl-56"><Outlet /></div>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/secretary" end className={cls}>
            <LayoutDashboard size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Dashboard</span>
          </NavLink>
          <NavLink to="/secretary/giocatori" className={cls}>
            <Users size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Giocatori</span>
          </NavLink>
          <NavLink to="/secretary/quote" className={cls}>
            <Receipt size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Quote Sq.</span>
          </NavLink>
          <NavLink to="/secretary/certificati" className={cls}>
            <Shield size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Certificati</span>
          </NavLink>
          <NavLink to="/secretary/bacheca" className={cls}>
            <div className="relative">
              <Bell size={22} strokeWidth={1.8} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Bacheca</span>
          </NavLink>
        </div>
      </nav>
      <GuideDrawer />
    </div>
  )
}
```

- [ ] **Step 7.3: Verifica routing completo**

```bash
cd frontend && npm run dev
```

Controlla:
1. La sidebar e il bottom nav mostrano "Certificati" al posto di "Resoconto"
2. `/secretary/certificati` → mostra la lista squadre con badge stato certificati
3. Click su una squadra → drill-down con lista giocatori e stato cert per ognuno
4. Click su un giocatore → naviga a `/secretary/giocatori/{id}`
5. `/secretary/quote` → in fondo alla pagina c'è "Riepilogo mensile" espandibile
6. `/secretary/resoconto` → 404 (route rimossa) — accettabile

- [ ] **Step 7.4: Commit finale**

```bash
git add frontend/src/App.jsx \
        frontend/src/layouts/SecretaryLayout.jsx
git commit -m "feat: routing segreteria — aggiunge /certificati, rimuove /resoconto

- SecretaryLayout: Resoconto → Certificati nel nav (sidebar + mobile)
- App.jsx: route /secretary/certificati, rimossa /secretary/resoconto"
```

---

## Self-Review

**Copertura spec:**
- ✅ Fix UUID `genitore_user_id` → Task 1
- ✅ Fix dropdown squadre da tabella ufficiale → Task 1
- ✅ Wizard 3 step (squadra → anagrafica → genitore) → Task 3–4
- ✅ N° maglia opzionale → Task 3 (campo `numero_maglia` senza `required`)
- ✅ Invito genitore via email dal wizard → Task 3 (Step3, opzione `invite`)
- ✅ Collega account esistente → Task 3 (opzione `link`)
- ✅ Salta account → Task 3 (opzione `skip`)
- ✅ Resoconto in fondo a QuotePage → Task 5
- ✅ CertificatiPage panoramica per squadra → Task 6
- ✅ Routing e navigazione aggiornati → Task 7

**Tipi e nomi consistenti:**
- `certStatus()` definita in Task 2, importata in Task 3 (GiocatoreWizard non la usa) e Task 6 (CertificatiPage la usa) ✅
- `squadreList` usato in Task 3 (Step1) con stesso nome della prop passata ✅
- `supabaseAdmin` importato in GiocatoreWizard da `'../../lib/supabase'` — stessa fonte di InvitaUtenteForm ✅
- Query key `['squadre-segreteria', societaId]` usata in Task 1, 3, 6 — coerente ✅
- Query key `['segreteria-giocatori', societaId]` invalidata in Task 4 — coerente con GiocatoriPage ✅
