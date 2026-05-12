import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight, ChevronLeft, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'N/D', cls: 'bg-gray-100 text-gray-500', urgente: false }
  const diff = differenceInDays(parseISO(dataScadenza), new Date())
  if (diff < 0)  return { label: 'Scaduto',    cls: 'bg-red-100 text-red-700',    urgente: true }
  if (diff < 30) return { label: `${diff}gg`,  cls: 'bg-orange-100 text-orange-700', urgente: true }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-green-100 text-green-700', urgente: false }
}

export default function GiocatoriPage() {
  const { societaId, displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()
  const [selectedSquadra, setSelectedSquadra] = useState(null)

  const { data: giocatori = [], isLoading } = useQuery({
    queryKey: ['segreteria-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, cert_medico_scadenza')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const squadre = useMemo(() => {
    const set = new Set()
    for (const g of giocatori) {
      if (g.squadra)  set.add(g.squadra)
      if (g.squadra2) set.add(g.squadra2)
      if (g.squadra3) set.add(g.squadra3)
    }
    return [...set].sort()
  }, [giocatori])

  const giocatoriFiltrati = useMemo(() => {
    if (!selectedSquadra) return []
    return giocatori.filter(g =>
      g.squadra === selectedSquadra || g.squadra2 === selectedSquadra || g.squadra3 === selectedSquadra
    )
  }, [giocatori, selectedSquadra])

  const header = (
    <AppHeader
      title="Giocatori"
      subtitle={selectedSquadra ? `${giocatoriFiltrati.length} atleti` : 'Seleziona una squadra'}
      displayName={displayName} logout={logout} societaNome={societaNome}
    />
  )

  if (isLoading) return <div>{header}<div className="pt-8"><LoadingSpinner /></div></div>

  if (selectedSquadra === null) {
    return (
      <div>
        {header}
        <div className="px-4 pt-4 space-y-2 pb-4">
          {squadre.map(s => {
            const count   = giocatori.filter(g => g.squadra === s || g.squadra2 === s || g.squadra3 === s).length
            const urgenti = giocatori.filter(g =>
              (g.squadra === s || g.squadra2 === s || g.squadra3 === s) &&
              certStatus(g.cert_medico_scadenza).urgente
            ).length
            return (
              <button
                key={s}
                onClick={() => setSelectedSquadra(s)}
                className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Users size={18} className="text-purple-600" strokeWidth={1.8} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s}</p>
                  <p className="text-xs text-gray-400">{count} atleti</p>
                </div>
                {urgenti > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                    {urgenti} cert
                  </span>
                )}
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
          {squadre.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-16">Nessun giocatore registrato</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}
      <div className="px-4 pt-3 pb-2">
        <button onClick={() => setSelectedSquadra(null)} className="flex items-center gap-1 text-sm text-purple-600 font-medium">
          <ChevronLeft size={16} /> Tutte le squadre
        </button>
      </div>
      <div className="px-4 space-y-2 pb-4">
        {giocatoriFiltrati.map(g => {
          const cert = certStatus(g.cert_medico_scadenza)
          return (
            <button
              key={g.id}
              onClick={() => navigate(`/secretary/giocatori/${g.id}`)}
              className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-purple-700">
                  {(g.cognome?.[0] ?? '')}{(g.nome?.[0] ?? '')}
                </span>
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{g.cognome} {g.nome}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${cert.cls}`}>
                {cert.label}
              </span>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </button>
          )
        })}
        {giocatoriFiltrati.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">Nessun giocatore in questa squadra</p>
        )}
      </div>
    </div>
  )
}
