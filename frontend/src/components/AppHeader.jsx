import { LogOut } from 'lucide-react'
import CambiaPasswordButton from './CambiaPasswordButton'

export default function AppHeader({ title, subtitle, displayName, logout, societaNome, children }) {
  return (
    <div className="bg-gradient-to-r from-amber-800 to-amber-600 text-white px-4 pt-10 pb-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🏀</span>
            <span className="font-bold text-lg">{societaNome ?? 'Gestionale Basket'}</span>
          </div>
          {title && (
            <p className="text-amber-100 text-base font-semibold mt-1">{title}</p>
          )}
          {subtitle && (
            <p className="text-amber-200 text-sm capitalize mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xs text-amber-200 text-right max-w-[120px] truncate">{displayName}</span>
          <div className="flex items-center gap-3">
            <CambiaPasswordButton />
            <button onClick={logout} className="flex items-center gap-1 text-xs text-amber-300 hover:text-white">
              <LogOut size={13} /> Esci
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
