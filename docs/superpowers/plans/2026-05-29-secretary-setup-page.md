# Secretary Setup Page + Admin SetupMenu Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiunge una pagina Setup alla segreteria per registrare giocatori e genitori, rimuove il FAB da GiocatoriPage, e ripulisce il SetupMenu admin.

**Architecture:** 5 file toccati. La nuova `SegreteriaSetupPage` è un hub con 2 modal: uno che riusa `GiocatoreWizard` (già esistente), uno che riusa `InvitaUtenteForm` (già esistente). Nessun nuovo componente UI da creare. Modifiche di routing e navigazione nel solito pattern del progetto.

**Tech Stack:** React 18, React Router v6, TanStack Query v5, Tailwind CSS, Lucide React

**Nota test:** Nessuna infrastruttura di test automatici nel frontend. Verifica manuale con `cd frontend && npm run dev`.

---

## File Map

| File | Azione |
|------|--------|
| `frontend/src/pages/admin/SetupMenu.jsx` | MODIFICA — rimuove voce Giocatori dal gruppo Persone |
| `frontend/src/pages/secretary/GiocatoriPage.jsx` | MODIFICA — rimuove FAB, modal wizard, stato showAdd, import GiocatoreWizard |
| `frontend/src/pages/secretary/SegreteriaSetupPage.jsx` | CREA — hub con 2 action card e 2 modal |
| `frontend/src/layouts/SecretaryLayout.jsx` | MODIFICA — aggiunge Setup alla sidebar, sostituisce Bacheca con Setup nel mobile nav |
| `frontend/src/App.jsx` | MODIFICA — aggiunge import e route `/secretary/setup` |

---

### Task 1: Rimuovi voce Giocatori da SetupMenu admin

**Files:**
- Modify: `frontend/src/pages/admin/SetupMenu.jsx`

- [ ] **Step 1.1: Rimuovi l'item Giocatori dall'array SECTIONS**

In `SetupMenu.jsx`, trova la costante `SECTIONS`. Il gruppo `👥 Persone` attualmente ha 3 item: Giocatori, Allenatori, Utenti & Accessi. Rimuovi solo l'item Giocatori.

Il gruppo Persone deve diventare:

```js
{
  group: '👥 Persone',
  items: [
    { icon: Dumbbell,  label: 'Allenatori',       desc: 'Profili e assegnazione',      tab: 'allenatori' },
    { icon: UserCheck, label: 'Utenti & Accessi',  desc: 'Inviti, ruoli, password',     tab: 'utenti'     },
  ],
},
```

Rimuovi anche `Trophy` dall'import se non è usato altrove nel file (era l'icona di Giocatori).

- [ ] **Step 1.2: Verifica**

```bash
cd frontend && npm run dev
```

Vai su `/admin/setup` → il gruppo "Persone" mostra solo "Allenatori" e "Utenti & Accessi". "Giocatori" non appare.

- [ ] **Step 1.3: Commit**

```bash
git add frontend/src/pages/admin/SetupMenu.jsx
git commit -m "feat: rimuovi voce Giocatori da SetupMenu admin (admin legge solo)"
```

---

### Task 2: Rimuovi FAB e wizard da GiocatoriPage

**Files:**
- Modify: `frontend/src/pages/secretary/GiocatoriPage.jsx`

- [ ] **Step 2.1: Rimuovi import GiocatoreWizard**

Trova e rimuovi la riga:
```js
import GiocatoreWizard from './GiocatoreWizard'
```

- [ ] **Step 2.2: Rimuovi stato showAdd**

Trova e rimuovi:
```js
const [showAdd, setShowAdd]     = useState(false)
```

- [ ] **Step 2.3: Rimuovi la costante `fab`**

Trova e rimuovi il blocco `const fab = (...)`:
```jsx
const fab = (
  <button
    onClick={() => setShowAdd(true)}
    className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform lg:bottom-6">
    <Plus size={24} />
  </button>
)
```

- [ ] **Step 2.4: Rimuovi la costante `modal`**

Trova e rimuovi il blocco `const modal = showAdd && (...)` — è il modal che avvolge il GiocatoreWizard.

- [ ] **Step 2.5: Rimuovi le occorrenze di `{fab}` e `{modal}` dal JSX**

Nel JSX di `GiocatoriPage` ci sono 3 return statement (loading, lista squadre, drill-down). In ognuno, rimuovi i riferimenti `{fab}` e `{modal}`.

Cerca e rimuovi tutte le occorrenze di:
- `{fab}`
- `{modal}`

- [ ] **Step 2.6: Rimuovi `Plus` dall'import lucide-react se non più usato**

