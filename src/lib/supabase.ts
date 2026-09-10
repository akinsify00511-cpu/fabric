import { Capacitor } from '@capacitor/core'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCanonicalAuthRedirect } from './productionDomain'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Never silently create a broken client. If config is missing, log a
// visible error so the app doesn't swallow every query as "no data".
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.error(
    '[Avenize] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'The app will not connect. Copy .env.example to .env and fill it in.'
  )
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      // OAuth uses the Authorization Code + PKCE flow. The callback page
      // explicitly exchanges the returned code for a session.
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: {
        'X-Client-Info': 'avenize',
      },
    },
  }
)

// Centralise every authentication callback so production auth never derives
// a redirect from whichever preview/legacy hostname opened the app.
// Native builds use the registered Capacitor deep-link scheme; web always uses
// the canonical production callback.
export function getAvenizeAuthRedirect(): string {
  if (Capacitor.isNativePlatform()) {
    return 'com.avenize.app://auth/callback'
  }
  return getCanonicalAuthRedirect('/auth/callback')
}

const originalSignInWithOAuth = supabase.auth.signInWithOAuth.bind(supabase.auth)
supabase.auth.signInWithOAuth = (credentials) =>
  originalSignInWithOAuth({
    ...credentials,
    options: {
      ...credentials.options,
      redirectTo: getAvenizeAuthRedirect(),
    },
  })

const originalSignUp = supabase.auth.signUp.bind(supabase.auth)
supabase.auth.signUp = (credentials) =>
  originalSignUp({
    ...credentials,
    options: {
      ...credentials.options,
      emailRedirectTo: getAvenizeAuthRedirect(),
    },
  })

const originalResend = supabase.auth.resend.bind(supabase.auth)
supabase.auth.resend = (credentials) => {
  if (credentials.type === 'sms' || credentials.type === 'phone_change') {
    return originalResend(credentials)
  }
  return originalResend({
    ...credentials,
    options: {
      ...credentials.options,
      emailRedirectTo: getAvenizeAuthRedirect(),
    },
  })
}
