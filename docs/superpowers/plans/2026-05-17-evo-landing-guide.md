# EVO Landing Page + Guida In-App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere una landing page pubblica con nome EVO, flusso di registrazione società con approvazione, e un drawer di guida contestuale in tutte le pagine autenticate.

**Architecture:** La route `/` diventa pubblica e mostra `LandingPage` agli utenti non autenticati; agli autenticati reindirizza al ruolo come ora. La registrazione scrive su `societa` con `stato='pending'` e il super_admin approva da `PlatformPage`. Il `GuideDrawer` è un bottom sheet fisso aggiunto a tutti e 5 i layout con contenuto da `guide.json`.

**Tech Stack:** React 18, React Router v6, Supabase JS v2, TailwindCSS v3, Lucide React

---

## Mappa file

| File | Azione |
|------|--------|
| `supabase_migration_societa_stato.sql` | **Nuovo** — aggiunge `stato`, `ref_*` a `societa`, RLS anon insert |
| `frontend/src/pages/LandingPage.jsx` | **Nuovo** — landing page pubblica completa |
| `frontend/src/pages/RegistrazionePage.jsx` | **Nuovo** — form registrazione + conferma |
| `frontend/src/data/guide.json` | **Nuovo** — contenuto guida per ogni route |
| `frontend/src/components/GuideDrawer.jsx` | **Nuovo** — bottom sheet con bottone `?` |
| `frontend/src/App.jsx` | **Modifica** — routing `/` e `/registrati` |
| `frontend/src/pages/PlatformPage.jsx` | **Modifica** — gestione società pending |
| `frontend/src/layouts/AdminLayout.jsx` | **Modifica** — aggiunge `<GuideDrawer />` |
| `frontend/src/layouts/CoachLayout.jsx` | **Modifica** — aggiunge `<GuideDrawer />` |
| `frontend/src/layouts/ParentLayout.jsx` | **Modifica** — aggiunge `<GuideDrawer />` |
| `frontend/src/layouts/PlayerLayout.jsx` | **Modifica** — aggiunge `<GuideDrawer />` |
| `frontend/src/layouts/SecretaryLayout.jsx` | **Modifica** — aggiunge `<GuideDrawer />` |

---

## Task 1 — DB Migration: colonne `stato` e `ref_*` su `societa`

**File:**
- Crea: `supabase_migration_societa_stato.sql`

- [ ] **Step 1: Crea il file SQL**

```sql
-- supabase_migration_societa_stato.sql
-- Aggiunge stato + dati referente per il flusso di auto-registrazione

ALTER TABLE societa
  ADD COLUMN IF NOT EXISTS stato     TEXT NOT NULL DEFAULT 'attiva',
  ADD COLUMN IF NOT EXISTS ref_nome     TEXT,
  ADD COLUMN IF NOT EXISTS ref_cognome  TEXT,
  ADD COLUMN IF NOT EXISTS ref_email    TEXT,
  ADD COLUMN IF NOT EXISTS ref_citta    TEXT;

-- Le società esistenti rimangono 'attiva' per il DEFAULT sopra.
-- Permette agli utenti anonimi di registrare una nuova società (solo pending)
DROP POLICY IF EXISTS "anon_societa_register" ON societa;
CREATE POLICY "anon_societa_register" ON societa
  FOR INSERT TO anon
  WITH CHECK (stato = 'pending');
```

- [ ] **Step 2: Esegui la migration**

Vai su Supabase dashboard → SQL Editor → incolla il contenuto del file → Run.
Verifica che la tabella `societa` abbia le nuove colonne senza errori.

- [ ] **Step 3: Commit**

```bash
git add supabase_migration_societa_stato.sql
git commit -m "chore: migration societa stato + ref fields + anon insert policy"
```

---

## Task 2 — `LandingPage.jsx`

**File:**
- Crea: `frontend/src/pages/LandingPage.jsx`

- [ ] **Step 1: Crea il file con tutti i componenti**

