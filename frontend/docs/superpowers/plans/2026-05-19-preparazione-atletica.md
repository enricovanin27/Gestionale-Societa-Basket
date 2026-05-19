# Modulo Preparazione Atletica — Piano di Implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il modulo di preparazione atletica all'app EVO con nuovo ruolo `preparatore_atletico`, 7 pagine `/prep/*`, tab sola lettura per allenatore e box RPE per il giocatore.

**Architecture:** `PrepLayout.jsx` con bottom nav a 7 voci (icone 18px, testo 9px) identico per struttura a `CoachLayout`/`AdminLayout`. Tutte le pagine usano TanStack Query + Supabase filtrando per `societa_id`. Le tabelle atletiche referenziano `giocatori(id)` (non `profiles(id)`) per includere anche i giocatori senza account app; `rpe_sessioni` idem, con il giocatore che recupera il proprio `giocatori.id` tramite `WHERE user_id = auth.uid()`.

**Tech Stack:** React 19, React Router v7, TanStack Query v5, Supabase JS v2, TailwindCSS v4, Lucide React, date-fns v4

---

## Mappa file

### Nuovi file
| File | Responsabilità |
|------|----------------|
| `supabase/migrations/supabase_migration_preparazione_atletica.sql` | Tutte le tabelle + RLS + constraint update |
| `frontend/src/layouts/PrepLayout.jsx` | Shell layout con bottom nav 7 voci |
| `frontend/src/pages/prep/HomePrep.jsx` | Dashboard 4 card colorate |
| `frontend/src/pages/prep/InfortuniPage.jsx` | CRUD infortuni |
| `frontend/src/pages/prep/TestFisiciPage.jsx` | Test fisici con trend + gestione tipi |
| `frontend/src/pages/prep/AntropometriaPage.jsx` | Misure giocatori |
| `frontend/src/pages/prep/SchedeAtletichePage.jsx` | Libreria schede atletiche |
| `frontend/src/pages/prep/SpaziPage.jsx` | Gestione sala pesi / palestre |
| `frontend/src/pages/prep/CarichiPage.jsx` | Dashboard RPE settimanale |
| `frontend/src/pages/coach/AtleticaCoach.jsx` | Tab sola lettura allenatore |

### File modificati
| File | Modifica |
|------|----------|
| `frontend/src/lib/constants.js` | Aggiunge `preparatore_atletico` a RUOLI, RUOLI_LABEL, RUOLI_EXTRA_DISPONIBILI |
| `frontend/src/hooks/useAuth.jsx` | Aggiunge flag `isPreparatore` |
| `frontend/src/components/RoleRedirect.jsx` | Aggiunge case `preparatore_atletico: '/prep'` |
| `frontend/src/App.jsx` | Aggiunge import + route `/prep/*` + `/coach/atletica` |
| `frontend/src/layouts/CoachLayout.jsx` | Aggiunge tab "Atletica" in bottom nav |
| `frontend/src/pages/player/HomeGiocatore.jsx` | Aggiunge box RPE condizionale |

---

## Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/supabase_migration_preparazione_atletica.sql`

- [ ] **Step 1.1: Crea il file migration**

```sql
-- ============================================================
-- MIGRATION: Modulo Preparazione Atletica
-- ============================================================

-- 1. Aggiorna constraint ruolo su profiles (aggiunge preparatore_atletico)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_ruolo_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_ruolo_check
  CHECK (ruolo IN ('super_admin','admin','allenatore','genitore','giocatore','segreteria','preparatore_atletico'));

-- 2. Aggiorna policy giocatori per includere preparatore_atletico
DROP POLICY IF EXISTS "giocatori_staff_all" ON giocatori;
CREATE POLICY "giocatori_staff_all" ON giocatori FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','allenatore','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra)
           OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = giocatori.societa_id
  ));

-- Helper macro: staff prep (preparatore + admin) — usato in WITH CHECK / INSERT
-- (Non esiste come funzione; copiata inline in ogni policy)

-- 3. Spazi atletici
CREATE TABLE IF NOT EXISTS spazi_atletici (
  id          SERIAL PRIMARY KEY,
  nome        TEXT        NOT NULL,
  tipo        TEXT        NOT NULL DEFAULT 'sala_pesi'
                          CHECK (tipo IN ('palestra','sala_pesi','altro')),
  capienza    INTEGER,
  note        TEXT,
  societa_id  UUID        NOT NULL REFERENCES societa(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE spazi_atletici ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spazi_atletici_prep_all" ON spazi_atletici FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_atletici.societa_id
  ));
CREATE POLICY "spazi_atletici_coach_read" ON spazi_atletici FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_atletici.societa_id
  ));

-- 4. Orario fisso spazi
CREATE TABLE IF NOT EXISTS spazi_orario_fisso (
  id          SERIAL PRIMARY KEY,
  spazio_id   INTEGER     NOT NULL REFERENCES spazi_atletici(id) ON DELETE CASCADE,
  giorno      TEXT        NOT NULL
              CHECK (giorno IN ('lunedi','martedi','mercoledi','giovedi','venerdi','sabato','domenica')),
  squadra     TEXT        NOT NULL,
  ora_inizio  TIME        NOT NULL,
  ora_fine    TIME        NOT NULL,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE spazi_orario_fisso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spazi_orario_fisso_prep_all" ON spazi_orario_fisso FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_orario_fisso.societa_id
  ));
CREATE POLICY "spazi_orario_fisso_coach_read" ON spazi_orario_fisso FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_orario_fisso.societa_id
  ));

-- 5. Variazioni settimanali spazi
CREATE TABLE IF NOT EXISTS spazi_orario_settimana (
  id          SERIAL PRIMARY KEY,
  spazio_id   INTEGER     NOT NULL REFERENCES spazi_atletici(id) ON DELETE CASCADE,
  data        DATE        NOT NULL,
  squadra     TEXT        NOT NULL,
  ora_inizio  TIME        NOT NULL,
  ora_fine    TIME        NOT NULL,
  annullato   BOOLEAN     NOT NULL DEFAULT false,
  note        TEXT,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE spazi_orario_settimana ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spazi_orario_settimana_prep_all" ON spazi_orario_settimana FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_orario_settimana.societa_id
  ));
CREATE POLICY "spazi_orario_settimana_coach_read" ON spazi_orario_settimana FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_orario_settimana.societa_id
  ));

-- 6. Tipi di test (configurabili per società)
CREATE TABLE IF NOT EXISTS test_definizioni (
  id          SERIAL PRIMARY KEY,
  nome        TEXT        NOT NULL,
  unita       TEXT        NOT NULL,
  ordine      INTEGER     NOT NULL DEFAULT 0,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE test_definizioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test_definizioni_prep_all" ON test_definizioni FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_definizioni.societa_id
  ));
CREATE POLICY "test_definizioni_coach_read" ON test_definizioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_definizioni.societa_id
  ));

-- 7. Risultati test (FK → giocatori, non profiles)
CREATE TABLE IF NOT EXISTS test_risultati (
  id            SERIAL PRIMARY KEY,
  giocatore_id  UUID        NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  test_id       INTEGER     NOT NULL REFERENCES test_definizioni(id) ON DELETE CASCADE,
  valore        NUMERIC     NOT NULL,
  data          DATE        NOT NULL,
  note          TEXT,
  societa_id    UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE test_risultati ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test_risultati_prep_all" ON test_risultati FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_risultati.societa_id
  ));
CREATE POLICY "test_risultati_coach_read" ON test_risultati FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_risultati.societa_id
  ));

-- 8. Test programmati (per card HomePrep "Prossimi test")
CREATE TABLE IF NOT EXISTS test_programmati (
  id          SERIAL PRIMARY KEY,
  test_id     INTEGER     NOT NULL REFERENCES test_definizioni(id) ON DELETE CASCADE,
  squadra     TEXT        NOT NULL,
  data        DATE        NOT NULL,
  note        TEXT,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE test_programmati ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test_programmati_prep_all" ON test_programmati FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_programmati.societa_id
  ));
CREATE POLICY "test_programmati_coach_read" ON test_programmati FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_programmati.societa_id
  ));

-- 9. Antropometria (FK → giocatori)
CREATE TABLE IF NOT EXISTS antropometria (
  id                  SERIAL PRIMARY KEY,
  giocatore_id        UUID        NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  data                DATE        NOT NULL,
  altezza_cm          NUMERIC,
  peso_kg             NUMERIC,
  apertura_braccia_cm NUMERIC,
  note                TEXT,
  societa_id          UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE antropometria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "antropometria_prep_all" ON antropometria FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = antropometria.societa_id
  ));
CREATE POLICY "antropometria_coach_read" ON antropometria FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = antropometria.societa_id
  ));

-- 10. Infortuni (FK → giocatori)
CREATE TABLE IF NOT EXISTS infortuni (
  id                     SERIAL PRIMARY KEY,
  giocatore_id           UUID        NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  tipo                   TEXT        NOT NULL,
  gravita                TEXT        NOT NULL CHECK (gravita IN ('lieve','moderato','grave')),
  data_inizio            DATE        NOT NULL,
  data_rientro_prevista  DATE,
  data_rientro_effettiva DATE,
  stato                  TEXT        NOT NULL DEFAULT 'attivo'
                         CHECK (stato IN ('attivo','risolto')),
  note                   TEXT,
  societa_id             UUID        NOT NULL REFERENCES societa(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE infortuni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "infortuni_prep_all" ON infortuni FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = infortuni.societa_id
  ));
CREATE POLICY "infortuni_coach_read" ON infortuni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = infortuni.societa_id
  ));

-- 11. RPE sessioni (FK → giocatori; il giocatore recupera il proprio id via user_id)
CREATE TABLE IF NOT EXISTS rpe_sessioni (
  id              SERIAL PRIMARY KEY,
  giocatore_id    UUID        NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  data            DATE        NOT NULL,
  tipo_sessione   TEXT        NOT NULL DEFAULT 'allenamento'
                  CHECK (tipo_sessione IN ('allenamento','partita','pesi')),
  valore_rpe      INTEGER     NOT NULL CHECK (valore_rpe BETWEEN 1 AND 10),
  note            TEXT,
  societa_id      UUID        NOT NULL REFERENCES societa(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (giocatore_id, data, tipo_sessione)
);
ALTER TABLE rpe_sessioni ENABLE ROW LEVEL SECURITY;
-- Staff (prep + allenatore): lettura completa; prep può anche scrivere
CREATE POLICY "rpe_sessioni_prep_all" ON rpe_sessioni FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = rpe_sessioni.societa_id
  ));
CREATE POLICY "rpe_sessioni_coach_read" ON rpe_sessioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = rpe_sessioni.societa_id
  ));
-- Giocatore: inserisce e legge solo il proprio
CREATE POLICY "rpe_sessioni_giocatore_insert" ON rpe_sessioni FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM giocatori
      WHERE giocatori.id = rpe_sessioni.giocatore_id
        AND giocatori.user_id = auth.uid())
  );
CREATE POLICY "rpe_sessioni_giocatore_select" ON rpe_sessioni FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM giocatori
      WHERE giocatori.id = rpe_sessioni.giocatore_id
        AND giocatori.user_id = auth.uid())
  );

-- 12. Schede atletiche
CREATE TABLE IF NOT EXISTS schede_atletiche (
  id            SERIAL PRIMARY KEY,
  nome          TEXT        NOT NULL,
  categoria     TEXT        NOT NULL
                CHECK (categoria IN ('riscaldamento','forza','mobilita','recupero','altro')),
  descrizione   TEXT,
  esercizi      JSONB       NOT NULL DEFAULT '[]',
  societa_id    UUID        NOT NULL REFERENCES societa(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE schede_atletiche ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schede_atletiche_prep_all" ON schede_atletiche FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = schede_atletiche.societa_id
  ));

-- 13. Assegnazioni schede
CREATE TABLE IF NOT EXISTS schede_assegnazioni (
  id           SERIAL PRIMARY KEY,
  scheda_id    INTEGER     NOT NULL REFERENCES schede_atletiche(id) ON DELETE CASCADE,
  squadra      TEXT,
  giocatore_id UUID        REFERENCES giocatori(id) ON DELETE CASCADE,
  data_inizio  DATE        NOT NULL,
  data_fine    DATE,
  societa_id   UUID        NOT NULL REFERENCES societa(id),
  CHECK (squadra IS NOT NULL OR giocatore_id IS NOT NULL)
);
ALTER TABLE schede_assegnazioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schede_assegnazioni_prep_all" ON schede_assegnazioni FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = schede_assegnazioni.societa_id
  ));
```

