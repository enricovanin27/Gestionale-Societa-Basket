# Page Redesign — Sessione 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all page headers to be consistent and mobile-first (amber gradient, centered title), fix PDF file input on mobile, and audit/fix role-based route protection.

**Architecture:** Create a `PageHeader` component for inner pages; redesign `AppHeader` to center its title; apply to all 17 pages across all roles. PDF fix is 2-line change. Routing fix moves legacy `/importa` under `/coach/*` namespace and adds proper redirect.

**Tech Stack:** React 18, React Router v6, Tailwind CSS v4, Lucide React icons

---

## File Map

### Created
- `src/components/PageHeader.jsx` — amber gradient header for inner pages; centered title, optional subtitle, optional right-side actions, optional children (for tab bars)

### Modified — Task 1
- `src/components/AppHeader.jsx` — center title section (auto-updates all 11 pages using it)
- `src/components/ui/TabBar.jsx` — add `variant` prop to `TabBtn` for amber-background usage
- `src/pages/BachecaPage.jsx` — replace inline amber header with `PageHeader`
- `src/pages/CalendarioPage.jsx` — replace white header with `PageHeader` (tab bar as children)
- `src/pages/AllenamentiPage.jsx` — replace white header with `PageHeader` (squad switcher as children)
- `src/pages/ImportaCalendarioPage.jsx` — replace white header with `PageHeader`
- `src/pages/StatistichePage.jsx` — replace white header with `PageHeader` + white subheader for month nav
- `src/pages/SetupPage.jsx` — replace white header with `PageHeader` (tab bar as children, uses `variant="light"` on TabBtn)

### Modified — Task 2
- `src/pages/ImportaCalendarioPage.jsx` — fix `accept` attr, rename section label, rename page title
- `src/pages/CalendarioPage.jsx` — rename "Import FIP" tab to "Importa"

### Modified — Task 3
- `src/App.jsx` — add `/coach/importa` route, redirect legacy `/importa`

---

## TASK 1 — REDESIGN INTESTAZIONI

### Pages updated — summary

| Pagina | Ruolo | Metodo di aggiornamento |
|--------|-------|-------------------------|
| HomeAdmin | Admin | `AppHeader` — auto-update da Task 1.2 |
| HomeAllenatore | Allenatore | `AppHeader` — auto-update |
| HomeGenitore | Genitore | `AppHeader` — auto-update |
| HomeGiocatore | Giocatore | `AppHeader` — auto-update |
| SegreteriaDashboard | Segreteria | `AppHeader` — auto-update |
| SegreteriePage | Segreteria | `AppHeader` — auto-update |
| QuoteGenitore | Genitore | `AppHeader` — auto-update |
| PresenzePage | Allenatore | `AppHeader` — auto-update |
| AdminPersone | Admin | `AppHeader` — auto-update |
| SetupMenu | Admin | `AppHeader` — auto-update |
| StatisticheGiocatore | Giocatore | `AppHeader` — auto-update |
| BachecaPage | Tutti | `PageHeader` — Task 1.3 |
| CalendarioPage | Admin/Allenatore | `PageHeader` — Task 1.4 |
| AllenamentiPage | Admin | `PageHeader` — Task 1.5 |
| ImportaCalendarioPage | Allenatore/Admin | `PageHeader` — Task 1.6 |
| StatistichePage | Allenatore | `PageHeader` — Task 1.7 |
| SetupPage | Admin | `PageHeader` — Task 1.7 |

---

### Task 1.1: Create PageHeader component

**Files:**
- Create: `src/components/PageHeader.jsx`

- [ ] **Step 1: Create the file**

```jsx
export default function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="bg-gradient-to-r from-amber-800 to-amber-600 text-white sticky top-0 z-30 shadow-sm">
      <div className="relative flex items-center justify-center px-4 pt-10 pb-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-amber-200 text-sm mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="absolute right-4 inset-y-0 flex items-center">
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PageHeader.jsx
git commit -m "feat(ui): add PageHeader — centered amber gradient header for inner pages"
```

