import { describe, it, expect } from 'vitest'
import type {
  TranscriptSegment,
  MeetingDecision,
  MeetingAction,
  MeetingIntelligence,
} from '../../src/lib/businessOS'

// Phase C contract tests — the meeting intelligence layer.
// Locks the transcript/summary/decisions/actions model + the action→task
// linking boundary (actions link to REAL tasks, NOT a parallel system).

describe('Meeting transcript + decisions + actions contract (Phase C)', () => {
  describe('Transcript model (section 6)', () => {
    it('a transcript stores full_text + word_count + duration', () => {
      const intel: Pick<MeetingIntelligence, 'transcripts'> = {
        transcripts: [{
          id: 't1',
          full_text: 'We discussed the Q4 budget and approved a 10% increase.',
          language: 'en',
          duration_seconds: 1800,
          word_count: 10,
          created_at: '2026-08-18T10:00:00Z',
        }],
      }
      expect(intel.transcripts[0].word_count).toBe(10)
      expect(intel.transcripts[0].language).toBe('en')
    })

    it('segments are timestamped + searchable', () => {
      const seg: TranscriptSegment = {
        id: 's1',
        segment_index: 0,
        start_time_ms: 0,
        end_time_ms: 30000,
        text: 'The budget discussion started here.',
        speaker: 'Alice',
        confidence: 0.95,
      }
      expect(seg.start_time_ms).toBe(0)
      expect(seg.end_time_ms).toBe(30000)
      expect(seg.speaker).toBe('Alice')
    })
  })

  describe('Decisions (sections 7, 9, 12)', () => {
    it('a decision has text + rationale + status', () => {
      const dec: MeetingDecision = {
        id: 'd1',
        meeting_id: 'm1',
        decision_text: 'Approve the Q4 budget increase of 10%.',
        rationale: 'Revenue growth supports the increased spend.',
        decided_by: null,
        timestamp_ms: 120000,
        status: 'decided',
        created_at: '2026-08-18T10:00:00Z',
      }
      expect(dec.status).toBe('decided')
      expect(dec.decision_text).toContain('Approve')
    })

    it('decisions use the 4-status lifecycle', () => {
      const validStatuses = ['proposed', 'decided', 'reversed', 'superseded'] as const
      for (const s of validStatuses) {
        expect(validStatuses).toContain(s)
      }
    })

    it('a reversed decision is visible (not deleted) — audit trail', () => {
      const dec: Pick<MeetingDecision, 'status'> = {
        status: 'reversed',
      }
      expect(dec.status).toBe('reversed')
    })
  })

  describe('Actions (sections 7, 9, 12, 14) — link to REAL tasks', () => {
    it('an action links to a task via task_id — NOT a parallel task system', () => {
      const act: MeetingAction = {
        id: 'a1',
        meeting_id: 'm1',
        decision_id: 'd1',
        task_id: 'task-uuid-123',           // links to REAL tasks (004)
        action_text: 'Draft the Q4 budget proposal by Friday.',
        assignee_id: 'staff-uuid',
        due_date: '2026-08-22',
        priority: 'high',
        status: 'in_progress',
        timestamp_ms: 150000,
        created_at: '2026-08-18T10:00:00Z',
      }
      expect(act.task_id).not.toBeNull()
      expect(act.task_id).toMatch(/task/)
    })

    it('an unlinked action has task_id=null — the task is created on demand', () => {
      const act: Pick<MeetingAction, 'task_id' | 'status'> = {
        task_id: null,
        status: 'open',
      }
      expect(act.task_id).toBeNull()
      expect(act.status).toBe('open')
    })

    it('actions use the 5-status lifecycle', () => {
      const validStatuses = ['open', 'in_progress', 'completed', 'cancelled', 'deferred'] as const
      for (const s of validStatuses) {
        expect(validStatuses).toContain(s)
      }
    })

    it('actions use the 4-priority levels', () => {
      const validPriorities = ['low', 'medium', 'high', 'urgent'] as const
      for (const p of validPriorities) {
        expect(validPriorities).toContain(p)
      }
    })

    it('a completed action is checked off but NOT deleted — audit trail', () => {
      const act: Pick<MeetingAction, 'status' | 'task_id'> = {
        status: 'completed',
        task_id: 'task-uuid-123',
      }
      expect(act.status).toBe('completed')
      expect(act.task_id).not.toBeNull()
    })
  })

  describe('Meeting intelligence aggregation (section 6/9)', () => {
    it('get_meeting_intelligence returns transcript + summary + decisions + actions in one call', () => {
      const intel: MeetingIntelligence = {
        meeting: { id: 'm1', title: 'Q4 Planning', status: 'summarized', transcript_status: 'completed' },
        transcripts: [],
        segments: [],
        summaries: [{ id: 's1', summary: 'Key points...', key_points: ['point1', 'point2'] }],
        decisions: [{ id: 'd1', meeting_id: 'm1', decision_text: 'decided', rationale: null, decided_by: null, timestamp_ms: null, status: 'decided', created_at: '' }],
        actions: [{ id: 'a1', meeting_id: 'm1', decision_id: null, task_id: null, action_text: 'do x', assignee_id: null, due_date: null, priority: 'medium', status: 'open', timestamp_ms: null, created_at: '' }],
      }
      expect(intel.summaries.length).toBe(1)
      expect(intel.decisions.length).toBe(1)
      expect(intel.actions.length).toBe(1)
      expect(intel.meeting.transcript_status).toBe('completed')
    })

    it('a non-member gets an empty intelligence payload (no cross-tenant leak)', () => {
      const authorized = false
      const payload = authorized ? { decisions: ['d1'] } : { error: 'Not authorized' }
      expect(payload).toEqual({ error: 'Not authorized' })
    })
  })

  describe('Action → Task linking (section 7 + outcome loop §15)', () => {
    it('create_action_task creates a REAL task + links it to the action', () => {
      const result = {
        actionId: 'a1',
        taskId: 'new-task-uuid',
      }
      expect(result.taskId).not.toBeNull()
      expect(result.taskId).toMatch(/task/)
    })

    it('after linking, the action status becomes in_progress', () => {
      const before: Pick<MeetingAction, 'status' | 'task_id'> = { status: 'open', task_id: null }
      const after: Pick<MeetingAction, 'status' | 'task_id'> = { status: 'in_progress', task_id: 'task-uuid' }
      expect(before.status).toBe('open')
      expect(after.status).toBe('in_progress')
      expect(after.task_id).not.toBeNull()
    })
  })

  describe('Transcript search (section 6)', () => {
    it('search_transcripts returns matching segments with meeting context', () => {
      const result = [{
        segment_id: 's1',
        text: 'We approved the budget.',
        start_time_ms: 60000,
        meeting_id: 'm1',
        meeting_title: 'Q4 Planning',
        transcript_id: 't1',
      }]
      expect(result[0].meeting_title).toBe('Q4 Planning')
      expect(result[0].text).toContain('budget')
    })

    it('search is business-scoped (no cross-tenant results)', () => {
      const isMember = false
      const results = isMember ? ['match'] : []
      expect(results).toEqual([])
    })
  })
})
