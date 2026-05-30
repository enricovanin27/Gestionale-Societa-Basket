# Admin Setup Hub + Segreteria Wizard Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare Admin Setup in hub page con modali inline, ristrutturare GiocatoreWizard (step 1 = nome/cognome con salvataggio immediato), correggere auto-squadra genitore e bug SMTP in InvitaUtenteForm.

**Architecture:** `AdminSetupPage.jsx` (nuovo) sostituisce `SetupMenu.jsx` come hub con card + modali. `GiocatoreWizard` viene ristrutturato: step 1 fa INSERT immediato, step 2-4 fanno UPDATE. `InvitaUtenteForm` auto-popola le squadre genitore quando si collega un giocatore.

**Tech Stack:** React 18, Supabase JS v2, TanStack Query v5, Tailwind CSS, Lucide React, React Router v6

---

## File map

| File | Azione |
|------|--------|
| `frontend/src/components/InvitaUtenteForm.jsx` | MODIFY — auto-squadra genitore + messaggio SMTP |
| `frontend/src/pages/secretary/GiocatoreWizard.jsx` | MODIFY — ristruttura step (nome/cognome first) |
| `frontend/src/pages/admin/AdminSetupPage.jsx` | CREATE — hub + tutti i modali |
| `frontend/src/App.jsx` | MODIFY — swap SetupMenu → AdminSetupPage |
| `frontend/src/pages/admin/SetupMenu.jsx` | DELETE |

---

## Task 1: InvitaUtenteForm — auto-squadra genitore + messaggio SMTP

**File:** `frontend/src/components/InvitaUtenteForm.jsx`

- [ ] **Step 1.1 — Aggiorna query giocatori per includere squadra2 e squadra3**

  Trova la query `giocatori-link` (riga ~59-71) e aggiungi i campi mancanti:

  ```jsx
  // BEFORE (riga ~65)
  .select('id, nome, cognome, squadra, user_id, genitore_user_id')

  // AFTER
  .select('id, nome, cognome, squadra, squadra2, squadra3, user_id, genitore_user_id')
  ```

- [ ] **Step 1.2 — Sostituisci il select giocatoreId per genitore con auto-fill delle squadre**

  Trova il blocco `{form.ruolo === 'genitore' && (<>` (riga ~283-302). Sostituisci l'intero blocco:

  ```jsx
  {form.ruolo === 'genitore' && (<>
    {/* Squadre manuali — visibili solo se non c'è un giocatore selezionato */}
    {!form.giocatoreId && (
      [['genitore_squadra','Squadra figlio *'],['genitore_squadra2','Squadra figlio 2 (opz.)'],['genitore_squadra3','Squadra figlio 3 (opz.)']].map(([k, label]) => (
        <div key={k}>
          <label className="text-xs text-gray-400 mb-1 block">{label}</label>
          <select className={sel} value={form[k]} onChange={e => set(k, e.target.value)}>
            <option value="">— nessuna —</option>
            {squadre.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      ))
    )}

    {/* Collega a giocatore figlio */}
    <div>
      <label className="text-xs text-gray-400 mb-1 block">Collega a giocatore figlio (opz.)</label>
      <select
        className={sel}
        value={form.giocatoreId}
        onChange={e => {
          const gid = e.target.value
          const g = giocatoriGenitore.find(x => x.id === gid)
          setForm(f => ({
            ...f,
            giocatoreId:       gid,
            genitore_squadra:  g?.squadra  || '',
            genitore_squadra2: g?.squadra2 || '',
            genitore_squadra3: g?.squadra3 || '',
          }))
        }}
      >
        <option value="">— non collegare —</option>
        {giocatoriGenitore.map(g => (
          <option key={g.id} value={g.id}>{g.cognome} {g.nome} ({g.squadra})</option>
        ))}
      </select>
    </div>

    {/* Nota auto-fill */}
    {form.giocatoreId && (() => {
      const g = giocatoriGenitore.find(x => x.id === form.giocatoreId)
      const sq = [g?.squadra, g?.squadra2, g?.squadra3].filter(Boolean).join(', ')
      return (
        <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
          📌 Squadra impostata automaticamente: <strong>{sq}</strong>
        </p>
      )
    })()}
  </>)}
  ```

- [ ] **Step 1.3 — Migliora il messaggio di errore SMTP nel blocco catch**

  Trova il blocco `} catch (e) {` (riga ~170) e sostituisci:

  ```jsx
  } catch (e) {
    const msg = e.message ?? ''
    if (msg.toLowerCase().includes('sending mail') || msg.toLowerCase().includes('smtp')) {
      setErr(
        'Impossibile inviare l\'email di invito. ' +
        'Configura un provider SMTP su Supabase Dashboard → Settings → Auth → SMTP Settings, ' +
        'oppure abilita l\'invio email nel progetto Supabase.'
      )
    } else {
      setErr(msg)
    }
  }
  ```

- [ ] **Step 1.4 — Verifica visiva nel browser**

  Apri il Setup Admin → Utenti & Accessi → Nuovo utente → seleziona ruolo Genitore → scegli un giocatore dal dropdown. Verifica che:
  - I campi squadra manuali scompaiono
  - Appare la nota blu con la squadra del giocatore
  - Se deselezioni il giocatore, i campi manuali riappaiono

- [ ] **Step 1.5 — Commit**

  ```
  git add frontend/src/components/InvitaUtenteForm.jsx
  git commit -m "fix: auto-popola squadra genitore da giocatore collegato e migliora errore SMTP"
  ```

---

## Task 2: GiocatoreWizard — step 1 = nome/cognome con salvataggio immediato

**File:** `frontend/src/pages/secretary/GiocatoreWizard.jsx`

### Nuovo ordine step
| Step | Nome | Contenuto | Operazione DB |
|------|------|-----------|---------------|
| 1 | Nome | cognome *, nome *, squadra principale (opz.) | INSERT → giocatoreId |
| 2 | Squadre | squadra2, squadra3, maglia, iscrizione | UPDATE |
| 3 | Anagrafica | data_nascita, CF, indirizzo, ecc. | UPDATE |
| 4 | Genitore | dati genitore + account option | UPDATE + invite |

