import { supabase } from '../lib/supabase'
import { API_BASE } from '../lib/constants'

export async function saveAllenamento(event, formData, societaId) {
  const payload = {
    data: event.data, squadra: event.squadra,
    ora_inizio: formData.ora_inizio, ora_fine: formData.ora_fine,
    palestra: formData.palestra, annullato: false,
  }
  if (event._source === 'fisso') {
    const { data: existing } = await supabase
      .from('orario_settimana').select('id')
      .eq('data', event.data).eq('squadra', event.squadra).maybeSingle()
    if (existing) {
      const { error } = await supabase.from('orario_settimana').update(payload).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('orario_settimana').insert([{ ...payload, societa_id: societaId }])
      if (error) throw error
    }
  } else {
    const { error } = await supabase.from('orario_settimana').update(payload).eq('id', event.id)
    if (error) throw error
  }
}

export async function annullaAllenamento(event, societaId) {
  if (event._source === 'fisso') {
    const { data: existing } = await supabase
      .from('orario_settimana').select('id')
      .eq('data', event.data).eq('squadra', event.squadra).maybeSingle()
    if (existing) {
      const { error } = await supabase.from('orario_settimana').update({ annullato: true }).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('orario_settimana').insert([{
        data: event.data, squadra: event.squadra,
        ora_inizio: event.ora_inizio, ora_fine: event.ora_fine,
        palestra: event.palestra ?? '', annullato: true, societa_id: societaId,
      }])
      if (error) throw error
    }
  } else {
    const { error } = await supabase.from('orario_settimana').update({ annullato: true }).eq('id', event.id)
    if (error) throw error
  }
}

export function inviaNotificaAnnullamento(squadra, societaId, data) {
  fetch(`${API_BASE}/api/notifica/allenamento`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      squadra,
      societa_id: societaId,
      data,
      titolo: 'Allenamento annullato',
      corpo: `L'allenamento di ${squadra} è stato annullato.`,
    }),
  }).catch(() => {})
}
