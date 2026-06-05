# Modulo Contabilità — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un modulo Contabilità alla segreteria con registro spese, bilancio visivo entrate/uscite e vista entrate — accessibile a segreteria (lettura+scrittura) e dirigente (sola lettura).

**Architecture:** Nuova tabella `spese` in Supabase con RLS. Hook `useEntrate` riutilizzabile per le quote pagate. Pagina `ContabilitaPage` con 3 tab (Bilancio, Spese, Entrate) montata su `/secretary/contabilita` e `/dirigente/contabilita`. Bar chart CSS-only senza dipendenze aggiuntive.

**Tech Stack:** React 19, Vite, TailwindCSS 4, @tanstack/react-query, Supabase JS, date-fns, lucide-react

---

## File da creare

| File | Responsabilità |
|------|---------------|
| `supabase/migrations/supabase_migration_contabilita.sql` | Tabella `spese` + indice + RLS |
| `frontend/src/hooks/useEntrate.js` | Hook riutilizzabile: fetch quote pagate per intervallo di date |
| `frontend/src/pages/secretary/ContabilitaPage.jsx` | Pagina principale con 3 tab: Bilancio, Spese, Entrate |

## File da modificare

| File | Modifica |
|------|---------|
| `frontend/src/hooks/useAuth.jsx` | Aggiunge `isDirigente` ai valori esportati |
| `frontend/src/components/ui/TabBar.jsx` | Aggiunge prop `color` a `TabBtn` (supporto purple) |
| `frontend/src/layouts/SecretaryLayout.jsx` | Aggiunge voce nav "Contabilità" |
| `frontend/src/layouts/DirigentLayout.jsx` | Sostituisce "Economico" (ResocontoPage) con "Contabilità" |
| `frontend/src/App.jsx` | Aggiunge route `/secretary/contabilita` e `/dirigente/contabilita` |

---

## Task 1: Migration SQL — tabella spese

**Files:**
- Create: `supabase/migrations/supabase_migration_contabilita.sql`

- [ ] **Step 1: Crea il file di migrazione**

```sql
-- supabase/migrations/supabase_migration_contabilita.sql

-- ── Tabella spese ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spese (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societa_id  UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  importo     NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  categoria   TEXT NOT NULL,
  descrizione TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Indice per query per società + periodo
CREATE INDEX IF NOT EXISTS spese_societa_data_idx ON spese (societa_id, data);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE spese ENABLE ROW LEVEL SECURITY;

-- SELECT: qualsiasi utente autenticato della propria società
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spese' AND policyname = 'spese_select') THEN
    EXECUTE $policy$
      CREATE POLICY spese_select ON spese
        FOR SELECT TO authenticated
        USING (societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid()));
    $policy$;
  END IF;
END;
$$;

-- INSERT: solo segreteria, admin, super_admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spese' AND policyname = 'spese_insert') THEN
    EXECUTE $policy$
      CREATE POLICY spese_insert ON spese
        FOR INSERT TO authenticated
        WITH CHECK (
          societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
          AND (SELECT ruolo FROM profiles WHERE id = auth.uid())
            IN ('segreteria', 'admin', 'super_admin')
        );
    $policy$;
  END IF;
END;
$$;

-- DELETE: solo segreteria, admin, super_admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spese' AND policyname = 'spese_delete') THEN
    EXECUTE $policy$
      CREATE POLICY spese_delete ON spese
        FOR DELETE TO authenticated
        USING (
          societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
          AND (SELECT ruolo FROM profiles WHERE id = auth.uid())
            IN ('segreteria', 'admin', 'super_admin')
        );
    $policy$;
  END IF;
END;
$$;
```

- [ ] **Step 2: Esegui la migrazione su Supabase**

