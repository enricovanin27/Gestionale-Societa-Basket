import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, endOfMonth } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { usePrintWindow } from '../../hooks/usePrintWindow'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const METODO_LABEL = { contanti: 'Contanti', bonifico: 'Bonifico', pos: 'POS / Carta' }

export default function ResocontoPage() {
  const { societaId, displayName, logout, societaNome } = useAuth()
  const printWindow = usePrintWindow()

  const today = new Date()
  const [anno, setAnno] = useState(today.getFullYear())
  const [mese, setMese] = useState(today.getMonth() + 1) // 1–12

  const meseStart = `${anno}-${String(mese).padStart(2, '0')}-01`
  const meseEnd   = format(endOfMonth(new Date(anno, mese - 1, 1)), 'yyyy-MM-dd')

  const { data: pagamenti = [], isLoading } = useQuery({
    queryKey: ['resoconto-pagamenti', societaId, anno, mese],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select(`
          id, tipo, descrizione, importo, data_pagamento, metodo_pagamento, numero_ricevuta,
          giocatore_id,
          giocatori!inner(nome, cognome, squadra)
        `)
        .eq('societa_id', societaId)
        .eq('pagato', true)
        .gte('data_pagamento', meseStart)
        .lte('data_pagamento', meseEnd)
        .order('data_pagamento')
        .order('numero_ricevuta', { ascending: true, nullsFirst: false })
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })

  const totale = useMemo(
    () => pagamenti.reduce((s, p) => s + (p.importo ?? 0), 0),
    [pagamenti]
  )

  function prevMese() {
    if (mese === 1) { setMese(12); setAnno(a => a - 1) }
    else setMese(m => m - 1)
  }
  function nextMese() {
    if (mese === 12) { setMese(1); setAnno(a => a + 1) }
    else setMese(m => m + 1)
  }

  const meseLabel  = format(new Date(anno, mese - 1, 1), 'MMMM yyyy', { locale: it })
  const isFuture   = new Date(anno, mese - 1, 1) > today

  function printAll() {
    const rows = pagamenti.map(p => {
      const g      = p.giocatori
      const numRic = p.numero_ricevuta
        ? `${anno}-${String(p.numero_ricevuta).padStart(4, '0')}`
        : '—'
      return (
        '<tr>' +
        '<td>' + numRic + '</td>' +
        '<td>' + (g ? g.cognome + ' ' + g.nome : '—') + '</td>' +
        '<td>' + (g?.squadra ?? '—') + '</td>' +
        '<td>' + (p.descrizione ?? p.tipo ?? '—') + '</td>' +
        '<td>' + (METODO_LABEL[p.metodo_pagamento] ?? '—') + '</td>' +
        '<td>' + (p.data_pagamento ? format(parseISO(p.data_pagamento), 'd/MM/yyyy') : '—') + '</td>' +
        '<td class="right">€ ' + (p.importo ?? 0).toFixed(2) + '</td>' +
        '</tr>'
      )
    }).join('')
    printWindow(
      'Resoconto Pagamenti — ' + meseLabel,
      '<table>' +
      '<thead><tr>' +
      '<th>Ricevuta</th><th>Giocatore</th><th>Squadra</th>' +
      '<th>Descrizione</th><th>Metodo</th><th>Data</th><th>Importo</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '<p class="summary">Totale incassato: € ' + totale.toFixed(2) +
      ' — ' + pagamenti.length + ' pagamenti</p>',
      societaNome ?? ''
    )
  }

  return (
    <div>
      <AppHeader
        title="Resoconto"
        subtitle="Pagamenti per periodo"
        displayName={displayName} logout={logout} societaNome={societaNome}
      />

      <div className="px-4 pt-4 space-y-4">

        {/* ── Selettore mese ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
          <button onClick={prevMese}
            className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-transform">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <div className="text-center">
            <p className="text-sm font-bold text-gray-900 capitalize">{meseLabel}</p>
            <p className="text-xs text-gray-400">
              {isLoading ? '…' : `${pagamenti.length} pagamenti`}
            </p>
          </div>
          <button onClick={nextMese} disabled={isFuture}
            className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-transform disabled:opacity-30">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>

        {isLoading ? (
          <div className="pt-4"><LoadingSpinner /></div>
        ) : pagamenti.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12 capitalize">
            Nessun pagamento registrato in {meseLabel}
          </p>
        ) : (
          <>
            {/* ── Totale + stampa tutto ───────────────────────────────────── */}
            <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
              <div>
                <p className="text-xs text-purple-500 font-medium uppercase tracking-wider">
                  Totale incassato
                </p>
                <p className="text-2xl font-extrabold text-purple-700">
                  € {totale.toFixed(2)}
                </p>
              </div>
              <button onClick={printAll}
                className="flex items-center gap-2 bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-semibold active:scale-95 transition-transform">
                <Printer size={14} /> Stampa tutto
              </button>
            </div>

            {/* ── Lista pagamenti ─────────────────────────────────────────── */}
            <div className="space-y-2 pb-4">
              {pagamenti.map(p => {
                const g      = p.giocatori
                const numRic = p.numero_ricevuta
                  ? `${anno}-${String(p.numero_ricevuta).padStart(4, '0')}`
                  : null
                const dataPag = p.data_pagamento
                  ? format(parseISO(p.data_pagamento), 'd MMM', { locale: it })
                  : '—'

                return (
                  <div key={p.id}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {g ? `${g.cognome} ${g.nome}` : 'Sconosciuto'}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {p.descrizione ?? p.tipo}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-gray-400">{dataPag}</span>
                        {g?.squadra && (
                          <span className="text-[11px] text-gray-400">· {g.squadra}</span>
                        )}
                        {p.metodo_pagamento && (
                          <span className="text-[11px] text-gray-400">
                            · {METODO_LABEL[p.metodo_pagamento] ?? p.metodo_pagamento}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">
                        € {(p.importo ?? 0).toFixed(2)}
                      </p>
                      {numRic && (
                        <button
                          onClick={() => {
                            const url = `/secretary/ricevuta/${p.id}`
                            const win = window.open(url, '_blank')
                            if (!win) window.location.href = url
                          }}
                          className="flex items-center gap-0.5 text-[10px] text-purple-500 hover:text-purple-700 mt-0.5 ml-auto">
                          <Printer size={10} /> {numRic}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
