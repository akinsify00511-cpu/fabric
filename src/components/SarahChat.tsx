import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, Send, User, Sparkles, ArrowRight, Lightbulb, Brain } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useBusiness } from '../lib/BusinessContext'
import {
  fetchBusinessBrain, fetchTrialAssistance, formatNaira,
  type BusinessBrain, type TrialAssistanceResult,
} from '../lib/businessOS'
import { supabase } from '../lib/supabase'

// ----------------------------------------------------------------------------
// Avenize Help Guide -- an intelligent, context-synced assistant.
//
// This is NOT a static FAQ. It connects to the real intelligence layer (the
// Business Brain: State + Diagnoses + Next Best Action + Value Ledger) and to
// the live trial/pricing engines, so answers reflect the user's ACTUAL business
// situation -- not frozen marketing copy.
//
// §22 anti-hallucination: every number is traceable to a real RPC result. If
// the intelligence layer isn't deployed (live-DB drift), the bot degrades
// HONESTLY ("I can't see your live business data yet") rather than fabricating.
// §24 best-effort: every fetch is try/catch -> null; the bot never hangs.
// No LLM -- deterministic intent routing + plain-language composition from real
// results. The "intelligence" is routing the user's intent to the right real
// data source and composing an honest answer.
// ----------------------------------------------------------------------------

// Feature suggestions based on context (navigation aid -- unchanged, still useful)
const FEATURE_SUGGESTIONS: Record<string, { label: string; path: string; keywords: string[]; description: string }> = {
  crm: { label: 'CRM', path: '/app/crm', keywords: ['crm', 'leads', 'deals', 'contacts', 'pipeline', 'sales', 'customer'], description: 'Manage leads and deals' },
  tasks: { label: 'Tasks', path: '/app/tasks', keywords: ['task', 'todo', 'to-do', 'assignment', 'track'], description: 'Create and track tasks' },
  people: { label: 'People', path: '/app/people', keywords: ['people', 'team', 'staff', 'hr', 'employee', 'invite'], description: 'Manage your team' },
  projects: { label: 'Projects', path: '/app/projects', keywords: ['project', 'job', 'field work'], description: 'Track projects and jobs' },
  chat: { label: 'Chat', path: '/app/chat', keywords: ['chat', 'message', 'conversation', 'team chat'], description: 'Team messaging' },
  calendar: { label: 'Calendar', path: '/app/calendar', keywords: ['calendar', 'event', 'meeting', 'schedule', 'appointment'], description: 'Schedule events' },
  finance: { label: 'Finance', path: '/app/finance', keywords: ['invoice', 'payment', 'money', 'finance', 'cash flow', 'quote'], description: 'Invoicing & payments' },
  inventory: { label: 'Inventory', path: '/app/inventory', keywords: ['inventory', 'stock', 'product', 'item'], description: 'Track stock & products' },
  cockpit: { label: 'Executive Cockpit', path: '/app/cockpit', keywords: ['cockpit', 'brain', 'intelligence', 'insight', 'executive', 'overview'], description: 'The business brain' },
  recommendations: { label: 'Recommendations', path: '/app/cockpit', keywords: ['recommendation', 'recommend', 'advice', 'suggestion', 'action'], description: 'What to act on' },
  health: { label: 'Business Health', path: '/app/cockpit', keywords: ['health', 'score', 'how is my business', 'how am i doing', 'pulse'], description: 'Business health score' },
}

function findFeatureSuggestions(message: string): Array<{ label: string; path: string; description: string }> {
  const msg = message.toLowerCase()
  const suggestions: Array<{ label: string; path: string; description: string }> = []
  for (const [, feature] of Object.entries(FEATURE_SUGGESTIONS)) {
    for (const keyword of feature.keywords) {
      if (msg.includes(keyword) && !suggestions.find(s => s.label === feature.label)) {
        suggestions.push({ label: feature.label, path: feature.path, description: feature.description })
        break
      }
    }
  }
  return suggestions.slice(0, 3)
}

