import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useAuth'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRedirect from './components/RoleRedirect'
import ErrorBoundary from './components/ErrorBoundary'
import ParentLayout from './layouts/ParentLayout'
import PlayerLayout from './layouts/PlayerLayout'
import SecretaryLayout from './layouts/SecretaryLayout'
import CoachLayout from './layouts/CoachLayout'
import AdminLayout from './layouts/AdminLayout'
import LoginPage from './pages/LoginPage'
import LoadingSpinner from './components/LoadingSpinner'
import CalendarioPage from './pages/CalendarioPage'
import AllenamentiPage from './pages/AllenamentiPage'
import SetupPage from './pages/SetupPage'
import ImportaCalendarioPage from './pages/ImportaCalendarioPage'
import PlatformPage from './pages/PlatformPage'
import BachecaPage from './pages/BachecaPage'
import AttivitaPage from './pages/coach/AttivitaPage'
import SegreteriaDashboard from './pages/secretary/SegreteriaDashboard'
import GiocatoriPage   from './pages/secretary/GiocatoriPage'
import GiocatoreDetail from './pages/secretary/GiocatoreDetail'
import QuotePage       from './pages/secretary/QuotePage'
import ImpostazioniSocieta  from './pages/secretary/ImpostazioniSocieta'
import RicevutaPage         from './pages/secretary/RicevutaPage'
import Attestazione730Page  from './pages/secretary/Attestazione730Page'
import ResocontoPage        from './pages/secretary/ResocontoPage'
import DirigentLayout      from './layouts/DirigentLayout'
import HomeDirigente       from './pages/dirigente/HomeDirigente'
import HomeGenitore from './pages/home/HomeGenitore'
import HomeGiocatore from './pages/player/HomeGiocatore'
import ComunicazioniPage from './pages/player/ComunicazioniPage'
import CalendarioPlayer from './pages/player/CalendarioPlayer'
import CalendarioGenitore from './pages/parent/CalendarioGenitore'
import QuoteGenitore from './pages/parent/QuoteGenitore'
import HomeAllenatore from './pages/home/HomeAllenatore'
import HomeAdmin from './pages/home/HomeAdmin'
import AdminPersone from './pages/admin/AdminPersone'
import SetupMenu from './pages/admin/SetupMenu'
import PresenzeAdmin from './pages/admin/PresenzeAdmin'
import PrepLayout from './layouts/PrepLayout'
import AgendaPrep from './pages/prep/AgendaPrep'
import StatoPage from './pages/prep/StatoPage'
import SchedeAtletichePage from './pages/prep/SchedeAtletichePage'
import AtleticaCoach from './pages/coach/AtleticaCoach'
import LandingPage       from './pages/LandingPage'
import RegistrazionePage from './pages/RegistrazionePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

