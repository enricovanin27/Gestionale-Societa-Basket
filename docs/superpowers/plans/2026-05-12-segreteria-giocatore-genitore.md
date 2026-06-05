# Sessions 4+5 — Segreteria, Giocatore, Genitore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Segreteria Giocatori detail view (note/quote/cert tabs), Giocatore Home redesign (multi-squad + PALETTE + variazioni), Giocatore Comunicazioni page, and Genitore parity.

**Architecture:** SecretaryLayout loses Quote nav (quote moves inside GiocatoreDetail); new `note_giocatore` table for chronological notes; HomeGiocatore adopts HomeAllenatore dropdown pattern + PALETTE color system + "Variazioni settimana" derived from useWeekEvents `_source` field + separate annullati query; ComunicazioniPage shared between player and parent; HomeGenitore mirrors HomeGiocatore redesign.

**Tech Stack:** React 18, React Router v6, Supabase, @tanstack/react-query, Tailwind CSS v4, lucide-react, date-fns, PALETTE from `constants.js`

---

## File Map

**Create:**
- `supabase_migration_note_giocatore.sql`
- `frontend/src/pages/secretary/GiocatoriPage.jsx`
- `frontend/src/pages/secretary/GiocatoreDetail.jsx`
- `frontend/src/pages/player/ComunicazioniPage.jsx`

**Modify:**
- `frontend/src/layouts/SecretaryLayout.jsx` — remove Quote nav item (3 items total)
- `frontend/src/App.jsx` — secretary routes + player routes + parent routes
- `frontend/src/pages/player/HomeGiocatore.jsx` — full redesign: multi-squad, PALETTE, variazioni, dropdown
- `frontend/src/layouts/PlayerLayout.jsx` — replace Statistiche with Comunicazioni
- `frontend/src/pages/home/HomeGenitore.jsx` — PALETTE, variazioni, dropdown
- `frontend/src/layouts/ParentLayout.jsx` — add Comunicazioni (4 items)

---

### Task 1: SQL — note_giocatore table

**Files:**
- Create: `supabase_migration_note_giocatore.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase_migration_note_giocatore.sql
create table if not exists note_giocatore (
  id           uuid        primary key default gen_random_uuid(),
  societa_id   uuid        not null references societa(id) on delete cascade,
  giocatore_id uuid        not null references giocatori(id) on delete cascade,
  testo        text        not null,
  autore_nome  text        not null,
  autore_id    uuid        references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists note_giocatore_giocatore_idx on note_giocatore(giocatore_id);
create index if not exists note_giocatore_societa_idx   on note_giocatore(societa_id);

alter table note_giocatore enable row level security;

create policy "segreteria_can_manage_note"
  on note_giocatore
  for all
  to authenticated
  using (
    societa_id = (select societa_id from profili where id = auth.uid())
  )
  with check (
    societa_id = (select societa_id from profili where id = auth.uid())
  );
```

- [ ] **Step 2: Run migration in Supabase dashboard**

Open Supabase → SQL Editor → paste contents of `supabase_migration_note_giocatore.sql` → Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify table exists**

In Supabase Table Editor, confirm `note_giocatore` appears with columns: id, societa_id, giocatore_id, testo, autore_nome, autore_id, created_at.

- [ ] **Step 4: Commit**

```bash
git add supabase_migration_note_giocatore.sql
git commit -m "feat(db): add note_giocatore table with RLS"
```

---

### Task 2: Segreteria — GiocatoriPage + GiocatoreDetail + layout + routes

**Files:**
- Create: `frontend/src/pages/secretary/GiocatoriPage.jsx`
- Create: `frontend/src/pages/secretary/GiocatoreDetail.jsx`
- Modify: `frontend/src/layouts/SecretaryLayout.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create GiocatoriPage.jsx**

```jsx
// frontend/src/pages/secretary/GiocatoriPage.jsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight, ChevronLeft, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'N/D', cls: 'bg-gray-100 text-gray-500', urgente: false }
  const diff = differenceInDays(parseISO(dataScadenza), new Date())
  if (diff < 0)  return { label: 'Scaduto',    cls: 'bg-red-100 text-red-700',    urgente: true }
  if (diff < 30) return { label: `${diff}gg`,  cls: 'bg-orange-100 text-orange-700', urgente: true }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-green-100 text-green-700', urgente: false }
}