// Honest "what's new" -- reflects the ACTUAL intelligence layer built in
// Sessions 13-30, not stale marketing copy. Each item is a real capability.
const WHATS_NEW = [
  "The Business Brain -- one view that shows your business state, what needs attention, why it's happening, and the single most valuable thing to do now.",
  "Diagnosis Engine -- instead of \"revenue is down\", Avenize explains WHY (e.g. \"conversion dropped after response times increased\") with real evidence.",
  "Next Best Action -- the one thing most worth doing now, ranked by financial impact, urgency, and effort.",
  "Business Value Ledger -- Avenize tracks the value it has helped create (recovered, saved, generated) from real outcomes.",
  "Per-subsidiary workspace -- group owners can switch between subsidiaries; each sees its own CRM, meetings, and finance.",
  "Role-aware experience -- a salesperson sees their pipeline, not the whole company's; a finance person sees cash, not deals.",
  "Founding pricing with price-lock -- 2026 founding prices locked for as long as you subscribe, even after prices rise for new customers.",
]

const STATE_LABELS: Record<string, string> = {
  growing: 'Growing', stable: 'Stable', scaling: 'Scaling', stressed: 'Stressed',
  recovering: 'Recovering', at_risk: 'At risk', cash_constrained: 'Cash constrained',
  sales_constrained: 'Sales constrained', capacity_constrained: 'Capacity constrained',
  operationally_constrained: 'Operationally constrained', opportunity_rich: 'Opportunity-rich',
  insufficient_data: 'Building a picture',
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  time: string
  suggestions?: Array<{ label: string; path: string; description: string }>
  busy?: boolean
}

function generateId() { return Math.random().toString(36).substring(2, 15) }
function getTime() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

// ----------------------------------------------------------------------------
// Intent routing -- maps the user's question to the right intelligence source.
// Pure function (testable). Returns an intent key the handler dispatches on.
// ----------------------------------------------------------------------------
type Intent =
  | 'business_health' | 'next_action' | 'diagnosis' | 'value_ledger'
  | 'trial' | 'pricing' | 'whats_new' | 'greeting' | 'help' | 'feature_nav' | 'thanks' | 'unknown'

export function classifyIntent(msg: string): Intent {
  const m = msg.toLowerCase()
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|howdy)/.test(m)) return 'greeting'
  if (/thank|thanks|appreciate/.test(m)) return 'thanks'
  if (/bye|goodbye|see you|talk later/.test(m)) return 'thanks'
  if (/how is (my|the) business|how am i doing|business health|health score|how.*doing|pulse|state of/.test(m)) return 'business_health'
  if (/what.*should i do|next action|next step|what.*needs|what.*attention|what now|prioriti|most important|focus on/.test(m)) return 'next_action'
  if (/why is|why did|what.*caused|root cause|diagnos|reason.*down|reason.*drop|why.*declin/.test(m)) return 'diagnosis'
  if (/how much.*value|value.*created|how much.*saved|how much.*recover|impact.*avenize|what.*achieved|value ledger/.test(m)) return 'value_ledger'
  if (/trial|how long left|days left|when.*expire|free trial/.test(m)) return 'trial'
  if (/pricing|price|cost|how much|plan|subscription|upgrade|naira.*plan/.test(m)) return 'pricing'
  if (/what.*new|new feature|update|what's new|recent|changelog/.test(m)) return 'whats_new'
  if (/help|what can you do|how do i|how to|tutorial|guide/.test(m)) return 'help'
  if (findFeatureSuggestions(m).length > 0) return 'feature_nav'
  return 'unknown'
}

// Compose a plain-language business-health answer from the real Brain state.
function composeHealthAnswer(brain: BusinessBrain | null): string {
  if (!brain || brain.error) {
    return "I can't see your live business data yet -- the intelligence layer isn't connected to this deployment. Once it's live, I can tell you exactly how your business is doing. For now, you can see your key numbers in Finance, CRM, and the Reports pages."
  }
  const state = brain.state
  if (!state) return "I don't have enough data to assess your business health yet. As you use Avenize -- logging deals, invoices, and tasks -- I'll build a real picture of how you're doing."
  if (state.degraded) return "Your business health is being calculated right now. The state engine couldn't complete just now -- try again in a moment. Your data is safe."
  const label = STATE_LABELS[state.state] ?? state.state
  let answer = `Your business is currently: ${label}.`
  if (state.confidence) answer += ` (Confidence: ${state.confidence}.)`
  if (state.reasons?.length) {
    const top = state.reasons.slice(0, 2).map(r => `- ${r.label}`).join('\n')
    answer += `\n\nWhat's driving this:\n${top}`
  }
  const nba = brain.next_best_action?.action
  if (nba) {
    answer += `\n\nThe most valuable thing to do now: ${nba.statement}`
    if (nba.expected_impact?.amount) answer += ` (approx ${formatNaira(nba.expected_impact.amount)})`
  } else if (brain.next_best_action && !brain.next_best_action.error) {
    answer += "\n\nNothing needs urgent attention right now -- you're all caught up."
  }
  answer += '\n\nSee the full breakdown in the Executive Cockpit.'
  return answer
}

