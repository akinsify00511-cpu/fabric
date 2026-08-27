// Webhooks Management Page
// Configure and manage outbound webhooks for integrations

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import {
  Webhook, Plus, Settings, Trash2, Play, Pause, ChevronRight, Copy, Eye, EyeOff, Zap, Search
} from 'lucide-react'

interface WebhookEndpoint {
  id: string
  name: string
  url: string
  events: string[]
  auth_type: 'none' | 'basic' | 'bearer' | 'signature' | 'apikey'
  auth_header?: string
  auth_value?: string
  retry_count: number
  is_active: boolean
  status: 'active' | 'paused' | 'error'
  last_triggered_at?: string
  last_success_at?: string
  last_error?: string
  created_at: string
}

interface WebhookDelivery {
  id: string
  webhook_id: string
  event_type: string
  payload: any
  response_status?: number
  response_body?: string
  response_time?: number
  status: 'pending' | 'success' | 'failed' | 'retrying'
  attempt: number
  created_at: string
}

// Available events users can subscribe to
const AVAILABLE_EVENTS = [
  { id: 'invoice.created', label: 'Invoice Created', category: 'Finance' },
  { id: 'invoice.paid', label: 'Invoice Paid', category: 'Finance' },
  { id: 'invoice.overdue', label: 'Invoice Overdue', category: 'Finance' },
  { id: 'invoice.cancelled', label: 'Invoice Cancelled', category: 'Finance' },
  { id: 'deal.created', label: 'Deal Created', category: 'CRM' },
  { id: 'deal.won', label: 'Deal Won', category: 'CRM' },
  { id: 'deal.lost', label: 'Deal Lost', category: 'CRM' },
  { id: 'deal.stage_changed', label: 'Deal Stage Changed', category: 'CRM' },
  { id: 'contact.created', label: 'Contact Created', category: 'CRM' },
  { id: 'lead.captured', label: 'Lead Captured', category: 'CRM' },
  { id: 'lead.converted', label: 'Lead Converted', category: 'CRM' },
  { id: 'staff.added', label: 'Staff Added', category: 'HR' },
  { id: 'staff.deactivated', label: 'Staff Deactivated', category: 'HR' },
  { id: 'leave.requested', label: 'Leave Requested', category: 'HR' },
  { id: 'leave.approved', label: 'Leave Approved', category: 'HR' },
  { id: 'task.created', label: 'Task Created', category: 'Tasks' },
  { id: 'task.completed', label: 'Task Completed', category: 'Tasks' },
  { id: 'task.due_soon', label: 'Task Due Soon', category: 'Tasks' },
  { id: 'expense.claimed', label: 'Expense Claimed', category: 'Finance' },
  { id: 'expense.approved', label: 'Expense Approved', category: 'Finance' },
  { id: 'payment.received', label: 'Payment Received', category: 'Finance' },
  { id: 'payment.failed', label: 'Payment Failed', category: 'Finance' },
]

const EVENT_CATEGORIES = ['Finance', 'CRM', 'HR', 'Tasks']

