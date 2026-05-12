import { useState } from 'react'
import { Send, MessageCircle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { API_BASE } from '../../lib/constants'
import AppHeader from '../../components/AppHeader'

export default function ComunicazioniPage() {
  const { profile, societaId, displayName, logout, societaNome } = useAuth()
  const [testo,   setTesto]   = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState(null)

  const mySquadre = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)

  async function handleSend() {
    if (!testo.trim() || !mySquadre.length) return
    setSending(true)
    setError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await Promise.all(
        mySquadre.map(squadra =>
          fetch(`${API_BASE}/api/notifica/allenamento`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              squadra,
              societa_id: societaId,
              data:       today,
              titolo:     `Messaggio da ${displayName}`,
              corpo:      testo.trim(),
            }),
          })
        )
      )
      setSent(true)
      setTesto('')
    } catch {
      setError("Errore durante l'invio. Riprova.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <AppHeader
        title="Comunicazioni"
        subtitle="Scrivi al tuo allenatore"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />
      <div className="px-4 pt-6 space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle size={16} className="text-blue-600" />
            <p className="text-sm font-semibold text-gray-800">Invia un messaggio</p>
          </div>
          {mySquadre.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
              ⚠️ Nessuna squadra associata. Contatta l'amministratore.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">Destinatari: {mySquadre.join(', ')}</p>
              <textarea
                value={testo}
                onChange={e => { setTesto(e.target.value); setSent(false) }}
                placeholder="Scrivi il tuo messaggio all'allenatore..."
                rows={5}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
              {sent  && <p className="text-xs text-green-600 mt-1 font-medium">✓ Messaggio inviato!</p>}
              <button
                onClick={handleSend}
                disabled={!testo.trim() || sending}
                className="mt-3 w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
              >
                <Send size={14} /> {sending ? 'Invio...' : 'Invia messaggio'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
