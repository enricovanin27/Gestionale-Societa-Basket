# Batch 1 — Bug fix + Rimozioni Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere 2 bug (cambio ruolo lento, atletica edit non aggiorna) e rimuovere 2 voci di navigazione (Stato dal preparatore, Atletica dall'allenatore).

**Architecture:** 4 task indipendenti su 5 file diversi. I task 3 e 4 (rimozioni) sono triviali. Il task 1 (RoleSwitcher) e il task 2 (AtlenamentiPage) sono le fix sostanziali.

**Tech Stack:** React 18, Supabase JS v2, TanStack Query v5, React Router v6, Tailwind CSS

---

## File map

| File | Task | Azione |
|------|------|--------|
| `frontend/src/components/RoleSwitcher.jsx` | 1 | MODIFY — window.location.href invece di navigate |
| `frontend/src/pages/AllenamentiPage.jsx` | 2 | MODIFY — fix saveMut + pre-populate form atletica |
| `frontend/src/layouts/PrepLayout.jsx` | 3 | MODIFY — rimuovi voce Stato |
| `frontend/src/App.jsx` | 3 + 4 | MODIFY — rimuovi route stato e atletica |
| `frontend/src/layouts/CoachLayout.jsx` | 4 | MODIFY — rimuovi voce Atletica |

---

## Task 1: Fix cambio ruolo lento (RoleSwitcher)

**File:** `frontend/src/components/RoleSwitcher.jsx`

**Causa:** `navigate(ROLE_PATH[role])` cambia l'URL via React Router, ma non ricarica il profilo da Supabase. Se `ruoli_extra` dell'utente è stato aggiornato dall'admin dopo il login, il profilo in memoria è stale e il nuovo ruolo non è in `allRuoli`. Risultato: la pagina non si apre o ci impiega molto.

**Fix:** Usare `window.location.href = ROLE_PATH[role]` invece di `navigate(...)` — forza un reload completo che ricarica il profilo fresco da Supabase.

- [ ] **Step 1.1 — Leggi il file**

  ```
  Leggi frontend/src/components/RoleSwitcher.jsx
  ```

- [ ] **Step 1.2 — Modifica handleSwitch in RoleSwitcherSidebar**

  Trova la funzione `handleSwitch` dentro `RoleSwitcherSidebar` (righe ~50-53):

  ```jsx
  // BEFORE
  function handleSwitch(role) {
    setActiveRole(role)
    navigate(ROLE_PATH[role] ?? '/')
  }

  // AFTER
  function handleSwitch(role) {
    setActiveRole(role)
    window.location.href = ROLE_PATH[role] ?? '/'
  }
  ```

- [ ] **Step 1.3 — Modifica handleSwitch in RoleSwitcherFAB**

  Trova la funzione `handleSwitch` dentro `RoleSwitcherFAB` (righe ~88-92):

  ```jsx
  // BEFORE
  function handleSwitch(role) {
    setActiveRole(role)
    setOpen(false)
    navigate(ROLE_PATH[role] ?? '/')
  }

  // AFTER
  function handleSwitch(role) {
    setActiveRole(role)
    setOpen(false)
    window.location.href = ROLE_PATH[role] ?? '/'
  }
  ```

- [ ] **Step 1.4 — Rimuovi import useNavigate e hook navigate inutilizzati**

  Dopo le modifiche, `useNavigate` e `navigate` potrebbero non essere più usati nel file. Verifica e rimuovi:

  ```jsx
  // Rimuovi questa riga dall'import (se useNavigate non è più usato):
  import { useNavigate } from 'react-router-dom'

  // Rimuovi le righe `const navigate = useNavigate()` da entrambe le varianti del componente
  ```

  > Nota: se `useNavigate` è usato in altri punti del file, non rimuoverlo.

- [ ] **Step 1.5 — Commit**

  ```
  git add frontend/src/components/RoleSwitcher.jsx
  git commit -m "fix: cambio ruolo usa window.location.href per reload profilo aggiornato"
  ```

---

## Task 2: Fix atletica edit non aggiorna (AllenamentiPage)

**File:** `frontend/src/pages/AllenamentiPage.jsx`

**Causa:** In `saveMut` (riga ~768), il blocco `if (formData._prepData)` fa sempre `INSERT` su `prep_sessioni`, mai `UPDATE` o `DELETE`. Quando si modifica un allenamento già con atletica, si crea un duplicato. Se si rimuove atletica, il vecchio record rimane.

