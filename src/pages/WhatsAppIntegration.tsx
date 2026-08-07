// WhatsApp Integration Page
// Meta WhatsApp Business API integration

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import {
  MessageSquare, Send, Settings, CheckCircle2, XCircle, Clock,
  Phone, User, Search, Filter, Plus, Edit2, Trash2, ExternalLink,
  Loader2, Image, FileText, MapPin, Copy, Eye, EyeOff
} from 'lucide-react'

interface WhatsAppMessage {
  id: string
  recipient: string
  recipient_name?: string
  message_type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'template' | 'location' | 'contact'
  content: any
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'unsubscribed'
  wa_message_id?: string
  template_name?: string
  entity_type?: string
  contact_id?: string
  sent_by?: string
  error_message?: string
  created_at: string
  sent_at?: string
  delivered_at?: string
}

interface WhatsAppTemplate {
  id: string
  name: string
  display_name?: string
  wa_template_id?: string
  category: string
  language: string
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'disabled'
  content: any
  variables?: string[]
  created_at: string
  updated_at: string
}

interface WhatsAppSettings {
  phone_number_id: string
  access_token: string
  business_account_id: string
  app_id: string
  app_secret: string
  webhook_verify_token: string
  is_configured: boolean
}

interface Contact {
  id: string
  full_name: string
  phone: string
  email?: string
}

const STATUS_COLORS = {
  queued: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  read: 'bg-purple-100 text-purple-700',
  failed: 'bg-red-100 text-red-700',
  unsubscribed: 'bg-orange-100 text-orange-700',
}

const TEMPLATE_STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  disabled: 'bg-gray-100 text-gray-400',
}

const QUICK_TEMPLATES = [
  {
    name: 'appointment_reminder',
    display_name: 'Appointment Reminder',
    category: 'appointment',
    content: {
      body: 'Hi {{1}}, this is a reminder about your appointment on {{2}} at {{3}}. Reply CONFIRM to confirm or CANCEL to cancel.',
    },
    variables: ['customer_name', 'date', 'time'],
  },
  {
    name: 'payment_confirmation',
    display_name: 'Payment Confirmation',
    category: 'payment',
    content: {
      body: 'Thank you {{1}}! Your payment of {{2}} has been received. Reference: {{3}}.',
    },
    variables: ['customer_name', 'amount', 'reference'],
  },
  {
    name: 'order_update',
    display_name: 'Order Update',
    category: 'order',
    content: {
      body: 'Hi {{1}}, your order {{2}} has been {{3}}. Track at: {{4}}',
    },
    variables: ['customer_name', 'order_id', 'status', 'tracking_url'],
  },
  {
    name: 'welcome_message',
    display_name: 'Welcome Message',
    category: 'marketing',
    content: {
      body: 'Welcome to {{1}}! 🎉 Thank you for connecting with us. How can we help you today?',
    },
    variables: ['business_name'],
  },
]

