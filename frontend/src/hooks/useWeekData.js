import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { format, startOfWeek, endOfWeek, addWeeks, parseISO } from 'date-fns'

async function fetchWeekEvents(weekOffset = 0) {
  const base = addWeeks(new Date(), weekOffset)
  const start = format(startOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const end = format(endOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const [calRes, settRes] = await Promise.all([
    supabase
      .from('calendario')
      .select('*')
      .gte('data', start)
      .lte('data', end)
      .order('data')
      .order('ora_inizio'),
    supabase
      .from('orario_settimana')
      .select('*')
      .gte('data', start)
      .lte('data', end)
      .order('data')
      .order('ora_inizio'),
  ])

  if (calRes.error) throw calRes.error
  if (settRes.error) throw settRes.error

  return {
    partite: calRes.data ?? [],
    allenamenti: settRes.data ?? [],
    start,
    end,
  }
}

async function fetchTodayEvents() {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [calRes, settRes] = await Promise.all([
    supabase
      .from('calendario')
      .select('*')
      .eq('data', today)
      .order('ora_inizio'),
    supabase
      .from('orario_settimana')
      .select('*')
      .eq('data', today)
      .eq('annullato', false)
      .order('ora_inizio'),
  ])

  return {
    partite: calRes.data ?? [],
    allenamenti: settRes.data ?? [],
  }
}

async function fetchConflicts() {
  const { data, error } = await supabase
    .from('calendario')
    .select('*')
    .eq('stato', 'provvisoria')
    .order('data')

  if (error) throw error
  return data ?? []
}

export function useWeekData(weekOffset = 0) {
  return useQuery({
    queryKey: ['weekEvents', weekOffset],
    queryFn: () => fetchWeekEvents(weekOffset),
    staleTime: 2 * 60 * 1000,
  })
}

export function useTodayData() {
  return useQuery({
    queryKey: ['todayEvents'],
    queryFn: fetchTodayEvents,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useConflicts() {
  return useQuery({
    queryKey: ['conflicts'],
    queryFn: fetchConflicts,
    staleTime: 2 * 60 * 1000,
  })
}
