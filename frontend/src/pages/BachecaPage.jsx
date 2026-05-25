import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Plus, X, Pin, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import PageHeader from '../components/PageHeader'

const LAST_READ_KEY = (sid) => `bacheca_last_read_${sid}`

function getLastRead(societaId) {
  try { return localStorage.getItem(LAST_READ_KEY(societaId)) ?? '1970-01-01' }
  catch { return '1970-01-01' }
}

function setLastRead(societaId) {
  try { localStorage.setItem(LAST_READ_KEY(societaId), new Date().toISOString()) }
  catch { /* noop */ }
}

// ─── Hook per conteggio non letti (usato da BottomNav) ────────────────────────
export function useUnreadAnnunci(societaId) {
  return useQuery({
    queryKey: ['annunci-unread-count', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const since = getLastRead(societaId)
      const { count } = await supabase
        .from('annunci')
        .select('id', { count: 'exact', head: true })
        .eq('societa_id', societaId)
        .gt('created_at', since)
      return count ?? 0
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

// ─── Form nuovo annuncio ──────────────────────────────────────────────────────
function NuovoAnnuncioModal({ onClose, squadre, isAllenatore, societaId, autorId, autoreNome }) {
  const qc = useQueryClient()
  const defaultSquadra = isAllenatore && squadre.length > 0 ? squadre[0] : ''
  const [form, setForm] = useState({ titolo: '', testo: '', squadra: defaultSquadra, pinned: false })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('annunci').insert([{
        societa_id: societaId,
        squadra:    form.squadra || null,
        titolo:     form.titolo.trim(),
        testo:      form.testo.trim(),
        autore_id:  autorId,
        autore_nome: autoreNome,
        pinned:     form.pinned,
      }])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annunci'] })
      onClose()
    },
  })

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-t-2xl w-full max-w-lg p-5 pb-10 shadow-2xl max-h-[90svh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Nuovo annuncio</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate() }} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Titolo *</label>
            <input
              value={form.titolo}
              onChange={(e) => set('titolo', e.target.value)}
              className={inp}
              placeholder="Es. Cambio orario allenamento"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Testo</label>
            <textarea
              value={form.testo}
              onChange={(e) => set('testo', e.target.value)}
              className={`${inp} resize-none`}
              rows={4}
              placeholder="Dettagli dell'annuncio..."
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra destinataria</label>
            <select value={form.squadra} onChange={(e) => set('squadra', e.target.value)} className={inp}>
              {!isAllenatore && <option value="">Tutte le squadre</option>}
              {squadre.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => set('pinned', e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-gray-700">📌 Fissa in cima</span>
          </label>

          {saveMut.isError && (
            <p className="text-xs text-red-500">{saveMut.error?.message}</p>
          )}

          <button
            type="submit"
            disabled={saveMut.isPending || !form.titolo.trim()}
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-medium text-sm disabled:opacity-60 active:scale-95 transition-transform"
          >
            {saveMut.isPending ? 'Pubblicazione...' : '📣 Pubblica annuncio'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Card singolo annuncio ────────────────────────────────────────────────────
function AnnuncioCard({ ann, canDelete, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const hasText = ann.testo?.trim()

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${ann.pinned ? 'border-blue-300' : 'border-gray-200'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {ann.pinned && <Pin size={12} className="text-blue-500 shrink-0" />}
              <span className="font-semibold text-sm text-gray-900">{ann.titolo}</span>
              {ann.squadra && (
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{ann.squadra}</span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              {ann.autore_nome} · {format(parseISO(ann.created_at), 'd MMM yyyy', { locale: it })}
            </p>
          </div>
          {canDelete && (
            <button
              onClick={() => onDelete(ann.id)}
              className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors shrink-0"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {hasText && (
          <>
            <div className={`mt-3 text-sm text-gray-700 leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
              {ann.testo}
            </div>
            {ann.testo.length > 80 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-1.5 flex items-center gap-1 text-xs text-blue-600 font-medium"
              >
                {expanded ? <><ChevronUp size={13} /> Meno</> : <><ChevronDown size={13} /> Leggi tutto</>}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Pagina principale ────────────────────────────────────────────────────────
export default function BachecaPage() {
  const { user, profile, societaId, isAdmin, isAllenatore, isSegreteria, activeRole, displayName, squadreAllenatore } = useAuth()
  const qc = useQueryClient()
  const canWrite = (isAdmin || isAllenatore || isSegreteria) && activeRole !== 'giocatore' && activeRole !== 'genitore'
  const [showForm, setShowForm] = useState(false)
  const [squadraFilter, setSquadraFilter] = useState('')

  useEffect(() => {
    if (societaId) {
      setLastRead(societaId)
      qc.invalidateQueries({ queryKey: ['annunci-unread-count', societaId] })
    }
  }, [societaId, qc])

  const { data: squadre = [] } = useQuery({
    queryKey: ['squadre-nomi', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('squadre')
        .select('categoria')
        .eq('societa_id', societaId)
        .order('categoria')
      return (data ?? []).map((r) => r.categoria).filter(Boolean)
    },
    staleTime: 10 * 60 * 1000,
  })

  const { data: annunci = [], isLoading } = useQuery({
    queryKey: ['annunci', societaId, squadraFilter],
    enabled: !!societaId,
    queryFn: async () => {
      let q = supabase
        .from('annunci')
        .select('*')
        .eq('societa_id', societaId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (squadraFilter) {
        q = q.or(`squadra.eq.${squadraFilter},squadra.is.null`)
      }

      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    staleTime: 30 * 1000,
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('annunci').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['annunci'] }),
  })

  const mySquadre = [profile?.squadra, profile?.squadra2, profile?.squadra3].filter(Boolean)

  const annunciFiltrati = annunci.filter((a) => {
    if (canWrite) return true
    if (!a.squadra) return true
    return mySquadre.some((s) => s.toLowerCase() === (a.squadra ?? '').toLowerCase())
  })

  function canDeleteAnnuncio(ann) {
    if (!user) return false
    return ann.autore_id === user.id || isAdmin
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <PageHeader
        title="Bacheca"
        subtitle="Comunicazioni della società"
        actions={canWrite && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-white text-amber-700 px-3 py-2 rounded-xl text-sm font-semibold shadow active:scale-95 transition-transform"
          >
            <Plus size={16} /> Nuovo
          </button>
        )}
      >
        {/* Filtro squadra */}
        {(canWrite || mySquadre.length > 1) && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setSquadraFilter('')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !squadraFilter ? 'bg-white text-amber-700' : 'bg-amber-500 text-amber-100'
              }`}
            >
              Tutte
            </button>
            {(canWrite ? squadre : mySquadre).map((s) => (
              <button
                key={s}
                onClick={() => setSquadraFilter(s === squadraFilter ? '' : s)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  squadraFilter === s ? 'bg-white text-amber-700' : 'bg-amber-500 text-amber-100'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {/* Contenuto */}
      <div className="px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Caricamento...</div>
        ) : annunciFiltrati.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <span className="text-5xl block mb-3">📋</span>
            <p className="text-sm font-medium">Nessun annuncio</p>
            {canWrite && (
              <p className="text-xs mt-1 text-gray-300">Usa il pulsante "Nuovo" per pubblicare</p>
            )}
          </div>
        ) : (
          annunciFiltrati.map((ann) => (
            <AnnuncioCard
              key={ann.id}
              ann={ann}
              canDelete={canDeleteAnnuncio(ann)}
              onDelete={(id) => {
                if (window.confirm('Eliminare questo annuncio?')) deleteMut.mutate(id)
              }}
            />
          ))
        )}
      </div>

      {showForm && (
        <NuovoAnnuncioModal
          onClose={() => setShowForm(false)}
          squadre={isAllenatore && squadreAllenatore?.length ? squadreAllenatore : squadre}
          isAllenatore={isAllenatore}
          societaId={societaId}
          autorId={user?.id}
          autoreNome={displayName}
        />
      )}
    </div>
  )
}
