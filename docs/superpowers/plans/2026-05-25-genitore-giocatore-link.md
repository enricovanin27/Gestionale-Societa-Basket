# Associazione Genitore ↔ Giocatore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collegare l'account genitore (ruolo `genitore`) direttamente alla scheda del giocatore tramite un campo `genitore_user_id` sulla tabella `giocatori`, così il genitore vede solo i propri figli invece di tutti i giocatori della squadra.

**Architecture:** Si aggiunge una colonna nullable `genitore_user_id UUID` alla tabella `giocatori`. La segreteria collega il genitore dalla scheda giocatore con una dropdown. Le viste genitore (HomeGenitore, QuoteGenitore) filtrano per `genitore_user_id = auth.uid()` invece che per squadra.

**Tech Stack:** Supabase (PostgreSQL + RLS), React + TanStack Query, PostgREST

---

## File map

| File | Azione | Responsabilità |
|---|---|---|
| `supabase/migrations/supabase_migration_genitore_link.sql` | CREATE | Colonna + RLS |
| `frontend/src/pages/secretary/GiocatoreForm.jsx` | MODIFY | Dropdown "Account app genitore" |
| `frontend/src/pages/secretary/GiocatoreDetail.jsx` | MODIFY | SELECT + save includono genitore_user_id |
| `frontend/src/pages/home/HomeGenitore.jsx` | MODIFY | Filter quoteAperte per genitore_user_id |
| `frontend/src/pages/parent/QuoteGenitore.jsx` | MODIFY | Filter giocatori per genitore_user_id |

---

## Task 1: Migrazione DB — colonna e RLS

**Files:**
- Create: `supabase/migrations/supabase_migration_genitore_link.sql`

- [ ] **Step 1.1: Crea il file di migrazione**

```sql
-- supabase/migrations/supabase_migration_genitore_link.sql

-- ── Colonna di collegamento genitore → giocatore ──────────────────────────
ALTER TABLE giocatori
  ADD COLUMN IF NOT EXISTS genitore_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── RLS: il genitore può leggere i propri giocatori collegati ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'giocatori' AND policyname = 'giocatori_genitore_own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY giocatori_genitore_own ON giocatori
        FOR SELECT TO authenticated
        USING (
          genitore_user_id = auth.uid()
          AND societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
        );
    $policy$;
  END IF;
END;
$$;

-- ── RLS: la segreteria può aggiornare genitore_user_id ────────────────────
-- (La policy giocatori_segreteria_update già esistente copre questo campo,
--  non serve una policy aggiuntiva.)
```

- [ ] **Step 1.2: Esegui la migrazione nel Supabase Dashboard**

  Vai su Supabase Dashboard → SQL Editor → incolla il contenuto del file → Run.
  
  Verifica: nella tabella `giocatori` compare la colonna `genitore_user_id` di tipo `uuid`.

- [ ] **Step 1.3: Commit**

```
git add supabase/migrations/supabase_migration_genitore_link.sql
git commit -m "feat: aggiungi genitore_user_id a giocatori con RLS"
```

---

## Task 2: GiocatoreForm — dropdown account genitore

**Files:**
- Modify: `frontend/src/pages/secretary/GiocatoreForm.jsx`

La sezione "Genitore / Tutore" del form riceve una nuova dropdown che mostra tutti gli utenti con ruolo `genitore` nella stessa società. Se il giocatore ha già un collegamento, la dropdown lo mostra preselezionato.

- [ ] **Step 2.1: Aggiungi `genitore_user_id` a EMPTY e alla query genitori**

Sostituisci l'inizio del file (fino a `export default function GiocatoreForm`):

```jsx
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const EMPTY = {
  cognome: '', nome: '', data_nascita: '', luogo_nascita: '', codice_fiscale: '',
  indirizzo: '', citta: '', cap: '', provincia: '',
  nome_genitore: '', cognome_genitore: '', codice_fiscale_genitore: '',
  telefono: '', email_genitore: '',
  squadra: '', squadra2: '', squadra3: '', numero_maglia: '',
  data_iscrizione: '', cert_medico_scadenza: '',
  genitore_user_id: '',
}

export default function GiocatoreForm({ initialValues = {}, onSave, onCancel, saving }) {
  const { societaId } = useAuth()
  const [form, setForm] = useState({ ...EMPTY, ...initialValues })

  useEffect(() => {
    setForm({ ...EMPTY, ...initialValues })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues?.id])

  const { data: squadreList = [] } = useQuery({
    queryKey: ['squadre-suggerimenti', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('squadra, squadra2, squadra3')
        .eq('societa_id', societaId)
        .eq('attivo', true)
      const set = new Set()
      for (const g of data ?? []) {
        if (g.squadra)  set.add(g.squadra)
        if (g.squadra2) set.add(g.squadra2)
        if (g.squadra3) set.add(g.squadra3)
      }
      return [...set].sort()
    },
  })

  // Account con ruolo genitore nella stessa società
  const { data: genitori = [] } = useQuery({
    queryKey: ['genitori-profiles', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, cognome, email')
        .eq('societa_id', societaId)
        .or('ruolo.eq.genitore,ruoli_extra.cs.{genitore}')
        .order('cognome').order('nome')
      return data ?? []
    },
  })
```

