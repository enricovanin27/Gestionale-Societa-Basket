import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const CATEGORIE = ['riscaldamento', 'forza', 'mobilita', 'recupero', 'altro']
const CAT_LABEL = { riscaldamento: 'Riscaldamento', forza: 'Forza', mobilita: 'Mobilità', recupero: 'Recupero', altro: 'Altro' }
const CAT_COLOR = { riscaldamento: 'bg-orange-100 text-orange-800', forza: 'bg-blue-100 text-blue-800', mobilita: 'bg-purple-100 text-purple-800', recupero: 'bg-green-100 text-green-800', altro: 'bg-gray-100 text-gray-700' }
const ESERCIZIO_EMPTY = { nome: '', serie: '', reps: '', carico: '', note: '' }
const FORM_EMPTY = {
  nome: '', categoria: 'riscaldamento', assegna: 'squadra',
  squadra: '', giocatore_id: '', data_inizio: format(new Date(), 'yyyy-MM-dd'), data_fine: '',
  esercizi: [{ ...ESERCIZIO_EMPTY }],
}

export default function SchedeAtletichePage() {
  const { societaId, profile } = useAuth()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

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

  const { data: giocatoriSquadra = [] } = useQuery({
    queryKey: ['giocatori-squadra', societaId, form.squadra],
    enabled: !!societaId && !!form.squadra && form.assegna === 'giocatore',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori').select('id, nome, cognome')
        .eq('societa_id', societaId).eq('squadra', form.squadra).order('cognome')
      return data ?? []
    },
  })

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

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nome) return
    setSaving(true)
    try {
      const { data: scheda, error } = await supabase
        .from('schede_atletiche')
        .insert({
          nome: form.nome,
          categoria: form.categoria,
          esercizi: form.esercizi.filter(es => es.nome),
          societa_id: societaId,
        })
        .select().single()
      if (error) throw error

      const assPayload = {
        scheda_id: scheda.id,
        data_inizio: form.data_inizio,
        data_fine: form.data_fine || null,
        societa_id: societaId,
      }
      if (form.assegna === 'squadra') {
        assPayload.squadra = form.squadra || squadreAssegnate[0]
      } else {
        assPayload.giocatore_id = form.giocatore_id
      }
      const { error: assErr } = await supabase.from('schede_assegnazioni').insert(assPayload)
      if (assErr) throw assErr

      qc.invalidateQueries({ queryKey: ['schede-atletiche', societaId] })
      qc.invalidateQueries({ queryKey: ['schede-giocatore'] })
      setShowModal(false)
      setForm(FORM_EMPTY)
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader title="Schede Atletiche" />

      <div className="p-4 space-y-3">
        {isLoading ? <LoadingSpinner /> : schede.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-16">
            Nessuna scheda. Usa il + per crearne una.
          </p>
        ) : schede.map(scheda => {
          const tags = [...new Set((scheda.assegnazioni ?? []).map(a => a.squadra).filter(Boolean))]
          const isOpen = expanded === scheda.id
          return (
            <div key={scheda.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button className="w-full flex items-center justify-between p-4"
                onClick={() => setExpanded(isOpen ? null : scheda.id)}>
                <div className="text-left">
                  <div className="font-semibold text-gray-900">{scheda.nome}</div>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${CAT_COLOR[scheda.categoria] ?? CAT_COLOR.altro}`}>
                      {CAT_LABEL[scheda.categoria]}
                    </span>
                    {tags.map(t => (
                      <span key={t} className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">{t}</span>
                    ))}
                    <span className="text-[10px] text-gray-400">{scheda.esercizi?.length ?? 0} esercizi</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); deleteMut.mutate(scheda.id) }}
                    className="text-gray-300 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                  {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-50 space-y-2 mt-2">
                  {(scheda.esercizi ?? []).map((es, i) => (
                    <div key={i} className="bg-amber-50 rounded-lg px-3 py-2">
                      <div className="font-medium text-sm text-gray-800">{es.nome}</div>
                      <div className="text-xs text-gray-500">
                        {es.serie && `${es.serie} serie`}
                        {es.reps && ` × ${es.reps} reps`}
                        {es.carico && ` @ ${es.carico} kg`}
                        {es.note && ` — ${es.note}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-amber-500 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={24} />
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuova scheda</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Nome scheda *</label>
                <input className={inp} value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required
                  placeholder="es. Riscaldamento Dinamico Base" />
              </div>

              {/* Categoria pill */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Categoria</label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIE.map(c => (
                    <button key={c} type="button"
                      onClick={() => setForm(f => ({ ...f, categoria: c }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        form.categoria === c
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}>
                      {CAT_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assegna a */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Assegna a</label>
                <div className="flex gap-2">
                  {[['squadra', '👥 Squadra'], ['giocatore', '👤 Giocatore']].map(([v, l]) => (
                    <button key={v} type="button"
                      onClick={() => setForm(f => ({ ...f, assegna: v, giocatore_id: '' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.assegna === v ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                      }`}>{l}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
                <select className={inp} value={form.squadra}
                  onChange={e => setForm(f => ({ ...f, squadra: e.target.value, giocatore_id: '' }))} required>
                  <option value="">Seleziona squadra</option>
                  {squadreAssegnate.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {form.assegna === 'giocatore' && form.squadra && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Giocatore *</label>
                  <select className={inp} value={form.giocatore_id}
                    onChange={e => setForm(f => ({ ...f, giocatore_id: e.target.value }))} required>
                    <option value="">Seleziona giocatore</option>
                    {giocatoriSquadra.map(g => <option key={g.id} value={g.id}>{g.cognome} {g.nome}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Data inizio *</label>
                  <input type="date" className={inp} value={form.data_inizio}
                    onChange={e => setForm(f => ({ ...f, data_inizio: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Data fine</label>
                  <input type="date" className={inp} value={form.data_fine}
                    onChange={e => setForm(f => ({ ...f, data_fine: e.target.value }))} />
                </div>
              </div>

              {/* Esercizi */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">Esercizi</label>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, esercizi: [...f.esercizi, { ...ESERCIZIO_EMPTY }] }))}
                    className="text-xs text-amber-600 font-semibold">+ Aggiungi</button>
                </div>
                <div className="space-y-3">
                  {form.esercizi.map((es, idx) => (
                    <div key={idx} className="bg-amber-50 border border-amber-200 rounded-xl p-3 relative">
                      <button type="button" onClick={() => setForm(f => ({ ...f, esercizi: f.esercizi.filter((_, i) => i !== idx) }))}
                        className="absolute top-2 right-2 text-gray-300 hover:text-red-400">
                        <X size={12} />
                      </button>
                      <div className="text-xs font-semibold text-amber-800 mb-2">Esercizio {idx + 1}</div>
                      <input className={`${inp} mb-2 bg-white`} placeholder="Nome esercizio *"
                        value={es.nome} onChange={e => setEsercizio(idx, 'nome', e.target.value)} />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[9px] text-gray-400 font-semibold mb-1 uppercase">Serie</div>
                          <input type="number" min="1" className={`${inp} bg-white`} placeholder="3"
                            value={es.serie} onChange={e => setEsercizio(idx, 'serie', e.target.value)} />
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-400 font-semibold mb-1 uppercase">Reps</div>
                          <input type="number" min="1" className={`${inp} bg-white`} placeholder="10"
                            value={es.reps} onChange={e => setEsercizio(idx, 'reps', e.target.value)} />
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-400 font-semibold mb-1 uppercase">Carico (kg)</div>
                          <input type="number" step="0.5" className={`${inp} bg-white`} placeholder="—"
                            value={es.carico} onChange={e => setEsercizio(idx, 'carico', e.target.value)} />
                        </div>
                      </div>
                      <input className={`${inp} bg-white mt-2`} placeholder="Note (opzionale)"
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