- [ ] **Step 2.1 — Aggiorna le costanti di stato iniziale**

  Sostituisci le costanti `STEP1_EMPTY`, `STEP2_EMPTY`, `STEP3_EMPTY` all'inizio del file:

  ```js
  // Step 1: Nome + Cognome + Squadra opzionale
  const STEP1_EMPTY = {
    cognome: '', nome: '', squadra: '',
  }

  // Step 2: Dati sportivi aggiuntivi
  const STEP2_EMPTY = {
    squadra2: '', squadra3: '',
    numero_maglia: '', data_iscrizione: '',
  }

  // Step 3: Anagrafica completa
  const STEP3_EMPTY = {
    data_nascita: '', luogo_nascita: '', codice_fiscale: '',
    indirizzo: '', citta: '', cap: '', provincia: '',
    cert_medico_scadenza: '',
  }

  // Step 4: Genitore
  const STEP4_EMPTY = {
    nome_genitore: '', cognome_genitore: '', codice_fiscale_genitore: '',
    telefono: '', email_genitore: '',
    accountOption: 'invite',
    genitore_user_id: null,
  }
  ```

- [ ] **Step 2.2 — Aggiorna StepIndicator**

  Sostituisci la funzione `StepIndicator`:

  ```jsx
  function StepIndicator({ step }) {
    const steps = ['Nome', 'Squadre', 'Anagrafica', 'Genitore']
    return (
      <div className="flex gap-2 mb-6">
        {steps.map((label, i) => {
          const n = i + 1
          const done    = step > n
          const current = step === n
          return (
            <div key={n} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                done    ? 'bg-green-500 text-white' :
                current ? 'bg-purple-600 text-white' :
                          'bg-gray-200 text-gray-400'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-[10px] font-medium ${current ? 'text-purple-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
          )
        })}
      </div>
    )
  }
  ```

