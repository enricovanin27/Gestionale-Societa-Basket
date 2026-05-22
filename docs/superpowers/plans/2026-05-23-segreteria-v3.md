# Segreteria v3 — Anagrafica, Ricevute, Attestazione 730 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere alla segreteria: anagrafica completa giocatori, dati società, ricevuta di pagamento stampabile, attestazione spese sportive 730.

**Architecture:** Nuovi campi su `giocatori`, `societa`, `quote` via ALTER TABLE. Cinque nuovi componenti JSX: `ImpostazioniSocieta`, `GiocatoreForm` (condiviso), `PagamentoModal`, `RicevutaPage`, `Attestazione730Page`. Le due pagine di stampa vivono fuori dal SecretaryLayout (nuova tab, no sidebar).

**Tech Stack:** React 19, React Router v7, TanStack Query v5, Supabase JS v2, TailwindCSS v4, `window.print()` + `@media print` per PDF.

---

## File Map

| Azione | File |
|--------|------|
| Crea | `supabase/migrations/supabase_migration_segreteria_v3.sql` |
| Crea | `frontend/src/pages/secretary/ImpostazioniSocieta.jsx` |
| Crea | `frontend/src/pages/secretary/GiocatoreForm.jsx` |
| Crea | `frontend/src/pages/secretary/PagamentoModal.jsx` |
| Crea | `frontend/src/pages/secretary/RicevutaPage.jsx` |
| Crea | `frontend/src/pages/secretary/Attestazione730Page.jsx` |
| Modifica | `frontend/src/layouts/SecretaryLayout.jsx` |
| Modifica | `frontend/src/App.jsx` |
| Modifica | `frontend/src/pages/secretary/GiocatoriPage.jsx` |
| Modifica | `frontend/src/pages/secretary/GiocatoreDetail.jsx` |
| Modifica | `frontend/src/pages/secretary/QuotePage.jsx` |

---

## Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/supabase_migration_segreteria_v3.sql`

- [ ] **Step 1: Crea il file di migrazione**

```sql
-- supabase/migrations/supabase_migration_segreteria_v3.sql

-- ── GIOCATORI ─────────────────────────────────────────────────────────────
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

-- ── SOCIETA ──────────────────────────────────────────────────────────────
ALTER TABLE societa ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS indirizzo TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS citta TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS nome_completo TEXT;

-- ── QUOTE ────────────────────────────────────────────────────────────────
ALTER TABLE quote ADD COLUMN IF NOT EXISTS metodo_pagamento TEXT
  CHECK (metodo_pagamento IN ('contanti', 'bonifico', 'pos'));
ALTER TABLE quote ADD COLUMN IF NOT EXISTS data_pagamento DATE;
ALTER TABLE quote ADD COLUMN IF NOT EXISTS numero_ricevuta INTEGER;

-- ── RLS: segreteria può leggere e scrivere sulla propria società ──────────
-- (aggiungiamo solo se non esistono policy equivalenti)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'societa' AND policyname = 'segreteria_own_societa'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY segreteria_own_societa ON societa
        FOR ALL
        TO authenticated
        USING (
          id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (ruolo = 'segreteria' OR 'segreteria' = ANY(ruoli_extra))
          )
        )
        WITH CHECK (
          id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
        );
    $policy$;
  END IF;
END;
$$;
```

- [ ] **Step 2: Esegui la migrazione nel Supabase Dashboard**

Vai su `SQL Editor` nel Supabase Dashboard → incolla il contenuto del file → `Run`.

Verifica nell'editor di tabelle che i nuovi campi esistano su `giocatori`, `societa`, `quote`.

- [ ] **Step 3: Crea il bucket `societa-loghi` in Supabase Storage**

Nel Supabase Dashboard → Storage → `New bucket`:
- Name: `societa-loghi`
- Public bucket: ✅ (sì, i logo sono pubblici per poterli mostrare nelle ricevute)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/supabase_migration_segreteria_v3.sql
git commit -m "chore: add segreteria v3 SQL migration"
```

---

## Task 2: ImpostazioniSocieta.jsx

**Files:**
- Create: `frontend/src/pages/secretary/ImpostazioniSocieta.jsx`

- [ ] **Step 1: Crea il file**

```jsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const EMPTY = {
  nome_completo: '', codice_fiscale: '', indirizzo: '',
  citta: '', cap: '', provincia: '', telefono: '', email: '', logo_url: '',
}

