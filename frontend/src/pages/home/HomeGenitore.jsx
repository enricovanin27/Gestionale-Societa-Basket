import { useState, useMemo, useRef } from 'react'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatDate, isDateToday } from '../../lib/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { AllenatoreEventModal, DaySection, SectionTitle } from './shared'

export default function HomeGenitore() {
  const { profile, displayName, logout, societaNome } = useAuth()
  const [weekOffset,    setWeekOffset]    = useState(0)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const touchStartX = useRef(null)

  const today    = new Date()
  const mySquadre = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)

  const CHILD_COLORS = [
    { border: 'border-l-amber-500', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-800' },
    { border: 'border-l-blue-500',  bg: 'bg-blue-50',  badge: 'bg-blue-100 text-blue-800'  },
    { border: 'border-l-green-500', bg: 'bg-green-50', badge: 'bg-green-100 text-green-800' },
  ]
  const squadraColor = Object.fromEntries(
    mySquadre.map((s, i) => [s.toLowerCase(), CHILD_COLORS[i % CHILD_COLORS.length]])
  )

  const thisWeekStart = useMemo(
    () => startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )
  const nextWeekStart = useMemo(() => addWeeks(thisWeekStart, 1), [thisWeekStart])

  const { data: thisWeekData, isLoading: loadingThis } = useWeekEvents(thisWeekStart)
  const { data: nextWeekData, isLoading: loadingNext } = useWeekEvents(nextWeekStart)

  const isLoading = loadingThis || loadingNext

  function filterMine(events) {
    if (!mySquadre.length) return []
    return (events ?? []).filter(e =>
      mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
  }

  const agendaDays = useMemo(() => {
    const allEvents = [
      ...filterMine(thisWeekData?.events),
      ...filterMine(nextWeekData?.events),
    ].filter(e => !e.annullato)

    const byDate = {}
    for (const e of allEvents) {
      if (!byDate[e.data]) byDate[e.data] = []
      byDate[e.data].push(e)
    }

    // Build 14-day array
    return Array.from({ length: 14 }, (_, i) => {
      const dateStr = format(addDays(thisWeekStart, i), 'yyyy-MM-dd')
      return { dateStr, events: byDate[dateStr] ?? [] }
    })
  }, [thisWeekData, nextWeekData, mySquadre, thisWeekStart])

  const weekLabel = useMemo(() => {
    const s = format(thisWeekStart, 'd MMM', { locale: it })
    const e = format(addDays(thisWeekStart, 13), 'd MMM yyyy', { locale: it })
    return `${s} – ${e}`
  }, [thisWeekStart])

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) setWeekOffset(w => w + (dx < 0 ? 2 : -2))
    touchStartX.current = null
  }

  if (!mySquadre.length) {
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
          <p className="text-sm text-amber-700">
            ⚠️ Nessuna squadra assegnata al tuo profilo. Contatta l'amministratore.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">

      <AppHeader
        title={`Ciao, ${displayName}! 👋`}
        subtitle={mySquadre.length === 1
          ? `La tua squadra: ${mySquadre[0]}`
          : `Le tue squadre: ${mySquadre.join(' · ')}`}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {/* Navigation */}
      <div
        className="bg-white border-b px-4 py-2 flex items-center justify-between"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button
          onClick={() => setWeekOffset(w => w - 2)}
          className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200"
        >
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-800">{weekLabel}</div>
          {weekOffset === 0 && (
            <div className="text-xs text-amber-600 font-medium">Prossimi 14 giorni</div>
          )}
        </div>
        <button
          onClick={() => setWeekOffset(w => w + 2)}
          className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200"
        >
          <ChevronRight size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Agenda */}
      {isLoading ? (
        <div className="pt-6"><LoadingSpinner /></div>
      ) : (
        <div className="pt-3 space-y-4 pb-4">
          {agendaDays.map(({ dateStr, events }) => {
            const today  = isDateToday(dateStr)
            const label  = formatDate(dateStr, 'EEEE d MMMM')
            const heading = (
              <div className={`px-4 mb-2 flex items-center gap-2 ${today ? 'font-bold text-amber-700' : ''}`}>
                <span className={`text-xs font-semibold uppercase tracking-wider ${today ? 'text-amber-700' : 'text-gray-400'}`}>
                  {label}
                </span>
                {today && (
                  <span className="text-[9px] bg-amber-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">oggi</span>
                )}
              </div>
            )

            return (
              <section key={dateStr}>
                {heading}
                {events.length === 0 ? (
                  <div className="mx-4 text-sm text-gray-300 py-1">–</div>
                ) : (
                  <div className="px-4 space-y-2">
                    {events.map((e, i) => (
                      <button
                        key={`${e._source ?? 'e'}-${e.id ?? i}`}
                        className="w-full text-left"
                        onClick={() => setSelectedEvent(e)}
                      >
                        <EventCard
                          event={e}
                          squadraColor={squadraColor}
                          showBadge={mySquadre.length > 1}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
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

function EventCard({ event, squadraColor, showBadge }) {
  const isPartita = event._tipo === 'partita'
  const colors = squadraColor?.[event.squadra?.toLowerCase()] ?? { border: 'border-l-amber-400', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-800' }

  let borderColor = colors.border
  let bgColor     = colors.bg
  let typeLabel   = 'Allenamento'
  let labelCls    = 'bg-white border border-gray-200 text-gray-500'

  if (isPartita) {
    if (event.stato === 'provvisoria') {
      borderColor = 'border-l-yellow-400'; bgColor = 'bg-yellow-50'; typeLabel = '⚠️ Provvisoria'
      labelCls = 'bg-yellow-100 text-yellow-700'
    } else if ((event.casa_fuori ?? '').toLowerCase() === 'casa') {
      borderColor = 'border-l-green-500'; bgColor = 'bg-green-50'; typeLabel = '🏠 Casa'
      labelCls = 'bg-green-100 text-green-700'
    } else {
      borderColor = 'border-l-blue-500'; bgColor = 'bg-blue-50'; typeLabel = '✈️ Trasferta'
      labelCls = 'bg-blue-100 text-blue-700'
    }
  }

  return (
    <div className={`rounded-xl border-l-4 ${borderColor} ${bgColor} px-4 py-3 shadow-sm active:scale-[0.99] transition-transform`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {isPartita && event.avversario
              ? `${event.squadra} vs ${event.avversario}`
              : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
            {event.ora_inizio && (
              <span className="font-medium text-gray-700">
                {event.ora_inizio?.slice(0, 5)}–{event.ora_fine?.slice(0, 5)}
              </span>
            )}
            {event.palestra && <span>{event.palestra}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${labelCls}`}>
            {typeLabel}
          </span>
          {showBadge && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${colors.badge}`}>
              {event.squadra}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
