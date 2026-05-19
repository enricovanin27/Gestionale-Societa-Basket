import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const FORM_EMPTY = {
  giocatore_id: '',
  data: format(new Date(), 'yyyy-MM-dd'),
  altezza_cm: '',
  peso_kg: '',
  apertura_braccia_cm: '',
  note: '',
}

export default function AntropometriaPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [squadraFiltro, setSquadraFiltro] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)

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

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['antropometria', societaId, squadraFiltro],
    enabled: !!societaId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('antropometria')
        .select('*, giocatore:giocatore_id(id, nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .order('data', { ascending: false })
      if (!data) return []
      const seen = new Set()
      return data.filter(r => {
        const gid = r.giocatore?.id
        if (!gid || seen.has(gid)) return false
        seen.add(gid)
        return true
      })
    },
  })

  const squadre = useMemo(() => [...new Set(giocatori.map(g => g.squadra))].sort(), [giocatori])
  const righe = useMemo(() =>
    squadraFiltro ? rows.filter(r => r.giocatore?.squadra === squadraFiltro) : rows,
    [rows, squadraFiltro]
  )

  const insertMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('antropometria').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['antropometria', societaId] })
      setShowModal(false)
      setForm(FORM_EMPTY)
    },
  })

  async function handleSave(e) {
    e.preventDefault()
    if (!form.giocatore_id) return
    setSaving(true)
    try {
      await insertMut.mutateAsync({
        giocatore_id: form.giocatore_id,
        data: form.data,
        altezza_cm: form.altezza_cm ? parseFloat(form.altezza_cm) : null,
        peso_kg: form.peso_kg ? parseFloat(form.peso_kg) : null,
        apertura_braccia_cm: form.apertura_braccia_cm ? parseFloat(form.apertura_braccia_cm) : null,
        note: form.note || null,
        societa_id: societaId,
      })
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader
        title="Antropometria"
        actions={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm">
            <Plus size={14} /> Nuova
          </button>
        }
      />

      <div className="p-4">
        <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
          value={squadraFiltro} onChange={e => setSquadraFiltro(e.target.value)}>
          <option value="">Tutte le squadre</option>
          {squadre.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-amber-50">
                  <th className="text-left p-2 text-amber-900 font-semibold text-xs">Giocatore</th>
                  <th className="p-2 text-amber-900 font-semibold text-xs">Alt. (cm)</th>
                  <th className="p-2 text-amber-900 font-semibold text-xs">Peso (kg)</th>
                  <th className="p-2 text-amber-900 font-semibold text-xs">Ap. br. (cm)</th>
                  <th className="p-2 text-amber-900 font-semibold text-xs">Data</th>
                </tr>
              </thead>
              <tbody>
                {righe.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8 text-sm">Nessuna rilevazione</td></tr>
                )}
                {righe.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-amber-50/50">
                    <td className="p-2 font-medium text-gray-800">
                      {r.giocatore?.cognome} {r.giocatore?.nome?.charAt(0)}.
                      <span className="text-xs text-gray-400 ml-1">— {r.giocatore?.squadra}</span>
                    </td>
                    <td className="p-2 text-center text-gray-700">{r.altezza_cm ?? '—'}</td>
                    <td className="p-2 text-center text-gray-700">{r.peso_kg ?? '—'}</td>
                    <td className="p-2 text-center text-gray-700">{r.apertura_braccia_cm ?? '—'}</td>
                    <td className="p-2 text-center text-gray-400 text-xs">
                      {format(parseISO(r.data), 'dd/MM/yy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuova rilevazione</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Giocatore *</label>
                <select className={inp} value={form.giocatore_id}
                  onChange={e => setForm(f => ({ ...f, giocatore_id: e.target.value }))} required>
                  <option value="">Seleziona giocatore</option>
                  {giocatori.map(g => (
                    <option key={g.id} value={g.id}>{g.cognome} {g.nome} — {g.squadra}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
                <input type="date" className={inp} value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Altezza (cm)</label>
                  <input type="number" step="0.1" className={inp} value={form.altezza_cm}
                    onChange={e => setForm(f => ({ ...f, altezza_cm: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Peso (kg)</label>
                  <input type="number" step="0.1" className={inp} value={form.peso_kg}
                    onChange={e => setForm(f => ({ ...f, peso_kg: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Ap. br. (cm)</label>
                  <input type="number" step="0.1" className={inp} value={form.apertura_braccia_cm}
                    onChange={e => setForm(f => ({ ...f, apertura_braccia_cm: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <textarea className={inp} rows={2} value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva rilevazione'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
