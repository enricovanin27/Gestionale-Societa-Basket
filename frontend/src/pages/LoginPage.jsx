import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { user, login } = useAuth()
  const [mode, setMode]         = useState('login') // 'login' | 'forgot'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetOk,    setResetOk]    = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message ?? 'Errore di accesso. Controlla email e password.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setResetOk(true)
  }

  const inp = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-800 to-amber-600 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">🏀</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Gestionale Basket</h1>
          <p className="text-sm text-gray-500 mt-1">Accedi alla tua società</p>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nome@email.it" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" className={inp} />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-amber-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-amber-700 active:bg-amber-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
            <button type="button"
              onClick={() => { setMode('forgot'); setError(''); setResetOk(false) }}
              className="w-full text-sm text-amber-600 hover:text-amber-800 text-center pt-1">
              Password dimenticata?
            </button>
          </form>
        )}

        {mode === 'forgot' && !resetOk && (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-gray-600">
              Inserisci la tua email. Ti invieremo un link per reimpostare la password.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" required value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                placeholder="nome@email.it" className={inp} />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-amber-600 text-white py-2.5 rounded-lg font-medium text-sm disabled:opacity-60">
              {loading ? 'Invio in corso...' : 'Invia link di reset'}
            </button>
            <button type="button"
              onClick={() => { setMode('login'); setError('') }}
              className="w-full text-sm text-amber-600 hover:text-amber-800 text-center">
              Torna al login
            </button>
          </form>
        )}

        {mode === 'forgot' && resetOk && (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">📧</div>
            <p className="font-semibold text-gray-800">Email inviata!</p>
            <p className="text-sm text-gray-500">
              Controlla la tua casella di posta e clicca il link per reimpostare la password.
            </p>
            <button type="button"
              onClick={() => { setMode('login'); setResetOk(false) }}
              className="w-full mt-2 text-sm text-amber-600 hover:text-amber-800">
              Torna al login
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
