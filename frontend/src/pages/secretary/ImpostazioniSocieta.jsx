import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/ui/ToastProvider'
import PageHeader from '../../components/PageHeader'
import LoadingSpinner from '../../components/LoadingSpinner'
import InvitaUtenteForm from '../../components/InvitaUtenteForm'

const EMPTY = {
  nome_completo: '', codice_fiscale: '', indirizzo: '',
  citta: '', cap: '', provincia: '', telefono: '', email: '', logo_url: '',
}

export default function ImpostazioniSocieta() {
  const { societaId } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data: societa, isLoading } = useQuery({
    queryKey: ['societa-impostazioni', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('societa')
        .select('nome, nome_completo, codice_fiscale, indirizzo, citta, cap, provincia, telefono, email, logo_url')
        .eq('id', societaId).single()
      return data
    },
  })

  useEffect(() => {
    if (societa) {
      setForm({
        nome_completo:  societa.nome_completo ?? societa.nome ?? '',
        codice_fiscale: societa.codice_fiscale ?? '',
        indirizzo:      societa.indirizzo ?? '',
        citta:          societa.citta ?? '',
        cap:            societa.cap ?? '',
        provincia:      societa.provincia ?? '',
        telefono:       societa.telefono ?? '',
        email:          societa.email ?? '',
        logo_url:       societa.logo_url ?? '',
      })
    }
  }, [societa])

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('societa').update(form).eq('id', societaId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['societa-impostazioni', societaId] })
      qc.invalidateQueries({ queryKey: ['societa-dati', societaId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${societaId}/logo.${ext}`
      const { error: upErr } = await supabase.storage
        .from('societa-loghi').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('societa-loghi').getPublicUrl(path)
      setForm(f => ({ ...f, logo_url: publicUrl }))
    } catch (err) {
      toast.error('Errore upload: ' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  if (isLoading) return <div><PageHeader title="Impostazioni" /><div className="pt-8"><LoadingSpinner /></div></div>

  return (
    <div>
      <PageHeader title="Impostazioni Società" subtitle="Dati usati in ricevute e attestazioni" />
      <div className="px-4 pb-24 max-w-2xl">

        {/* Anteprima intestazione */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Anteprima intestazione ricevuta</p>
          <div className="flex items-center gap-3">
            {form.logo_url
              ? <img src={form.logo_url} alt="logo" className="h-12 object-contain" />
              : <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center text-2xl">🏀</div>
            }
            <div>
              <p className="font-bold text-gray-900 text-sm">{form.nome_completo || 'Nome Società ASD'}</p>
              {form.citta && (
                <p className="text-xs text-gray-500">
                  {[form.indirizzo, `${form.cap} ${form.citta}`.trim()].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Upload logo */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Logo</p>
          <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-dashed cursor-pointer transition-colors ${
            uploading ? 'text-gray-400 border-gray-200' : 'text-purple-600 border-purple-300 hover:bg-purple-50'
          }`}>
            <Upload size={16} />
            <span className="text-sm font-medium">
              {uploading ? 'Caricamento...' : form.logo_url ? 'Sostituisci logo (PNG/JPG)' : 'Carica logo (PNG/JPG)'}
            </span>
            <input type="file" accept="image/png,image/jpeg" className="hidden"
              disabled={uploading} onChange={handleLogoUpload} />
          </label>
        </div>

        {/* Dati ASD */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dati ASD</p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nome completo ASD *</label>
            <input className={inp} value={form.nome_completo} onChange={set('nome_completo')} placeholder="Es. Basket Oderzo ASD" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Codice fiscale</label>
            <input className={inp + ' font-mono'} value={form.codice_fiscale} onChange={set('codice_fiscale')} placeholder="92345678901" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Indirizzo</label>
            <input className={inp} value={form.indirizzo} onChange={set('indirizzo')} placeholder="Via Mazzini 10" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">CAP</label>
              <input className={inp} value={form.cap} onChange={set('cap')} placeholder="31046" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Città</label>
              <input className={inp} value={form.citta} onChange={set('citta')} placeholder="Oderzo" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Prov.</label>
              <input className={inp} value={form.provincia} onChange={set('provincia')} placeholder="TV" maxLength={2} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefono</label>
              <input className={inp} value={form.telefono} onChange={set('telefono')} placeholder="+39 0422 123456" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input type="email" className={inp} value={form.email} onChange={set('email')} placeholder="segreteria@..." />
            </div>
          </div>
        </div>

        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || !form.nome_completo}
          className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-xl font-semibold disabled:opacity-60 active:scale-95 transition-transform">
          <Save size={16} />
          {saved ? 'Salvato ✓' : saveMut.isPending ? 'Salvataggio...' : 'Salva impostazioni'}
        </button>

        {/* Gestione Accessi */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            👥 Gestione Accessi
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Invita e gestisci gli accessi di tutti gli utenti dell'app. Riceveranno un'email con il link per impostare la propria password.
          </p>
          <InvitaUtenteForm ruoliConsentiti={['segreteria', 'allenatore', 'preparatore_atletico', 'dirigente', 'genitore', 'giocatore']} />
        </div>
      </div>
    </div>
  )
}
