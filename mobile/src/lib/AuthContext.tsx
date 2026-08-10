import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Staff = {
  id: string
  user_id?: string
  business_id: string
  business_name?: string
  full_name?: string
  name?: string
  email?: string
  phone?: string
  role: string
  job_title?: string | null
  avatar_url?: string
  plan?: string
}

type AuthContextValue = {
  session: Session | null
  staff: Staff | null
  loading: boolean
  signOut: () => Promise<void>
  refreshStaff: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStaff = useCallback(async (uid: string, bid: string) => {
    const { data, error } = await supabase
      .from('staff')
      .select('*, businesses(name)')
      .eq('user_id', uid)
      .eq('business_id', bid)
      .single()
    if (error) { console.warn('[staff load]', error.message); return }
    setStaff({
      id: data.id,
      user_id: data.user_id,
      business_id: data.business_id,
      business_name: data.businesses?.name,
      full_name: data.full_name || data.name,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      job_title: data.job_title,
      avatar_url: data.avatar_url,
    })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        const bid = (data.session.user.app_metadata as any)?.business_id
        if (bid) loadStaff(data.session.user.id, bid).finally(() => setLoading(false))
        else setLoading(false)
      } else setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s?.user) { setStaff(null); setLoading(false) }
      else {
        const bid = (s.user.app_metadata as any)?.business_id
        if (bid) loadStaff(s.user.id, bid)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [loadStaff])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setStaff(null)
  }, [])

  const refreshStaff = useCallback(async () => {
    if (session?.user) {
      const bid = (session.user.app_metadata as any)?.business_id
      if (bid) await loadStaff(session.user.id, bid)
    }
  }, [session, loadStaff])

  return (
    <AuthContext.Provider value={{ session, staff, loading, signOut, refreshStaff }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
