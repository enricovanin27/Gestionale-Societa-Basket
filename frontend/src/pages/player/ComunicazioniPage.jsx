import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Send, MessageCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

export default function ComunicazioniPage() {
  const { user, profile, societaId, activeRole, displayName, logout, societaNome } = useAuth()
  const qc = useQueryClient()

  const [testo, setTesto] = useState('')
  const [squadraSel, setSquadraSel] = useState('')

  // ── Squadre disponibili per questo utente ─────────────────────────────────
  const squadre = useMemo(() => {
    if (!profile) return []
    if (activeRole === 'genitore') {
      return [profile.genitore_squadra, profile.genitore_squadra2, profile.genitore_squadra3].filter(Boolean)
    }
    return [profile.squadra, profile.squadra2, profile.squadra3].filter(Boolean)
  }, [profile, activeRole])

  // Squadra pre-selezionata (unica o prima della lista)
  const squadraEffettiva = squadraSel || squadre[0] || ''

  // ── Query: messaggi inviati da questo utente ──────────────────────────────
  const { data: messaggi = [], isLoading } = useQuery({
    queryKey: ['miei-messaggi', societaId, user?.id],
    enabled: !!societaId && !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('messaggi')
        .select('id, squadra, testo, created_at')
        .eq('societa_id', societaId)
        .eq('mittente_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
  })

  // ── Mutation: invia messaggio ─────────────────────────────────────────────
  const sendMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('messaggi').insert([{
        societa_id:     societaId,
        mittente_id:    user.id,
        mittente_nome:  displayName || user.email,
        mittente_ruolo: activeRole === 'genitore' ? 'genitore' : 'giocatore',
        squadra:        squadraEffettiva,
        testo:          testo.trim(),
      }])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['miei-messaggi', societaId, user?.id] })
      setTesto('')
    },
  })

  const canSend = testo.trim().length > 0 && !!squadraEffettiva

  if (squadre.length === 0) {
    return (
      <div>
        <AppHeader title="Comunicazioni" subtitle="Messaggi allo staff"
          displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="px-4 pt-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            ⚠️ Nessuna squadra associata al tuo profilo. Contatta l'amministratore.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <AppHeader title="Comunicazioni" subtitle="Scrivi al tuo staff"
        displayName={displayName} logout={logout} societaNome={societaNome} />

      <div className="px-4 pt-4 space-y-5 pb-24">

        {/* Form invio */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <MessageCircle size={16} className="text-blue-500" />
            Scrivi un messaggio
          </p>

          {/* Selezione squadra (solo se multiple) */}
          {squadre.length > 1 && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Squadra</label>
              <select
                className={inp}
                value={squadraSel || squadre[0]}
                onChange={e => setSquadraSel(e.target.value)}
              >
                {squadre.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {squadre.length === 1 && (
            <p className="text-xs text-gray-400">
              Squadra: <span className="font-semibold text-gray-700">{squadre[0]}</span>
            </p>
          )}

          {/* Textarea */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Messaggio *</label>
            <textarea
              className={inp + ' resize-none'}
              rows={3}
              placeholder="Scrivi qui il tuo messaggio per l'allenatore..."
              value={testo}
              onChange={e => setTesto(e.target.value)}
              maxLength={500}
            />
            <p className="text-right text-[10px] text-gray-300 mt-0.5">{testo.length}/500</p>
          </div>

          {/* Errore */}
          {sendMut.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {sendMut.error?.message ?? 'Errore durante l\'invio'}
            </p>
          )}

          {/* Bottone */}
          <button
            onClick={() => sendMut.mutate()}
            disabled={!canSend || sendMut.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 active:scale-95 transition-transform"
          >
            {sendMut.isPending
              ? 'Invio in corso...'
              : <><Send size={15} /> Invia messaggio</>
            }
          </button>

          {sendMut.isSuccess && (
            <p className="text-xs text-green-600 text-center">✅ Messaggio inviato!</p>
          )}
        </div>

        {/* Lista messaggi inviati */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">
            Messaggi inviati
          </p>
          {isLoading ? (
            <LoadingSpinner />
          ) : messaggi.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nessun messaggio inviato</p>
          ) : (
            <div className="space-y-2">
              {messaggi.map(m => (
                <div key={m.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-blue-600">{m.squadra}</span>
                    <span className="text-[10px] text-gray-400">
                      {format(new Date(m.created_at), 'd MMM · HH:mm', { locale: it })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{m.testo}</p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
