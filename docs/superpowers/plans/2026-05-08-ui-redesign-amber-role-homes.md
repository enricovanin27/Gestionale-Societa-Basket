# UI Redesign: Palette Ambra + Home per Ruolo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la palette blu con una palette ambra/calda, estrarre i componenti condivisi duplicati, spezzare il monolitico `HomePage.jsx` (2387 righe) in sotto-componenti per ruolo, e creare una nuova vista agenda 7 giorni per genitore/giocatore.

**Architecture:** I CSS custom properties in `index.css` (Tailwind v4 @theme) gestiscono il cambio di palette in modo uniforme. `HomePage.jsx` diventa un orchestratore sottile (~15 righe) che delega a `HomeAdmin`, `HomeAllenatore`, `HomeGenitore` in `frontend/src/pages/home/`. I sotto-componenti condivisi tra più home views vivono in `frontend/src/pages/home/shared.jsx`.

**Tech Stack:** React 19, Tailwind CSS v4 (CSS @theme), shadcn/ui, @tanstack/react-query v5, date-fns v4, lucide-react, Supabase JS v2

---

## Struttura file

| File | Azione |
|------|--------|
| `frontend/src/index.css` | Modifica — palette da blu a ambra |
| `frontend/src/components/CambiaPasswordButton.jsx` | Crea — componente condiviso estratto |
| `frontend/src/components/AppHeader.jsx` | Crea — header con gradiente ambra |
| `frontend/src/components/BottomNav.jsx` | Modifica — colore attivo ambra |
| `frontend/src/pages/home/shared.jsx` | Crea — sub-componenti condivisi dalle home |
| `frontend/src/pages/home/HomeAdmin.jsx` | Crea — estratto da HomePage.jsx |
| `frontend/src/pages/home/HomeAllenatore.jsx` | Crea — estratto da HomePage.jsx |
| `frontend/src/pages/home/HomeGenitore.jsx` | Crea — nuova agenda 7 giorni |
| `frontend/src/pages/HomePage.jsx` | Modifica — thin orchestrator |
| `frontend/src/pages/SegreteriePage.jsx` | Modifica — rimuovi CambiaPasswordButton duplicato, aggiorna header |
| `frontend/src/pages/LoginPage.jsx` | Modifica — palette ambra |
| `frontend/src/pages/BachecaPage.jsx` | Modifica — header ambra |
| `frontend/src/pages/AllenamentiPage.jsx` | Modifica — header ambra |
| `frontend/src/App.jsx` | Modifica — NuovaPasswordPage usa ambra |

---

## Task 1: Palette ambra — CSS custom properties

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Aggiorna i token di design in index.css**

Sostituisci il blocco `:root { ... }` con:

```css
@layer base {
  :root {
    /* Palette calda — ambra/arancio */
    --background:           #fffbeb;   /* amber-50  */
    --foreground:           #1c1917;   /* stone-900 */
    --card:                 #ffffff;
    --card-foreground:      #1c1917;
    --primary:              #d97706;   /* amber-600 */
    --primary-foreground:   #ffffff;
    --secondary:            #fef3c7;   /* amber-100 */
    --secondary-foreground: #92400e;   /* amber-800 */
    --muted:                #fffbeb;   /* amber-50  */
    --muted-foreground:     #78716c;   /* stone-500 */
    --accent:               #fef9c3;   /* yellow-100 */
    --accent-foreground:    #78350f;   /* amber-900 */
    --destructive:          #ef4444;   /* red-500   */
    --border:               #fde68a;   /* amber-200 */
    --input:                #fffbeb;   /* amber-50  */
    --ring:                 #d97706;   /* amber-600 */
    --radius:               0.75rem;
  }
}
```

- [ ] **Step 2: Verifica che la build non abbia errori**

