export default function PageHeader({ title, subtitle, actions, children }) {
  if (!title) return null
  return (
    <div className="bg-gradient-to-r from-amber-800 to-amber-600 text-white sticky top-0 z-30 shadow-sm">
      <div className="relative flex items-center justify-center px-4 pt-10 pb-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-amber-200 text-sm mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="absolute right-4 inset-y-0 flex items-center">
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
