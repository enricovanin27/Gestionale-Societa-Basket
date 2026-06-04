# Alert Presenze Admin — Design Spec

**Data:** 2026-06-04  
**File principale:** `frontend/src/pages/home/HomeAdmin.jsx`  
**Approccio:** Inline in HomeAdmin (Approccio A)

---

## Obiettivo

Aggiungere tre nuovi alert nella sezione "Azioni urgenti" della home admin per segnalare situazioni critiche relative alle presenze agli allenamenti. Rimuovere l'alert "quote non pagate" (più adatto al ruolo dirigente).

---

## Modifiche a HomeAdmin.jsx

### 1. Rimozione alert quote non pagate

Rimuovere la query `quoteNonPagateCount` e il relativo alert dalle "Azioni urgenti". Non eliminare la query di KPI se utilizzata altrove — in questo caso è usata solo per l'alert, quindi si rimuove completamente.

Aggiornare `urgenzeTot` di conseguenza (togliere il contributo di `quoteNonPagateCount`).

---

### 2. Alert A — Squadra con presenze basse (< 60% ultima settimana)

**Dati già disponibili:** `presenzePerSquadra` (calcolato da `presenzeScorsa`, settimana scorsa).

**Logica:** filtrare `presenzePerSquadra` per `pct !== null && pct < 60`.

**UI:**
```
border-l-4 border-orange-400
📉 [Squadra]: solo X% di presenze la settimana scorsa
```
Click → `navigate('/admin/presenze')`

**Contributo a `urgenzeTot`:** +1 per ogni squadra sotto soglia.

---

### 3. Alert B — Giocatori con presenze basse (< 50% negli ultimi 30 giorni)

**Nuova query** `giocatoriBassaPresenza`:

```js
queryKey: ['admin-giocatori-bassa-presenza', societaId, da30Str, todayStr]
queryFn:
  1. Fetch presenze_allenamento WHERE societa_id = X, data >= da30Str, data <= todayStr
  2. Raggruppa per giocatore_id: calcola totale e presenti
  3. Filtra: totale >= 3 AND (presenti / totale) < 0.5
  4. Fetch giocatori WHERE id IN [...filtered_ids] → per nome + squadra
  5. Ritorna array di { id, nome, cognome, squadra, presenti, totale, pct }
```

`da30Str` = `format(subDays(today, 30), 'yyyy-MM-dd')` (già importato `subDays` in altri file, da importare qui).

**UI:** un unico alert aggregato (non uno per giocatore):
```
border-l-4 border-orange-300
👤 X giocator[i/e] con meno del 50% di presenze nell'ultimo mese
```
Click → `navigate('/admin/presenze')`

**Contributo a `urgenzeTot`:** +1 se `giocatoriBassaPresenza.length > 0`.

---

### 4. Alert C — Appello mancante (ultimi 2 giorni)

**Nuova query** `appelliMancanti`:

```js
queryKey: ['admin-appelli-mancanti', ieriStr, antIeriStr, societaId]
queryFn:
  1. da2Str = format(subDays(today, 2), 'yyyy-MM-dd')
  2. ieriStr = format(subDays(today, 1), 'yyyy-MM-dd')
  3. Fetch orario_settimana WHERE societa_id = X, data >= da2Str, data < todayStr, annullato = false
     → seleziona: id, squadra, data, ora_inizio
  4. Se nessun allenamento → return []
  5. Per ogni allenamento trovato, controlla se esiste almeno una riga in presenze_allenamento
     WHERE data = allenamento.data AND squadra = allenamento.squadra AND societa_id = X
     (una singola query con OR oppure una query per coppia data/squadra distinta)
  6. Ritorna solo gli allenamenti per cui il check non trova righe
```

**Ottimizzazione step 5:** fare una sola query `presenze_allenamento` per il range di date, poi verificare in JS quali coppie (data, squadra) hanno almeno una riga.

**UI:** un alert per ciascun allenamento mancante:
```
border-l-4 border-blue-400
📋 Appello mancante: [Squadra] — [ieri | ven 3 giu]
```
Click → `navigate('/admin/presenze')`

**Contributo a `urgenzeTot`:** +`appelliMancanti.length`.

---

## Aggiornamento urgenzeTot

```js
const urgenzeTot =
  provvisorie.length +
  totalConflicts +
  certScadutiN +
  (certInScad30N > 0 ? 1 : 0) +
  // RIMOSSO: (quoteNonPagateCount > 0 ? 1 : 0)
  squadreBassaPresenza.length +          // Alert A
  (giocatoriBassaPresenza.length > 0 ? 1 : 0) +  // Alert B
  appelliMancanti.length                 // Alert C
```

---

## Ordine degli alert in "Azioni urgenti"

1. Conflitti allenamento/partita (rosso) — esistente
2. Partite provvisorie (amber) — esistente
3. Cert. medici scaduti (rosso) — esistente
4. Cert. in scadenza 30gg (amber) — esistente
5. **[NUOVO] Appelli mancanti** (blu) — Alert C
6. **[NUOVO] Squadre bassa presenza** (arancio) — Alert A
7. **[NUOVO] Giocatori bassa presenza** (arancio chiaro) — Alert B

Gli appelli mancanti per prima perché richiedono azione immediata.

---

## Import da aggiungere

```js
import { subDays } from 'date-fns'  // se non già importato
```

Verificare: `subDays` non è attualmente importato in HomeAdmin.jsx — aggiungere.  
`format` è già importato.

---

## File coinvolti

| File | Modifica |
|---|---|
| `frontend/src/pages/home/HomeAdmin.jsx` | Unico file modificato |

Nessun altro file viene toccato.

---

## Vincoli e edge case

- **Alert A:** se `presenzeScorsa` è vuota (nessun appello registrato la scorsa settimana), nessuna squadra appare → nessun falso positivo.
- **Alert B:** soglia minima di 3 allenamenti registrati per evitare falsi allarmi su giocatori appena iscritti.
- **Alert C:** non mostrare allenamenti di oggi (solo `data < todayStr`) perché l'appello può ancora essere fatto.
- **Performance:** le tre query sono leggere; `staleTime: 5 * 60 * 1000` come per le altre.
