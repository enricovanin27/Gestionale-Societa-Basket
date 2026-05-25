import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const EMPTY = {
  cognome: '', nome: '', data_nascita: '', luogo_nascita: '', codice_fiscale: '',
  indirizzo: '', citta: '', cap: '', provincia: '',
  nome_genitore: '', cognome_genitore: '', codice_fiscale_genitore: '',
  telefono: '', email_genitore: '',
  squadra: '', squadra2: '', squadra3: '', numero_maglia: '',
  data_iscrizione: '', cert_medico_scadenza: '',
  genitore_user_id: '',
}

export default function GiocatoreForm({ initialValues = {}, onSave, onCancel, saving }) {
  const { societaId } = useAuth()
  const [form, setForm] = useState({ ...EMPTY, ...initialValues })

  // Resync quando cambia il giocatore in edit mode
  useEffect(() => {
    setForm({ ...EMPTY, ...initialValues })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues?.id])

  // Lista squadre derivata dai giocatori esistenti (per datalist autocomplete)
  const { data: squadreList = [] } = useQuery({
    queryKey: ['squadre-suggerimenti', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('squadra, squadra2, squadra3')
        .eq('societa_id', societaId)
        .eq('attivo', true)
      const set = new Set()
      for (const g of data ?? []) {
        if (g.squadra)  set.add(g.squadra)
        if (g.squadra2) set.add(g.squadra2)
        if (g.squadra3) set.add(g.squadra3)
      }
      return [...set].sort()
    },
  })

  // Account genitore della stessa società
  const { data: genitori = [] } = useQuery({
    queryKey: ['genitori-profiles', societaId],
    enabled: !!societaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, cognome, email')
        .eq('societa_id', societaId)
        .or('ruolo.eq.genitore,ruoli_extra.cs.{genitore}')
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'
  const sec = 'text-xs font-bold text-gray-400 uppercase tracking-widest mb-3'

  return (
    <div className="space-y-6">
      <datalist id="squadre-list">
        {squadreList.map(s => <option key={s} value={s} />)}
      </datalist>

      {/* ── Dati atleta ── */}
      <section>
        <p className={sec}>Dati atleta</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Cognome *</label>
              <input className={inp} value={form.cognome} onChange={set('cognome')} required />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
              <input className={inp} value={form.nome} onChange={set('nome')} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data di nascita</label>
              <input type="date" className={inp} value={form.data_nascita ?? ''} onChange={set('data_nascita')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Luogo di nascita</label>
              <input className={inp} value={form.luogo_nascita ?? ''} onChange={set('luogo_nascita')} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Codice fiscale</label>
            <input className={inp + ' uppercase font-mono'} value={form.codice_fiscale ?? ''}
              onChange={e => setForm(f => ({ ...f, codice_fiscale: e.target.value.toUpperCase() }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Indirizzo</label>
              <input className={inp} value={form.indirizzo ?? ''} onChange={set('indirizzo')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Città</label>
              <input className={inp} value={form.citta ?? ''} onChange={set('citta')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">CAP</label>
              <input className={inp} value={form.cap ?? ''} onChange={set('cap')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Provincia</label>
              <input className={inp} value={form.provincia ?? ''} onChange={set('provincia')} maxLength={2} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Genitore / Tutore ── */}
      <section>
        <p className={sec}>Genitore / Tutore</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Cognome</label>
              <input className={inp} value={form.cognome_genitore ?? ''} onChange={set('cognome_genitore')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nome</label>
              <input className={inp} value={form.nome_genitore ?? ''} onChange={set('nome_genitore')} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Codice fiscale genitore</label>
            <input className={inp + ' uppercase font-mono'} value={form.codice_fiscale_genitore ?? ''}
              onChange={e => setForm(f => ({ ...f, codice_fiscale_genitore: e.target.value.toUpperCase() }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefono</label>
              <input type="tel" className={inp} value={form.telefono ?? ''} onChange={set('telefono')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input type="email" className={inp} value={form.email_genitore ?? ''} onChange={set('email_genitore')} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Account app collegato</label>
            <select
              className={inp}
              value={form.genitore_user_id ?? ''}
              onChange={set('genitore_user_id')}
            >
              <option value="">— Nessun account collegato —</option>
              {genitori.map(g => (
                <option key={g.id} value={g.id}>
                  {g.cognome} {g.nome}{g.email ? ` (${g.email})` : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              Il genitore vedrà nell'app solo il proprio figlio
            </p>
          </div>
        </div>
      </section>

      {/* ── Iscrizione ── */}
      <section>
        <p className={sec}>Iscrizione</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Squadra *</label>
              <input list="squadre-list" className={inp} value={form.squadra}
                onChange={set('squadra')} placeholder="Es. U14 Maschile" required />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Squadra 2</label>
              <input list="squadre-list" className={inp} value={form.squadra2 ?? ''}
                onChange={set('squadra2')} placeholder="opzionale" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Squadra 3</label>
              <input list="squadre-list" className={inp} value={form.squadra3 ?? ''}
                onChange={set('squadra3')} placeholder="opzionale" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">N° maglia</label>
              <input type="number" min="1" max="99" className={inp}
                value={form.numero_maglia ?? ''} onChange={set('numero_maglia')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data iscrizione</label>
              <input type="date" className={inp} value={form.data_iscrizione ?? ''} onChange={set('data_iscrizione')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Scad. cert. medico</label>
              <input type="date" className={inp} value={form.cert_medico_scadenza ?? ''} onChange={set('cert_medico_scadenza')} />
            </div>
          </div>
        </div>
      </section>

      {/* Azioni */}
      <div className="flex gap-3 pt-2 pb-4">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
          Annulla
        </button>
        <button type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.cognome || !form.nome || !form.squadra}
          className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 active:scale-95 transition-transform">
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </div>
  )
}
