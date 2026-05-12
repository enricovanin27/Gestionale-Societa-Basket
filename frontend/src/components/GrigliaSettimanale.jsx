import { useMemo } from 'react'
import { format, endOfWeek, eachDayOfInterval } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useWeekEvents } from '../hooks/useWeekEvents'
import LoadingSpinner from './LoadingSpinner'
import { PALETTE, GIORNI, GIORNO_FULL as GIORNI_LABEL } from '../lib/constants'

const NO_PAL = '—'
const SEP_TH = 'bg-gray-300 border-gray-300'
const SEP_TD = 'bg-gray-200'

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
    const palEv = pal === NO_PAL
      ? events.filter(e => !e.palestra?.trim())
      : events.filter(e => e.palestra?.trim() === pal)

    // Pre-compute which events start in each slot
    const slotStarts = slots.map(slot => {
      const slotMin = timeToMin(slot)
      return palEv.filter(e => {
        const start = timeToMin(e.ora_inizio)
        return start >= slotMin && start < slotMin + 30
      })
    })

    const occupied = new Array(slots.length).fill(false)

    return slots.map((slot, si) => {
      // Skip if occupied by a rowspan above AND no new events start here
      if (occupied[si] && slotStarts[si].length === 0) return { type: 'skip' }

      const starting = slotStarts[si]
      if (starting.length) {
        const maxEnd = Math.max(...starting.map(e => timeToMin(e.ora_fine)))
        let endSi = slots.findIndex((s, idx) => idx > si && timeToMin(s) >= maxEnd)
        if (endSi < 0) endSi = slots.length

        // Truncate span if a new event starts during this span, so it stays visible
        let truncEndSi = endSi
        for (let idx = si + 1; idx < endSi; idx++) {
          if (slotStarts[idx].length > 0) { truncEndSi = idx; break }
        }

        const span = Math.max(1, truncEndSi - si)
        for (let s = si + 1; s < si + span; s++) if (s < slots.length) occupied[s] = true
        return { type: 'event', events: starting, span }
      }
      return { type: 'empty' }
    })
  })
}

// ─── Shared table renderer ────────────────────────────────────────────────────
function GrigliaTable({ activeDays, slots, renderMap, allSquadre, getDayHeader }) {
  if (activeDays.length === 0) return null

  return (
    <div className="overflow-x-auto -mx-4">
      <table
        className="border-collapse text-xs"
        style={{ minWidth: activeDays.reduce((s, d) => s + d.palestre.length * 88, 0) + 44 + (activeDays.length - 1) * 6 }}
      >
        <thead>
          <tr>
            <th rowSpan={2}
              className="sticky left-0 z-20 bg-white border-b-2 border-r border-gray-200"
              style={{ width: 44, minWidth: 44 }}
            />
            {activeDays.flatMap(({ palestre }, di) => [
              di > 0
                ? <th key={`sep-hd-${di}`} rowSpan={2} className={SEP_TH} style={{ width: 6, minWidth: 6, padding: 0 }} />
                : null,
              <th key={getDayHeader(di).key} colSpan={palestre.length}
                className={`px-2 py-1.5 text-center font-bold border border-gray-300 capitalize tracking-wide ${getDayHeader(di).today ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'}`}
                style={{ minWidth: palestre.length * 88 }}>
                {getDayHeader(di).label}
              </th>,
            ].filter(Boolean))}
          </tr>
          <tr>
            {activeDays.flatMap(({ palestre }, di) =>
              palestre.map((p, pi) => (
                <th key={`${di}-${p}-${pi}`}
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
              {activeDays.flatMap(({ palestre }, di) => [
                di > 0
                  ? <td key={`sep-bd-${di}-${si}`} className={SEP_TD} style={{ width: 6, minWidth: 6, padding: 0 }} />
                  : null,
                ...palestre.map((_, pi) => {
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
                        const isPartita = e._tipo === 'partita'
                        return (
                          <div key={i} className={`rounded px-1.5 py-1 leading-snug ${isPartita ? col.gameBg : col.bg} ${col.title} ${i > 0 ? 'mt-1' : ''}`}>
                            {isPartita && (
                              <div className="text-[9px] font-bold uppercase tracking-wide opacity-70 mb-0.5">Gara</div>
                            )}
                            <div className="font-bold text-xs">
                              {isPartita ? (e.avversario ? `vs ${e.avversario}` : 'Partita') : e.squadra}
                            </div>
                            <div className="text-xs opacity-75">{hhmm(e.ora_inizio)}–{hhmm(e.ora_fine)}</div>
                            {!isPartita && e.allenatori && (
                              <div className="text-xs opacity-60 truncate">{e.allenatori}</div>
                            )}
                            {!isPartita && String(e.condivisione).toUpperCase() === 'SI' && (
                              <div className="text-xs text-violet-600 font-medium">Condivisione</div>
                            )}
                            {isPartita && e.casa_fuori && (
                              <div className="text-xs opacity-60">{e.casa_fuori}</div>
                            )}
                          </div>
                        )
                      })}
                    </td>
                  )
                }),
              ].filter(Boolean))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── GrigliaSettimanale (settimana corrente/prossima/oggi) ───────────────────
export default function GrigliaSettimanale({ weekStart, allSquadre, dateFilter = null, squadreFilter = null }) {
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
        .filter(e => !e.annullato && (e._tipo === 'allenamento' || e._tipo === 'partita'))
        .filter(e => !squadreFilter?.length || squadreFilter.includes(e.squadra))
      const usedSet       = new Set(events.map(e => e.palestra?.trim()).filter(Boolean))
      const hasNoPalestra = events.some(e => !e.palestra?.trim())
      const palestre = [
        ...palestreOrder.filter(p => usedSet.has(p)),
        ...[...usedSet].filter(p => !palestreOrder.includes(p)).sort(),
        ...(hasNoPalestra ? [NO_PAL] : []),
      ]
      return { dateStr, day, events, palestre }
    })
  }, [weekData, weekDays, palestreOrder, squadreFilter])

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
    <GrigliaTable
      activeDays={activeDays}
      slots={slots}
      renderMap={renderMap}
      allSquadre={allSquadre}
      getDayHeader={(di) => ({
        key:   activeDays[di].dateStr,
        label: format(safeDate(activeDays[di].dateStr), 'EEEE d MMM', { locale: it }),
        today: activeDays[di].dateStr === todayStr,
      })}
    />
  )
}

