// Push Notification Service
// Handles push notification subscription and management

import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const PUSH_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push-notification`

// VAPID public key - this should match the private key used by the server
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export interface PushSubscription {
  id?: string
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  user_id?: string
  created_at?: string
}

// Convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Check if push notifications are supported
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// Get current notification permission status
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied'
  }
  return Notification.permission
}

// Request notification permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported')
    return false
  }

  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

// Subscribe to push notifications
export async function subscribeToPush(userId: string): Promise<PushSubscription | null> {
  try {
    // Check if supported
    if (!isPushSupported()) {
      console.warn('Push notifications not supported')
      return null
    }

    // Request permission if not granted
    const permission = await requestNotificationPermission()
    if (!permission) {
      console.warn('Notification permission denied')
      return null
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js')
    
    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY 
        ? urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer
        : undefined,
    })

    // Convert native PushSubscription to our format
    const pushSubscription: PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: (subscription as any).keys?.p256dh || '',
        auth: (subscription as any).keys?.auth || '',
      },
      user_id: userId,
    }

    // Save subscription to database
    const { error } = await supabase
      .from('push_subscriptions')
      .insert({
        user_id: userId,
        endpoint: pushSubscription.endpoint,
        p256dh: pushSubscription.keys.p256dh,
        auth: pushSubscription.keys.auth,
        subscribed: true,
      })

    if (error) {
      console.error('Failed to save push subscription:', error)
    }

    return pushSubscription
  } catch (error) {
    console.error('Failed to subscribe to push:', error)
    return null
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    
    if (subscription) {
      await subscription.unsubscribe()
    }

    // Remove from database
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ subscribed: false })
      .eq('user_id', userId)
      .eq('subscribed', true)

    if (error) {
      console.error('Failed to unsubscribe:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Failed to unsubscribe:', error)
    return false
  }
}

// Check if user is subscribed
export async function isSubscribed(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}

// Get user's push subscriptions from database
export async function getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('subscribed', true)

    if (error) throw error

    return (data || []).map(row => ({
      id: row.id,
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
      user_id: row.user_id,
      created_at: row.created_at,
    }))
  } catch (error) {
    console.error('Failed to get subscriptions:', error)
    return []
  }
}

// Show a test notification (for demo/testing purposes)
export async function showTestNotification(): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.warn('Notifications not permitted')
    return
  }

  new Notification('Avenize Test', {
    body: 'Push notifications are working! 🎉',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: 'test-notification',
  })
}

// Hook for React components
export function usePushNotifications(userId?: string) {
  const [permission, setPermission] = useState(getNotificationPermission())
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (userId) {
      checkSubscription()
    }
  }, [userId])

  async function checkSubscription() {
    const isSub = await isSubscribed()
    setSubscribed(isSub)
    setPermission(getNotificationPermission())
  }

  async function subscribe() {
    if (!userId) return
    setLoading(true)
    try {
      const result = await subscribeToPush(userId)
      setSubscribed(!!result)
      setPermission(getNotificationPermission())
    } finally {
      setLoading(false)
    }
  }

  async function unsubscribe() {
    if (!userId) return
    setLoading(true)
    try {
      const result = await unsubscribeFromPush(userId)
      setSubscribed(!result)
    } finally {
      setLoading(false)
    }
  }

  return {
    permission,
    subscribed,
    loading,
    isSupported: isPushSupported(),
    subscribe,
    unsubscribe,
    showTestNotification,
  }
}
