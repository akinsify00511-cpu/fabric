// SMS Broadcast Page
// Send bulk SMS campaigns to customers and staff

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import { TermiiSMS } from '../lib/smsService'
import {
  MessageSquare, Send, Users, Search, Filter, CheckCircle2,
  XCircle, Clock, Loader2, ChevronDown, User, Building2, Phone
} from 'lucide-react'

interface SMSLog {
  id: string
  recipient: string
  message: string
  message_id: string | null
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  error_message: string | null
  channel: string | null
  created_at: string
}

interface Contact {
  id: string
  name: string
  phone: string
  email?: string
  type: 'client' | 'staff'
}

interface SMSTemplate {
  id: string
  name: string
  content: string
}

const QUICK_TEMPLATES = [
  { name: 'Welcome', content: 'Welcome to {business}! We\'re excited to have you on board.' },
  { name: 'Appointment Reminder', content: 'Hi {name}, this is a reminder about your appointment on {date} at {time}.' },
  { name: 'Payment Due', content: 'Hi {name}, your payment of {amount} is due on {date}. Please contact us if you have any questions.' },
  { name: 'Thank You', content: 'Thank you for choosing {business}! We appreciate your business.' },
  { name: 'Promotion', content: 'Hi {name}! Don\'t miss out on our exclusive offer: {offer}. Valid until {expiry}.' },
]

