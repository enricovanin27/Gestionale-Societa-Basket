# Segreteria v3 — Anagrafica, Ricevute, Attestazione 730

**Data:** 2026-05-23  
**Stato:** Approvato  

---

## Obiettivo

Potenziare la sezione segreteria con:
1. Anagrafica completa dei giocatori (inserimento/modifica diretto dalla segretaria)
2. Dati della società configurabili (per intestare ricevute e attestazioni)
3. Ricevuta di pagamento stampabile/PDF fedele al template esistente
4. Attestazione spese sportive per modello 730 (su richiesta per singolo giocatore)

---

## Decisioni chiave

| Decisione | Scelta |
|-----------|--------|
| Inserimento giocatori | Solo la segretaria (no form pubblico) |
| Form layout | Singola pagina verticale a sezioni (non wizard) — ottimizzata per desktop |
| Generazione PDF | HTML print-to-PDF (window.print) — zero librerie aggiuntive |
| Invio email | mailto precompilato |
| Certificazione 730 | Su richiesta per singolo giocatore, selezione anno |
| Dati società | Configurati nella sezione Impostazioni della segreteria |

---

## Modifiche al database

### `giocatori` — nuovi campi
```sql
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS luogo_nascita TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS indirizzo TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS citta TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS nome_genitore TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS cognome_genitore TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS codice_fiscale_genitore TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS email_genitore TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS data_iscrizione DATE;
```

### `societa` — nuovi campi
```sql
ALTER TABLE societa ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS indirizzo TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS citta TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS nome_completo TEXT;
```

### `quote` — nuovi campi
```sql
ALTER TABLE quote ADD COLUMN IF NOT EXISTS metodo_pagamento TEXT
  CHECK (metodo_pagamento IN ('contanti', 'bonifico', 'pos'));
ALTER TABLE quote ADD COLUMN IF NOT EXISTS data_pagamento DATE;
ALTER TABLE quote ADD COLUMN IF NOT EXISTS numero_ricevuta INTEGER;
-- Formato display: ANNO-NNNN (es. 2025-0007), calcolato client-side
```

---

## Struttura pagine

### Route nuove
```
/secretary/impostazioni              → ImpostazioniSocieta.jsx
/secretary/giocatori                 → GiocatoriPage.jsx (estesa con add/edit)
/secretary/giocatori/:id             → GiocatoreDetail.jsx (esteso con Documenti tab)
/secretary/ricevuta/:quoteId         → RicevutaPage.jsx (print-only)
/secretary/attestazione730/:giocId   → Attestazione730Page.jsx (print-only, ?anno=2025)
```

### Navigazione segreteria — aggiunta voce
Aggiungere **"Impostazioni"** alla nav (sidebar desktop + bottom nav mobile).

---

## Componenti nuovi

### `ImpostazioniSocieta.jsx`
- Form: nome completo ASD, codice fiscale, indirizzo, città, CAP, provincia, telefono, email
- Upload logo (PNG/JPG → Supabase Storage bucket `societa-loghi`)
- Anteprima intestazione ricevuta in tempo reale
- Salva su tabella `societa` con `upsert`

### `GiocatoreForm.jsx` (componente condiviso)
Form a sezioni verticali per desktop, tre blocchi:

**Dati atleta:** cognome*, nome*, data_nascita, luogo_nascita, codice_fiscale, indirizzo, città, CAP, provincia  
**Genitore/tutore:** nome_genitore, cognome_genitore, codice_fiscale_genitore, telefono, email_genitore  
**Iscrizione:** squadra*, squadra2, squadra3, numero_maglia, data_iscrizione, cert_medico_scadenza  

Usato sia per inserimento nuovo giocatore (bottone `+ Nuovo giocatore` in GiocatoriPage) che per modifica (tab "Anagrafica" in GiocatoreDetail).

### `PagamentoModal.jsx`
Appare quando si clicca "Segna come pagato" su una quota:
- Card riepilogo (nome atleta, descrizione quota, importo)
- 3 bottoni metodo: 💵 Contanti / 🏦 Bonifico / 💳 POS
- Campo data pagamento (default: oggi)
- Bottone "Conferma pagamento" → aggiorna `quote` con `pagato=true`, `data_pagamento`, `metodo_pagamento`, genera `numero_ricevuta`
  - `numero_ricevuta` = `SELECT COALESCE(MAX(numero_ricevuta), 0) + 1 FROM quote WHERE societa_id = ? AND EXTRACT(YEAR FROM data_pagamento) = anno_corrente`
