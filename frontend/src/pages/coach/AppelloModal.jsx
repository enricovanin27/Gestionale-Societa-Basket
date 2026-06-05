import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { X, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function AppelloModal({ event, societaId, onClose }) {
  const qc = useQueryClient()
  const [presMap, setPresMap] = useState({})
  const [saved,   setSaved]   = useState(false)

  const { data: giocatori = [], isLoading } = useQuery({
    queryKey: ['appello-giocatori', event.squadra, societaId],
    enabled: !!event.squadra && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .or(`squadra.eq.${event.squadra},squadra2.eq.${event.squadra},squadra3.eq.${event.squadra}`)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: existing = [] } = useQuery({
    queryKey: ['appello-existing', event.data, event.squadra, societaId],
    enabled: !!event.data && !!event.squadra && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('giocatore_id, presente')
        .eq('data',      event.data)
        .eq('squadra',   event.squadra)
        .eq('societa_id', societaId)
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  // Pre-carica le presenze esistenti (se già salvate)
  useEffect(() => {
    if (existing.length > 0) {
      setPresMap(Object.fromEntries(existing.map(p => [p.giocatore_id, p.presente])))
      setSaved(false)
    }
  }, [existing])

  const saveMut = useMutation({
    mutationFn: async () => {
      if (giocatori.length === 0) return
      const records = giocatori.map(g => ({
        giocatore_id: g.id,
        data:         event.data,
        squadra:      event.squadra,
        presente:     presMap[g.id] ?? false,
        societa_id:   societaId,
      }))
      // Delete + insert (upsert robusto)
      const { error: delErr } = await supabase
        .from('presenze_allenamento')
        .delete()
        .eq('data',       event.data)
        .eq('squadra',    event.squadra)
        .eq('societa_id', societaId)
      if (delErr) throw delErr
      const { error } = await supabase.from('presenze_allenamento').insert(records)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['presenze-al-ieri-check'] })
      qc.invalidateQueries({ queryKey: ['attivita-presenze'] })
      setSaved(true)
    },
  })

  const presenti = giocatori.filter(g => presMap[g.id]).length
  const assenti  = giocatori.length - presenti
  const dataLabel = format(parseISO(event.data), 'EEE d MMMM', { locale: it })

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <p className="font-semibold text-sm">📋 Appello — {event.squadra}</p>
            <p className="text-xs opacity-80 capitalize">
              {dataLabel}{event.ora_inizio ? ` · ${event.ora_inizio.slice(0, 5)}` : ''}
            </p>
          </div>
          <button onClick={onClose}><X size={18} className="opacity-70" /></button>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center"><LoadingSpinner /></div>
        ) : (
          <>
            {/* Contatori */}
            <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0">
              <span className="text-sm">
                <span className="font-bold text-green-600">{presenti}</span>
                <span className="text-gray-500"> presenti</span>
              </span>
              <span className="text-sm">
                <span className="font-bold text-red-500">{assenti}</span>
                <span className="text-gray-500"> assenti</span>
              </span>
              <span className="text-xs text-gray-400 ml-auto">{giocatori.length} atleti totali</span>
            </div>

            {/* Lista giocatori */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
              {giocatori.map(g => {
                const presente = presMap[g.id] ?? false
                return (
                  <button key={g.id}
                    onClick={() => { setSaved(false); setPresMap(m => ({ ...m, [g.id]: !m[g.id] })) }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors ${
                      presente ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'
                    }`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      presente ? 'bg-green-500' : 'bg-gray-200'
                    }`}>
                      {presente
                        ? <Check size={14} className="text-white" />
                        : <X    size={12} className="text-gray-400" />
                      }
                    </div>
                    <span className={`text-sm font-medium ${presente ? 'text-green-800' : 'text-gray-500'}`}>
                      {g.cognome} {g.nome}
                    </span>
                  </button>
                )
              })}
              {giocatori.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">
                  Nessun giocatore in questa squadra
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex gap-2">
              <button onClick={onClose}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">
                {saved ? 'Chiudi' : 'Annulla'}
              </button>
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || giocatori.length === 0}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 active:scale-95 transition-all ${
                  saved
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-amber-600 text-white'
                }`}>
                {saved
                  ? '✅ Presenze salvate!'
                  : saveMut.isPending
                    ? 'Salvataggio...'
                    : '💾 Salva presenze'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
