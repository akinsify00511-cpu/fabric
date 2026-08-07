import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, Phone, MapPin, Clock, MessageSquare, Users, HelpCircle, Bug, Lightbulb, Send, CheckCircle } from 'lucide-react'

type ContactType = 'general' | 'support' | 'sales' | 'feedback' | 'bug'

export default function Contact() {
  const [contactType, setContactType] = useState<ContactType>('general')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSubmitted(true)
    setLoading(false)
  }

  const contactOptions = [
    { id: 'general' as const, icon: Mail, label: 'General Inquiry', desc: 'Questions about Avenize' },
    { id: 'support' as const, icon: MessageSquare, label: 'Technical Support', desc: 'Get help with the platform' },
    { id: 'sales' as const, icon: Users, label: 'Sales', desc: 'Talk to our sales team' },
    { id: 'feedback' as const, icon: Lightbulb, label: 'Feedback', desc: 'Share your ideas' },
    { id: 'bug' as const, icon: Bug, label: 'Report a Bug', desc: 'Help us improve' },
  ]

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-black hover:text-indigo-600 transition">
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </Link>
          <h1 className="text-lg font-semibold text-black">Contact Us</h1>
          <div className="w-20"></div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {submitted ? (
          // Success State
          <div className="bg-white rounded-2xl border border-black/5 p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-black mb-2">Message Sent!</h2>
            <p className="text-black mb-6 max-w-md mx-auto">
              Thank you for contacting us. Our team will get back to you within 24 hours.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => {
                  setSubmitted(false)
                  setName('')
                  setEmail('')
                  setSubject('')
                  setMessage('')
                }}
                className="px-6 py-3 bg-[var(--av-text)] text-white rounded-xl font-medium hover:bg-black/90 transition"
              >
                Send Another Message
              </button>
              <Link
                to="/"
                className="px-6 py-3 bg-white border border-black/10 text-black rounded-xl font-medium hover:bg-black/10 transition"
              >
                Back to Home
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Contact Options */}
            <div className="lg:col-span-1">
              <h2 className="text-xl font-bold text-black mb-4">How can we help?</h2>
              <div className="space-y-2">
                {contactOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setContactType(option.id)}
                    className={`w-full text-left p-4 rounded-xl transition ${
                      contactType === option.id
                        ? 'bg-indigo-50 border-2 border-indigo-500'
                        : 'bg-white border border-black/5 hover:border-black/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <option.icon className={`w-5 h-5 ${contactType === option.id ? 'text-indigo-600' : 'text-black'}`} />
                      <div>
                        <p className="font-medium text-black">{option.label}</p>
                        <p className="text-xs text-black">{option.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Contact Info */}
              <div className="mt-8 space-y-4">
                <div className="bg-white rounded-xl border border-black/5 p-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-5 h-5 text-black" />
                    <div>
                      <p className="text-black">Email</p>
                      <a href="mailto:hello@avenize.com" className="text-indigo-600 hover:underline">hello@avenize.com</a>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-black/5 p-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-5 h-5 text-black" />
                    <div>
                      <p className="text-black">Phone</p>
                      <a href="tel:+14155551234" className="text-indigo-600 hover:underline">(415) 555-1234</a>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-black/5 p-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-5 h-5 text-black" />
                    <div>
                      <p className="text-black">Support Hours</p>
                      <p className="text-black">Mon-Fri, 9am-6pm PST</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-black/5 p-4">
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-5 h-5 text-black" />
                    <div>
                      <p className="text-black">Address</p>
                      <p className="text-black">San Francisco, CA</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl border border-black/5 p-8">
                <h2 className="text-xl font-bold text-black mb-6">
                  {contactOptions.find(o => o.id === contactType)?.label}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-black mb-1">Name</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-black mb-1">Email</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-black mb-1">Subject</label>
                    <input
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                      placeholder="Brief description"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-black mb-1">Message</label>
                    <textarea
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition resize-none"
                      placeholder="Tell us how we can help..."
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full sm:w-auto px-8 py-3 bg-[var(--av-text)] text-white rounded-xl font-medium hover:bg-black/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send size={18} />
                        Send Message
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* FAQ Link */}
              <div className="mt-6 bg-indigo-50 rounded-2xl p-6 flex items-start gap-4">
                <HelpCircle className="w-6 h-6 text-indigo-600 shrink-0" />
                <div>
                  <h3 className="font-semibold text-black mb-1">Need quick answers?</h3>
                  <p className="text-sm text-black mb-3">
                    Check our Help Center for guides, tutorials, and frequently asked questions.
                  </p>
                  <Link
                    to="/knowledge"
                    className="inline-flex items-center gap-1 text-sm text-indigo-600 font-medium hover:text-indigo-700"
                  >
                    Visit Help Center →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
