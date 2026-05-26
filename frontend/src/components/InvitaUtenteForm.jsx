import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, CheckCircle2 } from 'lucide-react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const RUOLO_LABELS = {
  admin:       'Amministratore',
  allenatore:  'Allenatore',
  segreteria:  'Segreteria',
  genitore:    'Genitore',
  giocatore:   'Giocatore',
  preparatore: 'Preparatore atletico',
}

const EMPTY_FORM = {
  email: '', nome: '', cognome: '', ruolo: '',
  squadra: '', squadra2: '', squadra3: '',
  genitore_squadra: '', genitore_squadra2: '', genitore_squadra3: '',
  giocatoreId: '', societa_id: '',
}

export default function InvitaUtenteForm({ ruoliConsentiti, onSuccess }) {
  const { societaId, isSuperAdmin } = useAuth()
  const qc = useQueryClient()
  const [form, setForm]       = useState({ ...EMPTY_FORM, ruolo: ruoliConsentiti[0] ?? '' })
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState(null)
  const [ok, setOk]           = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: squadre = [] } = useQuery({
    queryKey: ['squadre-nomi-invita', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('squadre').select('categoria')
        .eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: giocatori = [] } = useQuery({
    queryKey: ['giocatori-link', societaId],
    enabled: !!societaId && (form.ruolo === 'genitore' || form.ruolo === 'giocatore'),
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, user_id, genitore_user_id')
        .eq('societa_id', societaId).eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
  const giocatoriGenitore  = giocatori.filter(g => !g.genitore_user_id)
  const giocatoriGiocatore = giocatori.filter(g => !g.user_id)

  const { data: societaList = [] } = useQuery({
    queryKey: ['societa-list'],
    enabled: isSuperAdmin && form.ruolo === 'admin',
    queryFn: async () => {
      const { data } = await supabase.from('societa').select('id, nome').order('nome')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email.trim() || !form.ruolo) return
    setLoading(true)
    setErr(null)
    try {
      if (!supabaseAdmin) throw new Error('Service role key non configurata (VITE_SUPABASE_SERVICE_ROLE_KEY)')

      const targetSocietaId = (isSuperAdmin && form.ruolo === 'admin' && form.societa_id)
        ? form.societa_id : societaId
      if (!targetSocietaId) throw new Error('Nessuna società associata al tuo account.')

      const { data: invData, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        form.email.trim(),
        {
          data: {
            ruolo:      form.ruolo,
            nome:       form.nome.trim()    || null,
            cognome:    form.cognome.trim() || null,
            societa_id: targetSocietaId,
          },
          redirectTo: window.location.origin + '/login',
        }
      )
      if (invErr) throw invErr
      const newUserId = invData.user?.id
      if (!newUserId) throw new Error('Utente invitato ma ID non ricevuto')

      const profileData = {
        id: newUserId, email: form.email.trim(),
        nome: form.nome.trim() || null, cognome: form.cognome.trim() || null,
        ruolo: form.ruolo, societa_id: targetSocietaId, attivo: true,
      }
      if (form.ruolo === 'genitore') {
        profileData.genitore_squadra  = form.genitore_squadra  || null
        profileData.genitore_squadra2 = form.genitore_squadra2 || null
        profileData.genitore_squadra3 = form.genitore_squadra3 || null
      }
      if (form.ruolo === 'giocatore') {
        profileData.squadra  = form.squadra  || null
        profileData.squadra2 = form.squadra2 || null
        profileData.squadra3 = form.squadra3 || null
      }
      const { error: profErr } = await supabase
        .from('profiles').upsert([profileData], { onConflict: 'id' })
      if (profErr) throw profErr

      if (form.ruolo === 'giocatore' && form.giocatoreId) {
        const { error: gErr } = await supabase.from('giocatori').update({ user_id: newUserId }).eq('id', form.giocatoreId)
        if (gErr) console.warn('Collegamento giocatore fallito:', gErr.message)
        qc.invalidateQueries({ queryKey: ['giocatori-link', societaId] })
      }
      if (form.ruolo === 'genitore' && form.giocatoreId) {
        const { error: genErr } = await supabase.from('giocatori').update({ genitore_user_id: newUserId }).eq('id', form.giocatoreId)
        if (genErr) console.warn('Collegamento genitore fallito:', genErr.message)
        qc.invalidateQueries({ queryKey: ['giocatori-link', societaId] })
      }
      if (form.ruolo === 'allenatore') {
        await supabase.from('allenatori').upsert([{
          nome: form.nome.trim(), cognome: form.cognome.trim(),
          email: form.email.trim(), squadre_capo: '', squadre_vice: '',
          societa_id: targetSocietaId,
        }], { onConflict: 'email' })
      }

      qc.invalidateQueries({ queryKey: ['setup-utenti'] })
      setOk(true)
      setTimeout(() => {
        setOk(false)
        setForm({ ...EMPTY_FORM, ruolo: ruoliConsentiti[0] ?? '' })
        onSuccess?.()
      }, 3500)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'
  const sel = inp + ' bg-white'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Email *</label>
        <input type="email" required className={inp}
          value={form.email} onChange={e => set('email', e.target.value)}
          placeholder="mario.rossi@esempio.com" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Nome</label>
          <input className={inp} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Mario" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Cognome</label>
          <input className={inp} value={form.cognome} onChange={e => set('cognome', e.target.value)} placeholder="Rossi" />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Ruolo</label>
        <select className={sel} value={form.ruolo} onChange={e => set('ruolo', e.target.value)}>
          {ruoliConsentiti.map(r => (
            <option key={r} value={r}>{RUOLO_LABELS[r] ?? r}</option>
          ))}
        </select>
      </div>

      {isSuperAdmin && form.ruolo === 'admin' && (
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Società</label>
          <select className={sel} value={form.societa_id} onChange={e => set('societa_id', e.target.value)}>
            <option value="">— usa la mia società —</option>
            {societaList.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
      )}

      {form.ruolo === 'giocatore' && (<>
        {[['squadra','Squadra *'],['squadra2','Squadra 2 (opz.)'],['squadra3','Squadra 3 (opz.)']].map(([k, label]) => (
          <div key={k}>
            <label className="text-xs text-gray-400 mb-1 block">{label}</label>
            <select className={sel} value={form[k]} onChange={e => set(k, e.target.value)}>
              <option value="">— nessuna —</option>
              {squadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Collega a giocatore esistente (opz.)</label>
          <select className={sel} value={form.giocatoreId} onChange={e => set('giocatoreId', e.target.value)}>
            <option value="">— non collegare —</option>
            {giocatoriGiocatore.map(g => (
              <option key={g.id} value={g.id}>{g.cognome} {g.nome} ({g.squadra})</option>
            ))}
          </select>
        </div>
      </>)}

      {form.ruolo === 'genitore' && (<>
        {[['genitore_squadra','Squadra figlio *'],['genitore_squadra2','Squadra figlio 2 (opz.)'],['genitore_squadra3','Squadra figlio 3 (opz.)']].map(([k, label]) => (
          <div key={k}>
            <label className="text-xs text-gray-400 mb-1 block">{label}</label>
            <select className={sel} value={form[k]} onChange={e => set(k, e.target.value)}>
              <option value="">— nessuna —</option>
              {squadre.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Collega a giocatore figlio (opz.)</label>
          <select className={sel} value={form.giocatoreId} onChange={e => set('giocatoreId', e.target.value)}>
            <option value="">— non collegare —</option>
            {giocatoriGenitore.map(g => (
              <option key={g.id} value={g.id}>{g.cognome} {g.nome} ({g.squadra})</option>
            ))}
          </select>
        </div>
      </>)}

      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

      <button type="submit"
        disabled={loading || !form.email.trim() || !form.ruolo}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60 active:scale-95 transition-transform">
        {ok
          ? <><CheckCircle2 size={16} /> Email inviata!</>
          : loading ? 'Invio in corso...'
          : <><UserPlus size={16} /> Invia invito</>}
      </button>

      {ok && (
        <p className="text-xs text-green-600 text-center bg-green-50 rounded-lg px-3 py-2">
          ✅ Email di invito inviata a <strong>{form.email}</strong>.<br />
          L'utente riceverà un link per impostare la propria password.
        </p>
      )}
    </form>
  )
}
