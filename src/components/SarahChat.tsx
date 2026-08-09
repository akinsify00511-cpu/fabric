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

const SARAH_KNOWLEDGE = {
  greetings: [
    "Hello! I'm your Avenize help guide. I can point you to the right features. What are you looking for?",
    "Welcome! Need help finding a feature? Tell me what you're trying to do.",
    "Hi there! I'm your Avenize help guide. Ask me where to find anything in the app.",
  ],
  
  features: {
    crm: "Our CRM helps you manage leads, deals, and customer relationships. Track deals through stages (Prospect to Won/Lost) and keep all your contacts organized. Perfect for Nigerian businesses looking to close more deals.",
    tasks: "The Tasks feature lets you create, assign, and track tasks with priorities. Mark tasks as To Do, In Progress, or Done. Great for keeping your team aligned on what matters most.",
    people: "The People page is your HR hub. You can see all team members, invite new staff, manage roles, and track attendance. Everything you need to manage your Nigerian team.",
    projects: "Projects helps you organize and track work. Create projects, add tasks, and monitor progress all in one place. Supports field updates for teams working across Nigeria.",
    chat: "Our Chat feature lets your team communicate in real-time. No more scattered WhatsApp messages. Keep all business conversations organized and searchable.",
    calendar: "The Calendar keeps all your appointments and events in one place. Never miss a meeting again. Syncs across devices so you stay organized on the go.",
    reports: "Reports give you insights into your business performance. Track metrics, analyze trends, and make data-driven decisions. Available in real-time from your dashboard.",
    finance: "Finance helps you manage invoices, payments, and cash flow in Naira. Includes VAT and WHT tracking. Send professional invoices and get paid faster.",
    inventory: "Inventory management helps you track products, stock levels, and orders. Perfect for businesses with physical goods. Multi-location support for businesses across Nigeria.",
  },
  
  pricing: {
    free: "The Free plan includes: up to 5 team members, Basic CRM, Task management, and 50MB storage. Great for getting started with your business.",
    pro: "Pro plan (starting at ₦15,000/month for Starter, up to ₦380,000/month for Scale) unlocks: Unlimited team members, Advanced CRM and Analytics, Invoicing and Payments, Priority support, Custom branding, and API access.",
    trial: "You have a 7-day free trial to experience all features. No credit card required to start.",
  },
  
  onboarding: [
    "Welcome to Avenize! Here's how to get started:\n\n1. Go to CRM to add your first deals and contacts\n2. Check out Tasks to create your first task\n3. Invite your team from the People page\n4. Explore Finance to send your first invoice\n5. Check Reports to see your business insights\n\nLet me know if you have any questions!",
  ],
  
  help: [
    "I can help you with:\n\n- Finding the right feature for your task\n- Pricing and plan questions\n- Getting started with Avenize\n- Tips and best practices for Nigerian businesses\n\nJust let me know what you need!",
  ],

  unknown: "I'm not sure I understand that. I can help you find:\n\n- CRM, Tasks, People, Projects, Finance\n- Pricing and plans\n- Getting started\n\nWhat would you like to find?",
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
    return { text: SARAH_KNOWLEDGE.greetings[Math.floor(Math.random() * SARAH_KNOWLEDGE.greetings.length)], suggestions: [] }
  }
  
  if (/welcome|new user|first time|just signed|just started|getting started/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.onboarding[0], suggestions: findFeatureSuggestions(msg) }
  }

  if (/crm|deals|contacts|leads|pipeline|sales/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.features.crm, suggestions: [{ label: 'CRM', path: '/app/crm', description: 'Go to CRM' }] }
  }
  if (/task|todo|to-do/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.features.tasks, suggestions: [{ label: 'Tasks', path: '/app/tasks', description: 'Go to Tasks' }] }
  }
  if (/people|team|hr|staff|employee/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.features.people, suggestions: [{ label: 'People', path: '/app/people', description: 'Go to People' }] }
  }
  if (/project/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.features.projects, suggestions: [{ label: 'Projects', path: '/app/projects', description: 'Go to Projects' }] }
  }
  if (/chat|message|conversation/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.features.chat, suggestions: [{ label: 'Chat', path: '/app/chat', description: 'Go to Chat' }] }
  }
  if (/calendar|event|meeting|schedule/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.features.calendar, suggestions: [{ label: 'Calendar', path: '/app/calendar', description: 'Go to Calendar' }] }
  }
  if (/report|analytics|insight|metric|dashboard/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.features.reports, suggestions: [{ label: 'Reports', path: '/app/reports', description: 'Go to Reports' }] }
  }
  if (/finance|invoice|payment|money|cash|naira/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.features.finance, suggestions: [{ label: 'Finance', path: '/app/finance', description: 'Go to Finance' }] }
  }
  if (/inventory|stock|product/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.features.inventory, suggestions: [{ label: 'Inventory', path: '/app/inventory', description: 'Go to Inventory' }] }
  }
  
  if (/pricing|price|cost|how much|plan|subscription|naira/i.test(msg)) {
    if (/free|free plan/i.test(msg)) {
      return { text: SARAH_KNOWLEDGE.pricing.free, suggestions: [] }
    }
    if (/pro|premium|upgrade|paid/i.test(msg)) {
      return { text: SARAH_KNOWLEDGE.pricing.pro, suggestions: [] }
    }
    return { text: "Here's our pricing:\n\n" + SARAH_KNOWLEDGE.pricing.free + "\n\n" + SARAH_KNOWLEDGE.pricing.pro + "\n\n" + SARAH_KNOWLEDGE.pricing.trial, suggestions: [] }
  }
  
  if (/trial|free trial/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.pricing.trial, suggestions: [] }
  }
  
  if (/help|what can you do|how do i|how to|tutorial|guide/i.test(msg)) {
    return { text: SARAH_KNOWLEDGE.help[0], suggestions: [] }
  }
  
  if (/what.*new|new feature|update|what's new|recent/i.test(msg)) {
    return { text: "Here's what's new in Avenize:\n\n" + NEW_FEATURES.join('\n\n') + "\n\nIs there anything specific you'd like to know more about?", suggestions: [] }
  }
  
  if (/thank|thanks|appreciate/i.test(msg)) {
    return { text: "You're welcome! Is there anything else I can help you with?", suggestions: [] }
  }
  
  if (/bye|goodbye|see you|talk later/i.test(msg)) {
    return { text: "Goodbye! Feel free to come back if you have any questions. Have a great day!", suggestions: [] }
  }
  
  // Check for any feature-related keywords in the message
  const suggestions = findFeatureSuggestions(msg)
  if (suggestions.length > 0) {
    return { text: SARAH_KNOWLEDGE.unknown, suggestions }
  }
  
  return { text: SARAH_KNOWLEDGE.unknown, suggestions: [] }
}

export default function SarahChat() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: generateId(),
      role: 'assistant',
      content: SARAH_KNOWLEDGE.greetings[0],
      time: getTime()
    }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
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
    setIsTyping(true)

    setTimeout(() => {
      const { text, suggestions } = generateResponse(userMsg.content)
      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: text,
        time: getTime(),
        suggestions
      }
      setMessages(prev => [...prev, assistantMsg])
      setIsTyping(false)
    }, 800 + Math.random() * 500)
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
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#4285F4] to-[#8B5CF6] text-white flex items-center justify-center">
                    <HelpCircle size={16} />
                  </div>
                  <div className="bg-white rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
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
