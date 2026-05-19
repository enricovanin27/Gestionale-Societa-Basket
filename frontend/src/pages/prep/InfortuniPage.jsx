import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Plus, X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const GRAVITA_COLORS = {
  lieve:    'bg-amber-100 text-amber-800',
  moderato: 'bg-orange-100 text-orange-800',
  grave:    'bg-red-100 text-red-800',
}

const FORM_EMPTY = {
  giocatore_id: '',
  tipo: '',
  gravita: 'lieve',
  data_inizio: format(new Date(), 'yyyy-MM-dd'),
  data_rientro_prevista: '',
  note: '',
}

export default function InfortuniPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState('attivi')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-list', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra')
        .eq('societa_id', societaId)
        .order('cognome')
      return data ?? []
    },
  })

  const { data: infortuni = [], isLoading } = useQuery({
    queryKey: ['infortuni', societaId, tab],
    enabled: !!societaId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('infortuni')
        .select('*, giocatore:giocatore_id(nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .eq('stato', tab === 'attivi' ? 'attivo' : 'risolto')
        .order('data_inizio', { ascending: false })
      return data ?? []
    },
  })

  const insertMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('infortuni').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['infortuni', societaId] })
      qc.invalidateQueries({ queryKey: ['home-prep-infortuni', societaId] })
      setShowModal(false)
      setForm(FORM_EMPTY)
    },
  })

  const risolviMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('infortuni')
        .update({ stato: 'risolto', data_rientro_effettiva: format(new Date(), 'yyyy-MM-dd') })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['infortuni', societaId] }),
  })

  async function handleSave(e) {
    e.preventDefault()
    if (!form.giocatore_id || !form.tipo) return
    setSaving(true)
    try {
      await insertMut.mutateAsync({
        ...form,
        data_rientro_prevista: form.data_rientro_prevista || null,
        societa_id: societaId,
      })
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'
  const tabCls = (t) => `px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
    tab === t ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'
  }`

  return (
    <div>
      <PageHeader
        title="Infortuni"
        actions={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm">
            <Plus size={14} /> Nuovo
          </button>
        }
      />

      <div className="p-4">
        <div className="flex gap-2 mb-4">
          <button className={tabCls('attivi')} onClick={() => setTab('attivi')}>Attivi</button>
          <button className={tabCls('risolti')} onClick={() => setTab('risolti')}>Risolti</button>
        </div>

        {isLoading ? <LoadingSpinner /> : (
          <div className="space-y-3">
            {infortuni.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Nessun infortunio {tab}</p>
            )}
            {infortuni.map(inf => (
              <div key={inf.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {inf.giocatore?.cognome} {inf.giocatore?.nome} — {inf.giocatore?.squadra}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {inf.tipo} ·{' '}
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${GRAVITA_COLORS[inf.gravita]}`}>
                        {inf.gravita.charAt(0).toUpperCase() + inf.gravita.slice(1)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Dal {format(parseISO(inf.data_inizio), 'dd/MM/yyyy')}
                      {inf.data_rientro_prevista && ` · Rientro prev. ${format(parseISO(inf.data_rientro_prevista), 'dd/MM/yyyy')}`}
                    </div>
                    {inf.note && <div className="text-xs text-gray-400 mt-0.5">{inf.note}</div>}
                  </div>
                  {tab === 'attivi' && (
                    <button
                      onClick={() => risolviMut.mutate(inf.id)}
                      className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg whitespace-nowrap"
                    >
                      <Check size={12} /> Risolto
                    </button>
                  )}
                </div>
                {tab === 'risolti' && inf.data_rientro_effettiva && (
                  <div className="text-xs text-green-600 mt-1">
                    Rientrato il {format(parseISO(inf.data_rientro_effettiva), 'dd/MM/yyyy')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuovo infortunio</h2>
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
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo di infortunio *</label>
                <input className={inp} value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  placeholder="es. Distorsione caviglia, Contrattura..." required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Gravità</label>
                <select className={inp} value={form.gravita}
                  onChange={e => setForm(f => ({ ...f, gravita: e.target.value }))}>
                  <option value="lieve">Lieve</option>
                  <option value="moderato">Moderato</option>
                  <option value="grave">Grave</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data inizio *</label>
                <input type="date" className={inp} value={form.data_inizio}
                  onChange={e => setForm(f => ({ ...f, data_inizio: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Rientro previsto</label>
                <input type="date" className={inp} value={form.data_rientro_prevista}
                  onChange={e => setForm(f => ({ ...f, data_rientro_prevista: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <textarea className={inp} rows={2} value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              {insertMut.isError && (
                <p className="text-xs text-red-500">{insertMut.error?.message}</p>
              )}
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva infortunio'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
