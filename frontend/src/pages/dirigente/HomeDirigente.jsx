import { useState, useMemo } from 'react'
import { format, parseISO, differenceInDays, startOfWeek, addDays, subDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, TrendingDown, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

// ─── helpers ──────────────────────────────────────────────────────────────────

function AreaCard({ color, icon, title, count, extra, isOpen, onToggle, children }) {
  const hasItems = count > 0
  const colorMap = {
    red:    { badge: 'bg-red-100 text-red-700',    border: 'border-l-red-500',    title: 'text-red-600' },
    orange: { badge: 'bg-orange-100 text-orange-700', border: 'border-l-orange-400', title: 'text-orange-600' },
    amber:  { badge: 'bg-amber-100 text-amber-700',  border: 'border-l-amber-400',  title: 'text-amber-600' },
    green:  { badge: 'bg-green-100 text-green-700',  border: 'border-l-green-400',  title: 'text-green-600' },
  }
  const c = colorMap[color] ?? colorMap.amber

  if (!hasItems) return null

  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full text-left bg-white rounded-xl border border-l-4 ${c.border} px-4 py-3 shadow-sm active:scale-[0.99] transition-transform`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${c.title} flex items-center gap-1.5`}>
              {icon} {title}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>{count}</span>
          </div>
          <div className="flex items-center gap-2 text-right">
            {extra && <span className="text-xs text-gray-400">{extra}</span>}
            {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </div>
      </button>
      {isOpen && (
        <div className="mt-1.5 space-y-1.5 pl-1">
          {children}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, sub, badge, badgeColor = 'text-gray-500' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex items-center justify-between shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {badge && <span className={`text-xs font-semibold shrink-0 ml-3 ${badgeColor}`}>{badge}</span>}
    </div>
  )
}

// ─── HomeDirigente ─────────────────────────────────────────────────────────────

export default function HomeDirigente() {
  const { societaId, displayName, logout, societaNome } = useAuth()

  const today       = new Date()
  const todayStr    = format(today, 'yyyy-MM-dd')
  const in15days    = format(addDays(today, 15), 'yyyy-MM-dd')
  const in30days    = format(addDays(today, 30), 'yyyy-MM-dd')
  const weekStart   = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd     = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr   = format(weekEnd, 'yyyy-MM-dd')
  const twoWeeksAgo  = format(subDays(today, 14), 'yyyy-MM-dd')

  // sezioni aperte
  const [openEco,   setOpenEco]   = useState(false)
  const [openCert,  setOpenCert]  = useState(false)
  const [openAll,   setOpenAll]   = useState(false)
  const [openPres,  setOpenPres]  = useState(false)

  // ── query quote ─────────────────────────────────────────────────────────────
  const { data: quote = [], isLoading: lq } = useQuery({
    queryKey: ['dirigente-quote', societaId],
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
    staleTime: 3 * 60 * 1000,
  })

  // ── query giocatori (cert) ──────────────────────────────────────────────────
  const { data: giocatori = [], isLoading: lg } = useQuery({
    queryKey: ['dirigente-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, cert_medico_scadenza')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── query allenamenti cancellati questa settimana ───────────────────────────
  const { data: cancellati = [], isLoading: lc } = useQuery({
    queryKey: ['dirigente-cancellati', weekStartStr, weekEndStr, societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('orario_settimana')
        .select('id, squadra, data, ora_inizio')
        .eq('societa_id', societaId)
        .eq('annullato', true)
        .gte('data', weekStartStr)
        .lte('data', weekEndStr)
        .order('data').order('ora_inizio')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── query presenze ultime 2 settimane ───────────────────────────────────────
  const { data: presenze = [], isLoading: lp } = useQuery({
    queryKey: ['dirigente-presenze', twoWeeksAgo, todayStr, societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('data, squadra, presente')
        .eq('societa_id', societaId)
        .gte('data', twoWeeksAgo)
        .lte('data', todayStr)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── calcoli ─────────────────────────────────────────────────────────────────
  const quoteScadute    = useMemo(() => quote.filter(q => !q.data_scadenza || q.data_scadenza < todayStr), [quote, todayStr])
  const quoteInScad     = useMemo(() => quote.filter(q => q.data_scadenza && q.data_scadenza >= todayStr && q.data_scadenza <= in15days), [quote, todayStr, in15days])
  const totaleNonPagato = useMemo(() => quote.reduce((s, q) => s + (q.importo ?? 0), 0), [quote])

  const certScaduti = useMemo(() => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza < todayStr), [giocatori, todayStr])
  const certInScad  = useMemo(() => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza >= todayStr && g.cert_medico_scadenza <= in30days), [giocatori, todayStr, in30days])

  const giocatoreMap = useMemo(() => Object.fromEntries(giocatori.map(g => [g.id, g])), [giocatori])

  // Presenze basse: per ogni allenamento tracciato, se <70% → segnala
  const presenzeBasse = useMemo(() => {
    const grouped = {}
    for (const p of presenze) {
      const key = `${p.squadra}__${p.data}`
      if (!grouped[key]) grouped[key] = { presenti: 0, totale: 0 }
      grouped[key].totale++
      if (p.presente) grouped[key].presenti++
    }
    const result = []
    for (const [key, { presenti, totale }] of Object.entries(grouped)) {
      if (totale < 2) continue // skip trainings with too few records
      const pct = Math.round((presenti / totale) * 100)
      if (pct < 70) {
        const [squadra, data] = key.split('__')
        result.push({ squadra, data, presenti, totale, pct })
      }
    }
    return result.sort((a, b) => a.pct - b.pct)
  }, [presenze])

  const isLoading = lq || lg || lc || lp
  const haProblemi = quoteScadute.length > 0 || certScaduti.length > 0 || cancellati.length > 0 || presenzeBasse.length > 0

  return (
    <div>
      <AppHeader
        title="Panoramica"
        subtitle="Supervisione generale"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : (
        <div className="px-4 pt-4 space-y-3 pb-8">

          {/* ── Tutto OK ────────────────────────────────────────────────────── */}
          {!haProblemi && (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-5 flex items-center gap-3 shadow-sm">
              <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Tutto in ordine</p>
                <p className="text-xs text-gray-400 mt-0.5">Nessuna criticità rilevata</p>
              </div>
            </div>
          )}

          {/* ── ECONOMICO ───────────────────────────────────────────────────── */}
          <AreaCard
            color={quoteScadute.length > 0 ? 'red' : 'orange'}
            icon="💰"
            title="Quote non pagate"
            count={quote.length}
            extra={`€ ${totaleNonPagato.toFixed(0)} tot.`}
            isOpen={openEco}
            onToggle={() => setOpenEco(v => !v)}
          >
            {quoteScadute.length > 0 && (
              <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider px-1 mt-2">
                Scadute ({quoteScadute.length})
              </p>
            )}
            {quoteScadute.map(q => {
              const g = giocatoreMap[q.giocatore_id]
              return (
                <DetailRow key={q.id}
                  label={g ? `${g.cognome} ${g.nome}` : '—'}
                  sub={`${q.descrizione ?? q.tipo} · ${g?.squadra ?? '—'}`}
                  badge={`€ ${q.importo}`}
                  badgeColor="text-red-600 font-bold"
                />
              )
            })}
            {quoteInScad.length > 0 && (
              <p className="text-[11px] font-bold text-orange-500 uppercase tracking-wider px-1 mt-2">
                In scadenza 15gg ({quoteInScad.length})
              </p>
            )}
            {quoteInScad.map(q => {
              const g = giocatoreMap[q.giocatore_id]
              const gg = differenceInDays(parseISO(q.data_scadenza), today)
              return (
                <DetailRow key={q.id}
                  label={g ? `${g.cognome} ${g.nome}` : '—'}
                  sub={`${q.descrizione ?? q.tipo} · scade tra ${gg}gg`}
                  badge={`€ ${q.importo}`}
                  badgeColor="text-orange-600"
                />
              )
            })}
          </AreaCard>

          {/* ── CERTIFICATI ─────────────────────────────────────────────────── */}
          <AreaCard
            color={certScaduti.length > 0 ? 'red' : 'orange'}
            icon="🏥"
            title="Certificati medici"
            count={certScaduti.length + certInScad.length}
            isOpen={openCert}
            onToggle={() => setOpenCert(v => !v)}
          >
            {certScaduti.length > 0 && (
              <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider px-1 mt-2">
                Scaduti ({certScaduti.length})
              </p>
            )}
            {certScaduti.map(g => (
              <DetailRow key={g.id}
                label={`${g.cognome} ${g.nome}`}
                sub={g.squadra}
                badge={`${-differenceInDays(parseISO(g.cert_medico_scadenza), today)}gg fa`}
                badgeColor="text-red-600 font-bold"
              />
            ))}
            {certInScad.length > 0 && (
              <p className="text-[11px] font-bold text-orange-500 uppercase tracking-wider px-1 mt-2">
                In scadenza 30gg ({certInScad.length})
              </p>
            )}
            {certInScad.map(g => {
              const gg = differenceInDays(parseISO(g.cert_medico_scadenza), today)
              return (
                <DetailRow key={g.id}
                  label={`${g.cognome} ${g.nome}`}
                  sub={g.squadra}
                  badge={`${gg}gg`}
                  badgeColor="text-orange-600"
                />
              )
            })}
          </AreaCard>

          {/* ── ALLENAMENTI CANCELLATI ───────────────────────────────────────── */}
          <AreaCard
            color="amber"
            icon="🏋️"
            title="Allenamenti cancellati (settimana)"
            count={cancellati.length}
            isOpen={openAll}
            onToggle={() => setOpenAll(v => !v)}
          >
            {cancellati.map(a => (
              <DetailRow key={a.id}
                label={a.squadra}
                sub={format(parseISO(a.data), 'EEE d MMM', { locale: it })}
                badge={a.ora_inizio ? a.ora_inizio.slice(0, 5) : '—'}
                badgeColor="text-amber-600"
              />
            ))}
          </AreaCard>

          {/* ── PRESENZE BASSE ───────────────────────────────────────────────── */}
          <AreaCard
            color="amber"
            icon="📊"
            title="Presenze basse (ultime 2 sett.)"
            count={presenzeBasse.length}
            extra="< 70%"
            isOpen={openPres}
            onToggle={() => setOpenPres(v => !v)}
          >
            {presenzeBasse.map((p, i) => (
              <DetailRow key={i}
                label={p.squadra}
                sub={format(parseISO(p.data), 'EEE d MMM', { locale: it })}
                badge={`${p.pct}% (${p.presenti}/${p.totale})`}
                badgeColor={p.pct < 50 ? 'text-red-600 font-bold' : 'text-amber-600'}
              />
            ))}
          </AreaCard>

          {/* ── Legenda ─────────────────────────────────────────────────────── */}
          {haProblemi && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Chi contattare</p>
              <div className="flex items-start gap-2 text-xs text-gray-500">
                <span className="font-semibold text-purple-600 shrink-0">Segreteria →</span>
                <span>Quote non pagate, certificati medici</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-500">
                <span className="font-semibold text-amber-600 shrink-0">Allenatore →</span>
                <span>Allenamenti cancellati, presenze basse</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
