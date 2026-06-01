import { Outlet, NavLink } from 'react-router-dom'
import { Home, Calendar, CalendarDays, BookOpen, MessageSquare } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useUnreadMessaggi } from '../pages/coach/MessaggiRicevutiPage'
import AppSidebar from '../components/AppSidebar'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function PrepLayout() {
  const { societaId, profile } = useAuth()

  const { data: prepSquadre = [] } = useQuery({
    queryKey: ['prep-squadre-mie', societaId, profile?.id],
    enabled: !!societaId && !!profile?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_squadre').select('squadra')
        .eq('societa_id', societaId)
        .eq('preparatore_id', profile.id)
      return (data ?? []).map(r => r.squadra)
    },
  })

  const { data: unreadMsg = 0 } = useUnreadMessaggi(societaId, prepSquadre)

  const SIDEBAR_ITEMS = [
    { to: '/prep',           end: true, icon: Home,          label: 'Home' },
    { to: '/prep/agenda',               icon: Calendar,       label: 'Agenda' },
    { to: '/prep/calendario',           icon: CalendarDays,   label: 'Calendario' },
    { to: '/prep/schede',               icon: BookOpen,       label: 'Schede' },
    { to: '/prep/messaggi',             icon: MessageSquare,  label: 'Messaggi', badge: unreadMsg },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar items={SIDEBAR_ITEMS} accentColor="amber" />
      <div className="pb-20 lg:pb-0 lg:pl-56"><Outlet /></div>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
          <NavLink to="/prep" end className={cls}>
            <Home size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Home</span>
          </NavLink>
          <NavLink to="/prep/agenda" className={cls}>
            <Calendar size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Agenda</span>
          </NavLink>
          <NavLink to="/prep/calendario" className={cls}>
            <CalendarDays size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Calendario</span>
          </NavLink>
          <NavLink to="/prep/schede" className={cls}>
            <BookOpen size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Schede</span>
          </NavLink>
          <NavLink to="/prep/messaggi" className={cls}>
            <div className="relative">
              <MessageSquare size={20} strokeWidth={1.8} />
              {unreadMsg > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {unreadMsg > 9 ? '9+' : unreadMsg}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">Messaggi</span>
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
