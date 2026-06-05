# Multi-Role Switching + Segreteria Completa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare role-switching UI, correggere la gestione certificati medici in SegreteriePage, permettere all'admin di assegnarsi ruoli extra, e completare il modulo Segreteria con editing cert e chiusura quote.

**Architecture:** `useAuth` espone `activeRole` (localStorage-backed) + `setActiveRole`; `AppHeader` mostra chip-switcher quando l'utente ha più ruoli; `HomePage` usa `activeRole` per decidere quale home renderizzare. Il modulo Segreteria riceve mutazioni inline per cert_medico_scadenza e pagamento quote.

**Tech Stack:** React 18, React Query v5, Supabase JS v2, Tailwind CSS, date-fns, lucide-react

---

## Prerequisiti DB

**ESEGUIRE su Supabase SQL Editor prima di tutto:**
```sql
-- File: supabase_migration_segreteria.sql (già presente in repo)
-- Aggiunge: cert_medico_scadenza DATE a giocatori
--           ruoli_extra TEXT[] a profiles
--           vincolo check segreteria
--           RLS per segreteria su giocatori e quote
```
Se non eseguita, la lista giocatori in SegreteriePage risulta vuota (la query fallisce silenziosamente).

---

## File Map

| File | Azione | Responsabilità |
|------|--------|----------------|
| `frontend/src/hooks/useAuth.jsx` | Modifica | Aggiunge `activeRole` + `setActiveRole` |
| `frontend/src/components/AppHeader.jsx` | Modifica | Chip switcher ruolo quando multi-ruolo |
| `frontend/src/pages/HomePage.jsx` | Modifica | Routing home basato su `activeRole` |
| `frontend/src/pages/SetupPage.jsx` | Modifica | (1) ruoli_extra per se stessi; (2) cert_medico_scadenza nel form giocatori |
| `frontend/src/pages/SegreteriePage.jsx` | Modifica | Editing cert date + mark quota pagata |

---

## Task 1: `useAuth.jsx` — activeRole con localStorage

**Files:**
- Modify: `frontend/src/hooks/useAuth.jsx`

- [ ] **Step 1: Aggiungere stato `activeRole`**

  Aprire `frontend/src/hooks/useAuth.jsx`. Subito dopo la riga `const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)` aggiungere:

  ```js
  const [activeRole, setActiveRoleState] = useState(() => {
    return localStorage.getItem('oderzo_active_role') ?? null
  })

  function setActiveRole(role) {
    localStorage.setItem('oderzo_active_role', role)
    setActiveRoleState(role)
  }
  ```

- [ ] **Step 2: Calcolare `effectiveActiveRole` e aggiungerlo al context value**

  Nel blocco dove si calcolano `role`, `ruoliExtra`, `allRuoli` (intorno a riga 88), aggiungere dopo `allRuoli`:

  ```js
  // Active role: quello scelto dall'utente, purché sia ancora nei suoi ruoli
  const effectiveActiveRole = (activeRole && allRuoli.includes(activeRole))
    ? activeRole
    : (role ?? null)
  ```

  Nel `value` object (riga ~99), aggiungere le due chiavi nuove:

  ```js
  const value = {
    user,
    profile,
    loading,
    login,
    logout,
    role,
    ruoliExtra,
    allRuoli,
    activeRole: effectiveActiveRole,   // ← nuovo
    setActiveRole,                     // ← nuovo
    societaId,
    societaNome,
    displayName,
    squadreAllenatore,
    isSuperAdmin:       role === 'super_admin',
    isAdmin:            allRuoli.some(r => r === 'admin' || r === 'super_admin'),
    isAllenatore:       allRuoli.includes('allenatore'),
    isGenitore:         allRuoli.includes('genitore'),
    isGiocatore:        allRuoli.includes('giocatore'),
    isSegreteria:       allRuoli.includes('segreteria'),
    isPasswordRecovery,
    clearPasswordRecovery,
  }
  ```

