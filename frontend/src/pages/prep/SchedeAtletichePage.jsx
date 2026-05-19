import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const CATEGORIE = ['riscaldamento', 'forza', 'mobilita', 'recupero', 'altro']
const CAT_LABEL = { riscaldamento: 'Riscaldamento', forza: 'Forza', mobilita: 'Mobilità', recupero: 'Recupero', altro: 'Altro' }
const ESERCIZIO_EMPTY = { nome: '', serie: '', reps: '', note: '' }
const FORM_EMPTY = { nome: '', categoria: 'riscaldamento', descrizione: '', esercizi: [{ ...ESERCIZIO_EMPTY }] }

export default function SchedeAtletichePage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const { data: schede = [], isLoading } = useQuery({
    queryKey: ['schede-atletiche', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('schede_atletiche')
        .select('*, assegnazioni:schede_assegnazioni(squadra, giocatore_id)')
        .eq('societa_id', societaId)
        .order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const insertMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('schede_atletiche').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schede-atletiche', societaId] })
      setShowModal(false)
      setForm(FORM_EMPTY)
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('schede_atletiche').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schede-atletiche', societaId] }),
  })

  function setEsercizio(idx, field, value) {
    setForm(f => {
      const es = [...f.esercizi]
      es[idx] = { ...es[idx], [field]: value }
      return { ...f, esercizi: es }
    })
  }

  function addEsercizio() {
    setForm(f => ({ ...f, esercizi: [...f.esercizi, { ...ESERCIZIO_EMPTY }] }))
  }

  function removeEsercizio(idx) {
    setForm(f => ({ ...f, esercizi: f.esercizi.filter((_, i) => i !== idx) }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nome) return
    setSaving(true)
    try {
      await insertMut.mutateAsync({
        nome: form.nome,
        categoria: form.categoria,
        descrizione: form.descrizione || null,
        esercizi: form.esercizi.filter(es => es.nome),
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
        title="Schede Atletiche"
        actions={
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-sm">
            <Plus size={14} /> Nuova
          </button>
        }
      />

      <div className="p-4 space-y-3">
        {isLoading ? <LoadingSpinner /> : schede.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">Nessuna scheda. Creane una con il bottone +</p>
        ) : (
          schede.map(scheda => {
            const tags = [
              ...new Set((scheda.assegnazioni ?? []).map(a => a.squadra).filter(Boolean))
            ]
            const isOpen = expanded === scheda.id
            return (
              <div key={scheda.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4"
                  onClick={() => setExpanded(isOpen ? null : scheda.id)}
                >
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">{scheda.nome}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {CAT_LABEL[scheda.categoria]} · {scheda.esercizi?.length ?? 0} esercizi
                    </div>
                    {tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {tags.map(t => (
                          <span key={t} className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); deleteMut.mutate(scheda.id) }}
                      className="text-gray-300 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                    {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-50">
                    {scheda.descrizione && (
                      <p className="text-sm text-gray-500 mt-3 mb-2">{scheda.descrizione}</p>
                    )}
                    <div className="space-y-2 mt-2">
                      {(scheda.esercizi ?? []).map((es, i) => (
                        <div key={i} className="bg-amber-50 rounded-lg px-3 py-2">
                          <div className="font-medium text-sm text-gray-800">{es.nome}</div>
                          <div className="text-xs text-gray-500">
                            {es.serie && `${es.serie} serie`}
                            {es.reps && ` × ${es.reps} reps`}
                            {es.note && ` — ${es.note}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuova scheda atletica</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nome scheda *</label>
                <input className={inp} value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required
                  placeholder="es. Riscaldamento Dinamico Base" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Categoria</label>
                <select className={inp} value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIE.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Descrizione</label>
                <textarea className={inp} rows={2} value={form.descrizione}
                  onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">Esercizi</label>
                  <button type="button" onClick={addEsercizio}
                    className="text-xs text-amber-600 font-semibold">+ Aggiungi</button>
                </div>
                <div className="space-y-2">
                  {form.esercizi.map((es, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 relative">
                      <button type="button" onClick={() => removeEsercizio(idx)}
                        className="absolute top-2 right-2 text-gray-300 hover:text-red-400">
                        <X size={12} />
                      </button>
                      <input className={`${inp} mb-2`} placeholder="Nome esercizio *"
                        value={es.nome} onChange={e => setEsercizio(idx, 'nome', e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inp} placeholder="Serie (es. 3)" type="number"
                          value={es.serie} onChange={e => setEsercizio(idx, 'serie', e.target.value)} />
                        <input className={inp} placeholder="Reps (es. 10)"
                          value={es.reps} onChange={e => setEsercizio(idx, 'reps', e.target.value)} />
                      </div>
                      <input className={`${inp} mt-2`} placeholder="Note"
                        value={es.note} onChange={e => setEsercizio(idx, 'note', e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva scheda'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
