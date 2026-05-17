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