// ─── GrigliaTipo (settimana tipo — orario_fisso) ──────────────────────────────
export function GrigliaTipo({ squadraFilter = '', allenatoreFilter = '', palestraFilter = '' }) {
  const { data: fisso = [], isLoading } = useQuery({
    queryKey: ['orario-fisso-full'],
    queryFn: async () => {
      const { data } = await supabase.from('orario_fisso').select('*').order('giorno').order('ora_inizio')
      return data ?? []
    },
  })

  const { data: palestreOrder = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(p => p.nome)
    },
    staleTime: 10 * 60 * 1000,
  })

  const allSquadre = useMemo(
    () => [...new Set(fisso.map(r => r.squadra).filter(Boolean))].sort(),
    [fisso]
  )

  const filtered = useMemo(() => fisso
    .filter(r => !squadraFilter || r.squadra === squadraFilter)
    .filter(r => !allenatoreFilter || (r.allenatori ?? '').split(',').some(a => a.trim().toLowerCase().includes(allenatoreFilter.toLowerCase())))
    .filter(r => !palestraFilter || r.palestra === palestraFilter),
    [fisso, squadraFilter, allenatoreFilter, palestraFilter]
  )

  const daysData = useMemo(() => GIORNI.map(giorno => {
    const events = filtered.filter(r => r.giorno === giorno)
    const usedSet = new Set(events.map(e => e.palestra?.trim()).filter(Boolean))
    const hasNoPalestra = events.some(e => !e.palestra?.trim())
    const palestre = [
      ...palestreOrder.filter(p => usedSet.has(p)),
      ...[...usedSet].filter(p => !palestreOrder.includes(p)).sort(),
      ...(hasNoPalestra ? [NO_PAL] : []),
    ]
    return { giorno, label: GIORNI_LABEL[giorno], events, palestre }
  }), [filtered, palestreOrder])

  const activeDays = useMemo(() => daysData.filter(d => d.palestre.length > 0), [daysData])

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

  if (isLoading) return <LoadingSpinner message="Caricamento griglia tipo..." />

  if (activeDays.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <span className="text-4xl block mb-3">🏟️</span>
        <p className="text-sm">Nessun allenamento fisso configurato</p>
      </div>
    )
  }

  return (
    <GrigliaTable
      activeDays={activeDays}
      slots={slots}
      renderMap={renderMap}
      allSquadre={allSquadre}
      getDayHeader={(di) => ({
        key:   activeDays[di].giorno,
        label: activeDays[di].label,
        today: false,
      })}
    />
  )
}
