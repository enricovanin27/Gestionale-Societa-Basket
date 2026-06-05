export function TabBtn({ label, icon: Icon, active, onClick, variant = 'default', color = 'blue' }) {
  const colors = {
    blue:    active ? 'border-blue-600 text-blue-600'    : 'border-transparent text-gray-500',
    purple:  active ? 'border-purple-600 text-purple-600': 'border-transparent text-gray-500',
    amber:   active ? 'border-amber-600 text-amber-600'  : 'border-transparent text-gray-500',
    emerald: active ? 'border-emerald-600 text-emerald-600': 'border-transparent text-gray-500',
  }
  const colorClass = variant === 'light'
    ? (active ? 'border-white text-white' : 'border-transparent text-amber-200 hover:text-amber-100')
    : (colors[color] ?? colors.blue)

  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors border-b-2 ${colorClass}`}
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