export default function GiocatoriPage() {
  const { societaId, displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()
  const [selectedSquadra, setSelectedSquadra] = useState(null)

  const { data: giocatori = [], isLoading } = useQuery({
    queryKey: ['segreteria-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, cert_medico_scadenza')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const squadre = useMemo(() => {
    const set = new Set()
    for (const g of giocatori) {
      if (g.squadra)  set.add(g.squadra)
      if (g.squadra2) set.add(g.squadra2)
      if (g.squadra3) set.add(g.squadra3)
    }
    return [...set].sort()
  }, [giocatori])

  const giocatoriFiltrati = useMemo(() => {
    if (!selectedSquadra) return []
    return giocatori.filter(g =>
      g.squadra === selectedSquadra || g.squadra2 === selectedSquadra || g.squadra3 === selectedSquadra
    )
  }, [giocatori, selectedSquadra])

  const header = (
    <AppHeader
      title="Giocatori"
      subtitle={selectedSquadra ? `${giocatoriFiltrati.length} atleti` : 'Seleziona una squadra'}
      displayName={displayName} logout={logout} societaNome={societaNome}
    />
  )

  if (isLoading) return <div>{header}<div className="pt-8"><LoadingSpinner /></div></div>

  if (selectedSquadra === null) {
    return (
      <div>
        {header}
        <div className="px-4 pt-4 space-y-2 pb-4">
          {squadre.map(s => {
            const count   = giocatori.filter(g => g.squadra === s || g.squadra2 === s || g.squadra3 === s).length
            const urgenti = giocatori.filter(g =>
              (g.squadra === s || g.squadra2 === s || g.squadra3 === s) &&
              certStatus(g.cert_medico_scadenza).urgente
            ).length
            return (
              <button
                key={s}
                onClick={() => setSelectedSquadra(s)}
                className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Users size={18} className="text-purple-600" strokeWidth={1.8} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s}</p>
                  <p className="text-xs text-gray-400">{count} atleti</p>
                </div>
                {urgenti > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                    {urgenti} cert
                  </span>
                )}
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
          {squadre.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-16">Nessun giocatore registrato</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}
      <div className="px-4 pt-3 pb-2">
        <button onClick={() => setSelectedSquadra(null)} className="flex items-center gap-1 text-sm text-purple-600 font-medium">
          <ChevronLeft size={16} /> Tutte le squadre
        </button>
      </div>
      <div className="px-4 space-y-2 pb-4">
        {giocatoriFiltrati.map(g => {
          const cert = certStatus(g.cert_medico_scadenza)
          return (
            <button
              key={g.id}
              onClick={() => navigate(`/secretary/giocatori/${g.id}`)}
              className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-purple-700">
                  {(g.cognome?.[0] ?? '')}{(g.nome?.[0] ?? '')}
                </span>
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{g.cognome} {g.nome}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${cert.cls}`}>
                {cert.label}
              </span>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </button>
          )
        })}
        {giocatoriFiltrati.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">Nessun giocatore in questa squadra</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create GiocatoreDetail.jsx**

```jsx
// frontend/src/pages/secretary/GiocatoreDetail.jsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, Send, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../../components/LoadingSpinner'

function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'Non registrato', cls: 'bg-gray-100 text-gray-500' }
  const diff = differenceInDays(parseISO(dataScadenza), new Date())
  if (diff < 0)  return { label: `Scaduto ${-diff}gg fa`, cls: 'bg-red-100 text-red-700' }
  if (diff < 30) return { label: `Scade in ${diff}gg`,    cls: 'bg-orange-100 text-orange-700' }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-green-100 text-green-700' }
}

const TABS = [
  { id: 'note',  label: 'Note' },
  { id: 'quote', label: 'Quote' },
  { id: 'cert',  label: 'Certificato' },
]

export default function GiocatoreDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { societaId, displayName } = useAuth()
  const qc = useQueryClient()
  const [activeTab, setActiveTab]   = useState('note')
  const [nuovaNota, setNuovaNota]   = useState('')
  const [editCert, setEditCert]     = useState(false)
  const [certInput, setCertInput]   = useState('')

  const { data: giocatore, isLoading: loadingG } = useQuery({
    queryKey: ['giocatore-detail', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, cert_medico_scadenza')
        .eq('id', id)
        .single()
      return data
    },
  })

  const { data: note = [], isLoading: loadingNote } = useQuery({
    queryKey: ['note-giocatore', id],
    enabled: !!id && activeTab === 'note',
    queryFn: async () => {
      const { data } = await supabase
        .from('note_giocatore')
        .select('id, testo, autore_nome, created_at')
        .eq('giocatore_id', id)
        .order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const { data: quote = [], isLoading: loadingQ } = useQuery({
    queryKey: ['quote-giocatore', id],
    enabled: !!id && activeTab === 'quote',
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, tipo, descrizione, importo, data_scadenza, pagato')
        .eq('giocatore_id', id)
        .order('data_scadenza')
      return data ?? []
    },
  })

  const addNotaMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('note_giocatore').insert([{
        societa_id:   societaId,
        giocatore_id: id,
        testo:        nuovaNota.trim(),
        autore_nome:  displayName,
      }])
      if (error) throw error
    },
    onSuccess: () => {
      setNuovaNota('')
      qc.invalidateQueries({ queryKey: ['note-giocatore', id] })
    },
  })

  const certMut = useMutation({
    mutationFn: async (cert_medico_scadenza) => {
      const { error } = await supabase
        .from('giocatori').update({ cert_medico_scadenza }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditCert(false)
      qc.invalidateQueries({ queryKey: ['giocatore-detail', id] })
      qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
    },
  })

  if (loadingG) return <div className="pt-8"><LoadingSpinner /></div>
  if (!giocatore) return <div className="px-4 pt-8 text-center text-sm text-gray-400">Giocatore non trovato</div>

  const squadre = [giocatore.squadra, giocatore.squadra2, giocatore.squadra3].filter(Boolean)
  const cert = certStatus(giocatore.cert_medico_scadenza)

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-purple-800 to-purple-600 text-white px-4 pt-10 pb-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-purple-200 mb-3">
          <ChevronLeft size={16} /> Giocatori
        </button>
        <h1 className="text-2xl font-bold">{giocatore.cognome} {giocatore.nome}</h1>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {squadre.map(s => (
            <span key={s} className="text-xs bg-purple-700 text-purple-100 px-2 py-0.5 rounded-full">{s}</span>
          ))}
        </div>
      </div>

      <div className="bg-white border-b flex sticky top-0 z-10">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === t.id ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 py-4 pb-24">
        {/* ── NOTE ── */}
        {activeTab === 'note' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <textarea
                value={nuovaNota}
                onChange={e => setNuovaNota(e.target.value)}
                placeholder="Es. Avvisato per mail il 03/04 — rinnovo certificato..."
                rows={3}
                className="w-full text-sm border-0 outline-none resize-none text-gray-700 placeholder-gray-300"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => addNotaMut.mutate()}
                  disabled={!nuovaNota.trim() || addNotaMut.isPending}
                  className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 active:scale-95 transition-transform"
                >
                  <Send size={12} /> Salva nota
                </button>
              </div>
            </div>
            {loadingNote ? <LoadingSpinner /> : note.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Nessuna nota registrata</p>
            ) : (
              note.map(n => (
                <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-800 leading-relaxed">{n.testo}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {n.autore_nome} · {format(parseISO(n.created_at), 'd MMM yyyy, HH:mm', { locale: it })}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── QUOTE ── */}
        {activeTab === 'quote' && (
          <div className="space-y-2">
            {loadingQ ? <LoadingSpinner /> : quote.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Nessuna quota registrata</p>
            ) : (
              quote.map(q => (
                <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{q.descrizione || q.tipo}</p>
                    {q.data_scadenza && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Scadenza: {format(parseISO(q.data_scadenza), 'd MMM yyyy', { locale: it })}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {q.importo != null && <p className="text-sm font-bold text-gray-900">€{q.importo}</p>}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      q.pagato ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {q.pagato ? 'Pagato' : 'Da pagare'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── CERT ── */}
        {activeTab === 'cert' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">Stato certificato medico</p>
              <span className={`text-sm px-3 py-1 rounded-full font-semibold ${cert.cls}`}>
                {cert.label}
              </span>
              {!editCert ? (
                <button
                  onClick={() => { setEditCert(true); setCertInput(giocatore.cert_medico_scadenza ?? '') }}
                  className="mt-4 flex items-center gap-1.5 text-sm text-purple-600 font-medium"
                >
                  <Plus size={14} /> {giocatore.cert_medico_scadenza ? 'Aggiorna data' : 'Inserisci data'}
                </button>
              ) : (
                <div className="mt-4 space-y-2">
                  <label className="text-xs text-gray-500">Nuova scadenza</label>
                  <input
                    type="date"
                    value={certInput}
                    onChange={e => setCertInput(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => certMut.mutate(certInput || null)}
                      disabled={certMut.isPending}
                      className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                    >
                      Salva
                    </button>
                    <button
                      onClick={() => setEditCert(false)}
                      className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-500"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update SecretaryLayout.jsx — remove Quote**

In `frontend/src/layouts/SecretaryLayout.jsx`:
- Change import from `import { LayoutDashboard, Users, CreditCard, Bell } from 'lucide-react'` to `import { LayoutDashboard, Users, Bell } from 'lucide-react'`
- Remove the entire `<NavLink to="/secretary/quote" ...>` block

Full file after change:

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Bell } from 'lucide-react'
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

- [ ] **Step 4: Update App.jsx — secretary routes**

In `frontend/src/App.jsx`:

Add imports (after existing secretary imports):
```jsx
import GiocatoriPage   from './pages/secretary/GiocatoriPage'
import GiocatoreDetail from './pages/secretary/GiocatoreDetail'
```

Replace the secretary route block:
```jsx
{/* ── Segreteria ───────────────────────────────── */}
<Route path="/secretary" element={<ProtectedRoute requiredRole="segreteria"><SecretaryLayout /></ProtectedRoute>}>
  <Route index                  element={<SegreteriaDashboard />} />
  <Route path="giocatori"       element={<GiocatoriPage />} />
  <Route path="giocatori/:id"   element={<GiocatoreDetail />} />
  <Route path="bacheca"         element={<BachecaPage />} />
  <Route path="quote"           element={<Navigate to="/secretary/giocatori" replace />} />
</Route>
```

Note: keep `import SegreteriePage` only if still referenced elsewhere; otherwise remove it. Check with grep first.

- [ ] **Step 5: Verify no remaining SegreteriePage references**

```bash
grep -r "SegreteriePage" frontend/src
```

If only in App.jsx imports with no route using it, remove the import.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/secretary/GiocatoriPage.jsx
git add frontend/src/pages/secretary/GiocatoreDetail.jsx
git add frontend/src/layouts/SecretaryLayout.jsx
git add frontend/src/App.jsx
git commit -m "feat(secretary): Giocatori list/detail with note, quote, cert tabs; remove Quote from nav"
```

---

### Task 3: Giocatore — HomeGiocatore redesign

**Files:**
- Modify: `frontend/src/pages/player/HomeGiocatore.jsx`

Full rewrite of HomeGiocatore.jsx:

- [ ] **Step 1: Replace HomeGiocatore.jsx**

```jsx
// frontend/src/pages/player/HomeGiocatore.jsx
import { useState, useMemo, useRef } from 'react'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatDate, isDateToday } from '../../lib/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { PALETTE } from '../../lib/constants'

export default function HomeGiocatore() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()
  const [weekOffset,     setWeekOffset]     = useState(0)
  const [selectedSquadra, setSelectedSquadra] = useState('')
  const touchStartX = useRef(null)

  const today      = new Date()
  const mySquadre  = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)
  const colorMap   = Object.fromEntries(mySquadre.map((s, i) => [s.toLowerCase(), PALETTE[i % PALETTE.length]]))

  const thisWeekStart = useMemo(
    () => startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )
  const nextWeekStart = useMemo(() => addWeeks(thisWeekStart, 1), [thisWeekStart])

  const { data: thisWeekData, isLoading: l1 } = useWeekEvents(thisWeekStart)
  const { data: nextWeekData, isLoading: l2 } = useWeekEvents(nextWeekStart)

  const thisWeekStr = format(thisWeekStart, 'yyyy-MM-dd')
  const endDateStr  = format(addDays(thisWeekStart, 13), 'yyyy-MM-dd')
  const squadreFiltro = selectedSquadra ? [selectedSquadra] : mySquadre

  const { data: annullati = [] } = useQuery({
    queryKey: ['annullati-player', societaId, thisWeekStr, endDateStr, squadreFiltro.join(',')],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      if (!squadreFiltro.length) return []
      const { data } = await supabase
        .from('orario_settimana')
        .select('id, squadra, data, ora_inizio, ora_fine')
        .eq('societa_id', societaId)
        .eq('annullato', true)
        .gte('data', thisWeekStr)
        .lte('data', endDateStr)
        .in('squadra', squadreFiltro)
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  function filterMine(events) {
    return (events ?? []).filter(e =>
      !e.annullato &&
      squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
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
  }, [thisWeekData, nextWeekData, selectedSquadra, mySquadre.join(','), thisWeekStart])

  const variazioni = useMemo(() => {
    const allEvents = [
      ...(thisWeekData?.events ?? []),
      ...(nextWeekData?.events ?? []),
    ].filter(e => squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase()))
    return {
      spostati:      allEvents.filter(e => e._source === 'override'),
      aggiunti:      allEvents.filter(e => e._source === 'extra'),
      annullatiList: annullati,
    }
  }, [thisWeekData, nextWeekData, annullati, selectedSquadra, mySquadre.join(',')])

  const hasVariazioni = variazioni.spostati.length > 0 || variazioni.aggiunti.length > 0 || variazioni.annullatiList.length > 0

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

  if (!mySquadre.length) {
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
        subtitle={mySquadre.join(' · ')}
        displayName={displayName} logout={logout} societaNome={societaNome}
      >
        {mySquadre.length > 1 && (
          <div className="mt-3">
            <select
              value={selectedSquadra}
              onChange={e => setSelectedSquadra(e.target.value)}
              className="w-full bg-blue-700 text-white border border-blue-400 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Tutte le squadre</option>
              {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </AppHeader>

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
          {hasVariazioni && (
            <div className="mx-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-2">📌 Variazioni settimana</p>
              {variazioni.annullatiList.map(v => (
                <div key={v.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-red-600">Annullato</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.spostati.map(v => (
                <div key={`s-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-yellow-700">Spostato</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.aggiunti.map(v => (
                <div key={`a-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-green-700">Aggiunto</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {agendaDays.map(({ dateStr, events }) => {
            const isToday = isDateToday(dateStr)
            const label   = formatDate(dateStr, 'EEEE d MMMM')
            return (
              <section key={dateStr}>
                <div className="px-4 mb-2 flex items-center gap-2">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-blue-700' : 'text-gray-400'}`}>
                    {label}
                  </span>
                  {isToday && <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">oggi</span>}
                </div>
                {events.length === 0 ? (
                  <div className="mx-4 text-sm text-gray-300 py-1">–</div>
                ) : (
                  <div className="px-4 space-y-2">
                    {events.map((e, i) => (
                      <EventCardPlayer key={`${e._source ?? 'e'}-${e.id ?? i}`} event={e} colorMap={colorMap} />
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

function EventCardPlayer({ event, colorMap }) {
  const isPartita = event._tipo === 'partita'
  const isCasa    = (event.casa_fuori ?? '').toLowerCase() === 'casa'
  const pal       = colorMap[(event.squadra ?? '').toLowerCase()] ?? PALETTE[0]

  const borderCls = isPartita ? pal.gameBorder : pal.border
  const bgCls     = isPartita ? pal.gameBg     : pal.bg
  const labelCls  = isPartita
    ? event.stato === 'provvisoria' ? 'bg-yellow-100 text-yellow-700'
      : isCasa ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
    : `${pal.bg} ${pal.title}`
  const label = isPartita
    ? event.stato === 'provvisoria' ? '⚠️ Provvisoria'
      : isCasa ? '🏠 Casa' : '✈️ Trasferta'
    : 'Allenamento'

  return (
    <div className={`rounded-xl border-l-4 ${borderCls} ${bgCls} px-4 py-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${pal.title}`}>
            {isPartita && event.avversario ? `vs ${event.avversario}` : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-500">
            {event.ora_inizio && <span className="font-medium text-gray-700">{event.ora_inizio.slice(0,5)}–{event.ora_fine?.slice(0,5)}</span>}
            {event.palestra && <span>{event.palestra}</span>}
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${labelCls}`}>
          {label}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/player/HomeGiocatore.jsx
git commit -m "feat(player): HomeGiocatore — multi-squad, PALETTE colors, variazioni section, squad dropdown"
```

---

### Task 4: Giocatore — ComunicazioniPage + PlayerLayout + App.jsx

**Files:**
- Create: `frontend/src/pages/player/ComunicazioniPage.jsx`
- Modify: `frontend/src/layouts/PlayerLayout.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create ComunicazioniPage.jsx**

```jsx
// frontend/src/pages/player/ComunicazioniPage.jsx
import { useState } from 'react'
import { Send, MessageCircle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { API_BASE } from '../../lib/constants'
import AppHeader from '../../components/AppHeader'

export default function ComunicazioniPage() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()
  const [testo,   setTesto]   = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState(null)

  const mySquadre = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)

  async function handleSend() {
    if (!testo.trim() || !mySquadre.length) return
    setSending(true)
    setError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await Promise.all(
        mySquadre.map(squadra =>
          fetch(`${API_BASE}/api/notifica/allenamento`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              squadra,
              societa_id: societaId,
              data:       today,
              titolo:     `Messaggio da ${displayName}`,
              corpo:      testo.trim(),
            }),
          })
        )
      )
      setSent(true)
      setTesto('')
    } catch {
      setError("Errore durante l'invio. Riprova.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <AppHeader
        title="Comunicazioni"
        subtitle="Scrivi al tuo allenatore"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />
      <div className="px-4 pt-6 space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle size={16} className="text-blue-600" />
            <p className="text-sm font-semibold text-gray-800">Invia un messaggio</p>
          </div>
          {mySquadre.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
              ⚠️ Nessuna squadra associata. Contatta l'amministratore.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">Destinatari: {mySquadre.join(', ')}</p>
              <textarea
                value={testo}
                onChange={e => { setTesto(e.target.value); setSent(false) }}
                placeholder="Scrivi il tuo messaggio all'allenatore..."
                rows={5}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
              {sent  && <p className="text-xs text-green-600 mt-1 font-medium">✓ Messaggio inviato!</p>}
              <button
                onClick={handleSend}
                disabled={!testo.trim() || sending}
                className="mt-3 w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
              >
                <Send size={14} /> {sending ? 'Invio...' : 'Invia messaggio'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update PlayerLayout.jsx — replace Statistiche with Comunicazioni**

Full file:

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { Home, MessageCircle, Bell } from 'lucide-react'
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
          <NavLink to="/player/comunicazioni" className={cls}>
            <MessageCircle size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Comunicazioni</span>
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

- [ ] **Step 3: Update App.jsx — player routes**

Add import:
```jsx
import ComunicazioniPage from './pages/player/ComunicazioniPage'
```

Remove import of `StatisticheGiocatore` (no longer used).

Replace player route block:
```jsx
{/* ── Giocatore ────────────────────────────────── */}
<Route path="/player" element={<ProtectedRoute requiredRole="giocatore"><PlayerLayout /></ProtectedRoute>}>
  <Route index                  element={<HomeGiocatore />} />
  <Route path="comunicazioni"   element={<ComunicazioniPage />} />
  <Route path="bacheca"         element={<BachecaPage />} />
  <Route path="statistiche"     element={<Navigate to="/player/comunicazioni" replace />} />
</Route>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/player/ComunicazioniPage.jsx
git add frontend/src/layouts/PlayerLayout.jsx
git add frontend/src/App.jsx
git commit -m "feat(player): ComunicazioniPage replaces Statistiche; update nav and routes"
```

---

### Task 5: ⚠️ PAUSA — proposta opzioni Calendario Giocatore

**STOP — non implementare oltre questo punto senza conferma dell'utente.**

Presentare all'utente queste 3 opzioni:

> **Opzione A — Nessun calendario separato**
> La Home già mostra 14 giorni con navigazione settimana per settimana. Aggiungere un tab Calendario duplicherebbe la stessa informazione. Si rimuove la voce dal nav se presente.
>
> **Opzione B — Calendario mensile (solo partite)**
> Un tab Calendario mostra una griglia mensile solo con le partite, come in Admin/Allenatore. Complementare alla Home che mostra allenamenti e partite in formato lista. Non c'è duplicazione perché la Home è lista mentre questo è griglia mensile con solo partite.
>
> **Opzione C — Vista settimana completa (year-round)**
> Un tab Calendario mostra la stessa GrigliaSettimanale di Admin/Allenatore con tutte le settimane dell'anno navigabili. Complementare alla Home perché la Home è limitata a 14 giorni dal presente mentre il calendario permette di vedere settimane passate e future. Filtrato per le squadre del giocatore.

Aspettare la scelta dell'utente prima di procedere con i task successivi.

---

### Task 6: Genitore — HomeGenitore redesign + Comunicazioni + layout + routes

**Files:**
- Modify: `frontend/src/pages/home/HomeGenitore.jsx`
- Modify: `frontend/src/layouts/ParentLayout.jsx`
- Modify: `frontend/src/App.jsx`

Note: `ComunicazioniPage` già creata in Task 4 (`frontend/src/pages/player/ComunicazioniPage.jsx`) — il ruolo genitore la usa identica, lo stesso componente funziona perché legge `profile.squadra/2/3` che è presente anche per genitore.

- [ ] **Step 1: Rewrite HomeGenitore.jsx**

```jsx
// frontend/src/pages/home/HomeGenitore.jsx
import { useState, useMemo, useRef } from 'react'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatDate, isDateToday } from '../../lib/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { PALETTE } from '../../lib/constants'

export default function HomeGenitore() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()
  const [weekOffset,      setWeekOffset]      = useState(0)
  const [selectedSquadra, setSelectedSquadra] = useState('')
  const touchStartX = useRef(null)

  const today     = new Date()
  const mySquadre = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)
  const colorMap  = Object.fromEntries(mySquadre.map((s, i) => [s.toLowerCase(), PALETTE[i % PALETTE.length]]))

  const thisWeekStart = useMemo(
    () => startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )
  const nextWeekStart = useMemo(() => addWeeks(thisWeekStart, 1), [thisWeekStart])

  const { data: thisWeekData, isLoading: l1 } = useWeekEvents(thisWeekStart)
  const { data: nextWeekData, isLoading: l2 } = useWeekEvents(nextWeekStart)

  const thisWeekStr   = format(thisWeekStart, 'yyyy-MM-dd')
  const endDateStr    = format(addDays(thisWeekStart, 13), 'yyyy-MM-dd')
  const squadreFiltro = selectedSquadra ? [selectedSquadra] : mySquadre

  const { data: annullati = [] } = useQuery({
    queryKey: ['annullati-parent', societaId, thisWeekStr, endDateStr, squadreFiltro.join(',')],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      if (!squadreFiltro.length) return []
      const { data } = await supabase
        .from('orario_settimana')
        .select('id, squadra, data, ora_inizio, ora_fine')
        .eq('societa_id', societaId)
        .eq('annullato', true)
        .gte('data', thisWeekStr)
        .lte('data', endDateStr)
        .in('squadra', squadreFiltro)
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  function filterMine(events) {
    return (events ?? []).filter(e =>
      !e.annullato &&
      squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
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
  }, [thisWeekData, nextWeekData, selectedSquadra, mySquadre.join(','), thisWeekStart])

  const variazioni = useMemo(() => {
    const allEvents = [
      ...(thisWeekData?.events ?? []),
      ...(nextWeekData?.events ?? []),
    ].filter(e => squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase()))
    return {
      spostati:      allEvents.filter(e => e._source === 'override'),
      aggiunti:      allEvents.filter(e => e._source === 'extra'),
      annullatiList: annullati,
    }
  }, [thisWeekData, nextWeekData, annullati, selectedSquadra, mySquadre.join(',')])

  const hasVariazioni = variazioni.spostati.length > 0 || variazioni.aggiunti.length > 0 || variazioni.annullatiList.length > 0

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

  if (!mySquadre.length) {
    return (
      <div className="pb-20">
        <AppHeader title="Ciao!" subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Nessuna squadra assegnata. Contatta l'amministratore.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <AppHeader
        title={`Ciao, ${displayName}! 👋`}
        subtitle={mySquadre.length === 1 ? `La tua squadra: ${mySquadre[0]}` : `Le tue squadre: ${mySquadre.join(' · ')}`}
        displayName={displayName} logout={logout} societaNome={societaNome}
      >
        {mySquadre.length > 1 && (
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
      </AppHeader>

      <div className="bg-white border-b px-4 py-2 flex items-center justify-between"
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <button onClick={() => setWeekOffset(w => w - 2)}
          className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-800">{weekLabel}</div>
          {weekOffset === 0 && <div className="text-xs text-amber-600 font-medium">Prossimi 14 giorni</div>}
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
          {hasVariazioni && (
            <div className="mx-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-2">📌 Variazioni settimana</p>
              {variazioni.annullatiList.map(v => (
                <div key={v.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-red-600">Annullato</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.spostati.map(v => (
                <div key={`s-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-yellow-700">Spostato</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.aggiunti.map(v => (
                <div key={`a-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-green-700">Aggiunto</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {agendaDays.map(({ dateStr, events }) => {
            const isToday = isDateToday(dateStr)
            const label   = formatDate(dateStr, 'EEEE d MMMM')
            return (
              <section key={dateStr}>
                <div className="px-4 mb-2 flex items-center gap-2">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-amber-700' : 'text-gray-400'}`}>
                    {label}
                  </span>
                  {isToday && <span className="text-[9px] bg-amber-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">oggi</span>}
                </div>
                {events.length === 0 ? (
                  <div className="mx-4 text-sm text-gray-300 py-1">–</div>
                ) : (
                  <div className="px-4 space-y-2">
                    {events.map((e, i) => (
                      <EventCardParent key={`${e._source ?? 'e'}-${e.id ?? i}`} event={e} colorMap={colorMap} />
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

function EventCardParent({ event, colorMap }) {
  const isPartita = event._tipo === 'partita'
  const isCasa    = (event.casa_fuori ?? '').toLowerCase() === 'casa'
  const pal       = colorMap[(event.squadra ?? '').toLowerCase()] ?? PALETTE[0]

  const borderCls = isPartita ? pal.gameBorder : pal.border
  const bgCls     = isPartita ? pal.gameBg     : pal.bg
  const labelCls  = isPartita
    ? event.stato === 'provvisoria' ? 'bg-yellow-100 text-yellow-700'
      : isCasa ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
    : `${pal.bg} ${pal.title}`
  const label = isPartita
    ? event.stato === 'provvisoria' ? '⚠️ Provvisoria'
      : isCasa ? '🏠 Casa' : '✈️ Trasferta'
    : 'Allenamento'

  return (
    <div className={`rounded-xl border-l-4 ${borderCls} ${bgCls} px-4 py-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${pal.title}`}>
            {isPartita && event.avversario ? `vs ${event.avversario}` : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-500">
            {event.ora_inizio && <span className="font-medium text-gray-700">{event.ora_inizio.slice(0,5)}–{event.ora_fine?.slice(0,5)}</span>}
            {event.palestra && <span>{event.palestra}</span>}
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${labelCls}`}>
          {label}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update ParentLayout.jsx — add Comunicazioni (4 items)**

Full file:

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { Home, MessageCircle, DollarSign, Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl min-w-[48px] ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function ParentLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/parent" end className={cls}>
            <Home size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Home</span>
          </NavLink>
          <NavLink to="/parent/comunicazioni" className={cls}>
            <MessageCircle size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Comunica</span>
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

- [ ] **Step 3: Update App.jsx — parent routes**

Add `comunicazioni` route to parent block:
```jsx
{/* ── Genitore ─────────────────────────────────── */}
<Route path="/parent" element={<ProtectedRoute requiredRole="genitore"><ParentLayout /></ProtectedRoute>}>
  <Route index                element={<HomeGenitore />} />
  <Route path="comunicazioni" element={<ComunicazioniPage />} />
  <Route path="bacheca"       element={<BachecaPage />} />
  <Route path="quote"         element={<QuoteGenitore />} />
</Route>
```

Note: `ComunicazioniPage` import is already present from Task 4.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/home/HomeGenitore.jsx
git add frontend/src/layouts/ParentLayout.jsx
git add frontend/src/App.jsx
git commit -m "feat(parent): HomeGenitore — PALETTE colors, variazioni, squad dropdown; add Comunicazioni tab"
```

---

## Self-Review

**Spec coverage:**
- ✅ Segreteria: Quote rimossa dal nav; Giocatori = lista squadre → lista giocatori → dettaglio con 3 tab (Note, Quote, Cert Medico)
- ✅ Segreteria: Bacheca identica ad Admin (canWrite = isAdmin || isAllenatore || isSegreteria — già in BachecaPage, nessuna modifica necessaria)
- ✅ Giocatore Home: multi-squad dropdown, PALETTE, variazioni (spostato/annullato/aggiunto), week nav
- ✅ Giocatore Comunicazioni: campo testo + notifica allenatore via POST API
- ✅ Giocatore Calendario: ⚠️ PAUSA — 3 opzioni proposte, attesa conferma
- ✅ Giocatore Bacheca: già read-only (canWrite=false), nessuna modifica necessaria
- ✅ Genitore: clone di Giocatore + Quote tab esistente

**Placeholder scan:** Nessun "TODO", "TBD", "implement later" nel piano.

**Type consistency:**
- `certStatus()` definita separatamente in GiocatoriPage e GiocatoreDetail (locale a ciascun file, evita import circolare)
- `EventCardPlayer` (player) e `EventCardParent` (parent) — stessa struttura, nomi separati per chiarezza
- `PALETTE` importata da `../../lib/constants` in tutti e due i file home
- `annullati` query key: `'annullati-player'` vs `'annullati-parent'` per evitare collisioni cache
