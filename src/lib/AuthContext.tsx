import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearMfaVerified } from './mfa'
import { clearModuleAccessCache } from './useModuleAccess'
import { clearExperienceContextCache } from './useExperienceContext'
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
  // Monotonic request id prevents stale staff requests/retries from writing
  // into state after a user switch or sign-out.
  const fetchIdRef = useRef(0)
  // Auth generation prevents an older getSession() result from resurrecting
  // a session after a SIGNED_OUT event has already been processed.
  const authGenerationRef = useRef(0)

  useEffect(() => {
    let mounted = true
    const generationAtStart = authGenerationRef.current

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted || generationAtStart !== authGenerationRef.current) return
      setSession(data.session)
      setLoading(false)
    }).catch((error) => {
      if (!mounted || generationAtStart !== authGenerationRef.current) return
      console.warn('Failed to restore auth session:', error)
      setSession(null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return

      // SIGNED_OUT is terminal for this browser session. Invalidate every
      // in-flight staff request immediately instead of waiting for React's
      // session state update to propagate through the effect below.
      if (event === 'SIGNED_OUT') {
        authGenerationRef.current += 1
        fetchIdRef.current += 1
        setSession(null)
        setStaff(null)
        setStaffChecked(true)
        setLoading(false)
        return
      }

      setSession(newSession)
      setLoading(false)
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
          // A confirmed staff row is the authoritative membership record.
          // Its onboarding_completed value is consumed by RequireAuth; do not
          // infer onboarding state from localStorage or transient UI state.
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

        // An empty result is NOT immediately treated as "not onboarded".
        // During session restoration the auth token, RLS context, and database
        // request can become ready on slightly different ticks. Previously we
        // accepted one empty result and redirected a valid onboarded user to
        // /onboarding. Require four consecutive empty reads before declaring
        // that this authenticated user truly has no staff record.
        if (attempt < 4 && myId === fetchIdRef.current) {
          const delay = [200, 500, 1200][attempt - 1] || 1500
          setTimeout(() => {
            if (myId === fetchIdRef.current) fetchStaff(userId, attempt + 1, myId)
          }, delay)
          return
        }

        setStaff(null)
        setStaffChecked(true)
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

  const signOut = async () => {
    const signingOutUserId = session?.user?.id

    // Invalidate local auth-dependent state immediately. This makes the UI
    // deterministic even if the Auth API is slow or returns session_not_found
    // for an already-revoked session.
    authGenerationRef.current += 1
    fetchIdRef.current += 1
    setSession(null)
    setStaff(null)
    setStaffChecked(true)
    setLoading(false)

    Sentry.setUser(null)
    clearModuleAccessCache()
    clearExperienceContextCache()
    if (signingOutUserId) clearMfaVerified(signingOutUserId)

    // Local scope is the expected UX for a browser's "Log out" action. It
    // clears this device/session without unexpectedly terminating the user's
    // other active devices.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      // A session_not_found response means the server already considers the
      // session signed out. The local state above remains signed out.
      const code = (error as { code?: string }).code
      if (code !== 'session_not_found') {
        Sentry.captureException(error)
        console.warn('Sign-out completed locally but server sign-out returned an error:', error)
      }
    }
  }

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
