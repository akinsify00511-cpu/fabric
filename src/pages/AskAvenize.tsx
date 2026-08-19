import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Loader2, Database, BrainCircuit, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  provider?: 'deterministic' | 'openai' | 'anthropic'
  sources?: string[]
  confidence?: string
}

const SUGGESTIONS = [
  'How is my business doing?',
  'What should I focus on right now?',
  'How much revenue have we made?',
  'Do we have overdue invoices?',
]

const PROVIDER_BADGE: Record<string, { label: string; icon: typeof Database }> = {
  deterministic: { label: 'Answered from your live data', icon: Database },
  openai: { label: 'AI reasoning over your data', icon: BrainCircuit },
  anthropic: { label: 'AI reasoning over your data', icon: BrainCircuit },
}

export default function AskAvenize() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!staff?.business_id) return
    // Load recent conversation history (own business, RLS-scoped).
    supabase
      .from('copilot_messages')
      .select('role, content, provider, sources')
      .eq('user_id', staff.user_id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setMessages(
            data.reverse().map((m: any) => ({
              role: m.role,
              content: m.content,
              provider: m.provider ?? undefined,
              sources: m.sources ?? undefined,
            })),
          )
        }
        setHistoryLoaded(true)
      })
  }, [staff?.business_id, staff?.user_id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || sending) return
    setInput('')
    setSending(true)
    setMessages((m) => [...m, { role: 'user', content: q }])
    try {
      const { data, error } = await supabase.functions.invoke('ask-avenize', {
        body: { question: q },
      })
      if (error || data?.error) {
        showToast(data?.error || 'Could not get an answer right now.', 'error')
        setMessages((m) => m.slice(0, -1))
        return
      }
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.answer, provider: data.provider, sources: data.sources, confidence: data.confidence },
      ])
    } catch (e) {
      console.error('[ask-avenize]', e)
      showToast('Could not get an answer right now.', 'error')
      setMessages((m) => m.slice(0, -1))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2 text-[var(--av-text)]">
            <Sparkles size={20} className="text-[var(--av-primary)]" /> Ask Avenize
          </h1>
          <p className="text-sm text-[var(--av-text-muted)] mt-1">
            Ask about your business — answers come from your real data, never invented numbers.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="p-2 rounded-lg text-[var(--av-text-muted)] hover:bg-[var(--av-surface-2)]"
            title="Clear view"
          >
            <RotateCcw size={16} />
          </button>
        )}
      </div>

      <div className="av-card flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && historyLoaded && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-8">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--av-gradient)' }}
            >
              <Sparkles size={22} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--av-text)]">Your first question</p>
              <p className="text-xs text-[var(--av-text-muted)] mt-1 max-w-sm">
                Avenize reads your live business data before answering. Try one of these to start the conversation.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="text-xs px-3 py-2 rounded-full border border-[var(--av-border)] text-[var(--av-text)] hover:border-[var(--av-primary)] hover:text-[var(--av-primary)] transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                m.role === 'user'
                  ? 'bg-[var(--av-primary)] text-white'
                  : 'bg-[var(--av-surface-2)] text-[var(--av-text)]'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'assistant' && m.provider && PROVIDER_BADGE[m.provider] && (
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[var(--av-border)]">
                  {(() => { const BadgeIcon = PROVIDER_BADGE[m.provider].icon; return <BadgeIcon size={11} className="text-[var(--av-text-muted)]" /> })()}
                  <span className="text-[10px] text-[var(--av-text-muted)]">{PROVIDER_BADGE[m.provider].label}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-[var(--av-surface-2)] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-[var(--av-primary)]" />
              <span className="text-xs text-[var(--av-text-muted)]">Reading your business data…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about revenue, cash, priorities…"
          className="flex-1 rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm bg-[var(--av-surface-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-xl px-4 py-3 text-white disabled:opacity-50"
          style={{ background: 'var(--av-gradient)' }}
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  )
}
