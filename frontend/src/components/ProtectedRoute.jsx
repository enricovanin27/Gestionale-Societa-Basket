import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children, requiredRole }) {
  const { user, loading, allRuoli } = useAuth()

  if (loading) return <LoadingSpinner message="Verifica accesso..." />

  if (!user) return <Navigate to="/login" replace />

  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    const hasAccess = roles.some(r => allRuoli.includes(r)) ||
      allRuoli.includes('admin') || allRuoli.includes('super_admin')
    if (!hasAccess) return <Navigate to="/" replace />
  }

  return children
}
