# Design: Batch 3 — Sistema Comunicazioni Famiglie ↔ Staff

**Data:** 2026-06-01  
**Stato:** Approvato  
**Scope:** Nuova tabella `messaggi`, ComunicazioniPage funzionante per giocatore/genitore, MessaggiRicevutiPage per allenatore/preparatore, badge unread, routing aggiornato.

---

## 1. Problema attuale

`ComunicazioniPage` (usata da giocatori e genitori) fa solo redirect alla bacheca. La bacheca esclude esplicitamente la scrittura per `ruolo = 'giocatore'` o `ruolo = 'genitore'` (`canWrite = false`). Il bottone "Comunica" è quindi inutile per chi lo usa.

---

## 2. Architettura

**Flusso:** Genitore/Giocatore scrive un messaggio → scopato alla loro squadra → visible agli allenatori e preparatori di quella squadra.

**Componenti nuovi:**
- Tabella Supabase `messaggi`
- `ComunicazioniPage.jsx` riscritta (invia + cronologia propri messaggi)
- `MessaggiRicevutiPage.jsx` nuova (staff legge messaggi ricevuti)
- Migration SQL

**Componenti modificati:**
- `CoachLayout.jsx` — aggiunge voce Messaggi con badge
- `PrepLayout.jsx` — aggiunge voce Messaggi con badge
- `App.jsx` — aggiunge route `/coach/messaggi` e `/prep/messaggi`

---

## 3. Database

### Tabella `messaggi`

```sql
CREATE TABLE messaggi (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societa_id     UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  mittente_id    UUID NOT NULL,
  mittente_nome  TEXT NOT NULL,
  mittente_ruolo TEXT NOT NULL CHECK (mittente_ruolo IN ('genitore', 'giocatore')),
  squadra        TEXT NOT NULL,
  testo          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  letto          BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX messaggi_societa_squadra_idx ON messaggi(societa_id, squadra);
CREATE INDEX messaggi_mittente_idx ON messaggi(mittente_id);
```

### RLS policies

```sql
ALTER TABLE messaggi ENABLE ROW LEVEL SECURITY;

-- Genitori e giocatori: possono scrivere
CREATE POLICY "messaggi_insert" ON messaggi
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('genitore', 'giocatore') AND
    societa_id = get_my_societa_id()
  );

-- Tutti gli autenticati della stessa società: leggono tutti i messaggi della società.
-- Il filtraggio per squadra avviene lato applicazione (più flessibile).
-- Genitori e giocatori vedranno solo i propri (query con .eq('mittente_id', user.id)).
-- Coach e prep vedranno quelli delle loro squadre (query con .in('squadra', ...)).
CREATE POLICY "messaggi_select" ON messaggi
  FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id());

-- Aggiornamento letto: solo admin/allenatore/preparatore/segreteria
CREATE POLICY "messaggi_update_letto" ON messaggi
  FOR UPDATE TO authenticated
  USING (societa_id = get_my_societa_id())
  WITH CHECK (societa_id = get_my_societa_id());
```

> Le funzioni `get_my_role()` e `get_my_societa_id()` sono già definite nel progetto.

---

## 4. ComunicazioniPage (riscritta)

**File:** `frontend/src/pages/player/ComunicazioniPage.jsx`  
Usata da ENTRAMBI giocatore (`/player/comunicazioni`) e genitore (`/parent/comunicazioni`) — stesso componente, stesso file.

### Layout

```
AppHeader title="Comunicazioni" subtitle="Scrivi al tuo staff"

Sezione "Nuovo messaggio"
  [form collassabile / sempre aperto]
  Squadra: [select se multiple, text read-only se unica]
  Messaggio: [textarea]
  [Invia →]
  stato invio: spinner / ✅ Inviato

Sezione "Messaggi inviati"
  [lista messaggi propri, ordine inverso, max 20]
  Ogni item: squadra · testo (troncato) · data
```

### Logica squadra

- **Genitore**: legge `[profile.genitore_squadra, profile.genitore_squadra2, profile.genitore_squadra3].filter(Boolean)`. Se 1 squadra → read-only. Se > 1 → select.
- **Giocatore**: legge `[profile.squadra, profile.squadra2, profile.squadra3].filter(Boolean)`. Stessa logica.

### Query per la lista

```js
supabase.from('messaggi')
  .select('id, squadra, testo, created_at')
  .eq('societa_id', societaId)
  .eq('mittente_id', user.id)
  .order('created_at', { ascending: false })
  .limit(20)
```

Query key: `['miei-messaggi', societaId, user?.id]`

### Insert

```js
supabase.from('messaggi').insert([{
  societa_id: societaId,
  mittente_id: user.id,
  mittente_nome: displayName,
  mittente_ruolo: activeRole, // 'genitore' | 'giocatore'
  squadra: squadraSelezionata,
  testo: testo.trim(),
}])
```