**Fix in due parti:**
- **Parte A:** Nel `saveMut`, quando si sta modificando (non aggiungendo), prima elimina il record `prep_sessioni` esistente per quella data+squadra+tipo='allenamento', poi inserisce il nuovo (se presente).
- **Parte B:** In `EditAllenamentoForm`, caricare il record `prep_sessioni` esistente e pre-popolare `includiAtletica` e `prepData` quando si apre la modifica.

Il componente del form di modifica si chiama `EditAllenamentoForm` (riga ~97). Il componente outer `WeekView` (riga ~740) contiene `saveMut` e `editingEvent`.

- [ ] **Step 2.1 — Leggi il file per trovare le righe esatte**

  Leggi `frontend/src/pages/AllenamentiPage.jsx`. Cerca queste sezioni:
  - `saveMut` (riga ~768-792)
  - `EditAllenamentoForm` (riga ~97-230) — dove ha `includiAtletica` e `prepData`
  - La chiamata a `saveMut.mutate(...)` nel `WeekView`

- [ ] **Step 2.2 — Parte A: Fix saveMut — aggiungi isEdit al payload e logica delete+insert**

  Cerca nel file il pattern `onSave` passato a `EditAllenamentoForm` — troverai qualcosa come:
  ```jsx
  <EditAllenamentoForm
    event={editingEvent}
    onSave={(formData) => saveMut.mutate({ event: editingEvent, formData })}
    ...
  />
  ```

  Aggiorna quella chiamata aggiungendo `isEdit: true`:
  ```jsx
  <EditAllenamentoForm
    event={editingEvent}
    onSave={(formData) => saveMut.mutate({ event: editingEvent, formData, isEdit: true })}
    ...
  />
  ```

  Se c'è anche un form per aggiungere nuovi allenamenti che usa `saveMut`, assicurati che lì non passi `isEdit` (o passi `isEdit: false`). Il default `isEdit = false` nel mutationFn gestisce questo caso automaticamente.

  Nel `mutationFn` di `saveMut` (riga ~768-785), sostituisci il blocco `if (formData._prepData)`:

  ```jsx
  // BEFORE:
  if (formData._prepData) {
    await supabase.from('prep_sessioni').insert([{
      societa_id: societaId,
      preparatore_id: formData._prepPreparatoreId ?? null,
      squadra: event.squadra,
      data: event.data,
      tipo: 'allenamento',
      quando: formData._prepData.quando,
      durata_min: formData._prepData.durata_min,
      su_campo: formData._prepData.su_campo,
      note: '',
    }])
  }

  // AFTER:
  if (isEdit) {
    // Cancella il record esistente (se c'è) — poi inserisce il nuovo se atletica è attiva
    await supabase
      .from('prep_sessioni')
      .delete()
      .eq('societa_id', societaId)
      .eq('data', event.data)
      .eq('squadra', event.squadra)
      .eq('tipo', 'allenamento')
  }
  if (formData._prepData) {
    await supabase.from('prep_sessioni').insert([{
      societa_id:     societaId,
      preparatore_id: formData._prepPreparatoreId ?? null,
      squadra:        event.squadra,
      data:           event.data,
      tipo:           'allenamento',
      quando:         formData._prepData.quando,
      durata_min:     formData._prepData.durata_min,
      su_campo:       formData._prepData.su_campo,
      note:           '',
    }])
  }
  ```

  > Decostruisci `isEdit` dal parametro della mutation: `mutationFn: async ({ event, formData, isEdit = false }) => {`

- [ ] **Step 2.3 — Parte B: Pre-popola il form con il record atletica esistente**

  In `EditAllenamentoForm` (riga ~97), dopo le query esistenti (`prepAssegnato`), aggiungi una nuova query che carica il record `prep_sessioni` per questo evento:

  ```jsx
  const { data: existingPrep } = useQuery({
    queryKey: ['prep-sessione-evento', societaId, event.data, event.squadra],
    enabled: !!societaId && !!event.data && !!event.squadra,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_sessioni')
        .select('quando, durata_min, su_campo')
        .eq('societa_id', societaId)
        .eq('data', event.data)
        .eq('squadra', event.squadra)
        .eq('tipo', 'allenamento')
        .maybeSingle()
      return data ?? null
    },
  })
  ```

  Poi, subito dopo la dichiarazione di `includiAtletica` e `prepData` (riga ~140-141), aggiungi un `useEffect` per pre-popolare i valori:

  ```jsx
  const [includiAtletica, setIncludiAtletica] = useState(false)
  const [prepData, setPrepData] = useState({ quando: 'prima', durata_min: 30, su_campo: false })

  // Aggiungi questo useEffect subito dopo:
  useEffect(() => {
    if (existingPrep) {
      setIncludiAtletica(true)
      setPrepData({
        quando:     existingPrep.quando,
        durata_min: existingPrep.durata_min,
        su_campo:   existingPrep.su_campo,
      })
    }
  }, [existingPrep])
  ```

  Aggiungi `useEffect` agli import di React se non è già presente:
  ```jsx
  import { useState, useMemo, useEffect } from 'react'
  ```

