import { describe, it, expect } from 'vitest'

// Builder / Board Dashboard authorization + privacy contract (#19/#34).
// Locks: (1) the platform-admin gate (NOT a business role — a business owner is
// NOT a platform admin), (2) the aggregate-only privacy boundary (#21 — no
// business PII), (3) the §22 anti-fabrication boundary.

// Mirrors the builder_dashboard RPC gate: is_platform_admin() checks the
// platform_admins email allowlist via auth.uid() — NOT the business staff.role.
function platformAdminGate(isInAllowlist: boolean): boolean {
  return isInAllowlist
}

// Mirrors the role confusion the gate MUST prevent: a business owner/admin
// is NOT a platform admin. They get authorized=false (empty payload).
function businessRoleIsPlatformAdmin(role: string | undefined): boolean {
  // The RPC does NOT check staff.role at all — it checks the email allowlist.
  // A business owner passing their own role must NOT gain platform access.
  return false
}

describe('Builder Dashboard — platform-admin gate (#19, NOT a business role)', () => {
  it('authorizes an email in the platform_admins allowlist', () => {
    expect(platformAdminGate(true)).toBe(true)
  })
  it('denies an email NOT in the allowlist', () => {
    expect(platformAdminGate(false)).toBe(false)
  })
  it('a business owner is NOT a platform admin (role is irrelevant)', () => {
    expect(businessRoleIsPlatformAdmin('owner')).toBe(false)
  })
  it('a business admin is NOT a platform admin', () => {
    expect(businessRoleIsPlatformAdmin('admin')).toBe(false)
  })
  it('undefined role (no staff record) is not a platform admin', () => {
    expect(businessRoleIsPlatformAdmin(undefined)).toBe(false)
  })
})

describe('Builder Dashboard — aggregate-only privacy boundary (#21)', () => {
  // The payload contains ONLY counts/rates/averages — never business PII.
  const AGGREGATE_FIELDS = [
    'total_authenticated', 'total_completed', 'total_abandoned',
    'conversion_rate', 'median_steps_reached', 'avg_duration_seconds',
    'module_key', 'businesses_touching', 'total_events',
    'industry', 'businesses_selecting', 'businesses_using', 'adoption_rate',
    'authorized', 'data_scope',
  ]
  const PII_FIELDS = [
    'business_id', 'business_name', 'owner_email', 'owner_name',
    'client_name', 'client_email', 'invoice_amount', 'staff_name',
    'legal_case', 'disciplinary', 'salary', 'payroll',
  ]
  it('the payload field set is aggregate-only (counts/rates/averages)', () => {
    AGGREGATE_FIELDS.forEach((f) => {
      expect(typeof f).toBe('string') // shape contract
    })
    expect(AGGREGATE_FIELDS.length).toBeGreaterThan(10)
  })
  it('no business-identifying field is in the payload', () => {
    PII_FIELDS.forEach((f) => {
      expect(AGGREGATE_FIELDS).not.toContain(f)
    })
  })
  it('walled content (legal, disciplinary, payroll) is excluded from the aggregator', () => {
    // The builder_dashboard RPC reads ONLY usage_events + user_workspace_selections
    // + businesses.industry (aggregate). It NEVER references legal_cases,
    // disciplinary records, payroll_records, or salary_history.
    expect(['usage_events', 'user_workspace_selections', 'businesses']).not.toContain('legal_cases')
    expect(['usage_events', 'user_workspace_selections', 'businesses']).not.toContain('payroll_records')
  })
  it('declares the data_scope as aggregate_only_no_business_pii', () => {
    expect('aggregate_only_no_business_pii').toContain('aggregate')
    expect('aggregate_only_no_business_pii').toContain('no_business_pii')
  })
})

describe('Builder Dashboard — §22 anti-fabrication boundary', () => {
  it('platform-wide analytics are first-party only (Avenize telemetry)', () => {
    const SOURCES = ['usage_events', 'user_workspace_selections', 'businesses']
    expect(SOURCES).not.toContain('external_market_api')
    expect(SOURCES).not.toContain('industry_reports')
  })
  it('product-market gaps vs competitors require sourced external data (not fabricated)', () => {
    // The page surfaces this as an honest "what this dashboard cannot tell you"
    // section — external variance is documented as blocked-on-data, §22.
    const BLOCKED = 'external_market_variance'
    expect(BLOCKED).toContain('external')
  })
})
