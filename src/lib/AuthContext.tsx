import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearMfaVerified } from './mfa'
import * as Sentry from '@sentry/react'

// Role definitions with permissions
export type UserRole = 'owner' | 'admin' | 'manager' | 'team_lead' | 'staff'

export type Staff = {
  id: string
  user_id?: string
  business_id: string
  business_name?: string
  full_name: string
  name?: string
  email?: string
  phone?: string
  role: UserRole
  job_title: string | null
  department?: string
  avatar_url?: string
  date_of_birth?: string
  pronouns?: string
  bio?: string
  hobbies?: string
  location?: string
  emergency_contact?: string
  plan?: 'free' | 'starter' | 'pro' | 'enterprise'
  is_admin?: boolean
  active?: boolean
  is_beta_tester?: boolean
  onboarding_completed?: boolean
  user?: any
}

// Role permissions mapping
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: ['all'],
  admin: ['manage_staff', 'manage_settings', 'view_reports', 'manage_finance', 'approve_requests'],
  manager: ['manage_team', 'view_reports', 'approve_requests'],
  team_lead: ['manage_tasks', 'view_team_reports'],
  staff: ['view_tasks', 'own_data'],
}

// Check if user has permission
export function hasPermission(userRole: UserRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[userRole]
  return permissions.includes('all') || permissions.includes(permission)
}

// Get role display info
export const ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  owner: { label: 'Owner', color: 'amber' },
  admin: { label: 'Admin', color: 'purple' },
  manager: { label: 'Manager', color: 'blue' },
  team_lead: { label: 'Team Lead', color: 'emerald' },
  staff: { label: 'Staff', color: 'blue' },
}

type AuthContextValue = {
  session: Session | null
  staff: Staff | null
  loading: boolean
  staffChecked: boolean
  signOut: () => Promise<void>
  refreshStaff: () => Promise<void>
  // Helper functions
  canManageStaff: boolean
  canApproveRequests: boolean
  canViewReports: boolean
  canManageSettings: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)
  const [staffChecked, setStaffChecked] = useState(false)
  // Monotonic request id. Each session change / manual refresh bumps it so a
  // stale in-flight fetch (or its scheduled retry) cannot overwrite a fresher
  // staff record.
  const fetchIdRef = useRef(0)

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

  const fetchStaff = useCallback(async (attempt = 1, myId = fetchIdRef.current) => {
    if (!session?.user?.id) {
      setStaff(null)
      setStaffChecked(true)
      return
    }
    // We have a session and are (re)checking the staff record. Keep the auth
    // gate in its loading state until it resolves, so a brief null staff does
    // not bounce an already-onboarded user to /onboarding and back (which also
    // loses the page they were on after a refresh).
    if (attempt === 1) setStaffChecked(false)
    try {
      const { data } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()
      // A newer fetch superseded this one — drop the result.
      if (myId !== fetchIdRef.current) return
      if (data) {
        setStaff({ ...data, user: session.user } as Staff)
        setStaffChecked(true)
        return
      }
      // No staff row. A transient miss (right after signup/onboarding, or an
      // auth-state race) should not be treated as "needs onboarding" — retry
      // once before concluding, so an onboarded user is not flashed to
      // /onboarding and dropped onto the dashboard on refresh.
      if (attempt < 2 && myId === fetchIdRef.current) {
        setTimeout(() => { if (myId === fetchIdRef.current) fetchStaff(2, myId) }, 500)
        return
      }
      setStaff(null)
    } catch (err) {
      if (myId !== fetchIdRef.current) return
      console.warn('Failed to fetch staff:', err)
      setStaff(null)
    }
    setStaffChecked(true)
  }, [session])

  useEffect(() => {
    // Only reset and fetch if we have a session
    if (session) {
      const id = ++fetchIdRef.current
      fetchStaff(1, id)
    } else {
      setStaff(null)
      setStaffChecked(true)
    }
  }, [fetchStaff, session])

  // Update Sentry context when staff changes
  useEffect(() => {
    if (staff) {
      Sentry.setUser({ id: staff.id })
      Sentry.setTag('business_id', staff.business_id)
      Sentry.setTag('is_beta_tester', String(staff.is_beta_tester ?? false))
      Sentry.setTag('user_role', staff.role)
    } else {
      Sentry.setUser(null)
    }
  }, [staff])

  const signOut = async () => {
    Sentry.setUser(null)
    // Clear the per-business module-access cache so a different user signing
    // in next doesn't inherit the previous business's gate results.
    const { clearModuleAccessCache } = await import('./useModuleAccess')
    clearModuleAccessCache()
    // Clear the per-user MFA 'verified' flag so the next sign-in re-challenges.
    if (session?.user?.id) {
      clearMfaVerified(session.user.id)
    }
    await supabase.auth.signOut()
  }

  // Manual refresh (after a profile/onboarding mutation). Bumps the request id
  // so any in-flight auto fetch is discarded and this result wins.
  const refreshStaff = useCallback(() => {
    const id = ++fetchIdRef.current
    return fetchStaff(1, id)
  }, [fetchStaff])

  const userRole = staff?.role || 'staff'
  const canManageStaff = hasPermission(userRole, 'manage_staff') || userRole === 'owner'
  const canApproveRequests = hasPermission(userRole, 'approve_requests') || userRole === 'owner'
  const canViewReports = hasPermission(userRole, 'view_reports') || userRole === 'owner'
  const canManageSettings = hasPermission(userRole, 'manage_settings') || userRole === 'owner'

  return (
    <AuthContext.Provider value={{
      session,
      staff,
      loading,
      staffChecked,
      signOut,
      refreshStaff,
      canManageStaff,
      canApproveRequests,
      canViewReports,
      canManageSettings,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
