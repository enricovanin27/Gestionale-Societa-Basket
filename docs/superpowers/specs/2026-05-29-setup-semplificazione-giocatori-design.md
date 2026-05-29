# Design: Semplificazione Setup — Wizard Giocatori, Permessi, Cert. Medici, Resoconto

*Data: 29 maggio 2026*

---

## Contesto e problema

Il processo di inserimento giocatori è frammentato e source di errori:
1. Il form attuale è un unico blocco lungo con campi obbligatori e opzionali mescolati
2. Le squadre vengono caricate dai giocatori esistenti (tabella `giocatori`) anziché dalla tabella `squadre` ufficiale → squadre nuove non appaiono
3. Il campo `genitore_user_id` viene inviato come stringa vuota `""` invece di `null` → crash UUID in Supabase
4. Il flusso è spezzato tra segreteria (aggiunge il giocatore) e admin (collega genitore e assegna squadre) → dati incompleti e responsabilità ambigue
5. Dirigenti e genitori non sono considerati nella matrice dei permessi

---

## Decisioni di design

### 1. Separazione netta dei ruoli

| Entità | Admin | Segreteria | Genitore | Allenatore |
|--------|-------|-----------|---------|-----------|
| Squadre | CREA/MODIFICA | legge | — | legge |
| Palestre | CREA/MODIFICA | legge | — | legge |
| Allenatori + account | CREA/INVITA | legge | — | — |
| Preparatori + account | CREA/INVITA | legge | — | — |
| Segreteria + account | CREA/INVITA | — | — | — |
| **Scheda giocatore** | **legge** | **OWNER** | legge (solo figlio) | legge (propria squadra) |
| **Account giocatore** | legge/gestisce | **INVITA** | — | — |
| **Dati contatto genitore** | legge | **OWNER** | modifica (propri dati) | — |
| **Account genitore** | legge/gestisce | **INVITA** (solo dal wizard) | È lui | — |
| Quote/Pagamenti | legge | OWNER | legge (proprie rate) | — |
| Certificati medici | legge | OWNER | — | legge (propria squadra) |

**Principio guida:** Admin = struttura del club (squadre, palestre, staff). Segreteria = famiglie (giocatori, genitori, pagamenti, certificati). I due domini non si toccano operativamente.

**Nota:** I `dirigenti` sono esclusi dallo scope attuale (decisione consapevole, da rivalutare in futuro).

### 2. Wizard inserimento giocatore — 3 step

Sostituisce completamente il vecchio `GiocatoreForm` per la creazione. La modifica di giocatori esistenti usa ancora un form (non wizard), ma con gli stessi fix tecnici.

#### Step 1 — Squadra e iscrizione
Campi:
- Squadra principale * (dropdown da tabella `squadre` ufficiale)
- Squadra 2 (dropdown, opzionale)
- Squadra 3 (dropdown, opzionale)
- N° maglia (opzionale, numerico)
- Data iscrizione (opzionale)

**Rationale:** La segreteria pensa "sto aggiungendo Marco all'U13" — la squadra è il primo contesto mentale.

#### Step 2 — Anagrafica e certificato medico
Campi:
- Cognome *, Nome *
- Data di nascita, Luogo di nascita (opzionali)
- Codice fiscale (opzionale)
- Indirizzo, Città, CAP, Provincia (opzionali)
- Scadenza certificato medico (opzionale)

**Rationale:** I dati anagrafici completi possono essere inseriti dopo la creazione iniziale, o completati dal genitore stesso.

#### Step 3 — Genitore e account app (opzionale)
**Sezione dati contatto:**
- Cognome genitore, Nome genitore
- Codice fiscale genitore
- Telefono, Email genitore

**Sezione account app (3 opzioni radio):**

1. **Invia invito email** *(default consigliato)*
   - L'email viene pre-compilata dall'email genitore inserita sopra
   - Al salvataggio: crea invito via `InvitaUtenteForm` con ruolo `genitore`, collega automaticamente al giocatore
   - Il genitore riceve email con link per creare la password

2. **Collega account esistente**
   - Dropdown degli utenti con ruolo `genitore` già presenti nella società
   - Utile se un genitore ha già un figlio registrato

3. **Salta — aggiungi account in seguito**
   - Salva il giocatore senza account genitore (`genitore_user_id = null`)
   - Nessun crash UUID

