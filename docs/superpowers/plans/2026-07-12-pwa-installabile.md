# PWA Installabile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere l'app installabile come PWA (icona in home screen, si apre a schermo intero senza barra URL) su Android/Chrome e iOS/Safari, senza cache offline dei dati e senza nuove dipendenze di build.

**Architecture:** Manifest + icone statiche in `frontend/public/`, meta tag in `index.html`, un piccolo handler `fetch` "passthrough" aggiunto al service worker già esistente (`public/sw.js`, usato oggi solo per le notifiche push), e la sua registrazione spostata da "solo per alcuni ruoli" a "sempre, per qualunque utente".

**Tech Stack:** Vite + React 19 (frontend statico, nessuna dipendenza di build aggiunta), Web App Manifest, Service Worker API vanilla (nessun Workbox/vite-plugin-pwa).

**Nota sui test:** nessun test runner automatico in questo repo (vedi note nel piano precedente). Verifica tramite `npm run build` + ispezione manuale del codice, coerente con come è stato verificato tutto il lavoro precedente in questo progetto.

**Nota ambientale importante:** l'ambiente di sviluppo usato per implementare questo piano non ha accesso di rete al registro npm (verificato: `npx` fallisce con errore di certificato) né strumenti di rasterizzazione immagini preinstallati (niente ImageMagick/PIL/sharp), e un tentativo di usare un browser headless locale per generare screenshot si è rivelato inaffidabile (spawn di processi interattivi). Per questo l'icona non viene generata in automatico: il Task 1 crea uno strumento HTML statico che **l'utente umano apre una volta nel proprio browser** per scaricare i 3 PNG — è un passo manuale di ~1 minuto, documentato esplicitamente, non un lavoro lasciato a metà.

---

### Task 1: Icona — SVG sorgente e tool di esportazione PNG

**Files:**
- Create: `frontend/tools/generate-pwa-icons.html`

- [ ] **Step 1: Crea il tool di generazione icone**

```html
<!doctype html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Genera icone PWA — EVO</title>
<style>
  body { font-family: system-ui, sans-serif; background:#f3f4f6; padding:32px; }
  .row { display:flex; gap:24px; flex-wrap:wrap; margin-bottom:24px; }
  .item { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px; text-align:center; }
  canvas { display:block; margin:0 auto 12px; border:1px solid #e5e7eb; }
  button { padding:8px 16px; background:#f59e0b; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer; font-size:14px; }
  button:hover { background:#d97706; }
  code { background:#f3f4f6; padding:2px 6px; border-radius:4px; }
</style>
</head>
<body>
  <h1>Genera icone PWA — EVO</h1>
  <p>Apri questo file direttamente in un browser (doppio click, non serve un server). Clicca i 3 pulsanti "Scarica", poi sposta i 3 file scaricati in <code>frontend/public/</code>.</p>
  <div class="row">
    <div class="item">
      <canvas id="c192" width="192" height="192"></canvas>
      <p><code>icon-192.png</code></p>
      <button onclick="download('c192','icon-192.png')">Scarica</button>
    </div>
    <div class="item">
      <canvas id="c512" width="512" height="512"></canvas>
      <p><code>icon-512.png</code></p>
      <button onclick="download('c512','icon-512.png')">Scarica</button>
    </div>
    <div class="item">
      <canvas id="cMask" width="512" height="512"></canvas>
      <p><code>icon-maskable-512.png</code></p>
      <button onclick="download('cMask','icon-maskable-512.png')">Scarica</button>
    </div>
  </div>

<script>
function drawIcon(canvasId, { size, rounded, safeZoneScale }) {
  const canvas = document.getElementById(canvasId)
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)

  const grad = ctx.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, '#f59e0b')
  grad.addColorStop(1, '#d97706')

  if (rounded) {
    const r = size * 0.18
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(size - r, 0)
    ctx.quadraticCurveTo(size, 0, size, r)
    ctx.lineTo(size, size - r)
    ctx.quadraticCurveTo(size, size, size - r, size)
    ctx.lineTo(r, size)
    ctx.quadraticCurveTo(0, size, 0, size - r)
    ctx.lineTo(0, r)
    ctx.quadraticCurveTo(0, 0, r, 0)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
  } else {
    // Icona "maskable": sfondo pieno, senza arrotondamento — il masking lo applica il sistema operativo.
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
  }

  // Lettera "E" bianca, centrata. safeZoneScale < 1 per la variante maskable,
  // per restare dentro la "safe zone" circolare (~80% del canvas) che Android non ritaglia mai.
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.round(size * 0.5 * safeZoneScale)}px system-ui, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('E', size / 2, size / 2 + size * 0.03)
}

function download(canvasId, filename) {
  const canvas = document.getElementById(canvasId)
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

drawIcon('c192', { size: 192, rounded: true, safeZoneScale: 1 })
drawIcon('c512', { size: 512, rounded: true, safeZoneScale: 1 })
drawIcon('cMask', { size: 512, rounded: false, safeZoneScale: 0.6 })
</script>
</body>
</html>
```

