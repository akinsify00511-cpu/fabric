// API Keys Management Page
// Create and manage API keys for developer integrations

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import {
  Key, Plus, Copy, Trash2, Eye, EyeOff, RefreshCw,
  CheckCircle2, XCircle, Clock, Shield, AlertTriangle, Settings
} from 'lucide-react'

interface APIKey {
  id: string
  name: string
  description?: string
  key_prefix: string
  permissions: string[]
  scopes: string[]
  allowed_ips?: string[]
  expires_at?: string
  last_used_at?: string
  use_count: number
  is_active: boolean
  created_at: string
}

const PERMISSION_OPTIONS = [
  { value: 'read', label: 'Read', description: 'Read access to data' },
  { value: 'write', label: 'Write', description: 'Create and update data' },
  { value: 'admin', label: 'Admin', description: 'Full administrative access' },
]

const SCOPE_OPTIONS = [
  { value: 'data:read', label: 'Read Data' },
  { value: 'data:write', label: 'Write Data' },
  { value: 'invoices:read', label: 'Read Invoices' },
  { value: 'invoices:write', label: 'Write Invoices' },
  { value: 'contacts:read', label: 'Read Contacts' },
  { value: 'contacts:write', label: 'Write Contacts' },
  { value: 'deals:read', label: 'Read Deals' },
  { value: 'deals:write', label: 'Write Deals' },
  { value: 'staff:read', label: 'Read Staff' },
  { value: 'reports:read', label: 'Read Reports' },
  { value: 'webhooks:manage', label: 'Manage Webhooks' },
]

