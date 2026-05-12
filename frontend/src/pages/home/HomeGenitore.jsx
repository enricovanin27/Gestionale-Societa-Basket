import { useState, useMemo, useRef } from 'react'
import { format, addDays, addWeeks, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatDate, isDateToday } from '../../lib/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { PALETTE } from '../../lib/constants'

export default function HomeGenitore() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()
  const [weekOffset,      setWeekOffset]      = useState(0)
  const [selectedSquadra, setSelectedSquadra] = useState('')
  const touchStartX = useRef(null)

  const today     = new Date()
  const mySquadre = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)
  const colorMap  = Object.fromEntries(mySquadre.map((s, i) => [s.toLowerCase(), PALETTE[i % PALETTE.length]]))

  const thisWeekStart = useMemo(
    () => startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )
  const nextWeekStart = useMemo(() => addWeeks(thisWeekStart, 1), [thisWeekStart])

  const { data: thisWeekData, isLoading: l1 } = useWeekEvents(thisWeekStart)
  const { data: nextWeekData, isLoading: l2 } = useWeekEvents(nextWeekStart)

  const thisWeekStr   = format(thisWeekStart, 'yyyy-MM-dd')
  const endDateStr    = format(addDays(thisWeekStart, 13), 'yyyy-MM-dd')

  const squadreFiltro = useMemo(
    () => selectedSquadra ? [selectedSquadra] : mySquadre,
    [selectedSquadra, mySquadre.join(',')]
  )

  const { data: annullati = [] } = useQuery({
    queryKey: ['annullati-parent', societaId, thisWeekStr, endDateStr, squadreFiltro.join(',')],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      if (!squadreFiltro.length) return []
      const { data } = await supabase
        .from('orario_settimana')
        .select('id, squadra, data, ora_inizio, ora_fine')
        .eq('societa_id', societaId)
        .eq('annullato', true)
        .gte('data', thisWeekStr)
        .lte('data', endDateStr)
        .in('squadra', squadreFiltro)
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  function filterMine(events) {
    return (events ?? []).filter(e =>
      !e.annullato &&
      squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
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
  }, [thisWeekData, nextWeekData, squadreFiltro, thisWeekStart])

  const variazioni = useMemo(() => {
    const allEvents = [
      ...(thisWeekData?.events ?? []),
      ...(nextWeekData?.events ?? []),
    ].filter(e => squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase()))
    return {
      spostati:      allEvents.filter(e => e._source === 'override'),
      aggiunti:      allEvents.filter(e => e._source === 'extra'),
      annullatiList: annullati,
    }
  }, [thisWeekData, nextWeekData, annullati, squadreFiltro])

  const hasVariazioni = variazioni.spostati.length > 0 || variazioni.aggiunti.length > 0 || variazioni.annullatiList.length > 0

  const weekLabel = useMemo(() => {
    const s = format(thisWeekStart, 'd MMM', { locale: it })
    const e = format(addDays(thisWeekStart, 13), 'd MMM yyyy', { locale: it })
    return `${s} - ${e}`
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
        <AppHeader title="Ciao!" subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">Nessuna squadra assegnata. Contatta l'amministratore.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <AppHeader
        title={`Ciao, ${displayName}!`}
        subtitle={mySquadre.length === 1 ? `La tua squadra: ${mySquadre[0]}` : `Le tue squadre: ${mySquadre.join(' - ')}`}
        displayName={displayName} logout={logout} societaNome={societaNome}
      >
        {mySquadre.length > 1 && (
          <div className="mt-3">
            <select
              value={selectedSquadra}
              onChange={e => setSelectedSquadra(e.target.value)}
              className="w-full bg-amber-700 text-white border border-amber-400 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Tutte le squadre</option>
              {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </AppHeader>

      <div className="bg-white border-b px-4 py-2 flex items-center justify-between"
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <button onClick={() => setWeekOffset(w => w - 2)}
          className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-800">{weekLabel}</div>
          {weekOffset === 0 && <div className="text-xs text-amber-600 font-medium">Prossimi 14 giorni</div>}
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
          {hasVariazioni && (
            <div className="mx-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-2">Variazioni settimana</p>
              {variazioni.annullatiList.map(v => (
                <div key={v.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-red-600">Annullato</span>
                    {' - '}{v.squadra}{' - '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.spostati.map(v => (
                <div key={`s-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-yellow-700">Spostato</span>
                    {' - '}{v.squadra}{' - '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.aggiunti.map(v => (
                <div key={`a-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-green-700">Aggiunto</span>
                    {' - '}{v.squadra}{' - '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {agendaDays.map(({ dateStr, events }) => {
            const isToday = isDateToday(dateStr)
            const label   = formatDate(dateStr, 'EEEE d MMMM')
            return (
              <section key={dateStr}>
                <div className="px-4 mb-2 flex items-center gap-2">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-amber-700' : 'text-gray-400'}`}>
                    {label}
                  </span>
                  {isToday && <span className="text-[9px] bg-amber-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">oggi</span>}
                </div>
                {events.length === 0 ? (
                  <div className="mx-4 text-sm text-gray-300 py-1">-</div>
                ) : (
                  <div className="px-4 space-y-2">
                    {events.map(e => (
                      <EventCardParent key={`${e._source}-${e.id}`} event={e} colorMap={colorMap} />
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

function EventCardParent({ event, colorMap }) {
  const isPartita = event._tipo === 'partita'
  const isCasa    = (event.casa_fuori ?? '').toLowerCase() === 'casa'
  const pal       = colorMap[(event.squadra ?? '').toLowerCase()] ?? PALETTE[0]

  const borderCls = isPartita ? pal.gameBorder : pal.border
  const bgCls     = isPartita ? pal.gameBg     : pal.bg
  const labelCls  = isPartita
    ? event.stato === 'provvisoria' ? 'bg-yellow-100 text-yellow-700'
      : isCasa ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
    : `${pal.bg} ${pal.title}`
  const label = isPartita
    ? event.stato === 'provvisoria' ? 'Provvisoria'
      : isCasa ? 'Casa' : 'Trasferta'
    : 'Allenamento'

  return (
    <div className={`rounded-xl border-l-4 ${borderCls} ${bgCls} px-4 py-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${pal.title}`}>
            {isPartita && event.avversario ? `vs ${event.avversario}` : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-500">
            {event.ora_inizio && <span className="font-medium text-gray-700">{event.ora_inizio.slice(0,5)}-{event.ora_fine?.slice(0,5)}</span>}
            {event.palestra && <span>{event.palestra}</span>}
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${labelCls}`}>
          {label}
        </span>
      </div>
    </div>
  )
}
