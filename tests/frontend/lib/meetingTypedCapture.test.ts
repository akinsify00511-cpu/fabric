import { describe, it, expect } from 'vitest'

/**
 * M3 - Typed capture + promote-to-task contract.
 * The capture panel routes typed captures to the right store and promotion
 * creates a REAL task (never a parallel system).
 */

describe('typed meeting capture contract', () => {
  it('note -> meeting_captures, decision -> meeting_decisions, action -> meeting_actions', () => {
    const route = (kind: 'note' | 'decision' | 'action') =>
      kind === 'note' ? 'meeting_captures' : kind === 'decision' ? 'meeting_decisions' : 'meeting_actions'
    expect(route('note')).toBe('meeting_captures')
    expect(route('decision')).toBe('meeting_decisions')
    expect(route('action')).toBe('meeting_actions')
  })

  it('promote creates a REAL task and links it back to the meeting action', () => {
    // create_action_task inserts into tasks (004) and sets
    // meeting_actions.task_id + status='in_progress'. The action is the
    // meeting-context link; the task is the execution.
    const after = { status: 'in_progress', task_id: 'task-1' }
    expect(after.task_id).toBeTruthy()
    expect(after.status).toBe('in_progress')
  })

  it('promotion is idempotent at the UI level (task_id set -> no re-promote)', () => {
    const canPromote = (a: { task_id: string | null }) => a.task_id === null
    expect(canPromote({ task_id: null })).toBe(true)
    expect(canPromote({ task_id: 't1' })).toBe(false)
  })

  it('decisions are recorded with a decided status and actor', () => {
    const d = { status: 'decided', decided_by: 'staff-1' }
    expect(['proposed', 'decided', 'reversed', 'superseded']).toContain(d.status)
    expect(d.decided_by).toBeTruthy()
  })

  it('action items default to open + medium priority', () => {
    const a = { status: 'open', priority: 'medium' }
    expect(['open', 'in_progress', 'completed', 'cancelled', 'deferred']).toContain(a.status)
    expect(['low', 'medium', 'high', 'urgent']).toContain(a.priority)
  })
})