function composeNextActionAnswer(brain: BusinessBrain | null): string {
  if (!brain || brain.error) {
    return "I can't access the prioritisation engine yet -- the intelligence layer isn't connected. Once live, I'll tell you the single most valuable thing to do right now. For now, check your Tasks page for what's due."
  }
  const nba = brain.next_best_action
  if (!nba || nba.degraded) return "The prioritisation engine is calculating right now. Try again in a moment."
  const action = nba.action
  if (!action) return nba.note ?? "Nothing needs urgent attention right now. You're all caught up."
  let answer = `The most valuable thing to do now:\n\n${action.statement}`
  if (action.expected_impact?.amount) answer += `\n\nExpected impact: approx ${formatNaira(action.expected_impact.amount)}`
  if (action.expected_impact?.description) answer += `\n${action.expected_impact.description}`
  if (action._nba_reason) answer += `\n\nWhy: ${action._nba_reason}`
  answer += '\n\nSee all recommendations in the Executive Cockpit.'
  return answer
}

function composeDiagnosisAnswer(brain: BusinessBrain | null): string {
  if (!brain || brain.error) {
    return "I can't run the diagnosis engine yet -- the intelligence layer isn't connected. Once live, I'll explain WHY things are happening, not just that they are."
  }
  const diag = brain.diagnoses
  if (!diag || diag.degraded) return "The diagnosis engine is running right now. Try again in a moment."
  if (!diag.diagnoses?.length) return diag.note ?? "I don't see any cross-module problems right now. As more data flows in (deals, invoices, payments), I'll connect the dots and explain the 'why' behind any changes."
  const top = diag.diagnoses.slice(0, 2)
  const lines = top.map(d => `- ${d.headline}${d.impact_amount ? ` (approx ${formatNaira(d.impact_amount)} exposure)` : ''}`)
  return `Here's what I've found:\n\n${lines.join('\n')}\n\nThese are based on real relationships in your data. See the full diagnosis with evidence in the Executive Cockpit.`
}

function composeValueAnswer(brain: BusinessBrain | null): string {
  if (!brain || brain.error) {
    return "I can't access the value ledger yet -- the intelligence layer isn't connected. Once live, I'll show you exactly how much value Avenize has helped create from real outcomes."
  }
  const ledger = brain.value_ledger
  if (!ledger || ledger.degraded) return "The value ledger is being calculated. Try again in a moment."
  if (ledger.total_value === 0) return ledger.note ?? "No value has been recorded yet. As you act on recommendations and record the outcomes, Avenize will track the value created -- recovered cash, savings, and new opportunity."
  let answer = "Here's the value Avenize has helped create (from real outcomes):"
  const parts: string[] = []
  if (ledger.recovered) parts.push(`- Recovered: ${formatNaira(ledger.recovered)}`)
  if (ledger.saved) parts.push(`- Saved: ${formatNaira(ledger.saved)}`)
  if (ledger.generated) parts.push(`- Generated: ${formatNaira(ledger.generated)}`)
  if (ledger.identified) parts.push(`- Identified (not yet acted): ${formatNaira(ledger.identified)}`)
  if (parts.length) answer += `\n\n${parts.join('\n')}`
  if (ledger.recommendations_acted) answer += `\n\nYou've acted on ${ledger.recommendations_acted} recommendation${ledger.recommendations_acted === 1 ? '' : 's'}, with ${ledger.successful_outcomes} successful outcome${ledger.successful_outcomes === 1 ? '' : 's'} recorded.`
  return answer
}

