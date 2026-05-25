import { useNavigate } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import AppHeader from '../../components/AppHeader'

export default function ComunicazioniPage() {
  const { displayName, logout, societaNome } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <AppHeader
        title="Comunicazioni"
        subtitle="Messaggi e avvisi"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />
      <div className="px-4 pt-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
          <MessageCircle size={40} className="mx-auto text-blue-400 mb-3" />
          <p className="text-sm font-semibold text-gray-800 mb-1">Scrivi nella bacheca</p>
          <p className="text-xs text-gray-400 mb-4">
            Per comunicare con l'allenatore o la società, usa la bacheca condivisa.
          </p>
          <button
            onClick={() => navigate('/bacheca')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform"
          >
            📋 Vai alla bacheca
          </button>
        </div>
      </div>
    </div>
  )
}