- [ ] **Step 2: Verifica (statica, senza browser headless disponibile)**

Rileggi il file e conferma che:
- i 3 canvas hanno le dimensioni corrette (192, 512, 512)
- la variante `cMask` non ha `rounded` (sfondo pieno bordo-a-bordo, come richiede lo standard "maskable icon")
- `safeZoneScale: 0.6` sulla variante maskable rende la lettera "E" più piccola/centrata rispetto alle altre due, per restare dentro la safe zone
- i pulsanti "Scarica" impostano il nome file corretto (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`) — questi nomi devono corrispondere esattamente a quelli usati nel Task 2 (manifest) e Task 3 (`apple-touch-icon`)

Non è possibile in questo ambiente aprire realmente il file in un browser e verificare il rendering visivo (nessun accesso di rete per scaricare un browser, e il tentativo di usare un browser headless locale già installato si è rivelato inaffidabile) — verifica quindi solo leggendo il codice JS con attenzione, non eseguendolo. Segnala questo limite nel report.

- [ ] **Step 3: Commit**

```bash
git add frontend/tools/generate-pwa-icons.html
git commit -m "feat(pwa): tool per generare le icone PWA (192/512/maskable)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

**Nota per dopo (non fare in questo task, non fa parte del lavoro dell'implementatore):** una volta mergiato, un umano dovrà aprire `frontend/tools/generate-pwa-icons.html` nel proprio browser, scaricare i 3 PNG e metterli in `frontend/public/`. Finché non viene fatto, il manifest (Task 2) e il tag `apple-touch-icon` (Task 3) puntano a file che non esistono ancora — questo non rompe la build né l'app (sono riferimenti a file statici in `public/`, non import JS), semplicemente l'icona non comparirà finché i PNG non vengono aggiunti.

---

### Task 2: Web App Manifest

**Files:**
- Create: `frontend/public/manifest.webmanifest`

- [ ] **Step 1: Crea il manifest**

```json
{
  "name": "EVO - Gestionale Basket",
  "short_name": "EVO",
  "description": "Gestionale per società di basket: calendari, presenze, quote, comunicazioni.",
  "lang": "it",
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

- [ ] **Step 2: Verifica**

Esegui `npm run build` in `frontend/` e conferma che completi senza errori (il manifest è un file statico in `public/`, Vite lo copia in `dist/` senza elaborarlo — non può causare errori di build, ma verifica comunque che il JSON sia sintatticamente valido, es. con `node -e "JSON.parse(require('fs').readFileSync('frontend/public/manifest.webmanifest','utf8'))"`).

- [ ] **Step 3: Commit**

```bash
git add frontend/public/manifest.webmanifest
git commit -m "feat(pwa): aggiungi web app manifest

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Collegamento in `index.html`

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Aggiorna `index.html`**

Sostituisci:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>frontend</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

con:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f59e0b" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <title>EVO - Gestionale Basket</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

(nota: `lang="en"` lasciato invariato — non è collegato a questo task, cambiarlo sarebbe una modifica non richiesta)

- [ ] **Step 2: Verifica**

`npm run build` in `frontend/` deve completare senza errori. Apri `frontend/dist/index.html` dopo la build e conferma che i nuovi tag (`link rel="manifest"`, meta `theme-color`, meta `apple-mobile-web-app-capable`, `link rel="apple-touch-icon"`) siano presenti nell'output.

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat(pwa): collega manifest e meta tag PWA/iOS in index.html

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Service worker — handler `fetch` e registrazione universale

**Files:**
- Modify: `frontend/public/sw.js`
- Create: `frontend/src/lib/registerServiceWorker.js`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/hooks/usePushNotifications.js`

Oggi `navigator.serviceWorker.register('/sw.js')` avviene solo dentro `initPushNotifications()` (`frontend/src/hooks/usePushNotifications.js`), che gira solo se il ruolo è genitore/giocatore/allenatore, il profilo è attivo, e `VITE_VAPID_PUBLIC_KEY` è configurata. Segreteria/dirigente/admin/super_admin non registrano mai il service worker, e senza service worker attivo Chrome/Android non propone il banner "Installa app" a quei ruoli.

- [ ] **Step 1: Aggiungi un handler `fetch` passthrough a `public/sw.js`**

Leggi prima il contenuto attuale di `frontend/public/sw.js` (ha già `push` e `notificationclick`). Aggiungi in fondo al file:

```js
// Nessuna cache: richiesto da alcuni browser per considerare la pagina installabile,
// ma il comportamento di rete resta invariato (solo pass-through).
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
```

Non toccare i listener `push`/`notificationclick` già presenti.

- [ ] **Step 2: Crea `frontend/src/lib/registerServiceWorker.js`**

```js
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.error('Registrazione service worker fallita:', err)
  })
}
```

- [ ] **Step 3: Chiama la registrazione in `frontend/src/main.jsx`, incondizionatamente all'avvio**

Leggi prima il contenuto attuale del file. Sostituisci:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

con:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './lib/registerServiceWorker'

registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 4: Aggiorna `frontend/src/hooks/usePushNotifications.js` per riusare la registration già fatta**

Leggi prima il contenuto attuale del file (ha `initPushNotifications`, che oggi fa `const reg = await navigator.serviceWorker.register('/sw.js')`). Sostituisci quella riga con:

```js
    const reg = await navigator.serviceWorker.ready
