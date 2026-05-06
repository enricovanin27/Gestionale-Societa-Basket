import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  format, addWeeks, startOfWeek, addMonths, startOfMonth, endOfMonth,
  isSameMonth, eachDayOfInterval, endOfWeek,
} from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, Plus, X, Edit2, Trash2,
  MapPin, Clock, Users, AlertCircle, RefreshCw, AlertTriangle, Download, CheckCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateICS, downloadICS, partitaToEvent, allenamentoToEvent } from '../lib/ical'
import { useAuth } from '../hooks/useAuth'
import ImportaCalendarioPage from './ImportaCalendarioPage'
import { formatDate, formatTime, getWeekDays, isDateToday } from '../lib/utils'
import { useWeekEvents, useSquadre, useMonthPartite } from '../hooks/useWeekEvents'
import LoadingSpinner from '../components/LoadingSpinner'
import { saveAllenamento, inviaNotificaModifica } from '../hooks/useAllenamenti'

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

function EventModal({ event, onClose, onEdit, onDelete, onToggleStato, isAdmin, canModify, canModifyEvent, togglingStato, conflicts = [], onNavigateAllenamenti }) {
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
            {onNavigateAllenamenti && (
              <button
                onClick={onNavigateAllenamenti}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 bg-red-100 text-red-700 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
              >
                Gestisci allenamenti →
              </button>
            )}
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
  tipo:       'partita',
  data:       format(new Date(), 'yyyy-MM-dd'),
  ora_inizio: '10:00',
  ora_fine:   '12:00',
  squadra:    '',
  avversario: '',
  casa_fuori: 'Casa',
  palestra:   '',
  stato:      'provvisoria',
}

