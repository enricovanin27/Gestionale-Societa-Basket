import { Outlet, NavLink } from 'react-router-dom'
import { Trophy, Activity, Settings, LayoutDashboard, Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'
import GuideDrawer from '../components/GuideDrawer'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-1 py-1 rounded-xl min-w-[36px] ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function AdminLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-1">
          <NavLink to="/admin" end className={cls}>
            <LayoutDashboard size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Home</span>
          </NavLink>
          <NavLink to="/admin/partite" className={cls}>
            <Trophy size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Calendario</span>
          </NavLink>
          <NavLink to="/admin/presenze" className={cls}>
            <Activity size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Presenze</span>
          </NavLink>
          <NavLink to="/admin/bacheca" className={cls}>
            <div className="relative">
              <Bell size={20} strokeWidth={1.8} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">Bacheca</span>
          </NavLink>
          <NavLink to="/admin/setup" className={cls}>
            <Settings size={20} strokeWidth={1.8} /><span className="text-[10px] font-medium">Setup</span>
          </NavLink>
        </div>
      </nav>
      <GuideDrawer />
    </div>
  )
}