// â"€â"€â"€ Pagina di reset password (dopo click sul link nell'email) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
            <span className="text-3xl">ðŸ€</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Imposta nuova password</h1>
          <p className="text-sm text-gray-500 mt-1">Gestionale Basket</p>
        </div>
        {ok ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">âœ…</div>
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

// â"€â"€â"€ Shell principale â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function AppShell() {
  const { user, loading, isSuperAdmin, isPasswordRecovery, clearPasswordRecovery } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <LoadingSpinner />
    </div>
  )
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
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto lg:max-w-none relative">
      <Routes>
        <Route path="/login"      element={<LoginPage />} />
        <Route path="/registrati" element={<RegistrazionePage />} />

        {/* Root → landing se non autenticato, redirect ruolo se autenticato */}
        <Route path="/"
          element={user
            ? <ProtectedRoute><RoleRedirect /></ProtectedRoute>
            : <LandingPage />}
        />

        {/* â"€â"€ Genitore â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <Route path="/parent" element={<ProtectedRoute requiredRole="genitore"><ParentLayout /></ProtectedRoute>}>
          <Route index                element={<HomeGenitore />} />
          <Route path="calendario"    element={<CalendarioGenitore />} />
          <Route path="comunicazioni" element={<ComunicazioniPage />} />
          <Route path="bacheca"       element={<BachecaPage />} />
          <Route path="quote"         element={<QuoteGenitore />} />
        </Route>

        {/* â"€â"€ Giocatore â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <Route path="/player" element={<ProtectedRoute requiredRole="giocatore"><PlayerLayout /></ProtectedRoute>}>
          <Route index                  element={<HomeGiocatore />} />
          <Route path="comunicazioni"   element={<ComunicazioniPage />} />
          <Route path="calendario"      element={<CalendarioPlayer />} />
          <Route path="bacheca"         element={<BachecaPage />} />
          <Route path="statistiche"     element={<Navigate to="/player/comunicazioni" replace />} />
        </Route>

        {/* â"€â"€ Segreteria â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <Route path="/secretary" element={<ProtectedRoute requiredRole="segreteria"><SecretaryLayout /></ProtectedRoute>}>
          <Route index                  element={<SegreteriaDashboard />} />
          <Route path="giocatori"       element={<GiocatoriPage />} />
          <Route path="giocatori/:id"   element={<GiocatoreDetail />} />
          <Route path="bacheca"         element={<BachecaPage />} />
          <Route path="quote"           element={<QuotePage />} />
          <Route path="resoconto"       element={<ResocontoPage />} />
          <Route path="impostazioni"    element={<ImpostazioniSocieta />} />
        </Route>

        {/* ── Dirigente ──────────────────────────────────────────────────── */}
        <Route path="/dirigente" element={<ProtectedRoute requiredRole="dirigente"><DirigentLayout /></ProtectedRoute>}>
          <Route index                  element={<HomeDirigente />} />
          <Route path="economico"       element={<ResocontoPage />} />
          <Route path="bacheca"         element={<BachecaPage />} />
        </Route>

        {/* Print pages — segreteria, no layout */}
        <Route path="/secretary/ricevuta/:quoteId"
          element={<ProtectedRoute requiredRole="segreteria"><RicevutaPage /></ProtectedRoute>} />
        <Route path="/secretary/attestazione730/:giocId"
          element={<ProtectedRoute requiredRole="segreteria"><Attestazione730Page /></ProtectedRoute>} />

        {/* â"€â"€ Allenatore â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <Route path="/coach" element={<ProtectedRoute requiredRole="allenatore"><CoachLayout /></ProtectedRoute>}>
          <Route index         element={<HomeAllenatore />} />
          <Route path="calendario"  element={<CalendarioPage />} />
          <Route path="attivita"    element={<AttivitaPage />} />
          <Route path="bacheca"     element={<BachecaPage />} />
          <Route path="importa"     element={<ImportaCalendarioPage />} />
        </Route>

        {/* â"€â"€ Admin â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
          <Route index          element={<HomeAdmin />} />
          <Route path="partite"     element={<CalendarioPage />} />
          <Route path="allenamenti" element={<AllenamentiPage />} />
          <Route path="presenze"    element={<PresenzeAdmin />} />
          <Route path="bacheca"     element={<BachecaPage />} />
          <Route path="setup"       element={<SetupMenu />} />
          <Route path="setup/:tab"  element={<SetupPage />} />
          <Route path="persone"     element={<AdminPersone />} />
        </Route>

        {/* -- Preparatore Atletico -------------------------------- */}
        <Route path="/prep" element={<ProtectedRoute requiredRole="preparatore_atletico"><PrepLayout /></ProtectedRoute>}>
          <Route index          element={<AgendaPrep />} />
          <Route path="stato"   element={<StatoPage />} />
          <Route path="schede"  element={<SchedeAtletichePage />} />
        </Route>

        {/* -- Tab Atletica allenatore ----------------------------- */}
        <Route path="/coach/atletica" element={<ProtectedRoute requiredRole="allenatore"><AtleticaCoach /></ProtectedRoute>} />

        {/* ── Legacy redirects ─────────────────────────────────── */}
        <Route path="/bacheca"    element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
        <Route path="/calendario" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
        <Route path="/allenamenti" element={<Navigate to="/admin/allenamenti" replace />} />
        <Route path="/segreteria"  element={<Navigate to="/secretary" replace />} />
        <Route path="/setup"       element={<Navigate to="/admin/setup" replace />} />
        <Route path="/statistiche" element={<Navigate to="/coach/attivita" replace />} />
        <Route path="/coach/presenze"    element={<Navigate to="/coach/attivita" replace />} />
        <Route path="/coach/statistiche" element={<Navigate to="/coach/attivita" replace />} />
        <Route path="/importa"     element={<Navigate to="/coach/importa" replace />} />
        <Route path="/platform"    element={<Navigate to="/" replace />} />
        <Route path="*"            element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ErrorBoundary>
              <AppShell />
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

