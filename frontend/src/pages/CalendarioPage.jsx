import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  format, addWeeks, startOfWeek, addMonths, startOfMonth, endOfMonth,
  isSameMonth, eachDayOfInterval, endOfWeek,
} from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, Plus, X, Edit2, Trash2,
  MapPin, Clock, Users, AlertCircle, RefreshCw, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatDate, formatTime, getWeekDays, isDateToday } from '../lib/utils'
import { useWeekEvents, useSquadre, useMonthPartite } from '../hooks/useWeekEvents'
import LoadingSpinner from '../components/LoadingSpinner'

// ─── Color helpers ────────────────────────────────────────────────────────────

function getEventColor(event) {
  if (event.stato === 'provvisoria') return 'yellow'
  return (event.casa_fuori ?? '').toLowerCase() === 'casa' ? 'green' : 'blue'
}

const COLORS = {
  green:  { card: 'border-l-4 border-green-500 bg-green-50',   title: 'text-green-800',  badge: 'bg-green-100 text-green-700',   dot: 'bg-green-500'  },
  blue:   { card: 'border-l-4 border-blue-500 bg-blue-50',     title: 'text-blue-800',   badge: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'   },
  yellow: { card: 'border-l-4 border-yellow-400 bg-yellow-50', title: 'text-yellow-800', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
}

const STATO_LABEL = {
  provvisoria: 'Provvisoria',
  definitiva:  'Definitiva',
}

// ─── Conflict helper ──────────────────────────────────────────────────────────

function timesOverlap(as, ae, bs, be) {
  const n = t => String(t ?? '').slice(0, 5)
  const [a0, a1, b0, b1] = [as, ae, bs, be].map(n)
  if (!a0 || !a1 || !b0 || !b1) return false
  return a0 < b1 && a1 > b0
}

// ─── Mini card (week grid cell) ───────────────────────────────────────────────

function MiniEventCard({ event, conflicts = [], onClick }) {
  const c = COLORS[getEventColor(event)]
  return (
    <button
      onClick={() => onClick(event)}
      className={`w-full text-left rounded-lg p-2 mb-1 shadow-sm active:scale-95 transition-transform ${c.card}`}
    >
      {event.annullato && (
        <span className="text-xs text-gray-400 line-through block">Annullato</span>
      )}
      <div className={`text-xs font-semibold truncate ${c.title}`}>
        {event.avversario ? `vs ${event.avversario}` : 'Partita'}
      </div>
      {event.squadra && (
        <div className="text-xs text-gray-500 truncate">{event.squadra}</div>
      )}
      <div className="flex items-center gap-1 mt-0.5">
        <Clock size={10} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-500">{formatTime(event.ora_inizio)}</span>
      </div>
      {event.palestra && (
        <div className="text-xs text-gray-400 truncate">{event.palestra}</div>
      )}
      {event.stato === 'provvisoria' && (
        <AlertCircle size={12} className="text-yellow-500 mt-0.5" />
      )}
      {conflicts.length > 0 && (
        <div className="flex items-center gap-1 mt-1 pt-1 border-t border-red-200">
          <AlertTriangle size={10} className="text-red-500 flex-shrink-0" />
          <span className="text-xs text-red-600 font-medium leading-tight">
            {conflicts.length} all. da spostare
          </span>
        </div>
      )}
    </button>
  )
}

// ─── Conflict training card ───────────────────────────────────────────────────

function ConflictTrainingCard({ training }) {
  return (
    <div className="w-full rounded-lg p-2 mb-1 border border-dashed border-red-300 bg-red-50">
      <div className="flex items-center gap-1 mb-0.5">
        <AlertTriangle size={10} className="text-red-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-red-600">Da spostare</span>
      </div>
      <div className="text-xs text-red-700 truncate">{training.squadra}</div>
      <div className="flex items-center gap-1">
        <Clock size={10} className="text-red-400 flex-shrink-0" />
        <span className="text-xs text-red-500">{formatTime(training.ora_inizio)}–{formatTime(training.ora_fine)}</span>
      </div>
      {training.palestra && (
        <div className="text-xs text-red-400 truncate">{training.palestra}</div>
      )}
    </div>
  )
}

// ─── Month grid ───────────────────────────────────────────────────────────────

const DAY_HEADERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

function MonthGrid({ monthDate, events, onEventClick }) {
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
      {/* Column headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden">
        {days.map(day => {
          const dateStr   = format(day, 'yyyy-MM-dd')
          const inMonth   = isSameMonth(day, monthDate)
          const today     = isDateToday(dateStr)
          const dayEvents = eventsByDate[dateStr] ?? []
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
              } ${isSelected ? 'bg-blue-50' : 'bg-white'}`}
            >
              <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                today ? 'bg-blue-600 text-white' : 'text-gray-700'
              }`}>
                {format(day, 'd')}
              </span>
              <div className="flex flex-wrap gap-0.5 justify-center">
                {dayEvents.slice(0, 3).map((e, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${COLORS[getEventColor(e)].dot}`} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[9px] text-gray-400 font-medium leading-none">
                    +{dayEvents.length - 3}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Selected-day event list */}
      {selectedDay && (eventsByDate[selectedDay] ?? []).length > 1 && (
        <div className="mt-4">
          <div className="text-sm font-semibold text-gray-700 mb-2 capitalize">
            {formatDate(selectedDay, 'EEEE d MMMM')}
          </div>
          <div className="space-y-2">
            {(eventsByDate[selectedDay] ?? []).map((e, i) => {
              const c = COLORS[getEventColor(e)]
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedDay(null); onEventClick(e) }}
                  className={`w-full text-left rounded-xl p-3 shadow-sm active:scale-95 transition-transform ${c.card}`}
                >
                  <div className={`text-sm font-semibold ${c.title}`}>
                    {e.squadra}{e.avversario && ` vs ${e.avversario}`}
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
                  {e.stato === 'provvisoria' && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertCircle size={11} className="text-yellow-500" />
                      <span className="text-xs text-yellow-600">Provvisoria</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function EventModal({ event, onClose, onEdit, onDelete, onToggleStato, isAdmin, canModify, canModifyEvent, togglingStato, conflicts = [] }) {
  const c = COLORS[getEventColor(event)]
  const typeLabel = (event.casa_fuori ?? '').toLowerCase() === 'casa'
    ? '🏀 Partita in casa'
    : '✈️ Partita in trasferta'

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl overflow-y-auto max-h-[92svh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${c.dot}`} />
            <span className={`text-sm font-medium ${c.title}`}>{typeLabel}</span>
            {event.annullato && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Annullato</span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {event.squadra}
          {event.avversario && (
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
          {event.allenatori && (
            <div className="flex items-center gap-3 text-gray-600">
              <Users size={16} className="flex-shrink-0 text-gray-400" />
              <span className="text-sm">{event.allenatori}</span>
            </div>
          )}
          {event.stato && (
            <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${c.badge}`}>
              {event.stato === 'provvisoria' && '⚠️ '}{STATO_LABEL[event.stato] ?? event.stato}
            </span>
          )}
        </div>

        {conflicts.length > 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-red-500" />
              <span className="text-sm font-semibold text-red-700">
                {conflicts.length} allenament{conflicts.length === 1 ? 'o' : 'i'} da spostare
              </span>
            </div>
            <div className="space-y-1.5">
              {conflicts.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-red-600 bg-red-100 rounded-lg px-2 py-1.5">
                  <Clock size={11} className="text-red-400 flex-shrink-0" />
                  <span className="font-medium">{t.squadra}</span>
                  <span className="text-red-400">{formatTime(t.ora_inizio)}–{formatTime(t.ora_fine)}</span>
                  {t.palestra && <span className="text-red-400 truncate">{t.palestra}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 mt-6">
          {canModify && canModifyEvent && (
            <button
              onClick={() => onToggleStato(event)}
              disabled={togglingStato}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform ${
                event.stato === 'provvisoria'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-yellow-50 text-yellow-700'
              }`}
            >
              <RefreshCw size={15} />
              {event.stato === 'provvisoria' ? 'Segna come definitiva' : 'Segna come provvisoria'}
            </button>
          )}
          {isAdmin && (
            <div className="flex gap-3">
              <button
                onClick={() => onEdit(event)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-700 rounded-xl font-medium text-sm"
              >
                <Edit2 size={15} /> Modifica
              </button>
              <button
                onClick={() => onDelete(event)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-700 rounded-xl font-medium text-sm"
              >
                <Trash2 size={15} /> Elimina
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Add / Edit form ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  data:       format(new Date(), 'yyyy-MM-dd'),
  ora_inizio: '10:00',
  ora_fine:   '12:00',
  squadra:    '',
  avversario: '',
  casa_fuori: 'casa',
  palestra:   '',
  stato:      'provvisoria',
}

function EventForm({ initial, onSave, onClose, squadre, squadreAllenatore, saving, saveError }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const squadreDisp = squadreAllenatore ? squadre.filter(s => squadreAllenatore.includes(s)) : squadre

  const { data: palestreList = [] } = useQuery({
    queryKey: ['palestre-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(r => r.nome).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg shadow-2xl flex flex-col"
        style={{ maxHeight: '92svh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {initial?.id ? 'Modifica partita' : '🏀 Nuova partita'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-2">
          <form id="event-form" onSubmit={e => { e.preventDefault(); onSave(form) }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
                <input type="date" value={form.data} onChange={e => set('data', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
                <select value={form.squadra} onChange={e => set('squadra', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                  <option value="">Scegli...</option>
                  {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio *</label>
                <input type="time" value={form.ora_inizio} onChange={e => set('ora_inizio', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Ora fine</label>
                <input type="time" value={form.ora_fine} onChange={e => set('ora_fine', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Avversario</label>
              <input value={form.avversario} onChange={e => set('avversario', e.target.value)}
                placeholder="Nome squadra avversaria"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">Casa / Trasferta</label>
              <div className="flex gap-2">
                {[{ val: 'casa', label: '🏠 Casa' }, { val: 'fuori', label: '✈️ Trasferta' }].map(({ val, label }) => (
                  <button key={val} type="button" onClick={() => set('casa_fuori', val)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.casa_fuori === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Palestra / Luogo</label>
              {palestreList.length > 0 ? (
                <select value={form.palestra} onChange={e => set('palestra', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Scegli palestra...</option>
                  {palestreList.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input value={form.palestra} onChange={e => set('palestra', e.target.value)}
                  placeholder="es. PalaOderzo"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Stato</label>
              <select value={form.stato} onChange={e => set('stato', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(STATO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </form>
        </div>

        <div className="px-5 pt-3 pb-10 flex-shrink-0 space-y-2">
          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <p className="text-xs text-red-700">❌ {saveError}</p>
            </div>
          )}
          <button type="submit" form="event-form" disabled={saving}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
            {saving ? 'Salvataggio...' : (initial?.id ? 'Salva modifiche' : 'Aggiungi partita')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const LEGEND = [
  { color: 'green',  label: 'Casa'        },
  { color: 'blue',   label: 'Trasferta'   },
  { color: 'yellow', label: 'Provvisoria' },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CalendarioPage() {
  const { isAdmin, isAllenatore, societaId, squadreAllenatore } = useAuth()
  const canModifyEvent = (ev) => !squadreAllenatore || squadreAllenatore.includes(ev.squadra)
  const queryClient = useQueryClient()

  const [view,             setView]             = useState('settimana') // 'settimana' | 'mese'
  const [weekOffset,       setWeekOffset]       = useState(0)
  const [monthOffset,      setMonthOffset]      = useState(0)
  const [squadraFilter,    setSquadraFilter]    = useState('')
  const [allenatoreFilter, setAllenatoreFilter] = useState('')
  const [selectedEvent,    setSelectedEvent]    = useState(null)
  const [showForm,         setShowForm]         = useState(false)
  const [editingEvent,     setEditingEvent]     = useState(null)

  const touchStartX = useRef(null)

  const startDate = useMemo(
    () => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )

  const weekDays  = getWeekDays(addWeeks(new Date(), weekOffset))
  const weekLabel = useMemo(() => {
    const s = format(weekDays[0], 'd MMM',      { locale: it })
    const e = format(weekDays[6], 'd MMM yyyy', { locale: it })
    return `${s} – ${e}`
  }, [weekDays])

  const currentMonthDate = useMemo(
    () => startOfMonth(addMonths(new Date(), monthOffset)),
    [monthOffset]
  )
  const monthLabel = useMemo(
    () => format(currentMonthDate, 'MMMM yyyy', { locale: it }),
    [currentMonthDate]
  )

  const { data, isLoading, error }                              = useWeekEvents(startDate)
  const { data: monthPartite = [], isLoading: monthLoading }    = useMonthPartite(currentMonthDate, view === 'mese')
  const { data: squadre = [] }                                  = useSquadre()

  const { data: allenatoriList = [] } = useQuery({
    queryKey: ['allenatori-list'],
    queryFn: async () => {
      const { data: rows } = await supabase.from('allenatori').select('nome, cognome').order('cognome').order('nome')
      return (rows ?? []).map(a => [a.nome, a.cognome].filter(Boolean).join(' ')).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  // Only partite, filtered by squad/allenatore
  const displayEvents = useMemo(() => {
    if (!data) return []
    let events = data.events.filter(e => e._tipo === 'partita')
    if (squadraFilter) events = events.filter(e => e.squadra === squadraFilter)
    if (allenatoreFilter) {
      events = events.filter(e => {
        if (!e.allenatori) return false
        return e.allenatori.split(',').some(a => a.trim().toLowerCase().includes(allenatoreFilter.toLowerCase()))
      })
    }
    return events
  }, [data, squadraFilter, allenatoreFilter])

  const displayMonthEvents = useMemo(() => {
    let events = monthPartite
    if (squadraFilter) events = events.filter(e => e.squadra === squadraFilter)
    if (allenatoreFilter) {
      events = events.filter(e => {
        if (!e.allenatori) return false
        return e.allenatori.split(',').some(a => a.trim().toLowerCase().includes(allenatoreFilter.toLowerCase()))
      })
    }
    return events
  }, [monthPartite, squadraFilter, allenatoreFilter])

  // All non-cancelled trainings — used only for conflict detection
  const allTrainings = useMemo(() =>
    (data?.events ?? []).filter(e => e._tipo === 'allenamento' && !e.annullato),
    [data]
  )

  // Map partita.id → conflicting trainings (only for definitiva partite)
  const conflictMap = useMemo(() => {
    const map = new Map()
    for (const p of displayEvents) {
      if (p.stato !== 'definitiva') continue
      const conflicts = allTrainings.filter(t =>
        t.data === p.data &&
        (t.squadra ?? '').toLowerCase() === (p.squadra ?? '').toLowerCase() &&
        timesOverlap(p.ora_inizio, p.ora_fine, t.ora_inizio, t.ora_fine)
      )
      if (conflicts.length > 0) map.set(p.id, conflicts)
    }
    return map
  }, [displayEvents, allTrainings])

  const eventsByDate = useMemo(() => {
    const map = {}
    displayEvents.forEach(e => {
      if (!map[e.data]) map[e.data] = []
      map[e.data].push(e)
    })
    return map
  }, [displayEvents])

  // ── Mutations ──
  const deleteMutation = useMutation({
    mutationFn: async (event) => {
      const { error } = await supabase.from('calendario').delete().eq('id', event.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekEvents'] })
      setSelectedEvent(null)
    },
  })

  const saveMutation = useMutation({
    mutationFn: async ({ id, _tipo, _source, _table, _id, spostato, ...formData }) => {
      if (id) {
        const { error } = await supabase.from('calendario').update(formData).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('calendario').insert([{ ...formData, societa_id: societaId }])
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekEvents'] })
      queryClient.invalidateQueries({ queryKey: ['conflicts'] })
      setShowForm(false)
      setEditingEvent(null)
      setSelectedEvent(null)
    },
  })

  const toggleStatoMutation = useMutation({
    mutationFn: async ({ id, stato }) => {
      const nuovoStato = stato === 'provvisoria' ? 'definitiva' : 'provvisoria'
      const { error } = await supabase.from('calendario').update({ stato: nuovoStato }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekEvents'] })
      setSelectedEvent(null)
    },
  })

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) {
      if (view === 'settimana') setWeekOffset(w => w + (dx < 0 ? 1 : -1))
      else                     setMonthOffset(m => m + (dx < 0 ? 1 : -1))
    }
    touchStartX.current = null
  }

  const handleDelete = (event) => {
    if (window.confirm(`Eliminare la partita di ${event.squadra}?`)) {
      deleteMutation.mutate(event)
    }
  }

  const handleEdit = (event) => {
    setSelectedEvent(null)
    setEditingEvent(event)
    setShowForm(true)
  }

  const canModify = isAdmin || isAllenatore

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">

      {/* ── Sticky header ── */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="px-4 pt-4 pb-2 space-y-2">
          <h1 className="text-xl font-bold text-gray-900">🏀 Calendario Partite</h1>

          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {[['settimana', 'Settimana'], ['mese', 'Mese']].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
                  view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select value={squadraFilter} onChange={e => setSquadraFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Tutte le squadre</option>
              {squadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={allenatoreFilter} onChange={e => setAllenatoreFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Tutti gli allenatori</option>
              {allenatoriList.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-2 pb-2"
          onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <button
            onClick={() => view === 'settimana' ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <div className="text-center select-none">
            {view === 'settimana' ? (
              <>
                <div className="text-sm font-semibold text-gray-800">{weekLabel}</div>
                {weekOffset === 0 && (
                  <div className="text-xs text-blue-500 font-medium">Settimana corrente</div>
                )}
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-gray-800 capitalize">{monthLabel}</div>
                {monthOffset === 0 && (
                  <div className="text-xs text-blue-500 font-medium">Mese corrente</div>
                )}
              </>
            )}
          </div>
          <button
            onClick={() => view === 'settimana' ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1)}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2">
          {LEGEND.map(({ color, label }) => (
            <div key={color} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${COLORS[color].dot}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
          {view === 'settimana' && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={10} className="text-red-500" />
              <span className="text-xs text-gray-500">All. da spostare</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {view === 'settimana' ? (
        isLoading ? (
          <LoadingSpinner message="Caricamento calendario..." />
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <AlertCircle size={40} className="text-red-400 mx-auto mb-2" />
              <p className="text-gray-600 text-sm">Errore nel caricamento</p>
              <p className="text-gray-400 text-xs mt-1">{error.message}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
              {weekDays.map((day, di) => {
                const dateStr   = format(day, 'yyyy-MM-dd')
                const isToday   = isDateToday(dateStr)
                const dayEvents = eventsByDate[dateStr] ?? []
                const isLast    = di === weekDays.length - 1

                return (
                  <div key={dateStr} className={`w-36 flex-shrink-0 ${!isLast ? 'border-r border-gray-200 pr-1' : ''}`}>
                    <div className={`rounded-xl p-2 mb-2 text-center ${
                      isToday ? 'bg-blue-600' : 'bg-white border border-gray-200'
                    }`}>
                      <div className={`text-xs font-medium uppercase tracking-wide ${
                        isToday ? 'text-blue-100' : 'text-gray-400'
                      }`}>
                        {format(day, 'EEE', { locale: it })}
                      </div>
                      <div className={`text-lg font-bold leading-tight ${
                        isToday ? 'text-white' : 'text-gray-700'
                      }`}>
                        {format(day, 'd')}
                      </div>
                    </div>

                    {dayEvents.length === 0 ? (
                      <div className="text-gray-300 text-center py-6 text-sm select-none">–</div>
                    ) : (
                      dayEvents.map((event, i) => {
                        const conflicts = conflictMap.get(event.id) ?? []
                        return (
                          <div key={`${event._source}-${event.id ?? i}-${dateStr}`}>
                            <MiniEventCard
                              event={event}
                              conflicts={conflicts}
                              onClick={setSelectedEvent}
                            />
                            {conflicts.map((t, ci) => (
                              <ConflictTrainingCard key={ci} training={t} />
                            ))}
                          </div>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      ) : (
        monthLoading ? (
          <LoadingSpinner message="Caricamento mese..." />
        ) : (
          <div className="py-3">
            <MonthGrid
              key={monthLabel}
              monthDate={currentMonthDate}
              events={displayMonthEvents}
              onEventClick={setSelectedEvent}
            />
          </div>
        )
      )}

      {/* ── FAB ── */}
      {canModify && (
        <button
          onClick={() => { setEditingEvent(null); setShowForm(true) }}
          className="fixed bottom-24 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all z-20"
          aria-label="Aggiungi partita"
        >
          <Plus size={28} />
        </button>
      )}

      {/* ── Detail modal ── */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleStato={(event) => toggleStatoMutation.mutate({ id: event.id, stato: event.stato })}
          togglingStato={toggleStatoMutation.isPending}
          isAdmin={isAdmin}
          canModify={canModify}
          canModifyEvent={canModifyEvent(selectedEvent)}
          conflicts={conflictMap.get(selectedEvent?.id) ?? []}
        />
      )}

      {/* ── Add / Edit form ── */}
      {showForm && (
        <EventForm
          initial={editingEvent && editingEvent._table === 'calendario' ? {
            id:         editingEvent.id,
            data:       editingEvent.data ?? '',
            ora_inizio: formatTime(editingEvent.ora_inizio),
            ora_fine:   formatTime(editingEvent.ora_fine),
            squadra:    editingEvent.squadra    ?? '',
            avversario: editingEvent.avversario ?? '',
            casa_fuori: (editingEvent.casa_fuori ?? 'casa').toLowerCase(),
            palestra:   editingEvent.palestra   ?? '',
            stato:      editingEvent.stato      ?? 'provvisoria',
          } : null}
          squadre={squadre}
          squadreAllenatore={squadreAllenatore}
          saving={saveMutation.isPending}
          saveError={saveMutation.isError ? (saveMutation.error?.message ?? 'Errore sconosciuto') : null}
          onSave={(formData) => saveMutation.mutate(formData)}
          onClose={() => { setShowForm(false); setEditingEvent(null); saveMutation.reset() }}
        />
      )}
    </div>
  )
}
