import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId) {
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), 8000)
      )
      const query = supabase
        .from('profiles')
        .select('id, nome, cognome, ruolo, societa_id, email, squadra')
        .eq('id', userId)
        .single()

      const { data, error } = await Promise.race([query, timeout])
      if (error) {
        console.error('Errore fetch profile:', error)
        return null
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
    // onAuthStateChange fires INITIAL_SESSION on mount — unica fonte di verità per l'auth state

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
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

  const role = profile?.ruolo ?? null
  const societaId = profile?.societa_id ?? null
  const displayName = profile
    ? `${profile.nome ?? ''} ${profile.cognome ?? ''}`.trim()
    : user?.email ?? ''
  const value = {
    user,
    profile,
    loading,
    login,
    logout,
    role,
    societaId,
    displayName,
    isAdmin:      role === 'admin',
    isAllenatore: role === 'allenatore',
    isGenitore:   role === 'genitore',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}