import { useState, useMemo, useEffect } from 'react'
import { format, subDays, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight, Check, X, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'

export default function PresenzePage() {
  const today = new Date()
  const { user, societaId, displayName, logout, societaNome } = useAuth()
  const qc = useQueryClient()

  const [selectedId, setSelectedId] = useState(null)
  const [presMap, setPresMap]       = useState({})
  const [saved, setSaved]           = useState(false)

  const { data: allenatoreRow } = useQuery({
    queryKey: ['my-allenatore', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from('allenatori')
        .select('squadre_capo, squadre_vice')
        .eq('email', user.email)
        .maybeSingle()
      return data
    },
  })

  const parseList = (s) => (typeof s === 'string' && s.trim()
    ? s.split(',').map(x => x.trim()).filter(Boolean)
    : Array.isArray(s) ? s : [])

  const mySquadre = useMemo(() => {
    if (!allenatoreRow) return []
    return [...parseList(allenatoreRow.squadre_capo), ...parseList(allenatoreRow.squadre_vice)]
  }, [allenatoreRow])

  const rangeStart = format(subDays(today, 7), 'yyyy-MM-dd')
  const rangeEnd   = format(addDays(today, 7), 'yyyy-MM-dd')

  const { data: allenamenti = [], isLoading: la } = useQuery({
    queryKey: ['presenze-allenamenti', societaId, mySquadre, rangeStart],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('orario_settimana')
        .select('id, data, squadra, ora_inizio, ora_fine, palestra')
        .eq('societa_id', societaId)
        .in('squadra', mySquadre)
        .gte('data', rangeStart)
        .lte('data', rangeEnd)
        .eq('annullato', false)
        .order('data', { ascending: false })
        .order('ora_inizio')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const selectedAll = allenamenti.find(a => a.id === selectedId)

  const { data: giocatori = [], isLoading: lg } = useQuery({
    queryKey: ['presenze-giocatori', selectedAll?.squadra, societaId],
    enabled: !!selectedAll?.squadra && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .eq('squadra', selectedAll.squadra)
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  const { data: existingPresenze = [] } = useQuery({
    queryKey: ['presenze-existing', selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze')
        .select('giocatore_id, presente')
        .eq('allenamento_id', selectedId)
      return data ?? []
    },
  })

  useEffect(() => {
    if (existingPresenze.length > 0) {
      setPresMap(Object.fromEntries(existingPresenze.map(p => [p.giocatore_id, p.presente])))
    } else {
      setPresMap({})
    }
    setSaved(false)
  }, [existingPresenze, selectedId])

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selectedId || giocatori.length === 0) return
      const records = giocatori.map(g => ({
        allenamento_id: selectedId,
        giocatore_id:   g.id,
        presente:       presMap[g.id] ?? false,
        societa_id:     societaId,
      }))
      const { error } = await supabase
        .from('presenze')
        .upsert(records, { onConflict: 'allenamento_id,giocatore_id' })
      if (error) throw error
    },
    onSuccess: () => {
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['presenze-existing', selectedId] })
      qc.invalidateQueries({ queryKey: ['presenze-giocatore'] })
    },
  })

  const presentiCount = Object.values(presMap).filter(Boolean).length
  const totale        = giocatori.length

  function togglePresenza(gid) {
    setSaved(false)
    setPresMap(m => ({ ...m, [gid]: !m[gid] }))
  }

  function handleSelectAllenamento(id) {
    setSelectedId(id)
    setSaved(false)
    setPresMap({})
  }

  return (
    <div>
      <AppHeader
        title="Presenze"
        subtitle="Registra chi era presente"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      {la ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : allenamenti.length === 0 ? (
        <div className="px-4 pt-4">
          <Card><CardContent className="py-6 text-center text-sm text-gray-400">
            Nessun allenamento nei prossimi/ultimi 7 giorni.
          </CardContent></Card>
        </div>
      ) : !selectedId ? (
        <div className="px-4 pt-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Seleziona allenamento</p>
          {allenamenti.map(a => (
            <button key={a.id} onClick={() => handleSelectAllenamento(a.id)}
              className="w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between active:scale-[0.99] shadow-sm">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {format(new Date(a.data), 'EEEE d MMM', { locale: it })} · {a.squadra}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {a.ora_inizio?.slice(0,5)}–{a.ora_fine?.slice(0,5)}{a.palestra ? ` · ${a.palestra}` : ''}
                </p>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </button>
          ))}
        </div>
      ) : (
        <div className="px-4 pt-4">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setSelectedId(null)}
              className="text-xs text-amber-600 font-semibold">← Cambia</button>
            {selectedAll && (
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {format(new Date(selectedAll.data), 'EEEE d MMM', { locale: it })} · {selectedAll.squadra}
                </p>
                <p className="text-xs text-gray-500">{selectedAll.ora_inizio?.slice(0,5)}–{selectedAll.ora_fine?.slice(0,5)}</p>
              </div>
            )}
          </div>

          {lg ? <LoadingSpinner /> : (
            <>
              <div className="space-y-2 mb-4">
                {giocatori.map(g => {
                  const presente = presMap[g.id] ?? false
                  return (
                    <button key={g.id} onClick={() => togglePresenza(g.id)}
                      className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border transition-colors ${
                        presente ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          presente ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {g.nome[0]}{g.cognome[0]}
                        </div>
                        <p className="text-sm font-medium text-gray-900">{g.cognome} {g.nome}</p>
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        presente ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {presente ? <Check size={16} /> : <X size={16} />}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">Presenti: <strong>{presentiCount} / {totale}</strong></p>
                {saved && <p className="text-xs text-green-600 font-semibold">✓ Salvato</p>}
              </div>

              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || totale === 0}
                className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Save size={16} />
                {saveMut.isPending ? 'Salvataggio...' : 'Salva presenze'}
              </button>
              {saveMut.isError && (
                <p className="text-xs text-red-500 mt-2 text-center">{saveMut.error?.message}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
