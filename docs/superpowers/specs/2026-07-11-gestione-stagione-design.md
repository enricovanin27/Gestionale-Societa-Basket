# Gestione stagione sportiva e turnover roster — Design

**Data:** 2026-07-11
**Contesto:** l'app sta per essere usata da due società pilota. Serve un modo per passare da una stagione sportiva all'altra (es. 2025/2026 → 2026/2027) senza cancellare lo storico, e per gestire giocatori/allenatori che lasciano o entrano nella società.

## Problema

Oggi il database non ha alcun concetto di "stagione": `squadre`, `calendario`, `presenze_allenamento`, `orario_fisso` e le quote sono tutti dati "correnti", senza un campo che li leghi a un anno sportivo. A fine stagione, senza intervento, i dati della stagione vecchia si mischierebbero con quelli della stagione nuova (calendario, presenze, quote).

Inoltre non esiste un flag di disattivazione per i profili (`allenatore`, `segreteria`, `dirigente`, `genitore`): solo `giocatori.attivo` esiste già. Serve un modo per far "uscire" una persona dalla società senza cancellarne lo storico e senza che possa più accedere all'app.

## Decisioni prese

1. **Non si cancellano dati.** Chi lascia la società viene disattivato (`attivo = false`), non eliminato: lo storico (presenze, pagamenti) resta consultabile e collegato correttamente al nome della persona.
2. **Nessuno storico squadra-per-stagione.** Per i giocatori/allenatori che restano ma cambiano categoria, basta la squadra attuale — non serve poter consultare "in che squadra giocava l'anno scorso".
3. **Passaggio di stagione gestito con una schermata dedicata** ("Nuova Stagione" nel Setup), non modificando i giocatori uno per uno.
4. **Abbonamento/fatturazione restano fuori scope.** Il campo `piano` (`free`/`pro`) su `societa` resta un toggle manuale gestito dal super_admin fuori dall'app; il wizard di cambio stagione non ha alcun collegamento con la fatturazione.

## Modello dati

### Nuove colonne

| Tabella | Colonna | Tipo | Note |
|---|---|---|---|
| `profiles` | `attivo` | `BOOLEAN NOT NULL DEFAULT true` | Copre allenatore, segreteria, dirigente, genitore, giocatore-con-account. |
| `societa` | `stagione_corrente` | `TEXT` | Es. `"2026/2027"`. Stagione di default per i nuovi record di quella società. |
| `presenze_allenamento` | `stagione` | `TEXT` | Valorizzato automaticamente da `societa.stagione_corrente` alla creazione. |
| `quote` (pagamenti) | `stagione` | `TEXT` | Idem. |
| `calendario` | `stagione` | `TEXT` | Idem. |
| `orario_fisso` | `stagione` | `TEXT` | Idem. |

`giocatori.attivo` esiste già e viene riusato senza modifiche. Nessuna colonna `stagione` su `squadre`, `giocatori`, `profiles`, `allenatori` (decisione 2).

### Enforcement accesso (RLS)

Le funzioni helper `get_my_role()` e `get_my_societa_id()` — usate da quasi tutte le policy RLS esistenti — vengono modificate per restituire `NULL` quando `profiles.attivo = false`. Effetto: un profilo disattivato perde automaticamente accesso in lettura/scrittura a tutti i dati protetti da RLS, senza dover toccare le singole policy già scritte.

Per i giocatori con account proprio (`giocatori.user_id`), la disattivazione passa dallo stesso `profiles.attivo` collegato al loro account: un solo flag blocca l'accesso ovunque.

### Frontend

- `useAuth`: dopo il login, controlla `profiles.attivo`. Se `false`, forza il logout e mostra una schermata "Account disattivato, contatta la società" al posto del normale redirect per ruolo.
- Le persone disattivate spariscono dalle liste "correnti" (dropdown squadra, roster attivo, selezione allenatori nel wizard) ma restano referenziate correttamente nei record storici.

## Wizard "Nuova Stagione"

Nuova sezione nel Setup, visibile solo ad admin/super_admin.

1. **Riepilogo squadre**: elenco categorie con conteggio giocatori/allenatori attivi.
2. **Giocatori**: lista di tutti i giocatori attivi, con 3 azioni rapide per ciascuno:
   - *Resta stessa squadra* (default, nessun click)
   - *Cambia squadra* (dropdown categoria)
   - *Ha lasciato* (→ verrà disattivato)
   Ricerca/filtro per nome per roster lunghi.
3. **Allenatori**: stessa logica (resta / cambia squadra assegnata / ha lasciato).
4. **Nuovi arrivi**: link ai form esistenti di creazione giocatore / invito allenatore (non reinventati qui).
5. **Riepilogo finale + conferma**: sommario delle modifiche (es. "12 restano, 2 cambiano categoria, 3 hanno lasciato") prima di applicare. Un click esegue in batch:
   - aggiorna `squadra` sui giocatori/allenatori che cambiano categoria
   - imposta `attivo = false` su chi ha lasciato
   - aggiorna `societa.stagione_corrente` al nuovo valore

Nessuna cancellazione: i dati della stagione precedente restano nel database, taggati con la vecchia `stagione`, non più mostrati per default nelle viste correnti (che filtrano su `stagione_corrente`, con possibilità di consultare lo storico da un selettore stagione).

## Migrazione dati esistenti

Migrazione SQL una tantum:
1. Aggiunge le nuove colonne (`profiles.attivo` default `true`, `stagione` sulle 4 tabelle, `societa.stagione_corrente`).
2. Imposta `stagione_corrente` sulla stagione sportiva corrente per tutte le società esistenti.
3. Valorizza `stagione` sui record storici già presenti con lo stesso valore (nessun dato orfano).
4. Aggiorna `get_my_role()` / `get_my_societa_id()` per il check `attivo`.

Nessuna azione richiesta sulle società pilota fino alla prossima chiusura di stagione; da subito ogni nuovo record (presenza, quota, partita) viene taggato con la stagione corrente.

## Fuori scope

- Fatturazione/abbonamento automatico legato al cambio stagione (resta gestione manuale del campo `piano`).
- Storico squadra-per-stagione per i giocatori (solo squadra attuale).
- Wizard di disattivazione per segreteria/dirigente/genitore (fuori dal flusso "Nuova Stagione"; se serve, si disattivano a mano dal pannello Utenti esistente, riusando la stessa colonna `profiles.attivo`).
