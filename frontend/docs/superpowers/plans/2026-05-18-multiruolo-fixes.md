# Multiruolo Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Risolvere 5 bug relativi a utenti multi-ruolo, aggiunta allenamenti nel calendario, FAB home admin e rilevamento conflitti.

**Architecture:** Le modifiche toccano 3 file: `SetupPage.jsx` (Fix 1), `CalendarioPage.jsx` (Fix 2, 3, 5 — quest'ultimo incluso nel Task 3), `HomeAdmin.jsx` (Fix 4). EventForm viene reso named export per essere condiviso con HomeAdmin.

**Tech Stack:** React 18, Vite, TanStack Query v5, Supabase JS, Tailwind CSS, lucide-react, date-fns.

---

## File modificati

| File | Responsabilità |
|------|----------------|
| `src/pages/SetupPage.jsx` | Fix 1: mostra squadre anche con ruoli_extra genitore/giocatore |
| `src/pages/CalendarioPage.jsx` | Fix 2: path-based actingAsAllenatore; Fix 3: EventForm con tipo toggle; Fix 5: conflict check palestra allenamenti |
| `src/pages/home/HomeAdmin.jsx` | Fix 4: FAB + EventForm per aggiungere partita/allenamento |

---

## Task 1 — Fix 1: Setup utenti, squadre visibili con multi-ruolo

**Spec:** `docs/superpowers/specs/2026-05-18-multiruolo-fixes-design.md` § Fix 1

**Files:**
- Modify: `src/pages/SetupPage.jsx` — funzione `UtentiTab`, sezione lista utenti (riga ~1193-1212)

### Contesto
Nella `UtentiTab`, la griglia di 3 select per le squadre (squadra/squadra2/squadra3) viene mostrata solo se `u.ruolo === 'giocatore' || u.ruolo === 'genitore'`. Se il ruolo principale è `admin` ma `ruoli_extra` include `'genitore'` o `'giocatore'`, le squadre non compaiono. Inoltre la sezione manca di una label contestuale.

- [ ] **Step 1: Localizza il blocco da modificare**

Apri `src/pages/SetupPage.jsx`. Cerca il commento `{/* Squadre giocatore/genitore (3 select in griglia) */}` (riga ~1193). Il blocco attuale è:

```jsx
{/* Squadre giocatore/genitore (3 select in griglia) */}
{u.id !== me?.id && (u.ruolo === 'giocatore' || u.ruolo === 'genitore') && squadreDisp.length > 0 && (
  <div className="mt-2 grid grid-cols-3 gap-1.5">
    <select value={u.squadra ?? ''} onChange={e => squadraMut.mutate({ id: u.id, squadra: e.target.value || null })}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400">
      <option value="">Sq. 1</option>
      {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
    <select value={u.squadra2 ?? ''} onChange={e => squadra2Mut.mutate({ id: u.id, squadra2: e.target.value || null })}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400">
      <option value="">Sq. 2</option>
      {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra3).map(s => <option key={s} value={s}>{s}</option>)}
    </select>
    <select value={u.squadra3 ?? ''} onChange={e => squadra3Mut.mutate({ id: u.id, squadra3: e.target.value || null })}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400">
      <option value="">Sq. 3</option>
      {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
)}
```

- [ ] **Step 2: Aggiungi le variabili calcolate nel callback del map**

All'inizio del callback `utenti.map(u => {`, subito dopo `const isDisabled = u.attivo === false`, aggiungi:

```js
const needsSquadre = u.id !== me?.id && squadreDisp.length > 0 && (
  u.ruolo === 'giocatore' || u.ruolo === 'genitore' ||
  (u.ruoli_extra ?? []).some(r => r === 'giocatore' || r === 'genitore')
)
const squadraLabel = [u.ruolo, ...(u.ruoli_extra ?? [])].includes('genitore') ? 'genitore' : 'giocatore'
```

- [ ] **Step 3: Sostituisci il blocco delle select squadre**

Sostituisci l'intero blocco trovato allo Step 1 con:

```jsx
{/* Squadre giocatore/genitore (3 select in griglia) */}
{needsSquadre && (
  <div className="mt-2 border-t border-gray-100 pt-2">
    <p className="text-[10px] text-gray-400 mb-1.5">Squadre ({squadraLabel}):</p>
    <div className="grid grid-cols-3 gap-1.5">
      <select value={u.squadra ?? ''} onChange={e => squadraMut.mutate({ id: u.id, squadra: e.target.value || null })}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400">
        <option value="">Sq. 1</option>
        {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={u.squadra2 ?? ''} onChange={e => squadra2Mut.mutate({ id: u.id, squadra2: e.target.value || null })}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400">
        <option value="">Sq. 2</option>
        {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra3).map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={u.squadra3 ?? ''} onChange={e => squadra3Mut.mutate({ id: u.id, squadra3: e.target.value || null })}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400">
        <option value="">Sq. 3</option>
        {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verifica manuale**

1. Apri Setup → Utenti
2. Trova un utente con ruolo `admin` e `ruoli_extra: ['genitore']`
3. Verifica che compaiano le 3 select squadra con la label "Squadre (genitore):"
4. Cambia una squadra → deve salvarsi senza errori
5. Verifica che utenti con solo ruolo `admin` NON mostrino le select

- [ ] **Step 5: Commit**

```bash
git add src/pages/SetupPage.jsx
git commit -m "fix: mostra select squadre anche quando ruoli_extra include genitore/giocatore"
```

---

## Task 2 — Fix 2: CalendarioPage non eredita squadre coach in vista admin

**Spec:** `docs/superpowers/specs/2026-05-18-multiruolo-fixes-design.md` § Fix 2

**Files:**
- Modify: `src/pages/CalendarioPage.jsx` — import + funzione principale `CalendarioPage`

### Contesto
`isAllenatore = allRuoli.includes('allenatore')` è `true` per chi ha sia admin che allenatore. In `CalendarioPage`, questo attiva il filtro "Solo mie squadre" e restringe la lista squadre nel form, anche quando si naviga da `/admin/partite`. La fix usa il path URL per distinguere il contesto.

- [ ] **Step 1: Aggiungi useLocation agli import**

In `src/pages/CalendarioPage.jsx`, riga ~11, cambia:

```js
import { useNavigate } from 'react-router-dom'
```

in:

```js
import { useNavigate, useLocation } from 'react-router-dom'
```

- [ ] **Step 2: Deriva actingAsAllenatore dall'URL**

Nella funzione `CalendarioPage`, subito dopo la riga con `useAuth()` (riga ~752):

```js
const { user, isAdmin, isAllenatore, societaId } = useAuth()
```

Aggiungi sotto:

```js
const location = useLocation()
const actingAsAllenatore = location.pathname.startsWith('/coach') && isAllenatore
```

- [ ] **Step 3: Sostituisci isAllenatore con actingAsAllenatore**

Trova e sostituisci **tutte** le occorrenze di `isAllenatore` **all'interno della funzione `CalendarioPage`** (non toccate le funzioni esterne come `EventForm`). Le righe da aggiornare sono:

```js
// riga ~759 — stato iniziale del toggle
const [soloMieSquadre, setSoloMieSquadre] = useState(!!isAllenatore)
// → diventa:
const [soloMieSquadre, setSoloMieSquadre] = useState(!!actingAsAllenatore)

// riga ~784 — query allenatore abilitata solo se è un coach
enabled: !!user?.email && isAllenatore,
// → diventa:
enabled: !!user?.email && actingAsAllenatore,

// riga ~803 — effectiveSquadre per il coach
if (!isAllenatore) return null
// → diventa:
if (!actingAsAllenatore) return null

// riga ~924 — permessi di modifica
const canModify = isAdmin || isAllenatore
// → diventa:
const canModify = isAdmin || actingAsAllenatore

// riga ~991 — toggle "Solo mie squadre"
{isAllenatore && (
// → diventa:
{actingAsAllenatore && (
```

- [ ] **Step 4: Verifica manuale**

1. Fai login con un account che ha ruolo `admin` e `ruoli_extra: ['allenatore']`
2. Naviga su `/admin/partite`:
   - Il toggle "Solo mie squadre" NON deve apparire
   - La select squadra nel form deve mostrare **tutte** le squadre
3. Naviga su `/coach/calendario`:
   - Il toggle "Solo mie squadre" DEVE apparire
   - La select squadra nel form deve mostrare solo le sue squadre coach

- [ ] **Step 5: Commit**

```bash
git add src/pages/CalendarioPage.jsx
git commit -m "fix: isola comportamento coach dal ruolo admin in CalendarioPage"
```

---

## Task 3 — Fix 3 + Fix 5: CalendarioPage — EventForm con tipo partita/allenamento e conflict check

**Spec:** `docs/superpowers/specs/2026-05-18-multiruolo-fixes-design.md` § Fix 3, Fix 5

**Files:**
- Modify: `src/pages/CalendarioPage.jsx` — funzione `EventForm` e `saveMutation`

### Contesto
`EventForm` gestisce solo partite. Il campo `tipo` esiste in `EMPTY_FORM` ma non è utilizzato. Il conflict check per la palestra usa `form.casa_fuori === 'Casa'` che non funziona per allenamenti (non hanno casa/fuori). Questo task:
1. Aggiunge un tipo toggle (Partita / Allenamento) in cima al form
2. Mostra campi diversi a seconda del tipo
3. Salva in `orario_settimana` per allenamenti e in `calendario` per partite
4. Corregge il conflict check per la palestra degli allenamenti
5. Rende EventForm un named export per il Task 4

- [ ] **Step 1: Aggiungi export a EventForm**

Cambia la dichiarazione della funzione (riga ~268):

```js
function EventForm({ initial, onSave, onClose, squadre, squadreAllenatore, saving, saveError }) {
```

in:

```js
export function EventForm({ initial, onSave, onClose, squadre, squadreAllenatore, saving, saveError }) {
```

- [ ] **Step 2: Aggiorna la query palestre per supportare allenamenti**

Dentro `EventForm`, sostituisci la query palestre (riga ~274):

```js
const { data: palestreList = [] } = useQuery({
  queryKey: ['palestre-gara'],
  queryFn: async () => {
    const { data } = await supabase.from('palestre').select('nome, solo_allenamento').order('nome')
    return (data ?? []).filter(p => !p.solo_allenamento).map(p => p.nome).filter(Boolean)
  },
  staleTime: 10 * 60 * 1000,
})
```

con:

```js
const { data: palestreList = [] } = useQuery({
  queryKey: ['palestre-form', form.tipo],
  queryFn: async () => {
    const { data } = await supabase.from('palestre').select('nome, solo_allenamento').order('nome')
    if (form.tipo === 'allenamento') return (data ?? []).map(p => p.nome).filter(Boolean)
    return (data ?? []).filter(p => !p.solo_allenamento).map(p => p.nome).filter(Boolean)
  },
  staleTime: 10 * 60 * 1000,
})
```

- [ ] **Step 3: Correggi il conflict check per la palestra degli allenamenti (Fix 5)**

Dentro `EventForm`, nel `useMemo` di `conflictCheck` (riga ~317), trova:

```js
} else if (form.casa_fuori === 'Casa' && form.palestra?.trim() && e.palestra?.trim() &&
           form.palestra.trim().toLowerCase() === e.palestra.trim().toLowerCase()) {
  errors.push(`${form.palestra} già occupata da ${e.squadra} (${n(e.ora_inizio)}–${n(e.ora_fine)})`)
}
```

Sostituisci con:

```js
} else {
  const isHomeEvent = form.tipo === 'allenamento' || form.casa_fuori === 'Casa'
  if (isHomeEvent && form.palestra?.trim() && e.palestra?.trim() &&
      form.palestra.trim().toLowerCase() === e.palestra.trim().toLowerCase()) {
    errors.push(`${form.palestra} già occupata da ${e.squadra} (${n(e.ora_inizio)}–${n(e.ora_fine)})`)
  }
}
```

- [ ] **Step 4: Aggiungi il tipo toggle e la logica di submit condizionale**

Dentro `EventForm`, sostituisci l'intera sezione header + apertura form (riga ~343-360):

```jsx
<div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
  <h2 className="text-lg font-semibold text-gray-900">
    {initial?.id ? 'Modifica partita' : '🏀 Nuova partita'}
  </h2>
  <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
    <X size={20} className="text-gray-400" />
  </button>
</div>

<div className="overflow-y-auto flex-1 px-5 pb-2">
  <form id="event-form" onSubmit={e => {
  e.preventDefault()
  if (conflictCheck.hasConflicts && !forceInsert) return
  const saveData = form.casa_fuori === 'Fuori Casa'
    ? { ...form, palestra: form.avversario || '' }
    : form
  onSave(saveData)
}} className="space-y-4">
```

con:

```jsx
<div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
  <h2 className="text-lg font-semibold text-gray-900">
    {initial?.id
      ? (form.tipo === 'allenamento' ? 'Modifica allenamento' : 'Modifica partita')
      : (form.tipo === 'allenamento' ? '🏋️ Nuovo allenamento' : '🏀 Nuova partita')}
  </h2>
  <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
    <X size={20} className="text-gray-400" />
  </button>
</div>

{/* Toggle tipo — solo per nuovi eventi */}
{!initial?.id && (
  <div className="px-5 pb-3 flex-shrink-0">
    <div className="flex gap-2">
      {[
        { val: 'partita',    label: '🏀 Partita'     },
        { val: 'allenamento', label: '🏋️ Allenamento' },
      ].map(({ val, label }) => (
        <button
          key={val}
          type="button"
          onClick={() => set('tipo', val)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
            form.tipo === val
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  </div>
)}

<div className="overflow-y-auto flex-1 px-5 pb-2">
  <form id="event-form" onSubmit={e => {
    e.preventDefault()
    if (conflictCheck.hasConflicts && !forceInsert) return
    const saveData = form.tipo === 'allenamento'
      ? { tipo: 'allenamento', data: form.data, squadra: form.squadra,
          ora_inizio: form.ora_inizio, ora_fine: form.ora_fine, palestra: form.palestra }
      : form.casa_fuori === 'Fuori Casa'
        ? { ...form, palestra: form.avversario || '' }
        : form
    onSave(saveData)
  }} className="space-y-4">
```

- [ ] **Step 5: Rendi i campi partita condizionali**

Dentro il `<form>`, dopo il blocco data+squadra e il blocco ora_inizio+ora_fine (che restano sempre visibili), avvolgi i campi specifici per le partite in `{form.tipo !== 'allenamento' && (...)}`.

I campi da avvolgere sono (trovali nella forma JSX):
1. Il campo **Avversario** — avvolgi in:
```jsx
{form.tipo !== 'allenamento' && (
  <div>
    <label className="text-xs font-medium text-gray-500 mb-1 block">Avversario</label>
    <input value={form.avversario} onChange={e => set('avversario', e.target.value)}
      placeholder="Nome squadra avversaria"
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
  </div>
)}
```

2. Il blocco **Casa / Trasferta** — avvolgi in:
```jsx
{form.tipo !== 'allenamento' && (
  <div>
    <label className="text-xs font-medium text-gray-500 mb-2 block">Casa / Trasferta</label>
    <div className="flex gap-2">
      {[{ val: 'Casa', label: '🏠 Casa' }, { val: 'Fuori Casa', label: '✈️ Trasferta' }].map(({ val, label }) => (
        <button key={val} type="button" onClick={() => set('casa_fuori', val)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
            form.casa_fuori === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
          }`}>
          {label}
        </button>
      ))}
    </div>
  </div>
)}
```

3. Il blocco **Palestra** (quello condizionato a `form.casa_fuori === 'Casa'`) — avvolgi in:
```jsx
{(form.tipo !== 'allenamento' ? form.casa_fuori === 'Casa' : true) && (
  <div>
    <label className="text-xs font-medium text-gray-500 mb-1 block">Palestra / Luogo</label>
    {palestreList.length > 0 ? (
      <select value={form.palestra} onChange={e => set('palestra', e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">Scegli palestra...</option>
        {palestreList.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    ) : (
      <input value={form.palestra} onChange={e => set('palestra', e.target.value)}
        placeholder="es. PalaOderzo"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    )}
  </div>
)}
```

4. Il campo **Stato** — avvolgi in:
```jsx
{form.tipo !== 'allenamento' && (
  <div>
    <label className="text-xs font-medium text-gray-500 mb-1 block">Stato</label>
    <select value={form.stato} onChange={e => set('stato', e.target.value)}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      {Object.entries(STATO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  </div>
)}
```

- [ ] **Step 6: Aggiorna il testo del pulsante submit**

Nel footer del form (riga ~468), cambia:

```jsx
{saving ? 'Salvataggio...' : (initial?.id ? 'Salva modifiche' : 'Aggiungi partita')}
```

con:

```jsx
{saving
  ? 'Salvataggio...'
  : initial?.id
    ? (form.tipo === 'allenamento' ? 'Salva allenamento' : 'Salva modifiche')
    : (form.tipo === 'allenamento' ? 'Aggiungi allenamento' : 'Aggiungi partita')}
```

- [ ] **Step 7: Aggiorna saveMutation per supportare allenamenti**

Trova `saveMutation` (riga ~873) nel corpo di `CalendarioPage`:

```js
const saveMutation = useMutation({
  mutationFn: async ({ id, _tipo, _source, _table, _id, spostato, ...formData }) => {
    if (id) {
      const { error } = await supabase.from('calendario').update(formData).eq('id', id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('calendario').insert([{ ...formData, societa_id: societaId }])
      if (error) throw error
    }
  },
```

Sostituisci con:

```js
const saveMutation = useMutation({
  mutationFn: async ({ id, tipo, _tipo, _source, _table, _id, spostato, ...formData }) => {
    if (tipo === 'allenamento') {
      const { error } = await supabase.from('orario_settimana').upsert(
        [{ ...formData, annullato: false, societa_id: societaId }],
        { onConflict: 'societa_id,data,squadra' }
      )
      if (error) throw error
    } else if (id) {
      const { error } = await supabase.from('calendario').update(formData).eq('id', id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('calendario').insert([{ ...formData, societa_id: societaId }])
      if (error) throw error
    }
  },
```

- [ ] **Step 8: Aggiungi tipo: 'partita' all'initial per le partite in modifica**

Cerca il punto dove viene montato `<EventForm>` (riga ~1194-1213) e aggiorna l'oggetto `initial` per includere `tipo`:

```jsx
<EventForm
  initial={editingEvent && editingEvent._table === 'calendario' ? {
    tipo:       'partita',          // ← aggiunta
    id:         editingEvent.id,
    data:       editingEvent.data ?? '',
    ...
  } : null}
```

- [ ] **Step 9: Verifica manuale**

1. Vai su `/coach/calendario` o `/admin/partite`
2. Clicca il FAB `+`
3. Verifica che ci sia il toggle **🏀 Partita / 🏋️ Allenamento**
4. Seleziona **Partita** → deve mostrare tutti i campi partita (avversario, casa/fuori, stato)
5. Seleziona **Allenamento** → deve mostrare solo data, squadra, ora_inizio, ora_fine, palestra
6. Per un allenamento, imposta una palestra già occupata da un altro evento → deve mostrare il conflitto
7. Salva un allenamento → deve comparire nella vista settimana (riga in `orario_settimana`)

- [ ] **Step 10: Commit**

```bash
git add src/pages/CalendarioPage.jsx
git commit -m "feat: EventForm supporta allenamenti + fix conflict check palestra"
```

---

## Task 4 — Fix 4: HomeAdmin FAB per aggiungere partita o allenamento

**Spec:** `docs/superpowers/specs/2026-05-18-multiruolo-fixes-design.md` § Fix 4

**Files:**
- Modify: `src/pages/home/HomeAdmin.jsx`

### Prerequisiti
Task 3 deve essere completato (EventForm è ora un named export da CalendarioPage).

### Contesto
`HomeAdmin.jsx` mostra la lista "prossime partite" ma non ha nessun pulsante per aggiungere eventi. Questo task aggiunge un FAB che apre `EventForm` (già esteso nel Task 3).

- [ ] **Step 1: Aggiungi gli import mancanti in HomeAdmin**

In `src/pages/home/HomeAdmin.jsx`, aggiorna le righe di import esistenti:

Aggiungi `useMutation, useQueryClient` alla riga useQuery:
```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```

Aggiungi import di EventForm, useSquadre, Plus:
```js
import { Plus } from 'lucide-react'
import { EventForm } from '../CalendarioPage'
import { useSquadre } from '../../hooks/useWeekEvents'
```

- [ ] **Step 2: Aggiungi lo stato e i dati necessari al componente**

Nella funzione `HomeAdmin`, dopo `const navigate = useNavigate()`, aggiungi:

```js
const queryClient = useQueryClient()
const [showAddForm, setShowAddForm] = useState(false)
const { data: squadre = [] } = useSquadre()
```

- [ ] **Step 3: Aggiungi la mutation per il salvataggio**

Prima del `return (...)` in `HomeAdmin`, aggiungi:

```js
const addEventMutation = useMutation({
  mutationFn: async ({ id, tipo, _tipo, _source, _table, _id, spostato, ...formData }) => {
    if (tipo === 'allenamento') {
      const { error } = await supabase.from('orario_settimana').upsert(
        [{ ...formData, annullato: false, societa_id: societaId }],
        { onConflict: 'societa_id,data,squadra' }
      )
      if (error) throw error
    } else {
      const { error } = await supabase.from('calendario').insert([{ ...formData, societa_id: societaId }])
      if (error) throw error
    }
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['admin-partite-future'] })
    queryClient.invalidateQueries({ queryKey: ['weekEvents'] })
    setShowAddForm(false)
  },
})
```

- [ ] **Step 4: Aggiungi il FAB e il form nel JSX**

Alla fine del `return (...)` di `HomeAdmin`, subito prima dell'ultimo `</div>` di chiusura, aggiungi:

```jsx
{/* FAB aggiungi evento */}
<button
  onClick={() => setShowAddForm(true)}
  className="fixed bottom-24 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all z-20"
  aria-label="Aggiungi evento"
>
  <Plus size={28} />
</button>

{showAddForm && (
  <EventForm
    initial={null}
    squadre={squadre}
    squadreAllenatore={null}
    saving={addEventMutation.isPending}
    saveError={addEventMutation.isError ? (addEventMutation.error?.message ?? 'Errore sconosciuto') : null}
    onSave={(formData) => addEventMutation.mutate(formData)}
    onClose={() => { setShowAddForm(false); addEventMutation.reset() }}
  />
)}
```

- [ ] **Step 5: Verifica manuale**

1. Naviga su `/admin` (Home Admin)
2. Verifica che il FAB `+` sia visibile in basso a destra
3. Clicca il FAB → deve aprirsi il form con il toggle Partita / Allenamento
4. Aggiungi una partita → deve comparire nella sezione "Prossime partite"
5. Aggiungi un allenamento → la home non mostra allenamenti, ma naviga su Calendario → deve comparire
6. Testa il rilevamento conflitti: aggiungi un allenamento per una data/squadra/palestra già impegnata → deve mostrare il warning

- [ ] **Step 6: Commit**

```bash
git add src/pages/home/HomeAdmin.jsx
git commit -m "feat: aggiungi FAB in HomeAdmin per inserire partite e allenamenti"
```

---

## Self-Review checklist

- [x] **Fix 1** coperto da Task 1: condizione `needsSquadre` include `ruoli_extra`
- [x] **Fix 2** coperto da Task 2: `actingAsAllenatore` path-based
- [x] **Fix 3** coperto da Task 3: tipo toggle + campi condizionali + save branched
- [x] **Fix 4** coperto da Task 4: FAB + EventForm in HomeAdmin
- [x] **Fix 5** coperto da Task 3 Step 3: `isHomeEvent` check per palestra allenamenti
- [x] Nessun placeholder TBD/TODO
- [x] Task 4 dipende esplicitamente da Task 3 (EventForm named export)
- [x] Nomi funzioni coerenti: `EventForm` usato ugualmente in Task 3 e Task 4
