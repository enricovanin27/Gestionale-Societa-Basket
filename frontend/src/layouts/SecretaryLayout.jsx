import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, CreditCard, Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl min-w-[56px] ${
    isActive ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function SecretaryLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/secretary" end className={cls}>
            <LayoutDashboard size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Dashboard</span>
          </NavLink>
          <NavLink to="/secretary/giocatori" className={cls}>
            <Users size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Giocatori</span>
          </NavLink>
          <NavLink to="/secretary/quote" className={cls}>
            <CreditCard size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Quote</span>
          </NavLink>
          <NavLink to="/secretary/bacheca" className={cls}>
            <div className="relative">
              <Bell size={22} strokeWidth={1.8} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Bacheca</span>
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
