import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, startOfWeek, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const GRAVITA_COLORS = {
  lieve: 'bg-amber-100 text-amber-800',
  moderato: 'bg-orange-100 text-orange-800',
  grave: 'bg-red-100 text-red-800',
}

function rpeStyle(v) {
  if (v == null) return 'text-gray-300'
  if (v <= 5) return 'text-green-600 font-bold'
  if (v <= 7) return 'text-yellow-500 font-bold'
  return 'text-red-600 font-bold'
}

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function AtleticaCoach() {
  const { societaId, squadreAllenatore } = useAuth()
  const [tab, setTab] = useState('infortuni')
  const [weekRef, setWeekRef] = useState(new Date())

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'))

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-coach', societaId, squadreAllenatore?.join(',')],
    enabled: !!societaId && !!squadreAllenatore?.length,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome, squadra')
        .eq('societa_id', societaId)
        .in('squadra', squadreAllenatore ?? [])
        .order('cognome')
      return data ?? []
    },
  })

  const gids = giocatori.map(g => g.id)

  const { data: infortuni = [], isLoading: loadInf } = useQuery({
    queryKey: ['coach-infortuni', societaId, gids.join(',')],
    enabled: !!societaId && gids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('infortuni')
        .select('*, giocatore:giocatore_id(nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .eq('stato', 'attivo')
        .in('giocatore_id', gids)
        .order('data_inizio', { ascending: false })
      return data ?? []
    },
  })

  const { data: rpeRows = [], isLoading: loadRpe } = useQuery({
    queryKey: ['coach-rpe', societaId, weekStartStr, weekEndStr, gids.join(',')],
    enabled: !!societaId && gids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('rpe_sessioni').select('giocatore_id, data, valore_rpe')
        .eq('societa_id', societaId)
        .gte('data', weekStartStr).lte('data', weekEndStr)
        .in('giocatore_id', gids)
      return data ?? []
    },
  })

  const rpeMap = useMemo(() => {
    const map = {}
    for (const r of rpeRows) {
      if (!map[r.giocatore_id]) map[r.giocatore_id] = {}
      map[r.giocatore_id][r.data] = r.valore_rpe
    }
    return map
  }, [rpeRows])

  const { data: sessioni = [], isLoading: loadSes } = useQuery({
    queryKey: ['coach-sessioni', societaId, (squadreAllenatore ?? []).join(','), weekStartStr, weekEndStr],
    enabled: !!societaId && !!(squadreAllenatore ?? []).length,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_sessioni')
        .select('*, preparatore:preparatore_id(nome, cognome)')
        .eq('societa_id', societaId)
        .in('squadra', squadreAllenatore ?? [])
        .gte('data', weekStartStr)
        .lte('data', weekEndStr)
        .order('data').order('ora_inizio')
      return data ?? []
    },
  })

  const tabCls = (t) => `px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
    tab === t ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'
  }`

  return (
    <div>
      <PageHeader title="Atletica" subtitle="Sola lettura" />

      <div className="p-4">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {['infortuni', 'carichi', 'sessioni'].map(t => (
            <button key={t} className={tabCls(t)} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'infortuni' && (
          loadInf ? <LoadingSpinner /> : (
            <div className="space-y-3">
              {infortuni.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Nessun infortunio attivo</p>}
              {infortuni.map(inf => (
                <div key={inf.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="font-semibold text-gray-900">
                    {inf.giocatore?.cognome} {inf.giocatore?.nome} — {inf.giocatore?.squadra}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {inf.tipo} ·{' '}
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${GRAVITA_COLORS[inf.gravita]}`}>
                      {inf.gravita}
                    </span>
                  </div>
                  {inf.data_rientro_prevista && (
                    <div className="text-xs text-gray-400 mt-1">
                      Rientro previsto: {format(parseISO(inf.data_rientro_prevista), 'dd/MM/yyyy')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'carichi' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setWeekRef(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d })}
                className="p-1.5 rounded-lg bg-gray-100"><ChevronLeft size={16} /></button>
              <span className="text-sm font-semibold text-gray-700">
                {format(weekStart, 'd MMM', { locale: it })} – {format(weekEnd, 'd MMM', { locale: it })}
              </span>
              <button onClick={() => setWeekRef(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d })}
                className="p-1.5 rounded-lg bg-gray-100"><ChevronRight size={16} /></button>
            </div>
            {loadRpe ? <LoadingSpinner /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-amber-50">
                      <th className="text-left p-2 text-xs text-amber-900 font-semibold">Giocatore</th>
                      {weekDays.map((d, i) => (
                        <th key={d} className="p-1.5 text-center text-[10px] text-amber-900 font-semibold">
                          {GIORNI_BREVI[i]}<br />{format(new Date(d + 'T00:00:00'), 'd')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {giocatori.map(g => (
                      <tr key={g.id} className="border-b border-gray-100">
                        <td className="p-2 text-xs font-medium text-gray-700">{g.cognome} {g.nome?.charAt(0)}.</td>
                        {weekDays.map(d => (
                          <td key={d} className={`p-1.5 text-center text-xs ${rpeStyle(rpeMap[g.id]?.[d])}`}>
                            {rpeMap[g.id]?.[d] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'sessioni' && (
          loadSes ? <LoadingSpinner /> : (
            <div className="space-y-2">
              {sessioni.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">Nessuna sessione atletica questa settimana</p>
              )}
              {sessioni.map(s => (
                <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{s.squadra}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {format(new Date(s.data + 'T00:00:00'), 'd/MM')} ·{' '}
                        {s.quando === 'standalone' ? 'Sessione libera' : `${s.quando.charAt(0).toUpperCase() + s.quando.slice(1)} allenamento`}
                        {' · '}{s.durata_min} min
                      </div>
                      <div className="text-xs mt-1">
                        <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          s.su_campo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {s.su_campo ? '⚠ Su campo' : 'Fuori campo'}
                        </span>
                      </div>
                    </div>
                    {s.preparatore && (
                      <div className="text-xs text-gray-400 text-right">
                        {s.preparatore.cognome}<br />{s.preparatore.nome}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
          <Lock size={12} />
          Sola lettura — modifiche solo dal preparatore atletico
        </div>
      </div>
    </div>
  )
}
