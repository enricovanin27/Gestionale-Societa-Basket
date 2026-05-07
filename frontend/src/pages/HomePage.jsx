import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import HomeAdmin from './home/HomeAdmin'
import HomeAllenatore from './home/HomeAllenatore'
import HomeGenitore from './home/HomeGenitore'

export { default as GenitoreHome } from './home/HomeGenitore'

export default function HomePage() {
  const { isAdmin, isAllenatore, role } = useAuth()

  if (isAdmin) return <HomeAdmin />
  if (role === 'segreteria') return <Navigate to="/segreteria" replace />
  if (isAllenatore) return <HomeAllenatore />
  return <HomeGenitore />
}
