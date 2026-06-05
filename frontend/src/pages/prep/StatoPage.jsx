import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { it } from 'date-fns/locale'
import { Plus, X, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const GRAVITA_COLORS = {
  lieve:    'bg-amber-100 text-amber-800',
  moderato: 'bg-orange-100 text-orange-800',
  grave:    'bg-red-100 text-red-800',
}
const FORM_INF_EMPTY = {
  giocatore_id: '', tipo: '', gravita: 'lieve',
  data_inizio: format(new Date(), 'yyyy-MM-dd'),
  data_rientro_prevista: '', note: '',
}

function rpeStyle(v) {
  if (v == null) return 'text-gray-300'
  if (v <= 5) return 'text-green-600 font-bold'
  if (v <= 7) return 'text-yellow-500 font-bold'
  return 'text-red-600 font-bold'
}
const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function StatoPage() {
  const { societaId, profile } = useAuth()
  const qc = useQueryClient()
  const [squadraFiltro, setSquadraFiltro] = useState('')
  const [weekRef, setWeekRef] = useState(new Date())
  const [showInfModal, setShowInfModal] = useState(false)
  const [showRpeModal, setShowRpeModal] = useState(false)
  const [formInf, setFormInf] = useState(FORM_INF_EMPTY)
  const [formRpe, setFormRpe] = useState({ giocatore_id: '', data: format(new Date(), 'yyyy-MM-dd'), valore_rpe: '7' })
  const [saving, setSaving] = useState(false)

  const weekStart    = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd      = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr   = format(weekEnd, 'yyyy-MM-dd')
  const weekDays     = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'))

  const { data: squadreAssegnate = [] } = useQuery({
    queryKey: ['prep-squadre-mie', societaId, profile?.id],
    enabled: !!societaId && !!profile?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_squadre').select('squadra')
        .eq('societa_id', societaId).eq('preparatore_id', profile.id)
      return (data ?? []).map(r => r.squadra)
    },
  })

  const squadra = squadraFiltro || squadreAssegnate[0] || ''

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-squadra', societaId, squadra],
    enabled: !!societaId && !!squadra,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome, squadra')
        .eq('societa_id', societaId).eq('squadra', squadra).order('cognome')
      return data ?? []
    },
  })

  const { data: infortuni = [], isLoading: loadInf } = useQuery({
    queryKey: ['infortuni-prep', societaId, squadra, giocatori.length],
    enabled: !!societaId && !!squadra && giocatori.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const gids = giocatori.map(g => g.id)
      if (!gids.length) return []
      const { data } = await supabase
        .from('infortuni')
        .select('*, giocatore:giocatore_id(nome, cognome)')
        .eq('societa_id', societaId).eq('stato', 'attivo')
        .in('giocatore_id', gids)
        .order('data_inizio', { ascending: false })
      return data ?? []
    },
  })

  const { data: rpeRows = [], isLoading: loadRpe } = useQuery({
    queryKey: ['rpe-settimana-prep', societaId, squadra, weekStartStr, giocatori.length],
    enabled: !!societaId && !!squadra && giocatori.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const gids = giocatori.map(g => g.id)
      if (!gids.length) return []
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

  const risolviMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('infortuni')
        .update({ stato: 'risolto', data_rientro_effettiva: format(new Date(), 'yyyy-MM-dd') })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['infortuni-prep', societaId] }),
  })

  const insertInfMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('infortuni').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['infortuni-prep', societaId] })
      setShowInfModal(false)
      setFormInf(FORM_INF_EMPTY)
    },
  })

  const insertRpeMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('rpe_sessioni').upsert(payload, { onConflict: 'giocatore_id,data,tipo_sessione' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rpe-settimana-prep', societaId] })
      setShowRpeModal(false)
      setFormRpe({ giocatore_id: '', data: format(new Date(), 'yyyy-MM-dd'), valore_rpe: '7' })
    },
  })

  async function handleSaveInf(e) {
    e.preventDefault()
    if (!formInf.giocatore_id || !formInf.tipo) return
    setSaving(true)
    try {
      await insertInfMut.mutateAsync({
        ...formInf,
        data_rientro_prevista: formInf.data_rientro_prevista || null,
        societa_id: societaId,
      })
    } finally { setSaving(false) }
  }

  async function handleSaveRpe() {
    if (!formRpe.giocatore_id) return
    setSaving(true)
    try {
      await insertRpeMut.mutateAsync({
        giocatore_id: formRpe.giocatore_id,
        data: formRpe.data,
        valore_rpe: parseInt(formRpe.valore_rpe),
        tipo_sessione: 'allenamento',
        societa_id: societaId,
      })
    } finally { setSaving(false) }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader
        title="Stato squadre"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowInfModal(true)}
              className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-2 py-1.5 rounded-xl shadow-sm">
              <Plus size={14} /> Infortunio
            </button>
          </div>
        }
      />

      <div className="p-4 space-y-5">
        {/* Selezione squadra */}
        {squadreAssegnate.length > 1 && (
          <select className={inp} value={squadraFiltro}
            onChange={e => setSquadraFiltro(e.target.value)}>
            <option value="">Tutte le squadre</option>
            {squadreAssegnate.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {!squadra ? (
          <p className="text-center text-gray-400 text-sm py-8">Nessuna squadra assegnata. Chiedi all'admin.</p>
        ) : (
          <>
            {/* ── INFORTUNI ─────────────────────────────── */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Infortuni attivi</h3>
              {loadInf ? <LoadingSpinner /> : infortuni.length === 0 ? (
                <p className="text-xs text-gray-400">Nessun infortunio attivo</p>
              ) : (
                <div className="space-y-2">
                  {infortuni.map(inf => (
                    <div key={inf.id} className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-gray-900">
                          {inf.giocatore?.cognome} {inf.giocatore?.nome}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {inf.tipo} ·{' '}
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${GRAVITA_COLORS[inf.gravita]}`}>
                            {inf.gravita}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Dal {format(parseISO(inf.data_inizio), 'dd/MM/yyyy')}
                          {inf.data_rientro_prevista && ` · Rientro prev. ${format(parseISO(inf.data_rientro_prevista), 'dd/MM/yyyy')}`}
                        </div>
                      </div>
                      <button onClick={() => risolviMut.mutate(inf.id)}
                        className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg whitespace-nowrap">
                        <Check size={12} /> Risolto
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── CARICHI RPE ───────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Carichi RPE</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setWeekRef(w => subWeeks(w, 1))} className="p-1 rounded bg-gray-100"><ChevronLeft size={14} /></button>
                  <span className="text-xs text-gray-600 font-medium">
                    {format(weekStart, 'd MMM', { locale: it })}–{format(weekEnd, 'd MMM', { locale: it })}
                  </span>
                  <button onClick={() => setWeekRef(w => addWeeks(w, 1))} className="p-1 rounded bg-gray-100"><ChevronRight size={14} /></button>
                  <button onClick={() => setShowRpeModal(true)}
                    className="text-xs text-amber-600 font-semibold ml-1">+ RPE</button>
                </div>
              </div>
              {loadRpe ? <LoadingSpinner /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-amber-50">
                        <th className="text-left p-2 text-amber-900 font-semibold text-xs min-w-[70px]">Giocatore</th>
                        {weekDays.map((d, i) => (
                          <th key={d} className="p-1 text-amber-900 font-semibold text-[10px] text-center">
                            {GIORNI_BREVI[i]}<br />{format(new Date(d + 'T00:00:00'), 'd')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {giocatori.map(g => (
                        <tr key={g.id} className="border-b border-amber-50">
                          <td className="p-2 text-xs font-medium text-gray-700 truncate max-w-[70px]">
                            {g.cognome} {g.nome?.charAt(0)}.
                          </td>
                          {weekDays.map(d => {
                            const val = rpeMap[g.id]?.[d]
                            return (
                              <td key={d} className={`p-1 text-center text-xs ${rpeStyle(val)}`}>
                                {val ?? '—'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                      {giocatori.length === 0 && (
                        <tr><td colSpan={8} className="text-center text-gray-400 py-4 text-xs">
                          Nessun giocatore in questa squadra
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="mt-1 text-[10px] text-gray-400">🟢 ≤5 · 🟡 6–7 · 🔴 ≥8</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal infortunio */}
      {showInfModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuovo infortunio</h2>
              <button onClick={() => setShowInfModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveInf} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Giocatore *</label>
                <select className={inp} value={formInf.giocatore_id}
                  onChange={e => setFormInf(f => ({ ...f, giocatore_id: e.target.value }))} required>
                  <option value="">Seleziona giocatore</option>
                  {giocatori.map(g => <option key={g.id} value={g.id}>{g.cognome} {g.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo *</label>
                <input className={inp} value={formInf.tipo}
                  onChange={e => setFormInf(f => ({ ...f, tipo: e.target.value }))}
                  placeholder="es. Distorsione caviglia" required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Gravità</label>
                <select className={inp} value={formInf.gravita}
                  onChange={e => setFormInf(f => ({ ...f, gravita: e.target.value }))}>
                  <option value="lieve">Lieve</option>
                  <option value="moderato">Moderato</option>
                  <option value="grave">Grave</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data inizio *</label>
                <input type="date" className={inp} value={formInf.data_inizio}
                  onChange={e => setFormInf(f => ({ ...f, data_inizio: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Rientro previsto</label>
                <input type="date" className={inp} value={formInf.data_rientro_prevista}
                  onChange={e => setFormInf(f => ({ ...f, data_rientro_prevista: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <textarea className={inp} rows={2} value={formInf.note}
                  onChange={e => setFormInf(f => ({ ...f, note: e.target.value }))} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva infortunio'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal RPE */}
      {showRpeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Inserisci RPE</h2>
              <button onClick={() => setShowRpeModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <select className={inp} value={formRpe.giocatore_id}
                onChange={e => setFormRpe(f => ({ ...f, giocatore_id: e.target.value }))}>
                <option value="">Seleziona giocatore</option>
                {giocatori.map(g => <option key={g.id} value={g.id}>{g.cognome} {g.nome}</option>)}
              </select>
              <input type="date" className={inp} value={formRpe.data}
                onChange={e => setFormRpe(f => ({ ...f, data: e.target.value }))} />
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  RPE: <span className="font-bold">{formRpe.valore_rpe}</span>
                </label>
                <input type="range" min="1" max="10" className="w-full" value={formRpe.valore_rpe}
                  onChange={e => setFormRpe(f => ({ ...f, valore_rpe: e.target.value }))} />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Facilissimo</span><span>Massimo</span>
                </div>
              </div>
              <button onClick={handleSaveRpe} disabled={saving || !formRpe.giocatore_id}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva RPE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
