# Admin Redesign — Sessione 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Admin role: inline conflict modal on Dashboard, team colors + griglia partite in Calendario, simplified Allenamenti, new Presenze section, and standalone Setup pages per section.

**Architecture:** Five sequential tasks, each stopped for user review. Tasks 1–3 modify existing pages. Task 4 creates a new page + nav item. Task 5 transforms the Setup from a tab container into per-section standalone pages and extracts SettimanaTipoTab to a shared component.

**Tech Stack:** React 18, React Router v6, Supabase, @tanstack/react-query, Tailwind CSS v4, lucide-react

**User decisions locked in:**
- Renamed "Settimana" tab → **"Orario Settimanale"**
- Approved 10-color PALETTE: blue/emerald/violet/orange/teal/rose/indigo/red/cyan/lime

---

## File Map

| File | Task | Action |
|------|------|--------|
| `src/pages/home/HomeAdmin.jsx` | 1 | Modify |
| `src/lib/constants.js` | 2 | Modify |
| `src/pages/CalendarioPage.jsx` | 2 | Modify |
| `src/components/GrigliaSettimanale.jsx` | 2 | Modify |
| `src/components/SettimanaTipoTab.jsx` | 3 | Create (extracted from AllenamentiPage) |
| `src/pages/AllenamentiPage.jsx` | 3 | Modify |
| `src/pages/admin/PresenzeAdmin.jsx` | 4 | Create |
| `src/layouts/AdminLayout.jsx` | 4 | Modify |
| `src/App.jsx` | 4 | Modify |
| `src/pages/admin/SetupMenu.jsx` | 5 | Modify |
| `src/pages/SetupPage.jsx` | 5 | Modify |

---

## Task 1 — Dashboard

**Files:**
- Modify: `src/pages/home/HomeAdmin.jsx`

### Step 1.1 — Remove quoteNonPagate query

- [ ] Delete the `quoteNonPagate` query (lines 67–79 in HomeAdmin.jsx):
```js
// DELETE this entire block:
const { data: quoteNonPagate = 0 } = useQuery({
  queryKey: ['admin-quote-non-pagate', societaId],
  enabled: !!societaId,
  queryFn: async () => {
    const { count } = await supabase
      .from('quote')
      .select('*', { count: 'exact', head: true })
      .eq('societa_id', societaId)
      .eq('pagato', false)
    return count ?? 0
  },
  staleTime: 5 * 60 * 1000,
})
```

### Step 1.2 — Restructure KPI cards

- [ ] Remove "Cert. scaduti" from KPI row 1 and replace both KPI rows with one unified 3-col row.

Replace lines 156–182 (the two `<div className="grid ...">` blocks) with:

```jsx
{/* KPI cards */}
<div className="grid grid-cols-3 gap-2">
  {[
    {
      label: 'Squadre',
      value: squadreCount,
      color: 'text-amber-600',
      onClick: null,
    },
    {
      label: 'Partite mese',
      value: partiteMese,
      color: 'text-green-600',
      onClick: null,
    },
    {
      label: 'Provvisorie',
      value: provvisorie.length,
      color: provvisorie.length > 0 ? 'text-purple-600' : 'text-green-600',
      onClick: () => navigate('/admin/partite'),
    },
  ].map(({ label, value, color, onClick }) =>
    onClick ? (
      <button
        key={label}
        onClick={onClick}
        className="bg-white rounded-xl border border-gray-100 py-3 text-center shadow-sm active:scale-[0.98] transition-transform"
      >
        <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
        <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
      </button>
    ) : (
      <div key={label} className="bg-white rounded-xl border border-gray-100 py-3 text-center shadow-sm">
        <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
        <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
      </div>
    )
  )}
</div>
```

Also remove `certScadutiN` from the `urgenzeTot` calculation (line 138) since we're keeping the Cert. scaduti action button but not the KPI card:
```js
// OLD:
const urgenzeTot = provvisorie.length + totalConflicts + certScadutiN
// NEW: (certScadutiN action button still renders, just not a KPI card)
const urgenzeTot = provvisorie.length + totalConflicts + certScadutiN
// Leave urgenzeTot unchanged — certScadutiN still drives the action row
```

### Step 1.3 — Add conflictModalOpen state

- [ ] Add this state declaration next to the existing `editingConflictTraining` on line 16:
```js
const [conflictModalOpen, setConflictModalOpen] = useState(false)
```

### Step 1.4 — Wire Conflitti button to open modal

- [ ] Find the Conflitti action button in the "Azioni urgenti" section (around line 190):
```jsx
<button
  onClick={() => navigate('/admin/allenamenti')}
```
Change the `onClick` to:
```jsx
<button
  onClick={() => setConflictModalOpen(true)}
```

