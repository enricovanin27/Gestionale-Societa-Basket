import { useState } from 'react'
import {
  Building2, Users, Dumbbell, ChevronRight, GitFork,
  CalendarDays, Briefcase,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppHeader from '../../components/AppHeader'
import { useAuth } from '../../hooks/useAuth'
import InvitaUtenteForm from '../../components/InvitaUtenteForm'
import { Modal, Field, inp } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { GIORNI, GIORNI_LABEL, TIPO_PALESTRA } from '../../lib/constants'

// ---------------------------------------------------------------------------
// Role constants
// ---------------------------------------------------------------------------
const RUOLO_LABEL_LOCAL = {
  admin:                'Admin',
  allenatore:           'Allenatore',
  segreteria:           'Segreteria',
  dirigente:            'Dirigente',
  preparatore_atletico: 'Preparatore',
}

const RUOLO_COLOR = {
  admin:                'bg-red-100 text-red-700',
  allenatore:           'bg-blue-100 text-blue-700',
  segreteria:           'bg-teal-100 text-teal-700',
  dirigente:            'bg-indigo-100 text-indigo-700',
  preparatore_atletico: 'bg-purple-100 text-purple-700',
}

// Ruoli extra assegnabili dall'admin (mai giocatore/genitore)
const RUOLI_EXTRA_STAFF = ['admin', 'allenatore', 'segreteria', 'dirigente', 'preparatore_atletico']

// ---------------------------------------------------------------------------
// Helpers for palestra orari
// ---------------------------------------------------------------------------
const DEFAULT_ORARIO_G = { attivo: false, ora_inizio: '15:00', ora_fine: '22:00' }

function emptyOrari() {
  return Object.fromEntries(GIORNI.map(g => [g, { ...DEFAULT_ORARIO_G }]))
}

const EMPTY_PAL = { nome: '', tipo: 'Principale', solo_allenamento: false, orari: emptyOrari() }

// ---------------------------------------------------------------------------
// Shared card components
// ---------------------------------------------------------------------------
function SetupCard({ icon: Icon, title, desc, onClick, border }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors ${border ? 'border-b border-gray-100' : ''}`}
    >
      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-amber-600" strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
    </button>
  )
}

function SectionGroup({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">{title}</p>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PalestraModal
// ---------------------------------------------------------------------------
function PalestraModal({ onClose }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [form, setForm] = useState(EMPTY_PAL)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setOrario = (g, k, v) => setForm(f => ({
    ...f, orari: { ...f.orari, [g]: { ...f.orari[g], [k]: v } },
  }))

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const { error } = await supabase.from('palestre').insert([{
        nome: f.nome.trim(), tipo: f.tipo,
        solo_allenamento: f.solo_allenamento ?? false,
        orari: f.orari, societa_id: societaId,
      }])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['palestre'] })
      qc.invalidateQueries({ queryKey: ['palestre', societaId] })
      onClose()
    },
  })

  return (
    <Modal title="Nuova palestra" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); saveMut.mutateAsync(form) }} className="space-y-4">
        <Field label="Nome *">
          <input value={form.nome} onChange={e => set('nome', e.target.value)}
            className={inp} placeholder="es. PalaOderzo" required autoFocus />
        </Field>

        <Field label="Tipo">
          <div className="flex gap-2 mt-1">
            {TIPO_PALESTRA.map(t => (
              <button key={t} type="button" onClick={() => set('tipo', t)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  form.tipo === t ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Uso">
          <div className="flex gap-2 mt-1">
            {[{ val: false, label: '🏀 Gara + Allenamento' }, { val: true, label: '🏃 Solo Allenamento' }].map(({ val, label }) => (
              <button key={String(val)} type="button" onClick={() => set('solo_allenamento', val)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  (form.solo_allenamento ?? false) === val ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Orari per giorno">
          <div className="mt-1 space-y-2">
            {GIORNI.map(g => {
              const o = form.orari[g]
              return (
                <div key={g} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border transition-colors ${o.attivo ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                  <button type="button" onClick={() => setOrario(g, 'attivo', !o.attivo)}
                    className={`w-14 shrink-0 text-xs font-medium py-0.5 rounded-md border transition-colors ${o.attivo ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-400 border-gray-200'}`}>
                    {GIORNI_LABEL[g]}
                  </button>
                  {o.attivo ? (
                    <>
                      <input type="time" value={o.ora_inizio}
                        onChange={e => setOrario(g, 'ora_inizio', e.target.value)}
                        className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      <span className="text-xs text-gray-400">–</span>
                      <input type="time" value={o.ora_fine}
                        onChange={e => setOrario(g, 'ora_fine', e.target.value)}
                        className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                    </>
                  ) : (
                    <span className="text-xs text-gray-300 italic">Chiuso</span>
                  )}
                </div>
              )
            })}
          </div>
        </Field>

        {saveMut.isError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveMut.error?.message}</p>
        )}

        <button type="submit" disabled={saveMut.isPending || !form.nome.trim()}
          className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saveMut.isPending ? 'Salvataggio...' : 'Aggiungi palestra'}
        </button>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// SquadraModal
