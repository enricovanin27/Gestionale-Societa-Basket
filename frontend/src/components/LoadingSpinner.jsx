export default function LoadingSpinner({ message = 'Caricamento...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-400">
      <div className="w-8 h-8 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      <span className="text-sm">{message}</span>
    </div>
  )
}
