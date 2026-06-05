import { useState, useMemo } from 'react'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const QUANDO_LABEL = {
  prima:      'Prima',
  durante:    'Durante',
  dopo:       'Dopo',
  standalone: 'Sessione libera',
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, isOpen, onToggle }) {
  const hasItems = value > 0
  const content = (
    <>
      <p className={`text-2xl font-bold ${hasItems ? 'text-amber-600' : 'text-green-600'}`}>{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
      {hasItems && (
        <div className="mt-1.5 flex justify-center">
          {isOpen ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
        </div>
      )}
    </>
  )

  if (!hasItems) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-3 px-2 text-center shadow-sm">
        {content}
      </div>
    )
  }

  return (
    <button
      onClick={onToggle}
      className="bg-white rounded-xl border border-gray-200 py-3 px-2 w-full text-center shadow-sm active:scale-[0.98] transition-transform"
    >
      {content}
    </button>
  )
}

// ─── Componente principale ────────────────────────────────────────────────────

export default function HomePrepPage() {
  const { societaId, profile, displayName, logout, societaNome } = useAuth()
  const [openSessioni,    setOpenSessioni]    = useState(false)
  const [openAllenamenti, setOpenAllenamenti] = useState(false)

  const weekStart = useMemo(
    () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    []
  )
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart])
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr   = format(weekEnd,   'yyyy-MM-dd')

  // ── Squadre assegnate al preparatore ──────────────────────────────────────
  const { data: squadreAssegnate = [] } = useQuery({
    queryKey: ['prep-squadre-mie', societaId, profile?.id],
    enabled: !!societaId && !!profile?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_squadre').select('squadra')
        .eq('societa_id', societaId)
        .eq('preparatore_id', profile.id)
      return (data ?? []).map(r => r.squadra)
    },
  })

  // ── Sessioni atletica questa settimana ────────────────────────────────────
  const { data: sessioni = [], isLoading: loadingSessioni } = useQuery({
    queryKey: ['prep-home-sessioni', societaId, profile?.id, weekStartStr],
    enabled: !!societaId && !!profile?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_sessioni')
        .select('id, squadra, data, quando, durata_min, su_campo, ora_inizio, note')
        .eq('societa_id', societaId)
        .eq('preparatore_id', profile.id)
        .gte('data', weekStartStr)
        .lte('data', weekEndStr)
        .order('data').order('ora_inizio')
      return data ?? []
    },
  })

  // ── Allenamenti squadre questa settimana ──────────────────────────────────
  const { data: weekData, isLoading: loadingAllenamenti } = useWeekEvents(weekStart)
  const allenamenti = useMemo(() => {
    if (!weekData?.events) return []
    return weekData.events.filter(e =>
      e._tipo === 'allenamento' &&
      !e.annullato &&
      (squadreAssegnate.length === 0 || squadreAssegnate.includes(e.squadra))
    )
  }, [weekData, squadreAssegnate])

  // ── Raggruppamento per data ───────────────────────────────────────────────
  const sessioniPerData = useMemo(() => {
    const map = {}
    for (const s of sessioni) {
      if (!map[s.data]) map[s.data] = []
      map[s.data].push(s)
    }
    return map
  }, [sessioni])

  const allenamentiPerData = useMemo(() => {
    const map = {}
    for (const e of allenamenti) {
      if (!map[e.data]) map[e.data] = []
      map[e.data].push(e)
    }
    return map
  }, [allenamenti])

  const isLoading = loadingSessioni || loadingAllenamenti
  const tuttoOk = sessioni.length === 0 && allenamenti.length === 0

  return (
    <div>
      <AppHeader
        title="Home"
        subtitle={societaNome ?? 'Preparatore atletico'}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : (
        <div className="px-4 pt-4 space-y-4 pb-24">

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-2">
            <KpiCard
              label="Sessioni questa sett."
              value={sessioni.length}
              isOpen={openSessioni}
              onToggle={() => setOpenSessioni(v => !v)}
            />
            <KpiCard
              label="Allenamenti squadre"
              value={allenamenti.length}
              isOpen={openAllenamenti}
              onToggle={() => setOpenAllenamenti(v => !v)}
            />
          </div>

          {tuttoOk && (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 flex items-center gap-2 text-sm text-green-600 shadow-sm">
              ✅ Nessuna sessione programmata questa settimana
            </div>
          )}

          {/* Sessioni espanse */}
          {openSessioni && sessioni.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2 px-1">
                Sessioni atletica — settimana corrente
              </p>
              <div className="space-y-2">
                {Object.entries(sessioniPerData).map(([data, items]) => (
                  <div key={data}>
                    <p className="text-xs font-medium text-gray-500 mb-1 px-1">
                      {format(new Date(data + 'T12:00:00'), 'EEEE d MMM', { locale: it })}
                    </p>
                    {items.map(s => (
                      <div key={s.id} className="bg-white rounded-xl border-l-4 border-amber-400 px-3 py-2.5 shadow-sm mb-1.5">
                        <p className="text-sm font-semibold text-gray-900">{s.squadra}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {QUANDO_LABEL[s.quando]}
                          {s.durata_min ? ` · ${s.durata_min} min` : ''}
                          {s.su_campo ? ' · ⚠ su campo' : ' · fuori campo'}
                          {s.quando === 'standalone' && s.ora_inizio ? ` · ${s.ora_inizio.slice(0, 5)}` : ''}
                        </p>
                        {s.note && <p className="text-xs text-gray-400 mt-0.5 italic">{s.note}</p>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Allenamenti espansi */}
          {openAllenamenti && allenamenti.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2 px-1">
                Allenamenti squadre — settimana corrente
              </p>
              <div className="space-y-2">
                {Object.entries(allenamentiPerData).map(([data, items]) => (
                  <div key={data}>
                    <p className="text-xs font-medium text-gray-500 mb-1 px-1">
                      {format(new Date(data + 'T12:00:00'), 'EEEE d MMM', { locale: it })}
                    </p>
                    {items.map((e, i) => (
                      <div key={`${e._source}-${e.id ?? i}`} className="bg-white rounded-xl border-l-4 border-blue-400 px-3 py-2.5 shadow-sm mb-1.5">
                        <p className="text-sm font-semibold text-gray-900">{e.squadra}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {String(e.ora_inizio ?? '').slice(0, 5)}–{String(e.ora_fine ?? '').slice(0, 5)}
                          {e.palestra ? ` · ${e.palestra}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
