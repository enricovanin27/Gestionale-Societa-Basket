import { X } from 'lucide-react'

export const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg p-5 pb-10 max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between ${subtitle ? 'mb-1' : 'mb-4'}`}>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        {subtitle && <p className="text-sm text-blue-600 font-medium mb-4">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}
