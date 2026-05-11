import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronLeft, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { PALETTE } from '../../lib/constants'

function getTeamColor(squadra, allSquadre) {
  const idx = allSquadre.indexOf(squadra)
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length]
}

function PercentualeBadge({ pct }) {
  if (pct === null) return <span className="text-xs text-gray-300 font-medium">—</span>
  const color =
    pct >= 75 ? 'bg-green-100 text-green-700' :
    pct >= 50 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${color}`}>
      {pct}%
    </span>
  )
}

function SquadraDetail({ squadra, allSquadre, onBack }) {
  const { societaId } = useAuth()
  const col = getTeamColor(squadra, allSquadre)

  const { data: giocatoriPresenze = [], isLoading, error } = useQuery({
    queryKey: ['presenze-admin', squadra, societaId],
    enabled: !!squadra && !!societaId,
    queryFn: async () => {
      const { data: giocatori, error: ge } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .eq('squadra', squadra)
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      if (ge) throw ge
      if (!giocatori.length) return []

      const { data: presenze, error: pe } = await supabase
        .from('presenze')
        .select('giocatore_id, presente')
        .in('giocatore_id', giocatori.map(g => g.id))
      if (pe) throw pe

      return giocatori.map(g => {
        const gp = (presenze ?? []).filter(p => p.giocatore_id === g.id)
        const totali = gp.length
        const presenti = gp.filter(p => p.presente).length
        return {
          ...g,
          totali,
          presenti,
          percentuale: totali > 0 ? Math.round(presenti * 100 / totali) : null,
        }
      })
    },
    staleTime: 2 * 60 * 1000,
  })

  return (
    <div>
      <div className={`flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100 border-l-4 ${col.border}`}>
        <button onClick={onBack} className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-gray-800 text-sm">{squadra}</span>
      </div>

      {isLoading && <div className="pt-8"><LoadingSpinner /></div>}
      {error && <p className="text-sm text-red-500 px-4 pt-4">{error.message}</p>}

      {!isLoading && !error && (
        <div className="px-4 pt-4 pb-4 space-y-2">
          {giocatoriPresenze.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">Nessun giocatore attivo in questa squadra</p>
          )}
          {giocatoriPresenze.map(g => (
            <div
              key={g.id}
              className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-gray-800">{g.cognome} {g.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {g.totali > 0
                    ? `${g.presenti} presenze su ${g.totali}`
                    : 'Nessun dato registrato'}
                </p>
              </div>
              <PercentualeBadge pct={g.percentuale} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PresenzeAdmin() {
  const { displayName, logout, societaNome, societaId } = useAuth()
  const [selectedSquadra, setSelectedSquadra] = useState(null)

  const { data: squadre = [], isLoading } = useQuery({
    queryKey: ['squadre-nomi', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="pb-20">
      <AppHeader
        title="Presenze"
        subtitle={selectedSquadra ?? 'Seleziona una squadra'}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {selectedSquadra ? (
        <SquadraDetail
          squadra={selectedSquadra}
          allSquadre={squadre}
          onBack={() => setSelectedSquadra(null)}
        />
      ) : (
        <div className="px-4 pt-4 space-y-2">
          {isLoading && <div className="pt-8"><LoadingSpinner /></div>}
          {squadre.map((s) => {
            const col = getTeamColor(s, squadre)
            return (
              <button
                key={s}
                onClick={() => setSelectedSquadra(s)}
                className={`w-full bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 px-4 py-3.5 border-l-4 ${col.border} active:scale-[0.99] transition-transform text-left`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${col.bg}`}>
                  <Users size={15} className={col.title} />
                </div>
                <span className="flex-1 font-semibold text-sm text-gray-800">{s}</span>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
          {!isLoading && squadre.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">Nessuna squadra configurata</p>
          )}
        </div>
      )}
    </div>
  )
}
