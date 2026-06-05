# Design: Batch 1 — Bug fix + Rimozioni Preparatore/Allenatore

**Data:** 2026-05-31  
**Stato:** Approvato  
**Scope:** Fix cambio ruolo lento, fix atletica edit, rimozione StatoPage dal preparatore, rimozione Atletica dall'allenatore

---

## 1. Fix 1 — Cambio ruolo preparatore lento

### File
- `frontend/src/components/RoleSwitcher.jsx`

### Causa
`navigate(ROLE_PATH[role])` di React Router cambia l'URL ma non ricarica il profilo da Supabase. Se `ruoli_extra` è stato aggiornato dall'admin dopo il login dell'utente, il profilo in memoria (`profile.ruoli_extra`) è stale. Di conseguenza `allRuoli` non include il nuovo ruolo, `effectiveActiveRole` non viene calcolato correttamente, e la pagina non si apre o ci impiega molto.

### Fix
Nelle funzioni `handleSwitch` di entrambe le varianti (`RoleSwitcherSidebar` e `RoleSwitcherFAB`):
- Rimuovere l'import e la chiamata a `navigate`
- Sostituire `navigate(ROLE_PATH[role] ?? '/')` con `window.location.href = ROLE_PATH[role] ?? '/'`

Questo forza un reload completo della pagina che:
1. Ricrea il profilo fresco da Supabase (fetchProfile)
2. Imposta `loading = true` → spinner → poi carica la nuova pagina di ruolo
3. Garantisce che `allRuoli` contenga il ruolo aggiornato

**Trade-off:** Piccolo flash di loading (spinner iniziale). Accettabile perché il comportamento attuale è peggiore (pagina che non si apre).

**Invariato:** `setActiveRole(role)` continua a salvarsi in localStorage prima del reload, così `effectiveActiveRole` è subito corretto dopo il reload.

**Import da rimuovere:** `useNavigate` e l'hook `navigate` se non usati altrove nel componente.

---

## 2. Fix 2 — Modifica allenamento con atletica non aggiorna

### File
- `frontend/src/pages/AllenamentiPage.jsx`

### Causa
Nel `saveMut`, il blocco che gestisce `_prepData` fa sempre `INSERT` su `prep_sessioni`, mai `UPDATE`. Quando si modifica un allenamento già associato a una sessione atletica:
- I dati modificati (`quando`, `durata_min`, `su_campo`) NON vengono aggiornati sul record esistente
- Se `includiAtletica` è attivo, viene creato un **duplicato** nel DB
- Se `includiAtletica` viene disattivato, il vecchio record rimane in DB (non viene rimosso)

### Fix — parte A: logica di salvataggio in `saveMut`

Aggiungere un flag `isEdit: !!editingEvent` nel payload della mutation. Nel `mutationFn`:

```js
// Se è una modifica, cancella prima l'eventuale sessione esistente
if (isEdit) {
  await supabase
    .from('prep_sessioni')
    .delete()
    .eq('societa_id', societaId)
    .eq('data', event.data)
    .eq('squadra', event.squadra)
    .eq('tipo', 'allenamento')
}

// Poi inserisce il nuovo record solo se atletica è inclusa
if (formData._prepData) {
  await supabase.from('prep_sessioni').insert([{
    societa_id:     societaId,
    preparatore_id: formData._prepPreparatoreId ?? null,
    squadra:        event.squadra,
    data:           event.data,
    tipo:           'allenamento',
    quando:         formData._prepData.quando,
    durata_min:     formData._prepData.durata_min,
    su_campo:       formData._prepData.su_campo,
    note:           '',
  }])
}
```

Questa logica copre tutti e 3 i casi:
- **Modifica atletica esistente**: delete vecchio + insert nuovo → UPDATE effettivo
- **Rimozione atletica**: delete vecchio, nessun insert → rimossa correttamente
- **Aggiunta atletica a evento senza**: nessun delete (non trova nulla), insert → funziona come prima

### Fix — parte B: pre-popolare il form al momento della modifica

Nel form di modifica (`EventEditForm`), caricare il record `prep_sessioni` esistente per questo evento:

```js
const { data: existingPrep } = useQuery({
  queryKey: ['prep-sessione-evento', societaId, event.data, event.squadra],
  enabled: !!societaId,
  queryFn: async () => {
    const { data } = await supabase
      .from('prep_sessioni')
      .select('quando, durata_min, su_campo')
      .eq('societa_id', societaId)
      .eq('data', event.data)
      .eq('squadra', event.squadra)
      .eq('tipo', 'allenamento')
      .maybeSingle()
    return data ?? null
  },
})
```

Usando `useEffect` su `existingPrep`:
- Se esiste → `setIncludiAtletica(true)` e `setPrepData({ quando: existingPrep.quando, durata_min: existingPrep.durata_min, su_campo: existingPrep.su_campo })`
- Se non esiste → lasciare i valori di default

---

## 3. Fix 3 — Rimuovi Stato delle squadre dal preparatore

### File
- `frontend/src/layouts/PrepLayout.jsx`
- `frontend/src/App.jsx`

### Azioni
**PrepLayout.jsx:**
- Rimuovere l'import di `Activity` da lucide-react (se non usato altrove)
- Rimuovere la voce `{ to: '/prep/stato', icon: Activity, label: 'Stato' }` da `SIDEBAR_ITEMS`
- Rimuovere il `<NavLink to="/prep/stato">` dalla bottom nav mobile

**App.jsx:**
- Rimuovere `<Route path="stato" element={<StatoPage />} />` dal blocco `/prep`
- Rimuovere l'import `StatoPage` se non usato altrove

**Nota:** Il file `StatoPage.jsx` viene mantenuto nel filesystem.

---

## 4. Fix 4 — Rimuovi Atletica dall'allenatore

### File
- `frontend/src/layouts/CoachLayout.jsx`
- `frontend/src/App.jsx`

### Azioni
**CoachLayout.jsx:**
- Rimuovere l'import di `Dumbbell` da lucide-react (se non usato altrove)
- Rimuovere la voce `{ to: '/coach/atletica', icon: Dumbbell, label: 'Atletica' }` da `sidebarItems`
- Rimuovere il `<NavLink to="/coach/atletica">` dalla bottom nav mobile

**App.jsx:**
- Rimuovere `<Route path="atletica" element={<AtleticaCoach />} />` dal blocco `/coach`
- Rimuovere l'import `AtleticaCoach` se non usato altrove

**Nota:** Il file `AtleticaCoach.jsx` viene mantenuto nel filesystem.

---

## 5. File coinvolti (sommario)

| File | Azione |
|------|--------|
| `frontend/src/components/RoleSwitcher.jsx` | MODIFY — window.location.href invece di navigate |
| `frontend/src/pages/AllenamentiPage.jsx` | MODIFY — fix saveMut + pre-populate form |
| `frontend/src/layouts/PrepLayout.jsx` | MODIFY — rimuovi StatoPage |
| `frontend/src/layouts/CoachLayout.jsx` | MODIFY — rimuovi Atletica |
| `frontend/src/App.jsx` | MODIFY — rimuovi route stato e atletica |

## 6. Fuori scope

- Eliminazione fisica di `StatoPage.jsx` e `AtleticaCoach.jsx`
- Qualsiasi modifica al comportamento di `prep_sessioni` per eventi che NON sono allenamenti
- Redesign del preparatore (Batch 2 — sessione separata)
