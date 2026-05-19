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
const GIORNI_FULL = { lunedi: 'Lunedì', martedi: 'Martedì', mercoledi: 'Mercoledì', giovedi: 'Giovedì', venerdi: 'Venerdì', sabato: 'Sabato', domenica: 'Domenica' }

export default function AtleticaCoach() {
  const { societaId, squadreAllenatore } = useAuth()
  const [tab, setTab] = useState('infortuni')
  const [weekRef, setWeekRef] = useState(new Date())
  const [testFiltro, setTestFiltro] = useState('')

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

  const { data: testDef = [] } = useQuery({
    queryKey: ['test-definizioni', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('test_definizioni').select('*')
        .eq('societa_id', societaId).order('ordine')
      return data ?? []
    },
  })

  const { data: risultati = [], isLoading: loadRis } = useQuery({
    queryKey: ['coach-test-risultati', societaId, testFiltro, gids.join(',')],
    enabled: !!societaId && !!testFiltro && gids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('test_risultati')
        .select('valore, data, giocatore:giocatore_id(id, nome, cognome, squadra)')
        .eq('societa_id', societaId).eq('test_id', testFiltro)
        .in('giocatore_id', gids).order('data')
      return data ?? []
    },
  })

  const colDate = useMemo(() => [...new Set(risultati.map(r => r.data))].sort().slice(-4), [risultati])
  const pivot = useMemo(() => {
    const map = {}
    for (const r of risultati) {
      const gid = r.giocatore?.id
      if (!gid) continue
      if (!map[gid]) map[gid] = { giocatore: r.giocatore, valori: {} }
      map[gid].valori[r.data] = r.valore
    }
    return Object.values(map)
  }, [risultati])

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

  const { data: prossimiSlot = [] } = useQuery({
    queryKey: ['coach-spazi', societaId, squadreAllenatore?.join(',')],
    enabled: !!societaId && !!squadreAllenatore?.length,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_orario_fisso').select('*, spazio:spazio_id(nome)')
        .eq('societa_id', societaId)
        .in('squadra', squadreAllenatore ?? [])
        .order('ora_inizio')
      return (data ?? []).slice(0, 5)
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
          {['infortuni', 'test', 'carichi', 'spazi'].map(t => (
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

        {tab === 'test' && (
          <div>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
              value={testFiltro} onChange={e => setTestFiltro(e.target.value)}>
              <option value="">Seleziona tipo di test</option>
              {testDef.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            {!testFiltro ? (
              <p className="text-center text-gray-400 text-sm py-6">Seleziona un test</p>
            ) : loadRis ? <LoadingSpinner /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-amber-50">
                      <th className="text-left p-2 text-xs text-amber-900 font-semibold">Giocatore</th>
                      {colDate.map(d => <th key={d} className="p-2 text-xs text-amber-900 font-semibold">{format(new Date(d + 'T00:00:00'), 'd/MM')}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {pivot.map(row => (
                      <tr key={row.giocatore?.id} className="border-b border-gray-100">
                        <td className="p-2 font-medium text-gray-800 text-sm">{row.giocatore?.cognome} {row.giocatore?.nome?.charAt(0)}.</td>
                        {colDate.map(d => <td key={d} className="p-2 text-center text-gray-600 text-sm">{row.valori[d] ?? '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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

        {tab === 'spazi' && (
          <div className="space-y-2">
            {prossimiSlot.length === 0
              ? <p className="text-center text-gray-400 text-sm py-8">Nessuno slot configurato</p>
              : prossimiSlot.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">{GIORNI_FULL[s.giorno]}</span>
                      {' '}{s.ora_inizio?.slice(0,5)}–{s.ora_fine?.slice(0,5)}
                    </div>
                    <span className="text-xs text-gray-500">{s.spazio?.nome}</span>
                  </div>
                ))
            }
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
          <Lock size={12} />
          Sola lettura — modifiche solo dal preparatore atletico
        </div>
      </div>
    </div>
  )
}
