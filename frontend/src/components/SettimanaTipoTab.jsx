import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Plus, CheckCircle, XCircle, AlertTriangle, LayoutGrid, List, Clock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { PALETTE, GIORNI, GIORNO_FULL as GIORNI_LABEL } from '../lib/constants'
import { formatTime } from '../lib/utils'
import { Modal, Field, inp } from '../components/ui'
import { GrigliaTipo } from './GrigliaSettimanale'

function getColor(squadra, allSquadre) {
  const idx = allSquadre.indexOf(squadra)
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length]
}

function timesOverlap(as, ae, bs, be) {
  const n = t => String(t).slice(0, 5)
  return n(as) < n(be) && n(ae) > n(bs)
}

function checkConflicts(form, others) {
  const errors = [], warnings = [], palestraConflicts = []
  if (!form.ora_inizio || !form.ora_fine) return { errors, warnings, palestraConflicts }
  for (const e of others) {
    if (!e.ora_inizio || !e.ora_fine || e.annullato) continue
    if (!timesOverlap(form.ora_inizio, form.ora_fine, e.ora_inizio, e.ora_fine)) continue
    if (form.palestra?.trim() && e.palestra?.trim() &&
        form.palestra.trim().toLowerCase() === e.palestra.trim().toLowerCase()) {
      errors.push(`${e.squadra} usa ${e.palestra} (${e.ora_inizio.slice(0,5)}–${e.ora_fine.slice(0,5)})`)
      palestraConflicts.push(e)
    }
    if (form.allenatori?.trim() && e.allenatori?.trim()) {
      const fa = form.allenatori.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
      const ea = e.allenatori.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
      const shared = fa.filter(a => ea.includes(a))
      if (shared.length > 0) warnings.push(`${shared.join(', ')} già impegnato con ${e.squadra}`)
    }
  }
  return { errors, warnings, palestraConflicts }
}

function palestraDisponibile(palestre, nome, giorno, oraInizio, oraFine) {
  if (!nome || !giorno || !oraInizio || !oraFine) return null
  const pal = palestre.find(p => p.nome === nome)
  if (!pal?.orari) return null
  const slot = pal.orari[giorno]
  if (!slot) return null
  const n = t => String(t).slice(0, 5)
  if (!slot.attivo) return `${nome} è chiusa il ${GIORNI_LABEL[giorno]}`
  const [pi, pf, ai, af] = [slot.ora_inizio, slot.ora_fine, oraInizio, oraFine].map(n)
  if (ai < pi || af > pf) return `${nome} disponibile ${pi}–${pf}`
  return null
}