- [ ] **Step 1.2: Esegui la migration**

Vai su Supabase → SQL Editor → incolla il contenuto e clicca Run. Verifica che non ci siano errori rossi.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/supabase_migration_preparazione_atletica.sql
git commit -m "feat: migration SQL preparazione atletica — 13 nuove tabelle + RLS"
```

---

## Task 2: Foundation — costanti, hook, routing, layout

**Files:**
- Modify: `frontend/src/lib/constants.js`
- Modify: `frontend/src/hooks/useAuth.jsx`
- Modify: `frontend/src/components/RoleRedirect.jsx`
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/layouts/PrepLayout.jsx`
- Modify: `frontend/src/layouts/CoachLayout.jsx`

- [ ] **Step 2.1: Aggiorna `frontend/src/lib/constants.js`**

Sostituisci le tre righe RUOLI/RUOLI_LABEL/RUOLI_EXTRA_DISPONIBILI:

```js
export const RUOLI = ['admin', 'allenatore', 'segreteria', 'genitore', 'giocatore', 'preparatore_atletico']

export const RUOLI_LABEL = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  allenatore: 'Allenatore',
  segreteria: 'Segreteria',
  genitore: 'Genitore',
  giocatore: 'Giocatore',
  preparatore_atletico: 'Preparatore Atletico',
}

export const RUOLI_EXTRA_DISPONIBILI = ['admin', 'allenatore', 'segreteria', 'genitore', 'giocatore', 'preparatore_atletico']
```

- [ ] **Step 2.2: Aggiorna `frontend/src/hooks/useAuth.jsx`**

Dopo la riga `isSegreteria: allRuoli.includes('segreteria'),` aggiungi:

```js
    isPreparatore:      allRuoli.includes('preparatore_atletico'),
```

- [ ] **Step 2.3: Aggiorna `frontend/src/components/RoleRedirect.jsx`**

Nel const `ROLE_PATH`, dopo `allenatore: '/coach',` aggiungi:

```js
  preparatore_atletico: '/prep',
```

- [ ] **Step 2.4: Crea `frontend/src/layouts/PrepLayout.jsx`**

```jsx
import { Outlet, NavLink } from 'react-router-dom'
import { Home, AlertTriangle, Activity, Ruler, BookOpen, Building2, BarChart2 } from 'lucide-react'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-1 py-1 rounded-xl min-w-[28px] ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function PrepLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-1">
          <NavLink to="/prep" end className={cls}>
            <Home size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Home</span>
          </NavLink>
          <NavLink to="/prep/infortuni" className={cls}>
            <AlertTriangle size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Infortuni</span>
          </NavLink>
          <NavLink to="/prep/test" className={cls}>
            <Activity size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Test</span>
          </NavLink>
          <NavLink to="/prep/antropometria" className={cls}>
            <Ruler size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Misure</span>
          </NavLink>
          <NavLink to="/prep/schede" className={cls}>
            <BookOpen size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Schede</span>
          </NavLink>
          <NavLink to="/prep/spazi" className={cls}>
            <Building2 size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Spazi</span>
          </NavLink>
          <NavLink to="/prep/carichi" className={cls}>
            <BarChart2 size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Carichi</span>
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
```

- [ ] **Step 2.5: Aggiorna `frontend/src/layouts/CoachLayout.jsx`**

Nella riga degli import, aggiungi `Dumbbell` a Lucide:

```js
import { Home, Calendar, Activity, Bell, Dumbbell } from 'lucide-react'
```

Dopo il NavLink della Bacheca e prima della chiusura `</div>` della nav, aggiungi:

```jsx
          <NavLink to="/coach/atletica" className={cls}>
            <Dumbbell size={21} strokeWidth={1.8} />
            <span className="text-xs font-medium">Atletica</span>
          </NavLink>
```

- [ ] **Step 2.6: Aggiorna `frontend/src/App.jsx`**

Aggiungi questi import dopo gli import esistenti dei layout:

```jsx
import PrepLayout from './layouts/PrepLayout'
import HomePrep from './pages/prep/HomePrep'
import TestFisiciPage from './pages/prep/TestFisiciPage'
import InfortuniPage from './pages/prep/InfortuniPage'
import AntropometriaPage from './pages/prep/AntropometriaPage'
import SchedeAtletichePage from './pages/prep/SchedeAtletichePage'
import SpaziPage from './pages/prep/SpaziPage'
import CarichiPage from './pages/prep/CarichiPage'
import AtleticaCoach from './pages/coach/AtleticaCoach'
```

Dopo il blocco `{/* -- Admin -- */}` e prima di `{/* -- Legacy redirects -- */}`, aggiungi:

```jsx
        {/* ── Preparatore Atletico ─────────────────────────────── */}
        <Route path="/prep" element={<ProtectedRoute requiredRole="preparatore_atletico"><PrepLayout /></ProtectedRoute>}>
          <Route index                element={<HomePrep />} />
          <Route path="test"          element={<TestFisiciPage />} />
          <Route path="infortuni"     element={<InfortuniPage />} />
          <Route path="antropometria" element={<AntropometriaPage />} />
          <Route path="schede"        element={<SchedeAtletichePage />} />
          <Route path="spazi"         element={<SpaziPage />} />
          <Route path="carichi"       element={<CarichiPage />} />
        </Route>

        {/* ── Tab Atletica allenatore ──────────────────────────── */}
        <Route path="/coach/atletica" element={<ProtectedRoute requiredRole="allenatore"><AtleticaCoach /></ProtectedRoute>} />
```

- [ ] **Step 2.7: Verifica manuale**

Avvia il dev server (`npm run dev` in `frontend/`). Accedi con un account `admin`. Vai su Setup → Utenti, assegna il ruolo `preparatore_atletico` a un utente di test. Accedi con quell'utente: deve arrivare su `/prep` con la bottom nav a 7 icone. Accedi come allenatore: deve vedere la tab "Atletica" in fondo.

- [ ] **Step 2.8: Commit**

```bash
git add frontend/src/lib/constants.js frontend/src/hooks/useAuth.jsx \
        frontend/src/components/RoleRedirect.jsx frontend/src/App.jsx \
        frontend/src/layouts/PrepLayout.jsx frontend/src/layouts/CoachLayout.jsx
git commit -m "feat: aggiunge ruolo preparatore_atletico — routing, layout, nav"
```

---

## Task 3: HomePrep — dashboard panoramica

**Files:**
- Create: `frontend/src/pages/prep/HomePrep.jsx`

- [ ] **Step 3.1: Crea `frontend/src/pages/prep/HomePrep.jsx`**

