# Modulo Preparazione Atletica — Design Spec

**Data:** 2026-05-19  
**Progetto:** EVO — Gestionale Basket  
**Stato:** Approvato, pronto per implementazione

---

## 1. Contesto e obiettivo

Aggiungere alla piattaforma EVO un modulo di preparazione atletica per il settore giovanile. Il modulo consente al preparatore atletico di gestire test fisici, infortuni, carichi di lavoro, dati antropometrici, schede di allenamento fisico e la disponibilità degli spazi (sala pesi, palestre). Gli allenatori consultano i dati dei propri giocatori in sola lettura. I giocatori inseriscono il proprio RPE dopo ogni allenamento.

---

## 2. Ruoli coinvolti

### 2.1 Nuovo ruolo: `preparatore_atletico`

- Aggiunto come valore valido in `profiles.ruolo` e `profiles.ruoli_extra` (compatibile col sistema multi-ruolo esistente).
- Vede **tutte le squadre** della società (non vincolato come l'allenatore a squadra1/2/3).
- Accesso completo in lettura e scrittura a tutte le sezioni del modulo.
- Ha un proprio layout dedicato: `PrepLayout.jsx` e routing `/prep/*`.

### 2.2 Allenatore (già esistente)

- Nuova tab **"Atletica"** nella propria area `/coach/atletica`.
- Sola lettura — vede solo i dati delle proprie squadre.
- 4 sotto-tab: Infortuni · Test · Carichi · Spazi.
- Nessuna possibilità di modifica.

### 2.3 Giocatore (già esistente)

- Box **"Come ti sei sentito oggi?"** in `HomeGiocatore`, visibile solo nei giorni in cui ha avuto un allenamento.
- Seleziona un valore 1–10 (colori semaforo: verde ≤5, giallo 6–7, rosso ≥8) e salva.
- Non vede nessun altro dato del modulo (test, infortuni, antropometria, schede).

### 2.4 Admin (già esistente)

- Supervisione completa in sola lettura tramite le pagine esistenti.
- Assegna il ruolo `preparatore_atletico` dal pannello Utenti già presente in Setup.
- Nessuna nuova pagina admin necessaria.

---

## 3. Architettura frontend

### 3.1 Nuovo layout: `PrepLayout.jsx`

Struttura identica a `CoachLayout` e `AdminLayout` esistenti. Navigazione bottom tab (mobile-first) con le 7 sezioni:

```
/prep                → Home
/prep/test           → Test fisici
/prep/infortuni      → Infortuni
/prep/antropometria  → Antropometria
/prep/schede         → Schede atletiche
/prep/spazi          → Spazi (sala pesi + palestre)
/prep/carichi        → Carichi RPE
```

### 3.2 Route in `App.jsx`

```jsx
<Route path="/prep" element={<ProtectedRoute requiredRole="preparatore_atletico"><PrepLayout /></ProtectedRoute>}>
  <Route index                element={<HomePrep />} />
  <Route path="test"          element={<TestFisiciPage />} />
  <Route path="infortuni"     element={<InfortuniPage />} />
  <Route path="antropometria" element={<AntropometriaPage />} />
  <Route path="schede"        element={<SchedeAtletichePage />} />
  <Route path="spazi"         element={<SpaziPage />} />
  <Route path="carichi"       element={<CarichiPage />} />
</Route>

{/* Tab Atletica nel layout allenatore */}
<Route path="/coach/atletica" element={<ProtectedRoute requiredRole="allenatore"><AtleticaCoach /></ProtectedRoute>} />
```

### 3.3 Aggiunta in `RoleRedirect.jsx`

```js
case 'preparatore_atletico': return <Navigate to="/prep" replace />
```

### 3.4 Nuova tab in CoachLayout

Aggiungere voce "Atletica" alla navigazione bottom del coach con link a `/coach/atletica`.

---

## 4. Sezioni UI — Preparatore Atletico

### 4.1 Home (`/prep`)

Quattro card colorate di panoramica rapida:

| Card | Colore | Contenuto |
|------|--------|-----------|
| Infortuni attivi | Rosso `#fff1f2` / `#fda4af` | Lista nomi + data rientro prevista |
| Prossimi slot sala pesi | Blu `#eff6ff` / `#93c5fd` | Prossimi 2 appuntamenti |
| Carichi settimana | Verde `#f0fdf4` / `#86efac` | Media RPE per squadra + trend ↑→↓ |
| Prossimi test | Viola `#faf5ff` / `#c4b5fd` | Prossimi 2 test pianificati |

Header del layout: amber `#f59e0b` (brand del modulo).

### 4.2 Test fisici (`/prep/test`)

- Filtro per **squadra** e **tipo di test** (dropdown).
- Tabella giocatori × sessioni con valori e colonna **Trend** (▼ migliora / ▲ peggiora).
- Bottone "+ Inserisci risultati" apre modal con selezione data, giocatore/i, valore.
- I tipi di test sono configurabili (da `test_definizioni`): il preparatore può aggiungere/rinominare tipi di test tramite una sezione "Gestisci test" raggiungibile con icona ingranaggio in cima alla pagina. I test pre-caricati di default (Sprint 20m, Salto verticale, Shuttle run, Yo-Yo) vengono inseriti dalla migration SQL.

### 4.3 Infortuni (`/prep/infortuni`)

- Toggle **Attivi / Risolti**.
- Card per ogni infortunio: nome giocatore, squadra, tipo, gravità (tag colorato: Lieve=amber, Moderato=arancione, Grave=rosso), data inizio, rientro previsto.
- Bottone "+ Nuovo infortunio" apre modal con form completo.
- Azione "Segna come risolto" imposta `stato='risolto'` e `data_rientro_effettiva`.

### 4.4 Antropometria (`/prep/antropometria`)

- Filtro per squadra.
- Tabella: Giocatore · Altezza (cm) · Peso (kg) · Apertura braccia (cm) · Data rilevazione.
- Bottone "+ Nuova rilevazione": inserisce una nuova riga per uno o più giocatori.
- Storico: cliccando su un giocatore si vede il grafico di crescita nel tempo.

### 4.5 Schede atletiche (`/prep/schede`)

- Libreria di schede create dal preparatore: nome, categoria (Riscaldamento / Forza / Mobilità / Recupero / Altro), descrizione, lista esercizi (strutturata come array JSON: `[{nome, serie, reps, note}]`).
- Ogni scheda mostra i tag delle squadre/giocatori a cui è assegnata.
- Bottone "+ Nuova scheda" apre editor con form esercizi dinamico (aggiungi/rimuovi esercizi).
- Assegnazione: modal separato per associare scheda a squadra o singolo giocatore con date inizio/fine.

### 4.6 Spazi (`/prep/spazi`)

- Tab selector: **Sala Pesi** / **Palestra A** / ecc. (da `spazi_atletici`).
- Per ogni spazio: orario fisso settimanale (riusa il pattern `orario_fisso`) con lista slot per giorno.
- Bottone "+ Slot fisso" aggiunge un nuovo slot ricorrente.
- Bottone "+ Variazione" aggiunge/modifica uno slot per una specifica settimana (riusa `orario_settimana`).
- Rilevamento conflitti automatico tra slot della stessa fascia oraria nello stesso spazio.

### 4.7 Carichi RPE (`/prep/carichi`)

- Filtro per squadra + navigazione settimana (← settimana →).
- Tabella: Giocatore × Giorno con valori RPE colorati (verde ≤5, giallo 6–7, rosso ≥8), celle vuote (—) per sessioni senza dato.
- Riga "Media squadra" in fondo.
- Il preparatore può inserire manualmente l'RPE per un giocatore che non ha compilato.

---

## 5. Vista Allenatore — tab Atletica (`/coach/atletica`)

Tab aggiuntiva nell'area coach, **sola lettura**. 4 sotto-tab interne:

1. **Infortuni** — card degli infortuni attivi dei propri giocatori (identiche a quelle del preparatore ma senza azioni).
2. **Test** — tabella test fisici filtrata per le proprie squadre.
3. **Carichi** — tabella RPE settimanale della propria squadra.
4. **Spazi** — prossimi slot sala pesi della propria squadra.

Badge "🔒 Sola lettura" in fondo a ogni tab. Nessun bottone di azione visibile.

---

## 6. Vista Giocatore — Box RPE in HomeGiocatore

- **Visibilità condizionale:** il box appare solo se oggi (o ieri) il giocatore aveva un allenamento in calendario e non ha ancora inserito l'RPE per quella sessione.
- **UI:** card amber con titolo "Come ti sei sentito oggi?", sottotitolo con nome squadra e data allenamento, 10 cerchi numerati con colori semaforo (1–3 verde, 4–7 giallo, 8–10 rosso), conferma con bottone "Salva RPE".
- **Dopo il salvataggio:** il box scompare e viene sostituito da un messaggio "RPE registrato ✓".
- I dati vanno a `rpe_sessioni` e sono visibili solo al preparatore e all'allenatore (in sola lettura).

---

## 7. Schema database

Tutte le nuove tabelle hanno `societa_id` (multi-tenancy) e RLS identico alle tabelle esistenti.

### 7.1 Spazi atletici

```sql
CREATE TABLE spazi_atletici (
  id          SERIAL PRIMARY KEY,
  nome        TEXT        NOT NULL,
  tipo        TEXT        NOT NULL DEFAULT 'sala_pesi' CHECK (tipo IN ('palestra','sala_pesi','altro')),
  capienza    INTEGER,
  note        TEXT,
  societa_id  UUID        NOT NULL REFERENCES societa(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE spazi_orario_fisso (
  id          SERIAL PRIMARY KEY,
  spazio_id   INTEGER     NOT NULL REFERENCES spazi_atletici(id),
  giorno      TEXT        NOT NULL CHECK (giorno IN ('lunedi','martedi','mercoledi','giovedi','venerdi','sabato','domenica')),
  squadra     TEXT        NOT NULL,
  ora_inizio  TIME        NOT NULL,
  ora_fine    TIME        NOT NULL,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);

CREATE TABLE spazi_orario_settimana (
  id          SERIAL PRIMARY KEY,
  spazio_id   INTEGER     NOT NULL REFERENCES spazi_atletici(id),
  data        DATE        NOT NULL,
  squadra     TEXT        NOT NULL,
  ora_inizio  TIME        NOT NULL,
  ora_fine    TIME        NOT NULL,
  annullato   BOOLEAN     NOT NULL DEFAULT false,
  note        TEXT,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);
```

### 7.2 Dati fisici

```sql
CREATE TABLE test_definizioni (
  id          SERIAL PRIMARY KEY,
  nome        TEXT        NOT NULL,
  unita       TEXT        NOT NULL,  -- es. "secondi", "cm", "ripetizioni"
  ordine      INTEGER     NOT NULL DEFAULT 0,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);

CREATE TABLE test_risultati (
  id            SERIAL PRIMARY KEY,
  giocatore_id  UUID        NOT NULL REFERENCES profiles(id),
  test_id       INTEGER     NOT NULL REFERENCES test_definizioni(id),
  valore        NUMERIC     NOT NULL,
  data          DATE        NOT NULL,
  note          TEXT,
  societa_id    UUID        NOT NULL REFERENCES societa(id)
);

CREATE TABLE antropometria (
  id                  SERIAL PRIMARY KEY,
  giocatore_id        UUID        NOT NULL REFERENCES profiles(id),
  data                DATE        NOT NULL,
  altezza_cm          NUMERIC,
  peso_kg             NUMERIC,
  apertura_braccia_cm NUMERIC,
  note                TEXT,
  societa_id          UUID        NOT NULL REFERENCES societa(id)
);
```

### 7.3 Infortuni

```sql
CREATE TABLE infortuni (
  id                    SERIAL PRIMARY KEY,
  giocatore_id          UUID        NOT NULL REFERENCES profiles(id),
  tipo                  TEXT        NOT NULL,
  gravita               TEXT        NOT NULL CHECK (gravita IN ('lieve','moderato','grave')),
  data_inizio           DATE        NOT NULL,
  data_rientro_prevista DATE,
  data_rientro_effettiva DATE,
  stato                 TEXT        NOT NULL DEFAULT 'attivo' CHECK (stato IN ('attivo','risolto')),
  note                  TEXT,
  societa_id            UUID        NOT NULL REFERENCES societa(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 7.4 RPE / Carichi

```sql
CREATE TABLE rpe_sessioni (
  id              SERIAL PRIMARY KEY,
  giocatore_id    UUID        NOT NULL REFERENCES profiles(id),
  data            DATE        NOT NULL,
  tipo_sessione   TEXT        NOT NULL DEFAULT 'allenamento' CHECK (tipo_sessione IN ('allenamento','partita','pesi')),
  valore_rpe      INTEGER     NOT NULL CHECK (valore_rpe BETWEEN 1 AND 10),
  note            TEXT,
  societa_id      UUID        NOT NULL REFERENCES societa(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (giocatore_id, data, tipo_sessione)
);
```

### 7.5 Schede atletiche

```sql
CREATE TABLE schede_atletiche (
  id            SERIAL PRIMARY KEY,
  nome          TEXT        NOT NULL,
  categoria     TEXT        NOT NULL CHECK (categoria IN ('riscaldamento','forza','mobilita','recupero','altro')),
  descrizione   TEXT,
  esercizi      JSONB       NOT NULL DEFAULT '[]',  -- [{nome, serie, reps, note}]
  societa_id    UUID        NOT NULL REFERENCES societa(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE schede_assegnazioni (
  id          SERIAL PRIMARY KEY,
  scheda_id   INTEGER     NOT NULL REFERENCES schede_atletiche(id),
  squadra     TEXT,                                  -- NULL se assegnata a giocatore singolo
  giocatore_id UUID       REFERENCES profiles(id),   -- NULL se assegnata a squadra
  data_inizio DATE        NOT NULL,
  data_fine   DATE,
  societa_id  UUID        NOT NULL REFERENCES societa(id),
  CHECK (squadra IS NOT NULL OR giocatore_id IS NOT NULL)
);
```

---

## 8. File da creare / modificare

### Nuovi file frontend

```
frontend/src/layouts/PrepLayout.jsx
frontend/src/pages/prep/HomePrep.jsx
frontend/src/pages/prep/TestFisiciPage.jsx
frontend/src/pages/prep/InfortuniPage.jsx
frontend/src/pages/prep/AntropometriaPage.jsx
frontend/src/pages/prep/SchedeAtletichePage.jsx
frontend/src/pages/prep/SpaziPage.jsx
frontend/src/pages/prep/CarichiPage.jsx
frontend/src/pages/coach/AtleticaCoach.jsx
```

### File esistenti da modificare

```
frontend/src/App.jsx               ← aggiunge route /prep/* e /coach/atletica
frontend/src/components/RoleRedirect.jsx  ← aggiunge case preparatore_atletico
frontend/src/hooks/useAuth.jsx     ← aggiunge isPreparatore flag
frontend/src/layouts/CoachLayout.jsx     ← aggiunge tab Atletica nella nav
frontend/src/pages/player/HomeGiocatore.jsx  ← aggiunge box RPE condizionale
```

### Nuovo file SQL migration

```
supabase/migrations/supabase_migration_preparazione_atletica.sql
```

---

## 9. Decisioni di design

| Decisione | Scelta | Motivazione |
|-----------|--------|-------------|
| Ruolo preparatore | Nuovo ruolo dedicato (ibrido) | Vede tutte le squadre; gli allenatori vedono solo le proprie in sola lettura |
| Gestione spazi | Orario fisso + eccezioni settimanali | Riusa il pattern `orario_fisso + orario_settimana` già implementato |
| Visibilità dati | Solo staff | Dati sensibili (infortuni, antropometria) non esposti ai giocatori |
| RPE giocatore | Il giocatore inserisce solo il proprio RPE (1–10) | Riduce attrito, dati utili al preparatore senza mostrare info sensibili |
| Colori UI | Header amber (brand), card Home con 4 colori tematici | Coerenza col resto dell'app; distinzione visiva per tipo di dato |
| Schede atletiche | Contenuto esercizi in JSONB | Flessibile senza schema rigido, non richiede tabella esercizi separata |
| Wellness check | Escluso dallo scope | Complessità non giustificata per il settore giovanile in questa fase |
