import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addWeeks, parseISO, startOfWeek, addDays, subDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { X, Plus, AlertTriangle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatTime, formatDate } from '../../lib/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { GIORNI as GIORNI_W, GIORNO_FULL as GIORNI_LABEL_W } from '../../lib/constants'
import { saveAllenamento, annullaAllenamento } from '../../hooks/useAllenamenti'
import {
  AllenatoreEditModal, AllenatoreEventModal, parseList, GIORNO_OFFSET_W, timesOverlap,
} from './shared'

// ─── Add partita modal ─────────────────────────────────────────────────────────

const INP = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'

function AllenatoreAddPartitaModal({ mySquadre, onClose }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [form, setForm] = useState({
    squadra:    mySquadre[0] ?? '',
    data:       '',
    ora_inizio: '15:00',
    ora_fine:   '17:00',
    avversario: '',
    palestra:   '',
    casa_fuori: 'Casa',
    stato:      'provvisoria',
  })

  const { data: palestre = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome)
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: doppioList = [] } = useQuery({
    queryKey: ['doppio-campionato'],
    queryFn: async () => {
      const { data } = await supabase.from('doppio_campionato').select('*')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: partiteGiorno = [] } = useQuery({
    queryKey: ['calendario-date', form.data],
    enabled: !!form.data,
    queryFn: async () => {
      const { data } = await supabase.from('calendario').select('squadra, ora_inizio').eq('data', form.data)
      return data ?? []
    },
  })

  const doppioConflicts = useMemo(() => {
    if (!form.data || !form.squadra || !doppioList.length) return []
    const partners = doppioList
      .filter(d => d.squadra_a === form.squadra || d.squadra_b === form.squadra)
      .map(d => d.squadra_a === form.squadra ? d.squadra_b : d.squadra_a)
    return partiteGiorno.filter(p => partners.includes(p.squadra))
  }, [form.data, form.squadra, doppioList, partiteGiorno])

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('calendario').insert([{
        data:       form.data,
        ora_inizio: form.ora_inizio || null,
        ora_fine:   form.ora_fine   || null,
        squadra:    form.squadra,
        avversario: form.avversario || null,
        palestra:   form.palestra   || null,
        casa_fuori: form.casa_fuori,
        stato:      form.stato,
        tipo:       'partita',
        societa_id: societaId,
      }])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      qc.invalidateQueries({ queryKey: ['admin-partite-future'] })
      onClose()
    },
  })

  const canSave = !!form.squadra && !!form.data

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Aggiungi partita</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
              <select value={form.squadra} onChange={e => setForm(f => ({ ...f, squadra: e.target.value }))} className={INP}>
                {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
              <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className={INP} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio</label>
              <input type="time" value={form.ora_inizio} onChange={e => setForm(f => ({ ...f, ora_inizio: e.target.value }))} className={INP} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora fine</label>
              <input type="time" value={form.ora_fine} onChange={e => setForm(f => ({ ...f, ora_fine: e.target.value }))} className={INP} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Avversario</label>
            <input value={form.avversario} onChange={e => setForm(f => ({ ...f, avversario: e.target.value }))}
              className={INP} placeholder="Nome squadra avversaria" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Casa / Trasferta</label>
              <select value={form.casa_fuori} onChange={e => setForm(f => ({ ...f, casa_fuori: e.target.value }))} className={INP}>
                <option value="Casa">🏠 Casa</option>
                <option value="Fuori Casa">✈️ Trasferta</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Stato</label>
              <select value={form.stato} onChange={e => setForm(f => ({ ...f, stato: e.target.value }))} className={INP}>
                <option value="provvisoria">⚠️ Provvisoria</option>
                <option value="definitiva">✅ Definitiva</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Palestra / Luogo</label>
            {palestre.length === 0 ? (
              <input value={form.palestra} onChange={e => setForm(f => ({ ...f, palestra: e.target.value }))}
                className={INP} placeholder="es. PalaOderzo" />
            ) : (
              <select value={form.palestra} onChange={e => setForm(f => ({ ...f, palestra: e.target.value }))} className={INP}>
                <option value="">Scegli...</option>
                {palestre.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>
        {doppioConflicts.length > 0 && (
          <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-orange-700 flex items-center gap-1.5 mb-1.5">
              <AlertTriangle size={13} /> Attenzione: doppio campionato
            </p>
            <p className="text-xs text-orange-600 mb-1.5">
              In questa data ha già una partita una squadra con giocatori in comune:
            </p>
            {doppioConflicts.map((p, i) => (
              <div key={i} className="text-xs text-orange-700 bg-orange-100 rounded-lg px-2 py-1 mb-1">
                <span className="font-medium">{p.squadra}</span>
                {p.ora_inizio && <span className="ml-1 text-orange-500">· {formatTime(p.ora_inizio)}</span>}
              </div>
            ))}
            <p className="text-xs text-orange-500 mt-1.5 italic">Puoi procedere comunque se è un'eccezione.</p>
          </div>
        )}
        {saveMut.isError && <p className="text-xs text-red-500 mt-2">{saveMut.error?.message}</p>}
        <button
          onClick={() => canSave && saveMut.mutateAsync()}
          disabled={saveMut.isPending || !canSave}
          className="w-full mt-5 py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saveMut.isPending ? 'Salvataggio...' : '✅ Aggiungi partita'}
        </button>
        {!canSave && <p className="text-center text-xs text-red-500 mt-2">Squadra e data sono obbligatori</p>}
      </div>
    </div>
  )
}

// ─── Add allenamento modal ─────────────────────────────────────────────────────

function AllenatoreAddModal({ weekStart, mySquadre, onClose }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [nextWeek, setNextWeek] = useState(false)
  const [form, setForm] = useState({
    squadra:    mySquadre[0] ?? '',
    giorno:     'lunedi',
    ora_inizio: '18:00',
    ora_fine:   '20:00',
    palestra:   '',
  })

  const effectiveWeekStart = useMemo(
    () => nextWeek ? addWeeks(weekStart, 1) : weekStart,
    [weekStart, nextWeek]
  )

  const { data: palestre = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome)
    },
    staleTime: 10 * 60 * 1000,
  })

  const targetDate = useMemo(() => {
    const d = new Date(effectiveWeekStart)
    d.setDate(d.getDate() + (GIORNO_OFFSET_W[form.giorno] ?? 0))
    return format(d, 'yyyy-MM-dd')
  }, [effectiveWeekStart, form.giorno])

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('orario_settimana').insert([{
        data:       targetDate,
        squadra:    form.squadra,
        ora_inizio: form.ora_inizio,
        ora_fine:   form.ora_fine,
        palestra:   form.palestra,
        annullato:  false,
        societa_id: societaId,
      }])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      onClose()
    },
  })

  const canSave = !!form.squadra && !!form.palestra && !!form.ora_inizio && !!form.ora_fine

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Aggiungi allenamento</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="flex bg-gray-100 rounded-lg p-0.5 mb-4">
          {[false, true].map(isNext => (
            <button key={String(isNext)} type="button"
              onClick={() => setNextWeek(isNext)}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                nextWeek === isNext ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}>
              {isNext ? 'Prossima settimana' : 'Settimana corrente'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
              <select value={form.squadra} onChange={e => setForm(f => ({ ...f, squadra: e.target.value }))} className={INP}>
                {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Giorno *</label>
              <select value={form.giorno} onChange={e => setForm(f => ({ ...f, giorno: e.target.value }))} className={INP}>
                {GIORNI_W.map(g => <option key={g} value={g}>{GIORNI_LABEL_W[g]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio *</label>
              <input type="time" value={form.ora_inizio}
                onChange={e => setForm(f => ({ ...f, ora_inizio: e.target.value }))} className={INP} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora fine *</label>
              <input type="time" value={form.ora_fine}
                onChange={e => setForm(f => ({ ...f, ora_fine: e.target.value }))} className={INP} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Palestra *</label>
            {palestre.length === 0 ? (
              <input value={form.palestra}
                onChange={e => setForm(f => ({ ...f, palestra: e.target.value }))}
                className={INP} placeholder="es. PalaOderzo" />
            ) : (
              <select value={form.palestra}
                onChange={e => setForm(f => ({ ...f, palestra: e.target.value }))} className={INP}>
                <option value="">Scegli...</option>
                {palestre.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>
        {saveMut.isError && (
          <p className="text-xs text-red-500 mt-2">{saveMut.error?.message}</p>
        )}
        <button
          onClick={() => canSave && saveMut.mutateAsync()}
          disabled={saveMut.isPending || !canSave}
          className="w-full mt-5 py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saveMut.isPending ? 'Salvataggio...' : '✅ Aggiungi allenamento'}
        </button>
        {!canSave && (
          <p className="text-center text-xs text-red-500 mt-2">Compila tutti i campi obbligatori</p>
        )}
      </div>
    </div>
  )
}

// ─── HomeAllenatore ────────────────────────────────────────────────────────────

export default function HomeAllenatore() {
  const { user, displayName, logout, societaNome, societaId } = useAuth()
  const qc        = useQueryClient()
  const today     = new Date()
  const todayStr  = format(today, 'yyyy-MM-dd')

  const navigate = useNavigate()
  const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd')

  const { data: allenatoreRow } = useQuery({
    queryKey: ['my-allenatore', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from('allenatori').select('nome, squadre_capo, squadre_vice')
        .eq('email', user.email).maybeSingle()
      return data
    },
  })

  const mySquadre = useMemo(() => {
    if (!allenatoreRow) return []
    return [...parseList(allenatoreRow.squadre_capo), ...parseList(allenatoreRow.squadre_vice)]
  }, [allenatoreRow])

  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const isYesterdayInWeek = yesterdayStr >= weekStartStr
  const { data: weekData, isLoading: weekLoading } = useWeekEvents(weekStart)

  const todayEvents = useMemo(() => {
    if (!weekData) return []
    return (weekData.events ?? [])
      .filter(e =>
        e.data === todayStr &&
        (e._tipo !== 'allenamento' || !e.annullato) &&
        mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
      )
      .sort((a, b) => (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? ''))
  }, [weekData, mySquadre, todayStr])

  const partiteSettimana = useMemo(() => {
    if (!weekData) return []
    return (weekData.events ?? [])
      .filter(e =>
        e._tipo === 'partita' && e.data >= todayStr &&
        mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
      )
      .sort((a, b) => (a.data + (a.ora_inizio ?? '')).localeCompare(b.data + (b.ora_inizio ?? '')))
  }, [weekData, mySquadre, todayStr])

  const conflictsCoach = useMemo(() => {
    if (!weekData) return []
    const allEvents = weekData.events ?? []
    const partite = allEvents.filter(e =>
      e._tipo === 'partita' && e.stato === 'definitiva' && e.data >= todayStr &&
      mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
    const allenamenti = allEvents.filter(e =>
      e._tipo === 'allenamento' && !e.annullato &&
      mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
    const result = []
    for (const p of partite) {
      const conf = allenamenti.filter(t =>
        t.data === p.data &&
        timesOverlap(p.ora_inizio, p.ora_fine, t.ora_inizio, t.ora_fine) &&
        (t.squadra ?? '').toLowerCase() === (p.squadra ?? '').toLowerCase()
      )
      if (conf.length) result.push({ partita: p, allenamenti: conf })
    }
    return result
  }, [weekData, mySquadre, todayStr])

  const allenamentiIeri = useMemo(() => {
    if (!weekData || !isYesterdayInWeek) return []
    return (weekData.eventsByDate?.[yesterdayStr] ?? [])
      .filter(e => e._tipo === 'allenamento' && !e.annullato &&
        mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase()))
  }, [weekData, yesterdayStr, isYesterdayInWeek, mySquadre])

  const { data: presenzeIeriSquadre = [] } = useQuery({
    queryKey: ['presenze-al-ieri-check', yesterdayStr, mySquadre, societaId],
    enabled: !!societaId && isYesterdayInWeek && allenamentiIeri.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('squadra')
        .eq('data', yesterdayStr)
        .in('squadra', mySquadre)
      return [...new Set((data ?? []).map(p => p.squadra))]
    },
    staleTime: 2 * 60 * 1000,
  })

  const allenamentiDaConfermare = useMemo(() =>
    allenamentiIeri.filter(e => !presenzeIeriSquadre.includes(e.squadra)),
    [allenamentiIeri, presenzeIeriSquadre]
  )

  const [editingEvent,   setEditingEvent]   = useState(null)
  const [selectedEvent,  setSelectedEvent]  = useState(null)
  const [showAddForm,    setShowAddForm]    = useState(false)
  const [showAddPartita, setShowAddPartita] = useState(false)
  const [fabOpen,        setFabOpen]        = useState(false)

  const saveMut = useMutation({
    mutationFn: ({ event, formData }) => saveAllenamento(event, formData, societaId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weekEvents'] }); setEditingEvent(null) },
  })

  const cancelMut = useMutation({
    mutationFn: (event) => annullaAllenamento(event, societaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weekEvents'] }),
  })

  if (!mySquadre.length && allenatoreRow !== undefined) {
    return (
      <div className="pb-20">
        <AppHeader
          title="Ciao!"
          subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName}
          logout={logout}
          societaNome={societaNome}
        />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Nessuna squadra assegnata al tuo profilo. Contatta l'amministratore.</p>
        </div>
      </div>
    )
  }

  const nome = allenatoreRow?.nome ?? displayName

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">

      <AppHeader
        title={`Ciao, ${nome}! 👋`}
        subtitle={mySquadre.join(' · ')}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      <div className="px-4 pt-4 space-y-4">

        {/* Alert presenze da segnare */}
        {allenamentiDaConfermare.length > 0 && (
          <button
            onClick={() => navigate('/coach/attivita')}
            className="w-full text-left bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 active:scale-[0.99] transition-transform"
          >
            <p className="text-sm font-semibold text-amber-800">📋 Presenze da segnare</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {allenamentiDaConfermare.map(e => e.squadra).join(', ')} — allenamento di ieri senza presenze registrate
            </p>
            <p className="text-xs text-amber-500 mt-1 underline">Vai a Presenze →</p>
          </button>
        )}

        {/* Impegni di oggi */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Impegni di oggi</p>
          {weekLoading ? (
            <div className="py-4 flex justify-center"><LoadingSpinner /></div>
          ) : todayEvents.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 text-sm text-gray-400 text-center shadow-sm">
              Nessun impegno oggi
            </div>
          ) : (
            <div className="space-y-2">
              {todayEvents.map((e, i) => (
                <button
                  key={`${e._source}-${e.id ?? i}`}
                  onClick={() => e._tipo === 'allenamento' ? setEditingEvent(e) : undefined}
                  className="w-full bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm text-left active:scale-[0.99] transition-transform"
                >
                  <span className="text-lg">{e._tipo === 'allenamento' ? '🏋️' : '🏀'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{e.squadra}</p>
                    <p className="text-xs text-gray-500">
                      {e._tipo === 'allenamento' ? 'Allenamento' : `vs ${e.avversario ?? ''}`}
                      {e.ora_inizio ? ` · ${formatTime(e.ora_inizio)}–${formatTime(e.ora_fine)}` : ''}
                      {e.palestra ? ` · ${e.palestra}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Partite della settimana */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Partite della settimana</p>
          {partiteSettimana.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 text-sm text-gray-400 text-center shadow-sm">
              Nessuna partita questa settimana
            </div>
          ) : (
            <div className="space-y-2">
              {partiteSettimana.map((p, i) => (
                <div key={p.id ?? i} className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
                  <p className="text-sm font-semibold text-gray-800">
                    {p.squadra}{p.avversario ? ` vs ${p.avversario}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {format(parseISO(p.data), 'EEE d MMM', { locale: it })}
                    {p.ora_inizio ? ` · ${formatTime(p.ora_inizio)}` : ''}
                    {p.palestra ? ` · ${p.palestra}` : ''}
                    {p.casa_fuori ? ` · ${p.casa_fuori}` : ''}
                  </p>
                  {p.stato === 'provvisoria' && (
                    <span className="text-[10px] text-amber-600 font-medium">⚠️ Provvisoria</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conflitti settimana */}
        {conflictsCoach.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 px-1">⚠️ Conflitti settimana</p>
            <div className="space-y-2">
              {conflictsCoach.map(c => (
                <div key={c.partita.id} className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-700 mb-0.5">
                    🏀 {c.partita.squadra}{c.partita.avversario ? ` vs ${c.partita.avversario}` : ''}
                  </p>
                  <p className="text-xs text-red-400 mb-2">
                    {format(parseISO(c.partita.data), 'EEE d MMM', { locale: it })}
                    {' · '}{formatTime(c.partita.ora_inizio)}–{formatTime(c.partita.ora_fine)}
                  </p>
                  {c.allenamenti.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 mb-1 border border-red-200">
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{t.squadra}</p>
                        <p className="text-xs text-gray-500">
                          Allenamento · {formatTime(t.ora_inizio)}–{formatTime(t.ora_fine)}
                          {t.palestra ? ` · ${t.palestra}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => setEditingEvent(t)}
                        className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium active:scale-95 transition-transform ml-3 shrink-0"
                      >
                        Modifica
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* FAB */}
      {fabOpen && (
        <div className="fixed bottom-40 right-4 flex flex-col gap-2 z-20 items-end">
          <button onClick={() => { setShowAddPartita(true); setFabOpen(false) }}
            className="flex items-center gap-2 bg-white text-gray-800 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium border border-gray-200 whitespace-nowrap active:scale-95 transition-transform">
            🏀 Partita
          </button>
          <button onClick={() => { setShowAddForm(true); setFabOpen(false) }}
            className="flex items-center gap-2 bg-white text-gray-800 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium border border-gray-200 whitespace-nowrap active:scale-95 transition-transform">
            🏋️ Allenamento
          </button>
        </div>
      )}
      {fabOpen && <div className="fixed inset-0 z-10" onClick={() => setFabOpen(false)} />}
      <button
        onClick={() => setFabOpen(v => !v)}
        className={`fixed bottom-24 right-4 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all z-20 ${fabOpen ? 'bg-gray-600' : 'bg-amber-600 hover:bg-amber-700'}`}
      >
        {fabOpen ? <X size={24} /> : <Plus size={28} />}
      </button>

      {editingEvent && (
        <AllenatoreEditModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={(formData) => saveMut.mutateAsync({ event: editingEvent, formData })}
          onCancel={() => {
            if (window.confirm(`Annullare l'allenamento di ${editingEvent.squadra}?`)) {
              cancelMut.mutate(editingEvent)
              setEditingEvent(null)
            }
          }}
          saving={saveMut.isPending}
        />
      )}

      {selectedEvent && (
        <AllenatoreEventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          showPresenza={false}
        />
      )}

      {showAddForm && (
        <AllenatoreAddModal weekStart={weekStart} mySquadre={mySquadre} onClose={() => setShowAddForm(false)} />
      )}
      {showAddPartita && (
        <AllenatoreAddPartitaModal mySquadre={mySquadre} onClose={() => setShowAddPartita(false)} />
      )}
    </div>
  )
}
