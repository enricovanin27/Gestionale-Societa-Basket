export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const GIORNI = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica']

export const GIORNI_LABEL = { lunedi: 'Lun', martedi: 'Mar', mercoledi: 'Mer', giovedi: 'Gio', venerdi: 'Ven', sabato: 'Sab', domenica: 'Dom' }

export const GIORNO_FULL = { lunedi: 'Lunedì', martedi: 'Martedì', mercoledi: 'Mercoledì', giovedi: 'Giovedì', venerdi: 'Venerdì', sabato: 'Sabato', domenica: 'Domenica' }

export const TIPO_PALESTRA = ['Principale', 'Secondaria', 'Esterna']

export const RUOLI = ['admin', 'allenatore', 'segreteria', 'genitore', 'giocatore']

export const RUOLI_LABEL = { super_admin: 'Super Admin', admin: 'Admin', allenatore: 'Allenatore', segreteria: 'Segreteria', genitore: 'Genitore', giocatore: 'Giocatore' }

export const RUOLI_EXTRA_DISPONIBILI = ['admin', 'allenatore', 'segreteria']

export const PALETTE = [
  { border: 'border-l-blue-500',   bg: 'bg-blue-50',   title: 'text-blue-900'   },
  { border: 'border-l-green-500',  bg: 'bg-green-50',  title: 'text-green-900'  },
  { border: 'border-l-purple-500', bg: 'bg-purple-50', title: 'text-purple-900' },
  { border: 'border-l-orange-500', bg: 'bg-orange-50', title: 'text-orange-900' },
  { border: 'border-l-teal-500',   bg: 'bg-teal-50',   title: 'text-teal-900'   },
  { border: 'border-l-rose-500',   bg: 'bg-rose-50',   title: 'text-rose-900'   },
  { border: 'border-l-indigo-500', bg: 'bg-indigo-50', title: 'text-indigo-900' },
  { border: 'border-l-amber-500',  bg: 'bg-amber-50',  title: 'text-amber-900'  },
]
