import { supabase } from '../lib/supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export async function initPushNotifications(userId, squadre, societaId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) return

  const squadreArr = Array.isArray(squadre)
    ? squadre.filter(Boolean)
    : squadre ? [squadre] : []

  try {
    // Registrazione avviata in main.jsx via registerServiceWorker() — qui aspettiamo solo che sia pronta.
    const reg = await navigator.serviceWorker.ready
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }

    await supabase.from('push_subscriptions').upsert(
      {
        user_id:      userId,
        squadre:      squadreArr,
        societa_id:   societaId ?? '',
        subscription: sub.toJSON(),
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
  } catch (err) {
    console.error('Push init error:', err)
  }
}
