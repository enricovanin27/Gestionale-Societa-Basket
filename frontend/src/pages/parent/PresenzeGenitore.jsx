import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function PresenzeGenitore() {
  const { user, societaId, displayName, logout, societaNome } = useAuth()
  const [refDate, setRefDate]             = useState(new Date())
  const [selectedFiglioId, setSelected]   = useState(null)

  const monthStart = format(startOfMonth(refDate), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(refDate),   'yyyy-MM-dd')

  // Figli collegati tramite genitore_user_id
  const { data: figli = [], isLoading: loadingFigli } = useQuery({
    queryKey: ['figli-genitore', societaId, user?.id],
    enabled: !!societaId && !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra')
        .eq('societa_id', societaId)
        .eq('genitore_user_id', user.id)
        .eq('attivo', true)
        .order('cognome')
      return data ?? []
    },
  })

  // Figlio attivo: selezionato o primo della lista
  const figlioId = selectedFiglioId ?? figli[0]?.id ?? null
  const figlio   = figli.find(f => f.id === figlioId) ?? null

  // Presenze del mese per il figlio selezionato
  const { data: presenzeMese = [], isLoading: loadingMese } = useQuery({
    queryKey: ['presenze-figlio-mese', figlioId, societaId, monthStart, monthEnd],
    enabled: !!figlioId,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('data, presente, squadra')
        .eq('giocatore_id', figlioId)
        .eq('societa_id', societaId)
        .gte('data', monthStart)
        .lte('data', monthEnd)
        .order('data', { ascending: false })
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  // Totali stagione
  const { data: presenzeAll = [] } = useQuery({
    queryKey: ['presenze-figlio-totali', figlioId, societaId],
    enabled: !!figlioId,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('presente')
        .eq('giocatore_id', figlioId)
        .eq('societa_id', societaId)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const statsMese = useMemo(() => {
    const totale   = presenzeMese.length
    const presenti = presenzeMese.filter(p => p.presente).length
    const perc     = totale > 0 ? Math.round((presenti / totale) * 100) : null
    return { totale, presenti, assenti: totale - presenti, perc }
  }, [presenzeMese])

  const statsStagione = useMemo(() => {
    const totale   = presenzeAll.length
    const presenti = presenzeAll.filter(p => p.presente).length
    const perc     = totale > 0 ? Math.round((presenti / totale) * 100) : null
    return { totale, presenti, perc }
  }, [presenzeAll])

  const percColor = (pct) =>
    pct === null ? 'text-gray-400' :
    pct >= 75    ? 'text-green-600' :
    pct >= 50    ? 'text-yellow-600' : 'text-red-500'

  const barColor = (pct) =>
    (pct ?? 0) >= 75 ? 'bg-green-500' :
    (pct ?? 0) >= 50 ? 'bg-yellow-400' : 'bg-red-400'

  const subtitle = figlio
    ? `${figlio.cognome} ${figlio.nome}${figlio.squadra ? ` · ${figlio.squadra}` : ''}`
    : 'Presenze'

  return (
    <div>
      <AppHeader
        title="Presenze"
        subtitle={subtitle}
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      {loadingFigli ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : figli.length === 0 ? (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-amber-500" />
            <p className="text-sm font-semibold text-amber-700">Nessun figlio collegato</p>
          </div>
          <p className="text-xs text-amber-600 leading-relaxed">
            Contatta la segreteria per collegare il tuo account al profilo di tuo figlio.
          </p>
        </div>
      ) : (
        <div className="pb-24">
          {/* Selettore figlio — visibile solo con più figli */}
          {figli.length > 1 && (
            <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto">
              {figli.map(f => (
                <button key={f.id}
                  onClick={() => setSelected(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                    f.id === figlioId
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {f.nome} {f.cognome}
                </button>
              ))}
            </div>
          )}

          {/* Selettore mese */}
          <div className="bg-white border-b border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3">
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
          </div>

          {loadingMese ? (
            <div className="pt-8"><LoadingSpinner /></div>
          ) : (
            <div className="px-4 pt-4 space-y-4">
              {statsMese.totale > 0 ? (
                <>
                  {/* Cards stats mese */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 py-4 text-center shadow-sm">
                      <p className="text-2xl font-bold text-green-600">{statsMese.presenti}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Presenze</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 py-4 text-center shadow-sm">
                      <p className="text-2xl font-bold text-red-500">{statsMese.assenti}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Assenze</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 py-4 text-center shadow-sm">
                      <p className={`text-2xl font-bold ${percColor(statsMese.perc)}`}>
                        {statsMese.perc !== null ? `${statsMese.perc}%` : '—'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">Questo mese</p>
                    </div>
                  </div>

                  {/* Progress bar + totale stagione */}
                  <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-700">
                        {statsMese.presenti} / {statsMese.totale} allenamenti
                      </p>
                      {statsStagione.totale > 0 && (
                        <span className="text-xs text-gray-400">
                          Stagione: {statsStagione.presenti}/{statsStagione.totale} ({statsStagione.perc}%)
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all ${barColor(statsMese.perc)}`}
                        style={{ width: `${statsMese.perc ?? 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Lista sessioni */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 capitalize">
                      Sessioni di {format(refDate, 'MMMM', { locale: it })}
                    </p>
                    <div className="space-y-2">
                      {presenzeMese.map((p, i) => (
                        <div key={i} className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                          p.presente ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
                        }`}>
                          <div>
                            <p className="text-sm font-medium text-gray-900 capitalize">
                              {format(new Date(p.data + 'T12:00:00'), 'EEEE d MMMM', { locale: it })}
                            </p>
                            {p.squadra && <p className="text-xs text-gray-500">{p.squadra}</p>}
                          </div>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                            p.presente ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {p.presente ? '✓ Presente' : '✗ Assente'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center shadow-sm">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm font-semibold text-gray-700">Nessuna presenza registrata questo mese</p>
                  <p className="text-xs text-gray-400 mt-1">Naviga ai mesi precedenti per vedere lo storico.</p>
                  {statsStagione.totale > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        Totale stagione: <strong className={percColor(statsStagione.perc)}>
                          {statsStagione.presenti}/{statsStagione.totale} ({statsStagione.perc}%)
                        </strong>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
