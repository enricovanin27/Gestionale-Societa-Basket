import { useMemo } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'

function scadenzaStatus(dataScadenza) {
  const today = new Date()
  if (!dataScadenza) return { label: 'Nessuna scadenza', cls: 'bg-gray-100 text-gray-500' }
  const diff = differenceInDays(parseISO(dataScadenza), today)
  if (diff < 0)  return { label: `Scaduta ${-diff}gg fa`, cls: 'bg-red-100 text-red-700' }
  if (diff < 14) return { label: `Scade in ${diff}gg`,   cls: 'bg-orange-100 text-orange-700' }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-yellow-50 text-yellow-700' }
}

export default function QuoteGenitore() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()
  const mySquadre = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-squadre', societaId, mySquadre],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra')
        .eq('societa_id', societaId)
        .in('squadra', mySquadre)
        .eq('attivo', true)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const giocatoreIds = useMemo(() => giocatori.map(g => g.id), [giocatori])
  const giocatoreMap = useMemo(
    () => Object.fromEntries(giocatori.map(g => [g.id, g])),
    [giocatori]
  )

  const { data: quote = [], isLoading } = useQuery({
    queryKey: ['quote-genitore', societaId, giocatoreIds],
    enabled: !!societaId && giocatoreIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza, pagato')
        .eq('societa_id', societaId)
        .in('giocatore_id', giocatoreIds)
        .order('pagato')
        .order('data_scadenza', { nullsFirst: false })
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const daPagare = quote.filter(q => !q.pagato)
  const pagate   = quote.filter(q => q.pagato)

  return (
    <div className="pb-4">
      <AppHeader
        title="Le mie quote"
        subtitle="Pagamenti e scadenze"
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : mySquadre.length === 0 ? (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Nessuna squadra associata al tuo profilo.</p>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-4">

          {daPagare.length === 0 && pagate.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-gray-400">
                Nessuna quota registrata.
              </CardContent>
            </Card>
          )}

          {daPagare.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Da pagare ({daPagare.length})</p>
              <div className="space-y-3">
                {daPagare.map(q => {
                  const g = giocatoreMap[q.giocatore_id]
                  const sc = scadenzaStatus(q.data_scadenza)
                  return (
                    <div key={q.id} className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-orange-400 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {q.descrizione ?? q.tipo}
                          </p>
                          {g && (
                            <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                              {g.nome} {g.cognome} · {g.squadra}
                            </span>
                          )}
                        </div>
                        <p className="text-lg font-bold text-gray-900">
                          €{q.importo ? Number(q.importo).toFixed(0) : '—'}
                        </p>
                      </div>
                      {q.data_scadenza && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sc.cls}`}>
                          {sc.label}
                        </span>
                      )}
                      <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                        💳 Paga in segreteria oppure tramite bonifico bancario.<br />
                        Causale: <strong>{q.descrizione ?? q.tipo} — {g ? `${g.nome} ${g.cognome}` : ''}</strong>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {pagate.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Già pagate</p>
              <div className="space-y-2">
                {pagate.map(q => {
                  const g = giocatoreMap[q.giocatore_id]
                  return (
                    <div key={q.id} className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-green-400 p-3 opacity-70">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">{q.descrizione ?? q.tipo}</p>
                          {g && <p className="text-xs text-gray-400">{g.nome} {g.cognome} · {g.squadra}</p>}
                        </div>
                        <p className="text-sm font-bold text-green-600">✓ €{q.importo ? Number(q.importo).toFixed(0) : '—'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
