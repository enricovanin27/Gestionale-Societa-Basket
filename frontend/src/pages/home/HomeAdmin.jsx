import { useState, useMemo } from 'react'
import { format, addDays, addWeeks, parseISO, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { CheckCircle2, AlertTriangle, Clock, MapPin, AlertCircle, ArrowRight, ChevronUp, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import { formatTime } from '../../lib/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EventRow, timesOverlap, QuickEditAllenamentoModal } from './shared'

export default function HomeAdmin() {
  const { displayName, logout, societaNome } = useAuth()
  const [tab, setTab]                             = useState('partite')
  const [editingConflictTraining, setEditingConflictTraining] = useState(null)
  const [openQuestaSettimana,    setOpenQuestaSettimana]    = useState(true)
  const [openProssimaSettimana,  setOpenProssimaSettimana]  = useState(true)
  const navigate                                  = useNavigate()
  const today          = new Date()
  const todayStr       = format(today, 'yyyy-MM-dd')
  const endStr         = format(addDays(today, 14), 'yyyy-MM-dd')
  const weekStart      = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])
  const nextWeekStart  = useMemo(() => addWeeks(weekStart, 1), [weekStart])
  const week2Start     = useMemo(() => addWeeks(weekStart, 2), [weekStart])
  const nextWeekStartStr = useMemo(() => format(nextWeekStart, 'yyyy-MM-dd'), [nextWeekStart])

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

  const { data: provvisorie = [], isLoading: loadingProv } = useQuery({
    queryKey: ['admin-provvisorie', todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario').select('*')
        .eq('stato', 'provvisoria').gte('data', todayStr)
        .order('data').order('ora_inizio')
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: thisWeek }  = useWeekEvents(weekStart)
  const { data: nextWeek }  = useWeekEvents(nextWeekStart)
  const { data: week2 }     = useWeekEvents(week2Start)

  const conflictsAll = useMemo(() => {
    const allEvents   = [...(thisWeek?.events ?? []), ...(nextWeek?.events ?? []), ...(week2?.events ?? [])]
    const partite     = allEvents.filter(e => e._tipo === 'partita' && e.stato === 'definitiva' && e.data >= todayStr)
    const allenamenti = allEvents.filter(e => e._tipo === 'allenamento' && !e.annullato)
    const result = []
    for (const p of partite) {
      const conf = allenamenti.filter(t => {
        if (t.data !== p.data) return false
        if (!timesOverlap(p.ora_inizio, p.ora_fine, t.ora_inizio, t.ora_fine)) return false
        const sameSquadra = (t.squadra ?? '').toLowerCase() === (p.squadra ?? '').toLowerCase()
        const samePalestra = p.casa_fuori === 'Casa' &&
          p.palestra?.trim() && t.palestra?.trim() &&
          p.palestra.trim().toLowerCase() === t.palestra.trim().toLowerCase()
        return sameSquadra || samePalestra
      })
      if (conf.length) result.push({ partita: p, allenamenti: conf })
    }
    const seen = new Set()
    return result.filter(r => {
      if (seen.has(r.partita.id)) return false
      seen.add(r.partita.id)
      return true
    })
  }, [thisWeek, nextWeek, week2, todayStr])

  const { data: doppioList = [] } = useQuery({
    queryKey: ['doppio-campionato'],
    queryFn: async () => {
      const { data } = await supabase.from('doppio_campionato').select('*')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const doppioConflictsAdmin = useMemo(() => {
    if (!doppioList.length || !partiteFuture.length) return []
    const byDate = {}
    for (const p of partiteFuture) {
      if (!byDate[p.data]) byDate[p.data] = []
      byDate[p.data].push(p)
    }
    const result = []
    for (const pair of doppioList) {
      for (const [dateStr, partite] of Object.entries(byDate)) {
        const partita_a = partite.find(p => p.squadra === pair.squadra_a)
        const partita_b = partite.find(p => p.squadra === pair.squadra_b)
        if (partita_a && partita_b) {
          result.push({ data: dateStr, pair, partita_a, partita_b })
        }
      }
    }
    return result
  }, [doppioList, partiteFuture])

  const daGestireTot = provvisorie.length + conflictsAll.length + doppioConflictsAdmin.length
  const isLoading    = loadingP || loadingProv

  const partiteQuestaSettimana   = useMemo(() => partiteFuture.filter(p => p.data < nextWeekStartStr), [partiteFuture, nextWeekStartStr])
  const partiteProssimaSettimana = useMemo(() => partiteFuture.filter(p => p.data >= nextWeekStartStr), [partiteFuture, nextWeekStartStr])

  const partiteQsByDate = useMemo(() => {
    const map = {}
    for (const p of partiteQuestaSettimana) {
      if (!map[p.data]) map[p.data] = []
      map[p.data].push(p)
    }
    return map
  }, [partiteQuestaSettimana])

  const partitePSByDate = useMemo(() => {
    const map = {}
    for (const p of partiteProssimaSettimana) {
      if (!map[p.data]) map[p.data] = []
      map[p.data].push(p)
    }
    return map
  }, [partiteProssimaSettimana])

  return (
    <div className="pb-20">
      <AppHeader
        title="Dashboard"
        subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {/* Toggle tab */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex bg-secondary rounded-xl p-1 gap-1">
          <button
            onClick={() => setTab('partite')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'partite'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Partite
            <span className="ml-1.5 text-xs text-muted-foreground">({partiteFuture.length})</span>
          </button>
          <button
            onClick={() => setTab('gestire')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'gestire'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Da gestire
            {daGestireTot > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] bg-destructive text-white text-[10px] font-bold rounded-full px-1">
                {daGestireTot}
              </span>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="pt-6"><LoadingSpinner /></div>
      ) : tab === 'partite' ? (

        <div className="px-4 space-y-3">
          {partiteFuture.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-5 text-sm text-green-600">
                <CheckCircle2 size={16} />
                <span>Nessuna partita nei prossimi 14 giorni</span>
              </CardContent>
            </Card>
          ) : (<>

            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setOpenQuestaSettimana(v => !v)}
              >
                <span className="text-sm font-semibold text-foreground">
                  Partite questa settimana
                  <span className="ml-2 text-xs text-muted-foreground font-normal">({partiteQuestaSettimana.length})</span>
                </span>
                {openQuestaSettimana
                  ? <ChevronUp size={16} className="text-muted-foreground" />
                  : <ChevronDown size={16} className="text-muted-foreground" />}
              </button>
              {openQuestaSettimana && (
                <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                  {partiteQuestaSettimana.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl py-3 px-3">
                      <CheckCircle2 size={14} /> Nessuna partita questa settimana
                    </div>
                  ) : (
                    Object.entries(partiteQsByDate).map(([dateStr, partite]) => (
                      <div key={dateStr}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 capitalize">
                          {format(parseISO(dateStr), 'EEEE d MMMM', { locale: it })}
                        </p>
                        <div className="space-y-2">
                          {partite.map(p => (
                            <EventRow key={p.id} event={{ ...p, _tipo: 'partita', _source: 'calendario' }} />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setOpenProssimaSettimana(v => !v)}
              >
                <span className="text-sm font-semibold text-foreground">
                  Partite settimana prossima
                  <span className="ml-2 text-xs text-muted-foreground font-normal">({partiteProssimaSettimana.length})</span>
                </span>
                {openProssimaSettimana
                  ? <ChevronUp size={16} className="text-muted-foreground" />
                  : <ChevronDown size={16} className="text-muted-foreground" />}
              </button>
              {openProssimaSettimana && (
                <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                  {partiteProssimaSettimana.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl py-3 px-3">
                      <CheckCircle2 size={14} /> Nessuna partita la prossima settimana
                    </div>
                  ) : (
                    Object.entries(partitePSByDate).map(([dateStr, partite]) => (
                      <div key={dateStr}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 capitalize">
                          {format(parseISO(dateStr), 'EEEE d MMMM', { locale: it })}
                        </p>
                        <div className="space-y-2">
                          {partite.map(p => (
                            <EventRow key={p.id} event={{ ...p, _tipo: 'partita', _source: 'calendario' }} />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

          </>)}
        </div>

      ) : (

        <div className="px-4 space-y-4">
          {daGestireTot === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-5 text-sm text-green-600">
                <CheckCircle2 size={16} />
                <span>Tutto in ordine! Nessuna azione richiesta</span>
              </CardContent>
            </Card>
          ) : (<>

            {provvisorie.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                  <AlertCircle size={12} /> Partite da confermare ({provvisorie.length})
                </p>
                <div className="space-y-2">
                  {provvisorie.map(p => (
                    <Card key={p.id} className="border-l-4 border-l-yellow-400">
                      <CardContent className="px-4 py-3">
                        <p className="text-sm font-semibold text-foreground">
                          {p.squadra}{p.avversario ? ` vs ${p.avversario}` : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {format(parseISO(p.data), 'EEE d MMM', { locale: it })} · {formatTime(p.ora_inizio)}
                          </span>
                          {p.palestra && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} /> {p.palestra}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {conflictsAll.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Allenamenti da spostare ({conflictsAll.length})
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/calendario')}
                    className="text-destructive hover:text-destructive hover:bg-red-50 h-auto py-1 px-2">
                    Gestisci <ArrowRight size={12} />
                  </Button>
                </div>
                <div className="space-y-2">
                  {conflictsAll.map(({ partita, allenamenti }, i) => (
                    <Card key={i} className="border-l-4 border-l-destructive">
                      <CardContent className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-semibold text-foreground">
                            {partita.squadra}{partita.avversario ? ` vs ${partita.avversario}` : ''}
                          </p>
                          <Badge variant="destructive">Definitiva</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {format(parseISO(partita.data), 'EEE d MMM', { locale: it })} · {formatTime(partita.ora_inizio)}–{formatTime(partita.ora_fine)}
                          {partita.palestra ? ` · ${partita.palestra}` : ''}
                        </p>
                        <div className="space-y-1.5">
                          {allenamenti.map((t, j) => (
                            <div key={j} className="flex items-center gap-2 text-xs bg-red-50 rounded-lg px-2 py-1.5">
                              <AlertTriangle size={10} className="shrink-0 text-destructive" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-foreground">{t.squadra}</span>
                                <span className="text-muted-foreground ml-2">{formatTime(t.ora_inizio)}–{formatTime(t.ora_fine)}</span>
                                {t.palestra && <span className="text-muted-foreground ml-1 truncate">· {t.palestra}</span>}
                              </div>
                              <Button variant="ghost" size="sm"
                                className="h-auto py-0.5 px-2 text-xs text-primary hover:bg-amber-50 shrink-0"
                                onClick={() => setEditingConflictTraining(t)}>
                                Modifica
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {doppioConflictsAdmin.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 px-1">
                  <AlertTriangle size={12} /> Doppio campionato — stesso giorno ({doppioConflictsAdmin.length})
                </p>
                <div className="space-y-2">
                  {doppioConflictsAdmin.map(({ data: dateStr, pair, partita_a, partita_b }, i) => (
                    <Card key={i} className="border-l-4 border-l-orange-400">
                      <CardContent className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-muted-foreground capitalize">
                            {format(parseISO(dateStr), 'EEE d MMMM', { locale: it })}
                          </p>
                          {pair.note && <Badge variant="orange">{pair.note}</Badge>}
                        </div>
                        <div className="space-y-1">
                          {[partita_a, partita_b].map((p, j) => (
                            <div key={j} className="flex items-center gap-2 text-xs bg-orange-50 rounded-lg px-2 py-1.5">
                              <span className="font-medium text-foreground">{p.squadra}</span>
                              {p.avversario && <span className="text-muted-foreground">vs {p.avversario}</span>}
                              {p.ora_inizio && <span className="text-muted-foreground ml-auto">{formatTime(p.ora_inizio)}</span>}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

          </>)}
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
