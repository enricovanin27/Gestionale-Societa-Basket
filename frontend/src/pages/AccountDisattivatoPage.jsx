export default function AccountDisattivatoPage({ onDone }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🚫</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Account disattivato</h1>
        <p className="text-sm text-gray-500 mb-6">
          Il tuo accesso è stato disattivato dalla società. Se pensi sia un errore, contatta la segreteria o il responsabile.
        </p>
        <button
          onClick={onDone}
          className="w-full py-3 bg-amber-500 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform"
        >
          Torna al login
        </button>
      </div>
    </div>
  )
}