- [ ] **Step 2.3 — Scrivi Step1 (nuovo)**

  Sostituisci l'intera funzione `Step1`:

  ```jsx
  function Step1({ data, onChange, onSave, onSaveAndContinue, onCancel, saving, squadreList, saveErr }) {
    const canSave = !!data.cognome.trim() && !!data.nome.trim()
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Cognome *</label>
            <input
              className={inp}
              value={data.cognome}
              onChange={e => onChange({ ...data, cognome: e.target.value })}
              placeholder="Rossi"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
            <input
              className={inp}
              value={data.nome}
              onChange={e => onChange({ ...data, nome: e.target.value })}
              placeholder="Marco"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">Squadra principale <span className="text-gray-300">(opz.)</span></label>
          <select
            className={inp}
            value={data.squadra}
            onChange={e => onChange({ ...data, squadra: e.target.value })}
          >
            <option value="">— Seleziona squadra —</option>
            {squadreList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {squadreList.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              Nessuna squadra configurata. Aggiungila dal Setup admin.
            </p>
          )}
        </div>

        {saveErr && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
            {saveErr}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
            Annulla
          </button>
          <button type="button" onClick={onSave} disabled={!canSave || saving}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform">
            {saving ? 'Salvataggio...' : 'Salva'}
          </button>
          <button type="button" onClick={onSaveAndContinue} disabled={!canSave || saving}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1 active:scale-95 transition-transform">
            Salva e continua <ChevronRight size={16} />
          </button>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2.4 — Scrivi Step2 (dati sportivi)**

  Sostituisci l'esistente `Step2` con la nuova versione per i dati sportivi:

  ```jsx
  function Step2({ data, onChange, onSaveAndClose, onNext, onBack, saving, squadreList, step1Squadra, saveErr }) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Squadra 2 <span className="text-gray-300">(opz.)</span></label>
            <select className={inp} value={data.squadra2}
              onChange={e => onChange({ ...data, squadra2: e.target.value })}>
              <option value="">— nessuna —</option>
              {squadreList.filter(s => s !== step1Squadra).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Squadra 3 <span className="text-gray-300">(opz.)</span></label>
            <select className={inp} value={data.squadra3}
              onChange={e => onChange({ ...data, squadra3: e.target.value })}>
              <option value="">— nessuna —</option>
              {squadreList.filter(s => s !== step1Squadra && s !== data.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">N° maglia <span className="text-gray-300">(opz.)</span></label>
            <input type="number" min="1" max="99" className={inp}
              value={data.numero_maglia}
              onChange={e => onChange({ ...data, numero_maglia: e.target.value })}
              placeholder="es. 7" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Data iscrizione <span className="text-gray-300">(opz.)</span></label>
            <input type="date" className={inp}
              value={data.data_iscrizione}
              onChange={e => onChange({ ...data, data_iscrizione: e.target.value })} />
          </div>
        </div>

        {saveErr && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{saveErr}</div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onBack}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1">
            <ChevronLeft size={16} /> Indietro
          </button>
          <button type="button" onClick={onSaveAndClose} disabled={saving}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform">
            {saving ? 'Salvataggio...' : 'Salva e chiudi'}
          </button>
          <button type="button" onClick={onNext} disabled={saving}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1 active:scale-95 transition-transform">
            Avanti <ChevronRight size={16} />
          </button>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2.5 — Aggiorna Step3 (anagrafica — era Step2)**

  Rinomina la funzione `Step2` esistente (anagrafica) in `Step3`. Sostituisci i pulsanti con:

  ```jsx
  // Pulsanti Step3
  <div className="flex gap-2 pt-2">
    <button type="button" onClick={onBack}
      className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1">
      <ChevronLeft size={16} /> Indietro
    </button>
    <button type="button" onClick={onSaveAndClose} disabled={saving}
      className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform">
      {saving ? 'Salvataggio...' : 'Salva e chiudi'}
    </button>
    <button type="button" onClick={onNext} disabled={saving}
      className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1 active:scale-95 transition-transform">
      Avanti <ChevronRight size={16} />
    </button>
  </div>
  ```

  La firma diventa:
  ```jsx
  function Step3({ data, onChange, onSaveAndClose, onNext, onBack, saving, saveErr }) {
  ```

- [ ] **Step 2.6 — Aggiorna Step4 (genitore — era Step3)**

  Rinomina `Step3` in `Step4`. La firma diventa:
  ```jsx
  function Step4({ data, onChange, onSave, onBack, saving, genitori, saveErr }) {
  ```

  Aggiorna la prop `onSave` dove era `onSave` rimane uguale (è il salvataggio finale).
  Aggiorna il pulsante indietro per tornare a step 3.

- [ ] **Step 2.7 — Riscrivi il componente principale GiocatoreWizard**

  Sostituisci l'intero `export default function GiocatoreWizard`:

  ```jsx
  export default function GiocatoreWizard({ onDone, onCancel }) {
    const { societaId } = useAuth()
    const qc = useQueryClient()
    const [step,        setStep]        = useState(1)
    const [giocatoreId, setGiocatoreId] = useState(null)
    const [step1,       setStep1]       = useState(STEP1_EMPTY)
    const [step2,       setStep2]       = useState(STEP2_EMPTY)
    const [step3,       setStep3]       = useState(STEP3_EMPTY)
    const [step4,       setStep4]       = useState(STEP4_EMPTY)
    const [saving,      setSaving]      = useState(false)
    const [saveErr,     setSaveErr]     = useState(null)

    const { data: squadreList = [] } = useQuery({
      queryKey: ['squadre-segreteria', societaId],
      enabled: !!societaId,
      staleTime: 5 * 60_000,
      queryFn: async () => {
        const { data } = await supabase
          .from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
        return (data ?? []).map(r => r.categoria).filter(Boolean)
      },
    })

    const { data: genitori = [] } = useQuery({
      queryKey: ['genitori-profiles', societaId],
      enabled: !!societaId,
      staleTime: 5 * 60_000,
      queryFn: async () => {
        const { data } = await supabase
          .from('profiles').select('id, nome, cognome, email')
          .eq('societa_id', societaId)
          .or('ruolo.eq.genitore,ruoli_extra.cs.{genitore}')
          .order('cognome').order('nome')
        return data ?? []
      },
    })

    // ── Step 1: INSERT immediato ───────────────────────────────────────────────
    async function saveStep1(andContinue = false) {
      setSaving(true)
      setSaveErr(null)
      try {
        const { data: inserted, error } = await supabase
          .from('giocatori')
          .insert([{
            societa_id:       societaId,
            cognome:          step1.cognome.trim(),
            nome:             step1.nome.trim(),
            squadra:          step1.squadra || null,
            attivo:           true,
            genitore_user_id: null,
          }])
          .select('id')
          .single()
        if (error) throw error
        setGiocatoreId(inserted.id)
        qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
        qc.invalidateQueries({ queryKey: ['quote-nonpagate-map', societaId] })
        if (!andContinue) { onDone(); return }
        setStep(2)
      } catch (err) {
        setSaveErr(err.message)
      } finally {
        setSaving(false)
      }
    }

    // ── Step 2: UPDATE dati sportivi ──────────────────────────────────────────
    async function saveStep2(andContinue = false) {
      if (!giocatoreId) return
      setSaving(true)
      setSaveErr(null)
      try {
        const { error } = await supabase
          .from('giocatori')
          .update({
            squadra2:       step2.squadra2       || null,
            squadra3:       step2.squadra3       || null,
            numero_maglia:  step2.numero_maglia  ? parseInt(step2.numero_maglia) : null,
            data_iscrizione: step2.data_iscrizione || null,
          })
          .eq('id', giocatoreId)
        if (error) throw error
        if (!andContinue) { onDone(); return }
        setStep(3)
      } catch (err) {
        setSaveErr(err.message)
      } finally {
        setSaving(false)
      }
    }

    // ── Step 3: UPDATE anagrafica ─────────────────────────────────────────────
    async function saveStep3(andContinue = false) {
      if (!giocatoreId) return
      setSaving(true)
      setSaveErr(null)
      try {
        const { error } = await supabase
          .from('giocatori')
          .update({
            data_nascita:         step3.data_nascita         || null,
            luogo_nascita:        step3.luogo_nascita        || null,
            codice_fiscale:       step3.codice_fiscale       || null,
            indirizzo:            step3.indirizzo            || null,
            citta:                step3.citta                || null,
            cap:                  step3.cap                  || null,
            provincia:            step3.provincia            || null,
            cert_medico_scadenza: step3.cert_medico_scadenza || null,
          })
          .eq('id', giocatoreId)
        if (error) throw error
        if (!andContinue) { onDone(); return }
        setStep(4)
      } catch (err) {
        setSaveErr(err.message)
      } finally {
        setSaving(false)
      }
    }

    // ── Step 4: UPDATE genitore + account ─────────────────────────────────────
    async function saveStep4() {
      if (!giocatoreId) return
      setSaving(true)
      setSaveErr(null)
      try {
        // Aggiorna dati anagrafici genitore sul record giocatore
        await supabase.from('giocatori').update({
          nome_genitore:            step4.nome_genitore            || null,
          cognome_genitore:         step4.cognome_genitore         || null,
          codice_fiscale_genitore:  step4.codice_fiscale_genitore  || null,
          telefono:                 step4.telefono                 || null,
          email_genitore:           step4.email_genitore           || null,
        }).eq('id', giocatoreId)

        if (step4.accountOption === 'invite') {
          if (!supabaseAdmin) throw new Error('Service role key non configurata. Impossibile inviare l\'invito.')
          const { data: invData, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            step4.email_genitore.trim(),
            {
              data: {
                ruolo: 'genitore',
                nome: step4.nome_genitore.trim() || null,
                cognome: step4.cognome_genitore.trim() || null,
                societa_id: societaId,
              },
              redirectTo: window.location.origin + '/login',
            }
          )
          if (invErr) throw invErr
          const newUserId = invData.user?.id
          if (!newUserId) throw new Error('Utente invitato ma ID non ricevuto')
          const { error: profErr } = await supabase.from('profiles').upsert([{
            id: newUserId,
            email: step4.email_genitore.trim(),
            nome: step4.nome_genitore.trim() || null,
            cognome: step4.cognome_genitore.trim() || null,
            ruolo: 'genitore',
            societa_id: societaId,
            attivo: true,
            genitore_squadra:  step1.squadra  || null,
            genitore_squadra2: step2.squadra2 || null,
            genitore_squadra3: step2.squadra3 || null,
          }], { onConflict: 'id' })
          if (profErr) throw profErr
          const { error: linkErr } = await supabase.from('giocatori')
            .update({ genitore_user_id: newUserId }).eq('id', giocatoreId)
          if (linkErr) throw linkErr
        } else if (step4.accountOption === 'link' && step4.genitore_user_id) {
          const { error: linkErr } = await supabase.from('giocatori')
            .update({ genitore_user_id: step4.genitore_user_id }).eq('id', giocatoreId)
          if (linkErr) throw linkErr
        }

        qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
        onDone()
      } catch (err) {
        const msg = err.message ?? ''
        if (msg.toLowerCase().includes('sending mail') || msg.toLowerCase().includes('smtp')) {
          setSaveErr('Impossibile inviare l\'email di invito. Configura SMTP su Supabase Dashboard → Settings → Auth → SMTP Settings.')
        } else {
          setSaveErr(msg)
        }
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="px-5 pt-4 pb-2">
        <StepIndicator step={step} />

        {saveErr && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
            {saveErr}
          </div>
        )}

        {step === 1 && (
          <Step1
            data={step1} onChange={setStep1}
            onSave={() => saveStep1(false)}
            onSaveAndContinue={() => saveStep1(true)}
            onCancel={onCancel}
            saving={saving}
            squadreList={squadreList}
            saveErr={null}
          />
        )}
        {step === 2 && (
          <Step2
            data={step2} onChange={setStep2}
            onSaveAndClose={() => saveStep2(false)}
            onNext={() => saveStep2(true)}
            onBack={() => setStep(1)}
            saving={saving}
            squadreList={squadreList}
            step1Squadra={step1.squadra}
            saveErr={null}
          />
        )}
        {step === 3 && (
          <Step3
            data={step3} onChange={setStep3}
            onSaveAndClose={() => saveStep3(false)}
            onNext={() => saveStep3(true)}
            onBack={() => setStep(2)}
            saving={saving}
            saveErr={null}
          />
        )}
        {step === 4 && (
          <Step4
            data={step4} onChange={setStep4}
            onSave={saveStep4}
            onBack={() => setStep(3)}
            saving={saving}
            genitori={genitori}
            saveErr={null}
          />
        )}
      </div>
    )
  }
  ```

  > Nota: passa `saveErr={saveErr}` solo al componente dello step corrente (non a tutti). Se preferisci, puoi mostrarlo centralmente sopra come già fatto (`{saveErr && <div ...>}`), lasciando `saveErr={null}` nelle props dei singoli step.

- [ ] **Step 2.8 — Rimuovi il codice dell'intera vecchia funzione `saveGiocatore`**

  La funzione `saveGiocatore` (riga ~395-483 nel file originale) non esiste più. Verificare che non ci siano riferimenti rimasti.

- [ ] **Step 2.9 — Test manuale: salva al primo step**

  1. Apri Segreteria → Setup → Nuovo giocatore
  2. Inserisci cognome e nome
  3. Clicca "Salva" → il modal si chiude e il giocatore appare nella lista con solo nome/cognome
  4. Clicca "Salva e continua" → passa allo step 2 (Squadre)

- [ ] **Step 2.10 — Test manuale: flusso completo 4 step**

  1. Step 1: cognome + nome + squadra → "Salva e continua"
  2. Step 2: squadra2 + maglia → "Salva e chiudi" → giocatore salvato con dati sportivi
  3. Ripeti con "Avanti" fino a step 4 → invita genitore → verifica tutto salvato

- [ ] **Step 2.11 — Commit**

  ```
  git add frontend/src/pages/secretary/GiocatoreWizard.jsx
  git commit -m "feat: GiocatoreWizard step 1 nome/cognome con salvataggio immediato"
  ```

---

## Task 3: AdminSetupPage — shell, gruppi card, modali staff

**File:** `frontend/src/pages/admin/AdminSetupPage.jsx` (nuovo)

- [ ] **Step 3.1 — Crea il file con la struttura base**

  Crea `frontend/src/pages/admin/AdminSetupPage.jsx`:

  ```jsx
  import { useState } from 'react'
  import {
    Building2, Users, Dumbbell, UserCheck, ChevronRight, GitFork,
    CalendarDays, Activity, Briefcase,
  } from 'lucide-react'
  import { useNavigate } from 'react-router-dom'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import AppHeader from '../../components/AppHeader'
  import { useAuth } from '../../hooks/useAuth'
  import InvitaUtenteForm from '../../components/InvitaUtenteForm'
  import { Modal, Field, inp } from '../../components/ui'
  import { supabase } from '../../lib/supabase'
  import { GIORNI, GIORNI_LABEL, TIPO_PALESTRA } from '../../lib/constants'

  // ─── Card ──────────────────────────────────────────────────────────────────────

  function SetupCard({ icon: Icon, title, desc, onClick, border }) {
    return (
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors ${border ? 'border-b border-gray-100' : ''}`}
      >
        <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-amber-600" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
        </div>
        <ChevronRight size={16} className="text-gray-300 shrink-0" />
      </button>
    )
  }

  function SectionGroup({ title, children }) {
    return (
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">{title}</p>
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {children}
        </div>
      </div>
    )
  }

  // ─── Componente principale ─────────────────────────────────────────────────────

  export default function AdminSetupPage() {
    const { displayName, logout, societaNome } = useAuth()
    const navigate = useNavigate()
    const [openModal, setOpenModal] = useState(null)
    const close = () => setOpenModal(null)

    return (
      <div>
        <AppHeader
          title="Setup"
          subtitle={societaNome ?? 'Configurazione società'}
          displayName={displayName}
          logout={logout}
          societaNome={societaNome}
        />

        <div className="px-4 pt-4 space-y-4 pb-8">

          {/* ── Struttura societaria ── */}
          <SectionGroup title="🏢 Struttura societaria">
            <SetupCard icon={Building2} title="Aggiungi palestra"  desc="Sedi e orari disponibili"   onClick={() => setOpenModal('palestra')}  border />
            <SetupCard icon={Users}     title="Aggiungi squadra"   desc="Nuova categoria"             onClick={() => setOpenModal('squadra')} />
          </SectionGroup>

          {/* ── Staff ── */}
          <SectionGroup title="👤 Staff">
            <SetupCard icon={Dumbbell}   title="Nuovo Allenatore"   desc="Invita tramite email"             onClick={() => setOpenModal('allenatore')}  border />
            <SetupCard icon={Activity}   title="Nuovo Preparatore"  desc="Invita preparatore atletico"      onClick={() => setOpenModal('preparatore')} border />
            <SetupCard icon={Briefcase}  title="Invita Segreteria"  desc="Accesso gestione giocatori"       onClick={() => setOpenModal('segreteria')} />
          </SectionGroup>

          {/* ── Strumenti ── */}
          <SectionGroup title="🛠 Strumenti">
            <SetupCard icon={CalendarDays} title="Configura Settimana Tipo" desc="Template orario settimanale"       onClick={() => navigate('/admin/setup/settimana_tipo')} border />
            <SetupCard icon={GitFork}      title="Doppio Campionato"         desc="Coppie squadre e giocatori comuni" onClick={() => setOpenModal('doppio')} />
          </SectionGroup>

          {/* ── Utenti configurati (Task 6) ── */}
          <UtentiConfigurati />

        </div>

        {/* ── Modal Staff ── */}
        {['allenatore', 'preparatore', 'segreteria'].includes(openModal) && (
          <Modal
            title={
              openModal === 'allenatore'  ? 'Nuovo Allenatore'  :
              openModal === 'preparatore' ? 'Nuovo Preparatore' : 'Invita Segreteria'
            }
            onClose={close}
          >
            <InvitaUtenteForm
              ruoliConsentiti={
                openModal === 'allenatore'  ? ['allenatore']           :
                openModal === 'preparatore' ? ['preparatore_atletico'] : ['segreteria']
              }
              onSuccess={close}
            />
          </Modal>
        )}

        {/* ── Modal Palestra (Task 4) ── */}
        {openModal === 'palestra' && <PalestraModal onClose={close} />}

        {/* ── Modal Squadra (Task 4) ── */}
        {openModal === 'squadra' && <SquadraModal onClose={close} />}

        {/* ── Modal Doppio Campionato (Task 5) ── */}
        {openModal === 'doppio' && <DoppioGiocatoriModal onClose={close} />}

      </div>
    )
  }

  // ─── Placeholder per i componenti dei task successivi ─────────────────────────

  function PalestraModal({ onClose }) { return null }
  function SquadraModal({ onClose })  { return null }
  function DoppioGiocatoriModal({ onClose }) { return null }
  function UtentiConfigurati() { return null }
  ```

- [ ] **Step 3.2 — Verifica che la pagina si renderizza (prima di aggiungere routing)**

  Importa temporaneamente in App.jsx per testare:
  ```jsx
  // In App.jsx, cambia temporaneamente:
  import AdminSetupPage from './pages/admin/AdminSetupPage'
  // e nella route:
  <Route path="setup" element={<AdminSetupPage />} />
  ```
  Naviga a `/admin/setup` — devi vedere l'header + le card + i modali staff funzionanti.

- [ ] **Step 3.3 — Test modali staff**

  Clicca "Nuovo Allenatore" → si apre Modal con `InvitaUtenteForm` preimpostato su `allenatore` (il select ruolo non appare perché c'è una sola opzione). Stesso test per Preparatore e Segreteria.

- [ ] **Step 3.4 — Commit parziale**

  ```
  git add frontend/src/pages/admin/AdminSetupPage.jsx frontend/src/App.jsx
  git commit -m "feat: AdminSetupPage shell con card hub e modali staff"
  ```

---

## Task 4: AdminSetupPage — modali Palestra e Squadra

**File:** `frontend/src/pages/admin/AdminSetupPage.jsx`

- [ ] **Step 4.1 — Aggiungi helper per orari palestra (in cima al file, dopo gli import)**

  ```js
  const DEFAULT_ORARIO_G = { attivo: false, ora_inizio: '15:00', ora_fine: '22:00' }

  function emptyOrari() {
    return Object.fromEntries(GIORNI.map(g => [g, { ...DEFAULT_ORARIO_G }]))
  }

  const EMPTY_PAL = { nome: '', tipo: 'Principale', solo_allenamento: false, orari: emptyOrari() }
  ```

- [ ] **Step 4.2 — Implementa PalestraModal**

  Sostituisci il placeholder `function PalestraModal`:

  ```jsx
  function PalestraModal({ onClose }) {
    const qc = useQueryClient()
    const { societaId } = useAuth()
    const [form, setForm] = useState(EMPTY_PAL)
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
    const setOrario = (g, k, v) => setForm(f => ({
      ...f, orari: { ...f.orari, [g]: { ...f.orari[g], [k]: v } },
    }))

    const saveMut = useMutation({
      mutationFn: async (f) => {
        const { error } = await supabase.from('palestre').insert([{
          nome: f.nome.trim(), tipo: f.tipo,
          solo_allenamento: f.solo_allenamento ?? false,
          orari: f.orari, societa_id: societaId,
        }])
        if (error) throw error
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['palestre'] })
        onClose()
      },
    })

    return (
      <Modal title="Nuova palestra" onClose={onClose}>
        <form onSubmit={e => { e.preventDefault(); saveMut.mutateAsync(form) }} className="space-y-4">
          <Field label="Nome *">
            <input value={form.nome} onChange={e => set('nome', e.target.value)}
              className={inp} placeholder="es. PalaOderzo" required autoFocus />
          </Field>

          <Field label="Tipo">
            <div className="flex gap-2 mt-1">
              {TIPO_PALESTRA.map(t => (
                <button key={t} type="button" onClick={() => set('tipo', t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    form.tipo === t ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Uso">
            <div className="flex gap-2 mt-1">
              {[{ val: false, label: '🏀 Gara + Allenamento' }, { val: true, label: '🏃 Solo Allenamento' }].map(({ val, label }) => (
                <button key={String(val)} type="button" onClick={() => set('solo_allenamento', val)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    (form.solo_allenamento ?? false) === val ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Orari per giorno">
            <div className="mt-1 space-y-2">
              {GIORNI.map(g => {
                const o = form.orari[g]
                return (
                  <div key={g} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border transition-colors ${o.attivo ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                    <button type="button" onClick={() => setOrario(g, 'attivo', !o.attivo)}
                      className={`w-14 shrink-0 text-xs font-medium py-0.5 rounded-md border transition-colors ${o.attivo ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-400 border-gray-200'}`}>
                      {GIORNI_LABEL[g]}
                    </button>
                    {o.attivo ? (
                      <>
                        <input type="time" value={o.ora_inizio}
                          onChange={e => setOrario(g, 'ora_inizio', e.target.value)}
                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                        <span className="text-xs text-gray-400">–</span>
                        <input type="time" value={o.ora_fine}
                          onChange={e => setOrario(g, 'ora_fine', e.target.value)}
                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      </>
                    ) : (
                      <span className="text-xs text-gray-300 italic">Chiuso</span>
                    )}
                  </div>
                )
              })}
            </div>
          </Field>

          {saveMut.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveMut.error?.message}</p>
          )}

          <button type="submit" disabled={saveMut.isPending || !form.nome.trim()}
            className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
            {saveMut.isPending ? 'Salvataggio...' : 'Aggiungi palestra'}
          </button>
        </form>
      </Modal>
    )
  }
  ```

- [ ] **Step 4.3 — Implementa SquadraModal**

  Sostituisci il placeholder `function SquadraModal`:

  ```jsx
  function SquadraModal({ onClose }) {
    const qc = useQueryClient()
    const { societaId } = useAuth()
    const [categoria, setCategoria] = useState('')

    const saveMut = useMutation({
      mutationFn: async () => {
        const { error } = await supabase.from('squadre').insert([{
          categoria: categoria.trim(), societa_id: societaId,
        }])
        if (error) throw error
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['squadre-table'] })
        qc.invalidateQueries({ queryKey: ['squadre-nomi'] })
        qc.invalidateQueries({ queryKey: ['squadre-segreteria', societaId] })
        onClose()
      },
    })

    return (
      <Modal title="Nuova squadra" onClose={onClose}>
        <form onSubmit={e => { e.preventDefault(); saveMut.mutateAsync() }} className="space-y-4">
          <Field label="Categoria *">
            <input
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className={inp}
              placeholder="es. U13, U18, Senior"
              required autoFocus
            />
          </Field>
          {saveMut.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveMut.error?.message}</p>
          )}
          <button type="submit" disabled={saveMut.isPending || !categoria.trim()}
            className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
            {saveMut.isPending ? 'Salvataggio...' : 'Aggiungi squadra'}
          </button>
        </form>
      </Modal>
    )
  }
  ```

- [ ] **Step 4.4 — Test manuale modali**

  - Clicca "Aggiungi palestra" → inserisci nome, attiva giorni, salva → la palestra appare in Setup → Palestre
  - Clicca "Aggiungi squadra" → inserisci categoria → la squadra appare nelle liste

- [ ] **Step 4.5 — Commit**

  ```
  git add frontend/src/pages/admin/AdminSetupPage.jsx
  git commit -m "feat: AdminSetupPage aggiungi modali PalestraModal e SquadraModal"
  ```

---

## Task 5: AdminSetupPage — DoppioGiocatoriModal

**File:** `frontend/src/pages/admin/AdminSetupPage.jsx`

- [ ] **Step 5.1 — Implementa DoppioGiocatoriModal**

  Sostituisci il placeholder `function DoppioGiocatoriModal`:

  ```jsx
  function DoppioGiocatoriModal({ onClose }) {
    const qc = useQueryClient()
    const { societaId } = useAuth()
    const [squadraA, setSquadraA]   = useState('')
    const [squadraB, setSquadraB]   = useState('')
    const [rows, setRows]           = useState([{ cognome: '', nome: '' }])
    const [saving, setSaving]       = useState(false)
    const [errors, setErrors]       = useState([])

    const { data: squadreList = [] } = useQuery({
      queryKey: ['squadre-nomi-doppio', societaId],
      enabled: !!societaId,
      staleTime: 5 * 60_000,
      queryFn: async () => {
        const { data } = await supabase
          .from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
        return (data ?? []).map(r => r.categoria).filter(Boolean)
      },
    })

    const { data: pairs = [] } = useQuery({
      queryKey: ['doppio-campionato'],
      queryFn: async () => {
        const { data } = await supabase.from('doppio_campionato').select('squadra_a, squadra_b')
        return data ?? []
      },
    })

    const pairExists = !!squadraA && !!squadraB && pairs.some(p =>
      (p.squadra_a === squadraA && p.squadra_b === squadraB) ||
      (p.squadra_a === squadraB && p.squadra_b === squadraA)
    )

    function addRow()       { setRows(r => [...r, { cognome: '', nome: '' }]) }
    function removeRow(i)   { setRows(r => r.filter((_, idx) => idx !== i)) }
    function updateRow(i, k, v) {
      setRows(r => r.map((row, idx) => idx === i ? { ...row, [k]: v } : row))
    }

    const canSave = !!squadraA && !!squadraB && squadraA !== squadraB &&
      rows.some(r => r.cognome.trim())

    async function handleSave() {
      setSaving(true)
      setErrors([])
      const errs = []
      try {
        // 1. Crea coppia se non esiste
        if (!pairExists) {
          const { error } = await supabase.from('doppio_campionato').insert([{
            squadra_a: squadraA, squadra_b: squadraB, societa_id: societaId,
          }])
          if (error) errs.push(`Coppia: ${error.message}`)
        }

        // 2. Inserisci giocatori (best-effort)
        for (const row of rows.filter(r => r.cognome.trim())) {
          const { error } = await supabase.from('giocatori').insert([{
            cognome:          row.cognome.trim(),
            nome:             row.nome.trim() || null,
            squadra:          squadraA,
            squadra2:         squadraB,
            societa_id:       societaId,
            attivo:           true,
            genitore_user_id: null,
          }])
          if (error) errs.push(`${row.cognome} ${row.nome}: ${error.message}`)
        }

        qc.invalidateQueries({ queryKey: ['doppio-campionato'] })
        qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })

        if (errs.length === 0) {
          onClose()
        } else {
          setErrors(errs)
        }
      } finally {
        setSaving(false)
      }
    }

    return (
      <Modal title="Doppio Campionato" onClose={onClose}>
        <div className="space-y-5">

          {/* Coppia */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Coppia di squadre</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Squadra A *</label>
                <select className={inp} value={squadraA} onChange={e => setSquadraA(e.target.value)}>
                  <option value="">— Seleziona —</option>
                  {squadreList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Squadra B *</label>
                <select className={inp} value={squadraB} onChange={e => setSquadraB(e.target.value)}>
                  <option value="">— Seleziona —</option>
                  {squadreList.filter(s => s !== squadraA).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {pairExists && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                ⚠️ Coppia già esistente — verranno solo aggiunti i giocatori.
              </p>
            )}
          </div>

          {/* Giocatori */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Giocatori in questa coppia</p>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className={inp}
                    placeholder="Cognome *"
                    value={row.cognome}
                    onChange={e => updateRow(i, 'cognome', e.target.value)}
                  />
                  <input
                    className={inp}
                    placeholder="Nome"
                    value={row.nome}
                    onChange={e => updateRow(i, 'nome', e.target.value)}
                  />
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)}
                      className="p-2 text-gray-400 hover:text-red-500 shrink-0">
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addRow}
              className="mt-2 text-xs text-amber-600 font-medium hover:text-amber-700">
              + Aggiungi giocatore
            </button>
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              {errors.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform"
          >
            {saving ? 'Salvataggio...' : '💾 Salva'}
          </button>
        </div>
      </Modal>
    )
  }
  ```

- [ ] **Step 5.2 — Test manuale**

  1. Clicca "Doppio Campionato" → seleziona Squadra A = U15, Squadra B = U16
  2. Aggiungi 2 giocatori (cognome + nome)
  3. Clicca Salva → la coppia appare in Setup → Doppio Campionato, i giocatori in Segreteria → Giocatori con squadra=U15 e squadra2=U16

- [ ] **Step 5.3 — Commit**

  ```
  git add frontend/src/pages/admin/AdminSetupPage.jsx
  git commit -m "feat: AdminSetupPage DoppioGiocatoriModal — crea coppia e inserisce giocatori"
  ```

---

## Task 6: AdminSetupPage — sezione Utenti Configurati

**File:** `frontend/src/pages/admin/AdminSetupPage.jsx`

- [ ] **Step 6.1 — Aggiungi costanti ruolo (dopo gli import)**

  ```js
  const RUOLO_LABEL_LOCAL = {
    admin:                'Admin',
    allenatore:           'Allenatore',
    segreteria:           'Segreteria',
    dirigente:            'Dirigente',
    preparatore_atletico: 'Preparatore',
  }

  const RUOLO_COLOR = {
    admin:                'bg-red-100 text-red-700',
    allenatore:           'bg-blue-100 text-blue-700',
    segreteria:           'bg-teal-100 text-teal-700',
    dirigente:            'bg-indigo-100 text-indigo-700',
    preparatore_atletico: 'bg-purple-100 text-purple-700',
  }

  // Ruoli extra assegnabili dall'admin (mai giocatore/genitore)
  const RUOLI_EXTRA_STAFF = ['admin', 'allenatore', 'segreteria', 'dirigente', 'preparatore_atletico']
  ```

- [ ] **Step 6.2 — Implementa UtentiConfigurati**

  Sostituisci il placeholder `function UtentiConfigurati()`:

  ```jsx
  function UtentiConfigurati() {
    const { societaId, user: me } = useAuth()
    const qc = useQueryClient()
    const [expanded, setExpanded] = useState({}) // userId → ruolo espanso

    const { data: utenti = [], isLoading } = useQuery({
      queryKey: ['setup-utenti-staff', societaId],
      enabled: !!societaId,
      staleTime: 60_000,
      queryFn: async () => {
        const [profRes, allRes, prepRes] = await Promise.all([
          supabase.from('profiles')
            .select('id, nome, cognome, email, ruolo, ruoli_extra, squadra, squadra2, squadra3, genitore_squadra')
            .eq('societa_id', societaId)
            .not('ruolo', 'in', '("giocatore","genitore","super_admin")')
            .order('cognome').order('nome'),
          supabase.from('allenatori').select('email, squadre_capo, squadre_vice'),
          supabase.from('prep_squadre').select('preparatore_id, squadra').eq('societa_id', societaId),
        ])
        const allenatoriMap = {}
        for (const a of allRes.data ?? []) {
          if (a.email) allenatoriMap[a.email.toLowerCase()] = { capo: a.squadre_capo ?? '', vice: a.squadre_vice ?? '' }
        }
        const prepMap = {}
        for (const p of prepRes.data ?? []) {
          if (!prepMap[p.preparatore_id]) prepMap[p.preparatore_id] = []
          prepMap[p.preparatore_id].push(p.squadra)
        }
        return (profRes.data ?? []).map(u => ({
          ...u,
          _allenatoreData: allenatoriMap[u.email?.toLowerCase()] ?? null,
          _prepSquadre: prepMap[u.id] ?? [],
        }))
      },
    })

    const ruoliExtraMut = useMutation({
      mutationFn: async ({ id, ruoli_extra }) => {
        const { error } = await supabase.from('profiles').update({ ruoli_extra }).eq('id', id)
        if (error) throw error
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-utenti-staff', societaId] }),
    })

    function toggleExpand(userId, ruolo) {
      setExpanded(prev => {
        const key = `${userId}-${ruolo}`
        return { ...prev, [key]: !prev[key] }
      })
    }

    function toggleExtra(u, ruolo) {
      const attuali = u.ruoli_extra ?? []
      const nuovo = attuali.includes(ruolo)
        ? attuali.filter(r => r !== ruolo)
        : [...attuali, ruolo]
      ruoliExtraMut.mutate({ id: u.id, ruoli_extra: nuovo })
    }

    function getSquadreForRuolo(u, ruolo) {
      if (ruolo === 'allenatore' && u._allenatoreData) {
        const capo = u._allenatoreData.capo.split(',').map(s => s.trim()).filter(Boolean)
        const vice = u._allenatoreData.vice.split(',').map(s => s.trim()).filter(Boolean)
        return { capo, vice }
      }
      if (ruolo === 'preparatore_atletico') {
        return { squadre: u._prepSquadre }
      }
      if (ruolo === 'segreteria' || ruolo === 'admin' || ruolo === 'dirigente') {
        return null // nessuna squadra associata
      }
      return null
    }

    if (isLoading) return (
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">👥 Utenti configurati</p>
        <p className="text-xs text-gray-400 px-1">Caricamento...</p>
      </div>
    )

    return (
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">👥 Utenti configurati</p>

        {utenti.length === 0 ? (
          <p className="text-xs text-gray-400 px-1">Nessun utente staff configurato.</p>
        ) : (
          <div className="space-y-2">
            {utenti.map(u => {
              const nome = [u.nome, u.cognome].filter(Boolean).join(' ') || 'Utente'
              const allRuoli = [u.ruolo, ...(u.ruoli_extra ?? [])]
              const extraDisp = RUOLI_EXTRA_STAFF.filter(r => r !== u.ruolo)

              return (
                <div key={u.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
                  {/* Riga nome + email */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-xs font-bold uppercase">
                      {nome.split(' ').map(w => w[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{nome}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                    {u.id === me?.id && <span className="text-xs text-blue-400 shrink-0">(tu)</span>}
                  </div>

                  {/* Badge ruoli */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {allRuoli.map(ruolo => {
                      const squadreInfo = getSquadreForRuolo(u, ruolo)
                      const key = `${u.id}-${ruolo}`
                      const isOpen = !!expanded[key]
                      return (
                        <div key={ruolo}>
                          <button
                            type="button"
                            onClick={() => squadreInfo && toggleExpand(u.id, ruolo)}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
                              RUOLO_COLOR[ruolo] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                            } ${squadreInfo ? 'cursor-pointer' : 'cursor-default'}`}
                          >
                            {RUOLO_LABEL_LOCAL[ruolo] ?? ruolo}
                            {squadreInfo ? (isOpen ? ' ▲' : ' ▾') : ''}
                          </button>
                          {/* Accordion squadre */}
                          {isOpen && squadreInfo && (
                            <div className="mt-1 ml-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                              {squadreInfo.capo?.length > 0 && (
                                <p>Capo: <strong>{squadreInfo.capo.join(', ')}</strong></p>
                              )}
                              {squadreInfo.vice?.length > 0 && (
                                <p>Vice: <strong>{squadreInfo.vice.join(', ')}</strong></p>
                              )}
                              {squadreInfo.squadre?.length > 0 && (
                                <p>Squadre: <strong>{squadreInfo.squadre.join(', ')}</strong></p>
                              )}
                              {(!squadreInfo.capo?.length && !squadreInfo.vice?.length && !squadreInfo.squadre?.length) && (
                                <p className="text-gray-400">Nessuna squadra assegnata</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Aggiungi ruolo extra */}
                  {u.id !== me?.id && (
                    <div className="flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
                      <span className="text-[10px] text-gray-400 self-center">+ ruolo:</span>
                      {extraDisp.map(r => {
                        const hasIt = (u.ruoli_extra ?? []).includes(r)
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => toggleExtra(u, r)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                              hasIt
                                ? `${RUOLO_COLOR[r] ?? 'bg-gray-100 text-gray-600'} border-transparent`
                                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            {hasIt ? '✓ ' : ''}{RUOLO_LABEL_LOCAL[r] ?? r}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 6.2 — Test manuale sezione utenti**

  1. Naviga a `/admin/setup` → scorri in fondo → vedi la lista utenti staff
  2. Clicca su un badge "Allenatore ▾" → si espande l'accordion con capo/vice
  3. Clicca "+ Segreteria" su un allenatore → il badge "Segreteria" appare
  4. Clicca di nuovo → il ruolo viene rimosso

- [ ] **Step 6.3 — Commit**

  ```
  git add frontend/src/pages/admin/AdminSetupPage.jsx
  git commit -m "feat: AdminSetupPage sezione UtentiConfigurati con badge ruoli cliccabili"
  ```

---

## Task 7: Routing + rimozione SetupMenu

**File:** `frontend/src/App.jsx`, `frontend/src/pages/admin/SetupMenu.jsx`

- [ ] **Step 7.1 — Aggiorna import in App.jsx**

  ```jsx
  // RIMUOVI questa riga:
  import SetupMenu from './pages/admin/SetupMenu'

  // AGGIUNGI questa riga (nella stessa posizione degli import admin):
  import AdminSetupPage from './pages/admin/AdminSetupPage'
  ```

- [ ] **Step 7.2 — Aggiorna la route in App.jsx**

  ```jsx
  // BEFORE (riga 221):
  <Route path="setup"       element={<SetupMenu />} />

  // AFTER:
  <Route path="setup"       element={<AdminSetupPage />} />
  ```

- [ ] **Step 7.3 — Elimina SetupMenu.jsx**

  ```
  del frontend\src\pages\admin\SetupMenu.jsx
  ```

  Oppure tramite PowerShell:
  ```powershell
  Remove-Item frontend\src\pages\admin\SetupMenu.jsx
  ```

- [ ] **Step 7.4 — Verifica build senza errori**

  ```
  cd frontend && npm run build
  ```

  Atteso: build completata senza errori. Se ci sono errori di import rimasti che referenziano `SetupMenu`, correggerli.

- [ ] **Step 7.5 — Test end-to-end**

  1. Avvia il dev server: `npm run dev`
  2. Accedi come admin → naviga a `/admin/setup`
  3. Verifica che vedi la hub page (non il vecchio menu)
  4. Testa ogni card: palestra, squadra, allenatore, preparatore, segreteria, doppio campionato
  5. Clicca "Configura Settimana Tipo" → naviga correttamente a `/admin/setup/settimana_tipo`
  6. Il bottone "Setup" nel SetupPage header (breadcrumb `← Setup`) punta ancora a `/admin/setup` → verifica che porta alla nuova hub

- [ ] **Step 7.6 — Commit finale**

  ```
  git add frontend/src/App.jsx
  git rm frontend/src/pages/admin/SetupMenu.jsx
  git commit -m "feat: sostituisci SetupMenu con AdminSetupPage — setup admin ristrutturato"
  ```

---

## Self-review checklist

### Spec coverage
| Requisito spec | Task |
|----------------|------|
| AdminSetupPage hub con card | Task 3 |
| Modal Palestra | Task 4 |
| Modal Squadra | Task 4 |
| Modal Allenatore / Preparatore / Segreteria | Task 3 |
| Modal Doppio Campionato + Giocatori | Task 5 |
| Utenti configurati inline con badge cliccabili | Task 6 |
| Ruoli extra limitati (no giocatore/genitore) | Task 6 |
| Settimana Tipo → naviga | Task 3 |
| GiocatoreWizard step 1 = nome/cognome | Task 2 |
| Salvataggio immediato step 1 | Task 2 |
| Steps 2-4 fanno UPDATE | Task 2 |
| Auto-squadra genitore da giocatore | Task 1 |
| Fix messaggio errore SMTP | Task 1 e 2 |
| Rimuovi SetupMenu | Task 7 |
| Aggiorna routing App.jsx | Task 7 |

### Verifiche aggiuntive
- `TIPO_PALESTRA` è importato da `lib/constants` ✅ (usato in PalestraModal)
- `GIORNI` e `GIORNI_LABEL` importati da `lib/constants` ✅
- `supabaseAdmin` NON è usato in AdminSetupPage (solo `supabase`) ✅ — le invite avvengono tramite `InvitaUtenteForm` che gestisce già `supabaseAdmin`
- La cache key `['squadre-nomi-doppio', societaId]` è separata da `['squadre-nomi']` per evitare collisioni ✅
- La query utenti staff usa `.not('ruolo', 'in', '("giocatore","genitore","super_admin")')` — sintassi Supabase JS v2 corretta ✅
- `DoppioGiocatoriModal` aggiunge righe dinamicamente con array di `{ cognome, nome }` ✅
