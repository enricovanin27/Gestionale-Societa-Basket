import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, differenceInDays, endOfMonth } from 'date-fns'
import { it } from 'date-fns/locale'
import { Plus, X, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Printer, Users } from 'lucide-react'
import { usePrintWindow } from '../../hooks/usePrintWindow'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const TIPI = ['iscrizione', 'mensile', 'trasferta', 'attrezzatura', 'altro']
const TIPO_LABEL = {
  iscrizione: 'Iscrizione', mensile: 'Mensile', trasferta: 'Trasferta',
  attrezzatura: 'Attrezzatura', altro: 'Altro',
}
const FORM_EMPTY = {
  tipo: 'iscrizione', descrizione: '', squadra: '',
  rate_totali: 1,
  rate: [
    { importo: '', scadenza: '' },
    { importo: '', scadenza: '' },
    { importo: '', scadenza: '' },
  ],
}

function quotaStatusDot(q) {
  if (q.pagato) return 'bg-green-500'
  if (!q.data_scadenza) return 'bg-gray-300'
  const diff = differenceInDays(parseISO(q.data_scadenza), new Date())
  if (diff < 0)   return 'bg-red-500'
  if (diff <= 15) return 'bg-yellow-400'
  return 'bg-gray-300'
}

function quotaStatusLabel(q) {
  if (q.pagato) return { cls: 'bg-green-100 text-green-700', label: 'Pagato' }
  if (!q.data_scadenza) return { cls: 'bg-gray-100 text-gray-500', label: 'Da pagare' }
  const diff = differenceInDays(parseISO(q.data_scadenza), new Date())
  if (diff < 0)   return { cls: 'bg-red-100 text-red-700',       label: `Scad. ${-diff}gg fa` }
  if (diff <= 15) return { cls: 'bg-yellow-100 text-yellow-700', label: `Scade in ${diff}gg` }
  return { cls: 'bg-gray-100 text-gray-500', label: format(parseISO(q.data_scadenza), 'd MMM', { locale: it }) }
}