```jsx
// frontend/src/pages/LandingPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const GRADIENT = { background: 'linear-gradient(160deg, #c2410c 0%, #d97706 50%, #f59e0b 100%)' }

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  const navigate = useNavigate()
  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b-[2.5px] border-amber-600 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shadow"
            style={{ background: 'linear-gradient(135deg, #d97706, #92400e)' }}>🏀</div>
          <span className="font-black text-xl tracking-tight text-amber-800">
            EV<span className="text-amber-600">O</span>
          </span>
        </div>
        <div className="flex gap-2">
          <a href="#accedi"
            className="px-3 py-1.5 border-[1.5px] border-amber-600 text-amber-600 rounded-lg text-sm font-bold">
            Accedi
          </a>
          <button onClick={() => navigate('/registrati')}
            className="px-3 py-1.5 text-white rounded-lg text-sm font-bold shadow"
            style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
            Inizia gratis
          </button>
        </div>
      </div>
    </nav>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const navigate = useNavigate()
  return (
    <section className="px-6 pt-12 pb-11 text-center border-b-2 border-amber-800 shadow-md" style={GRADIENT}>
      <span className="inline-flex items-center gap-1.5 text-white/90 text-[11px] font-bold uppercase tracking-widest
        bg-white/15 border border-white/30 rounded-full px-3 py-1 mb-5">
        🏀 Gestionale per società di basket
      </span>
      <h1 className="text-[36px] font-black leading-[1.08] tracking-tight text-white mb-4"
        style={{ textShadow: '0 2px 12px rgba(0,0,0,.2)' }}>
        Il tuo club.<br />Finalmente <span className="text-amber-100">organizzato.</span>
      </h1>
      <p className="text-[15px] text-white/85 leading-relaxed mb-7 max-w-xs mx-auto">
        EVO è l'app che semplifica la gestione della tua società: calendari, presenze,
        giocatori e comunicazioni — tutto in un posto.
      </p>
      <div className="flex flex-col gap-2.5 mb-9">
        <button onClick={() => navigate('/registrati')}
          className="w-full py-4 bg-white text-amber-800 rounded-xl text-[15px] font-extrabold shadow-lg active:scale-95 transition-transform">
          Registra la tua società →
        </button>
        <a href="#la-soluzione"
          className="w-full py-4 bg-white/15 text-white border-[1.5px] border-white/40 rounded-xl text-[15px] font-semibold text-center block active:scale-95 transition-transform">
          Scopri come funziona ↓
        </a>
      </div>
      {/* Mini preview app */}
      <div className="bg-white rounded-2xl p-3.5 shadow-2xl border border-amber-200 relative z-10">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-amber-600">📅 Settimana corrente</span>
          <span className="text-[10px] text-gray-400">19–25 Mag</span>
        </div>
        {[
          { dot: 'bg-amber-500', label: 'Lun — Allenamento U16', sub: 'Palestra Oderzo · 18:30', badge: '12 ✓', bc: 'bg-amber-50 text-amber-600' },
          { dot: 'bg-blue-500',  label: 'Mar — Partita vs Treviso', sub: 'Palasport · 20:00',       badge: 'FIP',  bc: 'bg-blue-50 text-blue-600' },
          { dot: 'bg-emerald-500', label: 'Gio — Allenamento U18', sub: 'Palestra Oderzo · 19:00', badge: '8 ✓', bc: 'bg-emerald-50 text-emerald-600' },
        ].map((r, i) => (
          <div key={i} className="flex items-center gap-2 bg-amber-50 rounded-lg p-2 mb-1.5 border border-amber-100 last:mb-0">
            <div className={`w-2 h-2 rounded-full shrink-0 ${r.dot}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-stone-800">{r.label}</div>
              <div className="text-[9px] text-gray-400">{r.sub}</div>
            </div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.bc}`}>{r.badge}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Il problema ──────────────────────────────────────────────────────────────

const PAIN_POINTS = [
  { icon: '📋', title: 'Calendari su Excel o carta',       desc: 'Allenamenti e partite sparsi su fogli aggiornati a mano. Un cambiamento e tutto va rifatto.' },
  { icon: '💬', title: 'WhatsApp come canale ufficiale',   desc: 'Comunicazioni importanti perse nei gruppi. Genitori che non leggono, allenatori fuori dal loop.' },
  { icon: '🗂️', title: 'Presenze segnate su carta',        desc: 'Nessuna visione storica per squadra o giocatore. Impossibile fare analisi.' },
  { icon: '📂', title: 'Documenti e quote disorganizzati', desc: 'Certificati scaduti, quote non pagate, anagrafica sempre in ritardo.' },
]

function SectionProblemi() {
  return (
    <section className="bg-white px-6 py-11 border-t-2 border-b-2 border-amber-400 shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-600 mb-2">Il problema</p>
      <h2 className="text-2xl font-black leading-tight tracking-tight text-stone-900 mb-2">
        Gestire un club non dovrebbe essere così complicato.
      </h2>
      <p className="text-sm text-stone-500 leading-relaxed mb-6">
        Ogni settimana perdi ore preziose su task che un'app risolve in secondi.
      </p>
      <div className="space-y-2.5">
        {PAIN_POINTS.map((p, i) => (
          <div key={i}
            className="flex items-start gap-3 bg-amber-50 rounded-xl p-4 border border-amber-100 border-l-[3px] border-l-red-400">
            <span className="text-xl shrink-0 mt-0.5">{p.icon}</span>
            <div>
              <div className="text-[13px] font-bold text-stone-900 mb-1">{p.title}</div>
              <div className="text-[12px] text-stone-500 leading-snug">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── La soluzione ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '📅', title: 'Calendario integrato',  desc: 'Gare FIP + allenamenti. Import federale in un click.' },
  { icon: '✅', title: 'Presenze digitali',      desc: 'In tempo reale. Statistiche per giocatore e squadra.' },
  { icon: '👨‍👩‍👧', title: 'Portale famiglie',     desc: 'Genitori e giocatori vedono solo ciò che li riguarda.' },
  { icon: '📢', title: 'Bacheca ufficiale',      desc: 'Sostituisce WhatsApp. Avvisi archiviati e sempre visibili.' },
  { icon: '🗂️', title: 'Segreteria digitale',   desc: 'Certificati, quote e anagrafica giocatori in ordine.' },
  { icon: '📊', title: 'Report & statistiche',  desc: 'Trend presenze e attività squadra sempre aggiornati.' },
]

function SectionSoluzioni() {
  return (
    <section id="la-soluzione" className="px-6 py-11 border-t-2 border-b-2 border-amber-800 shadow-md" style={GRADIENT}>
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-100 mb-2">La soluzione</p>
      <h2 className="text-2xl font-black leading-tight tracking-tight text-white mb-2">
        Tutto quello che serve. In un'unica app.
      </h2>
      <p className="text-sm text-white/70 leading-relaxed mb-6">
        EVO raccoglie ogni aspetto della tua società in un'interfaccia semplice e mobile-first.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {FEATURES.map((f, i) => (
          <div key={i} className="bg-white/15 rounded-xl p-3.5 border border-white/25">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-lg mb-2">{f.icon}</div>
            <div className="text-[12px] font-bold text-white mb-1">{f.title}</div>
            <div className="text-[10px] text-white/65 leading-snug">{f.desc}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Perché sceglierci ────────────────────────────────────────────────────────

const PERCHE = [
  { n: '1', title: 'Zero formazione necessaria',   desc: 'Interfaccia pensata per allenatori e dirigenti. Se sai usare uno smartphone, sai usare EVO.' },
  { n: '2', title: 'Un ruolo per ogni persona',    desc: 'Admin, allenatore, segreteria, genitore, giocatore: ognuno vede solo ciò che gli serve.' },
  { n: '3', title: 'Calendario FIP già integrato', desc: 'Importa le gare direttamente dalla Federazione. Niente doppio inserimento, niente errori.' },
  { n: '4', title: 'I tuoi dati sono tuoi',        desc: 'Ogni società è isolata e protetta. Dati degli atleti accessibili solo ai tuoi account.' },
]

function SectionPerche() {
  return (
    <section className="bg-white px-6 py-11 border-t-2 border-b-2 border-amber-400 shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-600 mb-2">Perché sceglierci</p>
      <h2 className="text-2xl font-black leading-tight tracking-tight text-stone-900 mb-2">
        Pensato per chi vive il basket sul campo.
      </h2>
      <p className="text-sm text-stone-500 leading-relaxed mb-6">
        Non uno strumento generico — EVO nasce dall'esperienza diretta delle società italiane.
      </p>
      <div className="space-y-5">
        {PERCHE.map((p, i) => (
          <div key={i} className="flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border-2 border-amber-200 text-amber-600
              flex items-center justify-center text-sm font-black shrink-0">{p.n}</div>
            <div>
              <div className="text-sm font-bold text-stone-900 mb-1">{p.title}</div>
              <div className="text-xs text-stone-500 leading-relaxed">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Multi-ruolo ──────────────────────────────────────────────────────────────

function SectionRuoli() {
  return (
    <section className="px-6 py-11 border-t-2 border-b-2 border-amber-800 shadow-md" style={GRADIENT}>
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-100 mb-2">Multi-ruolo</p>
      <h2 className="text-xl font-black text-white mb-2">Un'app. Cinque prospettive.</h2>
      <p className="text-sm text-white/70 leading-relaxed mb-6">
        Ogni membro accede con il proprio profilo personalizzato.
      </p>
      <div className="flex flex-wrap gap-2">
        {['👑 Admin', '🏋️ Allenatore', '📋 Segreteria', '👨‍👩‍👧 Genitore', '🏀 Giocatore'].map((r, i) => (
          <span key={i}
            className="bg-white/18 border-[1.5px] border-white/30 rounded-full px-3.5 py-2 text-xs font-bold text-white">
            {r}
          </span>
        ))}
      </div>
    </section>
  )
}

// ─── Login inline ─────────────────────────────────────────────────────────────

function SectionLogin() {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const inp = 'w-full bg-white border-[1.5px] border-amber-200 rounded-xl px-3.5 py-3 text-sm ' +
    'text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500 mb-3'

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try { await login(email, password) }
    catch (err) { setError(err.message ?? 'Errore di accesso. Controlla email e password.') }
    finally { setLoading(false) }
  }

  return (
    <section id="accedi" className="bg-white px-6 py-11 border-t-2 border-b-2 border-amber-400 shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-600 mb-2">Già registrato</p>
      <h2 className="text-[22px] font-black text-stone-900 mb-4">Accedi al tuo gestionale</h2>
      <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200 shadow-sm">
        <form onSubmit={handleLogin}>
          <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="nome@societa.it" className={inp} />
          <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Password</label>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" className={inp} />
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3.5 text-white rounded-xl text-[15px] font-extrabold shadow-md
              disabled:opacity-60 active:scale-95 transition-transform mt-1"
            style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
            {loading ? 'Accesso...' : 'Accedi →'}
          </button>
        </form>
        <p className="text-center mt-3 text-xs text-stone-400">
          <a href="/login" className="text-amber-600 font-semibold">Password dimenticata?</a>
        </p>
      </div>
    </section>
  )
}

// ─── Registrazione CTA ────────────────────────────────────────────────────────

function SectionRegistrazione() {
  const navigate = useNavigate()
  return (
    <section className="px-6 py-14 border-t-2 border-b-2 border-amber-800 shadow-md" style={GRADIENT}>
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-100 mb-2">Nuova società</p>
      <h2 className="text-[22px] font-black text-white mb-4">Porta EVO nella tua società</h2>
      <div className="bg-white/15 rounded-2xl p-7 border border-white/30 relative overflow-hidden">
        <div className="absolute right-[-10px] top-[-10px] text-[90px] opacity-10 rotate-12 pointer-events-none">🏀</div>
        <span className="inline-flex items-center gap-1 bg-white/20 border border-white/25 text-white
          rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider mb-3.5">
          ✦ Gratuito per iniziare
        </span>
        <h3 className="text-[22px] font-black text-white tracking-tight mb-1.5">Inizia oggi.</h3>
        <p className="text-[13px] text-white/75 leading-snug mb-5">
          Compila il modulo, il nostro team configura la tua società entro 24 ore.
          Nessuna carta di credito richiesta.
        </p>
        <button onClick={() => navigate('/registrati')}
          className="w-full py-4 bg-white text-amber-800 rounded-xl text-[15px] font-black shadow-lg active:scale-95 transition-transform">
          Registra la tua società →
        </button>
        <p className="text-center mt-3 text-[11px] text-white/50">
          Attivazione entro 24h · Supporto incluso · Dati sicuri
        </p>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-white px-6 py-7 text-center border-t-2 border-amber-400">
      <div className="text-base font-black text-amber-600 mb-1">EVO 🏀</div>
      <p className="text-[11px] text-stone-400">Il gestionale per il basket italiano.</p>
      <p className="text-[11px] text-stone-300 mt-1.5">© 2026 EVO · Tutti i diritti riservati</p>
    </footer>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <SectionProblemi />
      <SectionSoluzioni />
      <SectionPerche />
      <SectionRuoli />
      <SectionLogin />
      <SectionRegistrazione />
      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: Verifica visiva** — avvia il dev server (`npm run dev` nella cartella `frontend`) e apri `http://localhost:5173` senza essere autenticato. Dovresti vedere la landing page scrollabile. Dopo il Task 3 (routing) sarà accessibile su `/`.

