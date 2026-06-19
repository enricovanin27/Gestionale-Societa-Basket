import { useToast } from '../components/ui/ToastProvider'

export function usePrintWindow() {
  const { toast } = useToast()
  // NOTA SICUREZZA: htmlBody deve provenire esclusivamente da codice interno (mai da input utente grezzo).
  // I valori titolo e intestazioneSocieta provengono dal DB della società (dati interni trusted).
  return function printWindow(titolo, htmlBody, intestazioneSocieta = '') {
    const win = window.open('', '_blank')
    if (!win) {
      toast.info('Pop-up bloccato dal browser. Consenti i pop-up per questa pagina per stampare.')
      return
    }
    const html = '<!DOCTYPE html>\n' +
      '<html lang="it">\n' +
      '<head>\n' +
      '  <meta charset="UTF-8" />\n' +
      '  <title>' + titolo + '</title>\n' +
      '  <style>\n' +
      '    * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
      '    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }\n' +
      '    h1 { font-size: 14px; margin-bottom: 4px; }\n' +
      '    .societa { font-size: 10px; color: #555; margin-bottom: 16px; font-weight: 600; }\n' +
      '    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10px; }\n' +
      '    thead th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; padding: 5px 6px; border: 1px solid #d1d5db; text-align: left; }\n' +
      '    tbody td { border: 1px solid #e5e7eb; padding: 4px 6px; vertical-align: middle; }\n' +
      '    .center { text-align: center; }\n' +
      '    .ok  { color: #16a34a; font-weight: bold; }\n' +
      '    .ko  { color: #9ca3af; }\n' +
      '    .red { color: #dc2626; font-weight: 600; }\n' +
      '    .orange { color: #ea580c; }\n' +
      '    .summary { margin-top: 12px; font-size: 10px; font-weight: 600; color: #374151; }\n' +
      '    .footer { margin-top: 20px; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 6px; }\n' +
      '    @media print { body { padding: 10mm; } @page { margin: 10mm; } }\n' +
      '  </style>\n' +
      '</head>\n' +
      '<body>\n' +
      (intestazioneSocieta ? '  <div class="societa">' + intestazioneSocieta + '</div>\n' : '') +
      '  <h1>' + titolo + '</h1>\n' +
      '  ' + htmlBody + '\n' +
      '  <div class="footer">Stampato il ' + new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</div>\n' +
      '</body>\n' +
      '</html>'
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }
}
