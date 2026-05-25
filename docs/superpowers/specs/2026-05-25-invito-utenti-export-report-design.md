# Design: Invito Utenti Semplificato + Export Report
**Data:** 2026-05-25  
**Stato:** Approvato  
**Ruoli coinvolti:** Admin, Segreteria, Allenatore

---

## Contesto

Due miglioramenti funzionali prioritari per rendere l'app usabile da una società sportiva reale:

1. **Invito utenti semplificato** — eliminare la necessità di impostare password manualmente; usare il flow email magica di Supabase. Estendere l'accesso all'invito anche alla Segreteria (limitato a genitore/giocatore).
2. **Export/stampa report** — permettere a Segreteria, Admin e Allenatori di stampare documenti PDF direttamente dal browser, senza librerie esterne.

---

## Feature 1: Invito Utenti Semplificato

### Approccio scelto
Componente condiviso `InvitaUtenteForm` con prop `ruoliConsentiti`, usato sia nell'area Admin che Segreteria. Flow basato su `supabase.auth.admin.inviteUserByEmail()` (sostituisce il form con password manuale attuale).

### File nuovo
**`frontend/src/components/InvitaUtenteForm.jsx`**

#### Props
| Prop | Tipo | Descrizione |
|---|---|---|
| `ruoliConsentiti` | `string[]` | Ruoli selezionabili nel form |
| `onSuccess` | `() => void` | Callback opzionale dopo invito riuscito |

#### Campi del form
| Campo | Obbligatorio | Visibilità |
|---|---|---|
| Email | ✅ | Sempre |
| Nome | ❌ | Sempre |
| Cognome | ❌ | Sempre |
| Ruolo | ✅ | Sempre (select filtrato da `ruoliConsentiti`) |
| Squadra | ❌ | Solo se ruolo = `genitore` o `giocatore` |
| Giocatore collegato | ❌ | Solo se ruolo = `genitore` (select da tabella `giocatori`) |

#### Flusso di invito
1. Utente compila form e preme "Invia invito"
2. Chiamata: `supabase.auth.admin.inviteUserByEmail(email, { data: { ruolo, nome, cognome, societa_id, squadra } })`
3. Supabase invia email con magic link; l'utente imposta la propria password al primo accesso
4. Subito dopo, insert in tabella `profili` con il `user_id` restituito: `{ user_id, societa_id, ruolo, nome, cognome, squadra }`
5. Se `ruolo === 'genitore'` e `giocatoreId` selezionato: update `giocatori.genitore_user_id = user_id`
6. UI mostra messaggio: *"✅ Email di invito inviata a [email]"*
7. Form si resetta

#### Gestione errori
- Email già registrata → messaggio esplicito "Questo indirizzo è già registrato"
- Errore generico Supabase → mostra `error.message`
- Nessun retry automatico

### Integrazione Admin (SetupPage)
**File:** `frontend/src/pages/SetupPage.jsx` — tab `utenti`  
**Modifica:** Sostituire il form con password manuale con `<InvitaUtenteForm ruoliConsentiti={['admin','allenatore','segreteria','genitore','giocatore','preparatore']} />`.  
La logica esistente di creazione allenatore in tabella `allenatori` viene mantenuta come side-effect post-invito nel componente condiviso.

### Integrazione Segreteria (ImpostazioniSocieta)
**File:** `frontend/src/pages/secretary/ImpostazioniSocieta.jsx`  
**Modifica:** Aggiungere una nuova sezione "👥 Gestione Accessi" in fondo alla pagina, **dopo** il pulsante Salva impostazioni, con:
```
<InvitaUtenteForm ruoliConsentiti={['genitore', 'giocatore']} />
```
Nessuna nuova voce di navigazione nel `SecretaryLayout`.

---

## Feature 2: Export / Stampa Report

### Approccio scelto
Hook `usePrintWindow` che apre una nuova finestra con HTML/CSS ottimizzato per la stampa e chiama `window.print()` automaticamente. Nessuna libreria esterna.

### File nuovo
**`frontend/src/hooks/usePrintWindow.js`**

`intestazioneSocieta` viene passato dai componenti chiamanti come `useAuth().societaNome` (già disponibile in tutti i componenti autenticati).

```js
// Ritorna la funzione printWindow
export function usePrintWindow() {
  return function printWindow(titolo, htmlBody, intestazioneSocieta = '') {
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>${titolo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    h1 { font-size: 14px; margin-bottom: 4px; }
    .subtitle { font-size: 10px; color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    th, td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: left; }
    .center { text-align: center; }
    .ok { color: #16a34a; font-weight: bold; }
    .ko { color: #dc2626; }
    .footer { margin-top: 16px; font-size: 9px; color: #9ca3af; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${intestazioneSocieta ? `<div class="subtitle">${intestazioneSocieta}</div>` : ''}
  <h1>${titolo}</h1>
  ${htmlBody}
  <div class="footer">Stampato il ${new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }
}
```

### Report 1 — Quote non pagate (Segreteria)

