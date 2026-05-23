import { useState } from 'react'
import { format } from 'date-fns'
import { X, Printer } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

const METODI = [
  { id: 'contanti', label: 'Contanti',    icon: '💵' },
  { id: 'bonifico', label: 'Bonifico',    icon: '🏦' },
  { id: 'pos',      label: 'POS / Carta', icon: '💳' },
]

export default function PagamentoModal({ quota, giocatore, societaId, onClose }) {
  const qc = useQueryClient()
  const [metodo, setMetodo]             = useState('contanti')
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [completedQuoteId, setCompletedQuoteId] = useState(null)

  const confirmMut = useMutation({
    mutationFn: async () => {
      // Genera numero_ricevuta progressivo per anno
      const anno = new Date(dataPagamento).getFullYear()
      const { data: maxRow } = await supabase
        .from('quote')
        .select('numero_ricevuta')
        .eq('societa_id', societaId)
        .not('numero_ricevuta', 'is', null)
        .gte('data_pagamento', `${anno}-01-01`)
        .lte('data_pagamento', `${anno}-12-31`)
        .order('numero_ricevuta', { ascending: false })
        .limit(1)
        .maybeSingle()

      const numero_ricevuta = (maxRow?.numero_ricevuta ?? 0) + 1

      const { error } = await supabase.from('quote').update({
        pagato: true,
        metodo_pagamento: metodo,
        data_pagamento:   dataPagamento,
        numero_ricevuta,
      }).eq('id', quota.id)
      if (error) throw error
      return quota.id
    },
    onSuccess: (quoteId) => {
      qc.invalidateQueries({ queryKey: ['quote-segreteria',   societaId] })
      qc.invalidateQueries({ queryKey: ['quote-giocatore',    giocatore?.id] })
      qc.invalidateQueries({ queryKey: ['segreteria-quote-aperte', societaId] })
      setCompletedQuoteId(quoteId)
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">

        {/* Header */}
        <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-sm">✅ Registra pagamento</span>
          <button onClick={onClose}><X size={18} className="opacity-70" /></button>
        </div>

        <div className="p-4">
          {/* Card quota */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex justify-between items-center">
            <div>
              <p className="font-bold text-gray-900 text-sm">{giocatore?.cognome} {giocatore?.nome}</p>
              <p className="text-xs text-gray-500 mt-0.5">{quota.descrizione || quota.tipo}</p>
            </div>
            <p className="text-2xl font-extrabold text-green-600">€{quota.importo}</p>
          </div>

          {completedQuoteId ? (
            /* Stato post-conferma */
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-green-700 font-semibold text-sm mb-3">Pagamento registrato ✓</p>
                <a
                  href={`/secretary/ricevuta/${completedQuoteId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                  <Printer size={15} /> Stampa ricevuta
                </a>
              </div>
              <button onClick={onClose}
                className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">
                Chiudi
              </button>
            </div>
          ) : (
            /* Form pagamento */
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Metodo di pagamento</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {METODI.map(m => (
                  <button key={m.id} type="button" onClick={() => setMetodo(m.id)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors ${
                      metodo === m.id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <span className="text-2xl">{m.icon}</span>
                    <span className={`text-xs font-semibold ${metodo === m.id ? 'text-green-700' : 'text-gray-600'}`}>
                      {m.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mb-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Data pagamento *
                </label>
                <input type="date" value={dataPagamento}
                  onChange={e => setDataPagamento(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">
                  Annulla
                </button>
                <button type="button"
                  onClick={() => confirmMut.mutate()}
                  disabled={confirmMut.isPending || !dataPagamento}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 active:scale-95 transition-transform">
                  {confirmMut.isPending ? 'Salvataggio...' : '✅ Conferma pagamento'}
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center mt-3">Dopo la conferma potrai stampare la ricevuta</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
