export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const GIORNI = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica']

export const GIORNI_LABEL = { lunedi: 'Lun', martedi: 'Mar', mercoledi: 'Mer', giovedi: 'Gio', venerdi: 'Ven', sabato: 'Sab', domenica: 'Dom' }

export const GIORNO_FULL = { lunedi: 'Lunedì', martedi: 'Martedì', mercoledi: 'Mercoledì', giovedi: 'Giovedì', venerdi: 'Venerdì', sabato: 'Sabato', domenica: 'Domenica' }

export const TIPO_PALESTRA = ['Principale', 'Secondaria', 'Esterna']

export const RUOLI = ['admin', 'allenatore', 'segreteria', 'genitore', 'giocatore', 'preparatore_atletico']

export const RUOLI_LABEL = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  allenatore: 'Allenatore',
  segreteria: 'Segreteria',
  genitore: 'Genitore',
  giocatore: 'Giocatore',
  preparatore_atletico: 'Preparatore Atletico',
}

export const RUOLI_EXTRA_DISPONIBILI = ['admin', 'allenatore', 'segreteria', 'genitore', 'giocatore', 'preparatore_atletico']

export const PALETTE = [
  { border: 'border-l-blue-500',    bg: 'bg-blue-50',    title: 'text-blue-900',    gameBorder: 'border-l-blue-600',    gameBg: 'bg-blue-100'    },
  { border: 'border-l-emerald-500', bg: 'bg-emerald-50', title: 'text-emerald-900', gameBorder: 'border-l-emerald-600', gameBg: 'bg-emerald-100' },
  { border: 'border-l-violet-500',  bg: 'bg-violet-50',  title: 'text-violet-900',  gameBorder: 'border-l-violet-600',  gameBg: 'bg-violet-100'  },
  { border: 'border-l-orange-500',  bg: 'bg-orange-50',  title: 'text-orange-900',  gameBorder: 'border-l-orange-600',  gameBg: 'bg-orange-100'  },
  { border: 'border-l-teal-500',    bg: 'bg-teal-50',    title: 'text-teal-900',    gameBorder: 'border-l-teal-600',    gameBg: 'bg-teal-100'    },
  { border: 'border-l-rose-500',    bg: 'bg-rose-50',    title: 'text-rose-900',    gameBorder: 'border-l-rose-600',    gameBg: 'bg-rose-100'    },
  { border: 'border-l-indigo-500',  bg: 'bg-indigo-50',  title: 'text-indigo-900',  gameBorder: 'border-l-indigo-600',  gameBg: 'bg-indigo-100'  },
  { border: 'border-l-red-500',     bg: 'bg-red-50',     title: 'text-red-900',     gameBorder: 'border-l-red-600',     gameBg: 'bg-red-100'     },
  { border: 'border-l-cyan-500',    bg: 'bg-cyan-50',    title: 'text-cyan-900',    gameBorder: 'border-l-cyan-600',    gameBg: 'bg-cyan-100'    },
  { border: 'border-l-lime-500',    bg: 'bg-lime-50',    title: 'text-lime-900',    gameBorder: 'border-l-lime-600',    gameBg: 'bg-lime-100'    },
]
