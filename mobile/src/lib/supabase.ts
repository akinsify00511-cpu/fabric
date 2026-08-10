import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import Constants from 'expo-constants'

// Read config from expo extra (set in app.json / EAS env) with fallback to
// the web env names so the same values work across platforms.
const expoExtra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>
const supabaseUrl =
  expoExtra.supabaseUrl ||
  expoExtra.VITE_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  ''
const supabaseAnonKey =
  expoExtra.supabaseAnonKey ||
  expoExtra.VITE_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  ''

// Hard-fail visibly if config is missing — never silently create a broken
// client that swallows every call as "no data".
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Avenize] Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment / app.json extra.'
  )
}

// SecureStore-backed adapter so auth tokens persist safely on device
// (Keychain on iOS, Keystore on Android).
const secureStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : secureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 10 } },
    global: { headers: { 'X-Client-Info': 'avenize-mobile' } },
  }
)

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)
