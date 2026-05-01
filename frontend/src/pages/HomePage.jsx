import { useState, useMemo, useRef, useEffect } from 'react'
import {
  format, startOfWeek, addDays, addWeeks, addMonths, parseISO,
  startOfMonth, endOfMonth, eachDayOfInterval, endOfWeek, isSameMonth,
} from 'date-fns'
import { it } from 'date-fns/locale'
import {
  CheckCircle2, LogOut, AlertTriangle, Clock, MapPin, AlertCircle,
  ChevronLeft, ChevronRight, X, Plus, Lock, Download,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useWeekEvents, useMonthEvents } from '../hooks/useWeekEvents'
import { getWeekDays, formatDate, formatTime, isDateToday } from '../lib/utils'
import { generateICS, downloadICS, partitaToEvent, allenamentoToEvent } from '../lib/ical'
import LoadingSpinner from '../components/LoadingSpinner'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timesOverlap(as, ae, bs, be) {
  const n = t => String(t ?? '').slice(0, 5)
  const [a0, a1, b0, b1] = [as, ae, bs, be].map(n)
  if (!a0 || !a1 || !b0 || !b1) return false
  return a0 < b1 && a1 > b0
}

function parseList(str) {
  return (str ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

// ─── DB helpers (usati dall'allenatore dalla home) ─────────────────────────────

async function saveAllenamento(event, formData, societaId) {
  const payload = {
    data: event.data, squadra: event.squadra,
    ora_inizio: formData.ora_inizio, ora_fine: formData.ora_fine,
    palestra: formData.palestra, annullato: false,
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

async function annullaAllenamento(event, societaId) {
  if (event._source === 'fisso') {
    const { data: existing } = await supabase
      .from('orario_settimana').select('id')
      .eq('data', event.data).eq('squadra', event.squadra).maybeSingle()
    if (existing) {
      const { error } = await supabase.from('orario_settimana').update({ annullato: true }).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('orario_settimana').insert([{
        data: event.data, squadra: event.squadra,
        ora_inizio: event.ora_inizio, ora_fine: event.ora_fine,
        palestra: event.palestra ?? '', annullato: true, societa_id: societaId,
      }])
      if (error) throw error
    }
  } else {
    const { error } = await supabase.from('orario_settimana').update({ annullato: true }).eq('id', event.id)
    if (error) throw error
  }
}

// ─── Costanti giorni (usate dai modal allenatore) ──────────────────────────────

const GIORNI_W       = ['lunedi','martedi','mercoledi','giovedi','venerdi','sabato','domenica']
const GIORNI_LABEL_W = { lunedi:'Lunedì', martedi:'Martedì', mercoledi:'Mercoledì', giovedi:'Giovedì', venerdi:'Venerdì', sabato:'Sabato', domenica:'Domenica' }
const GIORNO_OFFSET_W = { lunedi:0, martedi:1, mercoledi:2, giovedi:3, venerdi:4, sabato:5, domenica:6 }

// ─── Cambia password (usato in tutti gli header) ──────────────────────────────

function CambiaPasswordButton() {
  const [open,    setOpen]    = useState(false)
  const [form,    setForm]    = useState({ nuova: '', conferma: '' })
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState(null)
  const [ok,      setOk]      = useState(false)

  function reset() { setOpen(false); setOk(false); setErr(null); setForm({ nuova: '', conferma: '' }) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.nuova !== form.conferma) { setErr('Le password non coincidono'); return }
    setLoading(true); setErr(null)
    const { error } = await supabase.auth.updateUser({ password: form.nuova })
    setLoading(false)
    if (error) { setErr(error.message); return }
    setOk(true)
    setTimeout(reset, 2000)
  }

  const inp2 = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-blue-300 hover:text-white">
        <Lock size={12} /> Password
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={reset}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Cambia password</h2>
              <button onClick={reset} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            {ok ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-2">✅</div>
                <p className="font-semibold text-gray-800">Password aggiornata!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Nuova password</label>
                  <input type="password" value={form.nuova}
                    onChange={e => setForm(f => ({ ...f, nuova: e.target.value }))}
                    className={inp2} placeholder="Minimo 6 caratteri" required minLength={6} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Conferma password</label>
                  <input type="password" value={form.conferma}
                    onChange={e => setForm(f => ({ ...f, conferma: e.target.value }))}
                    className={inp2} placeholder="Ripeti la password" required />
                </div>
                {err && <p className="text-xs text-red-500">{err}</p>}
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
                  {loading ? 'Aggiornamento...' : 'Aggiorna password'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Shared header ─────────────────────────────────────────────────────────────

function Header({ title, subtitle, displayName, logout, societaNome }) {
  return (
    <div className="bg-blue-600 text-white px-4 pt-10 pb-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🏀</span>
            <span className="font-bold text-lg">{societaNome ?? 'Gestionale Basket'}</span>
          </div>
          <p className="text-blue-100 text-base font-semibold mt-1">{title}</p>
          <p className="text-blue-200 text-sm capitalize mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xs text-blue-200 text-right max-w-[120px] truncate">{displayName}</span>
          <div className="flex items-center gap-3">
            <CambiaPasswordButton />
            <button onClick={logout} className="flex items-center gap-1 text-xs text-blue-300 hover:text-white">
              <LogOut size={13} /> Esci
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-4 mb-2">
      {children}
    </h2>
  )
}

// ─── Event row (compact card) ─────────────────────────────────────────────────

const BORDER_COLOR = {
  partita_casa:      'border-l-green-500',
  partita_trasferta: 'border-l-blue-500',
  partita_prov:      'border-l-yellow-400',
  allenamento:       'border-l-indigo-400',
}

function EventRow({ event }) {
  const isPartita = event._tipo === 'partita'
  let bk = 'allenamento'
  if (isPartita) {
    if (event.stato === 'provvisoria') bk = 'partita_prov'
    else if ((event.casa_fuori ?? '').toLowerCase() === 'casa') bk = 'partita_casa'
    else bk = 'partita_trasferta'
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${BORDER_COLOR[bk]} p-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {isPartita
              ? `${event.squadra}${event.avversario ? ` vs ${event.avversario}` : ''}`
              : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
            {event.ora_inizio && (
              <span className="flex items-center gap-1 font-medium text-gray-700">
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
        {isPartita && (
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
            event.stato === 'provvisoria'
              ? 'bg-yellow-100 text-yellow-700'
              : (event.casa_fuori ?? '').toLowerCase() === 'casa'
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-100 text-blue-700'
          }`}>
            {event.stato === 'provvisoria'
              ? '⚠️ Prov.'
              : (event.casa_fuori ?? '').toLowerCase() === 'casa' ? 'Casa' : 'Trasferta'}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Sezione giornaliera riutilizzabile ────────────────────────────────────────

function DaySection({ label, events, emptyMsg = 'Nessun impegno' }) {
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

// ─── Allenatore event dot color (allenamento + partita) ───────────────────────

function getAllenatoreEventDotColor(event) {
  if (event._tipo === 'allenamento') return 'bg-indigo-400'
  if (event.stato === 'provvisoria') return 'bg-yellow-400'
  return (event.casa_fuori ?? '').toLowerCase() === 'casa' ? 'bg-green-500' : 'bg-blue-500'
}

// ─── Mini card for allenatore week view ────────────────────────────────────────

function AllenatoreEventCard({ event, onClick }) {
  const isPartita = event._tipo === 'partita'

  if (!isPartita) {
    return (
      <button
        onClick={() => onClick(event)}
        className="w-full text-left rounded-lg p-2 mb-1 shadow-sm active:scale-95 transition-transform border-l-4 border-indigo-400 bg-indigo-50"
      >
        <div className="text-xs font-semibold text-indigo-800 truncate">{event.squadra}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <Clock size={10} className="text-indigo-400 flex-shrink-0" />
          <span className="text-xs text-indigo-600">{formatTime(event.ora_inizio)}</span>
        </div>
        {event.palestra && <div className="text-xs text-indigo-400 truncate">{event.palestra}</div>}
        {event.spostato && <span className="text-[9px] text-indigo-500 italic">modificato</span>}
      </button>
    )
  }

  let cardCls  = 'border-blue-500 bg-blue-50'
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

// ─── Month grid for allenatore (allenamenti + partite) ────────────────────────

const MONTH_DAY_HEADERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

function AllenatoreMonthGrid({ monthDate, events, onEventClick }) {
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
              } ${isSelected ? 'bg-blue-50' : 'bg-white'}`}
            >
              <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                today ? 'bg-blue-600 text-white' : 'text-gray-700'
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
                ? 'border-indigo-400 bg-indigo-50'
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
                      ? 'bg-indigo-100 text-indigo-600'
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

// ─── Event detail bottom sheet (read-only for allenatore) ─────────────────────

function AllenatoreEventModal({ event, onClose, showPresenza = false }) {
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
            <span className="inline-block text-xs px-2 py-1 rounded-full font-medium bg-indigo-100 text-indigo-700">
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
                  { val: 'presente', label: '✅ Ci sarò',      active: 'bg-green-600 text-white border-green-600' },
                  { val: 'assente',  label: '❌ Non ci sarò',   active: 'bg-red-500 text-white border-red-500' },
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

// ─── Modal modifica allenamento (allenatore) ───────────────────────────────────

const INP = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function AllenatoreEditModal({ event, onClose, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    ora_inizio: (event.ora_inizio ?? '18:00').slice(0, 5),
    ora_fine:   (event.ora_fine   ?? '20:00').slice(0, 5),
    palestra:   event.palestra ?? '',
  })

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
      <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Modifica allenamento</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <p className="text-sm text-blue-600 font-medium mb-4">
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
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel}
            className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-xl font-medium text-sm border border-red-200">
            ❌ Annulla allenamento
          </button>
          <button onClick={() => onSave(form)}
            disabled={saving || !form.palestra.trim()}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60">
            {saving ? 'Salvataggio...' : '✅ Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal aggiungi partita (allenatore) ──────────────────────────────────────

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
          className="w-full mt-5 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saveMut.isPending ? 'Salvataggio...' : '✅ Aggiungi partita'}
        </button>
        {!canSave && <p className="text-center text-xs text-red-500 mt-2">Squadra e data sono obbligatori</p>}
      </div>
    </div>
  )
}

// ─── Modal aggiungi allenamento (allenatore) ───────────────────────────────────

function AllenatoreAddModal({ weekStart, mySquadre, onClose }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [form, setForm] = useState({
    squadra:    mySquadre[0] ?? '',
    giorno:     'lunedi',
    ora_inizio: '18:00',
    ora_fine:   '20:00',
    palestra:   '',
  })

  const { data: palestre = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome)
    },
    staleTime: 10 * 60 * 1000,
  })

  const targetDate = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + (GIORNO_OFFSET_W[form.giorno] ?? 0))
    return format(d, 'yyyy-MM-dd')
  }, [weekStart, form.giorno])

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
          className="w-full mt-5 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saveMut.isPending ? 'Salvataggio...' : '✅ Aggiungi allenamento'}
        </button>
        {!canSave && (
          <p className="text-center text-xs text-red-500 mt-2">Compila tutti i campi obbligatori</p>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN HOME — toggle Partite / Da gestire
// ═══════════════════════════════════════════════════════════════════════════════

function AdminHome({ displayName, logout, societaNome }) {
  const [tab, setTab]  = useState('partite')
  const today          = new Date()
  const todayStr       = format(today, 'yyyy-MM-dd')
  const endStr         = format(addDays(today, 14), 'yyyy-MM-dd')
  const weekStart      = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])
  const nextWeekStart  = useMemo(() => addWeeks(weekStart, 1), [weekStart])

  // Partite dei prossimi 14 giorni
  const { data: partiteFuture = [], isLoading: loadingP } = useQuery({
    queryKey: ['admin-partite-future', todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario').select('*')
        .gte('data', todayStr).lte('data', endStr)
        .order('data').order('ora_inizio')
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  // Partite provvisorie future
  const { data: provvisorie = [], isLoading: loadingProv } = useQuery({
    queryKey: ['admin-provvisorie', todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario').select('*')
        .eq('stato', 'provvisoria').gte('data', todayStr)
        .order('data').order('ora_inizio')
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  // Dati settimana corrente + prossima per rilevare conflitti
  const { data: thisWeek }  = useWeekEvents(weekStart)
  const { data: nextWeek }  = useWeekEvents(nextWeekStart)

  const conflictsAll = useMemo(() => {
    const allEvents    = [...(thisWeek?.events ?? []), ...(nextWeek?.events ?? [])]
    const partite      = allEvents.filter(e => e._tipo === 'partita' && e.stato === 'definitiva')
    const allenamenti  = allEvents.filter(e => e._tipo === 'allenamento' && !e.annullato)
    const result = []
    for (const p of partite) {
      const conf = allenamenti.filter(t =>
        t.data === p.data &&
        (t.squadra ?? '').toLowerCase() === (p.squadra ?? '').toLowerCase() &&
        timesOverlap(p.ora_inizio, p.ora_fine, t.ora_inizio, t.ora_fine)
      )
      if (conf.length) result.push({ partita: p, allenamenti: conf })
    }
    return result
  }, [thisWeek, nextWeek])

  const { data: doppioList = [] } = useQuery({
    queryKey: ['doppio-campionato'],
    queryFn: async () => {
      const { data } = await supabase.from('doppio_campionato').select('*')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const doppioConflictsAdmin = useMemo(() => {
    if (!doppioList.length || !partiteFuture.length) return []
    const byDate = {}
    for (const p of partiteFuture) {
      if (!byDate[p.data]) byDate[p.data] = []
      byDate[p.data].push(p)
    }
    const result = []
    for (const pair of doppioList) {
      for (const [dateStr, partite] of Object.entries(byDate)) {
        const partita_a = partite.find(p => p.squadra === pair.squadra_a)
        const partita_b = partite.find(p => p.squadra === pair.squadra_b)
        if (partita_a && partita_b) {
          result.push({ data: dateStr, pair, partita_a, partita_b })
        }
      }
    }
    return result
  }, [doppioList, partiteFuture])

  const daGestireTot = provvisorie.length + conflictsAll.length + doppioConflictsAdmin.length
  const isLoading    = loadingP || loadingProv

  const partiteByDate = useMemo(() => {
    const map = {}
    for (const p of partiteFuture) {
      if (!map[p.data]) map[p.data] = []
      map[p.data].push(p)
    }
    return map
  }, [partiteFuture])

  return (
    <div className="pb-20">
      <Header
        title="Dashboard"
        subtitle={format(today, "EEEE d MMMM yyyy", { locale: it })}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {/* Toggle tab */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTab('partite')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'partite' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Partite ({partiteFuture.length})
          </button>
          <button
            onClick={() => setTab('gestire')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'gestire' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Da gestire
            {daGestireTot > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs rounded-full leading-none">
                {daGestireTot}
              </span>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="pt-6"><LoadingSpinner /></div>
      ) : tab === 'partite' ? (

        /* ── Partite ── */
        <div className="px-4 space-y-5">
          {partiteFuture.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl py-4 px-3">
              <CheckCircle2 size={16} />
              <span>Nessuna partita nei prossimi 14 giorni</span>
            </div>
          ) : (
            Object.entries(partiteByDate).map(([dateStr, partite]) => (
              <div key={dateStr}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 capitalize">
                  {format(parseISO(dateStr), 'EEEE d MMMM', { locale: it })}
                </p>
                <div className="space-y-2">
                  {partite.map(p => (
                    <EventRow key={p.id} event={{ ...p, _tipo: 'partita', _source: 'calendario' }} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

      ) : (

        /* ── Da gestire ── */
        <div className="px-4 space-y-5">
          {daGestireTot === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl py-4 px-3">
              <CheckCircle2 size={16} />
              <span>Tutto in ordine! Nessuna azione richiesta ✅</span>
            </div>
          ) : (<>

            {/* Provvisorie da confermare */}
            {provvisorie.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <AlertCircle size={12} /> Partite da confermare ({provvisorie.length})
                </p>
                <div className="space-y-2">
                  {provvisorie.map(p => (
                    <div key={p.id} className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-yellow-900">
                        {p.squadra}{p.avversario ? ` vs ${p.avversario}` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-yellow-700">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {format(parseISO(p.data), 'EEE d MMM', { locale: it })} · {formatTime(p.ora_inizio)}
                        </span>
                        {p.palestra && (
                          <span className="flex items-center gap-1">
                            <MapPin size={11} /> {p.palestra}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Allenamenti da spostare */}
            {conflictsAll.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> Allenamenti da spostare ({conflictsAll.length})
                </p>
                <div className="space-y-2">
                  {conflictsAll.map(({ partita, allenamenti }, i) => (
                    <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-red-900">
                        {partita.squadra}{partita.avversario ? ` vs ${partita.avversario}` : ''} — Partita definitiva
                      </p>
                      <p className="text-xs text-red-600 mt-0.5">
                        {format(parseISO(partita.data), 'EEE d MMM', { locale: it })} · {formatTime(partita.ora_inizio)}–{formatTime(partita.ora_fine)}
                        {partita.palestra ? ` · ${partita.palestra}` : ''}
                      </p>
                      <div className="mt-2 space-y-1">
                        {allenamenti.map((t, j) => (
                          <div key={j} className="flex items-center gap-2 text-xs text-red-700 bg-red-100 rounded-lg px-2 py-1.5">
                            <AlertTriangle size={10} className="shrink-0" />
                            <span className="font-medium">{t.squadra}</span>
                            <span>{formatTime(t.ora_inizio)}–{formatTime(t.ora_fine)}</span>
                            {t.palestra && <span className="text-red-400 truncate">{t.palestra}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Doppio campionato: partite in conflitto */}
            {doppioConflictsAdmin.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> Doppio campionato — stesso giorno ({doppioConflictsAdmin.length})
                </p>
                <div className="space-y-2">
                  {doppioConflictsAdmin.map(({ data: dateStr, pair, partita_a, partita_b }, i) => (
                    <div key={i} className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-orange-700 mb-1.5">
                        {format(parseISO(dateStr), 'EEE d MMMM', { locale: it })}
                        {pair.note && <span className="ml-1 text-orange-400 font-normal">({pair.note})</span>}
                      </p>
                      {[partita_a, partita_b].map((p, j) => (
                        <div key={j} className="flex items-center gap-2 text-xs text-orange-700 bg-orange-100 rounded-lg px-2 py-1.5 mb-1">
                          <span className="font-medium">{p.squadra}</span>
                          {p.avversario && <span className="text-orange-500">vs {p.avversario}</span>}
                          {p.ora_inizio && <span className="text-orange-400 ml-auto">{formatTime(p.ora_inizio)}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </>)}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// NUOVA HOME — giocatori e allenatori (prossima gara + allenamenti settimana)
// ═══════════════════════════════════════════════════════════════════════════════

function NuovaHome({ user, profile, displayName, logout, societaNome, isAllenatore }) {
  const today     = new Date()
  const todayStr  = format(today, 'yyyy-MM-dd')
  const { societaId } = useAuth()
  const qc        = useQueryClient()

  // Per allenatori le squadre vengono dalla tabella allenatori, non dal profilo
  const { data: allenatoreRow } = useQuery({
    queryKey: ['my-allenatore', user?.email],
    enabled: isAllenatore && !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from('allenatori').select('nome, squadre_capo, squadre_vice')
        .eq('email', user.email).maybeSingle()
      return data
    },
  })

  const mySquadre = useMemo(() => {
    if (isAllenatore) {
      if (!allenatoreRow) return []
      return [...parseList(allenatoreRow.squadre_capo), ...parseList(allenatoreRow.squadre_vice)]
    }
    return [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)
  }, [isAllenatore, allenatoreRow, profile])

  const [selectedSquadra, setSelectedSquadra] = useState('')

  useEffect(() => {
    if (mySquadre.length && !selectedSquadra) setSelectedSquadra(mySquadre[0])
  }, [mySquadre])

  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])

  const { data: prossimeGare = [] } = useQuery({
    queryKey: ['prossime-gare', selectedSquadra, todayStr, societaId],
    enabled: !!selectedSquadra && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('calendario').select('*')
        .eq('squadra', selectedSquadra)
        .eq('societa_id', societaId)
        .gte('data', todayStr)
        .order('data').order('ora_inizio')
        .limit(2)
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: weekData, isLoading: weekLoading } = useWeekEvents(weekStart)

  const nextWeekStart = useMemo(() => addWeeks(weekStart, 1), [weekStart])
  const { data: nextWeekData, isLoading: nextWeekLoading } = useWeekEvents(nextWeekStart)

  const allenamenti = useMemo(() => {
    if (!weekData || !selectedSquadra) return []
    return (weekData.events ?? [])
      .filter(e =>
        e._tipo === 'allenamento' && !e.annullato &&
        (e.squadra ?? '').toLowerCase() === selectedSquadra.toLowerCase()
      )
      .sort((a, b) => (a.data + (a.ora_inizio ?? '')).localeCompare(b.data + (b.ora_inizio ?? '')))
  }, [weekData, selectedSquadra])

  const prossimiAllenamenti = useMemo(() => {
    if (!nextWeekData || !selectedSquadra) return []
    return (nextWeekData.events ?? [])
      .filter(e =>
        e._tipo === 'allenamento' && !e.annullato &&
        (e.squadra ?? '').toLowerCase() === selectedSquadra.toLowerCase()
      )
      .sort((a, b) => (a.data + (a.ora_inizio ?? '')).localeCompare(b.data + (b.ora_inizio ?? '')))
  }, [nextWeekData, selectedSquadra])

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

  if (!mySquadre.length) {
    return (
      <div className="pb-20">
        <Header
          title="Ciao!"
          subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName} logout={logout} societaNome={societaNome}
        />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Nessuna squadra assegnata al tuo profilo. Contatta l'amministratore.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">

      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-10 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🏀</span>
              <span className="font-bold text-lg">{societaNome ?? 'Gestionale Basket'}</span>
            </div>
            <p className="text-blue-200 text-sm capitalize mt-0.5">
              {format(today, 'EEEE d MMMM yyyy', { locale: it })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-sm font-semibold text-white truncate max-w-[130px] text-right">{displayName}</span>
            <div className="flex items-center gap-3">
              <CambiaPasswordButton />
              <button onClick={logout} className="flex items-center gap-1 text-xs text-blue-300 hover:text-white">
                <LogOut size={13} /> Esci
              </button>
            </div>
          </div>
        </div>

        {mySquadre.length > 1 && (
          <div className="mt-3">
            <select
              value={selectedSquadra}
              onChange={e => setSelectedSquadra(e.target.value)}
              className="w-full bg-blue-700 text-white border border-blue-400 rounded-lg px-3 py-2 text-sm"
            >
              {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Griglia due colonne */}
      <div className="px-4 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Prossima gara */}
        <div>
          <div className="bg-blue-500 text-white font-bold text-center py-3 rounded-t-xl text-sm tracking-wide">
            PROSSIMA GARA CAMPIONATO
          </div>
          <div className="border-2 border-blue-500 rounded-b-xl overflow-hidden bg-white">
            {prossimeGare.length === 0 ? (
              <div className="p-5 text-sm text-gray-400 text-center">Nessuna gara in programma</div>
            ) : (
              prossimeGare.map((p, i) => (
                <div key={p.id} className={`p-4 text-center ${i > 0 ? 'border-t border-blue-100' : ''}`}>
                  <p className="text-sm font-semibold text-gray-800 mb-1">
                    {format(parseISO(p.data), 'EEEE d MMMM', { locale: it }).toUpperCase()}
                  </p>
                  <p className="text-sm text-gray-700">
                    {p.squadra}{p.avversario ? ` vs ${p.avversario}` : ''}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {(p.casa_fuori ?? '') === 'Casa' ? 'Casa' : 'Trasferta'}
                  </p>
                  {p.ora_inizio && (
                    <p className="text-sm text-gray-600 mt-1">
                      {formatTime(p.ora_inizio)}{p.palestra ? ` · ${p.palestra}` : ''}
                    </p>
                  )}
                  {p.stato === 'provvisoria' && (
                    <p className="text-xs text-yellow-600 mt-1">⚠️ Provvisoria</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Allenamenti della settimana */}
        <div>
          <div className="bg-orange-500 text-white font-bold text-center py-3 rounded-t-xl text-sm tracking-wide">
            ALLENAMENTI DELLA SETTIMANA
          </div>
          <div className="border-2 border-orange-500 rounded-b-xl overflow-hidden bg-white">
            {weekLoading ? (
              <div className="p-4 flex justify-center"><LoadingSpinner /></div>
            ) : allenamenti.length === 0 ? (
              <div className="p-5 text-sm text-gray-400 text-center">Nessun allenamento questa settimana</div>
            ) : (
              allenamenti.map((e, i) => (
                <button
                  key={`${e._source}-${e.id ?? i}`}
                  onClick={() => isAllenatore ? setEditingEvent(e) : setSelectedEvent(e)}
                  className={`w-full p-4 text-center ${i > 0 ? 'border-t border-orange-100' : ''} active:bg-orange-50 transition-colors`}
                >
                  <p className="text-sm font-semibold text-gray-800 mb-1">
                    {format(parseISO(e.data), 'EEEE d MMMM', { locale: it }).toUpperCase()}
                  </p>
                  <p className="text-sm text-gray-700">{e.squadra}</p>
                  {e.ora_inizio && (
                    <p className="text-sm text-gray-600 mt-0.5">
                      {formatTime(e.ora_inizio)} – {formatTime(e.ora_fine)}{e.palestra ? ` · ${e.palestra}` : ''}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Allenamenti prossima settimana */}
      <div className="px-4 pt-2">
        <div className="bg-green-600 text-white font-bold text-center py-3 rounded-t-xl text-sm tracking-wide">
          ALLENAMENTI PROSSIMA SETTIMANA
        </div>
        <div className="border-2 border-green-600 rounded-b-xl overflow-hidden bg-white">
          {nextWeekLoading ? (
            <div className="p-4 flex justify-center"><LoadingSpinner /></div>
          ) : prossimiAllenamenti.length === 0 ? (
            <div className="p-5 text-sm text-gray-400 text-center">Nessun allenamento la prossima settimana</div>
          ) : (
            prossimiAllenamenti.map((e, i) => (
              <button
                key={`${e._source}-${e.id ?? i}`}
                onClick={() => isAllenatore ? setEditingEvent(e) : setSelectedEvent(e)}
                className={`w-full p-4 text-center ${i > 0 ? 'border-t border-green-100' : ''} active:bg-green-50 transition-colors`}
              >
                <p className="text-sm font-semibold text-gray-800 mb-1">
                  {format(parseISO(e.data), 'EEEE d MMMM', { locale: it }).toUpperCase()}
                </p>
                <p className="text-sm text-gray-700">{e.squadra}</p>
                {e.ora_inizio && (
                  <p className="text-sm text-gray-600 mt-0.5">
                    {formatTime(e.ora_inizio)} – {formatTime(e.ora_fine)}{e.palestra ? ` · ${e.palestra}` : ''}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* FAB allenatori */}
      {isAllenatore && (<>
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
          className={`fixed bottom-24 right-4 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all z-20 ${fabOpen ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {fabOpen ? <X size={24} /> : <Plus size={28} />}
        </button>
      </>)}

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
          showPresenza={!isAllenatore}
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

// ═══════════════════════════════════════════════════════════════════════════════
// ALLENATORE HOME — VECCHIA vista settimanale/mensile (non più usata)
// ═══════════════════════════════════════════════════════════════════════════════

function AllenatoreHome({ user, displayName, logout, societaNome }) {
  const [view,           setView]           = useState('settimana')
  const [weekOffset,     setWeekOffset]     = useState(0)
  const [monthOffset,    setMonthOffset]    = useState(0)
  const [editingEvent,   setEditingEvent]   = useState(null)
  const [editingDayEvs,  setEditingDayEvs]  = useState([])
  const [showAddForm,    setShowAddForm]    = useState(false)
  const [showAddPartita, setShowAddPartita] = useState(false)
  const [fabOpen,        setFabOpen]        = useState(false)
  const [selectedEvent,  setSelectedEvent]  = useState(null)
  const touchStartX = useRef(null)
  const qc = useQueryClient()
  const { societaId } = useAuth()

  const today = new Date()

  const weekStart = useMemo(
    () => startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )
  const weekDays = useMemo(
    () => getWeekDays(addWeeks(today, weekOffset)),
    [weekOffset]
  )
  const weekLabel = useMemo(() => {
    const s = format(weekDays[0], 'd MMM',      { locale: it })
    const e = format(weekDays[6], 'd MMM yyyy', { locale: it })
    return `${s} – ${e}`
  }, [weekDays])

  const currentMonthDate = useMemo(
    () => startOfMonth(addMonths(today, monthOffset)),
    [monthOffset]
  )
  const monthLabel = useMemo(
    () => format(currentMonthDate, 'MMMM yyyy', { locale: it }),
    [currentMonthDate]
  )

  const { data: myRow } = useQuery({
    queryKey: ['my-allenatore', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from('allenatori')
        .select('nome, squadre_capo, squadre_vice')
        .eq('email', user.email)
        .maybeSingle()
      return data
    },
  })

  const mySquadre = useMemo(() => {
    if (!myRow) return []
    return [...parseList(myRow.squadre_capo), ...parseList(myRow.squadre_vice)]
  }, [myRow])

  const { data: weekData,  isLoading: weekLoading  } = useWeekEvents(weekStart)
  const { data: monthData, isLoading: monthLoading } = useMonthEvents(currentMonthDate, view === 'mese')

  function filterMine(events) {
    if (!mySquadre.length) return events
    return events.filter(e =>
      mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
  }

  const displayWeekByDate = useMemo(() => {
    if (!weekData) return {}
    const filtered = filterMine(weekData.events ?? []).filter(e => !e.annullato)
    const byDate = {}
    for (const e of filtered) {
      if (!byDate[e.data]) byDate[e.data] = []
      byDate[e.data].push(e)
    }
    return byDate
  }, [weekData, mySquadre])

  const displayMonthEvents = useMemo(() => {
    if (!monthData) return []
    return filterMine(monthData.events ?? [])
  }, [monthData, mySquadre])

  const saveMut = useMutation({
    mutationFn: ({ event, formData }) => saveAllenamento(event, formData, societaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      setEditingEvent(null)
    },
  })

  const cancelMut = useMutation({
    mutationFn: (event) => annullaAllenamento(event, societaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weekEvents'] }),
  })

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) {
      if (view === 'settimana') setWeekOffset(w => w + (dx < 0 ? 1 : -1))
      else                      setMonthOffset(m => m + (dx < 0 ? 1 : -1))
    }
    touchStartX.current = null
  }

  const nome      = myRow?.nome ?? displayName
  const isLoading = view === 'settimana' ? weekLoading : monthLoading

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">

      {/* ── Sticky header ── */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">

        {/* Blue banner */}
        <div className="bg-blue-600 text-white px-4 pt-10 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🏀</span>
                <span className="font-bold text-lg">{societaNome ?? 'Gestionale Basket'}</span>
              </div>
              <p className="text-blue-100 text-base font-semibold mt-1">Ciao, {nome}! 👋</p>
              {mySquadre.length > 0 && (
                <p className="text-blue-200 text-sm mt-0.5">{mySquadre.join(' · ')}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-xs text-blue-200 text-right max-w-[120px] truncate">{displayName}</span>
              <div className="flex items-center gap-3">
                <CambiaPasswordButton />
                <button onClick={logout} className="flex items-center gap-1 text-xs text-blue-300 hover:text-white">
                  <LogOut size={13} /> Esci
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* View toggle */}
        <div className="px-4 pt-3 pb-1">
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
        </div>

        {/* Navigation */}
        <div
          className="flex items-center justify-between px-2 pb-2"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            onClick={() => view === 'settimana' ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <div className="text-center select-none">
            {view === 'settimana' ? (
              <>
                <div className="text-sm font-semibold text-gray-800">{weekLabel}</div>
                {weekOffset === 0 && <div className="text-xs text-blue-500 font-medium">Settimana corrente</div>}
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-gray-800 capitalize">{monthLabel}</div>
                {monthOffset === 0 && <div className="text-xs text-blue-500 font-medium">Mese corrente</div>}
              </>
            )}
          </div>
          <button
            onClick={() => view === 'settimana' ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1)}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <LoadingSpinner message="Caricamento..." />
      ) : view === 'settimana' ? (
        <div className="overflow-x-auto p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex" style={{ minWidth: 'max-content' }}>
            {weekDays.map((day, di) => {
              const dateStr   = format(day, 'yyyy-MM-dd')
              const isToday   = isDateToday(dateStr)
              const dayEvents = (displayWeekByDate[dateStr] ?? [])
                .sort((a, b) => (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? ''))
              const isLast = di === weekDays.length - 1

              return (
                <div key={dateStr}
                  className={`w-36 flex-shrink-0 ${!isLast ? 'border-r border-gray-200 mr-2 pr-1' : ''}`}
                >
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
                    dayEvents.map((event, i) => (
                      <AllenatoreEventCard
                        key={`${event._source}-${event.id ?? i}`}
                        event={event}
                        onClick={(ev) => {
                          setEditingEvent(ev)
                          setEditingDayEvs(weekData?.eventsByDate?.[dateStr] ?? [])
                        }}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="py-3">
          <AllenatoreMonthGrid
            key={monthLabel}
            monthDate={currentMonthDate}
            events={displayMonthEvents}
            onEventClick={setSelectedEvent}
          />
        </div>
      )}

      {/* FAB menu */}
      {fabOpen && (
        <div className="fixed bottom-40 right-4 flex flex-col gap-2 z-20 items-end">
          <button
            onClick={() => { setShowAddPartita(true); setFabOpen(false) }}
            className="flex items-center gap-2 bg-white text-gray-800 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium border border-gray-200 whitespace-nowrap active:scale-95 transition-transform"
          >
            🏀 Partita
          </button>
          <button
            onClick={() => { setShowAddForm(true); setFabOpen(false) }}
            className="flex items-center gap-2 bg-white text-gray-800 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium border border-gray-200 whitespace-nowrap active:scale-95 transition-transform"
          >
            🏋️ Allenamento
          </button>
        </div>
      )}
      {fabOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setFabOpen(false)} />
      )}
      <button
        onClick={() => setFabOpen(v => !v)}
        className={`fixed bottom-24 right-4 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all z-20 ${fabOpen ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'}`}
        aria-label="Aggiungi"
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

      {selectedEvent && !editingEvent && (
        <AllenatoreEventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {showAddForm && (
        <AllenatoreAddModal
          weekStart={weekStart}
          mySquadre={mySquadre}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {showAddPartita && (
        <AllenatoreAddPartitaModal
          mySquadre={mySquadre}
          onClose={() => setShowAddPartita(false)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENITORE / GIOCATORE HOME — vista settimanale + mensile per la propria squadra
// ═══════════════════════════════════════════════════════════════════════════════

export function GenitoreHome() {
  const { profile, displayName, logout, societaNome } = useAuth()
  const [view,          setView]          = useState('settimana')
  const [weekOffset,    setWeekOffset]    = useState(0)
  const [monthOffset,   setMonthOffset]   = useState(0)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [exportingICS,  setExportingICS]  = useState(false)
  const touchStartX = useRef(null)

  const today     = new Date()
  const mySquadra  = profile?.squadra  ?? null
  const mySquadra2 = profile?.squadra2 ?? null
  const mySquadra3 = profile?.squadra3 ?? null
  const mySquadre  = [mySquadra, mySquadra2, mySquadra3].filter(Boolean)

  const startDate = useMemo(
    () => startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )
  const weekDays = useMemo(
    () => getWeekDays(addWeeks(today, weekOffset)),
    [weekOffset]
  )
  const weekLabel = useMemo(() => {
    const s = format(weekDays[0], 'd MMM',      { locale: it })
    const e = format(weekDays[6], 'd MMM yyyy', { locale: it })
    return `${s} – ${e}`
  }, [weekDays])

  const currentMonthDate = useMemo(
    () => startOfMonth(addMonths(today, monthOffset)),
    [monthOffset]
  )
  const monthLabel = useMemo(
    () => format(currentMonthDate, 'MMMM yyyy', { locale: it }),
    [currentMonthDate]
  )

  const { data: weekData,  isLoading: weekLoading  } = useWeekEvents(startDate)
  const { data: monthData, isLoading: monthLoading } = useMonthEvents(currentMonthDate, view === 'mese')

  const displayWeekByDate = useMemo(() => {
    if (!weekData || !mySquadre.length) return {}
    const filtered = (weekData.events ?? []).filter(e =>
      mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
    const byDate = {}
    for (const e of filtered) {
      if (!byDate[e.data]) byDate[e.data] = []
      byDate[e.data].push(e)
    }
    return byDate
  }, [weekData, mySquadre])

  const displayMonthEvents = useMemo(() => {
    if (!monthData || !mySquadre.length) return []
    return (monthData.events ?? []).filter(e =>
      mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
  }, [monthData, mySquadre])

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) {
      if (view === 'settimana') setWeekOffset(w => w + (dx < 0 ? 1 : -1))
      else                      setMonthOffset(m => m + (dx < 0 ? 1 : -1))
    }
    touchStartX.current = null
  }

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
      const inMySq = (e) => mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
      const icsEvents = [
        ...(partite ?? []).filter(inMySq).map(partitaToEvent),
        ...(allMents ?? []).filter(inMySq).map(allenamentoToEvent),
      ]
      downloadICS(generateICS(icsEvents))
    } finally {
      setExportingICS(false)
    }
  }

  if (!mySquadre.length) {
    return (
      <div className="pb-20">
        <Header
          title="Ciao!"
          subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName}
          logout={logout}
          societaNome={societaNome}
        />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">
            ⚠️ Nessuna squadra assegnata al tuo profilo. Contatta l'amministratore.
          </p>
        </div>
      </div>
    )
  }

  const isLoading = view === 'settimana' ? weekLoading : monthLoading

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">

      {/* ── Sticky header ── */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">

        {/* Blue banner */}
        <div className="bg-blue-600 text-white px-4 pt-10 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🏀</span>
                <span className="font-bold text-lg">{societaNome ?? 'Gestionale Basket'}</span>
              </div>
              <p className="text-blue-100 text-base font-semibold mt-1">Ciao, {displayName}! 👋</p>
              <p className="text-blue-200 text-sm mt-0.5">
                {mySquadre.length === 1
                  ? <>La tua squadra: <strong>{mySquadre[0]}</strong></>
                  : <>Le tue squadre: <strong>{mySquadre.join(' · ')}</strong></>}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-xs text-blue-200 text-right max-w-[120px] truncate">{displayName}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportICS}
                  disabled={exportingICS}
                  title="Esporta calendario (.ics)"
                  className="flex items-center gap-1 text-xs text-blue-300 hover:text-white disabled:opacity-50"
                >
                  <Download size={13} /> .ics
                </button>
                <CambiaPasswordButton />
                <button onClick={logout} className="flex items-center gap-1 text-xs text-blue-300 hover:text-white">
                  <LogOut size={13} /> Esci
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* View toggle */}
        <div className="px-4 pt-3 pb-1">
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
        </div>

        {/* Navigation */}
        <div
          className="flex items-center justify-between px-2 pb-2"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            onClick={() => view === 'settimana' ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <div className="text-center select-none">
            {view === 'settimana' ? (
              <>
                <div className="text-sm font-semibold text-gray-800">{weekLabel}</div>
                {weekOffset === 0 && <div className="text-xs text-blue-500 font-medium">Settimana corrente</div>}
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-gray-800 capitalize">{monthLabel}</div>
                {monthOffset === 0 && <div className="text-xs text-blue-500 font-medium">Mese corrente</div>}
              </>
            )}
          </div>
          <button
            onClick={() => view === 'settimana' ? setWeekOffset(w => w + 1) : setMonthOffset(m => m + 1)}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2">
          {[
            { cls: 'bg-indigo-400', label: 'Allenamento' },
            { cls: 'bg-green-500',  label: 'Casa'        },
            { cls: 'bg-blue-500',   label: 'Trasferta'   },
            { cls: 'bg-yellow-400', label: 'Provvisoria' },
          ].map(({ cls, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${cls}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <LoadingSpinner message="Caricamento..." />
      ) : view === 'settimana' ? (
        <div className="overflow-x-auto p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
            {weekDays.map(day => {
              const dateStr   = format(day, 'yyyy-MM-dd')
              const isToday   = isDateToday(dateStr)
              const dayEvents = displayWeekByDate[dateStr] ?? []

              return (
                <div key={dateStr} className="w-36 flex-shrink-0">
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
                    dayEvents.map((event, i) => (
                      <AllenatoreEventCard
                        key={`${event._source}-${event.id ?? i}`}
                        event={event}
                        onClick={setSelectedEvent}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="py-3">
          <AllenatoreMonthGrid
            key={monthLabel}
            monthDate={currentMonthDate}
            events={displayMonthEvents}
            onEventClick={setSelectedEvent}
          />
        </div>
      )}

      {selectedEvent && (
        <AllenatoreEventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          showPresenza={true}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

export default function HomePage() {
  const { user, profile, displayName, logout, isAdmin, isAllenatore, societaNome } = useAuth()

  if (isAdmin) return <AdminHome displayName={displayName} logout={logout} societaNome={societaNome} />
  return (
    <NuovaHome
      user={user} profile={profile} displayName={displayName}
      logout={logout} societaNome={societaNome} isAllenatore={isAllenatore}
    />
  )
}
