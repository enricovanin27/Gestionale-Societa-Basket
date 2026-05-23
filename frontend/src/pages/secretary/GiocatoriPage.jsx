import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight, ChevronLeft, Users, Plus, X, Phone, Mail } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import GiocatoreForm from './GiocatoreForm'

function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'N/D', cls: 'bg-gray-100 text-gray-500', urgente: false }
  const diff = differenceInDays(parseISO(dataScadenza), new Date())
  if (diff < 0)  return { label: 'Scaduto',    cls: 'bg-red-100 text-red-700',    urgente: true }
  if (diff < 30) return { label: `${diff}gg`,  cls: 'bg-orange-100 text-orange-700', urgente: true }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-green-100 text-green-700', urgente: false }
}

export default function GiocatoriPage() {
  const { societaId, displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()
  const [selectedSquadra, setSelectedSquadra] = useState(null)
  const qc = useQueryClient()
  const [showAdd, setShowAdd]     = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)

  async function handleAddGiocatore(formData) {
    setSavingAdd(true)
    try {
      const { error } = await supabase.from('giocatori').insert([{
        ...formData,
        societa_id: societaId,
        attivo: true,
        squadra2:             formData.squadra2             || null,
        squadra3:             formData.squadra3             || null,
        data_nascita:         formData.data_nascita         || null,
        data_iscrizione:      formData.data_iscrizione      || null,
        cert_medico_scadenza: formData.cert_medico_scadenza || null,
        numero_maglia:        formData.numero_maglia ? parseInt(formData.numero_maglia) : null,
      }])
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
      setShowAdd(false)
    } catch (err) {
      alert('Errore: ' + err.message)
    } finally {
      setSavingAdd(false)
    }
  }

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
          <div className="px-5 pt-4">
            <GiocatoreForm
              onSave={handleAddGiocatore}
              onCancel={() => setShowAdd(false)}
              saving={savingAdd}
            />
          </div>
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
              const inSquadra = giocatori.filter(g => g.squadra === s || g.squadra2 === s || g.squadra3 === s)
              const urgenti   = inSquadra.filter(g => certStatus(g.cert_medico_scadenza).urgente).length
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
                  {urgenti > 0 && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                      {urgenti} cert
                    </span>
                  )}
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

  // Vista giocatori di una squadra
  return (
    <>
      <div>
        {header}
        <div className="px-4 pt-3 pb-2">
          <button onClick={() => setSelectedSquadra(null)} className="flex items-center gap-1 text-sm text-purple-600 font-medium">
            <ChevronLeft size={16} /> Tutte le squadre
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
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${cert.cls}`}>
                  {cert.label}
                </span>
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
