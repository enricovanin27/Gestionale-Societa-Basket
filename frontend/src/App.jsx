import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useAuth'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import BottomNav from './components/BottomNav'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import CalendarioPage from './pages/CalendarioPage'
import AllenamentiPage from './pages/AllenamentiPage'
import SetupPage from './pages/SetupPage'
import ImportaCalendarioPage from './pages/ImportaCalendarioPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

function AppShell() {
  const { user } = useAuth()
  const location = useLocation()
  const showNav = user && location.pathname !== '/login'

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto relative">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendario"
          element={
            <ProtectedRoute>
              <CalendarioPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/allenamenti"
          element={
            <ProtectedRoute>
              <AllenamentiPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/setup"
          element={
            <ProtectedRoute requiredRole="admin">
              <SetupPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/importa"
          element={
            <ProtectedRoute requiredRole="admin">
              <ImportaCalendarioPage />
            </ProtectedRoute>
          }
        />
      </Routes>
      {showNav && <BottomNav />}
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
