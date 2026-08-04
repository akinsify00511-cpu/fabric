import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Key, Plus, Trash2, Copy, Eye, EyeOff, Check, X, Zap, Webhook,
  AlertTriangle, RefreshCw, CheckCircle2, Clock, ExternalLink
} from 'lucide-react'

type APIKey = {
  id: string
  name: string
  description: string
  key_prefix: string
  permissions: string[]
  scopes: string[]
  expires_at: string | null
  last_used_at: string | null
  use_count: number
  is_active: boolean
  created_at: string
}

type Webhook = {
  id: string
  name: string
  url: string
  events: string[]
  is_active: boolean
  last_triggered_at: string | null
  last_success_at: string | null
  last_error: string | null
  created_at: string
}

const WEBHOOK_EVENTS = [
  { name: 'deal.created', label: 'Deal Created', category: 'CRM' },
  { name: 'deal.updated', label: 'Deal Updated', category: 'CRM' },
  { name: 'deal.won', label: 'Deal Won', category: 'CRM' },
  { name: 'deal.lost', label: 'Deal Lost', category: 'CRM' },
  { name: 'contact.created', label: 'Contact Created', category: 'CRM' },
  { name: 'contact.updated', label: 'Contact Updated', category: 'CRM' },
  { name: 'task.created', label: 'Task Created', category: 'Tasks' },
  { name: 'task.completed', label: 'Task Completed', category: 'Tasks' },
  { name: 'task.due_soon', label: 'Task Due Soon', category: 'Tasks' },
  { name: 'invoice.created', label: 'Invoice Created', category: 'Finance' },
  { name: 'invoice.paid', label: 'Invoice Paid', category: 'Finance' },
  { name: 'invoice.overdue', label: 'Invoice Overdue', category: 'Finance' },
  { name: 'payment.received', label: 'Payment Received', category: 'Finance' },
  { name: 'user.invited', label: 'User Invited', category: 'Team' },
  { name: 'user.joined', label: 'User Joined', category: 'Team' },
  { name: 'ticket.created', label: 'Ticket Created', category: 'Support' },
  { name: 'ticket.resolved', label: 'Ticket Resolved', category: 'Support' },
]