export default function ImpostazioniSocieta() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data: societa, isLoading } = useQuery({
    queryKey: ['societa-impostazioni', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('societa')
        .select('nome, nome_completo, codice_fiscale, indirizzo, citta, cap, provincia, telefono, email, logo_url')
        .eq('id', societaId).single()
      return data
    },
  })

  useEffect(() => {
    if (societa) {
      setForm({
        nome_completo:  societa.nome_completo ?? societa.nome ?? '',
        codice_fiscale: societa.codice_fiscale ?? '',
        indirizzo:      societa.indirizzo ?? '',
        citta:          societa.citta ?? '',
        cap:            societa.cap ?? '',
        provincia:      societa.provincia ?? '',
        telefono:       societa.telefono ?? '',
        email:          societa.email ?? '',
        logo_url:       societa.logo_url ?? '',
      })
    }
  }, [societa])

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('societa').update(form).eq('id', societaId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['societa-impostazioni', societaId] })
      qc.invalidateQueries({ queryKey: ['societa-dati', societaId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${societaId}/logo.${ext}`
      const { error: upErr } = await supabase.storage
        .from('societa-loghi').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('societa-loghi').getPublicUrl(path)
      setForm(f => ({ ...f, logo_url: publicUrl }))
    } catch (err) {
      alert('Errore upload: ' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  if (isLoading) return <div><PageHeader title="Impostazioni" /><div className="pt-8"><LoadingSpinner /></div></div>

  return (
    <div>
      <PageHeader title="Impostazioni Società" subtitle="Dati usati in ricevute e attestazioni" />
      <div className="px-4 pb-24 max-w-2xl">

        {/* Anteprima intestazione */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Anteprima intestazione ricevuta</p>
          <div className="flex items-center gap-3">
            {form.logo_url
              ? <img src={form.logo_url} alt="logo" className="h-12 object-contain" />
              : <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center text-2xl">🏀</div>
            }
            <div>
              <p className="font-bold text-gray-900 text-sm">{form.nome_completo || 'Nome Società ASD'}</p>
              {form.citta && (
                <p className="text-xs text-gray-500">
                  {[form.indirizzo, `${form.cap} ${form.citta}`.trim()].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Upload logo */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Logo</p>
          <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-dashed cursor-pointer transition-colors ${
            uploading ? 'text-gray-400 border-gray-200' : 'text-purple-600 border-purple-300 hover:bg-purple-50'
          }`}>
            <Upload size={16} />
            <span className="text-sm font-medium">
              {uploading ? 'Caricamento...' : form.logo_url ? 'Sostituisci logo (PNG/JPG)' : 'Carica logo (PNG/JPG)'}
            </span>
            <input type="file" accept="image/png,image/jpeg" className="hidden"
              disabled={uploading} onChange={handleLogoUpload} />
          </label>
        </div>

        {/* Dati ASD */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dati ASD</p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nome completo ASD *</label>
            <input className={inp} value={form.nome_completo} onChange={set('nome_completo')} placeholder="Es. Basket Oderzo ASD" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Codice fiscale</label>
            <input className={inp + ' font-mono'} value={form.codice_fiscale} onChange={set('codice_fiscale')} placeholder="92345678901" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Indirizzo</label>
            <input className={inp} value={form.indirizzo} onChange={set('indirizzo')} placeholder="Via Mazzini 10" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">CAP</label>
              <input className={inp} value={form.cap} onChange={set('cap')} placeholder="31046" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Città</label>
              <input className={inp} value={form.citta} onChange={set('citta')} placeholder="Oderzo" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Prov.</label>
              <input className={inp} value={form.provincia} onChange={set('provincia')} placeholder="TV" maxLength={2} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefono</label>
              <input className={inp} value={form.telefono} onChange={set('telefono')} placeholder="+39 0422 123456" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input type="email" className={inp} value={form.email} onChange={set('email')} placeholder="segreteria@..." />
            </div>
          </div>
        </div>

        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || !form.nome_completo}
          className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-xl font-semibold disabled:opacity-60 active:scale-95 transition-transform">
          <Save size={16} />
          {saved ? 'Salvato ✓' : saveMut.isPending ? 'Salvataggio...' : 'Salva impostazioni'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifica in browser**

Naviga su `/secretary/impostazioni` (dopo aver aggiunto il route al Task 3). Verifica:
- Il form carica i dati esistenti della società
- La preview si aggiorna in tempo reale
- Il salvataggio mostra "Salvato ✓"
- L'upload logo funziona (bucket deve esistere)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/secretary/ImpostazioniSocieta.jsx
git commit -m "feat: ImpostazioniSocieta — form dati società + logo upload"
```

---

## Task 3: SecretaryLayout + App.jsx — navigazione e route

**Files:**
- Modify: `frontend/src/layouts/SecretaryLayout.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Aggiorna SecretaryLayout.jsx**

Aggiungi `Settings` agli import lucide e la voce "Impostazioni" a sidebar e bottom nav:

```jsx
// Riga import lucide — aggiungi Settings
import { LayoutDashboard, Users, Bell, Receipt, Settings } from 'lucide-react'
```

Aggiungi voce a `sidebarItems` (dopo 'Quote'):

```jsx
const sidebarItems = [
  { to: '/secretary',              end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/secretary/giocatori',               icon: Users,           label: 'Giocatori' },
  { to: '/secretary/quote',                   icon: Receipt,         label: 'Quote' },
  { to: '/secretary/bacheca',                 icon: Bell,            label: 'Bacheca', badge: unread },
  { to: '/secretary/impostazioni',            icon: Settings,        label: 'Impostazioni' },
]
```

Aggiungi voce alla bottom nav (dentro `<div className="flex justify-around ...">`, dopo Bacheca):

```jsx
<NavLink to="/secretary/impostazioni" className={cls}>
  <Settings size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Impostazioni</span>
</NavLink>
```

- [ ] **Step 2: Aggiorna App.jsx — import**

Aggiungi gli import dopo le righe secretary esistenti (righe 24-27):

```jsx
import ImpostazioniSocieta  from './pages/secretary/ImpostazioniSocieta'
import RicevutaPage         from './pages/secretary/RicevutaPage'
import Attestazione730Page  from './pages/secretary/Attestazione730Page'
```

- [ ] **Step 3: Aggiorna App.jsx — route interne secretary**

Dentro il blocco `<Route path="/secretary" element={...SecretaryLayout...}>` (dopo la route "quote"):

```jsx
<Route path="impostazioni" element={<ImpostazioniSocieta />} />
```

- [ ] **Step 4: Aggiorna App.jsx — route print standalone**

Queste due route vanno **fuori** dal blocco SecretaryLayout (dopo la chiusura `</Route>` di secretary, prima del blocco coach). Sono standalone senza sidebar:

```jsx
{/* Print pages — segreteria, no layout */}
<Route path="/secretary/ricevuta/:quoteId"
  element={<ProtectedRoute requiredRole="segreteria"><RicevutaPage /></ProtectedRoute>} />
<Route path="/secretary/attestazione730/:giocId"
  element={<ProtectedRoute requiredRole="segreteria"><Attestazione730Page /></ProtectedRoute>} />
```

- [ ] **Step 5: Verifica navigazione**

Avvia il dev server (`npm run dev` dentro `frontend/`). Verifica che:
- La sidebar desktop mostri la voce "Impostazioni"
- La bottom nav mobile mostri l'icona Settings
- La route `/secretary/impostazioni` carichi senza errori 404

- [ ] **Step 6: Commit**

```bash
git add frontend/src/layouts/SecretaryLayout.jsx frontend/src/App.jsx
git commit -m "feat: aggiungi route e nav Impostazioni + route print standalone"
```

---

## Task 4: GiocatoreForm.jsx — form condiviso inserimento/modifica

**Files:**
- Create: `frontend/src/pages/secretary/GiocatoreForm.jsx`

- [ ] **Step 1: Crea il file**

```jsx
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const EMPTY = {
  cognome: '', nome: '', data_nascita: '', luogo_nascita: '', codice_fiscale: '',
  indirizzo: '', citta: '', cap: '', provincia: '',
  nome_genitore: '', cognome_genitore: '', codice_fiscale_genitore: '',
  telefono: '', email_genitore: '',
  squadra: '', squadra2: '', squadra3: '', numero_maglia: '',
  data_iscrizione: '', cert_medico_scadenza: '',
}

export default function GiocatoreForm({ initialValues = {}, onSave, onCancel, saving }) {
  const { societaId } = useAuth()
  const [form, setForm] = useState({ ...EMPTY, ...initialValues })

  // Resync quando cambia il giocatore in edit mode
  useEffect(() => {
    setForm({ ...EMPTY, ...initialValues })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues?.id])

  // Lista squadre derivata dai giocatori esistenti (per datalist autocomplete)
  const { data: squadreList = [] } = useQuery({
    queryKey: ['squadre-suggerimenti', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('squadra, squadra2, squadra3')
        .eq('societa_id', societaId)
        .eq('attivo', true)
      const set = new Set()
      for (const g of data ?? []) {
        if (g.squadra)  set.add(g.squadra)
        if (g.squadra2) set.add(g.squadra2)
        if (g.squadra3) set.add(g.squadra3)
      }
      return [...set].sort()
    },
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'
  const sec = 'text-xs font-bold text-gray-400 uppercase tracking-widest mb-3'

  return (
    <div className="space-y-6">
      <datalist id="squadre-list">
        {squadreList.map(s => <option key={s} value={s} />)}
      </datalist>

      {/* ── Dati atleta ── */}
      <section>
        <p className={sec}>Dati atleta</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Cognome *</label>
              <input className={inp} value={form.cognome} onChange={set('cognome')} required />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
              <input className={inp} value={form.nome} onChange={set('nome')} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data di nascita</label>
              <input type="date" className={inp} value={form.data_nascita ?? ''} onChange={set('data_nascita')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Luogo di nascita</label>
              <input className={inp} value={form.luogo_nascita ?? ''} onChange={set('luogo_nascita')} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Codice fiscale</label>
            <input className={inp + ' uppercase font-mono'} value={form.codice_fiscale ?? ''}
              onChange={e => setForm(f => ({ ...f, codice_fiscale: e.target.value.toUpperCase() }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Indirizzo</label>
              <input className={inp} value={form.indirizzo ?? ''} onChange={set('indirizzo')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Città</label>
              <input className={inp} value={form.citta ?? ''} onChange={set('citta')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">CAP</label>
              <input className={inp} value={form.cap ?? ''} onChange={set('cap')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Provincia</label>
              <input className={inp} value={form.provincia ?? ''} onChange={set('provincia')} maxLength={2} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Genitore / Tutore ── */}
      <section>
        <p className={sec}>Genitore / Tutore</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Cognome</label>
              <input className={inp} value={form.cognome_genitore ?? ''} onChange={set('cognome_genitore')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nome</label>
              <input className={inp} value={form.nome_genitore ?? ''} onChange={set('nome_genitore')} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Codice fiscale genitore</label>
            <input className={inp + ' uppercase font-mono'} value={form.codice_fiscale_genitore ?? ''}
              onChange={e => setForm(f => ({ ...f, codice_fiscale_genitore: e.target.value.toUpperCase() }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefono</label>
              <input type="tel" className={inp} value={form.telefono ?? ''} onChange={set('telefono')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input type="email" className={inp} value={form.email_genitore ?? ''} onChange={set('email_genitore')} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Iscrizione ── */}
      <section>
        <p className={sec}>Iscrizione</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Squadra *</label>
              <input list="squadre-list" className={inp} value={form.squadra}
                onChange={set('squadra')} placeholder="Es. U14 Maschile" required />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Squadra 2</label>
              <input list="squadre-list" className={inp} value={form.squadra2 ?? ''}
                onChange={set('squadra2')} placeholder="opzionale" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Squadra 3</label>
              <input list="squadre-list" className={inp} value={form.squadra3 ?? ''}
                onChange={set('squadra3')} placeholder="opzionale" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">N° maglia</label>
              <input type="number" min="1" max="99" className={inp}
                value={form.numero_maglia ?? ''} onChange={set('numero_maglia')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data iscrizione</label>
              <input type="date" className={inp} value={form.data_iscrizione ?? ''} onChange={set('data_iscrizione')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Scad. cert. medico</label>
              <input type="date" className={inp} value={form.cert_medico_scadenza ?? ''} onChange={set('cert_medico_scadenza')} />
            </div>
          </div>
        </div>
      </section>

      {/* Azioni */}
      <div className="flex gap-3 pt-2 pb-4">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
          Annulla
        </button>
        <button type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.cognome || !form.nome || !form.squadra}
          className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 active:scale-95 transition-transform">
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/secretary/GiocatoreForm.jsx
git commit -m "feat: GiocatoreForm — form anagrafica condiviso create/edit"
```

---

## Task 5: GiocatoriPage.jsx — inserimento nuovo giocatore

**Files:**
- Modify: `frontend/src/pages/secretary/GiocatoriPage.jsx`

- [ ] **Step 1: Aggiungi import**

In cima al file, aggiungi dopo gli import esistenti:

```jsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X }                     from 'lucide-react'
import GiocatoreForm                   from './GiocatoreForm'
```

(Nota: `ChevronRight`, `ChevronLeft`, `Users` sono già importati.)

- [ ] **Step 2: Aggiungi state e mutation**

Dentro `GiocatoriPage()`, dopo le dichiarazioni esistenti:

```jsx
const qc = useQueryClient()
const [showAdd, setShowAdd]   = useState(false)
const [savingAdd, setSavingAdd] = useState(false)

async function handleAddGiocatore(formData) {
  setSavingAdd(true)
  try {
    const { error } = await supabase.from('giocatori').insert([{
      ...formData,
      societa_id: societaId,
      attivo: true,
      squadra2:  formData.squadra2  || null,
      squadra3:  formData.squadra3  || null,
      data_nascita:       formData.data_nascita       || null,
      data_iscrizione:    formData.data_iscrizione    || null,
      cert_medico_scadenza: formData.cert_medico_scadenza || null,
      numero_maglia:      formData.numero_maglia ? parseInt(formData.numero_maglia) : null,
    }])
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
    setShowAdd(false)
  } catch (err) {
    alert('Errore: ' + err.message)
  } finally {
    setSavingAdd(false)
  }
}
```

- [ ] **Step 3: Aggiungi pulsante "+ Nuovo giocatore" nell'header**

Sostituisci il componente `header` esistente:

```jsx
const header = (
  <AppHeader
    title="Giocatori"
    subtitle={selectedSquadra ? `${giocatoriFiltrati.length} atleti` : 'Seleziona una squadra'}
    displayName={displayName} logout={logout} societaNome={societaNome}
    action={
      <button
        onClick={() => setShowAdd(true)}
        className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold">
        <Plus size={14} /> Nuovo
      </button>
    }
  />
)
```

> **Nota:** Se `AppHeader` non accetta una prop `action`, aggiungi il pulsante direttamente dopo `{header}` come FAB fisso:
>
> ```jsx
> <button
>   onClick={() => setShowAdd(true)}
>   className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform lg:bottom-6">
>   <Plus size={24} />
> </button>
> ```

- [ ] **Step 4: Aggiungi modal slide-over**

Prima del `return` finale (o dopo il JSX principale), aggiungi il modal. Inseriscilo **dopo** l'ultimo elemento JSX nell'albero di ritorno, prima della chiusura del fragment/div principale:

```jsx
{/* Modal nuovo giocatore */}
{showAdd && (
  <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
    <div className="min-h-full flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Nuovo giocatore</h2>
          <button onClick={() => setShowAdd(false)}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <div className="px-5 pt-4">
          <GiocatoreForm
            onSave={handleAddGiocatore}
            onCancel={() => setShowAdd(false)}
            saving={savingAdd}
          />
        </div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verifica in browser**

- Clicca "+ Nuovo" → si apre il modal
- Compila cognome, nome, squadra → Salva → il giocatore appare nella lista
- La squadra nuova appare nella lista squadre dopo reload

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/secretary/GiocatoriPage.jsx
git commit -m "feat: GiocatoriPage — inserimento nuovo giocatore via modal"
```

---

## Task 6: GiocatoreDetail.jsx — tab Anagrafica + Documenti

**Files:**
- Modify: `frontend/src/pages/secretary/GiocatoreDetail.jsx`

- [ ] **Step 1: Aggiungi import**

In cima al file, dopo gli import esistenti:

```jsx
import GiocatoreForm from './GiocatoreForm'
```

- [ ] **Step 2: Aggiorna TABS**

Sostituisci la costante `TABS`:

```jsx
const TABS = [
  { id: 'anagrafica', label: 'Anagrafica' },
  { id: 'note',       label: 'Note' },
  { id: 'quote',      label: 'Quote' },
  { id: 'cert',       label: 'Certificato' },
  { id: 'documenti',  label: 'Documenti' },
]
```

- [ ] **Step 3: Cambia il tab di default**

```jsx
const [activeTab, setActiveTab] = useState('anagrafica')
```

- [ ] **Step 4: Aggiungi stato per anagrafica**

Dopo `const [uploading, setUploading] = useState(false)`:

```jsx
const [savingAnagrafica, setSavingAnagrafica] = useState(false)
const [annoAtt730, setAnnoAtt730]             = useState(new Date().getFullYear())
```

- [ ] **Step 5: Estendi la query giocatore**

Sostituisci la `queryFn` della query `giocatore-detail`:

```jsx
queryFn: async () => {
  const { data } = await supabase
    .from('giocatori')
    .select(`id, nome, cognome, squadra, squadra2, squadra3,
             cert_medico_scadenza, cert_medico_url,
             data_nascita, luogo_nascita, codice_fiscale,
             indirizzo, citta, cap, provincia,
             nome_genitore, cognome_genitore, codice_fiscale_genitore,
             telefono, email_genitore, data_iscrizione, numero_maglia`)
    .eq('id', id).eq('societa_id', societaId).single()
  return data
},
```

- [ ] **Step 6: Aggiungi handleSaveAnagrafica**

Dopo `handleAddQuota`:

```jsx
async function handleSaveAnagrafica(formData) {
  setSavingAnagrafica(true)
  try {
    const { error } = await supabase.from('giocatori').update({
      cognome:                  formData.cognome,
      nome:                     formData.nome,
      data_nascita:             formData.data_nascita || null,
      luogo_nascita:            formData.luogo_nascita || null,
      codice_fiscale:           formData.codice_fiscale || null,
      indirizzo:                formData.indirizzo || null,
      citta:                    formData.citta || null,
      cap:                      formData.cap || null,
      provincia:                formData.provincia || null,
      nome_genitore:            formData.nome_genitore || null,
      cognome_genitore:         formData.cognome_genitore || null,
      codice_fiscale_genitore:  formData.codice_fiscale_genitore || null,
      telefono:                 formData.telefono || null,
      email_genitore:           formData.email_genitore || null,
      squadra:                  formData.squadra,
      squadra2:                 formData.squadra2 || null,
      squadra3:                 formData.squadra3 || null,
      numero_maglia:            formData.numero_maglia ? parseInt(formData.numero_maglia) : null,
      data_iscrizione:          formData.data_iscrizione || null,
      cert_medico_scadenza:     formData.cert_medico_scadenza || null,
    }).eq('id', id).eq('societa_id', societaId)
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['giocatore-detail', id] })
    qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
  } catch (err) {
    alert('Errore: ' + err.message)
  } finally {
    setSavingAnagrafica(false)
  }
}
```

- [ ] **Step 7: Aggiungi tab Anagrafica nel JSX**

Nel blocco `<div className="flex-1 px-4 py-4 pb-24">`, aggiungi **prima** del blocco `{activeTab === 'note' && ...}`:

```jsx
{/* ── ANAGRAFICA ── */}
{activeTab === 'anagrafica' && (
  <GiocatoreForm
    initialValues={giocatore}
    onSave={handleSaveAnagrafica}
    onCancel={() => setActiveTab('note')}
    saving={savingAnagrafica}
  />
)}
```

- [ ] **Step 8: Aggiungi tab Documenti nel JSX**

Dopo il blocco `{activeTab === 'cert' && ...}`:

```jsx
{/* ── DOCUMENTI ── */}
{activeTab === 'documenti' && (
  <div className="space-y-4">
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 mb-3">Attestazione spese sportive (Modello 730)</p>
      <p className="text-xs text-gray-400 mb-4">
        Genera il documento per la detrazione IRPEF 19% (limite €210, art. 15 TUIR)
      </p>
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500">Anno:</label>
        <select
          value={annoAtt730}
          onChange={e => setAnnoAtt730(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
          {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <a
          href={`/secretary/attestazione730/${id}?anno=${annoAtt730}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold">
          📋 Genera attestazione
        </a>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 9: Verifica in browser**

- Apri un giocatore → tab "Anagrafica" appare per prima
- Compila campi codice fiscale, genitore → Salva → i dati persistono al reload
- Tab "Documenti" → il link apre una nuova tab (per ora 404 finché non esiste Task 10)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/secretary/GiocatoreDetail.jsx
git commit -m "feat: GiocatoreDetail — tab Anagrafica edit + tab Documenti 730"
```

---

## Task 7: PagamentoModal.jsx

**Files:**
- Create: `frontend/src/pages/secretary/PagamentoModal.jsx`

- [ ] **Step 1: Crea il file**

```jsx
import { useState } from 'react'
import { format } from 'date-fns'
import { X, Printer } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

const METODI = [
  { id: 'contanti', label: 'Contanti',    icon: '💵' },
  { id: 'bonifico', label: 'Bonifico',    icon: '🏦' },
  { id: 'pos',      label: 'POS / Carta', icon: '💳' },
]

export default function PagamentoModal({ quota, giocatore, societaId, onClose }) {
  const qc = useQueryClient()
  const [metodo, setMetodo]             = useState('contanti')
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [completedQuoteId, setCompletedQuoteId] = useState(null)

  const confirmMut = useMutation({
    mutationFn: async () => {
      // Genera numero_ricevuta progressivo per anno
      const anno = new Date(dataPagamento).getFullYear()
      const { data: maxRow } = await supabase
        .from('quote')
        .select('numero_ricevuta')
        .eq('societa_id', societaId)
        .not('numero_ricevuta', 'is', null)
        .gte('data_pagamento', `${anno}-01-01`)
        .lte('data_pagamento', `${anno}-12-31`)
        .order('numero_ricevuta', { ascending: false })
        .limit(1)
        .maybeSingle()

      const numero_ricevuta = (maxRow?.numero_ricevuta ?? 0) + 1

      const { error } = await supabase.from('quote').update({
        pagato: true,
        metodo_pagamento: metodo,
        data_pagamento:   dataPagamento,
        numero_ricevuta,
      }).eq('id', quota.id)
      if (error) throw error
      return quota.id
    },
    onSuccess: (quoteId) => {
      qc.invalidateQueries({ queryKey: ['quote-segreteria',   societaId] })
      qc.invalidateQueries({ queryKey: ['quote-giocatore',    giocatore?.id] })
      qc.invalidateQueries({ queryKey: ['segreteria-quote-aperte', societaId] })
      setCompletedQuoteId(quoteId)
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">

        {/* Header */}
        <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-sm">✅ Registra pagamento</span>
          <button onClick={onClose}><X size={18} className="opacity-70" /></button>
        </div>

        <div className="p-4">
          {/* Card quota */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex justify-between items-center">
            <div>
              <p className="font-bold text-gray-900 text-sm">{giocatore?.cognome} {giocatore?.nome}</p>
              <p className="text-xs text-gray-500 mt-0.5">{quota.descrizione || quota.tipo}</p>
            </div>
            <p className="text-2xl font-extrabold text-green-600">€{quota.importo}</p>
          </div>

          {completedQuoteId ? (
            /* Stato post-conferma */
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-green-700 font-semibold text-sm mb-3">Pagamento registrato ✓</p>
                <a
                  href={`/secretary/ricevuta/${completedQuoteId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                  <Printer size={15} /> Stampa ricevuta
                </a>
              </div>
              <button onClick={onClose}
                className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">
                Chiudi
              </button>
            </div>
          ) : (
            /* Form pagamento */
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Metodo di pagamento</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {METODI.map(m => (
                  <button key={m.id} type="button" onClick={() => setMetodo(m.id)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors ${
                      metodo === m.id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <span className="text-2xl">{m.icon}</span>
                    <span className={`text-xs font-semibold ${metodo === m.id ? 'text-green-700' : 'text-gray-600'}`}>
                      {m.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mb-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Data pagamento *
                </label>
                <input type="date" value={dataPagamento}
                  onChange={e => setDataPagamento(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">
                  Annulla
                </button>
                <button type="button"
                  onClick={() => confirmMut.mutate()}
                  disabled={confirmMut.isPending || !dataPagamento}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 active:scale-95 transition-transform">
                  {confirmMut.isPending ? 'Salvataggio...' : '✅ Conferma pagamento'}
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center mt-3">Dopo la conferma potrai stampare la ricevuta</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/secretary/PagamentoModal.jsx
git commit -m "feat: PagamentoModal — registra metodo + data + genera numero ricevuta"
```

---

## Task 8: QuotePage.jsx — integra PagamentoModal

**Files:**
- Modify: `frontend/src/pages/secretary/QuotePage.jsx`

- [ ] **Step 1: Aggiungi import**

```jsx
import { Printer } from 'lucide-react'
import PagamentoModal from './PagamentoModal'
```

- [ ] **Step 2: Aggiungi state**

Dopo `const [saving, setSaving] = useState(false)`:

```jsx
const [pagamentoQuota, setPagamentoQuota] = useState(null) // quota da pagare
```

- [ ] **Step 3: Estendi la query allQuote**

Aggiorna `.select(...)` per includere i nuovi campi:

```jsx
.select('id, giocatore_id, tipo, descrizione, importo, data_scadenza, pagato, metodo_pagamento, data_pagamento, numero_ricevuta')
```

- [ ] **Step 4: Sostituisci il pulsante "Segna pagato" e aggiungi icona stampa**

Nel blocco della lista quote, sostituisci `<div className="flex flex-col gap-1 shrink-0">`:

```jsx
<div className="flex flex-col gap-1 shrink-0">
  {q.pagato ? (
    <>
      {/* Stampa ricevuta (solo se ha numero_ricevuta) */}
      {q.numero_ricevuta && (
        <a
          href={`/secretary/ricevuta/${q.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 flex items-center justify-center"
          title="Stampa ricevuta">
          <Printer size={14} />
        </a>
      )}
      {/* Segna non pagato */}
      <button
        onClick={() => unpagatoMut.mutate(q.id)}
        title="Segna non pagato"
        className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 flex items-center justify-center">
        <Check size={14} />
      </button>
    </>
  ) : (
    /* Apre PagamentoModal */
    <button
      onClick={() => setPagamentoQuota(q)}
      title="Segna pagato"
      className="w-8 h-8 rounded-lg bg-green-100 text-green-600 hover:bg-green-200 flex items-center justify-center">
      <Check size={14} />
    </button>
  )}
  <button
    onClick={() => deleteMut.mutate(q.id)}
    className="w-8 h-8 rounded-lg bg-gray-50 text-gray-300 hover:text-red-400 flex items-center justify-center">
    <Trash2 size={14} />
  </button>
</div>
```

- [ ] **Step 5: Sostituisci togglePagatoMut con unpagatoMut**

Elimina `togglePagatoMut` e sostituiscila con:

```jsx
const unpagatoMut = useMutation({
  mutationFn: async (id) => {
    const { error } = await supabase.from('quote').update({
      pagato: false,
      metodo_pagamento: null,
      data_pagamento:   null,
      numero_ricevuta:  null,
    }).eq('id', id)
    if (error) throw error
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['quote-segreteria', societaId] })
    qc.invalidateQueries({ queryKey: ['segreteria-quote-aperte', societaId] })
  },
})
```

- [ ] **Step 6: Aggiungi PagamentoModal al return**

Prima della chiusura del tag radice del return, aggiungi:

```jsx
{pagamentoQuota && (
  <PagamentoModal
    quota={pagamentoQuota}
    giocatore={giocatoreMap[pagamentoQuota.giocatore_id]}
    societaId={societaId}
    onClose={() => setPagamentoQuota(null)}
  />
)}
```

- [ ] **Step 7: Verifica in browser**

- Clicca il Check su una quota non pagata → si apre PagamentoModal
- Seleziona "Contanti", conferma → quota diventa "Pagato", appare icona 🖨
- Clicca 🖨 → apre `/secretary/ricevuta/:id` in nuova tab (per ora 404 finché Task 9 non è completo)
- Il Check su una quota già pagata la ripristina a "Da pagare" e cancella metodo/data

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/secretary/QuotePage.jsx
git commit -m "feat: QuotePage — PagamentoModal + icona stampa ricevuta"
```

---

## Task 9: RicevutaPage.jsx — pagina di stampa ricevuta

**Files:**
- Create: `frontend/src/pages/secretary/RicevutaPage.jsx`

- [ ] **Step 1: Crea il file**

```jsx
import { useParams } from 'react-router-dom'
import { useQuery }  from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { supabase }  from '../../lib/supabase'
import { useAuth }   from '../../hooks/useAuth'
import LoadingSpinner from '../../components/LoadingSpinner'

const METODO_LABEL = { contanti: 'Contanti', bonifico: 'Bonifico', pos: 'POS / Carta' }

// Stili inline per celle tabella (garantiti in stampa)
const tdL   = { border: '1px solid #ccc', padding: '5px 10px', width: 110, color: '#444', background: '#fafafa', fontFamily: 'sans-serif', fontSize: 13 }
const tdV   = { border: '1px solid #ccc', padding: '5px 10px', fontFamily: 'sans-serif', fontSize: 13 }
const tdVM  = { ...tdV, fontFamily: 'monospace' }
const payTd = { border: '1px solid #ccc', padding: '7px 10px', fontFamily: 'sans-serif', fontSize: 13 }

export default function RicevutaPage() {
  const { quoteId } = useParams()
  const { societaId } = useAuth()

  const { data: quota, isLoading: loadQ } = useQuery({
    queryKey: ['ricevuta-quota', quoteId],
    enabled: !!quoteId && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, tipo, descrizione, importo, data_pagamento, metodo_pagamento, numero_ricevuta, giocatore_id')
        .eq('id', quoteId).eq('societa_id', societaId).single()
      return data
    },
  })

  const { data: giocatore, isLoading: loadG } = useQuery({
    queryKey: ['ricevuta-giocatore', quota?.giocatore_id],
    enabled: !!quota?.giocatore_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('nome, cognome, data_nascita, luogo_nascita, codice_fiscale, indirizzo, cap, provincia, nome_genitore, cognome_genitore, codice_fiscale_genitore')
        .eq('id', quota.giocatore_id).single()
      return data
    },
  })

  const { data: soc, isLoading: loadS } = useQuery({
    queryKey: ['societa-dati', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('societa')
        .select('nome_completo, nome, codice_fiscale, indirizzo, citta, cap, provincia, telefono, email, logo_url')
        .eq('id', societaId).single()
      return data
    },
  })

  if (loadQ || loadG || loadS) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>
  }
  if (!quota || !giocatore || !soc) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dati non trovati</div>
  }

  const nomeAsd   = soc.nome_completo || soc.nome
  const anno      = quota.data_pagamento ? new Date(quota.data_pagamento).getFullYear() : new Date().getFullYear()
  const numRic    = quota.numero_ricevuta
    ? `${anno}-${String(quota.numero_ricevuta).padStart(4, '0')}`
    : '—'
  const dataPag   = quota.data_pagamento   ? format(parseISO(quota.data_pagamento),   'd/MM/yyyy') : '—'
  const dataNasc  = giocatore.data_nascita ? format(parseISO(giocatore.data_nascita), 'd/MM/yyyy') : '—'

  const footerParts = [
    soc.indirizzo,
    soc.citta && `${soc.cap ? soc.cap + ' ' : ''}${soc.citta}${soc.provincia ? ` (${soc.provincia})` : ''}`,
  ].filter(Boolean).join(', ')
  const footerContatti = [
    soc.codice_fiscale && `C.F.: ${soc.codice_fiscale}`,
    soc.telefono && `Tel: ${soc.telefono}`,
    soc.email && `email: ${soc.email}`,
  ].filter(Boolean).join(' · ')

  const mailtoHref = `mailto:?subject=${encodeURIComponent(`Ricevuta N. ${numRic}`)}&body=${encodeURIComponent(`Ricevuta di pagamento N. ${numRic}\n\n${nomeAsd}`)}`

  return (
    <>
      <style>{`
        @media print {
          .toolbar { display: none !important; }
          body { margin: 0; background: white; }
          .receipt { box-shadow: none !important; max-width: 100% !important; padding: 20mm 20mm !important; }
        }
        body { background: #f3f4f6; }
      `}</style>

      {/* Toolbar (nascosta in stampa) */}
      <div className="toolbar max-w-3xl mx-auto mb-4 mt-4 flex items-center gap-3 bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-sans">
        <span className="flex-1 font-semibold truncate">
          📄 Ricevuta N. {numRic} — {giocatore.cognome} {giocatore.nome}
        </span>
        <a href={mailtoHref}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-500 text-slate-300 text-xs hover:bg-slate-700">
          ✉ Email
        </a>
        <button onClick={() => window.print()}
          className="shrink-0 px-4 py-1.5 bg-purple-600 rounded-lg text-xs font-semibold hover:bg-purple-700">
          🖨 Stampa / PDF
        </button>
      </div>

      {/* Documento */}
      <div className="receipt max-w-3xl mx-auto bg-white px-14 py-12 shadow-lg mb-8" style={{ fontFamily: 'Georgia, serif' }}>

        {/* Logo / Nome ASD */}
        <div style={{ marginBottom: 28 }}>
          {soc.logo_url
            ? <img src={soc.logo_url} alt="logo" style={{ height: 56, objectFit: 'contain' }} />
            : <div style={{ fontSize: 32, fontStyle: 'italic', fontWeight: 'bold', color: '#111' }}>🏀 {nomeAsd}</div>
          }
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, fontFamily: 'sans-serif' }}>
          Ricevuta / Quietanza di pagamento N. {numRic}
        </h1>

        <p style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 16, fontFamily: 'sans-serif' }}>
          {nomeAsd}{' '}
          <span style={{ fontWeight: 'normal' }}>dichiara di aver ricevuto</span>
        </p>

        {/* Tabella dati pagante / atleta */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <tbody>
            {(giocatore.cognome_genitore || giocatore.nome_genitore) && (
              <tr>
                <td style={tdL}>Da</td>
                <td style={tdV}>{giocatore.cognome_genitore} {giocatore.nome_genitore}</td>
                {giocatore.codice_fiscale_genitore
                  ? <><td style={tdL}>codice fiscale</td><td style={tdVM}>{giocatore.codice_fiscale_genitore}</td></>
                  : <td colSpan={2} style={tdV}></td>
                }
              </tr>
            )}
            <tr>
              <td style={tdL}>per</td>
              <td colSpan={3} style={tdV}>{giocatore.cognome} {giocatore.nome}</td>
            </tr>
            {(giocatore.luogo_nascita || giocatore.data_nascita) && (
              <tr>
                <td style={tdL}>nato a</td>
                <td style={tdV}>{giocatore.luogo_nascita ?? '—'}</td>
                <td style={tdL}>il</td>
                <td style={tdV}>{dataNasc}</td>
              </tr>
            )}
            {giocatore.codice_fiscale && (
              <tr>
                <td style={tdL}>codice fiscale</td>
                <td colSpan={3} style={tdVM}>{giocatore.codice_fiscale}</td>
              </tr>
            )}
            {(giocatore.indirizzo || giocatore.cap) && (
              <tr>
                <td style={tdL}>indirizzo</td>
                <td style={tdV}>{giocatore.indirizzo ?? '—'}</td>
                <td style={tdL}>CAP</td>
                <td style={tdV}>{giocatore.cap ?? '—'}</td>
              </tr>
            )}
            {giocatore.provincia && (
              <tr>
                <td style={tdL}>provincia</td>
                <td colSpan={3} style={tdV}>{giocatore.provincia}</td>
              </tr>
            )}
          </tbody>
        </table>

        <p style={{ fontSize: 13, marginBottom: 14, fontFamily: 'sans-serif' }}>per quanto sotto dettagliato</p>

        {/* Tabella pagamento */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <thead>
            <tr>
              {['Descrizione', 'Metodo di pagamento', 'Data di pagamento', 'Importo'].map(h => (
                <th key={h} style={{ border: '1px solid #ccc', padding: '7px 10px', background: '#f8f8f8', textAlign: 'left', fontFamily: 'sans-serif', fontSize: 13 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={payTd}>{quota.descrizione || quota.tipo}</td>
              <td style={payTd}>{quota.metodo_pagamento ? METODO_LABEL[quota.metodo_pagamento] : '—'}</td>
              <td style={payTd}>{dataPag}</td>
              <td style={{ ...payTd, textAlign: 'right' }}>{quota.importo?.toFixed(2)} €</td>
            </tr>
            <tr style={{ fontWeight: 'bold', background: '#fafafa' }}>
              <td colSpan={3} style={{ ...payTd, textAlign: 'right' }}>Totale</td>
              <td style={{ ...payTd, textAlign: 'right' }}>{quota.importo?.toFixed(2)} €</td>
            </tr>
          </tbody>
        </table>

        {/* Note */}
        <div style={{ display: 'flex', border: '1px solid #ccc', marginBottom: 24 }}>
          <div style={{ padding: '8px 10px', fontSize: 13, background: '#fafafa', borderRight: '1px solid #ccc', minWidth: 60, fontFamily: 'sans-serif' }}>Note</div>
          <div style={{ padding: '8px 10px', fontSize: 13, flex: 1, minHeight: 50 }}></div>
        </div>

        {/* Testo legale */}
        <div style={{ fontSize: 10, color: '#555', marginBottom: 40, fontFamily: 'sans-serif', lineHeight: 1.5 }}>
          <p style={{ marginBottom: 4 }}>1. Operazione esente da IVA ai sensi dell'art. 10 del DPR n. 633 26/10/1972 o dell'art. 36-bis DL n.75 del 22/06/2023</p>
          <p>2. Esente da marca da bollo ai sensi art. 1, comma 646, L. 145/2018 che ha modificato l'art. 27 bis della tab di cui all'allegato B annesso al D.P.R. 642/1972</p>
        </div>

        {/* Chiusura */}
        <div style={{ textAlign: 'right', fontSize: 13, marginBottom: 32, fontFamily: 'sans-serif' }}>
          {soc.citta ?? ''}, {dataPag}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #ccc', paddingTop: 14, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <strong style={{ fontSize: 13, color: '#111', display: 'block', marginBottom: 3 }}>{nomeAsd}</strong>
          <span style={{ fontSize: 11, color: '#555' }}>
            {footerParts}{footerParts && footerContatti ? ' | ' : ''}{footerContatti}
          </span>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verifica in browser**

- Paga una quota da QuotePage → clicca 🖨 → si apre `/secretary/ricevuta/:id` in nuova tab
- La ricevuta mostra nome ASD, dati giocatore, importo, metodo, data
- Clicca "🖨 Stampa / PDF" → si apre il dialogo di stampa del browser, toolbar scompare
- Se la società ha un logo, appare; altrimenti appare il testo con emoji 🏀
- Campi vuoti (indirizzo, genitore ecc.) non producono righe vuote nella tabella

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/secretary/RicevutaPage.jsx
git commit -m "feat: RicevutaPage — ricevuta di pagamento stampabile"
```

---

## Task 10: Attestazione730Page.jsx — pagina di stampa attestazione 730

**Files:**
- Create: `frontend/src/pages/secretary/Attestazione730Page.jsx`

- [ ] **Step 1: Crea il file**

```jsx
import { useState }         from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery }         from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { supabase }         from '../../lib/supabase'
import { useAuth }          from '../../hooks/useAuth'
import LoadingSpinner       from '../../components/LoadingSpinner'

const METODO_LABEL = { contanti: 'Contanti', bonifico: 'Bonifico', pos: 'POS / Carta' }

// Stili inline
const secLbl = { fontFamily: 'sans-serif', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#9ca3af', marginBottom: 8 }
const iTab   = { width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }
const tdL    = { border: '1px solid #d1d5db', padding: '6px 10px', background: '#f9fafb', color: '#555', width: 160, fontFamily: 'sans-serif' }
const tdV    = { border: '1px solid #d1d5db', padding: '6px 10px', fontFamily: 'sans-serif' }
const qTd    = { border: '1px solid #d1d5db', padding: '6px 10px', fontFamily: 'sans-serif', fontSize: 13 }

export default function Attestazione730Page() {
  const { giocId } = useParams()
  const [searchParams]  = useSearchParams()
  const { societaId }   = useAuth()
  const currentYear     = new Date().getFullYear()
  const [anno, setAnno] = useState(parseInt(searchParams.get('anno') ?? currentYear, 10))

  const { data: giocatore, isLoading: loadG } = useQuery({
    queryKey: ['att730-giocatore', giocId, societaId],
    enabled: !!giocId && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('nome, cognome, data_nascita, codice_fiscale')
        .eq('id', giocId).eq('societa_id', societaId).single()
      return data
    },
  })

  const { data: quotePagate = [], isLoading: loadQ } = useQuery({
    queryKey: ['att730-quote', giocId, anno],
    enabled: !!giocId && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, descrizione, tipo, importo, data_pagamento, metodo_pagamento')
        .eq('giocatore_id', giocId).eq('societa_id', societaId)
        .eq('pagato', true)
        .gte('data_pagamento', `${anno}-01-01`)
        .lte('data_pagamento', `${anno}-12-31`)
        .order('data_pagamento')
      return data ?? []
    },
  })

  const { data: soc, isLoading: loadS } = useQuery({
    queryKey: ['societa-dati', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('societa')
        .select('nome_completo, nome, codice_fiscale, indirizzo, citta, cap, provincia, telefono, email, logo_url')
        .eq('id', societaId).single()
      return data
    },
  })

  if (loadG || loadQ || loadS) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>
  }
  if (!giocatore || !soc) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dati non trovati</div>
  }

  const nomeAsd    = soc.nome_completo || soc.nome
  const totale     = quotePagate.reduce((s, q) => s + (q.importo ?? 0), 0)
  const detraibile = Math.min(totale, 210)
  const dataNasc   = giocatore.data_nascita ? format(parseISO(giocatore.data_nascita), 'd/MM/yyyy') : '—'
  const oggi       = format(new Date(), 'd/MM/yyyy')

  const indirizzoSoc = [
    soc.indirizzo,
    soc.citta && `${soc.cap ? soc.cap + ' ' : ''}${soc.citta}${soc.provincia ? ` (${soc.provincia})` : ''}`,
  ].filter(Boolean).join(' — ')

  const footerContatti = [
    soc.codice_fiscale && `C.F.: ${soc.codice_fiscale}`,
    soc.telefono && `Tel: ${soc.telefono}`,
    soc.email && `email: ${soc.email}`,
  ].filter(Boolean).join(' · ')

  const anni = [currentYear, currentYear - 1, currentYear - 2]

  return (
    <>
      <style>{`
        @media print {
          .toolbar { display: none !important; }
          body { margin: 0; background: white; }
          .doc { box-shadow: none !important; max-width: 100% !important; padding: 20mm 20mm !important; }
        }
        body { background: #f3f4f6; }
      `}</style>

      {/* Toolbar */}
      <div className="toolbar max-w-3xl mx-auto mb-4 mt-4 flex items-center gap-3 bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-sans">
        <span className="flex-1 font-semibold truncate">
          📋 Attestazione 730 — {giocatore.cognome} {giocatore.nome}
        </span>
        <span className="text-slate-300 text-xs shrink-0">Anno:</span>
        <select value={anno} onChange={e => setAnno(Number(e.target.value))}
          className="bg-slate-700 text-white border border-slate-500 rounded-lg px-2 py-1 text-xs">
          {anni.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={() => window.print()}
          className="shrink-0 px-4 py-1.5 bg-purple-600 rounded-lg text-xs font-semibold hover:bg-purple-700">
          🖨 Stampa / PDF
        </button>
      </div>

      {/* Documento */}
      <div className="doc max-w-3xl mx-auto bg-white px-14 py-12 shadow-lg mb-8" style={{ fontFamily: 'Georgia, serif' }}>

        {/* Logo */}
        <div style={{ marginBottom: 20 }}>
          {soc.logo_url
            ? <img src={soc.logo_url} alt="logo" style={{ height: 56, objectFit: 'contain' }} />
            : <div style={{ fontSize: 30, fontStyle: 'italic', fontWeight: 'bold', color: '#111' }}>🏀 {nomeAsd}</div>
          }
        </div>

        <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4, fontFamily: 'sans-serif' }}>
          Attestazione spese sportive — Anno {anno}
        </div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 24, fontFamily: 'sans-serif' }}>
          Ai sensi dell'art. 15, comma 1, lett. i-quinquies) del D.P.R. 917/1986 (TUIR)
        </div>

        {/* Società */}
        <p style={secLbl}>Società sportiva</p>
        <table style={iTab}>
          <tbody>
            <tr><td style={tdL}>Denominazione</td><td style={tdV}>{nomeAsd}</td></tr>
            {soc.codice_fiscale && <tr><td style={tdL}>Codice fiscale</td><td style={{ ...tdV, fontFamily: 'monospace' }}>{soc.codice_fiscale}</td></tr>}
            {indirizzoSoc && <tr><td style={tdL}>Indirizzo</td><td style={tdV}>{indirizzoSoc}</td></tr>}
          </tbody>
        </table>

        {/* Atleta */}
        <p style={secLbl}>Atleta</p>
        <table style={iTab}>
          <tbody>
            <tr><td style={tdL}>Cognome e nome</td><td style={{ ...tdV, fontWeight: 'bold' }}>{giocatore.cognome} {giocatore.nome}</td></tr>
            {giocatore.data_nascita && <tr><td style={tdL}>Data di nascita</td><td style={tdV}>{dataNasc}</td></tr>}
            {giocatore.codice_fiscale && <tr><td style={tdL}>Codice fiscale</td><td style={{ ...tdV, fontFamily: 'monospace' }}>{giocatore.codice_fiscale}</td></tr>}
          </tbody>
        </table>

        {/* Quote */}
        <p style={secLbl}>Dettaglio pagamenti anno {anno}</p>
        {quotePagate.length === 0 ? (
          <p style={{ fontSize: 13, color: '#999', marginBottom: 20, fontFamily: 'sans-serif' }}>
            Nessun pagamento registrato per il {anno}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead>
              <tr>
                {['Descrizione', 'Data', 'Metodo', 'Importo'].map(h => (
                  <th key={h} style={{ background: '#f3f4f6', border: '1px solid #d1d5db', padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontFamily: 'sans-serif', fontSize: 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotePagate.map(q => (
                <tr key={q.id}>
                  <td style={qTd}>{q.descrizione || q.tipo}</td>
                  <td style={qTd}>{q.data_pagamento ? format(parseISO(q.data_pagamento), 'd/MM/yyyy') : '—'}</td>
                  <td style={qTd}>{q.metodo_pagamento ? METODO_LABEL[q.metodo_pagamento] : '—'}</td>
                  <td style={{ ...qTd, textAlign: 'right' }}>{q.importo?.toFixed(2)} €</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: '#fafafa' }}>
                <td colSpan={3} style={{ ...qTd, textAlign: 'right' }}>Totale pagato anno {anno}</td>
                <td style={{ ...qTd, textAlign: 'right', fontSize: 16, color: '#059669' }}>{totale.toFixed(2)} €</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Box detraibile */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, marginBottom: 24, fontFamily: 'sans-serif', fontSize: 13 }}>
          <strong style={{ display: 'block', color: '#059669', fontSize: 15, marginBottom: 4 }}>
            Importo detraibile: € {detraibile.toFixed(2)}
          </strong>
          <small style={{ color: '#6b7280', fontSize: 11 }}>
            Il limite massimo detraibile per spese sportive di ragazzi 5–18 anni è di € 210,00 (art. 15 TUIR). La detrazione IRPEF è del 19% sull'importo detraibile.
          </small>
        </div>

        {/* Dichiarazione */}
        <div style={{ fontSize: 12, color: '#444', marginBottom: 32, lineHeight: 1.6, fontFamily: 'sans-serif' }}>
          La <strong>{nomeAsd}</strong> certifica che l'atleta sopra indicato ha praticato attività sportiva dilettantistica presso la nostra società nel corso dell'anno {anno}, e che le quote indicate sono state regolarmente pagate e registrate.
        </div>

        {/* Chiusura con firma */}
        <div style={{ textAlign: 'right', fontSize: 13, marginBottom: 40, fontFamily: 'sans-serif' }}>
          {soc.citta ?? ''}, {oggi}<br /><br />
          Il responsabile amministrativo<br />
          <span style={{ fontStyle: 'italic', fontSize: 15, fontFamily: 'Georgia, serif', color: '#7c3aed' }}>____________________</span>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <strong style={{ fontSize: 13, color: '#111', display: 'block', marginBottom: 3 }}>{nomeAsd}</strong>
          <span style={{ fontSize: 11, color: '#777' }}>
            {[indirizzoSoc, footerContatti].filter(Boolean).join(' | ')}
          </span>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verifica in browser**

- Vai su GiocatoreDetail → tab "Documenti" → seleziona anno → "Genera attestazione"
- Si apre una nuova tab con l'attestazione
- La tabella mostra le quote pagate nell'anno selezionato (solo quelle con `data_pagamento` nell'anno)
- Il box verde mostra il detraibile: `min(totale, 210)` €
- Cambia anno nel selettore → la tabella si aggiorna senza ricaricare la pagina
- Clicca "🖨 Stampa / PDF" → toolbar scompare, documento occupa la pagina intera

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/secretary/Attestazione730Page.jsx
git commit -m "feat: Attestazione730Page — attestazione spese sportive per modello 730"
```

---

## Checklist finale di verifica

Dopo aver completato tutti i task, verifica questo flusso end-to-end:

- [ ] Vai a `/secretary/impostazioni` → inserisci nome ASD, CF, indirizzo, carica un logo → Salva
- [ ] Vai a `/secretary/giocatori` → "+ Nuovo" → inserisci atleta con genitore → Salva
- [ ] Apri il giocatore → tab "Anagrafica" → controlla che i campi siano precompilati → modifica qualcosa → Salva
- [ ] Tab "Quote" → aggiungi quota → vai su `/secretary/quote`
- [ ] Nella lista quote, clicca Check → PagamentoModal → seleziona "Bonifico" → Conferma
- [ ] Clicca "Stampa ricevuta" → la ricevuta ha logo/nome ASD + dati corretti + numero progressivo
- [ ] Ritorna sulla lista quote → appare icona 🖨 → la ricevuta apre in nuova tab
- [ ] Torna su GiocatoreDetail → tab "Documenti" → seleziona anno → "Genera attestazione"
- [ ] L'attestazione mostra le quote pagate con `data_pagamento` nell'anno, totale, detraibile
- [ ] Stampa ricevuta e attestazione: `window.print()` → toolbar scompare, document layout A4

---

## Note post-implementazione

- **Bucket `societa-loghi`**: deve essere creato manualmente nel Supabase Dashboard (Storage → New bucket, public: true) prima di testare l'upload logo
- **Migration SQL**: eseguire `supabase_migration_segreteria_v3.sql` nel SQL Editor di Supabase prima di qualsiasi altro task
- **RLS societa**: se la policy `segreteria_own_societa` fallisce (per policy esistenti confliggenti), verificare nel Dashboard sotto Authentication → Policies → tabella `societa` e aggiustare manualmente
- **Quote con data_pagamento null**: le quote pagate con il vecchio sistema (senza PagamentoModal) avranno `data_pagamento = null`; l'attestazione 730 filtra per `data_pagamento` nell'anno, quindi queste quote non appariranno. La segreteria può re-segnare pagamento tramite "segna non pagato" + PagamentoModal per aggiungere data e metodo
