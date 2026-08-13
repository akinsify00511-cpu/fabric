/**
 * AVENIZE APPROVAL WORKFLOW SYSTEM
 * Multi-level approval chains for business processes
 */

import { supabase } from './supabase'

export type ApprovalType = 
  | 'expense' 
  | 'leave' 
  | 'purchase_order' 
  | 'invoice' 
  | 'payment' 
  | 'general'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated'

export interface ApprovalRule {
  id: string
  business_id: string
  name: string
  type: ApprovalType
  min_amount?: number
  max_amount?: number
  required_approvers: ApproverLevel[]
  conditions?: ApprovalCondition[]
  active: boolean
  created_at: string
}

export interface ApproverLevel {
  level: number
  role: string // 'manager' | 'director' | 'owner'
  user_id?: string // specific user (optional)
  auto_approve_if?: { days?: number; amount_below?: number }
}

export interface ApprovalCondition {
  field: string
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains'
  value: any
}

export interface ApprovalRequest {
  id: string
  business_id: string
  type: ApprovalType
  requester_id: string
  requester?: string
  entity_type: string
  entity_id: string
  entity_name: string
  amount?: number
  status: ApprovalStatus
  current_level: number
  rule_id?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface ApprovalDecision {
  id: string
  requisition_id: string
  approver_id: string
  approver?: { full_name: string }
  level: number
  decision: 'approved' | 'rejected' | 'escalated'
  comment?: string
  decided_at: string
}

// Default approval rules by type
export const DEFAULT_APPROVAL_RULES: Omit<ApprovalRule, 'id' | 'business_id' | 'created_at'>[] = [
  {
    name: 'Small Expense',
    type: 'expense',
    min_amount: 0,
    max_amount: 50000,
    required_approvers: [{ level: 1, role: 'manager' }],
    active: true,
  },
  {
    name: 'Medium Expense',
    type: 'expense',
    min_amount: 50000,
    max_amount: 200000,
    required_approvers: [
      { level: 1, role: 'manager' },
      { level: 2, role: 'owner' },
    ],
    active: true,
  },
  {
    name: 'Large Expense',
    type: 'expense',
    min_amount: 200000,
    max_amount: 999999999,
    required_approvers: [
      { level: 1, role: 'manager' },
      { level: 2, role: 'owner' },
    ],
    active: true,
  },
  {
    name: 'Leave Approval',
    type: 'leave',
    required_approvers: [{ level: 1, role: 'manager' }],
    active: true,
  },
  {
    name: 'Purchase Order',
    type: 'purchase_order',
    min_amount: 100000,
    required_approvers: [
      { level: 1, role: 'manager' },
      { level: 2, role: 'owner' },
    ],
    active: true,
  },
]

// Amount thresholds for escalation (in kobo - Naira)
export const APPROVAL_AMOUNTS = {
  low: 50000,      // Up to N50,000 - Manager only
  medium: 200000,  // N50,000 - N200,000 - Manager + Director
  high: 500000,    // N200,000 - N500,000 - Full chain
  critical: 999999999, // Above N500,000 - Owner only
}

// Get applicable approval rule
export async function getApprovalRule(
  businessId: string,
  type: ApprovalType,
  amount?: number
): Promise<ApprovalRule | null> {
  let query = supabase
    .from('approval_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('type', type)
    .eq('active', true)
    .order('min_amount', { ascending: false })

  const { data, error } = await query
  
  if (error) throw error
  
  // Find first matching rule based on amount
  const rule = (data || []).find(r => {
    if (amount !== undefined) {
      const aboveMin = !r.min_amount || amount >= r.min_amount
      const belowMax = !r.max_amount || amount < r.max_amount
      return aboveMin && belowMax
    }
    return true
  })
  
  return rule || null
}

// Create approval request
export async function createApprovalRequest(
  businessId: string,
  requesterId: string,
  type: ApprovalType,
  entityType: string,
  entityId: string,
  entityName: string,
  amount?: number,
  metadata?: Record<string, any>
): Promise<ApprovalRequest> {
  // Get applicable rule
  const rule = await getApprovalRule(businessId, type, amount)
  
  const { data, error } = await supabase
    .from('approval_requests')
    .insert({
      business_id: businessId,
      type,
      requester_id: requesterId,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      amount,
      status: 'pending',
      current_level: 1,
      rule_id: rule?.id,
      metadata,
    })
    .select('*, requester:staff(name, email)')
    .single()

  if (error) throw error
  return data
}

// Get pending approvals for a user
export async function getPendingApprovals(
  businessId: string,
  userRole: string,
  userId: string
): Promise<ApprovalRequest[]> {
  // Get rules where this user/role is an approver
  const { data: rules } = await supabase
    .from('approval_rules')
    .select('*, required_approvers')
    .eq('business_id', businessId)
    .eq('active', true)

  const applicableRules = (rules || []).filter(rule => {
    const approvers: { role: string }[] = rule.required_approvers || []
    return approvers.some((a: { role: string }) => a.role === userRole)
  })

  if (applicableRules.length === 0) return []

  const ruleIds = applicableRules.map(r => r.id)
  
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*, requester:staff(name, email)')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .in('rule_id', ruleIds)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

// Approve a request
export async function approveRequest(
  requestId: string,
  approverId: string,
  comment?: string
): Promise<ApprovalRequest> {
  // Get the request
  const { data: request, error: reqError } = await supabase
    .from('approval_requests')
    .select('*, rule:approval_rules(required_approvers)')
    .eq('id', requestId)
    .single()

  if (reqError) throw reqError

  const approvers: { level: number; role: string }[] = request.rule?.required_approvers || []
  const currentLevel = request.current_level
  const nextLevel = currentLevel + 1

  // Check if there are more levels
  const hasMoreLevels = approvers.some((a: { level: number }) => a.level === nextLevel)

  if (hasMoreLevels) {
    // Move to next level
    const { data, error } = await supabase
      .from('approval_requests')
      .update({ current_level: nextLevel, updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select()
      .single()

    if (error) throw error

    // Record decision
    await supabase.from('approval_decisions').insert({
      requisition_id: requestId,
      approver_id: approverId,
      level: currentLevel,
      decision: 'approved',
      comment,
    })

    return data
  } else {
    // Final approval
    const { data, error } = await supabase
      .from('approval_requests')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select()
      .single()

    if (error) throw error

    // Record decision
    await supabase.from('approval_decisions').insert({
      requisition_id: requestId,
      approver_id: approverId,
      level: currentLevel,
      decision: 'approved',
      comment,
    })

    // Update the original entity (e.g., approve expense, complete leave approval)
    await executePostApprovalActions(request)

    return data
  }
}

// Reject a request
export async function rejectRequest(
  requestId: string,
  approverId: string,
  comment: string
): Promise<ApprovalRequest> {
  const { data: request } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (!request) throw new Error('Request not found')

  const { data, error } = await supabase
    .from('approval_requests')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single()

  if (error) throw error

  // Record decision
  await supabase.from('approval_decisions').insert({
    requisition_id: requestId,
    approver_id: approverId,
    level: request.current_level,
    decision: 'rejected',
    comment,
  })

  // Execute post-rejection actions
  await executePostRejectionActions(request)

  return data
}

// Execute actions after approval
async function executePostApprovalActions(request: ApprovalRequest) {
  switch (request.type) {
    case 'expense':
      await supabase
        .from('expense_claims')
        .update({ status: 'approved' })
        .eq('id', request.entity_id)
      break
    case 'leave':
      await supabase
        .from('leave_requests')
        .update({ status: 'approved' })
        .eq('id', request.entity_id)
      break
    case 'purchase_order':
      await supabase
        .from('purchase_orders')
        .update({ status: 'approved' })
        .eq('id', request.entity_id)
      break
    case 'invoice':
      await supabase
        .from('invoices')
        .update({ status: 'approved' })
        .eq('id', request.entity_id)
      break
  }
}

// Execute actions after rejection
async function executePostRejectionActions(request: ApprovalRequest) {
  switch (request.type) {
    case 'expense':
      await supabase
        .from('expense_claims')
        .update({ status: 'rejected' })
        .eq('id', request.entity_id)
      break
    case 'leave':
      await supabase
        .from('leave_requests')
        .update({ status: 'rejected' })
        .eq('id', request.entity_id)
      break
    case 'purchase_order':
      await supabase
        .from('purchase_orders')
        .update({ status: 'rejected' })
        .eq('id', request.entity_id)
      break
  }
}

// Get approval history
export async function getApprovalHistory(
  businessId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*, requester:staff(name), decisions:approval_decisions(*, approver:staff(name))')
    .eq('business_id', businessId)
    .in('status', ['approved', 'rejected'])
    .order('updated_at', { ascending: false })
    .limit(options.limit || 50)
    .range(options.offset || 0, (options.offset || 0) + (options.limit || 50) - 1)

  if (error) throw error
  return data || []
}

// Approval type labels
export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  expense: 'Expense',
  leave: 'Leave Request',
  purchase_order: 'Purchase Order',
  invoice: 'Invoice',
  payment: 'Payment',
  general: 'General Request',
}

// Status colors
export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  approved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
  escalated: { bg: 'bg-blue-100', text: 'text-blue-700' },
}
