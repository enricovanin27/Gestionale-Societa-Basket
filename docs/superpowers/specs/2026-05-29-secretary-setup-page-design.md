# Design: Pagina Setup Segreteria + Pulizia SetupMenu Admin

*Data: 29 maggio 2026*

---

## Contesto e problema

1. **Admin SetupMenu** contiene ancora la voce "Giocatori" nel gruppo Persone, ma dalla decisione di ruoli (admin = legge solo, segreteria = owner) questa voce non è più rilevante per l'admin nel contesto del setup.

2. **Segreteria** non ha un punto d'accesso chiaro per aggiungere nuovi giocatori e invitare genitori. Il FAB `+` su `GiocatoriPage` era nascosto, contestuale e difficile da trovare. Serve una pagina dedicata alle "registrazioni" raggiungibile dalla navigazione principale.

---

## Decisioni di design

### 1. Admin SetupMenu — rimozione voce Giocatori

**File:** `frontend/src/pages/admin/SetupMenu.jsx`

Rimuovere l'item `{ icon: Trophy, label: 'Giocatori', desc: '...', tab: 'giocatori' }` dal gruppo `👥 Persone`.

Il gruppo Persone post-modifica contiene:
- Allenatori
- Utenti & Accessi

La tab `giocatori` in `SetupPage.jsx` rimane accessibile via URL diretto (non si rimuove il codice), ma non è più esposta nel menu principale. L'admin può ancora consultare i giocatori se necessario tramite URL, ma non è il flusso primario.

### 2. GiocatoriPage — rimozione FAB

**File:** `frontend/src/pages/secretary/GiocatoriPage.jsx`

Rimuovere completamente:
- Il constant `fab` (il pulsante `+` fisso in basso a destra)
- Il constant `modal` (il modal con GiocatoreWizard, non più necessario qui)
- Lo stato `const [showAdd, setShowAdd] = useState(false)` (non più usato)
- L'import di `GiocatoreWizard` (non più usato in questa pagina)

`GiocatoriPage` diventa pagina di sola visualizzazione/navigazione: lista squadre → drill-down giocatori → click → GiocatoreDetail.

### 3. Nuova pagina Setup Segreteria

**File nuovo:** `frontend/src/pages/secretary/SegreteriaSetupPage.jsx`
**Route:** `/secretary/setup`

Hub con 2 azioni principali:

#### Card 1: Nuovo giocatore
- Titolo: "Nuovo giocatore"
- Desc: "Aggiungi un atleta e invita il suo genitore"
- Click → apre modal con `GiocatoreWizard` (3 step già implementato)
- Alla chiusura (`onDone`/`onCancel`) il modal si chiude

#### Card 2: Invita genitore
- Titolo: "Invita genitore"
- Desc: "Crea un account app per un genitore già registrato"
- Click → apre modal con `InvitaUtenteForm` limitato a `ruoliConsentiti={['genitore']}`
- `InvitaUtenteForm` già gestisce tutto (invito email, creazione profilo, collegamento giocatore)

#### Layout della pagina
```
PageHeader: "Registrazioni"

[card larga — Nuovo giocatore]
icona UserPlus, testo, freccia →

[card larga — Invita genitore]
icona UserCheck, testo, freccia →
```

Due card stacked verticalmente (stile GiocatoriPage/QuotePage), non side-by-side, per leggibilità su mobile.

### 4. Navigazione SecretaryLayout

**File:** `frontend/src/layouts/SecretaryLayout.jsx`

**Sidebar** (invariata a 6 item, aggiunge Setup):
- Dashboard
- Giocatori
- Quote Squadre
- Certificati
- Bacheca
- Impostazioni
- **Setup** (nuovo, con icona `UserPlus`)

**Mobile bottom nav** (rimane a 5 item):
- Dashboard
- Giocatori
- Quote Sq.
- Certificati
- **Setup** ← sostituisce Bacheca

La Bacheca rimane accessibile dalla sidebar. Motivazione: Setup (aggiungere giocatori) è un'azione frequente per la segreteria; Bacheca è consultiva e meno urgente.

### 5. Routing App.jsx

**File:** `frontend/src/App.jsx`

Aggiungere import e route:
```jsx
import SegreteriaSetupPage from './pages/secretary/SegreteriaSetupPage'
// ...
<Route path="setup" element={<SegreteriaSetupPage />} />
```

---

## Scope — cosa NON è incluso

- Non si rimuove il codice della tab `giocatori` da `SetupPage.jsx` (mantenuto per compatibilità URL)
- Non si modifica il comportamento di `GiocatoreDetail` o `CertificatiPage`
- Non si aggiunge la "Invita giocatore" come account app (fuori scope)
- Non si modifica l'admin oltre alla rimozione della voce dal menu

---

## File coinvolti

| File | Tipo |
|------|------|
| `frontend/src/pages/admin/SetupMenu.jsx` | MODIFICA — rimuove voce Giocatori |
| `frontend/src/pages/secretary/GiocatoriPage.jsx` | MODIFICA — rimuove FAB, modal, stato showAdd |
| `frontend/src/pages/secretary/SegreteriaSetupPage.jsx` | CREA — hub registrazioni |
| `frontend/src/layouts/SecretaryLayout.jsx` | MODIFICA — aggiunge Setup al nav, toglie Bacheca dal mobile |
| `frontend/src/App.jsx` | MODIFICA — aggiunge route /secretary/setup |