---

## Task 3 — `App.jsx`: routing pubblico

**File:**
- Modifica: `frontend/src/App.jsx`

- [ ] **Step 1: Aggiungi gli import**

In cima al file, dopo gli import esistenti, aggiungi:

```jsx
import LandingPage      from './pages/LandingPage'
import RegistrazionePage from './pages/RegistrazionePage'
```

- [ ] **Step 2: Modifica la route `/` in `AppShell`**

Trova la riga:
```jsx
<Route path="/login" element={<LoginPage />} />
```

Subito dopo aggiorna la route `/` e aggiungi `/registrati`:

```jsx
<Route path="/login"      element={<LoginPage />} />
<Route path="/registrati" element={<RegistrazionePage />} />

{/* Root → landing se non autenticato, redirect ruolo se autenticato */}
<Route path="/"
  element={user
    ? <ProtectedRoute><RoleRedirect /></ProtectedRoute>
    : <LandingPage />}
/>
```

Nota: la variabile `user` è già disponibile in `AppShell` tramite `useAuth()`.

- [ ] **Step 3: Rimuovi il vecchio `<Route path="/" ...>` duplicato**

Più in basso nel return ci sarà ancora la vecchia:
```jsx
<Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
```
Eliminala per evitare conflitti di route.

- [ ] **Step 4: Verifica**