Nel Supabase Dashboard → SQL Editor, incolla e lancia l'intero contenuto del file.
Verifica: la tabella `spese` appare in Table Editor con le colonne corrette.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/supabase_migration_contabilita.sql
git commit -m "feat: migrazione tabella spese con RLS"
```

---

## Task 2: useEntrate hook + isDirigente + TabBtn color

**Files:**
- Create: `frontend/src/hooks/useEntrate.js`
- Modify: `frontend/src/hooks/useAuth.jsx`
- Modify: `frontend/src/components/ui/TabBar.jsx`

- [ ] **Step 1: Crea `useEntrate.js`**

```js
// frontend/src/hooks/useEntrate.js
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Fetch quote pagate (entrate) per un intervallo di date.
 * @param {string|null} societaId
 * @param {string} from  — 'YYYY-MM-DD'
 * @param {string} to    — 'YYYY-MM-DD'
 */
export function useEntrate(societaId, from, to) {
  return useQuery({
    queryKey: ['entrate', societaId, from, to],
    enabled: !!societaId && !!from && !!to,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select(`
          id, tipo, descrizione, importo, data_pagamento, metodo_pagamento, numero_ricevuta,
          giocatori!inner(nome, cognome, squadra)
        `)
        .eq('societa_id', societaId)
        .eq('pagato', true)
        .gte('data_pagamento', from)
        .lte('data_pagamento', to)
        .order('data_pagamento')
        .order('numero_ricevuta', { ascending: true, nullsFirst: false })
      return data ?? []
    },
  })
}
```

- [ ] **Step 2: Aggiungi `isDirigente` a `useAuth.jsx`**

Apri `frontend/src/hooks/useAuth.jsx`. Trova il blocco return del Provider (intorno alla riga 154) e aggiungi `isDirigente` dopo `isSegreteria`:

```js
    isSegreteria:       allRuoli.includes('segreteria'),
    isDirigente:        allRuoli.includes('dirigente'),
    isPreparatore:      allRuoli.includes('preparatore_atletico'),
