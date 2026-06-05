// frontend/src/hooks/useEntrate.js
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Fetch quote pagate (entrate) per un intervallo di date.
 * @param {string|null} societaId
 * @param {string} from  — 'YYYY-MM-DD'
 * @param {string} to    — 'YYYY-MM-DD'
 */
export function useEntrate(societaId, from, to) {
  return useQuery({
    queryKey: ['entrate', societaId, from, to],
    enabled: !!societaId && !!from && !!to,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote')
        .select(`
          id, tipo, descrizione, importo, data_pagamento, metodo_pagamento, numero_ricevuta,
          giocatori!inner(nome, cognome, squadra)
        `)
        .eq('societa_id', societaId)
        .eq('pagato', true)
        .gte('data_pagamento', from)
        .lte('data_pagamento', to)
        .order('data_pagamento')
        .order('numero_ricevuta', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })
}
