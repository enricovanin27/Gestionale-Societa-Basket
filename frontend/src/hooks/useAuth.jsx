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
    const MAX_ATTEMPTS = 3
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Profile fetch timeout')), 8000)
        )
        const query = supabase
          .from('profiles')
          .select('id, nome, cognome, ruolo, ruoli_extra, societa_id, email, squadra, squadra2, squadra3, genitore_squadra, genitore_squadra2, genitore_squadra3, societa:societa_id(nome)')
          .eq('id', userId)
          .single()

        const { data, error } = await Promise.race([query, timeout])
        if (error) throw error
        if (data?.ruolo === 'genitore' || data?.ruolo === 'giocatore' || data?.ruolo === 'allenatore') {
          const squadre = data.ruolo === 'allenatore'
            ? [data.squadra, data.squadra2, data.squadra3].filter(Boolean)
            : [data.squadra].filter(Boolean)
          initPushNotifications(userId, squadre, data.societa_id)
        }
        return data
      } catch (err) {
        console.error(`Fetch profile errore (tentativo ${attempt + 1}/${MAX_ATTEMPTS}):`, err.message)
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
        }
      }
    }
    return null
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        setProfile(p)
      }
      // Se l'utente ha cliccato un link di invito Supabase, mostra la schermata
      // "Imposta password" (riusa NuovaPasswordPage già esistente in App.jsx)
      // Mostra "Imposta password" solo se NON c'è già una sessione attiva
      // (evita di interrompere utenti già loggati che aprono accidentalmente un link invite)
      const hash = new URLSearchParams(window.location.hash.substring(1))
      if (!session?.user && hash.get('type') === 'invite') {
        setIsPasswordRecovery(true)
      }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // INITIAL_SESSION is handled by the getSession() effect above — skip to avoid double fetch
      if (event === 'INITIAL_SESSION') return

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
        setUser(session?.user ?? null)
        setLoading(false)
        return
      }

      // TOKEN_REFRESHED aggiorna solo il JWT, non i dati del profilo — evita race condition
      if (event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null)
        return
      }

      setUser(session?.user ?? null)
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        // Se fetchProfile ritorna null (errore transitorio), mantieni il profilo precedente
        // per evitare la schermata "profilo non configurato" su re-auth/refresh
        setProfile(prev => (p != null ? p : prev))
      } else {
        setProfile(null)
        setActiveRoleState(null)
        localStorage.removeItem('oderzo_active_role')
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
    isDirigente:        allRuoli.includes('dirigente'),
    isPreparatore:      allRuoli.includes('preparatore_atletico'),
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