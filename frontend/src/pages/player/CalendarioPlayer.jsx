import { useState, useMemo } from 'react'
import { format, addWeeks, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import LoadingSpinner from '../../components/LoadingSpinner'
import { PALETTE } from '../../lib/constants'

function hhmm(t) { return String(t ?? '').slice(0, 5) }

function getColor(squadra, mySquadre) {
  const idx = mySquadre.indexOf(squadra)
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length]
}

export default function CalendarioPlayer() {
  const { profile } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)

  const mySquadre = useMemo(
    () => [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean),
    [profile]
  )

  const weekStart = useMemo(
    () => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )
  const weekEnd  = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart])
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd])

  const weekLabel = useMemo(() => {
    const s = format(weekStart, 'd MMM', { locale: it })
    const e = format(weekEnd,   'd MMM yyyy', { locale: it })
    return `${s} – ${e}`
  }, [weekStart, weekEnd])

  const { data: weekData, isLoading } = useWeekEvents(weekStart)
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  if (!mySquadre.length) {
    return (
      <div>
        <PageHeader title="Calendario" />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Nessuna squadra associata al tuo profilo.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <PageHeader title="Calendario">
        <div className="px-4 pb-3 flex items-center gap-3">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-xl active:scale-95 transition-transform"
          >
            <ChevronLeft size={18} className="text-white" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-sm font-medium text-amber-100">{weekLabel}</p>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs text-amber-300 mt-0.5 hover:text-white active:opacity-70"
              >
                ↩ Settimana corrente
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-xl active:scale-95 transition-transform"
          >
            <ChevronRight size={18} className="text-white" />
          </button>
        </div>
      </PageHeader>

      <div className="px-4 pt-3 pb-24">
        {isLoading ? (
          <LoadingSpinner message="Caricamento..." />
        ) : (
          weekDays.map(day => {
            const dateStr  = format(day, 'yyyy-MM-dd')
            const isToday  = dateStr === todayStr
            const dayEvents = (weekData?.eventsByDate?.[dateStr] ?? [])
              .filter(e => !e.annullato && (e._tipo === 'allenamento' || e._tipo === 'partita'))
              .filter(e => mySquadre.includes(e.squadra))

            return (
              <div key={dateStr} className="mb-3">
                {/* Day header */}
                <div className={`flex items-center gap-2 mb-1.5 ${dayEvents.length === 0 ? 'opacity-35' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    isToday ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${
                    isToday ? 'text-blue-600' : 'text-gray-500'
                  }`}>
                    {format(day, 'EEEE', { locale: it })}
                  </p>
                  {isToday && (
                    <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">Oggi</span>
                  )}
                </div>

                {dayEvents.length === 0 ? (
                  <div className="ml-10 text-xs text-gray-300 pb-1">–</div>
                ) : (
                  <div className="ml-10 space-y-1.5">
                    {dayEvents.map((e, i) => {
                      const col       = getColor(e.squadra, mySquadre)
                      const isPartita = e._tipo === 'partita'
                      return (
                        <div
                          key={`${e._source ?? 'ev'}-${e.id ?? i}`}
                          className={`rounded-xl px-3 py-2.5 border-l-4 shadow-sm ${
                            isPartita
                              ? `${col.gameBg} ${col.gameBorder}`
                              : `bg-white ${col.border}`
                          }`}
                        >
                          {isPartita && (
                            <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-70 ${col.title}`}>Gara</p>
                          )}
                          <p className={`text-sm font-semibold ${col.title}`}>
                            {isPartita ? (e.avversario ? `vs ${e.avversario}` : 'Partita') : e.squadra}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {hhmm(e.ora_inizio)}–{hhmm(e.ora_fine)}
                            {e.palestra ? ` · ${e.palestra}` : ''}
                          </p>
                          {isPartita && e.casa_fuori && (
                            <p className="text-xs text-gray-400">{e.casa_fuori}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