export default function APISettings() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks'>('keys')
  const [showNewKeyModal, setShowNewKeyModal] = useState(false)
  const [showNewWebhookModal, setShowNewWebhookModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKey, setNewKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  // Webhook form
  const [webhookName, setWebhookName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<string[]>([])

  // 🚨 Webhook execution warning
  const webhookExecutionWarning = `
    ⚠️ Webhook dispatch is not yet live. Currently, saving a webhook creates a record but 
    events will not be delivered to your endpoint. This will be enabled via Edge Functions + pg_net.
  `

  const loadData = async () => {
    setLoading(true)

    const { data: keysData } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: webhooksData } = await supabase
      .from('webhooks')
      .select('*')
      .order('created_at', { ascending: false })

    setApiKeys((keysData as APIKey[]) ?? [])
    setWebhooks((webhooksData as Webhook[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      showToast('Enter a name for this key', 'error')
      return
    }

    setSaving(true)
    const { data, error } = await supabase.rpc('generate_api_key', { p_name: newKeyName })

    if (error || !data) {
      showToast('Failed to create API key', 'error')
    } else {
      setNewKey(data.key)
      showToast('API key created! Copy it now - you won\'t see it again.', 'success')
      loadData()
    }
    setSaving(false)
  }

  const deleteApiKey = async (key: APIKey) => {
    if (!confirm(`Delete API key "${key.name}"? This cannot be undone.`)) return

    await supabase.from('api_keys').delete().eq('id', key.id)
    showToast('API key deleted', 'info')
    loadData()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showToast('Copied!', 'success')
  }

  const createWebhook = async () => {
    if (!webhookName.trim() || !webhookUrl.trim()) {
      showToast('Enter name and URL', 'error')
      return
    }

    if (webhookEvents.length === 0) {
      showToast('Select at least one event', 'error')
      return
    }

    if (!webhookUrl.startsWith('https://')) {
      showToast('Webhook URL must use HTTPS', 'error')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('webhooks').insert({
      business_id: staff?.business_id,
      staff_id: staff?.id,
      name: webhookName,
      url: webhookUrl,
      events: webhookEvents,
      secret: crypto.randomUUID(), // Generate signing secret
    })

    if (error) {
      showToast('Failed to create webhook', 'error')
    } else {
      showToast('Webhook created!', 'success')
      setShowNewWebhookModal(false)
      setWebhookName('')
      setWebhookUrl('')
      setWebhookEvents([])
      loadData()
    }
    setSaving(false)
  }

  const toggleWebhook = async (webhook: Webhook) => {
    await supabase
      .from('webhooks')
      .update({ is_active: !webhook.is_active })
      .eq('id', webhook.id)
    loadData()
  }

  const deleteWebhook = async (webhook: Webhook) => {
    if (!confirm(`Delete webhook "${webhook.name}"?`)) return

    await supabase.from('webhooks').delete().eq('id', webhook.id)
    showToast('Webhook deleted', 'info')
    loadData()
  }

  const toggleEvent = (eventName: string) => {
    if (webhookEvents.includes(eventName)) {
      setWebhookEvents(webhookEvents.filter((e) => e !== eventName))
    } else {
      setWebhookEvents([...webhookEvents, eventName])
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-black/5 rounded w-32" />
        <div className="h-64 bg-black/5 rounded" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">API & Integrations</h1>
          <p className="text-sm text-black/50 mt-0.5">Connect Avenize to your tools</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === 'keys' ? 'avenize-gradient text-white' : 'border border-black/10'
            }`}
          >
            <Key size={14} className="inline mr-1" />
            API Keys
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === 'webhooks' ? 'avenize-gradient text-white' : 'border border-black/10'
            }`}
          >
            <Webhook size={14} className="inline mr-1" />
            Webhooks
          </button>
        </div>
      </div>

      {/* API KEYS TAB */}
      {activeTab === 'keys' && (
        <div className="space-y-6">
          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-blue-900">API Access</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Use API keys to connect Avenize to your apps via REST API or Zapier/Make.
                  Keep your keys secure - they provide full access to your data.
                </p>
              </div>
            </div>
          </div>

          {/* API Keys List */}
          <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
            <div className="p-4 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-medium">Your API Keys</h2>
              <button
                onClick={() => {
                  setNewKey('')
                  setNewKeyName('')
                  setShowNewKeyModal(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg avenize-gradient text-white text-sm font-medium"
              >
                <Plus size={14} />
                New Key
              </button>
            </div>

            {apiKeys.length === 0 ? (
              <div className="p-8 text-center">
                <Key className="w-12 h-12 mx-auto text-black/20 mb-3" />
                <p className="text-black/50">No API keys yet</p>
                <p className="text-xs text-black/30 mt-1">Create a key to access the REST API</p>
              </div>
            ) : (
              <div className="divide-y divide-black/[0.04]">
                {apiKeys.map((key) => (
                  <div key={key.id} className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-black/[0.05] flex items-center justify-center">
                      <Key size={18} className="text-black/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{key.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          key.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {key.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-sm text-black/50 font-mono">
                        {key.key_prefix}••••••••••••••
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-black/30">
                        <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                        {key.last_used_at && (
                          <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
                        )}
                        <span>{key.use_count} requests</span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteApiKey(key)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* WEBHOOKS TAB */}
      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          {/* BETA STATUS BANNER */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Webhook className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-blue-900">🚀 Webhooks: Beta</h3>
                  <span className="px-2 py-0.5 bg-blue-200 text-blue-800 text-xs rounded-full">BETA</span>
                </div>
                <p className="text-sm text-blue-800">
                  <strong>Creating and saving webhooks works.</strong> Event dispatching requires 
                  the Edge Function to be deployed with pg_net extension enabled in your Supabase project.
                  <a href="#" className="underline ml-1">View setup guide →</a>
                </p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                <Webhook className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium text-purple-900">Webhooks</h3>
                <p className="text-sm text-purple-700 mt-1">
                  Receive real-time notifications when events happen in Avenize.
                  Perfect for automation and connecting to other services.
                </p>
              </div>
            </div>
          </div>

          {/* Webhooks List */}
          <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
            <div className="p-4 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-medium">Your Webhooks</h2>
              <button
                onClick={() => {
                  setWebhookName('')
                  setWebhookUrl('')
                  setWebhookEvents([])
                  setShowNewWebhookModal(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg avenize-gradient text-white text-sm font-medium"
              >
                <Plus size={14} />
                New Webhook
              </button>
            </div>

            {webhooks.length === 0 ? (
              <div className="p-8 text-center">
                <Webhook className="w-12 h-12 mx-auto text-black/20 mb-3" />
                <p className="text-black/50">No webhooks yet</p>
                <p className="text-xs text-black/30 mt-1">Create a webhook to receive event notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-black/[0.04]">
                {webhooks.map((webhook) => (
                  <div key={webhook.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          webhook.is_active ? 'bg-green-100' : 'bg-black/[0.05]'
                        }`}>
                          {webhook.is_active ? (
                            <CheckCircle2 size={18} className="text-green-600" />
                          ) : (
                            <AlertTriangle size={18} className="text-black/40" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{webhook.name}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              webhook.is_active ? 'bg-green-100 text-green-700' : 'bg-black/[0.05]'
                            }`}>
                              {webhook.is_active ? 'Active' : 'Paused'}
                            </span>
                          </div>
                          <p className="text-sm text-black/50 font-mono truncate max-w-md">
                            {webhook.url}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleWebhook(webhook)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium ${
                            webhook.is_active ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {webhook.is_active ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          onClick={() => deleteWebhook(webhook)}
                          className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {webhook.events.map((event) => (
                        <span key={event} className="px-2 py-0.5 rounded-full bg-black/[0.05] text-xs">
                          {event}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-black/30">
                      {webhook.last_triggered_at && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          Last triggered {new Date(webhook.last_triggered_at).toLocaleString()}
                        </span>
                      )}
                      {webhook.last_error && (
                        <span className="flex items-center gap-1 text-red-500">
                          <AlertTriangle size={12} />
                          Error: {webhook.last_error}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available Events */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="font-medium mb-4">Available Events</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {['CRM', 'Tasks', 'Finance', 'Team', 'Support'].map((category) => (
                <div key={category}>
                  <h3 className="text-xs font-medium text-black/40 uppercase mb-2">{category}</h3>
                  <div className="space-y-1">
                    {WEBHOOK_EVENTS.filter((e) => e.category === category).map((event) => (
                      <div key={event.name} className="text-sm text-black/70">
                        {event.label}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New API Key Modal */}
      {showNewKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="font-semibold">Create API Key</h2>
            </div>
            <div className="p-6">
              {newKey ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-800">
                      <AlertTriangle size={16} />
                      <span className="font-medium">Save this key securely</span>
                    </div>
                    <p className="text-sm text-amber-700 mt-1">
                      You won't see it again after closing this dialog.
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Your API Key</label>
                    <div className="flex gap-2">
                      <code className="flex-1 px-4 py-3 rounded-xl bg-black/[0.05] font-mono text-sm break-all">
                        {newKey}
                      </code>
                      <button
                        onClick={() => copyToClipboard(newKey)}
                        className="px-3 py-2 rounded-xl border border-black/10 hover:bg-black/[0.02]"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Key Name</label>
                    <input
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="Zapier Integration"
                      className="w-full px-4 py-3 rounded-xl border border-black/10"
                    />
                    <p className="text-xs text-black/40 mt-1">
                      Give it a descriptive name to remember its purpose
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-2">
              <button
                onClick={() => setShowNewKeyModal(false)}
                className="px-4 py-2 rounded-lg border border-black/10"
              >
                {newKey ? 'Done' : 'Cancel'}
              </button>
              {!newKey && (
                <button
                  onClick={createApiKey}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg avenize-gradient text-white font-medium disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Key'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Webhook Modal */}
      {showNewWebhookModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">Create Webhook</h2>
              <button onClick={() => setShowNewWebhookModal(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Name</label>
                <input
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  placeholder="Zapier Integration"
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Endpoint URL</label>
                <input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
                <p className="text-xs text-black/40 mt-1">Must use HTTPS</p>
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Events</label>
                <div className="space-y-2">
                  {WEBHOOK_EVENTS.map((event) => (
                    <label key={event.name} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(event.name)}
                        onChange={() => toggleEvent(event.name)}
                        className="rounded"
                      />
                      <div>
                        <span className="text-sm">{event.label}</span>
                        <span className="text-xs text-black/30 ml-2">({event.category})</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-2">
              <button
                onClick={() => setShowNewWebhookModal(false)}
                className="px-4 py-2 rounded-lg border border-black/10"
              >
                Cancel
              </button>
              <button
                onClick={createWebhook}
                disabled={saving}
                className="px-4 py-2 rounded-lg avenize-gradient text-white font-medium disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Webhook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
