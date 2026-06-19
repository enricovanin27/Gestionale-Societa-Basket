import { useMemo, useState } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { usePrintWindow } from '../../hooks/usePrintWindow'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Printer } from 'lucide-react'
import SetupChecklist from '../../components/SetupChecklist'

export default function SegreteriaDashboard() {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const in15days = format(new Date(today.getTime() + 15 * 86400000), 'yyyy-MM-dd')
  const in30days = format(new Date(today.getTime() + 30 * 86400000), 'yyyy-MM-dd')
  const { societaId, displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()
  const printWindow = usePrintWindow()

  // ── sezioni aperte ──────────────────────────────────────────────────────────
  const [openCertScad,     setOpenCertScad]     = useState(false)
  const [openCertInScad,   setOpenCertInScad]   = useState(false)
  const [openQuoteScad,    setOpenQuoteScad]     = useState(false)
  const [openQuoteInScad,  setOpenQuoteInScad]  = useState(false)

  // ── query ───────────────────────────────────────────────────────────────────
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

  const certScaduti  = useMemo(() => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza < todayStr), [giocatori, todayStr])
  const certInScad   = useMemo(() => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza >= todayStr && g.cert_medico_scadenza <= in30days), [giocatori, todayStr, in30days])
  // Include quote senza scadenza (da pagare) + quote con scadenza già passata
  const quoteScadute   = useMemo(() => quote.filter(q => !q.data_scadenza || q.data_scadenza < todayStr), [quote, todayStr])
  // Rate con scadenza entro 15 giorni (non ancora scadute)
  const quoteInScadenza = useMemo(() => quote.filter(q => q.data_scadenza && q.data_scadenza >= todayStr && q.data_scadenza <= in15days), [quote, todayStr, in15days])

  const isLoading = lg || lq
  const tuttoOk   = certScaduti.length === 0 && certInScad.length === 0 && quoteScadute.length === 0 && quoteInScadenza.length === 0

  // ── print helpers ────────────────────────────────────────────────────────
  function printCert() {
    const tutti = [
      ...certScaduti.map(g => ({
        ...g,
        stato: 'SCADUTO (' + (-differenceInDays(parseISO(g.cert_medico_scadenza), today)) + 'gg fa)',
        colorClass: 'red',
      })),
      ...certInScad.map(g => ({
        ...g,
        stato: 'In scadenza (' + differenceInDays(parseISO(g.cert_medico_scadenza), today) + 'gg)',
        colorClass: 'orange',
      })),
    ]
    const rows = tutti.map(g =>
      '<tr>' +
      '<td>' + g.cognome + ' ' + g.nome + '</td>' +
      '<td>' + (g.squadra ?? '—') + '</td>' +
      '<td>' + (g.cert_medico_scadenza ? format(parseISO(g.cert_medico_scadenza), 'd/MM/yyyy') : '—') + '</td>' +
      '<td class="' + g.colorClass + '">' + g.stato + '</td>' +
      '</tr>'
    ).join('')
    printWindow(
      'Certificati Medici — ' + format(today, 'd MMMM yyyy', { locale: it }),
      '<table>' +
      '<thead><tr><th>Cognome Nome</th><th>Squadra</th><th>Scadenza</th><th>Stato</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '<p class="summary">' + tutti.length + ' giocatori con certificato da rinnovare</p>',
      societaNome ?? ''
    )
  }

  function printQuote() {
    const totale = quoteScadute.reduce((s, q) => s + (q.importo ?? 0), 0)
    const rows = quoteScadute.map(q => {
      const g = giocatoreMap[q.giocatore_id]
      return '<tr>' +
        '<td>' + (g ? g.cognome + ' ' + g.nome : '—') + '</td>' +
        '<td>' + (g?.squadra ?? '—') + '</td>' +
        '<td>' + (q.descrizione ?? q.tipo ?? '—') + '</td>' +
        '<td class="center">€ ' + (q.importo ?? 0).toFixed(2) + '</td>' +
        '<td class="red">' + (q.data_scadenza ? format(parseISO(q.data_scadenza), 'd/MM/yyyy') : '—') + '</td>' +
        '</tr>'
    }).join('')
    printWindow(
      'Quote Non Pagate — ' + format(today, 'd MMMM yyyy', { locale: it }),
      '<table>' +
      '<thead><tr><th>Giocatore</th><th>Squadra</th><th>Descrizione</th><th>Importo</th><th>Scadenza</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '<p class="summary">Totale non pagato: € ' + totale.toFixed(2) + ' — ' + quoteScadute.length + ' rate</p>',
      societaNome ?? ''
    )
  }

  // ── KPI card (cliccabile se count > 0) ────────────────────────────────────
  function KpiCard({ label, value, color, isOpen, onToggle }) {
    const hasItems = value > 0
    const content = (
      <>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
        {hasItems && (
          <div className="mt-1.5 flex justify-center">
            {isOpen
              ? <ChevronUp size={13} className="text-gray-400" />
              : <ChevronDown size={13} className="text-gray-400" />
            }
          </div>
        )}
      </>
    )

    if (!hasItems) {
      return (
        <Card>
          <CardContent className="py-3 text-center">{content}</CardContent>
        </Card>
      )
    }

    return (
      <button
        onClick={onToggle}
        className="bg-white rounded-xl border border-gray-200 py-3 w-full text-center shadow-sm active:scale-[0.98] transition-transform"
      >
        {content}
      </button>
    )
  }

  return (
    <div>
      <AppHeader
        title="Dashboard"
        subtitle="Urgenze di oggi"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      <SetupChecklist />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : (
        <div className="px-4 pt-4 space-y-4">

          {/* KPI cards — cliccabili se count > 0 */}
          <div className="grid grid-cols-2 gap-2">
            <KpiCard
              label="Cert. scaduti"
              value={certScaduti.length}
              color={certScaduti.length > 0 ? 'text-red-600' : 'text-green-600'}
              isOpen={openCertScad}
              onToggle={() => setOpenCertScad(v => !v)}
            />
            <KpiCard
              label="Cert. in scad."
              value={certInScad.length}
              color={certInScad.length > 0 ? 'text-orange-500' : 'text-green-600'}
              isOpen={openCertInScad}
              onToggle={() => setOpenCertInScad(v => !v)}
            />
            <KpiCard
              label="Quote non pagate"
              value={quoteScadute.length}
              color={quoteScadute.length > 0 ? 'text-purple-600' : 'text-green-600'}
              isOpen={openQuoteScad}
              onToggle={() => setOpenQuoteScad(v => !v)}
            />
            <KpiCard
              label="Rate in scad. (15gg)"
              value={quoteInScadenza.length}
              color={quoteInScadenza.length > 0 ? 'text-amber-600' : 'text-green-600'}
              isOpen={openQuoteInScad}
              onToggle={() => setOpenQuoteInScad(v => !v)}
            />
          </div>

          {tuttoOk ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-5 text-sm text-green-600">
                <CheckCircle2 size={16} /> Tutto in ordine! Nessuna azione urgente.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Certificati scaduti */}
              {openCertScad && certScaduti.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle size={12} /> Certificati scaduti ({certScaduti.length})
                    </p>
                    <button onClick={printCert} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
                      <Printer size={12} /> Stampa
                    </button>
                  </div>
                  <div className="space-y-2">
                    {certScaduti.map(g => (
                      <button key={g.id}
                        onClick={() => navigate(`/secretary/giocatori/${g.id}`, { state: { tab: 'cert' } })}
                        className="w-full text-left bg-white rounded-xl border border-l-4 border-l-red-500 px-4 py-3 shadow-sm active:scale-[0.99]">
                        <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          Scaduto il {format(parseISO(g.cert_medico_scadenza), 'd MMM yyyy', { locale: it })}
                          {' '}({-differenceInDays(parseISO(g.cert_medico_scadenza), today)}gg fa)
                        </p>
                        <p className="text-xs text-gray-400">{g.squadra} · Tocca per aggiornare</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Certificati in scadenza */}
              {openCertInScad && certInScad.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle size={12} /> In scadenza entro 30 giorni ({certInScad.length})
                    </p>
                    <button onClick={printCert} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
                      <Printer size={12} /> Stampa
                    </button>
                  </div>
                  <div className="space-y-2">
                    {certInScad.map(g => (
                      <button key={g.id}
                        onClick={() => navigate(`/secretary/giocatori/${g.id}`, { state: { tab: 'cert' } })}
                        className="w-full text-left bg-white rounded-xl border border-l-4 border-l-orange-400 px-4 py-3 shadow-sm active:scale-[0.99]">
                        <p className="text-sm font-semibold text-gray-900">{g.cognome} {g.nome}</p>
                        <p className="text-xs text-orange-600 mt-0.5">
                          Scade in {differenceInDays(parseISO(g.cert_medico_scadenza), today)}gg
                          {' '}({format(parseISO(g.cert_medico_scadenza), 'd MMM', { locale: it })})
                        </p>
                        <p className="text-xs text-gray-400">{g.squadra} · Tocca per aggiornare</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quote non pagate */}
              {openQuoteScad && quoteScadute.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle size={12} /> Quote non pagate ({quoteScadute.length})
                    </p>
                    <button onClick={printQuote} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
                      <Printer size={12} /> Stampa
                    </button>
                  </div>
                  <div className="space-y-2">
                    {quoteScadute.map(q => {
                      const g = giocatoreMap[q.giocatore_id]
                      const scaduta = q.data_scadenza && q.data_scadenza < todayStr
                      return (
                        <button key={q.id}
                          onClick={() => navigate(`/secretary/giocatori/${q.giocatore_id}`, { state: { tab: 'quote' } })}
                          className={`w-full text-left bg-white rounded-xl border border-l-4 px-4 py-3 shadow-sm active:scale-[0.99] ${
                            scaduta ? 'border-l-red-400' : 'border-l-purple-300'
                          }`}>
                          <p className="text-sm font-semibold text-gray-900">
                            {g ? `${g.cognome} ${g.nome}` : 'Giocatore sconosciuto'}
                          </p>
                          <p className="text-xs text-purple-600 mt-0.5">{q.descrizione ?? q.tipo} — €{q.importo}</p>
                          <p className="text-xs text-gray-400">
                            {q.data_scadenza
                              ? `Scad. ${format(parseISO(q.data_scadenza), 'd MMM yyyy', { locale: it })} · Tocca per registrare pagamento`
                              : 'Nessuna scadenza · Tocca per registrare pagamento'}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Rate in scadenza entro 15 giorni */}
              {openQuoteInScad && quoteInScadenza.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle size={12} /> Rate in scadenza entro 15gg ({quoteInScadenza.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {quoteInScadenza.map(q => {
                      const g = giocatoreMap[q.giocatore_id]
                      const giorniRimasti = differenceInDays(parseISO(q.data_scadenza), today)
                      return (
                        <button key={q.id}
                          onClick={() => navigate(`/secretary/giocatori/${q.giocatore_id}`, { state: { tab: 'quote' } })}
                          className="w-full text-left bg-white rounded-xl border border-l-4 border-l-amber-400 px-4 py-3 shadow-sm active:scale-[0.99]">
                          <p className="text-sm font-semibold text-gray-900">
                            {g ? `${g.cognome} ${g.nome}` : 'Giocatore sconosciuto'}
                          </p>
                          <p className="text-xs text-amber-600 mt-0.5">{q.descrizione ?? q.tipo} — €{q.importo}</p>
                          <p className="text-xs text-gray-400">
                            Scade {giorniRimasti === 0 ? 'oggi' : `tra ${giorniRimasti}gg`}
                            {' '}({format(parseISO(q.data_scadenza), 'd MMM', { locale: it })}) · Tocca per registrare
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Messaggio se niente è aperto ma ci sono problemi */}
              {!openCertScad && !openCertInScad && !openQuoteScad && !openQuoteInScad && (
                <p className="text-xs text-gray-400 text-center py-2">
                  Tocca un contatore qui sopra per vedere i dettagli
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
