/**
 * Entitlement Hook
 * Real plan gating with feature-level access control
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

// All feature flags
export const FEATURES = {
  time_tracking: { label: 'Time Tracking', category: 'productivity' },
  invoicing: { label: 'Invoicing & Payments', category: 'finance' },
  api_access: { label: 'API Access', category: 'integrations' },
  custom_branding: { label: 'Custom Branding', category: 'branding' },
  advanced_analytics: { label: 'Advanced Analytics', category: 'analytics' },
  unlimited_team: { label: 'Unlimited Team Members', category: 'team' },
  multi_currency: { label: 'Multi-Currency', category: 'finance' },
  automations: { label: 'Automations', category: 'productivity' },
  campaigns: { label: 'Campaigns', category: 'marketing' },
  social_media: { label: 'Social Media', category: 'marketing' },
  whatsapp: { label: 'WhatsApp', category: 'marketing' },
  sms: { label: 'SMS', category: 'marketing' },
  paystack: { label: 'Paystack Integration', category: 'payments' },
  multi_bank: { label: 'Multi-Bank Transfers', category: 'payments' },
  inventory: { label: 'Inventory Management', category: 'ops' },
  projects: { label: 'Projects', category: 'ops' },
  crm: { label: 'CRM', category: 'sales' },
  support_tickets: { label: 'Support Tickets', category: 'support' },
  live_chat: { label: 'Live Chat', category: 'support' },
  knowledge_base: { label: 'Knowledge Base', category: 'ops' },
  recognition: { label: 'Team Recognition', category: 'hr' },
} as const

export type FeatureKey = keyof typeof FEATURES

// Plan tiers
export const PLANS = {
  free: { label: 'Free', tier: 0 },
  starter: { label: 'Starter', tier: 1 },
  professional: { label: 'Professional', tier: 2 },
  pro: { label: 'Pro', tier: 2 }, // Alias for professional
  enterprise: { label: 'Enterprise', tier: 3 },
} as const

export type PlanKey = keyof typeof PLANS

// Map plan aliases to canonical names
const PLAN_ALIASES: Record<string, PlanKey> = {
  'pro': 'professional',
  'Pro': 'professional',
  'PRO': 'professional',
  'starter': 'starter',
  'Starter': 'starter',
}

// Helper to normalize plan names
function normalizePlan(plan: string | undefined): PlanKey {
  if (!plan) return 'free'
  const normalized = PLAN_ALIASES[plan]
  if (normalized) return normalized
  if (plan in PLANS) return plan as PlanKey
  return 'free'
}

interface BusinessEntitlement {
  id: string
  business_id: string
  plan: PlanKey
  features: Partial<Record<FeatureKey, boolean>>
  team_limit: number
  storage_limit_mb: number
}

interface UseEntitlementResult {
  hasAccess: boolean
  loading: boolean
  plan: PlanKey
  features: Partial<Record<FeatureKey, boolean>>
  teamLimit: number
  currentTeamCount: number
  canAddTeamMember: boolean
}

interface UseTeamEntitlementResult {
  canAddMember: boolean
  currentCount: number
  limit: number
  loading: boolean
}

export function useEntitlement(feature: FeatureKey): UseEntitlementResult {
  const { staff } = useAuth()
  const [entitlement, setEntitlement] = useState<BusinessEntitlement | null>(null)
  const [teamCount, setTeamCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff?.business_id) {
      setLoading(false)
      return
    }

    const loadEntitlements = async () => {
      try {
        // Load entitlements
        const { data: entData } = await supabase
          .from('business_entitlements')
          .select('*')
          .eq('business_id', staff.business_id)
          .single()

        if (entData) {
          setEntitlement(entData as BusinessEntitlement)
        } else {
          // Create default free entitlements
          const { data: newEnt } = await supabase
            .from('business_entitlements')
            .insert({ business_id: staff.business_id, plan: 'free' })
            .select()
            .single()
          
          if (newEnt) {
            setEntitlement(newEnt as BusinessEntitlement)
          }
        }

        // Load team count
        const { count } = await supabase
          .from('staff')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', staff.business_id)
        
        setTeamCount(count || 0)
      } catch (err) {
        console.error('Failed to load entitlements:', err)
      } finally {
        setLoading(false)
      }
    }

    loadEntitlements()
  }, [staff?.business_id])

  // Default plan features (fallback)
  const defaultFeatures: Partial<Record<FeatureKey, boolean>> = {
    crm: true,
    projects: true,
    inventory: false,
    time_tracking: false,
    invoicing: false,
    api_access: false,
    custom_branding: false,
    advanced_analytics: false,
    unlimited_team: false,
    multi_currency: false,
    automations: false,
    campaigns: false,
    social_media: false,
    whatsapp: false,
    sms: false,
    paystack: false,
    multi_bank: false,
    support_tickets: false,
    live_chat: false,
    knowledge_base: false,
    recognition: false,
  }

  const planFeatures: Record<PlanKey, Partial<Record<FeatureKey, boolean>>> = {
    free: { crm: true, projects: true },
    starter: { crm: true, projects: true, inventory: true, support_tickets: true, live_chat: true },
    professional: { 
      crm: true, projects: true, inventory: true, time_tracking: true, invoicing: true,
      multi_currency: true, campaigns: true, social_media: true, paystack: true, 
      multi_bank: true, support_tickets: true, live_chat: true, knowledge_base: true, 
      recognition: true 
    },
    pro: { // Alias for professional
      crm: true, projects: true, inventory: true, time_tracking: true, invoicing: true,
      multi_currency: true, campaigns: true, social_media: true, paystack: true, 
      multi_bank: true, support_tickets: true, live_chat: true, knowledge_base: true, 
      recognition: true 
    },
    enterprise: Object.keys(FEATURES).reduce((acc, key) => ({ ...acc, [key]: true }), {}) as Partial<Record<FeatureKey, boolean>>,
  }

  const plan = normalizePlan(entitlement?.plan)
  const features = { ...defaultFeatures, ...planFeatures[plan], ...entitlement?.features }
  const teamLimit = entitlement?.team_limit || 3
  const canAddMember = teamCount < teamLimit

  return {
    hasAccess: features[feature] || false,
    loading,
    plan,
    features,
    teamLimit,
    currentTeamCount: teamCount,
    canAddTeamMember: canAddMember,
  }
}

// Hook to check team member limits
export function useTeamLimit(): UseTeamEntitlementResult {
  const { staff } = useAuth()
  const [currentCount, setCurrentCount] = useState(0)
  const [limit, setLimit] = useState(3)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff?.business_id) {
      setLoading(false)
      return
    }

    const load = async () => {
      try {
        const { data: entData } = await supabase
          .from('business_entitlements')
          .select('team_limit')
          .eq('business_id', staff.business_id)
          .single()

        if (entData) {
          setLimit(entData.team_limit)
        }

        const { count } = await supabase
          .from('staff')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', staff.business_id)
        
        setCurrentCount(count || 0)
      } catch (err) {
        console.error('Failed to load team limit:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [staff?.business_id])

  return {
    canAddMember: currentCount < limit,
    currentCount,
    limit,
    loading,
  }
}

// Hook to get all entitlements
export function useEntitlements(): {
  plan: PlanKey
  features: Partial<Record<FeatureKey, boolean>>
  teamLimit: number
  loading: boolean
} {
  const { staff } = useAuth()
  const [entitlement, setEntitlement] = useState<BusinessEntitlement | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff?.business_id) {
      setLoading(false)
      return
    }

    supabase
      .from('business_entitlements')
      .select('*')
      .eq('business_id', staff.business_id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load entitlements:', error)
        }
        if (data) {
          setEntitlement(data as BusinessEntitlement)
        }
        setLoading(false)
      })
  }, [staff?.business_id])

  const plan = normalizePlan(entitlement?.plan)
  
  const defaultFeatures: Partial<Record<FeatureKey, boolean>> = {
    crm: true,
    projects: true,
  }
  
  const planFeatures: Record<PlanKey, Partial<Record<FeatureKey, boolean>>> = {
    free: { crm: true, projects: true },
    starter: { crm: true, projects: true, inventory: true, support_tickets: true, live_chat: true },
    professional: { 
      crm: true, projects: true, inventory: true, time_tracking: true, invoicing: true,
      multi_currency: true, campaigns: true, social_media: true, paystack: true, 
      multi_bank: true, support_tickets: true, live_chat: true, knowledge_base: true, 
      recognition: true 
    },
    pro: { // Alias for professional
      crm: true, projects: true, inventory: true, time_tracking: true, invoicing: true,
      multi_currency: true, campaigns: true, social_media: true, paystack: true, 
      multi_bank: true, support_tickets: true, live_chat: true, knowledge_base: true, 
      recognition: true 
    },
    enterprise: Object.keys(FEATURES).reduce((acc, key) => ({ ...acc, [key]: true }), {}) as Partial<Record<FeatureKey, boolean>>,
  }

  return {
    plan,
    features: { ...defaultFeatures, ...planFeatures[plan], ...entitlement?.features },
    teamLimit: entitlement?.team_limit || 3,
    loading,
  }
}
