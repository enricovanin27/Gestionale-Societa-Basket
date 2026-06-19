/**
 * SetupChecklist — checklist primo avvio per società nuove.
 *
 * Auto-rileva cosa manca con 3 query leggere (head-only count).
 * Scompare quando tutti i passi sono completati, o quando l'utente
 * clicca X (dismissed salvato in localStorage per societaId).
 *
 * Usare in HomeAdmin e SegreteriaDashboard.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronRight, X, Rocket } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const DISMISS_KEY = (sid) => `oderzo_setup_done_${sid}`

export default function SetupChecklist() {
  const { societaId } = useAuth()
  const navigate = useNavigate()

  const [dismissed, setDismissed] = useState(
    () => societaId ? !!localStorage.getItem(DISMISS_KEY(societaId)) : false
  )

  // ── 3 count queries leggere (head: true = nessun dato trasferito) ─────────

  const { data: hasSquadre } = useQuery({
    queryKey: ['setup-check-squadre', societaId],
    enabled: !!societaId && !dismissed,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count } = await supabase
        .from('squadre')
        .select('*', { count: 'exact', head: true })
        .eq('societa_id', societaId)
      return (count ?? 0) > 0
    },
  })

  const { data: hasGiocatori } = useQuery({
    queryKey: ['setup-check-giocatori', societaId],
    enabled: !!societaId && !dismissed,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count } = await supabase
        .from('giocatori')
        .select('*', { count: 'exact', head: true })
        .eq('societa_id', societaId)
        .eq('attivo', true)
      return (count ?? 0) > 0
    },
  })

  const { data: hasPartite } = useQuery({
    queryKey: ['setup-check-partite', societaId],
    enabled: !!societaId && !dismissed,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count } = await supabase
        .from('calendario')
        .select('*', { count: 'exact', head: true })
        .eq('societa_id', societaId)
      return (count ?? 0) > 0
    },
  })

  // ── Logica di visibilità ─────────────────────────────────────────────────

  if (dismissed) return null
  // Non mostrare durante il caricamento iniziale
  if (hasSquadre === undefined || hasGiocatori === undefined || hasPartite === undefined) return null
  // Se tutto è già pronto, non mostrare
  if (hasSquadre && hasGiocatori && hasPartite) return null

  // ── Passi ─────────────────────────────────────────────────────────────────

  const steps = [
    {
      label:    'Crea le squadre',
      sublabel: 'Definisci le categorie della tua società',
      done:     hasSquadre,
      to:       '/admin/setup/squadre',
    },
    {
      label:    'Aggiungi i giocatori',
      sublabel: 'Inserisci il roster di ogni squadra',
      done:     hasGiocatori,
      to:       '/secretary/giocatori',
    },
    {
      label:    'Aggiungi la prima partita',
      sublabel: 'Inserisci manualmente o importa il calendario FIP',
      done:     hasPartite,
      to:       '/admin/partite',
    },
  ]

  const completedCount = steps.filter(s => s.done).length

  function dismiss() {
    localStorage.setItem(DISMISS_KEY(societaId), '1')
    setDismissed(true)
  }

  return (
    <div className="mx-4 mt-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 shadow-sm">

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-900">Inizia da qui</p>
            <p className="text-xs text-blue-500 mt-0.5">
              {completedCount}/{steps.length} passi completati
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="p-1 text-blue-400 hover:text-blue-600 rounded-lg -mt-0.5 -mr-0.5 transition-colors"
          title="Nascondi"
        >
          <X size={15} />
        </button>
      </div>

      {/* Barra progresso */}
      <div className="w-full bg-blue-100 rounded-full h-1.5 mb-3">
        <div
          className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      {/* Lista passi */}
      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <button
            key={i}
            onClick={() => !step.done && navigate(step.to)}
            disabled={step.done}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
              step.done
                ? 'bg-green-50 border border-green-100 cursor-default'
                : 'bg-white border border-blue-100 hover:border-blue-300 hover:bg-blue-50 active:scale-[0.99]'
            }`}
          >
            {step.done
              ? <CheckCircle2 size={17} className="text-green-500 shrink-0" />
              : <div className="w-[17px] h-[17px] rounded-full border-2 border-blue-300 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-snug ${
                step.done ? 'text-green-700 line-through opacity-60' : 'font-semibold text-gray-800'
              }`}>
                {step.label}
              </p>
              {!step.done && (
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{step.sublabel}</p>
              )}
            </div>
            {!step.done && <ChevronRight size={14} className="text-blue-400 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  )
}
