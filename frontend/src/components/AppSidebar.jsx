import { NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { RoleSwitcherSidebar } from './RoleSwitcher'

const ACCENT = {
  amber:   'text-amber-600 bg-amber-50',
  purple:  'text-purple-600 bg-purple-50',
  blue:    'text-blue-600 bg-blue-50',
  emerald: 'text-emerald-600 bg-emerald-50',
}

export default function AppSidebar({ items, accentColor = 'amber' }) {
  const { societaNome, displayName, logout } = useAuth()
  const activeClass = ACCENT[accentColor]

  return (
    <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-56 bg-white border-r border-gray-200 z-50">
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">EVO</div>
        <div className="font-semibold text-gray-900 text-sm truncate">{societaNome}</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map(({ to, end, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? activeClass : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon size={18} strokeWidth={1.8} />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <RoleSwitcherSidebar />

      <div className="px-4 py-4 border-t border-gray-100">
        <div className="text-xs text-gray-500 truncate mb-2">{displayName}</div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogOut size={14} />
          Esci
        </button>
      </div>
    </aside>
  )
}
