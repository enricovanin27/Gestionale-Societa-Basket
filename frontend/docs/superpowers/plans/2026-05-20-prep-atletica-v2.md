# Preparazione Atletica V2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridisegnare il modulo Preparazione Atletica: 3 tab (Agenda · Stato · Schede), turni del preparatore come oggetto gestionale, schede assegnabili a squadra o giocatore.

**Architecture:** Migration V2 rimuove 7 tabelle e aggiunge prep_squadre + prep_sessioni. PrepLayout scende da 7 a 3 tab. EventForm riceve la sezione "parte atletica". 6 vecchie pagine prep vengono eliminate.

**Tech Stack:** React 19 + React Router v7 + TanStack Query v5 + Supabase JS v2 + TailwindCSS v4 + Lucide React + date-fns v4

---

## File Structure

```
CREARE:
  supabase/migrations/supabase_migration_prep_v2.sql
  frontend/src/pages/prep/AgendaPrep.jsx
  frontend/src/pages/prep/StatoPage.jsx
  frontend/src/components/PrepSesioneInlineForm.jsx

RISCRIVERE:
  frontend/src/pages/prep/SchedeAtletichePage.jsx
  frontend/src/layouts/PrepLayout.jsx

MODIFICARE:
  frontend/src/App.jsx
  frontend/src/pages/SetupPage.jsx
  frontend/src/pages/admin/SetupMenu.jsx
  frontend/src/pages/CalendarioPage.jsx       (EventForm + badge admin)
  frontend/src/pages/coach/AtleticaCoach.jsx
  frontend/src/pages/player/HomeGiocatore.jsx

ELIMINARE:
  frontend/src/pages/prep/HomePrep.jsx
  frontend/src/pages/prep/InfortuniPage.jsx
  frontend/src/pages/prep/CarichiPage.jsx
  frontend/src/pages/prep/TestFisiciPage.jsx
  frontend/src/pages/prep/AntropometriaPage.jsx
  frontend/src/pages/prep/SpaziPage.jsx
```

---

## Task 1: SQL Migration V2

**Files:**
- Create: `supabase/migrations/supabase_migration_prep_v2.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- ============================================================
-- MIGRATION V2: Preparazione Atletica — Redesign Gestionale
-- ============================================================

-- 1. Rimuovi tabelle non più necessarie
DROP TABLE IF EXISTS test_programmati CASCADE;
DROP TABLE IF EXISTS test_risultati CASCADE;
DROP TABLE IF EXISTS test_definizioni CASCADE;
DROP TABLE IF EXISTS antropometria CASCADE;
DROP TABLE IF EXISTS spazi_orario_settimana CASCADE;
DROP TABLE IF EXISTS spazi_orario_fisso CASCADE;
DROP TABLE IF EXISTS spazi_atletici CASCADE;

-- 2. Tabella: associazione preparatore ↔ squadre (admin la configura)
CREATE TABLE IF NOT EXISTS prep_squadre (
  id              SERIAL PRIMARY KEY,
  preparatore_id  UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  squadra         TEXT  NOT NULL,
  societa_id      UUID  NOT NULL REFERENCES societa(id),
  UNIQUE (preparatore_id, squadra, societa_id)
);
ALTER TABLE prep_squadre ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prep_squadre_admin_all" ON prep_squadre FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND ruolo IN ('admin','super_admin') AND societa_id = prep_squadre.societa_id
  ));
CREATE POLICY "prep_squadre_prep_read" ON prep_squadre FOR SELECT TO authenticated
  USING (preparatore_id = auth.uid());
CREATE POLICY "prep_squadre_coach_read" ON prep_squadre FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND (ruolo = 'allenatore' OR 'allenatore' = ANY(ruoli_extra))
      AND societa_id = prep_squadre.societa_id
  ));

-- 3. Tabella: turni del preparatore (legati a un allenamento o standalone)
CREATE TABLE IF NOT EXISTS prep_sessioni (
  id              SERIAL PRIMARY KEY,
  societa_id      UUID    NOT NULL REFERENCES societa(id),
  preparatore_id  UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  squadra         TEXT    NOT NULL,
  data            DATE    NOT NULL,
  ora_inizio      TIME    NOT NULL DEFAULT '00:00',
  durata_min      INTEGER NOT NULL DEFAULT 30,
  quando          TEXT    NOT NULL DEFAULT 'standalone'
                  CHECK (quando IN ('prima','durante','dopo','standalone')),
  su_campo        BOOLEAN NOT NULL DEFAULT FALSE,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE prep_sessioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prep_sessioni_prep_all" ON prep_sessioni FOR ALL TO authenticated
  USING (preparatore_id = auth.uid());
CREATE POLICY "prep_sessioni_admin_read" ON prep_sessioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND ruolo IN ('admin','super_admin') AND societa_id = prep_sessioni.societa_id
  ));
CREATE POLICY "prep_sessioni_coach_read" ON prep_sessioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.ruolo = 'allenatore' OR 'allenatore' = ANY(p.ruoli_extra))
      AND p.societa_id = prep_sessioni.societa_id
      AND (p.squadra = prep_sessioni.squadra
           OR p.squadra2 = prep_sessioni.squadra
           OR p.squadra3 = prep_sessioni.squadra)
  ));
```

- [ ] **Step 2: Esegui sul Supabase SQL Editor**

Apri Supabase Dashboard → SQL Editor → incolla il file → Run.
Verifica che non ci siano errori. Le tabelle `prep_squadre` e `prep_sessioni` devono apparire in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/supabase_migration_prep_v2.sql
git commit -m "feat: migration prep v2 — drop 7 tabelle, add prep_squadre + prep_sessioni"
```

---

## Task 2: Routing Cleanup + PrepLayout 3 tab

**Files:**
- Modify: `frontend/src/layouts/PrepLayout.jsx`
- Modify: `frontend/src/App.jsx`
- Delete: 6 file pagine prep vecchie

- [ ] **Step 1: Riscrivi PrepLayout.jsx**

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { Calendar, Activity, BookOpen } from 'lucide-react'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function PrepLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-4">
          <NavLink to="/prep" end className={cls}>
            <Calendar size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Agenda</span>
          </NavLink>
          <NavLink to="/prep/stato" className={cls}>
            <Activity size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Stato</span>
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

- [ ] **Step 2: Aggiorna le route prep in App.jsx**

Trova il blocco route `/prep` e sostituiscilo con:

```jsx
import AgendaPrep from './pages/prep/AgendaPrep'
import StatoPage from './pages/prep/StatoPage'
import SchedeAtletichePage from './pages/prep/SchedeAtletichePage'
```

```jsx
{/* -- Preparatore Atletico -------------------------------- */}
<Route path="/prep" element={<ProtectedRoute requiredRole="preparatore_atletico"><PrepLayout /></ProtectedRoute>}>
  <Route index          element={<AgendaPrep />} />
  <Route path="stato"   element={<StatoPage />} />
  <Route path="schede"  element={<SchedeAtletichePage />} />