Con il dev server attivo: visita `/` senza login → deve apparire `LandingPage`. Esegui il login dalla sezione "Accedi" nella landing → deve reindirizzare al ruolo corretto.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/LandingPage.jsx
git commit -m "feat: landing page pubblica EVO su route /"
```

---

## Task 4 — `RegistrazionePage.jsx`

**File:**
- Crea: `frontend/src/pages/RegistrazionePage.jsx`

- [ ] **Step 1: Crea il file**

```jsx
// frontend/src/pages/RegistrazionePage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const GRADIENT = { background: 'linear-gradient(160deg, #c2410c 0%, #d97706 50%, #f59e0b 100%)' }

function toSlug(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

const inp = 'w-full bg-white border-[1.5px] border-amber-200 rounded-xl px-3.5 py-3 text-sm ' +
  'text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500'

export default function RegistrazionePage() {
  const navigate  = useNavigate()
  const [form, setForm] = useState({
    nome: '', ref_nome: '', ref_cognome: '', ref_email: '', ref_citta: '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [done,    setDone]    = useState(false)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.from('societa').insert([{
      nome:        form.nome.trim(),
      slug:        toSlug(form.nome),
      piano:       'free',
      stato:       'pending',
      ref_nome:    form.ref_nome.trim(),
      ref_cognome: form.ref_cognome.trim(),
      ref_email:   form.ref_email.trim().toLowerCase(),
      ref_citta:   form.ref_citta.trim() || null,
    }])
    setLoading(false)
    if (err) { setError(err.message); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={GRADIENT}>
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-black text-stone-900 mb-3">Richiesta inviata!</h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-6">
            Il nostro team attiverà il tuo account entro 24 ore.<br />
            Ti contatteremo all'indirizzo{' '}
            <strong className="text-amber-700">{form.ref_email}</strong>.
          </p>
          <button onClick={() => navigate('/')}
            className="w-full py-3.5 text-white rounded-xl font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
            Torna alla home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={GRADIENT}>
      {/* Navbar minimale */}
      <nav className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg">🏀</div>
          <span className="font-black text-xl text-white tracking-tight">EVO</span>
        </button>
        <button onClick={() => navigate('/')} className="text-white/70 text-sm font-medium">
          ← Torna alla home
        </button>
      </nav>

      <div className="px-6 pb-12">
        <h1 className="text-2xl font-black text-white mb-1">Registra la tua società</h1>
        <p className="text-sm text-white/75 mb-6">Compila il modulo per richiedere l'attivazione.</p>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Nome società *</label>
              <input value={form.nome} onChange={e => setF('nome', e.target.value)}
                className={inp} placeholder="es. Oderzo Basket" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Nome *</label>
                <input value={form.ref_nome} onChange={e => setF('ref_nome', e.target.value)}
                  className={inp} placeholder="Mario" required />
              </div>
              <div>
                <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Cognome *</label>
                <input value={form.ref_cognome} onChange={e => setF('ref_cognome', e.target.value)}
                  className={inp} placeholder="Rossi" required />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Email *</label>
              <input type="email" value={form.ref_email} onChange={e => setF('ref_email', e.target.value)}
                className={inp} placeholder="mario.rossi@societa.it" required />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-800 mb-1.5 block">Città</label>
              <input value={form.ref_citta} onChange={e => setF('ref_citta', e.target.value)}
                className={inp} placeholder="es. Oderzo (facoltativo)" />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-4 text-white rounded-xl text-[15px] font-extrabold shadow-md
                disabled:opacity-60 active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
              {loading ? 'Invio in corso...' : 'Invia richiesta →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifica**

Naviga su `/registrati`. Compila il form con dati di test e submit. Dovresti vedere la schermata di conferma. Verifica in Supabase dashboard → Table Editor → `societa` che sia apparsa una riga con `stato='pending'`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/RegistrazionePage.jsx frontend/src/App.jsx
git commit -m "feat: pagina registrazione società con conferma"
```

---

## Task 5 — `PlatformPage.jsx`: gestione società pending

**File:**
- Modifica: `frontend/src/pages/PlatformPage.jsx`

- [ ] **Step 1: Aggiorna la query in `SocietaTab` per includere i nuovi campi**

Trova la query in `SocietaTab`:
```jsx
const { data: societa = [], isLoading } = useQuery({
  queryKey: ['platform-societa'],
  queryFn: async () => {
    const { data, error } = await supabase.from('societa').select('*').order('nome')
```
Nessuna modifica necessaria — `select('*')` include già i nuovi campi.

- [ ] **Step 2: Aggiungi stato per il modal di approvazione in `SocietaTab`**

All'interno di `function SocietaTab()`, dopo gli useState esistenti aggiungi:

```jsx
const [approveRow,  setApproveRow]  = useState(null)   // society da approvare
const [approveForm, setApproveForm] = useState({ nome: '', cognome: '', password: '' })
const [approvingId, setApprovingId] = useState(null)
const [approveErr,  setApproveErr]  = useState(null)
const [showApprovePwd, setShowApprovePwd] = useState(false)
```

- [ ] **Step 3: Aggiungi la funzione `handleApprove` in `SocietaTab`**

Dopo gli useState aggiunti nel passo precedente, aggiungi:

```jsx
function openApprove(s) {
  setApproveRow(s)
  setApproveForm({ nome: s.ref_nome ?? '', cognome: s.ref_cognome ?? '', password: '' })
  setApproveErr(null)
}

function closeApprove() {
  setApproveRow(null)
  setApproveErr(null)
  setShowApprovePwd(false)
}

function generateApprovePwd() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let pwd = ''
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  setApproveForm(f => ({ ...f, password: pwd }))
  setShowApprovePwd(true)
}

async function handleApprove(e) {
  e.preventDefault()
  if (!approveRow) return
  setApprovingId(approveRow.id)
  setApproveErr(null)
  try {
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: approveRow.ref_email,
      password: approveForm.password,
      options: {
        data: {
          nome:       approveForm.nome.trim(),
          cognome:    approveForm.cognome.trim(),
          ruolo:      'admin',
          societa_id: approveRow.id,
        },
      },
    })
    if (signUpErr) throw signUpErr

    if (signUpData?.user?.id) {
      const { error: profErr } = await supabase.from('profiles').upsert([{
        id:         signUpData.user.id,
        email:      approveRow.ref_email,
        nome:       approveForm.nome.trim()    || null,
        cognome:    approveForm.cognome.trim() || null,
        ruolo:      'admin',
        societa_id: approveRow.id,
        attivo:     true,
      }], { onConflict: 'id' })
      if (profErr) throw profErr
    }

    const { error: stateErr } = await supabase
      .from('societa').update({ stato: 'attiva' }).eq('id', approveRow.id)
    if (stateErr) throw stateErr

    qc.invalidateQueries({ queryKey: ['platform-societa'] })
    qc.invalidateQueries({ queryKey: ['platform-all'] })
    qc.invalidateQueries({ queryKey: ['platform-admins'] })
    closeApprove()
  } catch (err) {
    setApproveErr(err.message)
  } finally {
    setApprovingId(null)
  }
}

const rifiutaMut = useMutation({
  mutationFn: async (id) => {
    const { error } = await supabase.from('societa').delete().eq('id', id)
    if (error) throw error
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['platform-societa'] })
    qc.invalidateQueries({ queryKey: ['platform-all'] })
  },
})
```

- [ ] **Step 4: Aggiorna il JSX della lista società in `SocietaTab`**

Trova il blocco che mappa le società (dentro `societa.map(s => (...))`). Aggiorna la card per mostrare il badge pending e i bottoni approva/rifiuta:

```jsx
{societa.map(s => (
  <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-3">
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">{s.nome}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            s.piano === 'pro' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {s.piano === 'pro' ? '⭐ Pro' : 'Free'}
          </span>
          {s.stato === 'pending' && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
              ⏳ In attesa
            </span>
          )}
        </div>
        {s.stato === 'pending' && s.ref_email && (
          <p className="text-xs text-blue-500 mt-0.5 truncate">{s.ref_email}</p>
        )}
        <p className="text-xs text-gray-300 mt-0.5 font-mono truncate">{s.id}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        {s.stato === 'pending' ? (
          <>
            <button onClick={() => openApprove(s)}
              className="px-2 py-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg text-xs font-semibold transition-colors">
              Approva
            </button>
            <button
              onClick={() => window.confirm(`Rifiutare la richiesta di "${s.nome}"?`) && rifiutaMut.mutate(s.id)}
              className="px-2 py-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-semibold transition-colors">
              Rifiuta
            </button>
          </>
        ) : (
          <>
            <button onClick={() => openEdit(s)}
              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => window.confirm(`Eliminare "${s.nome}"?\nTutti i dati associati saranno persi.`) && delMut.mutate(s.id)}
              className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  </div>
))}
```

- [ ] **Step 5: Aggiungi il modal di approvazione alla fine del return di `SocietaTab`**

Appena prima del `</div>` finale del return di `SocietaTab`, dopo il blocco `{showForm && ...}`, aggiungi:

```jsx
{approveRow && (
  <Modal title={`Approva — ${approveRow.nome}`} onClose={closeApprove}>
    <form onSubmit={handleApprove} className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
        Account admin per: <strong>{approveRow.ref_email}</strong>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome">
          <input value={approveForm.nome}
            onChange={e => setApproveForm(f => ({ ...f, nome: e.target.value }))}
            className={inp} placeholder="Mario" />
        </Field>
        <Field label="Cognome">
          <input value={approveForm.cognome}
            onChange={e => setApproveForm(f => ({ ...f, cognome: e.target.value }))}
            className={inp} placeholder="Rossi" />
        </Field>
      </div>
      <Field label="Password iniziale *">
        <div className="flex gap-2">
          <input
            type={showApprovePwd ? 'text' : 'password'}
            value={approveForm.password}
            onChange={e => setApproveForm(f => ({ ...f, password: e.target.value }))}
            className={`${inp} flex-1`}
            placeholder="Almeno 6 caratteri"
            required minLength={6}
          />
          <button type="button" onClick={generateApprovePwd}
            className="shrink-0 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">
            Genera
          </button>
        </div>
        <button type="button" onClick={() => setShowApprovePwd(v => !v)}
          className="text-xs text-blue-500 mt-1">
          {showApprovePwd ? 'Nascondi' : 'Mostra'} password
        </button>
      </Field>
      {approveErr && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-600">
          {approveErr}
        </div>
      )}
      <button type="submit" disabled={!!approvingId}
        className="w-full py-3 bg-green-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform">
        {approvingId ? 'Approvazione...' : 'Approva e crea account'}
      </button>
    </form>
  </Modal>
)}
```

- [ ] **Step 6: Aggiorna `DashboardTab` per mostrare il contatore pending**

All'inizio di `DashboardTab`, dopo `const freeCount = ...`, aggiungi:
```jsx
const pendingCount = societa.filter(s => s.stato === 'pending').length
```

Poi nel blocco delle stat card, aggiungi una quarta card:
```jsx
{pendingCount > 0 && (
  <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100 text-center">
    <span className="text-xl">⏳</span>
    <div className="text-2xl font-bold text-orange-600 mt-1">{pendingCount}</div>
    <div className="text-xs text-gray-400">In attesa</div>
  </div>
)}
```

- [ ] **Step 7: Verifica**

Accedi come super_admin. Vai in PlatformPage → tab Società. Le società con `stato='pending'` devono mostrare badge arancione e bottoni Approva/Rifiuta. Clicca Approva, genera una password, conferma → verifica che la società diventi 'attiva' e che appaia un nuovo admin nella tab Admin.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/PlatformPage.jsx
git commit -m "feat: gestione società pending con approvazione in PlatformPage"
```

