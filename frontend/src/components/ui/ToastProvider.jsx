/**
 * ToastProvider — sistema unificato di notifiche e conferme.
 *
 * Sostituisce tutti i window.confirm() e alert() dell'app.
 *
 * Uso:
 *   const { toast, confirm } = useToast()
 *
 *   toast.success('Salvato!')
 *   toast.error('Errore durante il salvataggio.')
 *   toast.info('Testo copiato.')
 *
 *   confirm('Eliminare questa spesa?', () => handleDelete(id))
 *   confirm('Eliminare?', () => del(), { confirmLabel: 'Elimina', danger: true })
 */

import { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

const ToastCtx = createContext(null)

// ── Singola notifica toast ────────────────────────────────────────────────────

const TOAST_CONFIG = {
  success: { Icon: CheckCircle2, bg: 'bg-green-600' },
  error:   { Icon: AlertCircle,  bg: 'bg-red-600'   },
  info:    { Icon: Info,         bg: 'bg-gray-800'   },
}

function ToastItem({ t, onDismiss }) {
  const { Icon, bg } = TOAST_CONFIG[t.type] ?? TOAST_CONFIG.info
  return (
    <div className={`
      flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl
      text-white text-sm font-medium
      min-w-[240px] max-w-[320px]
      ${bg}
    `}>
      <Icon size={17} className="mt-0.5 shrink-0 opacity-90" />
      <span className="flex-1 leading-snug">{t.message}</span>
      <button
        onClick={() => onDismiss(t.id)}
        className="opacity-60 hover:opacity-100 shrink-0 -mr-1"
      >
        <X size={15} />
      </button>
    </div>
  )
}

// ── Modale di conferma ────────────────────────────────────────────────────────

function ConfirmDialog({ state, onResolve }) {
  if (!state) return null
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 animate-fade-in">
        <p className="text-sm font-medium text-gray-800 text-center leading-relaxed mb-5">
          {state.message}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onResolve(false)}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium active:scale-95 transition-transform"
          >
            Annulla
          </button>
          <button
            onClick={() => onResolve(true)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white active:scale-95 transition-transform ${
              state.danger !== false ? 'bg-red-600' : 'bg-blue-600'
            }`}
          >
            {state.confirmLabel ?? 'Conferma'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }) {
  const [toasts,       setToasts]       = useState([])
  const [confirmState, setConfirmState] = useState(null)

  const addToast = useCallback((type, message) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const dismissToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  /**
   * confirm(message, onConfirm, options?)
   * options: { confirmLabel?: string, danger?: boolean }
   *
   * Mostra una modale di conferma. Chiama onConfirm() se l'utente clicca
   * il tasto di conferma. Non richiede await — usa callback.
   */
  const confirm = useCallback((message, onConfirm, options = {}) => {
    setConfirmState({
      message,
      onConfirm,
      confirmLabel: options.confirmLabel,
      danger: options.danger ?? true,
    })
  }, [])

  function handleResolve(confirmed) {
    if (confirmed && confirmState?.onConfirm) confirmState.onConfirm()
    setConfirmState(null)
  }

  const toast = {
    success: (msg) => addToast('success', msg),
    error:   (msg) => addToast('error',   msg),
    info:    (msg) => addToast('info',    msg),
  }

  return (
    <ToastCtx.Provider value={{ toast, confirm }}>
      {children}

      {/* Stack notifiche — in alto al centro, sopra tutto */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem t={t} onDismiss={dismissToast} />
          </div>
        ))}
      </div>

      {/* Modale conferma */}
      <ConfirmDialog state={confirmState} onResolve={handleResolve} />
    </ToastCtx.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast deve essere usato dentro <ToastProvider>')
  return ctx
}
