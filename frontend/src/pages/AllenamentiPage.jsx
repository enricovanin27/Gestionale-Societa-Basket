import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, endOfWeek, eachDayOfInterval, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Edit2, X, Plus, Users, MapPin, Clock,
  CheckCircle, XCircle, AlertTriangle, MessageCircle, Info,
  LayoutGrid, List, ClipboardList,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ui/ToastProvider'
import { useWeekEvents } from '../hooks/useWeekEvents'
import { formatTime } from '../lib/utils'
import LoadingSpinner from '../components/LoadingSpinner'
import PageHeader from '../components/PageHeader'
import GrigliaSettimanale from '../components/GrigliaSettimanale'
import { PALETTE, GIORNI, GIORNO_FULL as GIORNI_LABEL } from '../lib/constants'
import { Modal, Field, inp } from '../components/ui'
import { inviaNotificaAnnullamento } from '../hooks/useAllenamenti'
import PrepSesioneInlineForm from '../components/PrepSesioneInlineForm'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getColor(squadra, allSquadre) {
  const idx = allSquadre.indexOf(squadra)
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length]
}

// evita lo shift UTC per date 'yyyy-MM-dd'
function safeDate(dateStr) { return new Date(dateStr + 'T12:00:00') }

// ─── Conflict checker ─────────────────────────────────────────────────────────
function timesOverlap(as, ae, bs, be) {
  const n = t => String(t).slice(0, 5)
  return n(as) < n(be) && n(ae) > n(bs)
}

function checkConflicts(form, others) {
  const errors = [], warnings = [], palestraConflicts = []
  if (!form.ora_inizio || !form.ora_fine) return { errors, warnings, palestraConflicts }
  for (const e of others) {
    if (!e.ora_inizio || !e.ora_fine || e.annullato) continue
    if (!timesOverlap(form.ora_inizio, form.ora_fine, e.ora_inizio, e.ora_fine)) continue
    if (form.palestra?.trim() && e.palestra?.trim() &&
        form.palestra.trim().toLowerCase() === e.palestra.trim().toLowerCase()) {
      errors.push(`${e.squadra} usa ${e.palestra} (${e.ora_inizio.slice(0,5)}–${e.ora_fine.slice(0,5)})`)
      palestraConflicts.push(e)
    }
    if (form.allenatori?.trim() && e.allenatori?.trim()) {
      const fa = form.allenatori.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
      const ea = e.allenatori.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
      const shared = fa.filter(a => ea.includes(a))
      if (shared.length > 0) warnings.push(`${shared.join(', ')} già impegnato con ${e.squadra}`)
    }
  }
  return { errors, warnings, palestraConflicts }
}

function palestraDisponibile(palestre, nome, giorno, oraInizio, oraFine) {
  if (!nome || !giorno || !oraInizio || !oraFine) return null
  const pal = palestre.find(p => p.nome === nome)
  if (!pal?.orari) return null
  const slot = pal.orari[giorno]
  if (!slot) return null
  const n = t => String(t).slice(0, 5)
  if (!slot.attivo) return `${nome} è chiusa il ${GIORNI_LABEL[giorno]}`
  const [pi, pf, ai, af] = [slot.ora_inizio, slot.ora_fine, oraInizio, oraFine].map(n)
  if (ai < pi || af > pf) return `${nome} disponibile ${pi}–${pf}`
  return null
}

