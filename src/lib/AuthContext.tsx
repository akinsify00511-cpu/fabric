import { useContext, createContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearMfaVerified } from './mfa'
import { clearModuleAccessCache } from './useModuleAccess'
import { clearExperienceContextCache } from './useExperienceContext'
import { logPlatformActivity } from './riverwaysActivity'
import { captureSentryException, setSentryUser, setSentryTag } from './sentryLazy'

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
  member_kind?: MemberKind
  active_role?: UserRole | null
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

export type MemberKind = 'owner' | 'staff' | 'consultant' | 'vendor' | 'expert' | 'partner'

export const MEMBER_KIND_CONFIG: Record<MemberKind, { label: string; classes: string }> = {
  owner: { label: 'Owner', classes: 'bg-amber-50 text-amber-700' },
  staff: { label: 'Staff', classes: 'bg-sky-50 text-sky-700' },
  consultant: { label: 'Consultant', classes: 'bg-violet-50 text-violet-700' },
  vendor: { label: 'Vendor', classes: 'bg-teal-50 text-teal-700' },
  expert: { label: 'Expert', classes: 'bg-indigo-50 text-indigo-700' },
  partner: { label: 'Partner', classes: 'bg-emerald-50 text-emerald-700' },
}

export const INVITABLE_KINDS: MemberKind[] = ['staff', 'consultant', 'vendor', 'expert', 'partner']

export function memberKindLabel(kind: MemberKind | string | null | undefined): string {
  const cfg = MEMBER_KIND_CONFIG[(kind || 'staff') as MemberKind]
  return cfg?.label ?? 'Staff'
}

// ============================================
// CANONICAL MEMBERSHIP STATE MACHINE
// ============================================
// AuthContext is the only authority for membership. A missing staff row is
// only treated as "new user" after the membership resolver has established
// that there is genuinely no membership. In particular, an RLS/read failure
// must NEVER become onboarding_required.
export type MembershipState =
  | 'loading'
  | 'anonymous'
  | 'member'
  | 'onboarding_required'
  | 'deactivated'
  | 'error'

export function deriveMembership(args: {
  authLoading: boolean
  sessionPresent: boolean
  staffChecked: boolean
  staffError: boolean
  staff: Pick<Staff, 'business_id' | 'active'> | null
}): MembershipState {
  if (args.authLoading) return 'loading'
  if (!args.sessionPresent) return 'anonymous'
  if (!args.staffChecked) return 'loading'
  if (args.staffError) return 'error'
  if (!args.staff || !args.staff.business_id) return 'onboarding_required'
  if (args.staff.active === false) return 'deactivated'
  return 'member'
}

