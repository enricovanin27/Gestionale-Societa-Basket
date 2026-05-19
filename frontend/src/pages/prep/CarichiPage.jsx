import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

function rpeStyle(v) {
  if (v == null) return 'text-gray-300'
  if (v <= 5) return 'text-green-600 font-bold'
  if (v <= 7) return 'text-yellow-500 font-bold'
  return 'text-red-600 font-bold'
}

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function CarichiPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [squadraFiltro, setSquadraFiltro] = useState('')
  const [weekRef, setWeekRef] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [formRpe, setFormRpe] = useState({ giocatore_id: '', data: format(new Date(), 'yyyy-MM-dd'), valore_rpe: '7' })
  const [saving, setSaving] = useState(false)

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'))

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-list', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome, squadra')
        .eq('societa_id', societaId).order('cognome')
      return data ?? []
    },
  })

  const { data: rpeRows = [], isLoading } = useQuery({
    queryKey: ['rpe-settimana', societaId, weekStartStr, weekEndStr],
    enabled: !!societaId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('rpe_sessioni')
        .select('giocatore_id, data, valore_rpe, giocatore:giocatore_id(id, nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .gte('data', weekStartStr)
        .lte('data', weekEndStr)
      return data ?? []
    },
  })

  const squadre = useMemo(() => [...new Set(giocatori.map(g => g.squadra))].sort(), [giocatori])
  const giocatoriFiltrati = useMemo(() =>
    squadraFiltro ? giocatori.filter(g => g.squadra === squadraFiltro) : giocatori,
    [giocatori, squadraFiltro]
  )

  const rpeMap = useMemo(() => {
    const map = {}
    for (const r of rpeRows) {
      if (!map[r.giocatore_id]) map[r.giocatore_id] = {}
      map[r.giocatore_id][r.data] = r.valore_rpe
    }
    return map
  }, [rpeRows])

  function mediaGiocatore(gid) {
    const vals = Object.values(rpeMap[gid] ?? {})
    if (!vals.length) return null
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }

  function mediaSquadra() {
    const vals = giocatoriFiltrati.flatMap(g => Object.values(rpeMap[g.id] ?? {}))
    if (!vals.length) return null
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }

  const insertMut = useMutation({
    mutationFn: async ({ giocatore_id, data, valore_rpe }) => {
      const { error } = await supabase.from('rpe_sessioni').upsert({
        giocatore_id,
        data,
        valore_rpe: parseInt(valore_rpe),
        tipo_sessione: 'allenamento',
        societa_id: societaId,
      }, { onConflict: 'giocatore_id,data,tipo_sessione' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rpe-settimana', societaId] })
      setShowModal(false)
      setFormRpe({ giocatore_id: '', data: format(new Date(), 'yyyy-MM-dd'), valore_rpe: '7' })
    },
  })

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader
        title="Carichi RPE"
        actions={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm">
            <Plus size={14} /> RPE
          </button>
        }
      />

      <div className="p-4">
        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
          value={squadraFiltro} onChange={e => setSquadraFiltro(e.target.value)}>
          <option value="">Tutte le squadre</option>
          {squadre.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setWeekRef(w => subWeeks(w, 1))} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700">
            {format(weekStart, 'd MMM', { locale: it })} – {format(weekEnd, 'd MMM yyyy', { locale: it })}
          </span>
          <button onClick={() => setWeekRef(w => addWeeks(w, 1))} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronRight size={16} />
          </button>
        </div>

        {isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-amber-50">
                  <th className="text-left p-2 text-amber-900 font-semibold text-xs min-w-[80px]">Giocatore</th>
                  {weekDays.map((d, i) => (
                    <th key={d} className="p-1.5 text-amber-900 font-semibold text-[10px] text-center">
                      {GIORNI_BREVI[i]}<br />{format(new Date(d + 'T00:00:00'), 'd')}
                    </th>
                  ))}
                  <th className="p-2 text-amber-900 font-semibold text-xs text-center">Med.</th>
                </tr>
              </thead>
              <tbody>
                {giocatoriFiltrati.map(g => (
                  <tr key={g.id} className="border-b border-amber-50 hover:bg-amber-50/30">
                    <td className="p-2 text-xs font-medium text-gray-700 truncate max-w-[80px]">
                      {g.cognome} {g.nome?.charAt(0)}.
                    </td>
                    {weekDays.map(d => {
                      const val = rpeMap[g.id]?.[d]
                      return (
                        <td key={d} className={`p-1.5 text-center text-xs ${rpeStyle(val)}`}>
                          {val ?? "—"}
                        </td>
                      )
                    })}
                    <td className={`p-2 text-center text-xs ${rpeStyle(mediaGiocatore(g.id) ? parseFloat(mediaGiocatore(g.id)) : null)}`}>
                      {mediaGiocatore(g.id) ?? "—"}
                    </td>
                  </tr>
                ))}
                {giocatoriFiltrati.length > 0 && (
                  <tr className="bg-amber-50 border-t border-amber-200">
                    <td className="p-2 text-xs font-bold text-amber-900">Media</td>
                    {weekDays.map(d => {
                      const vals = giocatoriFiltrati
                        .map(g => rpeMap[g.id]?.[d]).filter(v => v != null)
                      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null
                      return (
                        <td key={d} className={`p-1.5 text-center text-xs ${rpeStyle(avg ? parseFloat(avg) : null)}`}>
                          {avg ?? "—"}
                        </td>
                      )
                    })}
                    <td className={`p-2 text-center text-xs font-bold ${rpeStyle(mediaSquadra() ? parseFloat(mediaSquadra()) : null)}`}>
                      {mediaSquadra() ?? "—"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="mt-2 text-[10px] text-gray-400">🟢 ≤5 · 🟡 6–7 · 🔴 ≥8</div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Inserisci RPE</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <select className={inp} value={formRpe.giocatore_id}
                onChange={e => setFormRpe(f => ({ ...f, giocatore_id: e.target.value }))}>
                <option value="">Seleziona giocatore</option>
                {giocatoriFiltrati.map(g => (
                  <option key={g.id} value={g.id}>{g.cognome} {g.nome} — {g.squadra}</option>
                ))}
              </select>
              <input type="date" className={inp} value={formRpe.data}
                onChange={e => setFormRpe(f => ({ ...f, data: e.target.value }))} />
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  RPE: <span className={`font-bold ${rpeStyle(parseInt(formRpe.valore_rpe))}`}>{formRpe.valore_rpe}</span>
                </label>
                <input type="range" min="1" max="10" className="w-full" value={formRpe.valore_rpe}
                  onChange={e => setFormRpe(f => ({ ...f, valore_rpe: e.target.value }))} />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Facilissimo</span><span>Massimo</span>
                </div>
              </div>
              <button
                onClick={async () => {
                  if (saving || !formRpe.giocatore_id) return
                  setSaving(true)
                  try { await insertMut.mutateAsync(formRpe) } finally { setSaving(false) }
                }}
                disabled={saving || !formRpe.giocatore_id}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? "Salvataggio..." : "Salva RPE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
