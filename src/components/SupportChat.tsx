import { useState, useRef, useEffect } from 'react'
import { X, Send, MessageCircle, Phone, Mail, ExternalLink, ChevronDown, ChevronUp, Check, Clock } from 'lucide-react'

type Message = {
  id: string
  text: string
  sender: 'user' | 'support'
  timestamp: Date
  status?: 'sent' | 'delivered' | 'read'
}

type QuickTopic = {
  title: string
  icon: string
  response: string
}

const QUICK_TOPICS: QuickTopic[] = [
  {
    title: 'Bug Report',
    icon: 'bug',
    response: 'We take bugs seriously. Please describe the issue you encountered, including what you were trying to do and what happened instead. Screenshots help!',
  },
  {
    title: 'Feature Request',
    icon: 'lightbulb',
    response: 'Great to hear you have ideas! Please describe the feature you would like to see, how it would help your workflow, and any specific use cases you have in mind.',
  },
  {
    title: 'Account Issue',
    icon: 'user',
    response: 'Let us know what account issue you are experiencing. Include your email and what you were trying to do.',
  },
  {
    title: 'Billing Question',
    icon: 'credit-card',
    response: 'For billing questions, please include your account email and specific question about your subscription or invoice.',
  },
  {
    title: 'Integration Help',
    icon: 'plug',
    response: 'Need help with an integration? Tell us which integration you are trying to set up and what you have tried so far.',
  },
]

const SUPPORT_INFO = {
  team: 'Avenize Support',
  availability: 'Mon-Fri, 9am-6pm WAT',
  responseTime: 'Usually within 2 hours',
  email: 'support@avenize.com',
  phone: '+234 800 AVENIZE',
}

export default function SupportChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: `Hi there! I'm from ${SUPPORT_INFO.team}. How can I help you today?`,
      sender: 'support',
      timestamp: new Date(),
      status: 'read',
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [showTopics, setShowTopics] = useState(true)
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!inputValue.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
      status: 'sent',
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setShowTopics(false)

    // Simulate typing indicator
    setIsTyping(true)
    
    // Simulate response after delay
    setTimeout(() => {
      setIsTyping(false)
      
      const supportResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: `Thank you for reaching out! I received your message about "${inputValue.substring(0, 50)}${inputValue.length > 50 ? '...' : ''}". A member of our team will follow up shortly. In the meantime, feel free to add more details below.`,
        sender: 'support',
        timestamp: new Date(),
        status: 'delivered',
      }
      
      setMessages((prev) => [...prev, supportResponse])
    }, 2000)
  }

  const handleQuickTopic = (topic: QuickTopic) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text: `I need help with: ${topic.title}`,
      sender: 'user',
      timestamp: new Date(),
      status: 'sent',
    }

    setMessages((prev) => [...prev, userMessage])
    setShowTopics(false)

    setTimeout(() => {
      const supportResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: topic.response,
        sender: 'support',
        timestamp: new Date(),
        status: 'delivered',
      }
      
      setMessages((prev) => [...prev, supportResponse])
    }, 1500)
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all hover:scale-105 flex items-center justify-center z-50"
        aria-label="Open support chat"
      >
        <MessageCircle size={24} />
        
        {/* Notification dot */}
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
      </button>
    )
  }

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 flex items-center gap-3 z-50"
      >
        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
          <MessageCircle size={20} className="text-indigo-600" />
        </div>
        <div className="text-left">
          <p className="font-semibold text-slate-900 text-sm">Avenize Support</p>
          <p className="text-xs text-slate-500">Click to expand</p>
        </div>
        <ChevronUp size={20} className="text-slate-400" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
      {/* Header */}
      <div className="bg-indigo-600 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <MessageCircle size={20} />
            </div>
            <div>
              <h3 className="font-semibold">{SUPPORT_INFO.team}</h3>
              <p className="text-xs text-indigo-200 flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Usually replies in {SUPPORT_INFO.responseTime}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ChevronDown size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="h-80 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : 'bg-white text-slate-800 rounded-bl-md shadow-sm border border-slate-200'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.text}</p>
              <div
                className={`flex items-center gap-1 mt-1 ${
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <span
                  className={`text-xs ${
                    message.sender === 'user' ? 'text-indigo-200' : 'text-slate-400'
                  }`}
                >
                  {formatTime(message.timestamp)}
                </span>
                {message.sender === 'user' && (
                  <span className="text-indigo-200">
                    {message.status === 'read' ? (
                      <Check size={14} className="fill-current" />
                    ) : (
                      <Check size={14} />
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white text-slate-800 rounded-2xl rounded-bl-md shadow-sm border border-slate-200 px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Topics */}
      {showTopics && (
        <div className="px-4 pb-2 bg-slate-50">
          <p className="text-xs text-slate-500 mb-2">Quick topics:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_TOPICS.slice(0, 3).map((topic) => (
              <button
                key={topic.title}
                onClick={() => handleQuickTopic(topic)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
              >
                {topic.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
        
        {/* Contact options */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <a
            href={`mailto:${SUPPORT_INFO.email}`}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600"
          >
            <Mail size={14} />
            Email us
          </a>
          <a
            href="tel:+2348002836493"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600"
          >
            <Phone size={14} />
            Call support
          </a>
          <a
            href="https://avenize.com/help"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600"
          >
            Help Center
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={() => setIsOpen(false)}
        className="absolute top-3 right-3 p-1 text-white/80 hover:text-white transition-colors"
      >
        <X size={20} />
      </button>
    </div>
  )
}
