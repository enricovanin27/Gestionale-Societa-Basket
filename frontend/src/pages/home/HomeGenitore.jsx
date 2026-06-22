import { useState, useMemo } from 'react'
import { format, addDays, startOfWeek, differenceInDays, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Upload, FileText, CheckCircle2, Users } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/ui/ToastProvider'
import { useWeekEvents } from '../../hooks/useWeekEvents'
import LoadingSpinner from '../../components/LoadingSpinner'
import AppHeader from '../../components/AppHeader'
import { PALETTE } from '../../lib/constants'

function certStatusGenitore(scadenza) {
  if (!scadenza) return { label: 'Data non inserita', cls: 'text-gray-400', urgent: false }
  const diff = differenceInDays(parseISO(scadenza), new Date())
  if (diff < 0)  return { label: `Scaduta ${Math.abs(diff)}gg fa`, cls: 'text-red-600', urgent: true }
  if (diff < 30) return { label: `Scade tra ${diff} giorni`, cls: 'text-orange-600', urgent: true }
  return { label: `Valida fino al ${format(parseISO(scadenza), 'd/MM/yyyy')}`, cls: 'text-green-600', urgent: false }
}

export default function HomeGenitore() {
  const { user, profile, societaId, displayName, logout, societaNome } = useAuth()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [selectedSquadra, setSelectedSquadra] = useState('')
  const [uploadingId, setUploadingId] = useState(null)
  const [uploadDone,  setUploadDone]  = useState({})

  const today      = new Date()
  const todayStr   = format(today, 'yyyy-MM-dd')

  // Ricava le squadre dai figli collegati via genitore_user_id
  const { data: figli = [], isLoading: loadingFigli } = useQuery({
    queryKey: ['figli-genitore-squadre', societaId, user?.id],
    enabled: !!societaId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, cert_medico_scadenza, cert_medico_url')
        .eq('societa_id', societaId)
        .eq('genitore_user_id', user.id)
        .eq('attivo', true)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const mySquadre = useMemo(() => {
    if (figli.length > 0) {
      const set = new Set()
      for (const f of figli) {
        if (f.squadra)  set.add(f.squadra)
        if (f.squadra2) set.add(f.squadra2)
        if (f.squadra3) set.add(f.squadra3)
      }
      return [...set]
    }
    // Fallback: squadre dal profilo (compatibilità genitori senza figlio collegato)
    const genSquadre = [profile?.genitore_squadra, profile?.genitore_squadra2, profile?.genitore_squadra3].filter(Boolean)
    return genSquadre.length > 0 ? genSquadre : [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)
  }, [figli, profile])
  const colorMap = useMemo(
    () => Object.fromEntries(mySquadre.map((s, i) => [s.toLowerCase(), PALETTE[i % PALETTE.length]])),
    [mySquadre]
  )

  const thisWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [])
  const thisWeekStr   = format(thisWeekStart, 'yyyy-MM-dd')
  const weekEndStr    = format(addDays(thisWeekStart, 6), 'yyyy-MM-dd')

  const squadreFiltro = useMemo(
    () => selectedSquadra ? [selectedSquadra] : mySquadre,
    [selectedSquadra, mySquadre]
  )

  const { data: weekData, isLoading, isError } = useWeekEvents(thisWeekStart)

  const { data: annullati = [] } = useQuery({
    queryKey: ['annullati-parent', societaId, thisWeekStr, weekEndStr, squadreFiltro.join(',')],
    enabled: !!societaId && mySquadre.length > 0,
    queryFn: async () => {
      if (!squadreFiltro.length) return []
      const { data } = await supabase
        .from('orario_settimana')
        .select('id, squadra, data, ora_inizio, ora_fine')
        .eq('societa_id', societaId)
        .eq('annullato', true)
        .gte('data', thisWeekStr)
        .lte('data', weekEndStr)
        .in('squadra', squadreFiltro)
      return data ?? []
    },
    staleTime: 60 * 1000,
  })

  const { data: quoteAperte = [] } = useQuery({
    queryKey: ['genitore-quote-aperte', societaId, user?.id],
    enabled: !!societaId && !!user?.id,
    queryFn: async () => {
      const { data: gio } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .eq('societa_id', societaId)
        .eq('genitore_user_id', user.id)
        .eq('attivo', true)
      if (!gio?.length) return []
      const { data: q } = await supabase
        .from('quote')
        .select('id, giocatore_id, tipo, descrizione, importo, data_scadenza')
        .in('giocatore_id', gio.map(g => g.id))
        .eq('societa_id', societaId)
        .eq('pagato', false)
        .order('data_scadenza', { nullsFirst: false })
      const gioMap = Object.fromEntries((gio ?? []).map(g => [g.id, g]))
      return (q ?? []).map(q => ({ ...q, giocatore: gioMap[q.giocatore_id] }))
    },
    staleTime: 5 * 60 * 1000,
  })

  const variazioni = useMemo(() => {
    const allEvents = (weekData?.events ?? [])
      .filter(e => squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase()))
    return {
      spostati:      allEvents.filter(e => e._source === 'override'),
      aggiunti:      allEvents.filter(e => e._source === 'extra'),
      annullatiList: annullati,
    }
  }, [weekData, annullati, selectedSquadra, mySquadre.join(',')])

  const hasVariazioni = variazioni.spostati.length > 0 || variazioni.aggiunti.length > 0 || variazioni.annullatiList.length > 0

  const todayEvents = useMemo(() =>
    (weekData?.eventsByDate?.[todayStr] ?? [])
      .filter(e => !e.annullato && squadreFiltro.some(s => s.toLowerCase() === (e.squadra ?? '').toLowerCase())),
    [weekData, todayStr, squadreFiltro]
  )

  async function handleCertUpload(giocatoreId, file) {
    setUploadingId(giocatoreId)
    try {
      const ext  = file.name.split('.').pop() || 'pdf'
      const path = `${societaId}/${giocatoreId}/cert_medico.${ext}`
      const { error: upErr } = await supabase.storage
        .from('certificati')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('certificati').getPublicUrl(path)
      // Aggiorna l'URL tramite funzione SECURITY DEFINER (RLS-safe)
      const { error: dbErr } = await supabase.rpc('update_cert_url_genitore', {
        p_giocatore_id: giocatoreId,
        p_url: publicUrl,
      })
      if (dbErr) throw dbErr
      qc.invalidateQueries({ queryKey: ['figli-genitore-squadre', societaId, user?.id] })
      setUploadDone(d => ({ ...d, [giocatoreId]: true }))
      setTimeout(() => setUploadDone(d => ({ ...d, [giocatoreId]: false })), 4000)
    } catch (err) {
      toast.error('Errore caricamento: ' + err.message)
    } finally {
      setUploadingId(null)
    }
  }

  if (loadingFigli) {
    return (
      <div>
        <AppHeader title="Ciao!" subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="pt-8"><LoadingSpinner /></div>
      </div>
    )
  }

  if (!mySquadre.length) {
    const noFigli = figli.length === 0
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <AppHeader title="Ciao!" subtitle={format(today, 'EEEE d MMMM yyyy', { locale: it })}
          displayName={displayName} logout={logout} societaNome={societaNome} />
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-16 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <Users size={28} className="text-amber-500" />
          </div>
          <h2 className="text-base font-semibold text-gray-800 mb-2">
            {noFigli ? 'Account non ancora collegato' : 'Nessuna squadra assegnata'}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
            {noFigli
              ? 'Il tuo account non è ancora collegato a nessun giocatore. Contatta la segreteria per completare la configurazione.'
              : 'Il tuo figlio è registrato, ma non è ancora stato assegnato a una squadra.'
            }
          </p>
          {societaNome && (
            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 w-full max-w-sm text-left">
              <p className="text-xs font-semibold text-amber-700 mb-1">Come risolvere</p>
              <p className="text-xs text-amber-600 leading-relaxed">
                Contatta la segreteria di <strong>{societaNome}</strong> e chiedi di
                {noFigli
                  ? ' associare il tuo account al giocatore corretto.'
                  : ' assegnare tuo figlio a una squadra.'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <AppHeader
        title={`Ciao, ${displayName}! 👋`}
        subtitle={mySquadre.join(' · ')}
        displayName={displayName} logout={logout} societaNome={societaNome}
      >
        {mySquadre.length > 1 && (
          <div className="mt-3">
            <select
              value={selectedSquadra}
              onChange={e => setSelectedSquadra(e.target.value)}
              className="w-full bg-amber-700 text-white border border-amber-400 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Tutte le squadre</option>
              {mySquadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </AppHeader>

      {isLoading ? (
        <div className="pt-6"><LoadingSpinner /></div>
      ) : isError ? (
        <div className="mx-4 mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-sm font-medium text-red-700">Errore nel caricamento</p>
          <p className="text-xs text-red-400 mt-1">Controlla la connessione e riprova</p>
        </div>
      ) : (
        <div className="pt-3 space-y-4 pb-24">
          {hasVariazioni && (
            <div className="mx-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-2">📌 Variazioni settimana</p>
              {variazioni.annullatiList.map(v => (
                <div key={v.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-red-600">Annullato</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.spostati.map(v => (
                <div key={`s-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-yellow-700">Spostato</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
              {variazioni.aggiunti.map(v => (
                <div key={`a-${v.id}`} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold text-green-700">Aggiunto</span>
                    {' · '}{v.squadra}{' · '}{format(new Date(v.data + 'T00:00:00'), 'd MMM', { locale: it })}
                    {v.ora_inizio ? ` ${v.ora_inizio.slice(0, 5)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {quoteAperte.length > 0 && (
            <div className="mx-4 bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-[11px] font-bold text-red-800 uppercase tracking-wide mb-2">💰 Quote non pagate ({quoteAperte.length})</p>
              {quoteAperte.slice(0, 3).map(q => (
                <div key={q.id} className="flex items-center justify-between py-1 border-b border-red-100 last:border-0">
                  <div>
                    <p className="text-xs font-medium text-gray-800">
                      {q.giocatore ? `${q.giocatore.cognome} ${q.giocatore.nome}` : '—'}
                    </p>
                    <p className="text-xs text-gray-500">{q.descrizione ?? q.tipo}</p>
                  </div>
                  <span className="text-xs font-bold text-red-600 ml-3">€{q.importo}</span>
                </div>
              ))}
              {quoteAperte.length > 3 && (
                <p className="text-xs text-gray-400 mt-1.5">+{quoteAperte.length - 3} altre quote...</p>
              )}
            </div>
          )}

          {/* ── Certificati medici figli ───────────────────────────────────────── */}
          {figli.length > 0 && (
            <div className="mx-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide px-4 pt-3 pb-2">
                🏥 Certificati medici
              </p>
              {figli.map(g => {
                const cert    = certStatusGenitore(g.cert_medico_scadenza)
                const isUploading = uploadingId === g.id
                const isDone      = uploadDone[g.id]
                return (
                  <div key={g.id}
                    className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 first:border-t-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{g.cognome} {g.nome}</p>
                      <p className={`text-xs mt-0.5 ${cert.cls}`}>{cert.label}</p>
                      {g.cert_medico_url && (
                        <a href={g.cert_medico_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:underline mt-1">
                          <FileText size={10} /> Visualizza certificato
                        </a>
                      )}
                    </div>
                    <div className="shrink-0">
                      {isDone ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 size={14} /> Inviato!
                        </span>
                      ) : (
                        <label className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          cert.urgent
                            ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        } ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                          <Upload size={12} />
                          {isUploading ? 'Invio...' : 'Carica PDF'}
                          <input type="file" accept="application/pdf,image/*" className="hidden"
                            disabled={isUploading}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (file) handleCertUpload(g.id, file)
                              e.target.value = ''
                            }} />
                        </label>
                      )}
                    </div>
                  </div>
                )
              })}
              <p className="text-[10px] text-gray-400 px-4 py-2.5 border-t border-gray-100">
                Il certificato verrà consegnato direttamente alla segreteria
              </p>
            </div>
          )}

          <section className="px-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                {format(today, 'EEEE d MMMM', { locale: it })}
              </span>
              <span className="text-[9px] bg-amber-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">oggi</span>
            </div>
            {todayEvents.length === 0 ? (
              <p className="text-sm text-gray-300 py-1">Nessun evento oggi</p>
            ) : (
              <div className="space-y-2">
                {todayEvents.map(e => (
                  <EventCardParent key={`${e._source}-${e.id}`} event={e} colorMap={colorMap} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function EventCardParent({ event, colorMap }) {
  const isPartita = event._tipo === 'partita'
  const isCasa    = (event.casa_fuori ?? '').toLowerCase() === 'casa'
  const pal       = colorMap[(event.squadra ?? '').toLowerCase()] ?? PALETTE[0]

  const borderCls = isPartita ? pal.gameBorder : pal.border
  const bgCls     = isPartita ? pal.gameBg     : pal.bg
  const labelCls  = isPartita
    ? event.stato === 'provvisoria' ? 'bg-yellow-100 text-yellow-700'
      : isCasa ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
    : `${pal.bg} ${pal.title}`
  const label = isPartita
    ? event.stato === 'provvisoria' ? '⚠️ Provvisoria'
      : isCasa ? '🏠 Casa' : '✈️ Trasferta'
    : 'Allenamento'

  return (
    <div className={`rounded-xl border-l-4 ${borderCls} ${bgCls} px-4 py-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${pal.title}`}>
            {isPartita && event.avversario ? `vs ${event.avversario}` : event.squadra}
          </p>
          <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-500">
            {event.ora_inizio && <span className="font-medium text-gray-700">{event.ora_inizio.slice(0,5)}–{event.ora_fine?.slice(0,5)}</span>}
            {event.palestra && <span>{event.palestra}</span>}
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${labelCls}`}>
          {label}
        </span>
      </div>
    </div>
  )
}