```bash
cd frontend && npm run build
```

Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: palette ambra warm — token CSS da blu a amber-600"
```

---

## Task 2: Estrai CambiaPasswordButton come componente condiviso

**Files:**
- Create: `frontend/src/components/CambiaPasswordButton.jsx`
- Modify: `frontend/src/pages/HomePage.jsx` (rimuovi la definizione locale)
- Modify: `frontend/src/pages/SegreteriePage.jsx` (rimuovi la definizione locale)

- [ ] **Step 1: Crea il file**

```jsx
// frontend/src/components/CambiaPasswordButton.jsx
import { useState } from 'react'
import { Lock, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function CambiaPasswordButton() {
  const [open,    setOpen]    = useState(false)
  const [form,    setForm]    = useState({ nuova: '', conferma: '' })
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState(null)
  const [ok,      setOk]      = useState(false)

  function reset() { setOpen(false); setOk(false); setErr(null); setForm({ nuova: '', conferma: '' }) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.nuova !== form.conferma) { setErr('Le password non coincidono'); return }
    setLoading(true); setErr(null)
    const { error } = await supabase.auth.updateUser({ password: form.nuova })
    setLoading(false)
    if (error) { setErr(error.message); return }
    setOk(true)
    setTimeout(reset, 2000)
  }

  const inp = 'w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-amber-200 hover:text-white">
        <Lock size={12} /> Password
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={reset}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Cambia password</h2>
              <button onClick={reset} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            {ok ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-2">✅</div>
                <p className="font-semibold text-gray-800">Password aggiornata!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Nuova password</label>
                  <input type="password" value={form.nuova}
                    onChange={e => setForm(f => ({ ...f, nuova: e.target.value }))}
                    className={inp} placeholder="Minimo 6 caratteri" required minLength={6} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Conferma password</label>
                  <input type="password" value={form.conferma}
                    onChange={e => setForm(f => ({ ...f, conferma: e.target.value }))}
                    className={inp} placeholder="Ripeti la password" required />
                </div>
                {err && <p className="text-xs text-red-500">{err}</p>}
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
                  {loading ? 'Aggiornamento...' : 'Aggiorna password'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: In HomePage.jsx, rimuovi la definizione locale di CambiaPasswordButton (righe ~40-113) e aggiungi l'import**

In cima a `frontend/src/pages/HomePage.jsx`, aggiungi tra gli import esistenti:
```js
import CambiaPasswordButton from '../components/CambiaPasswordButton'
```
Poi elimina l'intera funzione `CambiaPasswordButton` dal file (righe 40-113).

- [ ] **Step 3: In SegreteriePage.jsx, rimuovi la definizione locale e aggiungi l'import**

In cima a `frontend/src/pages/SegreteriePage.jsx`:
```js
import CambiaPasswordButton from '../components/CambiaPasswordButton'
```
Poi elimina l'intera funzione `CambiaPasswordButton` dal file (circa righe 23-89).

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build
```
Atteso: zero errori.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CambiaPasswordButton.jsx frontend/src/pages/HomePage.jsx frontend/src/pages/SegreteriePage.jsx
git commit -m "refactor: estrai CambiaPasswordButton come componente condiviso"
```

---

## Task 3: Crea AppHeader condiviso

**Files:**
- Create: `frontend/src/components/AppHeader.jsx`

Il componente sostituisce l'header blu inline che appare in AdminHome, NuovaHome, GenitoreHome, SegreteriePage.

- [ ] **Step 1: Crea il file**

```jsx
// frontend/src/components/AppHeader.jsx
import { LogOut } from 'lucide-react'
import CambiaPasswordButton from './CambiaPasswordButton'

export default function AppHeader({ title, subtitle, displayName, logout, societaNome, children }) {
  return (
    <div className="bg-gradient-to-r from-amber-800 to-amber-600 text-white px-4 pt-10 pb-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🏀</span>
            <span className="font-bold text-lg">{societaNome ?? 'Gestionale Basket'}</span>
          </div>
          {title && (
            <p className="text-amber-100 text-base font-semibold mt-1">{title}</p>
          )}
          {subtitle && (
            <p className="text-amber-200 text-sm capitalize mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xs text-amber-200 text-right max-w-[120px] truncate">{displayName}</span>
          <div className="flex items-center gap-3">
            <CambiaPasswordButton />
            <button onClick={logout} className="flex items-center gap-1 text-xs text-amber-300 hover:text-white">
              <LogOut size={13} /> Esci
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```
Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AppHeader.jsx
git commit -m "feat: aggiungi AppHeader condiviso con gradiente ambra"
```

---

## Task 4: Restyle BottomNav

**Files:**
- Modify: `frontend/src/components/BottomNav.jsx`

- [ ] **Step 1: Cambia il colore attivo da blu ad ambra**

Nel `className` del `NavLink`, cambia:
```js
isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
```
con:
```js
isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
```

Il badge rosso delle notifiche (background `bg-red-500`) rimane invariato — è corretto per una notifica di alert.

- [ ] **Step 2: Build e verifica**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BottomNav.jsx
git commit -m "style: BottomNav — colore attivo da blue-600 a amber-600"
```

---

## Task 5: Crea pages/home/shared.jsx

**Files:**
- Create: `frontend/src/pages/home/shared.jsx`

Questo file contiene tutti i sotto-componenti usati da più home views, estratti da `HomePage.jsx`. Niente viene eliminato da `HomePage.jsx` in questo task — lo faremo nei task successivi.

- [ ] **Step 1: Crea la cartella**

```bash
mkdir -p frontend/src/pages/home
```

- [ ] **Step 2: Crea shared.jsx con tutti i sotto-componenti**

```jsx
// frontend/src/pages/home/shared.jsx
import { useState } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { Clock, MapPin, AlertCircle, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { formatTime, formatDate, isDateToday } from '../../lib/utils'
import { saveAllenamento, annullaAllenamento, inviaNotificaModifica } from '../../hooks/useAllenamenti'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function timesOverlap(as, ae, bs, be) {
  const n = t => String(t ?? '').slice(0, 5)
  const [a0, a1, b0, b1] = [as, ae, bs, be].map(n)
  if (!a0 || !a1 || !b0 || !b1) return false
  return a0 < b1 && a1 > b0
}

export function parseList(str) {
  return (str ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

// ─── Utility UI ───────────────────────────────────────────────────────────────

export function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-4 mb-2">
      {children}
    </h2>
  )
}

// ─── EventRow (compact card) ──────────────────────────────────────────────────

export function EventRow({ event }) {
  const isPartita = event._tipo === 'partita'
  let bk = 'allenamento'
  if (isPartita) {
    if (event.stato === 'provvisoria') bk = 'partita_prov'
    else if ((event.casa_fuori ?? '').toLowerCase() === 'casa') bk = 'partita_casa'
    else bk = 'partita_trasferta'
  }

  const accentBar = {
    allenamento:       'border-l-amber-400',
    partita_casa:      'border-l-green-500',
    partita_trasferta: 'border-l-blue-500',
    partita_prov:      'border-l-yellow-400',
  }[bk]

  const badgeEl = isPartita && (
    event.stato === 'provvisoria'
      ? <Badge variant="warning">⚠ Provvisoria</Badge>
      : (event.casa_fuori ?? '').toLowerCase() === 'casa'
        ? <Badge variant="success">Casa</Badge>
        : <Badge variant="default">Trasferta</Badge>
  )

  return (
    <Card className={`border-l-4 ${accentBar}`}>
      <CardContent className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {isPartita
                ? `${event.squadra}${event.avversario ? ` vs ${event.avversario}` : ''}`
                : event.squadra}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
              {event.ora_inizio && (
                <span className="flex items-center gap-1 font-medium text-foreground/80">
                  <Clock size={11} /> {formatTime(event.ora_inizio)}–{formatTime(event.ora_fine)}
                </span>
              )}
              {event.palestra && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} /> {event.palestra}
                </span>
              )}
            </div>
          </div>
          {badgeEl}
        </div>
      </CardContent>
    </Card>
  )
}

export function DaySection({ label, events, emptyMsg = 'Nessun impegno' }) {
  return (
    <section>
      <SectionTitle>{label}</SectionTitle>
      {events.length === 0 ? (
        <div className="mx-4 flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl py-3 px-3">
          <span>✅ {emptyMsg}</span>
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {events.map((e, i) => (
            <EventRow key={`${e._source ?? 'e'}-${e.id ?? i}`} event={e} />
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Allenatore event dot color ───────────────────────────────────────────────

export function getAllenatoreEventDotColor(event) {
  if (event._tipo === 'allenamento') return 'bg-amber-400'
  if (event.stato === 'provvisoria') return 'bg-yellow-400'
  return (event.casa_fuori ?? '').toLowerCase() === 'casa' ? 'bg-green-500' : 'bg-blue-500'
}

// ─── AllenatoreEventCard (mini card per griglia settimana) ────────────────────

export function AllenatoreEventCard({ event, onClick }) {
  const isPartita = event._tipo === 'partita'

  if (!isPartita) {
    return (
      <button
        onClick={() => onClick(event)}
        className="w-full text-left rounded-lg p-2 mb-1 shadow-sm active:scale-95 transition-transform border-l-4 border-amber-400 bg-amber-50"
      >
        <div className="text-xs font-semibold text-amber-800 truncate">{event.squadra}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <Clock size={10} className="text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-600">{formatTime(event.ora_inizio)}</span>
        </div>
        {event.palestra && <div className="text-xs text-amber-400 truncate">{event.palestra}</div>}
        {event.spostato && <span className="text-[9px] text-amber-500 italic">modificato</span>}
      </button>
    )
  }

  let cardCls = 'border-blue-500 bg-blue-50'
  if (event.stato === 'provvisoria') cardCls = 'border-yellow-400 bg-yellow-50'
  else if ((event.casa_fuori ?? '').toLowerCase() === 'casa') cardCls = 'border-green-500 bg-green-50'

  return (
    <button
      onClick={() => onClick(event)}
      className={`w-full text-left rounded-lg p-2 mb-1 shadow-sm active:scale-95 transition-transform border-l-4 ${cardCls}`}
    >
      <div className="text-xs font-semibold text-gray-800 truncate">
        {event.avversario ? `vs ${event.avversario}` : 'Partita'}
      </div>
      <div className="text-xs text-gray-500 truncate">{event.squadra}</div>
      <div className="flex items-center gap-1 mt-0.5">
        <Clock size={10} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-500">{formatTime(event.ora_inizio)}</span>
      </div>
      {event.stato === 'provvisoria' && (
        <AlertCircle size={11} className="text-yellow-500 mt-0.5" />
      )}
    </button>
  )
}

// ─── AllenatoreMonthGrid ──────────────────────────────────────────────────────

const MONTH_DAY_HEADERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export function AllenatoreMonthGrid({ monthDate, events, onEventClick }) {
  const [selectedDay, setSelectedDay] = useState(null)

  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 })
  const gridEnd   = endOfWeek(endOfMonth(monthDate),     { weekStartsOn: 1 })
  const days      = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const eventsByDate = {}
  events.forEach(e => {
    if (!eventsByDate[e.data]) eventsByDate[e.data] = []
    eventsByDate[e.data].push(e)
  })

  return (
    <div className="px-3">
      <div className="grid grid-cols-7 mb-1">
        {MONTH_DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden">
        {days.map(day => {
          const dateStr    = format(day, 'yyyy-MM-dd')
          const inMonth    = isSameMonth(day, monthDate)
          const today      = isDateToday(dateStr)
          const dayEvents  = eventsByDate[dateStr] ?? []
          const isSelected = selectedDay === dateStr

          return (
            <button
              key={dateStr}
              onClick={() => {
                if (!dayEvents.length) { setSelectedDay(null); return }
                if (dayEvents.length === 1) { setSelectedDay(null); onEventClick(dayEvents[0]); return }
                setSelectedDay(isSelected ? null : dateStr)
              }}
              className={`flex flex-col items-center py-1.5 px-0.5 min-h-[54px] transition-colors ${
                inMonth ? '' : 'opacity-25'
              } ${isSelected ? 'bg-amber-50' : 'bg-white'}`}
            >
              <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                today ? 'bg-amber-600 text-white' : 'text-gray-700'
              }`}>
                {format(day, 'd')}
              </span>
              <div className="flex flex-wrap gap-0.5 justify-center">
                {dayEvents.slice(0, 3).map((e, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${getAllenatoreEventDotColor(e)}`} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[9px] text-gray-400 font-medium leading-none">+{dayEvents.length - 3}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {selectedDay && (eventsByDate[selectedDay] ?? []).length > 1 && (
        <div className="mt-4">
          <div className="text-sm font-semibold text-gray-700 mb-2 capitalize">
            {formatDate(selectedDay, 'EEEE d MMMM')}
          </div>
          <div className="space-y-2">
            {(eventsByDate[selectedDay] ?? []).map((e, i) => {
              const isPartita = e._tipo === 'partita'
              const borderCls = !isPartita
                ? 'border-amber-400 bg-amber-50'
                : e.stato === 'provvisoria'
                  ? 'border-yellow-400 bg-yellow-50'
                  : (e.casa_fuori ?? '').toLowerCase() === 'casa'
                    ? 'border-green-500 bg-green-50'
                    : 'border-blue-500 bg-blue-50'
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedDay(null); onEventClick(e) }}
                  className={`w-full text-left rounded-xl p-3 shadow-sm active:scale-95 transition-transform border-l-4 ${borderCls}`}
                >
                  <div className="text-sm font-semibold text-gray-800">
                    {e.squadra}{isPartita && e.avversario ? ` vs ${e.avversario}` : ''}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={11} className="text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500">{formatTime(e.ora_inizio)}</span>
                    {e.palestra && (
                      <>
                        <MapPin size={11} className="text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500 truncate">{e.palestra}</span>
                      </>
                    )}
                  </div>
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    !isPartita
                      ? 'bg-amber-100 text-amber-700'
                      : e.stato === 'provvisoria'
                        ? 'bg-yellow-100 text-yellow-700'
                        : (e.casa_fuori ?? '').toLowerCase() === 'casa'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                  }`}>
                    {!isPartita ? 'Allenamento' : e.stato === 'provvisoria' ? '⚠️ Prov.' :
                      (e.casa_fuori ?? '').toLowerCase() === 'casa' ? 'Casa' : 'Trasferta'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AllenatoreEventModal (detail + presenza) ─────────────────────────────────

export function AllenatoreEventModal({ event, onClose, showPresenza = false }) {
  const { user, societaId } = useAuth()
  const qc = useQueryClient()
  const isPartita = event._tipo === 'partita'
  const dotColor  = getAllenatoreEventDotColor(event)

  const { data: presenzaData, isLoading: presenzaLoading } = useQuery({
    queryKey: ['presenza-genitore', event.data, event.squadra, user?.id],
    enabled: showPresenza && !isPartita && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze')
        .select('risposta')
        .eq('data', event.data)
        .eq('squadra', event.squadra)
        .eq('user_id', user.id)
        .maybeSingle()
      return data
    },
    staleTime: 30 * 1000,
  })

  const presenzaMut = useMutation({
    mutationFn: async (risposta) => {
      if (presenzaData?.risposta === risposta) {
        await supabase.from('presenze')
          .delete()
          .eq('data', event.data)
          .eq('squadra', event.squadra)
          .eq('user_id', user.id)
      } else {
        await supabase.from('presenze').upsert(
          {
            societa_id: societaId ?? '',
            data: event.data,
            squadra: event.squadra,
            user_id: user.id,
            risposta,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'societa_id,data,squadra,user_id' }
        )
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presenza-genitore', event.data, event.squadra, user?.id] }),
  })

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl overflow-y-auto max-h-[80svh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${dotColor}`} />
            <span className="text-sm font-medium text-gray-700">
              {isPartita
                ? (event.casa_fuori ?? '').toLowerCase() === 'casa'
                  ? '🏀 Partita in casa'
                  : '✈️ Partita in trasferta'
                : '🏋️ Allenamento'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {event.squadra}
          {isPartita && event.avversario && (
            <span className="text-gray-500 font-normal"> vs {event.avversario}</span>
          )}
        </h2>

        <div className="space-y-3">
          <div className="flex items-start gap-3 text-gray-600">
            <Clock size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
            <div>
              <div className="text-sm">{formatDate(event.data, 'EEEE d MMMM yyyy')}</div>
              <div className="text-sm font-medium">
                {formatTime(event.ora_inizio)} – {formatTime(event.ora_fine)}
              </div>
            </div>
          </div>
          {event.palestra && (
            <div className="flex items-center gap-3 text-gray-600">
              <MapPin size={16} className="flex-shrink-0 text-gray-400" />
              <span className="text-sm">{event.palestra}</span>
            </div>
          )}
          {isPartita && (
            <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${
              event.stato === 'provvisoria'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {event.stato === 'provvisoria' ? '⚠️ Provvisoria' : '✅ Definitiva'}
            </span>
          )}
          {!isPartita && event.spostato && (
            <span className="inline-block text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
              Orario modificato questa settimana
            </span>
          )}
        </div>

        {showPresenza && !isPartita && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">La tua presenza</p>
            {presenzaLoading ? (
              <div className="text-xs text-gray-400">Caricamento...</div>
            ) : (
              <div className="flex gap-2">
                {[
                  { val: 'presente', label: '✅ Ci sarò',    active: 'bg-green-600 text-white border-green-600' },
                  { val: 'assente',  label: '❌ Non ci sarò', active: 'bg-red-500 text-white border-red-500' },
                ].map(({ val, label, active }) => (
                  <button
                    key={val}
                    disabled={presenzaMut.isPending}
                    onClick={() => presenzaMut.mutate(val)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors disabled:opacity-60 ${
                      presenzaData?.risposta === val
                        ? active
                        : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AllenatoreEditModal ──────────────────────────────────────────────────────

const INP = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'

export function AllenatoreEditModal({ event, onClose, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    ora_inizio: (event.ora_inizio ?? '18:00').slice(0, 5),
    ora_fine:   (event.ora_fine   ?? '20:00').slice(0, 5),
    palestra:   event.palestra ?? '',
  })

  const { data: palestre = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome)
    },
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Modifica allenamento</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <p className="text-sm text-amber-600 font-medium mb-4">
          {event.squadra} — {event.data ? formatDate(event.data, 'EEEE d MMMM') : ''}
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio</label>
              <input type="time" value={form.ora_inizio}
                onChange={e => setForm(f => ({ ...f, ora_inizio: e.target.value }))}
                className={INP} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora fine</label>
              <input type="time" value={form.ora_fine}
                onChange={e => setForm(f => ({ ...f, ora_fine: e.target.value }))}
                className={INP} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Palestra</label>
            {palestre.length === 0 ? (
              <input value={form.palestra}
                onChange={e => setForm(f => ({ ...f, palestra: e.target.value }))}
                className={INP} placeholder="es. PalaOderzo" />
            ) : (
              <select value={form.palestra}
                onChange={e => setForm(f => ({ ...f, palestra: e.target.value }))}
                className={INP}>
                <option value="">Scegli...</option>
                {palestre.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel}
            className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-xl font-medium text-sm border border-red-200">
            ❌ Annulla allenamento
          </button>
          <button onClick={() => onSave(form)}
            disabled={saving || !form.palestra.trim()}
            className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60">
            {saving ? 'Salvataggio...' : '✅ Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── QuickEditAllenamentoModal ────────────────────────────────────────────────

export function QuickEditAllenamentoModal({ training, onClose, onSaved }) {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    ora_inizio: String(training.ora_inizio ?? '').slice(0, 5),
    ora_fine:   String(training.ora_fine   ?? '').slice(0, 5),
    palestra:   training.palestra ?? '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: palestreList = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  const saveMut = useMutation({
    mutationFn: () => saveAllenamento(training, form, societaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      inviaNotificaModifica(
        training.squadra, societaId, training.data,
        `${form.ora_inizio}–${form.ora_fine}${form.palestra ? ` @ ${form.palestra}` : ''}`
      )
      onSaved()
    },
  })

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-foreground">Modifica allenamento</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-full">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {training.squadra} · {formatDate(training.data, 'EEE d MMM')}
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ora inizio</label>
              <input type="time" value={form.ora_inizio} onChange={e => set('ora_inizio', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ora fine</label>
              <input type="time" value={form.ora_fine} onChange={e => set('ora_fine', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Palestra</label>
            {palestreList.length > 0 ? (
              <select value={form.palestra} onChange={e => set('palestra', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Scegli palestra...</option>
                {palestreList.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input value={form.palestra} onChange={e => set('palestra', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="es. PalaOderzo" />
            )}
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Modifica solo questa data — la settimana tipo rimane invariata.
          </p>
          {saveMut.isError && <p className="text-xs text-destructive">{saveMut.error?.message}</p>}
          <Button className="w-full" size="lg" onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !form.ora_inizio || !form.ora_fine}>
            {saveMut.isPending ? 'Salvataggio...' : 'Salva modifica'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```
Atteso: zero errori (shared.jsx non è ancora importato da nessuno, ma deve compilare).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/home/shared.jsx
git commit -m "refactor: estrai shared sub-componenti home in pages/home/shared.jsx"
```

---

## Task 6: Crea HomeAdmin.jsx

**Files:**
- Create: `frontend/src/pages/home/HomeAdmin.jsx`

Estrae `AdminHome` da `HomePage.jsx` e usa i nuovi componenti condivisi.

- [ ] **Step 1: Crea il file**

```jsx
// frontend/src/pages/home/HomeAdmin.jsx
import { useState, useMemo } from 'react'
import { format, addDays, addWeeks, parseISO, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  AlertTriangle, Clock, MapPin, AlertCircle,
  ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatTime } from '../../lib/utils'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { timesOverlap, QuickEditAllenamentoModal } from './shared'

export default function HomeAdmin() {
  const { displayName, logout, societaNome } = useAuth()
  const [tab, setTab]                         = useState('partite')
  const [editingConflictTraining, setEditingConflictTraining] = useState(null)
  const [openQuestaSettimana,    setOpenQuestaSettimana]    = useState(true)
  const [openProssimaSettimana,  setOpenProssimaSettimana]  = useState(true)
  const navigate = useNavigate()
  const today = new Date()
  const todayStr  = format(today, 'yyyy-MM-dd')
  const endStr    = format(addDays(today, 14), 'yyyy-MM-dd')
  const weekStart     = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])
  const nextWeekStart = useMemo(() => addWeeks(weekStart, 1), [weekStart])
  const week2Start    = useMemo(() => addWeeks(weekStart, 2), [weekStart])
  const nextWeekStartStr = useMemo(() => format(nextWeekStart, 'yyyy-MM-dd'), [nextWeekStart])

  const { data: partiteFuture = [], isLoading: loadingP } = useQuery({
    queryKey: ['admin-partite-future', todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario').select('*')
        .gte('data', todayStr).lte('data', endStr)
        .order('data').order('ora_inizio')
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: provvisorie = [], isLoading: loadingProv } = useQuery({
    queryKey: ['admin-provvisorie', todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario').select('*')
        .eq('stato', 'provvisoria').gte('data', todayStr)
        .order('data').order('ora_inizio')
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: thisWeek }  = useWeekEvents(weekStart)
  const { data: nextWeek }  = useWeekEvents(nextWeekStart)
  const { data: week2 }     = useWeekEvents(week2Start)

  const conflictsAll = useMemo(() => {
    const allEvents   = [...(thisWeek?.events ?? []), ...(nextWeek?.events ?? []), ...(week2?.events ?? [])]
    const partite     = allEvents.filter(e => e._tipo === 'partita' && e.stato === 'definitiva' && e.data >= todayStr)
    const allenamenti = allEvents.filter(e => e._tipo === 'allenamento' && !e.annullato)
    const result = []
    for (const p of partite) {
      const conf = allenamenti.filter(t => {
        if (t.data !== p.data) return false
        if (!timesOverlap(p.ora_inizio, p.ora_fine, t.ora_inizio, t.ora_fine)) return false
        const sameSquadra = (t.squadra ?? '').toLowerCase() === (p.squadra ?? '').toLowerCase()
        const sharedPalestra =
          p.palestra?.trim() && t.palestra?.trim() &&
          p.palestra.trim().toLowerCase() === t.palestra.trim().toLowerCase()
        return sameSquadra || sharedPalestra
      })
      if (conf.length) result.push({ partita: p, allenamenti: conf })
    }
    return result
  }, [thisWeek, nextWeek, week2, todayStr])

  const { data: doppioConflictsAdmin = [] } = useQuery({
    queryKey: ['doppio-campionato-admin'],
    queryFn: async () => {
      const { data: pairs } = await supabase.from('doppio_campionato').select('*')
      if (!pairs?.length) return []
      const { data: partite } = await supabase
        .from('calendario').select('*')
        .eq('stato', 'definitiva').gte('data', todayStr)
        .order('data')
      if (!partite?.length) return []
      const results = []
      for (const pair of pairs) {
        const sq = [pair.squadra_a, pair.squadra_b]
        const byDate = {}
        for (const p of partite) {
          if (!sq.includes(p.squadra)) continue
          if (!byDate[p.data]) byDate[p.data] = []
          byDate[p.data].push(p)
        }
        for (const [data, games] of Object.entries(byDate)) {
          const a = games.find(g => g.squadra === pair.squadra_a)
          const b = games.find(g => g.squadra === pair.squadra_b)
          if (a && b) results.push({ data, pair, partita_a: a, partita_b: b })
        }
      }
      return results
    },
    staleTime: 5 * 60 * 1000,
  })

  const questaSettimana  = partiteFuture.filter(p => p.data >= todayStr && p.data < nextWeekStartStr)
  const prossimaSettimana = partiteFuture.filter(p => p.data >= nextWeekStartStr)
  const daGestireTot = provvisorie.length + conflictsAll.length + doppioConflictsAdmin.length

  const loading = loadingP || loadingProv

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-amber-50">
      <AppHeader
        title="Pannello Admin"
        subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {/* Tab toggle */}
      <div className="sticky top-0 z-30 bg-white border-b border-amber-100 shadow-sm">
        <div className="flex">
          {[
            { id: 'partite',    label: 'Partite (14gg)' },
            { id: 'dagestire',  label: `Da gestire${daGestireTot > 0 ? ` (${daGestireTot})` : ''}` },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                tab === id
                  ? 'text-amber-700 border-b-2 border-amber-600'
                  : 'text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Caricamento..." />
      ) : tab === 'partite' ? (

        /* ── Partite ── */
        <div className="px-4 pt-4 space-y-4">

          {/* Questa settimana */}
          <div>
            <button
              onClick={() => setOpenQuestaSettimana(v => !v)}
              className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-amber-700 mb-2"
            >
              <span>Questa settimana ({questaSettimana.length})</span>
              {openQuestaSettimana ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {openQuestaSettimana && (
              questaSettimana.length === 0 ? (
                <Card><CardContent className="py-4 text-sm text-gray-400 text-center">Nessuna partita</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {questaSettimana.map(p => (
                    <Card key={p.id} className={`border-l-4 ${p.stato === 'provvisoria' ? 'border-l-yellow-400' : (p.casa_fuori ?? '').toLowerCase() === 'casa' ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                      <CardContent className="px-4 py-3">
                        <p className="text-sm font-semibold text-foreground">
                          {p.squadra}{p.avversario ? ` vs ${p.avversario}` : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {format(parseISO(p.data), 'EEE d MMM', { locale: it })} · {formatTime(p.ora_inizio)}
                          </span>
                          {p.palestra && <span className="flex items-center gap-1"><MapPin size={11} /> {p.palestra}</span>}
                          <Badge variant={p.stato === 'provvisoria' ? 'warning' : p.casa_fuori?.toLowerCase() === 'casa' ? 'success' : 'default'}>
                            {p.stato === 'provvisoria' ? '⚠ Prov.' : p.casa_fuori ?? ''}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Prossima settimana */}
          <div>
            <button
              onClick={() => setOpenProssimaSettimana(v => !v)}
              className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-amber-700 mb-2"
            >
              <span>Prossima settimana ({prossimaSettimana.length})</span>
              {openProssimaSettimana ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {openProssimaSettimana && (
              prossimaSettimana.length === 0 ? (
                <Card><CardContent className="py-4 text-sm text-gray-400 text-center">Nessuna partita</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {prossimaSettimana.map(p => (
                    <Card key={p.id} className={`border-l-4 ${p.stato === 'provvisoria' ? 'border-l-yellow-400' : (p.casa_fuori ?? '').toLowerCase() === 'casa' ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                      <CardContent className="px-4 py-3">
                        <p className="text-sm font-semibold text-foreground">
                          {p.squadra}{p.avversario ? ` vs ${p.avversario}` : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {format(parseISO(p.data), 'EEE d MMM', { locale: it })} · {formatTime(p.ora_inizio)}
                          </span>
                          {p.palestra && <span className="flex items-center gap-1"><MapPin size={11} /> {p.palestra}</span>}
                          <Badge variant={p.stato === 'provvisoria' ? 'warning' : p.casa_fuori?.toLowerCase() === 'casa' ? 'success' : 'default'}>
                            {p.stato === 'provvisoria' ? '⚠ Prov.' : p.casa_fuori ?? ''}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

      ) : (

        /* ── Da gestire ── */
        <div className="px-4 pt-4 space-y-4">
          {daGestireTot === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-5 text-sm text-green-600">
                <span>✅ Tutto in ordine! Nessuna azione richiesta</span>
              </CardContent>
            </Card>
          ) : (<>

            {provvisorie.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                  <AlertCircle size={12} /> Partite da confermare ({provvisorie.length})
                </p>
                <div className="space-y-2">
                  {provvisorie.map(p => (
                    <Card key={p.id} className="border-l-4 border-l-yellow-400">
                      <CardContent className="px-4 py-3">
                        <p className="text-sm font-semibold text-foreground">
                          {p.squadra}{p.avversario ? ` vs ${p.avversario}` : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {format(parseISO(p.data), 'EEE d MMM', { locale: it })} · {formatTime(p.ora_inizio)}
                          </span>
                          {p.palestra && <span className="flex items-center gap-1"><MapPin size={11} /> {p.palestra}</span>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {conflictsAll.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Allenamenti da spostare ({conflictsAll.length})
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/calendario')}
                    className="text-destructive hover:text-destructive hover:bg-red-50 h-auto py-1 px-2">
                    Gestisci <ArrowRight size={12} />
                  </Button>
                </div>
                <div className="space-y-2">
                  {conflictsAll.map(({ partita, allenamenti }, i) => (
                    <Card key={i} className="border-l-4 border-l-destructive">
                      <CardContent className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-semibold text-foreground">
                            {partita.squadra}{partita.avversario ? ` vs ${partita.avversario}` : ''}
                          </p>
                          <Badge variant="destructive">Definitiva</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {format(parseISO(partita.data), 'EEE d MMM', { locale: it })} · {formatTime(partita.ora_inizio)}–{formatTime(partita.ora_fine)}
                          {partita.palestra ? ` · ${partita.palestra}` : ''}
                        </p>
                        <div className="space-y-1.5">
                          {allenamenti.map((t, j) => (
                            <div key={j} className="flex items-center gap-2 text-xs bg-red-50 rounded-lg px-2 py-1.5">
                              <AlertTriangle size={10} className="shrink-0 text-destructive" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-foreground">{t.squadra}</span>
                                <span className="text-muted-foreground ml-2">{formatTime(t.ora_inizio)}–{formatTime(t.ora_fine)}</span>
                                {t.palestra && <span className="text-muted-foreground ml-1 truncate">· {t.palestra}</span>}
                              </div>
                              <Button variant="ghost" size="sm"
                                className="h-auto py-0.5 px-2 text-xs text-primary hover:bg-amber-50 shrink-0"
                                onClick={() => setEditingConflictTraining(t)}>
                                Modifica
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {doppioConflictsAdmin.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                  <AlertTriangle size={12} /> Doppio campionato — stesso giorno ({doppioConflictsAdmin.length})
                </p>
                <div className="space-y-2">
                  {doppioConflictsAdmin.map(({ data: dateStr, pair, partita_a, partita_b }, i) => (
                    <Card key={i} className="border-l-4 border-l-orange-400">
                      <CardContent className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-muted-foreground capitalize">
                            {format(parseISO(dateStr), 'EEE d MMMM', { locale: it })}
                          </p>
                          {pair.note && <Badge variant="orange">{pair.note}</Badge>}
                        </div>
                        <div className="space-y-1">
                          {[partita_a, partita_b].map((p, j) => (
                            <div key={j} className="flex items-center gap-2 text-xs bg-orange-50 rounded-lg px-2 py-1.5">
                              <span className="font-medium text-foreground">{p.squadra}</span>
                              {p.avversario && <span className="text-muted-foreground">vs {p.avversario}</span>}
                              {p.ora_inizio && <span className="text-muted-foreground ml-auto">{formatTime(p.ora_inizio)}</span>}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

          </>)}
        </div>
      )}

      {editingConflictTraining && (
        <QuickEditAllenamentoModal
          training={editingConflictTraining}
          onClose={() => setEditingConflictTraining(null)}
          onSaved={() => setEditingConflictTraining(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```
Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/home/HomeAdmin.jsx
git commit -m "refactor: estrai HomeAdmin da HomePage.jsx in pages/home/HomeAdmin.jsx"
```

---

## Task 7: Crea HomeAllenatore.jsx

**Files:**
- Create: `frontend/src/pages/home/HomeAllenatore.jsx`

Estrae la funzione `NuovaHome` da `HomePage.jsx` (righe 1450-2077) e la rinomina `HomeAllenatore`. Usa i componenti condivisi da `shared.jsx`.

- [ ] **Step 1: Crea il file**

```jsx
// frontend/src/pages/home/HomeAllenatore.jsx
import { useState, useMemo, useRef } from 'react'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { X, Plus, LogOut } from 'lucide-react'
import CambiaPasswordButton from '../../components/CambiaPasswordButton'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents, useMonthEvents } from '../../hooks/useWeekEvents'
import { formatTime, formatDate, isDateToday } from '../../lib/utils'
import { parseList } from './shared'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { saveAllenamento, annullaAllenamento } from '../../hooks/useAllenamenti'
import {
  AllenatoreEventCard, AllenatoreMonthGrid,
  AllenatoreEventModal, AllenatoreEditModal,
} from './shared'
import { GIORNI as GIORNI_W, GIORNO_FULL as GIORNI_LABEL_W } from '../../lib/constants'

// ─── AllenatoreAddModal (form aggiunta allenamento) ───────────────────────────

const INP = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'
const GIORNO_OFFSET = { lunedi:0, martedi:1, mercoledi:2, giovedi:3, venerdi:4, sabato:5, domenica:6 }

function AllenatoreAddModal({ weekStart, mySquadre, onClose }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [form, setForm] = useState({
    squadra: mySquadre[0] ?? '',
    giorno: 'lunedi',
    ora_inizio: '18:00',
    ora_fine: '20:00',
    palestra: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const canSave = form.squadra && form.giorno && form.ora_inizio && form.ora_fine && form.palestra.trim()

  const { data: palestre = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome)
    },
    staleTime: 10 * 60 * 1000,
  })

  const saveMut = useMutation({
    mutationFn: async () => {
      const targetDate = new Date(weekStart)
      targetDate.setDate(targetDate.getDate() + (GIORNO_OFFSET[form.giorno] ?? 0))
      const data = format(targetDate, 'yyyy-MM-dd')
      const { error } = await supabase.from('allenamenti_settimana').insert([{
        societa_id: societaId,
        squadra: form.squadra,
        data,
        ora_inizio: form.ora_inizio,
        ora_fine: form.ora_fine,
        palestra: form.palestra,
        spostato: true,
      }])
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weekEvents'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Aggiungi allenamento</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
            <select value={form.squadra} onChange={e => set('squadra', e.target.value)} className={INP}>
              {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Giorno *</label>
            <select value={form.giorno} onChange={e => set('giorno', e.target.value)} className={INP}>
              {GIORNI_W.map(g => <option key={g} value={g}>{GIORNI_LABEL_W[g]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio *</label>
              <input type="time" value={form.ora_inizio} onChange={e => set('ora_inizio', e.target.value)} className={INP} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora fine *</label>
              <input type="time" value={form.ora_fine} onChange={e => set('ora_fine', e.target.value)} className={INP} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Palestra *</label>
            {palestre.length === 0 ? (
              <input value={form.palestra} onChange={e => set('palestra', e.target.value)} className={INP} placeholder="es. PalaOderzo" />
            ) : (
              <select value={form.palestra} onChange={e => set('palestra', e.target.value)} className={INP}>
                <option value="">Scegli...</option>
                {palestre.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>
        {saveMut.isError && <p className="text-xs text-red-500 mt-2">{saveMut.error?.message}</p>}
        <button
          onClick={() => canSave && saveMut.mutateAsync()}
          disabled={saveMut.isPending || !canSave}
          className="w-full mt-5 py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saveMut.isPending ? 'Salvataggio...' : '✅ Aggiungi allenamento'}
        </button>
        {!canSave && <p className="text-center text-xs text-red-500 mt-2">Compila tutti i campi obbligatori</p>}
      </div>
    </div>
  )
}

// ─── AllenatoreAddPartitaModal ────────────────────────────────────────────────

function AllenatoreAddPartitaModal({ mySquadre, onClose }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [form, setForm] = useState({
    squadra: mySquadre[0] ?? '',
    data: '',
    ora_inizio: '15:00',
    ora_fine: '17:00',
    avversario: '',
    casa_fuori: 'Trasferta',
    palestra: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const canSave = form.squadra && form.data && form.ora_inizio && form.ora_fine

  const { data: palestre = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome)
    },
    staleTime: 10 * 60 * 1000,
  })

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('calendario').insert([{
        societa_id: societaId,
        squadra: form.squadra,
        data: form.data,
        ora_inizio: form.ora_inizio,
        ora_fine: form.ora_fine,
        avversario: form.avversario,
        casa_fuori: form.casa_fuori,
        palestra: form.palestra,
        stato: 'definitiva',
      }])
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weekEvents'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Aggiungi partita</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
            <select value={form.squadra} onChange={e => set('squadra', e.target.value)} className={INP}>
              {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
            <input type="date" value={form.data} onChange={e => set('data', e.target.value)} className={INP} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio *</label>
              <input type="time" value={form.ora_inizio} onChange={e => set('ora_inizio', e.target.value)} className={INP} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora fine *</label>
              <input type="time" value={form.ora_fine} onChange={e => set('ora_fine', e.target.value)} className={INP} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Avversario</label>
            <input value={form.avversario} onChange={e => set('avversario', e.target.value)} className={INP} placeholder="es. Treviso Basket" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Casa / Trasferta</label>
            <select value={form.casa_fuori} onChange={e => set('casa_fuori', e.target.value)} className={INP}>
              <option value="Casa">Casa</option>
              <option value="Trasferta">Trasferta</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Palestra</label>
            {palestre.length === 0 ? (
              <input value={form.palestra} onChange={e => set('palestra', e.target.value)} className={INP} placeholder="es. PalaOderzo" />
            ) : (
              <select value={form.palestra} onChange={e => set('palestra', e.target.value)} className={INP}>
                <option value="">Scegli...</option>
                {palestre.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>
        {saveMut.isError && <p className="text-xs text-red-500 mt-2">{saveMut.error?.message}</p>}
        <button
          onClick={() => canSave && saveMut.mutateAsync()}
          disabled={saveMut.isPending || !canSave}
          className="w-full mt-5 py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saveMut.isPending ? 'Salvataggio...' : '✅ Aggiungi partita'}
        </button>
      </div>
    </div>
  )
}

// ─── HomeAllenatore ───────────────────────────────────────────────────────────

export default function HomeAllenatore() {
  const { user, displayName, logout, societaNome, societaId } = useAuth()
  const qc = useQueryClient()
  const [view,          setView]          = useState('settimana')
  const [weekOffset,    setWeekOffset]    = useState(0)
  const [monthOffset,   setMonthOffset]   = useState(0)
  const [editingEvent,  setEditingEvent]  = useState(null)
  const [editingDayEvs, setEditingDayEvs] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showAddForm,   setShowAddForm]   = useState(false)
  const [showAddPartita,setShowAddPartita]= useState(false)
  const [fabOpen,       setFabOpen]       = useState(false)
  const touchStartX = useRef(null)

  const today    = new Date()
  const weekStart  = useMemo(() => addWeeks(startOfWeek(today, { weekStartsOn: 1 }), weekOffset), [weekOffset])
  const weekDays   = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const currentMonthDate = useMemo(() => {
    const d = new Date(today)
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset])

  const weekLabel  = useMemo(() => {
    const end = addDays(weekStart, 6)
    return `${format(weekStart, 'd MMM', { locale: it })} – ${format(end, 'd MMM yyyy', { locale: it })}`
  }, [weekStart])
  const monthLabel = useMemo(() => format(currentMonthDate, 'MMMM yyyy', { locale: it }), [currentMonthDate])

  const { data: myRow } = useQuery({
    queryKey: ['my-allenatore', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from('allenatori').select('nome, squadre_capo, squadre_vice')
        .eq('email', user.email).maybeSingle()
      return data
    },
  })

  const mySquadre = useMemo(() => {
    if (!myRow) return []
    return [...parseList(myRow.squadre_capo), ...parseList(myRow.squadre_vice)]
  }, [myRow])

  const { data: weekData,  isLoading: weekLoading  } = useWeekEvents(weekStart)
  const { data: monthData, isLoading: monthLoading } = useMonthEvents(currentMonthDate, view === 'mese')

  function filterMine(events) {
    if (!mySquadre.length) return events
    return events.filter(e => mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase()))
  }

  const displayWeekByDate = useMemo(() => {
    if (!weekData) return {}
    const filtered = filterMine(weekData.events ?? []).filter(e => !e.annullato)
    const byDate = {}
    for (const e of filtered) {
      if (!byDate[e.data]) byDate[e.data] = []
      byDate[e.data].push(e)
    }
    return byDate
  }, [weekData, mySquadre])

  const displayMonthEvents = useMemo(() => {
    if (!monthData) return []
    return filterMine(monthData.events ?? [])
  }, [monthData, mySquadre])

  const saveMut = useMutation({
    mutationFn: ({ event, formData }) => saveAllenamento(event, formData, societaId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weekEvents'] }); setEditingEvent(null) },
  })

  const cancelMut = useMutation({
    mutationFn: (event) => annullaAllenamento(event, societaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weekEvents'] }),
  })

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) {
      if (view === 'settimana') setWeekOffset(w => w + (dx < 0 ? 1 : -1))
      else                      setMonthOffset(m => m + (dx < 0 ? 1 : -1))
    }
    touchStartX.current = null
  }

  const nome      = myRow?.nome ?? displayName
  const isLoading = view === 'settimana' ? weekLoading : monthLoading

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-amber-50">

      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="bg-gradient-to-r from-amber-800 to-amber-600 text-white px-4 pt-10 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🏀</span>
                <span className="font-bold text-lg">{societaNome ?? 'Gestionale Basket'}</span>
              </div>
              <p className="text-amber-100 text-base font-semibold mt-1">Ciao, {nome}!</p>
              {mySquadre.length > 0 && (
                <p className="text-amber-200 text-sm mt-0.5">{mySquadre.join(' · ')}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-xs text-amber-200 text-right max-w-[120px] truncate">{displayName}</span>
              <div className="flex items-center gap-3">
                <CambiaPasswordButton />
                <button onClick={logout} className="flex items-center gap-1 text-xs text-amber-300 hover:text-white">
                  <LogOut size={13} /> Esci
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pt-3 pb-1">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {[['settimana', 'Settimana'], ['mese', 'Mese']].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
                  view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-2 pb-2"
          onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <button onClick={() => view === 'settimana' ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
            ‹
          </button>
          <div className="text-center select-none">
            {view === 'settimana' ? (
              <>
                <div className="text-sm font-semibold text-gray-800">{weekLabel}</div>
                {weekOffset === 0 && <div className="text-xs text-amber-500 font-medium">Settimana corrente</div>}
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-gray-800 capitalize">{monthLabel}</div>
                {monthOffset === 0 && <div className="text-xs text-amber-500 font-medium">Mese corrente</div>}
              </>
            )}
          </div>
          <button onClick={() => view === 'settimana' ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1)}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
            ›
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner message="Caricamento..." />
      ) : view === 'settimana' ? (
        <div className="overflow-x-auto p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex" style={{ minWidth: 'max-content' }}>
            {weekDays.map((day, di) => {
              const dateStr   = format(day, 'yyyy-MM-dd')
              const isToday   = isDateToday(dateStr)
              const dayEvents = (displayWeekByDate[dateStr] ?? [])
                .sort((a, b) => (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? ''))
              const isLast = di === weekDays.length - 1

              return (
                <div key={dateStr}
                  className={`w-36 flex-shrink-0 ${!isLast ? 'border-r border-gray-200 mr-2 pr-1' : ''}`}>
                  <div className={`rounded-xl p-2 mb-2 text-center ${
                    isToday ? 'bg-amber-600' : 'bg-white border border-gray-200'
                  }`}>
                    <div className={`text-xs font-medium uppercase tracking-wide ${isToday ? 'text-amber-100' : 'text-gray-400'}`}>
                      {format(day, 'EEE', { locale: it })}
                    </div>
                    <div className={`text-lg font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-700'}`}>
                      {format(day, 'd')}
                    </div>
                  </div>

                  {dayEvents.length === 0 ? (
                    <div className="text-gray-300 text-center py-6 text-sm select-none">–</div>
                  ) : (
                    dayEvents.map((event, i) => (
                      <AllenatoreEventCard
                        key={`${event._source}-${event.id ?? i}`}
                        event={event}
                        onClick={(ev) => {
                          setEditingEvent(ev)
                          setEditingDayEvs(weekData?.eventsByDate?.[dateStr] ?? [])
                        }}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="py-3">
          <AllenatoreMonthGrid
            key={monthLabel}
            monthDate={currentMonthDate}
            events={displayMonthEvents}
            onEventClick={setSelectedEvent}
          />
        </div>
      )}

      {fabOpen && (
        <div className="fixed bottom-40 right-4 flex flex-col gap-2 z-20 items-end">
          <button onClick={() => { setShowAddPartita(true); setFabOpen(false) }}
            className="flex items-center gap-2 bg-white text-gray-800 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium border border-gray-200 whitespace-nowrap active:scale-95 transition-transform">
            🏀 Partita
          </button>
          <button onClick={() => { setShowAddForm(true); setFabOpen(false) }}
            className="flex items-center gap-2 bg-white text-gray-800 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium border border-gray-200 whitespace-nowrap active:scale-95 transition-transform">
            🏋️ Allenamento
          </button>
        </div>
      )}
      {fabOpen && <div className="fixed inset-0 z-10" onClick={() => setFabOpen(false)} />}
      <button
        onClick={() => setFabOpen(v => !v)}
        className={`fixed bottom-24 right-4 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all z-20 ${fabOpen ? 'bg-gray-600' : 'bg-amber-600 hover:bg-amber-700'}`}
        aria-label="Aggiungi"
      >
        {fabOpen ? <X size={24} /> : <Plus size={28} />}
      </button>

      {editingEvent && (
        <AllenatoreEditModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={(formData) => saveMut.mutateAsync({ event: editingEvent, formData })}
          onCancel={() => {
            if (window.confirm(`Annullare l'allenamento di ${editingEvent.squadra}?`)) {
              cancelMut.mutate(editingEvent)
              setEditingEvent(null)
            }
          }}
          saving={saveMut.isPending}
        />
      )}
      {selectedEvent && !editingEvent && (
        <AllenatoreEventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
      {showAddForm && (
        <AllenatoreAddModal weekStart={weekStart} mySquadre={mySquadre} onClose={() => setShowAddForm(false)} />
      )}
      {showAddPartita && (
        <AllenatoreAddPartitaModal mySquadre={mySquadre} onClose={() => setShowAddPartita(false)} />
      )}
    </div>
  )
}
```

> **Nota:** `CambiaPasswordButton` e `LogOut` sono già negli import corretti nella versione sopra.

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/home/HomeAllenatore.jsx
git commit -m "refactor: estrai HomeAllenatore (NuovaHome) in pages/home/HomeAllenatore.jsx"
```

---

## Task 8: Crea HomeGenitore.jsx — agenda 7 giorni

**Files:**
- Create: `frontend/src/pages/home/HomeGenitore.jsx`

Questo è un componente nuovo che sostituisce la vista settimana/mese per genitore e giocatore con un'agenda a 7 giorni scorrevole.

- [ ] **Step 1: Crea il file**

```jsx
// frontend/src/pages/home/HomeGenitore.jsx
import { useState, useMemo } from 'react'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { Clock, MapPin } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatTime } from '../../lib/utils'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { AllenatoreEventModal } from './shared'

export default function HomeGenitore() {
  const { profile, displayName, logout, societaNome } = useAuth()
  const [selectedEvent, setSelectedEvent] = useState(null)

  const today   = useMemo(() => new Date(), [])
  const todayStr = useMemo(() => format(today, 'yyyy-MM-dd'), [today])
  const endStr   = useMemo(() => format(addDays(today, 6), 'yyyy-MM-dd'), [today])

  const mySquadre = useMemo(
    () => [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean),
    [profile]
  )

  const thisWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])
  const nextWeekStart = useMemo(() => addWeeks(thisWeekStart, 1), [thisWeekStart])

  const { data: thisWeek, isLoading: l1 } = useWeekEvents(thisWeekStart)
  const { data: nextWeek, isLoading: l2 } = useWeekEvents(nextWeekStart)

  const agendaByDay = useMemo(() => {
    const all = [...(thisWeek?.events ?? []), ...(nextWeek?.events ?? [])]
    const filtered = all.filter(e => {
      if (!e.data || e.data < todayStr || e.data > endStr || e.annullato) return false
      if (mySquadre.length && !mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())) return false
      return true
    })
    const byDay = {}
    for (const e of filtered) {
      if (!byDay[e.data]) byDay[e.data] = []
      byDay[e.data].push(e)
    }
    for (const d of Object.keys(byDay)) {
      byDay[d].sort((a, b) => (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? ''))
    }
    return byDay
  }, [thisWeek, nextWeek, todayStr, endStr, mySquadre])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(today, i), 'yyyy-MM-dd')),
    [today]
  )

  const hasAnyEvent = days.some(d => (agendaByDay[d] ?? []).length > 0)

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-amber-50">
      <AppHeader
        title={`Ciao, ${(displayName || '').split(' ')[0] || 'ciao'}!`}
        subtitle={mySquadre.join(' · ') || 'Nessuna squadra'}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      <div className="px-4 pt-4 space-y-4">
        {(l1 || l2) ? (
          <LoadingSpinner message="Caricamento..." />
        ) : !hasAnyEvent ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">🏀</span>
            <p className="text-gray-500 font-medium">Nessun impegno nei prossimi 7 giorni</p>
            <p className="text-gray-400 text-sm mt-1">Tutto tranquillo!</p>
          </div>
        ) : (
          days.map(dateStr => {
            const dayEvents = agendaByDay[dateStr] ?? []
            if (dayEvents.length === 0) return null

            const isToday = dateStr === todayStr
            const dayLabel = isToday
              ? 'Oggi'
              : format(new Date(dateStr + 'T12:00:00'), 'EEEE d MMMM', { locale: it })

            return (
              <div key={dateStr}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    isToday ? 'text-amber-700' : 'text-gray-400'
                  }`}>
                    {dayLabel}
                  </span>
                  {isToday && (
                    <span className="bg-amber-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      OGGI
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {dayEvents.map((e, i) => {
                    const isPartita = e._tipo === 'partita'
                    const accent = !isPartita
                      ? 'border-l-amber-400 bg-amber-50'
                      : e.stato === 'provvisoria'
                        ? 'border-l-yellow-400 bg-yellow-50'
                        : (e.casa_fuori ?? '').toLowerCase() === 'casa'
                          ? 'border-l-green-500 bg-green-50'
                          : 'border-l-blue-500 bg-blue-50'

                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedEvent(e)}
                        className={`w-full text-left rounded-xl p-3 shadow-sm active:scale-95 transition-transform border-l-4 ${accent} bg-white`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">
                              {isPartita
                                ? `${e.squadra}${e.avversario ? ` vs ${e.avversario}` : ''}`
                                : e.squadra}
                            </p>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                              {e.ora_inizio && (
                                <span className="flex items-center gap-1">
                                  <Clock size={10} /> {formatTime(e.ora_inizio)}–{formatTime(e.ora_fine)}
                                </span>
                              )}
                              {e.palestra && (
                                <span className="flex items-center gap-1">
                                  <MapPin size={10} /> {e.palestra}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium mt-0.5 shrink-0 ${
                            !isPartita ? 'bg-amber-100 text-amber-700' :
                            e.stato === 'provvisoria' ? 'bg-yellow-100 text-yellow-700' :
                            (e.casa_fuori ?? '').toLowerCase() === 'casa' ? 'bg-green-100 text-green-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {!isPartita ? 'Allenamento' :
                              e.stato === 'provvisoria' ? '⚠ Prov.' :
                              (e.casa_fuori ?? '').toLowerCase() === 'casa' ? 'Casa' : 'Trasferta'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {selectedEvent && (
        <AllenatoreEventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          showPresenza={true}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/home/HomeGenitore.jsx
git commit -m "feat: nuova HomeGenitore — agenda 7 giorni per genitore/giocatore"
```

---

## Task 9: Refactoring di HomePage.jsx come thin orchestrator

**Files:**
- Modify: `frontend/src/pages/HomePage.jsx`

Sostituisci l'intero contenuto del file con il thin orchestrator. Il file `GenitoreHome` export esistente non viene più usato nella navigazione ma per sicurezza viene mantenuto come re-export.

- [ ] **Step 1: Riscrivi HomePage.jsx**

```jsx
// frontend/src/pages/HomePage.jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import HomeAdmin from './home/HomeAdmin'
import HomeAllenatore from './home/HomeAllenatore'
import HomeGenitore from './home/HomeGenitore'

export { default as GenitoreHome } from './home/HomeGenitore'

export default function HomePage() {
  const { isAdmin, isAllenatore, role } = useAuth()

  if (isAdmin) return <HomeAdmin />
  if (role === 'segreteria') return <Navigate to="/segreteria" replace />
  if (isAllenatore) return <HomeAllenatore />
  return <HomeGenitore />
}
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```
Atteso: zero errori. Se ci sono errori di import circolari o mancanti, risolvili prima di procedere.

- [ ] **Step 3: Avvia dev server e verifica visivamente tutti i ruoli**

```bash
cd frontend && npm run dev
```

Controlla:
- Admin → schermata con header ambra, tab Partite/Da gestire
- Allenatore → griglia settimana con header ambra e FAB arancio
- Genitore/Giocatore → agenda 7 giorni con header ambra
- Segreteria → redirect a `/segreteria`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/HomePage.jsx
git commit -m "refactor: HomePage.jsx diventa thin orchestrator — delega a HomeAdmin/Allenatore/Genitore"
```

---

## Task 10: Aggiorna SegreteriePage — header ambra

**Files:**
- Modify: `frontend/src/pages/SegreteriePage.jsx`

- [ ] **Step 1: Aggiungi import AppHeader e rimuovi inline header**

In cima al file aggiungi:
```js
import AppHeader from '../components/AppHeader'
```

Individua il blocco JSX dell'header inline (il div con `bg-amber-800` o `bg-blue-600`) all'interno di `SegreteriePage` e sostituiscilo con:
```jsx
<AppHeader
  title="Segreteria"
  subtitle="Certificati medici e gestione"
  displayName={displayName}
  logout={logout}
  societaNome={societaNome}
/>
```

Aggiungi `displayName`, `logout`, `societaNome` alle variabili estratte da `useAuth()` se non già presenti.

- [ ] **Step 2: Build e verifica**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SegreteriePage.jsx
git commit -m "style: SegreteriePage — header ambra tramite AppHeader condiviso"
```

---

## Task 11: Aggiorna LoginPage — palette ambra

**Files:**
- Modify: `frontend/src/pages/LoginPage.jsx`

- [ ] **Step 1: Sostituisci i colori blu nel form di login**

Cambia:
- `bg-gradient-to-br from-blue-600 to-blue-800` → `bg-gradient-to-br from-amber-700 to-amber-900`
- `bg-blue-600` (icona 🏀) → `bg-amber-600`
- `focus:ring-blue-500` → `focus:ring-amber-500`
- `bg-blue-600` nel pulsante → `bg-amber-600 hover:bg-amber-700`

- [ ] **Step 2: Aggiorna anche NuovaPasswordPage in App.jsx**

In `frontend/src/App.jsx`, funzione `NuovaPasswordPage`, sostituisci:
- `from-blue-600 to-blue-800` → `from-amber-700 to-amber-900`
- `bg-blue-600` (icona) → `bg-amber-600`
- `focus:ring-blue-500` → `focus:ring-amber-500`
- `bg-blue-600` (bottone) → `bg-amber-600`

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LoginPage.jsx frontend/src/App.jsx
git commit -m "style: LoginPage e NuovaPasswordPage — palette ambra"
```

---

## Task 12: Aggiorna header BachecaPage e AllenamentiPage

**Files:**
- Modify: `frontend/src/pages/BachecaPage.jsx`
- Modify: `frontend/src/pages/AllenamentiPage.jsx`

- [ ] **Step 1: BachecaPage — trova l'header inline e sostituiscilo**

Cerca il div `bg-blue-600` o `bg-amber-*` che funge da header in `BachecaPage.jsx`. Se esiste un header inline, sostituiscilo con `<AppHeader>` importato da `../components/AppHeader`, passando le prop `displayName`, `logout`, `societaNome` da `useAuth()`.

Se `BachecaPage` non ha un header proprio (riceve il layout da HomePage), salta questo step.

- [ ] **Step 2: AllenamentiPage — stessa verifica**

Cerca e sostituisci eventuali header blu inline in `AllenamentiPage.jsx`.

- [ ] **Step 3: Build e smoke test visivo**

```bash
cd frontend && npm run build && npm run dev
```

Verifica che tutte le pagine raggiungibili abbiano l'header ambra.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/BachecaPage.jsx frontend/src/pages/AllenamentiPage.jsx
git commit -m "style: aggiorna header Bacheca e Allenamenti a palette ambra"
```

---

## Task 13: Smoke test finale e pulizia

- [ ] **Step 1: Avvia il dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Verifica ogni ruolo**

| Ruolo | Pagina attesa | Colori | Nota |
|-------|--------------|--------|------|
| admin | Home → HomeAdmin | Header ambra, tab attivo ambra | Tab "Partite" e "Da gestire" |
| allenatore | Home → HomeAllenatore | Header ambra, FAB arancio, giorno today ambra | Toggle settimana/mese |
| genitore | Home → HomeGenitore | Header ambra, agenda 7gg | Click su evento → modal con presenza |
| giocatore | Home → HomeGenitore | Idem genitore | Nessun profilo separato |
| segreteria | Redirect → /segreteria | Header ambra in SegreteriePage | |
| super_admin | → /platform | Nessun cambio (ha la sua shell) | |

- [ ] **Step 3: Verifica BottomNav**

Naviga tra le tab e controlla che l'icona attiva sia ambra (non blu).

- [ ] **Step 4: Verifica badge notifiche Bacheca**

Il badge rosso delle notifiche deve rimanere rosso (colore corretto per alert).

- [ ] **Step 5: Commit finale se ci sono aggiustamenti residui**

```bash
git add -p
git commit -m "style: fix residui palette ambra post-smoke-test"
```

---

## Note per l'implementatore

- **Tailwind v4 usa CSS @theme, non tailwind.config.js** — le modifiche alla palette vanno in `index.css`
- **`bg-blue-600` hardcoded** nei componenti NON cambiano automaticamente con i CSS variables. Ogni `bg-blue-600` nell'header va cambiato manualmente in `bg-amber-600` o rimosso usando `AppHeader`
- **`useWeekEvents`** ritorna `{ events, eventsByDate }` — entrambi usati in HomeAllenatore
- **`GenitoreHome` export** in HomePage.jsx era usato esternamente? Verificare — il re-export nel nuovo thin orchestrator garantisce retrocompatibilità
- **`doppio_campionato` query** in HomeAdmin.jsx: la struttura della query è semplificata rispetto all'originale — verificare che la tabella `doppio_campionato` abbia le colonne `squadra_a`, `squadra_b`, `note`
