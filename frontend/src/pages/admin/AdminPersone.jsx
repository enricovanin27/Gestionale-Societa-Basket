import { useState, useMemo } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '../../components/ui/card'

const today = new Date()
const todayStr = format(today, 'yyyy-MM-dd')

function certLabel(dataScad) {
  if (!dataScad) return { text: 'N/D', cls: 'bg-gray-100 text-gray-500' }
  const diff = differenceInDays(parseISO(dataScad), today)
  if (diff < 0)  return { text: `Scad. ${-diff}gg fa`, cls: 'bg-red-100 text-red-700'    }
  if (diff < 30) return { text: `Scade in ${diff}gg`,  cls: 'bg-orange-100 text-orange-700' }
  return { text: format(parseISO(dataScad), 'd MMM yy', { locale: it }), cls: 'bg-green-100 text-green-700' }
}

export default function AdminPersone() {
  const { societaId, displayName, logout, societaNome } = useAuth()
  const [squadraFilter, setSquadraFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data: giocatori = [], isLoading } = useQuery({
    queryKey: ['admin-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, cert_medico_scadenza, data_nascita')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const squadre = useMemo(() => [...new Set(giocatori.map(g => g.squadra).filter(Boolean))].sort(), [giocatori])

  const filtrati = useMemo(() => {
    let list = giocatori
    if (squadraFilter) list = list.filter(g => g.squadra === squadraFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(g => `${g.nome} ${g.cognome}`.toLowerCase().includes(q))
    }
    return list
  }, [giocatori, squadraFilter, search])

  const certScadutiCount = giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza < todayStr).length
  const certInScadCount  = giocatori.filter(g => {
    if (!g.cert_medico_scadenza) return false
    const diff = differenceInDays(parseISO(g.cert_medico_scadenza), today)
    return diff >= 0 && diff < 30
  }).length

  return (
    <div>
      <AppHeader
        title="Persone"
        subtitle={`${giocatori.length} giocatori attivi`}
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      <div className="px-4 pt-4 space-y-3">
        {(certScadutiCount > 0 || certInScadCount > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm">
            {certScadutiCount > 0 && <p className="text-red-700 font-semibold">🔴 {certScadutiCount} cert. scaduti</p>}
            {certInScadCount  > 0 && <p className="text-orange-600 font-medium">🟡 {certInScadCount} in scadenza entro 30gg</p>}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca giocatore..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <select value={squadraFilter} onChange={e => setSquadraFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">Tutte</option>
            {squadre.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {isLoading ? <LoadingSpinner /> : (
          <div className="space-y-2">
            {filtrati.length === 0 ? (
              <Card><CardContent className="py-5 text-center text-sm text-gray-400">Nessun giocatore trovato.</CardContent></Card>
            ) : filtrati.map(g => {
              const cl = certLabel(g.cert_medico_scadenza)
              return (
                <div key={g.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{g.squadra}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${cl.cls}`}>{cl.text}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
