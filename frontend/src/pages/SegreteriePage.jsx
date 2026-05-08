import { useState, useMemo } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { Users, AlertTriangle, CheckCircle2, Clock, CreditCard, FileText, Edit2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import AppHeader from '../components/AppHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const today = new Date()
const todayStr = format(today, 'yyyy-MM-dd')

function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'N/D', cls: 'bg-gray-100 text-gray-500', urgente: false }
  const diff = differenceInDays(parseISO(dataScadenza), today)
  if (diff < 0)   return { label: `Scaduto ${-diff}gg fa`, cls: 'bg-red-100 text-red-700',    urgente: true }
  if (diff < 30)  return { label: `Scade in ${diff}gg`,    cls: 'bg-orange-100 text-orange-700', urgente: true }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-green-100 text-green-700', urgente: false }
}


export default function SegreteriePage() {
  const { societaId, displayName, logout, societaNome } = useAuth()
  const [squadraFilter, setSquadraFilter] = useState('')
  const [tab, setTab] = useState('giocatori')

  const { data: giocatori = [], isLoading: loadingG } = useQuery({
    queryKey: ['segreteria-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, cert_medico_scadenza, data_nascita')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: quote = [], isLoading: loadingQ } = useQuery({
    queryKey: ['segreteria-quote', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza, pagato')
        .eq('societa_id', societaId)
        .eq('pagato', false)
        .order('data_scadenza')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const squadreDisponibili = useMemo(() => {
    const set = new Set()
    for (const g of giocatori) {
      if (g.squadra)  set.add(g.squadra)
      if (g.squadra2) set.add(g.squadra2)
      if (g.squadra3) set.add(g.squadra3)
    }
    return [...set].sort()
  }, [giocatori])

  const giocatoriFiltrati = useMemo(() => {
    if (!squadraFilter) return giocatori
    return giocatori.filter(g =>
      g.squadra === squadraFilter || g.squadra2 === squadraFilter || g.squadra3 === squadraFilter
    )
  }, [giocatori, squadraFilter])

  const quoteByGiocatore = useMemo(() => {
    const map = {}
    for (const q of quote) {
      if (!map[q.giocatore_id]) map[q.giocatore_id] = []
      map[q.giocatore_id].push(q)
    }
    return map
  }, [quote])

  const urgenzeGiocatori = useMemo(() =>
    giocatoriFiltrati.filter(g => certStatus(g.cert_medico_scadenza).urgente || (quoteByGiocatore[g.id] ?? []).length > 0),
    [giocatoriFiltrati, quoteByGiocatore]
  )

  const isLoading = loadingG || loadingQ

  const qc = useQueryClient()
  const [editingCert, setEditingCert] = useState(null) // giocatore object | null
  const [certDateInput, setCertDateInput] = useState('')

  const certMut = useMutation({
    mutationFn: async ({ id, cert_medico_scadenza }) => {
      const { error } = await supabase
        .from('giocatori')
        .update({ cert_medico_scadenza: cert_medico_scadenza || null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segreteria-giocatori'] }),
  })

  function openCertEdit(g) {
    certMut.reset()
    setEditingCert(g)
    setCertDateInput(g.cert_medico_scadenza ?? '')
  }

  const pagaMut = useMutation({
    mutationFn: async (quotaId) => {
      const { error } = await supabase
        .from('quote')
        .update({ pagato: true })
        .eq('id', quotaId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segreteria-quote'] }),
  })

  return (
    <div className="pb-20">
      <AppHeader
        title="Segreteria"
        subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {/* Tab bar */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setTab('giocatori')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${tab === 'giocatori' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            <Users size={14} /> Giocatori
          </button>
          <button
            onClick={() => setTab('quote')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${tab === 'quote' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            <CreditCard size={14} /> Quote
            {quote.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                {quote.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="pt-6"><LoadingSpinner /></div>
      ) : tab === 'giocatori' ? (

        /* ── GIOCATORI ── */
        <div className="px-4 space-y-4">

          {/* Filtro squadra */}
          {squadreDisponibili.length > 1 && (
            <select
              value={squadraFilter}
              onChange={e => setSquadraFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Tutte le squadre ({giocatori.length})</option>
              {squadreDisponibili.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Urgenze */}
          {urgenzeGiocatori.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                <AlertTriangle size={12} /> Urgenze ({urgenzeGiocatori.length})
              </p>
              <div className="space-y-2">
                {urgenzeGiocatori.map(g => {
                  const cert = certStatus(g.cert_medico_scadenza)
                  const quoteG = quoteByGiocatore[g.id] ?? []
                  return (
                    <Card key={g.id} className="border-l-4 border-l-red-400">
                      <CardContent className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                        <p className="text-xs text-gray-500 mb-2">{[g.squadra, g.squadra2, g.squadra3].filter(Boolean).join(', ')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cert.urgente && (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cert.cls}`}>
                              <FileText size={10} /> {cert.label}
                              <button onClick={() => openCertEdit(g)} className="ml-0.5 hover:opacity-70">
                                <Edit2 size={9} />
                              </button>
                            </span>
                          )}
                          {quoteG.map(q => (
                            <span key={q.id} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                              q.data_scadenza && q.data_scadenza < todayStr
                                ? 'bg-red-100 text-red-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              <CreditCard size={10} /> {q.descrizione || q.tipo}
                              {q.importo ? ` €${Number(q.importo).toFixed(0)}` : ''}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Lista completa giocatori */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
              Tutti i giocatori ({giocatoriFiltrati.length})
            </p>
            {giocatoriFiltrati.length === 0 ? (
              <Card>
                <CardContent className="flex items-center gap-2 py-5 text-sm text-gray-400">
                  <Users size={16} /> Nessun giocatore
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {giocatoriFiltrati.map(g => {
                  const cert = certStatus(g.cert_medico_scadenza)
                  const quoteG = quoteByGiocatore[g.id] ?? []
                  return (
                    <Card key={g.id}>
                      <CardContent className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                            <p className="text-xs text-gray-500">{[g.squadra, g.squadra2, g.squadra3].filter(Boolean).join(', ')}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${cert.cls}`}>
                                <FileText size={10} /> {cert.label}
                              </span>
                              <button
                                onClick={() => openCertEdit(g)}
                                className="p-0.5 text-gray-400 hover:text-blue-500 transition-colors"
                                title="Modifica data certificato"
                              >
                                <Edit2 size={10} />
                              </button>
                            </div>
                            {quoteG.length > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 flex items-center gap-1">
                                <CreditCard size={10} /> {quoteG.length} quota{quoteG.length > 1 ? 'e' : ''} aperta{quoteG.length > 1 ? '' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      ) : (

        /* ── QUOTE ── */
        <div className="px-4 space-y-4">

          {/* Filtro squadra */}
          {squadreDisponibili.length > 1 && (
            <select
              value={squadraFilter}
              onChange={e => setSquadraFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Tutte le squadre</option>
              {squadreDisponibili.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {quote.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-5 text-sm text-green-600">
                <CheckCircle2 size={16} /> Nessuna quota aperta
              </CardContent>
            </Card>
          ) : (
            (() => {
              const filteredGiocatori = new Set(giocatoriFiltrati.map(g => g.id))
              const quoteFiltrate = squadraFilter
                ? quote.filter(q => filteredGiocatori.has(q.giocatore_id))
                : quote
              const giocatoriMap = Object.fromEntries(giocatori.map(g => [g.id, g]))
              const scadute    = quoteFiltrate.filter(q => q.data_scadenza && q.data_scadenza < todayStr)
              const inScadenza = quoteFiltrate.filter(q => {
                if (!q.data_scadenza) return false
                const diff = differenceInDays(parseISO(q.data_scadenza), today)
                return diff >= 0 && diff < 30
              })
              const altre = quoteFiltrate.filter(q => {
                if (!q.data_scadenza) return true
                return differenceInDays(parseISO(q.data_scadenza), today) >= 30
              })

              function QuotaCard({ q }) {
                const g = giocatoriMap[q.giocatore_id]
                const isScaduta = q.data_scadenza && q.data_scadenza < todayStr
                const diff = q.data_scadenza ? differenceInDays(parseISO(q.data_scadenza), today) : null
                return (
                  <Card className={`border-l-4 ${isScaduta ? 'border-l-red-500' : diff !== null && diff < 30 ? 'border-l-orange-400' : 'border-l-gray-300'}`}>
                    <CardContent className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{g ? `${g.cognome} ${g.nome}` : '–'}</p>
                          {g && <p className="text-xs text-gray-500">{[g.squadra, g.squadra2, g.squadra3].filter(Boolean).join(', ')}</p>}
                          <p className="text-xs text-gray-600 mt-1">{q.descrizione || q.tipo}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {q.importo && <span className="text-sm font-semibold text-gray-900">€{Number(q.importo).toFixed(2)}</span>}
                          {q.data_scadenza && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                              isScaduta ? 'bg-red-100 text-red-700' :
                              diff < 30  ? 'bg-orange-100 text-orange-700' :
                                           'bg-gray-100 text-gray-600'
                            }`}>
                              <Clock size={10} />
                              {isScaduta
                                ? `Scaduta ${-diff}gg fa`
                                : `Scade il ${format(parseISO(q.data_scadenza), 'd MMM', { locale: it })}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
                        <button
                          onClick={() => pagaMut.mutate(q.id)}
                          disabled={pagaMut.isPending}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium active:scale-95 transition-transform disabled:opacity-60"
                        >
                          <CheckCircle2 size={12} /> Segna come pagata
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                )
              }

              return (
                <div className="space-y-4">
                  {scadute.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> Scadute ({scadute.length})
                      </p>
                      <div className="space-y-2">{scadute.map(q => <QuotaCard key={q.id} q={q} />)}</div>
                    </div>
                  )}
                  {inScadenza.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                        <Clock size={12} /> In scadenza ({inScadenza.length})
                      </p>
                      <div className="space-y-2">{inScadenza.map(q => <QuotaCard key={q.id} q={q} />)}</div>
                    </div>
                  )}
                  {altre.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                        Altre quote ({altre.length})
                      </p>
                      <div className="space-y-2">{altre.map(q => <QuotaCard key={q.id} q={q} />)}</div>
                    </div>
                  )}
                </div>
              )
            })()
          )}
        </div>
      )}
      {/* Modal editing cert medico */}
      {editingCert && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setEditingCert(null)}>
          <div className="w-full bg-white rounded-t-2xl p-6 space-y-4 max-w-lg mx-auto" onClick={e => e.stopPropagation()}>
            <div>
              <p className="font-semibold text-gray-900 text-base">Certificato medico</p>
              <p className="text-sm text-gray-500">{editingCert.cognome} {editingCert.nome}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">Data di scadenza</label>
              <input
                type="date"
                value={certDateInput}
                onChange={e => setCertDateInput(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {certDateInput && (
                <button
                  onClick={() => setCertDateInput('')}
                  className="text-xs text-red-400 mt-1"
                >
                  Rimuovi data
                </button>
              )}
            </div>
            {certMut.isError && (
              <p className="text-xs text-red-500">{certMut.error?.message}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditingCert(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 active:scale-95 transition-transform"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  certMut.mutate({ id: editingCert.id, cert_medico_scadenza: certDateInput })
                  setEditingCert(null)
                }}
                disabled={certMut.isPending}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:scale-95 transition-transform disabled:opacity-60"
              >
                {certMut.isPending ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
