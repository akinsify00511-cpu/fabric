import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearMfaVerified } from './mfa'
import * as Sentry from '@sentry/react'

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

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: ['all'],
  admin: ['manage_staff', 'manage_settings', 'view_reports', 'manage_finance', 'approve_requests'],
  manager: ['manage_team', 'view_reports', 'approve_requests'],
  team_lead: ['manage_tasks', 'view_team_reports'],
  staff: ['view_tasks', 'own_data'],
}

export function hasPermission(userRole: UserRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[userRole]
  return permissions.includes('all') || permissions.includes(permission)
}

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
  signingOut: boolean
  signOut: () => Promise<void>
  refreshStaff: () => Promise<void>
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
  const [signingOut, setSigningOut] = useState(false)
  const fetchIdRef = useRef(0)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    }).catch(() => {
      if (mounted) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) {
        setStaff(null)
        setStaffChecked(true)
        setSigningOut(false)
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const fetchStaff = useCallback(
    async (userId: string, attempt = 1, myId = fetchIdRef.current) => {
      if (!userId) {
        setStaff(null)
        setStaffChecked(true)
        return
      }
      if (attempt === 1) setStaffChecked(false)
      try {
        const { data, error } = await supabase
          .from('staff')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()
        if (myId !== fetchIdRef.current) return
        if (data) {
          setStaff({ ...data, user: session?.user } as Staff)
          setStaffChecked(true)
          return
        }
        if (error) {
          if (attempt < 4 && myId === fetchIdRef.current) {
            const delay = [200, 500, 1200][attempt - 1] || 1500
            setTimeout(() => {
              if (myId === fetchIdRef.current) fetchStaff(userId, attempt + 1, myId)
            }, delay)
            return
          }
          console.warn('Failed to fetch staff after retries:', error)
          setStaffChecked(false)
          return
        }
        if (attempt < 2 && myId === fetchIdRef.current) {
          setTimeout(() => {
            if (myId === fetchIdRef.current) fetchStaff(userId, 2, myId)
          }, 300)
          return
        }
        setStaff(null)
      } catch (err) {
        if (myId !== fetchIdRef.current) return
        console.warn('Failed to fetch staff (throw):', err)
        if (attempt < 4 && myId === fetchIdRef.current) {
          const delay = [200, 500, 1200][attempt - 1] || 1500
          setTimeout(() => {
            if (myId === fetchIdRef.current) fetchStaff(userId, attempt + 1, myId)
          }, delay)
          return
        }
        setStaffChecked(false)
        return
      }
      setStaffChecked(true)
    },
    [session?.user],
  )

  const userId = session?.user?.id
  useEffect(() => {
    if (userId) {
      const id = ++fetchIdRef.current
      fetchStaff(userId, 1, id)
    } else {
      setStaff(null)
      setStaffChecked(true)
    }
  }, [fetchStaff, userId])

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

  const signOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    const currentUserId = session?.user?.id

    // Invalidate all staff fetches immediately. A late request must never
    // resurrect the previous user's staff record after logout.
    ++fetchIdRef.current
    Sentry.setUser(null)
    if (currentUserId) clearMfaVerified(currentUserId)

    try {
      // The auth operation is the source of truth and MUST happen before any
      // optional cleanup. A failing/lazy dynamic import must never prevent the
      // actual Supabase logout.
      const { error } = await supabase.auth.signOut()
      if (error) throw error

      setSession(null)
      setStaff(null)
      setStaffChecked(true)

      // Cache cleanup is best-effort and deliberately non-blocking.
      void import('./useModuleAccess')
        .then(({ clearModuleAccessCache }) => clearModuleAccessCache())
        .catch((err) => console.warn('Module-access cache cleanup failed after sign-out:', err))
    } catch (error) {
      // Failed sign-out must leave the user authenticated and retryable.
      setSigningOut(false)
      throw error
    }
  }, [session?.user?.id, signingOut])

  const refreshStaff = useCallback(() => {
    if (!session?.user?.id) return Promise.resolve()
    const id = ++fetchIdRef.current
    return fetchStaff(session.user.id, 1, id)
  }, [fetchStaff, session?.user?.id])

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
      signingOut,
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
