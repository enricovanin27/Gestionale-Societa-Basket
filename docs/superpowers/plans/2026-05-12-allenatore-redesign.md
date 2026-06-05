# Allenatore Redesign — Sessione 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adattare il ruolo Allenatore: Home di default su tutte le squadre, Calendario filtrato per coach con toggle, sezione "Attività" che unifica Presenze e Statistiche (con fix bug query + bug navigazione), verifica Bacheca.

**Architecture:** 4 task sequenziali con conferma tra l'uno e l'altro. `AttivitaPage` è un nuovo componente standalone che sostituisce `PresenzePage` + `StatistichePage` nel layout coach; usa la stessa logica merge di `useWeekEvents` per risolvere il bug di query su `orario_fisso`.

**Tech Stack:** React 18, React Router v6, Supabase, @tanstack/react-query, Tailwind CSS v4, lucide-react, date-fns

---

## Mappa file

| Operazione | File |
|---|---|
| **Modifica** | `frontend/src/pages/home/HomeAllenatore.jsx` |
| **Modifica** | `frontend/src/pages/CalendarioPage.jsx` |
| **Crea** | `frontend/src/pages/coach/AttivitaPage.jsx` |
| **Modifica** | `frontend/src/layouts/CoachLayout.jsx` |
| **Modifica** | `frontend/src/App.jsx` |
| **Verifica** | `frontend/src/pages/BachecaPage.jsx` |

---

## Task 1 — HomeAllenatore: default tutte le squadre

**STOP al termine: aspetta conferma prima di procedere al Task 2.**

**Files:**
- Modify: `frontend/src/pages/home/HomeAllenatore.jsx:356-402`

**Contesto:** `selectedSquadra` parte da `''` (linea 356) ma un `useEffect` (linee 358-360) la imposta subito a `mySquadre[0]`. Le query e i memo dipendono da `selectedSquadra` e restituiscono array vuoti se è `''`. Dobbiamo rimuovere l'auto-selezione e gestire lo stato vuoto ("tutte le squadre").

---

- [ ] **Step 1.1: Rimuovi il useEffect che auto-seleziona la prima squadra**

Rimuovi le righe 358-360 da `HomeAllenatore.jsx`:

```jsx
// RIMUOVI QUESTE 3 RIGHE:
useEffect(() => {
  if (mySquadre.length && !selectedSquadra) setSelectedSquadra(mySquadre[0])
}, [mySquadre])
```

- [ ] **Step 1.2: Aggiorna il dropdown — mostra sempre, aggiungi opzione "Tutte"**

Trova il blocco (linee 449-459) e sostituisci:

```jsx
// PRIMA
{mySquadre.length > 1 && (
  <div className="mt-3">
    <select
      value={selectedSquadra}
      onChange={e => setSelectedSquadra(e.target.value)}
      className="w-full bg-amber-700 text-white border border-amber-400 rounded-lg px-3 py-2 text-sm"
    >
      {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
)}
```

```jsx
// DOPO
{mySquadre.length > 0 && (
  <div className="mt-3">
    <select
      value={selectedSquadra}
      onChange={e => setSelectedSquadra(e.target.value)}
      className="w-full bg-amber-700 text-white border border-amber-400 rounded-lg px-3 py-2 text-sm"
    >
      <option value="">Tutte le squadre</option>
      {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
)}
```

- [ ] **Step 1.3: Correggi la query `prossimeGare` (linee 364-378)**

```jsx
// PRIMA
const { data: prossimeGare = [] } = useQuery({
  queryKey: ['prossime-gare', selectedSquadra, todayStr, societaId],
  enabled: !!selectedSquadra && !!societaId,
  queryFn: async () => {
    const { data } = await supabase
      .from('calendario').select('*')
      .eq('squadra', selectedSquadra)
      .eq('societa_id', societaId)
      .gte('data', todayStr)
      .order('data').order('ora_inizio')
      .limit(2)
    return data ?? []
  },
  staleTime: 2 * 60 * 1000,
})
```