---

### Task 1.2: Redesign AppHeader — center the title

**Files:**
- Modify: `src/components/AppHeader.jsx` (full rewrite)

- [ ] **Step 1: Replace entire file content**

```jsx
import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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

const ROLE_PATH = {
  genitore:    '/parent',
  giocatore:   '/player',
  segreteria:  '/secretary',
  allenatore:  '/coach',
  admin:       '/admin',
  super_admin: '/platform',
}

export default function AppHeader({ title, subtitle, displayName, logout, societaNome, children }) {
  const { allRuoli, activeRole, setActiveRole } = useAuth()
  const navigate = useNavigate()
  const multiRole = allRuoli.length > 1

  function handleRoleSwitch(r) {
    setActiveRole(r)
    const path = ROLE_PATH[r]
    if (path) navigate(path)
  }

  return (
    <div className="bg-gradient-to-r from-amber-800 to-amber-600 text-white px-4 pt-10 pb-5">
      {/* Identity row: society name left, user controls right */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">🏀</span>
          <span className="text-sm font-semibold text-amber-100 truncate">
            {societaNome ?? 'Gestionale Basket'}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs text-amber-200 max-w-[110px] truncate">{displayName}</span>
          <div className="flex items-center gap-3">
            <CambiaPasswordButton />
            <button
              onClick={logout}
              className="flex items-center gap-1 text-xs text-amber-300 hover:text-white"
            >
              <LogOut size={13} /> Esci
            </button>
          </div>
        </div>
      </div>

      {/* Page title — centered */}
      {title && (
        <div className="text-center py-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-amber-200 text-sm mt-0.5 capitalize">{subtitle}</p>
          )}
        </div>
      )}

      {/* Role switcher — visible only with multiple roles */}
      {multiRole && (
        <div className="flex gap-1.5 mt-3 flex-wrap justify-center">
          {allRuoli.map(r => (
            <button
              key={r}
              onClick={() => handleRoleSwitch(r)}
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

- [ ] **Step 2: Commit**

```bash
git add src/components/AppHeader.jsx
git commit -m "feat(ui): redesign AppHeader — center title, cleaner identity row layout"
```

---

### Task 1.3: Add `variant` prop to TabBtn

`TabBtn` is used inside `SetupPage` on amber background. Add a `light` variant so active/inactive colors work on dark backgrounds.

**Files:**
- Modify: `src/components/ui/TabBar.jsx`

- [ ] **Step 1: Update TabBar.jsx**

Replace the entire file:

```jsx
export function TabBtn({ label, icon: Icon, active, onClick, variant = 'default' }) {
  const colorClass =
    variant === 'light'
      ? active
        ? 'border-white text-white'
        : 'border-transparent text-amber-200 hover:text-amber-100'
      : active
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500'

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

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/TabBar.jsx
git commit -m "feat(ui): add light variant to TabBtn for use on amber backgrounds"
```

---

### Task 1.4: Update BachecaPage header

**Files:**
- Modify: `src/pages/BachecaPage.jsx`

- [ ] **Step 1: Add PageHeader import**

At the top of `BachecaPage.jsx`, add to the import block:

```jsx
import PageHeader from '../components/PageHeader'
```

- [ ] **Step 2: Replace the inline header (lines 258–291 approx.)**

Find this block (starts with the outer sticky `div`):

```jsx
      <div className="bg-gradient-to-r from-amber-800 to-amber-600 text-white px-4 pt-12 pb-5 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">📣 Bacheca</h1>
            <p className="text-amber-200 text-xs mt-0.5">Comunicazioni della società</p>
          </div>
          {canWrite && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-white text-amber-700 px-3 py-2 rounded-xl text-sm font-semibold shadow active:scale-95 transition-transform"
            >
              <Plus size={16} /> Nuovo
            </button>
          )}
        </div>

        {/* Filtro squadra */}
        {(canWrite || mySquadre.length > 1) && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
```

Replace with:

```jsx
      <PageHeader
        title="Bacheca"
        subtitle="Comunicazioni della società"
        actions={canWrite && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-white text-amber-700 px-3 py-2 rounded-xl text-sm font-semibold shadow active:scale-95 transition-transform"
          >
            <Plus size={16} /> Nuovo
          </button>
        )}
      >
        {/* Filtro squadra */}
        {(canWrite || mySquadre.length > 1) && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
```

- [ ] **Step 3: Close PageHeader**

Find where the old outer sticky `div` closed (after the squad filter buttons, before the main content). Replace that closing `</div>` (of the header) with `</PageHeader>`.

The closing `</PageHeader>` goes right before the `<div className="px-4 py-4 space-y-3">` (or similar) that starts the annunci list.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BachecaPage.jsx
git commit -m "feat(ui): replace BachecaPage inline header with PageHeader"
```

---

### Task 1.5: Update CalendarioPage header

**Files:**
- Modify: `src/pages/CalendarioPage.jsx`

- [ ] **Step 1: Add PageHeader import**

```jsx
import PageHeader from '../components/PageHeader'
```

- [ ] **Step 2: Replace the sticky white header (lines 1088–1119)**

Find:

```jsx
      {/* ── Sticky header ── */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="px-4 pt-4 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">🏀 Calendario</h1>
            {calTab === 'partite' && (
              <button
                onClick={handleExportICS}
                disabled={exportingICS}
                title="Esporta calendario (.ics)"
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded-lg px-2 py-1 hover:border-blue-300 transition-colors disabled:opacity-50"
              >
                <Download size={13} />
                {exportingICS ? '…' : '.ics'}
              </button>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex bg-secondary rounded-xl p-1 gap-1">
            {[['partite', 'Partite'], ['settimana', 'Settimana'], ['importa', 'Import FIP']].map(([v, label]) => (
              <button key={v} onClick={() => setCalTab(v)}
                className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-all ${
                  calTab === v
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
```

Replace with:

```jsx
      {/* ── Sticky header ── */}
      <PageHeader
        title="Calendario"
        actions={calTab === 'partite' && (
          <button
            onClick={handleExportICS}
            disabled={exportingICS}
            title="Esporta calendario (.ics)"
            className="flex items-center gap-1 text-xs text-amber-100 hover:text-white border border-amber-400/50 rounded-lg px-2 py-1 hover:border-amber-200 transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            {exportingICS ? '…' : '.ics'}
          </button>
        )}
      >
        {/* Tab switcher */}
        <div className="px-4 pb-3">
          <div className="flex bg-amber-700/40 rounded-xl p-1 gap-1">
            {[['partite', 'Partite'], ['settimana', 'Settimana'], ['importa', 'Importa']].map(([v, label]) => (
              <button key={v} onClick={() => setCalTab(v)}
                className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-all ${
                  calTab === v
                    ? 'bg-white text-amber-900 shadow-sm'
                    : 'text-amber-100 hover:text-white'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>
```

Note: the tab label `'Import FIP'` is renamed to `'Importa'` here (short form, consistent with Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/pages/CalendarioPage.jsx
git commit -m "feat(ui): replace CalendarioPage header with PageHeader; rename tab Import FIP → Importa"
```

---

### Task 1.6: Update AllenamentiPage header

**Files:**
- Modify: `src/pages/AllenamentiPage.jsx`

- [ ] **Step 1: Add PageHeader import**

```jsx
import PageHeader from '../components/PageHeader'
```

- [ ] **Step 2: Replace the sticky white header (lines 1606–1635 approx.)**

Find:

```jsx
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Allenamenti</h1>
              <p className="text-xs text-gray-400 mt-0.5">Presenze · Annullamenti · Settimana tipo</p>
            </div>
            <a href="/calendario"
              className="text-xs text-amber-600 font-medium flex items-center gap-1 mt-1 hover:underline">
              Pianificazione →
            </a>
          </div>

          {isAllenatore && (
            <div className="flex bg-gray-100 rounded-lg p-0.5 mb-2">
              {[['mine', 'Le mie squadre'], ['all', 'Tutte le squadre']].map(([v, label]) => (
                <button key={v}
                  onClick={() => { setMySquadreOnly(v === 'mine'); setSquadraFilter('') }}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                    (v === 'mine') === mySquadreOnly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >{label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
```

Replace with:

```jsx
      <PageHeader
        title="Allenamenti"
        subtitle="Presenze · Annullamenti · Settimana tipo"
        actions={
          <a href="/calendario"
            className="text-xs text-amber-100 font-medium flex items-center gap-1 hover:text-white">
            Pianificazione →
          </a>
        }
      >
        {isAllenatore && (
          <div className="px-4 pb-3">
            <div className="flex bg-amber-700/40 rounded-lg p-0.5">
              {[['mine', 'Le mie squadre'], ['all', 'Tutte le squadre']].map(([v, label]) => (
                <button key={v}
                  onClick={() => { setMySquadreOnly(v === 'mine'); setSquadraFilter('') }}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                    (v === 'mine') === mySquadreOnly
                      ? 'bg-white text-amber-900 shadow-sm'
                      : 'text-amber-100 hover:text-white'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
        )}
      </PageHeader>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/AllenamentiPage.jsx
git commit -m "feat(ui): replace AllenamentiPage header with PageHeader"
```

---

### Task 1.7: Update ImportaCalendarioPage header (structure only)

The PDF fix and rename happen in Task 2. This step only swaps the header structure.

**Files:**
- Modify: `src/pages/ImportaCalendarioPage.jsx`

- [ ] **Step 1: Add PageHeader import**

```jsx
import PageHeader from '../components/PageHeader'
```

- [ ] **Step 2: Replace the white header (lines 499–505)**

Find:

```jsx
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Importa Calendario FIP</h1>
        </div>
      </div>
```

Replace with:

```jsx
      <PageHeader title="Importa Calendario FIP" />
```

Note: `FileText` may still be used elsewhere in the file — do NOT remove its import.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ImportaCalendarioPage.jsx
git commit -m "feat(ui): replace ImportaCalendarioPage header with PageHeader"
```

---

### Task 1.8: Update StatistichePage + SetupPage headers

**Files:**
- Modify: `src/pages/StatistichePage.jsx`
- Modify: `src/pages/SetupPage.jsx`

**StatistichePage**

The `monthSelector` const uses gray/white colors — it works on a white card background (also used in embedded mode). We keep it outside PageHeader in a plain white subheader row.

- [ ] **Step 1: Add PageHeader import to StatistichePage.jsx**

```jsx
import PageHeader from '../components/PageHeader'
```

- [ ] **Step 2: Replace the sticky white header (lines 223–235)**

Find:

```jsx
  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <BarChart2 size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Statistiche</h1>
        </div>
        <div className="px-4 pb-3">{monthSelector}</div>
      </div>
      <div className="p-4">{body}</div>
    </div>
  )
```

Replace with:

```jsx
  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <PageHeader title="Statistiche" />
      <div className="bg-white border-b shadow-sm">
        <div className="px-4 py-2">{monthSelector}</div>
      </div>
      <div className="p-4">{body}</div>
    </div>
  )
```

**SetupPage**

- [ ] **Step 3: Add PageHeader import to SetupPage.jsx**

```jsx
import PageHeader from '../components/PageHeader'
```

- [ ] **Step 4: Replace the sticky white header (lines 2952–2970)**

Find:

```jsx
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <Settings size={20} className="text-gray-700" />
          <h1 className="text-xl font-bold text-gray-900">Setup</h1>
        </div>
        <div className="flex border-t border-gray-100 overflow-x-auto">
          {tabs.map(tab => (
            <TabBtn
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </div>
```

Replace with:

```jsx
      <PageHeader title="Setup">
        <div className="flex border-t border-amber-700/50 overflow-x-auto">
          {tabs.map(tab => (
            <TabBtn
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              variant="light"
            />
          ))}
        </div>
      </PageHeader>
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/StatistichePage.jsx src/pages/SetupPage.jsx
git commit -m "feat(ui): replace StatistichePage and SetupPage headers with PageHeader"
```

---

## TASK 2 — FIX INPUT PDF DA MOBILE

### Task 2.1: Fix accept attribute, rename section, rename page title

**Files:**
- Modify: `src/pages/ImportaCalendarioPage.jsx`

- [ ] **Step 1: Fix the file input `accept` attribute (line ~387)**

Find:

```jsx
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => { setFile(e.target.files[0] ?? null); setPartite([]); setErrore(null) }}
            />
```

Replace with:

```jsx
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => { setFile(e.target.files[0] ?? null); setPartite([]); setErrore(null) }}
            />
```

The combined value `.pdf,application/pdf` covers both Android (uses extension) and iOS (uses MIME type).

- [ ] **Step 2: Rename section label (line ~373)**

Find:

```jsx
            <h2 className="text-sm font-semibold text-gray-700 mb-2">2. Carica PDF FIP</h2>
```

Replace with:

```jsx
            <h2 className="text-sm font-semibold text-gray-700 mb-2">2. Carica PDF calendario</h2>
```

- [ ] **Step 3: Rename page title in the PageHeader (from Task 1.7)**

Find:

```jsx
      <PageHeader title="Importa Calendario FIP" />
```

Replace with:

```jsx
      <PageHeader title="Importa Calendario" />
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/ImportaCalendarioPage.jsx
git commit -m "fix(mobile): accept .pdf + application/pdf; rename to Importa Calendario"
```

---

## TASK 3 — PROTEZIONE ROUTING PER RUOLO

### Route audit

Current routing protection status:

| Route pattern | `requiredRole` | Authorized roles (effective) |
|---------------|---------------|------------------------------|
| `/login` | — | Public |
| `/` | any logged-in | Any |
| `/parent/*` | `genitore` | genitore, admin*, super_admin* |
| `/parent/bacheca` | inherited | genitore, admin*, super_admin* |
| `/parent/quote` | inherited | genitore, admin*, super_admin* |
| `/player/*` | `giocatore` | giocatore, admin*, super_admin* |
| `/player/bacheca` | inherited | giocatore, admin*, super_admin* |
| `/player/statistiche` | inherited | giocatore, admin*, super_admin* |
| `/secretary/*` | `segreteria` | segreteria, admin*, super_admin* |
| `/secretary/giocatori` | inherited | segreteria, admin*, super_admin* |
| `/secretary/quote` | inherited | segreteria, admin*, super_admin* |
| `/secretary/bacheca` | inherited | segreteria, admin*, super_admin* |
| `/coach/*` | `allenatore` | allenatore, admin*, super_admin* |
| `/coach/calendario` | inherited | allenatore, admin*, super_admin* |
| `/coach/statistiche` | inherited | allenatore, admin*, super_admin* |
| `/coach/bacheca` | inherited | allenatore, admin*, super_admin* |
| `/coach/presenze` | inherited | allenatore, admin*, super_admin* |
| `/admin/*` | `admin` | admin, super_admin* |
| `/admin/partite` | inherited | admin, super_admin* |
| `/admin/allenamenti` | inherited | admin, super_admin* |
| `/admin/bacheca` | inherited | admin, super_admin* |
| `/admin/setup` | inherited | admin, super_admin* |
| `/admin/setup/:tab` | inherited | admin, super_admin* |
| `/admin/persone` | inherited | admin, super_admin* |
| `/importa` ⚠️ | `allenatore` (root-level) | allenatore, admin*, super_admin* |
| `*` (catchall) | any logged-in | Any → redirects to role home |

*admin/super_admin bypass is intentional in `ProtectedRoute.jsx` (line 14–15).

**Issues found:**
1. `/importa` is a root-level route not scoped under `/coach/*` — breaks namespace convention.
2. Per spec, giocatore/genitore should have Calendario and Comunicazioni routes. These **don't exist yet** (no components). Out of scope for this plan — flag for next session.

### Task 3.1: Move `/importa` under `/coach/*`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add `/coach/importa` nested route**

Find the `/coach/*` routes block (around line 158):

```jsx
        <Route path="/coach" element={<ProtectedRoute requiredRole="allenatore"><CoachLayout /></ProtectedRoute>}>
          <Route index         element={<HomeAllenatore />} />
          <Route path="calendario"  element={<CalendarioPage />} />
          <Route path="statistiche" element={<StatistichePage />} />
          <Route path="bacheca"     element={<BachecaPage />} />
          <Route path="presenze"    element={<PresenzePage />} />
        </Route>
```

Replace with:

```jsx
        <Route path="/coach" element={<ProtectedRoute requiredRole="allenatore"><CoachLayout /></ProtectedRoute>}>
          <Route index              element={<HomeAllenatore />} />
          <Route path="calendario"  element={<CalendarioPage />} />
          <Route path="statistiche" element={<StatistichePage />} />
          <Route path="bacheca"     element={<BachecaPage />} />
          <Route path="presenze"    element={<PresenzePage />} />
          <Route path="importa"     element={<ImportaCalendarioPage />} />
        </Route>
```

- [ ] **Step 2: Replace legacy `/importa` with redirect**

Find (around line 185):

```jsx
        <Route path="/importa"     element={<ProtectedRoute requiredRole="allenatore"><ImportaCalendarioPage /></ProtectedRoute>} />
```

Replace with:

```jsx
        <Route path="/importa"     element={<Navigate to="/coach/importa" replace />} />
```

No auth guard needed on the redirect itself — the destination `/coach/importa` is already guarded by the parent `ProtectedRoute` on `/coach/*`.

- [ ] **Step 3: Verify `Navigate` is already imported** — it is (line 2 of App.jsx: `import { ... Navigate ... } from 'react-router-dom'`). No import change needed.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "fix(routing): move /importa to /coach/importa; legacy URL redirects to new path"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered |
|-----------------|---------|
| Titolo centrato su tutte le pagine | ✓ `text-center` + `justify-center` in PageHeader and AppHeader |
| Tipografia più grande e leggibile | ✓ `text-2xl` (was `text-xl`) in both components |
| Struttura identica su tutte le pagine | ✓ Single amber gradient pattern across 17 pages |
| Spazio per sottotitolo | ✓ `subtitle` prop on PageHeader and AppHeader |
| Colori dal design system esistente | ✓ Only `amber-*` classes already in use |
| Mobile-first, no troncature | ✓ `tracking-tight`, no `truncate` on titles, flexible layout |
| Tutte le pagine, tutti i ruoli | ✓ See summary table above |
| PDF `accept=".pdf,application/pdf"` | ✓ Task 2.1 Step 1 |
| Rinomina sezione "Carica PDF FIP" | ✓ Task 2.1 Step 2 |
| Rinomina pagina "Importa Calendario" | ✓ Task 2.1 Step 3 |
| Route protette per ruolo | ✓ Existing ProtectedRoute already correct |
| Unauthorized → redirect a home | ✓ ProtectedRoute → Navigate to "/" → RoleRedirect |
| Elenco route con ruoli | ✓ Audit table in Task 3.1 |

### Missing routes (out of scope — flag for next session)

Per spec, these sections are authorized but have no route/component yet:
- `GIOCATORE`: Calendario, Comunicazioni
- `GENITORE`: Calendario, Comunicazioni

### Placeholder scan
No TBD, TODO, or "similar to above" patterns. All code steps are complete. ✓

### Type consistency
`PageHeader` props: `title` (string), `subtitle?` (string), `actions?` (ReactNode), `children?` (ReactNode) — used consistently across Tasks 1.1–1.8. `AppHeader` props unchanged (same interface). `TabBtn` new `variant` prop defaults to `'default'` — no breaking change. ✓
