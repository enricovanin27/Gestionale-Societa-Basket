import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, parseISO, format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight, ChevronLeft, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { certStatus } from '../../utils/certStatus'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function CertificatiPage() {
  const { societaId } = useAuth()
  const navigate = useNavigate()
  const [selectedSquadra, setSelectedSquadra] = useState(null)

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

  const { data: giocatori = [], isLoading: loadingG } = useQuery({
    queryKey: ['segreteria-giocatori', societaId],
    enabled: !!societaId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, cert_medico_scadenza')
        .eq('societa_id', societaId).eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  // Statistiche per squadra
  const squadraStats = useMemo(() => {
    const result = {}
    for (const s of squadre) {
      const inSquadra = giocatori.filter(g => g.squadra === s || g.squadra2 === s || g.squadra3 === s)
      const scaduti   = inSquadra.filter(g => {
        if (!g.cert_medico_scadenza) return false
        return differenceInDays(parseISO(g.cert_medico_scadenza), new Date()) < 0
      }).length
      const inScadenza = inSquadra.filter(g => {
        if (!g.cert_medico_scadenza) return false
        const d = differenceInDays(parseISO(g.cert_medico_scadenza), new Date())
        return d >= 0 && d < 30
      }).length
      const mancanti = inSquadra.filter(g => !g.cert_medico_scadenza).length
      result[s] = { nGiocatori: inSquadra.length, scaduti, inScadenza, mancanti }
    }
    return result
  }, [squadre, giocatori])

  const giocatoriInSquadra = useMemo(() => {
    if (!selectedSquadra) return []
    return giocatori.filter(g =>
      g.squadra === selectedSquadra || g.squadra2 === selectedSquadra || g.squadra3 === selectedSquadra
    )
  }, [selectedSquadra, giocatori])

  const isLoading = loadingS || loadingG

  // ── Vista drill-down squadra ─────────────────────────────────────────────────

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
        {isLoading ? <LoadingSpinner /> : (
          <div className="px-4 space-y-2 pb-28">
            {giocatoriInSquadra.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-16">Nessun giocatore in questa squadra</p>
            )}
            {giocatoriInSquadra.map(g => {
              const cert = certStatus(g.cert_medico_scadenza)
              return (
                <button key={g.id}
                  onClick={() => navigate(`/secretary/giocatori/${g.id}`)}
                  className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3 active:bg-gray-50 transition-colors text-left">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-purple-700">
                      {(g.cognome?.[0] ?? '')}{(g.nome?.[0] ?? '')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{g.cognome} {g.nome}</p>
                    {g.cert_medico_scadenza && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Scad. {format(parseISO(g.cert_medico_scadenza), 'd MMM yyyy', { locale: it })}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${cert.cls}`}>
                    {cert.label}
                  </span>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Vista lista squadre ──────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Certificati Medici" subtitle="Panoramica per squadra" />
      {isLoading ? <LoadingSpinner /> : (
        <div className="px-4 pt-4 space-y-2 pb-28">
          {squadre.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-16">Nessuna squadra configurata</p>
          )}
          {squadre.map(s => {
            const st = squadraStats[s] ?? {}
            const tuttoOk = (st.scaduti ?? 0) === 0 && (st.inScadenza ?? 0) === 0 && (st.mancanti ?? 0) === 0
            return (
              <button key={s} onClick={() => setSelectedSquadra(s)}
                className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors text-left">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <Shield size={18} className="text-purple-600" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{st.nGiocatori ?? 0} atleti</p>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  {(st.scaduti ?? 0) > 0 && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                      {st.scaduti} scadut{st.scaduti === 1 ? 'o' : 'i'}
                    </span>
                  )}
                  {(st.inScadenza ?? 0) > 0 && (
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                      {st.inScadenza} in scadenza
                    </span>
                  )}
                  {(st.mancanti ?? 0) > 0 && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
                      {st.mancanti} N/D
                    </span>
                  )}
                  {tuttoOk && (
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
    </div>
  )
}
