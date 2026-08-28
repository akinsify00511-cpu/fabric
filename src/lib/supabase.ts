import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
