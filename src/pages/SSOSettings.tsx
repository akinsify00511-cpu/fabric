import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Shield, Plus, Trash2, Check, X, ExternalLink, Key, Users,
  AlertTriangle, RefreshCw, Globe, Copy, CheckCircle2
} from 'lucide-react'

type SSOProvider = {
  id: string
  name: string
  provider_type: string
  logo_url: string | null
  color: string
}

type SSOConnection = {
  id: string
  provider_id: string
  domain: string
  status: string
  synced_users: number
  last_sync_at: string | null
  provider?: SSOProvider
}

type ProviderConfig = {
  // OIDC
  client_id?: string
  client_secret?: string
  issuer_url?: string
  // SAML
  entity_id?: string
  sso_url?: string
  certificate?: string
  // Settings
  auto_provision?: boolean
  default_role?: string
}

export default function SSOSettings() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<SSOProvider[]>([])
  const [connections, setConnections] = useState<SSOConnection[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingConnection, setEditingConnection] = useState<SSOConnection | null>(null)
  const [setupStep, setSetupStep] = useState<'select' | 'config' | 'verify' | 'done'>('select')
  const [selectedProvider, setSelectedProvider] = useState<SSOProvider | null>(null)

  // Form state
  const [domain, setDomain] = useState('')
  const [config, setConfig] = useState<ProviderConfig>({
    auto_provision: true,
    default_role: 'staff',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const loadData = async () => {
    setLoading(true)

    // Load providers
    const { data: providersData } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('is_enabled', true)
      .order('name')

    // Load connections for this business
    const { data: connectionsData } = await supabase
      .from('sso_connections')
      .select('*, provider:sso_providers(*)')
      .eq('business_id', staff?.business_id)

    setProviders((providersData as SSOProvider[]) ?? [])
    setConnections(
      ((connectionsData as any[]) ?? []).map((c) => ({
        ...c,
        provider: c.provider as SSOProvider,
      }))
    )
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  const openAddSSO = () => {
    setSelectedProvider(null)
    setDomain('')
    setConfig({ auto_provision: true, default_role: 'staff' })
    setSetupStep('select')
    setShowAddModal(true)
  }

  const selectProvider = (provider: SSOProvider) => {
    setSelectedProvider(provider)
    setSetupStep('config')
  }

  const handleVerify = async () => {
    if (!domain.trim()) {
      showToast('Enter your domain', 'error')
      return
    }

    // Validate domain ownership
    if (!domain.includes('.')) {
      showToast('Enter a valid domain (e.g., acme.com)', 'error')
      return
    }

    setSaving(true)

    // Create connection
    const { data, error } = await supabase
      .from('sso_connections')
      .insert({
        business_id: staff?.business_id,
        provider_id: selectedProvider?.id,
        domain: domain.toLowerCase(),
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      showToast('Failed to create SSO connection', 'error')
      setSaving(false)
      return
    }

    showToast('SSO connection created! Configure your identity provider.', 'success')
    setSetupStep('verify')
    setSaving(false)
    loadData()
  }

  const generateSPConfig = (connection: SSOConnection) => {
    const baseUrl = window.location.origin
    return {
      entity_id: `${baseUrl}/saml/${connection.id}`,
      acs_url: `${baseUrl}/auth/sso/callback`,
      metadata_url: `${baseUrl}/auth/sso/metadata/${connection.id}`,
    }
  }

  const getProviderConfig = (providerName: string) => {
    const configs: Record<string, any> = {
      'Okta': {
        issuer_url: 'https://{your-domain}.okta.com/oauth2/default',
        client_id: 'Your Okta Client ID',
        scopes: 'openid profile email groups',
      },
      'Microsoft': {
        issuer_url: 'https://login.microsoftonline.com/{tenant-id}/v2.0',
        client_id: 'Your Azure AD Client ID',
        scopes: 'openid profile email',
      },
      'Google': {
        issuer_url: 'https://accounts.google.com',
        client_id: 'Your Google Client ID',
        scopes: 'openid profile email',
      },
    }
    return configs[providerName] || {}
  }

  const deleteConnection = async (connection: SSOConnection) => {
    if (!confirm(`Remove SSO for ${connection.domain}? This will log out all SSO users.`)) return

    await supabase.from('sso_connections').delete().eq('id', connection.id)
    showToast('SSO connection removed', 'info')
    loadData()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showToast('Copied!', 'success')
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-black/5 rounded w-48" />
        <div className="h-64 bg-black/5 rounded" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Single Sign-On</h1>
          <p className="text-sm text-black/50 mt-0.5">Enterprise authentication with SAML & OIDC</p>
        </div>
        <button
          onClick={openAddSSO}
          className="flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium"
        >
          <Plus size={16} />
          Add SSO
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-blue-900">Enterprise Authentication</h3>
            <p className="text-sm text-blue-700 mt-1">
              Enable SSO to let your team sign in with their company credentials. Supports Okta, Azure AD, Google Workspace, and any SAML 2.0 / OIDC provider.
            </p>
          </div>
        </div>
      </div>

      {/* Existing Connections */}
      <div className="space-y-4">
        {connections.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/[0.06] p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-black/[0.05] flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-black/20" />
            </div>
            <h3 className="font-medium mb-2">No SSO Configured</h3>
            <p className="text-sm text-black/50 mb-4">Add your first SSO provider to get started</p>
            <button
              onClick={openAddSSO}
              className="px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium"
            >
              Add SSO Provider
            </button>
          </div>
        ) : (
          connections.map((connection) => {
            const spConfig = generateSPConfig(connection)
            return (
              <div key={connection.id} className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: connection.provider?.color || '#6366F1' }}
                      >
                        {connection.provider?.logo_url ? (
                          <img src={connection.provider.logo_url} alt="" className="w-6 h-6 rounded" />
                        ) : (
                          connection.provider?.name?.charAt(0) || 'S'
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium">{connection.provider?.name || 'SSO'}</h3>
                        <p className="text-sm text-black/50">{connection.domain}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        connection.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : connection.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {connection.status}
                      </span>
                      <button
                        onClick={() => deleteConnection(connection)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {connection.status === 'active' && (
                    <div className="mt-4 pt-4 border-t border-black/[0.06]">
                      <div className="grid md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-black/40">Users Synced</p>
                          <p className="font-medium">{connection.synced_users}</p>
                        </div>
                        <div>
                          <p className="text-black/40">Last Sync</p>
                          <p className="font-medium">
                            {connection.last_sync_at
                              ? new Date(connection.last_sync_at).toLocaleString()
                              : 'Never'}
                          </p>
                        </div>
                        <div>
                          <p className="text-black/40">Entity ID</p>
                          <p className="font-mono text-xs truncate">{spConfig.entity_id}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {connection.status === 'pending' && (
                  <div className="px-6 py-4 bg-yellow-50 border-t border-yellow-100">
                    <div className="flex items-center gap-2 text-yellow-800">
                      <AlertTriangle size={16} />
                      <span className="text-sm font-medium">Configuration needed</span>
                    </div>
                    <p className="text-sm text-yellow-700 mt-1">
                      Configure your identity provider with the service provider details below.
                    </p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add SSO Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="p-6 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">
                {setupStep === 'select' && 'Add SSO Provider'}
                {setupStep === 'config' && `Configure ${selectedProvider?.name}`}
                {setupStep === 'verify' && 'Configure Identity Provider'}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-black/[0.05] rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {/* Step 1: Select Provider */}
              {setupStep === 'select' && (
                <div className="space-y-3">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => selectProvider(provider)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-black/[0.06] hover:border-[var(--avenize-accent-end)] transition-colors text-left"
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                        style={{ backgroundColor: provider.color }}
                      >
                        {provider.logo_url ? (
                          <img src={provider.logo_url} alt="" className="w-6 h-6 rounded" />
                        ) : (
                          provider.name.charAt(0)
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{provider.name}</p>
                        <p className="text-sm text-black/50 capitalize">{provider.provider_type}</p>
                      </div>
                      <span className="px-2 py-1 rounded-full bg-black/[0.05] text-xs">
                        {provider.provider_type.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2: Configure */}
              {setupStep === 'config' && (
                <div className="space-y-4">
                  {/* Domain */}
                  <div>
                    <label className="text-sm font-medium block mb-1">Email Domain</label>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="acme.com"
                      className="w-full px-4 py-3 rounded-xl border border-black/10"
                    />
                    <p className="text-xs text-black/40 mt-1">
                      Users with this email domain will be redirected to SSO
                    </p>
                  </div>

                  {/* OIDC Config */}
                  {selectedProvider?.provider_type === 'oidc' && (
                    <>
                      <div className="p-4 rounded-xl bg-black/[0.02] space-y-3">
                        <h4 className="text-sm font-medium">OIDC Configuration</h4>
                        <div>
                          <label className="text-xs text-black/50 block mb-1">Client ID</label>
                          <input
                            type="text"
                            value={config.client_id || ''}
                            onChange={(e) => setConfig({ ...config, client_id: e.target.value })}
                            placeholder="From your identity provider"
                            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-black/50 block mb-1">Client Secret</label>
                          <input
                            type="password"
                            value={config.client_secret || ''}
                            onChange={(e) => setConfig({ ...config, client_secret: e.target.value })}
                            placeholder="From your identity provider"
                            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-black/50 block mb-1">Issuer URL</label>
                          <input
                            type="text"
                            value={config.issuer_url || ''}
                            onChange={(e) => setConfig({ ...config, issuer_url: e.target.value })}
                            placeholder="https://..."
                            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* SAML Config */}
                  {selectedProvider?.provider_type === 'saml' && (
                    <>
                      <div className="p-4 rounded-xl bg-black/[0.02] space-y-3">
                        <h4 className="text-sm font-medium">Service Provider Details</h4>
                        <div>
                          <label className="text-xs text-black/50 block mb-1">ACS URL (Assertion Consumer Service)</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={`${window.location.origin}/auth/sso/callback`}
                              readOnly
                              className="flex-1 px-3 py-2 rounded-lg border border-black/10 text-sm bg-black/[0.02]"
                            />
                            <button
                              onClick={() => copyToClipboard(`${window.location.origin}/auth/sso/callback`)}
                              className="p-2 rounded-lg border border-black/10 hover:bg-black/[0.02]"
                            >
                              <Copy size={16} />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-black/50 block mb-1">Entity ID</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={`${window.location.origin}/saml/avenize`}
                              readOnly
                              className="flex-1 px-3 py-2 rounded-lg border border-black/10 text-sm bg-black/[0.02]"
                            />
                            <button
                              onClick={() => copyToClipboard(`${window.location.origin}/saml/avenize`)}
                              className="p-2 rounded-lg border border-black/10 hover:bg-black/[0.02]"
                            >
                              <Copy size={16} />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-black/[0.02] space-y-3">
                        <h4 className="text-sm font-medium">Identity Provider Details</h4>
                        <div>
                          <label className="text-xs text-black/50 block mb-1">SSO URL</label>
                          <input
                            type="text"
                            value={config.sso_url || ''}
                            onChange={(e) => setConfig({ ...config, sso_url: e.target.value })}
                            placeholder="From your IdP"
                            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-black/50 block mb-1">Entity ID / Issuer</label>
                          <input
                            type="text"
                            value={config.entity_id || ''}
                            onChange={(e) => setConfig({ ...config, entity_id: e.target.value })}
                            placeholder="From your IdP"
                            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-black/50 block mb-1">Certificate (X.509)</label>
                          <textarea
                            value={config.certificate || ''}
                            onChange={(e) => setConfig({ ...config, certificate: e.target.value })}
                            placeholder="-----BEGIN CERTIFICATE-----"
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm font-mono resize-none"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Settings */}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.auto_provision}
                        onChange={(e) => setConfig({ ...config, auto_provision: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm">Auto-provision users (create accounts on first login)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Step 3: Verify */}
              {setupStep === 'verify' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle2 size={20} />
                      <span className="font-medium">Connection Created</span>
                    </div>
                    <p className="text-sm text-green-600 mt-1">
                      Now configure your identity provider with the details below.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-black/[0.02] space-y-3">
                    <h4 className="text-sm font-medium">Service Provider Configuration</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-black/50">ACS URL</span>
                        <code className="bg-black/[0.05] px-2 py-0.5 rounded text-xs">
                          {window.location.origin}/auth/sso/callback
                        </code>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-black/50">Entity ID</span>
                        <code className="bg-black/[0.05] px-2 py-0.5 rounded text-xs">
                          {window.location.origin}/saml/avenize
                        </code>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-black/[0.02] space-y-2">
                    <h4 className="text-sm font-medium">Next Steps</h4>
                    <ol className="text-sm text-black/60 space-y-1 list-decimal list-inside">
                      <li>Go to your identity provider (Okta, Azure, etc.)</li>
                      <li>Create a new application/SAML app</li>
                      <li>Enter the ACS URL and Entity ID above</li>
                      <li>Upload/download the metadata XML</li>
                      <li>Test the connection</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-2">
              {setupStep === 'config' && (
                <button
                  onClick={() => setSetupStep('select')}
                  className="px-4 py-2 rounded-lg border border-black/10"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg border border-black/10"
              >
                {setupStep === 'verify' ? 'Done' : 'Cancel'}
              </button>
              {setupStep === 'select' && (
                <button
                  onClick={handleVerify}
                  disabled={!selectedProvider || !domain}
                  className="px-4 py-2 rounded-lg fabric-gradient text-white font-medium disabled:opacity-50"
                >
                  Continue
                </button>
              )}
              {setupStep === 'config' && (
                <button
                  onClick={handleVerify}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg fabric-gradient text-white font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Create Connection'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