// ─── ConflictIndicator ────────────────────────────────────────────────────────
function ConflictIndicator({ errors, warnings }) {
  if (!errors.length && !warnings.length) {
    return (
      <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
        <CheckCircle size={13} /> ✅ Slot libero
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {errors.map((m, i) => (
        <div key={i} className="flex items-start gap-1.5 text-red-600 text-xs">
          <XCircle size={13} className="mt-0.5 shrink-0" /> ❌ {m}
        </div>
      ))}
      {warnings.map((m, i) => (
        <div key={i} className="flex items-start gap-1.5 text-amber-600 text-xs">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> ⚠️ {m}
        </div>
      ))}
    </div>
  )
}

// ─── EditAllenamentoForm ──────────────────────────────────────────────────────
function EditAllenamentoForm({ event, contextEvents, onSave, saving }) {
  const [form, setForm] = useState({
    ora_inizio: formatTime(event.ora_inizio) || '18:00',
    ora_fine:   formatTime(event.ora_fine)   || '20:00',
    palestra:   event.palestra ?? '',
    allenatori: event.allenatori ? event.allenatori.split(',').map(a => a.trim()).filter(Boolean) : [],
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: palestreAll = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome, orari').order('nome')
      return data ?? []
    },
    staleTime: 10 * 60 * 1000,
  })
  const palestreDisp = useMemo(() => palestreAll.map(p => p.nome), [palestreAll])

  const { data: allenatoriDisp = [] } = useQuery({
    queryKey: ['allenatori-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('allenatori').select('nome, cognome').order('cognome').order('nome')
      return (data ?? []).map(a => [a.nome, a.cognome].filter(Boolean).join(' ')).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  const { societaId } = useAuth()
  const { data: prepAssegnato } = useQuery({
    queryKey: ['prep-squadra', event.squadra, societaId],
    enabled: !!societaId && !!event.squadra,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_squadre')
        .select('preparatore_id')
        .eq('squadra', event.squadra)
        .eq('societa_id', societaId)
        .limit(1)
      return data?.[0] ?? null
    },
    staleTime: 5 * 60 * 1000,
  })
  const { data: existingPrep } = useQuery({
    queryKey: ['prep-sessione-evento', societaId, event.data, event.squadra],
    enabled: !!societaId && !!event.data && !!event.squadra,
    staleTime: 30_000,
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

  const [includiAtletica, setIncludiAtletica] = useState(false)
  const [prepData, setPrepData] = useState({ quando: 'prima', durata_min: 30, su_campo: false })

  useEffect(() => {
    if (existingPrep) {
      setIncludiAtletica(true)
      setPrepData({
        quando:     existingPrep.quando,
        durata_min: existingPrep.durata_min,
        su_campo:   existingPrep.su_campo,
      })
    }
  }, [existingPrep])

  const toggleAllenatore = (a) =>
    set('allenatori', form.allenatori.includes(a) ? form.allenatori.filter(x => x !== a) : [...form.allenatori, a])

  const others = useMemo(() =>
    contextEvents.filter(e =>
      !(e._tipo === 'allenamento' && e.squadra === event.squadra && e.data === event.data)
    ), [contextEvents, event])

  const giornoEvento = useMemo(() => {
    if (!event.data) return null
    return GIORNI[(new Date(event.data + 'T12:00:00').getDay() + 6) % 7]
  }, [event.data])

  const [condivisione, setCondivisione] = useState(false)

  const allenatoriStr = useMemo(() => form.allenatori.join(', '), [form.allenatori])
  const { errors, warnings, palestraConflicts } = useMemo(() => checkConflicts({ ...form, allenatori: allenatoriStr }, others), [form, allenatoriStr, others])
  const palestraWarn = useMemo(() => palestraDisponibile(palestreAll, form.palestra, giornoEvento, form.ora_inizio, form.ora_fine), [palestreAll, form.palestra, giornoEvento, form.ora_inizio, form.ora_fine])
  const activeCondivisione = condivisione && palestraConflicts.length > 0
  const canSave = (!errors.length || activeCondivisione) && !!form.ora_inizio && !!form.ora_fine

  return (
    <form onSubmit={e => { e.preventDefault(); if (canSave) onSave({ ...form, allenatori: allenatoriStr, condivisione: activeCondivisione, _palestraConflicts: palestraConflicts, _prepData: includiAtletica ? prepData : null, _prepPreparatoreId: prepAssegnato?.preparatore_id ?? null }) }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ora inizio">
          <input type="time" value={form.ora_inizio} onChange={e => set('ora_inizio', e.target.value)} className={inp} required />
        </Field>
        <Field label="Ora fine">
          <input type="time" value={form.ora_fine} onChange={e => set('ora_fine', e.target.value)} className={inp} required />
        </Field>
      </div>
      <Field label="Palestra">
        {palestreDisp.length === 0 ? (
          <input value={form.palestra} onChange={e => set('palestra', e.target.value)} className={inp} placeholder="es. PalaOderzo" />
        ) : (
          <select value={form.palestra} onChange={e => set('palestra', e.target.value)} className={inp}>
            <option value="">Scegli...</option>
            {palestreDisp.map(p => <option key={p} value={p}>{p}</option>)}
            {form.palestra && !palestreDisp.includes(form.palestra) && (
              <option value={form.palestra}>{form.palestra}</option>
            )}
          </select>
        )}
      </Field>
      <Field label="Allenatori">
        {allenatoriDisp.length === 0 ? (
          <input value={allenatoriStr} onChange={e => set('allenatori', e.target.value.split(',').map(a => a.trim()).filter(Boolean))} className={inp} placeholder="es. Marco Rossi" />
        ) : (
          <div className="flex gap-1.5 flex-wrap mt-1">
            {allenatoriDisp.map(a => (
              <button key={a} type="button" onClick={() => toggleAllenatore(a)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  form.allenatori.includes(a) ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {a}
              </button>
            ))}
          </div>
        )}
      </Field>
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-indigo-700">Preparazione atletica</p>
          <button type="button"
            onClick={() => setIncludiAtletica(v => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              includiAtletica ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-200'
            }`}
          >
            {includiAtletica ? '✓ Inclusa' : 'Aggiungi'}
          </button>
        </div>
        {includiAtletica && (
          <PrepSesioneInlineForm
            onChange={d => setPrepData(d)}
            initialQuando={prepData.quando}
            initialDurata={String(prepData.durata_min)}
            initialSuCampo={prepData.su_campo}
          />
        )}
      </div>

      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
        <p className="text-xs text-gray-400 mb-1.5 font-medium">Controllo disponibilità</p>
        <ConflictIndicator errors={activeCondivisione ? [] : errors} warnings={warnings} />
        {activeCondivisione && errors.length > 0 && (
          <div className="flex items-center gap-1.5 text-violet-600 text-xs">
            <CheckCircle size={13} className="shrink-0" /> Condivisione campo attiva
          </div>
        )}
        {palestraWarn && (
          <div className="flex items-start gap-1.5 text-red-600 text-xs">
            <XCircle size={13} className="mt-0.5 shrink-0" /> {palestraWarn}
          </div>
        )}
        {palestraConflicts.length > 0 && (
          <button type="button" onClick={() => setCondivisione(c => !c)}
            className={`w-full mt-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              condivisione
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-50'
            }`}>
            {condivisione ? '✓ Condividono il campo' : 'Condividono il campo'}
          </button>
        )}
      </div>
      <button type="submit" disabled={saving || !canSave}
        className="w-full py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
        {saving ? 'Salvataggio...' : 'Salva in settimana'}
      </button>
      {errors.length > 0 && !activeCondivisione && (
        <p className="text-center text-xs text-red-500">Risolvi i conflitti o attiva condivisione campo</p>
      )}
    </form>
  )
}

// ─── TrainingColumnCard (compact, per vista colonne) ─────────────────────────
function TrainingColumnCard({ event, color, onEdit, onCancel, onPresenze, presAl }) {
  const col = color ?? PALETTE[0]
  const showActions = (onEdit || onCancel || onPresenze) && !event.annullato
  return (
    <div className={`rounded-lg bg-white border border-l-4 border-gray-100 ${col.border} p-2 mb-1.5 shadow-sm ${event.annullato ? 'opacity-40' : ''}`}>
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold truncate mb-0.5 ${col.title}`}>{event.squadra}</div>
          {event.annullato && <span className="block text-xs text-red-500">Annullato</span>}
          {event._source === 'override' && !event.annullato && <span className="block text-xs text-orange-500">Modificato</span>}
          {event._source === 'extra' && <span className="block text-xs text-teal-600">Extra</span>}
          {String(event.condivisione).toUpperCase() === 'SI' && <span className="block text-xs text-violet-600">Campo cond.</span>}
          <div className="flex items-center gap-1 mt-0.5">
            <Clock size={10} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-600 font-medium">{formatTime(event.ora_inizio)}</span>
          </div>
          {event.palestra && <div className="text-xs text-gray-400 truncate mt-0.5">{event.palestra}</div>}
          {presAl?.total > 0 && (
            <div className="text-xs text-gray-400 mt-0.5">✅{presAl.presente} ❌{presAl.assente}</div>
          )}
        </div>
        {showActions && (
          <div className="flex gap-0.5 shrink-0">
            {onPresenze && (
              <button onClick={onPresenze} title="Segna presenze" className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors">
                <ClipboardList size={12} />
              </button>
            )}
            {onEdit && (
              <button onClick={onEdit} title="Modifica" className="p-1 text-amber-600 hover:bg-amber-50 rounded transition-colors">
                <Edit2 size={12} />
              </button>
            )}
            {onCancel && (
              <button onClick={onCancel} title="Annulla" className="p-1 text-red-400 hover:bg-red-50 rounded transition-colors">
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TrainingCard ─────────────────────────────────────────────────────────────
function TrainingCard({ event, color, canEdit, onEdit, onCancel, onPresenze, presenze, presAl }) {
  const col = color ?? PALETTE[0]
  const showPresenze = presenze && (presenze.presente > 0 || presenze.assente > 0 || presenze.forse > 0)
  return (
    <div className={`rounded-xl bg-white border border-l-4 border-gray-100 ${col.border} p-3 shadow-sm ${event.annullato ? 'opacity-40' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`font-semibold text-sm ${col.title}`}>{event.squadra}</span>
            {event.annullato && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Annullato</span>
            )}
            {event._source === 'override' && !event.annullato && (
              <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">Modificato</span>
            )}
            {event._source === 'extra' && (
              <span className="text-xs bg-teal-100 text-teal-600 px-2 py-0.5 rounded-full">Extra</span>
            )}
            {String(event.condivisione).toUpperCase() === 'SI' && (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Condivisione campo</span>
            )}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-xs text-gray-600 font-medium">
              <Clock size={11} className="text-gray-400" />
              {formatTime(event.ora_inizio)} – {formatTime(event.ora_fine)}
            </div>
            {event.palestra && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin size={11} className="text-gray-400" /> {event.palestra}
              </div>
            )}
            {event.allenatori && (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Users size={11} className="text-gray-400" /> {event.allenatori}
              </div>
            )}
          </div>
          {showPresenze && (
            <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-gray-100">
              {presenze.presente > 0 && <span className="text-xs text-green-600 font-medium">✅ {presenze.presente}</span>}
              {presenze.forse    > 0 && <span className="text-xs text-amber-500 font-medium">❓ {presenze.forse}</span>}
              {presenze.assente  > 0 && <span className="text-xs text-red-500 font-medium">❌ {presenze.assente}</span>}
            </div>
          )}
          {presAl?.total > 0 && (
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-100">
              <ClipboardList size={11} className="text-emerald-500" />
              <span className="text-xs text-emerald-600 font-medium">✅ {presAl.presente}</span>
              <span className="text-xs text-red-500 font-medium">❌ {presAl.assente}</span>
            </div>
          )}
        </div>
        {canEdit && !event.annullato && (
          <div className="flex gap-0.5 shrink-0">
            {onPresenze && (
              <button onClick={onPresenze} title="Segna presenze" className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                <ClipboardList size={14} />
              </button>
            )}
            <button onClick={onEdit}   title="Modifica" className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={onCancel} title="Annulla"  className="p-1.5 text-red-400 hover:bg-red-100 rounded-lg transition-colors">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DB mutations ─────────────────────────────────────────────────────────────
async function markCondivisioneOnConflicts(conflicts, date, societaId) {
  for (const e of conflicts) {
    if (e._table === 'orario_settimana' && e.id) {
      const { error } = await supabase.from('orario_settimana').update({ condivisione: 'SI' }).eq('id', e.id)
      if (error) throw error
    } else if (e._table === 'orario_fisso' && e.id) {
      const { data: existing } = await supabase
        .from('orario_settimana').select('id')
        .eq('data', date).eq('squadra', e.squadra).maybeSingle()
      if (existing) {
        const { error } = await supabase.from('orario_settimana').update({ condivisione: 'SI' }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('orario_settimana').insert([{
          data: date, squadra: e.squadra,
          ora_inizio: e.ora_inizio, ora_fine: e.ora_fine,
          palestra: e.palestra ?? '', allenatori: e.allenatori ?? '',
          annullato: false, condivisione: 'SI', societa_id: societaId,
        }])
        if (error) throw error
      }
    }
  }
}

async function saveToSettimana(event, formData, societaId) {
  const payload = {
    data: event.data, squadra: event.squadra,
    ora_inizio: formData.ora_inizio, ora_fine: formData.ora_fine,
    palestra: formData.palestra, allenatori: formData.allenatori,
    annullato: false,
    condivisione: formData.condivisione ? 'SI' : 'NO',
  }
  if (event._source === 'fisso') {
    const { data: existing } = await supabase
      .from('orario_settimana').select('id')
      .eq('data', event.data).eq('squadra', event.squadra).maybeSingle()
    if (existing) {
      const { error } = await supabase.from('orario_settimana').update(payload).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('orario_settimana').insert([{ ...payload, societa_id: societaId }])
      if (error) throw error
    }
  } else {
    const { error } = await supabase.from('orario_settimana').update(payload).eq('id', event.id)
    if (error) throw error
  }
}

async function cancelAllenamento(event, societaId) {
  const base = {
    data: event.data, squadra: event.squadra,
    ora_inizio: event.ora_inizio, ora_fine: event.ora_fine,
    palestra: event.palestra ?? '', allenatori: event.allenatori ?? '',
    annullato: true,
  }
  if (event._source === 'fisso') {
    const { data: existing } = await supabase
      .from('orario_settimana').select('id')
      .eq('data', event.data).eq('squadra', event.squadra).maybeSingle()
    if (existing) {
      const { error } = await supabase.from('orario_settimana').update({ annullato: true }).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('orario_settimana').insert([{ ...base, societa_id: societaId }])
      if (error) throw error
    }
  } else {
    const { error } = await supabase.from('orario_settimana').update({ annullato: true }).eq('id', event.id)
    if (error) throw error
  }
}

// ─── AddAllenamentoModal ──────────────────────────────────────────────────────

const GIORNO_OFFSET = { lunedi: 0, martedi: 1, mercoledi: 2, giovedi: 3, venerdi: 4, sabato: 5, domenica: 6 }

const EMPTY_ADD = { squadra: '', giorno: 'lunedi', ora_inizio: '18:00', ora_fine: '20:00', palestra: '', allenatori: [] }

function AddAllenamentoModal({ weekStart, allSquadre, onClose, onSaved, squadreAllenatore = null }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [form, setForm] = useState(EMPTY_ADD)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: squadreAll = [] } = useQuery({
    queryKey: ['squadre-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 5 * 60 * 1000,
  })
  const squadreDisp = useMemo(
    () => squadreAllenatore ? squadreAll.filter(s => squadreAllenatore.includes(s)) : squadreAll,
    [squadreAll, squadreAllenatore]
  )

  const { data: palestreAll = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome, orari').order('nome')
      return data ?? []
    },
    staleTime: 10 * 60 * 1000,
  })
  const palestre = useMemo(() => palestreAll.map(p => p.nome), [palestreAll])

  const { data: allenatoriAll = [] } = useQuery({
    queryKey: ['allenatori-con-squadre'],
    queryFn: async () => {
      const { data } = await supabase
        .from('allenatori').select('nome, cognome, squadre, squadre_capo, squadre_vice')
        .order('cognome').order('nome')
      return (data ?? []).map(a => ({
        nome: [a.nome, a.cognome].filter(Boolean).join(' '),
        squadre: a.squadre ?? '',
        squadre_capo: a.squadre_capo ?? '',
        squadre_vice: a.squadre_vice ?? '',
      })).filter(a => a.nome)
    },
    staleTime: 5 * 60 * 1000,
  })

  const allenatoriDisp = useMemo(() => allenatoriAll.map(a => a.nome), [allenatoriAll])

  function handleSquadraChange(sq) {
    const check = (str) => (str ?? '').split(',').map(s => s.trim()).filter(Boolean).includes(sq)
    const assoc = allenatoriAll.filter(a => check(a.squadre) || check(a.squadre_capo) || check(a.squadre_vice)).map(a => a.nome)
    setForm(f => ({ ...f, squadra: sq, allenatori: assoc }))
  }

  // Compute target date from weekStart + giorno
  const targetDate = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + (GIORNO_OFFSET[form.giorno] ?? 0))
    return format(d, 'yyyy-MM-dd')
  }, [weekStart, form.giorno])

  // Fetch events for conflict check on that date
  const { data: weekData } = useWeekEvents(weekStart)
  const contextEvents = useMemo(() => {
    if (!weekData) return []
    return weekData.eventsByDate?.[targetDate] ?? []
  }, [weekData, targetDate])

  const [condivisione, setCondivisione] = useState(false)

  const { errors, warnings, palestraConflicts } = useMemo(() => checkConflicts(
    { ...form, allenatori: form.allenatori.join(', ') },
    contextEvents
  ), [form, contextEvents])
  const palestraWarn = useMemo(() => palestraDisponibile(palestreAll, form.palestra, form.giorno, form.ora_inizio, form.ora_fine), [palestreAll, form.palestra, form.giorno, form.ora_inizio, form.ora_fine])
  const activeCondivisione = condivisione && palestraConflicts.length > 0
  const canSave = (!errors.length || activeCondivisione) && !palestraWarn && !!form.squadra.trim() && !!form.palestra.trim() && !!form.ora_inizio && !!form.ora_fine

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        data: targetDate,
        squadra: form.squadra,
        ora_inizio: form.ora_inizio,
        ora_fine: form.ora_fine,
        palestra: form.palestra,
        allenatori: form.allenatori.join(', '),
        annullato: false,
        condivisione: activeCondivisione ? 'SI' : 'NO',
      }
      const { error } = await supabase.from('orario_settimana').insert([{ ...payload, societa_id: societaId }])
      if (error) throw error
      if (activeCondivisione && palestraConflicts.length)
        await markCondivisioneOnConflicts(palestraConflicts, targetDate, societaId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      onSaved?.()
      onClose()
    },
  })

  const toggleAllenatore = (a) =>
    set('allenatori', form.allenatori.includes(a) ? form.allenatori.filter(x => x !== a) : [...form.allenatori, a])

  return (
    <Modal title="Aggiungi allenamento" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (canSave) saveMut.mutateAsync() }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Squadra *">
            <select value={form.squadra} onChange={e => handleSquadraChange(e.target.value)} className={inp}>
              <option value="">Scegli...</option>
              {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Giorno *">
            <select value={form.giorno} onChange={e => set('giorno', e.target.value)} className={inp}>
              {GIORNI.map(g => <option key={g} value={g}>{GIORNI_LABEL[g]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ora inizio *">
            <input type="time" value={form.ora_inizio} onChange={e => set('ora_inizio', e.target.value)} className={inp} />
          </Field>
          <Field label="Ora fine *">
            <input type="time" value={form.ora_fine} onChange={e => set('ora_fine', e.target.value)} className={inp} />
          </Field>
        </div>
        <Field label="Palestra *">
          <select value={form.palestra} onChange={e => set('palestra', e.target.value)} className={inp}>
            <option value="">Scegli...</option>
            {palestre.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Allenatori">
          {allenatoriDisp.length === 0 ? (
            <input value={form.allenatori.join(', ')} onChange={e => set('allenatori', e.target.value.split(',').map(a => a.trim()).filter(Boolean))} className={inp} placeholder="es. Marco Rossi" />
          ) : (
            <div className="flex gap-1.5 flex-wrap mt-1">
              {allenatoriDisp.map(a => (
                <button key={a} type="button" onClick={() => toggleAllenatore(a)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    form.allenatori.includes(a) ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {a}
                </button>
              ))}
            </div>
          )}
        </Field>
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
          <p className="text-xs text-gray-400 mb-1.5 font-medium">
            Controllo disponibilità — {GIORNI_LABEL[form.giorno]} {targetDate}
          </p>
          <ConflictIndicator errors={activeCondivisione ? [] : errors} warnings={warnings} />
          {activeCondivisione && errors.length > 0 && (
            <div className="flex items-center gap-1.5 text-violet-600 text-xs">
              <CheckCircle size={13} className="shrink-0" /> Condivisione campo attiva
            </div>
          )}
          {palestraWarn && (
            <div className="flex items-start gap-1.5 text-red-600 text-xs">
              <XCircle size={13} className="mt-0.5 shrink-0" /> {palestraWarn}
            </div>
          )}
          {palestraConflicts.length > 0 && (
            <button type="button" onClick={() => setCondivisione(c => !c)}
              className={`w-full mt-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                condivisione
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-50'
              }`}>
              {condivisione ? '✓ Condividono il campo' : 'Condividono il campo'}
            </button>
          )}
        </div>
        {saveMut.isError && <p className="text-xs text-red-500">{saveMut.error?.message}</p>}
        <button type="submit" disabled={saveMut.isPending || !canSave}
          className="w-full py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saveMut.isPending ? 'Salvataggio...' : '✅ Aggiungi allenamento'}
        </button>
        {errors.length > 0 && !activeCondivisione && (
          <p className="text-center text-xs text-red-500">Risolvi i conflitti o attiva condivisione campo</p>
        )}
        {!errors.length && (!form.squadra.trim() || !form.palestra.trim()) && (
          <p className="text-center text-xs text-red-500">Compila tutti i campi obbligatori (*)</p>
        )}
      </form>
    </Modal>
  )
}

// ─── SettimanaView (riusato da Tab 2 e Tab 3) ────────────────────────────────
// ─── PresenzeAllenamentoModal ─────────────────────────────────────────────────
function PresenzeAllenamentoModal({ event, onClose }) {
  const { societaId } = useAuth()
  const qc = useQueryClient()

  const { data: giocatori = [], isLoading } = useQuery({
    queryKey: ['giocatori-presenze-modal', event.squadra],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .or(`squadra.eq.${event.squadra},squadra2.eq.${event.squadra},squadra3.eq.${event.squadra}`)
        .eq('attivo', true)
        .order('cognome')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: existing = [] } = useQuery({
    queryKey: ['presenze-al-modal', event.data, event.squadra],
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('giocatore_id, presente')
        .eq('data', event.data)
        .eq('squadra', event.squadra)
      return data ?? []
    },
  })

  const presenzaMap = useMemo(
    () => Object.fromEntries(existing.map(p => [p.giocatore_id, p.presente])),
    [existing]
  )

  const toggleMut = useMutation({
    mutationFn: async ({ giocatoreId, presente }) => {
      const { error } = await supabase
        .from('presenze_allenamento')
        .upsert([{ societa_id: societaId, giocatore_id: giocatoreId, data: event.data, squadra: event.squadra, presente }],
          { onConflict: 'giocatore_id,data' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presenze-al-modal', event.data, event.squadra] }),
  })

  const presenti = existing.filter(p => p.presente).length
  const assenti  = existing.filter(p => !p.presente).length
  const dataLabel = new Date(event.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Modal title="Presenze allenamento" subtitle={`${event.squadra} — ${dataLabel}`} onClose={onClose}>
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
        <span className="text-sm text-gray-500">{giocatori.length} giocatori</span>
        {existing.length > 0 && (
          <>
            <span className="text-xs text-emerald-600 font-medium">✅ {presenti} presenti</span>
            <span className="text-xs text-red-500 font-medium">❌ {assenti} assenti</span>
          </>
        )}
      </div>
      {isLoading ? <LoadingSpinner message="Caricamento giocatori..." /> : giocatori.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Nessun giocatore in questa squadra.<br />
          <span className="text-xs">Aggiungili dalla tab Giocatori in Setup.</span>
        </p>
      ) : (
        <div className="space-y-2">
          {giocatori.map(g => {
            const recorded = g.id in presenzaMap
            const presente = presenzaMap[g.id]
            return (
              <div key={g.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                <span className="flex-1 text-sm text-gray-800 font-medium">{g.cognome} {g.nome}</span>
                <button
                  onClick={() => toggleMut.mutate({ giocatoreId: g.id, presente: true })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${recorded && presente ? 'bg-emerald-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-emerald-400'}`}
                >✅</button>
                <button
                  onClick={() => toggleMut.mutate({ giocatoreId: g.id, presente: false })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${recorded && !presente ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-red-400'}`}
                >❌</button>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

function SettimanaView({ weekStart, allSquadre, canEdit, showWhatsApp, showDiff, squadraFilter, allenatoreFilter = '', palestraFilter = '', squadreAllenatore = null, onlySquadre = null }) {
  const qc      = useQueryClient()
  const { societaId } = useAuth()
  const { toast, confirm } = useToast()
  const canEditEvent = (ev) => !squadreAllenatore || squadreAllenatore.includes(ev.squadra)
  const inScope = (ev) => !onlySquadre || onlySquadre.includes(ev.squadra)
  const weekEnd  = endOfWeek(weekStart, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const [editingEvent,     setEditingEvent]     = useState(null)
  const [editingDayEvents, setEditingDayEvents] = useState([])
  const [showAddForm,      setShowAddForm]      = useState(false)
  const [gridView,         setGridView]         = useState(false)

  const { data: weekData, isLoading, error } = useWeekEvents(weekStart)

  const { data: cancelledRows = [] } = useQuery({
    queryKey: ['cancelled-sett', format(weekStart, 'yyyy-MM-dd')],
    enabled: showDiff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orario_settimana').select('*')
        .gte('data', format(weekStart, 'yyyy-MM-dd'))
        .lte('data', format(weekEnd,   'yyyy-MM-dd'))
        .eq('annullato', true)
      if (error) throw error
      return data ?? []
    },
  })

  const saveMut = useMutation({
    mutationFn: async ({ event, formData, isEdit = false }) => {
      await saveToSettimana(event, formData, societaId)
      if (formData.condivisione && formData._palestraConflicts?.length)
        await markCondivisioneOnConflicts(formData._palestraConflicts, event.data, societaId)
      if (isEdit) {
        // In modalità edit: cancella il record esistente (se c'è) per poi reinserirlo aggiornato
        await supabase
          .from('prep_sessioni')
          .delete()
          .eq('societa_id', societaId)
          .eq('data', event.data)
          .eq('squadra', event.squadra)
          .eq('tipo', 'allenamento')
      }
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
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      qc.invalidateQueries({ queryKey: ['cancelled-sett'] })
      qc.invalidateQueries({ queryKey: ['prep-sessione-evento', societaId, variables.event.data, variables.event.squadra] })
      setEditingEvent(null)
    },
  })

  const cancelMut = useMutation({
    mutationFn: (event) => cancelAllenamento(event, societaId),
    onSuccess: (_, event) => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      qc.invalidateQueries({ queryKey: ['cancelled-sett'] })
      inviaNotificaAnnullamento(event.squadra, societaId, event.data)
    },
  })

  const bachecaMut = useMutation({
    mutationFn: async (testo) => {
      const { error } = await supabase.from('annunci').insert([{ testo, societa_id: societaId }])
      if (error) throw error
    },
  })

  const { data: presenzeWeek = [] } = useQuery({
    queryKey: ['presenze-sett', format(weekStart, 'yyyy-MM-dd'), societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze')
        .select('data, squadra, risposta')
        .gte('data', format(weekStart, 'yyyy-MM-dd'))
        .lte('data', format(weekEnd, 'yyyy-MM-dd'))
        .eq('societa_id', societaId)
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  const { data: presenzeAlWeek = [] } = useQuery({
    queryKey: ['presenze-al-sett', format(weekStart, 'yyyy-MM-dd'), societaId],
    enabled: !!societaId && canEdit,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('data, squadra, presente')
        .gte('data', format(weekStart, 'yyyy-MM-dd'))
        .lte('data', format(weekEnd, 'yyyy-MM-dd'))
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  const [presenzeAlEvent, setPresenzeAlEvent] = useState(null)

  function getPresenzeCount(data, squadra) {
    const rows = presenzeWeek.filter((p) => p.data === data && p.squadra === squadra)
    return {
      presente: rows.filter((r) => r.risposta === 'presente').length,
      assente:  rows.filter((r) => r.risposta === 'assente').length,
      forse:    rows.filter((r) => r.risposta === 'forse').length,
    }
  }

  function getPresenzeAlCount(data, squadra) {
    const rows = presenzeAlWeek.filter((p) => p.data === data && p.squadra === squadra)
    return { presente: rows.filter(r => r.presente).length, assente: rows.filter(r => !r.presente).length, total: rows.length }
  }

  const diffs = useMemo(() => {
    if (!showDiff || !weekData) return []
    const result = []
    for (const e of weekData.events) {
      if (e._tipo !== 'allenamento') continue
      if (e._source === 'override') result.push({ type: 'modified', event: e })
      if (e._source === 'extra')    result.push({ type: 'extra',    event: e })
    }
    for (const c of cancelledRows) result.push({ type: 'cancelled', event: c })
    return result
  }, [showDiff, weekData, cancelledRows])

  const waText = useMemo(() => {
    if (!showWhatsApp || !weekData) return ''
    const s = format(weekStart, 'd', { locale: it })
    const e = format(weekEnd,   'd MMMM yyyy', { locale: it })
    let msg = `🏀 *ALLENAMENTI ODERZO BASKET*\n📅 Settimana ${s}–${e}\n`
    for (const day of weekDays) {
      const dateStr = format(day, 'yyyy-MM-dd')
      const evs = (weekData.eventsByDate?.[dateStr] ?? [])
        .filter(ev => ev._tipo === 'allenamento' && !ev.annullato
        && (!squadraFilter || ev.squadra === squadraFilter)
        && (!allenatoreFilter || (ev.allenatori ?? '').split(',').some(a => a.trim().toLowerCase().includes(allenatoreFilter.toLowerCase())))
        && (!palestraFilter || ev.palestra === palestraFilter))
        .sort((a, b) => (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? ''))
      if (!evs.length) continue
      msg += `\n*📌 ${format(safeDate(dateStr), 'EEEE d MMMM', { locale: it })}*\n`
      for (const ev of evs) {
        msg += `▪️ *${ev.squadra}* | ${formatTime(ev.ora_inizio)}–${formatTime(ev.ora_fine)}`
        if (ev.palestra)   msg += ` | ${ev.palestra}`
        if (ev.allenatori) msg += `\n   👤 ${ev.allenatori}`
        msg += '\n'
      }
    }
    if (diffs.length > 0) {
      msg += '\n⚠️ *Variazioni dalla settimana tipo:*\n'
      for (const d of diffs) {
        const dl = d.event.data ? format(safeDate(d.event.data), 'EEEE', { locale: it }) : ''
        if (d.type === 'cancelled') msg += `• ❌ *${d.event.squadra}* (${dl}): ANNULLATO\n`
        if (d.type === 'modified')  msg += `• ✏️ *${d.event.squadra}* (${dl}): → ${formatTime(d.event.ora_inizio)}–${formatTime(d.event.ora_fine)}\n`
        if (d.type === 'extra')     msg += `• ➕ *${d.event.squadra}* (${dl}): allenamento extra\n`
      }
    } else {
      msg += '\n✅ Nessuna variazione dalla settimana tipo'
    }
    return msg
  }, [showWhatsApp, weekData, weekDays, weekStart, weekEnd, diffs])

  if (isLoading) return <LoadingSpinner message="Caricamento allenamenti..." />
  if (error)     return <div className="py-8 text-center text-sm text-gray-500">{error.message}</div>

  const trainings = (weekData?.events?.filter(e => e._tipo === 'allenamento') ?? [])
    .filter(e => inScope(e))
    .filter(e => !squadraFilter || e.squadra === squadraFilter)
    .filter(e => !allenatoreFilter || (e.allenatori ?? '').split(',').some(a => a.trim().toLowerCase().includes(allenatoreFilter.toLowerCase())))
    .filter(e => !palestraFilter || e.palestra === palestraFilter)

  return (
    <div className="space-y-5">
      {/* Toggle vista */}
      <div className="flex justify-end">
        <button
          onClick={() => setGridView(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
            gridView
              ? 'bg-gray-700 text-white border-gray-700'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          {gridView ? <List size={15} /> : <LayoutGrid size={15} />}
          {gridView ? 'Lista' : 'Griglia'}
        </button>
      </div>

      {gridView ? (
        <GrigliaSettimanale weekStart={weekStart} allSquadre={allSquadre} />
      ) : (
        <>
          <div className="overflow-x-auto -mx-4 px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex pb-3" style={{ minWidth: 'max-content' }}>
              {weekDays.map((day, di) => {
                const dateStr      = format(day, 'yyyy-MM-dd')
                const dayAllEvents = weekData?.eventsByDate?.[dateStr] ?? []
                const dayTrainings = dayAllEvents
                  .filter(e => e._tipo === 'allenamento'
                    && (!squadraFilter || e.squadra === squadraFilter)
                    && (!allenatoreFilter || (e.allenatori ?? '').split(',').some(a => a.trim().toLowerCase().includes(allenatoreFilter.toLowerCase())))
                    && (!palestraFilter || e.palestra === palestraFilter))
                  .sort((a, b) => (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? ''))
                const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr
                const isLast  = di === weekDays.length - 1
                return (
                  <div key={dateStr} className={`w-36 flex-shrink-0 ${!isLast ? 'border-r border-gray-200 mr-2 pr-1' : ''}`}>
                    <div className={`rounded-xl p-2 mb-2 text-center ${isToday ? 'bg-amber-600' : 'bg-white border border-gray-200'}`}>
                      <div className={`text-xs font-medium uppercase tracking-wide ${isToday ? 'text-amber-100' : 'text-gray-400'}`}>
                        {format(safeDate(dateStr), 'EEE', { locale: it })}
                      </div>
                      <div className={`text-lg font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-700'}`}>
                        {format(safeDate(dateStr), 'd')}
                      </div>
                    </div>
                    {dayTrainings.length === 0 ? (
                      <div className="text-gray-300 text-center py-4 text-xs select-none">–</div>
                    ) : (
                      dayTrainings.map((ev, i) => (
                        <TrainingColumnCard
                          key={`${ev._source}-${ev.id ?? i}`}
                          event={ev}
                          color={getColor(ev.squadra, allSquadre)}
                          presenze={getPresenzeCount(ev.data, ev.squadra)}
                          presAl={getPresenzeAlCount(ev.data, ev.squadra)}
                          onEdit={canEdit && canEditEvent(ev) ? () => { setEditingEvent(ev); setEditingDayEvents(dayAllEvents) } : undefined}
                          onCancel={canEdit && canEditEvent(ev) && !ev.annullato ? () =>
                            confirm(`Annullare l'allenamento di ${ev.squadra}?`, () => cancelMut.mutate(ev),
                              { confirmLabel: 'Annulla allenamento' })
                          : undefined}
                          onPresenze={canEdit && canEditEvent(ev) ? () => setPresenzeAlEvent(ev) : undefined}
                        />
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Riepilogo variazioni */}
          {showDiff && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Info size={14} className="text-gray-400" /> Variazioni dalla settimana tipo
              </h3>
              {!diffs.length ? (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle size={14} /> Nessuna variazione
                </div>
              ) : (
                <div className="space-y-1.5">
                  {diffs.map((d, i) => {
                    const dl = d.event.data ? format(safeDate(d.event.data), 'EEEE d/MM', { locale: it }) : ''
                    return (
                      <div key={i} className={`flex items-start gap-2 text-xs rounded-lg px-2.5 py-2 ${
                        d.type === 'cancelled' ? 'bg-red-50 text-red-700' :
                        d.type === 'extra'     ? 'bg-teal-50 text-teal-700' :
                                                  'bg-orange-50 text-orange-700'
                      }`}>
                        <span>{d.type === 'cancelled' ? '❌' : d.type === 'extra' ? '➕' : '✏️'}</span>
                        <span>
                          <strong>{d.event.squadra}</strong> ({dl}):{' '}
                          {d.type === 'cancelled' && 'ANNULLATO'}
                          {d.type === 'modified'  && `spostato → ${formatTime(d.event.ora_inizio)}–${formatTime(d.event.ora_fine)}`}
                          {d.type === 'extra'     && 'allenamento extra'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Pubblica variazioni in bacheca */}
          {showDiff && diffs.length > 0 && (
            <button
              disabled={bachecaMut.isPending}
              onClick={async () => {
                const s = format(weekStart, 'd', { locale: it })
                const e = format(weekEnd, 'd MMMM yyyy', { locale: it })
                let testo = `📢 Variazioni allenamenti – settimana ${s}–${e}\n`
                for (const d of diffs) {
                  const dl = d.event.data ? format(safeDate(d.event.data), 'EEEE d/MM', { locale: it }) : ''
                  if (d.type === 'cancelled') testo += `❌ ${d.event.squadra} (${dl}): ANNULLATO\n`
                  if (d.type === 'modified')  testo += `✏️ ${d.event.squadra} (${dl}): spostato → ${formatTime(d.event.ora_inizio)}–${formatTime(d.event.ora_fine)}\n`
                  if (d.type === 'extra')     testo += `➕ ${d.event.squadra} (${dl}): allenamento extra\n`
                }
                await bachecaMut.mutateAsync(testo)
                toast.success('Variazioni pubblicate in bacheca!')
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform shadow-sm disabled:opacity-60"
            >
              📢 Pubblica variazioni in bacheca
            </button>
          )}

          {/* Bottone WhatsApp */}
          {showWhatsApp && (
            <button
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(waText)
                    .then(() => toast.success('Testo copiato! Incollalo su WhatsApp.'))
                    .catch(() => toast.info(waText))
                } else {
                  toast.info(waText)
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform shadow-sm"
            >
              <MessageCircle size={18} /> 📱 Copia messaggio WhatsApp
            </button>
          )}
        </>
      )}

      {canEdit && (
        <button
          onClick={() => setShowAddForm(true)}
          className="fixed bottom-24 right-4 w-14 h-14 bg-amber-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-amber-700 active:scale-95 transition-all z-20"
          aria-label="Aggiungi allenamento"
        >
          <Plus size={28} />
        </button>
      )}

      {editingEvent && (
        <Modal
          title="Modifica allenamento"
          subtitle={`${editingEvent.squadra} — ${editingEvent.data ? format(safeDate(editingEvent.data), 'EEEE d MMMM', { locale: it }) : ''}`}
          onClose={() => setEditingEvent(null)}
        >
          <EditAllenamentoForm
            event={editingEvent}
            contextEvents={editingDayEvents}
            saving={saveMut.isPending}
            onSave={formData => saveMut.mutateAsync({ event: editingEvent, formData, isEdit: true })}
          />
        </Modal>
      )}

      {showAddForm && (
        <AddAllenamentoModal
          weekStart={weekStart}
          allSquadre={allSquadre}
          squadreAllenatore={squadreAllenatore}
          onClose={() => setShowAddForm(false)}
          onSaved={() => {}}
        />
      )}
      {presenzeAlEvent && (
        <PresenzeAllenamentoModal event={presenzeAlEvent} onClose={() => setPresenzeAlEvent(null)} />
      )}
    </div>
  )
}

// ─── TAB 1: OGGI ─────────────────────────────────────────────────────────────
function OggiTab({ allSquadre, canEdit, squadraFilter, allenatoreFilter = '', palestraFilter = '', squadreAllenatore = null, onlySquadre = null }) {
  const qc        = useQueryClient()
  const { societaId } = useAuth()
  const { confirm } = useToast()
  const canEditEvent = (ev) => !squadreAllenatore || squadreAllenatore.includes(ev.squadra)
  const inScope = (ev) => !onlySquadre || onlySquadre.includes(ev.squadra)
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const todayStr  = format(new Date(), 'yyyy-MM-dd')
  const [gridView, setGridView] = useState(false)

  const { data: weekData, isLoading, error: weekError } = useWeekEvents(weekStart)
  const [editingEvent,     setEditingEvent]     = useState(null)
  const [editingDayEvents, setEditingDayEvents] = useState([])
  const [showAddForm,      setShowAddForm]      = useState(false)

  const saveMut = useMutation({
    mutationFn: async ({ event, formData, isEdit = false }) => {
      await saveToSettimana(event, formData, societaId)
      if (formData.condivisione && formData._palestraConflicts?.length)
        await markCondivisioneOnConflicts(formData._palestraConflicts, event.data, societaId)
      if (isEdit) {
        await supabase
          .from('prep_sessioni')
          .delete()
          .eq('societa_id', societaId)
          .eq('data', event.data)
          .eq('squadra', event.squadra)
          .eq('tipo', 'allenamento')
      }
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
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      qc.invalidateQueries({ queryKey: ['cancelled-sett'] })
      qc.invalidateQueries({ queryKey: ['prep-sessione-evento', societaId, variables.event.data, variables.event.squadra] })
      setEditingEvent(null)
    },
  })
  const cancelMut = useMutation({
    mutationFn: (event) => cancelAllenamento(event, societaId),
    onSuccess: (_, event) => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      inviaNotificaAnnullamento(event.squadra, societaId, event.data)
    },
  })

  const { data: presenzeOggi = [] } = useQuery({
    queryKey: ['presenze-oggi', todayStr, societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze')
        .select('squadra, risposta')
        .eq('data', todayStr)
        .eq('societa_id', societaId)
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  const { data: presenzeAlOggi = [] } = useQuery({
    queryKey: ['presenze-al-oggi', todayStr, societaId],
    enabled: !!societaId && canEdit,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('squadra, presente')
        .eq('data', todayStr)
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  const [presenzeAlEvent, setPresenzeAlEvent] = useState(null)

  function getPresenzeOggiCount(squadra) {
    const rows = presenzeOggi.filter((p) => p.squadra === squadra)
    return {
      presente: rows.filter((r) => r.risposta === 'presente').length,
      assente:  rows.filter((r) => r.risposta === 'assente').length,
      forse:    rows.filter((r) => r.risposta === 'forse').length,
    }
  }

  function getPresenzeAlOggiCount(squadra) {
    const rows = presenzeAlOggi.filter(p => p.squadra === squadra)
    return { presente: rows.filter(r => r.presente).length, assente: rows.filter(r => !r.presente).length, total: rows.length }
  }

  const todayTrainings = useMemo(() =>
    (weekData?.eventsByDate?.[todayStr] ?? [])
      .filter(e => e._tipo === 'allenamento'
        && inScope(e)
        && (!squadraFilter || e.squadra === squadraFilter)
        && (!allenatoreFilter || (e.allenatori ?? '').split(',').some(a => a.trim().toLowerCase().includes(allenatoreFilter.toLowerCase())))
        && (!palestraFilter || e.palestra === palestraFilter))
      .sort((a, b) => (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? '')),
    [weekData, todayStr, squadraFilter, allenatoreFilter, palestraFilter, inScope])

  if (isLoading) return <LoadingSpinner message="Caricamento..." />
  if (weekError) return (
    <div className="text-center py-20 space-y-2">
      <p className="text-sm font-medium text-red-500">Errore nel caricamento degli allenamenti</p>
      <p className="text-xs text-gray-400">{weekError.message}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-3 px-4 py-2 text-xs bg-gray-100 rounded-xl text-gray-600 font-medium"
      >
        Riprova
      </button>
    </div>
  )

  const dayAllEvents = weekData?.eventsByDate?.[todayStr] ?? []

  return (
    <>
      {todayTrainings.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setGridView(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              gridView ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {gridView ? <List size={15} /> : <LayoutGrid size={15} />}
            {gridView ? 'Lista' : 'Griglia'}
          </button>
        </div>
      )}

      {gridView ? (
        <GrigliaSettimanale weekStart={weekStart} allSquadre={allSquadre} dateFilter={todayStr} />
      ) : !todayTrainings.length ? (
        <div className="text-center py-20 text-gray-400">
          <span className="text-5xl block mb-3">🏀</span>
          <p className="text-sm font-medium">Nessun allenamento oggi</p>
          <p className="text-xs mt-1 text-gray-300 capitalize">
            {format(new Date(), 'EEEE d MMMM yyyy', { locale: it })}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-3 capitalize">
            {format(new Date(), 'EEEE d MMMM yyyy', { locale: it })} — {todayTrainings.length} allenamenti
          </p>
          {todayTrainings.map((ev, i) => (
            <TrainingCard
              key={`oggi-${i}`}
              event={ev}
              color={getColor(ev.squadra, allSquadre)}
              canEdit={canEdit && canEditEvent(ev)}
              presenze={getPresenzeOggiCount(ev.squadra)}
              presAl={getPresenzeAlOggiCount(ev.squadra)}
              onEdit={() => { setEditingEvent(ev); setEditingDayEvents(dayAllEvents) }}
              onCancel={() => confirm(
                `Annullare l'allenamento di ${ev.squadra}?`,
                () => cancelMut.mutate(ev),
                { confirmLabel: 'Annulla allenamento' }
              )}
              onPresenze={canEdit && canEditEvent(ev) ? () => setPresenzeAlEvent(ev) : undefined}
            />
          ))}
        </div>
      )}
      {editingEvent && (
        <Modal title="Modifica allenamento" subtitle={`${editingEvent.squadra} — oggi`} onClose={() => setEditingEvent(null)}>
          <EditAllenamentoForm
            event={editingEvent}
            contextEvents={editingDayEvents}
            saving={saveMut.isPending}
            onSave={formData => saveMut.mutateAsync({ event: editingEvent, formData, isEdit: true })}
          />
        </Modal>
      )}
      {canEdit && (
        <button
          onClick={() => setShowAddForm(true)}
          className="fixed bottom-24 right-4 w-14 h-14 bg-amber-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-amber-700 active:scale-95 transition-all z-20"
          aria-label="Aggiungi allenamento"
        >
          <Plus size={28} />
        </button>
      )}
      {showAddForm && (
        <AddAllenamentoModal
          weekStart={weekStart}
          allSquadre={allSquadre}
          squadreAllenatore={squadreAllenatore}
          onClose={() => setShowAddForm(false)}
          onSaved={() => {}}
        />
      )}
      {presenzeAlEvent && (
        <PresenzeAllenamentoModal event={presenzeAlEvent} onClose={() => setPresenzeAlEvent(null)} />
      )}
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AllenamentiPage() {
  const { isAdmin, isAllenatore, societaId, squadreAllenatore } = useAuth()
  const [squadraFilter,    setSquadraFilter]    = useState('')
  const [allenatoreFilter, setAllenatoreFilter] = useState('')
  const [palestraFilter,   setPalestraFilter]   = useState('')
  const canEdit = isAdmin || isAllenatore

  const { data: allSquadre = [] } = useQuery({
    queryKey: ['squadre'],
    queryFn: async () => {
      const [fissoRes, calRes] = await Promise.all([
        supabase.from('orario_fisso').select('squadra'),
        supabase.from('calendario').select('squadra'),
      ])
      const all = [...(fissoRes.data ?? []), ...(calRes.data ?? [])].map(r => r.squadra).filter(Boolean)
      return [...new Set(all)].sort()
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: allenatoriList = [] } = useQuery({
    queryKey: ['allenatori-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('allenatori').select('nome, cognome').order('cognome').order('nome')
      return (data ?? []).map(a => [a.nome, a.cognome].filter(Boolean).join(' ')).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: palestreList = [] } = useQuery({
    queryKey: ['palestre-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(r => r.nome).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <PageHeader
        title="Allenamenti"
        subtitle="Presenze · Annullamenti"
        actions={
          <a href="/calendario"
            className="text-xs text-amber-100 font-medium flex items-center gap-1 hover:text-white">
            Pianificazione →
          </a>
        }
      />

      <div className="bg-white border-b shadow-sm">
        <div className="px-4 pt-2 pb-2">
          <select value={squadraFilter} onChange={e => setSquadraFilter(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutte le squadre</option>
            {allSquadre.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <select value={allenatoreFilter} onChange={e => setAllenatoreFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Tutti gli allenatori</option>
              {allenatoriList.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={palestraFilter} onChange={e => setPalestraFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Tutte le palestre</option>
              {palestreList.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

      </div>

      <div className="flex-1 p-4">
        {<OggiTab allSquadre={allSquadre} canEdit={canEdit} squadraFilter={squadraFilter} allenatoreFilter={allenatoreFilter} palestraFilter={palestraFilter} squadreAllenatore={squadreAllenatore} onlySquadre={null} />}

      </div>
    </div>
  )
}