Controlla se `Plus` è usato altrove nel file. Se non lo è, rimuovilo dall'import:
```js
// Prima:
import { ChevronRight, ChevronLeft, Users, Plus, X, Phone, Mail } from 'lucide-react'
// Dopo (se Plus non usato):
import { ChevronRight, ChevronLeft, Users, X, Phone, Mail } from 'lucide-react'
```

- [ ] **Step 2.7: Verifica**

```bash
cd frontend && npm run dev
```

Vai su `/secretary/giocatori` → nessun pulsante `+` visibile. La pagina mostra la lista squadre normalmente.

- [ ] **Step 2.8: Commit**

```bash
git add frontend/src/pages/secretary/GiocatoriPage.jsx
git commit -m "feat: rimuovi FAB e wizard modal da GiocatoriPage — spostati in SegreteriaSetupPage"
```

---

### Task 3: Crea SegreteriaSetupPage

**Files:**
- Create: `frontend/src/pages/secretary/SegreteriaSetupPage.jsx`

- [ ] **Step 3.1: Crea il file con il seguente contenuto**

```jsx
import { useState } from 'react'
import { UserPlus, UserCheck, ChevronRight, X } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import GiocatoreWizard from './GiocatoreWizard'
import InvitaUtenteForm from '../../components/InvitaUtenteForm'

const ACTIONS = [
  {
    id: 'giocatore',
    icon: UserPlus,
    title: 'Nuovo giocatore',
    desc: 'Aggiungi un atleta e invita il suo genitore',
  },
  {
    id: 'genitore',
    icon: UserCheck,
    title: 'Invita genitore',
    desc: 'Crea un account app per un genitore già registrato',
  },
]

export default function SegreteriaSetupPage() {
  const [openModal, setOpenModal] = useState(null) // 'giocatore' | 'genitore' | null

  return (
    <div>
      <PageHeader title="Registrazioni" subtitle="Aggiungi giocatori e genitori" />

      <div className="px-4 pt-4 space-y-3 pb-28">
        {ACTIONS.map(({ id, icon: Icon, title, desc }) => (
          <button
            key={id}
            onClick={() => setOpenModal(id)}
            className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-purple-600" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </button>
        ))}
      </div>

      {/* Modal Nuovo Giocatore */}
      {openModal === 'giocatore' && (
        <div className="fixed inset-0 bg-black/40 z-[200] overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 pt-8">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Nuovo giocatore</h2>
                <button onClick={() => setOpenModal(null)}>
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              <GiocatoreWizard
                onDone={() => setOpenModal(null)}
                onCancel={() => setOpenModal(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Invita Genitore */}
      {openModal === 'genitore' && (
        <div className="fixed inset-0 bg-black/40 z-[200] overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 pt-8">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Invita genitore</h2>
                <button onClick={() => setOpenModal(null)}>
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              <div className="px-5 pt-4 pb-5">
                <InvitaUtenteForm
                  ruoliConsentiti={['genitore']}
                  onSuccess={() => setOpenModal(null)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3.2: Verifica compilazione**

```bash
cd frontend && npm run dev
```

Il dev server non deve mostrare errori di compilazione per `SegreteriaSetupPage` (la pagina non è ancora raggiungibile via nav, ma deve compilare senza errori).

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/pages/secretary/SegreteriaSetupPage.jsx
git commit -m "feat: crea SegreteriaSetupPage — hub registrazioni giocatori e genitori"
```

---

### Task 4: Aggiorna SecretaryLayout — navigazione

**Files:**
- Modify: `frontend/src/layouts/SecretaryLayout.jsx`

- [ ] **Step 4.1: Aggiungi `UserPlus` all'import lucide-react**

Cambia:
```js
import { LayoutDashboard, Users, Bell, Receipt, Settings, Shield } from 'lucide-react'
```
in:
```js
import { LayoutDashboard, Users, Bell, Receipt, Settings, Shield, UserPlus } from 'lucide-react'
```

- [ ] **Step 4.2: Aggiungi Setup alla sidebar**

Nella costante `sidebarItems`, aggiungi un item Setup in fondo (prima di Impostazioni, o in coda):

```js
const sidebarItems = [
  { to: '/secretary',              end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/secretary/giocatori',               icon: Users,           label: 'Giocatori' },
  { to: '/secretary/quote',                   icon: Receipt,         label: 'Quote Squadre' },
  { to: '/secretary/certificati',             icon: Shield,          label: 'Certificati' },
  { to: '/secretary/bacheca',                 icon: Bell,            label: 'Bacheca', badge: unread },
  { to: '/secretary/impostazioni',            icon: Settings,        label: 'Impostazioni' },
  { to: '/secretary/setup',                   icon: UserPlus,        label: 'Setup' },
]
```

