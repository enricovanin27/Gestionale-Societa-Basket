# Role Dashboards Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare l'app da routing piatto a namespace per ruolo (`/parent/*`, `/player/*`, `/secretary/*`, `/coach/*`, `/admin/*`) con dashboard dedicate e nuove funzionalità (presenze, quote genitore, statistiche giocatore).

**Architecture:** Ogni ruolo ottiene un Layout React Router v6 con `<Outlet />` e la propria BottomNav. La migrazione è incrementale (5 fasi). La route `/` redirige al namespace del ruolo attivo. Le route vecchie restano come redirect durante la transizione.

**Tech Stack:** React 18, React Router v6, Supabase, TanStack Query v5, Tailwind CSS, shadcn/ui, Vite. Progetto in `frontend/src/`.

---

## Fase 0 — Infrastruttura routing

### Task 1: RoleRedirect + Layout shell per ogni ruolo

**Files:**
- Create: `frontend/src/components/RoleRedirect.jsx`
- Create: `frontend/src/layouts/ParentLayout.jsx`
- Create: `frontend/src/layouts/PlayerLayout.jsx`
- Create: `frontend/src/layouts/SecretaryLayout.jsx`
- Create: `frontend/src/layouts/CoachLayout.jsx`
- Create: `frontend/src/layouts/AdminLayout.jsx`

- [ ] **Crea `frontend/src/components/RoleRedirect.jsx`**

```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const ROLE_PATH = {
  genitore:   '/parent',
  giocatore:  '/player',
  segreteria: '/secretary',
  allenatore: '/coach',
  admin:      '/admin',
  super_admin: '/platform',
}

export default function RoleRedirect() {
  const { user, activeRole } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={ROLE_PATH[activeRole] ?? '/login'} replace />
}
```

- [ ] **Crea `frontend/src/layouts/ParentLayout.jsx`**

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { Home, DollarSign, Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[56px] ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function ParentLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20">
        <Outlet />
      </div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/parent" end className={cls}>
            <Home size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Home</span>
          </NavLink>
          <NavLink to="/parent/quote" className={cls}>
            <DollarSign size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Quote</span>
          </NavLink>
          <NavLink to="/parent/bacheca" className={cls}>
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
    </div>
  )
}
```

- [ ] **Crea `frontend/src/layouts/PlayerLayout.jsx`**

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { Home, BarChart2, Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[56px] ${
    isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function PlayerLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/player" end className={cls}>
            <Home size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Home</span>
          </NavLink>
          <NavLink to="/player/statistiche" className={cls}>
            <BarChart2 size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Statistiche</span>
          </NavLink>
          <NavLink to="/player/bacheca" className={cls}>
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
    </div>
  )
}
```

- [ ] **Crea `frontend/src/layouts/SecretaryLayout.jsx`**

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, CreditCard, Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[56px] ${
    isActive ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function SecretaryLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/secretary" end className={cls}>
            <LayoutDashboard size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Dashboard</span>
          </NavLink>
          <NavLink to="/secretary/giocatori" className={cls}>
            <Users size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Giocatori</span>
          </NavLink>
          <NavLink to="/secretary/quote" className={cls}>
            <CreditCard size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Quote</span>
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
    </div>
  )
}
```

- [ ] **Crea `frontend/src/layouts/CoachLayout.jsx`**

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { Home, Calendar, CheckSquare, BarChart2, Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl min-w-[48px] ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function CoachLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-1">
          <NavLink to="/coach" end className={cls}>
            <Home size={21} strokeWidth={1.8} /><span className="text-xs font-medium">Home</span>
          </NavLink>
          <NavLink to="/coach/calendario" className={cls}>
            <Calendar size={21} strokeWidth={1.8} /><span className="text-xs font-medium">Calendario</span>
          </NavLink>
          <NavLink to="/coach/presenze" className={cls}>
            <CheckSquare size={21} strokeWidth={1.8} /><span className="text-xs font-medium">Presenze</span>
          </NavLink>
          <NavLink to="/coach/statistiche" className={cls}>
            <BarChart2 size={21} strokeWidth={1.8} /><span className="text-xs font-medium">Statistiche</span>
          </NavLink>
          <NavLink to="/coach/bacheca" className={cls}>
            <div className="relative">
              <Bell size={21} strokeWidth={1.8} />
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
    </div>
  )
}
```

- [ ] **Crea `frontend/src/layouts/AdminLayout.jsx`**

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Basketball, Dumbbell, Users, Settings, Bell } from 'lucide-react'
import { Trophy, Dumbbell as DumbbellIcon } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'

