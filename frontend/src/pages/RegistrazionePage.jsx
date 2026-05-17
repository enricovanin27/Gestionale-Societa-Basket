// frontend/src/pages/RegistrazionePage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const GRADIENT = { background: 'linear-gradient(160deg, #c2410c 0%, #d97706 50%, #f59e0b 100%)' }

function toSlug(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

const inp = 'w-full bg-white border-[1.5px] border-amber-200 rounded-xl px-3.5 py-3 text-sm ' +
  'text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500'

export default function RegistrazionePage() {
  const navigate  = useNavigate()
  const [form, setForm] = useState({
    nome: '', ref_nome: '', ref_cognome: '', ref_email: '', ref_citta: '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [done,    setDone]    = useState(false)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.from('societa').insert([{
      nome:        form.nome.trim(),
      slug:        toSlug(form.nome),
      piano:       'free',
      stato:       'pending',
      ref_nome:    form.ref_nome.trim(),
      ref_cognome: form.ref_cognome.trim(),
      ref_email:   form.ref_email.trim().toLowerCase(),
      ref_citta:   form.ref_citta.trim() || null,
    }])
    setLoading(false)
    if (err) { setError(err.message); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={GRADIENT}>
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-black text-stone-900 mb-3">Richiesta inviata!</h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-6">
            Il nostro team attiverà il tuo account entro 24 ore.<br />
            Ti contatteremo all'indirizzo{' '}
            <strong className="text-amber-700">{form.ref_email}</strong>.
          </p>
          <button onClick={() => navigate('/')}
            className="w-full py-3.5 text-white rounded-xl font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
            Torna alla home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={GRADIENT}>
      {/* Navbar minimale */}
      <nav className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg">🏀</div>
          <span className="font-black text-xl text-white tracking-tight">EVO</span>
        </button>
        <button onClick={() => navigate('/')} className="text-white/70 text-sm font-medium">
          ← Torna alla home
        </button>
      </nav>

      <div className="px-6 pb-12">
        <h1 className="text-2xl font-black text-white mb-1">Registra la tua società</h1>
        <p className="text-sm text-white/75 mb-6">Compila il modulo per richiedere l'attivazione.</p>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Nome società *</label>
              <input value={form.nome} onChange={e => setF('nome', e.target.value)}
                className={inp} placeholder="es. Oderzo Basket" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Nome *</label>
                <input value={form.ref_nome} onChange={e => setF('ref_nome', e.target.value)}
                  className={inp} placeholder="Mario" required />
              </div>
              <div>
                <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Cognome *</label>
                <input value={form.ref_cognome} onChange={e => setF('ref_cognome', e.target.value)}
                  className={inp} placeholder="Rossi" required />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Email *</label>
              <input type="email" value={form.ref_email} onChange={e => setF('ref_email', e.target.value)}
                className={inp} placeholder="mario.rossi@societa.it" required />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Città</label>
              <input value={form.ref_citta} onChange={e => setF('ref_citta', e.target.value)}
                className={inp} placeholder="es. Oderzo (facoltativo)" />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-4 text-white rounded-xl text-[15px] font-extrabold shadow-md
                disabled:opacity-60 active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
              {loading ? 'Invio in corso...' : 'Invia richiesta →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
