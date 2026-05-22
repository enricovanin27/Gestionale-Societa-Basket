# Design: 5 Fix Multi-ruolo, Calendario e Home Admin

**Data:** 2026-05-18  
**Stato:** Approvato

---

## Contesto

L'app ha 5 ruoli principali (admin, allenatore, segreteria, genitore, giocatore) e supporta `ruoli_extra` per utenti con più ruoli. Sono stati identificati 5 bug/mancanze correlati a questa feature multi-ruolo e alla gestione degli eventi (partite/allenamenti).

---

## Fix 1 — Setup utenti: squadre con multi-ruolo + UI riorganizzata

### Problema
- In `UtentiTab` (SetupPage.jsx:1194), le 3 select squadra compaiono solo se `u.ruolo === 'giocatore' || u.ruolo === 'genitore'`. Se il ruolo principale è `admin` ma `ruoli_extra` include `'genitore'` o `'giocatore'`, le squadre non sono assegnabili.
- La card utente è visivamente confusa: badge ruolo → azioni → info allenatore → checkbox extra → select squadre sono tutti piatti e sovrapposti.

### Soluzione

**Condizione per mostrare le select squadre:**
```js
const needsSquadre = u.ruolo === 'giocatore' || u.ruolo === 'genitore' ||
  (u.ruoli_extra ?? []).some(r => r === 'giocatore' || r === 'genitore')
```

**Etichetta contestuale:** mostrare "Squadre (genitore):" o "Squadre (giocatore):" per chiarire a quale ruolo appartengono.

**Struttura card riorganizzata:**
```
┌─────────────────────────────────────────────────────────┐
│ Mario Rossi   [Admin] [+Genitore]   [admin▼] [Off] [🗑] │
│ mario@email.it                                          │
├─────────────────────────────────────────────────────────┤
│ Ruoli extra:  □ Allenatore  ☑ Genitore  □ Giocatore    │
├─────────────────────────────────────────────────────────┤
│ Squadre (genitore):  [Sq.1 ▼]  [Sq.2 ▼]  [Sq.3 ▼]     │
└─────────────────────────────────────────────────────────┘
```

**File:** `src/pages/SetupPage.jsx` — funzione `UtentiTab`, sezione lista utenti (riga ~1193).

---

## Fix 2 — Multi-ruolo: admin non eredita squadre da allenatore

### Problema
In `CalendarioPage.jsx`:
- `isAllenatore = allRuoli.includes('allenatore')` è `true` per chi ha entrambi admin+allenatore
- Questo attiva il filtro "Solo mie squadre" e restringe la lista squadre nel form, anche quando si naviga da `/admin/partite`

### Soluzione

Derivare il comportamento dall'URL corrente anziché dal flag globale:

```js
import { useLocation } from 'react-router-dom'
// In CalendarioPage:
const location = useLocation()
const actingAsAllenatore = location.pathname.startsWith('/coach') && isAllenatore
```

Sostituire tutti gli usi di `isAllenatore` con `actingAsAllenatore` all'interno di `CalendarioPage.jsx`.

**Risultato:**
- `/admin/partite` → comportamento full-admin (nessun filtro squadre coach)
- `/coach/calendario` → comportamento coach (filtro per proprie squadre)

**File:** `src/pages/CalendarioPage.jsx`

---

## Fix 3 — Calendario: aggiungere allenamento dal FAB

### Problema
`EventForm` in CalendarioPage supporta solo partite (salva su tabella `calendario`). Il campo `tipo` esiste in `EMPTY_FORM` ma non è usato.

### Soluzione

**1. Toggle tipo in cima al form:**
```
[🏀 Partita]  [🏋️ Allenamento]
```

**2. Campi per tipo `allenamento`:** data, squadra, ora_inizio, ora_fine, palestra. Nascondere: avversario, casa/fuori, stato.

**3. Save mutation branched:**
```js
if (form.tipo === 'allenamento') {
  // UPSERT su orario_settimana — potrebbe già esistere una riga per data+squadra
  await supabase.from('orario_settimana').upsert([{
    data: form.data, squadra: form.squadra,
    ora_inizio: form.ora_inizio, ora_fine: form.ora_fine,
    palestra: form.palestra, annullato: false,
    societa_id: societaId,
  }], { onConflict: 'societa_id,data,squadra' })
} else {
  // esistente: INSERT/UPDATE su calendario
}
```

**4. onSuccess:** invalidare `['weekEvents']` per entrambi i tipi.

**File:** `src/pages/CalendarioPage.jsx` — funzione `EventForm` e mutation `saveMutation`.

---

## Fix 4 — Home admin: FAB per aggiungere partita o allenamento

### Problema
`HomeAdmin.jsx` non ha nessun pulsante per aggiungere eventi.

### Soluzione

**1. Estrarre `EventForm` da CalendarioPage** in `src/pages/home/shared.jsx` (o importarlo direttamente da CalendarioPage come named export).

**2. Aggiungere stato in HomeAdmin:**
```js
const [showForm, setShowForm] = useState(false)
const [squadre, setSquadre] = useState([])  // via useSquadre()
```

**3. FAB fisso in HomeAdmin:**
```jsx
<button
  onClick={() => setShowForm(true)}
  className="fixed bottom-24 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg ..."
>
  <Plus size={28} />
</button>
```

**4. Montare EventForm con onSave che invalida `['admin-partite-future']` e `['weekEvents']`.**

**File:** `src/pages/home/HomeAdmin.jsx`, `src/pages/CalendarioPage.jsx` (named export di EventForm)

---

## Fix 5 — Conflitti allenamenti dalla Home

### Problema
Il conflict check in `EventForm` per la palestra è condizionato a `form.casa_fuori === 'Casa'`, che per un allenamento non viene mai impostato → i conflitti di palestra non vengono rilevati.

### Soluzione

Aggiornare la logica di conflict check in `EventForm`:

```js
// Prima (solo partite):
} else if (form.casa_fuori === 'Casa' && form.palestra?.trim() && ...)

// Dopo (partite casa + tutti gli allenamenti):
const homeEvent = form.tipo === 'allenamento' || form.casa_fuori === 'Casa'
} else if (homeEvent && form.palestra?.trim() && ...)
```

Una volta che EventForm è condiviso tra CalendarioPage e HomeAdmin (fix 3+4), questo fix si applica automaticamente a entrambi i contesti.

**File:** `src/pages/CalendarioPage.jsx` — funzione `EventForm`, useMemo `conflictCheck`.

---

## Dipendenze tra fix

```
Fix 1  ─── indipendente
Fix 2  ─── indipendente
Fix 3  ──┐
Fix 4  ──┼─ Fix 4 dipende da Fix 3 (EventForm condiviso)
Fix 5  ──┘  Fix 5 risolto automaticamente da Fix 3+4
```

## File modificati

| File | Fix |
|------|-----|
| `src/pages/SetupPage.jsx` | 1 |
| `src/pages/CalendarioPage.jsx` | 2, 3, 5 |
| `src/pages/home/HomeAdmin.jsx` | 4 |
| `src/pages/home/shared.jsx` | 4 (eventuale export EventForm) |
