import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, X, Settings, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const DEFAULT_TESTS = [
  { nome: 'Sprint 20m', unita: 'secondi', ordine: 0 },
  { nome: 'Salto verticale', unita: 'cm', ordine: 1 },
  { nome: 'Shuttle run', unita: 'secondi', ordine: 2 },
  { nome: 'Yo-Yo', unita: 'livello', ordine: 3 },
]

export default function TestFisiciPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [squadraFiltro, setSquadraFiltro] = useState('')
  const [testFiltro, setTestFiltro] = useState('')
  const [showRisultatiModal, setShowRisultatiModal] = useState(false)
  const [showGestisciModal, setShowGestisciModal] = useState(false)
  const [formRis, setFormRis] = useState({ giocatore_id: '', valore: '', data: format(new Date(), 'yyyy-MM-dd'), note: '' })
  const [newTestNome, setNewTestNome] = useState('')
  const [newTestUnita, setNewTestUnita] = useState('')
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

  const { data: testDef = [] } = useQuery({
    queryKey: ['test-definizioni', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('test_definizioni').select('*')
        .eq('societa_id', societaId).order('ordine')
      if (data && data.length === 0) {
        const inserts = DEFAULT_TESTS.map(t => ({ ...t, societa_id: societaId }))
        const { data: seeded } = await supabase.from('test_definizioni').insert(inserts).select()
        return seeded ?? []
      }
      return data ?? []
    },
  })

  const { data: risultati = [], isLoading: loadingRis } = useQuery({
    queryKey: ['test-risultati', societaId, testFiltro],
    enabled: !!societaId && !!testFiltro,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('test_risultati')
        .select('id, valore, data, giocatore:giocatore_id(id, nome, cognome, squadra)')
        .eq('societa_id', societaId)
        .eq('test_id', testFiltro)
        .order('data')
      return data ?? []
    },
  })

  const squadre = useMemo(() => [...new Set(giocatori.map(g => g.squadra))].sort(), [giocatori])

  const giocatoriFiltrati = useMemo(() =>
    squadraFiltro ? giocatori.filter(g => g.squadra === squadraFiltro) : giocatori,
    [giocatori, squadraFiltro]
  )

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

  const colDate = useMemo(() => {
    const dates = [...new Set(risultati.map(r => r.data))].sort()
    return dates.slice(-4)
  }, [risultati])

  function trend(valori) {
    const vals = colDate.map(d => valori[d]).filter(v => v != null)
    if (vals.length < 2) return '—'
    const testSel = testDef.find(t => t.id === parseInt(testFiltro))
    const unitaTemporale = testSel?.unita === 'secondi'
    const diff = vals[vals.length - 1] - vals[vals.length - 2]
    const migliora = unitaTemporale ? diff < 0 : diff > 0
    return migliora
      ? <span className="text-green-600 font-bold">▼</span>
      : <span className="text-red-500 font-bold">▲</span>
  }

  const insertRisMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('test_risultati').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-risultati', societaId] })
      setShowRisultatiModal(false)
      setFormRis({ giocatore_id: '', valore: '', data: format(new Date(), 'yyyy-MM-dd'), note: '' })
    },
  })

  const addTestMut = useMutation({
    mutationFn: async ({ nome, unita }) => {
      const { error } = await supabase.from('test_definizioni')
        .insert({ nome, unita, ordine: testDef.length, societa_id: societaId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-definizioni', societaId] })
      setNewTestNome('')
      setNewTestUnita('')
    },
  })

  const deleteTestMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('test_definizioni').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      if (testFiltro === String(id)) setTestFiltro('')
      qc.invalidateQueries({ queryKey: ['test-definizioni', societaId] })
    },
  })

  async function handleSaveRisultato(e) {
    e.preventDefault()
    if (!formRis.giocatore_id || !formRis.valore || !testFiltro) return
    setSaving(true)
    try {
      await insertRisMut.mutateAsync({
        giocatore_id: formRis.giocatore_id,
        test_id: parseInt(testFiltro),
        valore: parseFloat(formRis.valore),
        data: formRis.data,
        note: formRis.note || null,
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
        title="Test Fisici"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowGestisciModal(true)}
              className="p-1.5 bg-white/20 rounded-lg"><Settings size={16} /></button>
            <button onClick={() => testFiltro ? setShowRisultatiModal(true) : alert('Seleziona prima un tipo di test')}
              className="flex items-center gap-1 bg-white text-amber-700 text-xs font-semibold px-2 py-1.5 rounded-xl shadow-sm">
              <Plus size={14} /> Risultati
            </button>
          </div>
        }
      />

      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          <select className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={squadraFiltro} onChange={e => setSquadraFiltro(e.target.value)}>
            <option value="">Tutte le squadre</option>
            {squadre.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={testFiltro} onChange={e => setTestFiltro(e.target.value)}>
            <option value="">Seleziona test</option>
            {testDef.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>

        {!testFiltro ? (
          <p className="text-center text-gray-400 text-sm py-8">Seleziona un tipo di test per vedere i risultati</p>
        ) : loadingRis ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-amber-50">
                  <th className="text-left p-2 text-amber-900 font-semibold text-xs">Giocatore</th>
                  {colDate.map(d => (
                    <th key={d} className="p-2 text-amber-900 font-semibold text-xs">
                      {format(new Date(d + 'T00:00:00'), 'd/MM')}
                    </th>
                  ))}
                  <th className="p-2 text-amber-900 font-semibold text-xs">Trend</th>
                </tr>
              </thead>
              <tbody>
                {pivot
                  .filter(row => !squadraFiltro || row.giocatore?.squadra === squadraFiltro)
                  .map(row => (
                    <tr key={row.giocatore?.id} className="border-b border-amber-50">
                      <td className="p-2 font-medium text-gray-800">
                        {row.giocatore?.cognome} {row.giocatore?.nome?.charAt(0)}.
                      </td>
                      {colDate.map(d => (
                        <td key={d} className="p-2 text-center text-gray-600">
                          {row.valori[d] != null ? row.valori[d] : '—'}
                        </td>
                      ))}
                      <td className="p-2 text-center">{trend(row.valori)}</td>
                    </tr>
                  ))
                }
                {pivot.filter(row => !squadraFiltro || row.giocatore?.squadra === squadraFiltro).length === 0 && (
                  <tr><td colSpan={colDate.length + 2} className="text-center text-gray-400 py-6 text-sm">
                    Nessun risultato per questo test
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRisultatiModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Inserisci risultato</h2>
              <button onClick={() => setShowRisultatiModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveRisultato} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Giocatore *</label>
                <select className={inp} value={formRis.giocatore_id}
                  onChange={e => setFormRis(f => ({ ...f, giocatore_id: e.target.value }))} required>
                  <option value="">Seleziona giocatore</option>
                  {giocatoriFiltrati.map(g => (
                    <option key={g.id} value={g.id}>{g.cognome} {g.nome} — {g.squadra}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  Valore ({testDef.find(t => t.id === parseInt(testFiltro))?.unita ?? ''}) *
                </label>
                <input type="number" step="0.01" className={inp} value={formRis.valore}
                  onChange={e => setFormRis(f => ({ ...f, valore: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
                <input type="date" className={inp} value={formRis.data}
                  onChange={e => setFormRis(f => ({ ...f, data: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <input className={inp} value={formRis.note}
                  onChange={e => setFormRis(f => ({ ...f, note: e.target.value }))} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva risultato'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showGestisciModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Gestisci tipi di test</h2>
              <button onClick={() => setShowGestisciModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-2 mb-4">
              {testDef.map(t => (
                <div key={t.id} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{t.nome}</span>
                    <span className="text-xs text-gray-400 ml-2">({t.unita})</span>
                  </div>
                  <button onClick={() => deleteTestMut.mutate(t.id)}
                    className="text-gray-400 hover:text-red-500 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-medium text-gray-500">Aggiungi nuovo tipo</p>
              <input className={inp} placeholder="Nome test" value={newTestNome}
                onChange={e => setNewTestNome(e.target.value)} />
              <input className={inp} placeholder="Unità (es. secondi, cm, livello)" value={newTestUnita}
                onChange={e => setNewTestUnita(e.target.value)} />
              <button
                onClick={() => newTestNome && newTestUnita && addTestMut.mutate({ nome: newTestNome, unita: newTestUnita })}
                className="w-full py-2 bg-amber-500 text-white rounded-xl font-semibold text-sm">
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
