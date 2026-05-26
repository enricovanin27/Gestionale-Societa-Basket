// frontend/src/hooks/usePrintWindow.js
export function usePrintWindow() {
  return function printWindow(titolo, htmlBody, intestazioneSocieta = '') {
    const win = window.open('', '_blank')
    if (!win) {
      alert('Pop-up bloccato dal browser. Consenti i pop-up per questa pagina per stampare.')
      return
    }
    win.document.write(`<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>${titolo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    h1 { font-size: 14px; margin-bottom: 4px; }
    .societa { font-size: 10px; color: #555; margin-bottom: 16px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10px; }
    thead th { background: #f3f4f6; font-size: 9px; text-transform: uppercase;
               letter-spacing: 0.04em; padding: 5px 6px; border: 1px solid #d1d5db; text-align: left; }
    tbody td { border: 1px solid #e5e7eb; padding: 4px 6px; vertical-align: middle; }
    .center { text-align: center; }
    .ok  { color: #16a34a; font-weight: bold; }
    .ko  { color: #9ca3af; }
    .red { color: #dc2626; font-weight: 600; }
    .orange { color: #ea580c; }
    .summary { margin-top: 12px; font-size: 10px; font-weight: 600; color: #374151; }
    .footer { margin-top: 20px; font-size: 9px; color: #9ca3af;
              border-top: 1px solid #e5e7eb; padding-top: 6px; }
    @media print { body { padding: 10mm; } @page { margin: 10mm; } }
  </style>
</head>
<body>
  \${intestazioneSocieta ? `<div class="societa">\${intestazioneSocieta}</div>` : ''}
  <h1>\${titolo}</h1>
  \${htmlBody}
  <div class="footer">Stampato il \${new Date().toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })}</div>
</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }
}