---

## Task 6 — `guide.json`: contenuto guida

**File:**
- Crea: `frontend/src/data/guide.json`

- [ ] **Step 1: Crea la directory e il file**

```bash
mkdir -p frontend/src/data
```

- [ ] **Step 2: Scrivi il contenuto**

```json
{
  "/admin": {
    "titolo": "Dashboard Admin",
    "sezioni": [
      { "titolo": "Panoramica", "testo": "La dashboard mostra un riepilogo delle partite della settimana, degli allenamenti in programma e delle ultime comunicazioni." },
      { "titolo": "Navigazione", "testo": "Usa la barra in basso per spostarti tra Calendario, Presenze, Bacheca e Setup. Il tasto Setup apre le impostazioni della società." }
    ]
  },
  "/admin/partite": {
    "titolo": "Calendario",
    "sezioni": [
      { "titolo": "Aggiungere un evento", "testo": "Tocca il tasto + in alto a destra per creare una partita o un allenamento. Puoi scegliere squadra, orario e palestra." },
      { "titolo": "Navigare le settimane", "testo": "Usa le frecce ‹ › per spostarti di settimana in settimana. Il tasto 'Oggi' torna alla settimana corrente." },
      { "titolo": "Modificare un evento", "testo": "Tocca un evento nella griglia per aprire il pannello di modifica. Puoi cambiare orario, spostare la partita o annullarla." },
      { "titolo": "Import FIP", "testo": "Vai su Coach → Importa Calendario per importare le gare dalla Federazione. Gli eventi FIP appaiono in blu." }
    ]
  },
  "/admin/presenze": {
    "titolo": "Presenze",
    "sezioni": [
      { "titolo": "Registrare le presenze", "testo": "Seleziona un allenamento dalla lista e spunta i giocatori presenti. Le modifiche si salvano automaticamente." },
      { "titolo": "Statistiche", "testo": "Per ogni giocatore viene calcolata la percentuale di presenze sul totale degli allenamenti della stagione." }
    ]
  },
  "/admin/bacheca": {
    "titolo": "Bacheca",
    "sezioni": [
      { "titolo": "Pubblicare un avviso", "testo": "Tocca + per creare un nuovo annuncio. Puoi scegliere il destinatario (tutte le squadre o una specifica) e la priorità." },
      { "titolo": "Chi può scrivere", "testo": "Solo Admin, Allenatori e Segreteria possono pubblicare. Genitori e Giocatori possono solo leggere." }
    ]
  },
  "/admin/setup": {
    "titolo": "Setup",
    "sezioni": [
      { "titolo": "Configurazione società", "testo": "Da qui puoi gestire squadre, utenti, palestre e le impostazioni generali della tua società." },
      { "titolo": "Invitare nuovi utenti", "testo": "Vai in 'Utenti' per aggiungere allenatori, segreteria, genitori e giocatori. Ogni utente riceve un'email con le credenziali." }
    ]
  },
  "/admin/persone": {
    "titolo": "Gestione Utenti",
    "sezioni": [
      { "titolo": "Aggiungere un utente", "testo": "Tocca + per invitare un nuovo membro. Scegli il ruolo (allenatore, segreteria, genitore, giocatore) e compila i dati." },
      { "titolo": "Ruoli extra", "testo": "Un utente può avere più ruoli. Ad esempio un allenatore può avere anche il ruolo segreteria. I ruoli extra si aggiungono dalla card utente." }
    ]
  },
  "/coach": {
    "titolo": "Home Allenatore",
    "sezioni": [
      { "titolo": "I tuoi prossimi eventi", "testo": "La home mostra gli allenamenti e le partite delle tue squadre per la settimana corrente." },
      { "titolo": "Accesso rapido", "testo": "Usa la barra in basso per passare a Calendario, Attività (presenze e statistiche) e Bacheca." }
    ]
  },
  "/coach/calendario": {
    "titolo": "Calendario Allenatore",
    "sezioni": [
      { "titolo": "Filtrare per squadra", "testo": "Il selettore in cima mostra solo gli eventi delle tue squadre assegnate. Puoi disattivarlo per vedere tutto." },
      { "titolo": "Aggiungere un allenamento", "testo": "Tocca + per creare un nuovo allenamento. Solo le squadre di cui sei allenatore sono selezionabili." }
    ]
  },
  "/coach/attivita": {
    "titolo": "Attività",
    "sezioni": [
      { "titolo": "Registrare presenze", "testo": "Seleziona un allenamento dalla lista e spunta i giocatori presenti. Salva con il tasto in fondo." },
      { "titolo": "Statistiche giocatori", "testo": "La tab 'Statistiche' mostra il riepilogo delle presenze per ogni giocatore delle tue squadre." }
    ]
  },
  "/coach/bacheca": {
    "titolo": "Bacheca",
    "sezioni": [
      { "titolo": "Pubblicare un avviso", "testo": "Tocca + per creare un annuncio. Come allenatore puoi scrivere a tutte le squadre o solo alle tue." }
    ]
  },
  "/secretary": {
    "titolo": "Dashboard Segreteria",
    "sezioni": [
      { "titolo": "Panoramica", "testo": "La dashboard mostra le scadenze imminenti: certificati medici in scadenza, quote non pagate e nuove iscrizioni." }
    ]
  },
  "/secretary/giocatori": {
    "titolo": "Giocatori",
    "sezioni": [
      { "titolo": "Cercare un giocatore", "testo": "Usa la barra di ricerca in cima per filtrare per nome o squadra. Tocca una riga per aprire il dettaglio." },
      { "titolo": "Aggiungere un giocatore", "testo": "Tocca + per registrare un nuovo giocatore. Puoi associarlo subito a una squadra e a un genitore." }
    ]
  },
  "/secretary/bacheca": {
    "titolo": "Bacheca",
    "sezioni": [
      { "titolo": "Comunicazioni ufficiali", "testo": "La segreteria può pubblicare avvisi a tutta la società o a squadre specifiche." }
    ]
  },
  "/parent": {
    "titolo": "Home Genitore",
    "sezioni": [
      { "titolo": "I tuoi figli", "testo": "La home mostra i prossimi eventi per i figli registrati al tuo account. Se hai più figli, puoi passare da uno all'altro." },
      { "titolo": "Navigazione", "testo": "Usa la barra in basso per Calendario, Comunicazioni, Quote e Bacheca." }
    ]
  },
  "/parent/calendario": {
    "titolo": "Calendario Genitore",
    "sezioni": [
      { "titolo": "Visualizzazione", "testo": "Il calendario mostra partite e allenamenti del tuo figlio, ordinati per data. Gli eventi futuri sono in evidenza." }
    ]
  },
  "/parent/comunicazioni": {
    "titolo": "Comunicazioni",
    "sezioni": [
      { "titolo": "Leggere i messaggi", "testo": "Qui trovi tutti i messaggi inviati dalla società al tuo figlio o alla sua squadra." }
    ]
  },
  "/parent/quote": {
    "titolo": "Quote",
    "sezioni": [
      { "titolo": "Stato pagamenti", "testo": "Visualizza le quote associtae al tuo figlio e il relativo stato (pagato, in attesa, scaduto)." }
    ]
  },
  "/parent/bacheca": {
    "titolo": "Bacheca",
    "sezioni": [
      { "titolo": "Avvisi della società", "testo": "Qui appaiono gli annunci pubblicati dall'amministrazione, dagli allenatori e dalla segreteria." }
    ]
  },
  "/player": {
    "titolo": "Home Giocatore",
    "sezioni": [
      { "titolo": "I tuoi prossimi eventi", "testo": "La home mostra i prossimi allenamenti e partite della tua squadra con data, orario e palestra." },
      { "titolo": "Navigazione", "testo": "Usa la barra in basso per Comunicazioni, Calendario e Bacheca." }
    ]
  },
  "/player/comunicazioni": {
    "titolo": "Comunicazioni",
    "sezioni": [
      { "titolo": "Messaggi ricevuti", "testo": "Qui trovi i messaggi inviati dall'allenatore o dalla società alla tua squadra." }
    ]
  },
  "/player/calendario": {
    "titolo": "Calendario Giocatore",
    "sezioni": [
      { "titolo": "Visualizzazione verticale", "testo": "Gli eventi sono elencati in ordine cronologico. Allenamenti in arancione, partite in blu." },
      { "titolo": "Dettaglio evento", "testo": "Tocca un evento per vedere indirizzo della palestra, orario e note dell'allenatore." }
    ]
  },
  "/player/bacheca": {
    "titolo": "Bacheca",
    "sezioni": [
      { "titolo": "Avvisi", "testo": "Qui appaiono gli annunci pubblicati dall'allenatore e dalla società rivolti alla tua squadra." }
    ]
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/data/guide.json
git commit -m "feat: guide.json con contenuto contestuale per tutte le route"
```

