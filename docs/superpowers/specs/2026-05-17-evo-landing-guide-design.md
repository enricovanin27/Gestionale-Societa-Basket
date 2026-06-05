# EVO — Landing Page + Guida In-App: Design Spec

**Data:** 2026-05-17  
**Stato:** Approvato  

---

## Panoramica

Due funzionalità distinte da aggiungere all'app gestionale basket **EVO**:

1. **Landing page pubblica** — pagina introduttiva visibile prima del login, con presentazione del prodotto, sezione login e sezione registrazione società.
2. **Guida in-app** — drawer contestuale accessibile da ogni pagina autenticata tramite bottone "?" fisso.

---

## 1. Landing Page

### Approccio architetturale

**Approccio A (scelto):** la route `/` diventa pubblica. In `AppShell`, quando l'utente non è autenticato viene mostrato `LandingPage` invece di rimandare a `/login`. La route `/login` resta invariata per i link diretti (es. email di reset password). Gli utenti autenticati che visitano `/` continuano a essere reindirizzati al loro ruolo come ora.

### Route

| Route | Componente | Accesso |
|-------|-----------|---------|
| `/` | `LandingPage` (nuovo) | Pubblico — se autenticato → redirect ruolo |
| `/login` | `LoginPage` (esistente) | Pubblico |
| `/registrati` | `RegistrazionePage` (nuovo) | Pubblico |

### Struttura visiva

Pagina scrollabile, mobile-first (max-width 448px). Alternanza **gradient amber** ↔ **bianco** con bordi di separazione visibili (`2px solid #fbbf24` sulle sezioni bianche, `2px solid #92400e` sulle amber).

#### Navbar (sticky)
- Logo `🏀 EVO` a sinistra
- Bottone outline "Accedi" (scrolla a `#login`) + bottone solid "Inizia gratis" (va a `/registrati`) a destra
- Sfondo bianco con bordo bottom amber `2px solid #d97706`

#### Sezioni in ordine

| # | Sezione | Sfondo | Contenuto |
|---|---------|--------|-----------|
| 1 | Hero | Gradient amber | Headline, sottotitolo, 2 CTA, preview app |
| 2 | Il problema | Bianco | 4 pain point con bordo rosso a sinistra |
| 3 | La soluzione | Gradient amber | 6 feature card 2×3 |
| 4 | Perché sceglierci | Bianco | 4 value prop numerati |
| 5 | Multi-ruolo | Gradient amber | 5 chip ruoli |
| 6 | Accedi | Bianco | Form login inline (riusa logica di `LoginPage`) |
| 7 | Registra la tua società | Gradient amber | CTA → `/registrati` |
| 8 | Footer | Bianco | Logo + copyright |

#### Testi chiave

**Hero headline:** "Il tuo club. Finalmente organizzato."  
**Hero subheadline:** "EVO è l'app che semplifica la gestione della tua società: calendari, presenze, giocatori e comunicazioni — tutto in un posto."

**Pain point:**
- Calendari su Excel o carta
- WhatsApp come canale ufficiale
- Presenze segnate su carta
- Documenti e quote disorganizzati

**Feature:**
- Calendario integrato (FIP + allenamenti)
- Presenze digitali
- Portale famiglie
- Bacheca ufficiale
- Segreteria digitale
- Report & statistiche

**Value prop:**
1. Zero formazione necessaria
2. Un ruolo per ogni persona
3. Calendario FIP già integrato
4. I tuoi dati sono tuoi

---

## 2. Registrazione Società (con approvazione)

### Flusso

```
Utente compila form → submit
  → crea societa (stato='pending', + campi referente salvati sulla riga)
  → nessun account Supabase Auth creato ancora
  → mostra schermata conferma

Super admin vede badge "In attesa" in PlatformPage > tab Società
  → clicca "Approva"
    → apre modal "Invita Admin" pre-compilato con i dati del referente
    → crea account Supabase Auth + profilo (flusso esistente in AmministratoriTab)
    → UPDATE societa SET stato='attiva'
  → oppure "Rifiuta"
    → DELETE societa (nessun profilo da eliminare)
```

L'approvazione riutilizza il flusso "Invita Admin" già esistente in `PlatformPage`,
evitando duplicazioni di logica. Il super_admin imposta la password iniziale come già fa oggi.

### Route e componente

- **Route:** `/registrati` — componente `RegistrazionePage` (nuovo file `src/pages/RegistrazionePage.jsx`)
- Stile coerente con `LandingPage` (sfondo amber gradient, card bianca centrale)

### Campi del form

| Campo | Tipo | Obbligatorio |
|-------|------|-------------|
| Nome società | text | Sì |
| Nome referente | text | Sì |
| Cognome referente | text | Sì |
| Email (futuro account admin) | email | Sì |
| Città | text | No |

Nessuna password nel form — viene generata e comunicata dal super_admin dopo l'approvazione (flusso manuale attuale, invariato).

