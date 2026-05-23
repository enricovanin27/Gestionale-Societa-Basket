import { useState }         from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery }         from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { supabase }         from '../../lib/supabase'
import { useAuth }          from '../../hooks/useAuth'
import LoadingSpinner       from '../../components/LoadingSpinner'

const METODO_LABEL = { contanti: 'Contanti', bonifico: 'Bonifico', pos: 'POS / Carta' }

// Stili inline
const secLbl = { fontFamily: 'sans-serif', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#9ca3af', marginBottom: 8 }
const iTab   = { width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }
const tdL    = { border: '1px solid #d1d5db', padding: '6px 10px', background: '#f9fafb', color: '#555', width: 160, fontFamily: 'sans-serif' }
const tdV    = { border: '1px solid #d1d5db', padding: '6px 10px', fontFamily: 'sans-serif' }
const qTd    = { border: '1px solid #d1d5db', padding: '6px 10px', fontFamily: 'sans-serif', fontSize: 13 }

export default function Attestazione730Page() {
  const { giocId } = useParams()
  const [searchParams]  = useSearchParams()
  const { societaId }   = useAuth()
  const currentYear     = new Date().getFullYear()
  const [anno, setAnno] = useState(parseInt(searchParams.get('anno') ?? currentYear, 10))

  const { data: giocatore, isLoading: loadG } = useQuery({
    queryKey: ['att730-giocatore', giocId, societaId],
    enabled: !!giocId && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('nome, cognome, data_nascita, codice_fiscale')
        .eq('id', giocId).eq('societa_id', societaId).single()
      return data
    },
  })

  const { data: quotePagate = [], isLoading: loadQ } = useQuery({
    queryKey: ['att730-quote', giocId, anno],
    enabled: !!giocId && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, descrizione, tipo, importo, data_pagamento, metodo_pagamento')
        .eq('giocatore_id', giocId).eq('societa_id', societaId)
        .eq('pagato', true)
        .gte('data_pagamento', `${anno}-01-01`)
        .lte('data_pagamento', `${anno}-12-31`)
        .order('data_pagamento')
      return data ?? []
    },
  })

  const { data: soc, isLoading: loadS } = useQuery({
    queryKey: ['societa-dati', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('societa')
        .select('nome_completo, nome, codice_fiscale, indirizzo, citta, cap, provincia, telefono, email, logo_url')
        .eq('id', societaId).single()
      return data
    },
  })

  if (loadG || loadQ || loadS) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>
  }
  if (!giocatore || !soc) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dati non trovati</div>
  }

  const nomeAsd    = soc.nome_completo || soc.nome
  const totale     = quotePagate.reduce((s, q) => s + (q.importo ?? 0), 0)
  const detraibile = Math.min(totale, 210)
  const dataNasc   = giocatore.data_nascita ? format(parseISO(giocatore.data_nascita), 'd/MM/yyyy') : '—'
  const oggi       = format(new Date(), 'd/MM/yyyy')

  const indirizzoSoc = [
    soc.indirizzo,
    soc.citta && `${soc.cap ? soc.cap + ' ' : ''}${soc.citta}${soc.provincia ? ` (${soc.provincia})` : ''}`,
  ].filter(Boolean).join(' — ')

  const footerContatti = [
    soc.codice_fiscale && `C.F.: ${soc.codice_fiscale}`,
    soc.telefono && `Tel: ${soc.telefono}`,
    soc.email && `email: ${soc.email}`,
  ].filter(Boolean).join(' · ')

  const anni = [currentYear, currentYear - 1, currentYear - 2]

  return (
    <>
      <style>{`
        @media print {
          .toolbar { display: none !important; }
          body { margin: 0; background: white; }
          .doc { box-shadow: none !important; max-width: 100% !important; padding: 20mm 20mm !important; }
        }
        body { background: #f3f4f6; }
      `}</style>

      {/* Toolbar */}
      <div className="toolbar max-w-3xl mx-auto mb-4 mt-4 flex items-center gap-3 bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-sans">
        <span className="flex-1 font-semibold truncate">
          📋 Attestazione 730 — {giocatore.cognome} {giocatore.nome}
        </span>
        <span className="text-slate-300 text-xs shrink-0">Anno:</span>
        <select value={anno} onChange={e => setAnno(Number(e.target.value))}
          className="bg-slate-700 text-white border border-slate-500 rounded-lg px-2 py-1 text-xs">
          {anni.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={() => window.print()}
          className="shrink-0 px-4 py-1.5 bg-purple-600 rounded-lg text-xs font-semibold hover:bg-purple-700">
          🖨 Stampa / PDF
        </button>
      </div>

      {/* Documento */}
      <div className="doc max-w-3xl mx-auto bg-white px-14 py-12 shadow-lg mb-8" style={{ fontFamily: 'Georgia, serif' }}>

        {/* Logo */}
        <div style={{ marginBottom: 20 }}>
          {soc.logo_url
            ? <img src={soc.logo_url} alt="logo" style={{ height: 56, objectFit: 'contain' }} />
            : <div style={{ fontSize: 30, fontStyle: 'italic', fontWeight: 'bold', color: '#111' }}>🏀 {nomeAsd}</div>
          }
        </div>

        <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4, fontFamily: 'sans-serif' }}>
          Attestazione spese sportive — Anno {anno}
        </div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 24, fontFamily: 'sans-serif' }}>
          Ai sensi dell'art. 15, comma 1, lett. i-quinquies) del D.P.R. 917/1986 (TUIR)
        </div>

        {/* Società */}
        <p style={secLbl}>Società sportiva</p>
        <table style={iTab}>
          <tbody>
            <tr><td style={tdL}>Denominazione</td><td style={tdV}>{nomeAsd}</td></tr>
            {soc.codice_fiscale && <tr><td style={tdL}>Codice fiscale</td><td style={{ ...tdV, fontFamily: 'monospace' }}>{soc.codice_fiscale}</td></tr>}
            {indirizzoSoc && <tr><td style={tdL}>Indirizzo</td><td style={tdV}>{indirizzoSoc}</td></tr>}
          </tbody>
        </table>

        {/* Atleta */}
        <p style={secLbl}>Atleta</p>
        <table style={iTab}>
          <tbody>
            <tr><td style={tdL}>Cognome e nome</td><td style={{ ...tdV, fontWeight: 'bold' }}>{giocatore.cognome} {giocatore.nome}</td></tr>
            {giocatore.data_nascita && <tr><td style={tdL}>Data di nascita</td><td style={tdV}>{dataNasc}</td></tr>}
            {giocatore.codice_fiscale && <tr><td style={tdL}>Codice fiscale</td><td style={{ ...tdV, fontFamily: 'monospace' }}>{giocatore.codice_fiscale}</td></tr>}
          </tbody>
        </table>

        {/* Quote */}
        <p style={secLbl}>Dettaglio pagamenti anno {anno}</p>
        {quotePagate.length === 0 ? (
          <p style={{ fontSize: 13, color: '#999', marginBottom: 20, fontFamily: 'sans-serif' }}>
            Nessun pagamento registrato per il {anno}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead>
              <tr>
                {['Descrizione', 'Data', 'Metodo', 'Importo'].map(h => (
                  <th key={h} style={{ background: '#f3f4f6', border: '1px solid #d1d5db', padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontFamily: 'sans-serif', fontSize: 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotePagate.map(q => (
                <tr key={q.id}>
                  <td style={qTd}>{q.descrizione || q.tipo}</td>
                  <td style={qTd}>{q.data_pagamento ? format(parseISO(q.data_pagamento), 'd/MM/yyyy') : '—'}</td>
                  <td style={qTd}>{q.metodo_pagamento ? METODO_LABEL[q.metodo_pagamento] : '—'}</td>
                  <td style={{ ...qTd, textAlign: 'right' }}>{q.importo?.toFixed(2)} €</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: '#fafafa' }}>
                <td colSpan={3} style={{ ...qTd, textAlign: 'right' }}>Totale pagato anno {anno}</td>
                <td style={{ ...qTd, textAlign: 'right', fontSize: 16, color: '#059669' }}>{totale.toFixed(2)} €</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Box detraibile */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, marginBottom: 24, fontFamily: 'sans-serif', fontSize: 13 }}>
          <strong style={{ display: 'block', color: '#059669', fontSize: 15, marginBottom: 4 }}>
            Importo detraibile: € {detraibile.toFixed(2)}
          </strong>
          <small style={{ color: '#6b7280', fontSize: 11 }}>
            Il limite massimo detraibile per spese sportive di ragazzi 5–18 anni è di € 210,00 (art. 15 TUIR). La detrazione IRPEF è del 19% sull'importo detraibile.
          </small>
        </div>

        {/* Dichiarazione */}
        <div style={{ fontSize: 12, color: '#444', marginBottom: 32, lineHeight: 1.6, fontFamily: 'sans-serif' }}>
          La <strong>{nomeAsd}</strong> certifica che l'atleta sopra indicato ha praticato attività sportiva dilettantistica presso la nostra società nel corso dell'anno {anno}, e che le quote indicate sono state regolarmente pagate e registrate.
        </div>

        {/* Chiusura con firma */}
        <div style={{ textAlign: 'right', fontSize: 13, marginBottom: 40, fontFamily: 'sans-serif' }}>
          {soc.citta ?? ''}, {oggi}<br /><br />
          Il responsabile amministrativo<br />
          <span style={{ fontStyle: 'italic', fontSize: 15, fontFamily: 'Georgia, serif', color: '#7c3aed' }}>____________________</span>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <strong style={{ fontSize: 13, color: '#111', display: 'block', marginBottom: 3 }}>{nomeAsd}</strong>
          <span style={{ fontSize: 11, color: '#777' }}>
            {[indirizzoSoc, footerContatti].filter(Boolean).join(' | ')}
          </span>
        </div>
      </div>
    </>
  )
}
