# Alert Presenze Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere tre alert "Azioni urgenti" nella home admin (appello mancante, squadra con presenze basse, giocatori con presenze basse) e rimuovere l'alert delle quote non pagate.

**Architecture:** Tutto in un unico file `HomeAdmin.jsx`. Le nuove query seguono il pattern `useQuery` già usato nel file. I tre alert si inseriscono nella sezione "Azioni urgenti" esistente, dopo i cert. medici, nell'ordine: appelli mancanti → squadre basse → giocatori bassi.

**Tech Stack:** React 19, TanStack Query v5, Supabase JS v2, date-fns v4, Tailwind CSS v4, Vite

---

## File coinvolti

| File | Tipo modifica |
|---|---|
| `frontend/src/pages/home/HomeAdmin.jsx` | Unico file modificato — 4 task sequenziali |

---

## Task 1: Rimuovi query e alert "quote non pagate"

**Files:**
- Modify: `frontend/src/pages/home/HomeAdmin.jsx`

- [ ] **Step 1: Rimuovi la query `quoteNonPagateCount`**

In `HomeAdmin.jsx`, individua e **cancella** il blocco (righe ~84-96):

```js
// DA CANCELLARE — tutto questo blocco:
const { data: quoteNonPagateCount = 0 } = useQuery({
  queryKey: ['admin-quote-nonpagate', societaId],
  enabled: !!societaId,
  queryFn: async () => {
    const { count } = await supabase
      .from('quote')
      .select('*', { count: 'exact', head: true })
      .eq('societa_id', societaId)
      .eq('pagato', false)
    return count ?? 0
  },
  staleTime: 5 * 60 * 1000,
})
```

- [ ] **Step 2: Aggiorna `urgenzeTot` rimuovendo il contributo delle quote**

Individua la riga (circa riga 213):
```js
const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN + (certInScad30N > 0 ? 1 : 0) + (quoteNonPagateCount > 0 ? 1 : 0)
```
Sostituiscila con:
```js
const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN + (certInScad30N > 0 ? 1 : 0)
```

- [ ] **Step 3: Rimuovi il blocco JSX dell'alert quote**

Individua e **cancella** questo blocco nel JSX (circa righe 322-329):
```jsx
{quoteNonPagateCount > 0 && (
  <div className="w-full bg-white rounded-xl border-l-4 border-purple-400 px-4 py-3 shadow-sm">
    <p className="text-sm text-gray-800">
      💰 {quoteNonPagateCount} quot{quoteNonPagateCount === 1 ? 'a' : 'e'} non pagat{quoteNonPagateCount === 1 ? 'a' : 'e'}
    </p>
    <p className="text-xs text-gray-400 mt-0.5">La segreteria gestisce i pagamenti</p>
  </div>
)}
```

- [ ] **Step 4: Verifica build**

