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

// First-class account identity. UX classification only — role + RLS stay the
// authorization boundary; kind never grants or revokes permissions.
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
// AuthContext is the ONLY component that resolves "who is this user and do
// they belong to a business". Login authenticates, Onboarding creates the
// business — neither decides membership. `staff === null` is never overloaded:
// an empty read is ambiguous (new user vs transient failure), an error is a
// failure, and a deactivated member is distinct from both.
export type MembershipState =
  | 'loading'              // session or membership not resolved yet
  | 'anonymous'            // definitively no session
  | 'member'               // staff row with a business
  | 'onboarding_required'  // authenticated, genuinely no membership
  | 'deactivated'          // staff row exists but the member was deactivated
  | 'error'                // membership lookup failed (DB/RLS/network)

export function deriveMembership(args: {
  authLoading: boolean
  sessionPresent: boolean
  staffChecked: boolean
  staffError: boolean
  staff: Pick<Staff, 'business_id' | 'active'> | null
}): MembershipState {
  if (args.authLoading) return 'loading'
  if (!args.sessionPresent) return 'anonymous'
  // staffChecked is only trustworthy for the CURRENT identity — the auth event
  // handler resets it synchronously when the user id changes, so a stale
  // "checked" flag from a previous/no session can never produce a false
  // 'onboarding_required'.
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)
  const [staffChecked, setStaffChecked] = useState(false)
  const [staffError, setStaffError] = useState(false)
  // Monotonic request id prevents stale staff requests/retries from writing
  // into state after a user switch or sign-out.
  const fetchIdRef = useRef(0)
  // Auth generation prevents an older getSession() result from resurrecting
  // a session after a SIGNED_OUT event has already been processed.
  const authGenerationRef = useRef(0)
  // The user id the current session state belongs to. Used to detect identity
  // changes so membership state can be invalidated in the SAME batch as the
  // session update — a returning user must never flash 'onboarding_required'
  // while their staff row is being fetched.
  const sessionUserIdRef = useRef<string | null>(null)

  // Apply a session change atomically. When the identity changes, the previous
  // membership resolution is meaningless — reset it here (batched with the
  // session update) rather than in a later effect, so no render ever sees
  // "new session + stale staffChecked=true + staff=null".
  const applySession = useCallback((newSession: Session | null) => {
    const nextId = newSession?.user?.id ?? null
    if (nextId !== sessionUserIdRef.current) {
      sessionUserIdRef.current = nextId
      setStaff(null)
      setStaffError(false)
      // A resolved membership requires a fresh check for the new identity.
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

      // SIGNED_OUT is terminal for this browser session. Invalidate every
      // in-flight staff request immediately instead of waiting for React's
      // session state update to propagate through the effect below.
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

      // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED all funnel
      // through the same atomic session application.
      applySession(newSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [applySession])

  // Resolve membership for the current identity. Awaitable so onboarding can
  // wait for the definitive answer before routing. Retries absorb the
  // auth-token/RLS readiness race during session restoration; after retries an
  // ERROR is surfaced (membership = 'error', recoverable via refreshStaff)
  // while genuinely-empty reads resolve to 'onboarding_required'.
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
          const { data, error } = await supabase
            .from('staff')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle()

          if (myId !== fetchIdRef.current) return null
          if (data) {
            // A confirmed staff row is the authoritative membership record.
            const resolved = { ...data, user: session?.user } as Staff
            setStaff(resolved)
            setStaffError(false)
            setStaffChecked(true)
            return resolved
          }
          if (error) {
            lastError = error
            continue
          }
          // Empty read: ambiguous (new user vs transient) — retry.
        } catch (err) {
          lastError = err
        }
      }

      if (myId !== fetchIdRef.current) return null
      if (lastError) {
        console.warn('Failed to fetch staff after retries:', lastError)
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
    sessionUserIdRef.current = null
    setSession(null)
    setStaff(null)
    setStaffError(false)
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

  // Awaitable: resolves once the membership answer is definitive (or all
  // retries are exhausted), so callers like onboarding can wait for the
  // authoritative staff row before routing to /app.
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