// lucide non ha Basketball — usiamo Trophy per partite
import { Trophy as TrophyIcon, Dumbbell as TrainingIcon, Users as UsersIcon, Settings as SettingsIcon, LayoutDashboard as DashIcon, Bell as BellIcon } from 'lucide-react'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl min-w-[44px] ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function AdminLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-1">
          <NavLink to="/admin" end className={cls}>
            <DashIcon size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Dashboard</span>
          </NavLink>
          <NavLink to="/admin/partite" className={cls}>
            <TrophyIcon size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Partite</span>
          </NavLink>
          <NavLink to="/admin/allenamenti" className={cls}>
            <TrainingIcon size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Allenamenti</span>
          </NavLink>
          <NavLink to="/admin/persone" className={cls}>
            <UsersIcon size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Persone</span>
          </NavLink>
          <NavLink to="/admin/bacheca" className={cls}>
            <div className="relative">
              <BellIcon size={20} strokeWidth={1.8} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">Bacheca</span>
          </NavLink>
          <NavLink to="/admin/setup" className={cls}>
            <SettingsIcon size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Setup</span>
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/RoleRedirect.jsx frontend/src/layouts/
git commit -m "feat: add role layouts and RoleRedirect for namespace routing"
```

---

### Task 2: Refactor App.jsx con namespace routes

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Sostituisci il contenuto di `AppShell` in `frontend/src/App.jsx`**

Importa i nuovi layout e RoleRedirect in cima al file (dopo gli import esistenti):

```jsx
import RoleRedirect from './components/RoleRedirect'
import ParentLayout from './layouts/ParentLayout'
import PlayerLayout from './layouts/PlayerLayout'
import SecretaryLayout from './layouts/SecretaryLayout'
import CoachLayout from './layouts/CoachLayout'
import AdminLayout from './layouts/AdminLayout'
// Pagine per namespace — le aggiungiamo progressivamente nelle fasi successive
// Per ora usiamo le pagine esistenti come placeholder
```

Sostituisci l'intera funzione `AppShell` con:

```jsx
function AppShell() {
  const { user, loading, isSuperAdmin, isPasswordRecovery, clearPasswordRecovery } = useAuth()

  if (loading) return null
  if (isPasswordRecovery) return <NuovaPasswordPage onDone={clearPasswordRecovery} />

  if (user && isSuperAdmin) {
    return (
      <Routes>
        <Route path="/login"    element={<Navigate to="/platform" replace />} />
        <Route path="/platform" element={<PlatformPage />} />
        <Route path="*"         element={<Navigate to="/platform" replace />} />
      </Routes>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto relative">
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Root → redirect al namespace del ruolo attivo */}
        <Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

        {/* ── Genitore ─────────────────────────────────── */}
        <Route path="/parent" element={<ProtectedRoute requiredRole="genitore"><ParentLayout /></ProtectedRoute>}>
          <Route index element={<HomeGenitore />} />
          <Route path="bacheca" element={<BachecaPage />} />
          {/* /parent/quote aggiunto in Fase 1 */}
        </Route>

        {/* ── Giocatore ────────────────────────────────── */}
        <Route path="/player" element={<ProtectedRoute requiredRole="giocatore"><PlayerLayout /></ProtectedRoute>}>
          <Route index element={<HomeGenitore />} /> {/* sostituito in Fase 2 */}
          <Route path="bacheca" element={<BachecaPage />} />
          {/* /player/statistiche aggiunto in Fase 2 */}
        </Route>

        {/* ── Segreteria ───────────────────────────────── */}
        <Route path="/secretary" element={<ProtectedRoute requiredRole="segreteria"><SecretaryLayout /></ProtectedRoute>}>
          <Route index element={<SegreteriePage />} /> {/* sostituito in Fase 3 */}
          <Route path="giocatori" element={<SegreteriePage initialTab="giocatori" />} />
          <Route path="quote"     element={<SegreteriePage initialTab="quote" />} />
          <Route path="bacheca"   element={<BachecaPage />} />
        </Route>

        {/* ── Allenatore ───────────────────────────────── */}
        <Route path="/coach" element={<ProtectedRoute requiredRole="allenatore"><CoachLayout /></ProtectedRoute>}>
          <Route index         element={<HomeAllenatore />} />
          <Route path="calendario"  element={<CalendarioPage />} />
          <Route path="statistiche" element={<StatistichePage />} />
          <Route path="bacheca"     element={<BachecaPage />} />
          {/* /coach/presenze aggiunto in Fase 4 */}
        </Route>

        {/* ── Admin ────────────────────────────────────── */}
        <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
          <Route index          element={<HomeAdmin />} />
          <Route path="partite"     element={<CalendarioPage />} />
          <Route path="allenamenti" element={<AllenamentiPage />} />
          <Route path="bacheca"     element={<BachecaPage />} />
          <Route path="setup"       element={<SetupPage />} />
          {/* /admin/persone aggiunto in Fase 5 */}
        </Route>

        {/* ── Legacy redirects ─────────────────────────── */}
        <Route path="/bacheca"    element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
        <Route path="/calendario" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
        <Route path="/allenamenti" element={<Navigate to="/admin/allenamenti" replace />} />
        <Route path="/segreteria"  element={<Navigate to="/secretary" replace />} />
        <Route path="/setup"       element={<Navigate to="/admin/setup" replace />} />
        <Route path="/statistiche" element={<Navigate to="/coach/statistiche" replace />} />
        <Route path="/importa"     element={<ProtectedRoute requiredRole="allenatore"><ImportaCalendarioPage /></ProtectedRoute>} />
        <Route path="/platform"    element={<Navigate to="/" replace />} />
        <Route path="*"            element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
      </Routes>
    </div>
  )
}
```

Rimuovi l'import e uso di `BottomNav` da App.jsx (ora ogni layout ha la propria nav). Rimuovi anche `CalendarioDispatch` e la riga `{showNav && <BottomNav />}`.

- [ ] **Aggiungi `initialTab` prop a `SegreteriePage`** (`frontend/src/pages/SegreteriePage.jsx`, cerca la riga `const [tab, setTab] = useState('giocatori')`)

```jsx
// Prima: const [tab, setTab] = useState('giocatori')
// Dopo:
export default function SegreteriePage({ initialTab = 'giocatori' }) {
  // ...
  const [tab, setTab] = useState(initialTab)
```

- [ ] **Avvia dev server e verifica**

```bash
cd frontend && npm run dev
```

Verifica che:
- Loggando come genitore → redirect a `/parent`
- Loggando come allenatore → redirect a `/coach`
- Loggando come segreteria → redirect a `/secretary`
- Loggando come admin → redirect a `/admin`
- `/segreteria` → redirect a `/secretary`
- `/setup` → redirect a `/admin/setup`
- La BottomNav corretta appare per ogni ruolo

- [ ] **Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/SegreteriePage.jsx
git commit -m "feat: namespace routing — /parent /player /secretary /coach /admin"
```

---

## Fase 1 — Genitore

### Task 3: HomeGenitore — agenda famiglia multi-figlio con badge

**Files:**
- Modify: `frontend/src/pages/home/HomeGenitore.jsx`

- [ ] **Aggiungi badge per figlio nella lista eventi** — la logica `mySquadre` esiste già, basta colorare le card per figlio

In `HomeGenitore.jsx`, dopo `const mySquadre = [...]`, aggiungi la mappa colori:

```jsx
// Palette colori per figlio (max 3 figli)
const CHILD_COLORS = [
  { border: 'border-l-amber-500', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-800' },
  { border: 'border-l-blue-500',  bg: 'bg-blue-50',  badge: 'bg-blue-100 text-blue-800'  },
  { border: 'border-l-green-500', bg: 'bg-green-50', badge: 'bg-green-100 text-green-800' },
]
const squadraColor = Object.fromEntries(
  mySquadre.map((s, i) => [s.toLowerCase(), CHILD_COLORS[i % CHILD_COLORS.length]])
)
```

- [ ] **Aggiorna `EventCard`** (in fondo al file) per accettare `squadraColor` e mostrare il badge solo se ci sono più squadre:

```jsx
function EventCard({ event, squadraColor, showBadge }) {
  const isPartita = event._tipo === 'partita'
  const colors = squadraColor?.[event.squadra?.toLowerCase()] ?? CHILD_COLORS[0]

  let borderColor = colors.border
  let bgColor     = colors.bg
  let typeLabel   = 'Allenamento'

  if (isPartita) {
    if (event.stato === 'provvisoria') {
      borderColor = 'border-l-yellow-400'; bgColor = 'bg-yellow-50'; typeLabel = '⚠️ Provvisoria'
    } else if ((event.casa_fuori ?? '').toLowerCase() === 'casa') {
      borderColor = 'border-l-green-500'; bgColor = 'bg-green-50'; typeLabel = '🏠 Casa'
    } else {
      borderColor = 'border-l-blue-500'; bgColor = 'bg-blue-50'; typeLabel = '✈️ Trasferta'
    }
  }

  return (
    <div className={`rounded-xl border-l-4 ${borderColor} ${bgColor} px-4 py-3 shadow-sm active:scale-[0.99] transition-transform`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {isPartita && event.avversario
              ? `${event.squadra} vs ${event.avversario}`
              : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
            {event.ora_inizio && (
              <span className="font-medium text-gray-700">
                {event.ora_inizio?.slice(0, 5)}–{event.ora_fine?.slice(0, 5)}
              </span>
            )}
            {event.palestra && <span>{event.palestra}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isPartita ? 'bg-white border border-gray-200 text-gray-600' : 'bg-white border border-gray-200 text-gray-500'}`}>
            {typeLabel}
          </span>
          {showBadge && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${colors.badge}`}>
              {event.squadra}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Aggiorna il render degli eventi** nel map dei `agendaDays` per passare le nuove props:

Trova `<EventCard event={e} />` e sostituisci con:

```jsx
<EventCard
  event={e}
  squadraColor={squadraColor}
  showBadge={mySquadre.length > 1}
/>
```

- [ ] **Verifica nel browser**: logga come genitore con 2 squadre → vedi badge colorati diversi per ogni figlio. Con una sola squadra → nessun badge.

- [ ] **Commit**

```bash
git add frontend/src/pages/home/HomeGenitore.jsx
git commit -m "feat(parent): agenda famiglia multi-figlio con badge per squadra"
```

---

### Task 4: QuoteGenitore page

**Files:**
- Create: `frontend/src/pages/parent/QuoteGenitore.jsx`
- Modify: `frontend/src/App.jsx` (aggiungere la route)

- [ ] **Crea `frontend/src/pages/parent/QuoteGenitore.jsx`**

```jsx
import { useMemo } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'

const today = new Date()
const todayStr = format(today, 'yyyy-MM-dd')

function scadenzaStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'Nessuna scadenza', cls: 'bg-gray-100 text-gray-500' }
  const diff = differenceInDays(parseISO(dataScadenza), today)
  if (diff < 0)  return { label: `Scaduta ${-diff}gg fa`, cls: 'bg-red-100 text-red-700' }
  if (diff < 14) return { label: `Scade in ${diff}gg`,   cls: 'bg-orange-100 text-orange-700' }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-yellow-50 text-yellow-700' }
}

