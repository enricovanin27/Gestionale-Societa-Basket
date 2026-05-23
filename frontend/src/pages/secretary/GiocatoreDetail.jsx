import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, Send, Plus, Check, Trash2, Upload, FileText, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../../components/LoadingSpinner'
import GiocatoreForm from './GiocatoreForm'

function certStatus(dataScadenza) {
  if (!dataScadenza) return { label: 'Non registrato', cls: 'bg-gray-100 text-gray-500' }
  const diff = differenceInDays(parseISO(dataScadenza), new Date())
  if (diff < 0)  return { label: `Scaduto ${-diff}gg fa`, cls: 'bg-red-100 text-red-700' }
  if (diff < 30) return { label: `Scade in ${diff}gg`,    cls: 'bg-orange-100 text-orange-700' }
  return { label: format(parseISO(dataScadenza), 'd MMM yyyy', { locale: it }), cls: 'bg-green-100 text-green-700' }
}

const TIPI_QUOTA = ['iscrizione', 'mensile', 'trasferta', 'attrezzatura', 'altro']
const TIPO_LABEL = { iscrizione: 'Iscrizione', mensile: 'Mensile', trasferta: 'Trasferta', attrezzatura: 'Attrezzatura', altro: 'Altro' }
const QUOTA_EMPTY = {
  tipo: 'iscrizione', descrizione: '', rate_totali: 1,
  rate: [
    { importo: '', scadenza: '' },
    { importo: '', scadenza: '' },
    { importo: '', scadenza: '' },
  ],
}

const TABS = [
  { id: 'anagrafica', label: 'Anagrafica' },
  { id: 'note',       label: 'Note' },
  { id: 'quote',      label: 'Quote' },
  { id: 'cert',       label: 'Certificato' },
  { id: 'documenti',  label: 'Documenti' },
]

