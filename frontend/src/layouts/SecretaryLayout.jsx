import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Bell, Receipt, Settings, Shield, UserPlus, TrendingUp } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useUnreadAnnunci } from '../pages/BachecaPage'
import GuideDrawer from '../components/GuideDrawer'
import AppSidebar from '../components/AppSidebar'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl min-w-[44px] ${
    isActive ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function SecretaryLayout() {
  const { societaId } = useAuth()
  const { data: unread = 0 } = useUnreadAnnunci(societaId)
  const sidebarItems = [
    { to: '/secretary',              end: true, icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/secretary/giocatori',               icon: Users,           label: 'Giocatori' },
    { to: '/secretary/quote',                   icon: Receipt,         label: 'Quote Squadre' },
    { to: '/secretary/certificati',             icon: Shield,          label: 'Certificati' },
    { to: '/secretary/contabilita',             icon: TrendingUp,      label: 'Contabilità' },
    { to: '/secretary/bacheca',                 icon: Bell,            label: 'Bacheca', badge: unread },
    { to: '/secretary/impostazioni',            icon: Settings,        label: 'Impostazioni' },
    { to: '/secretary/setup',                   icon: UserPlus,        label: 'Setup' },
  ]
  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar items={sidebarItems} accentColor="purple" />
      <div className="pb-20 lg:pb-0 lg:pl-56"><Outlet /></div>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/secretary" end className={cls}>
            <LayoutDashboard size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Dashboard</span>
          </NavLink>
          <NavLink to="/secretary/giocatori" className={cls}>
            <Users size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Giocatori</span>
          </NavLink>
          <NavLink to="/secretary/quote" className={cls}>
            <Receipt size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Quote Sq.</span>
          </NavLink>
          <NavLink to="/secretary/certificati" className={cls}>
            <Shield size={22} strokeWidth={1.8} /><span className="text-xs font-medium">Certificati</span>
          </NavLink>
          <NavLink to="/secretary/contabilita" className={cls}>
            <TrendingUp size={22} strokeWidth={1.8} />
            <span className="text-xs font-medium">Contabilità</span>
          </NavLink>
        </div>
      </nav>
      <GuideDrawer />
    </div>
  )
}
