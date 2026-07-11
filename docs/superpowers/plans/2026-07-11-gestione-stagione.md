# Gestione Stagione e Turnover Roster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre il concetto di stagione sportiva nel database, rendere reale il blocco d'accesso per chi lascia la società (oggi solo cosmetico), e costruire una schermata "Nuova Stagione" per gestire in blocco il turnover di giocatori/allenatori a inizio anno.

**Architecture:** Migrazione SQL che aggiunge `profiles.attivo` (difensiva, già in uso in produzione), `societa.stagione_corrente` e un campo `stagione` su calendario/orario_fisso/presenze_allenamento/quote, auto-compilato da un trigger `BEFORE INSERT` (nessuna modifica ai punti di insert nel frontend). L'enforcement dell'accesso passa dal ban dell'utente Supabase Auth (stessa API già usata per l'eliminazione utenti), non da RLS. Il wizard "Nuova Stagione" è una nuova pagina React che riusa i pattern di mutation già presenti in `SetupPage.jsx`.

**Tech Stack:** React 19 + Vite + Tailwind, Supabase (Postgres + Auth + RLS), @tanstack/react-query, react-router-dom v7.

**Nota sui test:** questo repo non ha un test runner frontend (nessun vitest/jest in `package.json`) né test automatici per le pagine React — ogni feature finora è stata verificata manualmente (Supabase SQL Editor + click-through). Questo piano segue la stessa convenzione: ogni task ha uno step di verifica concreto (query SQL con risultato atteso, o percorso UI con comportamento atteso) al posto di un test automatico.

**Fuori scope (esplicito):**
- Filtro per stagione sulle viste esistenti (calendario, presenze, quote) — non serve: sono già scopate per data o sono "stato corrente" senza storico (vedi note di esplorazione sopra).
- Riattivazione di un giocatore/allenatore già disattivato (nessuna UI per questo oggi neanche per lo staff) — resta un'azione manuale via Supabase, non costruita in questo piano.
- Fatturazione/abbonamento (deciso in fase di brainstorming).
- Storico squadra-per-stagione per i giocatori (deciso in fase di brainstorming).

---

### Task 1: Migrazione SQL — colonne, backfill, trigger

**Files:**
- Create: `supabase/migrations/supabase_migration_stagione_turnover.sql`

- [ ] **Step 1: Scrivi la migrazione**

```sql
-- ============================================================
-- MIGRAZIONE: Stagione sportiva + turnover roster
-- Esegui nel SQL Editor di Supabase
-- ============================================================

-- ── 1. Colonne base ────────────────────────────────────────────
-- profiles.attivo è già in uso in produzione (SetupPage.jsx lo legge/scrive)
-- ma non esiste in nessuna migrazione tracciata: la aggiungiamo qui in modo
-- difensivo (IF NOT EXISTS) così la migrazione è idempotente ovunque venga eseguita.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attivo BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE societa  ADD COLUMN IF NOT EXISTS stagione_corrente TEXT NOT NULL DEFAULT '2025/2026';

ALTER TABLE calendario           ADD COLUMN IF NOT EXISTS stagione TEXT;
ALTER TABLE orario_fisso         ADD COLUMN IF NOT EXISTS stagione TEXT;
ALTER TABLE presenze_allenamento ADD COLUMN IF NOT EXISTS stagione TEXT;
ALTER TABLE quote                ADD COLUMN IF NOT EXISTS stagione TEXT;

-- ── 2. Backfill: tagga le righe esistenti con la stagione corrente della loro società ──
UPDATE calendario c SET stagione = s.stagione_corrente
  FROM societa s WHERE c.societa_id = s.id AND c.stagione IS NULL;
UPDATE orario_fisso o SET stagione = s.stagione_corrente
  FROM societa s WHERE o.societa_id = s.id AND o.stagione IS NULL;
UPDATE presenze_allenamento p SET stagione = s.stagione_corrente
  FROM societa s WHERE p.societa_id = s.id AND p.stagione IS NULL;
UPDATE quote q SET stagione = s.stagione_corrente
  FROM societa s WHERE q.societa_id = s.id AND q.stagione IS NULL;

-- ── 3. Trigger: ogni nuova riga eredita la stagione corrente della società, se non specificata ──
CREATE OR REPLACE FUNCTION set_stagione_from_societa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stagione IS NULL THEN
    SELECT stagione_corrente INTO NEW.stagione FROM societa WHERE id = NEW.societa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_stagione_calendario ON calendario;
CREATE TRIGGER trg_stagione_calendario
  BEFORE INSERT ON calendario
  FOR EACH ROW EXECUTE FUNCTION set_stagione_from_societa();

DROP TRIGGER IF EXISTS trg_stagione_orario_fisso ON orario_fisso;
CREATE TRIGGER trg_stagione_orario_fisso
  BEFORE INSERT ON orario_fisso
  FOR EACH ROW EXECUTE FUNCTION set_stagione_from_societa();

DROP TRIGGER IF EXISTS trg_stagione_presenze ON presenze_allenamento;
CREATE TRIGGER trg_stagione_presenze
  BEFORE INSERT ON presenze_allenamento
  FOR EACH ROW EXECUTE FUNCTION set_stagione_from_societa();

DROP TRIGGER IF EXISTS trg_stagione_quote ON quote;
CREATE TRIGGER trg_stagione_quote
  BEFORE INSERT ON quote
  FOR EACH ROW EXECUTE FUNCTION set_stagione_from_societa();
```