```

- [ ] **Step 3: Aggiungi prop `color` a `TabBtn` in `TabBar.jsx`**

Sostituisci l'intero contenuto di `frontend/src/components/ui/TabBar.jsx`:

```jsx
export function TabBtn({ label, icon: Icon, active, onClick, variant = 'default', color = 'blue' }) {
  const colors = {
    blue:   active ? 'border-blue-600 text-blue-600'     : 'border-transparent text-gray-500',
    purple: active ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500',
    amber:  active ? 'border-amber-600 text-amber-600'   : 'border-transparent text-gray-500',
    emerald:active ? 'border-emerald-600 text-emerald-600': 'border-transparent text-gray-500',
  }
  const colorClass = variant === 'light'
    ? (active ? 'border-white text-white' : 'border-transparent text-amber-200 hover:text-amber-100')
    : (colors[color] ?? colors.blue)

  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors border-b-2 ${colorClass}`}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

export function TabBar({ children }) {
  return (
    <div className="flex border-b border-gray-100 bg-white">
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Verifica che SetupPage (unico consumer esistente di TabBtn) non sia rotto**

Apri `frontend/src/pages/SetupPage.jsx` e cerca `TabBtn`. Non passa la prop `color`, quindi usa il default `'blue'` — nessuna modifica necessaria.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useEntrate.js frontend/src/hooks/useAuth.jsx frontend/src/components/ui/TabBar.jsx
git commit -m "feat: useEntrate hook, isDirigente in useAuth, TabBtn color prop"
```

---

## Task 3: ContabilitaPage — componente completo

**Files:**
- Create: `frontend/src/pages/secretary/ContabilitaPage.jsx`

- [ ] **Step 1: Crea il file con il componente completo**

```jsx
// frontend/src/pages/secretary/ContabilitaPage.jsx
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  TrendingUp, TrendingDown, Wallet,
  Plus, X, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { supabase }       from '../../lib/supabase'
import { useAuth }        from '../../hooks/useAuth'
import { useEntrate }     from '../../hooks/useEntrate'
import { TabBar, TabBtn } from '../../components/ui/TabBar'
import PageHeader         from '../../components/PageHeader'
import LoadingSpinner     from '../../components/LoadingSpinner'

// ── Costanti ──────────────────────────────────────────────────────────────────

const MESI_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

const BADGE_CLASSES = [
  'bg-purple-100 text-purple-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-yellow-100 text-yellow-800',
]

const METODO_LABEL = { contanti: 'Contanti', bonifico: 'Bonifico', pos: 'POS / Carta' }

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

const FORM_EMPTY = {
  importo: '',
  data: format(new Date(), 'yyyy-MM-dd'),
  categoria: '',
  descrizione: '',
}

// ── Helper: colore badge categoria (deterministico sul nome) ──────────────────

function catBadge(cat) {
  let h = 0
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0
  return BADGE_CLASSES[h % BADGE_CLASSES.length]
}

// ── Helper: intervallo date ───────────────────────────────────────────────────

function getDateRange(tipo, anno) {
  if (tipo === 'solare') return { from: `${anno}-01-01`, to: `${anno}-12-31` }
  // anno sportivo: set anno → ago anno+1
  return { from: `${anno}-09-01`, to: `${anno + 1}-08-31` }
}

// ── Helper: lista mesi nell'ordine corretto per il tipo anno ──────────────────

function getMonths(tipo, anno) {
  if (tipo === 'solare') {
    return Array.from({ length: 12 }, (_, i) => ({
      key: `${anno}-${String(i + 1).padStart(2, '0')}`,
      label: MESI_SHORT[i],
    }))
  }
  // sportivo: Set anno, Ott anno, Nov anno, Dic anno, Gen anno+1 … Ago anno+1
  return [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7].map(m => {
    const y = m >= 8 ? anno : anno + 1
    return {
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: MESI_SHORT[m],
    }
  })
}

// ── Helper: anno sportivo corrente (es. se oggi è giu 2026 → 2025) ───────────

function currentAnnoSportivo() {
  const now = new Date()
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

// ── Componente principale ─────────────────────────────────────────────────────

export default function ContabilitaPage() {
  const { societaId, isSegreteria, isAdmin, isSuperAdmin } = useAuth()
  const qc = useQueryClient()
  const canWrite = isSegreteria || isAdmin || isSuperAdmin

  // ── Stato tab e periodo ───────────────────────────────────────────────────
  const [tab,      setTab]      = useState('bilancio')
  const [tipoAnno, setTipoAnno] = useState('solare')
  const [anno,     setAnno]     = useState(new Date().getFullYear())

  function handleTipoAnno(tipo) {
    setTipoAnno(tipo)
    setAnno(tipo === 'solare' ? new Date().getFullYear() : currentAnnoSportivo())
  }

  const { from, to } = getDateRange(tipoAnno, anno)
  const months    = getMonths(tipoAnno, anno)
  const annoLabel = tipoAnno === 'solare'
    ? String(anno)
    : `${anno}/${String(anno + 1).slice(-2)}`
  // Disabilita "avanti" se l'anno inizia nel futuro
  const isFuture = new Date(from) > new Date()

  // ── Query: entrate (quote pagate) ─────────────────────────────────────────
  const { data: entrate = [], isLoading: loadE } = useEntrate(societaId, from, to)

  // ── Query: spese ──────────────────────────────────────────────────────────
  const { data: spese = [], isLoading: loadS } = useQuery({
    queryKey: ['spese', societaId, from, to],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spese')
        .select('id, data, importo, categoria, descrizione')
        .eq('societa_id', societaId)
        .gte('data', from)
        .lte('data', to)
        .order('data', { ascending: false })
      return data ?? []
    },
  })

  // ── Query: categorie (per autocomplete, non filtrate per anno) ─────────────
  const { data: categorie = [] } = useQuery({
    queryKey: ['spese-categorie', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spese').select('categoria').eq('societa_id', societaId)
      return [...new Set((data ?? []).map(s => s.categoria))].sort()
    },
  })

  // ── Derivati bilancio ─────────────────────────────────────────────────────
  const totEntrate = useMemo(
    () => entrate.reduce((s, p) => s + (p.importo ?? 0), 0), [entrate])
  const totUscite = useMemo(
    () => spese.reduce((s, p) => s + (p.importo ?? 0), 0), [spese])
  const saldo = totEntrate - totUscite

  // byMonth: { 'YYYY-MM': { entrate, uscite } }
  const byMonth = useMemo(() => {
    const map = {}
    for (const p of entrate) {
      const k = p.data_pagamento?.slice(0, 7)
      if (!k) continue
      if (!map[k]) map[k] = { entrate: 0, uscite: 0 }
      map[k].entrate += p.importo ?? 0
    }
    for (const s of spese) {
      const k = s.data?.slice(0, 7)
      if (!k) continue
      if (!map[k]) map[k] = { entrate: 0, uscite: 0 }
      map[k].uscite += s.importo ?? 0
    }
    return map
  }, [entrate, spese])

  // Valore massimo mensile (per scala barre)
  const maxVal = useMemo(() =>
    Math.max(1, ...months.map(({ key }) =>
      Math.max(byMonth[key]?.entrate ?? 0, byMonth[key]?.uscite ?? 0)
    )), [months, byMonth])

  // Breakdown per categoria (ordinato per importo desc)
  const byCategoria = useMemo(() => {
    const map = {}
    for (const s of spese) {
      if (!map[s.categoria]) map[s.categoria] = 0
      map[s.categoria] += s.importo ?? 0
    }
    return Object.entries(map)
      .map(([cat, tot]) => ({ cat, tot }))
      .sort((a, b) => b.tot - a.tot)
  }, [spese])

  // ── Stato form spesa ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(FORM_EMPTY)
  const [saving,   setSaving]   = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    if (!form.importo || !form.data || !form.categoria.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('spese').insert({
        societa_id:  societaId,
        data:        form.data,
        importo:     parseFloat(form.importo),
        categoria:   form.categoria.trim(),
        descrizione: form.descrizione.trim() || null,
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['spese', societaId] })
      qc.invalidateQueries({ queryKey: ['spese-categorie', societaId] })
      setShowForm(false)
      setForm(FORM_EMPTY)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Eliminare questa spesa?')) return
    await supabase.from('spese').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['spese', societaId] })
  }

  // ── Controlli periodo (riusati in tutti i tab) ────────────────────────────
  const periodoControls = (
    <div className="px-4 pt-4 pb-2 space-y-3">
      {/* Toggle solare/sportivo */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {[['solare', 'Anno solare'], ['sportivo', 'Anno sportivo']].map(([v, l]) => (
          <button key={v} onClick={() => handleTipoAnno(v)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tipoAnno === v ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* Selettore anno */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-2.5">
        <button onClick={() => setAnno(a => a - 1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-transform">
          <ChevronLeft size={18} className="text-gray-600" />
        </button>
        <p className="text-sm font-bold text-gray-900">{annoLabel}</p>
        <button onClick={() => setAnno(a => a + 1)} disabled={isFuture}
          className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-transform disabled:opacity-30">
          <ChevronRight size={18} className="text-gray-600" />
        </button>
      </div>
    </div>
  )

  // ── TAB BILANCIO ──────────────────────────────────────────────────────────
  const tabBilancio = (
    <div className="px-4 pb-28 space-y-4">
      {loadE || loadS ? <LoadingSpinner /> : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Entrate
              </p>
              <p className="text-sm font-extrabold text-green-600">
                €{totEntrate.toFixed(0)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Uscite
              </p>
              <p className="text-sm font-extrabold text-red-500">
                €{totUscite.toFixed(0)}
              </p>
            </div>
            <div className={`rounded-xl border shadow-sm p-3 text-center ${
              saldo >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Saldo
              </p>
              <p className={`text-sm font-extrabold ${saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {saldo >= 0 ? '+' : ''}€{Math.abs(saldo).toFixed(0)}
              </p>
            </div>
          </div>

          {/* Bar chart mensile */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center mb-3">
              <p className="text-xs font-semibold text-gray-700 flex-1">Andamento mensile</p>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />
                  Entrate
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />
                  Uscite
                </span>
              </div>
            </div>
            <div className="flex items-end gap-0.5" style={{ height: 80 }}>
              {months.map(({ key, label }) => {
                const e = byMonth[key]?.entrate ?? 0
                const u = byMonth[key]?.uscite  ?? 0
                const eH = Math.round((e / maxVal) * 100)
                const uH = Math.round((u / maxVal) * 100)
                return (
                  <div key={key} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full flex items-end gap-px" style={{ height: 64 }}>
                      <div
                        className="flex-1 bg-green-400 rounded-t transition-all"
                        style={{ height: `${eH}%`, minHeight: eH > 0 ? 2 : 0 }}
                      />
                      <div
                        className="flex-1 bg-red-400 rounded-t transition-all"
                        style={{ height: `${uH}%`, minHeight: uH > 0 ? 2 : 0 }}
                      />
                    </div>
                    <span className="text-[8px] text-gray-400 leading-none">{label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Breakdown categorie spese */}
          {byCategoria.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">Spese per categoria</p>
              <div className="space-y-3">
                {byCategoria.map(({ cat, tot }) => (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catBadge(cat)}`}>
                        {cat}
                      </span>
                      <span className="text-xs font-bold text-gray-700">
                        €{tot.toFixed(2)}
                        <span className="text-gray-400 font-normal ml-1">
                          ({totUscite > 0 ? Math.round((tot / totUscite) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400 rounded-full transition-all"
                        style={{ width: `${totUscite > 0 ? (tot / totUscite) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totEntrate === 0 && totUscite === 0 && (
            <p className="text-center text-sm text-gray-400 py-10">
              Nessun dato per {annoLabel}
            </p>
          )}
        </>
      )}
    </div>
  )

  // ── TAB SPESE ─────────────────────────────────────────────────────────────
  const tabSpese = (
    <div className="px-4 pb-28 space-y-2">
      {loadS ? <LoadingSpinner /> : spese.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-16">
          Nessuna spesa registrata per {annoLabel}
        </p>
      ) : (
        spese.map(s => (
          <div key={s.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catBadge(s.categoria)}`}>
                  {s.categoria}
                </span>
              </div>
              {s.descrizione && (
                <p className="text-xs text-gray-500 truncate">{s.descrizione}</p>
              )}
              <p className="text-[11px] text-gray-400 mt-0.5">
                {s.data ? format(parseISO(s.data), 'd MMM yyyy', { locale: it }) : '—'}
              </p>
            </div>
            <p className="text-sm font-bold text-gray-800 shrink-0">
              €{(s.importo ?? 0).toFixed(2)}
            </p>
            {canWrite && (
              <button onClick={() => handleDelete(s.id)}
                className="p-1.5 text-gray-300 hover:text-red-500 active:scale-95 transition-all shrink-0">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  )

  // ── TAB ENTRATE ───────────────────────────────────────────────────────────
  const tabEntrate = (
    <div className="px-4 pb-28 space-y-2">
      {loadE ? <LoadingSpinner /> : (
        <>
          {entrate.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-1">
              <p className="text-xs text-green-600 font-medium uppercase tracking-wider">
                Totale incassato
              </p>
              <p className="text-2xl font-extrabold text-green-700">
                € {totEntrate.toFixed(2)}
              </p>
            </div>
          )}
          {entrate.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-16">
              Nessuna entrata registrata per {annoLabel}
            </p>
          ) : (
            entrate.map(p => {
              const g = p.giocatori
              const dataPag = p.data_pagamento
                ? format(parseISO(p.data_pagamento), 'd MMM', { locale: it })
                : '—'
              return (
                <div key={p.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {g ? `${g.cognome} ${g.nome}` : '—'}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {p.descrizione ?? p.tipo}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-gray-400">{dataPag}</span>
                      {g?.squadra && (
                        <span className="text-[11px] text-gray-400">· {g.squadra}</span>
                      )}
                      {p.metodo_pagamento && (
                        <span className="text-[11px] text-gray-400">
                          · {METODO_LABEL[p.metodo_pagamento] ?? p.metodo_pagamento}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-900 shrink-0">
                    € {(p.importo ?? 0).toFixed(2)}
                  </p>
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )

  // ── Bottom sheet form nuova spesa ─────────────────────────────────────────
  const formSheet = showForm && (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Nuova spesa</h2>
          <button onClick={() => { setShowForm(false); setForm(FORM_EMPTY) }}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Importo (€) *</label>
            <input type="number" min="0.01" step="0.01" required className={inp}
              value={form.importo}
              onChange={e => setForm(f => ({ ...f, importo: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
            <input type="date" required className={inp}
              value={form.data}
              onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Categoria *</label>
            <input list="categorie-list" required className={inp}
              placeholder="Es. Affitto palestra"
              value={form.categoria}
              onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} />
            <datalist id="categorie-list">
              {categorie.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Descrizione</label>
            <input className={inp} placeholder="Note opzionali"
              value={form.descrizione}
              onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} />
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
            {saving ? 'Salvataggio...' : 'Salva spesa'}
          </button>
        </form>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Contabilità" subtitle="Bilancio entrate e uscite" />

      <TabBar>
        <TabBtn label="Bilancio" icon={Wallet}       active={tab === 'bilancio'} onClick={() => setTab('bilancio')} color="purple" />
        <TabBtn label="Spese"    icon={TrendingDown}  active={tab === 'spese'}    onClick={() => setTab('spese')}    color="purple" />
        <TabBtn label="Entrate"  icon={TrendingUp}    active={tab === 'entrate'}  onClick={() => setTab('entrate')}  color="purple" />
      </TabBar>

      {periodoControls}

      {tab === 'bilancio' && tabBilancio}
      {tab === 'spese'    && tabSpese}
      {tab === 'entrate'  && tabEntrate}

      {/* FAB: visibile solo nel tab Spese e solo per chi può scrivere */}
      {canWrite && tab === 'spese' && (
        <button onClick={() => setShowForm(true)}
          className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform">
          <Plus size={24} />
        </button>
      )}

      {formSheet}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/secretary/ContabilitaPage.jsx
git commit -m "feat: ContabilitaPage con tab Bilancio, Spese, Entrate"
```

---

## Task 4: Routing + Navigazione

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/layouts/SecretaryLayout.jsx`
- Modify: `frontend/src/layouts/DirigentLayout.jsx`

- [ ] **Step 1: Aggiungi l'import in `App.jsx`**

Dopo la riga che importa `ResocontoPage`, aggiungi:

```js
import ContabilitaPage   from './pages/secretary/ContabilitaPage'
```

- [ ] **Step 2: Aggiungi le route in `App.jsx`**

Nel blocco segreteria (dopo `<Route path="setup" ...>`), aggiungi:

```jsx
          <Route path="contabilita"     element={<ContabilitaPage />} />
```

Nel blocco dirigente (dopo `<Route path="economico" ...>`), aggiungi:

```jsx
          <Route path="contabilita"     element={<ContabilitaPage />} />
```

- [ ] **Step 3: Aggiorna `SecretaryLayout.jsx`**

Sostituisci il contenuto completo di `frontend/src/layouts/SecretaryLayout.jsx`:

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Bell, Receipt, Settings, Shield, UserPlus, TrendingUp } from 'lucide-react'
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
    { to: '/secretary/contabilita',             icon: TrendingUp,      label: 'Contabilità' },
    { to: '/secretary/bacheca',                 icon: Bell,            label: 'Bacheca', badge: unread },
    { to: '/secretary/impostazioni',            icon: Settings,        label: 'Impostazioni' },
    { to: '/secretary/setup',                   icon: UserPlus,        label: 'Setup' },
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
          <NavLink to="/secretary/contabilita" className={cls}>
            <TrendingUp size={22} strokeWidth={1.8} />
            <span className="text-xs font-medium">Contabilità</span>
          </NavLink>
        </div>
      </nav>
      <GuideDrawer />
    </div>
  )
}
```

> **Nota:** "Setup" rimane nel sidebar desktop ma è rimosso dalla barra mobile (sostituito da "Contabilità"). Setup è accessibile da desktop; la barra mobile ha 5 posti e Contabilità è più usata quotidianamente.

- [ ] **Step 4: Aggiorna `DirigentLayout.jsx`**

Sostituisci il contenuto completo di `frontend/src/layouts/DirigentLayout.jsx`:

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Bell, TrendingUp } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'
import GuideDrawer from '../components/GuideDrawer'
import AppSidebar from '../components/AppSidebar'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl min-w-[48px] ${
    isActive ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function DirigentLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)

  const sidebarItems = [
    { to: '/dirigente',               end: true, icon: LayoutDashboard, label: 'Panoramica' },
    { to: '/dirigente/contabilita',              icon: TrendingUp,       label: 'Contabilità' },
    { to: '/dirigente/bacheca',                  icon: Bell,             label: 'Bacheca', badge: unread },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar items={sidebarItems} accentColor="emerald" />
      <div className="pb-20 lg:pb-0 lg:pl-56"><Outlet /></div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/dirigente" end className={cls}>
            <LayoutDashboard size={22} strokeWidth={1.8} />
            <span className="text-xs font-medium">Panoramica</span>
          </NavLink>
          <NavLink to="/dirigente/contabilita" className={cls}>
            <TrendingUp size={22} strokeWidth={1.8} />
            <span className="text-xs font-medium">Contabilità</span>
          </NavLink>
          <NavLink to="/dirigente/bacheca" className={cls}>
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

> **Nota:** `/dirigente/economico` → `ResocontoPage` è mantenuta in App.jsx per non rompere eventuali link salvati, ma la voce nav "Economico" è sostituita da "Contabilità".

- [ ] **Step 5: Verifica avvio app senza errori**

```bash
cd frontend && npm run dev
```

Apri il browser su `http://localhost:5173`.
- Login come segreteria → barra mobile mostra "Contabilità" al posto di "Setup"
- Clicca "Contabilità" → si apre la pagina con 3 tab (Bilancio / Spese / Entrate)
- Toggle Anno solare/sportivo funziona
- Frecce avanti/indietro cambiano l'anno
- Tab Bilancio: KPI cards, bar chart, (breakdown vuoto se non ci sono spese)
- Tab Spese: FAB "+" visibile → tap apre bottom sheet con form
- Inserisci una spesa → appare nella lista
- Tab Entrate: mostra le quote pagate dell'anno
- Login come dirigente → voce "Contabilità" al posto di "Economico" → stessa pagina, no FAB "+"

- [ ] **Step 6: Commit finale**

```bash
git add frontend/src/App.jsx frontend/src/layouts/SecretaryLayout.jsx frontend/src/layouts/DirigentLayout.jsx
git commit -m "feat: routing e navigazione modulo contabilita"
git push origin master
```

---

## Self-review

**Spec coverage:**

| Requisito spec | Task che lo implementa |
|----------------|----------------------|
| Tabella `spese` con RLS | Task 1 |
| Categorie libere (datalist dinamico) | Task 3 — `categorie` query + `<datalist>` |
| Toggle anno solare/sportivo | Task 3 — `tipoAnno` state + `handleTipoAnno` |
| KPI cards entrate/uscite/saldo | Task 3 — `tabBilancio` |
| Bar chart mensile CSS | Task 3 — `byMonth` + div con height% |
| Breakdown spese per categoria | Task 3 — `byCategoria` + barre proporzionali |
| Lista spese con eliminazione | Task 3 — `tabSpese` + `handleDelete` |
| Form inserimento spesa | Task 3 — `formSheet` + `handleSave` |
| Tab Entrate read-only | Task 3 — `tabEntrate` + `useEntrate` hook |
| FAB solo per segreteria/admin | Task 3 — `canWrite` guard |
| Voce nav Contabilità segreteria | Task 4 — SecretaryLayout |
| Voce nav Contabilità dirigente | Task 4 — DirigentLayout |
| Route `/secretary/contabilita` | Task 4 — App.jsx |
| Route `/dirigente/contabilita` | Task 4 — App.jsx |
| `isDirigente` in useAuth | Task 2 |
| `useEntrate` hook riutilizzabile | Task 2 |

**Nessun placeholder trovato.** Tutti i blocchi di codice sono completi.

**Consistenza tipi:** `useEntrate` restituisce array con `importo`, `data_pagamento`, `giocatori` — tutti usati correttamente in `tabEntrate` e `byMonth`.
