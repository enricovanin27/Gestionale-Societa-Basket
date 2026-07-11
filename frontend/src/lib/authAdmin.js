import { supabaseAdmin } from './supabase'

// Banna/sbanna un utente lato Supabase Auth (oltre al flag profiles.attivo/giocatori.attivo).
// '876000h' (~100 anni) è l'idioma comune per un ban "permanente" — non esiste un valore letterale "per sempre".
// No-op silenzioso se la service role key non è configurata (supabaseAdmin === null).
export async function setUserBanned(userId, banned) {
  if (!supabaseAdmin) return
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? '876000h' : 'none',
  })
  if (error) throw error
}