export default function SMSBroadcastPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState<'compose' | 'history' | 'contacts'>('compose')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [templates, setTemplates] = useState<SMSTemplate[]>([])
  const [smsLogs, setSmsLogs] = useState<SMSLog[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // Compose state
  const [message, setMessage] = useState('')
  const [recipients, setRecipients] = useState<Contact[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [recipientType, setRecipientType] = useState<'all' | 'clients' | 'staff'>('all')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [characterCount, setCharacterCount] = useState(0)
  const [smsCount, setSmsCount] = useState(1)

  const canManage = staff ? hasPermission(staff.role || 'staff', 'settings', 'manage') : false

  useEffect(() => {
    if (staff?.business_id) {
      fetchContacts()
      fetchTemplates()
      fetchHistory()
    }
  }, [staff?.business_id])

  useEffect(() => {
    // Calculate SMS count based on message length (160 chars per SMS)
    const count = Math.ceil(message.length / 160)
    setCharacterCount(message.length)
    setSmsCount(count > 0 ? count : 1)
  }, [message])

  async function fetchContacts() {
    if (!staff?.business_id) return

    try {
      setLoading(true)

      // Fetch clients
      const { data: clients } = await supabase
        .from('clients')
        .select('id, business_name, phone, email')
        .eq('business_id', staff.business_id)
        .not('phone', 'is', null)

      const clientContacts: Contact[] = (clients || []).map(c => ({
        id: c.id,
        name: c.business_name || 'Unknown',
        phone: c.phone || '',
        email: c.email,
        type: 'client' as const,
      }))

      // Fetch staff
      const { data: staffMembers } = await supabase
        .from('staff')
        .select('id, full_name, phone, email')
        .eq('business_id', staff.business_id)
        .not('phone', 'is', null)

      const staffContacts: Contact[] = (staffMembers || []).map(s => ({
        id: s.id,
        name: s.full_name || 'Unknown',
        phone: s.phone || '',
        email: s.email,
        type: 'staff' as const,
      }))

      setContacts([...clientContacts, ...staffContacts])
    } catch (error) {
      console.error('Error fetching contacts:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTemplates() {
    if (!staff?.business_id) return

    try {
      const { data } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('name')

      if (data) setTemplates(data)
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

  async function fetchHistory() {
    if (!staff?.business_id) return

    try {
      const { data } = await supabase
        .from('sms_logs')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
        .limit(100)

      setSmsLogs(data || [])
    } catch (error) {
      console.error('Error fetching SMS history:', error)
    }
  }

  // Filter contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      if (recipientType !== 'all' && contact.type !== recipientType) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          contact.name.toLowerCase().includes(query) ||
          contact.phone.includes(query) ||
          contact.email?.toLowerCase().includes(query)
        )
      }
      return true
    })
  }, [contacts, searchQuery, recipientType])

  function toggleRecipient(contact: Contact) {
    setRecipients(prev => {
      const exists = prev.find(r => r.id === contact.id)
      if (exists) {
        return prev.filter(r => r.id !== contact.id)
      }
      return [...prev, contact]
    })
  }

  function selectAll() {
    setRecipients(filteredContacts)
  }

  function clearRecipients() {
    setRecipients([])
  }

  function applyTemplate(templateId: string) {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setMessage(template.content)
    } else {
      const quickTemplate = QUICK_TEMPLATES.find(t => t.name === templateId)
      if (quickTemplate) {
        setMessage(quickTemplate.content)
      }
    }
    setSelectedTemplate('')
  }

  async function sendSMS() {
    if (!message.trim() || recipients.length === 0) {
      showToast('Please enter a message and select recipients', 'error')
      return
    }

    setSending(true)

    try {
      // Send each SMS through the server-side edge function, which reads the
      // Termii API key with the service role (RLS doesn't gate it) and logs
      // to sms_logs server-side. The key never reaches the browser. We do NOT
      // pre-flight with isConfigured() here: that helper reads the secret
      // settings row, which RLS (migration 079) restricts to owner/manager, so
      // it would wrongly report "not configured" for other staff. The edge
      // function returns a clear "not configured" error if the key is missing.
      const results = []
      let configError: string | null = null
      for (const recipient of recipients) {
        const res = await TermiiSMS.sendViaEdgeFunction({
          to: recipient.phone,
          message,
          channel: 'dnd',
        })
        results.push({ phone: recipient.phone, success: res.success })
        if (!res.success && res.error && /not configured/i.test(res.error) && !configError) {
          configError = res.error
        }
      }

      if (configError) {
        showToast(configError, 'error')
      } else {
        const successCount = results.filter(r => r.success).length
        showToast(`SMS sent: ${successCount}/${recipients.length} successful`, successCount === recipients.length ? 'success' : 'error')
      }

      // Clear form
      setMessage('')
      setRecipients([])
      fetchHistory()
    } catch (error) {
      console.error('Error sending SMS:', error)
      showToast('Failed to send SMS', 'error')
    } finally {
      setSending(false)
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">SMS Broadcast</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Send SMS campaigns to your customers and staff
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('compose')}
            className={`py-3 text-sm font-medium border-b-2 ${
              activeTab === 'compose'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Compose
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 text-sm font-medium border-b-2 ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            History
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`py-3 text-sm font-medium border-b-2 ${
              activeTab === 'contacts'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Contacts
          </button>
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'compose' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Compose Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Message */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-900">Message</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{characterCount} characters</span>
                    <span>•</span>
                    <span>{smsCount} SMS ({smsCount * 160} limit)</span>
                  </div>
                </div>

                {/* Templates */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quick Templates</label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => applyTemplate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a template...</option>
                    <optgroup label="Saved Templates">
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Quick Templates">
                      {QUICK_TEMPLATES.map(t => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Type your message here..."
                />

                {/* Variables hint */}
                <p className="text-xs text-gray-500 mt-2">
                  Available variables: {'{name}'}, {'{business}'}, {'{date}'}, {'{time}'}, {'{amount}'}, {'{offer}'}, {'{expiry}'}
                </p>
              </div>

              {/* Recipients */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-900">
                    Recipients ({recipients.length} selected)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAll}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Select All
                    </button>
                    {recipients.length > 0 && (
                      <button
                        onClick={clearRecipients}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter */}
                <div className="flex gap-4 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search contacts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    value={recipientType}
                    onChange={(e) => setRecipientType(e.target.value as any)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="clients">Clients</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>

                {/* Contact List */}
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                  {filteredContacts.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      No contacts found
                    </div>
                  ) : (
                    filteredContacts.map(contact => {
                      const isSelected = recipients.some(r => r.id === contact.id)
                      return (
                        <div
                          key={contact.id}
                          onClick={() => toggleRecipient(contact)}
                          className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 ${
                            isSelected ? 'bg-blue-50' : ''
                          } ${contact !== filteredContacts[filteredContacts.length - 1] ? 'border-b border-gray-100' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRecipient(contact)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                            <p className="text-xs text-gray-500">{contact.phone}</p>
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            contact.type === 'client' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {contact.type}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Recipients</span>
                    <span className="text-sm font-medium">{recipients.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">SMS Count</span>
                    <span className="text-sm font-medium">{smsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Total SMS</span>
                    <span className="text-sm font-medium">{recipients.length * smsCount}</span>
                  </div>
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      Note: Each SMS costs approximately ₦4-8 depending on your Termii plan.
                    </p>
                  </div>
                </div>

                <button
                  onClick={sendSMS}
                  disabled={sending || !message.trim() || recipients.length === 0}
                  className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send SMS
                    </>
                  )}
                </button>
              </div>

              {/* Recent */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {smsLogs.slice(0, 5).map(log => (
                    <div key={log.id} className="flex items-start gap-3">
                      {log.status === 'sent' || log.status === 'delivered' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{log.recipient}</p>
                        <p className="text-xs text-gray-500">{formatDate(log.created_at)}</p>
                      </div>
                    </div>
                  ))}
                  {smsLogs.length === 0 && (
                    <p className="text-sm text-gray-500 text-center">No recent activity</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {smsLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No SMS history found
                      </td>
                    </tr>
                  ) : (
                    smsLogs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{log.recipient}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{log.message}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            log.status === 'sent' || log.status === 'delivered'
                              ? 'bg-green-100 text-green-700'
                              : log.status === 'pending'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDate(log.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={recipientType}
                  onChange={(e) => setRecipientType(e.target.value as any)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All</option>
                  <option value="clients">Clients</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredContacts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No contacts found
                      </td>
                    </tr>
                  ) : (
                    filteredContacts.map(contact => (
                      <tr key={contact.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{contact.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{contact.phone}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{contact.email || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            contact.type === 'client' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {contact.type}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Total: {filteredContacts.length} contacts
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
