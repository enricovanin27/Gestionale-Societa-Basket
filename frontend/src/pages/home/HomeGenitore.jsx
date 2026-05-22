import { useState, useMemo } from 'react'
import { format, addDays, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { PALETTE } from '../../lib/constants'

export default function HomeGenitore() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()
  const [selectedSquadra, setSelectedSquadra] = useState('')

  const today      = new Date()
  const todayStr   = format(today, 'yyyy-MM-dd')
  const mySquadre = useMemo(() => {
    const genSquadre = [profile?.genitore_squadra, profile?.genitore_squadra2, profile?.genitore_squadra3].filter(Boolean)
    return genSquadre.length > 0 ? genSquadre : [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)
  }, [profile])
  const colorMap = useMemo(
    () => Object.fromEntries(mySquadre.map((s, i) => [s.toLowerCase(), PALETTE[i % PALETTE.length]])),
    [mySquadre]
  )

  const thisWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])
  const thisWeekStr   = format(thisWeekStart, 'yyyy-MM-dd')
  const weekEndStr    = format(addDays(thisWeekStart, 6), 'yyyy-MM-dd')

  const squadreFiltro = useMemo(
    () => selectedSquadra ? [selectedSquadra] : mySquadre,
    [selectedSquadra, mySquadre]
  )

  const { data: weekData, isLoading } = useWeekEvents(thisWeekStart)

  const { data: annullati = [] } = useQuery({
    queryKey: ['annullati-parent', societaId, thisWeekStr, weekEndStr, squadreFiltro.join(',')],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      if (!squadreFiltro.length) return []
      const { data } = await supabase
        .from('orario_settimana')
        .select('id, squadra, data, ora_inizio, ora_fine')
        .eq('societa_id', societaId)
        .eq('annullato', true)
        .gte('data', thisWeekStr)
        .lte('data', weekEndStr)
        .in('squadra', squadreFiltro)
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  const { data: quoteAperte = [] } = useQuery({
    queryKey: ['genitore-quote-aperte', societaId, mySquadre],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      const { data: gio } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .in('squadra', mySquadre)
        .eq('societa_id', societaId)
        .eq('attivo', true)
      if (!gio?.length) return []
      const { data: q } = await supabase
        .from('quote')
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza')
        .in('giocatore_id', gio.map(g => g.id))
        .eq('societa_id', societaId)
        .eq('pagato', false)
        .order('data_scadenza', { nullsFirst: false })
      const gioMap = Object.fromEntries((gio ?? []).map(g => [g.id, g]))
      return (q ?? []).map(q => ({ ...q, giocatore: gioMap[q.giocatore_id] }))
    },
    staleTime: 5 * 60 * 1000,
  })

  const variazioni = useMemo(() => {
    const allEvents = (weekData?.events ?? [])
      .filter(e => squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase()))
    return {
      spostati:      allEvents.filter(e => e._source === 'override'),
      aggiunti:      allEvents.filter(e => e._source === 'extra'),
      annullatiList: annullati,
    }
  }, [weekData, annullati, selectedSquadra, mySquadre.join(',')])

  const hasVariazioni = variazioni.spostati.length > 0 || variazioni.aggiunti.length > 0 || variazioni.annullatiList.length > 0

  const todayEvents = useMemo(() =>
    (weekData?.eventsByDate?.[todayStr] ?? [])
      .filter(e => !e.annullato && squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())),
    [weekData, todayStr, squadreFiltro]
  )

  if (!mySquadre.length) {
    return (
      <div>
        <AppHeader title="Ciao!" subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">Nessuna squadra assegnata. Contatta l'amministratore.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <AppHeader
        title={`Ciao, ${displayName}! 👋`}
        subtitle={mySquadre.join(' · ')}
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

      {isLoading ? (
        <div className="pt-6"><LoadingSpinner /></div>
      ) : (
        <div className="pt-3 space-y-4 pb-24">
          {hasVariazioni && (
            <div className="mx-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-2">📌 Variazioni settimana</p>
              {variazioni.annullatiList.map(v => (
                <div key={v.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-red-600">Annullato</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.spostati.map(v => (
                <div key={`s-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-yellow-700">Spostato</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.aggiunti.map(v => (
                <div key={`a-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-green-700">Aggiunto</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {quoteAperte.length > 0 && (
            <div className="mx-4 bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-[11px] font-bold text-red-800 uppercase tracking-wide mb-2">💰 Quote non pagate ({quoteAperte.length})</p>
              {quoteAperte.slice(0, 3).map(q => (
                <div key={q.id} className="flex items-center justify-between py-1 border-b border-red-100 last:border-0">
                  <div>
                    <p className="text-xs font-medium text-gray-800">
                      {q.giocatore ? `${q.giocatore.cognome} ${q.giocatore.nome}` : '—'}
                    </p>
                    <p className="text-xs text-gray-500">{q.descrizione ?? q.tipo}</p>
                  </div>
                  <span className="text-xs font-bold text-red-600 ml-3">€{q.importo}</span>
                </div>
              ))}
              {quoteAperte.length > 3 && (
                <p className="text-xs text-gray-400 mt-1.5">+{quoteAperte.length - 3} altre quote...</p>
              )}
            </div>
          )}

          <section className="px-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                {format(today, 'EEEE d MMMM', { locale: it })}
              </span>
              <span className="text-[9px] bg-amber-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">oggi</span>
            </div>
            {todayEvents.length === 0 ? (
              <p className="text-sm text-gray-300 py-1">Nessun evento oggi</p>
            ) : (
              <div className="space-y-2">
                {todayEvents.map(e => (
                  <EventCardParent key={`${e._source}-${e.id}`} event={e} colorMap={colorMap} />
                ))}
              </div>
            )}
          </section>
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
    ? event.stato === 'provvisoria' ? '⚠️ Provvisoria'
      : isCasa ? '🏠 Casa' : '✈️ Trasferta'
    : 'Allenamento'

  return (
    <div className={`rounded-xl border-l-4 ${borderCls} ${bgCls} px-4 py-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${pal.title}`}>
            {isPartita && event.avversario ? `vs ${event.avversario}` : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-500">
            {event.ora_inizio && <span className="font-medium text-gray-700">{event.ora_inizio.slice(0,5)}–{event.ora_fine?.slice(0,5)}</span>}
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
