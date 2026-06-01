import { useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

// ─── Hook unread count (esportato per CoachLayout e PrepLayout) ──────────────

export function useUnreadMessaggi(societaId, squadreVisibili) {
  return useQuery({
    queryKey: ['messaggi-unread', societaId, (squadreVisibili ?? []).join(',')],
    enabled: !!societaId && (squadreVisibili ?? []).length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count } = await supabase
        .from('messaggi')
        .select('id', { count: 'exact', head: true })
        .eq('societa_id', societaId)
        .in('squadra', squadreVisibili)
        .eq('letto', false)
      return count ?? 0
    },
  })
}

// ─── Pagina principale ───────────────────────────────────────────────────────

export default function MessaggiRicevutiPage() {
  const { societaId, profile, activeRole, isPreparatore,
          squadreAllenatore, displayName, logout, societaNome } = useAuth()
  const qc = useQueryClient()

  // ── Squadre del preparatore (solo se ruolo prep) ─────────────────────────
  const { data: prepSquadreData = [] } = useQuery({
    queryKey: ['prep-squadre-mie', societaId, profile?.id],
    enabled: !!societaId && !!profile?.id && (activeRole === 'preparatore_atletico' || isPreparatore),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_squadre').select('squadra')
        .eq('societa_id', societaId)
        .eq('preparatore_id', profile.id)
      return (data ?? []).map(r => r.squadra)
    },
  })

  // ── Squadre visibili per questo utente ───────────────────────────────────
  const squadreVisibili = useMemo(() => {
    if (activeRole === 'preparatore_atletico' || isPreparatore) return prepSquadreData
    // Allenatore: usa squadreAllenatore da useAuth (profile.squadra/2/3)
    return squadreAllenatore ?? []
  }, [activeRole, isPreparatore, prepSquadreData, squadreAllenatore])

  // ── Query messaggi ───────────────────────────────────────────────────────
  const { data: messaggi = [], isLoading } = useQuery({
    queryKey: ['messaggi-staff', societaId, squadreVisibili.join(',')],
    enabled: !!societaId && squadreVisibili.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('messaggi')
        .select('id, mittente_nome, mittente_ruolo, squadra, testo, created_at, letto')
        .eq('societa_id', societaId)
        .in('squadra', squadreVisibili)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    },
  })

  // ── Segna come letti al mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!societaId || squadreVisibili.length === 0) return
    const nonLetti = messaggi.filter(m => !m.letto)
    if (nonLetti.length === 0) return

    supabase
      .from('messaggi')
      .update({ letto: true })
      .eq('societa_id', societaId)
      .in('squadra', squadreVisibili)
      .eq('letto', false)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['messaggi-unread', societaId] })
      })
  }, [messaggi, societaId, squadreVisibili, qc])

  // ── UI stati vuoti ────────────────────────────────────────────────────────
  if (squadreVisibili.length === 0 && !isLoading) {
    return (
      <div>
        <AppHeader title="Messaggi" subtitle="Dalle famiglie"
          displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="px-4 pt-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            ⚠️ Nessuna squadra associata al tuo profilo.
          </div>
        </div>
      </div>
    )
  }

  const unreadCount = messaggi.filter(m => !m.letto).length

  return (
    <div>
      <AppHeader
        title="Messaggi"
        subtitle={unreadCount > 0 ? `${unreadCount} non letti` : 'Dalle famiglie'}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      <div className="px-4 pt-4 space-y-2 pb-24">
        {isLoading ? (
          <LoadingSpinner />
        ) : messaggi.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">Nessun messaggio ricevuto</p>
            <p className="text-xs mt-1">I messaggi delle famiglie appariranno qui</p>
          </div>
        ) : (
          messaggi.map(m => (
            <div
              key={m.id}
              className={`bg-white rounded-xl border px-4 py-3 shadow-sm ${
                !m.letto ? 'border-l-4 border-l-blue-500 border-gray-200' : 'border-gray-100 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{m.mittente_nome}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    m.mittente_ruolo === 'genitore'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {m.mittente_ruolo === 'genitore' ? 'Genitore' : 'Giocatore'}
                  </span>
                  <span className="text-xs text-blue-600 font-medium">{m.squadra}</span>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">
                  {format(new Date(m.created_at), 'd MMM · HH:mm', { locale: it })}
                </span>
              </div>
              <p className="text-sm text-gray-700">{m.testo}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
