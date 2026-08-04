import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

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
  is_admin?: boolean
  active?: boolean
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
  staff: { label: 'Staff', color: 'slate' },
}

type AuthContextValue = {
  session: Session | null
  staff: Staff | null
  loading: boolean
  staffChecked: boolean
  isDemo: boolean
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
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    // Check for demo mode
    const demoMode = localStorage.getItem('avenize_demo') === 'true'
    const demoUser = localStorage.getItem('avenize_demo_user')
    
    if (demoMode && demoUser) {
      try {
        const user = JSON.parse(demoUser)
        setIsDemo(true)
        setStaff({
          id: user.id,
          user_id: user.id,
          business_id: user.business_id,
          business_name: user.business_name,
          full_name: user.name,
          email: user.email,
          role: 'owner',
          job_title: 'Business Owner',
        } as Staff)
        setStaffChecked(true)
        setLoading(false)
        return
      } catch (e) {
        console.warn('Failed to parse demo user')
      }
    }

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
    if (!session?.user?.id) {
      setStaff(null)
      setStaffChecked(true)
      return
    }

    // Skip for demo mode (already set in useEffect)
    if (isDemo) {
      setStaffChecked(true)
      return
    }

    try {
      const { data } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()
      
      if (data) {
        setStaff({ ...data, user: session.user } as Staff)
      } else {
        setStaff(null)
      }
    } catch (err) {
      console.warn('Failed to fetch staff:', err)
      setStaff(null)
    }
    setStaffChecked(true)
  }, [session, isDemo])

  useEffect(() => {
    setStaffChecked(false)
    fetchStaff()
  }, [fetchStaff])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

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
      isDemo,
      signOut,
      refreshStaff: fetchStaff,
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