```jsx
import { useQuery } from '@tanstack/react-query'
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { AlertTriangle, Dumbbell, BarChart2, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { GIORNI } from '../../lib/constants'

function rpeColor(v) {
  if (v <= 5) return 'text-green-600'
  if (v <= 7) return 'text-yellow-500'
  return 'text-red-600'
}

export default function HomePrep() {
  const { societaId } = useAuth()
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  // Indice giorno settimana 0=lun … 6=dom
  const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1
  const prossimi3Giorni = [0, 1, 2].map(offset => ({
    giorno: GIORNI[(todayIdx + offset) % 7],
    label: offset === 0 ? 'Oggi' : offset === 1 ? 'Domani'
           : format(addDays(today, offset), 'EEE d', { locale: it }),
  }))

  const { data: infortuni = [], isLoading } = useQuery({
    queryKey: ['home-prep-infortuni', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('infortuni')
        .select('id, tipo, data_rientro_prevista, giocatore:giocatore_id(nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .eq('stato', 'attivo')
        .order('data_inizio', { ascending: false })
      return data ?? []
    },
  })

  const { data: prossimiSlot = [] } = useQuery({
    queryKey: ['home-prep-spazi', societaId, todayIdx],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_orario_fisso')
        .select('id, giorno, squadra, ora_inizio, spazio:spazio_id(nome)')
        .eq('societa_id', societaId)
        .in('giorno', prossimi3Giorni.map(g => g.giorno))
        .order('ora_inizio')
      return (data ?? []).slice(0, 2).map(s => ({
        ...s,
        labelGiorno: prossimi3Giorni.find(g => g.giorno === s.giorno)?.label ?? s.giorno,
      }))
    },
  })

  const { data: rpeMedia = [] } = useQuery({
    queryKey: ['home-prep-rpe', societaId, weekStart, weekEnd],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('rpe_sessioni')
        .select('valore_rpe, giocatore:giocatore_id(squadra)')
        .eq('societa_id', societaId)
        .gte('data', weekStart)
        .lte('data', weekEnd)
      if (!data) return []
      const bySquadra = {}
      for (const r of data) {
        const sq = r.giocatore?.squadra ?? '—'
        if (!bySquadra[sq]) bySquadra[sq] = []
        bySquadra[sq].push(r.valore_rpe)
      }
      return Object.entries(bySquadra)
        .map(([sq, vals]) => ({ squadra: sq, media: (vals.reduce((a, b) => a + b, 0) / vals.length) }))
        .sort((a, b) => a.squadra.localeCompare(b.squadra))
    },
  })

  const { data: prossimiTest = [] } = useQuery({
    queryKey: ['home-prep-test', societaId, todayStr],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('test_programmati')
        .select('id, data, squadra, test:test_id(nome)')
        .eq('societa_id', societaId)
        .gte('data', todayStr)
        .order('data')
        .limit(2)
      return data ?? []
    },
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Preparazione Atletica" subtitle="Panoramica" />
      <div className="p-4 grid grid-cols-2 gap-3">

        {/* Infortuni attivi — rosso */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={14} className="text-red-600" />
            <span className="text-xs font-bold text-red-800">Infortuni attivi</span>
          </div>
          {infortuni.length === 0 ? (
            <p className="text-xs text-gray-400">Nessuno</p>
          ) : (
            infortuni.slice(0, 2).map(i => (
              <div key={i.id} className="text-xs text-gray-700 leading-tight truncate">
                {i.giocatore?.cognome} {i.giocatore?.nome?.charAt(0)}. — {i.giocatore?.squadra}
              </div>
            ))
          )}
          {infortuni.length > 0 && (
            <span className="mt-1.5 inline-block bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {infortuni.length} attivi
            </span>
          )}
        </div>

        {/* Prossimi slot spazi — blu */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Dumbbell size={14} className="text-blue-600" />
            <span className="text-xs font-bold text-blue-800">Prossimi spazi</span>
          </div>
          {prossimiSlot.length === 0 ? (
            <p className="text-xs text-gray-400">Nessuno in programma</p>
          ) : (
            prossimiSlot.map(s => (
              <div key={s.id} className="text-xs text-gray-700 leading-tight">
                {s.labelGiorno} {s.ora_inizio?.slice(0, 5)} — {s.squadra}
              </div>
            ))
          )}
        </div>

        {/* Carichi RPE — verde */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart2 size={14} className="text-green-600" />
            <span className="text-xs font-bold text-green-800">Carichi settimana</span>
          </div>
          {rpeMedia.length === 0 ? (
            <p className="text-xs text-gray-400">Nessun dato RPE</p>
          ) : (
            rpeMedia.slice(0, 2).map(r => (
              <div key={r.squadra} className="text-xs text-gray-700 leading-tight">
                {r.squadra} — RPE{' '}
                <span className={`font-semibold ${rpeColor(r.media)}`}>
                  {r.media.toFixed(1)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Prossimi test — viola */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <ClipboardList size={14} className="text-purple-600" />
            <span className="text-xs font-bold text-purple-800">Prossimi test</span>
          </div>
          {prossimiTest.length === 0 ? (
            <p className="text-xs text-gray-400">Nessun test pianificato</p>
          ) : (
            prossimiTest.map(t => (
              <div key={t.id} className="text-xs text-gray-700 leading-tight">
                {t.test?.nome} — {t.squadra} · {format(new Date(t.data + 'T00:00:00'), 'd/MM')}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 3.2: Verifica manuale**

Vai su `/prep`. Le 4 card devono apparire. Con il DB vuoto mostreranno "Nessuno/Nessun dato". Inserisci un infortunio manualmente su Supabase e ricarica: deve comparire nella card rossa.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/pages/prep/HomePrep.jsx
git commit -m "feat: HomePrep — dashboard 4 card panoramica preparatore"
```

---

## Task 4: InfortuniPage

**Files:**
- Create: `frontend/src/pages/prep/InfortuniPage.jsx`

- [ ] **Step 4.1: Crea `frontend/src/pages/prep/InfortuniPage.jsx`**

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Plus, X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const GRAVITA_COLORS = {
  lieve:    'bg-amber-100 text-amber-800',
  moderato: 'bg-orange-100 text-orange-800',
  grave:    'bg-red-100 text-red-800',
}

const FORM_EMPTY = {
  giocatore_id: '',
  tipo: '',
  gravita: 'lieve',
  data_inizio: format(new Date(), 'yyyy-MM-dd'),
  data_rientro_prevista: '',
  note: '',
}