function ConflictIndicator({ errors, warnings }) {
  if (!errors.length && !warnings.length) {
    return (
      <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
        <CheckCircle size={13} /> ✅ Slot libero
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {errors.map((m, i) => (
        <div key={i} className="flex items-start gap-1.5 text-red-600 text-xs">
          <XCircle size={13} className="mt-0.5 shrink-0" /> ❌ {m}
        </div>
      ))}
      {warnings.map((m, i) => (
        <div key={i} className="flex items-start gap-1.5 text-amber-600 text-xs">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> ⚠️ {m}
        </div>
      ))}
    </div>
  )
}

const EMPTY_FISSO = { giorno: 'lunedi', squadra: '', ora_inizio: '18:00', ora_fine: '20:00', palestra: '', allenatori: [] }

export default function SettimanaTipoTab({ isAdmin, isAllenatore, squadreAllenatore = null, squadraFilter, allenatoreFilter = '', palestraFilter = '' }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const canEdit = isAdmin || isAllenatore
  const canEditRow = (r) => isAdmin || (isAllenatore && squadreAllenatore && squadreAllenatore.includes(r.squadra))
  const [showForm,   setShowForm]   = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [gridView,   setGridView]   = useState(false)
  const [form, setForm]             = useState(EMPTY_FISSO)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: fisso = [], isLoading, error } = useQuery({
    queryKey: ['orario-fisso-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orario_fisso').select('*').order('giorno').order('ora_inizio')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: squadreAll = [] } = useQuery({
    queryKey: ['squadre-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 5 * 60 * 1000,
  })
  const squadreDisp = useMemo(
    () => squadreAllenatore ? squadreAll.filter(s => squadreAllenatore.includes(s)) : squadreAll,
    [squadreAll, squadreAllenatore]
  )

  const { data: palestreAll = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome, orari').order('nome')
      return data ?? []
    },
    staleTime: 10 * 60 * 1000,
  })
  const palestreDisp = useMemo(() => palestreAll.map(p => p.nome), [palestreAll])

  const { data: allenatoriAll = [] } = useQuery({
    queryKey: ['allenatori-con-squadre'],
    queryFn: async () => {
      const { data } = await supabase
        .from('allenatori').select('nome, cognome, squadre, squadre_capo, squadre_vice')
        .order('cognome').order('nome')
      return (data ?? []).map(a => ({
        nome: [a.nome, a.cognome].filter(Boolean).join(' '),
        squadre: a.squadre ?? '',
        squadre_capo: a.squadre_capo ?? '',
        squadre_vice: a.squadre_vice ?? '',
      })).filter(a => a.nome)
    },
    staleTime: 5 * 60 * 1000,
  })

  const allenatoriNomi = useMemo(() => allenatoriAll.map(a => a.nome), [allenatoriAll])

  function allenatoriPerSquadra(sq) {
    if (!sq) return []
    const check = (str) => (str ?? '').split(',').map(s => s.trim()).filter(Boolean).includes(sq)
    return allenatoriAll.filter(a => check(a.squadre) || check(a.squadre_capo) || check(a.squadre_vice)).map(a => a.nome)
  }

  function handleSquadraChange(sq) {
    const assoc = allenatoriPerSquadra(sq)
    setForm(f => ({ ...f, squadra: sq, allenatori: assoc }))
  }

  const toggleAllenatore = (a) =>
    set('allenatori', form.allenatori.includes(a) ? form.allenatori.filter(x => x !== a) : [...form.allenatori, a])

  const [condivisione, setCondivisione] = useState(false)

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const p = { giorno: f.giorno, squadra: f.squadra, ora_inizio: f.ora_inizio, ora_fine: f.ora_fine, palestra: f.palestra, allenatori: f.allenatori.join(', '), condivisione: f._condivisione ? 'SI' : 'NO' }
      if (f.id) {
        const { error } = await supabase.from('orario_fisso').update(p).eq('id', f.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('orario_fisso').insert([{ ...p, societa_id: societaId }])
        if (error) throw error
      }
      if (f._condivisione && f._palestraConflicts?.length) {
        for (const e of f._palestraConflicts) {
          if (e.id) {
            const { error } = await supabase.from('orario_fisso').update({ condivisione: 'SI' }).eq('id', e.id)
            if (error) throw error
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orario-fisso-full'] })
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      qc.invalidateQueries({ queryKey: ['squadre'] })
      closeForm()
    },
  })

  const delMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('orario_fisso').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orario-fisso-full'] })
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      qc.invalidateQueries({ queryKey: ['squadre'] })
    },
  })

  function openAdd()   { setEditingRow(null); setForm(EMPTY_FISSO); setShowForm(true) }
  function openEdit(r) {
    setEditingRow(r)
    setForm({ ...r, allenatori: r.allenatori ? r.allenatori.split(',').map(a => a.trim()).filter(Boolean) : [] })
    setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditingRow(null) }

  const squadre  = useMemo(() => [...new Set(fisso.map(r => r.squadra).filter(Boolean))].sort(), [fisso])
  const byGiorno = useMemo(() => {
    const map = {}
    for (const r of fisso) {
      if (!map[r.giorno]) map[r.giorno] = []
      map[r.giorno].push(r)
    }
    return map
  }, [fisso])

  const { errors: fErrors, warnings: fWarnings, palestraConflicts: fPalestraConflicts } = useMemo(() => {
    const others = fisso.filter(r => r.giorno === form.giorno && (editingRow ? r.id !== editingRow.id : true))
    return checkConflicts({ ...form, allenatori: form.allenatori.join(', ') }, others)
  }, [form, fisso, editingRow])
  const fPalestraWarn = useMemo(() => palestraDisponibile(palestreAll, form.palestra, form.giorno, form.ora_inizio, form.ora_fine), [palestreAll, form.palestra, form.giorno, form.ora_inizio, form.ora_fine])
  const fActiveCondivisione = condivisione && fPalestraConflicts.length > 0
  const canSaveFisso = (!fErrors.length || fActiveCondivisione) && !fPalestraWarn && !!form.squadra.trim() && !!form.palestra.trim() && !!form.ora_inizio && !!form.ora_fine

  if (isLoading) return <div className="py-6 text-center text-sm text-gray-400">Caricamento...</div>
  if (error)     return <div className="py-6 text-center text-sm text-red-500">{error.message}</div>

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Modificare la settimana tipo aggiorna il <strong>template per tutte le settimane future</strong>.
          Le eccezioni già salvate non vengono modificate.
        </p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{fisso.length} slot configurati</p>
        {fisso.length > 0 && (
          <button
            onClick={() => setGridView(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              gridView ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {gridView ? <List size={15} /> : <LayoutGrid size={15} />}
            {gridView ? 'Lista' : 'Griglia'}
          </button>
        )}
      </div>

      {gridView ? (
        <GrigliaTipo squadraFilter={squadraFilter} allenatoreFilter={allenatoreFilter} palestraFilter={palestraFilter} />
      ) : !fisso.length ? (
        <div className="text-center py-16 text-gray-400">
          <span className="text-5xl block mb-3">📋</span>
          <p className="text-sm">Nessun allenamento fisso configurato</p>
          {canEdit && <p className="text-xs mt-1">Premi ➕ per aggiungere</p>}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex pb-3" style={{ minWidth: 'max-content' }}>
            {GIORNI.map((giorno, gi) => {
              const righe = (byGiorno[giorno] ?? [])
                .filter(r => !squadraFilter || r.squadra === squadraFilter)
                .filter(r => !allenatoreFilter || (r.allenatori ?? '').split(',').some(a => a.trim().toLowerCase().includes(allenatoreFilter.toLowerCase())))
                .filter(r => !palestraFilter || r.palestra === palestraFilter)
              const isLast = gi === GIORNI.length - 1
              return (
                <div key={giorno} className={`w-36 flex-shrink-0 ${!isLast ? 'border-r border-gray-200 mr-2 pr-1' : ''}`}>
                  <div className="rounded-xl p-2 mb-2 text-center bg-white border border-gray-200">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      {GIORNI_LABEL[giorno].slice(0, 3)}
                    </div>
                  </div>
                  {righe.length === 0 ? (
                    <div className="text-gray-300 text-center py-4 text-xs select-none">–</div>
                  ) : (
                    righe.map(r => {
                      const col = getColor(r.squadra, squadre)
                      return (
                        <div key={r.id} className={`rounded-lg bg-white border border-l-4 border-gray-100 ${col.border} p-2 mb-1.5 shadow-sm`}>
                          <div className={`text-xs font-semibold truncate mb-0.5 ${col.title}`}>{r.squadra}</div>
                          {String(r.condivisione).toUpperCase() === 'SI' && (
                            <span className="block text-xs text-violet-600">Campo cond.</span>
                          )}
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock size={10} className="text-gray-400 shrink-0" />
                            <span className="text-xs text-gray-600 font-medium">{formatTime(r.ora_inizio)}</span>
                          </div>
                          {r.palestra && <div className="text-xs text-gray-400 truncate">{r.palestra}</div>}
                          {canEditRow(r) && (
                            <div className="flex gap-1 mt-1.5">
                              <button
                                onClick={() => openEdit(r)}
                                className="flex-1 py-1 bg-amber-50 text-amber-600 rounded text-xs font-medium"
                              >
                                Modifica
                              </button>
                              <button
                                onClick={() => window.confirm(`Eliminare ${r.squadra}?`) && delMut.mutate(r.id)}
                                className="p-1 text-red-400 hover:bg-red-50 rounded"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {canEdit && (
        <button
          onClick={openAdd}
          className="fixed bottom-24 right-4 w-14 h-14 bg-amber-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-amber-700 active:scale-95 transition-all z-20"
          aria-label="Aggiungi allenamento fisso"
        >
          <Plus size={28} />
        </button>
      )}

      {showForm && (
        <Modal title={editingRow ? 'Modifica allenamento fisso' : 'Nuovo allenamento fisso'} onClose={closeForm}>
          <form onSubmit={e => { e.preventDefault(); if (canSaveFisso) saveMut.mutateAsync({ ...form, _condivisione: fActiveCondivisione, _palestraConflicts: fPalestraConflicts }) }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giorno *">
                <select value={form.giorno} onChange={e => set('giorno', e.target.value)} className={inp}>
                  {GIORNI.map(g => <option key={g} value={g}>{GIORNI_LABEL[g]}</option>)}
                </select>
              </Field>
              <Field label="Squadra *">
                {squadreDisp.length === 0 ? (
                  <input value={form.squadra} onChange={e => set('squadra', e.target.value)} className={inp} placeholder="es. U13" />
                ) : (
                  <select value={form.squadra} onChange={e => handleSquadraChange(e.target.value)} className={inp}>
                    <option value="">Scegli...</option>
                    {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ora inizio *">
                <input type="time" value={form.ora_inizio} onChange={e => set('ora_inizio', e.target.value)} className={inp} />
              </Field>
              <Field label="Ora fine *">
                <input type="time" value={form.ora_fine} onChange={e => set('ora_fine', e.target.value)} className={inp} />
              </Field>
            </div>
            <Field label="Palestra *">
              {palestreDisp.length === 0 ? (
                <input value={form.palestra} onChange={e => set('palestra', e.target.value)} className={inp} placeholder="es. PalaOderzo" />
              ) : (
                <select value={form.palestra} onChange={e => set('palestra', e.target.value)} className={inp}>
                  <option value="">Scegli...</option>
                  {palestreDisp.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
            </Field>
            <Field label="Allenatori">
              {allenatoriNomi.length === 0 ? (
                <input value={form.allenatori.join(', ')} onChange={e => set('allenatori', e.target.value.split(',').map(a => a.trim()).filter(Boolean))} className={inp} placeholder="es. Marco Rossi" />
              ) : (
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {allenatoriNomi.map(a => (
                    <button key={a} type="button" onClick={() => toggleAllenatore(a)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        form.allenatori.includes(a) ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200'
                      }`}>
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
              <p className="text-xs text-gray-400 mb-1.5 font-medium">Disponibilità — {GIORNI_LABEL[form.giorno]}</p>
              <ConflictIndicator errors={fActiveCondivisione ? [] : fErrors} warnings={fWarnings} />
              {fActiveCondivisione && fErrors.length > 0 && (
                <div className="flex items-center gap-1.5 text-violet-600 text-xs">
                  <CheckCircle size={13} className="shrink-0" /> Condivisione campo attiva
                </div>
              )}
              {fPalestraWarn && (
                <div className="flex items-start gap-1.5 text-red-600 text-xs">
                  <XCircle size={13} className="mt-0.5 shrink-0" /> {fPalestraWarn}
                </div>
              )}
              {fPalestraConflicts.length > 0 && (
                <button type="button" onClick={() => setCondivisione(c => !c)}
                  className={`w-full mt-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    condivisione
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-50'
                  }`}>
                  {condivisione ? '✓ Condividono il campo' : 'Condividono il campo'}
                </button>
              )}
            </div>
            {saveMut.isError && <p className="text-xs text-red-500 text-center">{saveMut.error?.message}</p>}
            <button type="submit" disabled={saveMut.isPending || !canSaveFisso}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {saveMut.isPending ? 'Salvataggio...' : (editingRow ? 'Salva modifiche' : 'Aggiungi allenamento fisso')}
            </button>
            {fErrors.length > 0 && !fActiveCondivisione && (
              <p className="text-center text-xs text-red-500">Risolvi i conflitti o attiva condivisione campo</p>
            )}
            {!fErrors.length && (!form.squadra.trim() || !form.palestra.trim()) && (
              <p className="text-center text-xs text-red-500">Compila tutti i campi obbligatori (*)</p>
            )}
          </form>
        </Modal>
      )}
    </div>
  )
}
