# Design: Admin Setup Hub + Segreteria Wizard Fix

**Data:** 2026-05-30  
**Stato:** Approvato  
**Scope:** Admin Setup Hub page, Utenti configurati inline, Doppio Campionato modal, GiocatoreWizard step 1 nome/cognome, InvitaUtenteForm auto-squadra genitore, fix messaggio errore email

---

## 1. Contesto e obiettivi

### Problema attuale
- `SetupMenu.jsx` (admin) è un menu di navigazione che porta a tab di `SetupPage.jsx`. Non c'è un flusso rapido per le azioni più comuni (invitare un allenatore, aggiungere una squadra).
- `GiocatoreWizard.jsx` (segreteria) chiede prima la squadra (step 1) — il dato meno urgente — e non permette di salvare il giocatore con solo nome e cognome.
- `InvitaUtenteForm.jsx` quando si invita un genitore collegandolo a un giocatore, richiede ancora di selezionare manualmente la squadra del figlio.
- Il bug `Error sending mail` restituisce un messaggio generico e incomprensibile.

### Obiettivi
1. Trasformare il Setup Admin in una hub page con modali inline (pattern identico a `SegreteriaSetupPage`).
2. Aggiungere un modal "Doppio Campionato + Giocatori" che crea la coppia e i giocatori in un'unica operazione.
3. Mostrare gli utenti configurati inline nella hub con UX migliorata (ruoli cliccabili → squadre).
4. Ristrutturare `GiocatoreWizard`: step 1 = nome/cognome, salvataggio immediato possibile.
5. Auto-popolare la squadra genitore quando si collega a un giocatore esistente.
6. Messaggio di errore utile quando Supabase non ha SMTP configurato.

---

## 2. Admin Setup Hub (`AdminSetupPage.jsx`)

### File
- **Nuovo:** `frontend/src/pages/admin/AdminSetupPage.jsx`
- **Modificato:** routing in `App.jsx` — la route `/admin/setup` (o equivalente) punta al nuovo componente invece di `SetupMenu`
- **Invariato:** `SetupPage.jsx` rimane per le tab avanzate (`/admin/setup/settimana_tipo`, `/admin/setup/utenti`)

### Struttura della pagina

```
AppHeader (titolo "Setup", sottotitolo = societaNome)

Gruppo: 🏢 STRUTTURA SOCIETARIA
  Card: Aggiungi palestra    → apre modal PalestraModal
  Card: Aggiungi squadra     → apre modal SquadraModal

Gruppo: 👤 STAFF
  Card: Nuovo Allenatore     → apre modal con InvitaUtenteForm(['allenatore'])
  Card: Nuovo Preparatore    → apre modal con InvitaUtenteForm(['preparatore_atletico'])
  Card: Invita Segreteria    → apre modal con InvitaUtenteForm(['segreteria'])

Gruppo: 🛠 STRUMENTI
  Card: Configura Settimana Tipo    → naviga a /admin/setup/settimana_tipo
  Card: Doppio Campionato           → apre modal DoppioGiocatoriModal

Sezione inline: UTENTI CONFIGURATI
  (lista utenti compatta, vedi §4)
```

### Card design
Stessa struttura di `SegreteriaSetupPage`: icona in box colorato (amber), titolo, descrizione, chevron. Le card che aprono modal mostrano la stessa chevron di quelle che navigano — l'utente non deve distinguere.

---

## 3. Modali Staff

### 3a. PalestraModal (estratto da `PalestreTab`)
- Form: nome (required), tipo (Principale/Secondaria/Altra), solo_allenamento toggle, orari per giorno (toggle attivo + ora_inizio + ora_fine)
- Submit: INSERT in `palestre` con `societa_id`
- Invalida: `['palestre']`

### 3b. SquadraModal
- Form: un solo campo `categoria` (required)
- Submit: INSERT in `squadre` con `societa_id`
- Invalida: `['squadre-table']`, `['squadre-nomi']`, `['squadre-segreteria', societaId]`

