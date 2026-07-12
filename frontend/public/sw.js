self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Gestionale Basket', {
      body: data.body ?? '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag ?? 'default',
      renotify: true,
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const match = all.find((c) => c.url.includes(self.location.origin))
      if (match) return match.focus()
      return clients.openWindow(event.notification.data?.url ?? '/')
    })
  )
})

// Nessuna cache: richiesto da alcuni browser per considerare la pagina installabile,
// ma il comportamento di rete resta invariato (solo pass-through).
self.addEventListener('fetch', (event) => {
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return
  event.respondWith(fetch(event.request))
})
