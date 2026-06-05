# Preparazione Atletica V2 — Redesign Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ridisegnare il modulo Preparazione Atletica da "database personale del preparatore" a strumento gestionale reale per la società: turni di lavoro, stato squadre e schede assegnabili.

**Architecture:** Approccio B — 3 tab PrepLayout (Agenda · Stato · Schede), nuova tabella `prep_sessioni` per i turni, integrazione del questionario "parte atletica?" nel form allenamenti. Le tabelle non più necessarie vengono rimosse con una migration V2.

**Tech Stack:** React 19 + React Router v7 + TanStack Query v5 + Supabase JS v2 + TailwindCSS v4 + Lucide React + date-fns v4

---

## Contesto: stato attuale

Il modulo V1 (già in produzione su `master`) include 7 pagine prep e 13 tabelle SQL. Questo redesign riduce a 3 pagine prep e rimuove 7 tabelle inutili, aggiungendone 2 nuove.

---

## 1. Modifiche al Database (migration V2)

### 1.1 Tabelle da eliminare

```sql
DROP TABLE IF EXISTS test_programmati CASCADE;
DROP TABLE IF EXISTS test_risultati CASCADE;
DROP TABLE IF EXISTS test_definizioni CASCADE;
DROP TABLE IF EXISTS antropometria CASCADE;
DROP TABLE IF EXISTS spazi_orario_settimana CASCADE;
DROP TABLE IF EXISTS spazi_orario_fisso CASCADE;
DROP TABLE IF EXISTS spazi_atletici CASCADE;
```

### 1.2 Nuova tabella: `prep_squadre`

