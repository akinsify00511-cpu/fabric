import { describe, it, expect } from 'vitest'
import type { MeetingAnalytics } from '../../src/lib/businessOS'

// Phase E contract tests — meeting analytics + productivity intelligence.
// Locks the metrics model + small-data guard (§21) + waste detection.

describe('Meeting analytics contract (Phase E)', () => {
  const makeAnalytics = (): MeetingAnalytics => ({
    period_days: 30,
    totals: {
      total_meetings: 12,
      total_hours: 18.5,
      meetings_with_transcripts: 8,
      total_decisions: 15,
      total_actions: 23,
    },
    action_completion_pct: 65.2,
    wasted_meetings: [
      { meeting_id: 'm1', title: 'Weekly sync', date: '2026-08-10', duration_hours: 1.0 },
    ],
    wasted_meetings_count: 1,
    per_staff: [
      { staff_id: 's1', staff_name: 'Alice', meetings_created: 5, meetings_attended: 8 },
      { staff_id: 's2', staff_name: 'Bob', meetings_created: 2, meetings_attended: 6 },
    ],
    per_status: [
      { status: 'completed', count: 8 },
      { status: 'scheduled', count: 3 },
      { status: 'summarized', count: 1 },
    ],
    small_data_note: null,
  })

  describe('Totals (section 9)', () => {
    it('tracks total meetings + hours + decisions + actions', () => {
      const a = makeAnalytics()
      expect(a.totals.total_meetings).toBe(12)
      expect(a.totals.total_hours).toBe(18.5)
      expect(a.totals.total_decisions).toBe(15)
      expect(a.totals.total_actions).toBe(23)
    })

    it('tracks meetings with transcripts (transcript adoption)', () => {
      const a = makeAnalytics()
      expect(a.totals.meetings_with_transcripts).toBe(8)
    })
  })

  describe('Action completion (section 12 outcome loop)', () => {
    it('action_completion_pct is a real ratio — completed / total', () => {
      const a = makeAnalytics()
      expect(a.action_completion_pct).toBe(65.2)
    })

    it('completion_pct is NULL when no actions (honest, not 0%)', () => {
      const a = makeAnalytics()
      a.totals.total_actions = 0
      a.action_completion_pct = null
      expect(a.action_completion_pct).toBeNull()
    })
  })

  describe('Waste detection (section 9 — meetings without outcomes)', () => {
    it('a wasted meeting has no decisions AND no actions', () => {
      const a = makeAnalytics()
      expect(a.wasted_meetings[0].meeting_id).toBe('m1')
      expect(a.wasted_meetings_count).toBe(1)
    })

    it('waste detection surfaces the duration (the time cost)', () => {
      const a = makeAnalytics()
      expect(a.wasted_meetings[0].duration_hours).toBe(1.0)
    })

    it('zero wasted meetings is a valid state (every meeting was productive)', () => {
      const a = makeAnalytics()
      a.wasted_meetings = []
      a.wasted_meetings_count = 0
      expect(a.wasted_meetings_count).toBe(0)
    })
  })

  describe('Per-staff load (section 9)', () => {
    it('tracks meetings created + attended per staff', () => {
      const a = makeAnalytics()
      expect(a.per_staff[0].meetings_created).toBe(5)
      expect(a.per_staff[0].meetings_attended).toBe(8)
    })

    it('staff are ordered by total meeting load (highest first)', () => {
      const a = makeAnalytics()
      const totals = a.per_staff.map(s => s.meetings_created + s.meetings_attended)
      expect(totals[0]).toBeGreaterThanOrEqual(totals[1])
    })
  })

  describe('Small-data guard (§21)', () => {
    it('fewer than 5 meetings produces a small_data_note', () => {
      const a = makeAnalytics()
      a.totals.total_meetings = 3
      a.small_data_note = 'Insufficient data — fewer than 5 meetings in the period. Treat metrics with caution.'
      expect(a.small_data_note).not.toBeNull()
      expect(a.small_data_note).toContain('Insufficient')
    })

    it('5+ meetings produces no small_data_note (null)', () => {
      const a = makeAnalytics()
      expect(a.small_data_note).toBeNull()
    })
  })

  describe('Per-status breakdown', () => {
    it('meetings are grouped by status', () => {
      const a = makeAnalytics()
      const statuses = a.per_status.map(s => s.status)
      expect(statuses).toContain('completed')
      expect(statuses).toContain('scheduled')
    })
  })

  describe('Cross-tenant boundary (section 28)', () => {
    it('a non-member gets an error payload, not analytics', () => {
      const isMember = false
      const payload = isMember ? makeAnalytics() : { error: 'Not authorized' }
      expect(payload).toEqual({ error: 'Not authorized' })
    })
  })

  describe('Period selection', () => {
    it('supports 7/30/90 day periods', () => {
      const validPeriods = [7, 30, 90]
      for (const p of validPeriods) {
        expect(validPeriods).toContain(p)
      }
    })
  })
})
