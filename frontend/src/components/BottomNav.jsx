import { NavLink } from 'react-router-dom'
import { Home, Calendar, Trophy, Settings, FileText, Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/calendario', icon: Calendar, label: 'Calendario',                       superAdminHidden: true },
  { to: '/allenamenti', icon: Trophy, label: 'Allenamenti', staffOnly: true,     superAdminHidden: true },
  { to: '/bacheca', icon: Bell, label: 'Bacheca', superAdminHidden: true },
  { to: '/importa', icon: FileText, label: 'Import FIP', staffOnly: true,        superAdminHidden: true },
  { to: '/setup', icon: Settings, label: 'Setup', adminOnly: true },
]

export default function BottomNav() {
  const { isAdmin, isAllenatore, isSuperAdmin, societaId } = useAuth()
  const isStaff = isAdmin || isAllenatore
  const items = navItems.filter(item =>
    (!item.adminOnly || isAdmin) &&
    (!item.staffOnly || isStaff) &&
    (!item.superAdminHidden || !isSuperAdmin)
  )
  const { data: unreadCount = 0 } = useUnreadAnnunci(societaId)

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
            <div className="relative">
              <Icon size={22} strokeWidth={1.8} />
              {to === '/bacheca' && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