```jsx
// DOPO
const { data: prossimeGare = [] } = useQuery({
  queryKey: ['prossime-gare', selectedSquadra, mySquadre, todayStr, societaId],
  enabled: !!societaId && mySquadre.length > 0,
  queryFn: async () => {
    let q = supabase
      .from('calendario').select('*')
      .eq('societa_id', societaId)
      .gte('data', todayStr)
      .order('data').order('ora_inizio')
    q = selectedSquadra
      ? q.eq('squadra', selectedSquadra).limit(2)
      : q.in('squadra', mySquadre).limit(3)
    const { data } = await q
    return data ?? []
  },
  staleTime: 2 * 60 * 1000,
})
```

- [ ] **Step 1.4: Correggi il memo `allenamenti` (linee 384-392)**

```jsx
// PRIMA
const allenamenti = useMemo(() => {
  if (!weekData || !selectedSquadra) return []
  return (weekData.events ?? [])
    .filter(e =>
      e._tipo === 'allenamento' && !e.annullato &&
      (e.squadra ?? '').toLowerCase() === selectedSquadra.toLowerCase()
    )
    .sort((a, b) => (a.data + (a.ora_inizio ?? '')).localeCompare(b.data + (b.ora_inizio ?? '')))
}, [weekData, selectedSquadra])
```

```jsx
// DOPO
const allenamenti = useMemo(() => {
  if (!weekData) return []
  const squads = selectedSquadra ? [selectedSquadra] : mySquadre
  return (weekData.events ?? [])
    .filter(e =>
      e._tipo === 'allenamento' && !e.annullato &&
      squads.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
    .sort((a, b) => (a.data + (a.ora_inizio ?? '')).localeCompare(b.data + (b.ora_inizio ?? '')))
}, [weekData, selectedSquadra, mySquadre])
```

- [ ] **Step 1.5: Correggi il memo `prossimiAllenamenti` (linee 394-402) — stessa logica**

```jsx
// PRIMA
const prossimiAllenamenti = useMemo(() => {
  if (!nextWeekData || !selectedSquadra) return []
  return (nextWeekData.events ?? [])
    .filter(e =>
      e._tipo === 'allenamento' && !e.annullato &&
      (e.squadra ?? '').toLowerCase() === selectedSquadra.toLowerCase()
    )
    .sort((a, b) => (a.data + (a.ora_inizio ?? '')).localeCompare(b.data + (b.ora_inizio ?? '')))
}, [nextWeekData, selectedSquadra])
```

```jsx
// DOPO
const prossimiAllenamenti = useMemo(() => {
  if (!nextWeekData) return []
  const squads = selectedSquadra ? [selectedSquadra] : mySquadre
  return (nextWeekData.events ?? [])
    .filter(e =>
      e._tipo === 'allenamento' && !e.annullato &&
      squads.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
    .sort((a, b) => (a.data + (a.ora_inizio ?? '')).localeCompare(b.data + (b.ora_inizio ?? '')))
}, [nextWeekData, selectedSquadra, mySquadre])
```

- [ ] **Step 1.6: Verifica in browser**

  - Aprire `/coach` come allenatore con 2+ squadre
  - Default: la tendina mostra "Tutte le squadre", la griglia mostra allenamenti di tutte le squadre e prossime gare di tutte
  - Selezionare una squadra specifica → filtra correttamente
  - Tornare su "Tutte le squadre" → mostra tutto di nuovo

- [ ] **Step 1.7: Commit**

```bash
git add frontend/src/pages/home/HomeAllenatore.jsx
git commit -m "feat(coach): home — default tutte le squadre, filtro per squadra da tendina"
```

---

**⛔ STOP — aspetta conferma prima di procedere al Task 2.**

---

## Task 2 — CalendarioPage: filtro coach con toggle

**STOP al termine: aspetta conferma prima di procedere al Task 3.**

