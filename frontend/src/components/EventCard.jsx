import { formatTime } from '../lib/utils'
import { MapPin, Users, AlertCircle } from 'lucide-react'

const TIPO_STYLE = {
  Partita: 'bg-green-100 text-green-800 border-green-200',
  Allenamento: 'bg-blue-100 text-blue-800 border-blue-200',
  default: 'bg-gray-100 text-gray-800 border-gray-200',
}

const STATO_STYLE = {
  provvisoria: 'border-l-yellow-500',
  definitiva:  'border-l-green-500',
}

export default function EventCard({ event, type = 'allenamento' }) {
  const isPartita = type === 'partita'
  const borderColor = isPartita
    ? (STATO_STYLE[event.stato] ?? 'border-l-green-500')
    : event.annullato
    ? 'border-l-red-400'
    : 'border-l-blue-500'

  const tipoLabel = isPartita ? 'Partita' : 'Allenamento'
  const badgeStyle = TIPO_STYLE[tipoLabel] ?? TIPO_STYLE.default

  return (
    <div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${borderColor} p-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900 truncate">
              {isPartita ? `${event.squadra} vs ${event.avversario || '—'}` : event.squadra}
            </span>
            {event.annullato && (
              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full shrink-0">
                Annullato
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
            {(event.ora_inizio || event.ora_fine) && (
              <span className="font-medium text-gray-700">
                {formatTime(event.ora_inizio)} – {formatTime(event.ora_fine)}
              </span>
            )}
            {event.palestra && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {event.palestra}
              </span>
            )}
            {event.allenatori && (
              <span className="flex items-center gap-1">
                <Users size={11} />
                {event.allenatori}
              </span>
            )}
            {isPartita && event.casa_fuori && (
              <span className={`px-1.5 py-0.5 rounded-full ${event.casa_fuori === 'Casa' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                {event.casa_fuori}
              </span>
            )}
          </div>
        </div>

        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${badgeStyle}`}>
          {tipoLabel}
        </span>
      </div>

      {isPartita && event.stato === 'provvisoria' && (
        <div className="mt-2 flex items-center gap-1 text-xs text-yellow-700">
          <AlertCircle size={12} />
          <span>Partita provvisoria — da confermare</span>
        </div>
      )}
    </div>
  )
}