- [ ] **Step 2.4 — Verifica che PrepSesioneInlineForm si pre-popoli**

  `PrepSesioneInlineForm` ha il suo stato interno (`quando`, `durata`, `suCampo`) inizializzato a valori fissi. Quando `includiAtletica` diventa true e `prepData` è già popolato, il form viene mostrato ma i suoi controlli interni mostrano i valori di default, non quelli del `prepData` letto dal DB.

  Fix: aggiungi props `initialQuando`, `initialDurata`, `initialSuCampo` a `PrepSesioneInlineForm`:

  In `frontend/src/components/PrepSesioneInlineForm.jsx`, modifica la firma:
  ```jsx
  // BEFORE:
  export default function PrepSesioneInlineForm({ onChange }) {
    const [quando, setQuando] = useState('prima')
    const [durata, setDurata] = useState('30')
    const [suCampo, setSuCampo] = useState(false)

  // AFTER:
  export default function PrepSesioneInlineForm({ onChange, initialQuando = 'prima', initialDurata = '30', initialSuCampo = false }) {
    const [quando, setQuando] = useState(initialQuando)
    const [durata, setDurata] = useState(String(initialDurata))
    const [suCampo, setSuCampo] = useState(initialSuCampo)
  ```

  In `AllenamentiPage.jsx`, aggiorna la chiamata a `PrepSesioneInlineForm`:
  ```jsx
  // BEFORE:
  {includiAtletica && <PrepSesioneInlineForm onChange={d => setPrepData(d)} />}

  // AFTER:
  {includiAtletica && (
    <PrepSesioneInlineForm
      onChange={d => setPrepData(d)}
      initialQuando={prepData.quando}
      initialDurata={String(prepData.durata_min)}
      initialSuCampo={prepData.su_campo}
    />
  )}
  ```

  > Nota: le props `initial*` vengono lette solo allo `useState()` (mount), non ad ogni render. Se `includiAtletica` è false e poi torna true, il componente viene rimontato con i valori correnti di `prepData`.

- [ ] **Step 2.5 — Commit**

  ```
  git add frontend/src/pages/AllenamentiPage.jsx frontend/src/components/PrepSesioneInlineForm.jsx
  git commit -m "fix: atletica allenamento — aggiorna/rimuove record esistente, pre-popola form in modifica"
  ```

---

## Task 3: Rimuovi Stato delle squadre dal preparatore

**File:** `frontend/src/layouts/PrepLayout.jsx` e `frontend/src/App.jsx`

- [ ] **Step 3.1 — Modifica PrepLayout.jsx**

  Leggi `frontend/src/layouts/PrepLayout.jsx`. Applica queste modifiche:

  **Import lucide-react:** Rimuovi `Activity` se non usato altrove nel file:
  ```jsx
  // BEFORE:
  import { Calendar, Activity, BookOpen } from 'lucide-react'

  // AFTER:
  import { Calendar, BookOpen } from 'lucide-react'
  ```

  **SIDEBAR_ITEMS:** Rimuovi la voce Stato:
  ```jsx
  // BEFORE:
  const SIDEBAR_ITEMS = [
    { to: '/prep',        end: true, icon: Calendar,  label: 'Agenda' },
    { to: '/prep/stato',             icon: Activity,  label: 'Stato' },
    { to: '/prep/schede',            icon: BookOpen,  label: 'Schede' },
  ]

  // AFTER:
  const SIDEBAR_ITEMS = [
    { to: '/prep',        end: true, icon: Calendar,  label: 'Agenda' },
    { to: '/prep/schede',            icon: BookOpen,  label: 'Schede' },
  ]
  ```

  **Bottom nav mobile:** Rimuovi il `<NavLink to="/prep/stato">` completo:
  ```jsx
  // BEFORE (3 NavLink: Agenda, Stato, Schede):
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

  // AFTER (2 NavLink: Agenda, Schede):
  <NavLink to="/prep" end className={cls}>
    <Calendar size={20} strokeWidth={1.8} />
    <span className="text-[10px] font-medium">Agenda</span>
  </NavLink>
  <NavLink to="/prep/schede" className={cls}>
    <BookOpen size={20} strokeWidth={1.8} />
    <span className="text-[10px] font-medium">Schede</span>
  </NavLink>
  ```