**Files:**
- Modify: `frontend/src/pages/CalendarioPage.jsx`

**Contesto:** `CalendarioPage` è condivisa tra admin (`/admin/partite`) e coach (`/coach/calendario`). Per coach, vogliamo che di default mostri solo le proprie squadre, con un toggle per espandere a tutta la società. Il componente già legge `isAllenatore` e `squadreAllenatore` da `useAuth` (linea 720).

---

- [ ] **Step 2.1: Aggiungi stato `soloMieSquadre` (dopo la linea con `squadraFilter`, linea 727)**

```jsx
// PRIMA
const [squadraFilter,    setSquadraFilter]    = useState('')
```

```jsx
// DOPO
const [squadraFilter,    setSquadraFilter]    = useState('')
const [soloMieSquadre,   setSoloMieSquadre]   = useState(!!isAllenatore)
```

- [ ] **Step 2.2: Aggiungi `effectiveSquadre` (computed memo, dopo `weekLabel` circa linea 747)**

```jsx
const effectiveSquadre = useMemo(
  () => (soloMieSquadre && squadreAllenatore?.length) ? squadreAllenatore : null,
  [soloMieSquadre, squadreAllenatore]
)
```

- [ ] **Step 2.3: Aggiorna `displayEvents` (linee 752-757) per applicare il filtro squadre**

```jsx
// PRIMA
const displayEvents = useMemo(() => {
  if (!data) return []
  let events = data.events.filter(e => e._tipo === 'partita')
  if (squadraFilter) events = events.filter(e => e.squadra === squadraFilter)
  return events
}, [data, squadraFilter])
```

```jsx
// DOPO
const displayEvents = useMemo(() => {
  if (!data) return []
  let events = data.events.filter(e => e._tipo === 'partita')
  if (effectiveSquadre) events = events.filter(e => effectiveSquadre.includes(e.squadra))
  if (squadraFilter)    events = events.filter(e => e.squadra === squadraFilter)
  return events
}, [data, squadraFilter, effectiveSquadre])
```

- [ ] **Step 2.4: Aggiorna firma di `VistaSettimanaleCompleta` e il suo filtro interno (linea 522)**

```jsx
// PRIMA — firma
function VistaSettimanaleCompleta({ weekDays, data, allSquadre, squadraFilter, conflictedTrainingKeys, conflictMap, onPartitaClick, onNavigateAllenamenti, onTrainingEdit }) {
  const allEventsByDate = useMemo(() => {
    if (!data) return {}
    const map = {}
    data.events
      .filter(e => {
        if (squadraFilter && e.squadra !== squadraFilter) return false
        if (e.annullato && e._tipo !== 'partita') return false
        return true
      })
```

```jsx
// DOPO — firma (aggiunto effectiveSquadre)
function VistaSettimanaleCompleta({ weekDays, data, allSquadre, squadraFilter, effectiveSquadre, conflictedTrainingKeys, conflictMap, onPartitaClick, onNavigateAllenamenti, onTrainingEdit }) {
  const allEventsByDate = useMemo(() => {
    if (!data) return {}
    const map = {}
    data.events
      .filter(e => {
        if (effectiveSquadre?.length && !effectiveSquadre.includes(e.squadra)) return false
        if (squadraFilter && e.squadra !== squadraFilter) return false
        if (e.annullato && e._tipo !== 'partita') return false
        return true
      })
```

- [ ] **Step 2.5: Aggiorna la chiamata a `VistaSettimanaleCompleta` (circa linea 1005) per passare `effectiveSquadre`**

Aggiungi `effectiveSquadre={effectiveSquadre}` alla lista di props:

```jsx
<VistaSettimanaleCompleta
  weekDays={weekDays}
  data={data}
  allSquadre={squadre}
  squadraFilter={squadraFilter}
  effectiveSquadre={effectiveSquadre}
  conflictedTrainingKeys={conflictedTrainingKeys}
  conflictMap={conflictMap}
  onPartitaClick={setSelectedEvent}
  onNavigateAllenamenti={() => navigate('/allenamenti')}
  onTrainingEdit={canModify ? setEditingTraining : undefined}
/>
```