```

`navigator.serviceWorker.ready` è una promise che si risolve quando il service worker registrato in `main.jsx` è attivo e in controllo della pagina — riusa la registrazione già fatta invece di registrarla di nuovo. Non modificare il resto della funzione (VAPID key, subscribe, upsert su `push_subscriptions`).

- [ ] **Step 5: Verifica**

`npm run build` in `frontend/` deve completare senza errori. Rileggi tutti e 4 i file modificati/creati e conferma:
- `sw.js` ha ancora i listener `push`/`notificationclick` originali, più il nuovo `fetch`
- `main.jsx` chiama `registerServiceWorker()` prima di `createRoot(...).render(...)`, incondizionatamente (non dentro un `if` legato al ruolo/utente)
- `usePushNotifications.js` non registra più il service worker da sé, usa `navigator.serviceWorker.ready`

Non è possibile in questo ambiente testare dal vivo che il banner "Installa app" compaia per tutti i ruoli (serve un vero browser con una vera sessione utente) — verifica quindi tramite lettura del codice, e segnala esplicitamente che il test end-to-end (login con un ruolo segreteria/admin/dirigente su Chrome Android o desktop, verificare comparsa del prompt di installazione) va fatto manualmente dall'utente dopo il deploy.

- [ ] **Step 6: Commit**

```bash
git add frontend/public/sw.js frontend/src/lib/registerServiceWorker.js frontend/src/main.jsx frontend/src/hooks/usePushNotifications.js
git commit -m "feat(pwa): registra il service worker per tutti i ruoli, non solo per le notifiche push

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Riepilogo file toccati

| File | Tipo |
|---|---|
| `frontend/tools/generate-pwa-icons.html` | nuovo |
| `frontend/public/manifest.webmanifest` | nuovo |
| `frontend/index.html` | modificato |
| `frontend/public/sw.js` | modificato |
| `frontend/src/lib/registerServiceWorker.js` | nuovo |
| `frontend/src/main.jsx` | modificato |
| `frontend/src/hooks/usePushNotifications.js` | modificato |

## Passo manuale finale (non incluso nei task, da fare dopo il merge)

1. Apri `frontend/tools/generate-pwa-icons.html` in un browser (doppio click sul file).
2. Clicca i 3 pulsanti "Scarica".
3. Sposta i 3 PNG scaricati in `frontend/public/`.
4. Deploy. Verifica su un telefono Android con Chrome che compaia il prompt "Installa app"; su iPhone verifica Safari → Condividi → "Aggiungi a schermata Home".
