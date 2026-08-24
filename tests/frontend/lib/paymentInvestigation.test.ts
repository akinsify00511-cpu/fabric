import { describe, it, expect } from 'vitest'
import {
  firstBrokenStage,
  summarizeInvestigation,
  STAGE_LABELS,
  type InvestigationMatch,
  type InvestigationStage,
} from '../../../src/lib/paymentInvestigation'

const stage = (s: string, status: InvestigationStage['status'], detail = ''): InvestigationStage => ({ stage: s, status, detail })

const match = (stages: InvestigationStage[], status = 'success'): InvestigationMatch => ({
  reference: 'avz_test',
  provider: 'paystack',
  business_id: 'b1',
  business_name: 'Test Biz',
  plan_code: 'starter',
  billing_cycle: 'monthly',
  amount_cents: 1500000,
  currency: 'NGN',
  status,
  created_at: '2026-08-24T00:00:00Z',
  paid_at: null,
  verified_at: null,
  attribution: null,
  stages,
})

describe('payment investigation stage contract', () => {
  it('covers the full chain the go/no-go doc names', () => {
    for (const s of ['checkout', 'provider', 'webhook', 'verification', 'ledger', 'subscription', 'entitlement']) {
      expect(STAGE_LABELS[s]).toBeTruthy()
    }
  })

  it('firstBrokenStage returns the first missing/failed stage in chain order', () => {
    const stages = [stage('checkout', 'ok'), stage('webhook', 'missing'), stage('ledger', 'pending')]
    expect(firstBrokenStage(stages)?.stage).toBe('webhook')
  })

  it('firstBrokenStage ignores external (provider is answered by Paystack, not us) and ok/pending', () => {
    const stages = [stage('checkout', 'ok'), stage('provider', 'external'), stage('ledger', 'pending')]
    expect(firstBrokenStage(stages)).toBeNull()
  })

  it('fully settled chain summarizes as settled', () => {
    const stages = ['checkout', 'webhook', 'verification', 'ledger', 'subscription', 'entitlement'].map((s) => stage(s, 'ok'))
    stages.splice(1, 0, stage('provider', 'external'))
    expect(summarizeInvestigation(match(stages))).toContain('Fully settled')
  })

  it('checkout-but-no-webhook with non-success ledger = never completed, not "paid"', () => {
    const stages = [stage('checkout', 'ok'), stage('webhook', 'missing'), stage('ledger', 'pending'), stage('subscription', 'missing')]
    expect(summarizeInvestigation(match(stages, 'pending'))).toContain('never completed')
  })

  it('paid but missing subscription/entitlement = paid but not provisioned', () => {
    const stages = [
      stage('checkout', 'ok'), stage('webhook', 'ok'), stage('verification', 'ok'),
      stage('ledger', 'ok'), stage('subscription', 'missing'), stage('entitlement', 'missing'),
    ]
    expect(summarizeInvestigation(match(stages))).toContain('Paid but not provisioned')
  })

  it('a broken middle stage names the stage', () => {
    const stages = [stage('checkout', 'ok'), stage('webhook', 'ok'), stage('verification', 'missing', 'no verify')]
    expect(summarizeInvestigation(match(stages, 'processing'))).toContain('Verification')
  })
})