export default function WhatsAppIntegrationPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState<'messages' | 'templates' | 'settings'>('messages')
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  // Settings
  const [settings, setSettings] = useState<WhatsAppSettings>({
    phone_number_id: '',
    access_token: '',
    business_account_id: '',
    app_id: '',
    app_secret: '',
    webhook_verify_token: '',
    is_configured: false,
  })
  const [showToken, setShowToken] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  // Compose
  const [showCompose, setShowCompose] = useState(false)
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([])
  const [messageContent, setMessageContent] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const canManage = staff ? hasPermission(staff.role || 'staff', 'settings', 'manage') : false

  useEffect(() => {
    if (staff?.business_id) {
      loadSettings()
      fetchMessages()
      fetchTemplates()
      fetchContacts()
    }
  }, [staff?.business_id])

  async function loadSettings() {
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['whatsapp_phone_id', 'whatsapp_access_token', 'whatsapp_business_id', 'whatsapp_app_id'])

      const settingsMap: Record<string, string> = {}
      settingsData?.forEach(s => {
        settingsMap[s.key] = s.value
      })

      setSettings({
        phone_number_id: settingsMap['whatsapp_phone_id'] || '',
        access_token: settingsMap['whatsapp_access_token'] || '',
        business_account_id: settingsMap['whatsapp_business_id'] || '',
        app_id: settingsMap['whatsapp_app_id'] || '',
        app_secret: settingsMap['whatsapp_app_secret'] || '',
        webhook_verify_token: settingsMap['whatsapp_webhook_token'] || '',
        is_configured: !!(settingsMap['whatsapp_phone_id'] && settingsMap['whatsapp_access_token']),
      })
    } catch (error) {
      console.error('Error loading WhatsApp settings:', error)
    }
  }

  async function saveSettings() {
    if (!staff?.business_id) return

    setSavingSettings(true)
    try {
      const settingsToSave = [
        { key: 'whatsapp_phone_id', value: settings.phone_number_id },
        { key: 'whatsapp_access_token', value: settings.access_token },
        { key: 'whatsapp_business_id', value: settings.business_account_id },
        { key: 'whatsapp_app_id', value: settings.app_id },
        { key: 'whatsapp_app_secret', value: settings.app_secret },
        { key: 'whatsapp_webhook_token', value: settings.webhook_verify_token },
      ]

      for (const s of settingsToSave) {
        await supabase
          .from('settings')
          .upsert({ business_id: staff.business_id, key: s.key, value: s.value }, { onConflict: 'business_id,key' })
      }

      setSettings(prev => ({ ...prev, is_configured: true }))
      showToast('Settings saved successfully', 'success')
    } catch (error) {
      console.error('Error saving WhatsApp settings:', error)
      showToast('Failed to save settings', 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  async function fetchMessages() {
    if (!staff?.business_id) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setMessages(data || [])
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTemplates() {
    if (!staff?.business_id) return

    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTemplates(data || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

  async function fetchContacts() {
    if (!staff?.business_id) return

    try {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, business_name, phone, email')
        .eq('business_id', staff.business_id)
        .not('phone', 'is', null)

      const { data: staffMembers } = await supabase
        .from('staff')
        .select('id, full_name, phone, email')
        .eq('business_id', staff.business_id)
        .not('phone', 'is', null)

      const clientContacts: Contact[] = (clients || []).map(c => ({
        id: c.id,
        full_name: c.business_name || 'Unknown',
        phone: c.phone || '',
        email: c.email,
      }))

      const staffContacts: Contact[] = (staffMembers || []).map(s => ({
        id: s.id,
        full_name: s.full_name || 'Unknown',
        phone: s.phone || '',
        email: s.email,
      }))

      setContacts([...clientContacts, ...staffContacts])
    } catch (error) {
      console.error('Error fetching contacts:', error)
    }
  }

  async function sendMessage() {
    if (!staff?.business_id || selectedContacts.length === 0 || !messageContent) {
      showToast('Please select recipients and enter a message', 'error')
      return
    }

    setSending(true)
    try {
      for (const contact of selectedContacts) {
        // Replace variables in message
        let finalMessage = messageContent
        if (variables[contact.id]) {
          finalMessage = messageContent.replace(/\{customer_name\}/g, contact.full_name)
          Object.entries(variables).forEach(([key, value]) => {
            finalMessage = finalMessage.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
          })
        }

        const { error } = await supabase.from('whatsapp_messages').insert({
          business_id: staff.business_id,
          recipient: contact.phone,
          recipient_name: contact.full_name,
          message_type: 'text',
          content: { body: finalMessage },
          status: 'queued',
          contact_id: contact.id,
          sent_by: staff.id,
        })

        if (error) throw error
      }

      showToast(`Message queued for ${selectedContacts.length} recipients`, 'success')
      setShowCompose(false)
      setSelectedContacts([])
      setMessageContent('')
      setVariables({})
      fetchMessages()
    } catch (error) {
      console.error('Error sending message:', error)
      showToast('Failed to send message', 'error')
    } finally {
      setSending(false)
    }
  }

  async function createTemplate(template: any) {
    if (!staff?.business_id) return

    try {
      const { error } = await supabase.from('whatsapp_templates').insert({
        business_id: staff.business_id,
        ...template,
        status: 'draft',
      })

      if (error) throw error
      showToast('Template created', 'success')
      fetchTemplates()
    } catch (error) {
      console.error('Error creating template:', error)
      showToast('Failed to create template', 'error')
    }
  }

  function applyTemplate(templateName: string) {
    const template = QUICK_TEMPLATES.find(t => t.name === templateName)
    if (template) {
      setMessageContent(template.content.body)
      setSelectedTemplate(templateName)
    }
  }

  // Filtered messages
  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          m.recipient.includes(query) ||
          m.recipient_name?.toLowerCase().includes(query) ||
          m.content?.body?.toLowerCase().includes(query)
        )
      }
      return true
    })
  }, [messages, statusFilter, searchQuery])

  // Stats
  const stats = useMemo(() => {
    const sent = messages.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'read').length
    const delivered = messages.filter(m => m.status === 'delivered' || m.status === 'read').length
    const failed = messages.filter(m => m.status === 'failed').length
    return { total: messages.length, sent, delivered, failed }
  }, [messages])

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
            <h1 className="text-xl font-semibold text-gray-900">WhatsApp Integration</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Send messages via Meta WhatsApp Business API
              {settings.is_configured ? (
                <span className="ml-2 inline-flex items-center text-green-600">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Connected
                </span>
              ) : (
                <span className="ml-2 inline-flex items-center text-amber-600">
                  <Clock className="w-4 h-4 mr-1" />
                  Not configured
                </span>
              )}
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => setShowCompose(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Send Message
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-6">
          {['messages', 'templates', 'settings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-3 text-sm font-medium border-b-2 capitalize ${
                activeTab === tab
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'messages' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <p className="text-sm text-gray-500">Total Messages</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <p className="text-sm text-gray-500">Sent</p>
                <p className="text-2xl font-bold text-blue-600">{stats.sent}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <p className="text-sm text-gray-500">Delivered</p>
                <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <p className="text-sm text-gray-500">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-gray-200 mb-6">
              <div className="p-4 flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="all">All Status</option>
                  <option value="queued">Queued</option>
                  <option value="sent">Sent</option>
                  <option value="delivered">Delivered</option>
                  <option value="read">Read</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>

            {/* Messages Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                      </td>
                    </tr>
                  ) : filteredMessages.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No messages found
                      </td>
                    </tr>
                  ) : (
                    filteredMessages.map(msg => (
                      <tr key={msg.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-sm font-medium">
                              {msg.recipient_name?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{msg.recipient_name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{msg.recipient}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                          {msg.content?.body || msg.template_name || 'No content'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[msg.status]}`}>
                            {msg.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {formatDate(msg.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'templates' && (
          <>
            {/* Quick Templates */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Templates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {QUICK_TEMPLATES.map(template => (
                  <div
                    key={template.name}
                    className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-green-500 transition-colors"
                    onClick={() => {
                      applyTemplate(template.name)
                      setShowCompose(true)
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900 text-sm">{template.display_name}</h4>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{template.category}</span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-3">{template.content.body}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {template.variables?.map(v => (
                        <span key={v} className="px-1.5 py-0.5 bg-green-50 text-green-700 text-xs rounded">
                          {`{${v}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Saved Templates */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-medium text-gray-900">Saved Templates</h3>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {templates.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No saved templates. Use quick templates to get started.
                      </td>
                    </tr>
                  ) : (
                    templates.map(template => (
                      <tr key={template.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {template.display_name || template.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 capitalize">{template.category}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${TEMPLATE_STATUS_COLORS[template.status]}`}>
                            {template.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                applyTemplate(template.name)
                                setShowCompose(true)
                              }}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-medium text-gray-900 mb-4">WhatsApp Business API Configuration</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID</label>
                  <input
                    type="text"
                    value={settings.phone_number_id}
                    onChange={(e) => setSettings({ ...settings, phone_number_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Your WhatsApp Business Phone Number ID"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Account ID</label>
                  <input
                    type="text"
                    value={settings.business_account_id}
                    onChange={(e) => setSettings({ ...settings, business_account_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Your Meta Business Account ID"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={settings.access_token}
                      onChange={(e) => setSettings({ ...settings, access_token: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Your Meta Temporary Access Token"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
                  <input
                    type="text"
                    value={settings.app_id}
                    onChange={(e) => setSettings({ ...settings, app_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Your Meta App ID"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">App Secret</label>
                  <input
                    type="password"
                    value={settings.app_secret}
                    onChange={(e) => setSettings({ ...settings, app_secret: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Your Meta App Secret"
                  />
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Webhook Configuration</h4>
                  <p className="text-xs text-gray-500 mb-3">
                    Set your WhatsApp webhook URL to: <code className="bg-gray-100 px-1 rounded">https://your-project.supabase.co/functions/v1/whatsapp-webhook</code>
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Webhook Verify Token</label>
                    <input
                      type="text"
                      value={settings.webhook_verify_token}
                      onChange={(e) => setSettings({ ...settings, webhook_verify_token: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Random token for webhook verification"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    onClick={saveSettings}
                    disabled={savingSettings}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingSettings ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Save Settings
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Setup Instructions</h4>
              <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
                <li>Create a Meta Business account at business.meta.com</li>
                <li>Create a WhatsApp Business app in Meta Developer Console</li>
                <li>Add the WhatsApp Business product to your app</li>
                <li>Configure your phone number in WhatsApp Business</li>
                <li>Generate a temporary access token with required permissions</li>
                <li>Copy your Phone Number ID and Business Account ID</li>
                <li>Configure the webhook URL in your WhatsApp Business app</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Send WhatsApp Message</h2>
              <button
                onClick={() => setShowCompose(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Quick Templates */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Use Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => {
                    applyTemplate(e.target.value)
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select a template...</option>
                  {QUICK_TEMPLATES.map(t => (
                    <option key={t.name} value={t.name}>{t.display_name}</option>
                  ))}
                </select>
              </div>

              {/* Recipients */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipients ({selectedContacts.length} selected)
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                  {contacts.map(contact => (
                    <label
                      key={contact.id}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContacts.some(c => c.id === contact.id)}
                        onChange={() => {
                          setSelectedContacts(prev =>
                            prev.some(c => c.id === contact.id)
                              ? prev.filter(c => c.id !== contact.id)
                              : [...prev, contact]
                          )
                        }}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{contact.full_name}</p>
                        <p className="text-xs text-gray-500">{contact.phone}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  placeholder="Type your message here..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Variables: {'{customer_name}'} will be replaced with recipient name
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowCompose(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={sendMessage}
                  disabled={sending || selectedContacts.length === 0 || !messageContent}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Message
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
