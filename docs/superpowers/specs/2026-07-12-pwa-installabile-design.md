# PWA installabile — Design

**Data:** 2026-07-12
**Contesto:** l'app deve poter essere "scaricata" dagli utenti delle società (icona in home screen), soprattutto per chi la usa da telefono. Segreteria e Responsabile Settore Giovanile continuano a usarla da PC via browser normale.

## Problema

L'app (React + Vite) non ha nessuna delle caratteristiche che rendono un sito web installabile come PWA: manca un web app manifest, il `<title>` è ancora il placeholder generico di Vite ("frontend"), e il service worker esistente (`public/sw.js`, usato solo per le notifiche push) non si registra per tutti i ruoli, il che impedisce a Chrome/Android di offrire il prompt "Installa app" a segreteria/dirigente/admin/super_admin.

## Decisioni prese

1. **Solo installabile, niente cache offline.** L'app deve continuare a richiedere sempre una connessione reale (dati sempre aggiornati: presenze, quote, calendario). Questo esclude la necessità di precaching/Workbox.
2. **Nessuna nuova dipendenza di build** (niente `vite-plugin-pwa`): dato che non serve cache offline, il beneficio di una libreria dedicata è limitato rispetto al rischio di conflitto con il service worker esistente delle notifiche push. Si scrive manifest/icone/service worker a mano.
3. **Icona: monogramma "E" bianco su sfondo amber** (opzione scelta tramite mockup visivo), coerente con il colore già usato in tutta l'app. Non esisteva un vero logo EVO prima di questo lavoro (solo l'emoji 🏀 in testo e un `favicon.svg` viola scollegato dal brand, mai personalizzato).
4. **Nome app:** `name: "EVO - Gestionale Basket"`, `short_name: "EVO"`.

## Design

### 1. Icone

Nuovo SVG sorgente (`frontend/public/icon-source.svg`): quadrato con sfondo amber (gradiente `#f59e0b` → `#d97706`), lettera "E" bianca bold centrata.

Da questo SVG si generano 3 PNG, con uno script Node "usa e getta" (eseguito una tantum via `npx sharp-cli` — o libreria `sharp` invocata tramite `npx -p sharp node <script>`, nessuna dipendenza aggiunta a `package.json`/`package-lock.json`):
- `frontend/public/icon-192.png` (192×192)
- `frontend/public/icon-512.png` (512×512)
- `frontend/public/icon-maskable-512.png` (512×512, contenuto centrato con margine di sicurezza ~20% per il ritaglio "maskable" di Android)

### 2. Manifest

Nuovo file `frontend/public/manifest.webmanifest`:

```json
{
  "name": "EVO - Gestionale Basket",
  "short_name": "EVO",
  "description": "Gestionale per società di basket: calendari, presenze, quote, comunicazioni.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#f59e0b",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 3. `index.html`

- `<link rel="manifest" href="/manifest.webmanifest">`
- `<meta name="theme-color" content="#f59e0b">`
- Tag iOS Safari (che non legge il manifest.json per l'icona/comportamento standalone): `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">`, `<link rel="apple-touch-icon" href="/icon-192.png">`
- `<title>` aggiornato da "frontend" a "EVO - Gestionale Basket"

### 4. Registrazione universale del service worker

**Problema attuale:** `navigator.serviceWorker.register('/sw.js')` avviene solo dentro `initPushNotifications()` (`frontend/src/hooks/usePushNotifications.js`), che a sua volta gira solo se: il ruolo è genitore/giocatore/allenatore, il profilo è attivo, e `VITE_VAPID_PUBLIC_KEY` è configurata. Segreteria/dirigente/admin/super_admin non registrano mai il service worker.

**Soluzione:** spostare la registrazione base (`navigator.serviceWorker.register('/sw.js')`) fuori da `initPushNotifications`, in un punto eseguito sempre all'avvio dell'app per qualunque utente autenticato, indipendentemente da ruolo/permesso notifiche. `initPushNotifications` riusa la registration già ottenuta invece di registrarla di nuovo (registrare due volte lo stesso path è comunque innocuo, ma centralizzarlo è più pulito).

Aggiungere a `public/sw.js` un gestore `fetch` "passthrough" (nessuna cache, inoltra solo la richiesta):

```js
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
```

Necessario perché alcuni browser richiedono che il service worker gestisca `fetch` per considerare la pagina installabile. Non introduce alcun comportamento di cache/offline (coerente con la decisione 1).

## Fuori scope

- Banner in-app con istruzioni "Aggiungi a schermata Home" per iOS Safari (che non mostra un prompt automatico come Android/Chrome) — utile ma non richiesto esplicitamente, possibile follow-up futuro.
- Cache offline dei dati (presenze, quote, calendario) — deciso esplicitamente di no.
- Pubblicazione su Play Store / App Store — fuori scope per questa richiesta (l'obiettivo è l'installazione diretta da browser, gratuita).
