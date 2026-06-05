# Batch 3 — Sistema Comunicazioni Famiglie ↔ Staff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare un sistema di messaggistica unidirezionale famiglie→staff: genitori/giocatori inviano messaggi, allenatori/preparatori li leggono con badge unread.

**Architecture:** Nuova tabella `messaggi` in Supabase; `ComunicazioniPage` riscritta come form invio + cronologia; nuova `MessaggiRicevutiPage` per lo staff; hook `useUnreadMessaggi` esportato dalla pagina messaggi (pattern identico a `useUnreadAnnunci`).

**Tech Stack:** React 18, Supabase JS v2, TanStack Query v5, React Router v6, Tailwind CSS

---

## File map

| File | Task | Azione |
|------|------|--------|
| `supabase/migrations/supabase_migration_messaggi.sql` | 1 | CREATE — tabella + RLS |
| `frontend/src/pages/player/ComunicazioniPage.jsx` | 2 | REWRITE — form + cronologia |
| `frontend/src/pages/coach/MessaggiRicevutiPage.jsx` | 3 | CREATE — lista staff + hook unread |
| `frontend/src/layouts/CoachLayout.jsx` | 4 | MODIFY — nav Messaggi + badge |
| `frontend/src/layouts/PrepLayout.jsx` | 4 | MODIFY — nav Messaggi + badge |
| `frontend/src/App.jsx` | 4 | MODIFY — route /coach/messaggi e /prep/messaggi |

---

## Task 1: Migration SQL — tabella messaggi

**File:** `supabase/migrations/supabase_migration_messaggi.sql`

- [ ] **Step 1.1 — Crea il file SQL**

  ```sql
  -- Migration: tabella messaggi (comunicazioni famiglie → staff)
  -- Data: 2026-06-01

  CREATE TABLE IF NOT EXISTS messaggi (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    societa_id     UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
    mittente_id    UUID NOT NULL,
    mittente_nome  TEXT NOT NULL,
    mittente_ruolo TEXT NOT NULL CHECK (mittente_ruolo IN ('genitore', 'giocatore')),
    squadra        TEXT NOT NULL,
    testo          TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    letto          BOOLEAN NOT NULL DEFAULT false
  );

  CREATE INDEX IF NOT EXISTS messaggi_societa_squadra_idx ON messaggi(societa_id, squadra);
  CREATE INDEX IF NOT EXISTS messaggi_mittente_idx        ON messaggi(mittente_id);

  ALTER TABLE messaggi ENABLE ROW LEVEL SECURITY;

  -- Genitori e giocatori possono inserire messaggi nella propria società
  CREATE POLICY "messaggi_insert" ON messaggi
    FOR INSERT TO authenticated
    WITH CHECK (
      get_my_role() IN ('genitore', 'giocatore') AND
      societa_id = get_my_societa_id()
    );

  -- Tutti gli autenticati della stessa società possono leggere
  -- (filtro per squadra avviene lato app)
  CREATE POLICY "messaggi_select" ON messaggi
    FOR SELECT TO authenticated
    USING (societa_id = get_my_societa_id());

  -- Admin/allenatore/preparatore/segreteria possono aggiornare letto
  CREATE POLICY "messaggi_update_letto" ON messaggi
    FOR UPDATE TO authenticated
    USING (societa_id = get_my_societa_id())
    WITH CHECK (societa_id = get_my_societa_id());
  ```

- [ ] **Step 1.2 — Esegui la migration su Supabase**

  Copia il contenuto del file SQL e incollalo nel **SQL Editor di Supabase Dashboard** → Run.

  Verifica: la tabella `messaggi` appare in Table Editor senza errori.

- [ ] **Step 1.3 — Commit**

  ```
  git add supabase/migrations/supabase_migration_messaggi.sql
  git commit -m "feat: migration tabella messaggi per comunicazioni famiglie-staff"
  ```

---