export default function GiocatoreDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { societaId, displayName } = useAuth()
  const qc = useQueryClient()

  const [activeTab, setActiveTab]   = useState('anagrafica')
  const [nuovaNota, setNuovaNota]   = useState('')
  const [editCert, setEditCert]     = useState(false)
  const [certInput, setCertInput]   = useState('')
  const [showAddQuota, setShowAddQuota] = useState(false)
  const [quotaForm, setQuotaForm]   = useState(QUOTA_EMPTY)
  const [savingQuota, setSavingQuota] = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [savingAnagrafica, setSavingAnagrafica] = useState(false)
  const [annoAtt730, setAnnoAtt730]             = useState(new Date().getFullYear())

  const { data: giocatore, isLoading: loadingG } = useQuery({
    queryKey: ['giocatore-detail', id],
    enabled: !!id && !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select(`id, nome, cognome, squadra, squadra2, squadra3,
         cert_medico_scadenza, cert_medico_url,
         data_nascita, luogo_nascita, codice_fiscale,
         indirizzo, citta, cap, provincia,
         nome_genitore, cognome_genitore, codice_fiscale_genitore,
         telefono, email_genitore, data_iscrizione, numero_maglia`)
        .eq('id', id).eq('societa_id', societaId).single()
      return data
    },
  })

  const { data: note = [], isLoading: loadingNote } = useQuery({
    queryKey: ['note-giocatore', id],
    enabled: !!id && activeTab === 'note',
    queryFn: async () => {
      const { data } = await supabase
        .from('note_giocatore')
        .select('id, testo, autore_nome, created_at')
        .eq('giocatore_id', id).eq('societa_id', societaId)
        .order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const { data: quote = [], isLoading: loadingQ } = useQuery({
    queryKey: ['quote-giocatore', id],
    enabled: !!id && activeTab === 'quote',
    queryFn: async () => {
      const { data } = await supabase
        .from('quote')
        .select('id, tipo, descrizione, importo, data_scadenza, pagato, numero_rata, rate_totali')
        .eq('giocatore_id', id).eq('societa_id', societaId)
        .order('pagato').order('data_scadenza').order('numero_rata')
      return data ?? []
    },
  })

  const addNotaMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('note_giocatore').insert([{
        societa_id: societaId, giocatore_id: id,
        testo: nuovaNota.trim(), autore_nome: displayName,
      }])
      if (error) throw error
    },
    onSuccess: () => { setNuovaNota(''); qc.invalidateQueries({ queryKey: ['note-giocatore', id] }) },
  })

  const certMut = useMutation({
    mutationFn: async (cert_medico_scadenza) => {
      const { error } = await supabase
        .from('giocatori').update({ cert_medico_scadenza }).eq('id', id).eq('societa_id', societaId)
      if (error) throw error
    },
    onSuccess: () => {
      setEditCert(false)
      qc.invalidateQueries({ queryKey: ['giocatore-detail', id] })
      qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
    },
  })

  const togglePagatoMut = useMutation({
    mutationFn: async ({ id: qid, pagato }) => {
      const payload = pagato
        ? { pagato: true }
        : { pagato: false, metodo_pagamento: null, data_pagamento: null, numero_ricevuta: null }
      const { error } = await supabase.from('quote').update(payload).eq('id', qid)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-giocatore', id] })
      qc.invalidateQueries({ queryKey: ['quote-segreteria', societaId] })
      qc.invalidateQueries({ queryKey: ['segreteria-quote-aperte', societaId] })
    },
  })

  const deleteQuotaMut = useMutation({
    mutationFn: async (qid) => {
      const { error } = await supabase.from('quote').delete().eq('id', qid)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-giocatore', id] })
      qc.invalidateQueries({ queryKey: ['quote-segreteria', societaId] })
      qc.invalidateQueries({ queryKey: ['segreteria-quote-aperte', societaId] })
    },
  })

  async function handleAddQuota(e) {
    e.preventDefault()
    const rateAttive = quotaForm.rate.slice(0, quotaForm.rate_totali)
    if (rateAttive.some(r => !r.importo)) return
    setSavingQuota(true)
    try {
      const rows = rateAttive.map((r, i) => ({
        societa_id:    societaId,
        giocatore_id:  id,
        tipo:          quotaForm.tipo,
        descrizione:   quotaForm.descrizione || TIPO_LABEL[quotaForm.tipo],
        importo:       parseFloat(r.importo),
        data_scadenza: r.scadenza || null,
        pagato:        false,
        numero_rata:   quotaForm.rate_totali > 1 ? i + 1 : null,
        rate_totali:   quotaForm.rate_totali > 1 ? quotaForm.rate_totali : null,
      }))
      const { error } = await supabase.from('quote').insert(rows)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['quote-giocatore', id] })
      qc.invalidateQueries({ queryKey: ['quote-segreteria', societaId] })
      qc.invalidateQueries({ queryKey: ['segreteria-quote-aperte', societaId] })
      setShowAddQuota(false)
      setQuotaForm(QUOTA_EMPTY)
    } finally {
      setSavingQuota(false)
    }
  }

  async function handleSaveAnagrafica(formData) {
    setSavingAnagrafica(true)
    try {
      const { error } = await supabase.from('giocatori').update({
        cognome:                 formData.cognome,
        nome:                    formData.nome,
        data_nascita:            formData.data_nascita            || null,
        luogo_nascita:           formData.luogo_nascita           || null,
        codice_fiscale:          formData.codice_fiscale          || null,
        indirizzo:               formData.indirizzo               || null,
        citta:                   formData.citta                   || null,
        cap:                     formData.cap                     || null,
        provincia:               formData.provincia               || null,
        nome_genitore:           formData.nome_genitore           || null,
        cognome_genitore:        formData.cognome_genitore        || null,
        codice_fiscale_genitore: formData.codice_fiscale_genitore || null,
        telefono:                formData.telefono                || null,
        email_genitore:          formData.email_genitore          || null,
        squadra:                 formData.squadra,
        squadra2:                formData.squadra2                || null,
        squadra3:                formData.squadra3                || null,
        numero_maglia:           formData.numero_maglia ? parseInt(formData.numero_maglia) : null,
        data_iscrizione:         formData.data_iscrizione         || null,
        cert_medico_scadenza:    formData.cert_medico_scadenza    || null,
      }).eq('id', id).eq('societa_id', societaId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['giocatore-detail', id] })
      qc.invalidateQueries({ queryKey: ['segreteria-giocatori', societaId] })
    } catch (err) {
      alert('Errore: ' + err.message)
    } finally {
      setSavingAnagrafica(false)
    }
  }

  async function handleUploadCert(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path = `${societaId}/${id}/cert_medico.pdf`
      const { error: upErr } = await supabase.storage
        .from('certificati')
        .upload(path, file, { upsert: true, contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('certificati').getPublicUrl(path)
      const { error: dbErr } = await supabase
        .from('giocatori').update({ cert_medico_url: publicUrl }).eq('id', id).eq('societa_id', societaId)
      if (dbErr) throw dbErr
      qc.invalidateQueries({ queryKey: ['giocatore-detail', id] })
    } catch (err) {
      alert('Errore upload: ' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  if (loadingG) return <div className="pt-8"><LoadingSpinner /></div>
  if (!giocatore) return <div className="px-4 pt-8 text-center text-sm text-gray-400">Giocatore non trovato</div>

  const squadre = [giocatore.squadra, giocatore.squadra2, giocatore.squadra3].filter(Boolean)
  const cert = certStatus(giocatore.cert_medico_scadenza)
  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500'

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-purple-800 to-purple-600 text-white px-4 pt-10 pb-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-purple-200 mb-3">
          <ChevronLeft size={16} /> Giocatori
        </button>
        <h1 className="text-2xl font-bold">{giocatore.cognome} {giocatore.nome}</h1>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {squadre.map(s => (
            <span key={s} className="text-xs bg-purple-700 text-purple-100 px-2 py-0.5 rounded-full">{s}</span>
          ))}
        </div>
      </div>

      <div className="bg-white border-b flex sticky top-0 z-10">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === t.id ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 py-4 pb-24">

        {/* ── ANAGRAFICA ── */}
        {activeTab === 'anagrafica' && (
          <GiocatoreForm
            initialValues={giocatore}
            onSave={handleSaveAnagrafica}
            onCancel={() => setActiveTab('note')}
            saving={savingAnagrafica}
          />
        )}

        {/* ── NOTE ── */}
        {activeTab === 'note' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <textarea value={nuovaNota} onChange={e => setNuovaNota(e.target.value)}
                placeholder="Es. Avvisato per mail il 03/04 — rinnovo certificato..."
                rows={3}
                className="w-full text-sm border-0 outline-none resize-none text-gray-700 placeholder-gray-300" />
              <div className="flex justify-end">
                <button onClick={() => addNotaMut.mutate()}
                  disabled={!nuovaNota.trim() || addNotaMut.isPending}
                  className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 active:scale-95 transition-transform">
                  <Send size={12} /> Salva nota
                </button>
              </div>
            </div>
            {loadingNote ? <LoadingSpinner /> : note.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Nessuna nota registrata</p>
            ) : note.map(n => (
              <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-800 leading-relaxed">{n.testo}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {n.autore_nome} · {format(parseISO(n.created_at), 'd MMM yyyy, HH:mm', { locale: it })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── QUOTE ── */}
        {activeTab === 'quote' && (
          <div className="space-y-2">
            {/* Add quota inline form */}
            {showAddQuota ? (
              <div className="bg-white rounded-xl border border-purple-200 p-4 mb-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-800">Aggiungi quota</p>
                  <button onClick={() => { setShowAddQuota(false); setQuotaForm(QUOTA_EMPTY) }}>
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>
                <form onSubmit={handleAddQuota} className="space-y-3">
                  {/* Tipo */}
                  <div className="flex gap-1.5 flex-wrap">
                    {TIPI_QUOTA.map(t => (
                      <button key={t} type="button"
                        onClick={() => setQuotaForm(f => ({ ...f, tipo: t }))}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          quotaForm.tipo === t
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-gray-600 border-gray-200'
                        }`}>
                        {TIPO_LABEL[t]}
                      </button>
                    ))}
                  </div>
                  <input className={inp} placeholder="Descrizione (opzionale)"
                    value={quotaForm.descrizione}
                    onChange={e => setQuotaForm(f => ({ ...f, descrizione: e.target.value }))} />

                  {/* Numero rate */}
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5">Pagamento</p>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map(n => (
                        <button key={n} type="button"
                          onClick={() => setQuotaForm(f => ({ ...f, rate_totali: n }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            quotaForm.rate_totali === n
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-gray-600 border-gray-200'
                          }`}>
                          {n === 1 ? 'Unica' : `${n} rate`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Importo + scadenza per ogni rata */}
                  {Array.from({ length: quotaForm.rate_totali }, (_, i) => (
                    <div key={i} className="space-y-1">
                      {quotaForm.rate_totali > 1 && (
                        <p className="text-xs font-medium text-purple-600">Rata {i + 1}/{quotaForm.rate_totali}</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" min="0" step="0.01" className={inp}
                          placeholder="Importo €" required
                          value={quotaForm.rate[i].importo}
                          onChange={e => setQuotaForm(f => {
                            const rate = [...f.rate]
                            rate[i] = { ...rate[i], importo: e.target.value }
                            return { ...f, rate }
                          })} />
                        <input type="date" className={inp}
                          value={quotaForm.rate[i].scadenza}
                          onChange={e => setQuotaForm(f => {
                            const rate = [...f.rate]
                            rate[i] = { ...rate[i], scadenza: e.target.value }
                            return { ...f, rate }
                          })} />
                      </div>
                    </div>
                  ))}

                  <button type="submit" disabled={savingQuota}
                    className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                    {savingQuota ? 'Salvataggio...' : quotaForm.rate_totali > 1 ? `Aggiungi ${quotaForm.rate_totali} rate` : 'Aggiungi'}
                  </button>
                </form>
              </div>
            ) : (
              <button onClick={() => setShowAddQuota(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-purple-300 rounded-xl text-sm text-purple-600 font-medium hover:bg-purple-50 transition-colors">
                <Plus size={14} /> Aggiungi quota
              </button>
            )}

            {loadingQ ? <LoadingSpinner /> : quote.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Nessuna quota registrata</p>
            ) : quote.map(q => {
              const rataLabel = (q.rate_totali ?? 1) > 1 ? `Rata ${q.numero_rata}/${q.rate_totali}` : null
              return (
              <div key={q.id} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3 ${q.pagato ? 'opacity-55' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{q.descrizione || TIPO_LABEL[q.tipo] || q.tipo}</p>
                    {rataLabel && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-semibold">{rataLabel}</span>
                    )}
                  </div>
                  {q.data_scadenza && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Scadenza: {format(parseISO(q.data_scadenza), 'd MMM yyyy', { locale: it })}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 mr-1">
                  {q.importo != null && <p className="text-sm font-bold text-gray-900">€{q.importo}</p>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    q.pagato ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>{q.pagato ? 'Pagato' : 'Da pagare'}</span>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => togglePagatoMut.mutate({ id: q.id, pagato: !q.pagato })}
                    title={q.pagato ? 'Segna non pagato' : 'Segna pagato'}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      q.pagato ? 'bg-gray-100 text-gray-400' : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}>
                    <Check size={14} />
                  </button>
                  <button onClick={() => deleteQuotaMut.mutate(q.id)}
                    className="w-8 h-8 rounded-lg bg-gray-50 text-gray-300 hover:text-red-400 flex items-center justify-center">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )})}
          </div>
        )}

        {/* ── CERTIFICATO ── */}
        {activeTab === 'cert' && (
          <div className="space-y-4">
            {/* Stato scadenza */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">Stato certificato medico</p>
              <span className={`text-sm px-3 py-1 rounded-full font-semibold ${cert.cls}`}>
                {cert.label}
              </span>
              {!editCert ? (
                <button onClick={() => { setEditCert(true); setCertInput(giocatore.cert_medico_scadenza ?? '') }}
                  className="mt-4 flex items-center gap-1.5 text-sm text-purple-600 font-medium">
                  <Plus size={14} /> {giocatore.cert_medico_scadenza ? 'Aggiorna data' : 'Inserisci data'}
                </button>
              ) : (
                <div className="mt-4 space-y-2">
                  <label className="text-xs text-gray-500">Nuova scadenza</label>
                  <input type="date" value={certInput} onChange={e => setCertInput(e.target.value)}
                    className={inp} />
                  <div className="flex gap-2">
                    <button onClick={() => certMut.mutate(certInput || null)}
                      disabled={certMut.isPending}
                      className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                      Salva
                    </button>
                    <button onClick={() => setEditCert(false)}
                      className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-500">
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* PDF certificato */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">PDF Certificato</p>

              {giocatore.cert_medico_url && (
                <a href={giocatore.cert_medico_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-purple-600 font-medium mb-3 hover:underline">
                  <FileText size={16} /> Visualizza / Scarica PDF
                </a>
              )}

              <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-dashed cursor-pointer transition-colors ${
                uploading
                  ? 'border-gray-200 text-gray-400'
                  : 'border-purple-300 text-purple-600 hover:bg-purple-50'
              }`}>
                <Upload size={16} />
                <span className="text-sm font-medium">
                  {uploading ? 'Caricamento...' : giocatore.cert_medico_url ? 'Sostituisci PDF' : 'Carica PDF'}
                </span>
                <input type="file" accept="application/pdf" className="hidden"
                  disabled={uploading} onChange={handleUploadCert} />
              </label>
            </div>
          </div>
        )}

        {/* ── DOCUMENTI ── */}
        {activeTab === 'documenti' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">Attestazione spese sportive (Modello 730)</p>
              <p className="text-xs text-gray-400 mb-4">
                Genera il documento per la detrazione IRPEF 19% (limite €210, art. 15 TUIR)
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-gray-500">Anno:</label>
                <select
                  value={annoAtt730}
                  onChange={e => setAnnoAtt730(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                  {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <a
                  href={`/secretary/attestazione730/${id}?anno=${annoAtt730}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold">
                  📋 Genera attestazione
                </a>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
