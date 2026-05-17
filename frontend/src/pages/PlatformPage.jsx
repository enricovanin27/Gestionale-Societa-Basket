import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Users, LogOut, Plus, Check, AlertCircle,
  Trash2, Globe, Shield, Edit2, Crown, BarChart3,
} from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import { Modal, Field, inp } from '../components/ui'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({ societa, profiles }) {
  const proCount    = societa.filter(s => s.piano === 'pro').length
  const freeCount   = societa.length - proCount
  const pendingCount = societa.filter(s => s.stato === 'pending').length

  const societaStats = useMemo(() => societa.map(s => {
    const sp = profiles.filter(p => p.societa_id === s.id)
    return {
      ...s,
      nUtenti: sp.length,
      nAdmin:  sp.filter(p => p.ruolo === 'admin').length,
    }
  }), [societa, profiles])

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className={`grid gap-3 ${pendingCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
          <Building2 size={20} className="text-blue-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-900">{societa.length}</div>
          <div className="text-xs text-gray-400">Società</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
          <Users size={20} className="text-green-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-900">{profiles.length}</div>
          <div className="text-xs text-gray-400">Utenti</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
          <Crown size={20} className="text-amber-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-900">{proCount}</div>
          <div className="text-xs text-gray-400">Pro</div>
        </div>
        {pendingCount > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100 text-center">
            <span className="text-xl">⏳</span>
            <div className="text-2xl font-bold text-orange-600 mt-1">{pendingCount}</div>
            <div className="text-xs text-gray-400">In attesa</div>
          </div>
        )}
      </div>

      {/* Piano breakdown */}
      {societa.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Distribuzione piani</h3>
          <div className="flex gap-3">
            <div className="flex-1 bg-amber-50 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-amber-700">{proCount}</div>
              <div className="text-xs text-amber-600">⭐ Pro</div>
            </div>
            <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-gray-600">{freeCount}</div>
              <div className="text-xs text-gray-500">Free</div>
            </div>
          </div>
        </div>
      )}

      {/* Society list */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Società registrate</h3>
        {societaStats.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Building2 size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nessuna società registrata</p>
            <p className="text-xs mt-1">Vai alla tab Società per aggiungerne una</p>
          </div>
        ) : (
          <div className="space-y-2">
            {societaStats.map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{s.nome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        s.piano === 'pro'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {s.piano === 'pro' ? '⭐ Pro' : 'Free'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-400">
                        <Users size={10} className="inline mr-0.5" />{s.nUtenti} utenti
                      </span>
                      <span className="text-xs text-gray-400">
                        <Shield size={10} className="inline mr-0.5" />{s.nAdmin} admin
                      </span>
                      {s.created_at && (
                        <span className="text-xs text-gray-300">
                          {format(new Date(s.created_at), 'd MMM yyyy', { locale: it })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Società Tab ──────────────────────────────────────────────────────────────

function SocietaTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editRow,  setEditRow]  = useState(null)
  const [form, setForm] = useState({ nome: '', piano: 'free' })
  const [approveRow,     setApproveRow]     = useState(null)
  const [approveForm,    setApproveForm]    = useState({ nome: '', cognome: '', password: '' })
  const [approvingId,    setApprovingId]    = useState(null)
  const [approveErr,     setApproveErr]     = useState(null)
  const [showApprovePwd, setShowApprovePwd] = useState(false)

  const { data: societa = [], isLoading } = useQuery({
    queryKey: ['platform-societa'],
    queryFn: async () => {
      const { data, error } = await supabase.from('societa').select('*').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const saveMut = useMutation({
    mutationFn: async (f) => {
      const nome = f.nome.trim()
      if (f.id) {
        const { error } = await supabase.from('societa').update({ nome, piano: f.piano, slug: toSlug(nome) }).eq('id', f.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('societa').insert([{ nome, piano: f.piano, slug: toSlug(nome) }])
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-societa'] })
      qc.invalidateQueries({ queryKey: ['platform-all'] })
      closeForm()
    },
  })

  const delMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('societa').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-societa'] })
      qc.invalidateQueries({ queryKey: ['platform-all'] })
    },
  })

  function openApprove(s) {
    setApproveRow(s)
    setApproveForm({ nome: s.ref_nome ?? '', cognome: s.ref_cognome ?? '', password: '' })
    setApproveErr(null)
  }

  function closeApprove() {
    setApproveRow(null)
    setApproveErr(null)
    setShowApprovePwd(false)
  }

  function generateApprovePwd() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let pwd = ''
    for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    setApproveForm(f => ({ ...f, password: pwd }))
    setShowApprovePwd(true)
  }

  async function handleApprove(e) {
    e.preventDefault()
    if (!approveRow) return
    setApprovingId(approveRow.id)
    setApproveErr(null)
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: approveRow.ref_email,
        password: approveForm.password,
        options: {
          data: {
            nome:       approveForm.nome.trim(),
            cognome:    approveForm.cognome.trim(),
            ruolo:      'admin',
            societa_id: approveRow.id,
          },
        },
      })
      if (signUpErr) throw signUpErr

      if (signUpData?.user?.id) {
        const { error: profErr } = await supabase.from('profiles').upsert([{
          id:         signUpData.user.id,
          email:      approveRow.ref_email,
          nome:       approveForm.nome.trim()    || null,
          cognome:    approveForm.cognome.trim() || null,
          ruolo:      'admin',
          societa_id: approveRow.id,
          attivo:     true,
        }], { onConflict: 'id' })
        if (profErr) throw profErr
      }

      const { error: stateErr } = await supabase
        .from('societa').update({ stato: 'attiva' }).eq('id', approveRow.id)
      if (stateErr) throw stateErr

      qc.invalidateQueries({ queryKey: ['platform-societa'] })
      qc.invalidateQueries({ queryKey: ['platform-all'] })
      qc.invalidateQueries({ queryKey: ['platform-admins'] })
      closeApprove()
    } catch (err) {
      setApproveErr(err.message)
    } finally {
      setApprovingId(null)
    }
  }

  const rifiutaMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('societa').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-societa'] })
      qc.invalidateQueries({ queryKey: ['platform-all'] })
    },
  })

  function openAdd()  { setEditRow(null); setForm({ nome: '', piano: 'free' }); setShowForm(true) }
  function openEdit(s) { setEditRow(s); setForm({ nome: s.nome, piano: s.piano }); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditRow(null) }

  if (isLoading) return <LoadingSpinner message="Caricamento società..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{societa.length} società registrate</p>
        <button onClick={openAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={15} /> Aggiungi
        </button>
      </div>

      {societa.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nessuna società</p>
        </div>
      ) : (
        <div className="space-y-2">
          {societa.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{s.nome}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      s.piano === 'pro' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.piano === 'pro' ? '⭐ Pro' : 'Free'}
                    </span>
                    {s.stato === 'pending' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
                        ⏳ In attesa
                      </span>
                    )}
                  </div>
                  {s.stato === 'pending' && s.ref_email && (
                    <p className="text-xs text-blue-500 mt-0.5 truncate">{s.ref_email}</p>
                  )}
                  <p className="text-xs text-gray-300 mt-0.5 font-mono truncate">{s.id}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {s.stato === 'pending' ? (
                    <>
                      <button onClick={() => openApprove(s)}
                        className="px-2 py-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg text-xs font-semibold transition-colors">
                        Approva
                      </button>
                      <button
                        onClick={() => window.confirm(`Rifiutare la richiesta di "${s.nome}"?`) && rifiutaMut.mutate(s.id)}
                        className="px-2 py-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-semibold transition-colors">
                        Rifiuta
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => openEdit(s)}
                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => window.confirm(`Eliminare "${s.nome}"?\nTutti i dati associati (utenti, allenamenti, partite) saranno persi.`) && delMut.mutate(s.id)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editRow ? 'Modifica società' : 'Nuova società'} onClose={closeForm}>
          <form onSubmit={e => { e.preventDefault(); saveMut.mutateAsync({ ...form, id: editRow?.id }) }} className="space-y-4">
            <Field label="Nome società *">
              <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                className={inp} placeholder="es. Oderzo Basket" required />
            </Field>
            <Field label="Piano">
              <select value={form.piano} onChange={e => setForm(f => ({ ...f, piano: e.target.value }))} className={inp}>
                <option value="free">Free</option>
                <option value="pro">⭐ Pro</option>
              </select>
            </Field>
            {saveMut.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                <p className="text-xs text-red-600">{saveMut.error?.message}</p>
              </div>
            )}
            <button type="submit" disabled={saveMut.isPending}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {saveMut.isPending ? 'Salvataggio...' : (editRow ? 'Salva modifiche' : 'Crea società')}
            </button>
          </form>
        </Modal>
      )}

      {approveRow && (
        <Modal title={`Approva — ${approveRow.nome}`} onClose={closeApprove}>
          <form onSubmit={handleApprove} className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              Account admin per: <strong>{approveRow.ref_email}</strong>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome">
                <input value={approveForm.nome}
                  onChange={e => setApproveForm(f => ({ ...f, nome: e.target.value }))}
                  className={inp} placeholder="Mario" />
              </Field>
              <Field label="Cognome">
                <input value={approveForm.cognome}
                  onChange={e => setApproveForm(f => ({ ...f, cognome: e.target.value }))}
                  className={inp} placeholder="Rossi" />
              </Field>
            </div>
            <Field label="Password iniziale *">
              <div className="flex gap-2">
                <input
                  type={showApprovePwd ? 'text' : 'password'}
                  value={approveForm.password}
                  onChange={e => setApproveForm(f => ({ ...f, password: e.target.value }))}
                  className={`${inp} flex-1`}
                  placeholder="Almeno 6 caratteri"
                  required minLength={6}
                />
                <button type="button" onClick={generateApprovePwd}
                  className="shrink-0 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">
                  Genera
                </button>
              </div>
              <button type="button" onClick={() => setShowApprovePwd(v => !v)}
                className="text-xs text-blue-500 mt-1">
                {showApprovePwd ? 'Nascondi' : 'Mostra'} password
              </button>
            </Field>
            {approveErr && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-600">
                {approveErr}
              </div>
            )}
            <button type="submit" disabled={!!approvingId}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {approvingId ? 'Approvazione...' : 'Approva e crea account'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Amministratori Tab ───────────────────────────────────────────────────────

function AmministratoriTab() {
  const qc = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm]     = useState({ email: '', nome: '', cognome: '', password: '', societa_id: '' })
  const [inviting, setInviting] = useState(false)
  const [inviteErr, setInviteErr] = useState(null)
  const [inviteOk,  setInviteOk]  = useState(false)
  const [showPwd,   setShowPwd]   = useState(false)
  const [copied,    setCopied]    = useState(false)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['platform-admins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, cognome, email, ruolo, attivo, societa_id')
        .in('ruolo', ['admin', 'super_admin'])
        .order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: societa = [] } = useQuery({
    queryKey: ['platform-societa'],
    queryFn: async () => {
      const { data } = await supabase.from('societa').select('id, nome').order('nome')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const deleteMut = useMutation({
    mutationFn: async (u) => {
      const { error } = await supabase.from('profiles').delete().eq('id', u.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-admins'] })
      qc.invalidateQueries({ queryKey: ['platform-all'] })
    },
  })

  const societaNome = useMemo(() => {
    const map = {}
    for (const s of societa) map[s.id] = s.nome
    return map
  }, [societa])

  function generatePwd() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let pwd = ''
    for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    setF('password', pwd)
    setShowPwd(true)
  }

  function copyPwd() {
    navigator.clipboard?.writeText(form.password).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function resetInvite() {
    setShowInvite(false)
    setInviteOk(false)
    setInviteErr(null)
    setForm({ email: '', nome: '', cognome: '', password: '', societa_id: '' })
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (!form.societa_id) { setInviteErr('Seleziona una società'); return }
    setInviting(true)
    setInviteErr(null)
    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            nome:       form.nome.trim(),
            cognome:    form.cognome.trim(),
            ruolo:      'admin',
            societa_id: form.societa_id,
          },
        },
      })
      if (error) throw error

      if (signUpData?.user?.id) {
        await supabase.from('profiles').upsert([{
          id:         signUpData.user.id,
          email:      form.email.trim(),
          nome:       form.nome.trim()    || null,
          cognome:    form.cognome.trim() || null,
          ruolo:      'admin',
          societa_id: form.societa_id,
          attivo:     true,
        }], { onConflict: 'id' })
      }

      setInviteOk(true)
      setTimeout(() => {
        resetInvite()
        qc.invalidateQueries({ queryKey: ['platform-admins'] })
        qc.invalidateQueries({ queryKey: ['platform-all'] })
      }, 2500)
    } catch (err) {
      setInviteErr(err.message)
    } finally {
      setInviting(false)
    }
  }

  if (isLoading) return <LoadingSpinner message="Caricamento amministratori..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{admins.length} amministratori</p>
        <button onClick={() => setShowInvite(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform">
          <Plus size={15} /> Invita Admin
        </button>
      </div>

      <div className="space-y-2">
        {admins.map(u => {
          const nome = [u.nome, u.cognome].filter(Boolean).join(' ') || u.email
          const soc  = societaNome[u.societa_id]
          return (
            <div key={u.id} className={`bg-white rounded-xl border border-gray-200 p-3 ${u.attivo === false ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900">{nome}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.ruolo === 'super_admin'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {u.ruolo === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{u.email}</p>
                  {soc && (
                    <p className="text-xs text-blue-500 font-medium mt-0.5">
                      <Building2 size={10} className="inline mr-0.5" />{soc}
                    </p>
                  )}
                </div>
                {u.ruolo !== 'super_admin' && (
                  <button
                    onClick={() => window.confirm(`Eliminare l'account di ${nome}?`) && deleteMut.mutate(u)}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg border border-red-100 shrink-0 transition-colors"
                    title="Elimina admin">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showInvite && (
        <Modal title="Invita nuovo Admin" onClose={resetInvite}>
          {inviteOk ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-green-600" />
              </div>
              <p className="font-semibold text-gray-800">Account creato!</p>
              <p className="text-xs text-gray-500 mt-1">Condividi le credenziali con l'amministratore della società.</p>
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome">
                  <input value={form.nome} onChange={e => setF('nome', e.target.value)}
                    className={inp} placeholder="Mario" />
                </Field>
                <Field label="Cognome">
                  <input value={form.cognome} onChange={e => setF('cognome', e.target.value)}
                    className={inp} placeholder="Rossi" />
                </Field>
              </div>
              <Field label="Email *">
                <input type="email" value={form.email} onChange={e => setF('email', e.target.value)}
                  className={inp} placeholder="admin@societa.com" required />
              </Field>
              <Field label="Società *">
                <select value={form.societa_id} onChange={e => setF('societa_id', e.target.value)}
                  className={inp} required>
                  <option value="">Scegli società...</option>
                  {societa.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </Field>
              <Field label="Password iniziale *">
                <div className="flex gap-2">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setF('password', e.target.value)}
                    className={`${inp} flex-1`}
                    placeholder="Almeno 6 caratteri"
                    required minLength={6}
                  />
                  <button type="button" onClick={generatePwd}
                    className="shrink-0 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors">
                    Genera
                  </button>
                  {form.password && (
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
              {inviteErr && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-600">{inviteErr}</p>
                </div>
              )}
              <button type="submit" disabled={inviting}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
                {inviting ? 'Creazione account...' : 'Crea account admin'}
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  )
}

// ─── Main PlatformPage ────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3  },
  { id: 'societa',   label: 'Società',   icon: Building2  },
  { id: 'admin',     label: 'Admin',     icon: Shield     },
]

export default function PlatformPage() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const { logout, displayName }   = useAuth()

  const { data: allData, isLoading } = useQuery({
    queryKey: ['platform-all'],
    queryFn: async () => {
      const [socRes, profRes] = await Promise.all([
        supabase.from('societa').select('*').order('nome'),
        supabase.from('profiles').select('id, societa_id, ruolo'),
      ])
      return {
        societa:  socRes.data  ?? [],
        profiles: profRes.data ?? [],
      }
    },
  })

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Globe size={20} className="text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">Piattaforma</h1>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{displayName}</p>
          </div>
          <button onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 active:scale-95 transition-all">
            <LogOut size={15} /> Esci
          </button>
        </div>
        <div className="flex border-t border-gray-100">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 pb-8">
        {isLoading ? (
          <LoadingSpinner message="Caricamento piattaforma..." />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab
                societa={allData?.societa ?? []}
                profiles={allData?.profiles ?? []}
              />
            )}
            {activeTab === 'societa' && <SocietaTab />}
            {activeTab === 'admin'   && <AmministratoriTab />}
          </>
        )}
      </div>
    </div>
  )
}
