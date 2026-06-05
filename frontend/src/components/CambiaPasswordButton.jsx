import { useState } from 'react'
import { Lock, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function CambiaPasswordButton() {
  const [open,    setOpen]    = useState(false)
  const [form,    setForm]    = useState({ nuova: '', conferma: '' })
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState(null)
  const [ok,      setOk]      = useState(false)

  function reset() { setOpen(false); setOk(false); setErr(null); setForm({ nuova: '', conferma: '' }) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.nuova !== form.conferma) { setErr('Le password non coincidono'); return }
    setLoading(true); setErr(null)
    const { error } = await supabase.auth.updateUser({ password: form.nuova })
    setLoading(false)
    if (error) { setErr(error.message); return }
    setOk(true)
    setTimeout(reset, 2000)
  }

  const inp = 'w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500'

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-amber-200 hover:text-white">
        <Lock size={12} /> Password
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={reset}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-t-2xl w-full max-w-lg p-6 pb-10 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Cambia password</h2>
              <button onClick={reset} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            {ok ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-2">✅</div>
                <p className="font-semibold text-gray-800">Password aggiornata!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Nuova password</label>
                  <input type="password" value={form.nuova}
                    onChange={e => setForm(f => ({ ...f, nuova: e.target.value }))}
                    className={inp} placeholder="Minimo 6 caratteri" required minLength={6} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Conferma password</label>
                  <input type="password" value={form.conferma}
                    onChange={e => setForm(f => ({ ...f, conferma: e.target.value }))}
                    className={inp} placeholder="Ripeti la password" required />
                </div>
                {err && <p className="text-xs text-red-500">{err}</p>}
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
                  {loading ? 'Aggiornamento...' : 'Aggiorna password'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
