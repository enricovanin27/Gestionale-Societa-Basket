# Role Dashboards Redesign — Design Spec
**Data:** 2026-05-09  
**Stato:** Approvato per pianificazione  

---

## Obiettivo

Passare dall'architettura attuale (stessa shell, contenuti diversi per ruolo) a **dashboard dedicate con namespace di routing per ogni ruolo**. Ogni ruolo vede solo le funzionalità che gli appartengono, con navigazione e home su misura.

---

## Architettura scelta

**Namespace per ruolo, migrazione incrementale.**

Ogni ruolo ottiene un prefisso URL dedicato con il proprio layout e la propria configurazione di navigazione. La migrazione avviene un ruolo alla volta, partendo dal più semplice, per minimizzare il rischio.

```
/parent/*     → Genitore
/player/*     → Giocatore
/secretary/*  → Segreteria
/coach/*      → Allenatore
/admin/*      → Admin / Dirigente
/platform     → Super Admin (già separato, invariato)
```

La route `/` redirige al namespace del ruolo attivo (`activeRole`). Le route vecchie (`/bacheca`, `/setup`, ecc.) reindirizzano al namespace corretto durante il periodo di transizione.

---

## Ordine di migrazione

| # | Ruolo | Motivo |
|---|-------|--------|
| 1 | Genitore | Meno pagine, zero rischio su funzionalità critiche, ottimo test case |
| 2 | Giocatore | Simile al genitore, aggiunge solo statistiche personali |
| 3 | Segreteria | Già abbastanza isolata, riorganizzazione logica del routing |
| 4 | Allenatore | Presenze è la nuova funzionalità più complessa |
| 5 | Admin | Il più complesso, tocca più codice esistente |

---

## Design per ruolo

### 1. Genitore — `/parent/*`

**Home (`/parent`):** Agenda famiglia unificata. Tutti gli eventi di tutti i figli in un'unica lista cronologica (14 giorni), con un badge colorato per figlio che distingue a chi appartiene ogni evento. Un genitore con un solo figlio vede lo stesso layout senza badge.

**Navigazione:**
```
🏠 Home  |  💰 Quote  |  🔔 Bacheca
```

**Pagine:**

| Route | Componente | Stato |
|-------|-----------|-------|
| `/parent` | `HomeGenitore` — agenda multi-figlio con badge | Evolve |
| `/parent/quote` | `QuoteGenitore` — lista quote read-only con scadenze e istruzioni pagamento (IBAN/segreteria) | **NUOVO** |
| `/parent/bacheca` | `BachecaPage` — solo lettura, vede annunci della propria squadra + tutta società | Esiste |

**Note:** Il genitore non può segnare quote come pagate — solo la segreteria può farlo. Vede scadenza, importo, e istruzioni su come pagare.

---

### 2. Giocatore — `/player/*`

**Home (`/player`):** Programma personale della settimana — allenamenti e partite della propria squadra. Nessun badge: il giocatore vede solo i propri eventi.

**Navigazione:**
```
🏠 Home  |  📊 Statistiche  |  🔔 Bacheca
```

**Pagine:**

