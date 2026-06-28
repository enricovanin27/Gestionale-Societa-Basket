// frontend/src/pages/LandingPage.jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'

const GRAD      = { background: 'linear-gradient(160deg, #c2410c 0%, #d97706 50%, #f59e0b 100%)' }
const GRAD_BTN  = { background: 'linear-gradient(135deg, #d97706, #b45309)' }
const GRAD_LOGO = { background: 'linear-gradient(135deg, #d97706, #92400e)' }

const ROLES = [
  { id: 'admin',     label: '👑 Resp. Tecnico' },
  { id: 'coach',     label: '🏋️ Allenatore' },
  { id: 'secretary', label: '📋 Segreteria' },
  { id: 'parent',    label: '👨‍👩‍👧 Genitore' },
  { id: 'player',    label: '🏀 Giocatore' },
]

// ─── helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children, light }) {
  return (
    <p className={`text-[10.5px] font-extrabold uppercase tracking-[.12em] mb-1.5 ${light ? 'text-amber-100' : 'text-amber-600'}`}>
      {children}
    </p>
  )
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-white/15 border border-white/25 rounded-xl p-4 flex items-start gap-3">
      <span className="text-2xl shrink-0">{icon}</span>
      <div>
        <div className="text-sm font-bold text-white mb-0.5">{title}</div>
        <div className="text-xs text-white/70 leading-snug">{desc}</div>
      </div>
    </div>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b-2 border-amber-500 shadow-sm">
      <div className="max-w-3xl mx-auto flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shadow" style={GRAD_LOGO}>🏀</div>
          <span className="font-black text-xl tracking-tight text-amber-800">EV<span className="text-amber-600">O</span></span>
        </div>
        <div className="flex items-center gap-4 text-sm font-semibold text-stone-500">
          <a href="#soluzione" className="hover:text-amber-600 transition-colors hidden sm:block">Funzionalità</a>
          <a href="#demo"      className="hover:text-amber-600 transition-colors hidden sm:block">Ruoli</a>
          <a href="#contatti"  className="hover:text-amber-600 transition-colors hidden sm:block">Contatti</a>
          <Link to="/login"
            className="px-4 py-2 text-white rounded-lg text-sm font-bold shadow"
            style={GRAD_BTN}>
            Accedi
          </Link>
        </div>
      </div>
    </nav>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="px-6 pt-14 pb-12 text-center border-b-2 border-amber-900" style={GRAD}>
      <span className="inline-flex items-center gap-1.5 text-white/90 text-[10.5px] font-bold uppercase tracking-widest bg-white/15 border border-white/30 rounded-full px-3.5 py-1.5 mb-6">
        🏀 Gestionale per società di basket
      </span>
      <h1 className="text-4xl sm:text-5xl font-black leading-[1.06] tracking-tight text-white mb-5"
        style={{ textShadow: '0 2px 16px rgba(0,0,0,.22)' }}>
        Il tuo club.<br />
        Finalmente <span className="text-amber-100">organizzato.</span>
      </h1>
      <p className="text-[15px] text-white/80 leading-relaxed mb-8 max-w-sm mx-auto">
        EVO semplifica la gestione della tua società: calendari, presenze,
        giocatori e comunicazioni — tutto in un posto, da qualsiasi dispositivo.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
        <a href="#demo"
          className="py-4 px-8 bg-white text-amber-800 rounded-xl text-[15px] font-extrabold shadow-lg active:scale-95 transition-transform">
          📱 Vedi la demo ↓
        </a>
        <a href="#soluzione"
          className="py-4 px-8 bg-white/15 text-white border-[1.5px] border-white/40 rounded-xl text-[15px] font-semibold active:scale-95 transition-transform">
          Scopri le funzionalità ↓
        </a>
      </div>
      {/* mini preview */}
      <div className="max-w-xs mx-auto bg-white rounded-2xl p-4 shadow-2xl border border-amber-200 text-left">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-amber-600">📅 Settimana corrente</span>
          <span className="text-[10px] text-gray-400">Lun — Dom</span>
        </div>
        <div className="space-y-1.5">
          {[
            { dot:'bg-amber-500', bg:'bg-amber-50 border-amber-100',   label:'Lun — Allenamento U16',    sub:'Palestra · 18:30',  badge:'12 ✓', bc:'bg-amber-100 text-amber-700' },
            { dot:'bg-blue-500',  bg:'bg-blue-50 border-blue-100',     label:'Mar — Partita vs Treviso', sub:'Palasport · 20:00', badge:'FIP',  bc:'bg-blue-100 text-blue-700'   },
            { dot:'bg-emerald-500',bg:'bg-emerald-50 border-emerald-100',label:'Gio — Allenamento U18', sub:'Palestra · 19:00',  badge:'8 ✓',  bc:'bg-emerald-100 text-emerald-700'},
          ].map((r, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-lg p-2.5 border ${r.bg}`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${r.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-stone-800">{r.label}</div>
                <div className="text-[9px] text-gray-400">{r.sub}</div>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.bc}`}>{r.badge}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Il problema ──────────────────────────────────────────────────────────────

const PAIN_POINTS = [
  { icon:'📋', title:'Calendari su Excel o carta',       desc:'Allenamenti e partite sparsi su fogli aggiornati a mano. Un cambiamento e tutto va rifatto.' },
  { icon:'💬', title:'WhatsApp come canale ufficiale',   desc:'Comunicazioni importanti perse nei gruppi. Genitori che non leggono, allenatori fuori dal loop.' },
  { icon:'🗂️', title:'Presenze segnate su carta',        desc:'Nessuna visione storica per squadra o giocatore. Impossibile fare analisi.' },
  { icon:'📂', title:'Documenti e quote disorganizzati', desc:'Certificati scaduti, quote non pagate, anagrafica sempre in ritardo.' },
]

function SectionProblemi() {
  return (
    <section className="bg-white px-6 py-12 border-b-2 border-amber-200">
      <div className="max-w-2xl mx-auto">
        <SectionLabel>Il problema</SectionLabel>
        <h2 className="text-2xl sm:text-3xl font-black leading-tight text-stone-900 mb-2">
          Gestire un club non dovrebbe essere così complicato.
        </h2>
        <p className="text-sm text-stone-500 leading-relaxed mb-7">
          Ogni settimana perdi ore preziose su task che un'app risolve in secondi.
        </p>
        <div className="space-y-3">
          {PAIN_POINTS.map((p, i) => (
            <div key={i} className="flex items-start gap-3.5 bg-red-50 rounded-xl p-4 border border-red-100 border-l-4 border-l-red-400">
              <span className="text-2xl shrink-0 mt-0.5">{p.icon}</span>
              <div>
                <div className="text-[13px] font-bold text-stone-900 mb-1">{p.title}</div>
                <div className="text-[12px] text-stone-500 leading-snug">{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── La soluzione ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon:'📅', title:'Calendario integrato',  desc:'Gare FIP + allenamenti. Import dalla Federazione in un click.' },
  { icon:'✅', title:'Presenze digitali',      desc:'Registro appello in tempo reale. Statistiche per giocatore e squadra.' },
  { icon:'👨‍👩‍👧', title:'Portale famiglie',     desc:'Genitori e giocatori vedono solo ciò che li riguarda.' },
  { icon:'📢', title:'Bacheca ufficiale',      desc:'Sostituisce WhatsApp. Avvisi archiviati e sempre visibili.' },
  { icon:'🗂️', title:'Segreteria digitale',   desc:'Certificati medici, quote, anagrafica giocatori in ordine.' },
  { icon:'💰', title:'Contabilità',            desc:'Spese, entrate e bilancio visivo della società sempre aggiornato.' },
  { icon:'📊', title:'Report & statistiche',  desc:'Trend presenze e attività squadra mese per mese.' },
  { icon:'🔒', title:'Dati sicuri',            desc:'Ogni società è isolata. I dati degli atleti sono accessibili solo ai tuoi account.' },
]

function SectionSoluzioni() {
  return (
    <section id="soluzione" className="px-6 py-12 border-b-2 border-amber-900" style={GRAD}>
      <div className="max-w-2xl mx-auto">
        <SectionLabel light>La soluzione</SectionLabel>
        <h2 className="text-2xl sm:text-3xl font-black leading-tight text-white mb-2">
          Tutto quello che serve. In un'unica app.
        </h2>
        <p className="text-sm text-white/70 leading-relaxed mb-7">
          EVO raccoglie ogni aspetto della tua società in un'interfaccia semplice, moderna e mobile-first.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-white/15 rounded-xl p-4 border border-white/25">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-xl mb-3">{f.icon}</div>
              <div className="text-[13px] font-bold text-white mb-1">{f.title}</div>
              <div className="text-[11px] text-white/65 leading-snug">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Perché EVO ───────────────────────────────────────────────────────────────

const PERCHE = [
  { n:'1', title:'Zero formazione necessaria',   desc:'Interfaccia pensata per allenatori e dirigenti. Se sai usare uno smartphone, sai usare EVO.' },
  { n:'2', title:'Un ruolo per ogni persona',    desc:'Responsabile tecnico, allenatore, segreteria, genitore, giocatore: ognuno vede solo ciò che gli serve.' },
  { n:'3', title:'Calendario FIP già integrato', desc:'Importa le gare direttamente dalla Federazione. Niente doppio inserimento, niente errori.' },
  { n:'4', title:'I tuoi dati sono tuoi',        desc:'Ogni società è isolata e protetta. I dati degli atleti sono accessibili solo agli account della tua organizzazione.' },
]

function SectionPerche() {
  return (
    <section className="bg-white px-6 py-12 border-b-2 border-amber-200">
      <div className="max-w-2xl mx-auto">
        <SectionLabel>Perché sceglierci</SectionLabel>
        <h2 className="text-2xl sm:text-3xl font-black leading-tight text-stone-900 mb-2">
          Pensato per chi vive il basket sul campo.
        </h2>
        <p className="text-sm text-stone-500 leading-relaxed mb-8">
          Non uno strumento generico — EVO nasce dall'esperienza diretta delle società italiane.
        </p>
        <div className="space-y-6">
          {PERCHE.map((p, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-amber-50 border-2 border-amber-200 text-amber-700 flex items-center justify-center text-sm font-black shrink-0">
                {p.n}
              </div>
              <div>
                <div className="text-sm font-bold text-stone-900 mb-1">{p.title}</div>
                <div className="text-xs text-stone-500 leading-relaxed">{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Phone Mockup ─────────────────────────────────────────────────────────────

const phoneStyle = {
  width: '260px',
  background: '#1c1c1e',
  borderRadius: '36px',
  padding: '12px 10px 20px',
  boxShadow: '0 30px 80px rgba(0,0,0,.5), inset 0 0 0 1.5px rgba(255,255,255,.08)',
  position: 'relative',
  flexShrink: 0,
}
const screenStyle = {
  background: '#f9fafb',
  borderRadius: '26px',
  overflow: 'hidden',
  minHeight: '460px',
  position: 'relative',
}
const appCard = {
  background: 'white', border: '1px solid #f3f4f6',
  borderRadius: '12px', padding: '9px 11px', margin: '0 10px 7px',
}
const cardTitle = { fontSize: '11px', fontWeight: 700, color: '#1c1c1e', marginBottom: '2px' }
const cardSub   = { fontSize: '9px', color: '#9ca3af' }
const sectionLbl= { padding: '0 10px 6px', fontSize: '9.5px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em' }
const navStyle  = { position:'absolute', bottom:0, left:0, right:0, background:'white', borderTop:'1px solid #f3f4f6', display:'flex', padding:'6px 0 10px' }
const navItem   = (active) => ({ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', fontSize:'7.5px', color: active ? '#d97706' : '#9ca3af', fontWeight:600 })

function Dot({ color }) {
  return <div style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0 }} />
}
function Badge({ bg, color, children }) {
  return <span style={{ fontSize:'8.5px', fontWeight:700, borderRadius:'5px', padding:'2px 6px', background:bg, color }}>{children}</span>
}

function ScreenAdmin() {
  return (
    <>
      <div style={{ padding:'10px 12px 8px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f3f4f6' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:800, color:'#92400e' }}>🏀 EVO</div>
          <div style={{ fontSize:'9px', color:'#9ca3af', marginTop:1 }}>Buongiorno, Resp. Tecnico</div>
        </div>
        <div style={{ width:28, height:28, borderRadius:'50%', ...GRAD_LOGO, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>👑</div>
      </div>
      <div style={{ padding:'10px 0 60px' }}>
        <div style={sectionLbl}>Questa settimana</div>
        <div style={appCard}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Dot color="#3b82f6" />
            <div style={{ flex:1 }}><div style={cardTitle}>Partita vs Treviso B</div><div style={cardSub}>Mar 20:00 · Palasport</div></div>
            <Badge bg="#dbeafe" color="#1d4ed8">FIP</Badge>
          </div>
        </div>
        <div style={appCard}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Dot color="#f59e0b" />
            <div style={{ flex:1 }}><div style={cardTitle}>Allenamento U16</div><div style={cardSub}>Mer 18:30 · Palestra</div></div>
            <Badge bg="#fef3c7" color="#92400e">12 ✓</Badge>
          </div>
        </div>
        <div style={{ ...sectionLbl, marginTop:4 }}>Avvisi</div>
        <div style={{ ...appCard, borderLeft:'3px solid #ef4444' }}>
          <div style={{ ...cardTitle, color:'#dc2626' }}>⚠️ 2 cert. medici scaduti</div>
          <div style={cardSub}>Bianchi M. · Rossi F.</div>
        </div>
        <div style={{ ...appCard, borderLeft:'3px solid #10b981' }}>
          <div style={cardTitle}>💰 Bilancio giugno: +€ 840</div>
          <div style={cardSub}>Entrate 2.100 · Uscite 1.260</div>
        </div>
        <div style={{ ...appCard, borderLeft:'3px solid #f59e0b' }}>
          <div style={cardTitle}>💶 4 quote scadute</div>
          <div style={cardSub}>Totale: € 320 da incassare</div>
        </div>
      </div>
      <div style={navStyle}>
        {[['🏠','Home',true],['📅','Calendario',false],['👥','Utenti',false],['⚙️','Setup',false]].map(([ic,lb,a])=>(
          <div key={lb} style={navItem(a)}><span style={{ fontSize:16 }}>{ic}</span>{lb}</div>
        ))}
      </div>
    </>
  )
}

function ScreenCoach() {
  return (
    <>
      <div style={{ padding:'10px 12px 8px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f3f4f6' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:800, color:'#92400e' }}>🏀 EVO</div>
          <div style={{ fontSize:'9px', color:'#9ca3af', marginTop:1 }}>Ciao, Marco</div>
        </div>
      </div>
      <div style={{ padding:'10px 0 60px' }}>
        <div style={sectionLbl}>I tuoi impegni</div>
        <div style={{ ...appCard, borderLeft:'3px solid #f59e0b' }}>
          <div style={cardTitle}>Oggi — Allenamento U18</div>
          <div style={cardSub}>19:00–20:30 · Palestra Nord</div>
          <button style={{ marginTop:6, fontSize:9, fontWeight:700, background:'#fef3c7', color:'#92400e', border:'1px solid #fde68a', borderRadius:6, padding:'3px 8px' }}>✅ Fai l'appello</button>
        </div>
        <div style={appCard}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Dot color="#3b82f6" />
            <div style={{ flex:1 }}><div style={cardTitle}>Sab — Partita vs Mestre</div><div style={cardSub}>Palasport · 17:00</div></div>
            <Badge bg="#dbeafe" color="#1d4ed8">FIP</Badge>
          </div>
        </div>
        <div style={{ ...sectionLbl, marginTop:4 }}>Statistiche giugno</div>
        <div style={appCard}>
          <div style={cardTitle}>📊 Presenze U18: 78%</div>
          <div style={cardSub}>14/18 giocatori · media 8 allenamenti</div>
          <div style={{ marginTop:6, background:'#f3f4f6', borderRadius:4, height:5, overflow:'hidden' }}>
            <div style={{ width:'78%', height:'100%', background:'#d97706', borderRadius:4 }} />
          </div>
        </div>
        <div style={{ ...appCard, borderLeft:'3px solid #8b5cf6' }}>
          <div style={cardTitle}>📢 Bacheca — 1 nuovo avviso</div>
          <div style={cardSub}>Torneo estivo — iscrizioni aperte</div>
        </div>
      </div>
      <div style={navStyle}>
        {[['🏠','Home',true],['📅','Calendario',false],['✅','Presenze',false],['📢','Bacheca',false]].map(([ic,lb,a])=>(
          <div key={lb} style={navItem(a)}><span style={{ fontSize:16 }}>{ic}</span>{lb}</div>
        ))}
      </div>
    </>
  )
}

function ScreenSecretary() {
  return (
    <>
      <div style={{ padding:'10px 12px 8px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f3f4f6' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:800, color:'#92400e' }}>📋 Segreteria</div>
          <div style={{ fontSize:'9px', color:'#9ca3af', marginTop:1 }}>Dashboard</div>
        </div>
      </div>
      <div style={{ padding:'10px 0 60px' }}>
        <div style={sectionLbl}>Da fare oggi</div>
        <div style={{ ...appCard, borderLeft:'3px solid #ef4444' }}>
          <div style={{ ...cardTitle, color:'#dc2626' }}>🏥 3 certificati scaduti</div>
          <div style={cardSub}>Bianchi · Verdi · Neri — Azione richiesta</div>
        </div>
        <div style={{ ...appCard, borderLeft:'3px solid #f59e0b' }}>
          <div style={cardTitle}>💶 Quote scadute: 4 giocatori</div>
          <div style={cardSub}>Totale: € 320 da incassare</div>
        </div>
        <div style={{ ...sectionLbl, marginTop:4 }}>Situazione giocatori</div>
        <div style={appCard}>
          {[
            { color:'#10b981', name:'Bianchi Marco, U18', badge:'✓ OK',       bb:'#d1fae5', bc:'#065f46' },
            { color:'#f59e0b', name:'Rossi Luca, U16',   badge:'Scade presto',bb:'#fef3c7', bc:'#92400e' },
            { color:'#ef4444', name:'Verdi Piero, U14',  badge:'Scaduto',     bb:'#fee2e2', bc:'#dc2626' },
          ].map((r, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom: i<2 ? 5 : 0 }}>
              <Dot color={r.color} />
              <div style={{ ...cardSub, fontWeight:600, color:'#374151', flex:1 }}>{r.name}</div>
              <Badge bg={r.bb} color={r.bc}>{r.badge}</Badge>
            </div>
          ))}
        </div>
        <div style={{ ...appCard, borderLeft:'3px solid #10b981' }}>
          <div style={cardTitle}>📄 Ricevute emesse: 28</div>
          <div style={cardSub}>Stagione 2025–2026</div>
        </div>
      </div>
      <div style={navStyle}>
        {[['🏠','Home',true],['👤','Giocatori',false],['💶','Quote',false],['💰','Contab.',false]].map(([ic,lb,a])=>(
          <div key={lb} style={navItem(a)}><span style={{ fontSize:16 }}>{ic}</span>{lb}</div>
        ))}
      </div>
    </>
  )
}

function ScreenParent() {
  return (
    <>
      <div style={{ padding:'10px 12px 8px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f3f4f6' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:800, color:'#92400e' }}>🏀 EVO</div>
          <div style={{ fontSize:'9px', color:'#9ca3af', marginTop:1 }}>Famiglia Rossi</div>
        </div>
      </div>
      <div style={{ padding:'10px 0 60px' }}>
        <div style={sectionLbl}>Marco — U14</div>
        <div style={{ ...appCard, borderLeft:'3px solid #f59e0b' }}>
          <div style={cardTitle}>Oggi — Allenamento</div>
          <div style={cardSub}>Palestra Sud · 17:30</div>
          <span style={{ display:'inline-block', marginTop:5, fontSize:9, fontWeight:700, background:'#fef3c7', color:'#92400e', borderRadius:5, padding:'2px 7px' }}>Oggi 🔔</span>
        </div>
        <div style={appCard}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Dot color="#3b82f6" />
            <div style={{ flex:1 }}><div style={cardTitle}>Dom — Partita vs Padova</div><div style={cardSub}>Palasport · 15:00</div></div>
            <Badge bg="#dbeafe" color="#1d4ed8">Dom</Badge>
          </div>
        </div>
        <div style={{ ...sectionLbl, marginTop:4 }}>Quote</div>
        <div style={{ ...appCard, borderLeft:'3px solid #10b981' }}>
          <div style={cardTitle}>💶 Quota giugno: pagata ✓</div>
          <div style={cardSub}>€ 60 — pagata il 01/06/2026</div>
        </div>
        <div style={{ ...sectionLbl, marginTop:4 }}>Bacheca</div>
        <div style={{ ...appCard, borderLeft:'3px solid #8b5cf6' }}>
          <div style={cardTitle}>📢 Torneo estivo — iscriviti!</div>
          <div style={cardSub}>Scadenza iscrizioni: 30/06/2026</div>
        </div>
      </div>
      <div style={navStyle}>
        {[['🏠','Home',true],['📅','Calendario',false],['💶','Quote',false],['📢','Bacheca',false]].map(([ic,lb,a])=>(
          <div key={lb} style={navItem(a)}><span style={{ fontSize:16 }}>{ic}</span>{lb}</div>
        ))}
      </div>
    </>
  )
}

function ScreenPlayer() {
  return (
    <>
      <div style={{ padding:'10px 12px 8px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f3f4f6' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:800, color:'#92400e' }}>🏀 EVO</div>
          <div style={{ fontSize:'9px', color:'#9ca3af', marginTop:1 }}>Ciao, Luca 👋</div>
        </div>
      </div>
      <div style={{ padding:'10px 0 60px' }}>
        <div style={sectionLbl}>I tuoi prossimi impegni</div>
        <div style={{ ...appCard, borderLeft:'3px solid #f59e0b' }}>
          <div style={cardTitle}>Oggi — Allenamento U18</div>
          <div style={cardSub}>19:00 · Palestra Nord</div>
          <span style={{ display:'inline-block', marginTop:5, fontSize:9, fontWeight:700, background:'#fef3c7', color:'#92400e', borderRadius:5, padding:'2px 7px' }}>Oggi 🔔</span>
        </div>
        <div style={appCard}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Dot color="#3b82f6" />
            <div style={{ flex:1 }}><div style={cardTitle}>Sab — Partita vs Mestre</div><div style={cardSub}>Palasport · 17:00</div></div>
            <Badge bg="#dbeafe" color="#1d4ed8">FIP</Badge>
          </div>
        </div>
        <div style={{ ...sectionLbl, marginTop:4 }}>Le mie presenze — Giugno</div>
        <div style={appCard}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
            <div style={cardTitle}>6 / 8 allenamenti</div>
            <span style={{ fontSize:11, fontWeight:800, color:'#d97706' }}>75%</span>
          </div>
          <div style={{ background:'#f3f4f6', borderRadius:4, height:6, overflow:'hidden' }}>
            <div style={{ width:'75%', height:'100%', background:'linear-gradient(90deg,#d97706,#f59e0b)', borderRadius:4 }} />
          </div>
        </div>
        <div style={{ ...appCard, borderLeft:'3px solid #8b5cf6' }}>
          <div style={cardTitle}>📢 Comunicazione allenatore</div>
          <div style={cardSub}>Portare le scarpe da gara sabato</div>
        </div>
      </div>
      <div style={navStyle}>
        {[['🏠','Home',true],['📅','Calendario',false],['📊','Stats',false],['📢','Bacheca',false]].map(([ic,lb,a])=>(
          <div key={lb} style={navItem(a)}><span style={{ fontSize:16 }}>{ic}</span>{lb}</div>
        ))}
      </div>
    </>
  )
}

const SCREENS = { admin: ScreenAdmin, coach: ScreenCoach, secretary: ScreenSecretary, parent: ScreenParent, player: ScreenPlayer }

// ─── Panel testo per ruolo ────────────────────────────────────────────────────

const ROLE_PANELS = {
  admin: {
    icon: '👑', title: 'Responsabile Tecnico', sub: 'Controllo totale della società',
    desc: 'Visione completa di tutto ciò che accade nella tua società, in tempo reale, da qualsiasi dispositivo.',
    features: [
      { icon:'📅', title:'Dashboard settimanale',     desc:'Panoramica di tutte le partite, allenamenti e avvisi della settimana in un colpo d\'occhio.' },
      { icon:'👥', title:'Gestione utenti',            desc:'Crea e gestisci account per allenatori, segreteria, genitori e giocatori con un clic.' },
      { icon:'💰', title:'Contabilità completa',       desc:'Accesso a spese, entrate e bilancio visivo della società sempre aggiornato.' },
      { icon:'📊', title:'Report e statistiche',       desc:'Trend presenze per squadra e stagione. Tutto tracciato, niente va perso.' },
      { icon:'⚙️', title:'Impostazioni società',       desc:'Palestre, squadre, template rate di pagamento — tutto configurabile in pochi minuti.' },
    ],
  },
  coach: {
    icon: '🏋️', title: 'Allenatore', sub: 'Il lavoro sul campo, supportato dalla tecnologia',
    desc: 'Tutti gli strumenti per gestire la squadra: dal calendario al registro presenze, senza carta e senza perdite di tempo.',
    features: [
      { icon:'📅', title:'Home settimanale',               desc:'Tutti gli allenamenti e le partite della tua squadra organizzati per giorno.' },
      { icon:'✅', title:'Registro presenze digitale',      desc:'Un tap per segnare chi c\'è e chi manca. Niente fogli, niente penne, niente errori.' },
      { icon:'⚠️', title:'Vista conflitti in tempo reale', desc:'Palestre occupate o giocatori con doppio impegno evidenziati automaticamente.' },
      { icon:'📢', title:'Bacheca annunci',                 desc:'Comunica con le famiglie in modo ufficiale. Addio ai messaggi persi su WhatsApp.' },
      { icon:'📈', title:'Statistiche squadra',             desc:'Trend presenze mese per mese. Scopri subito chi sta mancando troppo agli allenamenti.' },
    ],
  },
  secretary: {
    icon: '📋', title: 'Segreteria', sub: 'Tutta l\'amministrazione, in ordine e senza carta',
    desc: 'Gestisce l\'intera vita amministrativa del club: dai giocatori ai pagamenti, dai certificati alla contabilità.',
    features: [
      { icon:'🏥', title:'Anagrafica e certificati medici', desc:'Ogni giocatore con dati e scadenza certificato. Semaforo verde / arancione / rosso automatico.' },
      { icon:'💶', title:'Gestione quote e pagamenti',      desc:'Rate automatiche configurabili, tracciamento pagamenti, lista immediata di chi è in arretrato.' },
      { icon:'📄', title:'Ricevute e attestazioni 730',     desc:'Generate automaticamente in un click. Niente calcoli a mano, niente errori di compilazione.' },
      { icon:'💰', title:'Contabilità della società',       desc:'Registra spese e entrate, visualizza il bilancio. Tutto in un unico posto, sempre aggiornato.' },
      { icon:'🔔', title:'Alert scadenze automatici',       desc:'Certificati in scadenza entro 30 giorni segnalati subito, senza dover controllare ogni giocatore.' },
    ],
  },
  parent: {
    icon: '👨‍👩‍👧', title: 'Genitore', sub: 'Sempre informato, senza gruppi WhatsApp',
    desc: 'App semplice e pulita: sa sempre dove e quando deve essere suo figlio, riceve avvisi ufficiali e controlla le quote.',
    features: [
      { icon:'🏠', title:'Home semplificata',      desc:'Prossimi allenamenti e partite della squadra del figlio, chiari e immediati, senza distrazioni.' },
      { icon:'📢', title:'Bacheca ufficiale',       desc:'Gli avvisi della società sono sempre visibili e archiviati. Niente più messaggi persi in chat.' },
      { icon:'📅', title:'Calendario della stagione', desc:'Tutte le partite e gli allenamenti aggiornati in tempo reale, sempre sul telefono.' },
      { icon:'💶', title:'Stato pagamenti quote',   desc:'Vedi subito cosa è dovuto e cosa è già stato pagato. Niente sorprese a fine mese.' },
      { icon:'👨‍👩‍👦‍👦', title:'Più figli? Nessun problema', desc:'Supporto fino a 3 squadre per famiglia. Ideale se hai più di un figlio iscritto alla società.' },
    ],
  },
  player: {
    icon: '🏀', title: 'Giocatore', sub: 'I tuoi impegni e i tuoi progressi, sempre con te',
    desc: 'Vista personale: allenamenti, partite, statistiche di presenza e comunicazioni dalla società in un\'unica app.',
    features: [
      { icon:'🏠', title:'Home personale',                   desc:'Prossimi allenamenti e partite della squadra, sempre in primo piano sul telefono.' },
      { icon:'📊', title:'Le mie statistiche di presenza',   desc:'Percentuale di presenza per mese e per squadra. Tieni traccia del tuo impegno.' },
      { icon:'📢', title:'Comunicazioni dalla società',      desc:'Avvisi e comunicazioni del tuo allenatore e della società, tutte in un posto solo.' },
      { icon:'📅', title:'Calendario personale',             desc:'La stagione completa sempre aggiornata. Sai sempre quando e dove allenarti o giocare.' },
    ],
  },
}

// ─── Sezione Demo ─────────────────────────────────────────────────────────────

function SectionDemo() {
  const [active, setActive] = useState('admin')
  const panel = ROLE_PANELS[active]
  const Screen = SCREENS[active]

  return (
    <section id="demo" className="px-6 py-12 border-b-2 border-amber-900" style={GRAD}>
      <div className="max-w-3xl mx-auto">
        <SectionLabel light>Demo interattiva</SectionLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">Un'app. Cinque prospettive.</h2>
        <p className="text-sm text-white/70 leading-relaxed mb-6">
          Seleziona un ruolo e scopri cosa vede ogni membro della tua società.
        </p>

        {/* Tab buttons */}
        <div className="flex flex-wrap gap-2 mb-8">
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className={`px-3.5 py-2 rounded-full text-[12px] font-bold border transition-all duration-200 cursor-pointer ${
                active === r.id
                  ? 'bg-white text-amber-800 shadow-md border-white'
                  : 'text-white/75 border-white/25 hover:text-white hover:border-white/50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Layout affiancato su desktop */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* Colonna testo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{panel.icon}</span>
              <div>
                <div className="text-2xl font-black text-white">{panel.title}</div>
                <div className="text-sm text-white/55">{panel.sub}</div>
              </div>
            </div>
            <p className="text-base text-white/85 leading-relaxed mb-5">{panel.desc}</p>
            <div className="space-y-3">
              {panel.features.map((f, i) => (
                <FeatureCard key={i} {...f} />
              ))}
            </div>
          </div>

          {/* Telefono */}
          <div className="w-full lg:w-auto flex justify-center shrink-0">
            <div style={phoneStyle}>
              {/* notch */}
              <div style={{ width:80, height:5, background:'#3a3a3c', borderRadius:3, margin:'0 auto 10px' }} />
              <div style={screenStyle}>
                <Screen />
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

// ─── In numeri ────────────────────────────────────────────────────────────────

function SectionNumeri() {
  return (
    <section className="bg-white px-6 py-12 border-b-2 border-amber-200">
      <div className="max-w-2xl mx-auto text-center">
        <SectionLabel>In numeri</SectionLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-stone-900 mb-8">Tutto quello che serve a una società.</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { n:'5',    label:'ruoli utente' },
            { n:'8+',   label:'moduli integrati' },
            { n:'100%', label:'mobile friendly' },
            { n:'FIP',  label:'integrazione federale' },
          ].map((s, i) => (
            <div key={i} className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-amber-700 mb-1">{s.n}</div>
              <div className="text-xs text-stone-500 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Contatti ─────────────────────────────────────────────────────────────────

function SectionContatti() {
  const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-lead`

  const [form, setForm]     = useState({ nome: '', societa: '', email: '', telefono: '' })
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
  const [errMsg, setErrMsg] = useState('')

  const allFilled = Object.values(form).every(v => v.trim().length > 0)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!allFilled || status === 'loading') return
    setStatus('loading')
    setErrMsg('')
    try {
      const res = await fetch(FN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore sconosciuto')
      setStatus('success')
    } catch (err) {
      setErrMsg(err.message ?? 'Errore di rete. Riprova.')
      setStatus('error')
    }
  }

  const inp = [
    'w-full bg-white/20 border border-white/30 rounded-xl px-4 py-3',
    'text-sm text-white placeholder-white/40',
    'focus:outline-none focus:ring-2 focus:ring-white/50 transition-all',
  ].join(' ')

  return (
    <section id="contatti" className="px-6 py-14 border-b-2 border-amber-900" style={GRAD}>
      <div className="max-w-md mx-auto text-center">
        <SectionLabel light>Richiedi una demo</SectionLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
          Porta EVO nella tua società.
        </h2>
        <p className="text-[14px] text-white/75 leading-relaxed mb-8">
          Lascia i tuoi dati: ti contatteremo su WhatsApp entro 24 ore
          per una demo personalizzata, senza impegno.
        </p>

        {status === 'success' ? (
          /* ── Stato successo ── */
          <div className="bg-white/15 border border-white/25 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-black text-white mb-2">Richiesta inviata!</h3>
            <p className="text-sm text-white/75 leading-relaxed">
              Controlla la tua email per la conferma.<br />
              Ti contatteremo presto su <strong>WhatsApp</strong> 📲
            </p>
          </div>
        ) : (
          /* ── Form ── */
          <form onSubmit={handleSubmit} className="bg-white/15 rounded-2xl p-6 border border-white/25 text-left space-y-3">
            <div>
              <label className="text-[11px] font-bold text-amber-200 mb-1.5 block uppercase tracking-wide">
                Nome e cognome *
              </label>
              <input
                type="text" name="nome" value={form.nome} onChange={handleChange}
                placeholder="Mario Rossi" required className={inp} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-200 mb-1.5 block uppercase tracking-wide">
                Società sportiva *
              </label>
              <input
                type="text" name="societa" value={form.societa} onChange={handleChange}
                placeholder="Basket Treviso ASD" required className={inp} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-200 mb-1.5 block uppercase tracking-wide">
                Email *
              </label>
              <input
                type="email" name="email" value={form.email} onChange={handleChange}
                placeholder="mario@baskettreviso.it" required className={inp} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-amber-200 mb-1.5 block uppercase tracking-wide">
                Telefono (WhatsApp) *
              </label>
              <input
                type="tel" name="telefono" value={form.telefono} onChange={handleChange}
                placeholder="347 123 4567" required className={inp} />
            </div>

            {status === 'error' && (
              <p className="text-xs text-red-300 bg-red-900/30 rounded-lg px-3 py-2">{errMsg}</p>
            )}

            <button
              type="submit"
              disabled={!allFilled || status === 'loading'}
              className="w-full py-4 bg-white text-amber-800 rounded-xl text-[15px] font-extrabold shadow-lg
                hover:bg-amber-50 active:scale-95 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 mt-2">
              {status === 'loading'
                ? '⏳ Invio in corso...'
                : '📲 Richiedi la demo gratuita →'}
            </button>
            <p className="text-center text-[11px] text-white/35 mt-1">
              Ti contatteremo su WhatsApp · Nessun impegno
            </p>
          </form>
        )}

        {/* Link accedi */}
        <div className="mt-8 pt-6 border-t border-white/15">
          <p className="text-sm text-white/50 mb-3">Hai già un account?</p>
          <Link to="/login"
            className="inline-block px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl border border-white/30 transition-colors text-sm">
            Accedi →
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-white px-6 py-8 text-center border-t-2 border-amber-200">
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base shadow" style={GRAD_LOGO}>🏀</div>
        <span className="font-black text-lg text-amber-700">EV<span className="text-amber-500">O</span></span>
      </div>
      <p className="text-[12px] text-stone-400 mb-1">Il gestionale per il basket italiano.</p>
      <p className="text-[11px] text-stone-300">© 2026 EVO · Tutti i diritti riservati</p>
    </footer>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fafaf9' }}>
      <Navbar />
      <Hero />
      <SectionProblemi />
      <SectionSoluzioni />
      <SectionPerche />
      <SectionDemo />
      <SectionNumeri />
      <SectionContatti />
      <Footer />
    </div>
  )
}