Dopo insert: invalida `['miei-messaggi', societaId, user.id]` e resetta il form.

---

## 5. MessaggiRicevutiPage (nuova)

**File:** `frontend/src/pages/coach/MessaggiRicevutiPage.jsx`  
Usata da ENTRAMBI allenatore (`/coach/messaggi`) e preparatore (`/prep/messaggi`) — stesso componente.

### Layout

```
AppHeader title="Messaggi" subtitle="Dalle famiglie"

[filtro squadra — se ha più squadre]

Lista messaggi ordinati per data desc:
  ● Marco Rossi (Genitore) · U15 · 2 giu 10:23   ← ● = non letto
    "Mio figlio non può venire martedì sera"
  
  ○ Luca Bianchi (Giocatore) · U15 · 1 giu 18:45  ← ○ = già letto
    "Posso allenarmi giovedì?"

[Vuoto: "Nessun messaggio ricevuto"]
```

### Filtraggio squadre per ruolo

- **Allenatore**: `squadreVisibili` = `allenatori.squadre_capo.split(',') + allenatori.squadre_vice.split(',')` per il profilo corrente (query sulla tabella `allenatori` per email)
- **Preparatore**: `squadreVisibili` = `prep_squadre WHERE preparatore_id = profile.id AND societa_id = societaId`

### Query messaggi

```js
supabase.from('messaggi')
  .select('id, mittente_nome, mittente_ruolo, squadra, testo, created_at, letto')
  .eq('societa_id', societaId)
  .in('squadra', squadreVisibili)
  .order('created_at', { ascending: false })
  .limit(50)
```

Query key: `['messaggi-staff', societaId, squadreVisibili.join(',')]`  
`enabled`: `squadreVisibili.length > 0`

### Segna come letti

Al mount della pagina (quando i messaggi sono caricati e ci sono non letti):
```js
await supabase.from('messaggi')
  .update({ letto: true })
  .eq('societa_id', societaId)
  .in('squadra', squadreVisibili)
  .eq('letto', false)
```

Poi invalida il count unread.

### Badge unread

Hook condiviso `useUnreadMessaggi(societaId, squadreVisibili)`:
```js
useQuery({
  queryKey: ['messaggi-unread', societaId, squadreVisibili.join(',')],
  enabled: squadreVisibili.length > 0,
  staleTime: 30_000,
  queryFn: async () => {
    const { count } = await supabase.from('messaggi')
      .select('id', { count: 'exact', head: true })
      .eq('societa_id', societaId)
      .in('squadra', squadreVisibili)
      .eq('letto', false)
    return count ?? 0
  },
})
```

Questo hook viene chiamato da `CoachLayout` e `PrepLayout` per il badge.

---

## 6. Nav changes

### CoachLayout

**Aggiunge** voce "Messaggi" con badge (MessageSquare icon) dopo Bacheca:
```jsx
{ to: '/coach/messaggi', icon: MessageSquare, label: 'Messaggi', badge: unreadMsg }
```

Mobile nav: aggiunge 5° item. **Attenzione:** 5 item è il limite consigliato per mobile nav. La bottom nav di CoachLayout già ha 4 voci → diventa 5. Accettabile.

### PrepLayout

**Aggiunge** voce "Messaggi" con badge dopo Schede:
```jsx
{ to: '/prep/messaggi', icon: MessageSquare, label: 'Messaggi', badge: unreadMsg }
```

PrepLayout passa da 4 a 5 voci.

### App.jsx

Aggiunge 2 route:
```jsx
// Dentro /coach:
<Route path="messaggi" element={<MessaggiRicevutiPage />} />

// Dentro /prep:
<Route path="messaggi" element={<MessaggiRicevutiPage />} />
```

---

## 7. File coinvolti (sommario)

| File | Azione |
|------|--------|
| `supabase/migrations/supabase_migration_messaggi.sql` | CREATE — tabella messaggi + RLS |
| `frontend/src/pages/player/ComunicazioniPage.jsx` | REWRITE — form invio + lista propri messaggi |
| `frontend/src/pages/coach/MessaggiRicevutiPage.jsx` | CREATE — lista messaggi ricevuti |
| `frontend/src/layouts/CoachLayout.jsx` | MODIFY — aggiunge nav Messaggi con badge |
| `frontend/src/layouts/PrepLayout.jsx` | MODIFY — aggiunge nav Messaggi con badge |
| `frontend/src/App.jsx` | MODIFY — aggiunge route messaggi per coach e prep |

---

## 8. Fuori scope

- Risposta dell'allenatore al messaggio (sistema unidirezionale)
- Notifiche push per nuovi messaggi
- Allegati / immagini
- Messaggi dalla segreteria o dall'admin
- Eliminazione messaggi
- Paginazione oltre i 50 messaggi