**Pulsanti azione nel footer dello step 3:**
- "← Indietro"
- "Salva giocatore e invia invito" (se opzione 1 o 2)
- "Salva senza account" (se opzione 3)

### 3. Fix tecnici inclusi

1. **UUID bug**: `genitore_user_id` inviato come `null` invece di `""` quando non selezionato — sia nel wizard che nel form di modifica
2. **Squadre da tabella ufficiale**: Tutte le dropdown di squadra nel wizard usano `queryKey: ['squadre-segreteria', societaId]` che legge dalla tabella `squadre`, non dai giocatori esistenti. Fix anche nel form di modifica.

### 4. Resoconto → fondo QuotePage

Il componente `ResocontoPage` viene rimosso come pagina standalone e integrato come **sezione collapsible** in fondo a `QuotePage` (vista lista squadre), accessibile solo quando nessuna squadra è selezionata.

- Il link di navigazione "Resoconto" nella sidebar viene rimosso
- La sezione è espandibile/collassabile con toggle
- Il titolo diventa "Riepilogo mensile" per chiarire il contesto

**Rationale:** Quote e resoconto parlano della stessa cosa (pagamenti). Tenerli separati crea navigazione ridondante.

### 5. Nuova pagina: Panoramica certificati medici per squadra

Modellata su `QuotePage` (stessa struttura lista squadre → drill-down):

- **Vista lista squadre**: card per squadra con badge colorati (es. "3 scaduti", "2 in scadenza 30gg", "In ordine ✓")
- **Vista drill-down squadra**: lista giocatori con stato certificato (scaduto/in scadenza/ok/N.D.), cliccabile per navigare alla scheda del giocatore
- Fonte dati: `giocatori.cert_medico_scadenza` + stessa logica `certStatus()` già usata in `GiocatoriPage`
- Route: `/secretary/certificati`
- Navigazione: aggiunta alla sidebar segreteria e al mobile bottom nav

### 6. Checklist primo avvio per l'admin (opzionale, bassa priorità)

Una sezione informativa in cima alla SetupPage che mostra i passi di configurazione iniziale:
1. Aggiungi le squadre del club
2. Aggiungi le palestre
3. Aggiungi gli allenatori e assegnali
4. Invita la segreteria

Si nasconde automaticamente quando tutti i passi sono completati (squadre > 0, palestre > 0, allenatori > 0, utenti segreteria > 0).

---

## Scope — cosa NON è incluso

- Pagamento online (Stripe) — fuori scope
- App nativa / PWA migliorata — fuori scope
- Ruolo dirigente — esplicitamente escluso per ora
- Genitore che modifica i propri dati di contatto — possibile futuro miglioramento
- Admin che modifica schede giocatore — intenzionalmente rimosso (legge solo)

---

## File coinvolti (stima)

| File | Tipo di modifica |
|------|-----------------|
| `frontend/src/pages/secretary/GiocatoreForm.jsx` | Fix UUID + fix dropdown squadre |
| `frontend/src/pages/secretary/GiocatoriPage.jsx` | Sostituisce modal con wizard |
| `frontend/src/pages/secretary/GiocatoreWizard.jsx` | **NUOVO** — wizard 3 step |
| `frontend/src/pages/secretary/QuotePage.jsx` | Aggiunge sezione Resoconto in fondo |
| `frontend/src/pages/secretary/ResocontoPage.jsx` | Rimossa dalla navigazione (mantiene il file) |
| `frontend/src/pages/secretary/CertificatiPage.jsx` | **NUOVO** — panoramica cert. per squadra |
| `frontend/src/pages/home/shared.jsx` | Aggiorna navigazione sidebar/mobile |
| `frontend/src/App.jsx` o router | Aggiunge route `/secretary/certificati`, rimuove `/secretary/resoconto` |

---

## Considerazioni architetturali

- Il wizard usa lo stesso hook `useAuth()` e lo stesso client Supabase del resto dell'app
- L'invito genitore dal wizard richiama la stessa logica di `InvitaUtenteForm` — da estrarre in un hook `useInvitaUtente()` condiviso per evitare duplicazione
- Le squadre vengono sempre caricate da `['squadre-segreteria', societaId]` — query già esistente, serve solo usarla coerentemente
- `CertificatiPage` può condividere la funzione `certStatus()` già definita in `GiocatoriPage` — da spostare in `utils/certStatus.js`
