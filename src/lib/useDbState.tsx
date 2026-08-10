import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'

// Detects whether the Business OS migrations (058+) have been applied to
// the live database. Without this, the intelligence pages silently render
// "No data yet" when the schema is actually missing — which looks like an
// empty business instead of a configuration problem.

export type DbState = 'checking' | 'configured' | 'migrations-missing' | 'offline'

export function useDbState() {
  const [state, setState] = useState<DbState>('checking')

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured) {
      setState('offline')
      return
    }
    // business_events is created by migration 058 — the first Business OS
    // table. If it doesn't exist, none of the intelligence layer exists.
    supabase
      .from('business_events')
      .select('id', { count: 'exact', head: true })
      .limit(1)
      .then(({ error }) => {
        if (!active) return
        // PGRST205 = schemaCacheMiss / relation does not exist
        if (error && (error.code === 'PGRST205' || error.message.includes('relation') || error.message.includes('does not exist'))) {
          setState('migrations-missing')
        } else if (error && error.message.toLowerCase().includes('network')) {
          setState('offline')
        } else {
          setState('configured')
        }
      })
    return () => { active = false }
  }, [])

  return state
}

// Renders a clear, actionable banner when the database isn't ready, so the
// intelligence pages don't look like empty businesses.
export function DbStateBanner({ state }: { state: DbState }) {
  if (state === 'configured') return null
  if (state === 'checking') return null
  const msg =
    state === 'migrations-missing'
      ? 'The Business OS database schema is not set up yet. Run `supabase db push` (or apply migrations 058–069 in your Supabase dashboard) to enable this page.'
      : 'Cannot reach the database. Check your network connection and Supabase configuration (.env).'
  return (
    <div className="rounded-xl bg-[var(--av-warning)]/10 border border-[var(--av-warning)]/30 p-4 text-sm text-[var(--av-warning)] mb-4">
      {msg}
    </div>
  )
}