```bash
cd frontend && npm run build
```
Atteso: build completata senza errori TypeScript/ESLint. Nessun `quoteNonPagateCount` rimasto.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/home/HomeAdmin.jsx
git commit -m "fix: rimuovi alert quote non pagate da home admin"
```

---

## Task 2: Aggiungi infrastruttura date + Alert C (appello mancante)

**Files:**
- Modify: `frontend/src/pages/home/HomeAdmin.jsx`

- [ ] **Step 1: Aggiungi `subDays` all'import date-fns**

Sostituisci riga 2:
```js
import { format, addDays, addWeeks, startOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns'
```
Con:
```js
import { format, addDays, addWeeks, startOfWeek, startOfMonth, endOfMonth, parseISO, subDays } from 'date-fns'
```

- [ ] **Step 2: Aggiungi variabili date dopo `lastWeekEnd`**

Individua la riga:
```js
const lastWeekEnd   = useMemo(() => format(addDays(weekStart, -1), 'yyyy-MM-dd'), [weekStart])
```
Subito **dopo** aggiunge queste tre variabili:
```js
const da30Str = format(subDays(today, 30), 'yyyy-MM-dd')
const da2Str  = format(subDays(today, 2),  'yyyy-MM-dd')
const ieriStr = format(subDays(today, 1),  'yyyy-MM-dd')
```

- [ ] **Step 3: Aggiungi query `appelliMancanti`**

Individua il commento `// ── Presenze settimana scorsa per squadra`. Subito **dopo** il blocco della query `presenzeScorsa` (fine circa riga 130), inserisci:

```js
// ── Appelli mancanti ultimi 2 giorni ──────────────────────────────────────
const { data: appelliMancanti = [] } = useQuery({
  queryKey: ['admin-appelli-mancanti', da2Str, todayStr, societaId],
  enabled: !!societaId,
  queryFn: async () => {
    // Allenamenti programmati (non annullati) negli ultimi 2 giorni, escluso oggi
    const { data: allenamenti } = await supabase
      .from('orario_settimana')
      .select('id, squadra, data, ora_inizio')
      .eq('societa_id', societaId)
      .eq('annullato', false)
      .gte('data', da2Str)
      .lt('data', todayStr)
      .order('data').order('ora_inizio')

    if (!allenamenti?.length) return []

    // Presenze registrate nello stesso range
    const { data: presenze } = await supabase
      .from('presenze_allenamento')
      .select('data, squadra')
      .eq('societa_id', societaId)
      .gte('data', da2Str)
      .lt('data', todayStr)

    // Set di coppie (data|squadra) che hanno almeno una presenza registrata
    const conAppello = new Set(
      (presenze ?? []).map(p => `${p.data}|${p.squadra}`)
    )

    // Restituisce solo gli allenamenti senza appello registrato
    return allenamenti.filter(a => !conAppello.has(`${a.data}|${a.squadra}`))
  },
  staleTime: 5 * 60 * 1000,
})
```

- [ ] **Step 4: Aggiorna `urgenzeTot`**

Sostituisci la riga `urgenzeTot` (attualmente da Task 1):
```js
const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN + (certInScad30N > 0 ? 1 : 0)
```
Con:
```js
const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN + (certInScad30N > 0 ? 1 : 0) + appelliMancanti.length
```

- [ ] **Step 5: Aggiungi JSX Alert C nel blocco "Azioni urgenti"**

Individua il blocco:
```jsx
{certInScad30N > 0 && (
  <button
    onClick={() => navigate('/admin/persone')}
    className="w-full text-left bg-white rounded-xl border-l-4 border-amber-300 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
  >
    <p className="text-sm text-gray-800">
      📅 {certInScad30N} certificat{certInScad30N === 1 ? 'o' : 'i'} in scadenza (prossimi 30gg)
    </p>
  </button>
)}
```
Subito **dopo** questo blocco inserisci:
```jsx
{appelliMancanti.map(a => (
  <button
    key={`appello-${a.id}`}
    onClick={() => navigate('/admin/presenze')}
    className="w-full text-left bg-white rounded-xl border-l-4 border-blue-400 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
  >
    <p className="text-sm text-gray-800">
      📋 Appello mancante: {a.squadra}
      {' — '}
      {a.data === ieriStr
        ? 'ieri'
        : format(parseISO(a.data), 'EEE d MMM', { locale: it })}
    </p>
  </button>
))}
```

- [ ] **Step 6: Verifica build**

```bash
cd frontend && npm run build
```
Atteso: build senza errori. Verifica che `subDays` non generi warning.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/home/HomeAdmin.jsx
git commit -m "feat: alert appello mancante (ultimi 2 giorni) nella home admin"
```

---

## Task 3: Alert A — Squadre con presenze basse (< 60% settimana scorsa)

**Files:**
- Modify: `frontend/src/pages/home/HomeAdmin.jsx`

Nota: i dati vengono da `presenzePerSquadra` già calcolato — nessuna nuova query.

- [ ] **Step 1: Aggiungi `squadreBassaPresenza` come `useMemo`**

Individua il blocco `presenzePerSquadra` (termina circa riga 145 con `.sort(...)`). Subito **dopo** aggiunge:

```js
const squadreBassaPresenza = useMemo(
  () => presenzePerSquadra.filter(p => p.pct !== null && p.pct < 60),
  [presenzePerSquadra]
)
```

- [ ] **Step 2: Aggiorna `urgenzeTot`**

Sostituisci:
```js
const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN + (certInScad30N > 0 ? 1 : 0) + appelliMancanti.length
```
Con:
```js
const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN + (certInScad30N > 0 ? 1 : 0) + appelliMancanti.length + squadreBassaPresenza.length
```

- [ ] **Step 3: Aggiungi JSX Alert A nel blocco "Azioni urgenti"**

Individua il blocco `appelliMancanti.map(...)` appena aggiunto nel Task 2. Subito **dopo** inserisci:

```jsx
{squadreBassaPresenza.map(p => (
  <button
    key={`bassa-presenza-${p.squadra}`}
    onClick={() => navigate('/admin/presenze')}
    className="w-full text-left bg-white rounded-xl border-l-4 border-orange-400 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
  >
    <p className="text-sm text-gray-800">
      📉 {p.squadra}: solo {p.pct}% di presenze la settimana scorsa
    </p>
  </button>
))}
```

- [ ] **Step 4: Verifica build**

```bash
cd frontend && npm run build
```
Atteso: build senza errori.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/home/HomeAdmin.jsx
git commit -m "feat: alert squadre con presenze basse (<60%) nella home admin"
```

---

## Task 4: Alert B — Giocatori con presenze basse (< 50% ultimi 30 giorni)

**Files:**
- Modify: `frontend/src/pages/home/HomeAdmin.jsx`

- [ ] **Step 1: Aggiungi query `giocatoriBassaPresenza`**

Individua il blocco `appelliMancanti` aggiunto nel Task 2. Subito **dopo** inserisci:

```js
// ── Giocatori con presenze < 50% ultimi 30 giorni ─────────────────────────
const { data: giocatoriBassaPresenza = [] } = useQuery({
  queryKey: ['admin-giocatori-bassa-presenza', societaId, da30Str],
  enabled: !!societaId,
  queryFn: async () => {
    const { data: presenze } = await supabase
      .from('presenze_allenamento')
      .select('giocatore_id, presente')
      .eq('societa_id', societaId)
      .gte('data', da30Str)
      .lte('data', todayStr)

    if (!presenze?.length) return []

    // Raggruppa per giocatore_id
    const byGiocatore = {}
    for (const p of presenze) {
      if (!byGiocatore[p.giocatore_id])
        byGiocatore[p.giocatore_id] = { presenti: 0, totale: 0 }
      byGiocatore[p.giocatore_id].totale++
      if (p.presente) byGiocatore[p.giocatore_id].presenti++
    }

    // Filtra: min 3 allenamenti registrati e presenza < 50%
    const idsBassa = Object.entries(byGiocatore)
      .filter(([, { presenti, totale }]) => totale >= 3 && presenti / totale < 0.5)
      .map(([id]) => id)

    if (!idsBassa.length) return []

    const { data: giocatori } = await supabase
      .from('giocatori')
      .select('id, nome, cognome, squadra')
      .in('id', idsBassa)

    return (giocatori ?? []).map(g => ({
      ...g,
      presenti: byGiocatore[g.id].presenti,
      totale:   byGiocatore[g.id].totale,
      pct: Math.round(byGiocatore[g.id].presenti / byGiocatore[g.id].totale * 100),
    }))
  },
  staleTime: 5 * 60 * 1000,
})
```

- [ ] **Step 2: Aggiorna `urgenzeTot`**

Sostituisci:
```js
const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN + (certInScad30N > 0 ? 1 : 0) + appelliMancanti.length + squadreBassaPresenza.length
```
Con:
```js
const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN + (certInScad30N > 0 ? 1 : 0) + appelliMancanti.length + squadreBassaPresenza.length + (giocatoriBassaPresenza.length > 0 ? 1 : 0)
```

- [ ] **Step 3: Aggiungi JSX Alert B nel blocco "Azioni urgenti"**

Individua il blocco `squadreBassaPresenza.map(...)` aggiunto nel Task 3. Subito **dopo** inserisci:

```jsx
{giocatoriBassaPresenza.length > 0 && (
  <button
    onClick={() => navigate('/admin/presenze')}
    className="w-full text-left bg-white rounded-xl border-l-4 border-orange-300 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
  >
    <p className="text-sm text-gray-800">
      👤 {giocatoriBassaPresenza.length}{' '}
      giocator{giocatoriBassaPresenza.length === 1 ? 'e' : 'i'} con meno del 50% di presenze nell&apos;ultimo mese
    </p>
  </button>
)}
```

- [ ] **Step 4: Verifica build finale**

```bash
cd frontend && npm run build
```
Atteso: build senza errori. Controlla che non ci siano warning ESLint su variabili inutilizzate (`da30Str`, `da2Str`, `ieriStr` devono tutte apparire nel codice).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/home/HomeAdmin.jsx
git commit -m "feat: alert giocatori con presenze basse (<50% mese) nella home admin"
```

---

## Verifica manuale finale

Dopo tutti e 4 i task, con l'app in esecuzione (`cd frontend && npm run dev`):

1. **Alert rimosso:** accedi come admin — l'alert "quote non pagate" non deve più apparire.
2. **Alert C (appello mancante):** se ieri c'era un allenamento senza appello registrato, deve apparire l'alert blu "📋 Appello mancante: [Squadra] — ieri".
3. **Alert A (squadre basse):** se una squadra ha avuto < 60% di presenze la scorsa settimana, compare l'alert arancio "📉 [Squadra]: solo X%".
4. **Alert B (giocatori bassi):** se almeno un giocatore ha < 50% di presenze negli ultimi 30gg (con ≥3 allenamenti), compare l'alert "👤 X giocatori con meno del 50%...".
5. **Zero urgenze:** se nessun alert scatta, il banner verde "Tutto in ordine!" è ancora visibile.
6. **Click alert:** tutti e tre i nuovi alert navigano a `/admin/presenze`.
