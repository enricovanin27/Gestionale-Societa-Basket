import { Outlet, NavLink } from 'react-router-dom'
import { Calendar, Activity, BookOpen } from 'lucide-react'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function PrepLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-4">
          <NavLink to="/prep" end className={cls}>
            <Calendar size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Agenda</span>
          </NavLink>
          <NavLink to="/prep/stato" className={cls}>
            <Activity size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Stato</span>
          </NavLink>
          <NavLink to="/prep/schede" className={cls}>
            <BookOpen size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Schede</span>
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