### 3c. Modal Invita Allenatore / Preparatore / Segreteria
- Usa `InvitaUtenteForm` con `ruoliConsentiti` pre-impostato al singolo ruolo → il select ruolo non compare
- Il fix bug email (§6) si applica qui

---

## 4. Modal Doppio Campionato + Giocatori (`DoppioGiocatoriModal`)

### Form

**Sezione 1 — Coppia di squadre**
- `squadra_a`: select tra squadre della società (required)
- `squadra_b`: select tra squadre della società, esclude `squadra_a` (required)
- Se la coppia esiste già in `doppio_campionato` → mostra avviso informativo "Coppia già esistente — verranno solo aggiunti i giocatori". La verifica avviene lato client prima del salvataggio (query `doppio_campionato` al mount del modal). L'INSERT viene saltato con `ON CONFLICT DO NOTHING` come garanzia aggiuntiva lato DB (se esiste un unique constraint) oppure omesso se la coppia è già rilevata lato client.

**Sezione 2 — Giocatori**
- Lista dinamica di righe: ogni riga ha `cognome` + `nome` (entrambi text input)
- Bottone "+ Aggiungi giocatore" aggiunge una riga vuota
- Bottone × su ogni riga la rimuove (min 1 riga sempre presente)

### Logica salvataggio
```
1. Se coppia (squadra_a, squadra_b) non esiste in doppio_campionato:
     INSERT doppio_campionato { squadra_a, squadra_b, societa_id }
2. Per ogni riga con cognome.trim() non vuoto:
     INSERT giocatori {
       cognome, nome, squadra: squadra_a, squadra2: squadra_b,
       societa_id, attivo: true,
       genitore_user_id: null
     }
3. Invalida: ['doppio-campionato'], ['segreteria-giocatori', societaId]
```

### Gestione errori
- Se la coppia esiste già → non fallisce, continua a inserire i giocatori
- Se un giocatore fallisce → mostra errore ma non blocca gli altri (inserimento best-effort con lista degli errori)

---

## 5. Sezione Utenti Configurati (inline nella hub)

### Dati caricati
- `profiles` escludendo `super_admin`, `giocatore`, `genitore` (solo staff)
- `allenatori` per le squadre capo/vice
- `prep_squadre` per le squadre preparatori

### Card utente
```
[avatar iniziali]  Nome Cognome
                   email@...
[Admin] [Allenatore ▾] [+Segreteria]
         ↓ click su badge con ▾
         Capo: U13, U15  |  Vice: U18
```

- Badge ruolo primario: non cliccabile, mostra il ruolo
- Badge ruolo extra (`ruoli_extra`): con freccia ▾, click espande accordion con le squadre associate
- Bottoni `+Ruolo`: aggiungono ruoli extra. Opzioni disponibili: `['allenatore', 'preparatore_atletico', 'segreteria', 'dirigente']` — **mai `giocatore` o `genitore`**
- Chip squadre: interattivi (click toggle), stessa logica di `UtentiTab` esistente
- **Nessun bottone elimina/disabilita**: rimane solo in `UtentiTab` avanzata (`/admin/setup/utenti`)
- Ordinamento: admin → allenatori → preparatori → segreteria → dirigenti

### Queries
- `useQuery(['setup-utenti-staff', societaId])` — variante filtrata per ruolo non in ['giocatore','genitore','super_admin']
- Stesso pattern mutation di `UtentiTab` per ruoli_extra e squadre

---

## 6. Fix bug "Error sending mail"

In `InvitaUtenteForm.jsx` nel blocco `catch`:

```js
catch (e) {
  // Messaggio utile per errore SMTP Supabase
  if (e.message?.toLowerCase().includes('sending mail') ||
      e.message?.toLowerCase().includes('smtp')) {
    setErr(
      'Impossibile inviare l\'email di invito. ' +
      'Configura un provider SMTP su Supabase Dashboard → Settings → Auth → SMTP Settings.'
    )
  } else {
    setErr(e.message)
  }
}
```