Associa il preparatore atletico alle proprie squadre (assegnazione fatta dall'admin nel Setup).

```sql
CREATE TABLE IF NOT EXISTS prep_squadre (
  id              SERIAL PRIMARY KEY,
  preparatore_id  UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  squadra         TEXT  NOT NULL,
  societa_id      UUID  NOT NULL REFERENCES societa(id),
  UNIQUE (preparatore_id, squadra, societa_id)
);
ALTER TABLE prep_squadre ENABLE ROW LEVEL SECURITY;
-- Admin: CRUD completo
CREATE POLICY "prep_squadre_admin_all" ON prep_squadre FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND ruolo IN ('admin','super_admin') AND societa_id = prep_squadre.societa_id
  ));
-- Preparatore: lettura delle proprie
CREATE POLICY "prep_squadre_prep_read" ON prep_squadre FOR SELECT TO authenticated
  USING (preparatore_id = auth.uid());
-- Allenatore: lettura (per sapere chi segue la propria squadra)
CREATE POLICY "prep_squadre_coach_read" ON prep_squadre FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND (ruolo = 'allenatore' OR 'allenatore' = ANY(ruoli_extra))
      AND societa_id = prep_squadre.societa_id
  ));
```

### 1.3 Nuova tabella: `prep_sessioni`

Turni del preparatore — linkati a un allenamento esistente o standalone.

```sql
CREATE TABLE IF NOT EXISTS prep_sessioni (
  id              SERIAL PRIMARY KEY,
  societa_id      UUID  NOT NULL REFERENCES societa(id),
  preparatore_id  UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  squadra         TEXT  NOT NULL,
  data            DATE  NOT NULL,
  ora_inizio      TIME  NOT NULL,
  durata_min      INTEGER NOT NULL DEFAULT 30,
  quando          TEXT  NOT NULL DEFAULT 'standalone'
                  CHECK (quando IN ('prima','durante','dopo','standalone')),
  su_campo        BOOLEAN NOT NULL DEFAULT FALSE,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE prep_sessioni ENABLE ROW LEVEL SECURITY;
-- Preparatore: CRUD proprie sessioni
CREATE POLICY "prep_sessioni_prep_all" ON prep_sessioni FOR ALL TO authenticated
  USING (preparatore_id = auth.uid());
-- Admin: lettura completa
CREATE POLICY "prep_sessioni_admin_read" ON prep_sessioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND ruolo IN ('admin','super_admin') AND societa_id = prep_sessioni.societa_id
  ));
-- Allenatore: lettura sessioni delle proprie squadre
CREATE POLICY "prep_sessioni_coach_read" ON prep_sessioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.ruolo = 'allenatore' OR 'allenatore' = ANY(p.ruoli_extra))
      AND p.societa_id = prep_sessioni.societa_id
      AND (p.squadra = prep_sessioni.squadra OR p.squadra2 = prep_sessioni.squadra OR p.squadra3 = prep_sessioni.squadra)
  ));
```

### 1.4 Modifica `schede_assegnazioni`

La tabella esiste già con CHECK `(squadra IS NOT NULL OR giocatore_id IS NOT NULL)`. Nessuna modifica strutturale necessaria — il form V2 gestirà l'assegnazione in modo più chiaro.

### 1.5 Nessuna modifica alle tabelle mantenute

`infortuni`, `rpe_sessioni`, `schede_atletiche`, `schede_assegnazioni` rimangono invariate.

---

## 2. Modifiche al routing e ai layout

### 2.1 `PrepLayout.jsx` — 3 tab (era 7)

```
/prep          → AgendaPrep   (tab Home, icona Calendar)
/prep/stato    → StatoPage    (tab Stato, icona Activity)
/prep/schede   → SchedeAtletichePage  (tab Schede, icona BookOpen)
```

Le route `/prep/test`, `/prep/infortuni`, `/prep/antropometria`, `/prep/spazi`, `/prep/carichi` vengono rimosse da App.jsx.

### 2.2 `App.jsx`

```jsx
<Route path="/prep" element={<ProtectedRoute requiredRole="preparatore_atletico"><PrepLayout /></ProtectedRoute>}>
  <Route index          element={<AgendaPrep />} />
  <Route path="stato"  element={<StatoPage />} />
  <Route path="schede" element={<SchedeAtletichePage />} />
</Route>
```

---

## 3. Pagine del Preparatore

### 3.1 `AgendaPrep.jsx` — sostituisce HomePrep.jsx

**Vista:** Griglia settimanale (Lun–Dom). Ogni sessione appare come card:
- Squadra · data · orario calcolato (`ora_inizio`)
- Badge colorato: `quando` (prima/durante/dopo/standalone)
- Badge `⚠ Su campo` in rosso se `su_campo = true`, verde `Fuori campo` altrimenti

**FAB** `+` in basso a destra → apre bottom sheet per nuova sessione standalone.

**Form nuova sessione (bottom sheet, form guidato):**

```
Tipo: [Legata ad allenamento] [Sessione libera]

— Se LEGATA (il legame è concettuale: stessa data+squadra dell'allenamento,
  nessun FK rigido per evitare la complessità orario_fisso/orario_settimana):
  Squadra *        → select (solo squadre assegnate al preparatore)
  Data *           → date picker (il preparatore sceglie il giorno dell'allenamento)
  Quando *         → [Prima] [Durante] [Dopo]
  Durata (min) *   → number input
  Dove *           → [⚠ Su campo] [Fuori campo]
  Note             → text
  ora_inizio calcolata: non richiesta — viene impostata = ora allenamento + offset quando

— Se LIBERA:
  Squadra *        → select
  Data *           → date picker
  Ora inizio *     → time input
  Durata (min) *   → number input
  Dove *           → [⚠ Su campo] [Fuori campo]
  Note             → text
```

**Nota:** per le sessioni "legate", `ora_inizio` in DB viene impostata con valore di default `00:00` — viene usata solo per l'ordinamento, non mostrata all'utente. Il campo `quando` (prima/durante/dopo) è il dato significativo.

Quando `su_campo = true` compare avviso: *"Visibile agli admin nel calendario come estensione dell'allenamento."*

**queryKey:** `['prep-sessioni', societaId, preparatoreId, weekStartStr]`

**Mutation insert:** `supabase.from('prep_sessioni').insert(payload)` — `preparatore_id = profile.id`.

### 3.2 `StatoPage.jsx` — sostituisce InfortuniPage.jsx + CarichiPage.jsx

Unica pagina con:
- **Select squadra** in testa (solo squadre assegnate al preparatore)
- **Sezione Infortuni attivi** (card rosse, bottone "Risolto" → update stato='risolto')
- **Sezione Carichi RPE** (griglia settimanale compatta identica all'attuale CarichiPage, navigazione settimana)

Il preparatore può aggiungere infortuni (bottone `+` in header) e inserire RPE manualmente (bottone `+` nella sezione carichi).

File da rimuovere dopo questa implementazione: `InfortuniPage.jsx`, `CarichiPage.jsx`, `HomePrep.jsx`.

### 3.3 `SchedeAtletichePage.jsx` — riscrittura UX

**Lista schede:** Accordion cards. Nessuna modifica strutturale.

**FAB `+`** in basso a destra (posizione fissa `bottom-20 right-4`, z-50) → apre bottom sheet.

**Form nuova scheda (bottom sheet):**

```
Nome scheda *         → text input
Categoria             → pill selector: [Riscaldamento] [Forza] [Mobilità] [Recupero] [Altro]
Assegna a             → [👥 Squadra] [👤 Giocatore]
  — se Squadra:  select squadra (solo squadre assegnate)
  — se Giocatore: select squadra → poi select giocatore della squadra

Data inizio *         → date (default oggi)
Data fine             → date (opzionale)

Esercizi:
  Per ogni esercizio — card con sfondo amber-50:
    Nome *            → text input
    [Serie] [Reps] [Carico]  → 3 input affiancati (number)
    Note              → text input
  Pulsante "+ Aggiungi esercizio" (dashed border)

[Salva scheda]  → bg-amber-500
```

**Bug fix save:** il pulsante Salva era `type="button"` anziché `type="submit"` — cambiare in `type="submit"` con `handleSave` su `onSubmit` del form.

**Assegnazione:** al save, se `assegna = 'squadra'` → insert `schede_assegnazioni(scheda_id, squadra, data_inizio)`. Se `assegna = 'giocatore'` → insert `schede_assegnazioni(scheda_id, giocatore_id, data_inizio)`.

---

## 4. Integrazione nel form allenamenti (EventForm)

**File:** `frontend/src/components/EventForm.jsx` (o dove vive il form di creazione allenamento).

Alla fine del form di creazione allenamento, aggiungere una sezione condizionale visibile solo se `tipo = 'allenamento'`:

```jsx
<div className="border-t pt-4">
  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
    <input type="checkbox" checked={hasAtletica} onChange={e => setHasAtletica(e.target.checked)} />
    Parte di preparazione atletica
  </label>
  {hasAtletica && (
    <PrepSesioneInlineForm squadra={form.squadra} data={form.data} onChange={setPrepData} />
  )}
</div>
```

`PrepSesioneInlineForm` (nuovo componente piccolo) mostra solo:
- Quando: [Prima] [Durante] [Dopo]
- Durata (min): number
- Dove: [Su campo] [Fuori campo]

Al salvataggio dell'allenamento, se `hasAtletica` è true: si esegue anche `supabase.from('prep_sessioni').insert(prepPayload)` con il `preparatore_id` del preparatore assegnato alla squadra (recuperato da `prep_squadre`).

**Se nessun preparatore è assegnato** alla squadra: il checkbox è disabilitato con tooltip *"Nessun preparatore assegnato a questa squadra"*.

---

## 5. Setup Admin — Assegnazione preparatori

**File:** `frontend/src/pages/admin/SetupPage.jsx` — aggiungere tab `"Preparatori"`.

**UI:** Tabella con righe: preparatore (nome) | squadre assegnate (pill tags) | bottone modifica.

**Form modifica:** multi-select delle squadre della società.

**Queries:**
- `SELECT * FROM profiles WHERE ruolo = 'preparatore_atletico' AND societa_id = ?`
- `SELECT * FROM prep_squadre WHERE societa_id = ?`

**Mutations:**
- Delete existing + insert new: `supabase.from('prep_squadre').delete().eq('preparatore_id', id)` poi insert nuovo set.

---

## 6. Calendario Admin — Badge sessioni atletiche "su campo"

**File:** `frontend/src/pages/CalendarioPage.jsx` (o componente card evento).

Le sessioni `prep_sessioni` con `su_campo = true` vengono mostrate nel calendario con un badge `⚡ Atletica` arancione, come riga aggiuntiva sotto il relativo allenamento della stessa squadra+data.

Query aggiuntiva in CalendarioPage (solo per admin):
```js
supabase.from('prep_sessioni')
  .select('*')
  .eq('societa_id', societaId)
  .eq('su_campo', true)
  .gte('data', weekStart)
  .lte('data', weekEnd)
```

---

## 7. AtleticaCoach — Semplificazione

**File:** `frontend/src/pages/coach/AtleticaCoach.jsx`

Rimuovere i tab `test` e `spazi`. Mantenere solo:
- Tab **Infortuni** (già esistente, invariato)
- Tab **Carichi** (già esistente, invariato)
- Tab **Sessioni** (nuovo): mostra le `prep_sessioni` delle proprie squadre per la settimana corrente

Il tab Sessioni mostra: data · orario · quando (prima/durante/dopo) · dove (campo/fuori). Read-only.

---

## 8. HomeGiocatore — Scheda assegnata

**File:** `frontend/src/pages/player/HomeGiocatore.jsx`

Aggiungere query dopo il box RPE:

```js
const { data: schedeAssegnate = [] } = useQuery({
  queryKey: ['schede-giocatore', mioGiocatore?.id, societaId],
  enabled: !!mioGiocatore?.id,
  staleTime: 10 * 60_000,
  queryFn: async () => {
    const { data } = await supabase
      .from('schede_assegnazioni')
      .select('*, scheda:scheda_id(nome, categoria, esercizi)')
      .eq('societa_id', societaId)
      .or(`giocatore_id.eq.${mioGiocatore.id},squadra.eq.${mioGiocatore.squadra}`)
      .lte('data_inizio', todayStr)
      .or('data_fine.is.null,data_fine.gte.' + todayStr)
    return data ?? []
  },
})
```

Per ogni scheda attiva, mostrare una card:
- Header: nome scheda + badge categoria (amber pill)
- Lista esercizi: `serie × reps — carico` su una riga, note sotto
- Read-only — nessun bottone di modifica

---

## 9. Ruoli e visibilità — riepilogo

| Ruolo | Vede |
|---|---|
| **Preparatore** | Agenda turni · Stato squadre (infortuni + RPE) · Schede |
| **Admin** | Badge ⚡ atletica nel calendario per sessioni su campo · Setup preparatori |
| **Allenatore** | Tab Atletica: Infortuni + Carichi + Sessioni (read-only) |
| **Giocatore** | Scheda assegnata in HomeGiocatore (read-only) |
| **Genitore** | Niente |

---

## 10. File da creare / modificare / eliminare

### Creare
- `frontend/src/pages/prep/AgendaPrep.jsx`
- `frontend/src/pages/prep/StatoPage.jsx`
- `frontend/src/components/PrepSesioneInlineForm.jsx`
- `supabase/migrations/supabase_migration_prep_v2.sql`

### Modificare
- `frontend/src/pages/prep/SchedeAtletichePage.jsx` (FAB, form UX, fix save)
- `frontend/src/layouts/PrepLayout.jsx` (3 tab)
- `frontend/src/App.jsx` (route prep)
- `frontend/src/components/EventForm.jsx` (checkbox atletica)
- `frontend/src/pages/coach/AtleticaCoach.jsx` (rimuovi test/spazi, aggiungi tab sessioni)
- `frontend/src/pages/player/HomeGiocatore.jsx` (scheda assegnata)
- `frontend/src/pages/admin/SetupPage.jsx` (tab preparatori)

### Eliminare
- `frontend/src/pages/prep/HomePrep.jsx`
- `frontend/src/pages/prep/InfortuniPage.jsx`
- `frontend/src/pages/prep/CarichiPage.jsx`
- `frontend/src/pages/prep/TestFisiciPage.jsx`
- `frontend/src/pages/prep/AntropometriaPage.jsx`
- `frontend/src/pages/prep/SpaziPage.jsx`