export default function QuoteGenitore() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()
  const mySquadre = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)

  // Recupera giocatori nelle squadre del genitore
  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-squadre', societaId, mySquadre],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra')
        .eq('societa_id', societaId)
        .in('squadra', mySquadre)
        .eq('attivo', true)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const giocatoreIds = useMemo(() => giocatori.map(g => g.id), [giocatori])
  const giocatoreMap = useMemo(
    () => Object.fromEntries(giocatori.map(g => [g.id, g])),
    [giocatori]
  )

  const { data: quote = [], isLoading } = useQuery({
    queryKey: ['quote-genitore', societaId, giocatoreIds],
    enabled: !!societaId && giocatoreIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza, pagato')
        .eq('societa_id', societaId)
        .in('giocatore_id', giocatoreIds)
        .order('pagato')
        .order('data_scadenza', { nullsFirst: false })
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const daPagare = quote.filter(q => !q.pagato)
  const pagate   = quote.filter(q => q.pagato)

  return (
    <div className="pb-4">
      <AppHeader
        title="Le mie quote"
        subtitle="Pagamenti e scadenze"
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : mySquadre.length === 0 ? (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Nessuna squadra associata al tuo profilo.</p>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-4">

          {daPagare.length === 0 && pagate.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-gray-400">
                Nessuna quota registrata.
              </CardContent>
            </Card>
          )}

          {daPagare.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Da pagare ({daPagare.length})</p>
              <div className="space-y-3">
                {daPagare.map(q => {
                  const g = giocatoreMap[q.giocatore_id]
                  const sc = scadenzaStatus(q.data_scadenza)
                  return (
                    <div key={q.id} className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-orange-400 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {q.descrizione ?? q.tipo}
                          </p>
                          {g && (
                            <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                              {g.nome} {g.cognome} · {g.squadra}
                            </span>
                          )}
                        </div>
                        <p className="text-lg font-bold text-gray-900">
                          €{q.importo ? Number(q.importo).toFixed(0) : '—'}
                        </p>
                      </div>
                      {q.data_scadenza && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sc.cls}`}>
                          {sc.label}
                        </span>
                      )}
                      <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                        💳 Paga in segreteria oppure tramite bonifico bancario.<br />
                        Causale: <strong>{q.descrizione ?? q.tipo} — {g ? `${g.nome} ${g.cognome}` : ''}</strong>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {pagate.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Già pagate</p>
              <div className="space-y-2">
                {pagate.map(q => {
                  const g = giocatoreMap[q.giocatore_id]
                  return (
                    <div key={q.id} className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-green-400 p-3 opacity-70">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">{q.descrizione ?? q.tipo}</p>
                          {g && <p className="text-xs text-gray-400">{g.nome} {g.cognome} · {g.squadra}</p>}
                        </div>
                        <p className="text-sm font-bold text-green-600">✓ €{q.importo ? Number(q.importo).toFixed(0) : '—'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Aggiungi la route in `App.jsx`** — trova il blocco Genitore e aggiungi:

```jsx
// Dentro <Route path="/parent" ...>
<Route path="quote" element={<QuoteGenitore />} />
```

Aggiungi l'import in cima:
```jsx
import QuoteGenitore from './pages/parent/QuoteGenitore'
```

- [ ] **Verifica nel browser**: naviga su `/parent/quote` come genitore → vede quote suddivise in "da pagare" e "già pagate". Con tab Quote nella nav.

- [ ] **Commit**

```bash
git add frontend/src/pages/parent/QuoteGenitore.jsx frontend/src/App.jsx
git commit -m "feat(parent): QuoteGenitore page — quote read-only con scadenze"
```

---

## Fase 2 — Giocatore

### Task 5: HomeGiocatore + DB migration presenze

**Files:**
- Create: `frontend/src/pages/player/HomeGiocatore.jsx`
- Create: `supabase_migration_presenze.sql`
- Modify: `frontend/src/App.jsx`

- [ ] **Crea `supabase_migration_presenze.sql`** nella root del progetto

```sql
-- Tabella presenze agli allenamenti
CREATE TABLE IF NOT EXISTS presenze (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  allenamento_id uuid REFERENCES orario_settimana(id) ON DELETE CASCADE,
  giocatore_id   uuid REFERENCES giocatori(id) ON DELETE CASCADE,
  presente       boolean NOT NULL DEFAULT false,
  societa_id     uuid REFERENCES societa(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(allenamento_id, giocatore_id)
);

ALTER TABLE presenze ENABLE ROW LEVEL SECURITY;

-- Allenatori e admin possono leggere/scrivere presenze della propria società
CREATE POLICY "presenze_societa_access" ON presenze
  USING (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
  );

-- Giocatori possono leggere le proprie presenze
CREATE POLICY "presenze_giocatore_read" ON presenze
  FOR SELECT
  USING (
    giocatore_id IN (
      SELECT g.id FROM giocatori g
      JOIN profiles p ON p.nome = g.nome AND p.cognome = g.cognome AND p.societa_id = g.societa_id
      WHERE p.id = auth.uid()
    )
  );
```

- [ ] **Esegui la migration in Supabase**: apri Supabase Dashboard → SQL Editor → incolla il contenuto del file → Run.

- [ ] **Crea `frontend/src/pages/player/HomeGiocatore.jsx`**

```jsx
import { useMemo, useRef, useState } from 'react'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatDate, isDateToday } from '../../lib/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'

export default function HomeGiocatore() {
  const { profile, displayName, logout, societaNome } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const touchStartX = useRef(null)

  const today = new Date()
  // Il giocatore è in una sola squadra (profile.squadra)
  const mySquadra = profile?.squadra ?? null

  const thisWeekStart = useMemo(
    () => startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )
  const nextWeekStart = useMemo(() => addWeeks(thisWeekStart, 1), [thisWeekStart])

  const { data: thisWeekData, isLoading: l1 } = useWeekEvents(thisWeekStart)
  const { data: nextWeekData, isLoading: l2 } = useWeekEvents(nextWeekStart)

  function filterMine(events) {
    if (!mySquadra) return []
    return (events ?? []).filter(e =>
      e.squadra?.toLowerCase() === mySquadra.toLowerCase() && !e.annullato
    )
  }

  const agendaDays = useMemo(() => {
    const allEvents = [...filterMine(thisWeekData?.events), ...filterMine(nextWeekData?.events)]
    const byDate = {}
    for (const e of allEvents) {
      if (!byDate[e.data]) byDate[e.data] = []
      byDate[e.data].push(e)
    }
    return Array.from({ length: 14 }, (_, i) => {
      const dateStr = format(addDays(thisWeekStart, i), 'yyyy-MM-dd')
      return { dateStr, events: byDate[dateStr] ?? [] }
    })
  }, [thisWeekData, nextWeekData, mySquadra, thisWeekStart])

  const weekLabel = useMemo(() => {
    const s = format(thisWeekStart, 'd MMM', { locale: it })
    const e = format(addDays(thisWeekStart, 13), 'd MMM yyyy', { locale: it })
    return `${s} – ${e}`
  }, [thisWeekStart])

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) setWeekOffset(w => w + (dx < 0 ? 2 : -2))
    touchStartX.current = null
  }

  if (!mySquadra) {
    return (
      <div>
        <AppHeader title="Ciao!" subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Nessuna squadra associata al tuo profilo.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <AppHeader
        title={`Ciao, ${displayName}! 👋`}
        subtitle={`La tua squadra: ${mySquadra}`}
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      <div className="bg-white border-b px-4 py-2 flex items-center justify-between"
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <button onClick={() => setWeekOffset(w => w - 2)}
          className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-800">{weekLabel}</div>
          {weekOffset === 0 && <div className="text-xs text-blue-600 font-medium">Prossimi 14 giorni</div>}
        </div>
        <button onClick={() => setWeekOffset(w => w + 2)}
          className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
          <ChevronRight size={20} className="text-gray-600" />
        </button>
      </div>

      {(l1 || l2) ? (
        <div className="pt-6"><LoadingSpinner /></div>
      ) : (
        <div className="pt-3 space-y-4 pb-4">
          {agendaDays.map(({ dateStr, events }) => {
            const isToday = isDateToday(dateStr)
            const label   = formatDate(dateStr, 'EEEE d MMMM')
            return (
              <section key={dateStr}>
                <div className={`px-4 mb-2 flex items-center gap-2`}>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-blue-700 font-bold' : 'text-gray-400'}`}>
                    {label}
                  </span>
                  {isToday && <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">oggi</span>}
                </div>
                {events.length === 0 ? (
                  <div className="mx-4 text-sm text-gray-300 py-1">–</div>
                ) : (
                  <div className="px-4 space-y-2">
                    {events.map((e, i) => (
                      <EventCardPlayer key={`${e._source ?? 'e'}-${e.id ?? i}`} event={e} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EventCardPlayer({ event }) {
  const isPartita = event._tipo === 'partita'
  const isCasa    = (event.casa_fuori ?? '').toLowerCase() === 'casa'

  const styles = isPartita
    ? event.stato === 'provvisoria'
      ? { border: 'border-l-yellow-400', bg: 'bg-yellow-50', label: '⚠️ Provvisoria', labelCls: 'bg-yellow-100 text-yellow-700' }
      : isCasa
        ? { border: 'border-l-green-500', bg: 'bg-green-50',  label: '🏠 Casa',        labelCls: 'bg-green-100 text-green-700'  }
        : { border: 'border-l-blue-500',  bg: 'bg-blue-50',   label: '✈️ Trasferta',   labelCls: 'bg-blue-100 text-blue-700'   }
    : { border: 'border-l-blue-400', bg: 'bg-blue-50', label: 'Allenamento', labelCls: 'bg-blue-100 text-blue-600' }

  return (
    <div className={`rounded-xl border-l-4 ${styles.border} ${styles.bg} px-4 py-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {isPartita && event.avversario ? `vs ${event.avversario}` : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-500">
            {event.ora_inizio && <span className="font-medium text-gray-700">{event.ora_inizio?.slice(0,5)}–{event.ora_fine?.slice(0,5)}</span>}
            {event.palestra && <span>{event.palestra}</span>}
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${styles.labelCls}`}>
          {styles.label}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Aggiorna App.jsx** — sostituisci `<HomeGenitore />` nel blocco `/player`:

```jsx
// Aggiornare import in cima:
import HomeGiocatore from './pages/player/HomeGiocatore'

// Nel blocco /player, index route:
<Route index element={<HomeGiocatore />} />
```

- [ ] **Verifica nel browser**: loggando come giocatore → `/player` mostra il programma della propria squadra senza badge.

- [ ] **Commit**

```bash
git add frontend/src/pages/player/HomeGiocatore.jsx frontend/src/App.jsx supabase_migration_presenze.sql
git commit -m "feat(player): HomeGiocatore + migration tabella presenze"
```

---

### Task 6: StatisticheGiocatore

**Files:**
- Create: `frontend/src/pages/player/StatisticheGiocatore.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Crea `frontend/src/pages/player/StatisticheGiocatore.jsx`**

```jsx
import { useMemo } from 'react'
import { format, startOfYear } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'

export default function StatisticheGiocatore() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()

  // Trova il record giocatore per nome+cognome+societa
  const { data: giocatoreRow } = useQuery({
    queryKey: ['giocatore-row', profile?.nome, profile?.cognome, societaId],
    enabled: !!(profile?.nome && profile?.cognome && societaId),
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra')
        .eq('nome', profile.nome)
        .eq('cognome', profile.cognome)
        .eq('societa_id', societaId)
        .maybeSingle()
      return data
    },
    staleTime: 10 * 60 * 1000,
  })

  const seasonStart = format(startOfYear(new Date()), 'yyyy-MM-dd')

  const { data: presenze = [], isLoading } = useQuery({
    queryKey: ['presenze-giocatore', giocatoreRow?.id, seasonStart],
    enabled: !!giocatoreRow?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze')
        .select('presente, allenamento_id')
        .eq('giocatore_id', giocatoreRow.id)
        .eq('societa_id', societaId)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const stats = useMemo(() => {
    const totale   = presenze.length
    const presenti = presenze.filter(p => p.presente).length
    const perc     = totale > 0 ? Math.round((presenti / totale) * 100) : null
    return { totale, presenti, assenti: totale - presenti, perc }
  }, [presenze])

  return (
    <div>
      <AppHeader
        title="Le mie statistiche"
        subtitle={giocatoreRow?.squadra ?? ''}
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : !giocatoreRow ? (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Profilo giocatore non trovato. Contatta l'amministratore.</p>
        </div>
      ) : stats.totale === 0 ? (
        <div className="px-4 pt-6">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm font-semibold text-gray-700">Nessuna presenza registrata ancora</p>
              <p className="text-xs text-gray-400 mt-1">Le presenze vengono registrate dall'allenatore dopo ogni allenamento.</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-4">
          {/* KPI */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Presenze', value: stats.presenti, color: 'text-green-600' },
              { label: 'Assenze',  value: stats.assenti,  color: 'text-red-500'   },
              { label: '% Presenza', value: stats.perc !== null ? `${stats.perc}%` : '—', color: 'text-blue-600' },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="py-4 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="py-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Allenamenti registrati: {stats.totale}</p>
              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all"
                  style={{ width: `${stats.perc ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{stats.perc ?? 0}% di presenze</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Aggiungi route in App.jsx**:

```jsx
import StatisticheGiocatore from './pages/player/StatisticheGiocatore'

// Nel blocco /player:
<Route path="statistiche" element={<StatisticheGiocatore />} />
```

- [ ] **Verifica nel browser**: `/player/statistiche` → mostra stato vuoto se presenze non ancora inserite. Tab "Statistiche" funziona.

- [ ] **Commit**

```bash
git add frontend/src/pages/player/StatisticheGiocatore.jsx frontend/src/App.jsx
git commit -m "feat(player): StatisticheGiocatore — presenze stagionali"
```

---

## Fase 3 — Segreteria

### Task 7: SegreteriaDashboard + fix bacheca segreteria

**Files:**
- Create: `frontend/src/pages/secretary/SegreteriaDashboard.jsx`
- Modify: `frontend/src/pages/BachecaPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Crea `frontend/src/pages/secretary/SegreteriaDashboard.jsx`**

```jsx
import { useMemo } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

const today = new Date()
const todayStr = format(today, 'yyyy-MM-dd')
const in30days = format(new Date(today.getTime() + 30 * 86400000), 'yyyy-MM-dd')

export default function SegreteriaDashboard() {
  const { societaId, displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()

  const { data: giocatori = [], isLoading: lg } = useQuery({
    queryKey: ['segreteria-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, cert_medico_scadenza')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: quote = [], isLoading: lq } = useQuery({
    queryKey: ['segreteria-quote-aperte', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza, pagato')
        .eq('societa_id', societaId)
        .eq('pagato', false)
        .order('data_scadenza', { nullsFirst: false })
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const giocatoreMap = useMemo(
    () => Object.fromEntries(giocatori.map(g => [g.id, g])),
    [giocatori]
  )

  const certScaduti  = useMemo(() => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza < todayStr), [giocatori])
  const certInScad   = useMemo(() => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza >= todayStr && g.cert_medico_scadenza <= in30days), [giocatori])
  const quoteScadute = useMemo(() => quote.filter(q => q.data_scadenza && q.data_scadenza < todayStr), [quote])

  const isLoading = lg || lq
  const tuttoOk   = certScaduti.length === 0 && certInScad.length === 0 && quoteScadute.length === 0

  return (
    <div>
      <AppHeader
        title="Dashboard"
        subtitle="Urgenze di oggi"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : (
        <div className="px-4 pt-4 space-y-4">

          {/* KPI */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Cert. scaduti',    value: certScaduti.length,  color: certScaduti.length  > 0 ? 'text-red-600'    : 'text-green-600' },
              { label: 'Cert. in scad.',   value: certInScad.length,   color: certInScad.length   > 0 ? 'text-orange-500' : 'text-green-600' },
              { label: 'Quote scadute',    value: quoteScadute.length, color: quoteScadute.length > 0 ? 'text-purple-600' : 'text-green-600' },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="py-3 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {tuttoOk ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-5 text-sm text-green-600">
                <CheckCircle2 size={16} /> Tutto in ordine! Nessuna azione urgente.
              </CardContent>
            </Card>
          ) : (
            <>
              {certScaduti.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                    <AlertTriangle size={12} /> Certificati scaduti ({certScaduti.length})
                  </p>
                  <div className="space-y-2">
                    {certScaduti.map(g => (
                      <button key={g.id} onClick={() => navigate('/secretary/giocatori')}
                        className="w-full text-left bg-white rounded-xl border border-l-4 border-l-red-500 px-4 py-3 shadow-sm active:scale-[0.99]">
                        <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          Scaduto il {format(parseISO(g.cert_medico_scadenza), 'd MMM yyyy', { locale: it })}
                          {' '}({-differenceInDays(parseISO(g.cert_medico_scadenza), today)}gg fa)
                        </p>
                        <p className="text-xs text-gray-400">{g.squadra}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {certInScad.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                    <AlertTriangle size={12} /> In scadenza entro 30 giorni ({certInScad.length})
                  </p>
                  <div className="space-y-2">
                    {certInScad.map(g => (
                      <button key={g.id} onClick={() => navigate('/secretary/giocatori')}
                        className="w-full text-left bg-white rounded-xl border border-l-4 border-l-orange-400 px-4 py-3 shadow-sm active:scale-[0.99]">
                        <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                        <p className="text-xs text-orange-600 mt-0.5">
                          Scade in {differenceInDays(parseISO(g.cert_medico_scadenza), today)}gg
                          {' '}({format(parseISO(g.cert_medico_scadenza), 'd MMM', { locale: it })})
                        </p>
                        <p className="text-xs text-gray-400">{g.squadra}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {quoteScadute.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                    <AlertTriangle size={12} /> Quote scadute non pagate ({quoteScadute.length})
                  </p>
                  <div className="space-y-2">
                    {quoteScadute.map(q => {
                      const g = giocatoreMap[q.giocatore_id]
                      return (
                        <button key={q.id} onClick={() => navigate('/secretary/quote')}
                          className="w-full text-left bg-white rounded-xl border border-l-4 border-l-purple-400 px-4 py-3 shadow-sm active:scale-[0.99]">
                          <p className="text-sm font-semibold text-gray-900">
                            {g ? `${g.cognome} ${g.nome}` : 'Giocatore sconosciuto'}
                          </p>
                          <p className="text-xs text-purple-600 mt-0.5">{q.descrizione ?? q.tipo} — €{q.importo}</p>
                          {q.data_scadenza && (
                            <p className="text-xs text-gray-400">
                              Scad. {format(parseISO(q.data_scadenza), 'd MMM yyyy', { locale: it })}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Fix BachecaPage**: segreteria può scrivere annunci

In `frontend/src/pages/BachecaPage.jsx`, riga ~195 trova:
```jsx
const canWrite = isAdmin || isAllenatore
```
e sostituisci con:
```jsx
const { user, profile, societaId, isAdmin, isAllenatore, isSegreteria, displayName } = useAuth()
// ...
const canWrite = isAdmin || isAllenatore || isSegreteria
```

Assicurati anche che l'import di `useAuth` nel componente estragga `isSegreteria`.

- [ ] **Aggiorna App.jsx** — sostituisci la index route di `/secretary`:

```jsx
import SegreteriaDashboard from './pages/secretary/SegreteriaDashboard'

// Nel blocco /secretary, index route:
<Route index element={<SegreteriaDashboard />} />
```

- [ ] **Verifica nel browser**: `/secretary` → dashboard con KPI. Cliccando una voce porta a `/secretary/giocatori` o `/secretary/quote`. Bacheca segreteria → pulsante "Nuovo" è visibile.

- [ ] **Commit**

```bash
git add frontend/src/pages/secretary/ frontend/src/pages/BachecaPage.jsx frontend/src/App.jsx
git commit -m "feat(secretary): dashboard urgenze + fix bacheca segreteria può scrivere"
```

---

## Fase 4 — Allenatore

### Task 8: PresenzePage — roll call manuale

**Files:**
- Create: `frontend/src/pages/coach/PresenzePage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Crea `frontend/src/pages/coach/PresenzePage.jsx`**

```jsx
import { useState, useMemo } from 'react'
import { format, subDays, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight, Check, X, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'

const today = new Date()
const todayStr = format(today, 'yyyy-MM-dd')

export default function PresenzePage() {
  const { user, profile, societaId, displayName, logout, societaNome } = useAuth()
  const qc = useQueryClient()

  const [selectedId, setSelectedId] = useState(null)
  const [presMap, setPresMap]       = useState({}) // { giocatoreId: true/false }
  const [saved, setSaved]           = useState(false)

  // Recupera le squadre dell'allenatore
  const { data: allenatoreRow } = useQuery({
    queryKey: ['my-allenatore', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from('allenatori')
        .select('squadre_capo, squadre_vice')
        .eq('email', user.email)
        .maybeSingle()
      return data
    },
  })

  const parseList = (s) => (typeof s === 'string' && s.trim()
    ? s.split(',').map(x => x.trim()).filter(Boolean)
    : Array.isArray(s) ? s : [])

  const mySquadre = useMemo(() => {
    if (!allenatoreRow) return []
    return [...parseList(allenatoreRow.squadre_capo), ...parseList(allenatoreRow.squadre_vice)]
  }, [allenatoreRow])

  const rangeStart = format(subDays(today, 7), 'yyyy-MM-dd')
  const rangeEnd   = format(addDays(today, 7), 'yyyy-MM-dd')

  // Allenamenti recenti/prossimi per le proprie squadre
  const { data: allenamenti = [], isLoading: la } = useQuery({
    queryKey: ['presenze-allenamenti', societaId, mySquadre, rangeStart],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('orario_settimana')
        .select('id, data, squadra, ora_inizio, ora_fine, palestra')
        .eq('societa_id', societaId)
        .in('squadra', mySquadre)
        .gte('data', rangeStart)
        .lte('data', rangeEnd)
        .eq('annullato', false)
        .order('data', { ascending: false })
        .order('ora_inizio')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const selectedAll = allenamenti.find(a => a.id === selectedId)

  // Giocatori della squadra selezionata
  const { data: giocatori = [], isLoading: lg } = useQuery({
    queryKey: ['presenze-giocatori', selectedAll?.squadra, societaId],
    enabled: !!selectedAll?.squadra && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .eq('squadra', selectedAll.squadra)
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  // Presenze già salvate per questo allenamento
  const { data: existingPresenze = [] } = useQuery({
    queryKey: ['presenze-existing', selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze')
        .select('giocatore_id, presente')
        .eq('allenamento_id', selectedId)
      return data ?? []
    },
    onSuccess: (data) => {
      if (data.length > 0) {
        setPresMap(Object.fromEntries(data.map(p => [p.giocatore_id, p.presente])))
      } else {
        setPresMap({})
      }
    },
  })

  // Quando si seleziona un allenamento, pre-carica le presenze esistenti
  useMemo(() => {
    if (existingPresenze.length > 0) {
      setPresMap(Object.fromEntries(existingPresenze.map(p => [p.giocatore_id, p.presente])))
      setSaved(false)
    }
  }, [existingPresenze])

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selectedId || giocatori.length === 0) return
      const records = giocatori.map(g => ({
        allenamento_id: selectedId,
        giocatore_id:   g.id,
        presente:       presMap[g.id] ?? false,
        societa_id:     societaId,
      }))
      const { error } = await supabase
        .from('presenze')
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

  function handleSelectAllenamento(id) {
    setSelectedId(id)
    setSaved(false)
    setPresMap({})
  }

  return (
    <div>
      <AppHeader
        title="Presenze"
        subtitle="Registra chi era presente"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      {la ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : allenamenti.length === 0 ? (
        <div className="px-4 pt-4">
          <Card><CardContent className="py-6 text-center text-sm text-gray-400">
            Nessun allenamento nei prossimi/ultimi 7 giorni.
          </CardContent></Card>
        </div>
      ) : !selectedId ? (
        // Lista allenamenti
        <div className="px-4 pt-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Seleziona allenamento</p>
          {allenamenti.map(a => (
            <button key={a.id} onClick={() => handleSelectAllenamento(a.id)}
              className="w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between active:scale-[0.99] shadow-sm">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {format(new Date(a.data), 'EEEE d MMM', { locale: it })} · {a.squadra}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {a.ora_inizio?.slice(0,5)}–{a.ora_fine?.slice(0,5)}{a.palestra ? ` · ${a.palestra}` : ''}
                </p>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </button>
          ))}
        </div>
      ) : (
        // Roll call
        <div className="px-4 pt-4">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setSelectedId(null)}
              className="text-xs text-amber-600 font-semibold">← Cambia</button>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {format(new Date(selectedAll.data), 'EEEE d MMM', { locale: it })} · {selectedAll.squadra}
              </p>
              <p className="text-xs text-gray-500">{selectedAll.ora_inizio?.slice(0,5)}–{selectedAll.ora_fine?.slice(0,5)}</p>
            </div>
          </div>

          {lg ? <LoadingSpinner /> : (
            <>
              <div className="space-y-2 mb-4">
                {giocatori.map(g => {
                  const presente = presMap[g.id] ?? false
                  return (
                    <button key={g.id} onClick={() => togglePresenza(g.id)}
                      className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border transition-colors ${
                        presente
                          ? 'bg-green-50 border-green-200'
                          : 'bg-white border-gray-200'
                      }`}>
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
                className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Save size={16} />
                {saveMut.isPending ? 'Salvataggio...' : 'Salva presenze'}
              </button>
              {saveMut.isError && (
                <p className="text-xs text-red-500 mt-2 text-center">{saveMut.error?.message}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Aggiungi route in App.jsx**:

```jsx
import PresenzePage from './pages/coach/PresenzePage'

// Nel blocco /coach:
<Route path="presenze" element={<PresenzePage />} />
```

- [ ] **Verifica nel browser**: `/coach/presenze` → lista allenamenti → tap su uno → roll call → tap presente/assente → salva → riapri → presenze pre-caricate.

- [ ] **Commit**

```bash
git add frontend/src/pages/coach/PresenzePage.jsx frontend/src/App.jsx
git commit -m "feat(coach): PresenzePage — roll call manuale presenze allenamenti"
```

---

## Fase 5 — Admin

### Task 9: AdminPersone + Bacheca admin

**Files:**
- Create: `frontend/src/pages/admin/AdminPersone.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Crea `frontend/src/pages/admin/AdminPersone.jsx`**

```jsx
import { useState, useMemo } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'

const today = new Date()
const todayStr = format(today, 'yyyy-MM-dd')

function certLabel(dataScad) {
  if (!dataScad) return { text: 'N/D', cls: 'bg-gray-100 text-gray-500' }
  const diff = differenceInDays(parseISO(dataScad), today)
  if (diff < 0)  return { text: `Scad. ${-diff}gg fa`, cls: 'bg-red-100 text-red-700'    }
  if (diff < 30) return { text: `Scade in ${diff}gg`,  cls: 'bg-orange-100 text-orange-700' }
  return { text: format(parseISO(dataScad), 'd MMM yy', { locale: it }), cls: 'bg-green-100 text-green-700' }
}

export default function AdminPersone() {
  const { societaId, displayName, logout, societaNome } = useAuth()
  const [squadraFilter, setSquadraFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data: giocatori = [], isLoading } = useQuery({
    queryKey: ['admin-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, cert_medico_scadenza, data_nascita')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const squadre = useMemo(() => [...new Set(giocatori.map(g => g.squadra).filter(Boolean))].sort(), [giocatori])

  const filtrati = useMemo(() => {
    let list = giocatori
    if (squadraFilter) list = list.filter(g => g.squadra === squadraFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(g => `${g.nome} ${g.cognome}`.toLowerCase().includes(q))
    }
    return list
  }, [giocatori, squadraFilter, search])

  const certScadutiCount  = giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza < todayStr).length
  const certInScadCount   = giocatori.filter(g => {
    if (!g.cert_medico_scadenza) return false
    const diff = differenceInDays(parseISO(g.cert_medico_scadenza), today)
    return diff >= 0 && diff < 30
  }).length

  return (
    <div>
      <AppHeader
        title="Persone"
        subtitle={`${giocatori.length} giocatori attivi`}
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      <div className="px-4 pt-4 space-y-3">
        {/* Alert veloce */}
        {(certScadutiCount > 0 || certInScadCount > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm">
            {certScadutiCount > 0 && <p className="text-red-700 font-semibold">🔴 {certScadutiCount} cert. scaduti</p>}
            {certInScadCount  > 0 && <p className="text-orange-600 font-medium">🟡 {certInScadCount} in scadenza entro 30gg</p>}
          </div>
        )}

        {/* Filtri */}
        <div className="flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca giocatore..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <select value={squadraFilter} onChange={e => setSquadraFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">Tutte</option>
            {squadre.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {isLoading ? <LoadingSpinner /> : (
          <div className="space-y-2">
            {filtrati.length === 0 ? (
              <Card><CardContent className="py-5 text-center text-sm text-gray-400">Nessun giocatore trovato.</CardContent></Card>
            ) : filtrati.map(g => {
              const cl = certLabel(g.cert_medico_scadenza)
              return (
                <div key={g.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{g.squadra}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${cl.cls}`}>{cl.text}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Aggiungi route in App.jsx**:

```jsx
import AdminPersone from './pages/admin/AdminPersone'

// Nel blocco /admin:
<Route path="persone" element={<AdminPersone />} />
```

Assicurati che `/admin/bacheca` sia già presente nel blocco admin (è stato aggiunto nel Task 2).

- [ ] **Verifica**: `/admin/persone` → lista giocatori con stato cert medico, filtro squadra e ricerca.

- [ ] **Commit**

```bash
git add frontend/src/pages/admin/AdminPersone.jsx frontend/src/App.jsx
git commit -m "feat(admin): AdminPersone — panoramica giocatori con stato cert medico"
```

---

### Task 10: Setup redesign — menu a sezioni

**Files:**
- Create: `frontend/src/pages/admin/SetupMenu.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Crea `frontend/src/pages/admin/SetupMenu.jsx`**

```jsx
import { useNavigate } from 'react-router-dom'
import { Users, Dumbbell, UserCheck, Trophy, Building2, Building, CreditCard, Calendar, GitFork, ChevronRight } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import { useAuth } from '../../hooks/useAuth'

const SECTIONS = [
  {
    group: '👥 Persone',
    items: [
      { icon: Trophy,     label: 'Giocatori',       desc: 'Anagrafica, squadre, info',   tab: 'giocatori' },
      { icon: Dumbbell,   label: 'Allenatori',       desc: 'Profili e assegnazione',      tab: 'allenatori' },
      { icon: UserCheck,  label: 'Utenti & Accessi', desc: 'Inviti, ruoli, password',      tab: 'utenti' },
    ],
  },
  {
    group: '🏢 Struttura societaria',
    items: [
      { icon: Users,      label: 'Squadre',  desc: 'Categorie e nomi squadre', tab: 'squadre' },
      { icon: Building2,  label: 'Palestre', desc: 'Sedi e orari',             tab: 'palestre' },
      { icon: Building,   label: 'Società',  desc: 'Info generali, stagione',  tab: 'societa' },
    ],
  },
  {
    group: '🛠 Strumenti & Configurazione',
    items: [
      { icon: CreditCard, label: 'Tipologie Quote',       desc: 'Template iscrizioni e mensili', tab: 'quote' },
      { icon: Calendar,   label: 'Scheduling',             desc: 'Suggeritore orari',             tab: 'scheduling' },
      { icon: GitFork,    label: 'Doppio Campionato',      desc: 'Squadre con giocatori comuni',  tab: 'squadre_allenatori' },
    ],
  },
]

export default function SetupMenu() {
  const { displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()

  return (
    <div>
      <AppHeader
        title="Setup"
        subtitle={societaNome ?? 'Configurazione società'}
        displayName={displayName} logout={logout} societaNome={societaNome}
      />
      <div className="px-4 pt-4 space-y-4 pb-4">
        {SECTIONS.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">{group}</p>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              {items.map(({ icon: Icon, label, desc, tab }, i) => (
                <button
                  key={tab}
                  onClick={() => navigate(`/admin/setup/${tab}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors ${
                    i < items.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-amber-600" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Aggiorna route `/admin/setup` in App.jsx** per mostrare il menu e accettare sub-route per ogni tab:

```jsx
import SetupMenu from './pages/admin/SetupMenu'

// Sostituisci nel blocco /admin:
// PRIMA:  <Route path="setup" element={<SetupPage />} />
// DOPO:
<Route path="setup" element={<SetupMenu />} />
<Route path="setup/:tab" element={<SetupPage />} />
```

- [ ] **Aggiorna `SetupPage` per leggere il tab dalla URL** — in `frontend/src/pages/SetupPage.jsx`:

```jsx
import { useParams } from 'react-router-dom'

export default function SetupPage({ initialTab }) {
  const { tab } = useParams()
  const [activeTab, setActiveTab] = useState(tab ?? initialTab ?? 'squadre')
  // ...resto invariato
```

- [ ] **Verifica**: `/admin/setup` → menu a sezioni. Tap su "Giocatori" → `/admin/setup/giocatori` → SetupPage con tab giocatori aperta. Bottone back del browser → torna al menu.

- [ ] **Commit**

```bash
git add frontend/src/pages/admin/SetupMenu.jsx frontend/src/pages/SetupPage.jsx frontend/src/App.jsx
git commit -m "feat(admin): Setup redesign — menu a sezioni iOS-style con sub-routes"
```

---

### Task 11: Cleanup BottomNav legacy + test finale

**Files:**
- Modify: `frontend/src/components/BottomNav.jsx` (depreca il componente)

- [ ] **Verifica che `BottomNav` non sia più usato in nessun file eccetto il proprio**

```bash
grep -r "BottomNav" frontend/src --include="*.jsx" --include="*.js" -l
```

L'unico file che dovrebbe comparire è `frontend/src/components/BottomNav.jsx` stesso. Se compare anche `App.jsx`, rimuovi l'import e l'uso.

- [ ] **Aggiungi deprecation comment a BottomNav.jsx** (primo riga del file):

```jsx
// DEPRECATED: rimpiazzato dai layout-specifici in src/layouts/. Da rimuovere dopo migrazione completa.
```

- [ ] **Test completo per ogni ruolo** — avvia il dev server e verifica:

  **Genitore:**
  - Login → `/parent` → agenda con badge colorati per squadra
  - `/parent/quote` → lista quote da pagare e già pagate
  - `/parent/bacheca` → annunci filtrati, nessun pulsante scrivi

  **Giocatore:**
  - Login → `/player` → programma settimana propria squadra
  - `/player/statistiche` → stato vuoto con messaggio esplicativo
  - `/player/bacheca` → annunci filtrati

  **Segreteria:**
  - Login → `/secretary` → dashboard KPI (cert scaduti, in scadenza, quote)
  - Tap su cert scaduto → porta a `/secretary/giocatori`
  - `/secretary/bacheca` → pulsante "Nuovo" visibile, può scrivere
  - `/secretary/quote` → lista quote con mark-as-paid

  **Allenatore:**
  - Login → `/coach` → home con prossima gara + allenamenti settimana
  - `/coach/presenze` → lista allenamenti recenti/futuri → selezione → roll call → salva
  - `/coach/bacheca` → pulsante "Nuovo" visibile, scrive solo alla propria squadra
  - `/coach/statistiche` → statistiche squadra

  **Admin:**
  - Login → `/admin` → dashboard con KPI + alert urgenti
  - `/admin/partite` → calendario partite
  - `/admin/allenamenti` → orario allenamenti
  - `/admin/persone` → lista giocatori con cert, filtro e ricerca
  - `/admin/bacheca` → pulsante "Nuovo" visibile
  - `/admin/setup` → menu a sezioni → tap voce → SetupPage con tab corretta

  **Legacy redirects:**
  - `/segreteria` → `/secretary`
  - `/setup` → `/admin/setup`
  - `/bacheca` → redirect al namespace corretto per ruolo

- [ ] **Commit finale**

```bash
git add frontend/src/components/BottomNav.jsx
git commit -m "chore: deprecate legacy BottomNav — sostituito da layout per ruolo"
```

---

## Riepilogo file creati/modificati

| File | Operazione |
|------|-----------|
| `src/components/RoleRedirect.jsx` | NUOVO |
| `src/layouts/ParentLayout.jsx` | NUOVO |
| `src/layouts/PlayerLayout.jsx` | NUOVO |
| `src/layouts/SecretaryLayout.jsx` | NUOVO |
| `src/layouts/CoachLayout.jsx` | NUOVO |
| `src/layouts/AdminLayout.jsx` | NUOVO |
| `src/pages/parent/QuoteGenitore.jsx` | NUOVO |
| `src/pages/player/HomeGiocatore.jsx` | NUOVO |
| `src/pages/player/StatisticheGiocatore.jsx` | NUOVO |
| `src/pages/secretary/SegreteriaDashboard.jsx` | NUOVO |
| `src/pages/coach/PresenzePage.jsx` | NUOVO |
| `src/pages/admin/AdminPersone.jsx` | NUOVO |
| `src/pages/admin/SetupMenu.jsx` | NUOVO |
| `src/App.jsx` | MODIFICA — namespace routing |
| `src/pages/home/HomeGenitore.jsx` | MODIFICA — badge multi-figlio |
| `src/pages/BachecaPage.jsx` | MODIFICA — segreteria canWrite |
| `src/pages/SegreteriePage.jsx` | MODIFICA — initialTab prop |
| `src/pages/SetupPage.jsx` | MODIFICA — useParams per tab |
| `src/components/BottomNav.jsx` | DEPRECATO |
| `supabase_migration_presenze.sql` | NUOVO |
