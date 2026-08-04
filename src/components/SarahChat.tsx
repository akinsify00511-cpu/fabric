import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, Sparkles } from 'lucide-react'

const SARAH_KNOWLEDGE = {
  greetings: [
    "Hello! I'm Sarah, your Avenize assistant. How can I help you today?",
    "Welcome! I'm Sarah. What would you like to know about Avenize?",
    "Hi there! Great to see you. I'm Sarah. How can I assist you?",
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
    "I can help you with:\n\n- Feature explanations and how to use them\n- Pricing and plan questions\n- Getting started with Avenize\n- Troubleshooting common issues\n- Tips and best practices for Nigerian businesses\n\nJust let me know what you need!",
  ],

  unknown: "I'm not sure I understand that question. Could you try rephrasing it? I can help with:\n\n- CRM, Tasks, People, Projects, Finance\n- Pricing and plans\n- Getting started\n- Troubleshooting\n\nWhat would you like to know?",
}

const NEW_FEATURES = [
  "New in Avenize: AI-powered insights to help you make better decisions.",
  "New: Mobile-responsive design - use Avenize on any device.",
  "New: Custom dashboards - create views that work for you.",
  "New: Lightning-fast performance - pages load in milliseconds.",
  "New: Enhanced security with 2FA support.",
  "New: Improved invoicing with VAT and WHT built-in.",
]

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  time: string
}

function generateId() {
  return Math.random().toString(36).substring(2, 15)
}

function getTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function generateResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase()
  
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|howdy)/.test(msg)) {
    return SARAH_KNOWLEDGE.greetings[Math.floor(Math.random() * SARAH_KNOWLEDGE.greetings.length)]
  }
  
  if (/welcome|new user|first time|just signed|just started|getting started/i.test(msg)) {
    return SARAH_KNOWLEDGE.onboarding[0]
  }

  if (/crm|deals|contacts|leads|pipeline|sales/i.test(msg)) {
    return SARAH_KNOWLEDGE.features.crm
  }
  if (/task|todo|to-do/i.test(msg)) {
    return SARAH_KNOWLEDGE.features.tasks
  }
  if (/people|team|hr|staff|employee/i.test(msg)) {
    return SARAH_KNOWLEDGE.features.people
  }
  if (/project/i.test(msg)) {
    return SARAH_KNOWLEDGE.features.projects
  }
  if (/chat|message|conversation/i.test(msg)) {
    return SARAH_KNOWLEDGE.features.chat
  }
  if (/calendar|event|meeting|schedule/i.test(msg)) {
    return SARAH_KNOWLEDGE.features.calendar
  }
  if (/report|analytics|insight|metric|dashboard/i.test(msg)) {
    return SARAH_KNOWLEDGE.features.reports
  }
  if (/finance|invoice|payment|money|cash|naira/i.test(msg)) {
    return SARAH_KNOWLEDGE.features.finance
  }
  if (/inventory|stock|product/i.test(msg)) {
    return SARAH_KNOWLEDGE.features.inventory
  }
  
  if (/pricing|price|cost|how much|plan|subscription|naira/i.test(msg)) {
    if (/free|free plan/i.test(msg)) {
      return SARAH_KNOWLEDGE.pricing.free
    }
    if (/pro|premium|upgrade|paid/i.test(msg)) {
      return SARAH_KNOWLEDGE.pricing.pro
    }
    return "Here's our pricing:\n\n" + SARAH_KNOWLEDGE.pricing.free + "\n\n" + SARAH_KNOWLEDGE.pricing.pro + "\n\n" + SARAH_KNOWLEDGE.pricing.trial
  }
  
  if (/trial|free trial/i.test(msg)) {
    return SARAH_KNOWLEDGE.pricing.trial
  }
  
  if (/help|what can you do|how do i|how to|tutorial|guide/i.test(msg)) {
    return SARAH_KNOWLEDGE.help[0]
  }
  
  if (/what.*new|new feature|update|what's new|recent/i.test(msg)) {
    return "Here's what's new in Avenize:\n\n" + NEW_FEATURES.join('\n\n') + "\n\nIs there anything specific you'd like to know more about?"
  }
  
  if (/thank|thanks|appreciate/i.test(msg)) {
    return "You're welcome! Is there anything else I can help you with?"
  }
  
  if (/bye|goodbye|see you|talk later/i.test(msg)) {
    return "Goodbye! Feel free to come back if you have any questions. Have a great day!"
  }
  
  return SARAH_KNOWLEDGE.unknown
}

export default function SarahChat() {
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
      const response = generateResponse(userMsg.content)
      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: response,
        time: getTime()
      }
      setMessages(prev => [...prev, assistantMsg])
      setIsTyping(false)
    }, 800 + Math.random() * 500)
  }

  const handleQuickReply = (question: string) => {
    setInput(question)
    setTimeout(handleSend, 100)
  }

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 md:bottom-4 right-4 w-14 h-14 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 z-50 flex items-center justify-center"
        >
          <MessageCircle size={24} />
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
            <Sparkles size={10} />
          </span>
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-20 md:bottom-4 right-4 w-[calc(100vw-32px)] md:w-96 h-[70vh] md:h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Bot size={20} />
              </div>
              <div>
                <h3 className="font-bold">Sarah</h3>
                <p className="text-xs text-white/80">Avenize AI Assistant</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/20 rounded-full transition"
            >
              <X size={20} />
            </button>
          </div>

          <div className="bg-indigo-50 px-4 py-2 text-xs text-indigo-700 flex items-center gap-2">
            <Bot size={12} />
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
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white' 
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div>
                    <div className={`rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'assistant'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                    }`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 px-1">
                      {msg.role === 'assistant' ? 'Sarah' : 'You'} • {msg.time}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white flex items-center justify-center">
                    <Bot size={16} />
                  </div>
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
                className="shrink-0 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs rounded-full hover:bg-indigo-100 transition"
              >
                What's new?
              </button>
              <button
                onClick={() => handleQuickReply("Tell me about CRM")}
                className="shrink-0 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs rounded-full hover:bg-indigo-100 transition"
              >
                CRM features
              </button>
              <button
                onClick={() => handleQuickReply("How much does it cost?")}
                className="shrink-0 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs rounded-full hover:bg-indigo-100 transition"
              >
                Pricing
              </button>
              <button
                onClick={() => handleQuickReply("How do I get started?")}
                className="shrink-0 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs rounded-full hover:bg-indigo-100 transition"
              >
                Get started
              </button>
            </div>
          </div>

          <div className="p-4 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask Sarah anything..."
                className="flex-1 rounded-full bg-gray-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition"
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