- [ ] **Step 3: Verifica rapida in console**

  Avviare dev server (`npm run dev` in `frontend/`). Aprire DevTools → Console:
  ```js
  // Queste chiavi devono comparire nell'oggetto auth
  // Aprire React DevTools → cercare AuthContext → verificare activeRole + setActiveRole
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/hooks/useAuth.jsx
  git commit -m "feat: activeRole localStorage-backed in useAuth"
  ```

---

## Task 2: `AppHeader.jsx` — chip switcher ruolo

**Files:**
- Modify: `frontend/src/components/AppHeader.jsx`

- [ ] **Step 1: Sostituire l'intero file con la versione che include il switcher**

  ```jsx
  import { LogOut } from 'lucide-react'
  import CambiaPasswordButton from './CambiaPasswordButton'
  import { useAuth } from '../hooks/useAuth'

  const ROLE_LABEL = {
    admin:       'Admin',
    super_admin: 'Super Admin',
    allenatore:  'Allenatore',
    segreteria:  'Segreteria',
    genitore:    'Genitore',
    giocatore:   'Giocatore',
  }

  export default function AppHeader({ title, subtitle, displayName, logout, societaNome, children }) {
    const { allRuoli, activeRole, setActiveRole } = useAuth()
    const multiRole = allRuoli.length > 1

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

        {/* Role switcher — visibile solo se l'utente ha più ruoli */}
        {multiRole && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {allRuoli.map(r => (
              <button
                key={r}
                onClick={() => setActiveRole(r)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                  activeRole === r
                    ? 'bg-white text-amber-800 shadow-sm'
                    : 'bg-amber-700/50 text-amber-200 hover:bg-amber-700/70'
                }`}
              >
                {ROLE_LABEL[r] ?? r}
              </button>
            ))}
          </div>
        )}

        {children}
      </div>
    )
  }
  ```

- [ ] **Step 2: Verifica visiva**

  In SetupPage → Utenti, assegnare un ruolo extra (es. `+Allenatore`) a un utente di test. Fare logout e rientrare con quell'utente. L'header deve mostrare i chip dei ruoli disponibili. Cliccando un chip deve cambiare colore (bianco = attivo).

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/AppHeader.jsx
  git commit -m "feat: role switcher chips in AppHeader for multi-role users"
  ```

---

## Task 3: `HomePage.jsx` — routing basato su activeRole

**Files:**
- Modify: `frontend/src/pages/HomePage.jsx`

- [ ] **Step 1: Sostituire la logica di routing**

  ```jsx
  import { Navigate } from 'react-router-dom'
  import { useAuth } from '../hooks/useAuth'
  import HomeAdmin from './home/HomeAdmin'
  import HomeAllenatore from './home/HomeAllenatore'
  import HomeGenitore from './home/HomeGenitore'

  export { default as GenitoreHome } from './home/HomeGenitore'

  export default function HomePage() {
    const { activeRole, allRuoli } = useAuth()

    // Routing basato sull'activeRole scelto dall'utente
    if (activeRole === 'admin' || activeRole === 'super_admin') return <HomeAdmin />
    if (activeRole === 'segreteria') return <Navigate to="/segreteria" replace />
    if (activeRole === 'allenatore') return <HomeAllenatore />

    // Fallback: se activeRole non è settato o non è riconosciuto, usa allRuoli
    if (allRuoli.includes('admin') || allRuoli.includes('super_admin')) return <HomeAdmin />
    if (allRuoli.includes('segreteria') && allRuoli.length === 1) return <Navigate to="/segreteria" replace />
    if (allRuoli.includes('allenatore')) return <HomeAllenatore />
    return <HomeGenitore />
  }
  ```

