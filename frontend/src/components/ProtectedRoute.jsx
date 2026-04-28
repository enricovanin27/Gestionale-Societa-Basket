import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children, requiredRole }) {
  const { user, loading, role } = useAuth()

  if (loading) return <LoadingSpinner message="Verifica accesso..." />

  if (!user) return <Navigate to="/login" replace />

  if (requiredRole && role !== requiredRole && role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return children
}
