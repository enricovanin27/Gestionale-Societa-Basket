import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const ROLE_PATH = {
  genitore:   '/parent',
  giocatore:  '/player',
  segreteria: '/secretary',
  allenatore: '/coach',
  admin:      '/admin',
  super_admin: '/platform',
}

export default function RoleRedirect() {
  const { user, activeRole } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={ROLE_PATH[activeRole] ?? '/login'} replace />
}
