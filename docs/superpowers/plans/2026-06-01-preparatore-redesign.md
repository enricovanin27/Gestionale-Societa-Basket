# Preparatore Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere una Home dashboard al preparatore atletico, redesignare l'Agenda in stile compatto, aggiungere il Calendario coach, e abilitare le modifiche al calendario per il ruolo preparatore.

**Architecture:** 4 task indipendenti. Task 1 aggiorna routing/layout. Task 2 crea `HomePrepPage`. Task 3 redesigna `AgendaPrep`. Task 4 abilita `canModify` in `CalendarioPage` per il preparatore.

**Tech Stack:** React 18, Supabase JS v2, TanStack Query v5, React Router v6, Tailwind CSS, date-fns, Lucide React

---

## File map

| File | Task | Azione |
|------|------|--------|
| `frontend/src/layouts/PrepLayout.jsx` | 1 | MODIFY — aggiunge Home, Calendario; aggiorna link Agenda |
| `frontend/src/App.jsx` | 1 | MODIFY — aggiunge route HomePrepPage, agenda, calendario |
| `frontend/src/pages/prep/HomePrepPage.jsx` | 2 | CREATE — dashboard KPI preparatore |
| `frontend/src/pages/prep/AgendaPrep.jsx` | 3 | MODIFY — layout compatto stile CalendarioGenitore |
| `frontend/src/pages/CalendarioPage.jsx` | 4 | MODIFY — abilita canModify per preparatore |

---

## Task 1: PrepLayout + App.jsx — routing e navigazione

