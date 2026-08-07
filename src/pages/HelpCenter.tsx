import { Link } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Mail, Phone, HelpCircle, Book, Video, FileText, ExternalLink } from 'lucide-react'

const FAQ_ITEMS = [
  {
    q: "Do I need an IT person to set this up?",
    a: "No. Setup is a 30-minute conversational flow — tell us what you do, how many staff, what you sell, and it's ready. No configuration, no consultants, unlike the ERPs that need three months to stand up."
  },
  {
    q: "What if my field staff have bad internet on site?",
    a: "Job updates and photos are captured offline and sync automatically once signal returns. Critical alerts can fall back to SMS. It's built for the network you actually have, not the one a demo assumes."
  },
  {
    q: "Does this replace my accountant?",
    a: "No — and it won't pretend to. We track invoicing, payments, VAT and WHT, and export cleanly to your accounting software. Your accountant still files; we just make sure they're working from real numbers."
  },
  {
    q: "My team uses chat apps. Won't they just ignore this?",
    a: "Department groups, photo sharing, and one-tap task creation are designed to feel as fast as your current tools — but every message links back to a real job, invoice, or stock item instead of disappearing into a chat history nobody can search."
  },
  {
    q: "What happens to my price after the first year?",
    a: "Nothing, if you stay subscribed. Founding-rate customers keep their rate for as long as they remain active — list price only applies to new signups after the founding period ends."
  },
]

const HELP_RESOURCES = [
  {
    icon: Book,
    title: 'Knowledge Base',
    description: 'Step-by-step guides for every feature',
    link: '/app/knowledge'
  },
  {
    icon: Video,
    title: 'Video Tutorials',
    description: 'Watch how to get the most out of Avenize',
    link: '/app/knowledge'
  },
  {
    icon: FileText,
    title: 'API Documentation',
    description: 'Technical docs for integrations',
    link: '/app/api'
  },
]

export default function HelpCenter() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-gray-900 hover:text-gray-900 text-sm">
            <ArrowLeft size={16} />
            Back to Avenize
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 mb-6">
            <HelpCircle className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            How can we help you?
          </h1>
          <p className="text-lg text-gray-900 mb-8">
            Find answers to common questions, or get in touch with our team.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-2">{item.q}</h3>
                <p className="text-gray-900">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            More Resources
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {HELP_RESOURCES.map((resource, i) => {
              const Icon = resource.icon
              return (
                <Link
                  key={i}
                  to={resource.link}
                  className="bg-white rounded-xl p-6 border border-gray-200 hover:border-indigo-300 hover:shadow-md transition group"
                >
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-4 group-hover:bg-indigo-100 transition">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{resource.title}</h3>
                  <p className="text-sm text-gray-900">{resource.description}</p>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-16 px-4 bg-indigo-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Still need help?
          </h2>
          <p className="text-indigo-100 mb-8">
            Our team is here to help you get up and running.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-indigo-50 transition"
            >
              <Mail size={18} />
              Contact Support
            </Link>
            <a
              href="mailto:hello@avenize.com"
              className="inline-flex items-center gap-2 px-6 py-3 border-2 border-white text-white font-semibold rounded-lg hover:bg-gray-300 transition"
            >
              <Phone size={18} />
              hello@avenize.com
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-gray-900">
        <div className="max-w-4xl mx-auto text-center text-gray-900 text-sm">
          <p>&copy; {new Date().getFullYear()} Avenize. All rights reserved.</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Link to="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link to="/terms" className="hover:text-gray-900">Terms</Link>
            <Link to="/cookies" className="hover:text-gray-900">Cookies</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
