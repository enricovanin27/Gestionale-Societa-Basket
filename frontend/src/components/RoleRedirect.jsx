import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

const ROLE_PATH = {
  genitore:   '/parent',
  giocatore:  '/player',
  segreteria: '/secretary',
  allenatore: '/coach',
  preparatore_atletico: '/prep',
  admin:      '/admin',
  dirigente:  '/dirigente',
  super_admin: '/platform',
}

export default function RoleRedirect() {
  const { user, activeRole, loading } = useAuth()
  if (loading) return <LoadingSpinner message="Caricamento..." />
  if (!user) return <Navigate to="/login" replace />

  const path = ROLE_PATH[activeRole]
  if (!path) {
    // Profile loaded but role is unrecognized or missing — show error, don't loop to /login
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">🏀</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Profilo non configurato</h2>
          <p className="text-sm text-gray-500 mb-4">
            Il tuo account non ha ancora un ruolo assegnato. Contatta l'amministratore.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-amber-600 underline"
          >
            Riprova
          </button>
        </div>
      </div>
    )
  }

  return <Navigate to={path} replace />
}
