import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Bell, ClipboardList } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'
import GuideDrawer from '../components/GuideDrawer'
import AppSidebar from '../components/AppSidebar'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl min-w-[48px] ${
    isActive ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function DirigentLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)

  const sidebarItems = [
    { to: '/dirigente',          end: true, icon: LayoutDashboard, label: 'Panoramica' },
    { to: '/dirigente/economico',            icon: ClipboardList,    label: 'Economico' },
    { to: '/dirigente/bacheca',              icon: Bell,             label: 'Bacheca', badge: unread },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar items={sidebarItems} accentColor="emerald" />
      <div className="pb-20 lg:pb-0 lg:pl-56"><Outlet /></div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/dirigente" end className={cls}>
            <LayoutDashboard size={22} strokeWidth={1.8} />
            <span className="text-xs font-medium">Panoramica</span>
          </NavLink>
          <NavLink to="/dirigente/economico" className={cls}>
            <ClipboardList size={22} strokeWidth={1.8} />
            <span className="text-xs font-medium">Economico</span>
          </NavLink>
          <NavLink to="/dirigente/bacheca" className={cls}>
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

      <GuideDrawer />
    </div>
  )
}