**Trigger:** Pulsante `🖨️ Stampa` nel pannello "Quote non pagate" di `SegreteriaDashboard`  
**Dati:** Già in memoria (query `quote` + `giocatoreMap` presenti nel componente) — zero nuove chiamate  
**Contenuto:**
```
QUOTE NON PAGATE — [Nome Società]
Stampato il dd/mm/yyyy hh:mm

Cognome | Nome | Squadra | Tipo | Descrizione | Importo | Scadenza
Bianchi   Mario  U18       Rata   Quota annua   € 80,00   15/01/2026 [SCADUTA]
...

Totale non pagato: € XXX,XX  —  N giocatori coinvolti
```

### Report 2 — Certificati medici (Segreteria)

**Trigger:** Pulsante `🖨️ Stampa` nel pannello certificati di `SegreteriaDashboard`  
**Dati:** Già in memoria  
**Contenuto:**
```
CERTIFICATI MEDICI — [Nome Società]

Cognome | Nome | Squadra | Scadenza | Stato
Bianchi   Mario  U18       10/01/2026  SCADUTO
Rossi     Luca   U15       15/02/2026  In scadenza (21 gg)
```

### Report 3 — Presenze dettaglio (Admin + Allenatore)

**Trigger:**
- **Admin:** pulsante `🖨️ Stampa report` nel componente `SquadraDetail` di `PresenzeAdmin` (livello squadra, accanto al filtro periodo)
- **Allenatore:** pulsante `🖨️ Stampa report` in `StatistichePage` (già embeddato come tab in `AttivitaPage`). Se in fase di implementazione `StatistichePage` non ha una vista per-squadra adatta, il pulsante va inserito nel tab Presenze di `AttivitaPage` a livello di sessione selezionata.

**Dati:** La query esistente in `SquadraDetail` restituisce solo conteggi aggregati per giocatore (presenti/totali) — **non è sufficiente** per la matrice. Serve una **nuova query** al click del pulsante che recupera i record individuali per data:
- Input: `giocatoreIds[]` (già disponibili dalla query esistente), `fromDate`, `toDate`
- Query: `presenze_allenamento` filtrata per giocatori + periodo
- Pivot eseguito in-memory in JS prima di generare l'HTML

**Query:**
```sql
SELECT giocatore_id, data, presente
FROM presenze_allenamento
WHERE giocatore_id = ANY([ids_giocatori_squadra])
  AND data BETWEEN fromDate AND toDate
ORDER BY data
```

**Pivot in-memory:**
- `dates` = array di date uniche, ordinate
- `players` = array di giocatori con nome/cognome
- Matrix `[playerId][date]` → `true | false | undefined`

**Contenuto — tabella "registro di classe":**
```
PRESENZE ALLENAMENTI — [Squadra] — [Periodo]

Giocatore      | 02/09 | 05/09 | 09/09 | … | Tot    |  %
───────────────┼───────┼───────┼───────┼───┼────────┼─────
Rossi Mario    |   ✓   |   ✓   |   ·   | … | 18/22  | 82%
Bianchi Luca   |   ·   |   ✓   |   ✓   | … | 20/22  | 91%
───────────────┴───────┴───────┴───────┴───┴────────┴─────
Media squadra  |                              |        | 87%
```
- `✓` = presente, `·` = assente, `—` = nessun record per quella data
- Colonne date formattate `dd/MM` (es. "02/09")
- Se le colonne sono >15, il font si riduce a 8px per stare nella pagina

---

## File modificati

| File | Tipo modifica |
|---|---|
| `frontend/src/components/InvitaUtenteForm.jsx` | **NUOVO** |
| `frontend/src/hooks/usePrintWindow.js` | **NUOVO** |
| `frontend/src/pages/SetupPage.jsx` | Modifica tab utenti |
| `frontend/src/pages/secretary/ImpostazioniSocieta.jsx` | Aggiunta sezione Gestione Accessi |
| `frontend/src/pages/secretary/SegreteriaDashboard.jsx` | Aggiunta pulsanti stampa |
| `frontend/src/pages/admin/PresenzeAdmin.jsx` | Aggiunta pulsante stampa in SquadraDetail |
| `frontend/src/pages/StatistichePage.jsx` | Aggiunta pulsante stampa presenze |

---

## Vincoli e decisioni

- **Service role key nel frontend**: il pattern esistente viene mantenuto (già in uso); non si introduce una Edge Function in questo ciclo.
- **Nessuna libreria aggiuntiva**: zero dipendenze npm nuove per entrambe le feature.
- **Nessuna nuova voce di navigazione**: l'invito segreteria va in ImpostazioniSocieta; il report presenze appare inline dove i dati sono già visibili.
- **Stampa lato browser**: l'utente usa "Salva come PDF" dal dialogo di stampa del browser; non serve generazione server-side.
- **Periodo del report presenze**: usa lo stesso filtro (30d/90d/stagione) già selezionato nella pagina; non aggiunge un nuovo selettore.