export default function APIKeysPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)

  const canManage = staff ? hasPermission(staff.role || 'staff', 'settings', 'manage') : false

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: ['read'] as string[],
    scopes: ['data:read'] as string[],
    allowed_ips: '',
    expires_at: '',
  })

  useEffect(() => {
    if (staff?.business_id) {
      fetchAPIKeys()
    }
  }, [staff?.business_id])

  async function fetchAPIKeys() {
    if (!staff?.business_id) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setApiKeys(data || [])
    } catch (error) {
      console.error('Error fetching API keys:', error)
      showToast('Failed to load API keys', 'error')
    } finally {
      setLoading(false)
    }
  }

  function generateAPIKey(): string {
    // Generate a random API key
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const key = Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
    return `avenize_${key}`
  }

  function openModal() {
    setFormData({
      name: '',
      description: '',
      permissions: ['read'],
      scopes: ['data:read'],
      allowed_ips: '',
      expires_at: '',
    })
    setNewlyCreatedKey(null)
    setShowModal(true)
  }

  function togglePermission(perm: string) {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }))
  }

  function toggleScope(scope: string) {
    setFormData(prev => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter(s => s !== scope)
        : [...prev.scopes, scope]
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return

    try {
      const rawKey = generateAPIKey()
      const keyPrefix = rawKey.substring(0, 12)

      // Hash the key for storage (in production, use a proper hashing algorithm)
      const keyHash = rawKey // In production, this would be hashed

      const { error } = await supabase
        .from('api_keys')
        .insert({
          business_id: staff.business_id,
          staff_id: staff.id,
          name: formData.name,
          description: formData.description || null,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          permissions: formData.permissions,
          scopes: formData.scopes,
          allowed_ips: formData.allowed_ips ? formData.allowed_ips.split(',').map(ip => ip.trim()) : null,
          expires_at: formData.expires_at || null,
        })

      if (error) throw error

      // Show the raw key to the user (this is the only time it's shown)
      setNewlyCreatedKey(rawKey)
      showToast('API key created', 'success')
      fetchAPIKeys()
    } catch (error) {
      console.error('Error creating API key:', error)
      showToast('Failed to create API key', 'error')
    }
  }

  async function deleteAPIKey(id: string) {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) return

    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id)

      if (error) throw error
      showToast('API key deleted', 'success')
      fetchAPIKeys()
    } catch (error) {
      console.error('Error deleting API key:', error)
      showToast('Failed to delete API key', 'error')
    }
  }

  async function toggleAPIKey(apiKey: APIKey) {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !apiKey.is_active })
        .eq('id', apiKey.id)

      if (error) throw error
      showToast(apiKey.is_active ? 'API key disabled' : 'API key enabled', 'success')
      fetchAPIKeys()
    } catch (error) {
      console.error('Error toggling API key:', error)
      showToast('Failed to update API key', 'error')
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    showToast('Copied to clipboard', 'success')
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">API Keys</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage API keys for external integrations
            </p>
          </div>
          {canManage && (
            <button
              onClick={openModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create API Key
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Info Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">Security Notice</p>
              <p className="text-sm text-amber-700 mt-1">
                API keys are only shown once when created. Store them securely and never share them publicly.
              </p>
            </div>
          </div>
        </div>

        {/* API Keys List */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permissions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                    </td>
                  </tr>
                ) : apiKeys.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <Key className="w-12 h-12 text-gray-300 mx-auto" />
                      <p className="text-gray-500 mt-2">No API keys created</p>
                      <p className="text-sm text-gray-400 mt-1">Create an API key to integrate with external systems</p>
                      {canManage && (
                        <button
                          onClick={openModal}
                          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                        >
                          Create First Key
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  apiKeys.map((apiKey) => (
                    <tr key={apiKey.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{apiKey.name}</p>
                          {apiKey.description && (
                            <p className="text-xs text-gray-500">{apiKey.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                            {showKeys[apiKey.id] ? 'avenize_••••••••••••••••' : apiKey.key_prefix + '••••••••'}
                          </code>
                          <button
                            onClick={() => setShowKeys(prev => ({ ...prev, [apiKey.id]: !prev[apiKey.id] }))}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            {showKeys[apiKey.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {apiKey.permissions.map(perm => (
                            <span key={perm} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                              {perm}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {apiKey.last_used_at ? formatDate(apiKey.last_used_at) : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          apiKey.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {apiKey.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleAPIKey(apiKey)}
                            className={`p-1.5 rounded ${
                              apiKey.is_active
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={apiKey.is_active ? 'Disable' : 'Enable'}
                          >
                            {apiKey.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                          </button>
                          {canManage && (
                            <button
                              onClick={() => deleteAPIKey(apiKey.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Documentation Link */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">API Documentation</h3>
          <p className="text-sm text-gray-500 mb-3">
            Learn how to use the Avenize API to build integrations.
          </p>
          <a
            href="#"
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            View API Documentation
          </a>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Create API Key</h2>
            </div>

            {newlyCreatedKey ? (
              <div className="p-6 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <p className="font-medium text-green-900">API Key Created</p>
                  </div>
                  <p className="text-sm text-green-700 mb-3">
                    Copy this key now. You won't be able to see it again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white border border-green-300 px-3 py-2 rounded font-mono text-sm break-all">
                      {newlyCreatedKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(newlyCreatedKey)}
                      className="p-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Production API Key"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Optional description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                  <div className="space-y-2">
                    {PERMISSION_OPTIONS.map(perm => (
                      <label key={perm.value} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(perm.value)}
                          onChange={() => togglePermission(perm.value)}
                          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{perm.label}</p>
                          <p className="text-xs text-gray-500">{perm.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Scopes</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SCOPE_OPTIONS.map(scope => (
                      <label key={scope.value} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.scopes.includes(scope.value)}
                          onChange={() => toggleScope(scope.value)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{scope.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allowed IPs (optional)</label>
                  <input
                    type="text"
                    value={formData.allowed_ips}
                    onChange={(e) => setFormData({ ...formData, allowed_ips: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Comma-separated IPs (leave empty for all)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expires At (optional)</label>
                  <input
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    Create Key
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
