import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ChevronLeft, Users, Plus, X, Phone, Mail } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { certStatus } from '../../utils/certStatus'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import GiocatoreWizard from './GiocatoreWizard'

export default function GiocatoriPage() {
  const { societaId, displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()
  const [selectedSquadra, setSelectedSquadra] = useState(null)
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  // Tutte le squadre dalla tabella squadre (gestite dall'admin)
  const { data: squadre = [], isLoading: loadingSquadre } = useQuery({
    queryKey: ['squadre-segreteria', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('squadre')
        .select('categoria')
        .eq('societa_id', societaId)
        .order('categoria')
      return (data ?? []).map(s => s.categoria)
    },
    staleTime: 5 * 60 * 1000,
  })

  // Quote non pagate per giocatore (per badge visivo)
  const { data: quoteMap = {} } = useQuery({
    queryKey: ['quote-nonpagate-map', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('giocatore_id')
        .eq('societa_id', societaId)
        .eq('pagato', false)
      const map = {}
      for (const q of data ?? []) {
        map[q.giocatore_id] = (map[q.giocatore_id] ?? 0) + 1
      }
      return map
    },
    staleTime: 2 * 60 * 1000,
  })

  // Giocatori con dati genitore inclusi
  const { data: giocatori = [], isLoading: loadingGiocatori } = useQuery({
    queryKey: ['segreteria-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, cert_medico_scadenza, nome_genitore, cognome_genitore, telefono, email_genitore')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const isLoading = loadingSquadre || loadingGiocatori

  const giocatoriFiltrati = useMemo(() => {
    if (!selectedSquadra) return []
    return giocatori.filter(g =>
      g.squadra === selectedSquadra || g.squadra2 === selectedSquadra || g.squadra3 === selectedSquadra
    )
  }, [giocatori, selectedSquadra])

  const header = (
    <AppHeader
      title="Giocatori"
      subtitle={selectedSquadra ? `${giocatoriFiltrati.length} atleti` : 'Seleziona una squadra'}
      displayName={displayName} logout={logout} societaNome={societaNome}
    />
  )

  const fab = (
    <button
      onClick={() => setShowAdd(true)}
      className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform lg:bottom-6">
      <Plus size={24} />
    </button>
  )

  const modal = showAdd && (
    <div className="fixed inset-0 bg-black/40 z-[200] overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 pt-8">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Nuovo giocatore</h2>
            <button onClick={() => setShowAdd(false)}>
              <X size={20} className="text-gray-400" />
            </button>
          </div>
          <GiocatoreWizard
            onDone={() => setShowAdd(false)}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      </div>
    </div>
  )

  if (isLoading) return (
    <>
      <div>{header}<div className="pt-8"><LoadingSpinner /></div></div>
      {modal}
    </>
  )

  // Vista lista squadre
  if (selectedSquadra === null) {
    return (
      <>
        <div>
          {header}
          <div className="px-4 pt-4 space-y-2 pb-4">
            {squadre.map(s => {
              const inSquadra   = giocatori.filter(g => g.squadra === s || g.squadra2 === s || g.squadra3 === s)
              const urgenti     = inSquadra.filter(g => certStatus(g.cert_medico_scadenza).urgente).length
              const quoteAperte = inSquadra.filter(g => quoteMap[g.id] > 0).length
              return (
                <button
                  key={s}
                  onClick={() => setSelectedSquadra(s)}
                  className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                    <Users size={18} className="text-purple-600" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{s}</p>
                    <p className="text-xs text-gray-400">{inSquadra.length} atleti</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {urgenti > 0 && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                        {urgenti} cert
                      </span>
                    )}
                    {quoteAperte > 0 && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        {quoteAperte} pag.
                      </span>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              )
            })}
            {squadre.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-16">Nessuna squadra configurata</p>
            )}
          </div>
        </div>
        {fab}
        {modal}
      </>
    )
  }

  // Funzione email BCC genitori della squadra selezionata
  function handleEmailGenitori() {
    const emails = giocatoriFiltrati
      .map(g => g.email_genitore)
      .filter(Boolean)
    if (emails.length === 0) {
      alert('Nessun indirizzo email genitore disponibile per questa squadra.')
      return
    }
    const bcc = emails.join(',')
    const subject = encodeURIComponent(`[${selectedSquadra}] Comunicazione`)
    window.location.href = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${subject}`
  }

  // Vista giocatori di una squadra
  return (
    <>
      <div>
        {header}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <button onClick={() => setSelectedSquadra(null)} className="flex items-center gap-1 text-sm text-purple-600 font-medium">
            <ChevronLeft size={16} /> Tutte le squadre
          </button>
          <button
            onClick={handleEmailGenitori}
            title="Invia email a tutti i genitori"
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 active:scale-95 transition-transform">
            <Mail size={13} /> Email genitori
          </button>
        </div>
        <div className="px-4 space-y-2 pb-4">
          {giocatoriFiltrati.map(g => {
            const cert         = certStatus(g.cert_medico_scadenza)
            const nomeGenitore = [g.cognome_genitore, g.nome_genitore].filter(Boolean).join(' ')
            return (
              <button
                key={g.id}
                onClick={() => navigate(`/secretary/giocatori/${g.id}`)}
                className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-purple-700">
                    {(g.cognome?.[0] ?? '')}{(g.nome?.[0] ?? '')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{g.cognome} {g.nome}</p>
                  {nomeGenitore && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{nomeGenitore}</p>
                  )}
                  {(g.telefono || g.email_genitore) && (
                    <div className="flex items-center gap-3 mt-1">
                      {g.telefono && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <Phone size={10} /> {g.telefono}
                        </span>
                      )}
                      {g.email_genitore && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400 truncate">
                          <Mail size={10} /> {g.email_genitore}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cert.cls}`}>
                    {cert.label}
                  </span>
                  {quoteMap[g.id] > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700">
                      {quoteMap[g.id]} rate
                    </span>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
          {giocatoriFiltrati.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Nessun giocatore in questa squadra</p>
          )}
        </div>
      </div>
      {fab}
      {modal}
    </>
  )
}