---

## 7. GiocatoreWizard — Ristrutturazione step

### Nuovo ordine step

| # | Label | Contenuto | Salvataggio |
|---|-------|-----------|-------------|
| 1 | Nome | Cognome *, Nome *, Squadra principale (opz.) | INSERT → ottieni ID → puoi chiudere O continuare |
| 2 | Squadre | Squadra2, Squadra3, N° maglia, Data iscrizione | UPDATE su ID |
| 3 | Anagrafica | Data nascita, luogo, CF, indirizzo, città, CAP, provincia, cert. medico | UPDATE su ID |
| 4 | Genitore | Nome/cognome/CF/tel/email genitore + account option (invite/link/skip) | UPDATE + gestione account |

### Architettura
- Step 1 fa `INSERT` e salva `giocatoreId` nello stato del wizard
- Step 2-4 fanno `UPDATE giocatori SET ... WHERE id = giocatoreId`
- Se l'utente chiude dopo step 1: il giocatore esiste già, verrà visto nella lista e completabile in seguito (da `GiocatoreDetail`)
- Se il wizard viene annullato PRIMA di step 1 (nessun INSERT ancora): non rimane nulla

### Bottoni step 1
- `Annulla` → chiude senza salvare
- `Salva` → INSERT, invalida cache, chiude modal
- `Salva e continua →` → INSERT, invalida cache, avanza a step 2

### StepIndicator
Labels: `['Nome', 'Squadre', 'Anagrafica', 'Genitore']`

### Validazione step 1
- `cognome.trim()` non vuoto E `nome.trim()` non vuoto → abilitano "Salva" e "Salva e continua"

---

## 8. InvitaUtenteForm — Auto-squadra genitore

### Comportamento attuale
Quando `ruolo === 'genitore'` e si seleziona un giocatore: i campi `genitore_squadra` / `genitore_squadra2` / `genitore_squadra3` restano visibili e vuoti.

### Nuovo comportamento
- Quando `giocatoreId` viene selezionato (e `ruolo === 'genitore'`):
  - I select manuali `genitore_squadra*` vengono nascosti
  - `form.genitore_squadra` = `giocatore.squadra`
  - `form.genitore_squadra2` = `giocatore.squadra2 ?? ''`
  - `form.genitore_squadra3` = `giocatore.squadra3 ?? ''`
  - Appare nota: *"Squadra impostata automaticamente da: [cognome] [nome] ([squadra])"*
- Se si deseleziona il giocatore → valori resettati a `''`, select manuali riappaiono

### Implementazione
Usare `useEffect` (o handler inline nell'`onChange` del select giocatore) che aggiorna il form quando `giocatoreId` cambia.

---

## 9. File coinvolti (sommario)

| File | Azione |
|------|--------|
| `frontend/src/pages/admin/AdminSetupPage.jsx` | NUOVO |
| `frontend/src/pages/admin/SetupMenu.jsx` | RIMOSSO (sostituito da AdminSetupPage) |
| `frontend/src/pages/SetupPage.jsx` | Invariato (tab avanzate rimangono) |
| `frontend/src/components/InvitaUtenteForm.jsx` | Fix auto-squadra genitore + fix messaggio errore email |
| `frontend/src/pages/secretary/GiocatoreWizard.jsx` | Ristruttura step 1 (nome/cognome first + salva immediato) |
| `frontend/src/App.jsx` | Aggiorna route admin setup per usare AdminSetupPage |

---

## 10. Comportamenti fuori scope

- Eliminazione/disabilitazione utenti → rimane in `UtentiTab` avanzata
- Gestione full CRUD palestre/squadre (modifica, elimina) → rimane in `SetupPage`
- Invitare genitori o giocatori dall'Admin Setup → non previsto (è compito della segreteria)
- Migrazione dati esistenti → non necessaria
