import { AlertCircle } from 'lucide-react'

export function ErrorBox({ error }) {
  return (
    <div className="p-6 text-center">
      <AlertCircle size={32} className="text-red-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600">Errore nel caricamento</p>
      <p className="text-xs text-gray-400 mt-1">{error?.message}</p>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="p-8 text-center">
      {Icon && <Icon size={40} className="text-gray-300 mx-auto mb-3" />}
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  )
}

export function SectionHeader({ title, count }) {
  return (
    <div className="flex items-center justify-between px-4 mb-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      {count != null && <span className="text-xs text-gray-400">{count}</span>}
    </div>
  )
}