</Route>
```

Rimuovi gli import delle pagine vecchie (`HomePrep`, `InfortuniPage`, `TestFisiciPage`, `AntropometriaPage`, `SpaziPage`, `CarichiPage`).

- [ ] **Step 3: Elimina i file vecchi**

```bash
cd frontend/src/pages/prep
rm HomePrep.jsx InfortuniPage.jsx CarichiPage.jsx TestFisiciPage.jsx AntropometriaPage.jsx SpaziPage.jsx
```

- [ ] **Step 4: Verifica build**

```bash
cd frontend && npm run build
```

Atteso: build completata senza errori (le nuove pagine non esistono ancora → aggiungi file placeholder temporanei se la build fallisce per import mancanti).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/layouts/PrepLayout.jsx frontend/src/App.jsx
git commit -m "feat: PrepLayout 3 tab + routing prep v2, rimozione pagine obsolete"
```

---

## Task 3: AgendaPrep.jsx — Agenda settimanale turni

**Files:**
- Create: `frontend/src/pages/prep/AgendaPrep.jsx`

- [ ] **Step 1: Crea il componente**

```jsx
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { it } from 'date-fns/locale'
import { Plus, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const QUANDO_LABEL = { prima: 'Prima', durante: 'Durante', dopo: 'Dopo', standalone: 'Sessione libera' }
const QUANDO_COLOR = {
  prima:      'bg-blue-100 text-blue-800',
  durante:    'bg-amber-100 text-amber-800',
  dopo:       'bg-purple-100 text-purple-800',
  standalone: 'bg-gray-100 text-gray-700',
}
const FORM_EMPTY_LEGATA = { tipo: 'legata', squadra: '', data: format(new Date(), 'yyyy-MM-dd'), quando: 'prima', durata_min: '30', su_campo: false, note: '' }
const FORM_EMPTY_LIBERA = { tipo: 'libera', squadra: '', data: format(new Date(), 'yyyy-MM-dd'), ora_inizio: '09:00', durata_min: '60', su_campo: false, note: '' }

export default function AgendaPrep() {
  const { societaId, profile } = useAuth()
  const qc = useQueryClient()
  const [weekRef, setWeekRef] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [tipoForm, setTipoForm] = useState('legata')
  const [form, setForm] = useState(FORM_EMPTY_LEGATA)
  const [saving, setSaving] = useState(false)

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd   = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr   = format(weekEnd, 'yyyy-MM-dd')

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

  const { data: sessioni = [], isLoading } = useQuery({
    queryKey: ['prep-sessioni', societaId, profile?.id, weekStartStr],
    enabled: !!societaId && !!profile?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_sessioni').select('*')
        .eq('societa_id', societaId)
        .eq('preparatore_id', profile.id)
        .gte('data', weekStartStr)
        .lte('data', weekEndStr)
        .order('data').order('ora_inizio')
      return data ?? []
    },
  })

  const giorni = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i)
      return { str: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE d MMM', { locale: it }) }
    }),
    [weekStartStr]
  )

  const insertMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('prep_sessioni').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prep-sessioni', societaId] })
      setShowModal(false)
      setForm(FORM_EMPTY_LEGATA)
      setTipoForm('legata')
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('prep_sessioni').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prep-sessioni', societaId] }),
  })

  async function handleSave(e) {
    e.preventDefault()
    if (!form.squadra || !form.data) return
    setSaving(true)
    try {
      const payload = {
        societa_id:     societaId,
        preparatore_id: profile.id,
        squadra:        form.squadra,
        data:           form.data,
        ora_inizio:     form.tipo === 'libera' ? form.ora_inizio : '00:00',
        durata_min:     parseInt(form.durata_min) || 30,
        quando:         form.tipo === 'legata' ? form.quando : 'standalone',
        su_campo:       form.su_campo,
        note:           form.note || null,
      }
      await insertMut.mutateAsync(payload)
    } finally {
      setSaving(false)
    }
  }

  function switchTipo(t) {
    setTipoForm(t)
    setForm(t === 'legata' ? FORM_EMPTY_LEGATA : FORM_EMPTY_LIBERA)
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader title="Agenda" subtitle="I miei turni" />

      <div className="p-4">
        {/* Navigazione settimana */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setWeekRef(w => subWeeks(w, 1))} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700">
            {format(weekStart, 'd MMM', { locale: it })} – {format(weekEnd, 'd MMM yyyy', { locale: it })}
          </span>
          <button onClick={() => setWeekRef(w => addWeeks(w, 1))} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronRight size={16} />
          </button>
        </div>

        {isLoading ? <LoadingSpinner /> : (
          <div className="space-y-3">
            {giorni.map(({ str, label }) => {
              const daySessioni = sessioni.filter(s => s.data === str)
              if (daySessioni.length === 0) return null
              return (
                <div key={str}>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                    {label}
                  </div>
                  {daySessioni.map(s => (
                    <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-sm text-gray-900">{s.squadra}</div>
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${QUANDO_COLOR[s.quando]}`}>
                              {QUANDO_LABEL[s.quando]}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              s.su_campo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {s.su_campo ? '⚠ Su campo' : 'Fuori campo'}
                            </span>
                            {s.durata_min && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                {s.durata_min} min
                              </span>
                            )}
                          </div>
                          {s.note && <div className="text-xs text-gray-400 mt-1">{s.note}</div>}
                        </div>
                        <button onClick={() => deleteMut.mutate(s.id)} className="text-gray-300 hover:text-red-400 p-1">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
            {sessioni.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Nessun turno questa settimana</p>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-amber-500 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={24} />
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuova sessione</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>

            {/* Toggle tipo */}
            <div className="flex gap-2 mb-4">
              {[['legata', 'Legata ad allenamento'], ['libera', 'Sessione libera']].map(([t, l]) => (
                <button key={t} type="button" onClick={() => switchTipo(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    tipoForm === t ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {l}
                </button>
              ))}
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
                <select className={inp} value={form.squadra}
                  onChange={e => setForm(f => ({ ...f, squadra: e.target.value }))} required>
                  <option value="">Seleziona squadra</option>
                  {squadreAssegnate.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
                <input type="date" className={inp} value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))} required />
              </div>

              {tipoForm === 'legata' ? (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Quando</label>
                  <div className="flex gap-2">
                    {['prima', 'durante', 'dopo'].map(q => (
                      <button key={q} type="button" onClick={() => setForm(f => ({ ...f, quando: q }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          form.quando === q ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                        }`}>
                        {q.charAt(0).toUpperCase() + q.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio *</label>
                  <input type="time" className={inp} value={form.ora_inizio}
                    onChange={e => setForm(f => ({ ...f, ora_inizio: e.target.value }))} required />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Durata (minuti)</label>
                <input type="number" min="5" className={inp} value={form.durata_min}
                  onChange={e => setForm(f => ({ ...f, durata_min: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Dove</label>
                <div className="flex gap-2">
                  {[['false', 'Fuori campo'], ['true', '⚠ Su campo']].map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setForm(f => ({ ...f, su_campo: val === 'true' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        String(form.su_campo) === val
                          ? val === 'true' ? 'bg-red-500 text-white border-red-500' : 'bg-green-500 text-white border-green-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                {form.su_campo && (
                  <p className="text-xs text-red-600 mt-1">Visibile agli admin nel calendario.</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <input className={inp} value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>

              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva sessione'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verifica build**

```bash
cd frontend && npm run build
```

Atteso: nessun errore di compilazione.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/prep/AgendaPrep.jsx
git commit -m "feat: AgendaPrep — agenda settimanale turni preparatore con form guidato"
```

---

## Task 4: StatoPage.jsx — Stato squadre (infortuni + carichi)

**Files:**
- Create: `frontend/src/pages/prep/StatoPage.jsx`

- [ ] **Step 1: Crea il componente**

```jsx
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { it } from 'date-fns/locale'
import { Plus, X, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const GRAVITA_COLORS = {
  lieve:    'bg-amber-100 text-amber-800',
  moderato: 'bg-orange-100 text-orange-800',
  grave:    'bg-red-100 text-red-800',
}
const FORM_INF_EMPTY = {
  giocatore_id: '', tipo: '', gravita: 'lieve',
  data_inizio: format(new Date(), 'yyyy-MM-dd'),
  data_rientro_prevista: '', note: '',
}

function rpeStyle(v) {
  if (v == null) return 'text-gray-300'
  if (v <= 5) return 'text-green-600 font-bold'
  if (v <= 7) return 'text-yellow-500 font-bold'
  return 'text-red-600 font-bold'
}
const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function StatoPage() {
  const { societaId, profile } = useAuth()
  const qc = useQueryClient()
  const [squadraFiltro, setSquadraFiltro] = useState('')
  const [weekRef, setWeekRef] = useState(new Date())
  const [showInfModal, setShowInfModal] = useState(false)
  const [showRpeModal, setShowRpeModal] = useState(false)
  const [formInf, setFormInf] = useState(FORM_INF_EMPTY)
  const [formRpe, setFormRpe] = useState({ giocatore_id: '', data: format(new Date(), 'yyyy-MM-dd'), valore_rpe: '7' })
  const [saving, setSaving] = useState(false)

  const weekStart    = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd      = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr   = format(weekEnd, 'yyyy-MM-dd')
  const weekDays     = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'))

  const { data: squadreAssegnate = [] } = useQuery({
    queryKey: ['prep-squadre-mie', societaId, profile?.id],
    enabled: !!societaId && !!profile?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_squadre').select('squadra')
        .eq('societa_id', societaId).eq('preparatore_id', profile.id)
      return (data ?? []).map(r => r.squadra)
    },
  })

  const squadra = squadraFiltro || squadreAssegnate[0] || ''

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-squadra', societaId, squadra],
    enabled: !!societaId && !!squadra,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome, squadra')
        .eq('societa_id', societaId).eq('squadra', squadra).order('cognome')
      return data ?? []
    },
  })

  const { data: infortuni = [], isLoading: loadInf } = useQuery({
    queryKey: ['infortuni-prep', societaId, squadra],
    enabled: !!societaId && !!squadra,
    staleTime: 30_000,
    queryFn: async () => {
      const gids = giocatori.map(g => g.id)
      if (!gids.length) return []
      const { data } = await supabase
        .from('infortuni')
        .select('*, giocatore:giocatore_id(nome, cognome)')
        .eq('societa_id', societaId).eq('stato', 'attivo')
        .in('giocatore_id', gids)
        .order('data_inizio', { ascending: false })
      return data ?? []
    },
  })

  const { data: rpeRows = [], isLoading: loadRpe } = useQuery({
    queryKey: ['rpe-settimana-prep', societaId, squadra, weekStartStr],
    enabled: !!societaId && !!squadra,
    staleTime: 30_000,
    queryFn: async () => {
      const gids = giocatori.map(g => g.id)
      if (!gids.length) return []
      const { data } = await supabase
        .from('rpe_sessioni').select('giocatore_id, data, valore_rpe')
        .eq('societa_id', societaId)
        .gte('data', weekStartStr).lte('data', weekEndStr)
        .in('giocatore_id', gids)
      return data ?? []
    },
  })

  const rpeMap = useMemo(() => {
    const map = {}
    for (const r of rpeRows) {
      if (!map[r.giocatore_id]) map[r.giocatore_id] = {}
      map[r.giocatore_id][r.data] = r.valore_rpe
    }
    return map
  }, [rpeRows])

  const risolviMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('infortuni')
        .update({ stato: 'risolto', data_rientro_effettiva: format(new Date(), 'yyyy-MM-dd') })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['infortuni-prep', societaId] }),
  })

  const insertInfMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('infortuni').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['infortuni-prep', societaId] })
      setShowInfModal(false)
      setFormInf(FORM_INF_EMPTY)
    },
  })

  const insertRpeMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('rpe_sessioni').upsert(payload, { onConflict: 'giocatore_id,data,tipo_sessione' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rpe-settimana-prep', societaId] })
      setShowRpeModal(false)
      setFormRpe({ giocatore_id: '', data: format(new Date(), 'yyyy-MM-dd'), valore_rpe: '7' })
    },
  })

  async function handleSaveInf(e) {
    e.preventDefault()
    if (!formInf.giocatore_id || !formInf.tipo) return
    setSaving(true)
    try {
      await insertInfMut.mutateAsync({
        ...formInf,
        data_rientro_prevista: formInf.data_rientro_prevista || null,
        societa_id: societaId,
      })
    } finally { setSaving(false) }
  }

  async function handleSaveRpe() {
    if (!formRpe.giocatore_id) return
    setSaving(true)
    try {
      await insertRpeMut.mutateAsync({
        giocatore_id: formRpe.giocatore_id,
        data: formRpe.data,
        valore_rpe: parseInt(formRpe.valore_rpe),
        tipo_sessione: 'allenamento',
        societa_id: societaId,
      })
    } finally { setSaving(false) }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader
        title="Stato squadre"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowInfModal(true)}
              className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-2 py-1.5 rounded-xl shadow-sm">
              <Plus size={14} /> Infortunio
            </button>
          </div>
        }
      />

      <div className="p-4 space-y-5">
        {/* Selezione squadra */}
        {squadreAssegnate.length > 1 && (
          <select className={inp} value={squadraFiltro}
            onChange={e => setSquadraFiltro(e.target.value)}>
            {squadreAssegnate.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {!squadra ? (
          <p className="text-center text-gray-400 text-sm py-8">Nessuna squadra assegnata. Chiedi all'admin.</p>
        ) : (
          <>
            {/* ── INFORTUNI ─────────────────────────────── */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Infortuni attivi</h3>
              {loadInf ? <LoadingSpinner /> : infortuni.length === 0 ? (
                <p className="text-xs text-gray-400">Nessun infortunio attivo</p>
              ) : (
                <div className="space-y-2">
                  {infortuni.map(inf => (
                    <div key={inf.id} className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-gray-900">
                          {inf.giocatore?.cognome} {inf.giocatore?.nome}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {inf.tipo} ·{' '}
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${GRAVITA_COLORS[inf.gravita]}`}>
                            {inf.gravita}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Dal {format(parseISO(inf.data_inizio), 'dd/MM/yyyy')}
                          {inf.data_rientro_prevista && ` · Rientro prev. ${format(parseISO(inf.data_rientro_prevista), 'dd/MM/yyyy')}`}
                        </div>
                      </div>
                      <button onClick={() => risolviMut.mutate(inf.id)}
                        className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg whitespace-nowrap">
                        <Check size={12} /> Risolto
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── CARICHI RPE ───────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Carichi RPE</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setWeekRef(w => subWeeks(w, 1))} className="p-1 rounded bg-gray-100"><ChevronLeft size={14} /></button>
                  <span className="text-xs text-gray-600 font-medium">
                    {format(weekStart, 'd MMM', { locale: it })}–{format(weekEnd, 'd MMM', { locale: it })}
                  </span>
                  <button onClick={() => setWeekRef(w => addWeeks(w, 1))} className="p-1 rounded bg-gray-100"><ChevronRight size={14} /></button>
                  <button onClick={() => setShowRpeModal(true)}
                    className="text-xs text-amber-600 font-semibold ml-1">+ RPE</button>
                </div>
              </div>
              {loadRpe ? <LoadingSpinner /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-amber-50">
                        <th className="text-left p-2 text-amber-900 font-semibold text-xs min-w-[70px]">Giocatore</th>
                        {weekDays.map((d, i) => (
                          <th key={d} className="p-1 text-amber-900 font-semibold text-[10px] text-center">
                            {GIORNI_BREVI[i]}<br />{format(new Date(d + 'T00:00:00'), 'd')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {giocatori.map(g => (
                        <tr key={g.id} className="border-b border-amber-50">
                          <td className="p-2 text-xs font-medium text-gray-700 truncate max-w-[70px]">
                            {g.cognome} {g.nome?.charAt(0)}.
                          </td>
                          {weekDays.map(d => {
                            const val = rpeMap[g.id]?.[d]
                            return (
                              <td key={d} className={`p-1 text-center text-xs ${rpeStyle(val)}`}>
                                {val ?? '—'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                      {giocatori.length === 0 && (
                        <tr><td colSpan={8} className="text-center text-gray-400 py-4 text-xs">
                          Nessun giocatore in questa squadra
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="mt-1 text-[10px] text-gray-400">🟢 ≤5 · 🟡 6–7 · 🔴 ≥8</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal infortunio */}
      {showInfModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuovo infortunio</h2>
              <button onClick={() => setShowInfModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveInf} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Giocatore *</label>
                <select className={inp} value={formInf.giocatore_id}
                  onChange={e => setFormInf(f => ({ ...f, giocatore_id: e.target.value }))} required>
                  <option value="">Seleziona giocatore</option>
                  {giocatori.map(g => <option key={g.id} value={g.id}>{g.cognome} {g.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo *</label>
                <input className={inp} value={formInf.tipo}
                  onChange={e => setFormInf(f => ({ ...f, tipo: e.target.value }))}
                  placeholder="es. Distorsione caviglia" required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Gravità</label>
                <select className={inp} value={formInf.gravita}
                  onChange={e => setFormInf(f => ({ ...f, gravita: e.target.value }))}>
                  <option value="lieve">Lieve</option>
                  <option value="moderato">Moderato</option>
                  <option value="grave">Grave</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data inizio *</label>
                <input type="date" className={inp} value={formInf.data_inizio}
                  onChange={e => setFormInf(f => ({ ...f, data_inizio: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Rientro previsto</label>
                <input type="date" className={inp} value={formInf.data_rientro_prevista}
                  onChange={e => setFormInf(f => ({ ...f, data_rientro_prevista: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <textarea className={inp} rows={2} value={formInf.note}
                  onChange={e => setFormInf(f => ({ ...f, note: e.target.value }))} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva infortunio'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal RPE */}
      {showRpeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Inserisci RPE</h2>
              <button onClick={() => setShowRpeModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <select className={inp} value={formRpe.giocatore_id}
                onChange={e => setFormRpe(f => ({ ...f, giocatore_id: e.target.value }))}>
                <option value="">Seleziona giocatore</option>
                {giocatori.map(g => <option key={g.id} value={g.id}>{g.cognome} {g.nome}</option>)}
              </select>
              <input type="date" className={inp} value={formRpe.data}
                onChange={e => setFormRpe(f => ({ ...f, data: e.target.value }))} />
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  RPE: <span className={`font-bold`}>{formRpe.valore_rpe}</span>
                </label>
                <input type="range" min="1" max="10" className="w-full" value={formRpe.valore_rpe}
                  onChange={e => setFormRpe(f => ({ ...f, valore_rpe: e.target.value }))} />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Facilissimo</span><span>Massimo</span>
                </div>
              </div>
              <button onClick={handleSaveRpe} disabled={saving || !formRpe.giocatore_id}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva RPE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verifica build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/prep/StatoPage.jsx
git commit -m "feat: StatoPage — infortuni + carichi RPE unificati per squadra"
```

---

## Task 5: SchedeAtletichePage.jsx — Riscrittura UX

**Files:**
- Rewrite: `frontend/src/pages/prep/SchedeAtletichePage.jsx`

- [ ] **Step 1: Riscrivi il componente**

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const CATEGORIE = ['riscaldamento', 'forza', 'mobilita', 'recupero', 'altro']
const CAT_LABEL = { riscaldamento: 'Riscaldamento', forza: 'Forza', mobilita: 'Mobilità', recupero: 'Recupero', altro: 'Altro' }
const CAT_COLOR = { riscaldamento: 'bg-orange-100 text-orange-800', forza: 'bg-blue-100 text-blue-800', mobilita: 'bg-purple-100 text-purple-800', recupero: 'bg-green-100 text-green-800', altro: 'bg-gray-100 text-gray-700' }
const ESERCIZIO_EMPTY = { nome: '', serie: '', reps: '', carico: '', note: '' }
const FORM_EMPTY = {
  nome: '', categoria: 'riscaldamento', assegna: 'squadra',
  squadra: '', giocatore_id: '', data_inizio: format(new Date(), 'yyyy-MM-dd'), data_fine: '',
  esercizi: [{ ...ESERCIZIO_EMPTY }],
}

export default function SchedeAtletichePage() {
  const { societaId, profile } = useAuth()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const { data: squadreAssegnate = [] } = useQuery({
    queryKey: ['prep-squadre-mie', societaId, profile?.id],
    enabled: !!societaId && !!profile?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_squadre').select('squadra')
        .eq('societa_id', societaId).eq('preparatore_id', profile.id)
      return (data ?? []).map(r => r.squadra)
    },
  })

  const { data: giocatoriSquadra = [] } = useQuery({
    queryKey: ['giocatori-squadra', societaId, form.squadra],
    enabled: !!societaId && !!form.squadra && form.assegna === 'giocatore',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome')
        .eq('societa_id', societaId).eq('squadra', form.squadra).order('cognome')
      return data ?? []
    },
  })

  const { data: schede = [], isLoading } = useQuery({
    queryKey: ['schede-atletiche', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('schede_atletiche')
        .select('*, assegnazioni:schede_assegnazioni(squadra, giocatore_id)')
        .eq('societa_id', societaId)
        .order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('schede_atletiche').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schede-atletiche', societaId] }),
  })

  function setEsercizio(idx, field, value) {
    setForm(f => {
      const es = [...f.esercizi]
      es[idx] = { ...es[idx], [field]: value }
      return { ...f, esercizi: es }
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nome) return
    setSaving(true)
    try {
      const { data: scheda, error } = await supabase
        .from('schede_atletiche')
        .insert({
          nome: form.nome,
          categoria: form.categoria,
          esercizi: form.esercizi.filter(es => es.nome),
          societa_id: societaId,
        })
        .select().single()
      if (error) throw error

      const assPayload = {
        scheda_id: scheda.id,
        data_inizio: form.data_inizio,
        data_fine: form.data_fine || null,
        societa_id: societaId,
      }
      if (form.assegna === 'squadra') {
        assPayload.squadra = form.squadra || squadreAssegnate[0]
      } else {
        assPayload.giocatore_id = form.giocatore_id
      }
      const { error: assErr } = await supabase.from('schede_assegnazioni').insert(assPayload)
      if (assErr) throw assErr

      qc.invalidateQueries({ queryKey: ['schede-atletiche', societaId] })
      qc.invalidateQueries({ queryKey: ['schede-giocatore'] })
      setShowModal(false)
      setForm(FORM_EMPTY)
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader title="Schede Atletiche" />

      <div className="p-4 space-y-3">
        {isLoading ? <LoadingSpinner /> : schede.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-16">
            Nessuna scheda. Usa il + per crearne una.
          </p>
        ) : schede.map(scheda => {
          const tags = [...new Set((scheda.assegnazioni ?? []).map(a => a.squadra).filter(Boolean))]
          const isOpen = expanded === scheda.id
          return (
            <div key={scheda.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button className="w-full flex items-center justify-between p-4"
                onClick={() => setExpanded(isOpen ? null : scheda.id)}>
                <div className="text-left">
                  <div className="font-semibold text-gray-900">{scheda.nome}</div>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${CAT_COLOR[scheda.categoria] ?? CAT_COLOR.altro}`}>
                      {CAT_LABEL[scheda.categoria]}
                    </span>
                    {tags.map(t => (
                      <span key={t} className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">{t}</span>
                    ))}
                    <span className="text-[10px] text-gray-400">{scheda.esercizi?.length ?? 0} esercizi</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); deleteMut.mutate(scheda.id) }}
                    className="text-gray-300 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                  {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-50 space-y-2 mt-2">
                  {(scheda.esercizi ?? []).map((es, i) => (
                    <div key={i} className="bg-amber-50 rounded-lg px-3 py-2">
                      <div className="font-medium text-sm text-gray-800">{es.nome}</div>
                      <div className="text-xs text-gray-500">
                        {es.serie && `${es.serie} serie`}
                        {es.reps && ` × ${es.reps} reps`}
                        {es.carico && ` @ ${es.carico} kg`}
                        {es.note && ` — ${es.note}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-amber-500 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={24} />
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuova scheda</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nome scheda *</label>
                <input className={inp} value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required
                  placeholder="es. Riscaldamento Dinamico Base" />
              </div>

              {/* Categoria pill */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Categoria</label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIE.map(c => (
                    <button key={c} type="button"
                      onClick={() => setForm(f => ({ ...f, categoria: c }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        form.categoria === c
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}>
                      {CAT_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assegna a */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Assegna a</label>
                <div className="flex gap-2">
                  {[['squadra', '👥 Squadra'], ['giocatore', '👤 Giocatore']].map(([v, l]) => (
                    <button key={v} type="button"
                      onClick={() => setForm(f => ({ ...f, assegna: v, giocatore_id: '' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.assegna === v ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                      }`}>{l}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
                <select className={inp} value={form.squadra}
                  onChange={e => setForm(f => ({ ...f, squadra: e.target.value, giocatore_id: '' }))} required>
                  <option value="">Seleziona squadra</option>
                  {squadreAssegnate.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {form.assegna === 'giocatore' && form.squadra && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Giocatore *</label>
                  <select className={inp} value={form.giocatore_id}
                    onChange={e => setForm(f => ({ ...f, giocatore_id: e.target.value }))} required>
                    <option value="">Seleziona giocatore</option>
                    {giocatoriSquadra.map(g => <option key={g.id} value={g.id}>{g.cognome} {g.nome}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Data inizio *</label>
                  <input type="date" className={inp} value={form.data_inizio}
                    onChange={e => setForm(f => ({ ...f, data_inizio: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Data fine</label>
                  <input type="date" className={inp} value={form.data_fine}
                    onChange={e => setForm(f => ({ ...f, data_fine: e.target.value }))} />
                </div>
              </div>

              {/* Esercizi */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">Esercizi</label>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, esercizi: [...f.esercizi, { ...ESERCIZIO_EMPTY }] }))}
                    className="text-xs text-amber-600 font-semibold">+ Aggiungi</button>
                </div>
                <div className="space-y-3">
                  {form.esercizi.map((es, idx) => (
                    <div key={idx} className="bg-amber-50 border border-amber-200 rounded-xl p-3 relative">
                      <button type="button" onClick={() => setForm(f => ({ ...f, esercizi: f.esercizi.filter((_, i) => i !== idx) }))}
                        className="absolute top-2 right-2 text-gray-300 hover:text-red-400">
                        <X size={12} />
                      </button>
                      <div className="text-xs font-semibold text-amber-800 mb-2">Esercizio {idx + 1}</div>
                      <input className={`${inp} mb-2 bg-white`} placeholder="Nome esercizio *"
                        value={es.nome} onChange={e => setEsercizio(idx, 'nome', e.target.value)} />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[9px] text-gray-400 font-semibold mb-1 uppercase">Serie</div>
                          <input type="number" min="1" className={`${inp} bg-white`} placeholder="3"
                            value={es.serie} onChange={e => setEsercizio(idx, 'serie', e.target.value)} />
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-400 font-semibold mb-1 uppercase">Reps</div>
                          <input type="number" min="1" className={`${inp} bg-white`} placeholder="10"
                            value={es.reps} onChange={e => setEsercizio(idx, 'reps', e.target.value)} />
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-400 font-semibold mb-1 uppercase">Carico (kg)</div>
                          <input type="number" step="0.5" className={`${inp} bg-white`} placeholder="—"
                            value={es.carico} onChange={e => setEsercizio(idx, 'carico', e.target.value)} />
                        </div>
                      </div>
                      <input className={`${inp} bg-white mt-2`} placeholder="Note (opzionale)"
                        value={es.note} onChange={e => setEsercizio(idx, 'note', e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva scheda'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verifica build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/prep/SchedeAtletichePage.jsx
git commit -m "feat: SchedeAtletichePage — FAB, form card esercizi, assegnazione squadra/giocatore"
```

---

## Task 6: Setup Admin — Tab Preparatori

**Files:**
- Modify: `frontend/src/pages/SetupPage.jsx` (aggiungi `PreparatoriTab` + entry in `ALL_TABS`)
- Modify: `frontend/src/pages/admin/SetupMenu.jsx` (aggiungi voce menu)

- [ ] **Step 1: Aggiungi `PreparatoriTab` in SetupPage.jsx**

Prima dei blocco `const ALL_TABS`, aggiungi questa funzione (segui il pattern di `AllenatoriTab`):

```jsx
function PreparatoriTab() {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [editingId, setEditingId] = useState(null)
  const [selectedSquadre, setSelectedSquadre] = useState([])
  const [saving, setSaving] = useState(false)

  const { data: preparatori = [], isLoading } = useQuery({
    queryKey: ['preparatori-tab', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, cognome, email')
        .eq('societa_id', societaId)
        .or("ruolo.eq.preparatore_atletico,'preparatore_atletico'=ANY(ruoli_extra)")
        .order('cognome')
      return data ?? []
    },
  })

  const { data: assegnazioni = [] } = useQuery({
    queryKey: ['prep-squadre-admin', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_squadre').select('preparatore_id, squadra')
        .eq('societa_id', societaId)
      return data ?? []
    },
  })

  const { data: squadreDisp = [] } = useQuery({
    queryKey: ['squadre-nomi'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
  })

  function getSquadrePrep(prepId) {
    return assegnazioni.filter(a => a.preparatore_id === prepId).map(a => a.squadra)
  }

  async function handleSave(prepId) {
    setSaving(true)
    try {
      await supabase.from('prep_squadre').delete().eq('preparatore_id', prepId).eq('societa_id', societaId)
      if (selectedSquadre.length > 0) {
        const inserts = selectedSquadre.map(s => ({ preparatore_id: prepId, squadra: s, societa_id: societaId }))
        const { error } = await supabase.from('prep_squadre').insert(inserts)
        if (error) throw error
      }
      qc.invalidateQueries({ queryKey: ['prep-squadre-admin', societaId] })
      qc.invalidateQueries({ queryKey: ['prep-squadre-mie'] })
      setEditingId(null)
    } finally {
      setSaving(false) }
  }

  function openEdit(prepId) {
    setEditingId(prepId)
    setSelectedSquadre(getSquadrePrep(prepId))
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-3">
      {preparatori.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">
          Nessun preparatore atletico. Assegna il ruolo tramite Utenti &amp; Accessi.
        </p>
      )}
      {preparatori.map(p => {
        const sq = getSquadrePrep(p.id)
        const isEditing = editingId === p.id
        return (
          <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-semibold text-gray-900 text-sm">{p.cognome} {p.nome}</div>
                <div className="text-xs text-gray-400">{p.email}</div>
              </div>
              {!isEditing && (
                <button onClick={() => openEdit(p.id)}
                  className="text-xs text-blue-600 font-semibold px-3 py-1.5 rounded-lg border border-blue-200">
                  Modifica
                </button>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 mb-1">Squadre assegnate</div>
                <div className="flex flex-wrap gap-2">
                  {squadreDisp.map(s => (
                    <button key={s} type="button"
                      onClick={() => setSelectedSquadre(prev =>
                        prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                      )}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        selectedSquadre.includes(s)
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}>{s}</button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setEditingId(null)}
                    className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600">
                    Annulla
                  </button>
                  <button onClick={() => handleSave(p.id)} disabled={saving}
                    className="flex-1 py-2 rounded-lg text-sm bg-amber-500 text-white font-semibold disabled:opacity-60">
                    {saving ? '...' : 'Salva'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {sq.length === 0
                  ? <span className="text-xs text-gray-400">Nessuna squadra assegnata</span>
                  : sq.map(s => (
                      <span key={s} className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">{s}</span>
                    ))
                }
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Aggiungi il tab a `ALL_TABS` in SetupPage.jsx**

```jsx
const ALL_TABS = [
  { id: 'squadre',            label: 'Squadre',          icon: Users       },
  { id: 'palestre',           label: 'Palestre',          icon: Building2   },
  { id: 'allenatori',         label: 'Allenatori',        icon: UserCheck   },
  { id: 'giocatori',          label: 'Giocatori',         icon: UserPlus    },
  { id: 'utenti',             label: 'Utenti & Accessi',  icon: Shield      },
  { id: 'squadre_allenatori', label: 'Doppio Campionato', icon: GitFork     },
  { id: 'settimana_tipo',     label: 'Settimana Tipo',    icon: Calendar    },
  { id: 'preparatori',        label: 'Preparatori',       icon: Activity    },  // ← AGGIUNTO
]
```

Aggiungi `Activity` agli import di `lucide-react` in cima al file (già importato — verificare).

Aggiungi il rendering nel JSX di `SetupPage`:
```jsx
{tab === 'preparatori' && <PreparatoriTab />}
```

- [ ] **Step 3: Aggiungi voce in SetupMenu.jsx**

Nel gruppo `'🛠 Strumenti'` di `SECTIONS`, aggiungi:
```jsx
{ icon: Activity, label: 'Preparatori', desc: 'Assegna preparatori alle squadre', tab: 'preparatori' },
```

Aggiungi `Activity` agli import di `lucide-react` in cima a `SetupMenu.jsx`.

- [ ] **Step 4: Verifica build**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SetupPage.jsx frontend/src/pages/admin/SetupMenu.jsx
git commit -m "feat: SetupPage — tab Preparatori con assegnazione squadre"
```

---

## Task 7: PrepSesioneInlineForm + EventForm integrazione

**Files:**
- Create: `frontend/src/components/PrepSesioneInlineForm.jsx`
- Modify: `frontend/src/pages/CalendarioPage.jsx` (EventForm + save handler)

- [ ] **Step 1: Crea PrepSesioneInlineForm.jsx**

```jsx
export default function PrepSesioneInlineForm({ onChange }) {
  const [quando, setQuando] = useState('prima')
  const [durata, setDurata] = useState('30')
  const [suCampo, setSuCampo] = useState(false)

  function update(nextWhen, nextDur, nextCampo) {
    onChange({ quando: nextWhen, durata_min: parseInt(nextDur) || 30, su_campo: nextCampo })
  }

  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
      <div className="text-xs font-semibold text-amber-800">Dettagli parte atletica</div>

      <div>
        <div className="text-xs text-gray-500 mb-1">Quando</div>
        <div className="flex gap-2">
          {['prima', 'durante', 'dopo'].map(q => (
            <button key={q} type="button"
              onClick={() => { setQuando(q); update(q, durata, suCampo) }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                quando === q ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
              }`}>
              {q.charAt(0).toUpperCase() + q.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">Durata (minuti)</div>
        <input type="number" min="5"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          value={durata}
          onChange={e => { setDurata(e.target.value); update(quando, e.target.value, suCampo) }} />
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">Dove</div>
        <div className="flex gap-2">
          {[['false', 'Fuori campo'], ['true', '⚠ Su campo']].map(([val, label]) => (
            <button key={val} type="button"
              onClick={() => { const b = val === 'true'; setSuCampo(b); update(quando, durata, b) }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                String(suCampo) === val
                  ? val === 'true' ? 'bg-red-500 text-white border-red-500' : 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}>{label}</button>
          ))}
        </div>
        {suCampo && <p className="text-xs text-red-600 mt-1">Occupa spazio in palestra — visibile nel calendario admin.</p>}
      </div>
    </div>
  )
}
```

Aggiungi `import { useState } from 'react'` in cima al file.

- [ ] **Step 2: Modifica EventForm in CalendarioPage.jsx**

Aggiungi import:
```jsx
import PrepSesioneInlineForm from '../components/PrepSesioneInlineForm'
```

All'interno di `EventForm`, aggiungi stato:
```jsx
const [hasAtletica, setHasAtletica] = useState(false)
const [prepData, setPrepData] = useState({ quando: 'prima', durata_min: 30, su_campo: false })
```

Aggiungi query per verificare se la squadra ha un preparatore assegnato:
```jsx
const { data: prepAssegnato } = useQuery({
  queryKey: ['prep-per-squadra', form.squadra],
  enabled: !!form.squadra && form.tipo === 'allenamento',
  staleTime: 5 * 60_000,
  queryFn: async () => {
    const { data } = await supabase
      .from('prep_squadre').select('preparatore_id')
      .eq('squadra', form.squadra)
      .limit(1).maybeSingle()
    return data
  },
})
```

Dentro il `<form id="event-form">`, prima del button di submit (cerca `type="submit" form="event-form"`), aggiungi:
```jsx
{form.tipo === 'allenamento' && (
  <div className="border-t border-gray-100 pt-3">
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox"
        checked={hasAtletica}
        disabled={!prepAssegnato}
        onChange={e => setHasAtletica(e.target.checked)}
        className="w-4 h-4 rounded text-amber-500" />
      <span className={!prepAssegnato ? 'text-gray-400' : ''}>
        Parte di preparazione atletica
        {!prepAssegnato && <span className="text-xs text-gray-400 ml-1">(nessun preparatore assegnato)</span>}
      </span>
    </label>
    {hasAtletica && <PrepSesioneInlineForm onChange={setPrepData} />}
  </div>
)}
```

Modifica il `onSave` call nel form submit per includere prepData:
```jsx
// Trova la riga: onSave(saveData)
// Sostituiscila con:
onSave(saveData, hasAtletica ? { ...prepData, squadra: form.squadra, data: form.data } : null)
```

- [ ] **Step 3: Modifica il save handler in CalendarioPage (fuori da EventForm)**

Cerca la funzione/mutation che chiama `onSave` da EventForm. Tipicamente è `handleSave` o `saveMut` nel componente principale di `CalendarioPage`.

Trova dove viene chiamato `onSave` e aggiorna il gestore per accettare il secondo parametro `prepSessionData`:

```jsx
// Nel componente CalendarioPage, cerca il pattern che gestisce il salvataggio dell'allenamento
// e aggiorna per accettare prepSessionData:

async function handleEventSave(saveData, prepSessionData) {
  // ... logica esistente per salvare l'allenamento ...
  
  // DOPO il salvataggio dell'allenamento, se c'è una parte atletica:
  if (prepSessionData && prepSessionData.squadra) {
    // Cerca il preparatore assegnato alla squadra
    const { data: prepRec } = await supabase
      .from('prep_squadre')
      .select('preparatore_id')
      .eq('squadra', prepSessionData.squadra)
      .eq('societa_id', societaId)
      .limit(1).maybeSingle()
    
    if (prepRec?.preparatore_id) {
      await supabase.from('prep_sessioni').insert({
        societa_id:     societaId,
        preparatore_id: prepRec.preparatore_id,
        squadra:        prepSessionData.squadra,
        data:           prepSessionData.data,
        ora_inizio:     '00:00',
        durata_min:     prepSessionData.durata_min,
        quando:         prepSessionData.quando,
        su_campo:       prepSessionData.su_campo,
      })
    }
  }
}
```

**Nota implementativa:** CalendarioPage usa `EventForm` con un `onSave` prop. Cerca la definizione di questo prop e aggiornala per passare il secondo argomento. Il pattern attuale ha `onSave={saveData => saveMut.mutate(saveData)}` — va trasformato in `onSave={(saveData, prepData) => handleEventSave(saveData, prepData)}`.

- [ ] **Step 4: Verifica build**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PrepSesioneInlineForm.jsx frontend/src/pages/CalendarioPage.jsx
git commit -m "feat: EventForm — checkbox parte atletica con PrepSesioneInlineForm"
```

---

## Task 8: AtleticaCoach — Semplificazione

**Files:**
- Modify: `frontend/src/pages/coach/AtleticaCoach.jsx`

- [ ] **Step 1: Riscrivi il componente**

Parti dal file esistente. Modifica:

1. Rimuovi la query `testDef` e `risultati` (erano per il tab test)
2. Rimuovi la query `prossimiSlot` (era per il tab spazi)
3. Rimuovi gli stati `testFiltro`, `colDate`, `pivot`
4. Aggiorna i tab a: `['infortuni', 'carichi', 'sessioni']`
5. Aggiungi query per `prep_sessioni` della settimana:

```jsx
const { data: sessioni = [], isLoading: loadSes } = useQuery({
  queryKey: ['coach-sessioni', societaId, squadreAllenatore?.join(','), weekStartStr, weekEndStr],
  enabled: !!societaId && !!squadreAllenatore?.length && !!gids.length,
  staleTime: 30_000,
  queryFn: async () => {
    const { data } = await supabase
      .from('prep_sessioni')
      .select('*, preparatore:preparatore_id(nome, cognome)')
      .eq('societa_id', societaId)
      .in('squadra', squadreAllenatore ?? [])
      .gte('data', weekStartStr)
      .lte('data', weekEndStr)
      .order('data').order('ora_inizio')
    return data ?? []
  },
})
```

6. Sostituisci il JSX del tab selector con:

```jsx
{['infortuni', 'carichi', 'sessioni'].map(t => (
  <button key={t} className={tabCls(t)} onClick={() => setTab(t)}>
    {t.charAt(0).toUpperCase() + t.slice(1)}
  </button>
))}
```

7. Aggiungi il tab sessioni nel JSX:

```jsx
{tab === 'sessioni' && (
  loadSes ? <LoadingSpinner /> : (
    <div className="space-y-2">
      {sessioni.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Nessuna sessione atletica questa settimana</p>}
      {sessioni.map(s => (
        <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm text-gray-900">{s.squadra}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {format(new Date(s.data + 'T00:00:00'), 'd/MM')} ·{' '}
                {s.quando === 'standalone' ? 'Sessione libera' : `${s.quando.charAt(0).toUpperCase() + s.quando.slice(1)} allenamento`}
                {' · '}{s.durata_min} min
              </div>
              <div className="text-xs mt-1">
                <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  s.su_campo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}>
                  {s.su_campo ? '⚠ Su campo' : 'Fuori campo'}
                </span>
              </div>
            </div>
            {s.preparatore && (
              <div className="text-xs text-gray-400 text-right">
                {s.preparatore.cognome}<br />{s.preparatore.nome}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
)}
```

8. Rimuovi i tab `test` e `spazi` dal JSX (cancella i blocchi `{tab === 'test' && ...}` e `{tab === 'spazi' && ...}`).

- [ ] **Step 2: Verifica build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/coach/AtleticaCoach.jsx
git commit -m "feat: AtleticaCoach — semplificato a infortuni/carichi/sessioni, rimossi test e spazi"
```

---

## Task 9: HomeGiocatore — Scheda assegnata

**Files:**
- Modify: `frontend/src/pages/player/HomeGiocatore.jsx`

- [ ] **Step 1: Aggiungi la query schede assegnate**

Dopo la query `rpeOggi` (riga ~50), aggiungi:

```jsx
const { data: schedeAssegnate = [] } = useQuery({
  queryKey: ['schede-giocatore', mioGiocatore?.id, societaId],
  enabled: !!mioGiocatore?.id && !!societaId,
  staleTime: 10 * 60_000,
  queryFn: async () => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('schede_assegnazioni')
      .select('*, scheda:scheda_id(nome, categoria, esercizi)')
      .eq('societa_id', societaId)
      .or(`giocatore_id.eq.${mioGiocatore.id},squadra.eq.${mioGiocatore.squadra}`)
      .lte('data_inizio', today)
      .or(`data_fine.is.null,data_fine.gte.${today}`)
    return data ?? []
  },
})
```

- [ ] **Step 2: Aggiungi il rendering nel JSX**

Cerca `{rpeSalvato && (` nel JSX e dopo il blocco `{rpeSalvato && ...}` aggiungi:

```jsx
{schedeAssegnate.length > 0 && (
  <div className="mx-4 space-y-2">
    {schedeAssegnate.map(ass => (
      <div key={ass.id} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-sm text-gray-900">{ass.scheda?.nome}</div>
          <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold capitalize">
            {ass.scheda?.categoria}
          </span>
        </div>
        <div className="space-y-1.5">
          {(ass.scheda?.esercizi ?? []).map((es, i) => (
            <div key={i} className="bg-amber-50 rounded-lg px-3 py-2">
              <div className="text-xs font-semibold text-gray-800">{es.nome}</div>
              <div className="text-xs text-gray-500">
                {es.serie && `${es.serie} serie`}
                {es.reps && ` × ${es.reps} reps`}
                {es.carico && ` @ ${es.carico} kg`}
                {es.note && <span className="text-gray-400"> — {es.note}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Verifica build**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/player/HomeGiocatore.jsx
git commit -m "feat: HomeGiocatore — mostra schede atletiche assegnate al giocatore"
```

---

## Task 10: CalendarioPage — Badge ⚡ Atletica (admin)

**Files:**
- Modify: `frontend/src/pages/CalendarioPage.jsx`

- [ ] **Step 1: Aggiungi query prep_sessioni per admin**

Nel componente principale di `CalendarioPage` (non in EventForm), aggiungi la query:

```jsx
const { data: sessioniAtletica = [] } = useQuery({
  queryKey: ['prep-sessioni-admin', societaId, weekStartStr, weekEndStr],
  enabled: !!societaId && isAdmin,
  staleTime: 60_000,
  queryFn: async () => {
    const { data } = await supabase
      .from('prep_sessioni')
      .select('id, squadra, data, quando, su_campo, durata_min')
      .eq('societa_id', societaId)
      .eq('su_campo', true)
      .gte('data', weekStartStr)
      .lte('data', weekEndStr)
    return data ?? []
  },
})
```

Usa `isAdmin` già disponibile da `useAuth()`.

- [ ] **Step 2: Mostra badge nelle card allenamento**

Nel componente `TrainingMiniCard` (riga ~527), o nel punto dove vengono renderizzati gli eventi del calendario, aggiungi la visualizzazione del badge.

Crea una funzione helper nel componente principale:

```jsx
function getSessioneAtletica(squadra, data) {
  return sessioniAtletica.find(s =>
    s.squadra?.toLowerCase() === squadra?.toLowerCase() && s.data === data
  )
}
```

Poi passa `sessioneAtletica={getSessioneAtletica(training.squadra, training.data)}` come prop a `TrainingMiniCard`.

In `TrainingMiniCard`, aggiungi:

```jsx
{sessioneAtletica && (
  <div className="mt-1">
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
      ⚡ Atletica · {sessioneAtletica.quando === 'standalone' ? 'libera' : sessioneAtletica.quando} · {sessioneAtletica.durata_min}min
    </span>
  </div>
)}
```

- [ ] **Step 3: Verifica build**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit e push**

```bash
git add frontend/src/pages/CalendarioPage.jsx
git commit -m "feat: CalendarioPage — badge atletica per sessioni su campo (admin)"
git push origin master
```

---

## Self-Review

### Spec coverage

| Requisito spec | Task |
|---|---|
| SQL: drop 7 tabelle | Task 1 |
| SQL: prep_squadre + prep_sessioni + RLS | Task 1 |
| PrepLayout 3 tab | Task 2 |
| App.jsx route prep | Task 2 |
| Elimina 6 pagine vecchie | Task 2 |
| AgendaPrep: agenda + form guidato | Task 3 |
| StatoPage: infortuni + carichi unificati | Task 4 |
| SchedeAtletichePage: FAB + form card + assegnazione | Task 5 |
| Setup admin: tab preparatori | Task 6 |
| EventForm: checkbox atletica | Task 7 |
| PrepSesioneInlineForm | Task 7 |
| AtleticaCoach: semplificato + sessioni | Task 8 |
| HomeGiocatore: scheda assegnata | Task 9 |
| CalendarioPage: badge ⚡ atletica | Task 10 |

Tutti i requisiti della spec sono coperti.

### Note critiche per l'implementazione

1. **Task 7 — EventForm**: Il pattern esatto di `onSave` in CalendarioPage deve essere identificato leggendo il codice attuale (riga ~392). Il gestore è inline nel `form onSubmit`. La modifica richiede di estrarlo in una funzione separata `handleEventSave(saveData, prepData)`.

2. **Task 6 — Query preparatori**: La query usa `.or("ruolo.eq.preparatore_atletico,'preparatore_atletico'=ANY(ruoli_extra)")` — verificare la sintassi Supabase per query su array PostgreSQL in produzione.

3. **Task 10 — CalendarioPage**: `TrainingMiniCard` riceve già props dal parent. Aggiungere `sessioneAtletica` come prop opzionale senza rompere le chiamate esistenti.
