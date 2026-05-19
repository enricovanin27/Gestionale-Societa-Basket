import { useQuery } from '@tanstack/react-query'
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { AlertTriangle, Dumbbell, BarChart2, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { GIORNI } from '../../lib/constants'

function rpeColor(v) {
  if (v <= 5) return 'text-green-600'
  if (v <= 7) return 'text-yellow-500'
  return 'text-red-600'
}

export default function HomePrep() {
  const { societaId } = useAuth()
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1
  const prossimi3Giorni = [0, 1, 2].map(offset => ({
    giorno: GIORNI[(todayIdx + offset) % 7],
    label: offset === 0 ? 'Oggi' : offset === 1 ? 'Domani'
           : format(addDays(today, offset), 'EEE d', { locale: it }),
  }))

  const { data: infortuni = [], isLoading } = useQuery({
    queryKey: ['home-prep-infortuni', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('infortuni')
        .select('id, tipo, data_rientro_prevista, giocatore:giocatore_id(nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .eq('stato', 'attivo')
        .order('data_inizio', { ascending: false })
      return data ?? []
    },
  })

  const { data: prossimiSlot = [] } = useQuery({
    queryKey: ['home-prep-spazi', societaId, todayIdx],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_orario_fisso')
        .select('id, giorno, squadra, ora_inizio, spazio:spazio_id(nome)')
        .eq('societa_id', societaId)
        .in('giorno', prossimi3Giorni.map(g => g.giorno))
        .order('ora_inizio')
      return (data ?? []).slice(0, 2).map(s => ({
        ...s,
        labelGiorno: prossimi3Giorni.find(g => g.giorno === s.giorno)?.label ?? s.giorno,
      }))
    },
  })

  const { data: rpeMedia = [] } = useQuery({
    queryKey: ['home-prep-rpe', societaId, weekStart, weekEnd],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('rpe_sessioni')
        .select('valore_rpe, giocatore:giocatore_id(squadra)')
        .eq('societa_id', societaId)
        .gte('data', weekStart)
        .lte('data', weekEnd)
      if (!data) return []
      const bySquadra = {}
      for (const r of data) {
        const sq = r.giocatore?.squadra ?? '—'
        if (!bySquadra[sq]) bySquadra[sq] = []
        bySquadra[sq].push(r.valore_rpe)
      }
      return Object.entries(bySquadra)
        .map(([sq, vals]) => ({ squadra: sq, media: (vals.reduce((a, b) => a + b, 0) / vals.length) }))
        .sort((a, b) => a.squadra.localeCompare(b.squadra))
    },
  })

  const { data: prossimiTest = [] } = useQuery({
    queryKey: ['home-prep-test', societaId, todayStr],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('test_programmati')
        .select('id, data, squadra, test:test_id(nome)')
        .eq('societa_id', societaId)
        .gte('data', todayStr)
        .order('data')
        .limit(2)
      return data ?? []
    },
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Preparazione Atletica" subtitle="Panoramica" />
      <div className="p-4 grid grid-cols-2 gap-3">

        {/* Infortuni attivi — rosso */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={14} className="text-red-600" />
            <span className="text-xs font-bold text-red-800">Infortuni attivi</span>
          </div>
          {infortuni.length === 0 ? (
            <p className="text-xs text-gray-400">Nessuno</p>
          ) : (
            infortuni.slice(0, 2).map(i => (
              <div key={i.id} className="text-xs text-gray-700 leading-tight truncate">
                {i.giocatore?.cognome} {i.giocatore?.nome?.charAt(0)}. — {i.giocatore?.squadra}
              </div>
            ))
          )}
          {infortuni.length > 0 && (
            <span className="mt-1.5 inline-block bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {infortuni.length} attivi
            </span>
          )}
        </div>

        {/* Prossimi slot spazi — blu */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Dumbbell size={14} className="text-blue-600" />
            <span className="text-xs font-bold text-blue-800">Prossimi spazi</span>
          </div>
          {prossimiSlot.length === 0 ? (
            <p className="text-xs text-gray-400">Nessuno in programma</p>
          ) : (
            prossimiSlot.map(s => (
              <div key={s.id} className="text-xs text-gray-700 leading-tight">
                {s.labelGiorno} {s.ora_inizio?.slice(0, 5)} — {s.squadra}
              </div>
            ))
          )}
        </div>

        {/* Carichi RPE — verde */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart2 size={14} className="text-green-600" />
            <span className="text-xs font-bold text-green-800">Carichi settimana</span>
          </div>
          {rpeMedia.length === 0 ? (
            <p className="text-xs text-gray-400">Nessun dato RPE</p>
          ) : (
            rpeMedia.slice(0, 2).map(r => (
              <div key={r.squadra} className="text-xs text-gray-700 leading-tight">
                {r.squadra} — RPE{' '}
                <span className={`font-semibold ${rpeColor(r.media)}`}>
                  {r.media.toFixed(1)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Prossimi test — viola */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <ClipboardList size={14} className="text-purple-600" />
            <span className="text-xs font-bold text-purple-800">Prossimi test</span>
          </div>
          {prossimiTest.length === 0 ? (
            <p className="text-xs text-gray-400">Nessun test pianificato</p>
          ) : (
            prossimiTest.map(t => (
              <div key={t.id} className="text-xs text-gray-700 leading-tight">
                {t.test?.nome} — {t.squadra} · {format(new Date(t.data + 'T00:00:00'), 'd/MM')}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}
