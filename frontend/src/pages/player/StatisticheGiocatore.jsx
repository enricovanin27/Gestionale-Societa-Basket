import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '../../components/ui/card'

export default function StatisticheGiocatore() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()

  const { data: giocatoreRow } = useQuery({
    queryKey: ['giocatore-row', profile?.nome, profile?.cognome, societaId],
    enabled: !!(profile?.nome && profile?.cognome && societaId),
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra')
        .eq('nome', profile.nome)
        .eq('cognome', profile.cognome)
        .eq('societa_id', societaId)
        .maybeSingle()
      return data
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: presenze = [], isLoading } = useQuery({
    queryKey: ['presenze-giocatore', giocatoreRow?.id, societaId],
    enabled: !!giocatoreRow?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze')
        .select('presente, allenamento_id')
        .eq('giocatore_id', giocatoreRow.id)
        .eq('societa_id', societaId)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const stats = useMemo(() => {
    const totale   = presenze.length
    const presenti = presenze.filter(p => p.presente).length
    const perc     = totale > 0 ? Math.round((presenti / totale) * 100) : null
    return { totale, presenti, assenti: totale - presenti, perc }
  }, [presenze])

  return (
    <div>
      <AppHeader
        title="Le mie statistiche"
        subtitle={giocatoreRow?.squadra ?? ''}
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : !giocatoreRow ? (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">⚠️ Profilo giocatore non trovato. Contatta l'amministratore.</p>
        </div>
      ) : stats.totale === 0 ? (
        <div className="px-4 pt-6">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm font-semibold text-gray-700">Nessuna presenza registrata ancora</p>
              <p className="text-xs text-gray-400 mt-1">Le presenze vengono registrate dall'allenatore dopo ogni allenamento.</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Presenze',   value: stats.presenti, color: 'text-green-600' },
              { label: 'Assenze',    value: stats.assenti,  color: 'text-red-500'   },
              { label: '% Presenza', value: stats.perc !== null ? `${stats.perc}%` : '—', color: 'text-blue-600' },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="py-4 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="py-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Allenamenti registrati: {stats.totale}</p>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all"
                  style={{ width: `${stats.perc ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{stats.perc ?? 0}% di presenze</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