export default function WebhooksPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'endpoints' | 'deliveries'>('endpoints')
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<WebhookEndpoint | null>(null)
  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  const canManage = staff ? hasPermission(staff.role || 'staff', 'settings', 'manage') : false

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    events: [] as string[],
    auth_type: 'none' as 'none' | 'basic' | 'bearer' | 'signature' | 'apikey',
    auth_header: '',
    auth_value: '',
    retry_count: 3,
  })

  useEffect(() => {
    if (staff?.business_id) {
      fetchWebhooks()
      fetchDeliveries()
    }
  }, [staff?.business_id])

  async function fetchWebhooks() {
    if (!staff?.business_id) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setWebhooks(data || [])
    } catch (error) {
      console.error('Error fetching webhooks:', error)
      showToast('Failed to load webhooks', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function fetchDeliveries() {
    if (!staff?.business_id) return

    try {
      // Get deliveries for this business's webhooks
      const { data, error } = await supabase
        .from('webhook_deliveries')
        .select('*')
        .eq('webhooks.business_id', staff.business_id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setDeliveries(data || [])
    } catch (error) {
      console.error('Error fetching deliveries:', error)
    }
  }

  // Filter webhooks
  const filteredWebhooks = useMemo(() => {
    return webhooks.filter(webhook => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return webhook.name.toLowerCase().includes(query) ||
               webhook.url.toLowerCase().includes(query)
      }
      return true
    })
  }, [webhooks, searchQuery])

  function openModal(webhook?: WebhookEndpoint) {
    if (webhook) {
      setEditingWebhook(webhook)
      setFormData({
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        auth_type: webhook.auth_type as 'none' | 'basic' | 'bearer' | 'signature' | 'apikey',
        auth_header: webhook.auth_header || '',
        auth_value: '',
        retry_count: webhook.retry_count,
      })
    } else {
      setEditingWebhook(null)
      setFormData({
        name: '',
        url: '',
        events: [],
        auth_type: 'none' as const,
        auth_header: '',
        auth_value: '',
        retry_count: 3,
      })
    }
    setShowModal(true)
  }

  function toggleEvent(eventId: string) {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter(e => e !== eventId)
        : [...prev.events, eventId]
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return

    try {
      const webhookData = {
        name: formData.name,
        url: formData.url,
        events: formData.events,
        auth_type: formData.auth_type,
        auth_header: formData.auth_type !== 'none' ? formData.auth_header : null,
        auth_value: formData.auth_type !== 'none' ? formData.auth_value : null,
        retry_count: formData.retry_count,
      }

      if (editingWebhook) {
        const { error } = await supabase
          .from('webhooks')
          .update(webhookData)
          .eq('id', editingWebhook.id)

        if (error) throw error
        showToast('Webhook updated', 'success')
      } else {
        const { error } = await supabase
          .from('webhooks')
          .insert({
            ...webhookData,
            business_id: staff.business_id,
            staff_id: staff.id,
          })

        if (error) throw error
        showToast('Webhook created', 'success')
      }

      setShowModal(false)
      fetchWebhooks()
    } catch (error) {
      console.error('Error saving webhook:', error)
      showToast('Failed to save webhook', 'error')
    }
  }

  async function deleteWebhook(id: string) {
    if (!confirm('Are you sure you want to delete this webhook?')) return

    try {
      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', id)

      if (error) throw error
      showToast('Webhook deleted', 'success')
      fetchWebhooks()
    } catch (error) {
      console.error('Error deleting webhook:', error)
      showToast('Failed to delete webhook', 'error')
    }
  }

  async function toggleWebhook(webhook: WebhookEndpoint) {
    try {
      const newStatus = webhook.is_active ? false : true
      const { error } = await supabase
        .from('webhooks')
        .update({ is_active: newStatus })
        .eq('id', webhook.id)

      if (error) throw error
      showToast(newStatus ? 'Webhook enabled' : 'Webhook disabled', 'success')
      fetchWebhooks()
    } catch (error) {
      console.error('Error toggling webhook:', error)
      showToast('Failed to update webhook', 'error')
    }
  }

  function copyWebhookUrl(url: string) {
    navigator.clipboard.writeText(url)
    showToast('URL copied to clipboard', 'success')
  }

  function generateSecret(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
  }

  function getWebhookUrl(): string {
    return `${window.location.origin}/functions/v1/dispatch-webhooks`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[var(--av-surface)] border-b border-[var(--av-border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--av-text)]">Webhooks</h1>
            <p className="text-sm text-[var(--av-text-muted)] mt-0.5">
              Send real-time events to external systems
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => openModal()}
              className="px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium hover:bg-[var(--av-primary-hover)] flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Webhook
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Info Banner */}
        <div className="bg-[var(--av-primary-soft)] border border-[var(--av-primary-soft)] rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <Zap className="w-5 h-5 text-[var(--av-primary)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[var(--av-primary-active)]">Webhook Endpoint</p>
              <p className="text-sm text-[var(--av-primary)] mt-1">
                Your webhook URL: <code className="bg-[var(--av-primary-soft)] px-1 py-0.5 rounded">{getWebhookUrl()}</code>
                <button
                  onClick={() => copyWebhookUrl(getWebhookUrl())}
                  className="ml-2 text-[var(--av-primary)] hover:text-[var(--av-primary-hover)]"
                >
                  <Copy className="w-3 h-3 inline" />
                </button>
              </p>
              <p className="text-xs text-[var(--av-primary)] mt-2">
                Include <code className="bg-[var(--av-primary-soft)] px-1 py-0.5 rounded">business_id</code> and
                <code className="bg-[var(--av-primary-soft)] px-1 py-0.5 rounded ml-1">secret</code> in the request body.
                The secret must match an active webhook for your business.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] mb-6">
          <div className="border-b border-[var(--av-border)]">
            <div className="flex">
              <button
                onClick={() => setActiveTab('endpoints')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'endpoints'
                    ? 'border-[var(--av-primary)] text-[var(--av-primary)]'
                    : 'border-transparent text-[var(--av-text-muted)] hover:text-[var(--av-text-secondary)]'
                }`}
              >
                Endpoints ({webhooks.length})
              </button>
              <button
                onClick={() => setActiveTab('deliveries')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'deliveries'
                    ? 'border-[var(--av-primary)] text-[var(--av-primary)]'
                    : 'border-transparent text-[var(--av-text-muted)] hover:text-[var(--av-text-secondary)]'
                }`}
              >
                Deliveries
              </button>
            </div>
          </div>

          {activeTab === 'endpoints' && (
            <div className="p-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--av-text-disabled)]" />
                <input
                  type="text"
                  placeholder="Search webhooks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {activeTab === 'endpoints' ? (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] p-8 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : filteredWebhooks.length === 0 ? (
              <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] p-8 text-center">
                <Webhook className="w-12 h-12 text-[var(--av-text-disabled)] mx-auto" />
                <p className="text-[var(--av-text-muted)] mt-2">No webhooks configured</p>
                <p className="text-sm text-[var(--av-text-disabled)] mt-1">Add a webhook to send events to external systems</p>
                {canManage && (
                  <button
                    onClick={() => openModal()}
                    className="mt-4 px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm hover:bg-[var(--av-primary-hover)]"
                  >
                    Add First Webhook
                  </button>
                )}
              </div>
            ) : (
              filteredWebhooks.map((webhook) => (
                <div key={webhook.id} className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] overflow-hidden">
                  <div
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedWebhook(expandedWebhook === webhook.id ? null : webhook.id)}
                  >
                    <div className={`p-2 rounded-lg ${webhook.is_active ? 'bg-[var(--av-success-soft)]' : 'bg-[var(--av-surface-2)]'}`}>
                      <Webhook className={`w-5 h-5 ${webhook.is_active ? 'text-[var(--av-success)]' : 'text-[var(--av-text-disabled)]'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-[var(--av-text)]">{webhook.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          webhook.status === 'active' ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' :
                          webhook.status === 'paused' ? 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]' :
                          'bg-[var(--av-danger-soft)] text-[var(--av-danger)]'
                        }`}>
                          {webhook.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-[var(--av-text-muted)]">
                        <span className="truncate max-w-xs">{webhook.url}</span>
                        <span>{webhook.events.length} events</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {webhook.last_triggered_at && (
                        <span className="text-xs text-[var(--av-text-disabled)]">
                          Last triggered: {new Date(webhook.last_triggered_at).toLocaleDateString()}
                        </span>
                      )}
                      {canManage && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleWebhook(webhook) }}
                          className={`p-2 rounded-lg ${webhook.is_active ? 'text-[var(--av-warning)] hover:bg-[var(--av-warning-soft)]' : 'text-[var(--av-success)] hover:bg-[var(--av-success-soft)]'}`}
                          title={webhook.is_active ? 'Pause' : 'Enable'}
                        >
                          {webhook.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                      )}
                      <ChevronRight className={`w-5 h-5 text-[var(--av-text-disabled)] transition-transform ${expandedWebhook === webhook.id ? 'rotate-90' : ''}`} />
                    </div>
                  </div>

                  {expandedWebhook === webhook.id && (
                    <div className="border-t border-[var(--av-border)] p-4 bg-gray-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-xs font-medium text-[var(--av-text-muted)] uppercase mb-2">Subscribed Events</h4>
                          <div className="flex flex-wrap gap-1">
                            {webhook.events.map(event => {
                              const eventInfo = AVAILABLE_EVENTS.find(e => e.id === event)
                              return (
                                <span key={event} className="px-2 py-1 bg-[var(--av-surface)] border border-[var(--av-border)] rounded text-xs">
                                  {eventInfo?.label || event}
                                </span>
                              )
                            })}
                          </div>

                          {webhook.last_error && (
                            <div className="mt-4">
                              <h4 className="text-xs font-medium text-[var(--av-danger)] uppercase mb-1">Last Error</h4>
                              <p className="text-sm text-[var(--av-danger)] bg-[var(--av-danger-soft)] p-2 rounded">{webhook.last_error}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <div>
                            <h4 className="text-xs font-medium text-[var(--av-text-muted)] uppercase mb-1">Authentication</h4>
                            <p className="text-sm text-[var(--av-text-secondary)]">{webhook.auth_type}</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-medium text-[var(--av-text-muted)] uppercase mb-1">Retry Count</h4>
                            <p className="text-sm text-[var(--av-text-secondary)]">{webhook.retry_count}</p>
                          </div>
                          {canManage && (
                            <div className="flex gap-2 pt-2">
                              <button
                                onClick={() => openModal(webhook)}
                                className="flex items-center gap-2 px-3 py-2 bg-[var(--av-surface)] border border-[var(--av-border)] rounded-lg text-sm hover:bg-gray-50"
                              >
                                <Settings className="w-4 h-4" /> Edit
                              </button>
                              <button
                                onClick={() => deleteWebhook(webhook.id)}
                                className="flex items-center gap-2 px-3 py-2 bg-[var(--av-danger-soft)] text-[var(--av-danger)] border border-[var(--av-danger-soft)] rounded-lg text-sm hover:bg-[var(--av-danger-soft)]"
                              >
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-[var(--av-border)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Event</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Response</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--av-text-muted)]">
                        No deliveries yet
                      </td>
                    </tr>
                  ) : (
                    deliveries.map((delivery) => (
                      <tr key={delivery.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-[var(--av-text)]">{delivery.event_type}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            delivery.status === 'success' ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' :
                            delivery.status === 'failed' ? 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]' :
                            delivery.status === 'retrying' ? 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]' :
                            'bg-[var(--av-surface-2)] text-[var(--av-text-secondary)]'
                          }`}>
                            {delivery.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--av-text-muted)]">
                          {delivery.response_status || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--av-text-muted)]">
                          {delivery.response_time ? `${delivery.response_time}ms` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--av-text-muted)]">
                          {new Date(delivery.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[var(--av-border)]">
              <h2 className="text-lg font-semibold">
                {editingWebhook ? 'Edit Webhook' : 'Add Webhook'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Slack Notifications"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">URL *</label>
                <input
                  type="url"
                  required
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/webhook"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Events *</label>
                <p className="text-xs text-[var(--av-text-muted)] mb-2">Select the events to send to this webhook</p>
                <div className="space-y-3">
                  {EVENT_CATEGORIES.map(category => (
                    <div key={category}>
                      <p className="text-xs font-medium text-[var(--av-text-muted)] uppercase mb-1">{category}</p>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABLE_EVENTS.filter(e => e.category === category).map(event => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => toggleEvent(event.id)}
                            className={`px-2 py-1 text-xs rounded border ${
                              formData.events.includes(event.id)
                                ? 'bg-[var(--av-primary-soft)] border-[var(--av-primary-soft)] text-[var(--av-primary)]'
                                : 'bg-[var(--av-surface)] border-[var(--av-border)] text-[var(--av-text-muted)] hover:border-[var(--av-border-strong)]'
                            }`}
                          >
                            {event.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Authentication</label>
                <select
                  value={formData.auth_type}
                  onChange={(e) => setFormData({ ...formData, auth_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="none">None</option>
                  <option value="basic">Basic Auth</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="apikey">API Key</option>
                  <option value="signature">HMAC Signature</option>
                </select>
              </div>
              {formData.auth_type !== 'none' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Header Name</label>
                    <input
                      type="text"
                      value={formData.auth_header}
                      onChange={(e) => setFormData({ ...formData, auth_header: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Authorization"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">
                      {formData.auth_type === 'basic' ? 'Password' : 'Token/Key'}
                    </label>
                    <div className="relative">
                      <input
                        type={showSecrets[editingWebhook?.id || 'new'] ? 'text' : 'password'}
                        value={formData.auth_value}
                        onChange={(e) => setFormData({ ...formData, auth_value: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                        placeholder={editingWebhook ? '(unchanged)' : 'Enter secret'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecrets(prev => ({ ...prev, [editingWebhook?.id || 'new']: !prev[editingWebhook?.id || 'new'] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--av-text-disabled)] hover:text-[var(--av-text-muted)]"
                      >
                        {showSecrets[editingWebhook?.id || 'new'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {formData.auth_type === 'signature' && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, auth_value: generateSecret() })}
                        className="mt-2 text-xs text-[var(--av-primary)] hover:text-[var(--av-primary-hover)]"
                      >
                        Generate random secret
                      </button>
                    )}
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Retry Count</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={formData.retry_count}
                  onChange={(e) => setFormData({ ...formData, retry_count: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-[var(--av-border)] rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm hover:bg-[var(--av-primary-hover)]"
                >
                  {editingWebhook ? 'Save Changes' : 'Create Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