// ---------------------------------------------------------------------------
function SquadraModal({ onClose }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [categoria, setCategoria] = useState('')

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('squadre').insert([{
        categoria: categoria.trim(), societa_id: societaId,
      }])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['squadre-table'] })
      qc.invalidateQueries({ queryKey: ['squadre-nomi'] })
      qc.invalidateQueries({ queryKey: ['squadre-nomi-invita', societaId] })
      qc.invalidateQueries({ queryKey: ['squadre-segreteria', societaId] })
      onClose()
    },
  })

  return (
    <Modal title="Nuova squadra" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); saveMut.mutateAsync() }} className="space-y-4">
        <Field label="Categoria *">
          <input
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className={inp}
            placeholder="es. U13, U18, Senior"
            required autoFocus
          />
        </Field>
        {saveMut.isError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveMut.error?.message}</p>
        )}
        <button type="submit" disabled={saveMut.isPending || !categoria.trim()}
          className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saveMut.isPending ? 'Salvataggio...' : 'Aggiungi squadra'}
        </button>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// DoppioGiocatoriModal
// ---------------------------------------------------------------------------
function DoppioGiocatoriModal({ onClose }) {
  const qc = useQueryClient()
  const { societaId } = useAuth()
  const [squadraA, setSquadraA] = useState('')
  const [squadraB, setSquadraB] = useState('')
  const [rows, setRows]         = useState([{ id: Date.now(), cognome: '', nome: '' }])
  const [saving, setSaving]     = useState(false)
  const [errors, setErrors]     = useState([])

  const { data: squadreList = [] } = useQuery({
    queryKey: ['squadre-nomi-doppio', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
  })

  const { data: pairs = [] } = useQuery({
    queryKey: ['doppio-campionato'],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase.from('doppio_campionato').select('squadra_a, squadra_b')
      return data ?? []
    },
  })

  const pairExists = !!squadraA && !!squadraB && pairs.some(p =>
    (p.squadra_a === squadraA && p.squadra_b === squadraB) ||
    (p.squadra_a === squadraB && p.squadra_b === squadraA)
  )

  function addRow()            { setRows(r => [...r, { id: Date.now(), cognome: '', nome: '' }]) }
  function removeRow(i)        { setRows(r => r.filter((_, idx) => idx !== i)) }
  function updateRow(i, k, v)  {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [k]: v } : row))
  }

  const canSave = !!squadraA && !!squadraB && squadraA !== squadraB &&
    rows.some(r => r.cognome.trim())

  async function handleSave() {
    setSaving(true)
    setErrors([])
    const errs = []
    try {
      if (!pairExists) {
        const { error } = await supabase.from('doppio_campionato').insert([{
          squadra_a: squadraA, squadra_b: squadraB, societa_id: societaId,
        }])
        if (error) {
          setErrors([`Coppia: ${error.message}`])
          setSaving(false)
          return
        }
      }

      for (const row of rows.filter(r => r.cognome.trim())) {
        const { error } = await supabase.from('giocatori').insert([{
          cognome:          row.cognome.trim(),
          nome:             row.nome.trim() || null,
          squadra:          squadraA,
          squadra2:         squadraB,
          societa_id:       societaId,
          attivo:           true,
          genitore_user_id: null,
        }])
        if (error) errs.push(`${row.cognome} ${row.nome}: ${error.message}`)
      }

      qc.invalidateQueries({ queryKey: ['doppio-campionato'] })
      qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })

      if (errs.length === 0) {
        onClose()
      } else {
        setErrors(errs)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Doppio Campionato" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Coppia di squadre</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Squadra A *</label>
              <select className={inp} value={squadraA} onChange={e => setSquadraA(e.target.value)}>
                <option value="">— Seleziona —</option>
                {squadreList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Squadra B *</label>
              <select className={inp} value={squadraB} onChange={e => setSquadraB(e.target.value)}>
                <option value="">— Seleziona —</option>
                {squadreList.filter(s => s !== squadraA).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {pairExists && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-2">
              ⚠️ Coppia già esistente — verranno solo aggiunti i giocatori.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Giocatori in questa coppia</p>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={row.id} className="flex gap-2 items-center">
                <input className={inp} placeholder="Cognome *"
                  value={row.cognome} onChange={e => updateRow(i, 'cognome', e.target.value)} />
                <input className={inp} placeholder="Nome"
                  value={row.nome} onChange={e => updateRow(i, 'nome', e.target.value)} />
                {rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(i)}
                    className="p-2 text-gray-400 hover:text-red-500 shrink-0 text-lg leading-none">×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow}
            className="mt-2 text-xs text-amber-600 font-medium hover:text-amber-700">
            + Aggiungi giocatore
          </button>
        </div>

        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
            {errors.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
          </div>
        )}

        <button type="button" onClick={handleSave} disabled={saving || !canSave}
          className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
          {saving ? 'Salvataggio...' : '💾 Salva'}
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// UtentiConfigurati
// ---------------------------------------------------------------------------
function UtentiConfigurati() {
  const { societaId, user: me } = useAuth()
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState({})

  const { data: utenti = [], isLoading } = useQuery({
    queryKey: ['setup-utenti-staff', societaId],
    enabled: !!societaId,
    staleTime: 60_000,
    queryFn: async () => {
      const [profRes, allRes, prepRes] = await Promise.all([
        supabase.from('profiles')
          .select('id, nome, cognome, email, ruolo, ruoli_extra, squadra, squadra2, squadra3')
          .eq('societa_id', societaId)
          .not('ruolo', 'in', '("giocatore","genitore","super_admin")')
          .order('cognome').order('nome'),
        supabase.from('allenatori').select('email, squadre_capo, squadre_vice'),
        supabase.from('prep_squadre').select('preparatore_id, squadra').eq('societa_id', societaId),
      ])
      const allenatoriMap = {}
      for (const a of allRes.data ?? []) {
        if (a.email) allenatoriMap[a.email.toLowerCase()] = {
          capo: a.squadre_capo ?? '', vice: a.squadre_vice ?? '',
        }
      }
      const prepMap = {}
      for (const p of prepRes.data ?? []) {
        if (!prepMap[p.preparatore_id]) prepMap[p.preparatore_id] = []
        prepMap[p.preparatore_id].push(p.squadra)
      }
      return (profRes.data ?? []).map(u => ({
        ...u,
        _allenatoreData: allenatoriMap[u.email?.toLowerCase()] ?? null,
        _prepSquadre:    prepMap[u.id] ?? [],
      }))
    },
  })

  const ruoliExtraMut = useMutation({
    mutationFn: async ({ id, ruoli_extra }) => {
      const { error } = await supabase.from('profiles').update({ ruoli_extra }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-utenti-staff', societaId] }),
  })

  function toggleExpand(userId, ruolo) {
    setExpanded(prev => {
      const key = `${userId}-${ruolo}`
      return { ...prev, [key]: !prev[key] }
    })
  }

  function toggleExtra(u, ruolo) {
    const attuali = u.ruoli_extra ?? []
    const nuovo = attuali.includes(ruolo)
      ? attuali.filter(r => r !== ruolo)
      : [...attuali, ruolo]
    ruoliExtraMut.mutate({ id: u.id, ruoli_extra: nuovo })
  }

  function getSquadreForRuolo(u, ruolo) {
    if (ruolo === 'allenatore' && u._allenatoreData) {
      const capo = u._allenatoreData.capo.split(',').map(s => s.trim()).filter(Boolean)
      const vice = u._allenatoreData.vice.split(',').map(s => s.trim()).filter(Boolean)
      return { capo, vice }
    }
    if (ruolo === 'preparatore_atletico') return { squadre: u._prepSquadre }
    return null
  }

  if (isLoading) return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">👥 Utenti configurati</p>
      <p className="text-xs text-gray-400 px-1">Caricamento...</p>
    </div>
  )

  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">👥 Utenti configurati</p>

      {utenti.length === 0 ? (
        <p className="text-xs text-gray-400 px-1">Nessun utente staff configurato.</p>
      ) : (
        <div className="space-y-2">
          {utenti.map(u => {
            const nome = [u.nome, u.cognome].filter(Boolean).join(' ') || 'Utente'
            const allRuoli = [u.ruolo, ...(u.ruoli_extra ?? [])]
            const extraDisp = RUOLI_EXTRA_STAFF.filter(r => r !== u.ruolo)

            return (
              <div key={u.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-xs font-bold uppercase">
                    {nome.split(' ').map(w => w[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{nome}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  </div>
                  {u.id === me?.id && <span className="text-xs text-blue-400 shrink-0">(tu)</span>}
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {allRuoli.map(ruolo => {
                    const squadreInfo = getSquadreForRuolo(u, ruolo)
                    const key = `${u.id}-${ruolo}`
                    const isOpen = !!expanded[key]
                    return (
                      <div key={ruolo}>
                        <button
                          type="button"
                          onClick={() => squadreInfo && toggleExpand(u.id, ruolo)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
                            RUOLO_COLOR[ruolo] ?? 'bg-gray-100 text-gray-600 border-transparent'
                          } ${squadreInfo ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          {RUOLO_LABEL_LOCAL[ruolo] ?? ruolo}
                          {squadreInfo ? (isOpen ? ' ▲' : ' ▾') : ''}
                        </button>
                        {isOpen && squadreInfo && (
                          <div className="mt-1 ml-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                            {squadreInfo.capo?.length > 0 && (
                              <p>Capo: <strong>{squadreInfo.capo.join(', ')}</strong></p>
                            )}
                            {squadreInfo.vice?.length > 0 && (
                              <p>Vice: <strong>{squadreInfo.vice.join(', ')}</strong></p>
                            )}
                            {squadreInfo.squadre?.length > 0 && (
                              <p>Squadre: <strong>{squadreInfo.squadre.join(', ')}</strong></p>
                            )}
                            {(!squadreInfo.capo?.length && !squadreInfo.vice?.length && !squadreInfo.squadre?.length) && (
                              <p className="text-gray-400">Nessuna squadra assegnata</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {u.id !== me?.id && (
                  <div className="flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
                    <span className="text-[10px] text-gray-400 self-center">+ ruolo:</span>
                    {extraDisp.map(r => {
                      const hasIt = (u.ruoli_extra ?? []).includes(r)
                      return (
                        <button key={r} type="button" onClick={() => toggleExtra(u, r)}
                          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                            hasIt
                              ? `${RUOLO_COLOR[r] ?? 'bg-gray-100 text-gray-600'} border-transparent`
                              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                          }`}>
                          {hasIt ? '✓ ' : ''}{RUOLO_LABEL_LOCAL[r] ?? r}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AdminSetupPage — main export
// ---------------------------------------------------------------------------
export default function AdminSetupPage() {
  const { displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()
  const [openModal, setOpenModal] = useState(null)
  const close = () => setOpenModal(null)

  return (
    <div>
      <AppHeader
        title="Setup"
        subtitle={societaNome ?? 'Configurazione società'}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      <div className="px-4 pt-4 space-y-4 pb-8">

        {/* Struttura societaria */}
        <SectionGroup title="🏢 Struttura societaria">
          <SetupCard icon={Building2} title="Aggiungi palestra"  desc="Sedi e orari disponibili"   onClick={() => setOpenModal('palestra')}  border />
          <SetupCard icon={Users}     title="Aggiungi squadra"   desc="Nuova categoria"             onClick={() => setOpenModal('squadra')} />
        </SectionGroup>

        {/* Staff */}
        <SectionGroup title="👤 Staff">
          <SetupCard icon={Dumbbell}   title="Nuovo Allenatore"   desc="Invita tramite email"             onClick={() => setOpenModal('allenatore')}  border />
          <SetupCard icon={Briefcase}  title="Invita Segreteria"  desc="Accesso gestione giocatori"       onClick={() => setOpenModal('segreteria')} />
        </SectionGroup>

        {/* Strumenti */}
        <SectionGroup title="🛠 Strumenti">
          <SetupCard icon={CalendarDays} title="Configura Settimana Tipo" desc="Template orario settimanale"       onClick={() => navigate('/admin/setup/settimana_tipo')} border />
          <SetupCard icon={GitFork}      title="Doppio Campionato"         desc="Coppie squadre e giocatori comuni" onClick={() => setOpenModal('doppio')} />
        </SectionGroup>

        {/* Utenti configurati */}
        <UtentiConfigurati />

      </div>

      {/* Modal staff */}
      {['allenatore', 'segreteria'].includes(openModal) && (
        <Modal
          title={openModal === 'allenatore' ? 'Nuovo Allenatore' : 'Invita Segreteria'}
          onClose={close}
        >
          <InvitaUtenteForm
            ruoliConsentiti={openModal === 'allenatore' ? ['allenatore'] : ['segreteria']}
            onSuccess={close}
          />
        </Modal>
      )}

      {openModal === 'palestra' && <PalestraModal onClose={close} />}
      {openModal === 'squadra'  && <SquadraModal  onClose={close} />}
      {openModal === 'doppio'   && <DoppioGiocatoriModal onClose={close} />}
    </div>
  )
}
