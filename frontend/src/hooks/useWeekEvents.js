/**
 * useWeekEvents — correct merge of orario_fisso + orario_settimana + calendario.
 *
 * Logic (mirrors logic.py):
 *  1. Start from orario_fisso (template) for each day of the week.
 *  2. For each fisso entry, check orario_settimana for that date + squadra:
 *       - If override exists and annullato === true  → skip (training cancelled)
 *       - If override exists and annullato === false → use settimana data (modified)
 *       - No override                               → use fisso template as-is
 *  3. Add any orario_settimana rows that have NO fisso counterpart (extra training).
 *  4. Add all calendario rows (partite) for the week.
 */

import { useQuery } from '@tanstack/react-query'
import { format, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '../lib/supabase'

// JS Date.getDay() → Italian giorno name (matches orario_fisso.giorno column)
const GIORNO_BY_JS_DAY = {
  0: 'domenica',
  1: 'lunedi',
  2: 'martedi',
  3: 'mercoledi',
  4: 'giovedi',
  5: 'venerdi',
  6: 'sabato',
}

// ─── Raw fetch ────────────────────────────────────────────────────────────────

async function fetchRaw(weekStart) {
  const startStr = format(weekStart, 'yyyy-MM-dd')
  const endStr   = format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const [fissoRes, settRes, calRes] = await Promise.all([
    supabase.from('orario_fisso').select('*').order('giorno').order('ora_inizio'),
    supabase.from('orario_settimana').select('*').gte('data', startStr).lte('data', endStr).order('data').order('ora_inizio'),
    supabase.from('calendario').select('*').gte('data', startStr).lte('data', endStr).order('data').order('ora_inizio'),
  ])

  if (fissoRes.error) throw fissoRes.error
  if (settRes.error)  throw settRes.error
  if (calRes.error)   throw calRes.error

  return {
    orarioFisso:     fissoRes.data ?? [],
    orarioSettimana: settRes.data  ?? [],
    partite:         calRes.data   ?? [],
  }
}

// ─── Merge logic ──────────────────────────────────────────────────────────────

function mergeEvents(orarioFisso, orarioSettimana, partite, rangeStart, rangeEnd) {
  const weekDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd })

  const events = []

  for (const day of weekDays) {
    const dateStr    = format(day, 'yyyy-MM-dd')
    const giornoNorm = GIORNO_BY_JS_DAY[day.getDay()]

    // orario_settimana rows for this specific date
    const settForDate = orarioSettimana.filter(s => s.data === dateStr)

    // Map squadra (normalized) → settimana row
    const settBySquadra = new Map(
      settForDate.map(s => [(s.squadra ?? '').toLowerCase().trim(), s])
    )

    // orario_fisso rows for this weekday
    const fissoForDay = orarioFisso.filter(
      f => (f.giorno ?? '').toLowerCase().trim() === giornoNorm
    )

    // 1 — Fisso entries (possibly overridden)
    for (const fisso of fissoForDay) {
      const key      = (fisso.squadra ?? '').toLowerCase().trim()
      const override = settBySquadra.get(key)

      if (override !== undefined) {
        if (!override.annullato) {
          // Modified training: override data wins, fisso fills any missing fields
          events.push({
            ...fisso,
            ...override,
            data:     dateStr,
            _tipo:    'allenamento',
            _source:  'override',
            _table:   'orario_settimana',
            spostato: true,
          })
        }
        // annullato === true → do not add (cancelled for this week)
      } else {
        // Unmodified fixed training
        events.push({
          ...fisso,
          data:     dateStr,
          _tipo:    'allenamento',
          _source:  'fisso',
          _table:   'orario_fisso',
          spostato: false,
        })
      }
    }

    // 2 — Extra settimana rows (no fisso counterpart)
    for (const sett of settForDate) {
      if (sett.annullato) continue
      const hasFisso = fissoForDay.some(
        f => (f.squadra ?? '').toLowerCase().trim() === (sett.squadra ?? '').toLowerCase().trim()
      )
      if (!hasFisso) {
        events.push({
          ...sett,
          _tipo:    'allenamento',
          _source:  'extra',
          _table:   'orario_settimana',
          spostato: true,
        })
      }
    }
  }

  // 3 — Partite from calendario
  for (const p of partite) {
    events.push({
      ...p,
      _tipo:    'partita',
      _source:  'calendario',
      _table:   'calendario',
      spostato: false,
    })
  }

  // Sort: date → ora_inizio
  events.sort((a, b) => {
    const dc = (a.data ?? '').localeCompare(b.data ?? '')
    if (dc !== 0) return dc
    return (a.ora_inizio ?? '').localeCompare(b.ora_inizio ?? '')
  })

  // Group by date
  const eventsByDate = {}
  for (const e of events) {
    if (!eventsByDate[e.data]) eventsByDate[e.data] = []
    eventsByDate[e.data].push(e)
  }

  return { events, eventsByDate }
}

