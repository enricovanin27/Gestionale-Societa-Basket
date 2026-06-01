# Design: Batch 2 — Preparatore Redesign

**Data:** 2026-06-01  
**Stato:** Approvato  
**Scope:** Home preparatore (dashboard KPI), Agenda compatta, Calendario coach in prep, aggiornamento PrepLayout

---

## 1. Struttura navigazione aggiornata

`PrepLayout` passa da 2 a 4 voci:

| Route | Componente | Nav label | Icona |
|-------|-----------|-----------|-------|
| `/prep` (index) | `HomePrepPage` (NUOVO) | Home | `Home` |
| `/prep/agenda` | `AgendaPrep` (SPOSTATO da index) | Agenda | `Calendar` |
| `/prep/calendario` | `CalendarioPage` (RIUSO) | Calendario | `CalendarDays` |
| `/prep/schede` | `SchedeAtletichePage` (invariato) | Schede | `BookOpen` |

**Modifiche:**
- `PrepLayout.jsx`: aggiunge Home e Calendario a sidebar e bottom nav; aggiorna link Agenda da `/prep` a `/prep/agenda`
- `App.jsx`: aggiunge route `index → HomePrepPage`, cambia `index` attuale in `agenda`, aggiunge `calendario → CalendarioPage`

---

## 2. HomePrepPage (nuovo file)

**File:** `frontend/src/pages/prep/HomePrepPage.jsx`

### Layout generale

```
AppHeader title="Home" subtitle=societaNome

Grid 2 colonne: [KPI card Sessioni] [KPI card Allenamenti]

Se espanso Sessioni → lista sessioni settimana corrente
Se espanso Allenamenti → lista allenamenti squadre assegnate questa settimana

Se tutto a 0 → banner "✅ Nessuna sessione programmata questa settimana"
```

### Card KPI

Pattern identico a `SegreteriaDashboard.KpiCard`:
- Mostra il conteggio (numero grande) + etichetta
- Se count > 0: freccia su/giù, cliccabile per espandere/collassare
- Se count = 0: non cliccabile, mostra count in verde

### Sezione espansa: Sessioni

Dati: `prep_sessioni` WHERE `societa_id = societaId AND preparatore_id = profile.id AND data BETWEEN weekStart AND weekEnd`  
Query key: `['prep-home-sessioni', societaId, profile?.id, weekStartStr]`  
staleTime: 30s  

Visualizzazione: raggruppate per data. Per ogni giorno:
```
─── Lunedì 2 giu ───────────────────────────────
  bg-white border-l-4 border-amber-400 rounded-xl px-3 py-2.5
  U15 · Prima · 30 min · Fuori campo
  U18 · Sessione libera · 09:00 · 60 min
```

Formato riga: `{squadra} · {QUANDO_LABEL[quando]} · {durata_min} min{su_campo ? ' · ⚠ su campo' : ''}`

### Sezione espansa: Allenamenti

Dati: `useWeekEvents(weekStart)` → filtra `e._tipo === 'allenamento' && !e.annullato && squadreAssegnate.includes(e.squadra)`  
Query key: già gestita da `useWeekEvents`  
`squadreAssegnate` viene da `prep_squadre WHERE preparatore_id = profile.id AND societa_id = societaId`

Visualizzazione: raggruppati per data.  
Formato riga: `{squadra} · {ora_inizio}–{ora_fine} · {palestra ?? ''}`  
Stile: `bg-white border-l-4 border-blue-400 rounded-xl px-3 py-2.5`

### weekStart

La settimana mostrata è SEMPRE quella corrente — non serve navigazione settimanale sulla home. Il preparatore usa l'Agenda per navigare settimane future.

---

## 3. AgendaPrep — Redesign compatta

**File:** `frontend/src/pages/prep/AgendaPrep.jsx` (modifica)

### Pattern visivo (stile CalendarioGenitore)

Sostituisce il layout card-based con:

```
←  1 giu – 7 giu 2026  →   [+ FAB]

  ●  Lunedì 2 giu          ← cerchio data + nome giorno
     │▌ U15 · Prima · 30 min · fuori campo        [×]
     │▌ U18 · Durante · 20 min · ⚠ su campo       [×]
        Note: riscaldamento specifico

  ○  Martedì 3 giu
     –

  ●  Mercoledì 4 giu        ← oggi: cerchio amber
     │▌ U15 · Sessione libera · 09:00 · 60 min    [×]
```

### Dettagli implementativi

**Giorno header:**
```jsx
<div className="flex items-center gap-2 mb-1.5">
  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
    isToday ? 'bg-amber-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
  }`}>
    {format(day, 'd')}
  </div>
  <p className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-amber-600' : 'text-gray-500'}`}>
    {format(day, 'EEEE', { locale: it })}
  </p>
  {isToday && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Oggi</span>}
</div>
```

**Giorno senza sessioni:** mostra `<div className="ml-10 text-xs text-gray-300 pb-1">–</div>` (non nasconde il giorno)

**Sessione item (indentata ml-10):**
```jsx
<div className="border-l-4 border-amber-400 bg-white rounded-xl px-3 py-2 shadow-sm mb-1.5">
  <div className="flex items-center justify-between">
    <p className="text-sm font-semibold text-gray-900">
      {s.squadra}
    </p>
    <button onClick={() => deleteMut.mutate(s.id)} className="text-gray-300 hover:text-red-400 p-1 -mr-1">
      <X size={14} />
    </button>
  </div>
  <p className="text-xs text-gray-500 mt-0.5">
    {QUANDO_LABEL[s.quando]}
    {s.durata_min ? ` · ${s.durata_min} min` : ''}
    {s.su_campo ? ' · ⚠ su campo' : ' · fuori campo'}
    {s.quando === 'standalone' && s.ora_inizio ? ` · ${s.ora_inizio.slice(0,5)}` : ''}
  </p>
  {s.note && <p className="text-xs text-gray-400 mt-0.5 italic">{s.note}</p>}
</div>
```

**Invariati:** navigazione settimana (ChevronLeft/Right + label range), query dati, modal aggiunta sessione, FAB.

---

## 4. CalendarioPage per preparatore

**Nessun nuovo file.** `CalendarioPage` viene riusata così com'è su `/prep/calendario`.

`CalendarioPage` determina `canEdit` controllando il ruolo dell'utente tramite `useAuth()`. Durante l'implementazione, verificare come viene calcolato `canEdit` (probabilmente `isAdmin || isAllenatore`). Se il preparatore non risulta abilitato alla modifica, aggiungere `isPreparatore` alla condizione `canEdit` in `CalendarioPage`. L'obiettivo è che il preparatore veda e possa modificare il calendario esattamente come fa l'allenatore.

---

## 5. File coinvolti (sommario)

| File | Azione |
|------|--------|
| `frontend/src/pages/prep/HomePrepPage.jsx` | NUOVO — dashboard KPI preparatore |
| `frontend/src/pages/prep/AgendaPrep.jsx` | MODIFY — layout compatto stile CalendarioGenitore |
| `frontend/src/layouts/PrepLayout.jsx` | MODIFY — aggiunge Home e Calendario, aggiorna link Agenda |
| `frontend/src/App.jsx` | MODIFY — aggiunge route index HomePrepPage, agenda, calendario |

---

## 6. Fuori scope

- Modifiche al modal di creazione sessione (rimane invariato)
- Filtri o ricerca nell'agenda
- Notifiche push per il preparatore
- Gestione assenze/presenze dal calendario prep
