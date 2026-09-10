import { Capacitor } from '@capacitor/core'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCanonicalAuthRedirect } from './productionDomain'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: { params: { eventsPerSecond: 10 } },
    global: { headers: { 'X-Client-Info': 'avenize' } },
  }
)

export function getAvenizeAuthRedirect(): string {
  if (Capacitor.isNativePlatform()) return 'com.avenize.app://auth/callback'
  return getCanonicalAuthRedirect('/auth/callback')
}

const originalSignInWithOAuth = supabase.auth.signInWithOAuth.bind(supabase.auth)
supabase.auth.signInWithOAuth = (credentials) =>
  originalSignInWithOAuth({
    ...credentials,
    options: { ...credentials.options, redirectTo: getAvenizeAuthRedirect() },
  })

const originalSignUp = supabase.auth.signUp.bind(supabase.auth)
supabase.auth.signUp = (credentials) =>
  originalSignUp({
    ...credentials,
    options: { ...credentials.options, emailRedirectTo: getAvenizeAuthRedirect() },
  })

const originalResend = supabase.auth.resend.bind(supabase.auth)
supabase.auth.resend = (credentials) => {
  if (credentials.type === 'sms' || credentials.type === 'phone_change') {
    return originalResend(credentials)
  }
  const emailCredentials = credentials as Extract<Parameters<typeof originalResend>[0], { type: 'signup' | 'email_change' }>
  return originalResend({
    ...emailCredentials,
    options: {
      ...emailCredentials.options,
      emailRedirectTo: getAvenizeAuthRedirect(),
    },
  } as Parameters<typeof originalResend>[0])
}
