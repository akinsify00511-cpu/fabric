import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, Send, HelpCircle, User, Sparkles, ArrowRight, Lightbulb } from 'lucide-react'

// Feature suggestions based on context
const FEATURE_SUGGESTIONS: Record<string, { label: string; path: string; keywords: string[]; description: string }> = {
  crm: { label: 'CRM', path: '/app/crm', keywords: ['crm', 'leads', 'deals', 'contacts', 'pipeline', 'sales', 'customer'], description: 'Manage leads and deals' },
  tasks: { label: 'Tasks', path: '/app/tasks', keywords: ['task', 'todo', 'to-do', 'assignment', 'track'], description: 'Create and track tasks' },
  people: { label: 'People', path: '/app/people', keywords: ['people', 'team', 'staff', 'hr', 'employee', 'invite'], description: 'Manage your team' },
  projects: { label: 'Projects', path: '/app/projects', keywords: ['project', 'job', 'field work'], description: 'Track projects and jobs' },
  chat: { label: 'Chat', path: '/app/chat', keywords: ['chat', 'message', 'conversation', 'team chat'], description: 'Team messaging' },
  calendar: { label: 'Calendar', path: '/app/calendar', keywords: ['calendar', 'event', 'meeting', 'schedule', 'appointment'], description: 'Schedule events' },
  finance: { label: 'Finance', path: '/app/finance', keywords: ['invoice', 'payment', 'money', 'finance', 'cash flow', 'quote'], description: 'Invoicing & payments' },
  inventory: { label: 'Inventory', path: '/app/inventory', keywords: ['inventory', 'stock', 'product', 'item'], description: 'Track stock & products' },
  reports: { label: 'Reports', path: '/app/reports', keywords: ['report', 'analytics', 'insight', 'metric', 'dashboard', 'data'], description: 'View business insights' },
  social: { label: 'Social', path: '/app/social', keywords: ['social', 'post', 'marketing', 'campaign'], description: 'Social media management' },
  knowledge: { label: 'Knowledge', path: '/app/knowledge', keywords: ['knowledge', 'docs', 'documentation', 'wiki', 'guide'], description: 'Internal documentation' },
  automations: { label: 'Automations', path: '/app/automations', keywords: ['automation', 'workflow', 'automate', 'trigger', 'action', 'rule'], description: 'Set up workflows' },
  tickets: { label: 'Support', path: '/app/tickets', keywords: ['ticket', 'support', 'issue', 'problem', 'help'], description: 'Customer support' },
  branding: { label: 'Branding', path: '/app/branding', keywords: ['branding', 'logo', 'color', 'theme', 'customize'], description: 'Customize your brand' },
  settings: { label: 'Settings', path: '/app/settings', keywords: ['settings', 'config', 'preference', 'account'], description: 'App settings' },
  campaigns: { label: 'Campaigns', path: '/app/campaigns', keywords: ['campaign', 'email', 'marketing', 'send'], description: 'Email campaigns' },
  approvals: { label: 'Approvals', path: '/app/approvals', keywords: ['approval', 'approve', 'request', 'leave', 'expense'], description: 'Manage approvals' },
  payments: { label: 'Payments', path: '/app/payments', keywords: ['payment', 'paystack', 'transaction'], description: 'Payment tracking' },
  time: { label: 'Time Tracking', path: '/app/time', keywords: ['time', 'timer', 'hours', 'attendance', 'leave'], description: 'Track time & attendance' },
  events: { label: 'Events', path: '/app/events', keywords: ['event', 'conference', 'workshop'], description: 'Manage events' },
  requisitions: { label: 'Requisitions', path: '/app/requisitions', keywords: ['requisition', 'purchase', 'request item'], description: 'Purchase requests' },
}

function findFeatureSuggestions(message: string): Array<{ label: string; path: string; description: string }> {
  const msg = message.toLowerCase()
  const suggestions: Array<{ label: string; path: string; description: string }> = []
  
  for (const [key, feature] of Object.entries(FEATURE_SUGGESTIONS)) {
    for (const keyword of feature.keywords) {
      if (msg.includes(keyword) && !suggestions.find(s => s.label === feature.label)) {
        suggestions.push({ label: feature.label, path: feature.path, description: feature.description })
        break
      }
    }
  }
  
  return suggestions.slice(0, 3) // Max 3 suggestions
}

