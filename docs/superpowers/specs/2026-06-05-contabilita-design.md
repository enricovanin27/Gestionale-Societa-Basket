# Spec: Modulo Contabilità

**Data:** 2026-06-05  
**Stato:** Approvato  
**Route:** `/secretary/contabilita`

---

## Obiettivo

Aggiungere un modulo contabilità completo alla segreteria che permetta di:
1. Registrare le **spese** della società (uscite) con categoria libera
2. Visualizzare un **bilancio visivo** entrate/uscite con toggle anno solare / anno sportivo
3. Consultare le **entrate** (pagamenti quote già esistenti) in un'unica vista

---

## Modello dati

### Nuova tabella: `spese`

```sql
CREATE TABLE spese (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societa_id    UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  data          DATE NOT NULL,
  importo       NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  categoria     TEXT NOT NULL,
  descrizione   TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE spese ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_spese" ON spese
  FOR SELECT USING (societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "insert_spese" ON spese
  FOR INSERT WITH CHECK (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
    AND (SELECT ruolo FROM profiles WHERE id = auth.uid()) IN ('segreteria', 'admin', 'super_admin')
  );

CREATE POLICY "delete_spese" ON spese
  FOR DELETE USING (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
    AND (SELECT ruolo FROM profiles WHERE id = auth.uid()) IN ('segreteria', 'admin', 'super_admin')
  );
```

### Tabelle esistenti riutilizzate

- `quote` (filtro `pagato = true`) → sorgente dati per le **entrate**
- `societa` → per `societa_id`

### Categorie spese

Non viene creata una tabella separata. La lista categorie disponibili nel form si costruisce dinamicamente con:
```sql
SELECT DISTINCT categoria FROM spese WHERE societa_id = $1 ORDER BY categoria
```
L'utente può digitare una categoria nuova o scegliere da quelle già usate (input con datalist).

---

## Componenti UI

### `ContabilitaPage.jsx`

Route: `/secretary/contabilita`  
File: `frontend/src/pages/secretary/ContabilitaPage.jsx`

Struttura: usa il componente `TabBar` esistente con 3 tab:
- `bilancio` → Tab Bilancio
- `spese` → Tab Spese  
- `entrate` → Tab Entrate

Lo stato del tab attivo viene tenuto in `useState`, inizializzato dal `?tab=` query param se presente.

---

### Tab Bilancio

**Controlli in cima:**
- Toggle anno solare / anno sportivo (due pulsanti pill)
- Selettore anno (chevron left/right, stesso pattern di `ResocontoPage`)

**Anno sportivo:** da settembre a giugno. Es. "2025/26" = 2025-09-01 → 2026-08-31.  
**Anno solare:** 2026-01-01 → 2026-12-31.

**KPI cards (3 in riga):**
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Entrate     │ │ Uscite      │ │ Saldo       │
│ € 12.450    │ │ € 3.200     │ │ + € 9.250   │
│ verde       │ │ rosso       │ │ verde/rosso │
└─────────────┘ └─────────────┘ └─────────────┘
```

**Bar chart mensile** (CSS puro, no librerie):
- 12 colonne (una per mese)
- Due barre affiancate per mese: entrate (verde) e uscite (rosso)
- Altezza proporzionale al valore massimo mensile
- Label mese sotto (3 lettere: Gen, Feb, …)
- Tooltip al tap/hover: importo entrate + importo uscite del mese

**Breakdown spese per categoria:**
- Lista ordinata per importo decrescente
- Per ogni categoria: nome, importo totale, barra proporzionale (CSS)
- Percentuale sul totale uscite

---

### Tab Spese

**Lista spese:**
- Ordine: data discendente
- Per ogni riga: data · badge categoria (colore determinato da hash del nome) · descrizione · **€ importo**
- Bottone elimina (icona cestino) a destra, visibile solo a `isSegreteria` (o admin/super_admin)
- Conferma prima dell'eliminazione (alert nativo o inline)

**FAB `+`** (bottom-right, `fixed bottom-20 right-4`) → apre bottom sheet

**Bottom sheet "Nuova spesa":**
```
Importo (€) *         [input numerico]
Data *                [input date, default oggi]
Categoria *           [input text con datalist categorie esistenti]
Descrizione           [input text, opzionale]
[Annulla]  [Salva]
```

Dopo salvataggio: `invalidateQueries` su `['spese', societaId]` e chiusura sheet.

---

### Tab Entrate

Vista read-only dei pagamenti quote dell'anno selezionato:
- Usa la stessa query e lo stesso layout visivo di `ResocontoPage`
- Selettore anno (solare o sportivo, sincronizzato col toggle del tab Bilancio tramite stato condiviso nel componente padre)
- Totale incassato in cima
- Lista pagamenti: giocatore · squadra · descrizione · data · metodo · **€ importo**
- Bottone "Stampa" per aprire la print window (riusa `usePrintWindow`)

**Nota:** non duplicare la logica di fetch — creare un hook `useEntrate(societaId, from, to)` riutilizzabile.

---

## Navigazione

### `SecretaryLayout.jsx`

Aggiungere voce nav:
```
icona: TrendingUp (lucide)
label: "Contabilità"
route: /secretary/contabilita
visibile a: isSegreteria || isDirigente || isAdmin || isSuperAdmin
```

### `AppSidebar.jsx` / `BottomNav.jsx`

Verificare se la segreteria ha una voce di navigazione anche in questi componenti e aggiungere la voce "Contabilità" coerentemente.

---

## Permessi per ruolo

| Azione              | segreteria | dirigente | admin | super_admin |
|---------------------|:----------:|:---------:|:-----:|:-----------:|
| Vedere bilancio     | ✅         | ✅        | ✅    | ✅          |
| Vedere entrate      | ✅         | ✅        | ✅    | ✅          |
| Vedere spese        | ✅         | ✅        | ✅    | ✅          |
| Inserire spesa      | ✅         | ❌        | ✅    | ✅          |
| Eliminare spesa     | ✅         | ❌        | ✅    | ✅          |

Il FAB `+` e i bottoni elimina sono visibili solo se `isSegreteria || isAdmin || isSuperAdmin`.

---

## Librerie

Nessuna libreria grafica aggiuntiva. Il bar chart mensile viene implementato con div e `width` percentuale CSS, seguendo il pattern già usato nel breakdown presenze dell'app.

---

## File da creare

| File | Descrizione |
|------|-------------|
| `supabase/migrations/supabase_migration_contabilita.sql` | Crea tabella `spese` con RLS |
| `frontend/src/pages/secretary/ContabilitaPage.jsx` | Pagina principale con 3 tab |
| `frontend/src/hooks/useEntrate.js` | Hook riutilizzabile per fetch entrate |

## File da modificare

| File | Modifica |
|------|---------|
| `frontend/src/layouts/SecretaryLayout.jsx` | Aggiunge voce nav "Contabilità" |
| `frontend/src/App.jsx` | Aggiunge route `/secretary/contabilita` |

---

## Non incluso in questo scope

- Allegati/foto scontrini
- Collegamento spesa a una squadra specifica
- Export PDF del bilancio (eventuale fase 2)
- Notifiche/alert su budget superato