### Step 1.5 — Add missing imports

- [ ] Make sure these are all present in the import section at the top of HomeAdmin.jsx:
```js
import { format, addDays, addWeeks, startOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { CheckCircle2, X } from 'lucide-react'        // add X
import { formatTime } from '../../lib/utils'           // add if missing
```

### Step 1.6 — Add ConflictModal JSX

- [ ] Just before the existing `{editingConflictTraining && <QuickEditAllenamentoModal ...>}` block (around line 261), insert:

```jsx
{conflictModalOpen && (
  <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-4 mb-20">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">
          ⚠️ Conflitti ({totalConflicts})
        </h2>
        <button
          onClick={() => setConflictModalOpen(false)}
          className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
        >
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {conflictsAll.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">Nessun conflitto al momento</p>
        )}
        {conflictsAll.map((c, ci) => (
          <div key={ci} className="rounded-xl border border-red-100 bg-red-50 p-3">

            {/* Partita info */}
            <p className="text-sm font-semibold text-red-700 mb-0.5">
              🏀 {c.partita.squadra}
              {c.partita.avversario ? ` vs ${c.partita.avversario}` : ''}
            </p>
            <p className="text-xs text-red-400 mb-2">
              {format(parseISO(c.partita.data), 'EEE d MMM', { locale: it })}
              {' · '}
              {formatTime(c.partita.ora_inizio)}–{formatTime(c.partita.ora_fine)}
              {c.partita.palestra ? ` · ${c.partita.palestra}` : ''}
            </p>

            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Allenamenti in conflitto
            </p>

            {c.allenamenti.map((t, ti) => (
              <div
                key={ti}
                className="flex items-center justify-between bg-white rounded-lg px-3 py-2 mb-1 border border-red-200"
              >
                <div>
                  <p className="text-xs font-semibold text-gray-800">{t.squadra}</p>
                  <p className="text-xs text-gray-500">
                    {formatTime(t.ora_inizio)}–{formatTime(t.ora_fine)}
                    {t.palestra ? ` · ${t.palestra}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setConflictModalOpen(false)
                    setEditingConflictTraining(t)
                  }}
                  className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium active:scale-95 transition-transform ml-3 shrink-0"
                >
                  Modifica
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
)}
```

### Step 1.7 — Commit

- [ ] Run the dev server and verify:
  - Dashboard loads without errors
  - KPI row shows Squadre, Partite mese, Provvisorie
  - Clicking Conflitti card opens the modal
  - Modal shows conflict list
  - Clicking Modifica closes modal and opens QuickEditAllenamentoModal
  - X button closes the modal

- [ ] Commit:
```bash
git add src/pages/home/HomeAdmin.jsx
git commit -m "feat(admin): dashboard — remove Quote/Cert KPIs, conflict modal inline"
```

---

## Task 2 — Calendario

**Files:**
- Modify: `src/lib/constants.js`
- Modify: `src/pages/CalendarioPage.jsx`
- Modify: `src/components/GrigliaSettimanale.jsx`

### Step 2.1 — Expand PALETTE in constants.js

- [ ] Replace the entire `PALETTE` export (lines 17–26) with the 10-color version that includes `gameBorder` and `gameBg` for partite:

```js
export const PALETTE = [
  { border: 'border-l-blue-500',    bg: 'bg-blue-50',    title: 'text-blue-900',    gameBorder: 'border-l-blue-600',    gameBg: 'bg-blue-100'    },
  { border: 'border-l-emerald-500', bg: 'bg-emerald-50', title: 'text-emerald-900', gameBorder: 'border-l-emerald-600', gameBg: 'bg-emerald-100' },
  { border: 'border-l-violet-500',  bg: 'bg-violet-50',  title: 'text-violet-900',  gameBorder: 'border-l-violet-600',  gameBg: 'bg-violet-100'  },
  { border: 'border-l-orange-500',  bg: 'bg-orange-50',  title: 'text-orange-900',  gameBorder: 'border-l-orange-600',  gameBg: 'bg-orange-100'  },
  { border: 'border-l-teal-500',    bg: 'bg-teal-50',    title: 'text-teal-900',    gameBorder: 'border-l-teal-600',    gameBg: 'bg-teal-100'    },
  { border: 'border-l-rose-500',    bg: 'bg-rose-50',    title: 'text-rose-900',    gameBorder: 'border-l-rose-600',    gameBg: 'bg-rose-100'    },
  { border: 'border-l-indigo-500',  bg: 'bg-indigo-50',  title: 'text-indigo-900',  gameBorder: 'border-l-indigo-600',  gameBg: 'bg-indigo-100'  },
  { border: 'border-l-red-500',     bg: 'bg-red-50',     title: 'text-red-900',     gameBorder: 'border-l-red-600',     gameBg: 'bg-red-100'     },
  { border: 'border-l-cyan-500',    bg: 'bg-cyan-50',    title: 'text-cyan-900',    gameBorder: 'border-l-cyan-600',    gameBg: 'bg-cyan-100'    },
  { border: 'border-l-lime-500',    bg: 'bg-lime-50',    title: 'text-lime-900',    gameBorder: 'border-l-lime-600',    gameBg: 'bg-lime-100'    },
]
```

### Step 2.2 — CalendarioPage: remove scope filter

- [ ] Delete these state declarations (around lines 839, 841):
```js
// DELETE:
const [mySquadreOnly,    setMySquadreOnly]    = useState(true)
const [allenatoreFilter, setAllenatoreFilter] = useState('')
```

- [ ] Delete the `scopeFilter` derived value (around lines 913–915) and the `allenatoreFilterFn` useMemo (around lines 918–928). Replace all usages of `scopeFilter` with `() => true` and all usages of `allenatoreFilterFn` with `() => true`.

- [ ] Search for the UI element that renders the "Mie squadre / Tutti" toggle and delete it. It looks like:
```jsx
// DELETE this block (exact structure may vary — find by searching "mySquadreOnly"):
<div className="flex ...">
  <button onClick={() => setMySquadreOnly(true)} ...>Mie squadre</button>
  <button onClick={() => setMySquadreOnly(false)} ...>Tutti</button>