| Route | Componente | Stato |
|-------|-----------|-------|
| `/player` | `HomeGiocatore` — programma settimana, prossima partita (split da `HomeGenitore`, oggi non esiste come componente separato) | **NUOVO** |
| `/player/statistiche` | `StatisticheGiocatore` — % presenze stagionali, allenamenti totali, partite giocate (calcolate dalle presenze registrate dall'allenatore) | **NUOVO** |
| `/player/bacheca` | `BachecaPage` — solo lettura, vede annunci della propria squadra + tutta società | Esiste |

**Note:** Le statistiche del giocatore sono derivate dalla tabella `presenze` che l'allenatore compila. Se nessuna presenza è ancora registrata, la pagina mostra uno stato vuoto.

---

### 3. Segreteria — `/secretary/*`

**Home (`/secretary`):** Dashboard urgenze. Lista prioritaria di cert. medici scaduti o in scadenza entro 30 giorni + quote non pagate scadute. Ogni voce è cliccabile per arrivare direttamente al giocatore o alla quota.

**Navigazione:**
```
🏠 Dashboard  |  👥 Giocatori  |  💰 Quote  |  🔔 Bacheca
```

**Pagine:**

| Route | Componente | Stato |
|-------|-----------|-------|
| `/secretary` | `SegreteriaDashboard` — KPI urgenti (cert scaduti, cert in scadenza, quote aperte) + lista priorità alta | Evolve |
| `/secretary/giocatori` | Tab giocatori di `SegreteriePage` — lista con cert. medico, modifica inline, filtro squadra | Esiste |
| `/secretary/quote` | Tab quote di `SegreteriePage` — mark as pagato, filtro stato | Esiste |
| `/secretary/bacheca` | `BachecaPage` — legge e **scrive** annunci, può scrivere a tutte le squadre | Esiste |

---

### 4. Allenatore — `/coach/*`

**Home (`/coach`):** Prossima gara della squadra selezionata + allenamenti questa settimana e la prossima. Se l'allenatore gestisce più squadre, selettore squadra nell'header.

**Navigazione:**
```
🏠 Home  |  📅 Calendario  |  ✅ Presenze  |  📊 Statistiche  |  🔔 Bacheca
```

**Pagine:**

| Route | Componente | Stato |
|-------|-----------|-------|
| `/coach` | `HomeAllenatore` — prossima gara + allenamenti settimana | Esiste |
| `/coach/calendario` | `CalendarioPage` — filtrata per le proprie squadre | Esiste |
| `/coach/presenze` | `PresenzePage` — roll call manuale (vedi sotto) | **NUOVO** |
| `/coach/statistiche` | `StatistichePage` — statistiche squadra, % presenze per giocatore | Esiste |
| `/coach/bacheca` | `BachecaPage` — legge e **scrive** annunci, può scrivere solo alla/e propria/e squadra/e | Esiste |

**Dettaglio `PresenzePage`:**
- L'allenatore seleziona un allenamento dalla lista degli allenamenti recenti/futuri della propria squadra
- Vede la lista completa dei giocatori della squadra
- Tap su ciascun giocatore: cicla tra Presente ✓ / Assente ✗
- Bottone "Salva presenze" — scrive su tabella `presenze` (nuova, da creare)
- Se le presenze per quell'allenamento esistono già, le mostra pre-compilate (modifica possibile)

**Schema tabella `presenze`:**
```sql
presenze (
  id uuid,
  allenamento_id uuid references orario_settimana(id),
  giocatore_id   uuid references giocatori(id),
  presente       boolean,
  societa_id     uuid,
  created_at     timestamptz
)
```

---

### 5. Admin — `/admin/*`

**Home (`/admin`):** Dashboard operativa con KPI della società (squadre attive, cert. scaduti, partite del mese, quote non pagate, partite provvisorie) + sezione alert urgenti (conflitti allenamenti/partite, partite da confermare, doppio campionato).

**Navigazione:**
```
🏠 Dashboard  |  🏀 Partite  |  🏋️ Allenamenti  |  👥 Persone  |  ⚙️ Setup  |  🔔 Bacheca
```

**Pagine:**

| Route | Componente | Stato |
|-------|-----------|-------|
| `/admin` | `HomeAdmin` — KPI cards + alert urgenti (conflitti, provvisorie, doppio camp.) | Evolve |
| `/admin/partite` | `CalendarioPage` — tutte le partite, partite provvisorie, conflitti | Evolve |
| `/admin/allenamenti` | `AllenamentiPage` — orario allenamenti tutte le squadre | Esiste |
| `/admin/persone` | `AdminPersone` — panoramica giocatori con `cert_medico_scadenza` da tabella `giocatori` (read + link a segreteria se serve) | **NUOVO** |
| `/admin/setup` | `SetupPage` (redesignata, vedi sotto) | Evolve |
| `/admin/bacheca` | `BachecaPage` — legge e **scrive** annunci, può scrivere a tutte le squadre | **Aggiunta** (mancava) |

---

## Bacheca — Permessi per ruolo

| Ruolo | Legge | Scrive | Destinatari |
|-------|-------|--------|-------------|
| Admin | Tutto | ✓ | Tutte le squadre / tutta la società |
| Allenatore | Tutto | ✓ | Solo la/e propria/e squadra/e |
| Segreteria | Tutto | ✓ | Tutte le squadre / tutta la società |
| Genitore | Solo propria squadra + tutta società | ✗ | — |
| Giocatore | Solo propria squadra + tutta società | ✗ | — |

**Visibilità annunci:** un annuncio ha un campo `target` che può essere `all` (tutta la società) o `squadra:<nome>` (solo quella squadra). Genitore/giocatore vedono solo annunci `all` + annunci per la/e propria/e squadra/e.

---

## Setup redesign — `/admin/setup`

**Struttura:** menu a sezioni stile iOS Settings. La home mostra 3 gruppi di voci, ogni voce apre una sub-pagina dedicata con back button.

**Principio chiave:** Setup = configurazione della struttura. Le operazioni quotidiane (cert. medico, presenze, quote tracking) vivono nei namespace operativi, non qui.

```
⚙️ Setup

  👥 PERSONE
    ├── Giocatori          (anagrafica, assegnazione squadre)
    ├── Allenatori         (profili, assegnazione squadre)
    └── Utenti & Accessi   (inviti, ruoli, reset password)

  🏢 STRUTTURA SOCIETARIA
    ├── Squadre            (categorie e nomi)
    ├── Palestre           (sedi, orari disponibilità)
    └── Società            (nome, info generali, stagione)

  🛠 STRUMENTI & CONFIGURAZIONE
    ├── Tipologie Quote    (configura template iscrizione, mensile, ecc.)
    ├── Scheduling         (suggeritore automatico orari allenamenti)
    └── Doppio Campionato  (squadre con giocatori in comune)
```

**Spostamenti rispetto all'attuale:**
- `Quote tracking` (chi ha pagato) → `/secretary/quote`
- `Cert. medico` → `/secretary/giocatori`
- `Presenze` → `/coach/presenze`
- `Vista giocatori per admin` → `/admin/persone`

---

## Componenti invariati (riuso diretto)

Questi componenti esistono, funzionano, e vengono semplicemente "montati" nei nuovi namespace senza modifiche:

- `BachecaPage` — riusata in tutti i namespace (con piccola variante: mostra/nasconde pulsante scrivi)
- `AllenamentiPage` — riusata in `/admin/allenamenti`
- `CalendarioPage` — riusata in `/admin/partite` e `/coach/calendario`
- `LoginPage`, `PlatformPage` — invariati
- `ImportaCalendarioPage` — resta su `/importa` (accesso da menu allenatore)
- Tab di `SegreteriePage` (giocatori, quote) — riusate in `/secretary/giocatori` e `/secretary/quote`

---

## Nuove tabelle DB

| Tabella | Scopo | Campo chiave |
|---------|-------|-------------|
| `presenze` | Presenze agli allenamenti registrate dall'allenatore | `allenamento_id`, `giocatore_id`, `presente`, `societa_id` |

Il campo `target` sugli annunci (`bacheca` / `annunci`) va aggiunto se non esiste già: `target text default 'all'` — valori: `'all'` o `'squadra:<nome>'`.

---

## Riepilogo funzionalità nuove

| Funzionalità | Route | Chi la usa | Dipendenze DB |
|---|---|---|---|
| Presenze roll call | `/coach/presenze` | Allenatore | Nuova tabella `presenze` |
| Quote read-only | `/parent/quote` | Genitore | Tabella `quote` esistente |
| Statistiche personali | `/player/statistiche` | Giocatore | Tabella `presenze` (nuova) |
| Agenda famiglia multi-figlio | `/parent` | Genitore | Nessuna (logica frontend) |
| Dashboard urgenze | `/secretary` | Segreteria | Tabelle `giocatori`, `quote` esistenti |
| Persone admin | `/admin/persone` | Admin | Tabella `giocatori` esistente (campo `cert_medico_scadenza`) |
| Bacheca admin | `/admin/bacheca` | Admin | Tabella annunci con campo `target` |
| Setup a sezioni | `/admin/setup` | Admin | Nessuna (refactor UI) |
