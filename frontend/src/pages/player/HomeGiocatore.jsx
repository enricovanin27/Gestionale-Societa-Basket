import { useMemo, useRef, useState } from 'react'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatDate, isDateToday } from '../../lib/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'

export default function HomeGiocatore() {
  const { profile, displayName, logout, societaNome } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const touchStartX = useRef(null)

  const today = new Date()
  const mySquadra = profile?.squadra ?? null

  const thisWeekStart = useMemo(
    () => startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )
  const nextWeekStart = useMemo(() => addWeeks(thisWeekStart, 1), [thisWeekStart])

  const { data: thisWeekData, isLoading: l1 } = useWeekEvents(thisWeekStart)
  const { data: nextWeekData, isLoading: l2 } = useWeekEvents(nextWeekStart)

  function filterMine(events) {
    if (!mySquadra) return []
    return (events ?? []).filter(e =>
      e.squadra?.toLowerCase() === mySquadra.toLowerCase() && !e.annullato
    )
  }

  const agendaDays = useMemo(() => {
    const allEvents = [...filterMine(thisWeekData?.events), ...filterMine(nextWeekData?.events)]
    const byDate = {}
    for (const e of allEvents) {
      if (!byDate[e.data]) byDate[e.data] = []
      byDate[e.data].push(e)
    }
    return Array.from({ length: 14 }, (_, i) => {
      const dateStr = format(addDays(thisWeekStart, i), 'yyyy-MM-dd')
      return { dateStr, events: byDate[dateStr] ?? [] }
    })
  }, [thisWeekData, nextWeekData, mySquadra, thisWeekStart])

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

  if (!mySquadra) {
    return (
      <div>
        <AppHeader title="Ciao!" subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Nessuna squadra associata al tuo profilo.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <AppHeader
        title={`Ciao, ${displayName}! 👋`}
        subtitle={`La tua squadra: ${mySquadra}`}
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      <div className="bg-white border-b px-4 py-2 flex items-center justify-between"
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <button onClick={() => setWeekOffset(w => w - 2)}
          className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-800">{weekLabel}</div>
          {weekOffset === 0 && <div className="text-xs text-blue-600 font-medium">Prossimi 14 giorni</div>}
        </div>
        <button onClick={() => setWeekOffset(w => w + 2)}
          className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
          <ChevronRight size={20} className="text-gray-600" />
        </button>
      </div>

      {(l1 || l2) ? (
        <div className="pt-6"><LoadingSpinner /></div>
      ) : (
        <div className="pt-3 space-y-4 pb-4">
          {agendaDays.map(({ dateStr, events }) => {
            const isToday = isDateToday(dateStr)
            const label   = formatDate(dateStr, 'EEEE d MMMM')
            return (
              <section key={dateStr}>
                <div className="px-4 mb-2 flex items-center gap-2">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-blue-700 font-bold' : 'text-gray-400'}`}>
                    {label}
                  </span>
                  {isToday && <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">oggi</span>}
                </div>
                {events.length === 0 ? (
                  <div className="mx-4 text-sm text-gray-300 py-1">–</div>
                ) : (
                  <div className="px-4 space-y-2">
                    {events.map((e, i) => (
                      <EventCardPlayer key={`${e._source ?? 'e'}-${e.id ?? i}`} event={e} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EventCardPlayer({ event }) {
  const isPartita = event._tipo === 'partita'
  const isCasa    = (event.casa_fuori ?? '').toLowerCase() === 'casa'

  const styles = isPartita
    ? event.stato === 'provvisoria'
      ? { border: 'border-l-yellow-400', bg: 'bg-yellow-50',  label: '⚠️ Provvisoria', labelCls: 'bg-yellow-100 text-yellow-700' }
      : isCasa
        ? { border: 'border-l-green-500', bg: 'bg-green-50',  label: '🏠 Casa',        labelCls: 'bg-green-100 text-green-700'  }
        : { border: 'border-l-blue-500',  bg: 'bg-blue-50',   label: '✈️ Trasferta',   labelCls: 'bg-blue-100 text-blue-700'   }
    : { border: 'border-l-blue-400', bg: 'bg-blue-50', label: 'Allenamento', labelCls: 'bg-blue-100 text-blue-600' }

  return (
    <div className={`rounded-xl border-l-4 ${styles.border} ${styles.bg} px-4 py-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {isPartita && event.avversario ? `vs ${event.avversario}` : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-500">
            {event.ora_inizio && <span className="font-medium text-gray-700">{event.ora_inizio?.slice(0,5)}–{event.ora_fine?.slice(0,5)}</span>}
            {event.palestra && <span>{event.palestra}</span>}
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${styles.labelCls}`}>
          {styles.label}
        </span>
      </div>
    </div>
  )
}
