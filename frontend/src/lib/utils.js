import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isToday, parseISO } from 'date-fns'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
import { it } from 'date-fns/locale'

export function formatDate(date, fmt = 'dd/MM/yyyy') {
  return format(typeof date === 'string' ? parseISO(date) : date, fmt, { locale: it })
}

export function formatTime(timeStr) {
  if (!timeStr) return ''
  return timeStr.slice(0, 5)
}

export function getWeekDays(date = new Date()) {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end = endOfWeek(date, { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
}

export function getDayName(date) {
  return format(date, 'EEEE', { locale: it })
}

export function isDateToday(dateStr) {
  return isToday(parseISO(dateStr))
}

export function getUserRole(user) {
  return user?.user_metadata?.ruolo ?? 'genitore'
}

export function getUserName(user) {
  const meta = user?.user_metadata ?? {}
  if (meta.nome) return `${meta.nome} ${meta.cognome ?? ''}`.trim()
  return user?.email ?? ''
}