**Files:**
- Modify: `frontend/src/layouts/PrepLayout.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1.1 — Modifica PrepLayout.jsx**

  Leggi il file. Sostituisci l'intero contenuto con questo aggiornamento (4 voci nav invece di 2):

  ```jsx
  import { Outlet, NavLink } from 'react-router-dom'
  import { Home, Calendar, CalendarDays, BookOpen } from 'lucide-react'
  import AppSidebar from '../components/AppSidebar'

  const cls = ({ isActive }) =>
    `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
      isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
    }`

  const SIDEBAR_ITEMS = [
    { to: '/prep',           end: true, icon: Home,        label: 'Home' },
    { to: '/prep/agenda',               icon: Calendar,    label: 'Agenda' },
    { to: '/prep/calendario',           icon: CalendarDays,label: 'Calendario' },
    { to: '/prep/schede',               icon: BookOpen,    label: 'Schede' },
  ]

  export default function PrepLayout() {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppSidebar items={SIDEBAR_ITEMS} accentColor="amber" />
        <div className="pb-20 lg:pb-0 lg:pl-56"><Outlet /></div>
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
          <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
            <NavLink to="/prep" end className={cls}>
              <Home size={20} strokeWidth={1.8} />
              <span className="text-[10px] font-medium">Home</span>
            </NavLink>
            <NavLink to="/prep/agenda" className={cls}>
              <Calendar size={20} strokeWidth={1.8} />
              <span className="text-[10px] font-medium">Agenda</span>
            </NavLink>
            <NavLink to="/prep/calendario" className={cls}>
              <CalendarDays size={20} strokeWidth={1.8} />
              <span className="text-[10px] font-medium">Calendario</span>
            </NavLink>
            <NavLink to="/prep/schede" className={cls}>
              <BookOpen size={20} strokeWidth={1.8} />
              <span className="text-[10px] font-medium">Schede</span>
            </NavLink>
          </div>
        </nav>
      </div>
    )
  }
  ```

- [ ] **Step 1.2 — Modifica App.jsx: import e route prep**

  Aggiungi l'import di `HomePrepPage` e `CalendarioPage` (CalendarioPage è già importata).

  Trova la riga:
  ```jsx
  import AgendaPrep from './pages/prep/AgendaPrep'
  ```

  Aggiungi sotto:
  ```jsx
  import HomePrepPage from './pages/prep/HomePrepPage'
  ```

  `CalendarioPage` è già importata all'inizio del file (`import CalendarioPage from './pages/CalendarioPage'`). Non aggiungere un secondo import.

  Trova il blocco route `/prep` (circa riga 225):
  ```jsx
  <Route path="/prep" element={<ProtectedRoute requiredRole="preparatore_atletico"><PrepLayout /></ProtectedRoute>}>
    <Route index          element={<AgendaPrep />} />
    <Route path="schede"  element={<SchedeAtletichePage />} />
  </Route>
  ```

  Sostituisci con:
  ```jsx
  <Route path="/prep" element={<ProtectedRoute requiredRole="preparatore_atletico"><PrepLayout /></ProtectedRoute>}>
    <Route index              element={<HomePrepPage />} />
    <Route path="agenda"      element={<AgendaPrep />} />
    <Route path="calendario"  element={<CalendarioPage />} />
    <Route path="schede"      element={<SchedeAtletichePage />} />
  </Route>
  ```

- [ ] **Step 1.3 — Commit**

  ```
  git add frontend/src/layouts/PrepLayout.jsx frontend/src/App.jsx
  git commit -m "feat: prep layout — aggiunge Home e Calendario, sposta Agenda su /prep/agenda"
  ```

---

## Task 2: HomePrepPage — dashboard KPI

**Files:**
- Create: `frontend/src/pages/prep/HomePrepPage.jsx`

Questa pagina è modellata su `SegreteriaDashboard`. Mostra 2 KPI card (Sessioni settimana, Allenamenti) che espandono i dettagli inline.

- [ ] **Step 2.1 — Crea il file**

  Crea `frontend/src/pages/prep/HomePrepPage.jsx` con il seguente contenuto completo:

  ```jsx
  import { useState, useMemo } from 'react'
  import { format, startOfWeek, endOfWeek } from 'date-fns'
  import { it } from 'date-fns/locale'
  import { ChevronDown, ChevronUp } from 'lucide-react'
  import { useQuery } from '@tanstack/react-query'
  import { supabase } from '../../lib/supabase'
  import { useAuth } from '../../hooks/useAuth'
  import { useWeekEvents } from '../../hooks/useWeekEvents'
  import AppHeader from '../../components/AppHeader'
  import LoadingSpinner from '../../components/LoadingSpinner'

  const QUANDO_LABEL = {
    prima:      'Prima',
    durante:    'Durante',
    dopo:       'Dopo',
    standalone: 'Sessione libera',
  }

  // ─── KPI Card (identica a SegreteriaDashboard) ───────────────────────────────

  function KpiCard({ label, value, isOpen, onToggle }) {
    const hasItems = value > 0
    const content = (
      <>
        <p className={`text-2xl font-bold ${hasItems ? 'text-amber-600' : 'text-green-600'}`}>{value}</p>
        <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
        {hasItems && (
          <div className="mt-1.5 flex justify-center">
            {isOpen ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
          </div>
        )}
      </>
    )

    if (!hasItems) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 py-3 px-2 text-center shadow-sm">
          {content}
        </div>
      )
    }

    return (
      <button
        onClick={onToggle}
        className="bg-white rounded-xl border border-gray-200 py-3 px-2 w-full text-center shadow-sm active:scale-[0.98] transition-transform"
      >
        {content}
      </button>
    )
  }

  // ─── Componente principale ────────────────────────────────────────────────────

  export default function HomePrepPage() {
    const { societaId, profile, displayName, logout, societaNome } = useAuth()
    const [openSessioni,    setOpenSessioni]    = useState(false)
    const [openAllenamenti, setOpenAllenamenti] = useState(false)

    const weekStart = useMemo(
      () => startOfWeek(new Date(), { weekStartsOn: 1 }),
      []
    )
    const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart])
    const weekStartStr = format(weekStart, 'yyyy-MM-dd')
    const weekEndStr   = format(weekEnd,   'yyyy-MM-dd')

    // ── Squadre assegnate al preparatore ──────────────────────────────────────
    const { data: squadreAssegnate = [] } = useQuery({
      queryKey: ['prep-squadre-mie', societaId, profile?.id],
      enabled: !!societaId && !!profile?.id,
      staleTime: 5 * 60_000,
      queryFn: async () => {
        const { data } = await supabase
          .from('prep_squadre').select('squadra')
          .eq('societa_id', societaId)
          .eq('preparatore_id', profile.id)
        return (data ?? []).map(r => r.squadra)
      },
    })

    // ── Sessioni atletica questa settimana ────────────────────────────────────
    const { data: sessioni = [], isLoading: loadingSessioni } = useQuery({
      queryKey: ['prep-home-sessioni', societaId, profile?.id, weekStartStr],
      enabled: !!societaId && !!profile?.id,
      staleTime: 30_000,
      queryFn: async () => {
        const { data } = await supabase
          .from('prep_sessioni')
          .select('id, squadra, data, quando, durata_min, su_campo, ora_inizio, note')
          .eq('societa_id', societaId)
          .eq('preparatore_id', profile.id)
          .gte('data', weekStartStr)
          .lte('data', weekEndStr)
          .order('data').order('ora_inizio')
        return data ?? []
      },
    })

    // ── Allenamenti squadre questa settimana ──────────────────────────────────
    const { data: weekData, isLoading: loadingAllenamenti } = useWeekEvents(weekStart)
    const allenamenti = useMemo(() => {
      if (!weekData?.events) return []
      return weekData.events.filter(e =>
        e._tipo === 'allenamento' &&
        !e.annullato &&
        (squadreAssegnate.length === 0 || squadreAssegnate.includes(e.squadra))
      )
    }, [weekData, squadreAssegnate])

    // ── Raggruppamento per data ───────────────────────────────────────────────
    const sessioniPerData = useMemo(() => {
      const map = {}
      for (const s of sessioni) {
        if (!map[s.data]) map[s.data] = []
        map[s.data].push(s)
      }
      return map
    }, [sessioni])

    const allenamentiPerData = useMemo(() => {
      const map = {}
      for (const e of allenamenti) {
        if (!map[e.data]) map[e.data] = []
        map[e.data].push(e)
      }
      return map
    }, [allenamenti])

    const isLoading = loadingSessioni || loadingAllenamenti
    const tuttoOk = sessioni.length === 0 && allenamenti.length === 0

    return (
      <div>
        <AppHeader
          title="Home"
          subtitle={societaNome ?? 'Preparatore atletico'}
          displayName={displayName}
          logout={logout}
          societaNome={societaNome}
        />

        {isLoading ? (
          <div className="pt-8"><LoadingSpinner /></div>
        ) : (
          <div className="px-4 pt-4 space-y-4 pb-24">

            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-2">
              <KpiCard
                label="Sessioni questa sett."
                value={sessioni.length}
                isOpen={openSessioni}
                onToggle={() => setOpenSessioni(v => !v)}
              />
              <KpiCard
                label="Allenamenti squadre"
                value={allenamenti.length}
                isOpen={openAllenamenti}
                onToggle={() => setOpenAllenamenti(v => !v)}
              />
            </div>

            {tuttoOk && (
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 flex items-center gap-2 text-sm text-green-600 shadow-sm">
                ✅ Nessuna sessione programmata questa settimana
              </div>
            )}

            {/* Sessioni espanse */}
            {openSessioni && sessioni.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2 px-1">
                  Sessioni atletica — settimana corrente
                </p>
                <div className="space-y-2">
                  {Object.entries(sessioniPerData).map(([data, items]) => (
                    <div key={data}>
                      <p className="text-xs font-medium text-gray-500 mb-1 px-1">
                        {format(new Date(data + 'T12:00:00'), 'EEEE d MMM', { locale: it })}
                      </p>
                      {items.map(s => (
                        <div key={s.id} className="bg-white rounded-xl border-l-4 border-amber-400 px-3 py-2.5 shadow-sm mb-1.5">
                          <p className="text-sm font-semibold text-gray-900">{s.squadra}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {QUANDO_LABEL[s.quando]}
                            {s.durata_min ? ` · ${s.durata_min} min` : ''}
                            {s.su_campo ? ' · ⚠ su campo' : ' · fuori campo'}
                            {s.quando === 'standalone' && s.ora_inizio ? ` · ${s.ora_inizio.slice(0, 5)}` : ''}
                          </p>
                          {s.note && <p className="text-xs text-gray-400 mt-0.5 italic">{s.note}</p>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Allenamenti espansi */}
            {openAllenamenti && allenamenti.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2 px-1">
                  Allenamenti squadre — settimana corrente
                </p>
                <div className="space-y-2">
                  {Object.entries(allenamentiPerData).map(([data, items]) => (
                    <div key={data}>
                      <p className="text-xs font-medium text-gray-500 mb-1 px-1">
                        {format(new Date(data + 'T12:00:00'), 'EEEE d MMM', { locale: it })}
                      </p>
                      {items.map((e, i) => (
                        <div key={`${e._source}-${e.id ?? i}`} className="bg-white rounded-xl border-l-4 border-blue-400 px-3 py-2.5 shadow-sm mb-1.5">
                          <p className="text-sm font-semibold text-gray-900">{e.squadra}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {String(e.ora_inizio ?? '').slice(0, 5)}–{String(e.ora_fine ?? '').slice(0, 5)}
                            {e.palestra ? ` · ${e.palestra}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2.2 — Commit**

  ```
  git add frontend/src/pages/prep/HomePrepPage.jsx
  git commit -m "feat: HomePrepPage — dashboard KPI sessioni e allenamenti per preparatore"
  ```

---

## Task 3: AgendaPrep — redesign compatta

**Files:**
- Modify: `frontend/src/pages/prep/AgendaPrep.jsx`

Sostituisce il layout card-based con il pattern compatto di `CalendarioGenitore`: cerchio data + giorno, sessioni indentate con bordo amber. Tutti i 7 giorni vengono mostrati (con `–` se vuoti).

- [ ] **Step 3.1 — Aggiorna le costanti e il render principale**

  Leggi il file completo. Poi sostituisci l'intera sezione di rendering del corpo (il blocco dopo `{/* Navigazione settimana */}`) con il nuovo layout compatto.

  La logica di business (queries, FAB, modal aggiunta) rimane invariata. Solo il rendering della lista cambia.

  Trova il blocco che inizia con `{isLoading ? <LoadingSpinner /> : (` e contiene il rendering dei giorni. Sostituisci SOLO quella sezione con:

  ```jsx
  {isLoading ? <LoadingSpinner /> : (
    <div className="space-y-1 pb-4">
      {giorni.map(({ str, label }) => {
        const daySessioni = sessioni.filter(s => s.data === str)
        const isToday = str === format(new Date(), 'yyyy-MM-dd')
        // Estrai giorno e nome da label (label = 'lun 2 giu')
        const dayNum = new Date(str + 'T12:00:00').getDate()

        return (
          <div key={str} className="mb-2">
            {/* Header giorno */}
            <div className={`flex items-center gap-2 mb-1.5 ${daySessioni.length === 0 ? 'opacity-40' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                isToday ? 'bg-amber-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}>
                {dayNum}
              </div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-amber-600' : 'text-gray-500'}`}>
                {label}
              </p>
              {isToday && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Oggi</span>
              )}
            </div>

            {/* Sessioni o placeholder */}
            {daySessioni.length === 0 ? (
              <div className="ml-10 text-xs text-gray-300 pb-1">–</div>
            ) : (
              <div className="ml-10 space-y-1.5">
                {daySessioni.map(s => (
                  <div key={s.id} className="border-l-4 border-amber-400 bg-white rounded-xl px-3 py-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">{s.squadra}</p>
                      <button
                        onClick={() => deleteMut.mutate(s.id)}
                        className="text-gray-300 hover:text-red-400 p-1 -mr-1 active:scale-90 transition-transform"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {QUANDO_LABEL[s.quando]}
                      {s.durata_min ? ` · ${s.durata_min} min` : ''}
                      {s.su_campo ? ' · ⚠ su campo' : ' · fuori campo'}
                      {s.quando === 'standalone' && s.ora_inizio ? ` · ${s.ora_inizio.slice(0, 5)}` : ''}
                    </p>
                    {s.note && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">{s.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {sessioni.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">Nessun turno questa settimana</p>
      )}
    </div>
  )}
  ```

  > **Nota:** `label` nell'array `giorni` attualmente è `format(d, 'EEE d MMM', { locale: it })` — es. "lun 2 giu". Per il cerchio usiamo `dayNum = new Date(str + 'T12:00:00').getDate()`. Se preferisci, puoi modificare il `label` in `giorni` per separare il numero dal nome del giorno.

  Aggiorna anche l'import di `X` se non è già presente — il file già lo importa da lucide-react.

- [ ] **Step 3.2 — Rimuovi `return null` per i giorni vuoti**

  Il vecchio codice aveva `if (daySessioni.length === 0) return null` per nascondere i giorni vuoti. Questo è già rimosso nel nuovo rendering — verifica che non rimanga nel file.

- [ ] **Step 3.3 — Commit**

  ```
  git add frontend/src/pages/prep/AgendaPrep.jsx
  git commit -m "feat: AgendaPrep — layout compatto stile CalendarioGenitore"
  ```

---

## Task 4: CalendarioPage — abilita modifica per preparatore

**Files:**
- Modify: `frontend/src/pages/CalendarioPage.jsx`

Attualmente `canModify = isAdmin || actingAsAllenatore`. Il preparatore su `/prep/calendario` non viene riconosciuto come modificatore. Fix: aggiungere `actingAsPrep`.

- [ ] **Step 4.1 — Aggiorna destructuring di useAuth**

  Trova la riga (circa 948):
  ```jsx
  const { user, isAdmin, isAllenatore, societaId, profile } = useAuth()
  ```

  Aggiungi `isPreparatore`:
  ```jsx
  const { user, isAdmin, isAllenatore, isPreparatore, societaId, profile } = useAuth()
  ```

- [ ] **Step 4.2 — Aggiungi actingAsPrep e aggiorna canModify**

  Trova la riga (circa 950):
  ```jsx
  const actingAsAllenatore = location.pathname.startsWith('/coach') && isAllenatore
  ```

  Aggiungi subito sotto:
  ```jsx
  const actingAsPrep = location.pathname.startsWith('/prep') && isPreparatore
  ```

  Trova la riga (circa 1197):
  ```jsx
  const canModify = isAdmin || actingAsAllenatore
  ```

  Sostituisci con:
  ```jsx
  const canModify = isAdmin || actingAsAllenatore || actingAsPrep
  ```

- [ ] **Step 4.3 — Aggiorna soloMieSquadre initial state**

  Trova la riga (circa 957):
  ```jsx
  const [soloMieSquadre, setSoloMieSquadre] = useState(!!actingAsAllenatore)
  ```

  Sostituisci con:
  ```jsx
  const [soloMieSquadre, setSoloMieSquadre] = useState(!!actingAsAllenatore || !!actingAsPrep)
  ```

- [ ] **Step 4.4 — Commit**

  ```
  git add frontend/src/pages/CalendarioPage.jsx
  git commit -m "fix: CalendarioPage abilita canModify per preparatore su /prep/calendario"
  ```

---

## Task 5: Build di verifica

- [ ] **Step 5.1 — Build senza errori**

  ```powershell
  cd frontend; npm run build 2>&1 | Select-Object -Last 10
  ```

  Atteso: `✓ built in X.XXs` — zero errori. Solo il warning pre-esistente sul chunk size è accettabile.

  Se ci sono errori di import (`HomePrepPage` non trovato, `CalendarioPage` importato due volte, ecc.), correggere e ripetere.

- [ ] **Step 5.2 — Push**

  ```
  git push origin master
  ```

---

## Self-review

### Spec coverage
| Requisito spec | Task |
|----------------|------|
| Home preparatore (dashboard KPI) | Task 2 ✅ |
| Sessioni settimana in home | Task 2 ✅ |
| Allenamenti squadre in home | Task 2 ✅ |
| Agenda compatta stile CalendarioGenitore | Task 3 ✅ |
| Tutti i giorni mostrati (anche vuoti con –) | Task 3 ✅ |
| Route /prep/agenda | Task 1 ✅ |
| Route /prep/calendario | Task 1 ✅ |
| PrepLayout con 4 voci | Task 1 ✅ |
| canModify per preparatore in CalendarioPage | Task 4 ✅ |

### Verifiche
- `HomePrepPage` usa `useWeekEvents` già importato/disponibile nell'app ✅
- `QUANDO_LABEL` è definito sia in `AgendaPrep` che in `HomePrepPage` (non shared, YAGNI) ✅
- `soloMieSquadre` inizializzato correttamente per prep ✅
- `CalendarioPage` import di `isPreparatore` da `useAuth` — già esposto da `useAuth.jsx` (riga 160: `isPreparatore: allRuoli.includes('preparatore_atletico')`) ✅
