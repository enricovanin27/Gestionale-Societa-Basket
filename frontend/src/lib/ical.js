// RFC 5545 iCal generator — eventi basket (partite + allenamenti)

function escICS(s) {
  return (s ?? '').replace(/[\\;,]/g, c => `\\${c}`).replace(/\n/g, '\\n')
}

function dtICS(date, time) {
  return `${date.replace(/-/g, '')}T${(time ?? '00:00').replace(/:/g, '')}00`
}

export function generateICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Oderzo Basket//Gestionale//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const ev of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${ev.tipo}-${ev.id}@oderzobasket`)
    lines.push(`DTSTART:${dtICS(ev.data, ev.ora_inizio)}`)
    if (ev.ora_fine) lines.push(`DTEND:${dtICS(ev.data, ev.ora_fine)}`)
    lines.push(`SUMMARY:${escICS(ev.summary)}`)
    if (ev.description) lines.push(`DESCRIPTION:${escICS(ev.description)}`)
    if (ev.location)    lines.push(`LOCATION:${escICS(ev.location)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadICS(content, filename = 'calendario-basket.ics') {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Converte una riga di calendario in evento iCal
export function partitaToEvent(p) {
  return {
    tipo:       'partita',
    id:         p.id,
    data:       p.data,
    ora_inizio: p.ora_inizio,
    ora_fine:   p.ora_fine,
    summary:    `${p.squadra} vs ${p.avversario} (${p.casa_fuori})`,
    description: `Squadra: ${p.squadra}`,
    location:   p.palestra ?? '',
  }
}

export function allenamentoToEvent(a) {
  return {
    tipo:       'allenamento',
    id:         a.id,
    data:       a.data,
    ora_inizio: a.ora_inizio,
    ora_fine:   a.ora_fine,
    summary:    `Allenamento ${a.squadra}`,
    description: `Squadra: ${a.squadra}`,
    location:   a.palestra ?? '',
  }
}
