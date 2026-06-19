import { useState, useMemo } from 'react'
import { format, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, endOfWeek, isSameMonth, addWeeks } from 'date-fns'
import { CheckCircle2, Clock, MapPin, AlertCircle, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/ui/ToastProvider'
import { formatDate, formatTime, isDateToday } from '../../lib/utils'
import { saveAllenamento, inviaNotificaModifica } from '../../hooks/useAllenamenti'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import PrepSesioneInlineForm from '../../components/PrepSesioneInlineForm'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function timesOverlap(as, ae, bs, be) {
  const n = t => String(t ?? '').slice(0, 5)
  const [a0, a1, b0, b1] = [as, ae, bs, be].map(n)
  if (!a0 || !a1 || !b0 || !b1) return false
  return a0 < b1 && a1 > b0
}

export function parseList(str) {
  return (str ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

export const GIORNO_OFFSET_W = { lunedi:0, martedi:1, mercoledi:2, giovedi:3, venerdi:4, sabato:5, domenica:6 }

// ─── Section title ─────────────────────────────────────────────────────────────

export function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-4 mb-2">
      {children}
    </h2>
  )
}

// ─── Event row (compact card) ─────────────────────────────────────────────────

export function EventRow({ event }) {
  const isPartita = event._tipo === 'partita'
  let bk = 'allenamento'
  if (isPartita) {
    if (event.stato === 'provvisoria') bk = 'partita_prov'
    else if ((event.casa_fuori ?? '').toLowerCase() === 'casa') bk = 'partita_casa'
    else bk = 'partita_trasferta'
  }

  const accentBar = {
    allenamento:       'border-l-amber-400',
    partita_casa:      'border-l-green-500',
    partita_trasferta: 'border-l-blue-500',
    partita_prov:      'border-l-yellow-400',
  }[bk]

  const badgeEl = isPartita && (
    event.stato === 'provvisoria'
      ? <Badge variant="warning">⚠ Provvisoria</Badge>
      : (event.casa_fuori ?? '').toLowerCase() === 'casa'
        ? <Badge variant="success">Casa</Badge>
        : <Badge variant="default">Trasferta</Badge>
  )

  return (
    <Card className={`border-l-4 ${accentBar}`}>
      <CardContent className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {isPartita
                ? `${event.squadra}${event.avversario ? ` vs ${event.avversario}` : ''}`
                : event.squadra}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
              {event.ora_inizio && (
                <span className="flex items-center gap-1 font-medium text-foreground/80">
                  <Clock size={11} /> {formatTime(event.ora_inizio)}–{formatTime(event.ora_fine)}
                </span>
              )}
              {event.palestra && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} /> {event.palestra}
                </span>
              )}
            </div>
          </div>
          {badgeEl}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Day section ──────────────────────────────────────────────────────────────

export function DaySection({ label, events, emptyMsg = 'Nessun impegno' }) {
  return (
    <section>
      <SectionTitle>{label}</SectionTitle>
      {events.length === 0 ? (
        <div className="mx-4 flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl py-3 px-3">
          <CheckCircle2 size={16} />
          <span>{emptyMsg} ✅</span>
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {events.map((e, i) => (
            <EventRow key={`${e._source ?? 'e'}-${e.id ?? i}`} event={e} />
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Allenatore event dot color ────────────────────────────────────────────────

export function getAllenatoreEventDotColor(event) {
  if (event._tipo === 'allenamento') return 'bg-amber-400'
  if (event.stato === 'provvisoria') return 'bg-yellow-400'
  return (event.casa_fuori ?? '').toLowerCase() === 'casa' ? 'bg-green-500' : 'bg-blue-500'
}

// ─── Mini card for allenatore week view ────────────────────────────────────────

export function AllenatoreEventCard({ event, onClick }) {
  const isPartita = event._tipo === 'partita'

  if (!isPartita) {
    return (
      <button
        onClick={() => onClick(event)}
        className="w-full text-left rounded-lg p-2 mb-1 shadow-sm active:scale-95 transition-transform border-l-4 border-amber-400 bg-amber-50"
      >
        <div className="text-xs font-semibold text-amber-800 truncate">{event.squadra}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <Clock size={10} className="text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-600">{formatTime(event.ora_inizio)}</span>
        </div>
        {event.palestra && <div className="text-xs text-amber-400 truncate">{event.palestra}</div>}
        {event.spostato && <span className="text-[9px] text-amber-500 italic">modificato</span>}
      </button>
    )
  }

  let cardCls = 'border-blue-500 bg-blue-50'
  if (event.stato === 'provvisoria') cardCls = 'border-yellow-400 bg-yellow-50'
  else if ((event.casa_fuori ?? '').toLowerCase() === 'casa') cardCls = 'border-green-500 bg-green-50'

  return (
    <button
      onClick={() => onClick(event)}
      className={`w-full text-left rounded-lg p-2 mb-1 shadow-sm active:scale-95 transition-transform border-l-4 ${cardCls}`}
    >
      <div className="text-xs font-semibold text-gray-800 truncate">
        {event.avversario ? `vs ${event.avversario}` : 'Partita'}
      </div>
      <div className="text-xs text-gray-500 truncate">{event.squadra}</div>
      <div className="flex items-center gap-1 mt-0.5">
        <Clock size={10} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-500">{formatTime(event.ora_inizio)}</span>
      </div>
      {event.stato === 'provvisoria' && (
        <AlertCircle size={11} className="text-yellow-500 mt-0.5" />
      )}
    </button>
  )
}

// ─── Month grid ────────────────────────────────────────────────────────────────

const MONTH_DAY_HEADERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export function AllenatoreMonthGrid({ monthDate, events, onEventClick }) {
  const [selectedDay, setSelectedDay] = useState(null)

  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 })
  const gridEnd   = endOfWeek(endOfMonth(monthDate),     { weekStartsOn: 1 })
  const days      = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const eventsByDate = useMemo(() => {
    const map = {}
    events.forEach(e => {
      if (!map[e.data]) map[e.data] = []
      map[e.data].push(e)
    })
    return map
  }, [events])

  return (
    <div className="px-3">
      <div className="grid grid-cols-7 mb-1">
        {MONTH_DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden">
        {days.map(day => {
          const dateStr    = format(day, 'yyyy-MM-dd')
          const inMonth    = isSameMonth(day, monthDate)
          const today      = isDateToday(dateStr)
          const dayEvents  = eventsByDate[dateStr] ?? []
          const isSelected = selectedDay === dateStr

          return (
            <button
              key={dateStr}
              onClick={() => {
                if (!dayEvents.length) { setSelectedDay(null); return }
                if (dayEvents.length === 1) { setSelectedDay(null); onEventClick(dayEvents[0]); return }
                setSelectedDay(isSelected ? null : dateStr)
              }}
              className={`flex flex-col items-center py-1.5 px-0.5 min-h-[54px] transition-colors ${
                inMonth ? '' : 'opacity-25'
              } ${isSelected ? 'bg-amber-50' : 'bg-white'}`}
            >
              <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                today ? 'bg-amber-600 text-white' : 'text-gray-700'
              }`}>
                {format(day, 'd')}
              </span>
              <div className="flex flex-wrap gap-0.5 justify-center">
                {dayEvents.slice(0, 3).map((e, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${getAllenatoreEventDotColor(e)}`} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[9px] text-gray-400 font-medium leading-none">+{dayEvents.length - 3}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {selectedDay && (eventsByDate[selectedDay] ?? []).length > 1 && (
        <div className="mt-4">
          <div className="text-sm font-semibold text-gray-700 mb-2 capitalize">
            {formatDate(selectedDay, 'EEEE d MMMM')}
          </div>
          <div className="space-y-2">
            {(eventsByDate[selectedDay] ?? []).map((e, i) => {
              const isPartita = e._tipo === 'partita'
              const borderCls = !isPartita
                ? 'border-amber-400 bg-amber-50'
                : e.stato === 'provvisoria'
                  ? 'border-yellow-400 bg-yellow-50'
                  : (e.casa_fuori ?? '').toLowerCase() === 'casa'
                    ? 'border-green-500 bg-green-50'
                    : 'border-blue-500 bg-blue-50'
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedDay(null); onEventClick(e) }}
                  className={`w-full text-left rounded-xl p-3 shadow-sm active:scale-95 transition-transform border-l-4 ${borderCls}`}
                >
                  <div className="text-sm font-semibold text-gray-800">
                    {e.squadra}{isPartita && e.avversario ? ` vs ${e.avversario}` : ''}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={11} className="text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500">{formatTime(e.ora_inizio)}</span>
                    {e.palestra && (
                      <>
                        <MapPin size={11} className="text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500 truncate">{e.palestra}</span>
                      </>
                    )}
                  </div>
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    !isPartita
                      ? 'bg-amber-100 text-amber-600'
                      : e.stato === 'provvisoria'
                        ? 'bg-yellow-100 text-yellow-700'
                        : (e.casa_fuori ?? '').toLowerCase() === 'casa'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                  }`}>
                    {!isPartita
                      ? 'Allenamento'
                      : e.stato === 'provvisoria'
                        ? '⚠️ Prov.'
                        : (e.casa_fuori ?? '').toLowerCase() === 'casa' ? 'Casa' : 'Trasferta'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Event detail bottom sheet ─────────────────────────────────────────────────

export function AllenatoreEventModal({ event, onClose, showPresenza = false }) {
  const { user, societaId } = useAuth()
  const qc = useQueryClient()
  const isPartita = event._tipo === 'partita'
  const dotColor  = getAllenatoreEventDotColor(event)

  const { data: presenzaData, isLoading: presenzaLoading } = useQuery({
    queryKey: ['presenza-genitore', event.data, event.squadra, user?.id],
    enabled: showPresenza && !isPartita && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze')
        .select('risposta')
        .eq('data', event.data)
        .eq('squadra', event.squadra)
        .eq('user_id', user.id)
        .maybeSingle()
      return data
    },
    staleTime: 30 * 1000,
  })

  const presenzaMut = useMutation({
    mutationFn: async (risposta) => {
      if (presenzaData?.risposta === risposta) {
        await supabase.from('presenze')
          .delete()
          .eq('data', event.data)
          .eq('squadra', event.squadra)
          .eq('user_id', user.id)
      } else {
        await supabase.from('presenze').upsert(
          {
            societa_id: societaId ?? '',
            data:       event.data,
            squadra:    event.squadra,
            user_id:    user.id,
            risposta,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'societa_id,data,squadra,user_id' }
        )
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presenza-genitore', event.data, event.squadra, user?.id] }),
  })

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl overflow-y-auto max-h-[80svh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${dotColor}`} />
            <span className="text-sm font-medium text-gray-700">
              {isPartita
                ? (event.casa_fuori ?? '').toLowerCase() === 'casa'
                  ? '🏀 Partita in casa'
                  : '✈️ Partita in trasferta'
                : '🏋️ Allenamento'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {event.squadra}
          {isPartita && event.avversario && (
            <span className="text-gray-500 font-normal"> vs {event.avversario}</span>
          )}
        </h2>

        <div className="space-y-3">
          <div className="flex items-start gap-3 text-gray-600">
            <Clock size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
            <div>
              <div className="text-sm">{formatDate(event.data, 'EEEE d MMMM yyyy')}</div>
              <div className="text-sm font-medium">
                {formatTime(event.ora_inizio)} – {formatTime(event.ora_fine)}
              </div>
            </div>
          </div>
          {event.palestra && (
            <div className="flex items-center gap-3 text-gray-600">
              <MapPin size={16} className="flex-shrink-0 text-gray-400" />
              <span className="text-sm">{event.palestra}</span>
            </div>
          )}
          {isPartita && (
            <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${
              event.stato === 'provvisoria'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {event.stato === 'provvisoria' ? '⚠️ Provvisoria' : '✅ Definitiva'}
            </span>
          )}
          {!isPartita && event.spostato && (
            <span className="inline-block text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
              Orario modificato questa settimana
            </span>
          )}
        </div>

        {showPresenza && !isPartita && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">La tua presenza</p>
            {presenzaLoading ? (
              <div className="text-xs text-gray-400">Caricamento...</div>
            ) : (
              <div className="flex gap-2">
                {[
                  { val: 'presente', label: '✅ Ci sarò',    active: 'bg-green-600 text-white border-green-600' },
                  { val: 'assente',  label: '❌ Non ci sarò', active: 'bg-red-500 text-white border-red-500' },
                ].map(({ val, label, active }) => (
                  <button
                    key={val}
                    disabled={presenzaMut.isPending}
                    onClick={() => presenzaMut.mutate(val)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors disabled:opacity-60 ${
                      presenzaData?.risposta === val
                        ? active
                        : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Edit modal ────────────────────────────────────────────────────────────────

const INP = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'

export function AllenatoreEditModal({ event, onClose, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    ora_inizio: (event.ora_inizio ?? '18:00').slice(0, 5),
    ora_fine:   (event.ora_fine   ?? '20:00').slice(0, 5),
    palestra:   event.palestra ?? '',
  })
  const [includiAtletica, setIncludiAtletica] = useState(false)
  const [prepData, setPrepData] = useState({ quando: 'prima', durata_min: 30, su_campo: false })

  const { data: palestre = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome)
    },
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Modifica allenamento</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <p className="text-sm text-amber-600 font-medium mb-4">
          {event.squadra} — {event.data ? formatDate(event.data, 'EEEE d MMMM') : ''}
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio</label>
              <input type="time" value={form.ora_inizio}
                onChange={e => setForm(f => ({ ...f, ora_inizio: e.target.value }))}
                className={INP} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora fine</label>
              <input type="time" value={form.ora_fine}
                onChange={e => setForm(f => ({ ...f, ora_fine: e.target.value }))}
                className={INP} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Palestra</label>
            {palestre.length === 0 ? (
              <input value={form.palestra}
                onChange={e => setForm(f => ({ ...f, palestra: e.target.value }))}
                className={INP} placeholder="es. PalaOderzo" />
            ) : (
              <select value={form.palestra}
                onChange={e => setForm(f => ({ ...f, palestra: e.target.value }))}
                className={INP}>
                <option value="">Scegli...</option>
                {palestre.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>
        {/* Preparazione atletica */}
        <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-indigo-700">Preparazione atletica</p>
            <button type="button"
              onClick={() => setIncludiAtletica(v => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                includiAtletica ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-200'
              }`}>
              {includiAtletica ? '✓ Inclusa' : 'Aggiungi'}
            </button>
          </div>
          {includiAtletica && <PrepSesioneInlineForm onChange={d => setPrepData(d)} />}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel}
            className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-xl font-medium text-sm border border-red-200">
            ❌ Annulla allenamento
          </button>
          <button
            onClick={() => onSave({ ...form, _includiAtletica: includiAtletica, _prepData: includiAtletica ? prepData : null })}
            disabled={saving || !form.palestra.trim()}
            className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60">
            {saving ? 'Salvataggio...' : '✅ Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Quick edit (used in admin Da gestire) ─────────────────────────────────────

export function QuickEditAllenamentoModal({ training, onClose, onSaved }) {
  const { societaId } = useAuth()
  const { confirm } = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    ora_inizio: String(training.ora_inizio ?? '').slice(0, 5),
    ora_fine:   String(training.ora_fine   ?? '').slice(0, 5),
    palestra:   training.palestra ?? '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: palestreList = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  const saveMut = useMutation({
    mutationFn: () => saveAllenamento(training, form, societaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      inviaNotificaModifica(
        training.squadra, societaId, training.data,
        `${form.ora_inizio}–${form.ora_fine}${form.palestra ? ` @ ${form.palestra}` : ''}`
      )
      onSaved()
    },
  })

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('orario_settimana').delete().eq('id', training.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      onSaved()
    },
  })

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-foreground">Modifica allenamento</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-full">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {training.squadra} · {formatDate(training.data, 'EEE d MMM')}
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ora inizio</label>
              <input type="time" value={form.ora_inizio} onChange={e => set('ora_inizio', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ora fine</label>
              <input type="time" value={form.ora_fine} onChange={e => set('ora_fine', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Palestra</label>
            {palestreList.length > 0 ? (
              <select value={form.palestra} onChange={e => set('palestra', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Scegli palestra...</option>
                {palestreList.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input value={form.palestra} onChange={e => set('palestra', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="es. PalaOderzo" />
            )}
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Modifica solo questa data — la settimana tipo rimane invariata.
          </p>
          {saveMut.isError && <p className="text-xs text-destructive">{saveMut.error?.message}</p>}
          {deleteMut.isError && <p className="text-xs text-destructive">{deleteMut.error?.message}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => confirm('Eliminare questo allenamento?', () => deleteMut.mutate())}
              disabled={deleteMut.isPending || saveMut.isPending}
              className="flex-1 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform"
            >
              {deleteMut.isPending ? 'Eliminazione...' : '🗑️ Elimina'}
            </button>
            <Button className="flex-1" size="lg" onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || deleteMut.isPending || !form.ora_inizio || !form.ora_fine}>
              {saveMut.isPending ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