- [ ] **Step 2.2: Aggiungi la dropdown nella sezione "Genitore / Tutore"**

Alla fine della sezione `{/* ── Genitore / Tutore ── */}`, subito prima del tag `</section>` di chiusura (dopo il div con telefono/email), aggiungi:

```jsx
          {/* Account app collegato */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Account app genitore</label>
            <select
              className={inp}
              value={form.genitore_user_id ?? ''}
              onChange={set('genitore_user_id')}
            >
              <option value="">— Nessun account collegato —</option>
              {genitori.map(g => (
                <option key={g.id} value={g.id}>
                  {g.cognome} {g.nome}{g.email ? ` (${g.email})` : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              Collega l'account app del genitore per mostrargli solo il proprio figlio
            </p>
          </div>
```

- [ ] **Step 2.3: Verifica visiva**

  Avvia il dev server (`npm run dev` dalla cartella `frontend`). Apri una scheda giocatore come segreteria → tab Anagrafica → sezione "Genitore / Tutore". Deve comparire la dropdown "Account app genitore" con gli utenti genitore della società.

- [ ] **Step 2.4: Commit**

```
git add frontend/src/pages/secretary/GiocatoreForm.jsx
git commit -m "feat: dropdown collegamento account genitore in GiocatoreForm"
```

---

## Task 3: GiocatoreDetail — include genitore_user_id in query e salvataggio

**Files:**
- Modify: `frontend/src/pages/secretary/GiocatoreDetail.jsx`

- [ ] **Step 3.1: Aggiungi `genitore_user_id` alla SELECT query**

Nella `queryFn` di `useQuery` per `giocatore-detail` (intorno a riga 77), estendi il campo select aggiungendo `genitore_user_id`:

```js
      const { data } = await supabase
        .from('giocatori')
        .select(`id, nome, cognome, squadra, squadra2, squadra3,
         cert_medico_scadenza, cert_medico_url,
         data_nascita, luogo_nascita, codice_fiscale,
         indirizzo, citta, cap, provincia,
         nome_genitore, cognome_genitore, codice_fiscale_genitore,
         telefono, email_genitore, data_iscrizione, numero_maglia,
         genitore_user_id`)
        .eq('id', id).eq('societa_id', societaId).single()
```

- [ ] **Step 3.2: Aggiungi `genitore_user_id` in `handleSaveAnagrafica`**

Dentro `handleSaveAnagrafica`, nell'oggetto passato a `.update({...})`, aggiungi dopo `data_iscrizione`:

```js
        genitore_user_id:        formData.genitore_user_id         || null,
```

Il blocco completo diventa:

```js
      const { error } = await supabase.from('giocatori').update({
        cognome:                 formData.cognome,
        nome:                    formData.nome,
        data_nascita:            formData.data_nascita            || null,
        luogo_nascita:           formData.luogo_nascita           || null,
        codice_fiscale:          formData.codice_fiscale          || null,
        indirizzo:               formData.indirizzo               || null,
        citta:                   formData.citta                   || null,
        cap:                     formData.cap                     || null,
        provincia:               formData.provincia               || null,
        nome_genitore:           formData.nome_genitore           || null,
        cognome_genitore:        formData.cognome_genitore        || null,
        codice_fiscale_genitore: formData.codice_fiscale_genitore || null,
        telefono:                formData.telefono                || null,
        email_genitore:          formData.email_genitore          || null,
        squadra:                 formData.squadra,
        squadra2:                formData.squadra2                || null,
        squadra3:                formData.squadra3                || null,
        numero_maglia:           formData.numero_maglia ? parseInt(formData.numero_maglia) : null,
        data_iscrizione:         formData.data_iscrizione         || null,
        cert_medico_scadenza:    formData.cert_medico_scadenza    || null,
        genitore_user_id:        formData.genitore_user_id        || null,
      }).eq('id', id).eq('societa_id', societaId)
```

- [ ] **Step 3.3: Verifica**

  In segreteria, apri un giocatore → Anagrafica → seleziona un genitore dalla dropdown → Salva. Riapri la scheda: la dropdown deve mostrare il genitore selezionato.

- [ ] **Step 3.4: Commit**

