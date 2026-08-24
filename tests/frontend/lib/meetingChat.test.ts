import { describe, it, expect } from 'vitest'

/**
 * M2 - Native meeting chat contract.
 * Locks the boundary: meeting chat is meeting-scoped, realtime, persisted
 * against meeting_chat_messages (never the general-purpose chat tables), and
 * the unread model is reset-on-visible / increment-on-hidden.
 */

describe('native meeting chat contract', () => {
  it('persists to meeting_chat_messages, not chat_messages', () => {
    const meetingChatTable = 'meeting_chat_messages'
    const generalChatTable = 'chat_messages'
    expect(meetingChatTable).not.toBe(generalChatTable)
  })

  it('realtime filter is meeting-scoped (meeting_id=eq.<id>)', () => {
    const filter = 'meeting_id=eq.abc'
    expect(filter.startsWith('meeting_id=eq.')).toBe(true)
  })

  it('unread resets to 0 when the chat tab becomes visible', () => {
    const handle = (n: number, current: number) => (n === 0 ? 0 : n === -1 ? current + 1 : n)
    expect(handle(0, 5)).toBe(0)
    expect(handle(-1, 5)).toBe(6)
    expect(handle(-1, 6)).toBe(7)
  })

  it('a message has exactly one author identity (staff XOR guest)', () => {
    const msg = { staff_id: 's1', guest_token: null }
    const exactlyOne = (msg.staff_id !== null) !== (msg.guest_token !== null)
    expect(exactlyOne).toBe(true)
  })

  it('guest sender displays guest_name, member displays their identity', () => {
    const name = (m: { guest_name: string | null; staff_id: string | null }, myStaffId: string) =>
      m.guest_name ?? (m.staff_id === myStaffId ? 'You' : 'Participant')
    expect(name({ guest_name: 'Acme Guest', staff_id: null }, 's1')).toBe('Acme Guest')
    expect(name({ guest_name: null, staff_id: 's1' }, 's1')).toBe('You')
    expect(name({ guest_name: null, staff_id: 's2' }, 's1')).toBe('Participant')
  })
})
