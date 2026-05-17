// frontend/src/components/GuideDrawer.jsx
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { X, HelpCircle } from 'lucide-react'
import guideData from '../data/guide.json'

function normalizePath(pathname) {
  // Rimuove segmenti numerici finali per route dinamiche
  // es. /secretary/giocatori/123 → /secretary/giocatori
  return pathname.replace(/\/\d+$/, '')
}

export default function GuideDrawer() {
  const [open, setOpen]   = useState(false)
  const location          = useLocation()
  const path              = normalizePath(location.pathname)
  const guide             = guideData[path] ?? null

  return (
    <>
      {/* Bottone ? fisso */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-4 w-11 h-11 rounded-full text-white shadow-lg
          flex items-center justify-center z-[200] active:scale-95 transition-transform"
        style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}
        aria-label="Apri guida"
      >
        <HelpCircle size={20} strokeWidth={2.2} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[190]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`fixed left-0 right-0 bottom-0 z-[200] bg-white rounded-t-2xl
          border-t-2 border-amber-500 shadow-2xl transition-transform duration-300
          max-w-lg mx-auto ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '70vh' }}
      >
        {/* Maniglia */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-base text-stone-800">
            {guide ? `📖 ${guide.titolo}` : '📖 Guida'}
          </h3>
          <button onClick={() => setOpen(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Contenuto scrollabile */}
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: 'calc(70vh - 100px)' }}>
          {guide ? (
            <div className="space-y-5">
              {guide.sezioni.map((s, i) => (
                <div key={i}>
                  <h4 className="text-sm font-bold text-amber-700 mb-1.5">{s.titolo}</h4>
                  <p className="text-sm text-stone-600 leading-relaxed">{s.testo}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">🤷</p>
              <p className="text-sm text-stone-400">Nessuna guida disponibile per questa pagina.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