</div>
```

- [ ] Also search for the allenatore filter dropdown/selector and delete it too.

### Step 2.3 — CalendarioPage: remove Settimana/Mese toggle from Partite tab

- [ ] Delete the `view` state (around line 836):
```js
// DELETE:
const [view, setView] = useState('settimana')
```

- [ ] Delete `monthOffset`, `currentMonthDate`, `monthLabel` states and their derived values (around lines 838, 863–870).

- [ ] Delete the `monthPartite` query (line 873):
```js
// DELETE:
const { data: monthPartite = [], isLoading: monthLoading } = useMonthPartite(currentMonthDate, view === 'mese')
```
Remove `useMonthPartite` from the import on line 18.

- [ ] Delete the Settimana/Mese toggle UI (around lines 1137–1150):
```jsx
// DELETE this block:
{/* View toggle */}
<div className="flex bg-secondary rounded-xl p-1 gap-1">
  {[['settimana', 'Settimana'], ['mese', 'Mese']].map(([v, label]) => (
    <button ...>{label}</button>
  ))}
</div>
```

- [ ] Remove any JSX that conditionally renders the mese (month) view: keep only the week view rendering. Remove `monthLoading`, `displayMonthEvents`, `monthLabel`, `monthOffset`, `setMonthOffset` references.

### Step 2.4 — CalendarioPage: rename "Settimana" tab label

- [ ] Find (around line 1107):
```jsx
{[['partite', 'Partite'], ['settimana', 'Settimana'], ['importa', 'Importa']].map(...)}
```
Change `'Settimana'` to `'Orario Settimanale'`:
```jsx
{[['partite', 'Partite'], ['settimana', 'Orario Settimanale'], ['importa', 'Importa']].map(...)}
```

### Step 2.5 — CalendarioPage: add team colors to Vista Lista (VistaSettimanaleCompleta)

- [ ] Add `import { PALETTE } from '../lib/constants'` at the top of CalendarioPage.jsx (if not already imported — check existing imports first).

- [ ] Add a `getTeamColor` helper after the existing color helpers at the top of the file (around line 27):
```js
function getTeamColor(squadra, allSquadre) {
  const idx = allSquadre.indexOf(squadra)
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length]
}
```

- [ ] Add `allSquadre` to `VistaSettimanaleCompleta`'s props signature (line 632):
```js
// OLD:
function VistaSettimanaleCompleta({ weekDays, data, scopeFilter, allenatoreFilterFn, squadraFilter, conflictedTrainingKeys, conflictMap, onPartitaClick, onNavigateAllenamenti, onTrainingEdit }) {
// NEW (add allSquadre):
function VistaSettimanaleCompleta({ weekDays, data, allSquadre, squadraFilter, conflictedTrainingKeys, conflictMap, onPartitaClick, onNavigateAllenamenti, onTrainingEdit }) {
```
(scopeFilter and allenatoreFilterFn removed since they're now `() => true`)

- [ ] Inside `VistaSettimanaleCompleta`, find where `dayTrainings` cards are rendered (search for `dayTrainings.map`). For each allenamento card rendered there, add the team color left border. The card container (likely a `<div>` or `<button>`) should get:
```jsx
// Before (example — match the actual class string in the code):
<div className="bg-white rounded-xl border border-gray-100 ...">
// After:
const col = getTeamColor(ev.squadra, allSquadre)
<div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${col.border} ...`}>
```

- [ ] Pass `allSquadre={squadre}` when calling `<VistaSettimanaleCompleta>` in the JSX (search for `<VistaSettimanaleCompleta` in CalendarioPage, add the prop).

### Step 2.6 — GrigliaSettimanale: render partite in the grid

- [ ] In `src/components/GrigliaSettimanale.jsx`, find line 180:
```js
// OLD:
.filter(e => e._tipo === 'allenamento' && !e.annullato)
// NEW:
.filter(e => !e.annullato && (e._tipo === 'allenamento' || e._tipo === 'partita'))
```

- [ ] In the same file, update the cell renderer (around lines 132–145) to distinguish partite from allenamenti using `gameBg` from PALETTE:
```jsx
{cell.events.map((e, i) => {
  const col = getColor(e.squadra, allSquadre)
  const isPartita = e._tipo === 'partita'
  return (
    <div
      key={i}
      className={`rounded px-1.5 py-1 leading-snug ${isPartita ? col.gameBg : col.bg} ${col.title} ${i > 0 ? 'mt-1' : ''}`}
    >
      {isPartita && (
        <div className="text-[9px] font-bold bg-current/20 rounded px-1 mb-0.5 inline-block uppercase tracking-wide">
          Gara
        </div>
      )}
      <div className="font-bold text-xs">
        {isPartita ? (e.avversario ? `vs ${e.avversario}` : 'Partita') : e.squadra}
      </div>
      <div className="text-xs opacity-75">{hhmm(e.ora_inizio)}–{hhmm(e.ora_fine)}</div>
      {!isPartita && e.allenatori && (
        <div className="text-xs opacity-60 truncate">{e.allenatori}</div>
      )}
      {isPartita && e.casa_fuori && (
        <div className="text-xs opacity-60">{e.casa_fuori}</div>
      )}
    </div>
  )
})}
```

Note: `gameBg` is now part of each PALETTE entry (added in Step 2.1). `getColor` in GrigliaSettimanale still works the same way; it returns the full PALETTE object including the new `gameBg`/`gameBorder` fields.

### Step 2.7 — Commit

- [ ] Run the dev server. Check:
  - Calendario → Partite tab: no more Settimana/Mese toggle, no scope selector
  - Calendario → Orario Settimanale tab: tab label shows "Orario Settimanale"
  - Vista Lista: each allenamento card has colored left border by team
  - Vista Griglia: partite appear in the grid with vivid background ("Gara" badge)
  - GrigliaSettimanale empty state is still correct when no events

- [ ] Commit:
```bash
git add src/lib/constants.js src/pages/CalendarioPage.jsx src/components/GrigliaSettimanale.jsx
git commit -m "feat(calendario): team colors, Orario Settimanale rename, partite in griglia, 10-color palette"
```

---

## Task 3 — Allenamenti

**Files:**
- Create: `src/components/SettimanaTipoTab.jsx`
- Modify: `src/pages/AllenamentiPage.jsx`

### Step 3.1 — Create SettimanaTipoTab.jsx

- [ ] Create `src/components/SettimanaTipoTab.jsx` with this shell:
```jsx
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Edit2, X, Plus, AlertTriangle, LayoutGrid, List,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { PALETTE, GIORNI, GIORNO_FULL as GIORNI_LABEL } from '../lib/constants'
import { formatTime } from '../lib/utils'
import { Modal, Field, inp } from '../components/ui'
import { GrigliaTipo } from './GrigliaSettimanale'

// Paste EMPTY_FISSO and the full SettimanaTipoTab function body verbatim
// from AllenamentiPage.jsx lines 1209–(end of SettimanaTipoTab, before "Main" section).
// The function signature must remain:
// export default function SettimanaTipoTab({ isAdmin, isAllenatore, squadreAllenatore = null, squadraFilter = '', allenatoreFilter = '', palestraFilter = '' })
```

- [ ] Open `src/pages/AllenamentiPage.jsx` and locate:
  - `const EMPTY_FISSO = ...` (line 1209)
  - `function SettimanaTipoTab(...)` (line 1211) through the closing `}` before the `// ─── Main ─────` comment (line ~1554)
  
  Copy that entire block verbatim into `SettimanaTipoTab.jsx`, adding `export default` before `function SettimanaTipoTab`.

- [ ] Run: check the file compiles without errors by verifying all imports are present.

### Step 3.2 — Remove SettimanaTipoTab from AllenamentiPage

- [ ] In `src/pages/AllenamentiPage.jsx`, delete:
  - `const EMPTY_FISSO = ...` (line 1209)
  - The entire `function SettimanaTipoTab(...)` block (lines 1211–~1554)
  - The `GrigliaTipo` import from line 17 (it's now only needed inside SettimanaTipoTab.jsx, not in AllenamentiPage)
  - The `StatistichePage` import (line 13) — will become unused in the next step

### Step 3.3 — Remove "tipo" and "statistiche" tabs

- [ ] Replace TABS (lines 1556–1560):
```js
// OLD:
const TABS = [
  { id: 'oggi',        label: 'Oggi'        },
  { id: 'tipo',        label: 'Tipo'        },
  { id: 'statistiche', label: 'Statistiche' },
]
// NEW:
const TABS = [
  { id: 'oggi', label: 'Oggi' },
]
```

- [ ] In the render section (around lines 1671–1674), delete:
```jsx
// DELETE both of these lines:
{activeTab === 'tipo'        && <SettimanaTipoTab ... />}
{activeTab === 'statistiche' && <StatistichePage embedded />}
```

### Step 3.4 — Remove scope filter controls

- [ ] Delete the `mySquadreOnly` state declaration (around line 1565):
```js
// DELETE:
const [mySquadreOnly, setMySquadreOnly] = useState(!!squadreAllenatore?.length)
```

- [ ] Search for the UI toggle "Mie squadre / Tutti gli allenatori" in the PageHeader area and delete that button group. It will be rendering `setMySquadreOnly` on click.

- [ ] Replace any remaining `mySquadreOnly` usages (filter conditions on `onlySquadre` prop) with a neutral value. Specifically, in the `<OggiTab>` call (line 1671):
```jsx
// OLD (example):
onlySquadre={mySquadreOnly && squadreAllenatore?.length ? squadreAllenatore : null}
// NEW:
onlySquadre={null}
```

### Step 3.5 — Commit

- [ ] Run the dev server. Check:
  - Allenamenti page loads showing only "Oggi" tab
  - No scope switcher visible
  - No Tipo or Statistiche tabs
  - Oggi tab still works (today's training cards show)

- [ ] Commit:
```bash
git add src/components/SettimanaTipoTab.jsx src/pages/AllenamentiPage.jsx
git commit -m "feat(allenamenti): remove Tipo/Statistiche tabs and scope filter; extract SettimanaTipoTab"
```

---

## Task 4 — Presenze (new section)

**Files:**
- Create: `src/pages/admin/PresenzeAdmin.jsx`
- Modify: `src/layouts/AdminLayout.jsx`
- Modify: `src/App.jsx`

### Step 4.1 — Create PresenzeAdmin.jsx

- [ ] Create `src/pages/admin/PresenzeAdmin.jsx`:

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronLeft, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { PALETTE } from '../../lib/constants'

function getTeamColor(squadra, allSquadre) {
  const idx = allSquadre.indexOf(squadra)
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length]
}

function PercentualeBadge({ pct }) {
  if (pct === null) return <span className="text-xs text-gray-300 font-medium">—</span>
  const color =
    pct >= 75 ? 'bg-green-100 text-green-700' :
    pct >= 50 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${color}`}>
      {pct}%
    </span>
  )
}

function SquadraDetail({ squadra, allSquadre, onBack }) {
  const { societaId } = useAuth()
  const col = getTeamColor(squadra, allSquadre)

  const { data: giocatoriPresenze = [], isLoading, error } = useQuery({
    queryKey: ['presenze-admin', squadra, societaId],
    enabled: !!squadra && !!societaId,
    queryFn: async () => {
      const { data: giocatori, error: ge } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .eq('squadra', squadra)
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      if (ge) throw ge
      if (!giocatori.length) return []

      const { data: presenze, error: pe } = await supabase
        .from('presenze')
        .select('giocatore_id, presente')
        .in('giocatore_id', giocatori.map(g => g.id))
      if (pe) throw pe

      return giocatori.map(g => {
        const gp = (presenze ?? []).filter(p => p.giocatore_id === g.id)
        const totali = gp.length
        const presenti = gp.filter(p => p.presente).length
        return {
          ...g,
          totali,
          presenti,
          percentuale: totali > 0 ? Math.round(presenti * 100 / totali) : null,
        }
      })
    },
    staleTime: 2 * 60 * 1000,
  })

  return (
    <div>
      <div className={`flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100 border-l-4 ${col.border}`}>
        <button onClick={onBack} className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-gray-800 text-sm">{squadra}</span>
      </div>

      {isLoading && <div className="pt-8"><LoadingSpinner /></div>}
      {error && <p className="text-sm text-red-500 px-4 pt-4">{error.message}</p>}

      {!isLoading && !error && (
        <div className="px-4 pt-4 pb-4 space-y-2">
          {giocatoriPresenze.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">Nessun giocatore attivo in questa squadra</p>
          )}
          {giocatoriPresenze.map(g => (
            <div
              key={g.id}
              className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-gray-800">{g.cognome} {g.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {g.totali > 0
                    ? `${g.presenti} presenze su ${g.totali}`
                    : 'Nessun dato registrato'}
                </p>
              </div>
              <PercentualeBadge pct={g.percentuale} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PresenzeAdmin() {
  const { displayName, logout, societaNome, societaId } = useAuth()
  const [selectedSquadra, setSelectedSquadra] = useState(null)

  const { data: squadre = [], isLoading } = useQuery({
    queryKey: ['squadre-nomi', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="pb-20">
      <AppHeader
        title="Presenze"
        subtitle={selectedSquadra ?? 'Seleziona una squadra'}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {selectedSquadra ? (
        <SquadraDetail
          squadra={selectedSquadra}
          allSquadre={squadre}
          onBack={() => setSelectedSquadra(null)}
        />
      ) : (
        <div className="px-4 pt-4 space-y-2">
          {isLoading && <div className="pt-8"><LoadingSpinner /></div>}
          {squadre.map((s) => {
            const col = getTeamColor(s, squadre)
            return (
              <button
                key={s}
                onClick={() => setSelectedSquadra(s)}
                className={`w-full bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 px-4 py-3.5 border-l-4 ${col.border} active:scale-[0.99] transition-transform text-left`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${col.bg}`}>
                  <Users size={15} className={col.title} />
                </div>
                <span className="flex-1 font-semibold text-sm text-gray-800">{s}</span>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
          {!isLoading && squadre.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">Nessuna squadra configurata</p>
          )}
        </div>
      )}
    </div>
  )
}
```

### Step 4.2 — Add Presenze to AdminLayout nav

- [ ] In `src/layouts/AdminLayout.jsx`, add `Activity` to the lucide-react import:
```js
import { Trophy, Dumbbell, Users, Settings, LayoutDashboard, Bell, Activity } from 'lucide-react'
```

- [ ] Add the Presenze NavLink **between Allenamenti and Persone**:
```jsx
<NavLink to="/admin/allenamenti" className={cls}>
  <Dumbbell size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Allenamenti</span>