export default function InfortuniPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState('attivi')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-list', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra')
        .eq('societa_id', societaId)
        .order('cognome')
      return data ?? []
    },
  })

  const { data: infortuni = [], isLoading } = useQuery({
    queryKey: ['infortuni', societaId, tab],
    enabled: !!societaId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('infortuni')
        .select('*, giocatore:giocatore_id(nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .eq('stato', tab === 'attivi' ? 'attivo' : 'risolto')
        .order('data_inizio', { ascending: false })
      return data ?? []
    },
  })

  const insertMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('infortuni').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['infortuni', societaId] })
      qc.invalidateQueries({ queryKey: ['home-prep-infortuni', societaId] })
      setShowModal(false)
      setForm(FORM_EMPTY)
    },
  })

  const risolviMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('infortuni')
        .update({ stato: 'risolto', data_rientro_effettiva: format(new Date(), 'yyyy-MM-dd') })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['infortuni', societaId] }),
  })

  async function handleSave(e) {
    e.preventDefault()
    if (!form.giocatore_id || !form.tipo) return
    setSaving(true)
    await insertMut.mutateAsync({
      ...form,
      data_rientro_prevista: form.data_rientro_prevista || null,
      societa_id: societaId,
    })
    setSaving(false)
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'
  const tabCls = (t) => `px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
    tab === t ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'
  }`

  return (
    <div>
      <PageHeader
        title="Infortuni"
        actions={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm">
            <Plus size={14} /> Nuovo
          </button>
        }
      />

      <div className="p-4">
        <div className="flex gap-2 mb-4">
          <button className={tabCls('attivi')} onClick={() => setTab('attivi')}>Attivi</button>
          <button className={tabCls('risolti')} onClick={() => setTab('risolti')}>Risolti</button>
        </div>

        {isLoading ? <LoadingSpinner /> : (
          <div className="space-y-3">
            {infortuni.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Nessun infortunio {tab}</p>
            )}
            {infortuni.map(inf => (
              <div key={inf.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {inf.giocatore?.cognome} {inf.giocatore?.nome} — {inf.giocatore?.squadra}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {inf.tipo} ·{' '}
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${GRAVITA_COLORS[inf.gravita]}`}>
                        {inf.gravita.charAt(0).toUpperCase() + inf.gravita.slice(1)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Dal {format(parseISO(inf.data_inizio), 'dd/MM/yyyy')}
                      {inf.data_rientro_prevista && ` · Rientro prev. ${format(parseISO(inf.data_rientro_prevista), 'dd/MM/yyyy')}`}
                    </div>
                    {inf.note && <div className="text-xs text-gray-400 mt-0.5">{inf.note}</div>}
                  </div>
                  {tab === 'attivi' && (
                    <button
                      onClick={() => risolviMut.mutate(inf.id)}
                      className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg whitespace-nowrap"
                    >
                      <Check size={12} /> Risolto
                    </button>
                  )}
                </div>
                {tab === 'risolti' && inf.data_rientro_effettiva && (
                  <div className="text-xs text-green-600 mt-1">
                    Rientrato il {format(parseISO(inf.data_rientro_effettiva), 'dd/MM/yyyy')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nuovo infortunio */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuovo infortunio</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Giocatore *</label>
                <select className={inp} value={form.giocatore_id}
                  onChange={e => setForm(f => ({ ...f, giocatore_id: e.target.value }))} required>
                  <option value="">Seleziona giocatore</option>
                  {giocatori.map(g => (
                    <option key={g.id} value={g.id}>{g.cognome} {g.nome} — {g.squadra}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo di infortunio *</label>
                <input className={inp} value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  placeholder="es. Distorsione caviglia, Contrattura..." required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Gravità</label>
                <select className={inp} value={form.gravita}
                  onChange={e => setForm(f => ({ ...f, gravita: e.target.value }))}>
                  <option value="lieve">Lieve</option>
                  <option value="moderato">Moderato</option>
                  <option value="grave">Grave</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data inizio *</label>
                <input type="date" className={inp} value={form.data_inizio}
                  onChange={e => setForm(f => ({ ...f, data_inizio: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Rientro previsto</label>
                <input type="date" className={inp} value={form.data_rientro_prevista}
                  onChange={e => setForm(f => ({ ...f, data_rientro_prevista: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <textarea className={inp} rows={2} value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              {insertMut.isError && (
                <p className="text-xs text-red-500">{insertMut.error?.message}</p>
              )}
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva infortunio'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4.2: Verifica manuale**

Vai su `/prep/infortuni`. Clicca "+ Nuovo", compila il form, salva. Il record deve apparire nella lista "Attivi". Clicca "Risolto" su una card: deve spostarsi in "Risolti".

- [ ] **Step 4.3: Commit**

```bash
git add frontend/src/pages/prep/InfortuniPage.jsx
git commit -m "feat: InfortuniPage — CRUD infortuni con tab attivi/risolti"
```

---

## Task 5: TestFisiciPage

**Files:**
- Create: `frontend/src/pages/prep/TestFisiciPage.jsx`

- [ ] **Step 5.1: Crea `frontend/src/pages/prep/TestFisiciPage.jsx`**

```jsx
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, X, Settings, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const DEFAULT_TESTS = [
  { nome: 'Sprint 20m', unita: 'secondi', ordine: 0 },
  { nome: 'Salto verticale', unita: 'cm', ordine: 1 },
  { nome: 'Shuttle run', unita: 'secondi', ordine: 2 },
  { nome: 'Yo-Yo', unita: 'livello', ordine: 3 },
]

export default function TestFisiciPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [squadraFiltro, setSquadraFiltro] = useState('')
  const [testFiltro, setTestFiltro] = useState('')
  const [showRisultatiModal, setShowRisultatiModal] = useState(false)
  const [showGestisciModal, setShowGestisciModal] = useState(false)
  const [formRis, setFormRis] = useState({ giocatore_id: '', valore: '', data: format(new Date(), 'yyyy-MM-dd'), note: '' })
  const [newTestNome, setNewTestNome] = useState('')
  const [newTestUnita, setNewTestUnita] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-list', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome, squadra')
        .eq('societa_id', societaId).order('cognome')
      return data ?? []
    },
  })

  const { data: testDef = [], isLoading: loadingDef } = useQuery({
    queryKey: ['test-definizioni', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('test_definizioni').select('*')
        .eq('societa_id', societaId).order('ordine')
      if (data && data.length === 0) {
        // Auto-seed default tests per questa società
        const inserts = DEFAULT_TESTS.map(t => ({ ...t, societa_id: societaId }))
        const { data: seeded } = await supabase.from('test_definizioni').insert(inserts).select()
        return seeded ?? []
      }
      return data ?? []
    },
  })

  const { data: risultati = [], isLoading: loadingRis } = useQuery({
    queryKey: ['test-risultati', societaId, testFiltro],
    enabled: !!societaId && !!testFiltro,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('test_risultati')
        .select('id, valore, data, giocatore:giocatore_id(id, nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .eq('test_id', testFiltro)
        .order('data')
      return data ?? []
    },
  })

  const squadre = useMemo(() => [...new Set(giocatori.map(g => g.squadra))].sort(), [giocatori])

  const giocatoriFiltrati = useMemo(() =>
    squadraFiltro ? giocatori.filter(g => g.squadra === squadraFiltro) : giocatori,
    [giocatori, squadraFiltro]
  )

  // Pivot: giocatore → {data → valore}
  const pivot = useMemo(() => {
    const map = {}
    for (const r of risultati) {
      const gid = r.giocatore?.id
      if (!gid) continue
      if (!map[gid]) map[gid] = { giocatore: r.giocatore, valori: {} }
      map[gid].valori[r.data] = r.valore
    }
    return Object.values(map)
  }, [risultati])

  const colDate = useMemo(() => {
    const dates = [...new Set(risultati.map(r => r.data))].sort()
    return dates.slice(-4) // ultime 4 sessioni
  }, [risultati])

  function trend(valori) {
    const vals = colDate.map(d => valori[d]).filter(v => v != null)
    if (vals.length < 2) return '—'
    const testSel = testDef.find(t => t.id === parseInt(testFiltro))
    const unitaTemporale = testSel?.unita === 'secondi'
    const diff = vals[vals.length - 1] - vals[vals.length - 2]
    // Per secondi/tempo: scendere è migliorare; per distanza/ripetizioni: salire è migliorare
    const migliora = unitaTemporale ? diff < 0 : diff > 0
    return migliora
      ? <span className="text-green-600 font-bold">▼</span>
      : <span className="text-red-500 font-bold">▲</span>
  }

  const insertRisMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('test_risultati').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-risultati', societaId] })
      setShowRisultatiModal(false)
      setFormRis({ giocatore_id: '', valore: '', data: format(new Date(), 'yyyy-MM-dd'), note: '' })
    },
  })

  const addTestMut = useMutation({
    mutationFn: async ({ nome, unita }) => {
      const { error } = await supabase.from('test_definizioni')
        .insert({ nome, unita, ordine: testDef.length, societa_id: societaId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-definizioni', societaId] })
      setNewTestNome('')
      setNewTestUnita('')
    },
  })

  const deleteTestMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('test_definizioni').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      if (testFiltro === String(deleteTestMut.variables)) setTestFiltro('')
      qc.invalidateQueries({ queryKey: ['test-definizioni', societaId] })
    },
  })

  async function handleSaveRisultato(e) {
    e.preventDefault()
    if (!formRis.giocatore_id || !formRis.valore || !testFiltro) return
    setSaving(true)
    await insertRisMut.mutateAsync({
      giocatore_id: formRis.giocatore_id,
      test_id: parseInt(testFiltro),
      valore: parseFloat(formRis.valore),
      data: formRis.data,
      note: formRis.note || null,
      societa_id: societaId,
    })
    setSaving(false)
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader
        title="Test Fisici"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowGestisciModal(true)}
              className="p-1.5 bg-white/20 rounded-lg"><Settings size={16} /></button>
            <button onClick={() => testFiltro ? setShowRisultatiModal(true) : alert('Seleziona prima un tipo di test')}
              className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-2 py-1.5 rounded-xl shadow-sm">
              <Plus size={14} /> Risultati
            </button>
          </div>
        }
      />

      <div className="p-4 space-y-4">
        {/* Filtri */}
        <div className="flex gap-2">
          <select className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={squadraFiltro} onChange={e => setSquadraFiltro(e.target.value)}>
            <option value="">Tutte le squadre</option>
            {squadre.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={testFiltro} onChange={e => setTestFiltro(e.target.value)}>
            <option value="">Seleziona test</option>
            {testDef.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>

        {/* Tabella risultati */}
        {!testFiltro ? (
          <p className="text-center text-gray-400 text-sm py-8">Seleziona un tipo di test per vedere i risultati</p>
        ) : loadingRis ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-amber-50">
                  <th className="text-left p-2 text-amber-900 font-semibold text-xs">Giocatore</th>
                  {colDate.map(d => (
                    <th key={d} className="p-2 text-amber-900 font-semibold text-xs">
                      {format(new Date(d + 'T00:00:00'), 'd/MM')}
                    </th>
                  ))}
                  <th className="p-2 text-amber-900 font-semibold text-xs">Trend</th>
                </tr>
              </thead>
              <tbody>
                {pivot
                  .filter(row => !squadraFiltro || row.giocatore?.squadra === squadraFiltro)
                  .map(row => (
                    <tr key={row.giocatore?.id} className="border-b border-amber-50">
                      <td className="p-2 font-medium text-gray-800">
                        {row.giocatore?.cognome} {row.giocatore?.nome?.charAt(0)}.
                      </td>
                      {colDate.map(d => (
                        <td key={d} className="p-2 text-center text-gray-600">
                          {row.valori[d] != null ? row.valori[d] : '—'}
                        </td>
                      ))}
                      <td className="p-2 text-center">{trend(row.valori)}</td>
                    </tr>
                  ))
                }
                {pivot.filter(row => !squadraFiltro || row.giocatore?.squadra === squadraFiltro).length === 0 && (
                  <tr><td colSpan={colDate.length + 2} className="text-center text-gray-400 py-6 text-sm">
                    Nessun risultato per questo test
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal inserimento risultati */}
      {showRisultatiModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Inserisci risultato</h2>
              <button onClick={() => setShowRisultatiModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveRisultato} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Giocatore *</label>
                <select className={inp} value={formRis.giocatore_id}
                  onChange={e => setFormRis(f => ({ ...f, giocatore_id: e.target.value }))} required>
                  <option value="">Seleziona giocatore</option>
                  {giocatoriFiltrati.map(g => (
                    <option key={g.id} value={g.id}>{g.cognome} {g.nome} — {g.squadra}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  Valore ({testDef.find(t => t.id === parseInt(testFiltro))?.unita ?? ''}) *
                </label>
                <input type="number" step="0.01" className={inp} value={formRis.valore}
                  onChange={e => setFormRis(f => ({ ...f, valore: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
                <input type="date" className={inp} value={formRis.data}
                  onChange={e => setFormRis(f => ({ ...f, data: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <input className={inp} value={formRis.note}
                  onChange={e => setFormRis(f => ({ ...f, note: e.target.value }))} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva risultato'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal gestione tipi di test */}
      {showGestisciModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Gestisci tipi di test</h2>
              <button onClick={() => setShowGestisciModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-2 mb-4">
              {testDef.map(t => (
                <div key={t.id} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{t.nome}</span>
                    <span className="text-xs text-gray-400 ml-2">({t.unita})</span>
                  </div>
                  <button onClick={() => deleteTestMut.mutate(t.id)}
                    className="text-gray-400 hover:text-red-500 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-medium text-gray-500">Aggiungi nuovo tipo</p>
              <input className={inp} placeholder="Nome test" value={newTestNome}
                onChange={e => setNewTestNome(e.target.value)} />
              <input className={inp} placeholder="Unità (es. secondi, cm, livello)" value={newTestUnita}
                onChange={e => setNewTestUnita(e.target.value)} />
              <button
                onClick={() => newTestNome && newTestUnita && addTestMut.mutate({ nome: newTestNome, unita: newTestUnita })}
                className="w-full py-2 bg-amber-500 text-white rounded-xl font-semibold text-sm">
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5.2: Verifica manuale**

Vai su `/prep/test`. Verifica che il select "Seleziona test" popoli con i 4 test default (vengono auto-inseriti al primo caricamento). Seleziona un test e inserisci un risultato. La tabella pivot deve mostrare il valore. Apri l'ingranaggio → aggiungi un tipo di test personalizzato.

- [ ] **Step 5.3: Commit**

```bash
git add frontend/src/pages/prep/TestFisiciPage.jsx
git commit -m "feat: TestFisiciPage — tabella pivot risultati con trend e gestione tipi"
```

---

## Task 6: AntropometriaPage

**Files:**
- Create: `frontend/src/pages/prep/AntropometriaPage.jsx`

- [ ] **Step 6.1: Crea `frontend/src/pages/prep/AntropometriaPage.jsx`**

```jsx
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const FORM_EMPTY = {
  giocatore_id: '',
  data: format(new Date(), 'yyyy-MM-dd'),
  altezza_cm: '',
  peso_kg: '',
  apertura_braccia_cm: '',
  note: '',
}

export default function AntropometriaPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [squadraFiltro, setSquadraFiltro] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-list', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome, squadra')
        .eq('societa_id', societaId).order('cognome')
      return data ?? []
    },
  })

  // Ultima rilevazione per giocatore
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['antropometria', societaId, squadraFiltro],
    enabled: !!societaId,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('antropometria')
        .select('*, giocatore:giocatore_id(id, nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .order('data', { ascending: false })
      const { data } = await q
      if (!data) return []
      // Tieni solo l'ultima rilevazione per giocatore
      const seen = new Set()
      return data.filter(r => {
        const gid = r.giocatore?.id
        if (!gid || seen.has(gid)) return false
        seen.add(gid)
        return true
      })
    },
  })

  const squadre = useMemo(() => [...new Set(giocatori.map(g => g.squadra))].sort(), [giocatori])
  const righe = useMemo(() =>
    squadraFiltro ? rows.filter(r => r.giocatore?.squadra === squadraFiltro) : rows,
    [rows, squadraFiltro]
  )

  const insertMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('antropometria').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['antropometria', societaId] })
      setShowModal(false)
      setForm(FORM_EMPTY)
    },
  })

  async function handleSave(e) {
    e.preventDefault()
    if (!form.giocatore_id) return
    setSaving(true)
    await insertMut.mutateAsync({
      giocatore_id: form.giocatore_id,
      data: form.data,
      altezza_cm: form.altezza_cm ? parseFloat(form.altezza_cm) : null,
      peso_kg: form.peso_kg ? parseFloat(form.peso_kg) : null,
      apertura_braccia_cm: form.apertura_braccia_cm ? parseFloat(form.apertura_braccia_cm) : null,
      note: form.note || null,
      societa_id: societaId,
    })
    setSaving(false)
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader
        title="Antropometria"
        actions={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm">
            <Plus size={14} /> Nuova
          </button>
        }
      />

      <div className="p-4">
        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
          value={squadraFiltro} onChange={e => setSquadraFiltro(e.target.value)}>
          <option value="">Tutte le squadre</option>
          {squadre.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-amber-50">
                  <th className="text-left p-2 text-amber-900 font-semibold text-xs">Giocatore</th>
                  <th className="p-2 text-amber-900 font-semibold text-xs">Alt. (cm)</th>
                  <th className="p-2 text-amber-900 font-semibold text-xs">Peso (kg)</th>
                  <th className="p-2 text-amber-900 font-semibold text-xs">Ap. br. (cm)</th>
                  <th className="p-2 text-amber-900 font-semibold text-xs">Data</th>
                </tr>
              </thead>
              <tbody>
                {righe.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8 text-sm">Nessuna rilevazione</td></tr>
                )}
                {righe.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-amber-50/50">
                    <td className="p-2 font-medium text-gray-800">
                      {r.giocatore?.cognome} {r.giocatore?.nome?.charAt(0)}.
                      <span className="text-xs text-gray-400 ml-1">— {r.giocatore?.squadra}</span>
                    </td>
                    <td className="p-2 text-center text-gray-700">{r.altezza_cm ?? '—'}</td>
                    <td className="p-2 text-center text-gray-700">{r.peso_kg ?? '—'}</td>
                    <td className="p-2 text-center text-gray-700">{r.apertura_braccia_cm ?? '—'}</td>
                    <td className="p-2 text-center text-gray-400 text-xs">
                      {format(parseISO(r.data), 'dd/MM/yy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuova rilevazione</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Giocatore *</label>
                <select className={inp} value={form.giocatore_id}
                  onChange={e => setForm(f => ({ ...f, giocatore_id: e.target.value }))} required>
                  <option value="">Seleziona giocatore</option>
                  {giocatori.map(g => (
                    <option key={g.id} value={g.id}>{g.cognome} {g.nome} — {g.squadra}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
                <input type="date" className={inp} value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Altezza (cm)</label>
                  <input type="number" step="0.1" className={inp} value={form.altezza_cm}
                    onChange={e => setForm(f => ({ ...f, altezza_cm: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Peso (kg)</label>
                  <input type="number" step="0.1" className={inp} value={form.peso_kg}
                    onChange={e => setForm(f => ({ ...f, peso_kg: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Ap. br. (cm)</label>
                  <input type="number" step="0.1" className={inp} value={form.apertura_braccia_cm}
                    onChange={e => setForm(f => ({ ...f, apertura_braccia_cm: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <textarea className={inp} rows={2} value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva rilevazione'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6.2: Verifica manuale**

Vai su `/prep/antropometria`. Inserisci una rilevazione per un giocatore. La tabella deve mostrare una riga con i dati. Inserisci una seconda rilevazione per lo stesso giocatore: la tabella deve mostrare solo l'ultima (la più recente).

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/pages/prep/AntropometriaPage.jsx
git commit -m "feat: AntropometriaPage — tabella misure con ultima rilevazione per giocatore"
```

---

## Task 7: SchedeAtletichePage

**Files:**
- Create: `frontend/src/pages/prep/SchedeAtletichePage.jsx`

- [ ] **Step 7.1: Crea `frontend/src/pages/prep/SchedeAtletichePage.jsx`**

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
const ESERCIZIO_EMPTY = { nome: '', serie: '', reps: '', note: '' }
const FORM_EMPTY = { nome: '', categoria: 'riscaldamento', descrizione: '', esercizi: [{ ...ESERCIZIO_EMPTY }] }

export default function SchedeAtletichePage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

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

  const insertMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('schede_atletiche').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schede-atletiche', societaId] })
      setShowModal(false)
      setForm(FORM_EMPTY)
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

  function addEsercizio() {
    setForm(f => ({ ...f, esercizi: [...f.esercizi, { ...ESERCIZIO_EMPTY }] }))
  }

  function removeEsercizio(idx) {
    setForm(f => ({ ...f, esercizi: f.esercizi.filter((_, i) => i !== idx) }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nome) return
    setSaving(true)
    await insertMut.mutateAsync({
      nome: form.nome,
      categoria: form.categoria,
      descrizione: form.descrizione || null,
      esercizi: form.esercizi.filter(es => es.nome),
      societa_id: societaId,
    })
    setSaving(false)
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader
        title="Schede Atletiche"
        actions={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm">
            <Plus size={14} /> Nuova
          </button>
        }
      />

      <div className="p-4 space-y-3">
        {isLoading ? <LoadingSpinner /> : schede.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">Nessuna scheda. Creane una con il bottone +</p>
        ) : (
          schede.map(scheda => {
            const tags = [
              ...new Set((scheda.assegnazioni ?? []).map(a => a.squadra).filter(Boolean))
            ]
            const isOpen = expanded === scheda.id
            return (
              <div key={scheda.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4"
                  onClick={() => setExpanded(isOpen ? null : scheda.id)}
                >
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">{scheda.nome}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {CAT_LABEL[scheda.categoria]} · {scheda.esercizi?.length ?? 0} esercizi
                    </div>
                    {tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {tags.map(t => (
                          <span key={t} className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); deleteMut.mutate(scheda.id) }}
                      className="text-gray-300 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                    {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-50">
                    {scheda.descrizione && (
                      <p className="text-sm text-gray-500 mt-3 mb-2">{scheda.descrizione}</p>
                    )}
                    <div className="space-y-2 mt-2">
                      {(scheda.esercizi ?? []).map((es, i) => (
                        <div key={i} className="bg-amber-50 rounded-lg px-3 py-2">
                          <div className="font-medium text-sm text-gray-800">{es.nome}</div>
                          <div className="text-xs text-gray-500">
                            {es.serie && `${es.serie} serie`}
                            {es.reps && ` × ${es.reps} reps`}
                            {es.note && ` — ${es.note}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modal nuova scheda */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuova scheda atletica</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nome scheda *</label>
                <input className={inp} value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required
                  placeholder="es. Riscaldamento Dinamico Base" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Categoria</label>
                <select className={inp} value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIE.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Descrizione</label>
                <textarea className={inp} rows={2} value={form.descrizione}
                  onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">Esercizi</label>
                  <button type="button" onClick={addEsercizio}
                    className="text-xs text-amber-600 font-semibold">+ Aggiungi</button>
                </div>
                <div className="space-y-2">
                  {form.esercizi.map((es, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 relative">
                      <button type="button" onClick={() => removeEsercizio(idx)}
                        className="absolute top-2 right-2 text-gray-300 hover:text-red-400">
                        <X size={12} />
                      </button>
                      <input className={`${inp} mb-2`} placeholder="Nome esercizio *"
                        value={es.nome} onChange={e => setEsercizio(idx, 'nome', e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inp} placeholder="Serie (es. 3)" type="number"
                          value={es.serie} onChange={e => setEsercizio(idx, 'serie', e.target.value)} />
                        <input className={inp} placeholder="Reps (es. 10)"
                          value={es.reps} onChange={e => setEsercizio(idx, 'reps', e.target.value)} />
                      </div>
                      <input className={`${inp} mt-2`} placeholder="Note"
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

- [ ] **Step 7.2: Verifica manuale**

Vai su `/prep/schede`. Crea una scheda con 3 esercizi. Deve apparire come card collassabile. Cliccandola si espandono gli esercizi. Il tasto cestino elimina la scheda.

- [ ] **Step 7.3: Commit**

```bash
git add frontend/src/pages/prep/SchedeAtletichePage.jsx
git commit -m "feat: SchedeAtletichePage — libreria schede con editor esercizi"
```

---

## Task 8: SpaziPage

**Files:**
- Create: `frontend/src/pages/prep/SpaziPage.jsx`

- [ ] **Step 8.1: Crea `frontend/src/pages/prep/SpaziPage.jsx`**

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, X, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { GIORNI, GIORNO_FULL } from '../../lib/constants'

const FORM_FISSO_EMPTY = { giorno: 'lunedi', squadra: '', ora_inizio: '17:00', ora_fine: '18:00' }
const FORM_VAR_EMPTY = { data: format(new Date(), 'yyyy-MM-dd'), squadra: '', ora_inizio: '17:00', ora_fine: '18:00', annullato: false, note: '' }

// Ritorna true se due slot si sovrappongono (stesso spazio, stesso giorno/data)
function overlap(a, b) {
  return a.ora_inizio < b.ora_fine && a.ora_fine > b.ora_inizio
}

export default function SpaziPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [spazioId, setSpazioId] = useState(null)
  const [showNuovoSpazio, setShowNuovoSpazio] = useState(false)
  const [showSlotFisso, setShowSlotFisso] = useState(false)
  const [showVariazione, setShowVariazione] = useState(false)
  const [nomeSpazio, setNomeSpazio] = useState('')
  const [tipoSpazio, setTipoSpazio] = useState('sala_pesi')
  const [formFisso, setFormFisso] = useState(FORM_FISSO_EMPTY)
  const [formVar, setFormVar] = useState(FORM_VAR_EMPTY)
  const [saving, setSaving] = useState(false)

  const { data: spazi = [], isLoading: loadingSpazi } = useQuery({
    queryKey: ['spazi-atletici', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_atletici').select('*')
        .eq('societa_id', societaId).order('nome')
      if (data && data.length > 0 && !spazioId) setSpazioId(data[0].id)
      return data ?? []
    },
  })

  const spazioSel = spazi.find(s => s.id === spazioId)

  const { data: slotFissi = [] } = useQuery({
    queryKey: ['spazi-orario-fisso', societaId, spazioId],
    enabled: !!societaId && !!spazioId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_orario_fisso').select('*')
        .eq('societa_id', societaId).eq('spazio_id', spazioId)
        .order('giorno').order('ora_inizio')
      return data ?? []
    },
  })

  const { data: variazioni = [] } = useQuery({
    queryKey: ['spazi-orario-settimana', societaId, spazioId],
    enabled: !!societaId && !!spazioId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_orario_settimana').select('*')
        .eq('societa_id', societaId).eq('spazio_id', spazioId)
        .gte('data', format(new Date(), 'yyyy-MM-dd'))
        .order('data').order('ora_inizio')
      return data ?? []
    },
  })

  // Conflict detection: slot fissi nello stesso giorno che si sovrappongono
  function conflictiFissi() {
    const conflicts = []
    for (let i = 0; i < slotFissi.length; i++) {
      for (let j = i + 1; j < slotFissi.length; j++) {
        if (slotFissi[i].giorno === slotFissi[j].giorno && overlap(slotFissi[i], slotFissi[j])) {
          conflicts.push({ a: slotFissi[i], b: slotFissi[j] })
        }
      }
    }
    return conflicts
  }

  const addSpaziMut = useMutation({
    mutationFn: async ({ nome, tipo }) => {
      const { data, error } = await supabase
        .from('spazi_atletici').insert({ nome, tipo, societa_id: societaId }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['spazi-atletici', societaId] })
      setSpazioId(data.id)
      setShowNuovoSpazio(false)
      setNomeSpazio('')
    },
  })

  const addFissoMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('spazi_orario_fisso').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spazi-orario-fisso', societaId, spazioId] })
      setShowSlotFisso(false)
      setFormFisso(FORM_FISSO_EMPTY)
    },
  })

  const deleteFissoMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('spazi_orario_fisso').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spazi-orario-fisso', societaId, spazioId] }),
  })

  const addVarMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('spazi_orario_settimana').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spazi-orario-settimana', societaId, spazioId] })
      setShowVariazione(false)
      setFormVar(FORM_VAR_EMPTY)
    },
  })

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'
  const conflicts = conflictiFissi()

  return (
    <div>
      <PageHeader title="Spazi atletici" />

      <div className="p-4">
        {/* Tab selettore spazi */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {spazi.map(s => (
            <button key={s.id}
              onClick={() => setSpazioId(s.id)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                s.id === spazioId ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
              {s.nome}
            </button>
          ))}
          <button onClick={() => setShowNuovoSpazio(true)}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            + Spazio
          </button>
        </div>

        {loadingSpazi ? <LoadingSpinner /> : !spazioSel ? (
          <p className="text-center text-gray-400 text-sm py-8">Aggiungi il primo spazio atletico</p>
        ) : (
          <>
            {/* Conflitti */}
            {conflicts.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertCircle size={14} className="text-red-600" />
                  <span className="text-xs font-bold text-red-800">Conflitti rilevati</span>
                </div>
                {conflicts.map((c, i) => (
                  <div key={i} className="text-xs text-red-600">
                    {GIORNO_FULL[c.a.giorno]}: {c.a.squadra} ({c.a.ora_inizio.slice(0,5)}–{c.a.ora_fine.slice(0,5)}) ↔ {c.b.squadra} ({c.b.ora_inizio.slice(0,5)}–{c.b.ora_fine.slice(0,5)})
                  </div>
                ))}
              </div>
            )}

            {/* Orario fisso */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Orario fisso</span>
                <button onClick={() => setShowSlotFisso(true)}
                  className="text-xs text-amber-600 font-semibold">+ Slot fisso</button>
              </div>
              {slotFissi.length === 0 ? (
                <p className="text-xs text-gray-400">Nessuno slot fisso</p>
              ) : (
                <div className="space-y-1">
                  {slotFissi.map(s => (
                    <div key={s.id} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">{GIORNO_FULL[s.giorno]}</span>
                        {' '}{s.ora_inizio.slice(0,5)}–{s.ora_fine.slice(0,5)}
                        {' '}<span className="text-amber-700 font-semibold">{s.squadra}</span>
                      </div>
                      <button onClick={() => deleteFissoMut.mutate(s.id)}
                        className="text-gray-300 hover:text-red-400 p-1"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Variazioni */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Variazioni imminenti</span>
                <button onClick={() => setShowVariazione(true)}
                  className="text-xs text-amber-600 font-semibold">+ Variazione</button>
              </div>
              {variazioni.length === 0 ? (
                <p className="text-xs text-gray-400">Nessuna variazione</p>
              ) : (
                <div className="space-y-1">
                  {variazioni.map(v => (
                    <div key={v.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${v.annullato ? 'bg-red-50 line-through text-gray-400' : 'bg-blue-50'}`}>
                      <div className="text-sm">
                        <span className="font-medium">{format(new Date(v.data + 'T00:00:00'), 'dd/MM')}</span>
                        {' '}{v.ora_inizio.slice(0,5)}–{v.ora_fine.slice(0,5)}
                        {' '}<span className="text-blue-700 font-semibold">{v.squadra}</span>
                        {v.note && <span className="text-xs text-gray-400 ml-1">— {v.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal nuovo spazio */}
      {showNuovoSpazio && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuovo spazio</h2>
              <button onClick={() => setShowNuovoSpazio(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input className={inp} placeholder="Nome spazio (es. Sala Pesi)" value={nomeSpazio}
                onChange={e => setNomeSpazio(e.target.value)} />
              <select className={inp} value={tipoSpazio} onChange={e => setTipoSpazio(e.target.value)}>
                <option value="sala_pesi">Sala Pesi</option>
                <option value="palestra">Palestra</option>
                <option value="altro">Altro</option>
              </select>
              <button onClick={() => nomeSpazio && addSpaziMut.mutate({ nome: nomeSpazio, tipo: tipoSpazio })}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm">
                Aggiungi spazio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal slot fisso */}
      {showSlotFisso && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuovo slot fisso — {spazioSel?.nome}</h2>
              <button onClick={() => setShowSlotFisso(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <select className={inp} value={formFisso.giorno}
                onChange={e => setFormFisso(f => ({ ...f, giorno: e.target.value }))}>
                {GIORNI.map(g => <option key={g} value={g}>{GIORNO_FULL[g]}</option>)}
              </select>
              <input className={inp} placeholder="Squadra" value={formFisso.squadra}
                onChange={e => setFormFisso(f => ({ ...f, squadra: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input type="time" className={inp} value={formFisso.ora_inizio}
                  onChange={e => setFormFisso(f => ({ ...f, ora_inizio: e.target.value }))} />
                <input type="time" className={inp} value={formFisso.ora_fine}
                  onChange={e => setFormFisso(f => ({ ...f, ora_fine: e.target.value }))} />
              </div>
              <button
                onClick={() => formFisso.squadra && addFissoMut.mutate({ ...formFisso, spazio_id: spazioId, societa_id: societaId })}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm">
                Aggiungi slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal variazione */}
      {showVariazione && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Variazione — {spazioSel?.nome}</h2>
              <button onClick={() => setShowVariazione(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input type="date" className={inp} value={formVar.data}
                onChange={e => setFormVar(f => ({ ...f, data: e.target.value }))} />
              <input className={inp} placeholder="Squadra" value={formVar.squadra}
                onChange={e => setFormVar(f => ({ ...f, squadra: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input type="time" className={inp} value={formVar.ora_inizio}
                  onChange={e => setFormVar(f => ({ ...f, ora_inizio: e.target.value }))} />
                <input type="time" className={inp} value={formVar.ora_fine}
                  onChange={e => setFormVar(f => ({ ...f, ora_fine: e.target.value }))} />
              </div>
              <input className={inp} placeholder="Note (opzionale)" value={formVar.note}
                onChange={e => setFormVar(f => ({ ...f, note: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={formVar.annullato}
                  onChange={e => setFormVar(f => ({ ...f, annullato: e.target.checked }))} />
                Slot annullato
              </label>
              <button
                onClick={() => formVar.squadra && addVarMut.mutate({ ...formVar, spazio_id: spazioId, societa_id: societaId })}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm">
                Salva variazione
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8.2: Verifica manuale**

Vai su `/prep/spazi`. Clicca "+ Spazio" e crea "Sala Pesi". Aggiungi due slot fissi lo stesso giorno con orari sovrapposti: deve apparire la sezione rossa "Conflitti rilevati". Aggiungi una variazione: deve comparire nella sezione blu.

- [ ] **Step 8.3: Commit**

```bash
git add frontend/src/pages/prep/SpaziPage.jsx
git commit -m "feat: SpaziPage — gestione spazi atletici con conflict detection"
```

---

## Task 9: CarichiPage

**Files:**
- Create: `frontend/src/pages/prep/CarichiPage.jsx`

- [ ] **Step 9.1: Crea `frontend/src/pages/prep/CarichiPage.jsx`**

```jsx
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

function rpeStyle(v) {
  if (v == null) return 'text-gray-300'
  if (v <= 5) return 'text-green-600 font-bold'
  if (v <= 7) return 'text-yellow-500 font-bold'
  return 'text-red-600 font-bold'
}

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function CarichiPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [squadraFiltro, setSquadraFiltro] = useState('')
  const [weekRef, setWeekRef] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [formRpe, setFormRpe] = useState({ giocatore_id: '', data: format(new Date(), 'yyyy-MM-dd'), valore_rpe: '7' })
  const [saving, setSaving] = useState(false)

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'))

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-list', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome, squadra')
        .eq('societa_id', societaId).order('cognome')
      return data ?? []
    },
  })

  const { data: rpeRows = [], isLoading } = useQuery({
    queryKey: ['rpe-settimana', societaId, weekStartStr, weekEndStr],
    enabled: !!societaId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('rpe_sessioni')
        .select('giocatore_id, data, valore_rpe, giocatore:giocatore_id(id, nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .gte('data', weekStartStr)
        .lte('data', weekEndStr)
      return data ?? []
    },
  })

  const squadre = useMemo(() => [...new Set(giocatori.map(g => g.squadra))].sort(), [giocatori])
  const giocatoriFiltrati = useMemo(() =>
    squadraFiltro ? giocatori.filter(g => g.squadra === squadraFiltro) : giocatori,
    [giocatori, squadraFiltro]
  )

  // Mappa giocatore_id → {data → valore_rpe}
  const rpeMap = useMemo(() => {
    const map = {}
    for (const r of rpeRows) {
      if (!map[r.giocatore_id]) map[r.giocatore_id] = {}
      map[r.giocatore_id][r.data] = r.valore_rpe
    }
    return map
  }, [rpeRows])

  function mediaGiocatore(gid) {
    const vals = Object.values(rpeMap[gid] ?? {})
    if (!vals.length) return null
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }

  function mediaSquadra() {
    const vals = giocatoriFiltrati.flatMap(g => Object.values(rpeMap[g.id] ?? {}))
    if (!vals.length) return null
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }

  const insertMut = useMutation({
    mutationFn: async ({ giocatore_id, data, valore_rpe }) => {
      const { error } = await supabase.from('rpe_sessioni').upsert({
        giocatore_id,
        data,
        valore_rpe: parseInt(valore_rpe),
        tipo_sessione: 'allenamento',
        societa_id: societaId,
      }, { onConflict: 'giocatore_id,data,tipo_sessione' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rpe-settimana', societaId] })
      setShowModal(false)
      setFormRpe({ giocatore_id: '', data: format(new Date(), 'yyyy-MM-dd'), valore_rpe: '7' })
    },
  })

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader
        title="Carichi RPE"
        actions={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm">
            <Plus size={14} /> RPE
          </button>
        }
      />

      <div className="p-4">
        {/* Filtro squadra */}
        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
          value={squadraFiltro} onChange={e => setSquadraFiltro(e.target.value)}>
          <option value="">Tutte le squadre</option>
          {squadre.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-amber-50">
                  <th className="text-left p-2 text-amber-900 font-semibold text-xs min-w-[80px]">Giocatore</th>
                  {weekDays.map((d, i) => (
                    <th key={d} className="p-1.5 text-amber-900 font-semibold text-[10px] text-center">
                      {GIORNI_BREVI[i]}<br />{format(new Date(d + 'T00:00:00'), 'd')}
                    </th>
                  ))}
                  <th className="p-2 text-amber-900 font-semibold text-xs text-center">Med.</th>
                </tr>
              </thead>
              <tbody>
                {giocatoriFiltrati.map(g => (
                  <tr key={g.id} className="border-b border-amber-50 hover:bg-amber-50/30">
                    <td className="p-2 text-xs font-medium text-gray-700 truncate max-w-[80px]">
                      {g.cognome} {g.nome?.charAt(0)}.
                    </td>
                    {weekDays.map(d => {
                      const val = rpeMap[g.id]?.[d]
                      return (
                        <td key={d} className={`p-1.5 text-center text-xs ${rpeStyle(val)}`}>
                          {val ?? '—'}
                        </td>
                      )
                    })}
                    <td className={`p-2 text-center text-xs ${rpeStyle(mediaGiocatore(g.id) ? parseFloat(mediaGiocatore(g.id)) : null)}`}>
                      {mediaGiocatore(g.id) ?? '—'}
                    </td>
                  </tr>
                ))}
                {/* Riga media squadra */}
                {giocatoriFiltrati.length > 0 && (
                  <tr className="bg-amber-50 border-t border-amber-200">
                    <td className="p-2 text-xs font-bold text-amber-900">Media</td>
                    {weekDays.map(d => {
                      const vals = giocatoriFiltrati
                        .map(g => rpeMap[g.id]?.[d]).filter(v => v != null)
                      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null
                      return (
                        <td key={d} className={`p-1.5 text-center text-xs ${rpeStyle(avg ? parseFloat(avg) : null)}`}>
                          {avg ?? '—'}
                        </td>
                      )
                    })}
                    <td className={`p-2 text-center text-xs font-bold ${rpeStyle(mediaSquadra() ? parseFloat(mediaSquadra()) : null)}`}>
                      {mediaSquadra() ?? '—'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="mt-2 text-[10px] text-gray-400">🟢 ≤5 · 🟡 6–7 · 🔴 ≥8</div>
          </div>
        )}
      </div>

      {/* Modal inserimento RPE manuale */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Inserisci RPE</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <select className={inp} value={formRpe.giocatore_id}
                onChange={e => setFormRpe(f => ({ ...f, giocatore_id: e.target.value }))}>
                <option value="">Seleziona giocatore</option>
                {giocatoriFiltrati.map(g => (
                  <option key={g.id} value={g.id}>{g.cognome} {g.nome} — {g.squadra}</option>
                ))}
              </select>
              <input type="date" className={inp} value={formRpe.data}
                onChange={e => setFormRpe(f => ({ ...f, data: e.target.value }))} />
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  RPE: <span className={`font-bold ${rpeStyle(parseInt(formRpe.valore_rpe))}`}>{formRpe.valore_rpe}</span>
                </label>
                <input type="range" min="1" max="10" className="w-full" value={formRpe.valore_rpe}
                  onChange={e => setFormRpe(f => ({ ...f, valore_rpe: e.target.value }))} />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Facilissimo</span><span>Massimo</span>
                </div>
              </div>
              <button
                onClick={() => !saving && formRpe.giocatore_id && (setSaving(true), insertMut.mutateAsync(formRpe).finally(() => setSaving(false)))}
                disabled={saving || !formRpe.giocatore_id}
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

- [ ] **Step 9.2: Verifica manuale**

Vai su `/prep/carichi`. Le frecce ← → devono navigare tra le settimane. Clicca "+ RPE", inserisci un valore per un giocatore. Il valore deve apparire nella cella corrispondente con il colore giusto (verde/giallo/rosso). La riga "Media" deve calcolare la media della squadra.

- [ ] **Step 9.3: Commit**

```bash
git add frontend/src/pages/prep/CarichiPage.jsx
git commit -m "feat: CarichiPage — griglia RPE settimanale con navigazione e inserimento manuale"
```

---

## Task 10: AtleticaCoach — tab sola lettura

**Files:**
- Create: `frontend/src/pages/coach/AtleticaCoach.jsx`

- [ ] **Step 10.1: Crea `frontend/src/pages/coach/AtleticaCoach.jsx`**

```jsx
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, startOfWeek, endOfWeek, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const GRAVITA_COLORS = {
  lieve: 'bg-amber-100 text-amber-800',
  moderato: 'bg-orange-100 text-orange-800',
  grave: 'bg-red-100 text-red-800',
}

function rpeStyle(v) {
  if (v == null) return 'text-gray-300'
  if (v <= 5) return 'text-green-600 font-bold'
  if (v <= 7) return 'text-yellow-500 font-bold'
  return 'text-red-600 font-bold'
}

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function AtleticaCoach() {
  const { societaId, squadreAllenatore } = useAuth()
  const [tab, setTab] = useState('infortuni')
  const [weekRef, setWeekRef] = useState(new Date())

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'))

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-coach', societaId, squadreAllenatore?.join(',')],
    enabled: !!societaId && !!squadreAllenatore?.length,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome, squadra')
        .eq('societa_id', societaId)
        .in('squadra', squadreAllenatore ?? [])
        .order('cognome')
      return data ?? []
    },
  })

  const gids = giocatori.map(g => g.id)

  const { data: infortuni = [], isLoading: loadInf } = useQuery({
    queryKey: ['coach-infortuni', societaId, gids.join(',')],
    enabled: !!societaId && gids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('infortuni')
        .select('*, giocatore:giocatore_id(nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .eq('stato', 'attivo')
        .in('giocatore_id', gids)
        .order('data_inizio', { ascending: false })
      return data ?? []
    },
  })

  const { data: testDef = [] } = useQuery({
    queryKey: ['test-definizioni', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('test_definizioni').select('*')
        .eq('societa_id', societaId).order('ordine')
      return data ?? []
    },
  })

  const [testFiltro, setTestFiltro] = useState('')

  const { data: risultati = [], isLoading: loadRis } = useQuery({
    queryKey: ['coach-test-risultati', societaId, testFiltro, gids.join(',')],
    enabled: !!societaId && !!testFiltro && gids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('test_risultati')
        .select('valore, data, giocatore:giocatore_id(id, nome, cognome, squadra)')
        .eq('societa_id', societaId).eq('test_id', testFiltro)
        .in('giocatore_id', gids).order('data')
      return data ?? []
    },
  })

  const colDate = useMemo(() => [...new Set(risultati.map(r => r.data))].sort().slice(-4), [risultati])
  const pivot = useMemo(() => {
    const map = {}
    for (const r of risultati) {
      const gid = r.giocatore?.id
      if (!gid) continue
      if (!map[gid]) map[gid] = { giocatore: r.giocatore, valori: {} }
      map[gid].valori[r.data] = r.valore
    }
    return Object.values(map)
  }, [risultati])

  const { data: rpeRows = [], isLoading: loadRpe } = useQuery({
    queryKey: ['coach-rpe', societaId, weekStartStr, weekEndStr, gids.join(',')],
    enabled: !!societaId && gids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
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

  const { data: prossimiSlot = [] } = useQuery({
    queryKey: ['coach-spazi', societaId, squadreAllenatore?.join(',')],
    enabled: !!societaId && !!squadreAllenatore?.length,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_orario_fisso').select('*, spazio:spazio_id(nome)')
        .eq('societa_id', societaId)
        .in('squadra', squadreAllenatore ?? [])
        .order('ora_inizio')
      return (data ?? []).slice(0, 5)
    },
  })

  const GIORNI_FULL = { lunedi: 'Lunedì', martedi: 'Martedì', mercoledi: 'Mercoledì', giovedi: 'Giovedì', venerdi: 'Venerdì', sabato: 'Sabato', domenica: 'Domenica' }

  const tabCls = (t) => `px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
    tab === t ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'
  }`

  return (
    <div>
      <PageHeader title="Atletica" subtitle="Sola lettura" />

      <div className="p-4">
        {/* Tab bar */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {['infortuni', 'test', 'carichi', 'spazi'].map(t => (
            <button key={t} className={tabCls(t)} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Infortuni */}
        {tab === 'infortuni' && (
          loadInf ? <LoadingSpinner /> : (
            <div className="space-y-3">
              {infortuni.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Nessun infortunio attivo</p>}
              {infortuni.map(inf => (
                <div key={inf.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="font-semibold text-gray-900">
                    {inf.giocatore?.cognome} {inf.giocatore?.nome} — {inf.giocatore?.squadra}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {inf.tipo} ·{' '}
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${GRAVITA_COLORS[inf.gravita]}`}>
                      {inf.gravita}
                    </span>
                  </div>
                  {inf.data_rientro_prevista && (
                    <div className="text-xs text-gray-400 mt-1">
                      Rientro previsto: {format(parseISO(inf.data_rientro_prevista), 'dd/MM/yyyy')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* Tab Test */}
        {tab === 'test' && (
          <div>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
              value={testFiltro} onChange={e => setTestFiltro(e.target.value)}>
              <option value="">Seleziona tipo di test</option>
              {testDef.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            {!testFiltro ? (
              <p className="text-center text-gray-400 text-sm py-6">Seleziona un test</p>
            ) : loadRis ? <LoadingSpinner /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-amber-50">
                      <th className="text-left p-2 text-xs text-amber-900 font-semibold">Giocatore</th>
                      {colDate.map(d => <th key={d} className="p-2 text-xs text-amber-900 font-semibold">{format(new Date(d + 'T00:00:00'), 'd/MM')}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {pivot.map(row => (
                      <tr key={row.giocatore?.id} className="border-b border-gray-100">
                        <td className="p-2 font-medium text-gray-800 text-sm">{row.giocatore?.cognome} {row.giocatore?.nome?.charAt(0)}.</td>
                        {colDate.map(d => <td key={d} className="p-2 text-center text-gray-600 text-sm">{row.valori[d] ?? '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab Carichi */}
        {tab === 'carichi' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setWeekRef(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d })}
                className="p-1.5 rounded-lg bg-gray-100"><ChevronLeft size={16} /></button>
              <span className="text-sm font-semibold text-gray-700">
                {format(weekStart, 'd MMM', { locale: it })} – {format(weekEnd, 'd MMM', { locale: it })}
              </span>
              <button onClick={() => setWeekRef(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d })}
                className="p-1.5 rounded-lg bg-gray-100"><ChevronRight size={16} /></button>
            </div>
            {loadRpe ? <LoadingSpinner /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-amber-50">
                      <th className="text-left p-2 text-xs text-amber-900 font-semibold">Giocatore</th>
                      {weekDays.map((d, i) => (
                        <th key={d} className="p-1.5 text-center text-[10px] text-amber-900 font-semibold">
                          {GIORNI_BREVI[i]}<br />{format(new Date(d + 'T00:00:00'), 'd')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {giocatori.map(g => (
                      <tr key={g.id} className="border-b border-gray-100">
                        <td className="p-2 text-xs font-medium text-gray-700">{g.cognome} {g.nome?.charAt(0)}.</td>
                        {weekDays.map(d => (
                          <td key={d} className={`p-1.5 text-center text-xs ${rpeStyle(rpeMap[g.id]?.[d])}`}>
                            {rpeMap[g.id]?.[d] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab Spazi */}
        {tab === 'spazi' && (
          <div className="space-y-2">
            {prossimiSlot.length === 0
              ? <p className="text-center text-gray-400 text-sm py-8">Nessuno slot configurato</p>
              : prossimiSlot.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">{GIORNI_FULL[s.giorno]}</span>
                      {' '}{s.ora_inizio?.slice(0,5)}–{s.ora_fine?.slice(0,5)}
                    </div>
                    <span className="text-xs text-gray-500">{s.spazio?.nome}</span>
                  </div>
                ))
            }
          </div>
        )}

        {/* Badge sola lettura */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
          <Lock size={12} />
          Sola lettura — modifiche solo dal preparatore atletico
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 10.2: Verifica manuale**

Accedi come allenatore. Clicca "Atletica" in fondo. Verifica che le 4 sotto-tab siano visibili (Infortuni, Test, Carichi, Spazi) e che non ci siano bottoni di azione. Il badge "Sola lettura" deve essere in fondo.

- [ ] **Step 10.3: Commit**

```bash
git add frontend/src/pages/coach/AtleticaCoach.jsx
git commit -m "feat: AtleticaCoach — tab atletica sola lettura con 4 sotto-sezioni"
```

---

## Task 11: Box RPE in HomeGiocatore

**Files:**
- Modify: `frontend/src/pages/player/HomeGiocatore.jsx`

- [ ] **Step 11.1: Aggiungi le query necessarie a `HomeGiocatore.jsx`**

Dopo gli import esistenti, aggiungi `useMutation` e `useQueryClient`:

```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```

(L'import `useQuery` è già presente — aggiorna la riga esistente aggiungendo `useMutation, useQueryClient`.)

- [ ] **Step 11.2: Aggiungi lo state e le query RPE**

Subito dopo le righe con `todayStr` / `thisWeekStr` / `weekEndStr`, aggiungi:

```js
  const qc = useQueryClient()
  const [rpeSelezionato, setRpeSelezionato] = useState(null)
  const [rpeSalvato, setRpeSalvato] = useState(false)

  // Cerca il record giocatori dell'utente loggato (per ottenere giocatori.id)
  const { data: mioGiocatore } = useQuery({
    queryKey: ['mio-giocatore', societaId, profile?.id],
    enabled: !!societaId && !!profile?.id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, squadra')
        .eq('societa_id', societaId)
        .eq('user_id', profile.id)
        .maybeSingle()
      return data
    },
  })

  // Controlla se ha già inserito RPE oggi
  const { data: rpeOggi } = useQuery({
    queryKey: ['rpe-oggi', mioGiocatore?.id, todayStr],
    enabled: !!mioGiocatore?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('rpe_sessioni').select('id, valore_rpe')
        .eq('giocatore_id', mioGiocatore.id)
        .eq('data', todayStr)
        .eq('tipo_sessione', 'allenamento')
        .maybeSingle()
      return data
    },
  })

  const rpeInsertMut = useMutation({
    mutationFn: async (valore) => {
      const { error } = await supabase.from('rpe_sessioni').insert({
        giocatore_id: mioGiocatore.id,
        data: todayStr,
        tipo_sessione: 'allenamento',
        valore_rpe: valore,
        societa_id: societaId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rpe-oggi', mioGiocatore?.id] })
      setRpeSalvato(true)
    },
  })
```

- [ ] **Step 11.3: Aggiungi il calcolo "allenamento oggi"**

Subito prima del `return (`, aggiungi:

```js
  // Cerca se il giocatore aveva un allenamento oggi (usa weekData già caricato)
  const allenamentiOggi = useMemo(() => {
    if (!weekData?.events) return []
    return (weekData.events ?? []).filter(e =>
      e.tipo === 'allenamento' &&
      e.data === todayStr &&
      mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
  }, [weekData, todayStr, mySquadre.join(',')])

  const showRpeBox = mioGiocatore && allenamentiOggi.length > 0 && !rpeOggi && !rpeSalvato
```

- [ ] **Step 11.4: Aggiungi il box RPE nel JSX**

Nel `return (...)` di `HomeGiocatore`, dopo il primo `<div>` di apertura del body della pagina (tipicamente dopo `<AppHeader />` o la prima sezione), aggiungi il box RPE:

```jsx
        {/* Box RPE — visibile solo il giorno di un allenamento */}
        {showRpeBox && (
          <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="font-bold text-amber-900 text-sm mb-0.5">Come ti sei sentito oggi?</div>
            <div className="text-xs text-gray-500 mb-3">
              Allenamento {allenamentiOggi[0]?.squadra} · {format(today, 'EEEE d MMMM', { locale: it })}
            </div>
            <div className="flex justify-center gap-1.5 mb-3 flex-wrap">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                const isSelected = rpeSelezionato === n
                const color = n <= 3
                  ? isSelected ? 'bg-green-500 border-green-600 text-white' : 'bg-green-100 border-green-300 text-green-700'
                  : n <= 7
                  ? isSelected ? 'bg-yellow-400 border-yellow-500 text-white' : 'bg-yellow-100 border-yellow-300 text-yellow-700'
                  : isSelected ? 'bg-red-500 border-red-600 text-white' : 'bg-red-100 border-red-300 text-red-700'
                return (
                  <button key={n}
                    onClick={() => setRpeSelezionato(n)}
                    className={`w-8 h-8 rounded-full border-2 text-xs font-bold transition-all ${color} ${isSelected ? 'scale-110 shadow-md' : ''}`}>
                    {n}
                  </button>
                )
              })}
            </div>
            {rpeSelezionato && (
              <button
                onClick={() => rpeInsertMut.mutate(rpeSelezionato)}
                disabled={rpeInsertMut.isPending}
                className="w-full py-2.5 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {rpeInsertMut.isPending ? 'Salvataggio...' : `Salva RPE — ${rpeSelezionato}`}
              </button>
            )}
          </div>
        )}

        {/* Conferma RPE salvato */}
        {rpeSalvato && (
          <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <div className="text-green-700 font-semibold text-sm">RPE registrato ✓</div>
            <div className="text-xs text-green-500 mt-0.5">Grazie! I dati sono stati inviati al preparatore.</div>
          </div>
        )}
```

- [ ] **Step 11.5: Aggiungi `useState` e `useMemo` all'import se non già presenti**

La riga di import React/hooks deve includere `useState`, `useMemo`. Verifica che siano nell'import esistente:

```js
import { useState, useMemo } from 'react'
```

- [ ] **Step 11.6: Verifica manuale**

Accedi come giocatore che ha un allenamento oggi in calendario. Il box RPE ambra deve comparire nella Home. Seleziona un numero e clicca "Salva RPE". Il box deve sparire e comparire il messaggio verde "RPE registrato ✓". Su Supabase, verifica che il record sia in `rpe_sessioni`.

Se il giocatore non ha allenamenti oggi, il box non deve apparire.

- [ ] **Step 11.7: Commit**

```bash
git add frontend/src/pages/player/HomeGiocatore.jsx
git commit -m "feat: HomeGiocatore — box RPE condizionale post-allenamento"
```

---

## Riepilogo commit

| Task | Commit message |
|------|----------------|
| 1 | `feat: migration SQL preparazione atletica — 13 nuove tabelle + RLS` |
| 2 | `feat: aggiunge ruolo preparatore_atletico — routing, layout, nav` |
| 3 | `feat: HomePrep — dashboard 4 card panoramica preparatore` |
| 4 | `feat: InfortuniPage — CRUD infortuni con tab attivi/risolti` |
| 5 | `feat: TestFisiciPage — tabella pivot risultati con trend e gestione tipi` |
| 6 | `feat: AntropometriaPage — tabella misure con ultima rilevazione per giocatore` |
| 7 | `feat: SchedeAtletichePage — libreria schede con editor esercizi` |
| 8 | `feat: SpaziPage — gestione spazi atletici con conflict detection` |
| 9 | `feat: CarichiPage — griglia RPE settimanale con navigazione e inserimento manuale` |
| 10 | `feat: AtleticaCoach — tab atletica sola lettura con 4 sotto-sezioni` |
| 11 | `feat: HomeGiocatore — box RPE condizionale post-allenamento` |

## Note architetturali

- **giocatori(id) non profiles(id)**: Le tabelle atletiche (test, antropometria, infortuni, rpe) referenziano `giocatori(id)` per includere i giocatori senza account app. Il giocatore loggato recupera il proprio `giocatori.id` via `WHERE user_id = auth.uid()`.
- **Auto-seed test**: Al primo caricamento di TestFisiciPage, se `test_definizioni` è vuoto per la società, vengono inseriti 4 test default (Sprint 20m, Salto verticale, Shuttle run, Yo-Yo).
- **Conflict detection spazi**: Implementata lato client confrontando gli slot fissi dello stesso spazio/giorno. Sufficiente per il volume previsto (decine di slot, non migliaia).
- **PrepLayout 7 voci**: Usa `min-w-[28px]`, icone 18px, testo 9px per stare in 375px. Se risulta troppo compresso su dispositivi molto piccoli, valutare di nascondere le label o usare uno scroll orizzontale nella nav.

