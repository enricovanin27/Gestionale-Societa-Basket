import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, Send, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../../components/LoadingSpinner'

function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'Non registrato', cls: 'bg-gray-100 text-gray-500' }
  const diff = differenceInDays(parseISO(dataScadenza), new Date())
  if (diff < 0)  return { label: `Scaduto ${-diff}gg fa`, cls: 'bg-red-100 text-red-700' }
  if (diff < 30) return { label: `Scade in ${diff}gg`,    cls: 'bg-orange-100 text-orange-700' }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-green-100 text-green-700' }
}

const TABS = [
  { id: 'note',  label: 'Note' },
  { id: 'quote', label: 'Quote' },
  { id: 'cert',  label: 'Certificato' },
]

export default function GiocatoreDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { societaId, displayName } = useAuth()
  const qc = useQueryClient()
  const [activeTab, setActiveTab]   = useState('note')
  const [nuovaNota, setNuovaNota]   = useState('')
  const [editCert, setEditCert]     = useState(false)
  const [certInput, setCertInput]   = useState('')

  const { data: giocatore, isLoading: loadingG } = useQuery({
    queryKey: ['giocatore-detail', id],
    enabled: !!id && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, cert_medico_scadenza')
        .eq('id', id)
        .eq('societa_id', societaId)
        .single()
      return data
    },
  })

  const { data: note = [], isLoading: loadingNote } = useQuery({
    queryKey: ['note-giocatore', id],
    enabled: !!id && activeTab === 'note',
    queryFn: async () => {
      const { data } = await supabase
        .from('note_giocatore')
        .select('id, testo, autore_nome, created_at')
        .eq('giocatore_id', id)
        .eq('societa_id', societaId)
        .order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const { data: quote = [], isLoading: loadingQ } = useQuery({
    queryKey: ['quote-giocatore', id],
    enabled: !!id && activeTab === 'quote',
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, tipo, descrizione, importo, data_scadenza, pagato')
        .eq('giocatore_id', id)
        .eq('societa_id', societaId)
        .order('data_scadenza')
      return data ?? []
    },
  })

  const addNotaMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('note_giocatore').insert([{
        societa_id:   societaId,
        giocatore_id: id,
        testo:        nuovaNota.trim(),
        autore_nome:  displayName,
      }])
      if (error) throw error
    },
    onSuccess: () => {
      setNuovaNota('')
      qc.invalidateQueries({ queryKey: ['note-giocatore', id] })
    },
  })

  const certMut = useMutation({
    mutationFn: async (cert_medico_scadenza) => {
      const { error } = await supabase
        .from('giocatori').update({ cert_medico_scadenza }).eq('id', id).eq('societa_id', societaId)
      if (error) throw error
    },
    onSuccess: () => {
      setEditCert(false)
      qc.invalidateQueries({ queryKey: ['giocatore-detail', id] })
      qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
    },
  })

  if (loadingG) return <div className="pt-8"><LoadingSpinner /></div>
  if (!giocatore) return <div className="px-4 pt-8 text-center text-sm text-gray-400">Giocatore non trovato</div>

  const squadre = [giocatore.squadra, giocatore.squadra2, giocatore.squadra3].filter(Boolean)
  const cert = certStatus(giocatore.cert_medico_scadenza)

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-purple-800 to-purple-600 text-white px-4 pt-10 pb-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-purple-200 mb-3">
          <ChevronLeft size={16} /> Giocatori
        </button>
        <h1 className="text-2xl font-bold">{giocatore.cognome} {giocatore.nome}</h1>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {squadre.map(s => (
            <span key={s} className="text-xs bg-purple-700 text-purple-100 px-2 py-0.5 rounded-full">{s}</span>
          ))}
        </div>
      </div>

      <div className="bg-white border-b flex sticky top-0 z-10">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === t.id ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 py-4 pb-24">
        {activeTab === 'note' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <textarea
                value={nuovaNota}
                onChange={e => setNuovaNota(e.target.value)}
                placeholder="Es. Avvisato per mail il 03/04 — rinnovo certificato..."
                rows={3}
                className="w-full text-sm border-0 outline-none resize-none text-gray-700 placeholder-gray-300"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => addNotaMut.mutate()}
                  disabled={!nuovaNota.trim() || addNotaMut.isPending}
                  className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 active:scale-95 transition-transform"
                >
                  <Send size={12} /> Salva nota
                </button>
              </div>
            </div>
            {loadingNote ? <LoadingSpinner /> : note.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Nessuna nota registrata</p>
            ) : (
              note.map(n => (
                <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-800 leading-relaxed">{n.testo}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {n.autore_nome} · {format(parseISO(n.created_at), 'd MMM yyyy, HH:mm', { locale: it })}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'quote' && (
          <div className="space-y-2">
            {loadingQ ? <LoadingSpinner /> : quote.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Nessuna quota registrata</p>
            ) : (
              quote.map(q => (
                <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{q.descrizione || q.tipo}</p>
                    {q.data_scadenza && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Scadenza: {format(parseISO(q.data_scadenza), 'd MMM yyyy', { locale: it })}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {q.importo != null && <p className="text-sm font-bold text-gray-900">€{q.importo}</p>}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      q.pagato ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {q.pagato ? 'Pagato' : 'Da pagare'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'cert' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">Stato certificato medico</p>
              <span className={`text-sm px-3 py-1 rounded-full font-semibold ${cert.cls}`}>
                {cert.label}
              </span>
              {!editCert ? (
                <button
                  onClick={() => { setEditCert(true); setCertInput(giocatore.cert_medico_scadenza ?? '') }}
                  className="mt-4 flex items-center gap-1.5 text-sm text-purple-600 font-medium"
                >
                  <Plus size={14} /> {giocatore.cert_medico_scadenza ? 'Aggiorna data' : 'Inserisci data'}
                </button>
              ) : (
                <div className="mt-4 space-y-2">
                  <label className="text-xs text-gray-500">Nuova scadenza</label>
                  <input
                    type="date"
                    value={certInput}
                    onChange={e => setCertInput(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => certMut.mutate(certInput || null)}
                      disabled={certMut.isPending}
                      className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                    >
                      Salva
                    </button>
                    <button
                      onClick={() => setEditCert(false)}
                      className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-500"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
