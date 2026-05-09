import { useState, useMemo } from 'react'
import { format, addDays, addWeeks, startOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { EventRow, timesOverlap, QuickEditAllenamentoModal } from './shared'

export default function HomeAdmin() {
  const { displayName, logout, societaNome, societaId } = useAuth()
  const [editingConflictTraining, setEditingConflictTraining] = useState(null)
  const navigate = useNavigate()

  const today      = new Date()
  const todayStr   = format(today, 'yyyy-MM-dd')
  const endStr     = format(addDays(today, 14), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(today), 'yyyy-MM-dd')
  const weekStart     = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])
  const nextWeekStart = useMemo(() => addWeeks(weekStart, 1), [weekStart])
  const week2Start    = useMemo(() => addWeeks(weekStart, 2), [weekStart])

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

  // ── KPI: partite questo mese ───────────────────────────────────────────────
  const { data: partiteMese = 0 } = useQuery({
    queryKey: ['admin-partite-mese', monthStart, monthEnd],
    queryFn: async () => {
      const { count } = await supabase
        .from('calendario')
        .select('*', { count: 'exact', head: true })
        .gte('data', monthStart)
        .lte('data', monthEnd)
      return count ?? 0
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── KPI: quote non pagate ──────────────────────────────────────────────────
  const { data: quoteNonPagate = 0 } = useQuery({
    queryKey: ['admin-quote-non-pagate', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { count } = await supabase
        .from('quote')
        .select('*', { count: 'exact', head: true })
        .eq('societa_id', societaId)
        .eq('pagato', false)
      return count ?? 0
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Partite future (prossimi 14gg) ─────────────────────────────────────────
  const { data: partiteFuture = [], isLoading: loadingP } = useQuery({
    queryKey: ['admin-partite-future', todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario').select('*')
        .gte('data', todayStr).lte('data', endStr)
        .order('data').order('ora_inizio')
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  // ── Provvisorie ────────────────────────────────────────────────────────────
  const { data: provvisorie = [], isLoading: loadingProv } = useQuery({
    queryKey: ['admin-provvisorie', todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from('calendario').select('*')
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
  const urgenzeTot     = provvisorie.length + totalConflicts + certScadutiN
  const isLoading      = loadingP || loadingProv || loadingG

  return (
    <div className="pb-20">
      <AppHeader
        title="Dashboard"
        subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : (
        <div className="px-4 pt-4 space-y-4">

          {/* KPI row 1 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Squadre',       value: squadreCount,  color: 'text-amber-600'  },
              { label: 'Cert. scaduti', value: certScadutiN,  color: certScadutiN  > 0 ? 'text-red-600'  : 'text-green-600' },
              { label: 'Partite mese',  value: partiteMese,   color: 'text-green-600'  },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 py-3 text-center shadow-sm">
                <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>

          {/* KPI row 2 */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Quote non pagate', value: quoteNonPagate,      color: quoteNonPagate > 0 ? 'text-amber-500' : 'text-green-600', onClick: () => navigate('/admin/setup') },
              { label: 'Provvisorie',       value: provvisorie.length, color: provvisorie.length > 0 ? 'text-purple-600' : 'text-green-600', onClick: () => navigate('/admin/partite') },
            ].map(({ label, value, color, onClick }) => (
              <button key={label} onClick={onClick}
                className="bg-white rounded-xl border border-gray-100 py-3 text-center shadow-sm active:scale-[0.98] transition-transform">
                <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
              </button>
            ))}
          </div>

          {/* Azioni urgenti */}
          {urgenzeTot > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Azioni urgenti</p>
              <div className="space-y-2">
                {totalConflicts > 0 && (
                  <button
                    onClick={() => navigate('/admin/allenamenti')}
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
              </div>
            </div>
          )}

          {urgenzeTot === 0 && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">
              <CheckCircle2 size={16} /> Tutto in ordine! Nessuna azione urgente.
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
