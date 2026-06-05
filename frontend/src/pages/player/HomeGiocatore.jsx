import { useState, useMemo } from 'react'
import { format, addDays, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { PALETTE } from '../../lib/constants'

export default function HomeGiocatore() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()
  const [selectedSquadra, setSelectedSquadra] = useState('')

  const today      = new Date()
  const todayStr   = format(today, 'yyyy-MM-dd')
  const mySquadre  = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)
  const colorMap   = Object.fromEntries(mySquadre.map((s, i) => [s.toLowerCase(), PALETTE[i % PALETTE.length]]))

  const thisWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])
  const thisWeekStr   = format(thisWeekStart, 'yyyy-MM-dd')
  const weekEndStr    = format(addDays(thisWeekStart, 6), 'yyyy-MM-dd')

  const squadreFiltro = useMemo(
    () => selectedSquadra ? [selectedSquadra] : mySquadre,
    [selectedSquadra, mySquadre.join(',')]
  )

  const { data: weekData, isLoading } = useWeekEvents(thisWeekStart)

  const qc = useQueryClient()
  const [rpeSelezionato, setRpeSelezionato] = useState(null)
  const [rpeSalvato, setRpeSalvato] = useState(false)

  const { data: mioGiocatore } = useQuery({
    queryKey: ['mio-giocatore', societaId, profile?.id],
    enabled: !!societaId && !!profile?.id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, squadra')
        .eq('societa_id', societaId)
        .eq('user_id', profile.id)
        .maybeSingle()
      return data
    },
  })

  const { data: rpeOggi } = useQuery({
    queryKey: ['rpe-oggi', mioGiocatore?.id, todayStr],
    enabled: !!mioGiocatore?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('rpe_sessioni').select('id, valore_rpe')
        .eq('giocatore_id', mioGiocatore.id)
        .eq('data', todayStr)
        .eq('tipo_sessione', 'allenamento')
        .maybeSingle()
      return data
    },
  })

  const rpeInsertMut = useMutation({
    mutationFn: async (valore) => {
      const { error } = await supabase.from('rpe_sessioni').insert({
        giocatore_id: mioGiocatore.id,
        data: todayStr,
        tipo_sessione: 'allenamento',
        valore_rpe: valore,
        societa_id: societaId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rpe-oggi', mioGiocatore?.id] })
      setRpeSalvato(true)
    },
  })

  const { data: annullati = [] } = useQuery({
    queryKey: ['annullati-player', societaId, thisWeekStr, weekEndStr, squadreFiltro.join(',')],
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

  const { data: schedeAssegnate = [] } = useQuery({
    queryKey: ['schede-giocatore', mioGiocatore?.id, societaId],
    enabled: !!mioGiocatore?.id && !!societaId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data } = await supabase
        .from('schede_assegnazioni')
        .select('*, scheda:scheda_id(nome, categoria, esercizi)')
        .eq('societa_id', societaId)
        .or(`giocatore_id.eq.${mioGiocatore.id},squadra.eq.${mioGiocatore.squadra}`)
        .lte('data_inizio', today)
        .or(`data_fine.is.null,data_fine.gte.${today}`)
      return data ?? []
    },
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

  const allenamentiOggi = useMemo(() => {
    if (!weekData?.eventsByDate) return []
    return (weekData.eventsByDate[todayStr] ?? []).filter(e =>
      e._tipo === 'allenamento' &&
      !e.annullato &&
      mySquadre.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())
    )
  }, [weekData, todayStr, mySquadre.join(',')])

  const showRpeBox = !!mioGiocatore && allenamentiOggi.length > 0 && !rpeOggi && !rpeSalvato

  if (!mySquadre.length) {
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
        subtitle={mySquadre.join(' · ')}
        displayName={displayName} logout={logout} societaNome={societaNome}
      >
        {mySquadre.length > 1 && (
          <div className="mt-3">
            <select
              value={selectedSquadra}
              onChange={e => setSelectedSquadra(e.target.value)}
              className="w-full bg-blue-700 text-white border border-blue-400 rounded-lg px-3 py-2 text-sm"
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
          {showRpeBox && (
            <div className="mx-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="font-bold text-amber-900 text-sm mb-0.5">Come ti sei sentito oggi?</div>
              <div className="text-xs text-gray-500 mb-3">
                Allenamento {allenamentiOggi[0]?.squadra} · {format(today, 'EEEE d MMMM', { locale: it })}
              </div>
              <div className="flex justify-center gap-1.5 mb-3 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                  const isSelected = rpeSelezionato === n
                  const color = n <= 3
                    ? isSelected ? 'bg-green-500 border-green-600 text-white' : 'bg-green-100 border-green-300 text-green-700'
                    : n <= 7
                    ? isSelected ? 'bg-yellow-400 border-yellow-500 text-white' : 'bg-yellow-100 border-yellow-300 text-yellow-700'
                    : isSelected ? 'bg-red-500 border-red-600 text-white' : 'bg-red-100 border-red-300 text-red-700'
                  return (
                    <button key={n}
                      onClick={() => setRpeSelezionato(n)}
                      className={`w-8 h-8 rounded-full border-2 text-xs font-bold transition-all ${color} ${isSelected ? 'scale-110 shadow-md' : ''}`}>
                      {n}
                    </button>
                  )
                })}
              </div>
              {rpeSelezionato && (
                <button
                  onClick={() => rpeInsertMut.mutate(rpeSelezionato)}
                  disabled={rpeInsertMut.isPending}
                  className="w-full py-2.5 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                  {rpeInsertMut.isPending ? 'Salvataggio...' : `Salva RPE — ${rpeSelezionato}`}
                </button>
              )}
            </div>
          )}

          {rpeSalvato && (
            <div className="mx-4 bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
              <div className="text-green-700 font-semibold text-sm">RPE registrato ✓</div>
              <div className="text-xs text-green-500 mt-0.5">Grazie! I dati sono stati inviati al preparatore.</div>
            </div>
          )}

          {schedeAssegnate.length > 0 && (
            <div className="mx-4 space-y-2">
              {schedeAssegnate.map(ass => (
                <div key={ass.id} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm text-gray-900">{ass.scheda?.nome}</div>
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold capitalize">
                      {ass.scheda?.categoria}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {(ass.scheda?.esercizi ?? []).map((es, i) => (
                      <div key={i} className="bg-amber-50 rounded-lg px-3 py-2">
                        <div className="text-xs font-semibold text-gray-800">{es.nome}</div>
                        <div className="text-xs text-gray-500">
                          {es.serie && `${es.serie} serie`}
                          {es.reps && ` × ${es.reps} reps`}
                          {es.carico && ` @ ${es.carico} kg`}
                          {es.note && <span className="text-gray-400"> — {es.note}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

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

          <section className="px-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                {format(today, 'EEEE d MMMM', { locale: it })}
              </span>
              <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">oggi</span>
            </div>
            {todayEvents.length === 0 ? (
              <p className="text-sm text-gray-300 py-1">Nessun evento oggi</p>
            ) : (
              <div className="space-y-2">
                {todayEvents.map(e => (
                  <EventCardPlayer key={`${e._source}-${e.id}`} event={e} colorMap={colorMap} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function EventCardPlayer({ event, colorMap }) {
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
