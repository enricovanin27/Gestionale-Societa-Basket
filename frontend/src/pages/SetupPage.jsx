import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, X, Edit2, Trash2, Users, Building2, Settings,
  Calendar, Shield, Zap, Check, AlertCircle, Clock, MapPin, UserCheck, Globe, UserPlus,
  Activity, CreditCard, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Constants ────────────────────────────────────────────────────────────────

const GIORNI       = ['lunedi','martedi','mercoledi','giovedi','venerdi','sabato','domenica']
const GIORNI_LABEL = { lunedi:'Lun', martedi:'Mar', mercoledi:'Mer', giovedi:'Gio', venerdi:'Ven', sabato:'Sab', domenica:'Dom' }
const GIORNO_FULL  = { lunedi:'Lunedì', martedi:'Martedì', mercoledi:'Mercoledì', giovedi:'Giovedì', venerdi:'Venerdì', sabato:'Sabato', domenica:'Domenica' }
const TIPO_PALESTRA = ['Principale', 'Secondaria', 'Esterna']
const RUOLI        = ['admin', 'allenatore', 'genitore', 'giocatore']
const RUOLI_LABEL  = { super_admin: 'Super Admin', admin: 'Admin', allenatore: 'Allenatore', genitore: 'Genitore', giocatore: 'Giocatore' }

// ─── Shared UI ────────────────────────────────────────────────────────────────