type AuthContextValue = {
  session: Session | null
  staff: Staff | null
  loading: boolean
  staffChecked: boolean
  membership: MembershipState
  signOut: () => Promise<void>
  refreshStaff: () => Promise<Staff | null>
  canManageStaff: boolean
  canApproveRequests: boolean
  canViewReports: boolean
  canManageSettings: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// The existing SECURITY DEFINER get_current_staff() function is the database's
// canonical identity resolver. Using it before a normal staff SELECT prevents
// a restrictive/stale RLS policy from making an existing account look like a
// brand-new account. We still fetch the full row for application data, but the
// RPC result itself is sufficient proof that the user is already a member.
type CurrentStaffIdentity = {
  id: string
  business_id: string
  role: string
}

async function resolveStaffIdentity(userId: string): Promise<CurrentStaffIdentity | null> {
  const { data, error } = await supabase.rpc('get_current_staff')
  if (error) {
    throw error
  }
  const rows = Array.isArray(data) ? data : []
  const match = rows.find((row: CurrentStaffIdentity) => row?.id && row.business_id)
  return match ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)
  const [staffChecked, setStaffChecked] = useState(false)
  const [staffError, setStaffError] = useState(false)
  const fetchIdRef = useRef(0)
  const authGenerationRef = useRef(0)
  const sessionUserIdRef = useRef<string | null>(null)

  const applySession = useCallback((newSession: Session | null) => {
    const nextId = newSession?.user?.id ?? null
    if (nextId !== sessionUserIdRef.current) {
      sessionUserIdRef.current = nextId
      setStaff(null)
      setStaffError(false)
      setStaffChecked(!nextId)
    }
    setSession(newSession)
    setLoading(false)
  }, [])

  useEffect(() => {
    let mounted = true
    const generationAtStart = authGenerationRef.current

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted || generationAtStart !== authGenerationRef.current) return
      applySession(data.session)
    }).catch((error) => {
      if (!mounted || generationAtStart !== authGenerationRef.current) return
      console.warn('Failed to restore auth session:', error)
      applySession(null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return
      if (event === 'SIGNED_IN' && newSession?.user) {
        logPlatformActivity('user.signed_in', { feature: 'auth', result: 'completed' })
      }
      if (event === 'SIGNED_OUT') {
        authGenerationRef.current += 1
        fetchIdRef.current += 1
        sessionUserIdRef.current = null
        setSession(null)
        setStaff(null)
        setStaffError(false)
        setStaffChecked(true)
        setLoading(false)
        return
      }
      applySession(newSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [applySession])

  const fetchStaff = useCallback(
    async (userId: string, myId: number): Promise<Staff | null> => {
      let lastError: unknown = null
      const delays = [0, 200, 500, 1200]

      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delays[attempt]))
        }
        if (myId !== fetchIdRef.current) return null

        try {
          // FIRST: resolve membership through the SECURITY DEFINER function.
          // This is intentionally separate from the normal staff SELECT so an
          // RLS problem cannot turn an existing user into an onboarding user.
          const identity = await resolveStaffIdentity(userId)

          if (myId !== fetchIdRef.current) return null

          if (identity) {
            // SECOND: fetch the full staff record for the application. If RLS
            // blocks the detail read, keep the authoritative membership proof
            // and construct a safe minimal staff object from session identity.
            const { data, error } = await supabase
              .from('staff')
              .select('*')
              .eq('id', identity.id)
              .maybeSingle()

            if (myId !== fetchIdRef.current) return null

            if (data) {
              const resolved = { ...data, user: session?.user } as Staff
              setStaff(resolved)
              setStaffError(false)
              setStaffChecked(true)
              return resolved
            }

            if (error) {
              console.warn('Staff detail read failed after authoritative membership resolution:', error)
            }

            const fallbackRole = (['owner', 'admin', 'manager', 'team_lead', 'staff'] as string[]).includes(identity.role)
              ? identity.role as UserRole
              : 'staff'
            const fallbackName = session?.user?.user_metadata?.full_name
              || session?.user?.user_metadata?.name
              || session?.user?.email?.split('@')[0]
              || 'Avenize User'

            const fallback: Staff = {
              id: identity.id,
              user_id: userId,
              business_id: identity.business_id,
              full_name: fallbackName,
              name: fallbackName,
              email: session?.user?.email,
              role: fallbackRole,
              job_title: null,
              active: true,
              user: session?.user,
            }
            setStaff(fallback)
            setStaffError(false)
            setStaffChecked(true)
            return fallback
          }

          // No authoritative membership. A normal empty result is allowed to
          // mean onboarding, but only after all retries have completed.
        } catch (err) {
          lastError = err
        }
      }

      if (myId !== fetchIdRef.current) return null

      if (lastError) {
        // A resolver error is NEVER onboarding_required. Preserve the session
        // and expose a retryable auth error instead of sending the user through
        // the onboarding wizard.
        console.warn('Failed to resolve staff membership after retries:', lastError)
        setStaffError(true)
        setStaffChecked(true)
        return null
      }

      setStaff(null)
      setStaffChecked(true)
      return null
    },
    [session?.user],
  )

  const userId = session?.user?.id
  useEffect(() => {
    if (userId) {
      const id = ++fetchIdRef.current
      setStaffChecked(false)
      setStaffError(false)
      void fetchStaff(userId, id)
    } else {
      setStaff(null)
      setStaffError(false)
      setStaffChecked(true)
    }
  }, [fetchStaff, userId])

  useEffect(() => {
    if (staff) {
      setSentryUser({ id: staff.id })
      setSentryTag('business_id', staff.business_id)
      setSentryTag('is_beta_tester', String(staff.is_beta_tester ?? false))
      setSentryTag('user_role', staff.role)
    } else {
      setSentryUser(null)
    }
  }, [staff])

  const signOut = async () => {
    const signingOutUserId = session?.user?.id
    if (signingOutUserId) {
      logPlatformActivity('user.signed_out', { feature: 'auth', result: 'completed' })
    }
    authGenerationRef.current += 1
    fetchIdRef.current += 1
    sessionUserIdRef.current = null
    setSession(null)
    setStaff(null)
    setStaffError(false)
    setStaffChecked(true)
    setLoading(false)

    setSentryUser(null)
    clearModuleAccessCache()
    clearExperienceContextCache()
    if (signingOutUserId) clearMfaVerified(signingOutUserId)

    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      const code = (error as { code?: string }).code
      if (code !== 'session_not_found') {
        captureSentryException(error)
        console.warn('Sign-out completed locally but server sign-out returned an error:', error)
      }
    }
  }

  const refreshStaff = useCallback((): Promise<Staff | null> => {
    if (!session?.user?.id) return Promise.resolve(null)
    const id = ++fetchIdRef.current
    setStaffChecked(false)
    setStaffError(false)
    return fetchStaff(session.user.id, id)
  }, [fetchStaff, session?.user?.id])

  const membership = deriveMembership({
    authLoading: loading,
    sessionPresent: !!session,
    staffChecked,
    staffError,
    staff,
  })

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
      membership,
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
