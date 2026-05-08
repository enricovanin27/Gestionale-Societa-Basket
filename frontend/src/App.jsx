import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useAuth'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRedirect from './components/RoleRedirect'
import ParentLayout from './layouts/ParentLayout'
import PlayerLayout from './layouts/PlayerLayout'
import SecretaryLayout from './layouts/SecretaryLayout'
import CoachLayout from './layouts/CoachLayout'
import AdminLayout from './layouts/AdminLayout'
import LoginPage from './pages/LoginPage'
import CalendarioPage from './pages/CalendarioPage'
import AllenamentiPage from './pages/AllenamentiPage'
import SetupPage from './pages/SetupPage'
import ImportaCalendarioPage from './pages/ImportaCalendarioPage'
import PlatformPage from './pages/PlatformPage'
import BachecaPage from './pages/BachecaPage'
import StatistichePage from './pages/StatistichePage'
import SegreteriePage from './pages/SegreteriePage'
import HomeGenitore from './pages/home/HomeGenitore'
import HomeAllenatore from './pages/home/HomeAllenatore'
import HomeAdmin from './pages/home/HomeAdmin'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

// ─── Pagina di reset password (dopo click sul link nell'email) ────────────────

function NuovaPasswordPage({ onDone }) {
  const [form, setForm] = useState({ nuova: '', conferma: '' })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.nuova !== form.conferma) { setErr('Le password non coincidono'); return }
    setLoading(true)
    setErr(null)
    const { error } = await supabase.auth.updateUser({ password: form.nuova })
    setLoading(false)
    if (error) { setErr(error.message); return }
    setOk(true)
    setTimeout(onDone, 2000)
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">🏀</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Imposta nuova password</h1>
          <p className="text-sm text-gray-500 mt-1">Gestionale Basket</p>
        </div>
        {ok ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-gray-800">Password aggiornata!</p>
            <p className="text-xs text-gray-500 mt-1">Reindirizzamento...</p>
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
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
              {loading ? 'Aggiornamento...' : 'Salva password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Shell principale ─────────────────────────────────────────────────────────

function AppShell() {
  const { user, loading, isSuperAdmin, isPasswordRecovery, clearPasswordRecovery } = useAuth()

  if (loading) return null
  if (isPasswordRecovery) return <NuovaPasswordPage onDone={clearPasswordRecovery} />

  if (user && isSuperAdmin) {
    return (
      <Routes>
        <Route path="/login"    element={<Navigate to="/platform" replace />} />
        <Route path="/platform" element={<PlatformPage />} />
        <Route path="*"         element={<Navigate to="/platform" replace />} />
      </Routes>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto relative">
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Root → redirect al namespace del ruolo attivo */}
        <Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

        {/* ── Genitore ─────────────────────────────────── */}
        <Route path="/parent" element={<ProtectedRoute requiredRole="genitore"><ParentLayout /></ProtectedRoute>}>
          <Route index element={<HomeGenitore />} />
          <Route path="bacheca" element={<BachecaPage />} />
          {/* /parent/quote aggiunto in Fase 1 */}
        </Route>

        {/* ── Giocatore ────────────────────────────────── */}
        <Route path="/player" element={<ProtectedRoute requiredRole="giocatore"><PlayerLayout /></ProtectedRoute>}>
          <Route index element={<HomeGenitore />} /> {/* sostituito in Fase 2 */}
          <Route path="bacheca" element={<BachecaPage />} />
          {/* /player/statistiche aggiunto in Fase 2 */}
        </Route>

        {/* ── Segreteria ───────────────────────────────── */}
        <Route path="/secretary" element={<ProtectedRoute requiredRole="segreteria"><SecretaryLayout /></ProtectedRoute>}>
          <Route index element={<SegreteriePage />} /> {/* sostituito in Fase 3 */}
          <Route path="giocatori" element={<SegreteriePage initialTab="giocatori" />} />
          <Route path="quote"     element={<SegreteriePage initialTab="quote" />} />
          <Route path="bacheca"   element={<BachecaPage />} />
        </Route>

        {/* ── Allenatore ───────────────────────────────── */}
        <Route path="/coach" element={<ProtectedRoute requiredRole="allenatore"><CoachLayout /></ProtectedRoute>}>
          <Route index         element={<HomeAllenatore />} />
          <Route path="calendario"  element={<CalendarioPage />} />
          <Route path="statistiche" element={<StatistichePage />} />
          <Route path="bacheca"     element={<BachecaPage />} />
          {/* /coach/presenze aggiunto in Fase 4 */}
        </Route>

        {/* ── Admin ────────────────────────────────────── */}
        <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
          <Route index          element={<HomeAdmin />} />
          <Route path="partite"     element={<CalendarioPage />} />
          <Route path="allenamenti" element={<AllenamentiPage />} />
          <Route path="bacheca"     element={<BachecaPage />} />
          <Route path="setup"       element={<SetupPage />} />
          {/* /admin/persone aggiunto in Fase 5 */}
        </Route>

        {/* ── Legacy redirects ─────────────────────────── */}
        <Route path="/bacheca"    element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
        <Route path="/calendario" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
        <Route path="/allenamenti" element={<Navigate to="/admin/allenamenti" replace />} />
        <Route path="/segreteria"  element={<Navigate to="/secretary" replace />} />
        <Route path="/setup"       element={<Navigate to="/admin/setup" replace />} />
        <Route path="/statistiche" element={<Navigate to="/coach/statistiche" replace />} />
        <Route path="/importa"     element={<ProtectedRoute requiredRole="allenatore"><ImportaCalendarioPage /></ProtectedRoute>} />
        <Route path="/platform"    element={<Navigate to="/" replace />} />
        <Route path="*"            element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