function TabBtn({ label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors border-b-2 ${
        active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg p-5 pb-10 max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function ErrorBox({ error }) {
  return (
    <div className="p-6 text-center">
      <AlertCircle size={32} className="text-red-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600">Errore nel caricamento</p>
      <p className="text-xs text-gray-400 mt-1">{error?.message}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — PALESTRE
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_ORARIO_G = { attivo: false, ora_inizio: '15:00', ora_fine: '22:00' }

function emptyOrari() {
  return Object.fromEntries(GIORNI.map(g => [g, { ...DEFAULT_ORARIO_G }]))
}
function parseOrari(raw) {
  const base = emptyOrari()
  if (!raw || typeof raw !== 'object') return base
  GIORNI.forEach(g => { if (raw[g]) base[g] = { ...DEFAULT_ORARIO_G, ...raw[g] } })
  return base
}

const EMPTY_PAL = { nome: '', tipo: 'Principale', orari: emptyOrari() }

function PalestreTab() {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY_PAL)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setOrario = (g, k, v) => setForm(f => ({ ...f, orari: { ...f.orari, [g]: { ...f.orari[g], [k]: v } } }))

  const { data: palestre = [], isLoading, error } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data, error } = await supabase.from('palestre').select('*').order('nome')
      if (error) throw error
      return data
    },
  })

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const payload = { nome: f.nome, tipo: f.tipo, orari: f.orari }
      if (f.id) {
        const { error } = await supabase.from('palestre').update(payload).eq('id', f.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('palestre').insert([{ ...payload, societa_id: societaId }])
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['palestre'] }); close() },
  })

  const delMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('palestre').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['palestre'] }),
  })

  function openAdd()   { setForm(EMPTY_PAL); setShowForm(true) }
  function openEdit(p) { setForm({ ...p, orari: parseOrari(p.orari) }); setShowForm(true) }
  function close()     { setShowForm(false); setForm(EMPTY_PAL) }

  if (isLoading) return <LoadingSpinner message="Caricamento palestre..." />
  if (error)     return <ErrorBox error={error} />

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{palestre.length} palestre configurate</p>
        <button onClick={openAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={15} /> Aggiungi
        </button>
      </div>

      {palestre.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessuna palestra configurata</p>
        </div>
      ) : (
        <div className="space-y-2">
          {palestre.map(p => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{p.nome}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.tipo === 'Principale' ? 'bg-blue-100 text-blue-700' :
                      p.tipo === 'Secondaria' ? 'bg-purple-100 text-purple-700' :
                                                'bg-gray-100 text-gray-600'
                    }`}>{p.tipo}</span>
                  </div>
                  {GIORNI.filter(g => p.orari?.[g]?.attivo).length === 0 ? (
                    <p className="text-xs text-gray-400 mt-1">Nessun giorno configurato</p>
                  ) : (
                    <div className="mt-1.5 space-y-0.5">
                      {GIORNI.filter(g => p.orari?.[g]?.attivo).map(g => (
                        <div key={g} className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="w-7 font-medium text-gray-500">{GIORNI_LABEL[g]}</span>
                          <Clock size={10} className="text-gray-400" />
                          <span>{p.orari[g].ora_inizio} – {p.orari[g].ora_fine}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => window.confirm(`Eliminare "${p.nome}"?`) && delMut.mutate(p.id)}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={form.id ? 'Modifica palestra' : 'Nuova palestra'} onClose={close}>
          <form onSubmit={e => { e.preventDefault(); saveMut.mutateAsync(form) }} className="space-y-4">
            <Field label="Nome *">
              <input value={form.nome} onChange={e => set('nome', e.target.value)}
                className={inp} placeholder="es. PalaOderzo" required />
            </Field>

            <Field label="Orari per giorno">
              <div className="mt-1 space-y-2">
                {GIORNI.map(g => {
                  const o = form.orari[g]
                  return (
                    <div key={g} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border transition-colors ${o.attivo ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
                      <button
                        type="button"
                        onClick={() => setOrario(g, 'attivo', !o.attivo)}
                        className={`w-14 shrink-0 text-xs font-medium py-0.5 rounded-md border transition-colors ${o.attivo ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-400 border-gray-200'}`}
                      >
                        {GIORNI_LABEL[g]}
                      </button>
                      {o.attivo ? (
                        <>
                          <input type="time" value={o.ora_inizio}
                            onChange={e => setOrario(g, 'ora_inizio', e.target.value)}
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          <span className="text-xs text-gray-400">–</span>
                          <input type="time" value={o.ora_fine}
                            onChange={e => setOrario(g, 'ora_fine', e.target.value)}
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        </>
                      ) : (
                        <span className="text-xs text-gray-300 italic">Chiuso</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </Field>

            <Field label="Tipo">
              <div className="flex gap-2 mt-1">
                {TIPO_PALESTRA.map(t => (
                  <button key={t} type="button" onClick={() => set('tipo', t)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      form.tipo === t
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            {saveMut.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                <p className="text-xs text-red-600">{saveMut.error?.message}</p>
              </div>
            )}

            <button type="submit" disabled={saveMut.isPending}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {saveMut.isPending ? 'Salvataggio...' : (form.id ? 'Salva modifiche' : 'Aggiungi palestra')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2b — ALLENATORI
// Fonte di verità per squadre_capo / squadre_vice.
// Mostra badge "Ha account" se l'email esiste in profiles con ruolo allenatore.
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_ALL = { nome: '', cognome: '', email: '', squadre_capo: [], squadre_vice: [] }

function AllenatoriTab() {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [showForm,   setShowForm]   = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [form, setForm]             = useState(EMPTY_ALL)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: allenatori = [], isLoading, error } = useQuery({
    queryKey: ['allenatori-tab'],
    queryFn: async () => {
      const { data, error } = await supabase.from('allenatori').select('*').order('cognome').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: accountEmails = new Set() } = useQuery({
    queryKey: ['allenatori-account-emails'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('email').eq('ruolo', 'allenatore')
      return new Set((data ?? []).map(p => p.email?.toLowerCase()).filter(Boolean))
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: squadreDisp = [] } = useQuery({
    queryKey: ['squadre-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 5 * 60 * 1000,
  })

  function parseList(str) {
    return (str ?? '').split(',').map(s => s.trim()).filter(Boolean)
  }

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const payload = {
        nome: f.nome.trim(), cognome: f.cognome.trim(), email: f.email.trim(),
        squadre_capo: f.squadre_capo.join(', '),
        squadre_vice: f.squadre_vice.join(', '),
      }
      if (f.id) {
        const { error } = await supabase.from('allenatori').update(payload).eq('id', f.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('allenatori').insert([{ ...payload, societa_id: societaId }])
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allenatori-tab'] })
      qc.invalidateQueries({ queryKey: ['setup-utenti'] })
      closeForm()
    },
  })

  const delMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('allenatori').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allenatori-tab'] })
      qc.invalidateQueries({ queryKey: ['setup-utenti'] })
    },
  })

  function openAdd()   { setEditingRow(null); setForm(EMPTY_ALL); setShowForm(true) }
  function openEdit(r) {
    setEditingRow(r)
    setForm({ ...r, squadre_capo: parseList(r.squadre_capo), squadre_vice: parseList(r.squadre_vice) })
    setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditingRow(null); setForm(EMPTY_ALL) }

  const toggleCapo = sq => set('squadre_capo',
    form.squadre_capo.includes(sq) ? form.squadre_capo.filter(s => s !== sq) : [...form.squadre_capo, sq]
  )
  const toggleVice = sq => set('squadre_vice',
    form.squadre_vice.includes(sq) ? form.squadre_vice.filter(s => s !== sq) : [...form.squadre_vice, sq]
  )

  if (isLoading) return <LoadingSpinner message="Caricamento allenatori..." />
  if (error)     return <ErrorBox error={error} />

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{allenatori.length} allenatori</p>
        <button onClick={openAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={15} /> Aggiungi
        </button>
      </div>

      {allenatori.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <UserCheck size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessun allenatore</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allenatori.map(al => {
            const nomeCompleto = [al.nome, al.cognome].filter(Boolean).join(' ')
            const hasAccount   = accountEmails.has(al.email?.toLowerCase())
            const capoList     = parseList(al.squadre_capo)
            const viceList     = parseList(al.squadre_vice)
            return (
              <div key={al.id} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{nomeCompleto}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        hasAccount ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {hasAccount ? 'Ha account' : 'Senza account'}
                      </span>
                    </div>
                    {al.email && <div className="text-xs text-gray-400 mt-0.5">{al.email}</div>}
                    {capoList.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                        <span className="text-xs text-gray-400">Capo:</span>
                        {capoList.map(s => (
                          <span key={s} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{s}</span>
                        ))}
                      </div>
                    )}
                    {viceList.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 items-center">
                        <span className="text-xs text-gray-400">Vice:</span>
                        {viceList.map(s => (
                          <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(al)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => window.confirm(`Eliminare ${nomeCompleto}?`) && delMut.mutate(al.id)}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <Modal title={editingRow ? 'Modifica allenatore' : 'Nuovo allenatore'} onClose={closeForm}>
          <form onSubmit={e => { e.preventDefault(); saveMut.mutateAsync(form) }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome *">
                <input value={form.nome} onChange={e => set('nome', e.target.value)} className={inp} required />
              </Field>
              <Field label="Cognome *">
                <input value={form.cognome} onChange={e => set('cognome', e.target.value)} className={inp} required />
              </Field>
            </div>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className={inp} placeholder="mario@esempio.com" />
            </Field>
            {squadreDisp.length === 0 ? (
              <p className="text-xs text-gray-400">Nessuna squadra configurata (aggiungile dalla tab Squadre)</p>
            ) : (<>
              <Field label="Capo allenatore di">
                <SquadreSelector
                  squadre={squadreDisp}
                  selected={form.squadre_capo}
                  disabled={form.squadre_vice}
                  takenByOthers={new Set()}
                  onToggle={toggleCapo}
                  color="blue"
                />
              </Field>
              <Field label="Vice allenatore di">
                <SquadreSelector
                  squadre={squadreDisp}
                  selected={form.squadre_vice}
                  disabled={form.squadre_capo}
                  takenByOthers={new Set()}
                  onToggle={toggleVice}
                  color="gray"
                />
              </Field>
            </>)}
            {saveMut.isError && <p className="text-xs text-red-500">{saveMut.error?.message}</p>}
            <button type="submit" disabled={saveMut.isPending}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {saveMut.isPending ? 'Salvataggio...' : (editingRow ? 'Salva modifiche' : 'Aggiungi allenatore')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — SQUADRE & ALLENATORI
// ═══════════════════════════════════════════════════════════════════════════════

function SquadreAllenatoriTab() {
  const [selectedSquadra, setSelectedSquadra] = useState(null)
  const [showInfo, setShowInfo] = useState(null) // 'squadra' | 'allenatore'

  // Derive squadre + allenatori from orario_fisso
  const { data: fisso = [], isLoading: loadingFisso } = useQuery({
    queryKey: ['squadre-allenatori-fisso'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orario_fisso')
        .select('squadra, allenatori, giorno, ora_inizio, ora_fine')
        .order('squadra')
      if (error) throw error
      return data ?? []
    },
  })

  // Derive allenatori with ruolo from profiles (fallback: from orario_fisso text)
  const { data: profileAllenatori = [] } = useQuery({
    queryKey: ['profile-allenatori'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, email, ruolo')
        .eq('ruolo', 'allenatore')
        .order('nome')
      if (error) return []
      return data ?? []
    },
  })

  // Build squadre map: nome → { giorni, allenatori[] }
  const squadreMap = {}
  for (const r of fisso) {
    if (!r.squadra) continue
    if (!squadreMap[r.squadra]) squadreMap[r.squadra] = { nome: r.squadra, slots: [], allenatori: new Set() }
    squadreMap[r.squadra].slots.push(r)
    if (r.allenatori) {
      r.allenatori.split(',').map(a => a.trim()).filter(Boolean).forEach(a => squadreMap[r.squadra].allenatori.add(a))
    }
  }
  const squadre = Object.values(squadreMap).map(s => ({ ...s, allenatori: [...s.allenatori] }))

  // Build allenatori map: nome → squadre seguite
  const allenatoriDaFisso = new Set()
  for (const r of fisso) {
    if (r.allenatori) r.allenatori.split(',').map(a => a.trim()).filter(Boolean).forEach(a => allenatoriDaFisso.add(a))
  }

  // Merge: profile allenatori first, then add those only in fisso text
  const profileNomi = new Set(profileAllenatori.map(p => p.nome?.toLowerCase()))
  const allenatoriExtra = [...allenatoriDaFisso]
    .filter(n => !profileNomi.has(n.toLowerCase()))
    .map(n => ({ id: n, nome: n, email: null, fromFisso: true }))

  const allenatori = [
    ...profileAllenatori.map(p => ({ ...p, fromFisso: false })),
    ...allenatoriExtra,
  ]

  // For each allenatore, find squadre they're associated with
  const allenatoriConSquadre = allenatori.map(al => ({
    ...al,
    squadreSeguite: squadre.filter(s =>
      s.allenatori.some(a => a.toLowerCase() === (al.nome ?? '').toLowerCase())
    ),
  }))

  if (loadingFisso) return <LoadingSpinner message="Caricamento dati..." />

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {/* Colonna squadre */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Squadre</h3>
            <button onClick={() => setShowInfo('squadra')} className="p-1 bg-blue-50 text-blue-600 rounded-lg">
              <Plus size={14} />
            </button>
          </div>

          {squadre.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Nessuna squadra</p>
          ) : (
            <div className="space-y-1.5">
              {squadre.map(s => (
                <button
                  key={s.nome}
                  onClick={() => setSelectedSquadra(selectedSquadra?.nome === s.nome ? null : s)}
                  className={`w-full text-left rounded-xl p-2.5 border transition-colors ${
                    selectedSquadra?.nome === s.nome
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-800 truncate">{s.nome}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {s.slots.length} slot/sett.
                  </div>
                  {s.allenatori.length > 0 && (
                    <div className="text-xs text-blue-500 truncate mt-0.5">
                      {s.allenatori.join(', ')}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Colonna allenatori */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Allenatori</h3>
            <button onClick={() => setShowInfo('allenatore')} className="p-1 bg-blue-50 text-blue-600 rounded-lg">
              <Plus size={14} />
            </button>
          </div>

          {allenatoriConSquadre.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Nessun allenatore</p>
          ) : (
            <div className="space-y-1.5">
              {allenatoriConSquadre.map(al => (
                <div key={al.id ?? al.nome} className="bg-white border border-gray-200 rounded-xl p-2.5">
                  <div className="text-xs font-semibold text-gray-800 truncate">{al.nome}</div>
                  {al.email && <div className="text-xs text-gray-400 truncate">{al.email}</div>}
                  {al.fromFisso && (
                    <span className="text-xs text-amber-500">solo orario</span>
                  )}
                  {al.squadreSeguite.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {al.squadreSeguite.map(s => (
                        <span key={s.nome} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                          {s.nome}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dettaglio squadra selezionata */}
      {selectedSquadra && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-blue-800">{selectedSquadra.nome}</h4>
            <button onClick={() => setSelectedSquadra(null)} className="p-0.5 text-blue-400 hover:text-blue-600">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1 mb-2">
            {selectedSquadra.slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-blue-700">
                <span className="bg-white px-2 py-0.5 rounded font-medium w-16 text-center">
                  {GIORNO_FULL[slot.giorno]?.slice(0,3) ?? slot.giorno}
                </span>
                <Clock size={10} />
                <span>{slot.ora_inizio?.slice(0,5)} – {slot.ora_fine?.slice(0,5)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-500 font-medium mb-0.5">Allenatori:</p>
          {selectedSquadra.allenatori.length === 0 ? (
            <p className="text-xs text-gray-400">Nessun allenatore assegnato</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selectedSquadra.allenatori.map(a => (
                <span key={a} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">{a}</span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Modifica allenatori nella sezione <strong>Allenamenti → Orario fisso</strong>.
          </p>
        </div>
      )}

      {/* Info modal per aggiungere */}
      {showInfo && (
        <Modal
          title={showInfo === 'squadra' ? 'Aggiungi squadra' : 'Aggiungi allenatore'}
          onClose={() => setShowInfo(null)}
        >
          <div className="space-y-4">
            {showInfo === 'squadra' ? (
              <>
                <p className="text-sm text-gray-600">
                  Le squadre vengono rilevate automaticamente dagli <strong>orari fissi</strong>. Per aggiungere una squadra, crea un nuovo slot di allenamento fisso con il nome della squadra.
                </p>
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-700">Vai in <strong>Allenamenti → Orario fisso → ➕</strong> e inserisci il nome della nuova squadra.</p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Per aggiungere un allenatore, invitalo dalla tab <strong>Utenti</strong> con il ruolo "Allenatore", poi associalo a una squadra nell'orario fisso.
                </p>
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-700">Vai in <strong>Setup → Utenti → Invita</strong> e seleziona il ruolo Allenatore.</p>
                </div>
              </>
            )}
            <button onClick={() => setShowInfo(null)}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm">
              Chiudi
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Shared: chip selector per squadre con ruolo ──────────────────────────────

function SquadreSelector({ squadre, selected, disabled, takenByOthers, onToggle, color }) {
  const activeClass  = color === 'blue'
    ? 'bg-blue-600 text-white border-blue-600'
    : 'bg-gray-700 text-white border-gray-700'
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {squadre.map(sq => {
        const isSelected = selected.includes(sq)
        const isDisabled = disabled.includes(sq)
        const isTaken    = !isSelected && takenByOthers.has(sq)
        return (
          <button key={sq} type="button"
            onClick={() => !isDisabled && !isTaken && onToggle(sq)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              isDisabled || isTaken
                ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                : isSelected
                  ? activeClass
                  : 'bg-white text-gray-600 border-gray-200'
            }`}
            title={isTaken ? 'Ha già un capo allenatore' : undefined}
          >
            {sq}{isTaken ? ' ✗' : ''}
          </button>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — UTENTI
// ═══════════════════════════════════════════════════════════════════════════════

const RUOLO_COLORS = {
  admin:      'bg-red-100 text-red-700',
  allenatore: 'bg-blue-100 text-blue-700',
  genitore:   'bg-green-100 text-green-700',
  giocatore:  'bg-purple-100 text-purple-700',
}

function UtentiTab() {
  const qc = useQueryClient()
  const { user: me, societaId, isSuperAdmin } = useAuth()
  const [deleteErr, setDeleteErr]     = useState(null)
  const [showInvite, setShowInvite]   = useState(false)
  const [inviteForm, setInviteForm]   = useState({ email: '', nome: '', cognome: '', ruolo: 'allenatore', password: '', squadra: '', squadra2: '', squadra3: '', societa_id: '', giocatoreId: '' })
  const [inviting, setInviting]       = useState(false)
  const [inviteErr, setInviteErr]     = useState(null)
  const [inviteOk, setInviteOk]       = useState(false)
  const [showPwd,   setShowPwd]       = useState(false)
  const [copied,    setCopied]        = useState(false)
  const setI = (k, v) => setInviteForm(f => ({ ...f, [k]: v }))

  function generatePwd() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let pwd = ''
    for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    setI('password', pwd)
    setShowPwd(true)
  }

  function copyPwd() {
    if (!inviteForm.password) return
    navigator.clipboard?.writeText(inviteForm.password).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const { data: utenti = [], isLoading, error } = useQuery({
    queryKey: ['setup-utenti'],
    queryFn: async () => {
      const [profRes, allRes] = await Promise.all([
        supabase.from('profiles').select('id, nome, cognome, email, ruolo, attivo, squadra, squadra2, squadra3').order('nome'),
        supabase.from('allenatori').select('email, squadre_capo, squadre_vice'),
      ])
      if (profRes.error) throw profRes.error
      const allenatoriMap = {}
      for (const a of allRes.data ?? []) {
        if (a.email) allenatoriMap[a.email.toLowerCase()] = { squadre_capo: a.squadre_capo ?? '', squadre_vice: a.squadre_vice ?? '' }
      }
      return (profRes.data ?? [])
        .filter(u => u.ruolo !== 'super_admin')
        .map(u => {
          const all = allenatoriMap[u.email?.toLowerCase()] ?? {}
          return { ...u, squadre_capo: all.squadre_capo ?? '', squadre_vice: all.squadre_vice ?? '' }
        })
    },
  })

  const { data: squadreDisp = [] } = useQuery({
    queryKey: ['squadre-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: societaList = [] } = useQuery({
    queryKey: ['societa-list'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data } = await supabase.from('societa').select('id, nome').order('nome')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: giocatoriAll = [] } = useQuery({
    queryKey: ['giocatori-for-invite'],
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, user_id')
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
  const giocatoriSenzaAccount = giocatoriAll.filter(g => !g.user_id)

  const ruoloMut = useMutation({
    mutationFn: async ({ id, ruolo }) => {
      const { error } = await supabase.from('profiles').update({ ruolo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-utenti'] }),
  })

  const disabledMut = useMutation({
    mutationFn: async ({ id, attivo }) => {
      const { error } = await supabase.from('profiles').update({ attivo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-utenti'] }),
  })

  const deleteMut = useMutation({
    mutationFn: async (u) => {
      if (u.ruolo === 'allenatore' && u.email) {
        await supabase.from('allenatori').delete().eq('email', u.email)
      }
      const { error } = await supabase.from('profiles').delete().eq('id', u.id)
      if (error) throw error
      const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
      await fetch(`${apiBase}/api/admin/delete-user/${u.id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      setDeleteErr(null)
      qc.invalidateQueries({ queryKey: ['setup-utenti'] })
    },
    onError: (err) => setDeleteErr(err.message),
  })

  const squadraMut = useMutation({
    mutationFn: async ({ id, squadra }) => {
      const { error } = await supabase.from('profiles').update({ squadra }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-utenti'] }),
  })

  const squadra2Mut = useMutation({
    mutationFn: async ({ id, squadra2 }) => {
      const { error } = await supabase.from('profiles').update({ squadra2: squadra2 || null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-utenti'] }),
  })

  const squadra3Mut = useMutation({
    mutationFn: async ({ id, squadra3 }) => {
      const { error } = await supabase.from('profiles').update({ squadra3: squadra3 || null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-utenti'] }),
  })

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    setInviteErr(null)
    try {
      const targetSocietaId = (isSuperAdmin && inviteForm.ruolo === 'admin' && inviteForm.societa_id)
        ? inviteForm.societa_id
        : societaId

      if (!targetSocietaId) {
        throw new Error('Il tuo profilo non ha una società associata. Vai su Supabase Dashboard → Table Editor → profiles e imposta societa_id per il tuo account.')
      }

      const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
      const createRes = await fetch(`${apiBase}/api/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:    inviteForm.email,
          password: inviteForm.password,
          user_metadata: {
            nome:       inviteForm.nome,
            cognome:    inviteForm.cognome,
            ruolo:      inviteForm.ruolo,
            societa_id: targetSocietaId,
          },
        }),
      })
      const createJson = await createRes.json()
      if (createJson.error) throw new Error(createJson.error)
      const newUserId = createJson.user?.id
      if (!newUserId) throw new Error('Utente creato ma ID non ricevuto')

      if (newUserId) {
        const profileData = {
          id:         newUserId,
          email:      inviteForm.email.trim(),
          nome:       inviteForm.nome.trim()    || null,
          cognome:    inviteForm.cognome.trim() || null,
          ruolo:      inviteForm.ruolo,
          societa_id: targetSocietaId,
          attivo:     true,
        }
        if (inviteForm.ruolo === 'genitore') {
          profileData.squadra  = inviteForm.squadra  || null
          profileData.squadra2 = inviteForm.squadra2 || null
          profileData.squadra3 = inviteForm.squadra3 || null
        }
        if (inviteForm.ruolo === 'giocatore') {
          profileData.squadra  = inviteForm.squadra  || null
          profileData.squadra2 = inviteForm.squadra2 || null
          profileData.squadra3 = inviteForm.squadra3 || null
        }
        await supabase.from('profiles').upsert([profileData], { onConflict: 'id' })
      }

      // Se giocatore con collegamento a un giocatore esistente: aggiorna user_id
      if (inviteForm.ruolo === 'giocatore' && inviteForm.giocatoreId) {
        await supabase.from('giocatori').update({ user_id: newUserId }).eq('id', inviteForm.giocatoreId)
        qc.invalidateQueries({ queryKey: ['giocatori-tab'] })
        qc.invalidateQueries({ queryKey: ['giocatori-for-invite'] })
      }

      // Se allenatore: crea riga in allenatori
      if (inviteForm.ruolo === 'allenatore') {
        await supabase.from('allenatori').upsert([{
          nome: inviteForm.nome.trim(), cognome: inviteForm.cognome.trim(),
          email: inviteForm.email.trim(), squadre_capo: '', squadre_vice: '',
          societa_id: targetSocietaId,
        }], { onConflict: 'email' })
      }

      setInviteOk(true)
      setTimeout(() => {
        setShowInvite(false)
        setInviteOk(false)
        setInviteForm({ email: '', nome: '', cognome: '', ruolo: 'allenatore', squadra: '', squadra2: '', squadra3: '', password: '', societa_id: '', giocatoreId: '' })
        qc.invalidateQueries({ queryKey: ['setup-utenti'] })
        qc.invalidateQueries({ queryKey: ['allenatori-tab'] })
      }, 2500)
    } catch (err) {
      setInviteErr(err.message)
    } finally {
      setInviting(false)
    }
  }

  if (isLoading) return <LoadingSpinner message="Caricamento utenti..." />
  if (error)     return (
    <div className="p-4 text-center">
      <AlertCircle size={32} className="text-red-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600">Tabella <code>profiles</code> non trovata o accesso negato.</p>
      <p className="text-xs text-gray-400 mt-1">{error.message}</p>
    </div>
  )

  return (
    <div>
      {deleteErr && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-red-700">Errore eliminazione</p>
            <p className="text-xs text-red-600 mt-0.5">{deleteErr}</p>
            <p className="text-xs text-red-400 mt-1">Esegui su Supabase SQL Editor: <code>CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (get_my_role() IN ('admin','super_admin'));</code></p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{utenti.length} utenti registrati</p>
        <button onClick={() => setShowInvite(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={15} /> Invita
        </button>
      </div>

      {utenti.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessun utente trovato</p>
        </div>
      ) : (
        <div className="space-y-2">
          {utenti.map(u => {
            const nomeCompleto = [u.nome, u.cognome].filter(Boolean).join(' ') || 'Utente'
            const isDisabled = u.attivo === false
            return (
              <div key={u.id} className={`bg-white border rounded-xl p-3 transition-opacity ${isDisabled ? 'opacity-50 border-gray-100' : 'border-gray-200'}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{nomeCompleto}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RUOLO_COLORS[u.ruolo] ?? 'bg-gray-100 text-gray-600'}`}>
                        {RUOLI_LABEL[u.ruolo] ?? u.ruolo}
                      </span>
                      {isDisabled && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Disabilitato</span>
                      )}
                      {u.id === me?.id && (
                        <span className="text-xs text-blue-400">(tu)</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{u.email}</p>
                    {u.ruolo === 'allenatore' && (
                      <div className="mt-1 space-y-0.5">
                        {u.squadre_capo && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-xs text-gray-400">Capo:</span>
                            {u.squadre_capo.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                              <span key={s} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{s}</span>
                            ))}
                          </div>
                        )}
                        {u.squadre_vice && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-xs text-gray-400">Vice:</span>
                            {u.squadre_vice.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                              <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                            ))}
                          </div>
                        )}
                        {!u.squadre_capo && !u.squadre_vice && (
                          <p className="text-xs text-gray-400 italic">Squadre da assegnare → tab Allenatori</p>
                        )}
                      </div>
                    )}
                    {u.ruolo === 'genitore' && (
                      <div className="mt-1 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400">Sq 1:</span>
                          {u.squadra
                            ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{u.squadra}</span>
                            : <span className="text-xs text-gray-400 italic">–</span>}
                        </div>
                        {u.squadra2 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">Sq 2:</span>
                            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{u.squadra2}</span>
                          </div>
                        )}
                        {u.squadra3 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">Sq 3:</span>
                            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{u.squadra3}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {u.ruolo === 'giocatore' && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {u.squadra
                          ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">{u.squadra}</span>
                          : <span className="text-xs text-gray-400 italic">–</span>}
                        {u.squadra2 && <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{u.squadra2}</span>}
                        {u.squadra3 && <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{u.squadra3}</span>}
                      </div>
                    )}
                  </div>

                  {u.id !== me?.id && (
                    <div className="flex flex-col gap-1.5 items-end">
                      <select
                        value={u.ruolo ?? ''}
                        onChange={e => ruoloMut.mutate({ id: u.id, ruolo: e.target.value })}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        {RUOLI.map(r => <option key={r} value={r}>{RUOLI_LABEL[r]}</option>)}
                      </select>
                      {u.ruolo === 'genitore' && squadreDisp.length > 0 && (<>
                        <select
                          value={u.squadra ?? ''}
                          onChange={e => squadraMut.mutate({ id: u.id, squadra: e.target.value || null })}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                        >
                          <option value="">– Squadra 1 –</option>
                          {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                          value={u.squadra2 ?? ''}
                          onChange={e => squadra2Mut.mutate({ id: u.id, squadra2: e.target.value || null })}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                        >
                          <option value="">– Sq 2 –</option>
                          {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra3).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                          value={u.squadra3 ?? ''}
                          onChange={e => squadra3Mut.mutate({ id: u.id, squadra3: e.target.value || null })}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                        >
                          <option value="">– Sq 3 –</option>
                          {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </>)}
                      {u.ruolo === 'giocatore' && squadreDisp.length > 0 && (<>
                        <select
                          value={u.squadra ?? ''}
                          onChange={e => squadraMut.mutate({ id: u.id, squadra: e.target.value || null })}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                        >
                          <option value="">– Squadra 1 –</option>
                          {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                          value={u.squadra2 ?? ''}
                          onChange={e => squadra2Mut.mutate({ id: u.id, squadra2: e.target.value || null })}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                        >
                          <option value="">– Sq 2 –</option>
                          {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra3).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                          value={u.squadra3 ?? ''}
                          onChange={e => squadra3Mut.mutate({ id: u.id, squadra3: e.target.value || null })}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                        >
                          <option value="">– Sq 3 –</option>
                          {squadreDisp.filter(s => s !== u.squadra && s !== u.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </>)}
                      <button
                        onClick={() => disabledMut.mutate({ id: u.id, attivo: !u.attivo })}
                        className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${
                          isDisabled
                            ? 'text-green-600 border-green-200 bg-green-50'
                            : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {isDisabled ? 'Abilita' : 'Disabilita'}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Eliminare ${nomeCompleto}? Questa azione non può essere annullata.`))
                            deleteMut.mutate(u)
                        }}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg border border-red-100 transition-colors"
                        title="Elimina utente"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showInvite && (
        <Modal title="Invita nuovo utente" onClose={() => setShowInvite(false)}>
          {inviteOk ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-green-600" />
              </div>
              <p className="font-semibold text-gray-800">Account creato!</p>
              <p className="text-xs text-gray-500 mt-1">Condividi l'email e la password con l'utente per permettergli di accedere.</p>
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome">
                  <input value={inviteForm.nome} onChange={e => setI('nome', e.target.value)} className={inp} placeholder="Mario" />
                </Field>
                <Field label="Cognome">
                  <input value={inviteForm.cognome} onChange={e => setI('cognome', e.target.value)} className={inp} placeholder="Rossi" />
                </Field>
              </div>
              <Field label="Email *">
                <input type="email" value={inviteForm.email} onChange={e => setI('email', e.target.value)}
                  className={inp} placeholder="mario@esempio.com" required />
              </Field>
              <Field label="Password iniziale *">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={inviteForm.password}
                      onChange={e => setI('password', e.target.value)}
                      className={inp}
                      placeholder="Almeno 6 caratteri"
                      required
                      minLength={6}
                    />
                  </div>
                  <button type="button" onClick={generatePwd}
                    className="shrink-0 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors">
                    Genera
                  </button>
                  {inviteForm.password && (
                    <button type="button" onClick={copyPwd}
                      className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {copied ? '✓' : 'Copia'}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="text-xs text-blue-500 mt-1">
                  {showPwd ? 'Nascondi' : 'Mostra'} password
                </button>
              </Field>
              <Field label="Ruolo">
                <select value={inviteForm.ruolo} onChange={e => setI('ruolo', e.target.value)} className={inp}>
                  {RUOLI.map(r => <option key={r} value={r}>{RUOLI_LABEL[r]}</option>)}
                </select>
              </Field>
              {isSuperAdmin && inviteForm.ruolo === 'admin' && (
                <Field label="Società">
                  <select value={inviteForm.societa_id} onChange={e => setI('societa_id', e.target.value)} className={inp}>
                    <option value="">Scegli società...</option>
                    {societaList.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </Field>
              )}
              {inviteForm.ruolo === 'allenatore' && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-blue-600">
                    Le squadre (capo/vice) si assegnano dalla tab <strong>Allenatori</strong> dopo la creazione dell'account.
                  </p>
                </div>
              )}
              {inviteForm.ruolo === 'genitore' && (<>
                {giocatoriAll.length > 0 && (
                  <Field label="Figlio/a (giocatore)">
                    <select
                      value={inviteForm.giocatoreId ?? ''}
                      onChange={e => {
                        const gId = e.target.value
                        const g = gId ? giocatoriAll.find(x => x.id === gId) : null
                        setInviteForm(f => ({
                          ...f,
                          giocatoreId: gId,
                          squadra:  g ? (g.squadra  ?? '') : f.squadra,
                          squadra2: g ? (g.squadra2 ?? '') : f.squadra2,
                          squadra3: g ? (g.squadra3 ?? '') : f.squadra3,
                        }))
                      }}
                      className={inp}
                    >
                      <option value="">-- Seleziona giocatore --</option>
                      {giocatoriAll.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.cognome} {g.nome}{g.squadra ? ` (${g.squadra})` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {squadreDisp.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">Nessuna squadra configurata</p>
                ) : (<>
                  <Field label="Squadra 1">
                    <select value={inviteForm.squadra ?? ''} onChange={e => setI('squadra', e.target.value)} className={inp}>
                      <option value="">Scegli squadra...</option>
                      {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Squadra 2 (opzionale)">
                    <select value={inviteForm.squadra2 ?? ''} onChange={e => setI('squadra2', e.target.value)} className={inp}>
                      <option value="">Nessuna</option>
                      {squadreDisp.filter(s => s !== inviteForm.squadra && s !== inviteForm.squadra3).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Squadra 3 (opzionale)">
                    <select value={inviteForm.squadra3 ?? ''} onChange={e => setI('squadra3', e.target.value)} className={inp}>
                      <option value="">Nessuna</option>
                      {squadreDisp.filter(s => s !== inviteForm.squadra && s !== inviteForm.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </>)}
              </>)}
              {inviteForm.ruolo === 'giocatore' && (<>
                {giocatoriSenzaAccount.length > 0 && (
                  <Field label="Collega a giocatore esistente (opzionale)">
                    <select
                      value={inviteForm.giocatoreId ?? ''}
                      onChange={e => {
                        const gId = e.target.value
                        const g = gId ? giocatoriSenzaAccount.find(x => x.id === gId) : null
                        setInviteForm(f => ({
                          ...f,
                          giocatoreId: gId,
                          nome:     g ? g.nome    : f.nome,
                          cognome:  g ? g.cognome : f.cognome,
                          squadra:  g ? (g.squadra  ?? '') : f.squadra,
                          squadra2: g ? (g.squadra2 ?? '') : f.squadra2,
                          squadra3: g ? (g.squadra3 ?? '') : f.squadra3,
                        }))
                      }}
                      className={inp}
                    >
                      <option value="">-- Nessuno / crea nuovo --</option>
                      {giocatoriSenzaAccount.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.cognome} {g.nome}{g.squadra ? ` (${g.squadra})` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {squadreDisp.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">Nessuna squadra configurata</p>
                ) : (<>
                  <Field label="Squadra principale">
                    <select value={inviteForm.squadra ?? ''} onChange={e => setI('squadra', e.target.value)} className={inp}>
                      <option value="">Scegli squadra...</option>
                      {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Squadra 2 (opzionale)">
                    <select value={inviteForm.squadra2 ?? ''} onChange={e => setI('squadra2', e.target.value)} className={inp}>
                      <option value="">Nessuna</option>
                      {squadreDisp.filter(s => s !== inviteForm.squadra && s !== inviteForm.squadra3).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Squadra 3 (opzionale)">
                    <select value={inviteForm.squadra3 ?? ''} onChange={e => setI('squadra3', e.target.value)} className={inp}>
                      <option value="">Nessuna</option>
                      {squadreDisp.filter(s => s !== inviteForm.squadra && s !== inviteForm.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </>)}
              </>)}
              {inviteErr && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-600">{inviteErr}</p>
                </div>
              )}
              <button type="submit" disabled={inviting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
                {inviting ? 'Creazione account...' : 'Crea account'}
              </button>
            </form>
          )}
        </Modal>
      )}

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB — SQUADRE
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_SQ = { categoria: '' }

function SquadreTab() {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [showForm,   setShowForm]   = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [form, setForm]             = useState(EMPTY_SQ)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: squadre = [], isLoading, error } = useQuery({
    queryKey: ['squadre-table'],
    queryFn: async () => {
      const { data, error } = await supabase.from('squadre').select('*').order('categoria')
      if (error) throw error
      return data ?? []
    },
  })

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const payload = { categoria: f.categoria.trim() }
      if (f.id) {
        const { error } = await supabase.from('squadre').update(payload).eq('id', f.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('squadre').insert([{ ...payload, societa_id: societaId }])
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['squadre-table'] }); closeForm() },
  })

  const delMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('squadre').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['squadre-table'] }),
  })

  function openAdd()   { setEditingRow(null); setForm(EMPTY_SQ); setShowForm(true) }
  function openEdit(r) { setEditingRow(r); setForm({ ...r }); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditingRow(null); setForm(EMPTY_SQ) }

  if (isLoading) return <LoadingSpinner message="Caricamento squadre..." />
  if (error)     return <ErrorBox error={error} />

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{squadre.length} squadre</p>
        <button onClick={openAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={15} /> Aggiungi
        </button>
      </div>

      {squadre.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessuna squadra configurata</p>
        </div>
      ) : (
        <div className="space-y-2">
          {squadre.map(s => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-gray-900 text-sm">{s.categoria}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => window.confirm(`Eliminare "${s.categoria}"?`) && delMut.mutate(s.id)}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editingRow ? 'Modifica squadra' : 'Nuova squadra'} onClose={closeForm}>
          <form onSubmit={e => { e.preventDefault(); saveMut.mutateAsync(form) }} className="space-y-4">
            <Field label="Categoria *">
              <input value={form.categoria} onChange={e => set('categoria', e.target.value)}
                className={inp} placeholder="es. U13, U18, Senior" required />
            </Field>
            {saveMut.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                <p className="text-xs text-red-600">{saveMut.error?.message}</p>
              </div>
            )}
            <button type="submit" disabled={saveMut.isPending}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {saveMut.isPending ? 'Salvataggio...' : (editingRow ? 'Salva modifiche' : 'Aggiungi squadra')}
            </button>
          </form>
        </Modal>
      )}

      <DoppioSection squadreList={squadre.map(s => s.categoria).filter(Boolean)} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOPPIO CAMPIONATO — sezione configurazione coppie
// ═══════════════════════════════════════════════════════════════════════════════

function DoppioSection({ squadreList }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ squadra_a: '', squadra_b: '', note: '' })

  const { data: pairs = [], isLoading } = useQuery({
    queryKey: ['doppio-campionato'],
    queryFn: async () => {
      const { data, error } = await supabase.from('doppio_campionato').select('*').order('squadra_a')
      if (error) throw error
      return data ?? []
    },
  })

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const { error } = await supabase.from('doppio_campionato').insert([{
        squadra_a: f.squadra_a, squadra_b: f.squadra_b, note: f.note, societa_id: societaId,
      }])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doppio-campionato'] })
      setShowForm(false)
      setForm({ squadra_a: '', squadra_b: '', note: '' })
    },
  })

  const delMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('doppio_campionato').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doppio-campionato'] }),
  })

  const canSave = !!form.squadra_a && !!form.squadra_b && form.squadra_a !== form.squadra_b

  return (
    <div className="mt-8 border-t border-gray-200 pt-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700">Doppio campionato</h3>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={15} /> Aggiungi
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Coppie di squadre con giocatori in comune. Partite nello stesso giorno generano un avviso.
      </p>

      {isLoading ? (
        <LoadingSpinner message="Caricamento..." />
      ) : pairs.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">Nessuna coppia configurata</p>
      ) : (
        <div className="space-y-2">
          {pairs.map(p => (
            <div key={p.id} className="bg-white border border-orange-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <span className="text-sm font-semibold text-orange-700">{p.squadra_a}</span>
              <span className="text-gray-400 text-sm font-bold">↔</span>
              <span className="text-sm font-semibold text-orange-700">{p.squadra_b}</span>
              {p.note && <span className="text-xs text-gray-400 flex-1 truncate">{p.note}</span>}
              <button
                onClick={() => window.confirm(`Rimuovere la coppia ${p.squadra_a} ↔ ${p.squadra_b}?`) && delMut.mutate(p.id)}
                className="ml-auto p-1 text-red-400 hover:bg-red-50 rounded-lg shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title="Nuova coppia doppio campionato" onClose={() => { setShowForm(false); setForm({ squadra_a: '', squadra_b: '', note: '' }) }}>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-orange-700">
              Seleziona due squadre che condividono giocatori in doppio tesseramento. Le partite nello stesso giorno genereranno un avviso.
            </p>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (canSave) saveMut.mutateAsync(form) }} className="space-y-4">
            <Field label="Squadra A *">
              <select value={form.squadra_a}
                onChange={e => setForm(f => ({ ...f, squadra_a: e.target.value }))}
                className={inp}>
                <option value="">Scegli...</option>
                {squadreList.filter(s => s !== form.squadra_b).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Squadra B *">
              <select value={form.squadra_b}
                onChange={e => setForm(f => ({ ...f, squadra_b: e.target.value }))}
                className={inp}>
                <option value="">Scegli...</option>
                {squadreList.filter(s => s !== form.squadra_a).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Note (opzionale)">
              <input value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className={inp} placeholder="es. Doppio tesseramento U13/U15" />
            </Field>
            {saveMut.isError && <p className="text-xs text-red-500">{saveMut.error?.message}</p>}
            <button type="submit" disabled={saveMut.isPending || !canSave}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {saveMut.isPending ? 'Salvataggio...' : 'Aggiungi coppia'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 — SCHEDULING
// ═══════════════════════════════════════════════════════════════════════════════

const GIORNI_SCHED    = ['lunedi','martedi','mercoledi','giovedi','venerdi','sabato','domenica']
const FASCE_ORARIE    = ['Pomeriggio presto','Pomeriggio tardi','Serata','Mattina']
const SLOT_BASE       = 15 * 60   // 15:00 in minuti
const SLOT_SZ         = 15        // minuti per slot
const N_SLOTS         = 28        // 15:00–22:00

function minutiToSlot(ora) {
  const [h, m] = ora.split(':').map(Number)
  return Math.floor(((h * 60 + m) - SLOT_BASE) / SLOT_SZ)
}
function slotsFromRange(orarioInizio, orarioFine) {
  const s = minutiToSlot(orarioInizio)
  const e = minutiToSlot(orarioFine)
  const result = []
  for (let i = Math.max(0, s); i < Math.min(N_SLOTS, e); i++) result.push(i)
  return result
}

const DEFAULT_SQ_VINCOLO = { min_all: 2, max_all: 3, durata_slot: 6, fascia_pref: 'Pomeriggio tardi', palestra_pref: '', giorno_riposo: '', priorita: 5 }

function SchedulingTab() {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [generating, setGenerating] = useState(false)
  const [result, setResult]         = useState(null)   // { assegnazioni, avvisi }
  const [genError, setGenError]     = useState(null)
  const [confirmed, setConfirmed]   = useState(false)
  const [editSlots, setEditSlots]   = useState(null)   // copia editabile di assegnazioni
  const [vincoli, setVincoli]       = useState({})     // {squadra: {min_all,max_all,...}}

  const { data: orarioFisso = [], isLoading } = useQuery({
    queryKey: ['orario-fisso-scheduling'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orario_fisso').select('*').order('giorno').order('ora_inizio')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: palestre = [] } = useQuery({
    queryKey: ['palestre'],
    queryFn: async () => {
      const { data, error } = await supabase.from('palestre').select('*')
      if (error) return []
      return data ?? []
    },
  })

  const squadreList = useMemo(() => [...new Set(orarioFisso.map(r => r.squadra).filter(Boolean))].sort(), [orarioFisso])
  const palestreNomi = useMemo(() => palestre.map(p => p.nome).filter(Boolean), [palestre])

  function getVincolo(sq) { return vincoli[sq] ?? { ...DEFAULT_SQ_VINCOLO } }
  function setVincolo(sq, k, v) { setVincoli(prev => ({ ...prev, [sq]: { ...getVincolo(sq), [k]: v } })) }

  function buildVincoliPayload() {
    // Palestre: usa ora_inizio/ora_fine e giorni dalla tabella palestre
    const palestreMap = {}
    for (const p of palestre) {
      const orari = p.orari ?? {}
      const giorni = {}
      for (const g of GIORNI_SCHED) {
        const o = orari[g]
        giorni[g] = o?.attivo ? slotsFromRange(o.ora_inizio ?? '15:00', o.ora_fine ?? '22:00') : []
      }
      palestreMap[p.nome] = giorni
    }
    // Squadre
    const squadreDef = squadreList.map(sq => ({
      nome: sq,
      allenatori: [],
      ...getVincolo(sq),
    }))
    return { palestre: palestreMap, allenatori: {}, squadre: squadreDef, doppi: [] }
  }

  const confirmMut = useMutation({
    mutationFn: async (slots) => {
      const { error: delErr } = await supabase.from('orario_fisso').delete().gte('id', '00000000-0000-0000-0000-000000000000')
      if (delErr) throw delErr
      const rows = slots.map(r => ({
        giorno: r.giorno, squadra: r.squadra,
        ora_inizio: r.ora_inizio, ora_fine: r.ora_fine,
        palestra: r.palestra ?? '', allenatori: r.allenatori ?? '',
        societa_id: societaId,
      }))
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('orario_fisso').insert(rows)
        if (insErr) throw insErr
      }
    },
    onSuccess: () => {
      setConfirmed(true)
      qc.invalidateQueries({ queryKey: ['orario-fisso-scheduling'] })
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      qc.invalidateQueries({ queryKey: ['squadre'] })
    },
  })

  async function handleGenerate() {
    setGenerating(true); setGenError(null); setResult(null); setEditSlots(null); setConfirmed(false)
    try {
      const payload = buildVincoliPayload()
      const resp = await fetch(`${API_BASE}/api/scheduling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      if (!data.success) throw new Error(data.error ?? 'Errore scheduling')
      setResult(data)
      setEditSlots(data.assegnazioni ?? [])
    } catch (err) {
      setGenError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  // Griglia corrente
  const byGiorno = useMemo(() => {
    const map = {}
    for (const r of orarioFisso) {
      if (!map[r.giorno]) map[r.giorno] = []
      map[r.giorno].push(r)
    }
    return map
  }, [orarioFisso])

  // Griglia risultato
  const resultByGiorno = useMemo(() => {
    const map = {}
    for (const r of (editSlots ?? [])) {
      if (!map[r.giorno]) map[r.giorno] = []
      map[r.giorno].push(r)
    }
    return map
  }, [editSlots])

  function updateSlot(idx, k, v) {
    setEditSlots(prev => prev.map((s, i) => i === idx ? { ...s, [k]: v } : s))
  }

  if (isLoading) return <LoadingSpinner message="Caricamento orario fisso..." />

  return (
    <div className="space-y-5">

      {/* Griglia corrente */}
      {orarioFisso.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Settimana tipo attuale</h3>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-1.5" style={{ minWidth: 'max-content' }}>
              {GIORNI_SCHED.filter(g => byGiorno[g]).map(giorno => (
                <div key={giorno} className="w-28 shrink-0">
                  <div className="bg-gray-700 rounded-t-lg px-1 py-1.5 text-center">
                    <span className="text-xs font-medium text-white">{GIORNO_FULL[giorno]?.slice(0,3)}</span>
                  </div>
                  <div className="bg-gray-50 rounded-b-lg p-1 space-y-1 border border-t-0 border-gray-200">
                    {(byGiorno[giorno] ?? []).map((r, i) => (
                      <div key={i} className="bg-white border border-blue-100 rounded-lg p-1.5">
                        <div className="text-xs font-semibold text-blue-700 truncate">{r.squadra}</div>
                        <div className="text-xs text-gray-500">{r.ora_inizio?.slice(0,5)}</div>
                        {r.palestra && <div className="text-xs text-gray-400 truncate">{r.palestra}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Vincoli per squadra */}
      {squadreList.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">⚙️ Vincoli per squadra</h3>
          <div className="space-y-2">
            {squadreList.map(sq => {
              const v = getVincolo(sq)
              return (
                <div key={sq} className="bg-white border border-gray-200 rounded-xl p-3">
                  <div className="font-semibold text-sm text-gray-800 mb-2">{sq}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-gray-400 block mb-0.5">Min allenamenti/sett</label>
                      <input type="number" min={1} max={7} value={v.min_all}
                        onChange={e => setVincolo(sq, 'min_all', parseInt(e.target.value))}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-0.5">Max allenamenti/sett</label>
                      <input type="number" min={1} max={7} value={v.max_all}
                        onChange={e => setVincolo(sq, 'max_all', parseInt(e.target.value))}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-0.5">Fascia oraria preferita</label>
                      <select value={v.fascia_pref} onChange={e => setVincolo(sq, 'fascia_pref', e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                        {FASCE_ORARIE.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-0.5">Palestra preferita</label>
                      <select value={v.palestra_pref} onChange={e => setVincolo(sq, 'palestra_pref', e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                        <option value="">Qualsiasi</option>
                        {palestreNomi.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-0.5">Giorno di riposo</label>
                      <select value={v.giorno_riposo} onChange={e => setVincolo(sq, 'giorno_riposo', e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                        <option value="">Nessuno</option>
                        {GIORNI_SCHED.map(g => <option key={g} value={g}>{GIORNO_FULL[g]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-0.5">Durata (slot da 15min)</label>
                      <input type="number" min={2} max={12} value={v.durata_slot}
                        onChange={e => setVincolo(sq, 'durata_slot', parseInt(e.target.value))}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Genera orario */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-1">Generazione automatica</h3>
        <p className="text-xs text-blue-600 mb-3">
          Chiama l'algoritmo CP in <code>logic.py</code> tramite l'API locale (avvia <code>uvicorn api:app</code>).
        </p>
        <button onClick={handleGenerate} disabled={generating || squadreList.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-all">
          <Zap size={16} />
          {generating ? 'Generazione in corso...' : '⚡ Genera orario ottimale'}
        </button>
      </div>

      {genError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-700">API non raggiungibile</p>
              <p className="text-xs text-amber-600 mt-0.5">{genError}</p>
              <p className="text-xs text-amber-500 mt-1">Avvia: <code>uvicorn api:app --reload --port 8000</code></p>
            </div>
          </div>
        </div>
      )}

      {/* Risultato generazione + modifica manuale */}
      {editSlots && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-green-800">
              Orario generato ({editSlots.length} slot)
            </h3>
            {confirmed ? (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <Check size={13} /> Confermato
              </span>
            ) : (
              <button onClick={() => {
                if (window.confirm('Confermare come settimana tipo?\nSostituirà tutto l\'orario fisso attuale.'))
                  confirmMut.mutate(editSlots)
              }} disabled={confirmMut.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium disabled:opacity-60">
                <Check size={12} /> {confirmMut.isPending ? 'Salvataggio...' : '✅ Conferma settimana tipo'}
              </button>
            )}
          </div>

          {result?.avvisi?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              {result.avvisi.map((a, i) => <p key={i} className="text-xs text-amber-700">⚠️ {a}</p>)}
            </div>
          )}

          {/* Griglia risultato */}
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-1.5" style={{ minWidth: 'max-content' }}>
              {GIORNI_SCHED.filter(g => resultByGiorno[g]).map(giorno => (
                <div key={giorno} className="w-28 shrink-0">
                  <div className="bg-green-700 rounded-t-lg px-1 py-1.5 text-center">
                    <span className="text-xs font-medium text-white">{GIORNO_FULL[giorno]?.slice(0,3)}</span>
                  </div>
                  <div className="bg-green-50 rounded-b-lg p-1 space-y-1 border border-t-0 border-green-200">
                    {(resultByGiorno[giorno] ?? []).map((r, i) => {
                      const globalIdx = editSlots.indexOf(r)
                      return (
                        <div key={i} className="bg-white border border-green-100 rounded-lg p-1.5">
                          <div className="text-xs font-semibold text-green-700 truncate">{r.squadra}</div>
                          <div className="text-xs text-gray-500">{r.ora_inizio?.slice(0,5)}</div>
                          {r.palestra && <div className="text-xs text-gray-400 truncate">{r.palestra}</div>}
                          {/* Modifica manuale inline */}
                          <div className="mt-1 space-y-0.5">
                            <input type="time" value={r.ora_inizio ?? ''}
                              onChange={e => updateSlot(globalIdx, 'ora_inizio', e.target.value)}
                              className="w-full border border-gray-100 rounded px-1 py-0.5 text-xs" />
                            <input type="time" value={r.ora_fine ?? ''}
                              onChange={e => updateSlot(globalIdx, 'ora_fine', e.target.value)}
                              className="w-full border border-gray-100 rounded px-1 py-0.5 text-xs" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">✏️ Modifica gli orari direttamente nella griglia, poi conferma</p>
          {confirmMut.isError && <p className="text-xs text-red-500 text-center">{confirmMut.error?.message}</p>}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TAB — SOCIETÀ (solo super_admin)
// ═══════════════════════════════════════════════════════════════════════════════

const inp_soc = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function SocietaTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ nome: '', piano: 'free' })

  const { data: societa = [], isLoading } = useQuery({
    queryKey: ['societa-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('societa').select('id, nome, piano, created_at').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const { error } = await supabase.from('societa').insert([{ nome: f.nome.trim(), piano: f.piano }])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['societa-list'] })
      setShowForm(false)
      setForm({ nome: '', piano: 'free' })
    },
  })

  if (isLoading) return <LoadingSpinner message="Caricamento società..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{societa.length} società registrate</p>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={15} /> Nuova società
        </button>
      </div>

      <div className="space-y-2 mb-6">
        {societa.map(s => (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{s.nome}</p>
                <p className="text-xs text-gray-400">Piano: {s.piano}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                s.piano === 'pro' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {s.piano === 'pro' ? '⭐ Pro' : 'Free'}
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-1 font-mono truncate">{s.id}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title="Nuova società" onClose={() => setShowForm(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Nome società *</label>
              <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                className={inp_soc} placeholder="es. Treviso Basket" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Piano</label>
              <select value={form.piano} onChange={e => setForm(f => ({ ...f, piano: e.target.value }))} className={inp_soc}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            {saveMut.isError && <p className="text-xs text-red-500">{saveMut.error?.message}</p>}
            <button
              onClick={() => form.nome.trim() && saveMut.mutate(form)}
              disabled={saveMut.isPending || !form.nome.trim()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {saveMut.isPending ? 'Creazione...' : '✅ Crea società'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB — GIOCATORI
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_GIOCATORE = { nome: '', cognome: '', squadra: '', squadra2: '', squadra3: '', data_nascita: '', numero_maglia: '', note: '', attivo: true }

function GiocatoriTab() {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [showForm, setShowForm]       = useState(false)
  const [editingRow, setEditingRow]   = useState(null)
  const [form, setForm]               = useState(EMPTY_GIOCATORE)
  const [accountModal, setAccountModal] = useState(null)
  const [accountForm, setAccountForm] = useState({ email: '', password: '' })
  const [accountErr, setAccountErr]   = useState(null)
  const [accountOk, setAccountOk]     = useState(false)
  const [creatingAcc, setCreatingAcc] = useState(false)
  const [indispModal, setIndispModal] = useState(null) // giocatore row
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: squadreDisp = [] } = useQuery({
    queryKey: ['squadre-table'],
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(s => s.categoria)
    },
  })

  const { data: giocatori = [], isLoading, error } = useQuery({
    queryKey: ['giocatori-tab'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('giocatori')
        .select('*')
        .order('cognome')
        .order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const payload = {
        nome:           f.nome.trim(),
        cognome:        f.cognome.trim(),
        squadra:        f.squadra,
        squadra2:       f.squadra2 || null,
        squadra3:       f.squadra3 || null,
        data_nascita:   f.data_nascita || null,
        numero_maglia:  f.numero_maglia !== '' ? Number(f.numero_maglia) : null,
        note:           f.note.trim() || null,
        attivo:         f.attivo,
      }
      if (f.id) {
        const { error } = await supabase.from('giocatori').update(payload).eq('id', f.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('giocatori').insert([{ ...payload, societa_id: societaId }])
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['giocatori-tab'] }); closeForm() },
  })

  const delMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('giocatori').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['giocatori-tab'] }),
  })

  function openAdd()   { saveMut.reset(); setEditingRow(null); setForm(EMPTY_GIOCATORE); setShowForm(true) }
  function openEdit(g) { saveMut.reset(); setEditingRow(g); setForm({ ...g, squadra2: g.squadra2 ?? '', squadra3: g.squadra3 ?? '', data_nascita: g.data_nascita ?? '', numero_maglia: g.numero_maglia ?? '', note: g.note ?? '' }); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditingRow(null); setForm(EMPTY_GIOCATORE) }

  function openAccountModal(g) {
    setAccountModal(g)
    setAccountForm({ email: '', password: '' })
    setAccountErr(null)
    setAccountOk(false)
  }

  async function handleCreaAccount(e) {
    e.preventDefault()
    setCreatingAcc(true)
    setAccountErr(null)
    try {
      const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${apiBase}/api/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:    accountForm.email,
          password: accountForm.password,
          user_metadata: {
            nome:       accountModal.nome,
            cognome:    accountModal.cognome,
            ruolo:      'giocatore',
            societa_id: societaId,
          },
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const newUserId = json.user?.id
      if (!newUserId) throw new Error('Utente creato ma ID non ricevuto')

      await supabase.from('profiles').upsert([{
        id:         newUserId,
        email:      accountForm.email.trim(),
        nome:       accountModal.nome,
        cognome:    accountModal.cognome,
        ruolo:      'giocatore',
        societa_id: societaId,
        squadra:    accountModal.squadra,
        squadra2:   accountModal.squadra2 || null,
        squadra3:   accountModal.squadra3 || null,
        attivo:     true,
      }], { onConflict: 'id' })

      const { error: linkErr } = await supabase
        .from('giocatori')
        .update({ user_id: newUserId })
        .eq('id', accountModal.id)
      if (linkErr) throw linkErr

      setAccountOk(true)
      qc.invalidateQueries({ queryKey: ['giocatori-tab'] })
      setTimeout(() => setAccountModal(null), 2500)
    } catch (err) {
      setAccountErr(err.message)
    } finally {
      setCreatingAcc(false)
    }
  }

  if (isLoading) return <LoadingSpinner message="Caricamento giocatori..." />
  if (error) return (
    <div className="p-4 text-center">
      <AlertCircle size={32} className="text-red-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600">Tabella <code>giocatori</code> non trovata.</p>
      <p className="text-xs text-gray-400 mt-1">Esegui prima la migrazione SQL.</p>
    </div>
  )

  const bySquadra = giocatori.reduce((acc, g) => {
    const sq = g.squadra || 'Senza squadra'
    if (!acc[sq]) acc[sq] = []
    acc[sq].push(g)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{giocatori.length} giocatori</p>
        <button onClick={openAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={15} /> Aggiungi
        </button>
      </div>

      {giocatori.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessun giocatore registrato</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(bySquadra).sort(([a],[b]) => a.localeCompare(b)).map(([squadra, list]) => (
            <div key={squadra}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{squadra}</p>
              <div className="space-y-2">
                {list.map(g => (
                  <div key={g.id} className={`bg-white border rounded-xl p-3 transition-opacity ${!g.attivo ? 'opacity-50 border-gray-100' : 'border-gray-200'}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900">{g.cognome} {g.nome}</span>
                          {g.numero_maglia != null && (
                            <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">#{g.numero_maglia}</span>
                          )}
                          {g.squadra2 && (
                            <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{g.squadra2}</span>
                          )}
                          {g.squadra3 && (
                            <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{g.squadra3}</span>
                          )}
                          {!g.attivo && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inattivo</span>
                          )}
                          {g.user_id && (
                            <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">App</span>
                          )}
                        </div>
                        {g.data_nascita && (
                          <p className="text-xs text-gray-400 mt-0.5">Nato: {new Date(g.data_nascita).toLocaleDateString('it-IT')}</p>
                        )}
                        {g.note && (
                          <p className="text-xs text-gray-400 italic mt-0.5 truncate">{g.note}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0 items-center">
                        {!g.user_id && (
                          <button
                            onClick={() => openAccountModal(g)}
                            className="p-1.5 text-purple-500 hover:bg-purple-50 rounded-lg border border-purple-100"
                            title="Crea account app"
                          >
                            <UserPlus size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setIndispModal(g)}
                          className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg border border-orange-100"
                          title="Infortuni / Indisponibilità"
                        >
                          <Activity size={14} />
                        </button>
                        <button onClick={() => openEdit(g)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => window.confirm(`Eliminare ${g.nome} ${g.cognome}?`) && delMut.mutate(g.id)}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editingRow ? 'Modifica giocatore' : 'Nuovo giocatore'} onClose={closeForm}>
          <form onSubmit={e => { e.preventDefault(); saveMut.mutate(form) }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome *">
                <input value={form.nome} onChange={e => set('nome', e.target.value)} className={inp} placeholder="Mario" required />
              </Field>
              <Field label="Cognome *">
                <input value={form.cognome} onChange={e => set('cognome', e.target.value)} className={inp} placeholder="Rossi" required />
              </Field>
            </div>
            <Field label="Squadra principale *">
              <select value={form.squadra} onChange={e => set('squadra', e.target.value)} className={inp} required>
                <option value="">Scegli squadra...</option>
                {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Squadra 2 (opzionale)">
              <select value={form.squadra2} onChange={e => set('squadra2', e.target.value)} className={inp}>
                <option value="">Nessuna</option>
                {squadreDisp.filter(s => s !== form.squadra && s !== form.squadra3).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Squadra 3 (opzionale)">
              <select value={form.squadra3} onChange={e => set('squadra3', e.target.value)} className={inp}>
                <option value="">Nessuna</option>
                {squadreDisp.filter(s => s !== form.squadra && s !== form.squadra2).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data nascita">
                <input type="date" value={form.data_nascita} onChange={e => set('data_nascita', e.target.value)} className={inp} />
              </Field>
              <Field label="N. maglia">
                <input type="number" min="0" max="99" value={form.numero_maglia} onChange={e => set('numero_maglia', e.target.value)} className={inp} placeholder="–" />
              </Field>
            </div>
            <Field label="Note">
              <input value={form.note} onChange={e => set('note', e.target.value)} className={inp} placeholder="Opzionale" />
            </Field>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.attivo} onChange={e => set('attivo', e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-700">Giocatore attivo</span>
            </label>
            {saveMut.isError && <p className="text-xs text-red-500">{saveMut.error?.message}</p>}
            <button type="submit" disabled={saveMut.isPending}
              className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {saveMut.isPending ? 'Salvataggio...' : editingRow ? 'Salva modifiche' : 'Aggiungi giocatore'}
            </button>
          </form>
        </Modal>
      )}

      {accountModal && (
        <Modal title={`Crea account — ${accountModal.nome} ${accountModal.cognome}`} onClose={() => setAccountModal(null)}>
          {accountOk ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-green-600" />
              </div>
              <p className="font-semibold text-gray-800">Account creato e collegato!</p>
              <p className="text-xs text-gray-500 mt-1">Il giocatore può ora accedere all'app.</p>
            </div>
          ) : (
            <form onSubmit={handleCreaAccount} className="space-y-4">
              <p className="text-xs text-gray-500">Crea un account app per questo giocatore. L'account sarà collegato automaticamente al suo profilo.</p>
              <Field label="Email *">
                <input type="email" value={accountForm.email} onChange={e => setAccountForm(f => ({ ...f, email: e.target.value }))}
                  className={inp} placeholder="mario@esempio.com" required />
              </Field>
              <Field label="Password iniziale *">
                <input type="text" value={accountForm.password} onChange={e => setAccountForm(f => ({ ...f, password: e.target.value }))}
                  className={inp} placeholder="Almeno 6 caratteri" required minLength={6} />
              </Field>
              {accountErr && <p className="text-xs text-red-500">{accountErr}</p>}
              <button type="submit" disabled={creatingAcc}
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
                {creatingAcc ? 'Creazione account...' : 'Crea account'}
              </button>
            </form>
          )}
        </Modal>
      )}

      {indispModal && (
        <IndisponibilitaModal giocatore={indispModal} societaId={societaId} onClose={() => setIndispModal(null)} />
      )}
    </div>
  )
}

// ─── IndisponibilitaModal ─────────────────────────────────────────────────────

const TIPO_LABELS = { infortunio: 'Infortunio', sospeso: 'Sospeso', altro: 'Altro' }
const EMPTY_INDISP = { data_inizio: '', data_fine: '', tipo: 'infortunio', note: '' }

function IndisponibilitaModal({ giocatore, societaId, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY_INDISP)
  const [showForm, setShowForm] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['indisponibilita', giocatore.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('indisponibilita')
        .select('*')
        .eq('giocatore_id', giocatore.id)
        .order('data_inizio', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const { error } = await supabase.from('indisponibilita').insert([{
        societa_id:  societaId,
        giocatore_id: giocatore.id,
        data_inizio: f.data_inizio,
        data_fine:   f.data_fine || null,
        tipo:        f.tipo,
        note:        f.note.trim() || null,
      }])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['indisponibilita', giocatore.id] })
      setForm(EMPTY_INDISP)
      setShowForm(false)
    },
  })

  const delMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('indisponibilita').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['indisponibilita', giocatore.id] }),
  })

  const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '...'

  return (
    <Modal title={`Indisponibilità — ${giocatore.nome} ${giocatore.cognome}`} onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{lista.length} voci</span>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={14} /> Aggiungi
        </button>
      </div>

      {showForm && (
        <form onSubmit={e => { e.preventDefault(); saveMut.mutate(form) }} className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inizio *">
              <input type="date" value={form.data_inizio} onChange={e => set('data_inizio', e.target.value)} className={inp} required />
            </Field>
            <Field label="Fine (opzionale)">
              <input type="date" value={form.data_fine} onChange={e => set('data_fine', e.target.value)} className={inp} />
            </Field>
          </div>
          <Field label="Tipo">
            <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inp}>
              {Object.entries(TIPO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Note">
            <input value={form.note} onChange={e => set('note', e.target.value)} className={inp} placeholder="Opzionale" />
          </Field>
          {saveMut.isError && <p className="text-xs text-red-500">{saveMut.error?.message}</p>}
          <button type="submit" disabled={saveMut.isPending}
            className="w-full py-2 bg-orange-500 text-white rounded-xl text-sm font-medium disabled:opacity-60">
            {saveMut.isPending ? 'Salvataggio...' : 'Salva'}
          </button>
        </form>
      )}

      {isLoading ? <LoadingSpinner message="Caricamento..." /> : lista.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nessuna indisponibilità registrata</p>
      ) : (
        <div className="space-y-2">
          {lista.map(r => (
            <div key={r.id} className="flex items-start gap-2 bg-gray-50 rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.tipo === 'infortunio' ? 'bg-red-100 text-red-700' :
                    r.tipo === 'sospeso'   ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{TIPO_LABELS[r.tipo]}</span>
                  <span className="text-xs text-gray-600">{fmtDate(r.data_inizio)} → {fmtDate(r.data_fine)}</span>
                </div>
                {r.note && <p className="text-xs text-gray-400 italic mt-0.5">{r.note}</p>}
              </div>
              <button onClick={() => delMut.mutate(r.id)} className="p-1 text-red-400 hover:bg-red-50 rounded-lg shrink-0">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ─── Tab list (module level, non dipende da state) ────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// TAB — QUOTE
// ═══════════════════════════════════════════════════════════════════════════════

const TIPO_QUOTA_LABELS = { mensile: 'Mensile', iscrizione: 'Iscrizione', altro: 'Altro' }
const EMPTY_QUOTA = { tipo: 'mensile', descrizione: '', importo: '', data_scadenza: '', pagato: false, data_pagamento: '', note: '' }

function QuoteTab() {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [squadraFilter, setSquadraFilter] = useState('')
  const [quoteModal, setQuoteModal]       = useState(null) // giocatore row

  const { data: squadreDisp = [] } = useQuery({
    queryKey: ['squadre-table'],
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(s => s.categoria)
    },
  })

  const { data: giocatori = [], isLoading } = useQuery({
    queryKey: ['giocatori-quote', squadraFilter],
    queryFn: async () => {
      let q = supabase.from('giocatori').select('id, nome, cognome, squadra').eq('attivo', true).order('cognome')
      if (squadraFilter) q = q.or(`squadra.eq.${squadraFilter},squadra2.eq.${squadraFilter},squadra3.eq.${squadraFilter}`)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const { data: tutteQuote = [] } = useQuery({
    queryKey: ['quote-tab', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('quote').select('giocatore_id, pagato')
      if (error) throw error
      return data ?? []
    },
  })

  function getCountQuote(giocatoreId) {
    const mine = tutteQuote.filter(q => q.giocatore_id === giocatoreId)
    return { totali: mine.length, pagate: mine.filter(q => q.pagato).length, arretrate: mine.filter(q => !q.pagato).length }
  }

  if (isLoading) return <LoadingSpinner message="Caricamento..." />

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <select value={squadraFilter} onChange={e => setSquadraFilter(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tutte le squadre</option>
          {squadreDisp.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {giocatori.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CreditCard size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessun giocatore trovato</p>
        </div>
      ) : (
        <div className="space-y-2">
          {giocatori.map(g => {
            const counts = getCountQuote(g.id)
            return (
              <button key={g.id} onClick={() => setQuoteModal(g)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 active:scale-95 transition-transform">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm text-gray-900">{g.cognome} {g.nome}</span>
                  <span className="text-xs text-gray-400 ml-2">{g.squadra}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {counts.arretrate > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{counts.arretrate} da pagare</span>
                  )}
                  {counts.pagate > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{counts.pagate} pagate</span>
                  )}
                  {counts.totali === 0 && (
                    <span className="text-xs text-gray-300">–</span>
                  )}
                  <ChevronDown size={14} className="text-gray-400" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {quoteModal && (
        <QuoteGiocatoreModal giocatore={quoteModal} societaId={societaId} onClose={() => { setQuoteModal(null); qc.invalidateQueries({ queryKey: ['quote-tab', societaId] }) }} />
      )}
    </div>
  )
}

function QuoteGiocatoreModal({ giocatore, societaId, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY_QUOTA)
  const [showForm, setShowForm] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: quote = [], isLoading } = useQuery({
    queryKey: ['quote-giocatore', giocatore.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote').select('*').eq('giocatore_id', giocatore.id)
        .order('data_scadenza', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const { error } = await supabase.from('quote').insert([{
        societa_id:      societaId,
        giocatore_id:    giocatore.id,
        tipo:            f.tipo,
        descrizione:     f.descrizione.trim() || null,
        importo:         f.importo !== '' ? Number(f.importo) : null,
        data_scadenza:   f.data_scadenza || null,
        pagato:          f.pagato,
        data_pagamento:  f.pagato && f.data_pagamento ? f.data_pagamento : null,
        note:            f.note.trim() || null,
      }])
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quote-giocatore', giocatore.id] }); setForm(EMPTY_QUOTA); setShowForm(false) },
  })

  const pagatoMut = useMutation({
    mutationFn: async ({ id, pagato }) => {
      const { error } = await supabase.from('quote').update({ pagato, data_pagamento: pagato ? new Date().toISOString().slice(0,10) : null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quote-giocatore', giocatore.id] }),
  })

  const delMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('quote').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quote-giocatore', giocatore.id] }),
  })

  const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '–'
  const totale  = quote.reduce((s, q) => s + (q.importo ?? 0), 0)
  const restante = quote.filter(q => !q.pagato).reduce((s, q) => s + (q.importo ?? 0), 0)

  return (
    <Modal title={`Quote — ${giocatore.nome} ${giocatore.cognome}`} onClose={onClose}>
      {quote.length > 0 && (
        <div className="flex gap-4 mb-4 pb-3 border-b border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-400">Totale</p>
            <p className="text-sm font-semibold text-gray-800">€ {totale.toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">Da pagare</p>
            <p className={`text-sm font-semibold ${restante > 0 ? 'text-red-600' : 'text-gray-400'}`}>€ {restante.toFixed(2)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{quote.length} quote</span>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={14} /> Aggiungi
        </button>
      </div>

      {showForm && (
        <form onSubmit={e => { e.preventDefault(); saveMut.mutate(form) }} className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inp}>
                {Object.entries(TIPO_QUOTA_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Importo (€)">
              <input type="number" step="0.01" min="0" value={form.importo} onChange={e => set('importo', e.target.value)} className={inp} placeholder="0.00" />
            </Field>
          </div>
          <Field label="Descrizione">
            <input value={form.descrizione} onChange={e => set('descrizione', e.target.value)} className={inp} placeholder="es. Quota ottobre" />
          </Field>
          <Field label="Scadenza">
            <input type="date" value={form.data_scadenza} onChange={e => set('data_scadenza', e.target.value)} className={inp} />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.pagato} onChange={e => set('pagato', e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Già pagato</span>
          </label>
          {form.pagato && (
            <Field label="Data pagamento">
              <input type="date" value={form.data_pagamento} onChange={e => set('data_pagamento', e.target.value)} className={inp} />
            </Field>
          )}
          {saveMut.isError && <p className="text-xs text-red-500">{saveMut.error?.message}</p>}
          <button type="submit" disabled={saveMut.isPending}
            className="w-full py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-60">
            {saveMut.isPending ? 'Salvataggio...' : 'Salva quota'}
          </button>
        </form>
      )}

      {isLoading ? <LoadingSpinner message="Caricamento..." /> : quote.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nessuna quota registrata</p>
      ) : (
        <div className="space-y-2">
          {quote.map(q => (
            <div key={q.id} className={`flex items-start gap-2 rounded-xl p-3 border ${q.pagato ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-700">{TIPO_QUOTA_LABELS[q.tipo]}</span>
                  {q.descrizione && <span className="text-xs text-gray-500">{q.descrizione}</span>}
                  {q.importo != null && <span className="text-xs font-semibold text-gray-800">€ {Number(q.importo).toFixed(2)}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {q.data_scadenza && <span className="text-xs text-gray-400">Scad: {fmtDate(q.data_scadenza)}</span>}
                  {q.pagato
                    ? <span className="text-xs text-green-600 font-medium">✅ Pagato {q.data_pagamento ? fmtDate(q.data_pagamento) : ''}</span>
                    : <span className="text-xs text-red-500 font-medium">⏳ Da pagare</span>
                  }
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => pagatoMut.mutate({ id: q.id, pagato: !q.pagato })}
                  className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${q.pagato ? 'text-gray-500 border-gray-200' : 'text-green-600 border-green-200 bg-green-50'}`}
                >{q.pagato ? 'Annulla' : '✅ Paga'}</button>
                <button onClick={() => window.confirm('Eliminare questa quota?') && delMut.mutate(q.id)}
                  className="p-1 text-red-400 hover:bg-red-50 rounded-lg border border-red-100">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

const ALL_TABS = [
  { id: 'squadre',     label: 'Squadre',     icon: Users,     superAdminOnly: false },
  { id: 'palestre',    label: 'Palestre',    icon: Building2, superAdminOnly: false },
  { id: 'allenatori',  label: 'Allenatori',  icon: UserCheck, superAdminOnly: false },
  { id: 'giocatori',   label: 'Giocatori',   icon: UserPlus,  superAdminOnly: false },
  { id: 'quote',       label: 'Quote',       icon: CreditCard, superAdminOnly: false, adminOnly: true },
  { id: 'utenti',      label: 'Utenti',      icon: Shield,    superAdminOnly: false },
  { id: 'scheduling',  label: 'Scheduling',  icon: Calendar,  superAdminOnly: false, hidden: true },
  { id: 'societa',     label: 'Società',     icon: Globe,     superAdminOnly: true  },
]

export default function SetupPage() {
  const [activeTab, setActiveTab] = useState('squadre')
  const { isSuperAdmin, isAdmin } = useAuth()
  const tabs = ALL_TABS.filter(t => (!t.superAdminOnly || isSuperAdmin) && (!t.adminOnly || isAdmin) && !t.hidden)

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <Settings size={20} className="text-gray-700" />
          <h1 className="text-xl font-bold text-gray-900">Setup</h1>
        </div>
        <div className="flex border-t border-gray-100 overflow-x-auto">
          {tabs.map(tab => (
            <TabBtn
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 p-4">
        {activeTab === 'squadre'     && <SquadreTab />}
        {activeTab === 'palestre'    && <PalestreTab />}
        {activeTab === 'allenatori'  && <AllenatoriTab />}
        {activeTab === 'giocatori'   && <GiocatoriTab />}
        {activeTab === 'quote'       && <QuoteTab />}
        {activeTab === 'utenti'      && <UtentiTab />}
        {activeTab === 'scheduling'  && <SchedulingTab />}
        {activeTab === 'societa'     && <SocietaTab />}
      </div>
    </div>
  )
}
