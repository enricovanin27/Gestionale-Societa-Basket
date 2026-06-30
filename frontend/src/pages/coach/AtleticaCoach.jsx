import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfWeek, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function AtleticaCoach({ headless = false }) {
  const { societaId, squadreAllenatore, isAdmin } = useAuth()
  const [weekRef, setWeekRef] = useState(new Date())

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')

  // Admin vede tutte le squadre della società; allenatore solo le proprie
  const filtroSquadre = isAdmin ? null : (squadreAllenatore ?? [])
  const abilitato = !!societaId && (isAdmin || !!filtroSquadre?.length)

  const { data: sessioni = [], isLoading } = useQuery({
    queryKey: ['atletica-sessioni', societaId, filtroSquadre?.join(',') ?? 'all', weekStartStr, weekEndStr],
    enabled: abilitato,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('prep_sessioni')
        .select('id, squadra, data, quando, durata_min, su_campo, note')
        .eq('societa_id', societaId)
        .gte('data', weekStartStr)
        .lte('data', weekEndStr)
        .order('data').order('squadra')
      if (filtroSquadre) q = q.in('squadra', filtroSquadre)
      const { data } = await q
      return data ?? []
    },
  })

  const prevWeek = () => setWeekRef(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d })
  const nextWeek = () => setWeekRef(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d })

  return (
    <div>
      {!headless && <PageHeader title="Atletica" subtitle="Sessioni" />}

      <div className="p-4">
        {/* Navigazione settimanale */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevWeek} className="p-1.5 rounded-lg bg-gray-100 active:scale-95">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700">
            {format(weekStart, 'd MMM', { locale: it })} – {format(weekEnd, 'd MMM yyyy', { locale: it })}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded-lg bg-gray-100 active:scale-95">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Lista sessioni */}
        {isLoading ? <LoadingSpinner /> : (
          <div className="space-y-2">
            {sessioni.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">
                Nessuna sessione atletica questa settimana
              </p>
            )}
            {sessioni.map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{s.squadra}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {format(new Date(s.data + 'T00:00:00'), 'EEE d/MM', { locale: it })}
                      {' · '}
                      {s.quando === 'standalone'
                        ? 'Sessione libera'
                        : `${s.quando.charAt(0).toUpperCase() + s.quando.slice(1)} all.`}
                      {' · '}{s.durata_min} min
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        s.su_campo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {s.su_campo ? '⚠ Su campo' : 'Fuori campo'}
                      </span>
                    </div>
                    {s.note && (
                      <div className="text-xs text-gray-400 mt-1 italic">{s.note}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
          <Lock size={12} />
          Sola lettura
        </div>
      </div>
    </div>
  )
}