- [ ] **Step 3.2 — Modifica App.jsx: rimuovi route stato e import StatoPage**

  Leggi le righe rilevanti di `frontend/src/App.jsx`. Cerca il blocco `/prep`:

  ```jsx
  // Trova e rimuovi questo import:
  import StatoPage from './pages/prep/StatoPage'

  // Trova e rimuovi questa route (dentro il blocco /prep):
  <Route path="stato" element={<StatoPage />} />
  ```

  > Nota: il file `StatoPage.jsx` non va eliminato — viene solo rimosso dal routing.

- [ ] **Step 3.3 — Commit**

  ```
  git add frontend/src/layouts/PrepLayout.jsx frontend/src/App.jsx
  git commit -m "feat: rimuovi Stato delle squadre dal layout preparatore"
  ```

---

## Task 4: Rimuovi Atletica dall'allenatore

**File:** `frontend/src/layouts/CoachLayout.jsx` e `frontend/src/App.jsx`

- [ ] **Step 4.1 — Modifica CoachLayout.jsx**

  Leggi `frontend/src/layouts/CoachLayout.jsx`. Applica queste modifiche:

  **Import lucide-react:** Rimuovi `Dumbbell`:
  ```jsx
  // BEFORE:
  import { Home, Calendar, Activity, Bell, Dumbbell } from 'lucide-react'

  // AFTER:
  import { Home, Calendar, Activity, Bell } from 'lucide-react'
  ```

  **sidebarItems array:** Rimuovi la voce Atletica:
  ```jsx
  // BEFORE:
  const sidebarItems = [
    { to: '/coach',            end: true, icon: Home,     label: 'Home' },
    { to: '/coach/calendario',            icon: Calendar,  label: 'Calendario' },
    { to: '/coach/attivita',              icon: Activity,  label: 'Attività' },
    { to: '/coach/bacheca',               icon: Bell,      label: 'Bacheca', badge: unread },
    { to: '/coach/atletica',              icon: Dumbbell,  label: 'Atletica' },
  ]

  // AFTER:
  const sidebarItems = [
    { to: '/coach',            end: true, icon: Home,     label: 'Home' },
    { to: '/coach/calendario',            icon: Calendar,  label: 'Calendario' },
    { to: '/coach/attivita',              icon: Activity,  label: 'Attività' },
    { to: '/coach/bacheca',               icon: Bell,      label: 'Bacheca', badge: unread },
  ]
  ```

  **Bottom nav mobile:** Rimuovi il `<NavLink to="/coach/atletica">` completo:
  ```jsx
  // Rimuovi questo blocco dalla bottom nav:
  <NavLink to="/coach/atletica" className={cls}>
    <Dumbbell size={21} strokeWidth={1.8} />
    <span className="text-xs font-medium">Atletica</span>
  </NavLink>
  ```

- [ ] **Step 4.2 — Modifica App.jsx: rimuovi route atletica e import AtleticaCoach**

  In `frontend/src/App.jsx`:

  ```jsx
  // Trova e rimuovi questo import:
  import AtleticaCoach from './pages/coach/AtleticaCoach'

  // Trova e rimuovi questa route (dentro il blocco /coach):
  <Route path="atletica" element={<AtleticaCoach />} />
  ```

  > Nota: il file `AtleticaCoach.jsx` non va eliminato.

- [ ] **Step 4.3 — Commit**

  ```
  git add frontend/src/layouts/CoachLayout.jsx frontend/src/App.jsx
  git commit -m "feat: rimuovi voce Atletica dal layout allenatore"
  ```

---

## Task 5: Build di verifica

- [ ] **Step 5.1 — Verifica build senza errori**

  ```powershell
  cd frontend; npm run build
  ```

  Atteso: `✓ built in X.XXs` — zero errori. Solo i warning pre-esistenti sul chunk size sono accettabili.

  Se ci sono errori di import (es. `StatoPage` o `AtleticaCoach` ancora referenziati da qualche parte), correggerli e ripetere il build.

- [ ] **Step 5.2 — Push**

  ```
  git push origin master
  ```