const HELP_KNOWLEDGE = {
  greetings: [
    "Avenize Help Guide. Search for a feature below, or describe what you're trying to do.",
    "Avenize Help Guide. Type a feature name or a task to find the right tool.",
  ],

  features: {
    crm: "CRM manages leads, deals, and customer relationships. Track deals through stages (Prospect to Won/Lost) and keep contacts organized.",
    tasks: "Tasks lets you create, assign, and track tasks with priorities. Mark tasks as To Do, In Progress, or Done.",
    people: "The People page is the HR hub. View team members, invite staff, manage roles, and track attendance.",
    projects: "Projects organizes and tracks work. Create projects, add tasks, and monitor progress. Supports field updates for teams across Nigeria.",
    chat: "Chat lets your team communicate in real-time. Keep business conversations organized and searchable instead of scattered across WhatsApp.",
    calendar: "The Calendar keeps appointments and events in one place. Syncs across devices.",
    reports: "Reports show business performance. Track metrics and analyze trends from the dashboard.",
    finance: "Finance manages invoices, payments, and cash flow in Naira. Includes VAT and WHT tracking.",
    inventory: "Inventory tracks products, stock levels, and orders. Multi-location support for businesses across Nigeria.",
  },

  pricing: {
    free: "The Free plan includes: up to 5 team members, Basic CRM, Task management, and 50MB storage.",
    pro: "Paid plans (₦15,000/month for Starter, up to ₦380,000/month for Scale) unlock: unlimited team members, advanced CRM and analytics, invoicing and payments, priority support, custom branding, and API access.",
    trial: "A 7-day free trial covers all features. No credit card required to start.",
  },

  onboarding: [
    "Getting started with Avenize:\n\n1. Go to CRM to add your first deals and contacts\n2. Use Tasks to create your first task\n3. Invite your team from the People page\n4. Open Finance to send your first invoice\n5. Check Reports to see business insights",
  ],

  help: [
    "This guide can help find:\n\n- The right feature for a task\n- Pricing and plan details\n- Getting started steps\n\nType a keyword or feature name.",
  ],

  unknown: "No match found. Try searching for a feature name:\n\n- CRM, Tasks, People, Projects, Finance\n- Pricing and plans\n- Getting started",
}

const NEW_FEATURES = [
  "New in Avenize: Custom dashboards - create views that work for you.",
  "New: Mobile-responsive design - use Avenize on any device.",
  "New: Lightning-fast performance - pages load in milliseconds.",
  "New: Enhanced security with 2FA support.",
  "New: Improved invoicing with VAT and WHT built-in.",
]

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  time: string
  suggestions?: Array<{ label: string; path: string; description: string }>
}

function generateId() {
  return Math.random().toString(36).substring(2, 15)
}

function getTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function generateResponse(userMessage: string): { text: string; suggestions: Array<{ label: string; path: string; description: string }> } {
  const msg = userMessage.toLowerCase()
  
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|howdy)/.test(msg)) {
    return { text: HELP_KNOWLEDGE.greetings[Math.floor(Math.random() * HELP_KNOWLEDGE.greetings.length)], suggestions: [] }
  }
  
  if (/welcome|new user|first time|just signed|just started|getting started/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.onboarding[0], suggestions: findFeatureSuggestions(msg) }
  }

  if (/crm|deals|contacts|leads|pipeline|sales/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.features.crm, suggestions: [{ label: 'CRM', path: '/app/crm', description: 'Go to CRM' }] }
  }
  if (/task|todo|to-do/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.features.tasks, suggestions: [{ label: 'Tasks', path: '/app/tasks', description: 'Go to Tasks' }] }
  }
  if (/people|team|hr|staff|employee/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.features.people, suggestions: [{ label: 'People', path: '/app/people', description: 'Go to People' }] }
  }
  if (/project/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.features.projects, suggestions: [{ label: 'Projects', path: '/app/projects', description: 'Go to Projects' }] }
  }
  if (/chat|message|conversation/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.features.chat, suggestions: [{ label: 'Chat', path: '/app/chat', description: 'Go to Chat' }] }
  }
  if (/calendar|event|meeting|schedule/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.features.calendar, suggestions: [{ label: 'Calendar', path: '/app/calendar', description: 'Go to Calendar' }] }
  }
  if (/report|analytics|insight|metric|dashboard/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.features.reports, suggestions: [{ label: 'Reports', path: '/app/reports', description: 'Go to Reports' }] }
  }
  if (/finance|invoice|payment|money|cash|naira/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.features.finance, suggestions: [{ label: 'Finance', path: '/app/finance', description: 'Go to Finance' }] }
  }
  if (/inventory|stock|product/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.features.inventory, suggestions: [{ label: 'Inventory', path: '/app/inventory', description: 'Go to Inventory' }] }
  }
  
  if (/pricing|price|cost|how much|plan|subscription|naira/i.test(msg)) {
    if (/free|free plan/i.test(msg)) {
      return { text: HELP_KNOWLEDGE.pricing.free, suggestions: [] }
    }
    if (/pro|premium|upgrade|paid/i.test(msg)) {
      return { text: HELP_KNOWLEDGE.pricing.pro, suggestions: [] }
    }
    return { text: "Here's our pricing:\n\n" + HELP_KNOWLEDGE.pricing.free + "\n\n" + HELP_KNOWLEDGE.pricing.pro + "\n\n" + HELP_KNOWLEDGE.pricing.trial, suggestions: [] }
  }
  
  if (/trial|free trial/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.pricing.trial, suggestions: [] }
  }
  
  if (/help|what can you do|how do i|how to|tutorial|guide/i.test(msg)) {
    return { text: HELP_KNOWLEDGE.help[0], suggestions: [] }
  }
  
  if (/what.*new|new feature|update|what's new|recent/i.test(msg)) {
    return { text: "What's new in Avenize:\n\n" + NEW_FEATURES.join('\n\n'), suggestions: [] }
  }
  
  if (/thank|thanks|appreciate/i.test(msg)) {
    return { text: "Glad that helped. Search for another feature anytime.", suggestions: [] }
  }
  
  if (/bye|goodbye|see you|talk later/i.test(msg)) {
    return { text: "Closing the help guide. Reopen it anytime to search again.", suggestions: [] }
  }
  
  // Check for any feature-related keywords in the message
  const suggestions = findFeatureSuggestions(msg)
  if (suggestions.length > 0) {
    return { text: HELP_KNOWLEDGE.unknown, suggestions }
  }
  
  return { text: HELP_KNOWLEDGE.unknown, suggestions: [] }
}