- [ ] **Step 4.3: Sostituisci Bacheca con Setup nel mobile nav**

Nel JSX del `<nav>` mobile, trova il `<NavLink to="/secretary/bacheca" ...>` e sostituiscilo con il NavLink per Setup:

```jsx
{/* PRIMA - rimuovi questo: */}
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

{/* DOPO - metti questo: */}
<NavLink to="/secretary/setup" className={cls}>
  <UserPlus size={22} strokeWidth={1.8} />
  <span className="text-xs font-medium">Setup</span>
</NavLink>
```

- [ ] **Step 4.4: Verifica**

```bash
cd frontend && npm run dev
```

1. Mobile (< lg): barra inferiore mostra Dashboard · Giocatori · Quote Sq. · Certificati · **Setup** (non Bacheca)
2. Sidebar (≥ lg): mostra Dashboard, Giocatori, Quote Sq., Certificati, Bacheca (con badge), Impostazioni, **Setup**

- [ ] **Step 4.5: Commit**

```bash
git add frontend/src/layouts/SecretaryLayout.jsx
git commit -m "feat: aggiorna navigazione segreteria — Setup in mobile, Bacheca in sidebar"
```

---

### Task 5: Routing — aggiunge /secretary/setup

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 5.1: Aggiungi import SegreteriaSetupPage**

In `App.jsx`, nel blocco degli import segreteria (righe ~24-31), aggiungi:
```js
import SegreteriaSetupPage from './pages/secretary/SegreteriaSetupPage'
```

- [ ] **Step 5.2: Aggiungi route dentro il blocco /secretary**

Nel blocco `<Route path="/secretary" ...>`, aggiungi prima di `</Route>`:
```jsx
<Route path="setup" element={<SegreteriaSetupPage />} />
```

Il blocco completo delle route segreteria diventa:
```jsx
<Route path="/secretary" element={<ProtectedRoute requiredRole="segreteria"><SecretaryLayout /></ProtectedRoute>}>
  <Route index                  element={<SegreteriaDashboard />} />
  <Route path="giocatori"       element={<GiocatoriPage />} />
  <Route path="giocatori/:id"  element={<GiocatoreDetail />} />
  <Route path="bacheca"         element={<BachecaPage />} />
  <Route path="quote"           element={<QuotePage />} />
  <Route path="certificati"     element={<CertificatiPage />} />
  <Route path="impostazioni"    element={<ImpostazioniSocieta />} />
  <Route path="setup"           element={<SegreteriaSetupPage />} />
</Route>
```

- [ ] **Step 5.3: Verifica routing completo**

```bash
cd frontend && npm run dev
```

1. Clicca "Setup" nel mobile nav (o sidebar) → naviga a `/secretary/setup`
2. La pagina mostra 2 card: "Nuovo giocatore" e "Invita genitore"
3. Clicca "Nuovo giocatore" → si apre il modal con il wizard 3-step
4. Completa il wizard (Step 1: scegli squadra, Step 2: cognome/nome, Step 3: salta) → modal si chiude
5. Clicca "Invita genitore" → si apre il modal con il form invito, campo ruolo nascosto (solo genitore)
6. `/secretary/giocatori` → nessun FAB `+` visibile
7. `/admin/setup` → gruppo Persone mostra solo Allenatori e Utenti & Accessi (no Giocatori)

- [ ] **Step 5.4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: aggiunge route /secretary/setup per SegreteriaSetupPage"
```

---

## Self-Review

**Copertura spec:**
- ✅ Admin SetupMenu: rimozione voce Giocatori → Task 1
- ✅ GiocatoriPage: rimozione FAB + modal + stato showAdd + import → Task 2
- ✅ SegreteriaSetupPage: hub con 2 card + 2 modal → Task 3
- ✅ SecretaryLayout: Setup in sidebar + sostituisce Bacheca nel mobile → Task 4
- ✅ App.jsx: route /secretary/setup → Task 5

**Placeholder scan:** nessun TBD/TODO presente. Ogni step ha codice completo.

**Consistenza nomi:**
- `SegreteriaSetupPage` usato uniformemente in Task 3, 4 (non referenziato), 5 ✅
- `openModal` gestisce `'giocatore' | 'genitore' | null` — usato solo in Task 3 ✅
- `InvitaUtenteForm` importato da `../../components/InvitaUtenteForm` — path corretto per `pages/secretary/` ✅
- `GiocatoreWizard` importato da `./GiocatoreWizard` — stesso livello ✅
