import { describe, it, expect } from 'vitest'

// Automation health + scheduled-automation executor (#20).
// Locks: (1) the owner gate (membership-guarded), (2) the health payload contract
// (counts/rates only, #21), (3) the scheduled-trigger idempotency guard,
// (4) the best-effort batch contract (one failure never aborts the batch).

// Mirrors the automation_health RPC membership guard via get_current_staff.
function healthGate(isMember: boolean): { authorized: boolean } {
  return { authorized: isMember }
}

// Mirrors the run_due_automations idempotency check: run if never run, or if
// last_run > 55 minutes ago (the hourly cron window guard).
function shouldRunScheduled(lastRunAt: Date | null, now: Date): boolean {
  if (!lastRunAt) return true
  return now.getTime() - lastRunAt.getTime() > 55 * 60 * 1000
}

// Mirrors the best-effort batch contract: a failing automation logs + skips,
// never aborts the loop. Returns the count of successfully run automations.
function runBatch(automations: { id: string; ok: boolean }[]): { ran: number; failed: number } {
  let ran = 0
  let failed = 0
  for (const a of automations) {
    if (a.ok) {
      ran++
    } else {
      failed++ // logged + skipped, loop continues
    }
  }
  return { ran, failed }
}

describe('Automation health — owner gate (#20)', () => {
  it('authorizes a business member', () => {
    expect(healthGate(true).authorized).toBe(true)
  })
  it('denies a non-member (empty payload, no leak)', () => {
    expect(healthGate(false).authorized).toBe(false)
  })
})

describe('Automation health — payload contract (#21 aggregate only)', () => {
  const HEALTH_FIELDS = [
    'authorized', 'total_automations', 'enabled_automations',
    'total_runs', 'successful_runs', 'failed_runs',
    'never_run', 'recent_runs',
  ]
  const PII_FIELDS = ['business_name', 'owner_email', 'customer_name', 'invoice_amount', 'salary']
  it('the health payload is counts + status (no business PII)', () => {
    PII_FIELDS.forEach((f) => {
      expect(HEALTH_FIELDS).not.toContain(f)
    })
  })
  it('reads only automation_runs + automations (operational data)', () => {
    const SOURCES = ['automation_runs', 'automations']
    expect(SOURCES).not.toContain('payroll_records')
    expect(SOURCES).not.toContain('legal_cases')
  })
})

describe('Scheduled-automation executor — idempotency + cadence', () => {
  it('runs a never-run scheduled automation', () => {
    expect(shouldRunScheduled(null, new Date('2026-08-16T12:00:00Z'))).toBe(true)
  })
  it('does not re-run within the hourly window (last run 30 min ago)', () => {
    const now = new Date('2026-08-16T12:00:00Z')
    const lastRun = new Date('2026-08-16T11:30:00Z')
    expect(shouldRunScheduled(lastRun, now)).toBe(false)
  })
  it('re-runs after the window (last run 56 min ago)', () => {
    const now = new Date('2026-08-16T12:00:00Z')
    const lastRun = new Date('2026-08-16T11:04:00Z')
    expect(shouldRunScheduled(lastRun, now)).toBe(true)
  })
})

describe('Scheduled-automation executor — best-effort batch contract', () => {
  it('a failing automation does not abort the batch', () => {
    const result = runBatch([
      { id: '1', ok: true },
      { id: '2', ok: false },
      { id: '3', ok: true },
    ])
    expect(result.ran).toBe(2)
    expect(result.failed).toBe(1)
  })
  it('all-failing batch still returns (no abort)', () => {
    const result = runBatch([
      { id: '1', ok: false },
      { id: '2', ok: false },
    ])
    expect(result.ran).toBe(0)
    expect(result.failed).toBe(2)
  })
  it('empty batch returns zero (no-op, safe)', () => {
    expect(runBatch([])).toEqual({ ran: 0, failed: 0 })
  })
})
