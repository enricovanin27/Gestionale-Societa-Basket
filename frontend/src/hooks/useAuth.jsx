import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { initPushNotifications } from './usePushNotifications'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const [activeRole, setActiveRoleState] = useState(() => {
    return localStorage.getItem('oderzo_active_role') ?? null
  })

  function setActiveRole(role) {
    localStorage.setItem('oderzo_active_role', role)
    setActiveRoleState(role)
  }

  async function fetchProfile(userId) {
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), 8000)
      )
      const query = supabase
        .from('profiles')
        .select('id, nome, cognome, ruolo, ruoli_extra, societa_id, email, squadra, squadra2, squadra3, societa:societa_id(nome)')
        .eq('id', userId)
        .single()

      const { data, error } = await Promise.race([query, timeout])
      if (error) {
        console.error('Errore fetch profile:', error)
        return null
      }
      if (data?.ruolo === 'genitore' || data?.ruolo === 'giocatore' || data?.ruolo === 'allenatore') {
        const squadre = data.ruolo === 'allenatore'
          ? [data.squadra, data.squadra2, data.squadra3].filter(Boolean)
          : [data.squadra].filter(Boolean)
        initPushNotifications(userId, squadre, data.societa_id)
      }
      return data
    } catch (err) {
      console.error('Errore/timeout fetch profile:', err)
      return null
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        setProfile(p)
      }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
        setUser(session?.user ?? null)
        setLoading(false)
        return
      }
      setUser(session?.user ?? null)
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        setProfile(p)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false)
  }

  const role = profile?.ruolo ?? null
  const ruoliExtra = profile?.ruoli_extra ?? []
  const allRuoli = [...new Set([role, ...ruoliExtra].filter(Boolean))]

  // Active role: quello scelto dall'utente, purché sia ancora nei suoi ruoli
  const effectiveActiveRole = (activeRole && allRuoli.includes(activeRole))
    ? activeRole
    : (role ?? null)

  const societaId = profile?.societa_id ?? null
  const societaNome = profile?.societa?.nome ?? null
  const displayName = profile
    ? `${profile.nome ?? ''} ${profile.cognome ?? ''}`.trim()
    : user?.email ?? ''
  const squadreAllenatore = (profile && allRuoli.includes('allenatore'))
    ? [profile.squadra, profile.squadra2, profile.squadra3].filter(Boolean)
    : null
  const value = {
    user,
    profile,
    loading,
    login,
    logout,
    role,
    ruoliExtra,
    allRuoli,
    activeRole: effectiveActiveRole,
    setActiveRole,
    societaId,
    societaNome,
    displayName,
    squadreAllenatore,
    isSuperAdmin:       role === 'super_admin',
    isAdmin:            allRuoli.some(r => r === 'admin' || r === 'super_admin'),
    isAllenatore:       allRuoli.includes('allenatore'),
    isGenitore:         allRuoli.includes('genitore'),
    isGiocatore:        allRuoli.includes('giocatore'),
    isSegreteria:       allRuoli.includes('segreteria'),
    isPasswordRecovery,
    clearPasswordRecovery,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}