---

## Task 7 — `GuideDrawer.jsx`

**File:**
- Crea: `frontend/src/components/GuideDrawer.jsx`

- [ ] **Step 1: Crea il componente**

```jsx
// frontend/src/components/GuideDrawer.jsx
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { X, HelpCircle } from 'lucide-react'
import guideData from '../data/guide.json'

function normalizePath(pathname) {
  // Rimuove segmenti numerici finali per route dinamiche
  // es. /secretary/giocatori/123 → /secretary/giocatori
  return pathname.replace(/\/\d+$/, '')
}

export default function GuideDrawer() {
  const [open, setOpen]   = useState(false)
  const location          = useLocation()
  const path              = normalizePath(location.pathname)
  const guide             = guideData[path] ?? null

  return (
    <>
      {/* Bottone ? fisso */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 w-11 h-11 rounded-full text-white shadow-lg
          flex items-center justify-center z-[200] active:scale-95 transition-transform"
        style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}
        aria-label="Apri guida"
      >
        <HelpCircle size={20} strokeWidth={2.2} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[190]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`fixed left-0 right-0 bottom-0 z-[200] bg-white rounded-t-2xl
          border-t-2 border-amber-500 shadow-2xl transition-transform duration-300
          max-w-lg mx-auto ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '70vh' }}
      >
        {/* Maniglia */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-base text-stone-800">
            {guide ? `📖 ${guide.titolo}` : '📖 Guida'}
          </h3>
          <button onClick={() => setOpen(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Contenuto scrollabile */}
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: 'calc(70vh - 100px)' }}>
          {guide ? (
            <div className="space-y-5">
              {guide.sezioni.map((s, i) => (
                <div key={i}>
                  <h4 className="text-sm font-bold text-amber-700 mb-1.5">{s.titolo}</h4>
                  <p className="text-sm text-stone-600 leading-relaxed">{s.testo}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">🤷</p>
              <p className="text-sm text-stone-400">Nessuna guida disponibile per questa pagina.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/GuideDrawer.jsx
git commit -m "feat: GuideDrawer bottom sheet con contenuto contestuale"
```

---

## Task 8 — Aggiungere `GuideDrawer` ai 5 layout

**File:**
- Modifica: `frontend/src/layouts/AdminLayout.jsx`
- Modifica: `frontend/src/layouts/CoachLayout.jsx`
- Modifica: `frontend/src/layouts/ParentLayout.jsx`
- Modifica: `frontend/src/layouts/PlayerLayout.jsx`
- Modifica: `frontend/src/layouts/SecretaryLayout.jsx`

- [ ] **Step 1: `AdminLayout.jsx`** — aggiungi import e componente

Aggiungi l'import dopo gli import esistenti:
```jsx
import GuideDrawer from '../components/GuideDrawer'
```

Nel return, aggiungi `<GuideDrawer />` subito prima del `</div>` finale:
```jsx
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        {/* ... nav items invariati ... */}
      </nav>
      <GuideDrawer />
    </div>
  )
```

- [ ] **Step 2: `CoachLayout.jsx`** — stesso pattern

```jsx
import GuideDrawer from '../components/GuideDrawer'
// ...
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        {/* ... nav items invariati ... */}
      </nav>
      <GuideDrawer />
    </div>
  )
```

- [ ] **Step 3: `ParentLayout.jsx`** — stesso pattern

```jsx
import GuideDrawer from '../components/GuideDrawer'
// ...
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        {/* ... nav items invariati ... */}
      </nav>
      <GuideDrawer />
    </div>
  )
```

- [ ] **Step 4: `PlayerLayout.jsx`** — stesso pattern

```jsx
import GuideDrawer from '../components/GuideDrawer'
// ...
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        {/* ... nav items invariati ... */}
      </nav>
      <GuideDrawer />
    </div>
  )
```

- [ ] **Step 5: `SecretaryLayout.jsx`** — stesso pattern

```jsx
import GuideDrawer from '../components/GuideDrawer'
// ...
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        {/* ... nav items invariati ... */}
      </nav>
      <GuideDrawer />
    </div>
  )
