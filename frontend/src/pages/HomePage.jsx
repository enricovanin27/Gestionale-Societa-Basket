import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import HomeAdmin from './home/HomeAdmin'
import HomeAllenatore from './home/HomeAllenatore'
import HomeGenitore from './home/HomeGenitore'

export { default as GenitoreHome } from './home/HomeGenitore'

export default function HomePage() {
  const { activeRole, allRuoli } = useAuth()

  // Routing basato sull'activeRole scelto dall'utente
  if (activeRole === 'admin' || activeRole === 'super_admin') return <HomeAdmin />
  if (activeRole === 'segreteria') return <Navigate to="/segreteria" replace />
  if (activeRole === 'allenatore') return <HomeAllenatore />
  if (activeRole === 'genitore' || activeRole === 'giocatore') return <HomeGenitore />

  // Fallback: se activeRole non è settato o non è riconosciuto, usa allRuoli
  if (allRuoli.includes('admin') || allRuoli.includes('super_admin')) return <HomeAdmin />
  if (allRuoli.includes('segreteria') && allRuoli.length === 1) return <Navigate to="/segreteria" replace />
  if (allRuoli.includes('allenatore')) return <HomeAllenatore />
  return <HomeGenitore />
}
