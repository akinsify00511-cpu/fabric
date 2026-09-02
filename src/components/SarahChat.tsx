import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, Send, Loader2, Sparkles, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggestions?: Array<{ label: string; path: string }>
}

export type SarahIntent =
  | 'business_health' | 'next_action' | 'diagnosis' | 'value_ledger'
  | 'trial' | 'pricing' | 'whats_new' | 'greeting' | 'help'
  | 'feature_nav' | 'thanks' | 'unknown'

/** Pure compatibility router for Sarah's client-side intent contract. */
export function classifyIntent(input: string): SarahIntent {
  const q = input.trim().toLowerCase()
  if (!q) return 'unknown'

  if (/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(q)) return 'greeting'
  if (/\b(thanks|thank you|bye|goodbye|see you)\b/.test(q)) return 'thanks'
  if (/\b(help|what can you do|how do i use|how can i use)\b/.test(q)) return 'help'

  if (/\b(what'?s new|new features?|recent updates?|latest updates?|recent changes?)\b/.test(q)) return 'whats_new'
  if (/\b(pric(e|ing)|cost|plans?|upgrade|subscription)\b/.test(q)) return 'pricing'
  if (/\b(trial|days? left|expire|expiration)\b/.test(q)) return 'trial'

  if (/\b(how much value|how much have we saved|how much did we recover|what has avenize achieved|value (has|have) avenize)\b/.test(q)) return 'value_ledger'
  if (/\b(why|what caused|root cause|cause of|reason (for|why))\b/.test(q)) return 'diagnosis'
  if (/\b(what should i do|what do i do|what needs my attention|most important|what should i focus|focus on right now|next step|what next)\b/.test(q)) return 'next_action'
  if (/\b(how is my business|how am i doing|state of my business|business health|health score|my pulse)\b/.test(q)) return 'business_health'

  if (/\b(crm|sales|customer|customers|tasks?|inventory|meetings?|calendar|finance|invoice|invoices|payments?|cash|chat)\b/.test(q)) return 'feature_nav'

  return 'unknown'
}

const STARTERS = [
  'How is my business doing?',
  'What should I focus on right now?',
  'What is putting revenue at risk?',
  'Which customers or invoices need my attention?',
]

const ROUTES: Record<string, string> = {
  crm: '/app/crm', sales: '/app/crm', customer: '/app/crm',
  invoice: '/app/finance', payment: '/app/finance', cash: '/app/finance',
  task: '/app/tasks', meeting: '/app/meetings', calendar: '/app/calendar',
  chat: '/app/chat', finance: '/app/finance',
}

function suggestionsFor(question: string) {
  const q = question.toLowerCase()
  const found: Array<{ label: string; path: string }> = []
  for (const [key, path] of Object.entries(ROUTES)) {
    if (q.includes(key) && !found.some(s => s.path === path)) found.push({ label: path.split('/').pop()!.replace(/-/g, ' '), path })
  }
  return found.slice(0, 3)
}

export default function SarahChat() {
  const { staff } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!staff?.user_id) return
    let cancelled = false
    const load = async () => {
      const { data } = await supabase.from('copilot_messages').select('id,role,content').eq('user_id', staff.user_id).order('created_at', { ascending: false }).limit(20)
      if (!cancelled && data) setMessages(data.reverse().map((m: any) => ({ id: m.id, role: m.role, content: m.content })))
      if (!cancelled) setHistoryLoaded(true)
    }
    void load()
    return () => { cancelled = true }
  }, [staff?.user_id])

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending, open])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || sending) return
    setInput('')
    setSending(true)
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: q }])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Session expired')
      const base = import.meta.env.VITE_SUPABASE_URL as string
      const response = await fetch(`${base}/functions/v1/ask-avenize`, {
        method: 'POST',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: q }),
      })
      let data: any = {}
      try { data = await response.json() } catch { /* handled below */ }
      if (!response.ok || data?.error) throw new Error(data?.error || `Sarah request failed (${response.status})`)
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.answer, suggestions: suggestionsFor(q) }])
    } catch (error) {
      console.error('[sarah]', error)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I could not reach the live Avenize intelligence service right now. Your business data is safe. Please try again in a moment.',
      }])
    } finally { setSending(false) }
  }

  return <>
    {open && <div className="fixed inset-0 z-[70] bg-black/10 md:bg-transparent" onClick={() => setOpen(false)} />}
    {open && <section className="fixed z-[80] right-4 bottom-20 w-[min(420px,calc(100vw-2rem))] h-[min(680px,calc(100vh-7rem))] rounded-2xl bg-[var(--av-surface-elevated)] border border-[var(--av-border)] shadow-2xl overflow-hidden flex flex-col" role="dialog" aria-label="Sarah assistant">
      <header className="px-4 py-3 border-b border-[var(--av-border)] flex items-center justify-between">
        <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--av-gradient)' }}><Sparkles size={18} className="text-white" /></div><div><p className="font-semibold text-sm text-[var(--av-text)]">Sarah</p><p className="text-[10px] text-[var(--av-text-muted)]">Your Avenize business intelligence assistant</p></div></div>
        <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-[var(--av-surface-2)] text-[var(--av-text-muted)]" aria-label="Close Sarah"><X size={18} /></button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && historyLoaded && <div className="h-full flex flex-col justify-center items-center text-center gap-4"><Sparkles size={28} className="text-[var(--av-primary)]" /><div><p className="font-medium text-sm text-[var(--av-text)]">Tell Sarah what is happening in your business.</p><p className="text-xs text-[var(--av-text-muted)] mt-1">She is here to help you make sense of your live business data — and work through the next step with you.</p></div><div className="flex flex-wrap justify-center gap-2">{STARTERS.map(s => <button key={s} onClick={() => void ask(s)} className="text-xs px-3 py-2 rounded-full border border-[var(--av-border)] text-[var(--av-text)] hover:border-[var(--av-primary)]">{s}</button>)}</div></div>}
        {messages.map(m => <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-sm ${m.role === 'user' ? 'text-white' : 'text-[var(--av-text)] bg-[var(--av-surface-2)]'}`} style={m.role === 'user' ? { background: 'var(--av-gradient)' } : undefined}><p className="whitespace-pre-wrap">{m.content}</p>{m.suggestions?.length ? <div className="mt-2 pt-2 border-t border-[var(--av-border)] flex flex-wrap gap-1.5">{m.suggestions.map(s => <button key={s.path} onClick={() => { setOpen(false); navigate(s.path) }} className="text-[10px] px-2 py-1 rounded-full border border-[var(--av-border)] hover:border-[var(--av-primary)] capitalize inline-flex items-center gap-1">{s.label}<ArrowRight size={10} /></button>)}</div> : null}</div></div>)}
        {sending && <div className="flex justify-start"><div className="rounded-2xl px-3.5 py-3 bg-[var(--av-surface-2)] flex items-center gap-2 text-xs text-[var(--av-text-muted)]"><Loader2 size={14} className="animate-spin text-[var(--av-primary)]" /> Sarah is looking into that with you…</div></div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={e => { e.preventDefault(); void ask(input) }} className="p-3 border-t border-[var(--av-border)] flex gap-2"><input value={input} onChange={e => setInput(e.target.value)} maxLength={2000} placeholder="Tell Sarah what's on your mind…" className="flex-1 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface)] px-3 py-2.5 text-sm text-[var(--av-text)] focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /><button type="submit" disabled={!input.trim() || sending} className="rounded-xl px-3 py-2.5 text-white disabled:opacity-40" style={{ background: 'var(--av-gradient)' }} aria-label="Send to Sarah">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button></form>
    </section>}
    <button onClick={() => setOpen(v => !v)} className="fixed z-[75] right-4 bottom-4 w-12 h-12 rounded-full text-white shadow-lg flex items-center justify-center" style={{ background: 'var(--av-gradient)' }} aria-label={open ? 'Close Sarah' : 'Open Sarah'}><MessageCircle size={21} /></button>
  </>
}
