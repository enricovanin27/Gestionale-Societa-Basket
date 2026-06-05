import { useParams } from 'react-router-dom'
import { useQuery }  from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { supabase }  from '../../lib/supabase'
import { useAuth }   from '../../hooks/useAuth'
import LoadingSpinner from '../../components/LoadingSpinner'

const METODO_LABEL = { contanti: 'Contanti', bonifico: 'Bonifico', pos: 'POS / Carta' }

// Stili inline per celle tabella (garantiti in stampa)
const tdL   = { border: '1px solid #ccc', padding: '5px 10px', width: 110, color: '#444', background: '#fafafa', fontFamily: 'sans-serif', fontSize: 13 }
const tdV   = { border: '1px solid #ccc', padding: '5px 10px', fontFamily: 'sans-serif', fontSize: 13 }
const tdVM  = { ...tdV, fontFamily: 'monospace' }
const payTd = { border: '1px solid #ccc', padding: '7px 10px', fontFamily: 'sans-serif', fontSize: 13 }

export default function RicevutaPage() {
  const { quoteId } = useParams()
  const { societaId } = useAuth()

  const { data: quota, isLoading: loadQ } = useQuery({
    queryKey: ['ricevuta-quota', quoteId],
    enabled: !!quoteId && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, tipo, descrizione, importo, data_pagamento, metodo_pagamento, numero_ricevuta, giocatore_id')
        .eq('id', quoteId).eq('societa_id', societaId).single()
      return data
    },
  })

  const { data: giocatore, isLoading: loadG } = useQuery({
    queryKey: ['ricevuta-giocatore', quota?.giocatore_id],
    enabled: !!quota?.giocatore_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('nome, cognome, data_nascita, luogo_nascita, codice_fiscale, indirizzo, cap, provincia, nome_genitore, cognome_genitore, codice_fiscale_genitore')
        .eq('id', quota.giocatore_id).single()
      return data
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

  if (loadQ || loadG || loadS) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>
  }
  if (!quota || !giocatore || !soc) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dati non trovati</div>
  }

  const nomeAsd   = soc.nome_completo || soc.nome
  const anno      = quota.data_pagamento ? new Date(quota.data_pagamento).getFullYear() : new Date().getFullYear()
  const numRic    = quota.numero_ricevuta
    ? `${anno}-${String(quota.numero_ricevuta).padStart(4, '0')}`
    : '—'
  const dataPag   = quota.data_pagamento   ? format(parseISO(quota.data_pagamento),   'd/MM/yyyy') : '—'
  const dataNasc  = giocatore.data_nascita ? format(parseISO(giocatore.data_nascita), 'd/MM/yyyy') : '—'

  const footerParts = [
    soc.indirizzo,
    soc.citta && `${soc.cap ? soc.cap + ' ' : ''}${soc.citta}${soc.provincia ? ` (${soc.provincia})` : ''}`,
  ].filter(Boolean).join(', ')
  const footerContatti = [
    soc.codice_fiscale && `C.F.: ${soc.codice_fiscale}`,
    soc.telefono && `Tel: ${soc.telefono}`,
    soc.email && `email: ${soc.email}`,
  ].filter(Boolean).join(' · ')

  const mailtoHref = `mailto:?subject=${encodeURIComponent(`Ricevuta N. ${numRic}`)}&body=${encodeURIComponent(`Ricevuta di pagamento N. ${numRic}\n\n${nomeAsd}`)}`

  return (
    <>
      <style>{`
        @media print {
          .toolbar { display: none !important; }
          body { margin: 0; background: white; }
          .receipt { box-shadow: none !important; max-width: 100% !important; padding: 20mm 20mm !important; }
        }
        body { background: #f3f4f6; }
      `}</style>

      {/* Toolbar (nascosta in stampa) */}
      <div className="toolbar max-w-3xl mx-auto mb-4 mt-4 flex items-center gap-3 bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-sans">
        <button
          onClick={() => window.opener ? window.close() : window.history.back()}
          className="shrink-0 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium">
          ← Indietro
        </button>
        <span className="flex-1 font-semibold truncate">
          📄 Ricevuta N. {numRic} — {giocatore.cognome} {giocatore.nome}
        </span>
        <a href={mailtoHref}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-500 text-slate-300 text-xs hover:bg-slate-700">
          ✉ Email
        </a>
        <button onClick={() => window.print()}
          className="shrink-0 px-4 py-1.5 bg-purple-600 rounded-lg text-xs font-semibold hover:bg-purple-700">
          🖨 Stampa / PDF
        </button>
      </div>

      {/* Documento */}
      <div className="receipt max-w-3xl mx-auto bg-white px-14 py-12 shadow-lg mb-8" style={{ fontFamily: 'Georgia, serif' }}>

        {/* Logo / Nome ASD */}
        <div style={{ marginBottom: 28 }}>
          {soc.logo_url
            ? <img src={soc.logo_url} alt="logo" style={{ height: 56, objectFit: 'contain' }} />
            : <div style={{ fontSize: 32, fontStyle: 'italic', fontWeight: 'bold', color: '#111' }}>🏀 {nomeAsd}</div>
          }
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, fontFamily: 'sans-serif' }}>
          Ricevuta / Quietanza di pagamento N. {numRic}
        </h1>

        <p style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 16, fontFamily: 'sans-serif' }}>
          {nomeAsd}{' '}
          <span style={{ fontWeight: 'normal' }}>dichiara di aver ricevuto</span>
        </p>

        {/* Tabella dati pagante / atleta */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <tbody>
            {(giocatore.cognome_genitore || giocatore.nome_genitore) && (
              <tr>
                <td style={tdL}>Da</td>
                <td style={tdV}>{giocatore.cognome_genitore} {giocatore.nome_genitore}</td>
                {giocatore.codice_fiscale_genitore
                  ? <><td style={tdL}>codice fiscale</td><td style={tdVM}>{giocatore.codice_fiscale_genitore}</td></>
                  : <td colSpan={2} style={tdV}></td>
                }
              </tr>
            )}
            <tr>
              <td style={tdL}>per</td>
              <td colSpan={3} style={tdV}>{giocatore.cognome} {giocatore.nome}</td>
            </tr>
            {(giocatore.luogo_nascita || giocatore.data_nascita) && (
              <tr>
                <td style={tdL}>nato a</td>
                <td style={tdV}>{giocatore.luogo_nascita ?? '—'}</td>
                <td style={tdL}>il</td>
                <td style={tdV}>{dataNasc}</td>
              </tr>
            )}
            {giocatore.codice_fiscale && (
              <tr>
                <td style={tdL}>codice fiscale</td>
                <td colSpan={3} style={tdVM}>{giocatore.codice_fiscale}</td>
              </tr>
            )}
            {(giocatore.indirizzo || giocatore.cap) && (
              <tr>
                <td style={tdL}>indirizzo</td>
                <td style={tdV}>{giocatore.indirizzo ?? '—'}</td>
                <td style={tdL}>CAP</td>
                <td style={tdV}>{giocatore.cap ?? '—'}</td>
              </tr>
            )}
            {giocatore.provincia && (
              <tr>
                <td style={tdL}>provincia</td>
                <td colSpan={3} style={tdV}>{giocatore.provincia}</td>
              </tr>
            )}
          </tbody>
        </table>

        <p style={{ fontSize: 13, marginBottom: 14, fontFamily: 'sans-serif' }}>per quanto sotto dettagliato</p>

        {/* Tabella pagamento */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <thead>
            <tr>
              {['Descrizione', 'Metodo di pagamento', 'Data di pagamento', 'Importo'].map(h => (
                <th key={h} style={{ border: '1px solid #ccc', padding: '7px 10px', background: '#f8f8f8', textAlign: 'left', fontFamily: 'sans-serif', fontSize: 13 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={payTd}>{quota.descrizione || quota.tipo}</td>
              <td style={payTd}>{quota.metodo_pagamento ? METODO_LABEL[quota.metodo_pagamento] : '—'}</td>
              <td style={payTd}>{dataPag}</td>
              <td style={{ ...payTd, textAlign: 'right' }}>{quota.importo?.toFixed(2)} €</td>
            </tr>
            <tr style={{ fontWeight: 'bold', background: '#fafafa' }}>
              <td colSpan={3} style={{ ...payTd, textAlign: 'right' }}>Totale</td>
              <td style={{ ...payTd, textAlign: 'right' }}>{quota.importo?.toFixed(2)} €</td>
            </tr>
          </tbody>
        </table>

        {/* Note */}
        <div style={{ display: 'flex', border: '1px solid #ccc', marginBottom: 24 }}>
          <div style={{ padding: '8px 10px', fontSize: 13, background: '#fafafa', borderRight: '1px solid #ccc', minWidth: 60, fontFamily: 'sans-serif' }}>Note</div>
          <div style={{ padding: '8px 10px', fontSize: 13, flex: 1, minHeight: 50 }}></div>
        </div>

        {/* Testo legale */}
        <div style={{ fontSize: 10, color: '#555', marginBottom: 40, fontFamily: 'sans-serif', lineHeight: 1.5 }}>
          <p style={{ marginBottom: 4 }}>1. Operazione esente da IVA ai sensi dell'art. 10 del DPR n. 633 26/10/1972 o dell'art. 36-bis DL n.75 del 22/06/2023</p>
          <p>2. Esente da marca da bollo ai sensi art. 1, comma 646, L. 145/2018 che ha modificato l'art. 27 bis della tab di cui all'allegato B annesso al D.P.R. 642/1972</p>
        </div>

        {/* Chiusura */}
        <div style={{ textAlign: 'right', fontSize: 13, marginBottom: 32, fontFamily: 'sans-serif' }}>
          {soc.citta ?? ''}, {dataPag}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #ccc', paddingTop: 14, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <strong style={{ fontSize: 13, color: '#111', display: 'block', marginBottom: 3 }}>{nomeAsd}</strong>
          <span style={{ fontSize: 11, color: '#555' }}>
            {footerParts}{footerParts && footerContatti ? ' | ' : ''}{footerContatti}
          </span>
        </div>
      </div>
    </>
  )
}