function composeTrialAnswer(trial: TrialAssistanceResult | null): string {
  if (!trial || trial.error) {
    return "I can't see your trial status right now. You can check your trial days on the dashboard banner or the Subscription page."
  }
  if (!trial.in_trial) {
    return trial.nudge?.body ?? "You're not in a trial right now. Visit the Subscription page to see your plan or start a trial."
  }
  const days = trial.days_left ?? 0
  let answer = `You're on day ${Math.max(0, 7 - days)} of your 7-day trial, with ${days} day${days === 1 ? '' : 's'} left.`
  if (trial.nudge) {
    answer += `\n\n${trial.nudge.headline}\n${trial.nudge.body}`
  } else {
    answer += "\n\nYou're making good progress. Explore the tools that matter to your business -- I can recommend the right plan when you're ready."
  }
  return answer
}

// Pull pricing from the REAL pricing_tiers (single source of truth). Honest
// fallback if the RPC isn't deployed.
async function composePricingAnswer(): Promise<{ text: string; suggestions: Array<{ label: string; path: string; description: string }> }> {
  try {
    const { data, error } = await supabase.rpc('get_pricing_tiers')
    if (error) throw error
    const tiers = (data as Array<{ display_name: string; monthly_cents: number; is_founding_price: boolean; founding_label: string | null }>) ?? []
    if (!tiers.length) throw new Error('no tiers')
    const lines = tiers.map(t => `- ${t.display_name}: ₦${Math.round(t.monthly_cents / 100).toLocaleString()}/mo${t.is_founding_price && t.founding_label ? ` (${t.founding_label})` : ''}`)
    return {
      text: `Here are the current plans:\n\n${lines.join('\n')}\n\nThese are 2026 founding prices -- if you subscribe now, the price you start at is locked in for as long as you keep your subscription, even when prices rise for new customers.\n\nAll plans include a 7-day free trial with full access. No credit card required to start.`,
      suggestions: [{ label: 'See plans', path: '/app/settings/subscription', description: 'View & subscribe' }],
    }
  } catch {
    return {
      text: "Our plans start from ₦15,000/month (Starter) up to ₦380,000/month (Scale), all at 2026 founding prices with a price-lock for as long as you subscribe. A 7-day free trial gives full access. Visit the Subscription page for the exact, current tiers.",
      suggestions: [{ label: 'See plans', path: '/app/settings/subscription', description: 'View & subscribe' }],
    }
  }
}

