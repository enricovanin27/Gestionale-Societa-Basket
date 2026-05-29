import { differenceInDays, parseISO } from 'date-fns'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

/**
 * Restituisce stato, label e flag urgenza per una data di scadenza certificato medico.
 * @param {string|null} dataScadenza - data in formato 'yyyy-MM-dd' o null
 * @returns {{ label: string, cls: string, urgente: boolean }}
 */
export function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'N/D', cls: 'bg-gray-100 text-gray-500', urgente: false }
  const diff = differenceInDays(parseISO(dataScadenza), new Date())
  if (diff < 0)  return { label: 'Scaduto',   cls: 'bg-red-100 text-red-700',       urgente: true }
  if (diff < 30) return { label: `${diff}gg`,  cls: 'bg-orange-100 text-orange-700', urgente: true }
  return {
    label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }),
    cls:   'bg-green-100 text-green-700',
    urgente: false,
  }
}