### Schermata di conferma

Dopo il submit: card con messaggio  
*"Richiesta inviata! Il nostro team attiverà il tuo account entro 24 ore. Ti contatteremo all'indirizzo [email]."*  
Bottone "Torna alla home" → `/`

### Modifiche DB

```sql
ALTER TABLE societa ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'attiva';
ALTER TABLE societa ADD COLUMN IF NOT EXISTS ref_nome TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS ref_cognome TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS ref_email TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS ref_citta TEXT;
-- Le società esistenti restano 'attiva'; le nuove registrazioni partono da 'pending'
```

Campi `ref_*` memorizzano i dati del referente per pre-compilare il form di invito al momento dell'approvazione.

### Modifiche PlatformPage

- Tab **Società**: badge `In attesa` (arancione) sulle card con `stato='pending'`
- Bottone "Approva" → apre modal "Invita Admin" pre-compilato con `ref_nome`, `ref_cognome`, `ref_email` e la società già selezionata → al salvataggio esegue anche `UPDATE societa SET stato='attiva'`
- Bottone "Rifiuta" → `DELETE societa` (nessun profilo da eliminare)
- Contatore dashboard: aggiungere stat card "In attesa"

---

## 3. Guida In-App (Bottom Sheet)

### Componente `GuideDrawer`

Nuovo componente `src/components/GuideDrawer.jsx` con:
- **Bottone "?"** — `position: fixed`, `bottom: 80px`, `right: 16px`, cerchio amber 44×44px, `z-index: 200`
- **Bottom sheet** — pannello che sale dal basso con animazione `transform: translateY(100%) → translateY(0)`, altezza `70vh`, `border-radius: 16px 16px 0 0`, bordo top `2px solid #d97706`
- **Backdrop** semitrasparente al click per chiudere
- **Header** del drawer: titolo della sezione corrente + bottone `✕`
- **Corpo**: lista di sotto-sezioni con titolo in grassetto e testo descrittivo

### Integrazione nei layout

`GuideDrawer` viene aggiunto in coda a tutti e 5 i layout:

```jsx
// es. AdminLayout.jsx
import GuideDrawer from '../components/GuideDrawer'
// ...
return (
  <>
    <AppHeader />
    <Outlet />
    <BottomNav />
    <GuideDrawer />   {/* ← aggiunto */}
  </>
)
```

### File contenuto `src/data/guide.json`

```json
{
  "/admin": {
    "titolo": "Home Admin",
    "sezioni": [
      { "titolo": "Panoramica", "testo": "La home mostra un riepilogo delle attività recenti della società." }
    ]
  },
  "/admin/calendario": {
    "titolo": "Calendario",
    "sezioni": [
      { "titolo": "Navigare le settimane", "testo": "Usa le frecce ‹ › per spostarti di settimana in settimana." },
      { "titolo": "Aggiungere un evento", "testo": "Tocca il tasto + in alto a destra per creare un allenamento o una partita." }
    ]
  }
}
```

La route viene letta con `useLocation()`. Se non esiste una chiave corrispondente, viene mostrato:  
*"Nessuna guida disponibile per questa pagina."*

Per aggiornare i testi basta modificare `guide.json` — nessun cambiamento al codice React.

### Route matching

`useLocation().pathname` viene confrontato con le chiavi di `guide.json`. Per gestire route con parametri dinamici (es. `/secretary/giocatori/123`), si normalizza il path rimuovendo l'ultimo segmento se numerico.

---

## File da creare / modificare

| File | Azione |
|------|--------|
| `src/App.jsx` | Modificare AppShell: mostra LandingPage se non autenticato |
| `src/pages/LandingPage.jsx` | **Nuovo** |
| `src/pages/RegistrazionePage.jsx` | **Nuovo** |
| `src/components/GuideDrawer.jsx` | **Nuovo** |
| `src/data/guide.json` | **Nuovo** |
| `src/pages/PlatformPage.jsx` | Aggiungere badge pending + azioni approva/rifiuta |
| `src/layouts/AdminLayout.jsx` | Aggiungere `<GuideDrawer />` |
| `src/layouts/CoachLayout.jsx` | Aggiungere `<GuideDrawer />` |
| `src/layouts/ParentLayout.jsx` | Aggiungere `<GuideDrawer />` |
| `src/layouts/PlayerLayout.jsx` | Aggiungere `<GuideDrawer />` |
| `src/layouts/SecretaryLayout.jsx` | Aggiungere `<GuideDrawer />` |
| `supabase_migration_societa_stato.sql` | **Nuovo** — aggiunge colonne `stato` + `ref_*` |

---

## Fuori scope (da pianificare separatamente)

- Notifica email automatica al super_admin alla nuova registrazione
- Piano a pagamento / integrazione Stripe
- Password auto-generata e inviata via email all'approvazione
- Testi della guida compilabili dall'admin nel gestionale