// ─── Public hooks ─────────────────────────────────────────────────────────────

/**
 * Returns merged week events.
 * @param {Date} startDate  Monday of the target week
 *   (compute with: startOfWeek(addWeeks(new Date(), offset), { weekStartsOn: 1 }))
 */
export function useWeekEvents(startDate) {
  const key = format(startDate, 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['weekEvents', key],
    queryFn:  async () => {
      const raw = await fetchRaw(startDate)
      return mergeEvents(raw.orarioFisso, raw.orarioSettimana, raw.partite, startDate, endOfWeek(startDate, { weekStartsOn: 1 }))
    },
    staleTime: 2 * 60 * 1000,
  })
}

/** Partite for a whole calendar month (no training merge). */
export function useMonthPartite(monthDate, enabled = true) {
  const startStr = format(startOfMonth(monthDate), 'yyyy-MM-dd')
  const endStr   = format(endOfMonth(monthDate),   'yyyy-MM-dd')
  const key      = format(monthDate, 'yyyy-MM')

  return useQuery({
    queryKey: ['monthPartite', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario')
        .select('*')
        .gte('data', startStr)
        .lte('data', endStr)
        .order('data')
        .order('ora_inizio')
      if (error) throw error
      return (data ?? []).map(p => ({
        ...p,
        _tipo:   'partita',
        _source: 'calendario',
        _table:  'calendario',
        spostato: false,
      }))
    },
    enabled,
    staleTime: 2 * 60 * 1000,
  })
}

/** Full merged events (allenamenti + partite) for a whole calendar month. */
export function useMonthEvents(monthDate, enabled = true) {
  const mStart   = startOfMonth(monthDate)
  const mEnd     = endOfMonth(monthDate)
  const startStr = format(mStart, 'yyyy-MM-dd')
  const endStr   = format(mEnd,   'yyyy-MM-dd')
  const key      = format(monthDate, 'yyyy-MM')

  return useQuery({
    queryKey: ['monthEvents', key],
    queryFn: async () => {
      const [fissoRes, settRes, calRes] = await Promise.all([
        supabase.from('orario_fisso').select('*').order('giorno').order('ora_inizio'),
        supabase.from('orario_settimana').select('*')
          .gte('data', startStr).lte('data', endStr)
          .order('data').order('ora_inizio'),
        supabase.from('calendario').select('*')
          .gte('data', startStr).lte('data', endStr)
          .order('data').order('ora_inizio'),
      ])
      if (fissoRes.error) throw fissoRes.error
      if (settRes.error)  throw settRes.error
      if (calRes.error)   throw calRes.error
      return mergeEvents(
        fissoRes.data ?? [],
        settRes.data  ?? [],
        calRes.data   ?? [],
        mStart,
        mEnd,
      )
    },
    enabled,
    staleTime: 2 * 60 * 1000,
  })
}

/** All distinct squadre from orario_fisso + calendario. */
export function useSquadre() {
  return useQuery({
    queryKey: ['squadre'],
    queryFn:  async () => {
      const [fissoRes, calRes] = await Promise.all([
        supabase.from('orario_fisso').select('squadra'),
        supabase.from('calendario').select('squadra'),
      ])
      const all = [
        ...(fissoRes.data ?? []),
        ...(calRes.data   ?? []),
      ].map(r => r.squadra).filter(Boolean)
      return [...new Set(all)].sort()
    },
    staleTime: 10 * 60 * 1000,
  })
}