function EventForm({ initial, onSave, onClose, squadre, squadreAllenatore, saving, saveError }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const squadreDisp = squadreAllenatore?.length ? squadreAllenatore : squadre

  // Solo palestre abilitate alle gare (solo_allenamento = false)
  const { data: palestreList = [] } = useQuery({
    queryKey: ['palestre-gara'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome, solo_allenamento').order('nome')
      return (data ?? []).filter(p => !p.solo_allenamento).map(p => p.nome).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  // Evento conflitti sul giorno selezionato (fisso + settimana + calendario)
  const GIORNO_BY_JS_DAY_F = ['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato']
  const { data: conflictEvents = [] } = useQuery({
    queryKey: ['conflict-events', form.data],
    queryFn: async () => {
      if (!form.data) return []
      const giorno = GIORNO_BY_JS_DAY_F[new Date(form.data + 'T12:00:00').getDay()]
      const [fissoRes, settRes, calRes] = await Promise.all([
        supabase.from('orario_fisso').select('squadra, palestra, ora_inizio, ora_fine').eq('giorno', giorno),
        supabase.from('orario_settimana').select('squadra, palestra, ora_inizio, ora_fine, annullato').eq('data', form.data),
        supabase.from('calendario').select('id, squadra, palestra, ora_inizio, ora_fine').eq('data', form.data),
      ])
      const settMap = new Map((settRes.data ?? []).map(s => [s.squadra?.toLowerCase().trim(), s]))
      const trainings = []
      for (const f of (fissoRes.data ?? [])) {
        const key = f.squadra?.toLowerCase().trim()
        const ov = settMap.get(key)
        if (ov) { if (!ov.annullato) trainings.push({ ...f, ...ov, _tipo: 'allenamento' }) }
        else trainings.push({ ...f, _tipo: 'allenamento' })
      }
      for (const s of (settRes.data ?? [])) {
        if (s.annullato) continue
        const hasFisso = (fissoRes.data ?? []).some(f => f.squadra?.toLowerCase().trim() === s.squadra?.toLowerCase().trim())
        if (!hasFisso) trainings.push({ ...s, _tipo: 'allenamento' })
      }
      const partite = (calRes.data ?? []).map(p => ({ ...p, _tipo: 'partita' }))
      return [...trainings, ...partite]
    },
    enabled: !!form.data,
    staleTime: 30 * 1000,
  })

  const [forceInsert, setForceInsert] = useState(false)

  const conflictCheck = useMemo(() => {
    const errors = []
    if (!form.ora_inizio || !form.ora_fine || !form.data || !form.squadra) return { errors, hasConflicts: false }
    const others = conflictEvents.filter(e => !(e._tipo === 'partita' && e.id === form.id))
    for (const e of others) {
      const n = t => String(t ?? '').slice(0, 5)
      const [a0, a1, b0, b1] = [form.ora_inizio, form.ora_fine, e.ora_inizio, e.ora_fine].map(n)
      if (!a0 || !a1 || !b0 || !b1 || !(a0 < b1 && a1 > b0)) continue
      if ((e.squadra ?? '').toLowerCase() === (form.squadra ?? '').toLowerCase()) {
        errors.push(`${e.squadra} ha già un ${e._tipo === 'partita' ? 'partita' : 'allenamento'} (${n(e.ora_inizio)}–${n(e.ora_fine)})`)
      } else if (form.casa_fuori === 'Casa' && form.palestra?.trim() && e.palestra?.trim() &&
                 form.palestra.trim().toLowerCase() === e.palestra.trim().toLowerCase()) {
        errors.push(`${form.palestra} già occupata da ${e.squadra} (${n(e.ora_inizio)}–${n(e.ora_fine)})`)
      }
    }
    return { errors, hasConflicts: errors.length > 0 }
  }, [form, conflictEvents])

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
          <form id="event-form" onSubmit={e => {
          e.preventDefault()
          if (conflictCheck.hasConflicts && !forceInsert) return
          const saveData = form.casa_fuori === 'Fuori Casa'
            ? { ...form, palestra: form.avversario || '' }
            : form
          onSave(saveData)
        }} className="space-y-4">
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
                {[{ val: 'Casa', label: '🏠 Casa' }, { val: 'Fuori Casa', label: '✈️ Trasferta' }].map(({ val, label }) => (
                  <button key={val} type="button" onClick={() => set('casa_fuori', val)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.casa_fuori === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {form.casa_fuori === 'Casa' && (
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
            )}

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
          {/* Conflict feedback */}
          {form.data && form.ora_inizio && form.ora_fine && form.squadra && (
            conflictCheck.hasConflicts ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-red-700">Conflitti rilevati</span>
                </div>
                {conflictCheck.errors.map((msg, i) => (
                  <p key={i} className="text-xs text-red-600">• {msg}</p>
                ))}
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input type="checkbox" checked={forceInsert} onChange={e => setForceInsert(e.target.checked)}
                    className="w-4 h-4 rounded text-orange-600" />
                  <span className="text-xs text-orange-700 font-medium">Inserisci comunque</span>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <CheckCircle size={13} className="flex-shrink-0" /> Nessun conflitto
              </div>
            )
          )}

          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <p className="text-xs text-red-700">❌ {saveError}</p>
            </div>
          )}
          <button
            type="submit" form="event-form"
            disabled={saving || (conflictCheck.hasConflicts && !forceInsert)}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
            {saving ? 'Salvataggio...' : (initial?.id ? 'Salva modifiche' : 'Aggiungi partita')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Training mini card (vista completa) ─────────────────────────────────────

function TrainingMiniCard({ training, isConflicted, onNavigateAllenamenti, onEdit }) {
  return (
    <div className={`w-full rounded-lg p-2 mb-1 shadow-sm ${
      isConflicted
        ? 'border-l-4 border-red-500 bg-red-50'
        : 'border-l-4 border-gray-300 bg-gray-50'
    }`}>
      <div className="flex items-start justify-between gap-1">
        <div className={`text-xs font-semibold truncate ${isConflicted ? 'text-red-800' : 'text-gray-700'}`}>
          {training.squadra}
        </div>
        {onEdit && (
          <button onClick={onEdit} className="text-gray-400 hover:text-blue-600 active:opacity-70 shrink-0">
            <Edit2 size={11} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <Clock size={10} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-500">
          {formatTime(training.ora_inizio)}–{formatTime(training.ora_fine)}
        </span>
      </div>
      {training.palestra && (
        <div className="text-xs text-gray-400 truncate">{training.palestra}</div>
      )}
      {isConflicted && (
        <button
          onClick={onNavigateAllenamenti}
          className="flex items-center gap-1 mt-1 pt-1 border-t border-red-200 text-xs text-red-600 font-medium w-full text-left active:opacity-70"
        >
          <AlertTriangle size={10} className="flex-shrink-0" />
          Da spostare →
        </button>
      )}
    </div>
  )
}

// ─── Vista settimana completa (partite + allenamenti) ────────────────────────

function VistaSettimanaleCompleta({ weekDays, data, scopeFilter, allenatoreFilterFn, squadraFilter, conflictedTrainingKeys, conflictMap, onPartitaClick, onNavigateAllenamenti, onTrainingEdit }) {
  const allEventsByDate = useMemo(() => {
    if (!data) return {}
    const map = {}
    data.events
      .filter(e => {
        if (!scopeFilter(e)) return false
        if (squadraFilter && e.squadra !== squadraFilter) return false
        if (!allenatoreFilterFn(e)) return false
        if (e.annullato && e._tipo !== 'partita') return false
        return true
      })
      .forEach(e => {
        if (!map[e.data]) map[e.data] = []
        map[e.data].push(e)
      })
    return map
  }, [data, scopeFilter, allenatoreFilterFn, squadraFilter])

  return (
    <div className="overflow-x-auto p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* Legenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {[
          { cls: 'bg-green-500',  label: 'Partita casa' },
          { cls: 'bg-blue-500',   label: 'Partita trasferta' },
          { cls: 'bg-gray-400',   label: 'Allenamento' },
          { cls: 'bg-red-500',    label: 'All. da spostare' },
        ].map(({ cls, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cls}`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
        {weekDays.map((day, di) => {
          const dateStr   = format(day, 'yyyy-MM-dd')
          const isToday   = isDateToday(dateStr)
          const dayEvents = allEventsByDate[dateStr] ?? []
          const isLast    = di === weekDays.length - 1
          return (
            <div key={dateStr} className={`w-36 flex-shrink-0 ${!isLast ? 'border-r border-gray-200 pr-1' : ''}`}>
              <div className={`rounded-xl p-2 mb-2 text-center ${isToday ? 'bg-blue-600' : 'bg-white border border-gray-200'}`}>
                <div className={`text-xs font-medium uppercase tracking-wide ${isToday ? 'text-blue-100' : 'text-gray-400'}`}>
                  {format(day, 'EEE', { locale: it })}
                </div>
                <div className={`text-lg font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-700'}`}>
                  {format(day, 'd')}
                </div>
              </div>
              {dayEvents.length === 0 ? (
                <div className="text-gray-300 text-center py-6 text-sm select-none">–</div>
              ) : (
                dayEvents.map((event, i) => {
                  if (event._tipo === 'partita') {
                    return (
                      <MiniEventCard
                        key={`p-${event.id ?? i}`}
                        event={event}
                        conflicts={conflictMap.get(event.id) ?? []}
                        onClick={onPartitaClick}
                      />
                    )
                  }
                  const tKey = `${event.squadra}|${event.data}|${event.ora_inizio}`
                  return (
                    <TrainingMiniCard
                      key={`t-${i}`}
                      training={event}
                      isConflicted={conflictedTrainingKeys.has(tKey)}
                      onNavigateAllenamenti={onNavigateAllenamenti}
                      onEdit={onTrainingEdit ? () => onTrainingEdit(event) : undefined}
                    />
                  )
                })
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Training edit modal ──────────────────────────────────────────────────────

function TrainingEditModal({ training, onClose, onSaved }) {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    ora_inizio: formatTime(training.ora_inizio) || '',
    ora_fine:   formatTime(training.ora_fine)   || '',
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Modifica allenamento</h2>
            <p className="text-xs text-gray-400 mt-0.5">{training.squadra} · {formatDate(training.data, 'EEE d MMM')}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio</label>
              <input type="time" value={form.ora_inizio} onChange={e => set('ora_inizio', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ora fine</label>
              <input type="time" value={form.ora_fine} onChange={e => set('ora_fine', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Palestra</label>
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

          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Modifica solo questa data — la settimana tipo rimane invariata.
          </p>

          {saveMut.isError && (
            <p className="text-xs text-red-600">Errore: {saveMut.error?.message}</p>
          )}

          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !form.ora_inizio || !form.ora_fine}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform"
          >
            {saveMut.isPending ? 'Salvataggio...' : 'Salva modifica'}
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
  const navigate = useNavigate()

  const [calTab,           setCalTab]           = useState('partite') // 'partite' | 'settimana' | 'importa'
  const [view,             setView]             = useState('settimana') // 'settimana' | 'mese'
  const [weekOffset,       setWeekOffset]       = useState(0)
  const [monthOffset,      setMonthOffset]      = useState(0)
  const [mySquadreOnly,    setMySquadreOnly]    = useState(true)
  const [squadraFilter,    setSquadraFilter]    = useState('')
  const [allenatoreFilter, setAllenatoreFilter] = useState('')
  const [selectedEvent,    setSelectedEvent]    = useState(null)
  const [showForm,         setShowForm]         = useState(false)
  const [editingEvent,     setEditingEvent]     = useState(null)
  const [editingTraining,  setEditingTraining]  = useState(null)
  const [exportingICS,     setExportingICS]     = useState(false)

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

  // Allenatori con squadre — squadre_capo/squadre_vice sono stringhe CSV
  const { data: allenatoriData = [] } = useQuery({
    queryKey: ['allenatori-list'],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('allenatori')
        .select('nome, cognome, squadre_capo, squadre_vice')
        .order('cognome').order('nome')
      return rows ?? []
    },
    staleTime: 10 * 60 * 1000,
  })

  const allenatoriList = useMemo(
    () => allenatoriData.map(a => [a.nome, a.cognome].filter(Boolean).join(' ')).filter(Boolean),
    [allenatoriData]
  )

  // Mappa nomeAllenatore → [squadre] da orario_fisso (fonte affidabile anche se squadre_capo/vice sono vuote)
  const { data: fissoAllenatoriMap = {} } = useQuery({
    queryKey: ['fisso-allenatori-map'],
    queryFn: async () => {
      const { data } = await supabase.from('orario_fisso').select('squadra, allenatori')
      const map = {}
      for (const row of data ?? []) {
        if (!row.allenatori || !row.squadra) continue
        row.allenatori.split(',').map(a => a.trim()).filter(Boolean).forEach(name => {
          if (!map[name]) map[name] = []
          if (!map[name].includes(row.squadra)) map[name].push(row.squadra)
        })
      }
      return map
    },
    staleTime: 10 * 60 * 1000,
  })

  // Solo partite, filtrate per squadra/allenatore
  const scopeFilter = mySquadreOnly && squadreAllenatore?.length
    ? (e) => squadreAllenatore.includes(e.squadra)
    : () => true

  // Filtro allenatore: orario_fisso come fonte primaria, squadre_capo/vice come fallback
  const allenatoreFilterFn = useMemo(() => {
    if (!allenatoreFilter) return () => true
    const fissoSq = Object.entries(fissoAllenatoriMap)
      .filter(([name]) => name.toLowerCase() === allenatoreFilter.toLowerCase())
      .flatMap(([, sq]) => sq)
    const al = allenatoriData.find(a => [a.nome, a.cognome].filter(Boolean).join(' ') === allenatoreFilter)
    const parseList = s => (s ?? '').split(',').map(x => x.trim()).filter(Boolean)
    const tabSq = al ? [...parseList(al.squadre_capo), ...parseList(al.squadre_vice)] : []
    const squadreAl = [...new Set([...fissoSq, ...tabSq])]
    return (e) => {
      if (squadreAl.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())) return true
      if (e.allenatori && e.allenatori.split(',').some(a =>
        a.trim().toLowerCase().includes(allenatoreFilter.toLowerCase()))) return true
      return false
    }
  }, [allenatoreFilter, allenatoriData, fissoAllenatoriMap])

  const displayEvents = useMemo(() => {
    if (!data) return []
    let events = data.events.filter(e => e._tipo === 'partita').filter(scopeFilter)
    if (squadraFilter) events = events.filter(e => e.squadra === squadraFilter)
    if (allenatoreFilter) events = events.filter(allenatoreFilterFn)
    return events
  }, [data, squadraFilter, allenatoreFilter, scopeFilter, allenatoreFilterFn])

  const displayMonthEvents = useMemo(() => {
    let events = monthPartite.filter(scopeFilter)
    if (squadraFilter) events = events.filter(e => e.squadra === squadraFilter)
    if (allenatoreFilter) events = events.filter(allenatoreFilterFn)
    return events
  }, [monthPartite, squadraFilter, allenatoreFilter, scopeFilter, allenatoreFilterFn])

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
      const conflicts = allTrainings.filter(t => {
        if (t.data !== p.data) return false
        if (!timesOverlap(p.ora_inizio, p.ora_fine, t.ora_inizio, t.ora_fine)) return false
        const sameSquadra = (t.squadra ?? '').toLowerCase() === (p.squadra ?? '').toLowerCase()
        const samePalestra = p.casa_fuori === 'Casa' &&
          p.palestra?.trim() && t.palestra?.trim() &&
          p.palestra.trim().toLowerCase() === t.palestra.trim().toLowerCase()
        return sameSquadra || samePalestra
      })
      if (conflicts.length > 0) map.set(p.id, conflicts)
    }
    return map
  }, [displayEvents, allTrainings])

  // Set di chiavi allenamento in conflitto — usato da VistaSettimanaleCompleta
  const conflictedTrainingKeys = useMemo(() => {
    const set = new Set()
    conflictMap.forEach(trainings =>
      trainings.forEach(t => set.add(`${t.squadra}|${t.data}|${t.ora_inizio}`))
    )
    return set
  }, [conflictMap])

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

  async function handleExportICS() {
    setExportingICS(true)
    try {
      const today   = format(new Date(), 'yyyy-MM-dd')
      const endDate = format(addMonths(new Date(), 3), 'yyyy-MM-dd')
      const [{ data: partite }, { data: allMents }] = await Promise.all([
        supabase.from('calendario').select('*')
          .eq('stato', 'definitiva').gte('data', today).lte('data', endDate).order('data'),
        supabase.from('orario_settimana').select('*')
          .gte('data', today).lte('data', endDate).neq('annullato', true).order('data'),
      ])
      const filtered = (events) => {
        if (!squadreAllenatore) return events ?? []
        return (events ?? []).filter(e => squadreAllenatore.includes(e.squadra))
      }
      const icsEvents = [
        ...filtered(partite).map(partitaToEvent),
        ...filtered(allMents).map(allenamentoToEvent),
      ]
      downloadICS(generateICS(icsEvents))
    } finally {
      setExportingICS(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">

      {/* ── Sticky header ── */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="px-4 pt-4 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">🏀 Calendario</h1>
            {calTab === 'partite' && (
              <button
                onClick={handleExportICS}
                disabled={exportingICS}
                title="Esporta calendario (.ics)"
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded-lg px-2 py-1 hover:border-blue-300 transition-colors disabled:opacity-50"
              >
                <Download size={13} />
                {exportingICS ? '…' : '.ics'}
              </button>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {[['partite', 'Partite'], ['settimana', 'Settimana'], ['importa', 'Import FIP']].map(([v, label]) => (
              <button key={v} onClick={() => setCalTab(v)}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
                  calTab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {(calTab === 'partite' || calTab === 'settimana') && <>
            {/* Scope select — solo per allenatori */}
            {isAllenatore && (
              <select
                value={mySquadreOnly ? 'mine' : 'all'}
                onChange={e => { setMySquadreOnly(e.target.value === 'mine'); setSquadraFilter('') }}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="mine">Le mie squadre</option>
                <option value="all">Tutti gli allenatori</option>
              </select>
            )}

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
                <option value="">{mySquadreOnly && squadreAllenatore?.length ? 'Tutte le mie' : 'Tutte le squadre'}</option>
                {(mySquadreOnly && squadreAllenatore?.length ? squadreAllenatore : squadre).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={allenatoreFilter} onChange={e => setAllenatoreFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tutti gli allenatori</option>
                {allenatoriList.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </>}
        </div>

        {/* Navigation */}
        {(calTab === 'partite' || calTab === 'settimana') && <>
          <div className="flex items-center justify-between px-2 pb-2"
            onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <button
              onClick={() => (calTab === 'settimana' || view === 'settimana') ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)}
              className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <div className="text-center select-none">
              {(calTab === 'settimana' || view === 'settimana') ? (
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
              onClick={() => (calTab === 'settimana' || view === 'settimana') ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1)}
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
        </>}
      </div>

      {/* ── Import FIP tab ── */}
      {calTab === 'importa' && <ImportaCalendarioPage embedded />}

      {/* ── Vista Settimana Completa ── */}
      {calTab === 'settimana' && (
        isLoading ? (
          <LoadingSpinner message="Caricamento..." />
        ) : (
          <VistaSettimanaleCompleta
            weekDays={weekDays}
            data={data}
            scopeFilter={scopeFilter}
            allenatoreFilterFn={allenatoreFilterFn}
            squadraFilter={squadraFilter}
            conflictedTrainingKeys={conflictedTrainingKeys}
            conflictMap={conflictMap}
            onPartitaClick={setSelectedEvent}
            onNavigateAllenamenti={() => navigate('/allenamenti')}
            onTrainingEdit={canModify ? setEditingTraining : undefined}
          />
        )
      )}

      {/* ── Partite solo ── */}
      {calTab === 'partite' && (view === 'settimana' ? (
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
      ))}

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
          onNavigateAllenamenti={() => { setSelectedEvent(null); navigate('/allenamenti') }}
        />
      )}

      {/* ── Training edit modal ── */}
      {editingTraining && (
        <TrainingEditModal
          training={editingTraining}
          onClose={() => setEditingTraining(null)}
          onSaved={() => setEditingTraining(null)}
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
            casa_fuori: editingEvent.casa_fuori ?? 'Casa',
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