- [ ] **Step 2.6: Sostituisci il blocco filtro-squadre nel pannello filtri (linee 929-937) con versione che include il toggle coach**

```jsx
// PRIMA (circa linee 929-937)
{(calTab === 'partite' || calTab === 'settimana') && (
  <div className="px-4 pt-2 pb-2">
    <select value={squadraFilter} onChange={e => setSquadraFilter(e.target.value)}
      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
      <option value="">Tutte le squadre</option>
      {squadre.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
)}
```

```jsx
// DOPO
{(calTab === 'partite' || calTab === 'settimana') && (
  <div className="px-4 pt-2 pb-2 space-y-2">
    {isAllenatore && (
      <button
        onClick={() => { setSoloMieSquadre(v => !v); setSquadraFilter('') }}
        className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
          soloMieSquadre
            ? 'bg-amber-100 text-amber-700 border-amber-300'
            : 'bg-gray-100 text-gray-500 border-gray-200'
        }`}
      >
        {soloMieSquadre ? 'Solo mie squadre' : 'Tutte le squadre'}
      </button>
    )}
    <select value={squadraFilter} onChange={e => setSquadraFilter(e.target.value)}
      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
      <option value="">{soloMieSquadre ? 'Tutte le mie squadre' : 'Tutte le squadre'}</option>
      {(effectiveSquadre ?? squadre).map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
)}
```

- [ ] **Step 2.7: Verifica in browser**

  - Come **admin** (`/admin/partite`): nessun toggle, comportamento invariato
  - Come **allenatore** (`/coach/calendario`): toggle "Solo mie squadre" visibile e attivo di default; dropdown mostra solo le proprie squadre; click sul toggle → "Tutte le squadre" → dropdown torna a mostrare tutto

- [ ] **Step 2.8: Commit**

```bash
git add frontend/src/pages/CalendarioPage.jsx
git commit -m "feat(coach): calendario — toggle 'solo mie squadre' attivo di default per allenatori"
```

---

**⛔ STOP — aspetta conferma prima di procedere al Task 3.**

---

## Task 3 — Sezione "Attività": unificazione Presenze + Statistiche

**STOP al termine: aspetta conferma prima di procedere al Task 4.**

**Files:**
- Create: `frontend/src/pages/coach/AttivitaPage.jsx`
- Modify: `frontend/src/layouts/CoachLayout.jsx`
- Modify: `frontend/src/App.jsx`

**Contesto Bug 1:** `PresenzePage` interroga solo `orario_settimana` (linea 51). Le sessioni ricorrenti da `orario_fisso` non compaiono mai lì se non modificate. Fix: duplicare la logica merge di `useWeekEvents` (fisso espanso a date + settimana), poi creare un row `orario_settimana` on-demand per sessioni fisso selezionate (necessario perché `presenze.allenamento_id` referenzia `orario_settimana.id`).

**Contesto Bug 2:** `PresenzePage` ha un root `<div>` senza classi. Testare in browser: se la bottom nav non risponde ai tap dalla pagina presenze, la causa è probabilmente che la pagina non ha `pb-20` e il contenuto scorrevole copre fisicamente la nav su mobile. Fix: `min-h-screen pb-20 bg-gray-50` sul root div di `AttivitaPage`.

---

- [ ] **Step 3.1: Crea `frontend/src/pages/coach/AttivitaPage.jsx`**

```jsx
import { useState, useMemo, useEffect } from 'react'
import { format, subDays, addDays, eachDayOfInterval, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight, Check, X, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatistichePage from '../StatistichePage'

const GIORNO_BY_JS_DAY = {
  0: 'domenica', 1: 'lunedi', 2: 'martedi', 3: 'mercoledi',
  4: 'giovedi',  5: 'venerdi', 6: 'sabato',
}

const parseList = (s) =>
  typeof s === 'string' && s.trim()
    ? s.split(',').map(x => x.trim()).filter(Boolean)
    : Array.isArray(s) ? s : []

// ─── Presenze tab ─────────────────────────────────────────────────────────────

function PresenzeTab({ mySquadre, societaId }) {
  const today = new Date()
  const qc    = useQueryClient()

  const [selectedId,   setSelectedId]   = useState(null)
  const [presMap,      setPresMap]      = useState({})
  const [saved,        setSaved]        = useState(false)
  const [creatingRow,  setCreatingRow]  = useState(false)

  const rangeStart = format(subDays(today, 7), 'yyyy-MM-dd')
  const rangeEnd   = format(addDays(today, 7), 'yyyy-MM-dd')

  // Fetch entrambe le sorgenti
  const { data: rawData, isLoading: la } = useQuery({
    queryKey: ['attivita-presenze', societaId, mySquadre, rangeStart, rangeEnd],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      const [fissoRes, settRes] = await Promise.all([
        supabase.from('orario_fisso')
          .select('id, giorno, squadra, ora_inizio, ora_fine, palestra')
          .in('squadra', mySquadre),
        supabase.from('orario_settimana')
          .select('id, data, squadra, ora_inizio, ora_fine, palestra, annullato')
          .eq('societa_id', societaId)
          .in('squadra', mySquadre)
          .gte('data', rangeStart)
          .lte('data', rangeEnd)
          .order('data', { ascending: false })
          .order('ora_inizio'),
      ])
      if (fissoRes.error) throw fissoRes.error
      if (settRes.error)  throw settRes.error
      return { fisso: fissoRes.data ?? [], settimana: settRes.data ?? [] }
    },
    staleTime: 2 * 60 * 1000,
  })

  // Merge orario_fisso (espanso a date) + orario_settimana — stessa logica di useWeekEvents
  const allenamenti = useMemo(() => {
    if (!rawData) return []
    const { fisso, settimana } = rawData
    const results = []
    const days = eachDayOfInterval({ start: parseISO(rangeStart), end: parseISO(rangeEnd) })

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd')
      const giorno  = GIORNO_BY_JS_DAY[day.getDay()]
      const settForDate   = settimana.filter(s => s.data === dateStr)
      const settBySquadra = new Map(settForDate.map(s => [(s.squadra ?? '').toLowerCase().trim(), s]))
      const fissoForDay   = fisso.filter(f => (f.giorno ?? '').toLowerCase() === giorno)

      for (const f of fissoForDay) {
        const key = (f.squadra ?? '').toLowerCase().trim()
        const ov  = settBySquadra.get(key)
        if (ov) {
          if (!ov.annullato) results.push({ ...f, ...ov, data: dateStr, _source: 'settimana' })
        } else {
          results.push({ ...f, data: dateStr, _source: 'fisso' })
        }
      }
      for (const s of settForDate) {
        if (s.annullato) continue
        const hasFisso = fissoForDay.some(
          f => (f.squadra ?? '').toLowerCase().trim() === (s.squadra ?? '').toLowerCase().trim()
        )
        if (!hasFisso) results.push({ ...s, data: dateStr, _source: 'settimana' })
      }
    }

    return results.sort((a, b) => {
      const dc = (b.data ?? '').localeCompare(a.data ?? '')
      return dc !== 0 ? dc : (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? '')
    })
  }, [rawData, rangeStart, rangeEnd])

  const selectedAl = allenamenti.find(a => a.id === selectedId)

  const { data: giocatori = [], isLoading: lg } = useQuery({
    queryKey: ['presenze-giocatori', selectedAl?.squadra, societaId],
    enabled: !!selectedAl?.squadra && !!societaId,
    queryFn: async () => {
      const { data } = await supabase.from('giocatori')
        .select('id, nome, cognome')
        .eq('squadra', selectedAl.squadra)
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  const { data: existingPresenze = [] } = useQuery({
    queryKey: ['presenze-existing', selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data } = await supabase.from('presenze')
        .select('giocatore_id, presente')
        .eq('allenamento_id', selectedId)
      return data ?? []
    },
  })

  useEffect(() => {
    if (existingPresenze.length > 0) {
      setPresMap(Object.fromEntries(existingPresenze.map(p => [p.giocatore_id, p.presente])))
    } else {
      setPresMap({})
    }
    setSaved(false)
  }, [existingPresenze, selectedId])

  // Per sessioni da orario_fisso: crea la row orario_settimana on-demand
  async function handleSelectAllenamento(al) {
    let id = al.id
    if (al._source === 'fisso') {
      setCreatingRow(true)
      const { data, error } = await supabase.from('orario_settimana')
        .insert([{
          data:       al.data,
          squadra:    al.squadra,
          ora_inizio: al.ora_inizio,
          ora_fine:   al.ora_fine,
          palestra:   al.palestra ?? null,
          annullato:  false,
          societa_id: societaId,
        }])
        .select('id')
        .single()
      setCreatingRow(false)
      if (error) { console.error(error); return }
      qc.invalidateQueries({ queryKey: ['attivita-presenze'] })
      id = data.id
    }
    setSelectedId(id)
    setSaved(false)
    setPresMap({})
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selectedId || giocatori.length === 0) return
      const records = giocatori.map(g => ({
        allenamento_id: selectedId,
        giocatore_id:   g.id,
        presente:       presMap[g.id] ?? false,
        societa_id:     societaId,
      }))
      const { error } = await supabase.from('presenze')
        .upsert(records, { onConflict: 'allenamento_id,giocatore_id' })
      if (error) throw error
    },
    onSuccess: () => {
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['presenze-existing', selectedId] })
      qc.invalidateQueries({ queryKey: ['presenze-giocatore'] })
    },
  })

  const presentiCount = Object.values(presMap).filter(Boolean).length
  const totale        = giocatori.length

  function togglePresenza(gid) {
    setSaved(false)
    setPresMap(m => ({ ...m, [gid]: !m[gid] }))
  }

  if (la || creatingRow) return <div className="pt-8"><LoadingSpinner /></div>

  if (allenamenti.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
        Nessun allenamento nei prossimi/ultimi 7 giorni.
      </div>
    )
  }

  if (!selectedId) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Seleziona allenamento</p>
        {allenamenti.map(a => (
          <button
            key={`${a._source}-${a.id ?? a.data + a.squadra}`}
            onClick={() => handleSelectAllenamento(a)}
            className="w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between active:scale-[0.99] shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {format(parseISO(a.data), 'EEEE d MMM', { locale: it })} · {a.squadra}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {a.ora_inizio?.slice(0, 5)}–{a.ora_fine?.slice(0, 5)}
                {a.palestra ? ` · ${a.palestra}` : ''}
                {a._source === 'fisso' && <span className="ml-1 text-amber-600">(ricorrente)</span>}
              </p>
            </div>
            <ChevronRight size={18} className="text-gray-400" />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setSelectedId(null)} className="text-xs text-amber-600 font-semibold">← Cambia</button>
        {selectedAl && (
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {format(parseISO(selectedAl.data), 'EEEE d MMM', { locale: it })} · {selectedAl.squadra}
            </p>
            <p className="text-xs text-gray-500">{selectedAl.ora_inizio?.slice(0, 5)}–{selectedAl.ora_fine?.slice(0, 5)}</p>
          </div>
        )}
      </div>

      {lg ? <LoadingSpinner /> : (
        <>
          <div className="space-y-2 mb-4">
            {giocatori.map(g => {
              const presente = presMap[g.id] ?? false
              return (
                <button key={g.id} onClick={() => togglePresenza(g.id)}
                  className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border transition-colors ${
                    presente ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      presente ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {g.nome[0]}{g.cognome[0]}
                    </div>
                    <p className="text-sm font-medium text-gray-900">{g.cognome} {g.nome}</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    presente ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {presente ? <Check size={16} /> : <X size={16} />}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">Presenti: <strong>{presentiCount} / {totale}</strong></p>
            {saved && <p className="text-xs text-green-600 font-semibold">✓ Salvato</p>}
          </div>

          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || totale === 0}
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Save size={16} />
            {saveMut.isPending ? 'Salvataggio...' : 'Salva presenze'}
          </button>
          {saveMut.isError && (
            <p className="text-xs text-red-500 mt-2 text-center">{saveMut.error?.message}</p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'presenze',    label: 'Presenze'    },
  { id: 'statistiche', label: 'Statistiche' },
]

export default function AttivitaPage() {
  const { user, societaId } = useAuth()
  const [activeTab, setActiveTab] = useState('presenze')

  const { data: allenatoreRow } = useQuery({
    queryKey: ['my-allenatore', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase.from('allenatori')
        .select('squadre_capo, squadre_vice')
        .eq('email', user.email)
        .maybeSingle()
      return data
    },
  })

  const mySquadre = useMemo(() => {
    if (!allenatoreRow) return []
    return [...parseList(allenatoreRow.squadre_capo), ...parseList(allenatoreRow.squadre_vice)]
  }, [allenatoreRow])

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <PageHeader title="Attività" />

      <div className="bg-white border-b shadow-sm">
        <div className="flex px-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {activeTab === 'presenze' && (
          mySquadre.length > 0
            ? <PresenzeTab mySquadre={mySquadre} societaId={societaId} />
            : allenatoreRow !== undefined
              ? <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  ⚠️ Nessuna squadra assegnata al tuo profilo.
                </p>
              : <div className="pt-8"><LoadingSpinner /></div>
        )}
        {activeTab === 'statistiche' && <StatistichePage embedded />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3.2: Aggiorna `CoachLayout.jsx`**

```jsx
// PRIMA — imports
import { Home, Calendar, CheckSquare, BarChart2, Bell } from 'lucide-react'
```

```jsx
// DOPO — imports
import { Home, Calendar, Activity, Bell } from 'lucide-react'
```

```jsx
// PRIMA — due NavLink (presenze + statistiche)
<NavLink to="/coach/presenze" className={cls}>
  <CheckSquare size={21} strokeWidth={1.8} /><span className="text-xs font-medium">Presenze</span>
</NavLink>
<NavLink to="/coach/statistiche" className={cls}>
  <BarChart2 size={21} strokeWidth={1.8} /><span className="text-xs font-medium">Statistiche</span>
</NavLink>
```

```jsx
// DOPO — un solo NavLink
<NavLink to="/coach/attivita" className={cls}>
  <Activity size={21} strokeWidth={1.8} /><span className="text-xs font-medium">Attività</span>
</NavLink>
```

- [ ] **Step 3.3: Aggiorna `App.jsx`**

Aggiungi import (con gli altri import di pagine coach):
```jsx
import AttivitaPage from './pages/coach/AttivitaPage'
```

Nella sezione route coach (`/coach`), sostituisci:
```jsx
// PRIMA
<Route path="presenze"    element={<PresenzePage />} />
<Route path="statistiche" element={<StatistichePage />} />
```

```jsx
// DOPO
<Route path="attivita" element={<AttivitaPage />} />
```

Nella sezione legacy redirects, aggiungi:
```jsx
<Route path="/coach/presenze"    element={<Navigate to="/coach/attivita" replace />} />
<Route path="/coach/statistiche" element={<Navigate to="/coach/attivita" replace />} />
```

Rimuovi gli import non più usati in App.jsx:
- Controlla se `PresenzePage` è usato altrove → probabilmente no → rimuovi l'import
- Controlla se `StatistichePage` è usato altrove nelle route App.jsx → probabilmente no (AllenamentiPage non la importa più dopo refactoring) → rimuovi l'import

- [ ] **Step 3.4: Verifica in browser**

  - La tab "Attività" nella bottom nav naviga a `/coach/attivita`
  - Tab "Presenze": mostra sia sessioni da `orario_fisso` (etichettate "ricorrente") che da `orario_settimana`; selezionare una sessione ricorrente la crea in `orario_settimana` e apre la lista giocatori
  - Tab "Statistiche": mostra le statistiche mensili con navigazione mese
  - La bottom nav è raggiungibile e funzionante da entrambi i tab
  - URL `/coach/presenze` e `/coach/statistiche` redirigono correttamente

- [ ] **Step 3.5: Commit**

```bash
git add frontend/src/pages/coach/AttivitaPage.jsx \
        frontend/src/layouts/CoachLayout.jsx \
        frontend/src/App.jsx
git commit -m "feat(coach): sezione Attività — unifica Presenze+Statistiche, fix query orario_fisso"
```

---

**⛔ STOP — aspetta conferma prima di procedere al Task 4.**

---

## Task 4 — Bacheca: verifica selezione squadra

**Files:**
- Verify: `frontend/src/pages/BachecaPage.jsx`

**Contesto:** Il form `NuovoAnnuncioModal` (linea 42-139) riceve un prop `squadre`. La linea 109 nasconde già l'opzione "Tutte le squadre" per allenatori (`{!isAllenatore && <option value="">...`). Occorre verificare che il prop `squadre` passato contenga solo le proprie squadre (non tutte le squadre della società) quando l'utente è un allenatore.

---

- [ ] **Step 4.1: Leggi `BachecaPage.jsx` da linea 199 in poi**

Cerca la chiamata a `<NuovoAnnuncioModal` nel JSX. Verifica:
1. Il prop `squadre` da dove viene? Da una query sulle squadre della società, oppure da `useAuth().squadreAllenatore`?
2. Il prop `isAllenatore` è passato?

- [ ] **Step 4.2: Se il prop `squadre` usa tutte le squadre della società anche per l'allenatore, applica il fix**

Il pattern corretto è:
```jsx
// Nel corpo di BachecaPage, dove si determina le squadre da mostrare nel form
const { ..., squadreAllenatore } = useAuth()

// Nella chiamata al modal:
<NuovoAnnuncioModal
  squadre={isAllenatore && squadreAllenatore?.length ? squadreAllenatore : tutteLeSquadre}
  isAllenatore={isAllenatore}
  ...altri props...
/>
```

- [ ] **Step 4.3: Se non serve alcuna modifica, documenta che il controllo è passato**

- [ ] **Step 4.4: Commit (solo se ci sono modifiche)**

```bash
git add frontend/src/pages/BachecaPage.jsx
git commit -m "fix(coach): bacheca — squadre nel form annunci limitate a quelle dell'allenatore"
```

---

## Note tecniche

### Bug 1 — radice del problema
`orario_fisso` contiene il template settimanale ricorrente. `orario_settimana` contiene solo le eccezioni (sessioni modificate o annullate). Un allenatore con sessioni regolari non modifica mai `orario_settimana`, quindi la query originale restituisce 0 risultati. La soluzione (creare row on-demand al momento della selezione) è lo stesso pattern già usato altrove per registrare modifiche sul fisso.

### Bug 2 — causa probabile
`PresenzePage` ha `<div>` come root senza `min-h-screen pb-20`. Su mobile, il contenuto non lascia spazio per la bottom nav fissa (z-50). `AttivitaPage` corregge questo con `flex flex-col min-h-screen pb-20` sul root.

### addMonths mancante in CalendarioPage
`handleExportICS` (linea 872) usa `addMonths` che non è importato da date-fns (linea 3). È un bug preesistente non correlato a questo task — non toccare.
