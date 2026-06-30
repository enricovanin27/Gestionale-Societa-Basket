import { useState, useMemo, useEffect } from 'react'
import { format, addDays, startOfWeek, addWeeks, eachDayOfInterval, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Check, X, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatistichePage from '../StatistichePage'

const GIORNO_BY_JS_DAY = {
  0: 'domenica', 1: 'lunedi', 2: 'martedi', 3: 'mercoledi',
  4: 'giovedi',  5: 'venerdi', 6: 'sabato',
}

const parseList = (s) =>
  typeof s === 'string' && s.trim()
    ? s.split(',').map(x => x.trim()).filter(Boolean)
    : Array.isArray(s) ? s : []

// ─── Presenze tab ─────────────────────────────────────────────────────────────

function PresenzeTab({ mySquadre, societaId }) {
  const today = new Date()
  const qc    = useQueryClient()

  const [weekOffset,       setWeekOffset]       = useState(0)
  const [selectedId,       setSelectedId]       = useState(null)
  const [presMap,          setPresMap]          = useState({})
  const [saved,            setSaved]            = useState(false)
  const [creatingRow,      setCreatingRow]      = useState(false)
  const [selectedSquadra,  setSelectedSquadra]  = useState(null)
  const [selectedAlHeader, setSelectedAlHeader] = useState(null)

  const weekStart  = startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 })
  const weekEnd    = addDays(weekStart, 6)
  const rangeStart = format(weekStart, 'yyyy-MM-dd')
  const rangeEnd   = format(weekEnd, 'yyyy-MM-dd')

  const { data: rawData, isLoading: la } = useQuery({
    queryKey: ['attivita-presenze', societaId, mySquadre, rangeStart, rangeEnd],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      const [fissoRes, settRes] = await Promise.all([
        supabase.from('orario_fisso')
          .select('id, giorno, squadra, ora_inizio, ora_fine, palestra')
          .eq('societa_id', societaId)
          .in('squadra', mySquadre),
        supabase.from('orario_settimana')
          .select('id, data, squadra, ora_inizio, ora_fine, palestra, annullato')
          .eq('societa_id', societaId)
          .in('squadra', mySquadre)
          .gte('data', rangeStart)
          .lte('data', rangeEnd)
          .order('data', { ascending: false })
          .order('ora_inizio'),
      ])
      if (fissoRes.error) throw fissoRes.error
      if (settRes.error)  throw settRes.error
      return { fisso: fissoRes.data ?? [], settimana: settRes.data ?? [] }
    },
    staleTime: 2 * 60 * 1000,
  })

  const allenamenti = useMemo(() => {
    if (!rawData) return []
    const { fisso, settimana } = rawData
    const results = []
    const days = eachDayOfInterval({ start: parseISO(rangeStart), end: parseISO(rangeEnd) })

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd')
      const giorno  = GIORNO_BY_JS_DAY[day.getDay()]
      const settForDate   = settimana.filter(s => s.data === dateStr)
      const settBySquadra = new Map(settForDate.map(s => [(s.squadra ?? '').toLowerCase().trim(), s]))
      const fissoForDay   = fisso.filter(f => (f.giorno ?? '').toLowerCase() === giorno)

      for (const f of fissoForDay) {
        const key = (f.squadra ?? '').toLowerCase().trim()
        const ov  = settBySquadra.get(key)
        if (ov) {
          if (!ov.annullato) results.push({ ...f, ...ov, data: dateStr, _source: 'settimana' })
        } else {
          results.push({ ...f, data: dateStr, _source: 'fisso' })
        }
      }
      for (const s of settForDate) {
        if (s.annullato) continue
        const hasFisso = fissoForDay.some(
          f => (f.squadra ?? '').toLowerCase().trim() === (s.squadra ?? '').toLowerCase().trim()
        )
        if (!hasFisso) results.push({ ...s, data: dateStr, _source: 'settimana' })
      }
    }

    return results.sort((a, b) => {
      const dc = (b.data ?? '').localeCompare(a.data ?? '')
      return dc !== 0 ? dc : (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? '')
    })
  }, [rawData, rangeStart, rangeEnd])

  // Tutti i giocatori delle squadre (per cognomi assenti nel riepilogo card)
  const { data: tuttiGiocatori = [] } = useQuery({
    queryKey: ['presenze-tutti-giocatori', societaId, mySquadre.join(',')],
    enabled: !!societaId && mySquadre.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('giocatori')
        .select('id, cognome, squadra, squadra2, squadra3')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome')
      return data ?? []
    },
  })

  // Presenze della settimana per mostrare riepilogo nelle card
  const { data: weekPresenze = [] } = useQuery({
    queryKey: ['presenze-week-summary', societaId, mySquadre.join(','), rangeStart, rangeEnd],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('presenze_allenamento')
        .select('giocatore_id, squadra, data, presente')
        .in('squadra', mySquadre)
        .gte('data', rangeStart)
        .lte('data', rangeEnd)
      return data ?? []
    },
  })

  // Riepilogo per sessione: "squadra|data" → { presenti, assenti: [cognomi] }
  const sessionSummary = useMemo(() => {
    if (!tuttiGiocatori.length) return {}
    const giocatoriMap = Object.fromEntries(tuttiGiocatori.map(g => [g.id, g]))
    const bySession = {}
    for (const p of weekPresenze) {
      const key = `${p.squadra}|${p.data}`
      if (!bySession[key]) bySession[key] = { presenti: 0, assentiIds: [] }
      if (p.presente) bySession[key].presenti++
      else bySession[key].assentiIds.push(p.giocatore_id)
    }
    const result = {}
    for (const [key, s] of Object.entries(bySession)) {
      result[key] = {
        presenti: s.presenti,
        assenti: s.assentiIds.map(id => giocatoriMap[id]?.cognome).filter(Boolean),
      }
    }
    return result
  }, [tuttiGiocatori, weekPresenze])

  const selectedAl = selectedAlHeader

  const { data: giocatori = [], isLoading: lg } = useQuery({
    queryKey: ['presenze-giocatori', selectedSquadra, societaId],
    enabled: !!selectedSquadra && !!societaId,
    queryFn: async () => {
      const { data } = await supabase.from('giocatori')
        .select('id, nome, cognome, squadra')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .or(`squadra.eq.${selectedSquadra},squadra2.eq.${selectedSquadra},squadra3.eq.${selectedSquadra}`)
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  const { data: existingPresenze = [] } = useQuery({
    queryKey: ['presenze-existing', societaId, selectedId],
    enabled: !!selectedId && !!selectedAlHeader,
    queryFn: async () => {
      const { data } = await supabase.from('presenze_allenamento')
        .select('giocatore_id, presente')
        .eq('data', selectedAlHeader.data)
        .eq('squadra', selectedSquadra)
      return data ?? []
    },
  })

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (existingPresenze.length > 0) {
      setPresMap(Object.fromEntries(existingPresenze.map(p => [p.giocatore_id, p.presente])))
    } else {
      setPresMap({})
    }
    setSaved(false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [existingPresenze])

  async function handleSelectAllenamento(al) {
    let id = al.id
    if (al._source === 'fisso') {
      setCreatingRow(true)
      const { data: existing } = await supabase.from('orario_settimana')
        .select('id')
        .eq('data', al.data)
        .eq('squadra', al.squadra)
        .eq('societa_id', societaId)
        .maybeSingle()
      if (existing) {
        id = existing.id
      } else {
        const { data: inserted, error } = await supabase.from('orario_settimana')
          .insert([{
            data:       al.data,
            squadra:    al.squadra,
            ora_inizio: al.ora_inizio,
            ora_fine:   al.ora_fine,
            palestra:   al.palestra ?? null,
            annullato:  false,
            societa_id: societaId,
          }])
          .select('id')
          .single()
        if (error) {
          console.error(error)
          setCreatingRow(false)
          return
        }
        id = inserted.id
        qc.invalidateQueries({ queryKey: ['attivita-presenze'] })
      }
      setCreatingRow(false)
    }
    setSelectedId(id)
    setSelectedSquadra(al.squadra)
    setSelectedAlHeader({ data: al.data, squadra: al.squadra, ora_inizio: al.ora_inizio, ora_fine: al.ora_fine })
    setSaved(false)
    setPresMap({})
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selectedId || giocatori.length === 0) return
      const records = giocatori.map(g => ({
        giocatore_id: g.id,
        data:         selectedAlHeader.data,
        squadra:      selectedSquadra,
        presente:     presMap[g.id] ?? false,
        societa_id:   societaId,
      }))
      const { error: delErr } = await supabase.from('presenze_allenamento')
        .delete()
        .eq('data', selectedAlHeader.data)
        .eq('squadra', selectedSquadra)
      if (delErr) throw delErr
      const { error } = await supabase.from('presenze_allenamento').insert(records)
      if (error) throw error
    },
    onSuccess: () => {
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['presenze-existing', societaId, selectedId] })
      qc.invalidateQueries({ queryKey: ['presenze-giocatore'] })
      qc.invalidateQueries({ queryKey: ['presenze-week-summary'] })
    },
  })

  const presentiCount = Object.values(presMap).filter(Boolean).length
  const totale        = giocatori.length

  function togglePresenza(gid) {
    setSaved(false)
    setPresMap(m => ({ ...m, [gid]: !m[gid] }))
  }

  if (la || creatingRow) return <div className="pt-8"><LoadingSpinner /></div>

  // Vista lista: selezione allenamento con navigazione settimanale
  if (!selectedId) {
    return (
      <div className="space-y-3">
        {/* Navigazione settimana */}
        <div className="flex items-center justify-between">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg bg-gray-100 active:scale-95">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold text-gray-700">
              {format(weekStart, 'd MMM', { locale: it })} – {format(weekEnd, 'd MMM yyyy', { locale: it })}
            </div>
            {weekOffset === 0 && <div className="text-xs text-amber-600 font-medium">Questa settimana</div>}
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg bg-gray-100 active:scale-95">
            <ChevronRight size={16} />
          </button>
        </div>

        {allenamenti.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
            Nessun allenamento questa settimana.
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Seleziona allenamento</p>
            {allenamenti.map(a => {
              const summary = sessionSummary[`${a.squadra}|${a.data}`]
              return (
                <button
                  key={`${a._source}-${a.id ?? a.data + a.squadra}`}
                  onClick={() => handleSelectAllenamento(a)}
                  className="w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between active:scale-[0.99] shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {format(parseISO(a.data), 'EEEE d MMM', { locale: it })} · {a.squadra}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {a.ora_inizio?.slice(0, 5)}–{a.ora_fine?.slice(0, 5)}
                      {a.palestra ? ` · ${a.palestra}` : ''}
                      {a._source === 'fisso' && <span className="ml-1 text-amber-600">(ricorrente)</span>}
                    </p>
                    {summary && (
                      <div className="mt-1.5">
                        <span className="text-xs text-green-600 font-medium">✓ {summary.presenti} presenti</span>
                        {summary.assenti.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Assenti: {summary.assenti.join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-gray-400 shrink-0 ml-2" />
                </button>
              )
            })}
          </>
        )}
      </div>
    )
  }

  // Vista dettaglio: registra presenze
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => { setSelectedId(null); setSelectedSquadra(null); setSelectedAlHeader(null) }} className="text-xs text-amber-600 font-semibold">← Cambia</button>
        {selectedAl && (
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {format(parseISO(selectedAl.data), 'EEEE d MMM', { locale: it })} · {selectedAl.squadra}
            </p>
            <p className="text-xs text-gray-500">{selectedAl.ora_inizio?.slice(0, 5)}–{selectedAl.ora_fine?.slice(0, 5)}</p>
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
                  }`}
                >
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
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Save size={16} />
            {saveMut.isPending ? 'Salvataggio...' : 'Salva presenze'}
          </button>
          {saveMut.isError && (
            <p className="text-xs text-red-500 mt-2 text-center">{saveMut.error?.message}</p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'presenze',    label: 'Presenze'    },
  { id: 'statistiche', label: 'Statistiche' },
]

export default function AttivitaPage() {
  const { user, societaId } = useAuth()
  const [activeTab, setActiveTab] = useState('presenze')

  const { data: allenatoreRow } = useQuery({
    queryKey: ['my-allenatore', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase.from('allenatori')
        .select('squadre_capo, squadre_vice')
        .eq('email', user.email)
        .maybeSingle()
      return data
    },
  })

  const mySquadre = useMemo(() => {
    if (!allenatoreRow) return []
    return [...parseList(allenatoreRow.squadre_capo), ...parseList(allenatoreRow.squadre_vice)]
  }, [allenatoreRow])

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <PageHeader title="Attività" />

      <div className="bg-white border-b shadow-sm">
        <div className="flex px-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {activeTab === 'presenze' && (
          mySquadre.length > 0
            ? <PresenzeTab mySquadre={mySquadre} societaId={societaId} />
            : allenatoreRow !== undefined
              ? <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  ⚠️ Nessuna squadra assegnata al tuo profilo.
                </p>
              : <div className="pt-8"><LoadingSpinner /></div>
        )}
        {activeTab === 'statistiche' && <StatistichePage embedded />}
      </div>
    </div>
  )
}
