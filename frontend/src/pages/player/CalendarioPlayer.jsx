import { useState, useMemo } from 'react'
import { format, addWeeks, startOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import GrigliaSettimanale from '../../components/GrigliaSettimanale'
import PageHeader from '../../components/PageHeader'

export default function CalendarioPlayer() {
  const { profile } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)

  const mySquadre = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)

  const weekStart = useMemo(
    () => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    [weekOffset]
  )

  const weekLabel = useMemo(
    () => format(weekStart, "'Settimana del' d MMMM yyyy", { locale: it }),
    [weekStart]
  )

  if (!mySquadre.length) {
    return (
      <div>
        <PageHeader title="Calendario" subtitle="Vista settimanale" />
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-700">&#9888;&#65039; Nessuna squadra associata al tuo profilo.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <PageHeader
        title="Calendario"
        subtitle={weekLabel}
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-xl active:scale-95 transition-transform"
            >
              <ChevronLeft size={18} className="text-white" />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-xs text-white font-medium active:scale-95 transition-transform"
            >
              Oggi
            </button>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-xl active:scale-95 transition-transform"
            >
              <ChevronRight size={18} className="text-white" />
            </button>
          </div>
        }
      />
      <div className="px-4 pt-2 pb-24 overflow-x-auto">
        <GrigliaSettimanale
          weekStart={weekStart}
          allSquadre={mySquadre}
          squadreFilter={mySquadre}
        />
      </div>
    </div>
  )
}
