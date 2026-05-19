import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, X, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { GIORNI, GIORNO_FULL } from '../../lib/constants'

const FORM_FISSO_EMPTY = { giorno: 'lunedi', squadra: '', ora_inizio: '17:00', ora_fine: '18:00' }
const FORM_VAR_EMPTY = { data: format(new Date(), 'yyyy-MM-dd'), squadra: '', ora_inizio: '17:00', ora_fine: '18:00', annullato: false, note: '' }

function overlap(a, b) {
  return a.ora_inizio < b.ora_fine && a.ora_fine > b.ora_inizio
}

export default function SpaziPage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [spazioId, setSpazioId] = useState(null)
  const [showNuovoSpazio, setShowNuovoSpazio] = useState(false)
  const [showSlotFisso, setShowSlotFisso] = useState(false)
  const [showVariazione, setShowVariazione] = useState(false)
  const [nomeSpazio, setNomeSpazio] = useState('')
  const [tipoSpazio, setTipoSpazio] = useState('sala_pesi')
  const [formFisso, setFormFisso] = useState(FORM_FISSO_EMPTY)
  const [formVar, setFormVar] = useState(FORM_VAR_EMPTY)

  const { data: spazi = [], isLoading: loadingSpazi } = useQuery({
    queryKey: ['spazi-atletici', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_atletici').select('*')
        .eq('societa_id', societaId).order('nome')
      if (data && data.length > 0 && !spazioId) setSpazioId(data[0].id)
      return data ?? []
    },
  })

  const spazioSel = spazi.find(s => s.id === spazioId)

  const { data: slotFissi = [] } = useQuery({
    queryKey: ['spazi-orario-fisso', societaId, spazioId],
    enabled: !!societaId && !!spazioId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_orario_fisso').select('*')
        .eq('societa_id', societaId).eq('spazio_id', spazioId)
        .order('giorno').order('ora_inizio')
      return data ?? []
    },
  })

  const { data: variazioni = [] } = useQuery({
    queryKey: ['spazi-orario-settimana', societaId, spazioId],
    enabled: !!societaId && !!spazioId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('spazi_orario_settimana').select('*')
        .eq('societa_id', societaId).eq('spazio_id', spazioId)
        .gte('data', format(new Date(), 'yyyy-MM-dd'))
        .order('data').order('ora_inizio')
      return data ?? []
    },
  })

  function conflictiFissi() {
    const conflicts = []
    for (let i = 0; i < slotFissi.length; i++) {
      for (let j = i + 1; j < slotFissi.length; j++) {
        if (slotFissi[i].giorno === slotFissi[j].giorno && overlap(slotFissi[i], slotFissi[j])) {
          conflicts.push({ a: slotFissi[i], b: slotFissi[j] })
        }
      }
    }
    return conflicts
  }

  const addSpaziMut = useMutation({
    mutationFn: async ({ nome, tipo }) => {
      const { data, error } = await supabase
        .from('spazi_atletici').insert({ nome, tipo, societa_id: societaId }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['spazi-atletici', societaId] })
      setSpazioId(data.id)
      setShowNuovoSpazio(false)
      setNomeSpazio('')
    },
  })

  const addFissoMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('spazi_orario_fisso').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spazi-orario-fisso', societaId, spazioId] })
      setShowSlotFisso(false)
      setFormFisso(FORM_FISSO_EMPTY)
    },
  })

  const deleteFissoMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('spazi_orario_fisso').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spazi-orario-fisso', societaId, spazioId] }),
  })

  const addVarMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('spazi_orario_settimana').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spazi-orario-settimana', societaId, spazioId] })
      setShowVariazione(false)
      setFormVar(FORM_VAR_EMPTY)
    },
  })

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'
  const conflicts = conflictiFissi()

  return (
    <div>
      <PageHeader title="Spazi atletici" />

      <div className="p-4">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {spazi.map(s => (
            <button key={s.id}
              onClick={() => setSpazioId(s.id)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                s.id === spazioId ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
              {s.nome}
            </button>
          ))}
          <button onClick={() => setShowNuovoSpazio(true)}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            + Spazio
          </button>
        </div>

        {loadingSpazi ? <LoadingSpinner /> : !spazioSel ? (
          <p className="text-center text-gray-400 text-sm py-8">Aggiungi il primo spazio atletico</p>
        ) : (
          <>
            {conflicts.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertCircle size={14} className="text-red-600" />
                  <span className="text-xs font-bold text-red-800">Conflitti rilevati</span>
                </div>
                {conflicts.map((c, i) => (
                  <div key={i} className="text-xs text-red-600">
                    {GIORNO_FULL[c.a.giorno]}: {c.a.squadra} ({c.a.ora_inizio.slice(0,5)}–{c.a.ora_fine.slice(0,5)}) ↔ {c.b.squadra} ({c.b.ora_inizio.slice(0,5)}–{c.b.ora_fine.slice(0,5)})
                  </div>
                ))}
              </div>
            )}

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Orario fisso</span>
                <button onClick={() => setShowSlotFisso(true)}
                  className="text-xs text-amber-600 font-semibold">+ Slot fisso</button>
              </div>
              {slotFissi.length === 0 ? (
                <p className="text-xs text-gray-400">Nessuno slot fisso</p>
              ) : (
                <div className="space-y-1">
                  {slotFissi.map(s => (
                    <div key={s.id} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">{GIORNO_FULL[s.giorno]}</span>
                        {' '}{s.ora_inizio.slice(0,5)}–{s.ora_fine.slice(0,5)}
                        {' '}<span className="text-amber-700 font-semibold">{s.squadra}</span>
                      </div>
                      <button onClick={() => deleteFissoMut.mutate(s.id)}
                        className="text-gray-300 hover:text-red-400 p-1"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Variazioni imminenti</span>
                <button onClick={() => setShowVariazione(true)}
                  className="text-xs text-amber-600 font-semibold">+ Variazione</button>
              </div>
              {variazioni.length === 0 ? (
                <p className="text-xs text-gray-400">Nessuna variazione</p>
              ) : (
                <div className="space-y-1">
                  {variazioni.map(v => (
                    <div key={v.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${v.annullato ? 'bg-red-50 line-through text-gray-400' : 'bg-blue-50'}`}>
                      <div className="text-sm">
                        <span className="font-medium">{format(new Date(v.data + 'T00:00:00'), 'dd/MM')}</span>
                        {' '}{v.ora_inizio.slice(0,5)}–{v.ora_fine.slice(0,5)}
                        {' '}<span className="text-blue-700 font-semibold">{v.squadra}</span>
                        {v.note && <span className="text-xs text-gray-400 ml-1">— {v.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showNuovoSpazio && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuovo spazio</h2>
              <button onClick={() => setShowNuovoSpazio(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input className={inp} placeholder="Nome spazio (es. Sala Pesi)" value={nomeSpazio}
                onChange={e => setNomeSpazio(e.target.value)} />
              <select className={inp} value={tipoSpazio} onChange={e => setTipoSpazio(e.target.value)}>
                <option value="sala_pesi">Sala Pesi</option>
                <option value="palestra">Palestra</option>
                <option value="altro">Altro</option>
              </select>
              <button onClick={() => nomeSpazio && addSpaziMut.mutate({ nome: nomeSpazio, tipo: tipoSpazio })}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm">
                Aggiungi spazio
              </button>
            </div>
          </div>
        </div>
      )}

      {showSlotFisso && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuovo slot fisso — {spazioSel?.nome}</h2>
              <button onClick={() => setShowSlotFisso(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <select className={inp} value={formFisso.giorno}
                onChange={e => setFormFisso(f => ({ ...f, giorno: e.target.value }))}>
                {GIORNI.map(g => <option key={g} value={g}>{GIORNO_FULL[g]}</option>)}
              </select>
              <input className={inp} placeholder="Squadra" value={formFisso.squadra}
                onChange={e => setFormFisso(f => ({ ...f, squadra: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input type="time" className={inp} value={formFisso.ora_inizio}
                  onChange={e => setFormFisso(f => ({ ...f, ora_inizio: e.target.value }))} />
                <input type="time" className={inp} value={formFisso.ora_fine}
                  onChange={e => setFormFisso(f => ({ ...f, ora_fine: e.target.value }))} />
              </div>
              <button
                onClick={() => formFisso.squadra && addFissoMut.mutate({ ...formFisso, spazio_id: spazioId, societa_id: societaId })}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm">
                Aggiungi slot
              </button>
            </div>
          </div>
        </div>
      )}

      {showVariazione && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Variazione — {spazioSel?.nome}</h2>
              <button onClick={() => setShowVariazione(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input type="date" className={inp} value={formVar.data}
                onChange={e => setFormVar(f => ({ ...f, data: e.target.value }))} />
              <input className={inp} placeholder="Squadra" value={formVar.squadra}
                onChange={e => setFormVar(f => ({ ...f, squadra: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input type="time" className={inp} value={formVar.ora_inizio}
                  onChange={e => setFormVar(f => ({ ...f, ora_inizio: e.target.value }))} />
                <input type="time" className={inp} value={formVar.ora_fine}
                  onChange={e => setFormVar(f => ({ ...f, ora_fine: e.target.value }))} />
              </div>
              <input className={inp} placeholder="Note (opzionale)" value={formVar.note}
                onChange={e => setFormVar(f => ({ ...f, note: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={formVar.annullato}
                  onChange={e => setFormVar(f => ({ ...f, annullato: e.target.checked }))} />
                Slot annullato
              </label>
              <button
                onClick={() => formVar.squadra && addVarMut.mutate({ ...formVar, spazio_id: spazioId, societa_id: societaId })}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm">
                Salva variazione
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
