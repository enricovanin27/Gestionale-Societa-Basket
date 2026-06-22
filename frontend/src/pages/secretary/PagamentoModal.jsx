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

export default function PagamentoModal({ quota, giocatore, societaId, onClose, rateCollegate = [] }) {
  const qc = useQueryClient()
  const [metodo, setMetodo]               = useState('contanti')
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [importoVersato, setImportoVersato] = useState(String(quota.importo ?? ''))
  const [completedQuoteId, setCompletedQuoteId] = useState(null)

  // null = da scegliere, 'rata' = solo questa, 'tutto' = tutte le rate
  const [sceltaPagamento, setSceltaPagamento] = useState(
    rateCollegate.length === 0 ? 'rata' : null
  )

  const versato   = parseFloat(importoVersato) || 0
  const isParziale = versato > 0 && versato < quota.importo
  const residuo   = isParziale ? Math.round((quota.importo - versato) * 100) / 100 : 0

  const totaleTutto = rateCollegate.reduce((s, r) => s + (r.importo ?? 0), 0) + (quota.importo ?? 0)

  const confirmMut = useMutation({
    mutationFn: async () => {
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

      if (sceltaPagamento === 'tutto') {
        // Aggiorna la quota corrente
        const { error: e1 } = await supabase.from('quote').update({
          pagato: true,
          metodo_pagamento: metodo,
          data_pagamento: dataPagamento,
          numero_ricevuta,
        }).eq('id', quota.id)
        if (e1) throw e1

        // Aggiorna tutte le rate collegate con numeri ricevuta progressivi
        for (let i = 0; i < rateCollegate.length; i++) {
          const { error: e2 } = await supabase.from('quote').update({
            pagato: true,
            metodo_pagamento: metodo,
            data_pagamento: dataPagamento,
            numero_ricevuta: numero_ricevuta + i + 1,
          }).eq('id', rateCollegate[i].id)
          if (e2) throw e2
        }
        return quota.id
      }

      // Paga rata singola (comportamento esistente con logica parziale)
      const versatoLocal = parseFloat(importoVersato) || 0
      const isParzialeLocal = versatoLocal > 0 && versatoLocal < quota.importo
      const residuoLocal = isParzialeLocal ? Math.round((quota.importo - versatoLocal) * 100) / 100 : 0

      if (isParzialeLocal) {
        const { error: errUpdate } = await supabase.from('quote').update({
          pagato: true,
          importo: versatoLocal,
          metodo_pagamento: metodo,
          data_pagamento: dataPagamento,
          numero_ricevuta,
        }).eq('id', quota.id)
        if (errUpdate) throw errUpdate

        const { error: errInsert } = await supabase.from('quote').insert([{
          societa_id:    societaId,
          giocatore_id:  giocatore.id,
          tipo:          quota.tipo,
          descrizione:   (quota.descrizione || quota.tipo) + ' (residuo)',
          importo:       residuoLocal,
          data_scadenza: null,
          pagato:        false,
          numero_rata:   null,
          rate_totali:   null,
        }])
        if (errInsert) throw errInsert
      } else {
        const { error } = await supabase.from('quote').update({
          pagato: true,
          metodo_pagamento: metodo,
          data_pagamento: dataPagamento,
          numero_ricevuta,
        }).eq('id', quota.id)
        if (error) throw error
      }

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
    <div className="fixed inset-0 bg-black/40 z-[200] flex items-end sm:items-center justify-center p-4">
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
                <p className="text-green-700 font-semibold text-sm mb-1">Pagamento registrato ✓</p>
                {isParziale && (
                  <p className="text-xs text-amber-600 mb-3">
                    Versato €{versato.toFixed(2)} — creato residuo di €{residuo.toFixed(2)}
                  </p>
                )}
                <button
                  onClick={() => {
                    const url = `/secretary/ricevuta/${completedQuoteId}`
                    const win = window.open(url, '_blank')
                    if (!win) window.location.href = url
                  }}
                  className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                  <Printer size={15} /> Stampa ricevuta
                </button>
              </div>
              <button onClick={onClose}
                className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">
                Chiudi
              </button>
            </div>
          ) : (
            /* Form pagamento */
            <>
              {/* Step 0: scelta rata/tutto — solo se ci sono rate collegate */}
              {sceltaPagamento === null && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Ci sono {rateCollegate.length + 1} rate. Cosa vuoi pagare?
                  </p>
                  <button
                    type="button"
                    onClick={() => setSceltaPagamento('rata')}
                    className="w-full border-2 border-gray-200 rounded-xl p-4 text-left hover:border-green-300 hover:bg-green-50 transition-colors"
                  >
                    <p className="font-semibold text-gray-900 text-sm">Pago questa rata</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {quota.rate_totali > 1 ? `Rata ${quota.numero_rata}/${quota.rate_totali} — ` : ''}€{(quota.importo ?? 0).toFixed(2)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSceltaPagamento('tutto')}
                    className="w-full border-2 border-green-200 rounded-xl p-4 text-left hover:border-green-400 hover:bg-green-50 transition-colors"
                  >
                    <p className="font-semibold text-green-700 text-sm">Pago tutto ora</p>
                    <p className="text-xs text-green-500 mt-0.5">
                      Tutte le {rateCollegate.length + 1} rate — totale €{totaleTutto.toFixed(2)}
                    </p>
                  </button>
                </div>
              )}

              {sceltaPagamento !== null && (
                <>
                  {/* link "cambia scelta" se ci sono rate collegate e non è già completato */}
                  {rateCollegate.length > 0 && !completedQuoteId && (
                    <button
                      type="button"
                      onClick={() => setSceltaPagamento(null)}
                      className="text-xs text-gray-400 mb-3 flex items-center gap-1 hover:text-gray-600"
                    >
                      ← Cambia scelta
                    </button>
                  )}

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

                  {sceltaPagamento === 'rata' && (
                    <div className="mb-4">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                        Importo versato (€) *
                      </label>
                      <div className="relative">
                        <input
                          type="number" min="0.01" step="0.01" max={quota.importo}
                          value={importoVersato}
                          onChange={e => setImportoVersato(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 pr-24"
                        />
                        {versato !== quota.importo && quota.importo > 0 && (
                          <button
                            type="button"
                            onClick={() => setImportoVersato(String(quota.importo))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-green-600 font-semibold bg-green-50 border border-green-200 px-1.5 py-0.5 rounded"
                          >
                            Tutto
                          </button>
                        )}
                      </div>
                      {isParziale && (
                        <p className="text-xs text-amber-600 mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                          ⚠ Pagamento parziale — verrà creata una quota residuo di <strong>€{residuo.toFixed(2)}</strong>
                        </p>
                      )}
                      {versato > quota.importo && (
                        <p className="text-xs text-red-500 mt-1">L'importo supera il totale (€{quota.importo})</p>
                      )}
                    </div>
                  )}

                  {sceltaPagamento === 'tutto' && (
                    <div className="mb-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-sm text-green-700 font-semibold">
                        Totale: €{totaleTutto.toFixed(2)} ({rateCollegate.length + 1} rate)
                      </div>
                    </div>
                  )}

                  <div className="mb-4">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                      Data pagamento *
                    </label>
                    <input type="date" value={dataPagamento}
                      onChange={e => setDataPagamento(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>

                  {confirmMut.isError && (
                    <p className="text-xs text-red-600 mb-3">❌ {confirmMut.error?.message}</p>
                  )}

                  <div className="flex gap-2">
                    <button type="button" onClick={onClose}
                      className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">
                      Annulla
                    </button>
                    <button type="button"
                      onClick={() => confirmMut.mutate()}
                      disabled={
                        confirmMut.isPending ||
                        !dataPagamento ||
                        (sceltaPagamento === 'rata' && (versato <= 0 || versato > quota.importo))
                      }
                      className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 active:scale-95 transition-transform">
                      {confirmMut.isPending
                        ? 'Salvataggio...'
                        : sceltaPagamento === 'tutto'
                          ? `✅ Paga tutto €${totaleTutto.toFixed(2)}`
                          : isParziale
                            ? `✅ Paga €${versato.toFixed(2)}`
                            : '✅ Conferma pagamento'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-3">Dopo la conferma potrai stampare la ricevuta</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
