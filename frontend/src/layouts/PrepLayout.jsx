import { Outlet, NavLink } from 'react-router-dom'
import { Home, AlertTriangle, Activity, Ruler, BookOpen, Building2, BarChart2 } from 'lucide-react'

const cls = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 px-1 py-1 rounded-xl min-w-[28px] ${
    isActive ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
  }`

export default function PrepLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-1">
          <NavLink to="/prep" end className={cls}>
            <Home size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Home</span>
          </NavLink>
          <NavLink to="/prep/infortuni" className={cls}>
            <AlertTriangle size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Infortuni</span>
          </NavLink>
          <NavLink to="/prep/test" className={cls}>
            <Activity size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Test</span>
          </NavLink>
          <NavLink to="/prep/antropometria" className={cls}>
            <Ruler size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Misure</span>
          </NavLink>
          <NavLink to="/prep/schede" className={cls}>
            <BookOpen size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Schede</span>
          </NavLink>
          <NavLink to="/prep/spazi" className={cls}>
            <Building2 size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Spazi</span>
          </NavLink>
          <NavLink to="/prep/carichi" className={cls}>
            <BarChart2 size={18} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">Carichi</span>
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