export default function QuotePage() {
  const { societaId } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [selectedSquadra, setSelectedSquadra] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_EMPTY)
  const [saving, setSaving] = useState(false)

  // ── Resoconto ─────────────────────────────────────────────────────────────────
  const printWindow = usePrintWindow()
  const today = new Date()
  const [resoOpen,  setResoOpen]  = useState(false)
  const [resoAnno,  setResoAnno]  = useState(today.getFullYear())
  const [resoMese,  setResoMese]  = useState(today.getMonth() + 1)

  const meseStart = `${resoAnno}-${String(resoMese).padStart(2, '0')}-01`
  const meseEnd   = format(endOfMonth(new Date(resoAnno, resoMese - 1, 1)), 'yyyy-MM-dd')
  const meseLabel = format(new Date(resoAnno, resoMese - 1, 1), 'MMMM yyyy', { locale: it })
  const isFuture  = new Date(resoAnno, resoMese - 1, 1) > today

  const METODO_LABEL = { contanti: 'Contanti', bonifico: 'Bonifico', pos: 'POS / Carta' }

  const { data: pagamentiReso = [], isLoading: loadingReso } = useQuery({
    queryKey: ['resoconto-pagamenti', societaId, resoAnno, resoMese],
    enabled: !!societaId && resoOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select(`
          id, tipo, descrizione, importo, data_pagamento, metodo_pagamento, numero_ricevuta,
          giocatore_id,
          giocatori!inner(nome, cognome, squadra)
        `)
        .eq('societa_id', societaId)
        .eq('pagato', true)
        .gte('data_pagamento', meseStart)
        .lte('data_pagamento', meseEnd)
        .order('data_pagamento')
        .order('numero_ricevuta', { ascending: true, nullsFirst: false })
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const totaleReso = pagamentiReso.reduce((s, p) => s + (p.importo ?? 0), 0)

  function prevMeseReso() {
    if (resoMese === 1) { setResoMese(12); setResoAnno(a => a - 1) }
    else setResoMese(m => m - 1)
  }
  function nextMeseReso() {
    if (resoMese === 12) { setResoMese(1); setResoAnno(a => a + 1) }
    else setResoMese(m => m + 1)
  }

  function printResoconto() {
    const rows = pagamentiReso.map(p => {
      const g = p.giocatori
      const numRic = p.numero_ricevuta
        ? `${resoAnno}-${String(p.numero_ricevuta).padStart(4, '0')}`
        : '—'
      return '<tr>' +
        '<td>' + numRic + '</td>' +
        '<td>' + (g ? g.cognome + ' ' + g.nome : '—') + '</td>' +
        '<td>' + (g?.squadra ?? '—') + '</td>' +
        '<td>' + (p.descrizione ?? p.tipo ?? '—') + '</td>' +
        '<td>' + (METODO_LABEL[p.metodo_pagamento] ?? '—') + '</td>' +
        '<td>' + (p.data_pagamento ? format(parseISO(p.data_pagamento), 'd/MM/yyyy') : '—') + '</td>' +
        '<td class="right">€ ' + (p.importo ?? 0).toFixed(2) + '</td>' +
        '</tr>'
    }).join('')
    printWindow(
      'Resoconto Pagamenti — ' + meseLabel,
      '<table><thead><tr><th>Ricevuta</th><th>Giocatore</th><th>Squadra</th>' +
      '<th>Descrizione</th><th>Metodo</th><th>Data</th><th>Importo</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p class="summary">Totale incassato: € ' + totaleReso.toFixed(2) +
      ' — ' + pagamentiReso.length + ' pagamenti</p>',
      ''
    )
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

  // ── Queries ──────────────────────────────────────────────────────────────────

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
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza, pagato, numero_rata, rate_totali')
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

  // ── Derivati ─────────────────────────────────────────────────────────────────

  const giocatoreMap = useMemo(() =>
    Object.fromEntries(giocatori.map(g => [g.id, g])), [giocatori])

  const giocatoriPerSquadra = form.squadra
    ? giocatori.filter(g => g.squadra === form.squadra)
    : []

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

  // ── Bulk creation ─────────────────────────────────────────────────────────────

  async function handleBulkCreate(e) {
    e.preventDefault()
    const rateAttive = form.rate.slice(0, form.rate_totali)
    if (!form.squadra || rateAttive.some(r => !r.importo) || giocatoriPerSquadra.length === 0) return
    setSaving(true)
    try {
      const rows = []
      for (const g of giocatoriPerSquadra) {
        for (let i = 0; i < form.rate_totali; i++) {
          rows.push({
            societa_id:    societaId,
            giocatore_id:  g.id,
            tipo:          form.tipo,
            descrizione:   form.descrizione || TIPO_LABEL[form.tipo],
            importo:       parseFloat(rateAttive[i].importo),
            data_scadenza: rateAttive[i].scadenza || null,
            pagato:        false,
            numero_rata:   form.rate_totali > 1 ? i + 1 : null,
            rate_totali:   form.rate_totali > 1 ? form.rate_totali : null,
          })
        }
      }
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

  // ── Modal creazione bulk ──────────────────────────────────────────────────────

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
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Modalità pagamento</label>
            <div className="flex gap-2 mb-3">
              {[1, 2, 3].map(n => (
                <button key={n} type="button"
                  onClick={() => setForm(f => ({ ...f, rate_totali: n }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    form.rate_totali === n
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {n === 1 ? 'Unica' : `${n} rate`}
                </button>
              ))}
            </div>
            {Array.from({ length: form.rate_totali }, (_, i) => (
              <div key={i} className="space-y-1 mb-3">
                {form.rate_totali > 1 && (
                  <p className="text-xs font-semibold text-purple-600">Rata {i + 1}/{form.rate_totali}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Importo (€) *</label>
                    <input type="number" min="0" step="0.01" className={inp} required
                      value={form.rate[i].importo}
                      onChange={e => setForm(f => {
                        const rate = [...f.rate]
                        rate[i] = { ...rate[i], importo: e.target.value }
                        return { ...f, rate }
                      })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Scadenza</label>
                    <input type="date" className={inp}
                      value={form.rate[i].scadenza}
                      onChange={e => setForm(f => {
                        const rate = [...f.rate]
                        rate[i] = { ...rate[i], scadenza: e.target.value }
                        return { ...f, rate }
                      })} />
                  </div>
                </div>
              </div>
            ))}
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
                Creerà {giocatoriPerSquadra.length * form.rate_totali} record
                {form.rate_totali > 1 ? ` (${form.rate_totali} rate × ${giocatoriPerSquadra.length} giocatori)` : ` · ${giocatoriPerSquadra.map(g => g.cognome).join(', ')}`}
              </p>
            )}
            {form.squadra && (() => {
              const sec = giocatori.filter(g => g.squadra2 === form.squadra || g.squadra3 === form.squadra)
              return sec.length > 0 ? (
                <p className="text-xs text-amber-600 mt-1">
                  ℹ️ {sec.length} giocator{sec.length > 1 ? 'i hanno' : 'e ha'} {form.squadra} come squadra secondaria e non ricever{sec.length > 1 ? 'anno' : 'à'} questa quota automaticamente. Aggiungila dalla scheda individuale se necessario.
                </p>
              ) : null
            })()}
            {form.squadra && giocatoriPerSquadra.length === 0 && (
              <p className="text-xs text-red-500 mt-1">Nessun giocatore attivo in questa squadra</p>
            )}
          </div>
          <button type="submit" disabled={saving || giocatoriPerSquadra.length === 0}
            className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
            {saving
              ? 'Creazione...'
              : form.rate_totali > 1
                ? `Crea ${form.rate_totali} rate × ${giocatoriPerSquadra.length || 0} giocatori`
                : `Crea ${giocatoriPerSquadra.length || ''} quote`
            }
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

  // ── VISTA DETTAGLIO SQUADRA ───────────────────────────────────────────────────

  if (selectedSquadra !== null) {
    return (
      <div>
        <PageHeader title={selectedSquadra} subtitle={`${giocatoriInSquadra.length} atleti · solo visualizzazione`} />

        <div className="px-4 pt-3 pb-2">
          <button onClick={() => setSelectedSquadra(null)}
            className="flex items-center gap-1 text-sm text-purple-600 font-medium">
            <ChevronLeft size={16} /> Tutte le squadre
          </button>
        </div>

        <p className="px-4 pb-2 text-xs text-gray-400 italic">
          Per registrare i pagamenti vai nella scheda del giocatore → Quote.
        </p>

        {(loadingQ || loadingG) ? <LoadingSpinner /> : (
          <div className="px-4 space-y-3 pb-28">
            {giocatoriInSquadra.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-16">Nessun giocatore in questa squadra</p>
            )}
            {giocatoriInSquadra.map(g => (
              <div key={g.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Intestazione giocatore — clicca per aprire il dettaglio */}
                <button
                  onClick={() => navigate(`/secretary/giocatori/${g.id}`, { state: { tab: 'quote' } })}
                  className="w-full px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between hover:bg-purple-50 transition-colors text-left">
                  <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                  <span className="flex items-center gap-1 text-xs text-purple-600 font-medium">
                    Gestisci <ChevronRight size={14} />
                  </span>
                </button>

                {g.quote.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400 italic">Nessuna quota assegnata</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {g.quote.map(q => {
                      const dot = quotaStatusDot(q)
                      const st  = quotaStatusLabel(q)
                      const rataLabel = (q.rate_totali ?? 1) > 1
                        ? ` · Rata ${q.numero_rata}/${q.rate_totali}`
                        : ''
                      return (
                        <div key={q.id} className={`px-4 py-2.5 flex items-center gap-2 ${q.pagato ? 'opacity-50' : ''}`}>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">
                              {q.descrizione || TIPO_LABEL[q.tipo] || q.tipo}
                              {rataLabel && <span className="ml-1 text-purple-500">{rataLabel}</span>}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-gray-700 shrink-0">€{q.importo}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${st.cls}`}>
                            {st.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {fab}
        {showModal && bulkModal}
      </div>
    )
  }

  // ── VISTA LISTA SQUADRE ───────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Quote Squadre" subtitle="Panoramica pagamenti" />

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
                  {(st.scadute ?? 0) === 0 && (st.inScadenza ?? 0) === 0 && (st.daIncassare ?? 0) === 0 && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                      In ordine ✓
                    </span>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
        </div>
      )}

      {/* ── Sezione Resoconto ──────────────────────────────────────────────── */}
      <div className="px-4 pb-6 mt-4">
        <button
          onClick={() => setResoOpen(v => !v)}
          className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
              <Printer size={16} className="text-purple-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Riepilogo mensile</p>
              <p className="text-xs text-gray-400">Pagamenti registrati per periodo</p>
            </div>
          </div>
          {resoOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {resoOpen && (
          <div className="mt-3 space-y-3">
            {/* Selettore mese */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
              <button onClick={prevMeseReso} className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-transform">
                <ChevronLeft size={18} className="text-gray-600" />
              </button>
              <div className="text-center">
                <p className="text-sm font-bold text-gray-900 capitalize">{meseLabel}</p>
                <p className="text-xs text-gray-400">
                  {loadingReso ? '…' : `${pagamentiReso.length} pagamenti`}
                </p>
              </div>
              <button onClick={nextMeseReso} disabled={isFuture}
                className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-transform disabled:opacity-30">
                <ChevronRight size={18} className="text-gray-600" />
              </button>
            </div>

            {loadingReso ? (
              <p className="text-center text-xs text-gray-400 py-4">Caricamento...</p>
            ) : pagamentiReso.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6 capitalize">
                Nessun pagamento registrato in {meseLabel}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-xs text-purple-500 font-medium uppercase tracking-wider">Totale incassato</p>
                    <p className="text-xl font-extrabold text-purple-700">€ {totaleReso.toFixed(2)}</p>
                  </div>
                  <button onClick={printResoconto}
                    className="flex items-center gap-2 bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-semibold active:scale-95 transition-transform">
                    <Printer size={14} /> Stampa tutto
                  </button>
                </div>
                <div className="space-y-2">
                  {pagamentiReso.map(p => {
                    const g = p.giocatori
                    const numRic = p.numero_ricevuta
                      ? `${resoAnno}-${String(p.numero_ricevuta).padStart(4, '0')}`
                      : null
                    const dataPag = p.data_pagamento
                      ? format(parseISO(p.data_pagamento), 'd MMM', { locale: it })
                      : '—'
                    return (
                      <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {g ? `${g.cognome} ${g.nome}` : 'Sconosciuto'}
                          </p>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{p.descrizione ?? p.tipo}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-gray-400">{dataPag}</span>
                            {g?.squadra && <span className="text-[11px] text-gray-400">· {g.squadra}</span>}
                            {p.metodo_pagamento && (
                              <span className="text-[11px] text-gray-400">· {METODO_LABEL[p.metodo_pagamento] ?? p.metodo_pagamento}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-900">€ {(p.importo ?? 0).toFixed(2)}</p>
                          {numRic && (
                            <button onClick={() => { const url = `/secretary/ricevuta/${p.id}`; const win = window.open(url, '_blank'); if (!win) window.location.href = url }}
                              className="flex items-center gap-0.5 text-[10px] text-purple-500 hover:text-purple-700 mt-0.5 ml-auto">
                              <Printer size={10} /> {numRic}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {fab}
      {showModal && bulkModal}
    </div>
  )
}
