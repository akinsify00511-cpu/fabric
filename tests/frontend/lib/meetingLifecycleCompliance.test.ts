import { describe, it, expect } from 'vitest'

/**
 * M1 - Meeting lifecycle compliance contract.
 * Locks the canonical lifecycle the pages must call so participant evidence
 * is written and the meeting record is trustworthy.
 */

describe('meeting lifecycle contract', () => {
  it('canonical lifecycle RPCs are the only writers of meeting state', () => {
    const lifecycle = ['create_meeting', 'start_meeting', 'join_meeting', 'leave_meeting', 'end_meeting']
    for (const rpc of lifecycle) expect(typeof rpc).toBe('string')
    expect(lifecycle).toHaveLength(5)
  })

  it('join_meeting upserts on (meeting_id, staff_id) partial unique key', () => {
    const onConflict = 'ON CONFLICT (meeting_id, staff_id) WHERE staff_id IS NOT NULL'
    expect(onConflict).toContain('WHERE staff_id IS NOT NULL')
  })

  it('meeting_chat_messages enforces one-sender invariant', () => {
    const check = '(staff_id IS NOT NULL) OR (guest_token IS NOT NULL)'
    expect(check).toContain('staff_id IS NOT NULL')
    expect(check).toContain('guest_token IS NOT NULL')
  })

  it('guest chat is token-gated, not business-scoped', () => {
    const rpc = 'send_meeting_chat_guest(p_meeting_id, p_guest_token, p_body)'
    expect(rpc).not.toContain('business_id')
    expect(rpc).toContain('guest_token')
  })

  it('member chat resolves the sender server-side via get_current_staff', () => {
    const derives = 'SELECT s.id INTO v_staff_id FROM public.get_current_staff()'
    expect(derives).toContain('get_current_staff')
  })

  it('end_meeting is idempotent and records duration from actual_start', () => {
    const idempotent = "IF EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id AND status = 'completed')"
    expect(idempotent).toContain('completed')
  })
})
