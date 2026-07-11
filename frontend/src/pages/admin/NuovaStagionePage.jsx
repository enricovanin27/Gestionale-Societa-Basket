import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, supabaseAdmin } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/ui/ToastProvider'
import AppHeader from '../../components/AppHeader'
import LoadingSpinner from '../../components/LoadingSpinner'

function suggestNextStagione(corrente) {
  const m = /^(\d{4})\/(\d{4})$/.exec(corrente ?? '')
  if (!m) return ''
  return `${Number(m[1]) + 1}/${Number(m[2]) + 1}`
}

export default function NuovaStagionePage() {
  const { societaId, displayName, logout, societaNome, stagioneCorrente } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [azioni, setAzioni] = useState({}) // { [key]: { action: 'resta'|'cambia'|'lascia', squadra, squadra2, squadra3 } }
  const [nuovaStagione, setNuovaStagione] = useState('')
  const [step, setStep] = useState('lista') // 'lista' | 'riepilogo'
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)

  const { data: squadre = [] } = useQuery({
    queryKey: ['squadre-nomi-stagione', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase.from('squadre').select('categoria').eq('societa_id', societaId).order('categoria')
      return (data ?? []).map(s => s.categoria)
    },
  })

  const { data: giocatori = [], isLoading: loadingG } = useQuery({
    queryKey: ['nuova-stagione-giocatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('giocatori')
        .select('id, nome, cognome, squadra, squadra2, squadra3, user_id')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .order('cognome').order('nome')
      return data ?? []
    },
  })

  const { data: allenatori = [], isLoading: loadingA } = useQuery({
    queryKey: ['nuova-stagione-allenatori', societaId],
    enabled: !!societaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, cognome, email, ruolo, ruoli_extra, squadra, squadra2, squadra3')
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .not('ruolo', 'in', '("giocatore","genitore","super_admin")')
        .order('cognome').order('nome')
      return (data ?? []).filter(u => [u.ruolo, ...(u.ruoli_extra ?? [])].includes('allenatore'))
    },
  })

  const isLoading = loadingG || loadingA

  function getAzione(key) {
    return azioni[key] ?? { action: 'resta' }
  }
  function setAzione(key, patch) {
    setAzioni(prev => ({ ...prev, [key]: { ...getAzione(key), ...patch } }))
  }

  if (isLoading) return (
    <div>
      <AppHeader title="Nuova Stagione" subtitle={societaNome} displayName={displayName} logout={logout} societaNome={societaNome} />
      <div className="pt-8"><LoadingSpinner /></div>
    </div>
  )

  // Step "riepilogo" e "lista" nei prossimi task
  return null
}
