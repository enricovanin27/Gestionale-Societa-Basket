import { useState, useMemo } from 'react'
import { format, subDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronLeft, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/ui/ToastProvider'
import { usePrintWindow } from '../../hooks/usePrintWindow'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import { PALETTE } from '../../lib/constants'

function getTeamColor(squadra, allSquadre) {
  const idx = allSquadre.indexOf(squadra)
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length]
}

function PercentualeBadge({ pct }) {
  if (pct === null) return <span className="text-xs text-gray-300 font-medium">—</span>
  const color =
    pct >= 75 ? 'bg-green-100 text-green-700' :
    pct >= 50 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${color}`}>
      {pct}%
    </span>
  )
}

// ─── Storico presenze per singolo giocatore ───────────────────────────────────
function GiocatoreStorico({ giocatore, fromDate, toDate, onBack }) {
  const { data: storia = [], isLoading } = useQuery({
    queryKey: ['storico-presenze', giocatore.id, fromDate, toDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('presenze_allenamento')
        .select('data, presente, squadra')
        .eq('giocatore_id', giocatore.id)
        .gte('data', fromDate)
        .lte('data', toDate)
        .order('data', { ascending: false })
      return data ?? []
    },
  })

  const totali   = storia.length
  const presenti = storia.filter(s => s.presente).length
  const pct      = totali > 0 ? Math.round(presenti * 100 / totali) : null

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100">
        <button onClick={onBack} className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-gray-800 text-sm">
          {giocatore.cognome} {giocatore.nome}
        </span>
      </div>

      {isLoading ? (
        <div className="pt-8"><LoadingSpinner /></div>
      ) : (
        <div className="px-4 pt-4 pb-20">
          {/* Riepilogo */}
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-4 mb-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-sm font-semibold text-gray-800">{totali} allenamenti registrati</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {presenti} presenti · {totali - presenti} assenti
              </p>
            </div>
            <PercentualeBadge pct={pct} />
          </div>

          {storia.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              Nessun dato nel periodo selezionato
            </p>
          ) : (
            <div className="space-y-2">
              {storia.map((s, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-sm text-gray-700 font-medium">
                      {format(new Date(s.data + 'T12:00:00'), 'EEE d MMM yyyy', { locale: it })}
                    </p>
                    {s.squadra && <p className="text-xs text-gray-400">{s.squadra}</p>}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    s.presente ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {s.presente ? '✅ Presente' : '❌ Assente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Dettaglio squadra con % per giocatore ────────────────────────────────────
function SquadraDetail({ squadra, allSquadre, fromDate, toDate, onBack, onSelectGiocatore }) {
  const { societaId, societaNome } = useAuth()
  const { toast } = useToast()
  const printWindow     = usePrintWindow()
  const [isPrinting, setIsPrinting] = useState(false)
  const col = getTeamColor(squadra, allSquadre)

  const { data: giocatoriPresenze = [], isLoading, error } = useQuery({
    queryKey: ['presenze-admin', squadra, societaId, fromDate, toDate],
    enabled: !!squadra && !!societaId,
    queryFn: async () => {
      const { data: giocatori, error: ge } = await supabase
        .from('giocatori')
        .select('id, nome, cognome')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .or(`squadra.eq.${squadra},squadra2.eq.${squadra},squadra3.eq.${squadra}`)
        .order('cognome').order('nome')
      if (ge) throw ge
      if (!giocatori.length) return []

      const { data: presenze, error: pe } = await supabase
        .from('presenze_allenamento')
        .select('giocatore_id, presente')
        .in('giocatore_id', giocatori.map(g => g.id))
        .gte('data', fromDate)
        .lte('data', toDate)
      if (pe) throw pe

      return giocatori.map(g => {
        const gp       = (presenze ?? []).filter(p => p.giocatore_id === g.id)
        const totali   = gp.length
        const presenti = gp.filter(p => p.presente).length
        return {
          ...g,
          totali,
          presenti,
          percentuale: totali > 0 ? Math.round(presenti * 100 / totali) : null,
        }
      })
    },
    staleTime: 2 * 60 * 1000,
  })

  const mediaSquadra = useMemo(() => {
    const conDati = giocatoriPresenze.filter(g => g.percentuale !== null)
    if (!conDati.length) return null
    return Math.round(conDati.reduce((s, g) => s + g.percentuale, 0) / conDati.length)
  }, [giocatoriPresenze])

  async function handlePrint() {
    setIsPrinting(true)
    try {
      const ids = giocatoriPresenze.map(g => g.id)
      if (!ids.length) return

      const { data: raw } = await supabase
        .from('presenze_allenamento')
        .select('giocatore_id, data, presente')
        .in('giocatore_id', ids)
        .gte('data', fromDate)
        .lte('data', toDate)
        .order('data')

      const presenze = raw ?? []
      const dates = [...new Set(presenze.map(p => p.data))].sort()
      if (!dates.length) {
        toast.info('Nessuna presenza registrata nel periodo selezionato.')
        return
      }

      const matrix = {}
      for (const p of presenze) {
        if (!matrix[p.giocatore_id]) matrix[p.giocatore_id] = {}
        matrix[p.giocatore_id][p.data] = p.presente
      }

      const fontSize = dates.length > 15 ? 'font-size:8px;' : ''

      const headerCols = dates.map(d =>
        '<th class="center" style="min-width:28px">' +
        new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) +
        '</th>'
      ).join('')

      const rows = giocatoriPresenze.map(g => {
        const presRow  = matrix[g.id] ?? {}
        const totali   = dates.filter(d => presRow[d] !== undefined).length
        const presenti = dates.filter(d => presRow[d] === true).length
        const pct      = totali > 0 ? Math.round(presenti * 100 / totali) : null
        const cells = dates.map(d => {
          if (presRow[d] === undefined) return '<td class="center" style="color:#ccc">—</td>'
          return presRow[d] ? '<td class="center ok">✓</td>' : '<td class="center ko">·</td>'
        }).join('')
        return '<tr>' +
          '<td><strong>' + g.cognome + '</strong> ' + g.nome + '</td>' +
          cells +
          '<td class="center">' + (totali > 0 ? presenti + '/' + totali : '—') + '</td>' +
          '<td class="center" style="font-weight:bold">' + (pct !== null ? pct + '%' : '—') + '</td>' +
          '</tr>'
      }).join('')

      printWindow(
        'Presenze — ' + squadra,
        '<p style="font-size:10px;color:#555;margin-bottom:8px">Periodo: <strong>' + fromDate + '</strong> → <strong>' + toDate + '</strong> · ' + giocatoriPresenze.length + ' giocatori · ' + dates.length + ' allenamenti registrati</p>' +
        '<div style="overflow-x:auto;' + fontSize + '">' +
        '<table>' +
        '<thead><tr><th style="min-width:120px">Giocatore</th>' + headerCols + '<th class="center">Tot.</th><th class="center">%</th></tr></thead>' +
        '<tbody>' + rows +
        '<tr style="background:#f9fafb;font-weight:bold"><td>Media squadra</td>' + dates.map(() => '<td></td>').join('') + '<td></td><td class="center">' + (mediaSquadra !== null ? mediaSquadra + '%' : '—') + '</td></tr>' +
        '</tbody></table></div>',
        societaNome ?? ''
      )
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <div>
      <div className={`flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-100 border-l-4 ${col.border}`}>
        <button onClick={onBack} className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-gray-800 text-sm flex-1">{squadra}</span>
        {mediaSquadra !== null && (
          <span className="text-xs text-gray-500 hidden sm:inline">
            Media: <strong className="text-gray-700">{mediaSquadra}%</strong>
          </span>
        )}
        <button
          onClick={handlePrint}
          disabled={isPrinting}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50 px-2 py-1 rounded-lg border border-gray-200"
        >
          <Printer size={13} />
          <span>{isPrinting ? '...' : 'Stampa'}</span>
        </button>
      </div>

      {isLoading && <div className="pt-8"><LoadingSpinner /></div>}
      {error && <p className="text-sm text-red-500 px-4 pt-4">{error.message}</p>}

      {!isLoading && !error && (
        <div className="px-4 pt-4 pb-4 space-y-2">
          {giocatoriPresenze.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">Nessun giocatore attivo in questa squadra</p>
          )}
          {giocatoriPresenze.map(g => (
            <button
              key={g.id}
              onClick={() => onSelectGiocatore(g)}
              className="w-full bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm active:scale-[0.99] transition-transform text-left"
            >
              <div>
                <p className="text-sm font-semibold text-gray-800">{g.cognome} {g.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {g.totali > 0
                    ? `${g.presenti} presenze su ${g.totali}`
                    : 'Nessun dato registrato'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <PercentualeBadge pct={g.percentuale} />
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PresenzeAdmin ────────────────────────────────────────────────────────────
export default function PresenzeAdmin() {
  const { displayName, logout, societaNome, societaId } = useAuth()
  const [selectedSquadra,   setSelectedSquadra]   = useState(null)
  const [selectedGiocatore, setSelectedGiocatore] = useState(null)
  const [datePreset,        setDatePreset]        = useState('90d')

  const { fromDate, toDate } = useMemo(() => {
    const today    = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    switch (datePreset) {
      case '30d':     return { fromDate: format(subDays(today, 30), 'yyyy-MM-dd'), toDate: todayStr }
      case 'stagione': {
        const year = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1
        return { fromDate: `${year}-09-01`, toDate: todayStr }
      }
      default: /* 90d */ return { fromDate: format(subDays(today, 90), 'yyyy-MM-dd'), toDate: todayStr }
    }
  }, [datePreset])

  const { data: squadre = [], isLoading } = useQuery({
    queryKey: ['squadre-nomi', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  const subtitle = selectedGiocatore
    ? `${selectedGiocatore.cognome} ${selectedGiocatore.nome}`
    : selectedSquadra ?? 'Seleziona una squadra'

  return (
    <div className="pb-20">
      <AppHeader
        title="Presenze"
        subtitle={subtitle}
        displayName={displayName}
        logout={logout}
        societaNome={societaNome}
      />

      {/* Filtro periodo — sempre visibile */}
      <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto">
        {[['30d', '30 giorni'], ['90d', '90 giorni'], ['stagione', 'Stagione']].map(([val, label]) => (
          <button key={val}
            onClick={() => setDatePreset(val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
              datePreset === val
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {selectedGiocatore ? (
        <GiocatoreStorico
          giocatore={selectedGiocatore}
          fromDate={fromDate}
          toDate={toDate}
          onBack={() => setSelectedGiocatore(null)}
        />
      ) : selectedSquadra ? (
        <SquadraDetail
          squadra={selectedSquadra}
          allSquadre={squadre}
          fromDate={fromDate}
          toDate={toDate}
          onBack={() => setSelectedSquadra(null)}
          onSelectGiocatore={setSelectedGiocatore}
        />
      ) : (
        <div className="px-4 pt-4 space-y-2">
          {isLoading && <div className="pt-8"><LoadingSpinner /></div>}
          {squadre.map((s) => {
            const col = getTeamColor(s, squadre)
            return (
              <button
                key={s}
                onClick={() => setSelectedSquadra(s)}
                className={`w-full bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 px-4 py-3.5 border-l-4 ${col.border} active:scale-[0.99] transition-transform text-left`}
              >
                <span className="flex-1 font-semibold text-sm text-gray-800">{s}</span>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            )
          })}
          {!isLoading && squadre.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">Nessuna squadra configurata</p>
          )}
        </div>
      )}
    </div>
  )
}
