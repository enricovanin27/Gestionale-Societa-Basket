import { useState, useMemo, useEffect } from 'react'
import { format, addDays, addWeeks, startOfWeek, startOfMonth, endOfMonth, parseISO, subDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { CheckCircle2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { EventRow, timesOverlap, QuickEditAllenamentoModal } from './shared'
import { formatTime } from '../../lib/utils'

export default function HomeAdmin() {
  const { displayName, logout, societaNome, societaId } = useAuth()
  const [editingConflictTraining, setEditingConflictTraining] = useState(null)
  const [conflictModalOpen, setConflictModalOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (conflictModalOpen) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [conflictModalOpen])

  const today      = new Date()
  const todayStr   = format(today, 'yyyy-MM-dd')
  const in30Str    = format(addDays(today, 30), 'yyyy-MM-dd')
  const endStr     = format(addDays(today, 14), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(today), 'yyyy-MM-dd')
  const weekStart     = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])
  const nextWeekStart = useMemo(() => addWeeks(weekStart, 1), [weekStart])
  const week2Start    = useMemo(() => addWeeks(weekStart, 2), [weekStart])
  const weekStartStr  = useMemo(() => format(weekStart, 'yyyy-MM-dd'), [weekStart])
  const weekEndStr    = useMemo(() => format(addDays(weekStart, 6), 'yyyy-MM-dd'), [weekStart])
  const lastWeekStart = useMemo(() => format(addDays(weekStart, -7), 'yyyy-MM-dd'), [weekStart])
  const lastWeekEnd   = useMemo(() => format(addDays(weekStart, -1), 'yyyy-MM-dd'), [weekStart])
  const da30Str = useMemo(() => format(subDays(today, 30), 'yyyy-MM-dd'), [])
  const da2Str  = useMemo(() => format(subDays(today, 2),  'yyyy-MM-dd'), [])
  const ieriStr = useMemo(() => format(subDays(today, 1),  'yyyy-MM-dd'), [])

  // ── KPI: giocatori, squadre, cert ──────────────────────────────────────────
  const { data: giocatori = [], isLoading: loadingG } = useQuery({
    queryKey: ['admin-giocatori-kpi', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('squadra, cert_medico_scadenza')
        .eq('societa_id', societaId)
        .eq('attivo', true)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const squadreCount = useMemo(
    () => new Set(giocatori.map(g => g.squadra).filter(Boolean)).size,
    [giocatori]
  )
  const certScadutiN = useMemo(
    () => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza < todayStr).length,
    [giocatori, todayStr]
  )
  const certInScad30N = useMemo(
    () => giocatori.filter(g => g.cert_medico_scadenza && g.cert_medico_scadenza >= todayStr && g.cert_medico_scadenza <= in30Str).length,
    [giocatori, todayStr, in30Str]
  )

  // ── KPI: partite questo mese ───────────────────────────────────────────────
  const { data: partiteMese = 0 } = useQuery({
    queryKey: ['admin-partite-mese', monthStart, monthEnd, societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { count } = await supabase
        .from('calendario')
        .select('*', { count: 'exact', head: true })
        .eq('societa_id', societaId)
        .gte('data', monthStart)
        .lte('data', monthEnd)
      return count ?? 0
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Allenamenti cancellati questa settimana ────────────────────────────────
  const { data: cancellatiSettimana = [] } = useQuery({
    queryKey: ['admin-cancellati-sett', weekStartStr, weekEndStr, societaId],
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

  // ── Presenze settimana scorsa per squadra ──────────────────────────────────
  const { data: presenzeScorsa = [] } = useQuery({
    queryKey: ['admin-presenze-scorsa', lastWeekStart, lastWeekEnd, societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('squadra, presente')
        .eq('societa_id', societaId)
        .gte('data', lastWeekStart)
        .lte('data', lastWeekEnd)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Appelli mancanti ultimi 2 giorni ──────────────────────────────────────
  const { data: appelliMancanti = [] } = useQuery({
    queryKey: ['admin-appelli-mancanti', da2Str, todayStr, societaId],
    enabled: !!societaId,
    queryFn: async () => {
      // Allenamenti programmati (non annullati) negli ultimi 2 giorni, escluso oggi
      const { data: allenamenti } = await supabase
        .from('orario_settimana')
        .select('id, squadra, data, ora_inizio')
        .eq('societa_id', societaId)
        .eq('annullato', false)
        .gte('data', da2Str)
        .lt('data', todayStr)
        .order('data').order('ora_inizio')

      if (!allenamenti?.length) return []

      // Presenze registrate nello stesso range
      const { data: presenze } = await supabase
        .from('presenze_allenamento')
        .select('data, squadra')
        .eq('societa_id', societaId)
        .gte('data', da2Str)
        .lt('data', todayStr)

      // Set di coppie (data|squadra) che hanno almeno una presenza registrata
      const conAppello = new Set(
        (presenze ?? []).map(p => `${p.data}|${p.squadra}`)
      )

      // Restituisce solo gli allenamenti senza appello registrato
      return allenamenti.filter(a => !conAppello.has(`${a.data}|${a.squadra}`))
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Giocatori con presenze < 50% ultimi 30 giorni ─────────────────────────
  const { data: giocatoriBassaPresenza = [] } = useQuery({
    queryKey: ['admin-giocatori-bassa-presenza', societaId, da30Str],
    enabled: !!societaId,
    queryFn: async () => {
      const { data: presenze } = await supabase
        .from('presenze_allenamento')
        .select('giocatore_id, presente')
        .eq('societa_id', societaId)
        .gte('data', da30Str)
        .lte('data', todayStr)

      if (!presenze?.length) return []

      // Raggruppa per giocatore_id
      const byGiocatore = {}
      for (const p of presenze) {
        if (!byGiocatore[p.giocatore_id])
          byGiocatore[p.giocatore_id] = { presenti: 0, totale: 0 }
        byGiocatore[p.giocatore_id].totale++
        if (p.presente) byGiocatore[p.giocatore_id].presenti++
      }

      // Filtra: min 3 allenamenti registrati e presenza < 50%
      const idsBassa = Object.entries(byGiocatore)
        .filter(([, { presenti, totale }]) => totale >= 3 && presenti / totale < 0.5)
        .map(([id]) => id)

      if (!idsBassa.length) return []

      const { data: giocatori } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra')
        .in('id', idsBassa)

      return (giocatori ?? []).map(g => ({
        ...g,
        presenti: byGiocatore[g.id].presenti,
        totale:   byGiocatore[g.id].totale,
        pct: Math.round(byGiocatore[g.id].presenti / byGiocatore[g.id].totale * 100),
      }))
    },
    staleTime: 5 * 60 * 1000,
  })

  const presenzePerSquadra = useMemo(() => {
    const grouped = {}
    for (const p of presenzeScorsa) {
      if (!grouped[p.squadra]) grouped[p.squadra] = { presenti: 0, totale: 0 }
      grouped[p.squadra].totale++
      if (p.presente) grouped[p.squadra].presenti++
    }
    return Object.entries(grouped)
      .map(([squadra, { presenti, totale }]) => ({
        squadra, presenti, totale,
        pct: totale > 0 ? Math.round((presenti / totale) * 100) : null,
      }))
      .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100)) // prima le più basse
  }, [presenzeScorsa])

  const squadreBassaPresenza = useMemo(
    () => presenzePerSquadra.filter(p => p.pct !== null && p.pct < 60),
    [presenzePerSquadra]
  )

  // ── Partite future (prossimi 14gg) ─────────────────────────────────────────
  const { data: partiteFuture = [], isLoading: loadingP, isError: isErrorP } = useQuery({
    queryKey: ['admin-partite-future', todayStr, societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario').select('*')
        .eq('societa_id', societaId)
        .gte('data', todayStr).lte('data', endStr)
        .order('data').order('ora_inizio')
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  // ── Provvisorie ────────────────────────────────────────────────────────────
  const { data: provvisorie = [], isLoading: loadingProv } = useQuery({
    queryKey: ['admin-provvisorie', todayStr, societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('calendario').select('*')
        .eq('societa_id', societaId)
        .eq('stato', 'provvisoria').gte('data', todayStr)
        .order('data')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  // ── Conflict detection ─────────────────────────────────────────────────────
  const { data: thisWeek } = useWeekEvents(weekStart)
  const { data: nextWeek } = useWeekEvents(nextWeekStart)
  const { data: week2 }    = useWeekEvents(week2Start)

  const conflictsAll = useMemo(() => {
    const allEvents   = [...(thisWeek?.events ?? []), ...(nextWeek?.events ?? []), ...(week2?.events ?? [])]
    const partite     = allEvents.filter(e => e._tipo === 'partita' && e.stato === 'definitiva' && e.data >= todayStr)
    const allenamenti = allEvents.filter(e => e._tipo === 'allenamento' && !e.annullato)
    const result = []
    for (const p of partite) {
      const conf = allenamenti.filter(t => {
        if (t.data !== p.data) return false
        if (!timesOverlap(p.ora_inizio, p.ora_fine, t.ora_inizio, t.ora_fine)) return false
        const sameSquadra  = (t.squadra ?? '').toLowerCase() === (p.squadra ?? '').toLowerCase()
        const samePalestra = p.casa_fuori === 'Casa' &&
          p.palestra?.trim() && t.palestra?.trim() &&
          p.palestra.trim().toLowerCase() === t.palestra.trim().toLowerCase()
        return sameSquadra || samePalestra
      })
      if (conf.length) result.push({ partita: p, allenamenti: conf })
    }
    const seen = new Set()
    return result.filter(r => { if (seen.has(r.partita.id)) return false; seen.add(r.partita.id); return true })
  }, [thisWeek, nextWeek, week2, todayStr])

  const totalConflicts = conflictsAll.reduce((n, c) => n + c.allenamenti.length, 0)

  const todayTrainings = useMemo(() => {
    const all = [...(thisWeek?.events ?? [])]
    return all
      .filter(e => e.data === todayStr && e._tipo === 'allenamento' && !e.annullato)
      .sort((a, b) => (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? ''))
  }, [thisWeek, todayStr])

  const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN + (certInScad30N > 0 ? 1 : 0) + appelliMancanti.length + squadreBassaPresenza.length + (giocatoriBassaPresenza.length > 0 ? 1 : 0)
  const isLoading      = loadingP || loadingProv || loadingG
  const isError        = isErrorP

  return (
    <div className="pb-20">
      <AppHeader
        title="Home"
        subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : isError ? (
        <div className="mx-4 mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-sm font-medium text-red-700">Errore nel caricamento dei dati</p>
          <p className="text-xs text-red-400 mt-1">Controlla la connessione e riprova</p>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-4">

          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: 'Squadre',
                value: squadreCount,
                color: 'text-amber-600',
                onClick: null,
              },
              {
                label: 'Partite mese',
                value: partiteMese,
                color: 'text-green-600',
                onClick: null,
              },
              {
                label: 'Provvisorie',
                value: provvisorie.length,
                color: provvisorie.length > 0 ? 'text-purple-600' : 'text-green-600',
                onClick: () => navigate('/admin/partite'),
              },
            ].map(({ label, value, color, onClick }) =>
              onClick ? (
                <button
                  key={label}
                  onClick={onClick}
                  className="bg-white rounded-xl border border-gray-100 py-3 text-center shadow-sm active:scale-[0.98] transition-transform"
                >
                  <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
                </button>
              ) : (
                <div key={label} className="bg-white rounded-xl border border-gray-100 py-3 text-center shadow-sm">
                  <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
                </div>
              )
            )}
          </div>

          {/* Azioni urgenti */}
          {urgenzeTot > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Azioni urgenti</p>
              <div className="space-y-2">
                {totalConflicts > 0 && (
                  <button
                    onClick={() => setConflictModalOpen(true)}
                    className="w-full text-left bg-white rounded-xl border-l-4 border-red-500 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
                  >
                    <p className="text-sm text-gray-800">
                      ⚠️ {totalConflicts} allenament{totalConflicts === 1 ? 'o' : 'i'} in conflitto con partite
                    </p>
                  </button>
                )}
                {provvisorie.length > 0 && (
                  <button
                    onClick={() => navigate('/admin/partite')}
                    className="w-full text-left bg-white rounded-xl border-l-4 border-amber-400 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
                  >
                    <p className="text-sm text-gray-800">
                      📋 {provvisorie.length} partite provvisorie da confermare
                    </p>
                  </button>
                )}
                {certScadutiN > 0 && (
                  <button
                    onClick={() => navigate('/admin/persone')}
                    className="w-full text-left bg-white rounded-xl border-l-4 border-red-400 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
                  >
                    <p className="text-sm text-gray-800">
                      🏥 {certScadutiN} certificat{certScadutiN === 1 ? 'o' : 'i'} medic{certScadutiN === 1 ? 'o' : 'i'} scadut{certScadutiN === 1 ? 'o' : 'i'}
                    </p>
                  </button>
                )}
                {certInScad30N > 0 && (
                  <button
                    onClick={() => navigate('/admin/persone')}
                    className="w-full text-left bg-white rounded-xl border-l-4 border-amber-300 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
                  >
                    <p className="text-sm text-gray-800">
                      📅 {certInScad30N} certificat{certInScad30N === 1 ? 'o' : 'i'} in scadenza (prossimi 30gg)
                    </p>
                  </button>
                )}
                {appelliMancanti.map(a => (
                  <button
                    key={`appello-${a.id}`}
                    onClick={() => navigate('/admin/presenze')}
                    className="w-full text-left bg-white rounded-xl border-l-4 border-blue-400 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
                  >
                    <p className="text-sm text-gray-800">
                      📋 Appello mancante: {a.squadra}
                      {' — '}
                      {a.data === ieriStr
                        ? 'ieri'
                        : format(parseISO(a.data), 'EEE d MMM', { locale: it })}
                    </p>
                  </button>
                ))}
                {squadreBassaPresenza.map(p => (
                  <button
                    key={`bassa-presenza-${p.squadra}`}
                    onClick={() => navigate('/admin/presenze')}
                    className="w-full text-left bg-white rounded-xl border-l-4 border-orange-400 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
                  >
                    <p className="text-sm text-gray-800">
                      📉 {p.squadra}: solo {p.pct}% di presenze la settimana scorsa
                    </p>
                  </button>
                ))}
                {giocatoriBassaPresenza.length > 0 && (
                  <button
                    onClick={() => navigate('/admin/presenze')}
                    className="w-full text-left bg-white rounded-xl border-l-4 border-orange-300 px-4 py-3 shadow-sm active:scale-[0.99] transition-transform"
                  >
                    <p className="text-sm text-gray-800">
                      👤 {giocatoriBassaPresenza.length}{' '}
                      giocator{giocatoriBassaPresenza.length === 1 ? 'e' : 'i'} con meno del 50% di presenze nell&apos;ultimo mese
                    </p>
                  </button>
                )}
              </div>
            </div>
          )}

          {urgenzeTot === 0 && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">
              <CheckCircle2 size={16} /> Tutto in ordine! Nessuna azione urgente.
            </div>
          )}

          {/* Allenamenti oggi */}
          {todayTrainings.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Allenamenti oggi</p>
                <button onClick={() => navigate('/admin/allenamenti')} className="text-xs text-amber-600 font-medium">Tutti →</button>
              </div>
              <div className="space-y-2">
                {todayTrainings.map((e, i) => (
                  <div key={`${e._source ?? 'ev'}-${e.id ?? i}`} className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
                    <p className="text-sm font-semibold text-gray-800">{e.squadra}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatTime(e.ora_inizio)}–{formatTime(e.ora_fine)}
                      {e.palestra ? ` · ${e.palestra}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Riepilogo tecnico (responsabile tecnico) ──────────────────────── */}
          {(cancellatiSettimana.length > 0 || presenzePerSquadra.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Riepilogo tecnico</p>
              <div className="space-y-2">
                {cancellatiSettimana.map(a => (
                  <div key={a.id} className="bg-white rounded-xl border border-l-4 border-l-amber-400 px-4 py-2.5 shadow-sm flex items-center gap-3">
                    <span className="text-base shrink-0">🚫</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{a.squadra}</p>
                      <p className="text-xs text-amber-600">
                        Allenamento annullato · {format(parseISO(a.data), 'EEE d MMM', { locale: it })}
                        {a.ora_inizio ? ` · ${a.ora_inizio.slice(0, 5)}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                {presenzePerSquadra.map(p => (
                  <div key={p.squadra} className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{p.squadra}</p>
                      <p className="text-xs text-gray-400">Presenze sett. scorsa</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-bold ${
                        p.pct === null   ? 'text-gray-400' :
                        p.pct >= 70      ? 'text-green-600' :
                        p.pct >= 50      ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {p.pct !== null ? `${p.pct}%` : 'N/D'}
                      </span>
                      <p className="text-[10px] text-gray-400">{p.presenti}/{p.totale} presenti</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prossime partite */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Prossime partite</p>
              <button onClick={() => navigate('/admin/partite')} className="text-xs text-amber-600 font-medium">
                Tutte →
              </button>
            </div>
            {partiteFuture.length === 0 ? (
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">
                <CheckCircle2 size={16} /> Nessuna partita nei prossimi 14 giorni
              </div>
            ) : (
              <div className="space-y-2">
                {partiteFuture.slice(0, 5).map(p => (
                  <EventRow key={p.id} event={{ ...p, _tipo: 'partita', _source: 'calendario' }} />
                ))}
                {partiteFuture.length > 5 && (
                  <button
                    onClick={() => navigate('/admin/partite')}
                    className="w-full text-center text-xs text-amber-600 font-medium py-2"
                  >
                    + {partiteFuture.length - 5} altre partite →
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {conflictModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-4 mb-20">

            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                ⚠️ Conflitti ({totalConflicts})
              </h2>
              <button
                onClick={() => setConflictModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              {conflictsAll.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Nessun conflitto al momento</p>
              )}
              {conflictsAll.map((c) => (
                <div key={c.partita.id} className="rounded-xl border border-red-100 bg-red-50 p-3">

                  {/* Partita info */}
                  <p className="text-sm font-semibold text-red-700 mb-0.5">
                    🏀 {c.partita.squadra}
                    {c.partita.avversario ? ` vs ${c.partita.avversario}` : ''}
                  </p>
                  <p className="text-xs text-red-400 mb-2">
                    {format(parseISO(c.partita.data), 'EEE d MMM', { locale: it })}
                    {' · '}
                    {formatTime(c.partita.ora_inizio)}–{formatTime(c.partita.ora_fine)}
                    {c.partita.palestra ? ` · ${c.partita.palestra}` : ''}
                  </p>

                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Allenamenti in conflitto
                  </p>

                  {c.allenamenti.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between bg-white rounded-lg px-3 py-2 mb-1 border border-red-200"
                    >
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{t.squadra}</p>
                        <p className="text-xs text-gray-500">
                          {formatTime(t.ora_inizio)}–{formatTime(t.ora_fine)}
                          {t.palestra ? ` · ${t.palestra}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setConflictModalOpen(false)
                          setEditingConflictTraining(t)
                        }}
                        className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium active:scale-95 transition-transform ml-3 shrink-0"
                      >
                        Modifica
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editingConflictTraining && (
        <QuickEditAllenamentoModal
          training={editingConflictTraining}
          onClose={() => setEditingConflictTraining(null)}
          onSaved={() => setEditingConflictTraining(null)}
        />
      )}
    </div>
  )
}
