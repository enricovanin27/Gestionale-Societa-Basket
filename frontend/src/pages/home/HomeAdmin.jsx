import { useState, useMemo, useEffect } from 'react'
import { format, addDays, addWeeks, startOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns'
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
    queryKey: ['admin-partite-mese', monthStart, monthEnd, societaId],
    enabled: !!societaId,
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

  // ── Partite future (prossimi 14gg) ─────────────────────────────────────────
  const { data: partiteFuture = [], isLoading: loadingP } = useQuery({
    queryKey: ['admin-partite-future', todayStr, societaId],
    enabled: !!societaId,
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
    queryKey: ['admin-provvisorie', todayStr, societaId],
    enabled: !!societaId,
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

      {conflictModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
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