- [ ] **Step 2: Verifica**

  Con un utente admin+allenatore:
  - Default (primo login) → vede HomeAdmin
  - Tap chip "Allenatore" → vede HomeAllenatore
  - Tap chip "Admin" → torna a HomeAdmin
  - Ricaricare la pagina → rimane sulla scelta precedente (localStorage)

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/pages/HomePage.jsx
  git commit -m "feat: HomePage routes by activeRole for multi-role users"
  ```

---

## Task 4: `SetupPage.jsx` — Admin può assegnare ruoli extra a se stesso

**Files:**
- Modify: `frontend/src/pages/SetupPage.jsx` (sezione `UtentiTab`, intorno a riga 1080–1235)

**Problema:** Il blocco `{u.id !== me?.id && (...)}` nasconde TUTTO, inclusi i checkbox ruoli extra. Un admin non può assegnarsi ruoli extra da sé.

**Fix:** Separare i controlli. Il select ruolo primario rimane nascosto per se stessi (per evitare self-lockout). I checkbox ruoli extra diventano visibili anche per se stessi.

- [ ] **Step 1: Trovare il blocco dei controlli utente**

  Cercare in SetupPage.jsx: `{u.id !== me?.id && (` — questo apre il blocco dei controlli.

  La struttura attuale è circa:
  ```jsx
  {u.id !== me?.id && (
    <div className="flex flex-col gap-1.5 items-end">
      <select ...ruolo primario... />
      <div>...ruoli extra checkboxes...</div>
      ...altri controlli (disabilita, elimina)...
    </div>
  )}
  ```

- [ ] **Step 2: Sostituire il blocco con versione separata**

  Trovare il `<div className="flex flex-col gap-1.5 items-end">` dentro `{u.id !== me?.id && (` e **sostituire l'intero blocco** `{u.id !== me?.id && (...)}` con:

  ```jsx
  {/* Controlli per altri utenti (non se stessi) */}
  {u.id !== me?.id && (
    <div className="flex flex-col gap-1.5 items-end">
      <select
        value={u.ruolo ?? ''}
        onChange={e => ruoloMut.mutate({ id: u.id, ruolo: e.target.value })}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        {RUOLI.map(r => <option key={r} value={r}>{RUOLI_LABEL[r]}</option>)}
      </select>
      <div className="flex flex-col gap-0.5 items-end">
        {RUOLI_EXTRA_DISPONIBILI.filter(r => r !== u.ruolo).map(r => {
          const checked = (u.ruoli_extra ?? []).includes(r)
          return (
            <label key={r} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 select-none">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleRuoloExtra(u.id, u.ruolo, u.ruoli_extra, r)}
                className="w-3 h-3 rounded accent-blue-600"
              />
              +{RUOLI_LABEL[r]}
            </label>
          )
        })}
      </div>
      {u.ruolo === 'giocatore' && squadreDisp.length > 0 && (<>
        <select
          value={u.squadra ?? ''}
          onChange={e => squadraMut.mutate({ id: u.id, squadra: e.target.value || null })}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
        >
          <option value="">– Squadra 1 –</option>
          {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={u.squadra2 ?? ''}
          onChange={e => squadra2Mut.mutate({ id: u.id, squadra2: e.target.value || null })}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
        >
          <option value="">– Sq 2 –</option>
          {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra3).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={u.squadra3 ?? ''}
          onChange={e => squadra3Mut.mutate({ id: u.id, squadra3: e.target.value || null })}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
        >
          <option value="">– Sq 3 –</option>
          {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </>)}
      <button
        onClick={() => disabledMut.mutate({ id: u.id, attivo: !u.attivo })}
        className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${
          isDisabled
            ? 'text-green-600 border-green-200 bg-green-50'
            : 'text-gray-500 border-gray-200 hover:bg-gray-50'
        }`}
      >
        {isDisabled ? 'Abilita' : 'Disabilita'}
      </button>
      <button
        onClick={() => {
          if (window.confirm(`Eliminare ${nomeCompleto}? Questa azione non può essere annullata.`))
            deleteMut.mutate(u)
        }}
        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg border border-red-100 transition-colors"
        title="Elimina utente"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )}

  {/* Ruoli extra per se stessi (il ruolo primario non è modificabile per evitare self-lockout) */}
  {u.id === me?.id && (
    <div className="flex flex-col gap-0.5 items-end">
      <p className="text-xs text-gray-400 mb-1">Ruoli extra:</p>
      {RUOLI_EXTRA_DISPONIBILI.filter(r => r !== u.ruolo).map(r => {
        const checked = (u.ruoli_extra ?? []).includes(r)
        return (
          <label key={r} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleRuoloExtra(u.id, u.ruolo, u.ruoli_extra, r)}
              className="w-3 h-3 rounded accent-blue-600"
            />
            +{RUOLI_LABEL[r]}
          </label>
        )
      })}
    </div>
  )}
  ```

- [ ] **Step 3: Verifica**

  Aprire Setup → Utenti. Trovare la propria riga (ha il badge "tu"). Deve mostrare i checkbox ruoli extra. Selezionare "+Segreteria" → dopo salvataggio, ricaricare: nel BottomNav appare il tab Segreteria.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/SetupPage.jsx
  git commit -m "feat: admin can add extra roles to themselves in Setup"
  ```

---

## Task 5: `SetupPage.jsx` — cert_medico_scadenza nel form giocatori

**Files:**
- Modify: `frontend/src/pages/SetupPage.jsx` (sezione `GiocatoriTab`)

- [ ] **Step 1: Aggiungere il campo a `EMPTY_GIOCATORE`**

  Trovare riga ~2112:
  ```js
  const EMPTY_GIOCATORE = { nome: '', cognome: '', email: '', squadra: '', squadra2: '', squadra3: '', data_nascita: '', numero_maglia: '', note: '', attivo: true }
  ```
  Cambiare in:
  ```js
  const EMPTY_GIOCATORE = { nome: '', cognome: '', email: '', squadra: '', squadra2: '', squadra3: '', data_nascita: '', numero_maglia: '', note: '', cert_medico_scadenza: '', attivo: true }
  ```

- [ ] **Step 2: Aggiungere `cert_medico_scadenza` al payload del `saveMut`**

  Trovare il `saveMut` in `GiocatoriTab` (~riga 2158). Nel `payload`, dopo `note: f.note.trim() || null,` aggiungere:
  ```js
  cert_medico_scadenza: f.cert_medico_scadenza || null,
  ```

- [ ] **Step 3: Aggiungere `cert_medico_scadenza` a `openEdit`**

  Trovare la riga (~2192):
  ```js
  function openEdit(g) { saveMut.reset(); setEditingRow(g); setForm({ ...g, email: g.email ?? '', squadra2: g.squadra2 ?? '', squadra3: g.squadra3 ?? '', data_nascita: g.data_nascita ?? '', numero_maglia: g.numero_maglia ?? '', note: g.note ?? '' }); setShowForm(true) }
  ```
  Aggiungere `cert_medico_scadenza: g.cert_medico_scadenza ?? ''` nel setForm spread:
  ```js
  function openEdit(g) { saveMut.reset(); setEditingRow(g); setForm({ ...g, email: g.email ?? '', squadra2: g.squadra2 ?? '', squadra3: g.squadra3 ?? '', data_nascita: g.data_nascita ?? '', numero_maglia: g.numero_maglia ?? '', note: g.note ?? '', cert_medico_scadenza: g.cert_medico_scadenza ?? '' }); setShowForm(true) }
  ```

- [ ] **Step 4: Aggiungere il campo nel form JSX**

  Nel form del modal giocatore, dopo il campo `data_nascita` e prima del `note`, aggiungere:
  ```jsx
  <Field label="Scadenza cert. medico">
    <input
      type="date"
      value={form.cert_medico_scadenza}
      onChange={e => set('cert_medico_scadenza', e.target.value)}
      className={inp}
    />
  </Field>
  ```

  Per trovare il posto giusto: cercare nel form modal `data_nascita` e inserire subito dopo il suo `<Field>`.

- [ ] **Step 5: Verifica**

  Setup → Giocatori → modifica un giocatore → verificare che il campo "Scadenza cert. medico" appaia nel form e che il salvataggio aggiorni il valore (visibile in Supabase Table Editor o da SegreteriePage).

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/pages/SetupPage.jsx
  git commit -m "feat: cert_medico_scadenza field in GiocatoriTab form"
  ```

---

## Task 6: `SegreteriePage.jsx` — editing data certificato medico

**Files:**
- Modify: `frontend/src/pages/SegreteriePage.jsx`

- [ ] **Step 1: Aggiungere import mancanti**

  Trovare la riga degli import correnti:
  ```js
  import { useQuery } from '@tanstack/react-query'
  ```
  Cambiare in:
  ```js
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  ```

  Aggiungere `Edit2` agli import lucide:
  ```js
  import { Users, AlertTriangle, CheckCircle2, Clock, CreditCard, FileText, Edit2 } from 'lucide-react'
  ```

- [ ] **Step 2: Aggiungere stato e mutation nel componente**

  Subito dopo le dichiarazioni dei query (`useQuery` per giocatori e quote), aggiungere:
  ```js
  const qc = useQueryClient()
  const [editingCert, setEditingCert] = useState(null) // giocatore object | null
  const [certDateInput, setCertDateInput] = useState('')

  const certMut = useMutation({
    mutationFn: async ({ id, cert_medico_scadenza }) => {
      const { error } = await supabase
        .from('giocatori')
        .update({ cert_medico_scadenza: cert_medico_scadenza || null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segreteria-giocatori'] }),
  })

  function openCertEdit(g) {
    setEditingCert(g)
    setCertDateInput(g.cert_medico_scadenza ?? '')
  }
  ```

- [ ] **Step 3: Aggiungere il pulsante edit accanto al badge cert nella lista completa**

  Trovare il blocco che renderizza il cert badge nella lista completa (intorno a riga 211–214):
  ```jsx
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${cert.cls}`}>
    <FileText size={10} /> {cert.label}
  </span>
  ```
  Sostituire con:
  ```jsx
  <div className="flex items-center gap-1">
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${cert.cls}`}>
      <FileText size={10} /> {cert.label}
    </span>
    <button
      onClick={() => openCertEdit(g)}
      className="p-0.5 text-gray-400 hover:text-blue-500 transition-colors"
      title="Modifica data certificato"
    >
      <Edit2 size={10} />
    </button>
  </div>
  ```

- [ ] **Step 4: Aggiungere il pulsante edit anche nella sezione Urgenze**

  Trovare il badge cert nella sezione urgenze (~riga 163–167):
  ```jsx
  {cert.urgente && (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cert.cls}`}>
      <FileText size={10} /> {cert.label}
    </span>
  )}
  ```
  Sostituire con:
  ```jsx
  {cert.urgente && (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cert.cls}`}>
      <FileText size={10} /> {cert.label}
      <button onClick={() => openCertEdit(g)} className="ml-0.5 hover:opacity-70">
        <Edit2 size={9} />
      </button>
    </span>
  )}
  ```

- [ ] **Step 5: Aggiungere il bottom-sheet modal per l'editing**

  Prima del `return` finale (o alla fine del componente prima della chiusura del `<div className="pb-20">`), aggiungere:
  ```jsx
  {/* Modal editing cert medico */}
  {editingCert && (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setEditingCert(null)}>
      <div className="w-full bg-white rounded-t-2xl p-6 space-y-4 max-w-lg mx-auto" onClick={e => e.stopPropagation()}>
        <div>
          <p className="font-semibold text-gray-900 text-base">Certificato medico</p>
          <p className="text-sm text-gray-500">{editingCert.cognome} {editingCert.nome}</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block font-medium">Data di scadenza</label>
          <input
            type="date"
            value={certDateInput}
            onChange={e => setCertDateInput(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {certDateInput && (
            <button
              onClick={() => setCertDateInput('')}
              className="text-xs text-red-400 mt-1"
            >
              Rimuovi data
            </button>
          )}
        </div>
        {certMut.isError && (
          <p className="text-xs text-red-500">{certMut.error?.message}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setEditingCert(null)}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 active:scale-95 transition-transform"
          >
            Annulla
          </button>
          <button
            onClick={() => {
              certMut.mutate({ id: editingCert.id, cert_medico_scadenza: certDateInput })
              setEditingCert(null)
            }}
            disabled={certMut.isPending}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:scale-95 transition-transform disabled:opacity-60"
          >
            {certMut.isPending ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )}
  ```

- [ ] **Step 6: Verifica**

  Aprire SegreteriePage → Tab Giocatori. Accanto al badge cert di ogni giocatore compare un'icona edit (matita). Tap → apre bottom-sheet con date picker. Selezionare una data → "Salva" → il badge si aggiorna con la nuova data e colore corretto.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/pages/SegreteriePage.jsx
  git commit -m "feat: inline cert medico editing in SegreteriePage"
  ```

---

## Task 7: `SegreteriePage.jsx` — mark quota come "Pagata"

**Motivazione:** Senza questa funzione, la lista quote non si svuota mai e diventa inutile come strumento operativo. La segreteria deve poter registrare i pagamenti direttamente dall'app.

**Files:**
- Modify: `frontend/src/pages/SegreteriePage.jsx`

- [ ] **Step 1: Aggiungere mutation `pagaMut`**

  Nel corpo del componente, dopo `certMut`, aggiungere:
  ```js
  const pagaMut = useMutation({
    mutationFn: async (quotaId) => {
      const { error } = await supabase
        .from('quote')
        .update({ pagato: true })
        .eq('id', quotaId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segreteria-quote'] }),
  })
  ```

- [ ] **Step 2: Aggiungere pulsante "Pagata" in `QuotaCard`**

  Trovare la funzione `QuotaCard` nel render della tab Quote. Attualmente termina con `</Card>`. Modificare il `CardContent` per aggiungere il pulsante:

  La `QuotaCard` attuale ha questo layout:
  ```jsx
  <Card className={...}>
    <CardContent className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        ...nome giocatore + importo + data scadenza...
      </div>
    </CardContent>
  </Card>
  ```

  Aggiungere dopo il `<div className="flex items-start justify-between gap-2">...</div>`:
  ```jsx
  <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
    <button
      onClick={() => pagaMut.mutate(q.id)}
      disabled={pagaMut.isPending}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium active:scale-95 transition-transform disabled:opacity-60"
    >
      <CheckCircle2 size={12} /> Segna come pagata
    </button>
  </div>
  ```

  Assicurarsi che `CheckCircle2` sia già negli import lucide (è già importato nella riga originale).

- [ ] **Step 3: Verifica**

  Aprire SegreteriePage → Tab Quote. Ogni quota ha un pulsante verde "Segna come pagata". Cliccandolo, la quota sparisce dalla lista (la query si invalida e la quota `pagato=true` non viene più restituita dal filtro `eq('pagato', false)`).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/SegreteriePage.jsx
  git commit -m "feat: mark quota as pagata directly from SegreteriePage"
  ```

---

## Self-Review

**Spec coverage:**
- [x] Cert medico non visibile → Task 5 (input in form giocatori) + Task 6 (editing inline SegreteriePage)
- [x] Admin si assegna ruoli → Task 4
- [x] Role switching → Task 1 + Task 2 + Task 3
- [x] Funzionalità extra segreteria → Task 7 (pagamento quote)
- [ ] **Gap:** La query giocatori in SegreteriePage non gestisce errori (se la migrazione non è eseguita, la lista appare vuota senza feedback). → Nota: aggiungere error handling alla query è opzionale; l'utente viene istruito a eseguire la migrazione prima.

**Placeholder scan:** Nessun TBD o TODO nel piano.

**Type consistency:** `certMut`, `pagaMut`, `editingCert`, `certDateInput`, `activeRole`, `setActiveRole`, `effectiveActiveRole` — tutti usati consistentemente nei rispettivi task.

---

## Note di deploy

1. Eseguire `supabase_migration_segreteria.sql` su Supabase SQL Editor **prima** di usare le nuove funzionalità
2. Verificare che la policy RLS per UPDATE su `giocatori` e `quote` sia inclusa nella migration per il ruolo segreteria
3. Se la segreteria vede errore di permesso su `pagaMut`, aggiungere su Supabase: `CREATE POLICY "segreteria_update_quote" ON quote FOR UPDATE TO authenticated USING (get_my_role() IN ('admin','super_admin','segreteria'));`
