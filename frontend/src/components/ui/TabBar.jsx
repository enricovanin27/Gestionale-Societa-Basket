export function TabBtn({ label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors border-b-2 ${
        active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

export function TabBar({ children }) {
  return (
    <div className="flex border-b border-gray-100 bg-white">
      {children}
    </div>
  )
}
