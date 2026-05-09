import { useMemo } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

export default function SegreteriaDashboard() {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const in30days = format(new Date(today.getTime() + 30 * 86400000), 'yyyy-MM-dd')
  const { societaId, displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()

  const { data: giocatori = [], isLoading: lg } = useQuery({
    queryKey: ['segreteria-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, cert_medico_scadenza')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: quote = [], isLoading: lq } = useQuery({
    queryKey: ['segreteria-quote-aperte', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza, pagato')
        .eq('societa_id', societaId)
        .eq('pagato', false)
        .order('data_scadenza', { nullsFirst: false })
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const giocatoreMap = useMemo(
    () => Object.fromEntries(giocatori.map(g => [g.id, g])),
    [giocatori]
  )

  const certScaduti  = useMemo(() => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza < todayStr), [giocatori])
  const certInScad   = useMemo(() => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza >= todayStr && g.cert_medico_scadenza <= in30days), [giocatori])
  const quoteScadute = useMemo(() => quote.filter(q => q.data_scadenza && q.data_scadenza < todayStr), [quote])

  const isLoading = lg || lq
  const tuttoOk   = certScaduti.length === 0 && certInScad.length === 0 && quoteScadute.length === 0

  return (
    <div>
      <AppHeader
        title="Dashboard"
        subtitle="Urgenze di oggi"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : (
        <div className="px-4 pt-4 space-y-4">

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Cert. scaduti',  value: certScaduti.length,  color: certScaduti.length  > 0 ? 'text-red-600'    : 'text-green-600' },
              { label: 'Cert. in scad.', value: certInScad.length,   color: certInScad.length   > 0 ? 'text-orange-500' : 'text-green-600' },
              { label: 'Quote scadute',  value: quoteScadute.length, color: quoteScadute.length > 0 ? 'text-purple-600' : 'text-green-600' },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="py-3 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {tuttoOk ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-5 text-sm text-green-600">
                <CheckCircle2 size={16} /> Tutto in ordine! Nessuna azione urgente.
              </CardContent>
            </Card>
          ) : (
            <>
              {certScaduti.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                    <AlertTriangle size={12} /> Certificati scaduti ({certScaduti.length})
                  </p>
                  <div className="space-y-2">
                    {certScaduti.map(g => (
                      <button key={g.id} onClick={() => navigate('/secretary/giocatori')}
                        className="w-full text-left bg-white rounded-xl border border-l-4 border-l-red-500 px-4 py-3 shadow-sm active:scale-[0.99]">
                        <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          Scaduto il {format(parseISO(g.cert_medico_scadenza), 'd MMM yyyy', { locale: it })}
                          {' '}({-differenceInDays(parseISO(g.cert_medico_scadenza), today)}gg fa)
                        </p>
                        <p className="text-xs text-gray-400">{g.squadra}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {certInScad.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                    <AlertTriangle size={12} /> In scadenza entro 30 giorni ({certInScad.length})
                  </p>
                  <div className="space-y-2">
                    {certInScad.map(g => (
                      <button key={g.id} onClick={() => navigate('/secretary/giocatori')}
                        className="w-full text-left bg-white rounded-xl border border-l-4 border-l-orange-400 px-4 py-3 shadow-sm active:scale-[0.99]">
                        <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                        <p className="text-xs text-orange-600 mt-0.5">
                          Scade in {differenceInDays(parseISO(g.cert_medico_scadenza), today)}gg
                          {' '}({format(parseISO(g.cert_medico_scadenza), 'd MMM', { locale: it })})
                        </p>
                        <p className="text-xs text-gray-400">{g.squadra}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {quoteScadute.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                    <AlertTriangle size={12} /> Quote scadute non pagate ({quoteScadute.length})
                  </p>
                  <div className="space-y-2">
                    {quoteScadute.map(q => {
                      const g = giocatoreMap[q.giocatore_id]
                      return (
                        <button key={q.id} onClick={() => navigate('/secretary/quote')}
                          className="w-full text-left bg-white rounded-xl border border-l-4 border-l-purple-400 px-4 py-3 shadow-sm active:scale-[0.99]">
                          <p className="text-sm font-semibold text-gray-900">
                            {g ? `${g.cognome} ${g.nome}` : 'Giocatore sconosciuto'}
                          </p>
                          <p className="text-xs text-purple-600 mt-0.5">{q.descrizione ?? q.tipo} — €{q.importo}</p>
                          {q.data_scadenza && (
                            <p className="text-xs text-gray-400">
                              Scad. {format(parseISO(q.data_scadenza), 'd MMM yyyy', { locale: it })}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
