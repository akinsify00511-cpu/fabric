import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  fetchMeetingChat,
  sendMeetingChat,
  type MeetingChatMessage,
} from '../../lib/businessOS'
import { useAuth } from '../../lib/AuthContext'

interface Props {
  meetingId: string
  businessId: string
  onUnread?: (count: number) => void
  visible: boolean
}

/**
 * Native meeting chat (M2). Persists against meeting_chat_messages (never the
 * general-purpose chat tables). Rehydrates history on mount, delivers new
 * messages over postgres_changes realtime, and tracks an unread count while
 * the panel is not the active tab. Best-effort: degrades to an honest empty
 * state if the migration isn't deployed yet.
 */
export default function MeetingChatPanel({ meetingId, businessId, onUnread, visible }: Props) {
  const { staff } = useAuth()
  const [messages, setMessages] = useState<MeetingChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [available, setAvailable] = useState(true)
  const listRef = useRef<HTMLDivElement | null>(null)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await fetchMeetingChat(meetingId)
      if (cancelled) return
      const { error } = await supabase
        .from('meeting_chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('meeting_id', meetingId)
      if (cancelled) return
      if (error) {
        setAvailable(false)
        return
      }
      setMessages(rows)
      scrollToBottom()
    })()
    return () => {
      cancelled = true
    }
  }, [meetingId, scrollToBottom])

  useEffect(() => {
    const channel = supabase
      .channel(`meeting-chat:${meetingId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'meeting_chat_messages',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          const row = payload.new as MeetingChatMessage
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
          if (visibleRef.current) scrollToBottom()
          else onUnread?.(-1)
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [meetingId, onUnread, scrollToBottom])

  useEffect(() => {
    if (visible) {
      onUnread?.(0)
      scrollToBottom()
    }
  }, [visible, onUnread, scrollToBottom])

  const send = useCallback(async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const id = await sendMeetingChat(meetingId, body)
    setSending(false)
    if (!id) return
    setDraft('')
    setMessages((prev) =>
      prev.some((m) => m.id === id)
        ? prev
        : [
            ...prev,
            {
              id,
              meeting_id: meetingId,
              business_id: businessId,
              staff_id: staff?.id ?? null,
              guest_token: null,
              guest_name: null,
              body,
              created_at: new Date().toISOString(),
              edited_at: null,
            },
          ]
    )
    scrollToBottom()
  }, [draft, sending, meetingId, businessId, staff?.id, scrollToBottom])

  const senderName = (m: MeetingChatMessage) =>
    m.guest_name ?? (m.staff_id === staff?.id ? 'You' : 'Participant')

  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })

  if (!available) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-medium text-black/70">Meeting chat is not available yet</p>
          <p className="text-xs text-black/40 mt-1">
            The meeting chat service has not been enabled for this workspace.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-black/40">No messages yet. Start the conversation.</p>
        ) : (
          messages.map((m) => {
            const mine = m.staff_id != null && m.staff_id === staff?.id
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? 'bg-[var(--av-primary)] text-white' : 'bg-[var(--av-surface-2)] text-black'
                  }`}
                >
                  {!mine && (
                    <p className="text-[10px] font-semibold opacity-70 mb-0.5">{senderName(m)}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-black/35'}`}>
                    {timeLabel(m.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="p-3 border-t border-black/5 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={1}
          placeholder="Message this meeting…"
          className="flex-1 rounded-xl border border-black/10 p-2.5 text-sm resize-none"
        />
        <button
          onClick={() => void send()}
          disabled={!draft.trim() || sending}
          className="rounded-xl bg-[var(--av-primary)] text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}