```
git add frontend/src/pages/secretary/GiocatoreDetail.jsx
git commit -m "feat: GiocatoreDetail salva e carica genitore_user_id"
```

---

## Task 4: HomeGenitore — filtra quote per genitore_user_id

**Files:**
- Modify: `frontend/src/pages/home/HomeGenitore.jsx`

- [ ] **Step 4.1: Aggiungi `user` dalla destructuring di useAuth**

Alla riga della destructuring (inizio del componente):

```js
  const { user, profile, societaId, displayName, logout, societaNome } = useAuth()
```

- [ ] **Step 4.2: Sostituisci la query `quoteAperte` per filtrare per `genitore_user_id`**

Sostituisci l'intero blocco `useQuery` di `quoteAperte` con:

```js
  const { data: quoteAperte = [] } = useQuery({
    queryKey: ['genitore-quote-aperte', societaId, user?.id],
    enabled: !!societaId && !!user?.id,
    queryFn: async () => {
      const { data: gio } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .eq('societa_id', societaId)
        .eq('genitore_user_id', user.id)
        .eq('attivo', true)
      if (!gio?.length) return []
      const { data: q } = await supabase
        .from('quote')
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza')
        .in('giocatore_id', gio.map(g => g.id))
        .eq('societa_id', societaId)
        .eq('pagato', false)
        .order('data_scadenza', { nullsFirst: false })
      const gioMap = Object.fromEntries((gio ?? []).map(g => [g.id, g]))
      return (q ?? []).map(q => ({ ...q, giocatore: gioMap[q.giocatore_id] }))
    },
    staleTime: 5 * 60 * 1000,
  })
```

- [ ] **Step 4.3: Verifica**

  Accedi come genitore con almeno un figlio collegato. La sezione quote in home deve mostrare solo le quote del figlio collegato. Se nessun figlio è collegato, la sezione quote deve essere vuota (il comportamento del template JSX già gestisce `quoteAperte.length === 0`).

- [ ] **Step 4.4: Commit**

```
git add frontend/src/pages/home/HomeGenitore.jsx
git commit -m "feat: HomeGenitore filtra quote per genitore_user_id"
```

---

## Task 5: QuoteGenitore — filtra giocatori per genitore_user_id

**Files:**
- Modify: `frontend/src/pages/parent/QuoteGenitore.jsx`

- [ ] **Step 5.1: Aggiungi `user` da useAuth e sostituisci la query giocatori**

Sostituisci la destructuring iniziale e la query `giocatori`:

```jsx
export default function QuoteGenitore() {
  const { user, profile, societaId, displayName, logout, societaNome } = useAuth()

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-genitore', societaId, user?.id],
    enabled: !!societaId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra')
        .eq('societa_id', societaId)
        .eq('genitore_user_id', user.id)
        .eq('attivo', true)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
```

Nota: la variabile `profile` rimane nel destructuring anche se non si usa più per `mySquadre` (potrebbe servire altrove nel file). Rimuovila solo se TypeScript/lint si lamenta.

- [ ] **Step 5.2: Aggiungi stato vuoto esplicito se nessun giocatore collegato**

Subito dopo il blocco delle query, prima del `return`, aggiungi:

```jsx
  if (!isLoading && giocatori.length === 0) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader title="Quote" displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <div>
            <p className="text-4xl mb-3">👨‍👩‍👦</p>
            <p className="text-sm font-semibold text-gray-700">Nessun giocatore collegato</p>
            <p className="text-xs text-gray-400 mt-1">
              Chiedi alla segreteria di collegare il tuo account al profilo del tuo figlio
            </p>
          </div>
        </div>
      </div>
    )
  }
```

- [ ] **Step 5.3: Verifica**

  - Genitore con figlio collegato: vede le quote del figlio.
  - Genitore senza figlio collegato: vede lo schermo "Nessun giocatore collegato".

- [ ] **Step 5.4: Commit**

```
git add frontend/src/pages/parent/QuoteGenitore.jsx
git commit -m "feat: QuoteGenitore filtra per genitore_user_id con stato vuoto"
```

---

## Task 6: Commit finale e push

- [ ] **Step 6.1: Verifica completa end-to-end**

  1. Segreteria: apre scheda giocatore → Anagrafica → collega un account genitore → Salva
  2. Stessa scheda: ricarica → la dropdown mostra il genitore selezionato ✅
  3. Accede come quel genitore → Home → le quote mostrano solo i figli collegati ✅
  4. Genitore → sezione Quote → vede solo i propri figli ✅
  5. Genitore senza collegamento → sezione Quote → messaggio "Nessun giocatore collegato" ✅

- [ ] **Step 6.2: Push**

```
git push origin master
```
