/**
 * RoleSwitcher — mostra un selettore di ruolo per utenti con più ruoli.
 * Varianti:
 *   - sidebar: lista compatta per AppSidebar desktop
 *   - fab:     bottone floating per mobile (posizionato sopra la bottom nav)
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export const ROLE_PATH = {
  genitore:             '/parent',
  giocatore:            '/player',
  segreteria:           '/secretary',
  allenatore:           '/coach',
  preparatore_atletico: '/prep',
  admin:                '/admin',
  dirigente:            '/dirigente',
}

export const ROLE_ICON = {
  genitore:             '👨‍👩‍👧',
  giocatore:            '🏀',
  segreteria:           '📋',
  allenatore:           '🎽',
  preparatore_atletico: '⚡',
  admin:                '👑',
  dirigente:            '🏢',
}

export const ROLE_LABEL_SHORT = {
  genitore:             'Genitore',
  giocatore:            'Giocatore',
  segreteria:           'Segreteria',
  allenatore:           'Allenatore',
  preparatore_atletico: 'Preparatore',
  admin:                'Resp. Tecnico',
  dirigente:            'Dirigente',
}

/** Versione sidebar (solo desktop, dentro AppSidebar) */
export function RoleSwitcherSidebar() {
  const { allRuoli, activeRole, setActiveRole } = useAuth()
  const navigate = useNavigate()

  const visibili = allRuoli.filter(r => r !== 'super_admin')
  if (visibili.length <= 1) return null

  function handleSwitch(role) {
    setActiveRole(role)
    navigate(ROLE_PATH[role] ?? '/')
  }

  return (
    <div className="px-3 pt-3 pb-1 border-t border-gray-100 mt-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">Cambia ruolo</p>
      <div className="space-y-0.5">
        {visibili.map(r => (
          <button
            key={r}
            onClick={() => handleSwitch(r)}
            className={`w-full text-left flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg transition-colors ${
              r === activeRole
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <span>{ROLE_ICON[r] ?? '👤'}</span>
            <span className="flex-1">{ROLE_LABEL_SHORT[r] ?? r}</span>
            {r === activeRole && <span className="text-[9px] text-blue-500 font-bold">ATTIVO</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Versione FAB mobile — da aggiungere ad AppShell */
export function RoleSwitcherFAB() {
  const { allRuoli, activeRole, setActiveRole } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const visibili = allRuoli.filter(r => r !== 'super_admin')
  if (visibili.length <= 1) return null

  function handleSwitch(role) {
    setActiveRole(role)
    setOpen(false)
    navigate(ROLE_PATH[role] ?? '/')
  }

  return (
    <div className="lg:hidden fixed bottom-20 right-3 z-40">
      {open && (
        <>
          {/* Overlay chiudi */}
          <div className="fixed inset-0 z-[-1]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-12 right-0 bg-white border border-gray-200 rounded-2xl shadow-xl p-2 min-w-[160px]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">Cambia ruolo</p>
            {visibili.map(r => (
              <button
                key={r}
                onClick={() => handleSwitch(r)}
                className={`w-full text-left flex items-center gap-2 text-sm px-2 py-2 rounded-xl transition-colors ${
                  r === activeRole
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{ROLE_ICON[r] ?? '👤'}</span>
                <span className="flex-1">{ROLE_LABEL_SHORT[r] ?? r}</span>
                {r === activeRole && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        title="Cambia ruolo"
        className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 ${
          open ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500'
        }`}
      >
        <ArrowLeftRight size={16} />
      </button>
    </div>
  )
}