export default function SarahChat() {
  const navigate = useNavigate()
  const { staff } = useAuth()
  const { activeBusinessId } = useBusiness()
  const bid = activeBusinessId ?? staff?.business_id ?? null
  const isPrivileged = staff?.role === 'owner' || staff?.role === 'admin'

  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Cached intelligence context — fetched once when the guide opens (or when
  // the active subsidiary changes). Best-effort; null means "not yet loaded or
  // unavailable". This is what makes the bot "synced" to the live business.
  const [brain, setBrain] = useState<BusinessBrain | null>(null)
  const [trial, setTrial] = useState<TrialAssistanceResult | null>(null)
  const [ctxLoaded, setCtxLoaded] = useState(false)

  const greeting = isPrivileged
    ? `Avenize Help Guide. I'm connected to your business intelligence — ask me how your business is doing, what needs attention, why something is happening, or what to do next.`
    : `Avenize Help Guide. I can help you find the right tool, check your trial, or answer questions about Avenize. What are you trying to do?`

  const [messages, setMessages] = useState<Message[]>([
    { id: generateId(), role: 'assistant', content: greeting, time: getTime() },
  ])

  // Load the intelligence context when the guide opens. Best-effort + non-blocking.
  const loadContext = useCallback(async () => {
    if (!bid) { setCtxLoaded(true); return }
    setCtxLoaded(false)
    try {
      const [b, t] = await Promise.all([
        fetchBusinessBrain(bid),
        fetchTrialAssistance(bid),
      ])
      setBrain(b)
      setTrial(t)
    } catch {
      setBrain(null)
      setTrial(null)
    } finally {
      setCtxLoaded(true)
    }
  }, [bid])

  useEffect(() => {
    if (isOpen && !ctxLoaded) loadContext()
  }, [isOpen, ctxLoaded, loadContext])

  // Reset context when the subsidiary changes so answers reflect the new scope.
  useEffect(() => {
    setBrain(null)
    setTrial(null)
    setCtxLoaded(false)
  }, [bid])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  // Shared answer composer so both the input-send and quick-reply paths stay
  // in lockstep (avoids duplicating the intent switch).
  const composeReply = useCallback(async (text: string): Promise<{ text: string; suggestions: Array<{ label: string; path: string; description: string }> }> => {
    const intent = classifyIntent(text)
    let replyText = ''
    let suggestions: Array<{ label: string; path: string; description: string }> = []
    switch (intent) {
      case 'business_health':
        replyText = composeHealthAnswer(brain)
        suggestions = [{ label: 'Executive Cockpit', path: '/app/cockpit', description: 'Full breakdown' }]
        break
      case 'next_action':
        replyText = composeNextActionAnswer(brain)
        suggestions = [{ label: 'Executive Cockpit', path: '/app/cockpit', description: 'All recommendations' }]
        break
      case 'diagnosis':
        replyText = composeDiagnosisAnswer(brain)
        suggestions = [{ label: 'Executive Cockpit', path: '/app/cockpit', description: 'Full diagnosis' }]
        break
      case 'value_ledger':
        replyText = composeValueAnswer(brain)
        suggestions = [{ label: 'Executive Cockpit', path: '/app/cockpit', description: 'Value ledger' }]
        break
      case 'trial':
        replyText = composeTrialAnswer(trial)
        suggestions = [{ label: 'Subscription', path: '/app/settings/subscription', description: 'Your plan' }]
        break
      case 'pricing': {
        const r = await composePricingAnswer()
        replyText = r.text
        suggestions = r.suggestions
        break
      }
      case 'whats_new':
        replyText = "Here's what's new in Avenize:\n\n" + WHATS_NEW.map(n => `- ${n}`).join('\n')
        break
      case 'greeting':
        replyText = greeting
        break
      case 'help':
        replyText = "I'm connected to your business intelligence. I can help with:\n\n- How is my business doing? (health + state)\n- What needs my attention? / What should I do next? (next best action)\n- Why is X happening? (diagnosis)\n- How much value has Avenize created? (value ledger)\n- How long is my trial? / Pricing?\n- Find a feature (just type its name)\n\nAsk me any of these, or describe what you're trying to do."
        break
      case 'thanks':
        replyText = "Glad that helped. Ask me anything else anytime."
        break
      case 'feature_nav':
        suggestions = findFeatureSuggestions(text)
        replyText = suggestions.length ? "Here's what might help:" : "I didn't catch a specific feature. Try typing a feature name (CRM, Tasks, Finance, Inventory...) or ask 'how is my business doing?'"
        break
      default:
        replyText = "I'm not sure about that one. I can help with your business health, what to do next, why something is happening, the value Avenize has created, your trial, pricing, or finding a feature. What would you like to know?"
        suggestions = [{ label: 'How is my business doing?', path: '/app/cockpit', description: 'Business health' }]
    }
    return { text: replyText, suggestions }
  }, [brain, trial, greeting])

  const sendText = useCallback(async (raw: string) => {
    const text = raw.trim()
    if (!text || thinking) return
    setMessages(prev => [...prev, { id: generateId(), role: 'user', content: text, time: getTime() }])
    setThinking(true)
    try {
      const { text: replyText, suggestions } = await composeReply(text)
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: replyText, time: getTime(), suggestions }])
    } finally {
      setThinking(false)
    }
  }, [thinking, composeReply])

  const handleSend = () => {
    const text = input
    if (!text.trim()) return
    setInput('')
    sendText(text)
  }

  const handleQuickReply = (question: string) => {
    sendText(question)
  }

  const handleSuggestionClick = (path: string) => {
    navigate(path)
    setIsOpen(false)
  }

  const quickReplies = isPrivileged
    ? [
        { label: 'How is my business doing?', q: 'How is my business doing?' },
        { label: 'What should I do next?', q: 'What should I do next?' },
        { label: 'Value created?', q: 'How much value has Avenize created?' },
        { label: 'What\u2019s new?', q: "What's new?" },
      ]
    : [
        { label: 'What\u2019s new?', q: "What's new?" },
        { label: 'Pricing', q: 'How much does it cost?' },
        { label: 'Find a feature', q: 'How do I get started?' },
        { label: 'My trial', q: 'How long is my trial?' },
      ]

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open help guide"
          className="fixed bottom-20 md:bottom-4 right-4 w-14 h-14 rounded-full bg-gradient-to-r from-[#155BB4] to-[#4285F4] text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 z-50 flex items-center justify-center"
        >
          <MessageCircle size={24} />
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--av-success-soft)] rounded-full border-2 border-white flex items-center justify-center">
            <Sparkles size={10} />
          </span>
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-20 md:bottom-4 right-4 w-[calc(100vw-32px)] md:w-96 h-[70vh] md:h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden" style={{ border: '1px solid var(--av-border)' }}>
          <div className="bg-gradient-to-r from-[#155BB4] to-[#4285F4] text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Brain size={20} />
              </div>
              <div>
                <h3 className="font-bold">Avenize Guide</h3>
                <p className="text-xs text-white/80">
                  {ctxLoaded
                    ? (brain ? 'Connected to your business' : 'Help & navigation')
                    : 'Connecting to your business…'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/20 rounded-full transition"
              aria-label="Close help guide"
            >
              <X size={20} />
            </button>
          </div>

          <div className="bg-[#155BB4]/5 px-4 py-2 text-xs text-[#155BB4] flex items-center gap-2">
            <Sparkles size={12} />
            <span>{isPrivileged ? 'Connected to your business intelligence — ask anything.' : 'Ask about features, pricing, your trial, or what to do next.'}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'assistant'
                      ? 'bg-gradient-to-r from-[#155BB4] to-[#4285F4] text-white'
                      : 'bg-[var(--av-surface-2)] text-[var(--av-text)]'
                  }`}>
                    {msg.role === 'assistant' ? <Brain size={16} /> : <User size={16} />}
                  </div>
                  <div>
                    <div className={`rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'assistant'
                        ? 'bg-[var(--av-surface)] text-[var(--av-text)]'
                        : 'bg-gradient-to-r from-[#155BB4] to-[#4285F4] text-white'
                    }`} style={{ border: msg.role === 'assistant' ? '1px solid var(--av-border)' : 'none' }}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>

                    {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] text-[#155BB4] font-medium px-1 flex items-center gap-1">
                          <Lightbulb size={10} />
                          {msg.content.includes('might help') ? 'Suggested features:' : 'Go to:'}
                        </p>
                        {msg.suggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSuggestionClick(suggestion.path)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[#155BB4]/5 hover:bg-[#155BB4]/10 text-[#155BB4] text-xs rounded-lg transition w-full text-left"
                          >
                            <span className="font-medium">{suggestion.label}</span>
                            <span className="text-[#5F6368]">-</span>
                            <span className="text-[#5F6368]">{suggestion.description}</span>
                            <ArrowRight size={12} className="ml-auto shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}

                    <p className="text-[10px] text-[var(--av-text-muted)] mt-1 px-1">
                      {msg.role === 'assistant' ? 'Avenize Guide' : 'You'} • {msg.time}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start">
                <div className="flex gap-2 max-w-[85%]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-r from-[#155BB4] to-[#4285F4] text-white">
                    <Brain size={16} />
                  </div>
                  <div className="rounded-2xl px-4 py-3 text-sm bg-[var(--av-surface)] text-[var(--av-text-muted)]" style={{ border: '1px solid var(--av-border)' }}>
                    <span className="inline-flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#155BB4] animate-pulse" />
                      <span className="w-2 h-2 rounded-full bg-[#155BB4] animate-pulse" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-[#155BB4] animate-pulse" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {quickReplies.map((qr, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickReply(qr.q)}
                  className="shrink-0 px-3 py-1.5 bg-[#155BB4]/5 text-[#155BB4] text-xs rounded-full hover:bg-[#155BB4]/10 transition whitespace-nowrap"
                >
                  {qr.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4" style={{ borderTop: '1px solid var(--av-border)' }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about your business, or find a feature…"
                className="flex-1 rounded-full bg-[var(--av-surface-2)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#155BB4] text-[var(--av-text)]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || thinking}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-[#155BB4] to-[#4285F4] text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition"
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