```

- [ ] **Step 6: Verifica**

Accedi con un qualunque ruolo. In ogni pagina autenticata deve apparire un bottone arancione `?` in basso a destra, sopra la bottom nav. Cliccalo: deve aprirsi il drawer con la guida contestuale della pagina corrente.

- [ ] **Step 7: Commit finale**

```bash
git add frontend/src/layouts/AdminLayout.jsx \
        frontend/src/layouts/CoachLayout.jsx \
        frontend/src/layouts/ParentLayout.jsx \
        frontend/src/layouts/PlayerLayout.jsx \
        frontend/src/layouts/SecretaryLayout.jsx
git commit -m "feat: GuideDrawer aggiunto a tutti i layout"
```

---

## Checklist finale

- [ ] Migration SQL eseguita in Supabase (Task 1 Step 2)
- [ ] Route `/` mostra landing page agli utenti non autenticati
- [ ] Login inline nella landing funziona e reindirizza al ruolo
- [ ] Route `/registrati` accessibile senza login, form funzionante
- [ ] Dopo submit registrazione, riga in `societa` con `stato='pending'`
- [ ] PlatformPage mostra badge "In attesa" e permette approva/rifiuta
- [ ] Approvazione crea account admin e mette `stato='attiva'`
- [ ] Bottone `?` visibile su tutte le pagine autenticate
- [ ] Drawer si apre/chiude correttamente
- [ ] Contenuto guida corretto per ogni route
