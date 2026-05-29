import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase, supabaseAdmin } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

// ─── Stato iniziale ────────────────────────────────────────────────────────────

const STEP1_EMPTY = {
  squadra: '', squadra2: '', squadra3: '',
  numero_maglia: '', data_iscrizione: '',
}

const STEP2_EMPTY = {
  cognome: '', nome: '',
  data_nascita: '', luogo_nascita: '', codice_fiscale: '',
  indirizzo: '', citta: '', cap: '', provincia: '',
  cert_medico_scadenza: '',
}

const STEP3_EMPTY = {
  nome_genitore: '', cognome_genitore: '', codice_fiscale_genitore: '',
  telefono: '', email_genitore: '',
  accountOption: 'invite',  // 'invite' | 'link' | 'skip'
  genitore_user_id: null,
}

// ─── Stili condivisi ───────────────────────────────────────────────────────────

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'
const sec = 'text-xs font-bold text-gray-400 uppercase tracking-widest mb-3'

// ─── Indicatore step ──────────────────────────────────────────────────────────

function StepIndicator({ step }) {
  const steps = ['Squadra', 'Anagrafica', 'Genitore']
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

// ─── Step 1: Squadra ──────────────────────────────────────────────────────────

function Step1({ data, onChange, onNext, onCancel, squadreList }) {
  const canNext = !!data.squadra.trim()
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Squadra principale *</label>
        <select
          className={inp}
          value={data.squadra}
          onChange={e => onChange({ ...data, squadra: e.target.value, squadra2: '', squadra3: '' })}
          required
        >
          <option value="">— Seleziona squadra —</option>
          {squadreList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {squadreList.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            Nessuna squadra configurata. L'admin deve aggiungere le squadre dal Setup.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Squadra 2 <span className="text-gray-300">(opz.)</span></label>
          <select
            className={inp}
            value={data.squadra2}
            onChange={e => onChange({ ...data, squadra2: e.target.value })}
          >
            <option value="">— nessuna —</option>
            {squadreList.filter(s => s !== data.squadra).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Squadra 3 <span className="text-gray-300">(opz.)</span></label>
          <select
            className={inp}
            value={data.squadra3}
            onChange={e => onChange({ ...data, squadra3: e.target.value })}
          >
            <option value="">— nessuna —</option>
            {squadreList.filter(s => s !== data.squadra && s !== data.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">N° maglia <span className="text-gray-300">(opz.)</span></label>
          <input
            type="number" min="1" max="99" className={inp}
            value={data.numero_maglia}
            onChange={e => onChange({ ...data, numero_maglia: e.target.value })}
            placeholder="es. 7"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Data iscrizione <span className="text-gray-300">(opz.)</span></label>
          <input
            type="date" className={inp}
            value={data.data_iscrizione}
            onChange={e => onChange({ ...data, data_iscrizione: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
          Annulla
        </button>
        <button type="button" onClick={onNext} disabled={!canNext}
          className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1 active:scale-95 transition-transform">
          Avanti <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Step 2: Anagrafica ────────────────────────────────────────────────────────

function Step2({ data, onChange, onNext, onBack }) {
  const canNext = !!data.cognome.trim() && !!data.nome.trim()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Cognome *</label>
          <input className={inp} value={data.cognome} onChange={e => onChange({ ...data, cognome: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
          <input className={inp} value={data.nome} onChange={e => onChange({ ...data, nome: e.target.value })} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Data nascita</label>
          <input type="date" className={inp} value={data.data_nascita} onChange={e => onChange({ ...data, data_nascita: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Luogo nascita</label>
          <input className={inp} value={data.luogo_nascita} onChange={e => onChange({ ...data, luogo_nascita: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Codice fiscale</label>
        <input
          className={inp + ' uppercase font-mono'}
          value={data.codice_fiscale}
          onChange={e => onChange({ ...data, codice_fiscale: e.target.value.toUpperCase() })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Indirizzo</label>
          <input className={inp} value={data.indirizzo} onChange={e => onChange({ ...data, indirizzo: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Città</label>
          <input className={inp} value={data.citta} onChange={e => onChange({ ...data, citta: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">CAP</label>
          <input className={inp} value={data.cap} onChange={e => onChange({ ...data, cap: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Provincia</label>
          <input className={inp} value={data.provincia} onChange={e => onChange({ ...data, provincia: e.target.value })} maxLength={2} />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Scad. certificato medico</label>
        <input type="date" className={inp} value={data.cert_medico_scadenza}
          onChange={e => onChange({ ...data, cert_medico_scadenza: e.target.value })} />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBack}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1">
          <ChevronLeft size={16} /> Indietro
        </button>
        <button type="button" onClick={onNext} disabled={!canNext}
          className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1 active:scale-95 transition-transform">
          Avanti <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Step 3: Genitore + Account ───────────────────────────────────────────────

function Step3({ data, onChange, onSave, onBack, saving, genitori }) {
  const emailFilled = !!data.email_genitore.trim()

  return (
    <div className="space-y-5">

      {/* Dati contatto */}
      <section>
        <p className={sec}>Genitore / Tutore</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Cognome</label>
              <input className={inp} value={data.cognome_genitore} onChange={e => onChange({ ...data, cognome_genitore: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nome</label>
              <input className={inp} value={data.nome_genitore} onChange={e => onChange({ ...data, nome_genitore: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Codice fiscale genitore</label>
            <input className={inp + ' uppercase font-mono'} value={data.codice_fiscale_genitore}
              onChange={e => onChange({ ...data, codice_fiscale_genitore: e.target.value.toUpperCase() })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefono</label>
              <input type="tel" className={inp} value={data.telefono} onChange={e => onChange({ ...data, telefono: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input type="email" className={inp} value={data.email_genitore}
                onChange={e => onChange({ ...data, email_genitore: e.target.value })} />
            </div>
          </div>
        </div>
      </section>

      {/* Account app */}
      <section>
        <p className={sec}>Account app</p>
        <div className="space-y-2">

          {/* Opzione: invia invito */}
          <label className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
            data.accountOption === 'invite' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'
          }`}>
            <input type="radio" name="accountOption" value="invite" className="mt-0.5 accent-purple-600"
              checked={data.accountOption === 'invite'}
              onChange={() => onChange({ ...data, accountOption: 'invite' })} />
            <div>
              <p className="text-sm font-semibold text-gray-800">Invia invito via email</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Il genitore riceve un link per creare la password e accedere all'app.
                {!emailFilled && <span className="text-amber-600"> (inserisci l'email sopra)</span>}
              </p>
            </div>
          </label>

          {/* Opzione: collega esistente */}
          <label className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
            data.accountOption === 'link' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'
          }`}>
            <input type="radio" name="accountOption" value="link" className="mt-0.5 accent-purple-600"
              checked={data.accountOption === 'link'}
              onChange={() => onChange({ ...data, accountOption: 'link', genitore_user_id: null })} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Collega account esistente</p>
              <p className="text-xs text-gray-500 mt-0.5">Il genitore è già registrato in app.</p>
              {data.accountOption === 'link' && (
                <select className={inp + ' mt-2'} value={data.genitore_user_id ?? ''}
                  onChange={e => onChange({ ...data, genitore_user_id: e.target.value || null })}>
                  <option value="">— Seleziona genitore —</option>
                  {genitori.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.cognome} {g.nome}{g.email ? ` (${g.email})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </label>

          {/* Opzione: salta */}
          <label className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
            data.accountOption === 'skip' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'
          }`}>
            <input type="radio" name="accountOption" value="skip" className="mt-0.5 accent-purple-600"
              checked={data.accountOption === 'skip'}
              onChange={() => onChange({ ...data, accountOption: 'skip', genitore_user_id: null })} />
            <div>
              <p className="text-sm font-semibold text-gray-800">Salta — aggiungi in seguito</p>
              <p className="text-xs text-gray-500 mt-0.5">Il giocatore viene salvato senza account genitore.</p>
            </div>
          </label>
        </div>
      </section>

      {/* Azioni */}
      <div className="flex gap-3 pt-2 pb-2">
        <button type="button" onClick={onBack}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1">
          <ChevronLeft size={16} /> Indietro
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={
            saving ||
            (data.accountOption === 'invite' && !emailFilled) ||
            (data.accountOption === 'link' && !data.genitore_user_id)
          }
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform ${
            data.accountOption === 'skip'
              ? 'bg-gray-200 text-gray-700'
              : 'bg-purple-600 text-white'
          }`}
        >
          {saving
            ? 'Salvataggio...'
            : data.accountOption === 'skip'
              ? 'Salva senza account'
              : data.accountOption === 'invite'
                ? '✉️ Salva e invia invito'
                : '🔗 Salva e collega account'}
        </button>
      </div>
    </div>
  )
}

// ─── Componente principale ─────────────────────────────────────────────────────

export default function GiocatoreWizard({ onDone, onCancel }) {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [step,    setStep]    = useState(1)
  const [step1,   setStep1]   = useState(STEP1_EMPTY)
  const [step2,   setStep2]   = useState(STEP2_EMPTY)
  const [step3,   setStep3]   = useState(STEP3_EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState(null)

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

  async function saveGiocatore(accountOption) {
    setSaving(true)
    setSaveErr(null)
    try {
      // 1. Inserisci giocatore
      let giocatoreId = null
      const { data: inserted, error: insertErr } = await supabase
        .from('giocatori')
        .insert([{
          societa_id:           societaId,
          attivo:               true,
          squadra:              step1.squadra,
          squadra2:             step1.squadra2             || null,
          squadra3:             step1.squadra3             || null,
          numero_maglia:        step1.numero_maglia ? parseInt(step1.numero_maglia) : null,
          data_iscrizione:      step1.data_iscrizione      || null,
          cognome:              step2.cognome,
          nome:                 step2.nome,
          data_nascita:         step2.data_nascita         || null,
          luogo_nascita:        step2.luogo_nascita        || null,
          codice_fiscale:       step2.codice_fiscale       || null,
          indirizzo:            step2.indirizzo            || null,
          citta:                step2.citta                || null,
          cap:                  step2.cap                  || null,
          provincia:            step2.provincia            || null,
          cert_medico_scadenza: step2.cert_medico_scadenza || null,
          nome_genitore:        step3.nome_genitore        || null,
          cognome_genitore:     step3.cognome_genitore     || null,
          codice_fiscale_genitore: step3.codice_fiscale_genitore || null,
          telefono:             step3.telefono             || null,
          email_genitore:       step3.email_genitore       || null,
          genitore_user_id:     null,
        }])
        .select('id')
        .single()
      if (insertErr) throw insertErr
      giocatoreId = inserted.id

      // 2. Gestione account
      if (accountOption === 'invite') {
        if (!supabaseAdmin) throw new Error('Service role key non configurata (VITE_SUPABASE_SERVICE_ROLE_KEY). Impossibile inviare l\'invito.')
        const { data: invData, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          step3.email_genitore.trim(),
          {
            data: {
              ruolo:      'genitore',
              nome:       step3.nome_genitore.trim()    || null,
              cognome:    step3.cognome_genitore.trim() || null,
              societa_id: societaId,
            },
            redirectTo: window.location.origin + '/login',
          }
        )
        if (invErr) throw invErr
        const newUserId = invData.user?.id
        if (!newUserId) throw new Error('Utente invitato ma ID non ricevuto')
        const { error: profErr } = await supabase.from('profiles').upsert([{
          id:               newUserId,
          email:            step3.email_genitore.trim(),
          nome:             step3.nome_genitore.trim()    || null,
          cognome:          step3.cognome_genitore.trim() || null,
          ruolo:            'genitore',
          societa_id:       societaId,
          attivo:           true,
          genitore_squadra: step1.squadra  || null,
          genitore_squadra2: step1.squadra2 || null,
          genitore_squadra3: step1.squadra3 || null,
        }], { onConflict: 'id' })
        if (profErr) throw profErr
        const { error: linkErr } = await supabase.from('giocatori').update({ genitore_user_id: newUserId }).eq('id', giocatoreId)
        if (linkErr) throw linkErr
      } else if (accountOption === 'link' && step3.genitore_user_id) {
        const { error: linkErr2 } = await supabase.from('giocatori').update({ genitore_user_id: step3.genitore_user_id }).eq('id', giocatoreId)
        if (linkErr2) throw linkErr2
      }

      qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
      qc.invalidateQueries({ queryKey: ['quote-nonpagate-map', societaId] })
      onDone()
    } catch (err) {
      // Se il giocatore è stato inserito ma il passo successivo è fallito, eliminalo
      if (giocatoreId) {
        await supabase.from('giocatori').delete().eq('id', giocatoreId).catch(() => {})
      }
      setSaveErr(err.message)
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
          onNext={() => setStep(2)} onCancel={onCancel}
          squadreList={squadreList}
        />
      )}
      {step === 2 && (
        <Step2
          data={step2} onChange={setStep2}
          onNext={() => setStep(3)} onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <Step3
          data={step3} onChange={setStep3}
          onSave={() => saveGiocatore(step3.accountOption)}
          onBack={() => setStep(2)}
          saving={saving}
          genitori={genitori}
        />
      )}
    </div>
  )
}
