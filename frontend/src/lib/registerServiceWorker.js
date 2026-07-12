export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.error('Registrazione service worker fallita:', err)
  })
}