- [ ] **Step 2: Esegui la migrazione su Supabase SQL Editor**

Incolla il contenuto del file nel SQL Editor del progetto Supabase collegato ed esegui.

- [ ] **Step 3: Verifica — colonne e backfill**

Esegui su Supabase SQL Editor:

```sql
SELECT nome, stagione_corrente FROM societa;
```
Atteso: una riga per società, tutte con `'2025/2026'`.

```sql
SELECT stagione, count(*) FROM quote GROUP BY stagione;
SELECT stagione, count(*) FROM calendario GROUP BY stagione;
```
Atteso: nessuna riga con `stagione` NULL (se le tabelle hanno dati).

- [ ] **Step 4: Verifica — trigger su nuovo insert**

Esegui (sostituendo `<societa_id_reale>` con un id esistente da `SELECT id FROM societa LIMIT 1;`):

```sql
INSERT INTO quote (societa_id, giocatore_id, tipo, importo)
VALUES ('<societa_id_reale>', (SELECT id FROM giocatori WHERE societa_id = '<societa_id_reale>' LIMIT 1), 'altro', 1)
RETURNING stagione;
```
Atteso: la colonna `stagione` restituita è valorizzata automaticamente (es. `2025/2026`), non NULL, senza averla specificata nell'INSERT. Poi elimina la riga di test:

```sql
DELETE FROM quote WHERE importo = 1 AND tipo = 'altro' AND note IS NULL;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/supabase_migration_stagione_turnover.sql
git commit -m "feat(db): aggiungi stagione sportiva e attivo profiles con trigger auto-tag

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: useAuth — esponi stagione corrente e blocco account disattivato

**Files:**
- Modify: `frontend/src/hooks/useAuth.jsx`

- [ ] **Step 1: Estendi la select del profilo per includere `attivo` e `stagione_corrente`**

In `fetchProfile`, sostituisci la query (riga 29-33):

```js
        const query = supabase
          .from('profiles')
          .select('id, nome, cognome, ruolo, ruoli_extra, societa_id, email, squadra, squadra2, squadra3, genitore_squadra, genitore_squadra2, genitore_squadra3, societa:societa_id(nome)')
          .eq('id', userId)
          .single()
```

con:

```js
        const query = supabase
          .from('profiles')
          .select('id, nome, cognome, ruolo, ruoli_extra, societa_id, email, squadra, squadra2, squadra3, genitore_squadra, genitore_squadra2, genitore_squadra3, attivo, societa:societa_id(nome, stagione_corrente)')
          .eq('id', userId)
          .single()
```

- [ ] **Step 2: Aggiungi lo stato `accountDisattivato`**

Subito dopo la riga `const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)` aggiungi:

```js
  const [accountDisattivato, setAccountDisattivato] = useState(false)
```

- [ ] **Step 3: Applica il gate nel primo `useEffect` (sessione iniziale)**

Sostituisci:

```js
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        setProfile(p)
      }
```

con:

```js
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        if (p?.attivo === false) {
          await supabase.auth.signOut()
          setAccountDisattivato(true)
          setProfile(null)
        } else {
          setProfile(p)
        }
      }
