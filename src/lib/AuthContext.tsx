import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Staff = {
  id: string
  business_id: string
  full_name: string
  name?: string
  email?: string
  role: 'owner' | 'manager' | 'staff'
  job_title: string | null
}

type AuthContextValue = {
  session: Session | null
  staff: Staff | null
  loading: boolean
  staffChecked: boolean
  signOut: () => Promise<void>
  refreshStaff: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)
  const [staffChecked, setStaffChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const fetchStaff = useCallback(async () => {
    if (!session) {
      setStaff(null)
      setStaffChecked(true)
      return
    }
    const { data } = await supabase
      .from('staff')
      .select('id, business_id, name, email, role, job_title, full_name')
      .eq('user_id', session.user.id)
      .maybeSingle()
    setStaff(data as Staff | null)
    setStaffChecked(true)
  }, [session])

  useEffect(() => {
    setStaffChecked(false)
    fetchStaff()
  }, [fetchStaff])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, staff, loading, staffChecked, signOut, refreshStaff: fetchStaff }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
