import { useState, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Upload, FileText, Check, AlertCircle, X, Plus, ChevronDown,
  Loader2, AlertTriangle, MapPin, Clock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import PageHeader from '../components/PageHeader'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatData(d) {
  if (!d) return '—'
  const [y, m, g] = d.split('-')
  return `${g}/${m}/${y}`
}

function statoColor(s) {
  return s === 'provvisoria'
    ? 'bg-yellow-100 text-yellow-800'
    : 'bg-green-100 text-green-800'
}

function addTwoHours(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const tot = h * 60 + m + 120
  return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
}

// ─── Partita row ──────────────────────────────────────────────────────────────

function PartitaRow({ partita, index, onChange, onImporta, importing, palestreList = [] }) {
  const [open, setOpen] = useState(false)
  const p = partita

  return (
    <div className="border border-gray-200 rounded-xl mb-2 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 p-3 bg-white cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statoColor(p.stato)}`}>
          {p.stato === 'provvisoria' ? '⚠️ Prov.' : '✅ Def.'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            🏀 {p.squadra} vs {p.avversario || '—'}
            <span className="ml-1 text-xs font-normal text-gray-500">
              ({(p.casa_fuori ?? 'Casa').toLowerCase() === 'casa' ? '🏠 casa' : '✈️ trasferta'})
            </span>
          </p>
          <p className="text-xs text-gray-500">
            {formatData(p.data)}
            {p.ora_inizio ? ` · ${p.ora_inizio}` : ''}
            {p.palestra ? ` · ${p.palestra}` : ''}
          </p>
        </div>
        {p.conflitto && (
          <AlertTriangle size={16} className="text-orange-500 flex-shrink-0" title={p.conflitto} />
        )}
        <button
          onClick={e => { e.stopPropagation(); onImporta(index) }}
          disabled={importing}
          className="flex-shrink-0 flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded-lg disabled:opacity-50"
        >
          {importing ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        </button>
        <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded edit */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Data</label>
              <input type="date" value={p.data ?? ''} onChange={e => onChange(index, 'data', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Ora inizio</label>
              <input type="time" value={p.ora_inizio ?? ''} onChange={e => onChange(index, 'ora_inizio', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Avversario</label>
              <input value={p.avversario ?? ''} onChange={e => onChange(index, 'avversario', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Palestra / Luogo</label>
              {palestreList.length > 0 ? (
                <select value={p.palestra ?? ''} onChange={e => onChange(index, 'palestra', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mt-0.5">
                  <option value="">Scegli palestra...</option>
                  {palestreList.map(pl => <option key={pl} value={pl}>{pl}</option>)}
                </select>
              ) : (
                <input value={p.palestra ?? ''} onChange={e => onChange(index, 'palestra', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mt-0.5" />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500">Casa / Trasferta</label>
              <select value={p.casa_fuori ?? 'Casa'} onChange={e => onChange(index, 'casa_fuori', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mt-0.5">
                <option value="Casa">🏠 Casa</option>
                <option value="Fuori Casa">✈️ Trasferta</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Stato</label>
              <select value={p.stato ?? 'provvisoria'} onChange={e => onChange(index, 'stato', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mt-0.5">
                <option value="provvisoria">Provvisoria</option>
                <option value="definitiva">Definitiva</option>
              </select>
            </div>
          </div>
          {p.conflitto && (
            <p className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">⚠️ {p.conflitto}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportaCalendarioPage({ embedded = false }) {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const { isAdmin, isAllenatore, user, societaId } = useAuth()

  const [file,           setFile]           = useState(null)
  const [squadraScelta,  setSquadraScelta]  = useState('')
  const [societa,        setSocieta]        = useState('Oderzo')
  const [tipoImport,     setTipoImport]     = useState('provvisoria')
  const [partite,        setPartite]        = useState([])
  const [loading,        setLoading]        = useState(false)
  const [errore,         setErrore]         = useState(null)
  const [importingIdx,   setImportingIdx]   = useState(null)
  const [importingAll,   setImportingAll]   = useState(false)
  const [imported,       setImported]       = useState(new Set())

  const { data: squadreList = [] } = useQuery({
    queryKey: ['squadre-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').order('categoria')
      return (data ?? []).map(r => r.categoria).filter(Boolean)
    },
    staleTime: 5 * 60 * 1000,
  })

  // Se allenatore: carica solo le proprie squadre
  const { data: mySquadreAll = null } = useQuery({
    queryKey: ['my-squadre-import', user?.email],
    enabled: isAllenatore && !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from('allenatori')
        .select('squadre_capo, squadre_vice')
        .eq('email', user.email)
        .maybeSingle()
      if (!data) return []
      const parse = str => (str ?? '').split(',').map(s => s.trim()).filter(Boolean)
      return [...new Set([...parse(data.squadre_capo), ...parse(data.squadre_vice)])]
    },
    staleTime: 5 * 60 * 1000,
  })

  const squadreFiltered = useMemo(() => {
    if (isAdmin || mySquadreAll === null) return squadreList
    return squadreList.filter(s => mySquadreAll.includes(s))
  }, [isAdmin, squadreList, mySquadreAll])

  const { data: palestreList = [] } = useQuery({
    queryKey: ['palestre-nomi'],
    queryFn: async () => {
      const { data } = await supabase.from('palestre').select('nome').order('nome')
      return (data ?? []).map(r => r.nome).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: existingCalendario = [] } = useQuery({
    queryKey: ['calendarioAll'],
    queryFn: async () => {
      const { data } = await supabase.from('calendario').select('data,ora_inizio,squadra')
      return data ?? []
    },
  })

  const { data: doppioList = [] } = useQuery({
    queryKey: ['doppio-campionato'],
    queryFn: async () => {
      const { data } = await supabase.from('doppio_campionato').select('*')
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  function checkConflitto(p) {
    if (!p.data || !p.squadra) return null
    const match = existingCalendario.find(
      e => e.data === p.data && e.squadra === p.squadra
    )
    if (match) return `${p.squadra} ha già una partita il ${formatData(p.data)}`
    const partners = doppioList
      .filter(d => d.squadra_a === p.squadra || d.squadra_b === p.squadra)
      .map(d => d.squadra_a === p.squadra ? d.squadra_b : d.squadra_a)
    const doppioMatch = existingCalendario.find(
      e => e.data === p.data && partners.includes(e.squadra)
    )
    if (doppioMatch) return `Doppio campionato: ${doppioMatch.squadra} ha già una partita il ${formatData(p.data)}`
    return null
  }

  async function handleEstraiPDF() {
    if (!file || !squadraScelta) return
    setLoading(true)
    setErrore(null)
    setPartite([])
    setImported(new Set())

    try {
      const fd = new FormData()
      fd.append('pdf', file)
      fd.append('societa', societa)

      const res  = await fetch(`${API_BASE}/api/fip/estrai`, { method: 'POST', body: fd })
      const json = await res.json()

      if (!json.success) {
        setErrore(json.errore ?? 'Errore sconosciuto')
        return
      }

      const arricchite = (json.partite ?? []).map(p => {
        const row = {
          ...p,
          squadra:    squadraScelta,
          avversario: p.avversario ?? '',
          palestra:   p.luogo ?? '',
          ora_inizio: p.ora ?? '',
          ora_fine:   addTwoHours(p.ora),
          stato:      tipoImport,
        }
        return { ...row, conflitto: checkConflitto(row) }
      })
      setPartite(arricchite)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleChange(idx, key, val) {
    setPartite(prev => prev.map((p, i) => {
      if (i !== idx) return p
      const updated = { ...p, [key]: val }
      updated.conflitto = checkConflitto(updated)
      return updated
    }))
  }

  function buildRow(p) {
    return {
      data:       p.data,
      ora_inizio: p.ora_inizio ?? null,
      ora_fine:   p.ora_fine   ?? null,
      squadra:    p.squadra    ?? null,
      avversario: p.avversario ?? null,
      palestra:   p.palestra   ?? null,
      casa_fuori: p.casa_fuori ?? 'Casa',
      stato:      p.stato      ?? 'provvisoria',
      tipo:       'partita',
      societa_id: societaId,
    }
  }

  async function importaSingola(idx) {
    const p = partite[idx]
    if (!p.squadra || !p.data) {
      alert('Completa squadra e data prima di importare.')
      return
    }
    setImportingIdx(idx)
    try {
      const { error } = await supabase.from('calendario').insert([buildRow(p)])
      if (error) throw error
      setImported(prev => new Set([...prev, idx]))
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      qc.invalidateQueries({ queryKey: ['calendarioAll'] })
    } catch (e) {
      alert('Errore importazione: ' + e.message)
    } finally {
      setImportingIdx(null)
    }
  }

  async function importaTutte() {
    const valide = partite.filter((p, i) => p.squadra && p.data && !imported.has(i))
    if (!valide.length) return
    setImportingAll(true)
    try {
      const { error } = await supabase.from('calendario').insert(valide.map(buildRow))
      if (error) throw error
      setImported(new Set(partite.map((_, i) => i)))
      qc.invalidateQueries({ queryKey: ['weekEvents'] })
      qc.invalidateQueries({ queryKey: ['calendarioAll'] })
    } catch (e) {
      alert('Errore importazione: ' + e.message)
    } finally {
      setImportingAll(false)
    }
  }

  const nImportabili = partite.filter((p, i) => p.squadra && p.data && !imported.has(i)).length
  const canEstrai    = !!file && !!squadraScelta && !loading

  const inner = (
    <div className="space-y-4">
        {/* Upload card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">1. Seleziona la squadra</h2>

          {/* Squad selector — required first */}
          {squadreFiltered.length === 0 ? (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              {isAllenatore
                ? 'Nessuna squadra assegnata. Contatta un admin.'
                : 'Nessuna squadra trovata. Configura le squadre nel Setup.'}
            </div>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {squadreFiltered.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSquadraScelta(s); setPartite([]); setImported(new Set()) }}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                    squadraScelta === s
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {squadraScelta && (
            <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
              <Check size={14} className="text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">
                Importo partite per: <strong>{squadraScelta}</strong>
              </span>
              <button onClick={() => { setSquadraScelta(''); setPartite([]) }} className="ml-auto text-blue-400">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="border-t border-gray-100 pt-3">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">2. Carica PDF calendario</h2>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-blue-400 transition-colors"
            >
              <Upload size={20} className="text-blue-500" />
              <span className="text-sm text-gray-600">
                {file ? file.name : 'Seleziona file PDF…'}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => { setFile(e.target.files[0] ?? null); setPartite([]); setErrore(null) }}
            />
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nome club FIP</label>
              <input
                value={societa}
                onChange={e => setSocieta(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tipo importazione</label>
              <select
                value={tipoImport}
                onChange={e => setTipoImport(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="provvisoria">Provvisoria ⚠️</option>
                <option value="definitiva">Definitiva ✅</option>
              </select>
            </div>
          </div>

          {!squadraScelta && (
            <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
              ⚠️ Seleziona prima la squadra per continuare.
            </p>
          )}

          <button
            onClick={handleEstraiPDF}
            disabled={!canEstrai}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-medium py-2.5 rounded-xl disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {loading ? 'Estrazione in corso…' : 'Estrai dal PDF'}
          </button>

          {errore && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">{errore}</p>
            </div>
          )}
        </div>

        {/* Results */}
        {partite.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                3. Partite estratte ({partite.length})
              </h2>
              <button
                onClick={importaTutte}
                disabled={importingAll || nImportabili === 0}
                className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {importingAll
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Check size={12} />}
                Importa tutte ({nImportabili})
              </button>
            </div>

            {partite.some(p => p.conflitto) && (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3">
                <AlertTriangle size={14} className="text-orange-500" />
                <p className="text-xs text-orange-700">
                  Alcune partite hanno conflitti con il calendario esistente.
                </p>
              </div>
            )}

            <p className="text-xs text-gray-400">
              I dati sono compilati automaticamente dal PDF. Tocca una partita per correggere eventuali errori, poi usa ➕ per importarla.
            </p>

            {partite.map((p, i) => (
              imported.has(i) ? (
                <div key={i} className="flex items-center gap-2 border border-green-200 bg-green-50 rounded-xl p-3">
                  <Check size={16} className="text-green-600" />
                  <span className="text-sm text-green-700 flex-1 truncate">
                    🏀 {p.squadra} vs {p.avversario} ({formatData(p.data)})
                  </span>
                  <span className="text-xs text-green-600 font-medium">Importata</span>
                </div>
              ) : (
                <PartitaRow
                  key={i}
                  partita={p}
                  index={i}
                  onChange={handleChange}
                  onImporta={importaSingola}
                  importing={importingIdx === i}
                  palestreList={palestreList}
                />
              )
            ))}
          </div>
        )}
    </div>
  )

  if (embedded) return <div className="pb-4">{inner}</div>
  return (
    <div className="flex flex-col min-h-screen pb-24 bg-gray-50">
      <PageHeader title="Importa Calendario" />
      <div className="p-4">{inner}</div>
    </div>
  )
}
