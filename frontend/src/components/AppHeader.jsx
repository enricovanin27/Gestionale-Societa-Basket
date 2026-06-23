import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CambiaPasswordButton from './CambiaPasswordButton'
import { useAuth } from '../hooks/useAuth'

const ROLE_LABEL = {
  admin:                'Resp. Tecnico',
  super_admin:          'Super Admin',
  allenatore:           'Allenatore',
  segreteria:           'Segreteria',
  genitore:             'Genitore',
  giocatore:            'Giocatore',
  dirigente:            'Dirigente',
  preparatore_atletico: 'Preparatore',
}

const ROLE_PATH = {
  genitore:    '/parent',
  giocatore:   '/player',
  segreteria:  '/secretary',
  allenatore:  '/coach',
  admin:       '/admin',
  super_admin: '/platform',
}

export default function AppHeader({ title, subtitle, displayName, logout, societaNome, children }) {
  const { allRuoli, activeRole, setActiveRole } = useAuth()
  const navigate = useNavigate()
  const multiRole = allRuoli.length > 1

  function handleRoleSwitch(r) {
    setActiveRole(r)
    const path = ROLE_PATH[r]
    if (path) navigate(path)
  }

  return (
    <div className="bg-gradient-to-r from-amber-800 to-amber-600 text-white px-4 pt-10 pb-5 sticky top-0 z-[110]">
      {/* Identity row: society name left, user controls right */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">🏀</span>
          <span className="text-sm font-semibold text-amber-100 truncate">
            {societaNome ?? 'Gestionale Basket'}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs text-amber-200 max-w-[110px] truncate">{displayName}</span>
          <div className="flex items-center gap-3">
            <CambiaPasswordButton />
            <button
              onClick={logout}
              className="flex items-center gap-1 text-xs text-amber-300 hover:text-white"
            >
              <LogOut size={13} /> Esci
            </button>
          </div>
        </div>
      </div>

      {/* Page title — centered */}
      {title && (
        <div className="text-center py-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-amber-200 text-sm mt-0.5 capitalize">{subtitle}</p>
          )}
        </div>
      )}

      {/* Role switcher — visible only with multiple roles */}
      {multiRole && (
        <div className="flex gap-1.5 mt-3 flex-wrap justify-center">
          {allRuoli.map(r => (
            <button
              key={r}
              onClick={() => handleRoleSwitch(r)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                activeRole === r
                  ? 'bg-white text-amber-800 shadow-sm'
                  : 'bg-amber-700/50 text-amber-200 hover:bg-amber-700/70'
              }`}
            >
              {ROLE_LABEL[r] ?? r}
            </button>
          ))}
        </div>
      )}

      {children}
    </div>
  )
}
