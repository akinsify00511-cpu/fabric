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

// Plan-based entitlements are sourced from the DATABASE (business_entitlements.features
// JSONB, the same source has_feature() and can_access_module() read), NOT from a
// hardcoded constant. Previously a hardcoded PLAN_ENTITLEMENTS defaulted every
// non-privileged user to the 'professional' tool set regardless of their actual
// plan — a parallel source of truth that could contradict the DB. The mapping
// below only translates feature-flag keys into the tool keys the nav uses; the
// entitlement decision itself is the DB's.
const FEATURE_TO_TOOLS: Record<string, ToolKey[]> = {
  crm: ['crm'], inventory: ['inventory'], projects: ['projects'],
  time_tracking: ['time-tracking'], invoicing: ['payments', 'accounting'],
  multi_currency: ['cashflow'], automations: ['automations'],
  campaigns: ['campaigns'], social_media: ['social'],
  support_tickets: ['tickets'], live_chat: ['chat'],
  knowledge_base: ['knowledge'], recognition: ['merit', 'social-recognition'],
  api_access: ['api'], custom_branding: ['branding'],
  advanced_analytics: ['reports'],
}

// Tools every plan (incl. free) gets — core chrome.
const BASE_TOOLS: ToolKey[] = ['dashboard', 'crm', 'people', 'tasks', 'settings', 'approvals', 'calendar', 'events', 'meetings']

// Derive the tool set a business is entitled to from its business_entitlements
// row (plan + features JSONB) — the single DB source of truth, the same one
// has_feature() and can_access_module() consult. Returns BASE_TOOLS plus every
// tool mapped from a feature flag that is true for this business.
function derivePlanTools(features: Record<string, boolean> | null | undefined): Set<ToolKey> {
  const set = new Set<ToolKey>(BASE_TOOLS)
  if (!features) return set
  for (const [feature, on] of Object.entries(features)) {
    if (on && feature in FEATURE_TO_TOOLS) {
      for (const t of FEATURE_TO_TOOLS[feature]) set.add(t)
    }
  }
  return set
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
      // Load the business's ACTUAL entitlements from the DB (single source of
      // truth) instead of defaulting to the hardcoded professional set.
      const { data: ent } = await supabase
        .from('business_entitlements')
        .select('features')
        .eq('business_id', staff.business_id)
        .single()
      const planTools = derivePlanTools(ent?.features as any)

      if (planTools.has(tool)) {
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

    // Load the business's ACTUAL entitlements from the DB (single source of
    // truth) before resolving functional-role tools.
    ;(async () => {
      const { data: ent } = await supabase
        .from('business_entitlements')
        .select('features')
        .eq('business_id', staff.business_id)
        .single()
      const planTools = derivePlanTools(ent?.features as any)

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
            setTools(Array.from(planTools))
          } else {
            const allowedTools = new Set<ToolKey>(planTools)
            for (const assignment of (data || []) as RoleToolAssignment[]) {
              const roles = assignment.functional_roles || []
              for (const role of roles) {
                const frt = role.functional_role_tools || []
                for (const t of frt) {
                  allowedTools.add(t.tool_key as ToolKey)
                }
              }
            }
            setTools(Array.from(allowedTools))
          }
          setLoading(false)
        })
    })()
  }, [staff])

  return { tools, loading }
}
