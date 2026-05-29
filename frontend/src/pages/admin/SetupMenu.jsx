import { useNavigate } from 'react-router-dom'
import { Users, Dumbbell, UserCheck, Building2, GitFork, ChevronRight, CalendarDays, Activity } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import { useAuth } from '../../hooks/useAuth'

const SECTIONS = [
  {
    group: '👥 Persone',
    items: [
      { icon: Dumbbell,     label: 'Allenatori',        desc: 'Profili e assegnazione',       tab: 'allenatori' },
      { icon: UserCheck,    label: 'Utenti & Accessi',  desc: 'Inviti, ruoli, password',      tab: 'utenti'     },
    ],
  },
  {
    group: '🏢 Struttura societaria',
    items: [
      { icon: Users,        label: 'Squadre',           desc: 'Categorie e nomi squadre',     tab: 'squadre' },
      { icon: Building2,    label: 'Palestre',           desc: 'Sedi e orari',                 tab: 'palestre' },
    ],
  },
  {
    group: '🛠 Strumenti',
    items: [
      { icon: GitFork,      label: 'Doppio Campionato', desc: 'Squadre con giocatori comuni',  tab: 'squadre_allenatori' },
      { icon: CalendarDays, label: 'Settimana Tipo',    desc: 'Template orario settimanale',   tab: 'settimana_tipo' },
      { icon: Activity,     label: 'Preparatori',       desc: 'Assegna preparatori alle squadre', tab: 'preparatori' },
    ],
  },
]

export default function SetupMenu() {
  const { displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()

  return (
    <div>
      <AppHeader
        title="Setup"
        subtitle={societaNome ?? 'Configurazione società'}
        displayName={displayName} logout={logout} societaNome={societaNome}
      />
      <div className="px-4 pt-4 space-y-4 pb-4">
        {SECTIONS.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">{group}</p>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              {items.map(({ icon: Icon, label, desc, tab }, i) => (
                <button
                  key={tab}
                  onClick={() => navigate(`/admin/setup/${tab}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors ${
                    i < items.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-amber-600" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