- Dopo conferma: banner con link "🖨 Stampa ricevuta"

### `RicevutaPage.jsx`
Pagina standalone (apre in nuova tab), ottimizzata `@media print`.

Struttura fedele al template fornito:
```
[Logo / Nome ASD]
Ricevuta / Quietanza di pagamento N. ANNO-NNNN

[Nome ASD] dichiara di aver ricevuto

Tabella dati:
  Da:            [nome_genitore cognome_genitore]   CF: [cf_genitore]
  per:           [nome cognome atleta]
  nato a:        [luogo_nascita]                    il: [data_nascita]
  codice fiscale [cf_atleta]
  indirizzo:     [indirizzo]                        CAP: [cap]
  provincia:     [provincia]

per quanto sotto dettagliato:

Tabella pagamento:
  Descrizione | Metodo | Data | Importo
  [descrizione quota] | [metodo] | [data_pagamento] | [importo] €
  Totale | [importo] €

Note: [campo vuoto]

1. Operazione esente da IVA ai sensi dell'art. 10 del DPR n. 633 26/10/1972...
2. Esente da marca da bollo ai sensi art. 1, comma 646, L. 145/2018...

[Città], [data_pagamento]

Footer: [nome_completo ASD] — [indirizzo] — C.F.: [cf] — Tel: [tel] — email: [email]
```

Toolbar (nascosta in stampa): bottone "🖨 Stampa / Salva PDF" + "✉ Invia per email" (mailto).

### `Attestazione730Page.jsx`
Pagina standalone print-only, con selettore anno nella toolbar.

Struttura:
```
[Logo / Nome ASD]
Attestazione spese sportive — Anno XXXX
Ai sensi dell'art. 15 c.1 lett. i-quinquies) TUIR

Sezione Società: denominazione, CF, indirizzo
Sezione Atleta: nome, data nascita, CF

Dettaglio pagamenti anno XXXX:
  Tabella: Descrizione | Data | Metodo | Importo
  [righe quote pagate con data_pagamento in quell'anno]
  Totale pagato: XXX €

Box verde: Importo detraibile: € min(totale, 210)
  + nota: detrazione 19% IRPEF, limite €210 art.15 TUIR

Dichiarazione: "[ASD] certifica che l'atleta ha praticato attività sportiva..."

[Città], [data]   Il responsabile amministrativo ___________

Footer società
```

---

## Modifiche a componenti esistenti

### `GiocatoriPage.jsx`
- Aggiungere bottone **"+ Nuovo giocatore"** in header
- Aprire `GiocatoreForm` in modal/slide-over per inserimento

### `GiocatoreDetail.jsx`
Le tab esistenti (Note, Quote, Certificati) restano invariate. Si aggiungono:
- Tab **"Anagrafica"** (prima posizione): mostra `GiocatoreForm` in modalità modifica con tutti i nuovi campi
- Tab **"Documenti"** (ultima posizione): bottone "Genera attestazione 730" con `<select>` anno → apre `/secretary/attestazione730/:id?anno=XXXX` in nuova tab

### `QuotePage.jsx`
- Sostituire bottone "Segna pagato" con apertura di `PagamentoModal`
- Dopo pagamento: icona 🖨 che apre `/secretary/ricevuta/:quoteId` in nuova tab

---

## Dati società in ricevute e attestazioni

Tutte le pagine print effettuano un'unica query a `societa` per `societaId` all'avvio e usano i dati per popolare intestazione e footer. Se un campo è vuoto, viene omesso senza errori.

---

## Migration SQL

File: `supabase/migrations/supabase_migration_segreteria_v3.sql`

Contiene:
- ALTER TABLE giocatori (tutti i nuovi campi)
- ALTER TABLE societa (tutti i nuovi campi)
- ALTER TABLE quote (metodo_pagamento, data_pagamento, numero_ricevuta)
- Bucket Supabase Storage `societa-loghi` con policy pubblica in lettura
- RLS: segreteria può leggere/scrivere su `societa`

---

## Fuori scope

- Invio automatico email (richiede Resend/SendGrid + Edge Function)
- Firma digitale delle ricevute
- Esportazione massiva 730 per tutti i giocatori
- Gestione IVA o fatturazione elettronica
