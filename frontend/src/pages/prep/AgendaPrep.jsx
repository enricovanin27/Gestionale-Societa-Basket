import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { it } from 'date-fns/locale'
import { Plus, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

const QUANDO_LABEL = { prima: 'Prima', durante: 'Durante', dopo: 'Dopo', standalone: 'Sessione libera' }
const QUANDO_COLOR = {
  prima:      'bg-blue-100 text-blue-800',
  durante:    'bg-amber-100 text-amber-800',
  dopo:       'bg-purple-100 text-purple-800',
  standalone: 'bg-gray-100 text-gray-700',
}
const FORM_EMPTY_LEGATA = { tipo: 'legata', squadra: '', data: format(new Date(), 'yyyy-MM-dd'), quando: 'prima', durata_min: '30', su_campo: false, note: '' }
const FORM_EMPTY_LIBERA = { tipo: 'libera', squadra: '', data: format(new Date(), 'yyyy-MM-dd'), ora_inizio: '09:00', durata_min: '60', su_campo: false, note: '' }

export default function AgendaPrep() {
  const { societaId, profile } = useAuth()
  const qc = useQueryClient()
  const [weekRef, setWeekRef] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [tipoForm, setTipoForm] = useState('legata')
  const [form, setForm] = useState(FORM_EMPTY_LEGATA)
  const [saving, setSaving] = useState(false)

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd   = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr   = format(weekEnd, 'yyyy-MM-dd')

  const { data: squadreAssegnate = [] } = useQuery({
    queryKey: ['prep-squadre-mie', societaId, profile?.id],
    enabled: !!societaId && !!profile?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_squadre').select('squadra')
        .eq('societa_id', societaId)
        .eq('preparatore_id', profile.id)
      return (data ?? []).map(r => r.squadra)
    },
  })

  const { data: sessioni = [], isLoading } = useQuery({
    queryKey: ['prep-sessioni', societaId, profile?.id, weekStartStr, weekEndStr],
    enabled: !!societaId && !!profile?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('prep_sessioni').select('*')
        .eq('societa_id', societaId)
        .eq('preparatore_id', profile.id)
        .gte('data', weekStartStr)
        .lte('data', weekEndStr)
        .order('data').order('ora_inizio')
      return data ?? []
    },
  })

  const giorni = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i)
      return { str: format(d, 'yyyy-MM-dd'), label: format(d, 'EEE d MMM', { locale: it }) }
    }),
    [weekStartStr]
  )

  const insertMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('prep_sessioni').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prep-sessioni', societaId] })
      setShowModal(false)
      setForm(FORM_EMPTY_LEGATA)
      setTipoForm('legata')
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('prep_sessioni').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prep-sessioni', societaId] }),
  })

  async function handleSave(e) {
    e.preventDefault()
    if (!form.squadra || !form.data) return
    setSaving(true)
    try {
      const payload = {
        societa_id:     societaId,
        preparatore_id: profile.id,
        squadra:        form.squadra,
        data:           form.data,
        ora_inizio:     form.tipo === 'libera' ? form.ora_inizio : '00:00',
        durata_min:     parseInt(form.durata_min) || 30,
        quando:         form.tipo === 'legata' ? form.quando : 'standalone',
        su_campo:       form.su_campo,
        note:           form.note || null,
      }
      await insertMut.mutateAsync(payload)
    } finally {
      setSaving(false)
    }
  }

  function switchTipo(t) {
    setTipoForm(t)
    setForm(t === 'legata' ? FORM_EMPTY_LEGATA : FORM_EMPTY_LIBERA)
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div>
      <PageHeader title="Agenda" subtitle="I miei turni" />

      <div className="p-4">
        {/* Navigazione settimana */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setWeekRef(w => subWeeks(w, 1))} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700">
            {format(weekStart, 'd MMM', { locale: it })} – {format(weekEnd, 'd MMM yyyy', { locale: it })}
          </span>
          <button onClick={() => setWeekRef(w => addWeeks(w, 1))} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronRight size={16} />
          </button>
        </div>

        {isLoading ? <LoadingSpinner /> : (
          <div className="space-y-3">
            {giorni.map(({ str, label }) => {
              const daySessioni = sessioni.filter(s => s.data === str)
              if (daySessioni.length === 0) return null
              return (
                <div key={str}>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                    {label}
                  </div>
                  {daySessioni.map(s => (
                    <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-sm text-gray-900">{s.squadra}</div>
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${QUANDO_COLOR[s.quando]}`}>
                              {QUANDO_LABEL[s.quando]}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              s.su_campo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {s.su_campo ? '⚠ Su campo' : 'Fuori campo'}
                            </span>
                            {s.durata_min && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                {s.durata_min} min
                              </span>
                            )}
                          </div>
                          {s.note && <div className="text-xs text-gray-400 mt-1">{s.note}</div>}
                        </div>
                        <button onClick={() => deleteMut.mutate(s.id)} className="text-gray-300 hover:text-red-400 p-1">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
            {sessioni.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Nessun turno questa settimana</p>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-amber-500 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={24} />
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Nuova sessione</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>

            {/* Toggle tipo */}
            <div className="flex gap-2 mb-4">
              {[['legata', 'Legata ad allenamento'], ['libera', 'Sessione libera']].map(([t, l]) => (
                <button key={t} type="button" onClick={() => switchTipo(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    tipoForm === t ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {l}
                </button>
              ))}
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Squadra *</label>
                <select className={inp} value={form.squadra}
                  onChange={e => setForm(f => ({ ...f, squadra: e.target.value }))} required>
                  <option value="">Seleziona squadra</option>
                  {squadreAssegnate.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
                <input type="date" className={inp} value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))} required />
              </div>

              {tipoForm === 'legata' ? (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Quando</label>
                  <div className="flex gap-2">
                    {['prima', 'durante', 'dopo'].map(q => (
                      <button key={q} type="button" onClick={() => setForm(f => ({ ...f, quando: q }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          form.quando === q ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                        }`}>
                        {q.charAt(0).toUpperCase() + q.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Ora inizio *</label>
                  <input type="time" className={inp} value={form.ora_inizio}
                    onChange={e => setForm(f => ({ ...f, ora_inizio: e.target.value }))} required />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Durata (minuti)</label>
                <input type="number" min="5" className={inp} value={form.durata_min}
                  onChange={e => setForm(f => ({ ...f, durata_min: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Dove</label>
                <div className="flex gap-2">
                  {[['false', 'Fuori campo'], ['true', '⚠ Su campo']].map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setForm(f => ({ ...f, su_campo: val === 'true' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        String(form.su_campo) === val
                          ? val === 'true' ? 'bg-red-500 text-white border-red-500' : 'bg-green-500 text-white border-green-500'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                {form.su_campo && (
                  <p className="text-xs text-red-600 mt-1">Visibile agli admin nel calendario.</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Note</label>
                <input className={inp} value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>

              <button type="submit" disabled={saving}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60">
                {saving ? 'Salvataggio...' : 'Salva sessione'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
