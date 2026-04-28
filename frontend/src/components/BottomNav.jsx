import { NavLink } from 'react-router-dom'
import { Home, Calendar, Trophy, Settings, FileText } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/calendario', icon: Calendar, label: 'Calendario', staffOnly: true },
  { to: '/allenamenti', icon: Trophy, label: 'Allenamenti', staffOnly: true },
  { to: '/importa', icon: FileText, label: 'Import FIP', adminOnly: true },
  { to: '/setup', icon: Settings, label: 'Setup', adminOnly: true },
]

export default function BottomNav() {
  const { isAdmin, isAllenatore } = useAuth()
  const isStaff = isAdmin || isAllenatore
  const items = navItems.filter(item =>
    (!item.adminOnly || isAdmin) &&
    (!item.staffOnly || isStaff)
  )

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-inset-bottom">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-[56px] ${
                isActive
                  ? 'text-blue-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`
            }
          >
            <Icon size={22} strokeWidth={1.8} />
            <span className="text-xs font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
