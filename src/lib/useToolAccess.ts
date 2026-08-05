/**
 * Tool Access Hook
 * Checks if current staff member has access to a specific tool/module
 * Combines: plan entitlements + functional role access
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

// All available tools in the system
export const TOOLS = [
  { key: 'dashboard', label: 'Dashboard', category: 'core' },
  { key: 'crm', label: 'CRM', category: 'sales' },
  { key: 'projects', label: 'Projects', category: 'ops' },
  { key: 'finance', label: 'Finance', category: 'finance' },
  { key: 'quotes', label: 'Quotes', category: 'sales' },
  { key: 'payments', label: 'Payments', category: 'finance' },
  { key: 'accounting', label: 'Accounting', category: 'finance' },
  { key: 'people', label: 'People', category: 'hr' },
  { key: 'inventory', label: 'Inventory', category: 'ops' },
  { key: 'reports', label: 'Reports', category: 'analytics' },
  { key: 'tasks', label: 'Tasks', category: 'ops' },
  { key: 'campaigns', label: 'Campaigns', category: 'marketing' },
  { key: 'social', label: 'Social Media', category: 'marketing' },
  { key: 'automations', label: 'Automations', category: 'ops' },
  { key: 'tickets', label: 'Support', category: 'support' },
  { key: 'chat', label: 'Chat', category: 'support' },
  { key: 'approvals', label: 'Approvals', category: 'hr' },
  { key: 'requisitions', label: 'Requisitions', category: 'ops' },
  { key: 'meetings', label: 'Meetings', category: 'ops' },
  { key: 'knowledge', label: 'Knowledge', category: 'ops' },
  { key: 'calendar', label: 'Calendar', category: 'ops' },
  { key: 'events', label: 'Events', category: 'ops' },
  { key: 'time-tracking', label: 'Time Tracking', category: 'ops' },
  { key: 'cashflow', label: 'Cash Flow', category: 'finance' },
  { key: 'merit', label: 'Merit', category: 'hr' },
  { key: 'social-recognition', label: 'Recognition', category: 'hr' },
  { key: 'integrations', label: 'Integrations', category: 'settings' },
  { key: 'api', label: 'API & Webhooks', category: 'settings' },
  { key: 'branding', label: 'Branding', category: 'settings' },
  { key: 'settings', label: 'Settings', category: 'settings' },
] as const

export type ToolKey = typeof TOOLS[number]['key']

// Plan-based entitlements (simplified - in production, check subscription tier)
const PLAN_ENTITLEMENTS: Record<string, ToolKey[]> = {
  starter: ['dashboard', 'crm', 'people', 'tasks', 'reports', 'settings'],
  professional: ['dashboard', 'crm', 'projects', 'finance', 'quotes', 'payments', 
                 'accounting', 'people', 'inventory', 'reports', 'tasks', 'campaigns',
                 'social', 'automations', 'tickets', 'chat', 'approvals', 'requisitions',
                 'meetings', 'knowledge', 'calendar', 'events', 'time-tracking', 'cashflow',
                 'settings', 'integrations', 'api', 'branding'],
  enterprise: TOOLS.map(t => t.key), // All tools
}

// Staff role that bypasses functional role filtering (sees everything)
const PRIVILEGED_ROLES = ['owner', 'admin']

interface UseToolAccessResult {
  hasAccess: boolean
  loading: boolean
  error: string | null
}

// Helper type for Supabase nested query
type RoleToolAssignment = {
  functional_role_id: string
  functional_roles?: Array<{
    functional_role_tools?: Array<{ tool_key: string }>
  }>
}

export function useToolAccess(tool: ToolKey): UseToolAccessResult {
  const { staff } = useAuth()
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const checkAccess = useCallback(async () => {
    if (!staff) {
      setHasAccess(false)
      setLoading(false)
      return
    }

    // Owners and admins see everything
    if (PRIVILEGED_ROLES.includes(staff.role || '')) {
      setHasAccess(true)
      setLoading(false)
      return
    }

    try {
      // Default plan for now (all tools available until subscription tier is implemented)
      const planTools = PLAN_ENTITLEMENTS.professional
      
      if (planTools.includes(tool)) {
        // Plan allows this tool - check functional role
        const { data: roleData, error: roleError } = await supabase
          .from('staff_functional_roles')
          .select(`
            functional_role_id,
            functional_roles (
              functional_role_tools (tool_key)
            )
          `)
          .eq('staff_id', staff.id)

        if (roleError) {
          // Table might not exist yet - fall back to plan-only
          setHasAccess(true)
          setLoading(false)
          return
        }

        // Get union of all tools from all roles
        const allowedTools = new Set<string>()
        for (const assignment of (roleData || []) as RoleToolAssignment[]) {
          const roles = assignment.functional_roles || []
          for (const role of roles) {
            const frt = role.functional_role_tools || []
            for (const t of frt) {
              allowedTools.add(t.tool_key)
            }
          }
        }

        // If no functional roles assigned, fall back to plan
        if (allowedTools.size === 0) {
          setHasAccess(true)
        } else {
          setHasAccess(allowedTools.has(tool))
        }
      } else {
        // Plan doesn't include this tool
        setHasAccess(false)
      }
      
      setError(null)
    } catch (err) {
      console.error('Error checking tool access:', err)
      // On error, be permissive (staff can see tools) - safer for UX
      setHasAccess(true)
      setError('Failed to check tool access')
    } finally {
      setLoading(false)
    }
  }, [staff, tool])

  useEffect(() => {
    checkAccess()
  }, [checkAccess])

  return { hasAccess, loading, error }
}

// Hook to get all tools the current user can access
export function useAccessibleTools(): { tools: ToolKey[]; loading: boolean } {
  const { staff } = useAuth()
  const [tools, setTools] = useState<ToolKey[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff) {
      setTools([])
      setLoading(false)
      return
    }

    // Owners and admins see everything
    if (PRIVILEGED_ROLES.includes(staff.role || '')) {
      setTools(TOOLS.map(t => t.key))
      setLoading(false)
      return
    }

    // Get plan tools - default to professional for now
    const planTools = PLAN_ENTITLEMENTS.professional

    // Get functional role tools
    supabase
      .from('staff_functional_roles')
      .select(`
        functional_roles (
          functional_role_tools (tool_key)
        )
      `)
      .eq('staff_id', staff.id)
      .then(({ data, error }) => {
        if (error) {
          // Fall back to plan tools
          setTools(planTools)
        } else {
          const allowedTools = new Set<string>(planTools)
          for (const assignment of (data || []) as RoleToolAssignment[]) {
            const roles = assignment.functional_roles || []
            for (const role of roles) {
              const frt = role.functional_role_tools || []
              for (const t of frt) {
                allowedTools.add(t.tool_key)
              }
            }
          }
          setTools(Array.from(allowedTools) as ToolKey[])
        }
        setLoading(false)
      })
  }, [staff])

  return { tools, loading }
}
