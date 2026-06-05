import { useState } from 'react'
import { UserPlus, UserCheck, ChevronRight, X } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import GiocatoreWizard from './GiocatoreWizard'
import InvitaUtenteForm from '../../components/InvitaUtenteForm'

const ACTIONS = [
  {
    id: 'giocatore',
    icon: UserPlus,
    title: 'Nuovo giocatore',
    desc: 'Aggiungi un atleta e invita il suo genitore',
  },
  {
    id: 'genitore',
    icon: UserCheck,
    title: 'Invita genitore',
    desc: 'Crea un account app per un genitore già registrato',
  },
]

export default function SegreteriaSetupPage() {
  const [openModal, setOpenModal] = useState(null) // 'giocatore' | 'genitore' | null

  return (
    <div>
      <PageHeader title="Registrazioni" subtitle="Aggiungi giocatori e genitori" />

      <div className="px-4 pt-4 space-y-3 pb-28">
        {ACTIONS.map(({ id, icon: Icon, title, desc }) => (
          <button
            key={id}
            onClick={() => setOpenModal(id)}
            className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-purple-600" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </button>
        ))}
      </div>

      {/* Modal Nuovo Giocatore */}
      {openModal === 'giocatore' && (
        <div className="fixed inset-0 bg-black/40 z-[200] overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 pt-8">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Nuovo giocatore</h2>
                <button onClick={() => setOpenModal(null)}>
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              <GiocatoreWizard
                onDone={() => setOpenModal(null)}
                onCancel={() => setOpenModal(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Invita Genitore */}
      {openModal === 'genitore' && (
        <div className="fixed inset-0 bg-black/40 z-[200] overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 pt-8">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Invita genitore</h2>
                <button onClick={() => setOpenModal(null)}>
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              <div className="px-5 pt-4 pb-5">
                <InvitaUtenteForm
                  ruoliConsentiti={['genitore']}
                  onSuccess={() => setOpenModal(null)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