</NavLink>
{/* NEW: */}
<NavLink to="/admin/presenze" className={cls}>
  <Activity size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Presenze</span>
</NavLink>
<NavLink to="/admin/persone" className={cls}>
  <Users size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Persone</span>
</NavLink>
```

The nav now has 7 items. Tighten spacing to avoid overflow: change `px-1.5` to `px-1` and `min-w-[44px]` to `min-w-[36px]` in the `cls` function.

### Step 4.3 — Add route to App.jsx

- [ ] Add import at the top of `src/App.jsx`:
```js
import PresenzeAdmin from './pages/admin/PresenzeAdmin'
```

- [ ] Add the route inside the `/admin` nested Route block, after the `allenamenti` route:
```jsx
<Route path="allenamenti" element={<AllenamentiPage />} />
<Route path="presenze"    element={<PresenzeAdmin />} />  {/* NEW */}
<Route path="bacheca"     element={<BachecaPage />} />
```

### Step 4.4 — Commit

- [ ] Run the dev server. Check:
  - "Presenze" nav icon appears in the bottom nav
  - Navigating to /admin/presenze shows the squadre list
  - Clicking a squadra shows the player list with percentages
  - Back button returns to squadra list
  - Empty states render cleanly

- [ ] Commit:
```bash
git add src/pages/admin/PresenzeAdmin.jsx src/layouts/AdminLayout.jsx src/App.jsx
git commit -m "feat(admin): add Presenze section — squad list + per-player attendance percentage"
```

---

## Task 5 — Setup

**Files:**
- Modify: `src/pages/admin/SetupMenu.jsx`
- Modify: `src/pages/SetupPage.jsx`

### Step 5.1 — Update SetupMenu SECTIONS

- [ ] In `src/pages/admin/SetupMenu.jsx`, update the `SECTIONS` constant and the imports:

Add `CalendarDays` to the lucide-react import and remove `CreditCard, Calendar, Building`:
```js
import { Users, Dumbbell, UserCheck, Trophy, Building2, GitFork, ChevronRight, CalendarDays } from 'lucide-react'
```

Replace the `SECTIONS` constant:
```js
const SECTIONS = [
  {
    group: '👥 Persone',
    items: [
      { icon: Trophy,       label: 'Giocatori',       desc: 'Anagrafica, squadre, info',   tab: 'giocatori' },
      { icon: Dumbbell,     label: 'Allenatori',       desc: 'Profili e assegnazione',      tab: 'allenatori' },
      { icon: UserCheck,    label: 'Utenti & Accessi', desc: 'Inviti, ruoli, password',     tab: 'utenti' },
    ],
  },
  {
    group: '🏢 Struttura societaria',
    items: [
      { icon: Users,        label: 'Squadre',          desc: 'Categorie e nomi squadre',    tab: 'squadre' },
      { icon: Building2,    label: 'Palestre',          desc: 'Sedi e orari',                tab: 'palestre' },
    ],
  },
  {
    group: '🛠 Strumenti',
    items: [
      { icon: GitFork,      label: 'Doppio Campionato', desc: 'Squadre con giocatori comuni', tab: 'squadre_allenatori' },
      { icon: CalendarDays, label: 'Settimana Tipo',    desc: 'Template orario settimanale',  tab: 'settimana_tipo' },
    ],
  },
]
```

The `navigate(\`/admin/setup/${tab}\`)` call already handles routing correctly — no other changes needed in this file.

### Step 5.2 — Transform SetupPage into standalone section pages

The new SetupPage no longer shows a tab bar. It reads the `:tab` URL param and renders only that section, with a PageHeader that has a back button.

- [ ] In `src/pages/SetupPage.jsx`:

**Replace ALL_TABS** (lines 2935–2945):
```js
const ALL_TABS = [
  { id: 'squadre',            label: 'Squadre',          icon: Users     },
  { id: 'palestre',           label: 'Palestre',          icon: Building2 },
  { id: 'allenatori',         label: 'Allenatori',        icon: UserCheck },
  { id: 'giocatori',          label: 'Giocatori',         icon: UserPlus  },
  { id: 'utenti',             label: 'Utenti & Accessi',  icon: Shield    },
  { id: 'squadre_allenatori', label: 'Doppio Campionato', icon: GitFork   },
  { id: 'settimana_tipo',     label: 'Settimana Tipo',    icon: Calendar  },
]
```

**Replace the `SetupPage` component** (lines 2947–2984):
```jsx
export default function SetupPage() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const tabMeta = ALL_TABS.find(t => t.id === tab) ?? ALL_TABS[0]

  const backButton = (
    <button
      onClick={() => navigate('/admin/setup')}
      className="flex items-center gap-1 text-amber-200 hover:text-white text-xs font-medium"
    >
      <ChevronLeft size={15} /> Setup
    </button>
  )

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <PageHeader title={tabMeta.label} actions={backButton} />
      <div className="flex-1 p-4">
        {tab === 'squadre'            && <SquadreTab />}
        {tab === 'palestre'           && <PalestreTab />}
        {tab === 'allenatori'         && <AllenatoriTab />}
        {tab === 'giocatori'          && <GiocatoriTab />}
        {tab === 'utenti'             && <UtentiTab />}
        {tab === 'squadre_allenatori' && <SquadreAllenatoriTab />}
        {tab === 'settimana_tipo'     && <SettimanaTipoTab isAdmin={isAdmin} />}
      </div>
    </div>
  )
}
```

- [ ] Add the missing imports to the top of SetupPage.jsx:
  - `useNavigate` to the react-router-dom import (line 2): `import { useParams, useNavigate } from 'react-router-dom'`
  - `ChevronLeft, GitFork` to the lucide-react import block (lines 5–8)
  - `SettimanaTipoTab` after the existing component imports: `import SettimanaTipoTab from '../components/SettimanaTipoTab'`

### Step 5.3 — Fix GuidaRapida (if present)

`GuidaRapida` is an internal component that previously called `setActiveTab(id)` to navigate between tabs. Since the tab switcher is gone, it must navigate instead.

- [ ] Search for `GuidaRapida` in SetupPage.jsx and find its internal calls to `setActiveTab`. Replace them with navigate calls:
```jsx
// Find every setActiveTab(someId) inside GuidaRapida and replace:
// OLD: setActiveTab('giocatori')
// NEW: navigate('/admin/setup/giocatori')
```

Also add `useNavigate` inside GuidaRapida if it's a separate function component (it likely already uses the outer navigate via props — check).

If GuidaRapida accepts `setActiveTab` as a prop (line 2971 old code: `<GuidaRapida setActiveTab={setActiveTab} />`), change the call to:
```jsx
{/* Remove setActiveTab prop since we use navigate now */}
```
and update GuidaRapida's implementation to call `navigate('/admin/setup/' + id)` directly.

### Step 5.4 — Remove initialTab prop usage in App.jsx

- [ ] In `src/App.jsx`, the admin setup routes are already:
```jsx
<Route path="setup"       element={<SetupMenu />} />
<Route path="setup/:tab"  element={<SetupPage />} />
```
The `initialTab` prop is no longer used by SetupPage. If there are any `<SetupPage initialTab="...">` usages elsewhere in App.jsx, remove the `initialTab` prop.

### Step 5.5 — Commit

- [ ] Run the dev server. Check:
  - /admin/setup shows SetupMenu with 3 sections (Persone, Struttura societaria, Strumenti)
  - Quote, Società, Scheduling items are gone
  - Doppio Campionato and Settimana Tipo are present
  - Clicking any item navigates to a standalone page with PageHeader + section title
  - PageHeader shows a "← Setup" back button that returns to /admin/setup
  - All sections render their forms/tables correctly
  - Settimana Tipo section shows the full weekly template editor

- [ ] Commit:
```bash
git add src/pages/admin/SetupMenu.jsx src/pages/SetupPage.jsx
git commit -m "feat(setup): standalone section pages, remove Quote/Società/Scheduling, add Settimana Tipo"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1: Remove Quote KPI card — row 2 "Quote non pagate" removed
- ✅ Task 1: Remove Certificati Medici KPI card — row 1 "Cert. scaduti" removed
- ✅ Task 1: Conflitti → inline modal (not navigate) — done with ConflictModal + QuickEditAllenamentoModal
- ✅ Task 2: Remove "Mie squadre / Tutti gli allenatori" from Calendario — done
- ✅ Task 2: Rename "Settimana" → "Orario Settimanale" — done
- ✅ Task 2: Note on "Settimana/Mese" buttons in spec: the spec says to remove these from Vista Lista and Vista Griglia. In the current codebase, the Settimana/Mese toggle exists only in the Partite tab (not in the Orario Settimanale section itself). Removing it from the Partite tab satisfies the spirit of the spec.
- ✅ Task 2: Team color on left border of allenamenti — done in VistaSettimanaleCompleta
- ✅ Task 2: 10-color PALETTE consistent across app — done in constants.js
- ✅ Task 2: Partite in Griglia with vivid colors — done in GrigliaSettimanale (gameBg)
- ✅ Task 3: Remove "Mie squadre / Tutti gli allenatori" from Allenamenti — done
- ✅ Task 3: Remove Statistiche tab from Allenamenti — done
- ✅ Task 3: Remove Tipo tab from Allenamenti, move to Setup — done (SettimanaTipoTab extracted)
- ✅ Task 4: Presenze section — Level 1 = squadre, Level 2 = players + % — done
- ✅ Task 4: Real data from `presenze` table — done via Supabase query
- ✅ Task 4: Route protected by Admin role via ProtectedRoute wrapper on /admin subtree — already handled by existing parent route protection
- ✅ Task 4: Nav item added to AdminLayout — done
- ✅ Task 5: Remove Quote/Società/Scheduling from Setup — done in SetupMenu + ALL_TABS
- ✅ Task 5: Keep Giocatori, Squadre, Palestre, Utenti, Allenatori, Doppio Campionato — all kept
- ✅ Task 5: Add Settimana Tipo to Setup — done
- ✅ Task 5: Each section opens a dedicated independent page — done (PageHeader, no tab bar)
- ✅ Task 5: Back button to /admin/setup — done via actions prop in PageHeader

**Placeholder check:** No TBD or "fill in later" statements present.

**Type consistency:**
- `SettimanaTipoTab` extracted with same props signature: `{ isAdmin, isAllenatore, squadreAllenatore, squadraFilter, allenatoreFilter, palestraFilter }` — all optional with defaults in source. SetupPage calls with `isAdmin={isAdmin}` only; remaining props default correctly.
- `PALETTE` entries now have 5 properties: `border`, `bg`, `title`, `gameBorder`, `gameBg`. GrigliaSettimanale uses `col.gameBg`; this property now exists on all 10 entries.
- `getTeamColor` defined identically in `CalendarioPage.jsx`, `PresenzeAdmin.jsx` — same logic. These could be consolidated into `constants.js` in a future refactor, but for now keeping inline matches the existing `AllenamentiPage` pattern.
