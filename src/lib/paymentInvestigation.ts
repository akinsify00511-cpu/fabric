/**
 * Payment Investigation (go/no-go item 14) — client layer.
 *
 * Riverways platform admins enter a customer email and/or a Paystack
 * reference; the riverways_payment_investigation RPC answers, stage by stage,
 * how far the payment got through the chain:
 *   checkout -> provider -> webhook -> verification -> ledger
 *     -> subscription -> entitlement
 *
 * The RPC is is_riverways_admin()-gated server-side; this wrapper fails
 * closed (returns { authorized: false }) for everyone else. Best-effort:
 * returns null when the migration is not deployed yet (§24).
 */

import { supabase } from './supabase'

export type InvestigationStageStatus = 'ok' | 'missing' | 'failed' | 'pending' | 'external'

export interface InvestigationStage {
  stage: string
  status: InvestigationStageStatus
  detail: string
}

export interface InvestigationMatch {
  reference: string
  provider: string
  business_id: string
  business_name: string | null
  plan_code: string | null
  billing_cycle: string | null
  amount_cents: number | null
  currency: string
  status: string
  created_at: string
  paid_at: string | null
  verified_at: string | null
  attribution: Record<string, string> | null
  stages: InvestigationStage[]
}

export interface InvestigationResult {
  authorized: boolean
  error?: string
  query: { reference: string | null; email: string | null; days: number }
  matches: InvestigationMatch[]
  note: string | null
}

export async function investigatePayment(
  reference?: string,
  email?: string,
  days = 90,
): Promise<InvestigationResult | null> {
  try {
    const { data, error } = await supabase.rpc('riverways_payment_investigation', {
      p_reference: reference?.trim() || null,
      p_email: email?.trim() || null,
      p_days: days,
    })
    if (error) return null
    return data as InvestigationResult
  } catch {
    return null
  }
}

export const STAGE_LABELS: Record<string, string> = {
  checkout: 'Checkout',
  provider: 'Paystack',
  webhook: 'Webhook',
  verification: 'Verification',
  ledger: 'Ledger',
  subscription: 'Subscription',
  entitlement: 'Entitlement',
}

/** The stage where the chain first broke — the actionable answer. */
export function firstBrokenStage(stages: InvestigationStage[]): InvestigationStage | null {
  return stages.find((s) => s.status === 'missing' || s.status === 'failed') ?? null
}

/** One-line human summary of a match, e.g. "paid but not provisioned". */
export function summarizeInvestigation(match: InvestigationMatch): string {
  const broken = firstBrokenStage(match.stages)
  if (!broken) {
    return match.status === 'success'
      ? 'Fully settled — payment, subscription and entitlement all agree.'
      : 'No break in the recorded chain.'
  }
  const label = STAGE_LABELS[broken.stage] ?? broken.stage
  if (broken.stage === 'webhook' && match.status !== 'success') {
    return `Checkout started but never completed — no payment settled (${label} never fired).`
  }
  if (broken.stage === 'subscription' || broken.stage === 'entitlement') {
    return `Paid but not provisioned — repair needed at ${label}.`
  }
  return `Chain broke at ${label}: ${broken.detail}`
}
