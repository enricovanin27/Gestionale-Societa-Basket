import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { Plus, X, Check, Trash2, Printer, ChevronRight, ChevronLeft, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import PagamentoModal from './PagamentoModal'

const TIPI = ['iscrizione', 'mensile', 'trasferta', 'attrezzatura', 'altro']
const TIPO_LABEL = {
  iscrizione: 'Iscrizione', mensile: 'Mensile', trasferta: 'Trasferta',
  attrezzatura: 'Attrezzatura', altro: 'Altro',
}
const FORM_EMPTY = { tipo: 'iscrizione', descrizione: '', importo: '', data_scadenza: '', squadra: '' }

// Semaforo pagamento
function quotaStatus(q) {
  if (q.pagato) return { cls: 'bg-green-100 text-green-700', label: 'Pagato' }
  if (!q.data_scadenza) return { cls: 'bg-gray-100 text-gray-500', label: 'Da pagare' }
  const diff = differenceInDays(parseISO(q.data_scadenza), new Date())
  if (diff < 0)   return { cls: 'bg-red-100 text-red-700',    label: `Scad. ${-diff}gg fa` }
  if (diff <= 15) return { cls: 'bg-yellow-100 text-yellow-700', label: `Scade in ${diff}gg` }
  return { cls: 'bg-gray-100 text-gray-500', label: format(parseISO(q.data_scadenza), 'd MMM', { locale: it }) }
}

export default function QuotePage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const [selectedSquadra, setSelectedSquadra] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)
  const [pagamentoQuota, setPagamentoQuota] = useState(null)

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

  // ── Queries ────────────────────────────────────────────────────────────────────

  const { data: squadre = [], isLoading: loadingS } = useQuery({
    queryKey: ['squadre-segreteria', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(s => s.categoria)
    },
  })

  const { data: allQuote = [], isLoading: loadingQ } = useQuery({
    queryKey: ['quote-segreteria', societaId],
    enabled: !!societaId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza, pagato, metodo_pagamento, data_pagamento, numero_ricevuta, numero_rata, rate_totali')
        .eq('societa_id', societaId)
        .order('data_scadenza', { nullsFirst: false })
      return data ?? []
    },
  })

  const { data: giocatori = [], isLoading: loadingG } = useQuery({
    queryKey: ['segreteria-giocatori', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3')
        .eq('societa_id', societaId).eq('attivo', true).order('cognome')
      return data ?? []
    },
  })

  // ── Derivati ───────────────────────────────────────────────────────────────────

  const giocatoreMap = useMemo(() =>
    Object.fromEntries(giocatori.map(g => [g.id, g])), [giocatori])

  const giocatoriPerSquadra = form.squadra
    ? giocatori.filter(g => g.squadra === form.squadra)
    : []

  // Statistiche per squadra (vista lista)
  const squadraStats = useMemo(() => {
    const result = {}
    for (const s of squadre) {
      const gInSquadra = giocatori.filter(g => g.squadra === s || g.squadra2 === s || g.squadra3 === s)
      const qInSquadra = allQuote.filter(q => {
        const g = giocatoreMap[q.giocatore_id]
        return g && (g.squadra === s || g.squadra2 === s || g.squadra3 === s)
      })
      const daIncassare = qInSquadra.filter(q => !q.pagato).reduce((sum, q) => sum + (q.importo ?? 0), 0)
      const scadute = qInSquadra.filter(q => {
        if (q.pagato || !q.data_scadenza) return false
        return differenceInDays(parseISO(q.data_scadenza), new Date()) < 0
      }).length
      const inScadenza = qInSquadra.filter(q => {
        if (q.pagato || !q.data_scadenza) return false
        const d = differenceInDays(parseISO(q.data_scadenza), new Date())
        return d >= 0 && d <= 15
      }).length
      result[s] = { nGiocatori: gInSquadra.length, daIncassare, scadute, inScadenza }
    }
    return result
  }, [squadre, giocatori, allQuote, giocatoreMap])

  // Giocatori con quote per la vista dettaglio squadra
  const giocatoriInSquadra = useMemo(() => {
    if (!selectedSquadra) return []
    return giocatori
      .filter(g => g.squadra === selectedSquadra || g.squadra2 === selectedSquadra || g.squadra3 === selectedSquadra)
      .map(g => ({
        ...g,
        quote: allQuote
          .filter(q => q.giocatore_id === g.id)
          .sort((a, b) => {
            if (a.pagato !== b.pagato) return a.pagato ? 1 : -1
            const da = a.data_scadenza ?? '9999'
            const db = b.data_scadenza ?? '9999'
            if (da !== db) return da.localeCompare(db)
            return (a.numero_rata ?? 0) - (b.numero_rata ?? 0)
          }),
      }))
  }, [selectedSquadra, giocatori, allQuote])

  // ── Mutations ──────────────────────────────────────────────────────────────────

  const unpagatoMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('quote').update({
        pagato: false, metodo_pagamento: null, data_pagamento: null, numero_ricevuta: null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-segreteria', societaId] })
      qc.invalidateQueries({ queryKey: ['segreteria-quote-aperte', societaId] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('quote').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-segreteria', societaId] })
      qc.invalidateQueries({ queryKey: ['segreteria-quote-aperte', societaId] })
    },
  })

  async function handleBulkCreate(e) {
    e.preventDefault()
    if (!form.squadra || !form.importo || giocatoriPerSquadra.length === 0) return
    setSaving(true)
    try {
      const rows = giocatoriPerSquadra.map(g => ({
        societa_id:    societaId,
        giocatore_id:  g.id,
        tipo:          form.tipo,
        descrizione:   form.descrizione || TIPO_LABEL[form.tipo],
        importo:       parseFloat(form.importo),
        data_scadenza: form.data_scadenza || null,
        pagato:        false,
      }))
      const { error } = await supabase.from('quote').insert(rows)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['quote-segreteria', societaId] })
      qc.invalidateQueries({ queryKey: ['segreteria-quote-aperte', societaId] })
      setShowModal(false)
      setForm(FORM_EMPTY)
    } finally {
      setSaving(false)
    }
  }

  // ── Modal creazione bulk ───────────────────────────────────────────────────────

  const bulkModal = (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Nuova quota per squadra</h2>
          <button onClick={() => { setShowModal(false); setForm(FORM_EMPTY) }}><X size={20} /></button>
        </div>
        <form onSubmit={handleBulkCreate} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Tipo</label>
            <div className="flex gap-2 flex-wrap">
              {TIPI.map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tipo: t }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    form.tipo === t ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Descrizione</label>
            <input className={inp} value={form.descrizione}
              onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
              placeholder={`Es. ${TIPO_LABEL[form.tipo]} 2025/26`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Importo (€) *</label>
              <input type="number" min="0" step="0.01" className={inp} required
                value={form.importo} onChange={e => setForm(f => ({ ...f, importo: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Scadenza</label>
              <input type="date" className={inp} value={form.data_scadenza}
                onChange={e => setForm(f => ({ ...f, data_scadenza: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
            <select className={inp} required value={form.squadra}
              onChange={e => setForm(f => ({ ...f, squadra: e.target.value }))}>
              <option value="">Seleziona squadra</option>
              {squadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {form.squadra && giocatoriPerSquadra.length > 0 && (
              <p className="text-xs text-purple-600 mt-1 font-medium">
                Creerà {giocatoriPerSquadra.length} quote · {giocatoriPerSquadra.map(g => g.cognome).join(', ')}
              </p>
            )}
            {form.squadra && giocatoriPerSquadra.length === 0 && (
              <p className="text-xs text-red-500 mt-1">Nessun giocatore attivo in questa squadra</p>
            )}
          </div>
          <button type="submit" disabled={saving || giocatoriPerSquadra.length === 0}
            className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
            {saving ? 'Creazione...' : `Crea ${giocatoriPerSquadra.length || ''} quote`}
          </button>
        </form>
      </div>
    </div>
  )

  const fab = (
    <button onClick={() => setShowModal(true)}
      className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform">
      <Plus size={24} />
    </button>
  )

  const pagamentoModalEl = pagamentoQuota && (
    <PagamentoModal
      quota={pagamentoQuota}
      giocatore={giocatoreMap[pagamentoQuota.giocatore_id]}
      societaId={societaId}
      onClose={() => {
        setPagamentoQuota(null)
        qc.invalidateQueries({ queryKey: ['quote-segreteria', societaId] })
      }}
    />
  )

  // ── VISTA DETTAGLIO SQUADRA ────────────────────────────────────────────────────

  if (selectedSquadra !== null) {
    return (
      <div>
        <PageHeader title={selectedSquadra} subtitle={`${giocatoriInSquadra.length} atleti`} />

        <div className="px-4 pt-3 pb-2">
          <button onClick={() => setSelectedSquadra(null)}
            className="flex items-center gap-1 text-sm text-purple-600 font-medium">
            <ChevronLeft size={16} /> Tutte le squadre
          </button>
        </div>

        {(loadingQ || loadingG) ? <LoadingSpinner /> : (
          <div className="px-4 space-y-3 pb-28">
            {giocatoriInSquadra.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-16">Nessun giocatore in questa squadra</p>
            )}
            {giocatoriInSquadra.map(g => {
              return (
                <div key={g.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Intestazione giocatore */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                  </div>

                  {g.quote.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-gray-400 italic">Nessuna quota assegnata</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {g.quote.map(q => {
                        const st = quotaStatus(q)
                        const rataLabel = (q.rate_totali ?? 1) > 1
                          ? ` · Rata ${q.numero_rata}/${q.rate_totali}`
                          : ''
                        return (
                          <div key={q.id} className={`px-4 py-2.5 flex items-center gap-2 ${q.pagato ? 'opacity-50' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">
                                {q.descrizione || TIPO_LABEL[q.tipo] || q.tipo}
                                {rataLabel && (
                                  <span className="ml-1 text-purple-500">{rataLabel}</span>
                                )}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-gray-700 shrink-0">€{q.importo}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${st.cls}`}>
                              {st.label}
                            </span>
                            <div className="flex gap-1 shrink-0">
                              {q.pagato ? (
                                <>
                                  {q.numero_ricevuta && (
                                    <a href={`/secretary/ricevuta/${q.id}`} target="_blank" rel="noopener noreferrer"
                                      className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center"
                                      title="Stampa ricevuta">
                                      <Printer size={12} />
                                    </a>
                                  )}
                                  <button onClick={() => unpagatoMut.mutate(q.id)}
                                    className="w-7 h-7 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 flex items-center justify-center"
                                    title="Segna non pagato">
                                    <Check size={12} />
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => setPagamentoQuota(q)}
                                  className="w-7 h-7 rounded-lg bg-green-100 text-green-600 hover:bg-green-200 flex items-center justify-center"
                                  title="Registra pagamento">
                                  <Check size={12} />
                                </button>
                              )}
                              <button onClick={() => deleteMut.mutate(q.id)}
                                className="w-7 h-7 rounded-lg bg-gray-50 text-gray-300 hover:text-red-400 flex items-center justify-center">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {fab}
        {showModal && bulkModal}
        {pagamentoModalEl}
      </div>
    )
  }

  // ── VISTA LISTA SQUADRE ────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Quote" subtitle="Seleziona una squadra" />

      {(loadingS || loadingQ || loadingG) ? <LoadingSpinner /> : (
        <div className="px-4 pt-4 space-y-2 pb-28">
          {squadre.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-16">Nessuna squadra configurata</p>
          )}
          {squadre.map(s => {
            const st = squadraStats[s] ?? {}
            return (
              <button key={s} onClick={() => setSelectedSquadra(s)}
                className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors text-left">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Users size={18} className="text-purple-600" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {st.nGiocatori ?? 0} atleti
                    {(st.daIncassare ?? 0) > 0 && ` · €${st.daIncassare.toFixed(0)} da incassare`}
                  </p>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  {(st.scadute ?? 0) > 0 && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                      {st.scadute} scadut{st.scadute === 1 ? 'a' : 'e'}
                    </span>
                  )}
                  {(st.inScadenza ?? 0) > 0 && (
                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold">
                      {st.inScadenza} in scadenza
                    </span>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
        </div>
      )}

      {fab}
      {showModal && bulkModal}
      {pagamentoModalEl}
    </div>
  )
}
