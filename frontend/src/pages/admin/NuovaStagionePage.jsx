import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { setUserBanned } from '../../lib/authAdmin'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/ui/ToastProvider'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

function suggestNextStagione(corrente) {
  const m = /^(\d{4})\/(\d{4})$/.exec(corrente ?? '')
  if (!m) return ''
  return `${Number(m[1]) + 1}/${Number(m[2]) + 1}`
}

function PersonaRow({ nome, squadraLabel, azione, squadre, onAzione }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{nome}</p>
          <p className="text-xs text-gray-400 truncate">{squadraLabel || '—'}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {[
            { val: 'resta',  label: 'Resta' },
            { val: 'cambia', label: 'Cambia' },
            { val: 'lascia', label: 'Ha lasciato' },
          ].map(({ val, label }) => (
            <button
              key={val}
              type="button"
              onClick={() => onAzione({ action: val })}
              className={`text-[11px] px-2 py-1 rounded-lg font-medium border transition-colors ${
                azione.action === val
                  ? val === 'lascia' ? 'bg-red-500 text-white border-red-500'
                    : val === 'cambia' ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {azione.action === 'cambia' && (
        <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-1.5">
          {['squadra', 'squadra2', 'squadra3'].map((campo, i) => (
            <select
              key={campo}
              value={azione[campo] ?? ''}
              onChange={e => onAzione({ [campo]: e.target.value })}
              className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white"
            >
              <option value="">{i === 0 ? '— Squadra —' : '— (opzionale) —'}</option>
              {squadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NuovaStagionePage() {
  const { societaId, displayName, logout, societaNome, stagioneCorrente } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [azioni, setAzioni] = useState({}) // { [key]: { action: 'resta'|'cambia'|'lascia', squadra, squadra2, squadra3 } }
  const [nuovaStagione, setNuovaStagione] = useState('')
  const [step, setStep] = useState('lista') // 'lista' | 'riepilogo'
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)

  const { data: squadre = [] } = useQuery({
    queryKey: ['squadre-nomi-stagione', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(s => s.categoria)
    },
  })

  const { data: giocatori = [], isLoading: loadingG } = useQuery({
    queryKey: ['nuova-stagione-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, user_id')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  const { data: allenatori = [], isLoading: loadingA } = useQuery({
    queryKey: ['nuova-stagione-allenatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, cognome, email, ruolo, ruoli_extra, squadra, squadra2, squadra3')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .not('ruolo', 'in', '("giocatore","genitore","super_admin")')
        .order('cognome').order('nome')
      return (data ?? []).filter(u => [u.ruolo, ...(u.ruoli_extra ?? [])].includes('allenatore'))
    },
  })

  const isLoading = loadingG || loadingA

  function getAzione(key) {
    return azioni[key] ?? { action: 'resta' }
  }
  function setAzione(key, patch) {
    setAzioni(prev => ({ ...prev, [key]: { ...getAzione(key), ...patch } }))
  }

  async function handleConferma() {
    setSaving(true)
    setErrors([])
    const errs = []

    for (const g of giocatori) {
      const az = getAzione(`g-${g.id}`)
      if (az.action === 'lascia') {
        const { error } = await supabase.from('giocatori').update({ attivo: false }).eq('id', g.id)
        if (error) errs.push(`${g.cognome} ${g.nome}: ${error.message}`)
        if (g.user_id) {
          const { error: pErr } = await supabase.from('profiles').update({ attivo: false }).eq('id', g.user_id)
          if (pErr) errs.push(`${g.cognome} ${g.nome} (account): ${pErr.message}`)
          try {
            await setUserBanned(g.user_id, true)
          } catch (banErr) {
            errs.push(`${g.cognome} ${g.nome} (blocco accesso): ${banErr.message}`)
          }
        }
      } else if (az.action === 'cambia') {
        const patch = { squadra: az.squadra || g.squadra, squadra2: az.squadra2 || null, squadra3: az.squadra3 || null }
        const { error } = await supabase.from('giocatori').update(patch).eq('id', g.id)
        if (error) errs.push(`${g.cognome} ${g.nome}: ${error.message}`)
        if (g.user_id) {
          const { error: pErr } = await supabase.from('profiles').update(patch).eq('id', g.user_id)
          if (pErr) errs.push(`${g.cognome} ${g.nome} (account): ${pErr.message}`)
        }
      }
    }

    for (const a of allenatori) {
      const az = getAzione(`a-${a.id}`)
      if (az.action === 'lascia') {
        const { error } = await supabase.from('profiles').update({ attivo: false }).eq('id', a.id)
        if (error) errs.push(`${a.cognome} ${a.nome}: ${error.message}`)
        try {
          await setUserBanned(a.id, true)
        } catch (banErr) {
          errs.push(`${a.cognome} ${a.nome} (blocco accesso): ${banErr.message}`)
        }
      } else if (az.action === 'cambia') {
        const patch = { squadra: az.squadra || a.squadra, squadra2: az.squadra2 || null, squadra3: az.squadra3 || null }
        const { error } = await supabase.from('profiles').update(patch).eq('id', a.id)
        if (error) errs.push(`${a.cognome} ${a.nome}: ${error.message}`)
      }
    }

    const { error: sErr } = await supabase.from('societa').update({ stagione_corrente: nuovaStagione.trim() }).eq('id', societaId)
    if (sErr) errs.push(`Stagione: ${sErr.message}`)

    qc.invalidateQueries({ queryKey: ['nuova-stagione-giocatori', societaId] })
    qc.invalidateQueries({ queryKey: ['nuova-stagione-allenatori', societaId] })
    qc.invalidateQueries({ queryKey: ['setup-utenti', societaId] })
    qc.invalidateQueries({ queryKey: ['setup-utenti-staff', societaId] })

    setSaving(false)
    if (errs.length === 0) {
      toast.success(`Stagione ${nuovaStagione.trim()} avviata`)
      navigate('/admin/setup')
    } else {
      setErrors(errs)
    }
  }

  const cambi = useMemo(() => {
    let resta = 0, cambia = 0, lascia = 0
    for (const g of giocatori) {
      const a = getAzione(`g-${g.id}`).action
      if (a === 'cambia') cambia++; else if (a === 'lascia') lascia++; else resta++
    }
    for (const a of allenatori) {
      const az = getAzione(`a-${a.id}`).action
      if (az === 'cambia') cambia++; else if (az === 'lascia') lascia++; else resta++
    }
    return { resta, cambia, lascia }
  }, [azioni, giocatori, allenatori])

  if (isLoading) return (
    <div>
      <AppHeader title="Nuova Stagione" subtitle={societaNome} displayName={displayName} logout={logout} societaNome={societaNome} />
      <div className="pt-8"><LoadingSpinner /></div>
    </div>
  )

  const header = (
    <AppHeader title="Nuova Stagione" subtitle={`Stagione corrente: ${stagioneCorrente ?? '—'}`}
      displayName={displayName} logout={logout} societaNome={societaNome} />
  )

  if (step === 'riepilogo') {
    return (
      <div>
        {header}
        <div className="px-4 pt-4 pb-8 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-900">Riepilogo modifiche</p>
            <p className="text-sm text-gray-600">✅ {cambi.resta} restano</p>
            <p className="text-sm text-gray-600">🔁 {cambi.cambia} cambiano squadra</p>
            <p className="text-sm text-gray-600">🚪 {cambi.lascia} hanno lasciato</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Nuova stagione</label>
            <input
              value={nuovaStagione}
              onChange={e => setNuovaStagione(e.target.value)}
              placeholder="es. 2026/2027"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              {errors.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep('lista')}
              className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm">
              Indietro
            </button>
            <button
              onClick={handleConferma}
              disabled={saving || !nuovaStagione.trim()}
              className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-medium text-sm disabled:opacity-60"
            >
              {saving ? 'Applico...' : 'Conferma e avvia stagione'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}
      <div className="px-4 pt-4 pb-4 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
          Per i <strong>nuovi arrivi</strong> usa i form già esistenti: un nuovo giocatore si aggiunge da Segreteria → Giocatori,
          un nuovo allenatore da{' '}
          <button type="button" onClick={() => navigate('/admin/setup')} className="underline font-medium">Setup → Nuovo Allenatore</button>.
          Qui sotto gestisci solo chi è già attivo in società.
        </div>

        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">🏀 Giocatori ({giocatori.length})</p>
          <div className="space-y-2">
            {giocatori.map(g => (
              <PersonaRow
                key={g.id}
                nome={`${g.cognome} ${g.nome}`}
                squadraLabel={[g.squadra, g.squadra2, g.squadra3].filter(Boolean).join(', ')}
                azione={getAzione(`g-${g.id}`)}
                squadre={squadre}
                onAzione={patch => setAzione(`g-${g.id}`, patch)}
              />
            ))}
            {giocatori.length === 0 && <p className="text-xs text-gray-400 px-1">Nessun giocatore attivo</p>}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">👔 Allenatori ({allenatori.length})</p>
          <div className="space-y-2">
            {allenatori.map(a => (
              <PersonaRow
                key={a.id}
                nome={`${a.cognome} ${a.nome}`}
                squadraLabel={[a.squadra, a.squadra2, a.squadra3].filter(Boolean).join(', ')}
                azione={getAzione(`a-${a.id}`)}
                squadre={squadre}
                onAzione={patch => setAzione(`a-${a.id}`, patch)}
              />
            ))}
            {allenatori.length === 0 && <p className="text-xs text-gray-400 px-1">Nessun allenatore attivo</p>}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3">
        <button
          onClick={() => { setNuovaStagione(suggestNextStagione(stagioneCorrente)); setStep('riepilogo') }}
          className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform"
        >
          Vai al riepilogo
        </button>
      </div>
    </div>
  )
}
