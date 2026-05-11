import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, BarChart2, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import PageHeader from '../components/PageHeader'

const TIPO_LABELS = { infortunio: 'Infortunio', sospeso: 'Sospeso', altro: 'Altro' }
const TIPO_COLORS = {
  infortunio: 'bg-red-100 text-red-700',
  sospeso:    'bg-orange-100 text-orange-700',
  altro:      'bg-gray-100 text-gray-600',
}

export default function StatistichePage({ embedded = false }) {
  const { societaId, isAdmin, squadreAllenatore } = useAuth()
  const [refDate, setRefDate] = useState(new Date())

  const monthStart = format(startOfMonth(refDate), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(refDate),   'yyyy-MM-dd')
  const todayStr   = format(new Date(), 'yyyy-MM-dd')

  const { data: giocatori = [] } = useQuery({
    queryKey: ['stat-giocatori', societaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3')
        .eq('attivo', true)
        .order('cognome')
      return data ?? []
    },
    enabled: !!societaId,
    staleTime: 5 * 60 * 1000,
  })

  // Fonte unica: presenze_allenamento per il mese selezionato.
  // allenamentiPerSquadra = distinct (squadra, data) → quante sedute coperte da registro presenze.
  // presenzePerGiocatore  = conteggio righe con presente=true.
  const { data: presenzeAl = [] } = useQuery({
    queryKey: ['stat-presenze-al', societaId, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('giocatore_id, squadra, data, presente')
        .gte('data', monthStart)
        .lte('data', monthEnd)
      return data ?? []
    },
    enabled: !!societaId,
  })

  const { data: infortuni = [] } = useQuery({
    queryKey: ['stat-infortuni', societaId, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from('indisponibilita')
        .select('*, giocatori(nome, cognome, squadra)')
        .lte('data_inizio', todayStr)
        .or(`data_fine.is.null,data_fine.gte.${todayStr}`)
        .order('data_inizio')
      return data ?? []
    },
    enabled: !!societaId,
  })

  const filteredGiocatori = useMemo(() => {
    if (isAdmin || !squadreAllenatore?.length) return giocatori
    return giocatori.filter(g =>
      squadreAllenatore.some(s => s === g.squadra || s === g.squadra2 || s === g.squadra3)
    )
  }, [giocatori, isAdmin, squadreAllenatore])

  const allenamentiPerSquadra = useMemo(() => {
    const map = {}
    const seen = new Set()
    for (const a of presenzeAl) {
      const key = `${a.squadra}|${a.data}`
      if (seen.has(key)) continue
      seen.add(key)
      map[a.squadra] = (map[a.squadra] ?? 0) + 1
    }
    return map
  }, [presenzeAl])

  const presenzePerGiocatore = useMemo(() => {
    const counts = {}
    for (const p of presenzeAl) {
      if (p.presente) counts[p.giocatore_id] = (counts[p.giocatore_id] ?? 0) + 1
    }
    return counts
  }, [presenzeAl])

  const giocatoriPerSquadra = useMemo(() => {
    const groups = {}
    for (const g of filteredGiocatori) {
      const sq = g.squadra || 'Senza squadra'
      if (!groups[sq]) groups[sq] = []
      groups[sq].push(g)
    }
    return groups
  }, [filteredGiocatori])

  const monthSelector = (
    <div className="flex items-center gap-2 mb-4">
      <button onClick={() => setRefDate(d => subMonths(d, 1))}
        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
        <ChevronLeft size={18} />
      </button>
      <span className="flex-1 text-center text-sm font-semibold text-gray-800 capitalize">
        {format(refDate, 'MMMM yyyy', { locale: it })}
      </span>
      <button onClick={() => setRefDate(d => addMonths(d, 1))}
        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
        <ChevronRight size={18} />
      </button>
    </div>
  )

  const body = (
    <div className="space-y-6">
      {infortuni.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Infortuni / Indisponibili ora
          </h2>
          <div className="space-y-2">
            {infortuni.map(i => (
              <div key={i.id} className="bg-white border border-red-100 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {i.giocatori?.cognome} {i.giocatori?.nome}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TIPO_COLORS[i.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TIPO_LABELS[i.tipo] ?? i.tipo}
                    </span>
                    {i.giocatori?.squadra && (
                      <span className="text-xs text-gray-400">{i.giocatori.squadra}</span>
                    )}
                  </div>
                  {i.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{i.note}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">
                    Dal {new Date(i.data_inizio).toLocaleDateString('it-IT')}
                    {i.data_fine
                      ? ` al ${new Date(i.data_fine).toLocaleDateString('it-IT')}`
                      : ' · data fine non impostata'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {Object.entries(giocatoriPerSquadra)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([squadra, lista]) => {
          const totAl = allenamentiPerSquadra[squadra] ?? 0
          return (
            <section key={squadra}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{squadra}</h2>
                <span className="text-xs text-gray-400">
                  {totAl} allenament{totAl === 1 ? 'o' : 'i'}
                </span>
              </div>
              {totAl === 0 ? (
                <p className="text-xs text-gray-400 italic px-1">
                  Nessuna presenza registrata in questo mese (apri l'allenamento e registra le presenze).
                </p>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {lista
                    .sort((a, b) => a.cognome.localeCompare(b.cognome))
                    .map((g, idx) => {
                      const pres  = presenzePerGiocatore[g.id] ?? 0
                      const pct   = Math.round((pres / totAl) * 100)
                      const color = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                      const textColor = pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'
                      return (
                        <div key={g.id}
                          className={`flex items-center gap-3 px-3 py-2.5 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                          <p className="flex-1 text-sm font-medium text-gray-900 truncate">
                            {g.cognome} {g.nome}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-10 text-right">{pres}/{totAl}</span>
                            <span className={`text-xs font-bold w-9 text-right ${textColor}`}>{pct}%</span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </section>
          )
        })}

      {filteredGiocatori.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <BarChart2 size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessun giocatore trovato</p>
        </div>
      )}
    </div>
  )

  if (embedded) {
    return (
      <div className="pb-4">
        {monthSelector}
        {body}
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <PageHeader title="Statistiche" />
      <div className="bg-white border-b shadow-sm">
        <div className="px-4 py-2">{monthSelector}</div>
      </div>
      <div className="p-4">{body}</div>
    </div>
  )
}