export default function SarahChat() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: generateId(),
      role: 'assistant',
      content: HELP_KNOWLEDGE.greetings[0],
      time: getTime()
    }
  ])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      time: getTime()
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')

    // Rule-based match returns instantly — no simulated "typing" delay that
    // would imply a human is composing the reply (humanwashing).
    const { text, suggestions } = generateResponse(userMsg.content)
    const assistantMsg: Message = {
      id: generateId(),
      role: 'assistant',
      content: text,
      time: getTime(),
      suggestions
    }
    setMessages(prev => [...prev, assistantMsg])
  }

  const handleQuickReply = (question: string) => {
    setInput(question)
    setTimeout(handleSend, 100)
  }

  const handleSuggestionClick = (path: string) => {
    navigate(path)
    setIsOpen(false)
  }

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open help guide"
          className="fixed bottom-20 md:bottom-4 right-4 w-14 h-14 rounded-full bg-gradient-to-r from-[#4285F4] to-[#8B5CF6] text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 z-50 flex items-center justify-center"
        >
          <MessageCircle size={24} />
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
            <Sparkles size={10} />
          </span>
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-20 md:bottom-4 right-4 w-[calc(100vw-32px)] md:w-96 h-[70vh] md:h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-black overflow-hidden">
          <div className="bg-gradient-to-r from-[#4285F4] to-[#8B5CF6] text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <HelpCircle size={20} />
              </div>
              <div>
                <h3 className="font-bold">Help Guide</h3>
                <p className="text-xs text-white/80">Avenize Help Guide</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/20 rounded-full transition"
            >
              <X size={20} />
            </button>
          </div>

          <div className="bg-[#4285F4]/5 px-4 py-2 text-xs text-[#4285F4] flex items-center gap-2">
            <HelpCircle size={12} />
            <span>Ask me anything about Avenize features, pricing, or how to get started.</span>
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
                      ? 'bg-gradient-to-r from-[#4285F4] to-[#8B5CF6] text-white' 
                      : 'bg-white text-black'
                  }`}>
                    {msg.role === 'assistant' ? <HelpCircle size={16} /> : <User size={16} />}
                  </div>
                  <div>
                    <div className={`rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'assistant'
                        ? 'bg-white text-black'
                        : 'bg-gradient-to-r from-[#4285F4] to-[#8B5CF6] text-white'
                    }`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                    
                    {/* Feature Suggestions */}
                    {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] text-[#4285F4] font-medium px-1 flex items-center gap-1">
                          <Lightbulb size={10} />
                          Suggested features:
                        </p>
                        {msg.suggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSuggestionClick(suggestion.path)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[#4285F4]/5 hover:bg-[#4285F4]/10 text-[#4285F4] text-xs rounded-lg transition w-full text-left"
                          >
                            <span className="font-medium">{suggestion.label}</span>
                            <span className="text-[#4285F4]">-</span>
                            <span>{suggestion.description}</span>
                            <ArrowRight size={12} className="ml-auto shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                    
                    <p className="text-[10px] text-black mt-1 px-1">
                      {msg.role === 'assistant' ? 'Guide' : 'You'} • {msg.time}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => handleQuickReply("What are the new features?")}
                className="shrink-0 px-3 py-1.5 bg-[#4285F4]/5 text-[#4285F4] text-xs rounded-full hover:bg-[#4285F4]/10 transition"
              >
                What's new?
              </button>
              <button
                onClick={() => handleQuickReply("Tell me about CRM")}
                className="shrink-0 px-3 py-1.5 bg-[#4285F4]/5 text-[#4285F4] text-xs rounded-full hover:bg-[#4285F4]/10 transition"
              >
                CRM features
              </button>
              <button
                onClick={() => handleQuickReply("How much does it cost?")}
                className="shrink-0 px-3 py-1.5 bg-[#4285F4]/5 text-[#4285F4] text-xs rounded-full hover:bg-[#4285F4]/10 transition"
              >
                Pricing
              </button>
              <button
                onClick={() => handleQuickReply("How do I get started?")}
                className="shrink-0 px-3 py-1.5 bg-[#4285F4]/5 text-[#4285F4] text-xs rounded-full hover:bg-[#4285F4]/10 transition"
              >
                Get started
              </button>
            </div>
          </div>

          <div className="p-4 border-t border-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask for help finding a feature..."
                className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4285F4]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-[#4285F4] to-[#8B5CF6] text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition"
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
