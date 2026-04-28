import { useMemo } from 'react'
import { format, endOfWeek, eachDayOfInterval } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useWeekEvents } from '../hooks/useWeekEvents'
import LoadingSpinner from './LoadingSpinner'

const PALETTE = [
  { bg: 'bg-blue-50',   title: 'text-blue-900'   },
  { bg: 'bg-green-50',  title: 'text-green-900'  },
  { bg: 'bg-purple-50', title: 'text-purple-900' },
  { bg: 'bg-orange-50', title: 'text-orange-900' },
  { bg: 'bg-teal-50',   title: 'text-teal-900'   },
  { bg: 'bg-rose-50',   title: 'text-rose-900'   },
  { bg: 'bg-indigo-50', title: 'text-indigo-900' },
  { bg: 'bg-amber-50',  title: 'text-amber-900'  },
]

const NO_PAL = '—'

function getColor(squadra, allSquadre) {
  const idx = allSquadre.indexOf(squadra)
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length]
}

function safeDate(dateStr) { return new Date(dateStr + 'T12:00:00') }
function hhmm(t) { return String(t ?? '').slice(0, 5) }
function timeToMin(t) { const [h, m] = hhmm(t).split(':').map(Number); return h * 60 + m }
function minToHhmm(m) { return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}` }

function buildRenderMap(events, palestre, slots) {
  return palestre.map(pal => {
    const palEv    = pal === NO_PAL
      ? events.filter(e => !e.palestra?.trim())
      : events.filter(e => e.palestra?.trim() === pal)
    const occupied = new Array(slots.length).fill(false)
    return slots.map((slot, si) => {
      if (occupied[si]) return { type: 'skip' }
      const slotMin  = timeToMin(slot)
      const starting = palEv.filter(e => {
        const start = timeToMin(e.ora_inizio)
        return start >= slotMin && start < slotMin + 30
      })
      if (starting.length) {
        const maxEnd = Math.max(...starting.map(e => timeToMin(e.ora_fine)))
        const endSi  = slots.findIndex(s => timeToMin(s) >= maxEnd)
        const span   = Math.max(1, (endSi < 0 ? slots.length : endSi) - si)
        for (let s = si + 1; s < si + span; s++) if (s < slots.length) occupied[s] = true
        return { type: 'event', events: starting, span }
      }
      return { type: 'empty' }
    })
  })
}

export default function GrigliaSettimanale({ weekStart, allSquadre, dateFilter = null }) {
  const weekEnd  = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart])
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd])

  const { data: weekData, isLoading } = useWeekEvents(weekStart)

  const { data: palestreOrder = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome)
    },
    staleTime: 10 * 60 * 1000,
  })

  const daysData = useMemo(() => {
    if (!weekData) return []
    return weekDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const events  = (weekData.eventsByDate?.[dateStr] ?? [])
        .filter(e => e._tipo === 'allenamento' && !e.annullato)
      const usedSet       = new Set(events.map(e => e.palestra?.trim()).filter(Boolean))
      const hasNoPalestra = events.some(e => !e.palestra?.trim())
      const palestre = [
        ...palestreOrder.filter(p => usedSet.has(p)),
        ...[...usedSet].filter(p => !palestreOrder.includes(p)).sort(),
        ...(hasNoPalestra ? [NO_PAL] : []),
      ]
      return { dateStr, day, events, palestre }
    })
  }, [weekData, weekDays, palestreOrder])

  const activeDays = useMemo(
    () => daysData.filter(d => d.palestre.length > 0 && (!dateFilter || d.dateStr === dateFilter)),
    [daysData, dateFilter]
  )

  const slots = useMemo(() => {
    const all = activeDays.flatMap(d => d.events)
    if (!all.length) return []
    const minMin = Math.floor(Math.min(...all.map(e => timeToMin(e.ora_inizio))) / 30) * 30
    const maxMin = Math.ceil( Math.max(...all.map(e => timeToMin(e.ora_fine)))   / 30) * 30
    const s = []
    for (let m = minMin; m < maxMin; m += 30) s.push(minToHhmm(m))
    return s
  }, [activeDays])

  const renderMap = useMemo(
    () => activeDays.map(d => buildRenderMap(d.events, d.palestre, slots)),
    [activeDays, slots]
  )

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  if (isLoading) return <LoadingSpinner message="Caricamento griglia..." />

  if (activeDays.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <span className="text-4xl block mb-3">🏟️</span>
        <p className="text-sm">Nessun allenamento {dateFilter ? 'oggi' : 'questa settimana'}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto -mx-4">
      <table
        className="border-collapse text-xs"
        style={{ minWidth: activeDays.reduce((s, d) => s + d.palestre.length * 88, 0) + 44 }}
      >
        <thead>
          <tr>
            <th rowSpan={2}
              className="sticky left-0 z-20 bg-white border-b-2 border-r border-gray-200"
              style={{ width: 44, minWidth: 44 }}
            />
            {activeDays.map(({ dateStr, palestre }) => (
              <th key={dateStr} colSpan={palestre.length}
                className={`px-2 py-1.5 text-center font-bold border border-gray-300 capitalize tracking-wide ${
                  dateStr === todayStr ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'
                }`}
                style={{ minWidth: palestre.length * 88 }}>
                {format(safeDate(dateStr), 'EEEE d MMM', { locale: it })}
              </th>
            ))}
          </tr>
          <tr>
            {activeDays.flatMap(({ palestre }) =>
              palestre.map(p => (
                <th key={p}
                  className="px-1 py-1 text-center font-semibold text-gray-600 bg-gray-100 border border-gray-200 uppercase tracking-wider"
                  style={{ minWidth: 88 }}>
                  {p === NO_PAL ? '(nessuna)' : p}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, si) => (
            <tr key={slot} className={si % 2 === 0 ? 'border-t border-gray-200' : ''}>
              <td className="sticky left-0 z-10 bg-white border-r border-gray-200 text-right pr-1.5 text-gray-400 font-mono align-top"
                style={{ width: 44, minWidth: 44, paddingTop: 3 }}>
                {si % 2 === 0 ? slot : ''}
              </td>
              {activeDays.flatMap(({ palestre }, di) =>
                palestre.map((_, pi) => {
                  const cell = renderMap[di]?.[pi]?.[si]
                  if (!cell || cell.type === 'skip') return null
                  if (cell.type === 'empty') {
                    return (
                      <td key={`${di}-${pi}`}
                        className="border border-gray-100 bg-gray-50"
                        style={{ minWidth: 88, height: 22 }}
                      />
                    )
                  }
                  return (
                    <td key={`${di}-${pi}`}
                      rowSpan={cell.span}
                      className="border border-gray-200 px-1 pt-1 pb-0.5 align-top"
                      style={{ minWidth: 88, verticalAlign: 'top' }}>
                      {cell.events.map((e, i) => {
                        const col = getColor(e.squadra, allSquadre)
                        return (
                          <div key={i} className={`rounded px-1.5 py-1 leading-snug ${col.bg} ${col.title} ${i > 0 ? 'mt-1' : ''}`}>
                            <div className="font-bold text-xs">{e.squadra}</div>
                            <div className="text-xs opacity-75">{hhmm(e.ora_inizio)}–{hhmm(e.ora_fine)}</div>
                            {e.allenatori && (
                              <div className="text-xs opacity-60 truncate">{e.allenatori}</div>
                            )}
                            {String(e.condivisione).toUpperCase() === 'SI' && (
                              <div className="text-xs text-violet-600 font-medium">Condivisione</div>
                            )}
                          </div>
                        )
                      })}
                    </td>
                  )
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