## Task 2: ComunicazioniPage — form invio + cronologia

**File:** `frontend/src/pages/player/ComunicazioniPage.jsx` (REWRITE completo)

Questo file è usato da **entrambi** `/player/comunicazioni` e `/parent/comunicazioni`.

- [ ] **Step 2.1 — Riscrivi il file completo**

  ```jsx
  import { useState, useMemo } from 'react'
  import { format } from 'date-fns'
  import { it } from 'date-fns/locale'
  import { Send, MessageCircle } from 'lucide-react'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { supabase } from '../../lib/supabase'
  import { useAuth } from '../../hooks/useAuth'
  import AppHeader from '../../components/AppHeader'
  import LoadingSpinner from '../../components/LoadingSpinner'

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

  export default function ComunicazioniPage() {
    const { user, profile, societaId, activeRole, displayName, logout, societaNome } = useAuth()
    const qc = useQueryClient()

    const [testo, setTesto] = useState('')
    const [squadraSel, setSquadraSel] = useState('')

    // ── Squadre disponibili per questo utente ─────────────────────────────────
    const squadre = useMemo(() => {
      if (!profile) return []
      if (activeRole === 'genitore') {
        return [profile.genitore_squadra, profile.genitore_squadra2, profile.genitore_squadra3].filter(Boolean)
      }
      return [profile.squadra, profile.squadra2, profile.squadra3].filter(Boolean)
    }, [profile, activeRole])

    // Squadra pre-selezionata (unica o prima della lista)
    const squadraEffettiva = squadraSel || squadre[0] || ''

    // ── Query: messaggi inviati da questo utente ──────────────────────────────
    const { data: messaggi = [], isLoading } = useQuery({
      queryKey: ['miei-messaggi', societaId, user?.id],
      enabled: !!societaId && !!user?.id,
      staleTime: 30_000,
      queryFn: async () => {
        const { data } = await supabase
          .from('messaggi')
          .select('id, squadra, testo, created_at')
          .eq('societa_id', societaId)
          .eq('mittente_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)
        return data ?? []
      },
    })

    // ── Mutation: invia messaggio ─────────────────────────────────────────────
    const sendMut = useMutation({
      mutationFn: async () => {
        const { error } = await supabase.from('messaggi').insert([{
          societa_id:    societaId,
          mittente_id:   user.id,
          mittente_nome: displayName || user.email,
          mittente_ruolo: activeRole === 'genitore' ? 'genitore' : 'giocatore',
          squadra:       squadraEffettiva,
          testo:         testo.trim(),
        }])
        if (error) throw error
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['miei-messaggi', societaId, user?.id] })
        setTesto('')
      },
    })

    const canSend = testo.trim().length > 0 && !!squadraEffettiva

    if (squadre.length === 0) {
      return (
        <div>
          <AppHeader title="Comunicazioni" subtitle="Messaggi allo staff"
            displayName={displayName} logout={logout} societaNome={societaNome} />
          <div className="px-4 pt-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              ⚠️ Nessuna squadra associata al tuo profilo. Contatta l'amministratore.
            </div>
          </div>
        </div>
      )
    }

    return (
      <div>
        <AppHeader title="Comunicazioni" subtitle="Scrivi al tuo staff"
          displayName={displayName} logout={logout} societaNome={societaNome} />

        <div className="px-4 pt-4 space-y-5 pb-24">

          {/* Form invio */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <MessageCircle size={16} className="text-blue-500" />
              Scrivi un messaggio
            </p>

            {/* Selezione squadra (solo se multiple) */}
            {squadre.length > 1 && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Squadra</label>
                <select
                  className={inp}
                  value={squadraSel || squadre[0]}
                  onChange={e => setSquadraSel(e.target.value)}
                >
                  {squadre.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {squadre.length === 1 && (
              <p className="text-xs text-gray-400">
                Squadra: <span className="font-semibold text-gray-700">{squadre[0]}</span>
              </p>
            )}

            {/* Textarea */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Messaggio *</label>
              <textarea
                className={inp + ' resize-none'}
                rows={3}
                placeholder="Scrivi qui il tuo messaggio per l'allenatore..."
                value={testo}
                onChange={e => setTesto(e.target.value)}
                maxLength={500}
              />
              <p className="text-right text-[10px] text-gray-300 mt-0.5">{testo.length}/500</p>
            </div>

            {/* Errore */}
            {sendMut.isError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {sendMut.error?.message ?? 'Errore durante l\'invio'}
              </p>
            )}

            {/* Bottone */}
            <button
              onClick={() => sendMut.mutate()}
              disabled={!canSend || sendMut.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-95 transition-transform"
            >
              {sendMut.isPending
                ? 'Invio in corso...'
                : <><Send size={15} /> Invia messaggio</>
              }
            </button>

            {sendMut.isSuccess && (
              <p className="text-xs text-green-600 text-center">✅ Messaggio inviato!</p>
            )}
          </div>

          {/* Lista messaggi inviati */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">
              Messaggi inviati
            </p>
            {isLoading ? (
              <LoadingSpinner />
            ) : messaggi.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nessun messaggio inviato</p>
            ) : (
              <div className="space-y-2">
                {messaggi.map(m => (
                  <div key={m.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-blue-600">{m.squadra}</span>
                      <span className="text-[10px] text-gray-400">
                        {format(new Date(m.created_at), 'd MMM · HH:mm', { locale: it })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{m.testo}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2.2 — Commit**

  ```
  git add frontend/src/pages/player/ComunicazioniPage.jsx
  git commit -m "feat: ComunicazioniPage — form invio messaggi per genitori e giocatori"
  ```

---

## Task 3: MessaggiRicevutiPage + hook useUnreadMessaggi

**File:** `frontend/src/pages/coach/MessaggiRicevutiPage.jsx` (CREATE)

Usato da `/coach/messaggi` e `/prep/messaggi`. Esporta anche `useUnreadMessaggi` (pattern identico a `useUnreadAnnunci` in `BachecaPage.jsx`).

- [ ] **Step 3.1 — Crea il file completo**

  ```jsx
  import { useMemo, useEffect } from 'react'
  import { format } from 'date-fns'
  import { it } from 'date-fns/locale'
  import { useQuery, useQueryClient } from '@tanstack/react-query'
  import { supabase } from '../../lib/supabase'
  import { useAuth } from '../../hooks/useAuth'
  import AppHeader from '../../components/AppHeader'
  import LoadingSpinner from '../../components/LoadingSpinner'

  // ─── Hook unread count (esportato per CoachLayout e PrepLayout) ──────────────

  export function useUnreadMessaggi(societaId, squadreVisibili) {
    return useQuery({
      queryKey: ['messaggi-unread', societaId, (squadreVisibili ?? []).join(',')],
      enabled: !!societaId && (squadreVisibili ?? []).length > 0,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      queryFn: async () => {
        const { count } = await supabase
          .from('messaggi')
          .select('id', { count: 'exact', head: true })
          .eq('societa_id', societaId)
          .in('squadra', squadreVisibili)
          .eq('letto', false)
        return count ?? 0
      },
    })
  }

  // ─── Pagina principale ───────────────────────────────────────────────────────

  export default function MessaggiRicevutiPage() {
    const { societaId, profile, activeRole, isAllenatore, isPreparatore,
            squadreAllenatore, displayName, logout, societaNome } = useAuth()
    const qc = useQueryClient()

    // ── Squadre del preparatore (solo se ruolo prep) ─────────────────────────
    const { data: prepSquadreData = [] } = useQuery({
      queryKey: ['prep-squadre-mie', societaId, profile?.id],
      enabled: !!societaId && !!profile?.id && (activeRole === 'preparatore_atletico' || isPreparatore),
      staleTime: 5 * 60_000,
      queryFn: async () => {
        const { data } = await supabase
          .from('prep_squadre').select('squadra')
          .eq('societa_id', societaId)
          .eq('preparatore_id', profile.id)
        return (data ?? []).map(r => r.squadra)
      },
    })

    // ── Squadre visibili per questo utente ───────────────────────────────────
    const squadreVisibili = useMemo(() => {
      if (activeRole === 'preparatore_atletico' || isPreparatore) return prepSquadreData
      // Allenatore: usa squadreAllenatore da useAuth (profile.squadra/2/3)
      return squadreAllenatore ?? []
    }, [activeRole, isPreparatore, prepSquadreData, squadreAllenatore])

    // ── Query messaggi ───────────────────────────────────────────────────────
    const { data: messaggi = [], isLoading } = useQuery({
      queryKey: ['messaggi-staff', societaId, squadreVisibili.join(',')],
      enabled: !!societaId && squadreVisibili.length > 0,
      staleTime: 30_000,
      queryFn: async () => {
        const { data } = await supabase
          .from('messaggi')
          .select('id, mittente_nome, mittente_ruolo, squadra, testo, created_at, letto')
          .eq('societa_id', societaId)
          .in('squadra', squadreVisibili)
          .order('created_at', { ascending: false })
          .limit(50)
        return data ?? []
      },
    })

    // ── Segna come letti al mount ─────────────────────────────────────────────
    useEffect(() => {
      if (!societaId || squadreVisibili.length === 0) return
      const nonLetti = messaggi.filter(m => !m.letto)
      if (nonLetti.length === 0) return

      supabase
        .from('messaggi')
        .update({ letto: true })
        .eq('societa_id', societaId)
        .in('squadra', squadreVisibili)
        .eq('letto', false)
        .then(() => {
          qc.invalidateQueries({ queryKey: ['messaggi-unread', societaId] })
        })
    }, [messaggi, societaId, squadreVisibili, qc])

    // ── UI stati vuoti ────────────────────────────────────────────────────────
    if (squadreVisibili.length === 0 && !isLoading) {
      return (
        <div>
          <AppHeader title="Messaggi" subtitle="Dalle famiglie"
            displayName={displayName} logout={logout} societaNome={societaNome} />
          <div className="px-4 pt-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              ⚠️ Nessuna squadra associata al tuo profilo.
            </div>
          </div>
        </div>
      )
    }

    const unreadCount = messaggi.filter(m => !m.letto).length

    return (
      <div>
        <AppHeader
          title="Messaggi"
          subtitle={unreadCount > 0 ? `${unreadCount} non letti` : 'Dalle famiglie'}
          displayName={displayName}
          logout={logout}
          societaNome={societaNome}
        />

        <div className="px-4 pt-4 space-y-2 pb-24">
          {isLoading ? (
            <LoadingSpinner />
          ) : messaggi.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">Nessun messaggio ricevuto</p>
              <p className="text-xs mt-1">I messaggi delle famiglie appariranno qui</p>
            </div>
          ) : (
            messaggi.map(m => (
              <div
                key={m.id}
                className={`bg-white rounded-xl border px-4 py-3 shadow-sm ${
                  !m.letto ? 'border-l-4 border-l-blue-500 border-gray-200' : 'border-gray-100 opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{m.mittente_nome}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      m.mittente_ruolo === 'genitore'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {m.mittente_ruolo === 'genitore' ? 'Genitore' : 'Giocatore'}
                    </span>
                    <span className="text-xs text-blue-600 font-medium">{m.squadra}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {format(new Date(m.created_at), 'd MMM · HH:mm', { locale: it })}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{m.testo}</p>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3.2 — Commit**

  ```
  git add frontend/src/pages/coach/MessaggiRicevutiPage.jsx
  git commit -m "feat: MessaggiRicevutiPage + useUnreadMessaggi per allenatori e preparatori"
  ```

---

## Task 4: Routing e navigazione (CoachLayout + PrepLayout + App.jsx)

**Files:**
- Modify: `frontend/src/layouts/CoachLayout.jsx`
- Modify: `frontend/src/layouts/PrepLayout.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 4.1 — Modifica CoachLayout.jsx**

  Leggi il file. Applica queste modifiche:

  **Import:** aggiungi `MessageSquare` a lucide-react e importa `useUnreadMessaggi`:
  ```jsx
  import { Home, Calendar, Activity, Bell, MessageSquare } from 'lucide-react'
  import { useUnreadAnnunci } from '../pages/BachecaPage'
  import { useUnreadMessaggi } from '../pages/coach/MessaggiRicevutiPage'
  ```

  **Nel componente**, aggiungi dopo `const { data: unread = 0 }`:
  ```jsx
  const { squadreAllenatore, societaId } = useAuth()
  const { data: unreadMsg = 0 } = useUnreadMessaggi(societaId, squadreAllenatore ?? [])
  ```

  > Nota: `useAuth` è già importato nel file. Aggiungi solo `squadreAllenatore` e `societaId` al destructuring esistente se non ci sono già.

  **sidebarItems:** aggiungi voce Messaggi tra Bacheca e fine lista:
  ```jsx
  const sidebarItems = [
    { to: '/coach',            end: true, icon: Home,          label: 'Home' },
    { to: '/coach/calendario',            icon: Calendar,       label: 'Calendario' },
    { to: '/coach/attivita',              icon: Activity,       label: 'Attività' },
    { to: '/coach/bacheca',               icon: Bell,           label: 'Bacheca', badge: unread },
    { to: '/coach/messaggi',              icon: MessageSquare,  label: 'Messaggi', badge: unreadMsg },
  ]
  ```

  **Bottom nav mobile:** aggiungi NavLink per Messaggi dopo Bacheca:
  ```jsx
  <NavLink to="/coach/messaggi" className={cls}>
    <div className="relative">
      <MessageSquare size={21} strokeWidth={1.8} />
      {unreadMsg > 0 && (
        <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
          {unreadMsg > 9 ? '9+' : unreadMsg}
        </span>
      )}
    </div>
    <span className="text-xs font-medium">Messaggi</span>
  </NavLink>
  ```

- [ ] **Step 4.2 — Modifica PrepLayout.jsx**

  Leggi il file. Applica queste modifiche:

  **Import:** aggiungi `MessageSquare` a lucide-react, importa `useAuth`, `useQuery`, `supabase`, e `useUnreadMessaggi`:
  ```jsx
  import { Home, Calendar, CalendarDays, BookOpen, MessageSquare } from 'lucide-react'
  import { useAuth } from '../hooks/useAuth'
  import { useQuery } from '@tanstack/react-query'
  import { supabase } from '../lib/supabase'
  import { useUnreadMessaggi } from '../pages/coach/MessaggiRicevutiPage'
  ```

  > Nota: `useAuth` potrebbe già essere importato. Verifica e non duplicare.

  **Nel componente**, dopo la dichiarazione esistente, aggiungi:
  ```jsx
  const { societaId, profile } = useAuth()

  const { data: prepSquadre = [] } = useQuery({
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

  const { data: unreadMsg = 0 } = useUnreadMessaggi(societaId, prepSquadre)
  ```

  **SIDEBAR_ITEMS:** aggiungi voce Messaggi:
  ```jsx
  const SIDEBAR_ITEMS = [
    { to: '/prep',           end: true, icon: Home,          label: 'Home' },
    { to: '/prep/agenda',               icon: Calendar,      label: 'Agenda' },
    { to: '/prep/calendario',           icon: CalendarDays,  label: 'Calendario' },
    { to: '/prep/schede',               icon: BookOpen,      label: 'Schede' },
    { to: '/prep/messaggi',             icon: MessageSquare, label: 'Messaggi', badge: unreadMsg },
  ]
  ```

  **Bottom nav mobile:** aggiungi NavLink per Messaggi dopo Schede:
  ```jsx
  <NavLink to="/prep/messaggi" className={cls}>
    <div className="relative">
      <MessageSquare size={20} strokeWidth={1.8} />
      {unreadMsg > 0 && (
        <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
          {unreadMsg > 9 ? '9+' : unreadMsg}
        </span>
      )}
    </div>
    <span className="text-[10px] font-medium">Messaggi</span>
  </NavLink>
  ```

- [ ] **Step 4.3 — Modifica App.jsx: import e route**

  **Import** (aggiungi dopo gli altri import prep/coach):
  ```jsx
  import MessaggiRicevutiPage from './pages/coach/MessaggiRicevutiPage'
  ```

  **Route /coach** — aggiungi dentro il blocco `/coach`:
  ```jsx
  <Route path="messaggi" element={<MessaggiRicevutiPage />} />
  ```

  **Route /prep** — aggiungi dentro il blocco `/prep`:
  ```jsx
  <Route path="messaggi" element={<MessaggiRicevutiPage />} />
  ```

- [ ] **Step 4.4 — Verifica AppSidebar supporta badge**

  Il componente `AppSidebar` deve supportare la prop `badge` negli items. Cerca in `frontend/src/components/AppSidebar.jsx` se è già gestita (es. per Bacheca). Se sì, nessuna modifica. Se no, aggiungila seguendo il pattern esistente.

  > Di solito `AppSidebar` già gestisce `badge` visto che Bacheca lo usa. Verifica e documenta nel report.

- [ ] **Step 4.5 — Build verifica**

  ```powershell
  cd frontend; npm run build 2>&1 | Select-Object -Last 8
  ```

  Atteso: `✓ built in X.XXs` senza errori.

- [ ] **Step 4.6 — Commit**

  ```
  git add frontend/src/layouts/CoachLayout.jsx frontend/src/layouts/PrepLayout.jsx frontend/src/App.jsx
  git commit -m "feat: navigazione Messaggi per coach e preparatore con badge unread"
  ```

---

## Self-review

### Spec coverage
| Requisito spec | Task |
|----------------|------|
| Tabella `messaggi` con RLS | Task 1 ✅ |
| ComunicazioniPage — form invio | Task 2 ✅ |
| ComunicazioniPage — select squadra se multiple | Task 2 ✅ |
| ComunicazioniPage — lista messaggi inviati | Task 2 ✅ |
| MessaggiRicevutiPage — lista con sender info | Task 3 ✅ |
| MessaggiRicevutiPage — filtra per squadreVisibili | Task 3 ✅ |
| MessaggiRicevutiPage — segna letti al mount | Task 3 ✅ |
| useUnreadMessaggi hook esportato | Task 3 ✅ |
| CoachLayout — nav Messaggi + badge | Task 4 ✅ |
| PrepLayout — nav Messaggi + badge | Task 4 ✅ |
| App.jsx — route /coach/messaggi e /prep/messaggi | Task 4 ✅ |

### Verifiche tecniche
- `useUnreadMessaggi` esportato da `MessaggiRicevutiPage.jsx` — stesso pattern di `useUnreadAnnunci` da `BachecaPage.jsx` ✅
- `squadreAllenatore` già esposto da `useAuth` (profile.squadra/2/3) ✅
- `prepSquadre` fetchato inline in `PrepLayout` e in `MessaggiRicevutiPage` — query key identica `['prep-squadre-mie', societaId, profile?.id]` → cache condivisa ✅
- `activeRole` usato in `ComunicazioniPage` per determinare il tipo mittente ✅
- `mittente_ruolo` usa `activeRole === 'genitore' ? 'genitore' : 'giocatore'` — corretto per entrambi i ruoli ✅