```

- [ ] **Step 4: Applica il gate nel secondo `useEffect` (onAuthStateChange)**

Sostituisci:

```js
      setUser(session?.user ?? null)
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        // Se fetchProfile ritorna null (errore transitorio), mantieni il profilo precedente
        // per evitare la schermata "profilo non configurato" su re-auth/refresh
        setProfile(prev => (p != null ? p : prev))
      } else {
```

con:

```js
      setUser(session?.user ?? null)
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        if (p?.attivo === false) {
          await supabase.auth.signOut()
          setAccountDisattivato(true)
          setProfile(null)
        } else {
          // Se fetchProfile ritorna null (errore transitorio), mantieni il profilo precedente
          // per evitare la schermata "profilo non configurato" su re-auth/refresh
          setProfile(prev => (p != null ? p : prev))
        }
      } else {
```

- [ ] **Step 5: Resetta il flag su nuovo login e aggiungi il clear**

Subito dopo `function clearPasswordRecovery() { setIsPasswordRecovery(false) }` aggiungi:

```js
  function clearAccountDisattivato() {
    setAccountDisattivato(false)
  }
```

Nella funzione `login`, resetta il flag a inizio funzione:

```js
  async function login(email, password) {
    setAccountDisattivato(false)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }
```

- [ ] **Step 6: Esponi i nuovi campi nel context value**

Nell'oggetto `value`, aggiungi (vicino a `societaNome`):

```js
    stagioneCorrente: profile?.societa?.stagione_corrente ?? null,
```

e (vicino a `isPasswordRecovery, clearPasswordRecovery,`):

```js
    accountDisattivato,
    clearAccountDisattivato,
```

- [ ] **Step 7: Verifica manuale**

Avvia il frontend (`npm run dev` in `frontend/`). Su Supabase SQL Editor, disattiva temporaneamente un utente di test già loggato nel browser:

```sql
UPDATE profiles SET attivo = false WHERE email = '<email_di_test>';
```

Ricarica la pagina nel browser dov'è loggato quell'utente: atteso, l'utente viene disconnesso automaticamente (nessuna schermata "Account disattivato" ancora — arriva nel Task 3, per ora basta verificare che *non resti loggato* e che `supabase.auth.getSession()` in console risulti null). Poi ripristina:

```sql
UPDATE profiles SET attivo = true WHERE email = '<email_di_test>';
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/useAuth.jsx
git commit -m "feat(auth): blocca sessione quando profiles.attivo diventa false

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Schermata "Account disattivato"

**Files:**
- Create: `frontend/src/pages/AccountDisattivatoPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Crea la pagina**

```jsx
export default function AccountDisattivatoPage({ onDone }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🚫</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Account disattivato</h1>
        <p className="text-sm text-gray-500 mb-6">
          Il tuo accesso è stato disattivato dalla società. Se pensi sia un errore, contatta la segreteria o il responsabile.
        </p>
        <button
          onClick={onDone}
          className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform"
        >
          Torna al login
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Collega la pagina in `App.jsx`**

Aggiungi l'import vicino agli altri import di pagine top-level:

```js
import AccountDisattivatoPage from './pages/AccountDisattivatoPage'
```

Modifica la destrutturazione in `AppShell` (riga 130):

```js
  const { user, loading, isSuperAdmin, isPasswordRecovery, clearPasswordRecovery, accountDisattivato, clearAccountDisattivato } = useAuth()
```

Subito dopo `if (isPasswordRecovery) return <NuovaPasswordPage onDone={clearPasswordRecovery} />` (riga 137), aggiungi:

```js
  if (accountDisattivato) return <AccountDisattivatoPage onDone={clearAccountDisattivato} />
```

- [ ] **Step 3: Verifica manuale**

Ripeti la verifica del Task 2 Step 7 (disattiva `attivo` per un utente loggato, ricarica). Atteso questa volta: appare la schermata "Account disattivato" con il bottone "Torna al login", che riporta alla pagina di login.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AccountDisattivatoPage.jsx frontend/src/App.jsx
git commit -m "feat(auth): schermata account disattivato

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Enforcement reale sul toggle "Disabilita utente" esistente

**Files:**
- Modify: `frontend/src/pages/SetupPage.jsx:880-886`

Oggi il bottone "Disabilita utente" nella tab Utenti di Setup imposta solo `profiles.attivo`, senza bloccare davvero l'accesso (il gate del Task 2 lo blocca al prossimo refresh/scadenza token, ma vogliamo anche invalidare subito la sessione lato Supabase Auth). `supabaseAdmin` è già importato in questo file (usato da `deleteMut` per `supabaseAdmin.auth.admin.deleteUser`).

- [ ] **Step 1: Estendi `disabledMut`**

Sostituisci:

```js
  const disabledMut = useMutation({
    mutationFn: async ({ id, attivo }) => {
      const { error } = await supabase.from('profiles').update({ attivo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-utenti', societaId] }),
  })
```

con:

```js
  const disabledMut = useMutation({
    mutationFn: async ({ id, attivo }) => {
      const { error } = await supabase.from('profiles').update({ attivo }).eq('id', id)
      if (error) throw error
      if (supabaseAdmin) {
        const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
          ban_duration: attivo ? 'none' : '87600h',
        })
        if (banErr) console.warn('Blocco/sblocco accesso auth fallito:', banErr.message)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-utenti', societaId] }),
  })
```

Nota: `ban_duration: '87600h'` (~10 anni) è il modo standard con cui l'Admin API di Supabase implementa un ban "indefinito" (non esiste un valore letterale "per sempre"); `'none'` rimuove il ban.

- [ ] **Step 2: Verifica manuale**

Da Setup → Utenti (super_admin o admin), clicca "Disabilita utente" su un account di test **diverso** da quello con cui sei loggato. Poi, in una finestra in incognito, prova a fare login con le credenziali di quell'utente: atteso, login rifiutato da Supabase Auth (errore tipo "User is banned"). Poi clicca "Abilita utente" e ripeti il login: atteso, login riuscito.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SetupPage.jsx
git commit -m "fix(auth): il toggle disabilita utente blocca davvero l'accesso (ban Supabase Auth)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Pagina "Nuova Stagione" — dati e struttura

**Files:**
- Create: `frontend/src/pages/admin/NuovaStagionePage.jsx`

- [ ] **Step 1: Scaffolding con le query dati**

```jsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, supabaseAdmin } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/ui/ToastProvider'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

function suggestNextStagione(corrente) {
  const m = /^(\d{4})\/(\d{4})$/.exec(corrente ?? '')
  if (!m) return ''
  return `${Number(m[1]) + 1}/${Number(m[2]) + 1}`
}

export default function NuovaStagionePage() {
  const { societaId, displayName, logout, societaNome, stagioneCorrente } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [azioni, setAzioni] = useState({}) // { [key]: { action: 'resta'|'cambia'|'lascia', squadra, squadra2, squadra3 } }
  const [nuovaStagione, setNuovaStagione] = useState('')
  const [step, setStep] = useState('lista') // 'lista' | 'riepilogo'
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)

  const { data: squadre = [] } = useQuery({
    queryKey: ['squadre-nomi-stagione', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(s => s.categoria)
    },
  })

  const { data: giocatori = [], isLoading: loadingG } = useQuery({
    queryKey: ['nuova-stagione-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, user_id')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  const { data: allenatori = [], isLoading: loadingA } = useQuery({
    queryKey: ['nuova-stagione-allenatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, cognome, email, ruolo, ruoli_extra, squadra, squadra2, squadra3')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .not('ruolo', 'in', '("giocatore","genitore","super_admin")')
        .order('cognome').order('nome')
      return (data ?? []).filter(u => [u.ruolo, ...(u.ruoli_extra ?? [])].includes('allenatore'))
    },
  })

  const isLoading = loadingG || loadingA

  function getAzione(key) {
    return azioni[key] ?? { action: 'resta' }
  }
  function setAzione(key, patch) {
    setAzioni(prev => ({ ...prev, [key]: { ...getAzione(key), ...patch } }))
  }

  if (isLoading) return (
    <div>
      <AppHeader title="Nuova Stagione" subtitle={societaNome} displayName={displayName} logout={logout} societaNome={societaNome} />
      <div className="pt-8"><LoadingSpinner /></div>
    </div>
  )

  // Step "riepilogo" e "lista" nei prossimi task
  return null
}
```

- [ ] **Step 2: Verifica manuale**

Aggiungi temporaneamente `console.log({ giocatori, allenatori, squadre, stagioneCorrente })` prima del `return null`, apri `/admin/setup/nuova-stagione` nel browser (routing arriva nel Task 7 — nel frattempo importa e monta il componente direttamente in una route di test, o rimanda questa verifica dopo il Task 7). Atteso: gli array contengono i giocatori/allenatori attivi della società con `societa_id` corretto e `stagioneCorrente` valorizzata (es. `"2025/2026"`). Rimuovi il `console.log` prima di committare.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/NuovaStagionePage.jsx
git commit -m "feat(setup): scaffolding pagina Nuova Stagione con query giocatori/allenatori/squadre

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Pagina "Nuova Stagione" — lista con azioni e riepilogo

**Files:**
- Modify: `frontend/src/pages/admin/NuovaStagionePage.jsx`

- [ ] **Step 1: Componente riga persona (resta/cambia/lascia)**

Aggiungi sopra `export default function NuovaStagionePage()`:

```jsx
function PersonaRow({ nome, squadraLabel, azione, squadre, onAzione }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{nome}</p>
          <p className="text-xs text-gray-400 truncate">{squadraLabel || '—'}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {[
            { val: 'resta',  label: 'Resta' },
            { val: 'cambia', label: 'Cambia' },
            { val: 'lascia', label: 'Ha lasciato' },
          ].map(({ val, label }) => (
            <button
              key={val}
              type="button"
              onClick={() => onAzione({ action: val })}
              className={`text-[11px] px-2 py-1 rounded-lg font-medium border transition-colors ${
                azione.action === val
                  ? val === 'lascia' ? 'bg-red-500 text-white border-red-500'
                    : val === 'cambia' ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {azione.action === 'cambia' && (
        <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-1.5">
          {['squadra', 'squadra2', 'squadra3'].map((campo, i) => (
            <select
              key={campo}
              value={azione[campo] ?? ''}
              onChange={e => onAzione({ [campo]: e.target.value })}
              className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white"
            >
              <option value="">{i === 0 ? '— Squadra —' : '— (opzionale) —'}</option>
              {squadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Aggiungi `handleConferma`**

Prima del `return null` (o del blocco `if (isLoading)`, se già rimosso), aggiungi:

```js
  async function handleConferma() {
    setSaving(true)
    setErrors([])
    const errs = []

    for (const g of giocatori) {
      const az = getAzione(`g-${g.id}`)
      if (az.action === 'lascia') {
        const { error } = await supabase.from('giocatori').update({ attivo: false }).eq('id', g.id)
        if (error) errs.push(`${g.cognome} ${g.nome}: ${error.message}`)
        if (g.user_id) {
          await supabase.from('profiles').update({ attivo: false }).eq('id', g.user_id)
          if (supabaseAdmin) {
            const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(g.user_id, { ban_duration: '87600h' })
            if (banErr) errs.push(`${g.cognome} ${g.nome} (blocco accesso): ${banErr.message}`)
          }
        }
      } else if (az.action === 'cambia') {
        const patch = { squadra: az.squadra || g.squadra, squadra2: az.squadra2 || null, squadra3: az.squadra3 || null }
        const { error } = await supabase.from('giocatori').update(patch).eq('id', g.id)
        if (error) errs.push(`${g.cognome} ${g.nome}: ${error.message}`)
        if (g.user_id) {
          await supabase.from('profiles').update(patch).eq('id', g.user_id)
        }
      }
    }

    for (const a of allenatori) {
      const az = getAzione(`a-${a.id}`)
      if (az.action === 'lascia') {
        const { error } = await supabase.from('profiles').update({ attivo: false }).eq('id', a.id)
        if (error) errs.push(`${a.cognome} ${a.nome}: ${error.message}`)
        if (supabaseAdmin) {
          const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(a.id, { ban_duration: '87600h' })
          if (banErr) errs.push(`${a.cognome} ${a.nome} (blocco accesso): ${banErr.message}`)
        }
      } else if (az.action === 'cambia') {
        const patch = { squadra: az.squadra || null, squadra2: az.squadra2 || null, squadra3: az.squadra3 || null }
        const { error } = await supabase.from('profiles').update(patch).eq('id', a.id)
        if (error) errs.push(`${a.cognome} ${a.nome}: ${error.message}`)
      }
    }

    const { error: sErr } = await supabase.from('societa').update({ stagione_corrente: nuovaStagione.trim() }).eq('id', societaId)
    if (sErr) errs.push(`Stagione: ${sErr.message}`)

    qc.invalidateQueries({ queryKey: ['nuova-stagione-giocatori', societaId] })
    qc.invalidateQueries({ queryKey: ['nuova-stagione-allenatori', societaId] })
    qc.invalidateQueries({ queryKey: ['setup-utenti', societaId] })
    qc.invalidateQueries({ queryKey: ['setup-utenti-staff', societaId] })

    setSaving(false)
    if (errs.length === 0) {
      toast.success(`Stagione ${nuovaStagione.trim()} avviata`)
      navigate('/admin/setup')
    } else {
      setErrors(errs)
    }
  }
```

- [ ] **Step 3: Sostituisci il `return null` con la vista "lista"**

```jsx
  const cambi = useMemo(() => {
    let resta = 0, cambia = 0, lascia = 0
    for (const g of giocatori) {
      const a = getAzione(`g-${g.id}`).action
      if (a === 'cambia') cambia++; else if (a === 'lascia') lascia++; else resta++
    }
    for (const a of allenatori) {
      const az = getAzione(`a-${a.id}`).action
      if (az === 'cambia') cambia++; else if (az === 'lascia') lascia++; else resta++
    }
    return { resta, cambia, lascia }
  }, [azioni, giocatori, allenatori])

  const header = (
    <AppHeader title="Nuova Stagione" subtitle={`Stagione corrente: ${stagioneCorrente ?? '—'}`}
      displayName={displayName} logout={logout} societaNome={societaNome} />
  )

  if (step === 'riepilogo') {
    return (
      <div>
        {header}
        <div className="px-4 pt-4 pb-8 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-900">Riepilogo modifiche</p>
            <p className="text-sm text-gray-600">✅ {cambi.resta} restano</p>
            <p className="text-sm text-gray-600">🔁 {cambi.cambia} cambiano squadra</p>
            <p className="text-sm text-gray-600">🚪 {cambi.lascia} hanno lasciato</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Nuova stagione</label>
            <input
              value={nuovaStagione}
              onChange={e => setNuovaStagione(e.target.value)}
              placeholder="es. 2026/2027"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              {errors.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep('lista')}
              className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm">
              Indietro
            </button>
            <button
              onClick={handleConferma}
              disabled={saving || !nuovaStagione.trim()}
              className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-medium text-sm disabled:opacity-60"
            >
              {saving ? 'Applico...' : 'Conferma e avvia stagione'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}
      <div className="px-4 pt-4 pb-4 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
          Per i <strong>nuovi arrivi</strong> usa i form già esistenti: un nuovo giocatore si aggiunge da Segreteria → Giocatori,
          un nuovo allenatore da{' '}
          <button type="button" onClick={() => navigate('/admin/setup')} className="underline font-medium">Setup → Nuovo Allenatore</button>.
          Qui sotto gestisci solo chi è già attivo in società.
        </div>

        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">🏀 Giocatori ({giocatori.length})</p>
          <div className="space-y-2">
            {giocatori.map(g => (
              <PersonaRow
                key={g.id}
                nome={`${g.cognome} ${g.nome}`}
                squadraLabel={[g.squadra, g.squadra2, g.squadra3].filter(Boolean).join(', ')}
                azione={getAzione(`g-${g.id}`)}
                squadre={squadre}
                onAzione={patch => setAzione(`g-${g.id}`, patch)}
              />
            ))}
            {giocatori.length === 0 && <p className="text-xs text-gray-400 px-1">Nessun giocatore attivo</p>}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">👔 Allenatori ({allenatori.length})</p>
          <div className="space-y-2">
            {allenatori.map(a => (
              <PersonaRow
                key={a.id}
                nome={`${a.cognome} ${a.nome}`}
                squadraLabel={[a.squadra, a.squadra2, a.squadra3].filter(Boolean).join(', ')}
                azione={getAzione(`a-${a.id}`)}
                squadre={squadre}
                onAzione={patch => setAzione(`a-${a.id}`, patch)}
              />
            ))}
            {allenatori.length === 0 && <p className="text-xs text-gray-400 px-1">Nessun allenatore attivo</p>}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3">
        <button
          onClick={() => { setNuovaStagione(suggestNextStagione(stagioneCorrente)); setStep('riepilogo') }}
          className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform"
        >
          Vai al riepilogo
        </button>
      </div>
    </div>
  )
```

- [ ] **Step 4: Verifica manuale**

Monta la pagina (via route di test o temporaneamente in `App.jsx`, verrà collegata definitivamente nel Task 7). Clicca "Cambia" su un giocatore: atteso, appaiono 3 dropdown squadra popolati dalle categorie esistenti. Clicca "Vai al riepilogo": atteso, i conteggi resta/cambia/lascia riflettono le scelte fatte, e il campo "Nuova stagione" è precompilato incrementando l'anno corrente (es. da `2025/2026` a `2026/2027`). Non cliccare ancora "Conferma e avvia stagione" in questa verifica: le invalidation di query puntano a chiavi che verranno lette da pagine collegate solo dopo il Task 7 — è comunque sicuro cliccarlo (scrive già correttamente su Supabase), ma il redirect finale (`navigate('/admin/setup')`) avrà senso completo solo a route collegata.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/NuovaStagionePage.jsx
git commit -m "feat(setup): lista turnover e riepilogo nella pagina Nuova Stagione

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Routing ed entry point per "Nuova Stagione"

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/admin/AdminSetupPage.jsx`

`handleConferma` è già stato aggiunto nel Task 6, Step 2 — questo task collega solo il routing e verifica il flusso end-to-end.

- [ ] **Step 1: Aggiungi la route in `App.jsx`**

Import in cima al file, vicino agli altri import di pagine admin:

```js
import NuovaStagionePage from './pages/admin/NuovaStagionePage'
```

Nel blocco `/admin` (dopo `<Route path="persone" element={<AdminPersone />} />`):

```jsx
          <Route path="setup/nuova-stagione" element={<NuovaStagionePage />} />
```

- [ ] **Step 2: Aggiungi l'entry point in `AdminSetupPage.jsx`**

Aggiungi l'import dell'icona (riga 2-5, nell'elenco già importato da `lucide-react`):

```js
import {
  Building2, Users, Dumbbell, ChevronRight, GitFork,
  CalendarDays, Briefcase, RefreshCw,
} from 'lucide-react'
```

Nella sezione "🛠 Strumenti" (dopo la card "Doppio Campionato"):

```jsx
        <SectionGroup title="🛠 Strumenti">
          <SetupCard icon={CalendarDays} title="Configura Settimana Tipo" desc="Template orario settimanale"       onClick={() => navigate('/admin/setup/settimana_tipo')} border />
          <SetupCard icon={GitFork}      title="Doppio Campionato"         desc="Coppie squadre e giocatori comuni" onClick={() => setOpenModal('doppio')} border />
          <SetupCard icon={RefreshCw}    title="Nuova Stagione"            desc="Turnover roster e cambio stagione" onClick={() => navigate('/admin/setup/nuova-stagione')} />
        </SectionGroup>
```

(nota: aggiunto `border` alla card "Doppio Campionato" visto che non è più l'ultima della sezione)

- [ ] **Step 3: Verifica end-to-end manuale**

Come admin di test, apri Setup → "Nuova Stagione". Segna un giocatore come "Ha lasciato" e un allenatore come "Cambia squadra" (seleziona una squadra diversa). Vai al riepilogo, conferma.

Verifica su Supabase SQL Editor:
```sql
SELECT attivo FROM giocatori WHERE id = '<id_giocatore_test>'; -- atteso: false
SELECT squadra FROM profiles WHERE id = '<id_allenatore_test>'; -- atteso: nuova squadra scelta
SELECT stagione_corrente FROM societa WHERE id = '<societa_id>'; -- atteso: nuovo valore inserito
```

Verifica UI: il giocatore disattivato non appare più in `GiocatoriPage` (Segreteria) né in `AdminPersone`; se aveva un account collegato, il login con quelle credenziali viene rifiutato.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/admin/AdminSetupPage.jsx
git commit -m "feat(setup): routing ed entry point per Nuova Stagione

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Riepilogo file toccati

| File | Tipo |
|---|---|
| `supabase/migrations/supabase_migration_stagione_turnover.sql` | nuovo |
| `frontend/src/hooks/useAuth.jsx` | modificato |
| `frontend/src/pages/AccountDisattivatoPage.jsx` | nuovo |
| `frontend/src/App.jsx` | modificato |
| `frontend/src/pages/SetupPage.jsx` | modificato |
| `frontend/src/pages/admin/NuovaStagionePage.jsx` | nuovo |
| `frontend/src/pages/admin/AdminSetupPage.jsx` | modificato |
