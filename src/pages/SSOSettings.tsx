import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useFeatureFlag, FEATURE_FLAG_KEYS } from '../lib/useFeatureFlag'
import { useAnalytics, ANALYTICS_EVENTS } from '../lib/analytics'
import { BetaBadge } from '../components/BetaTesterGate'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  Shield, Lock, Clock4, Users, Mail, Building2, Sparkles, Settings,
  Check, Plus, Trash2, Loader2
} from 'lucide-react'

type SsoProvider = 'google' | 'azure' | 'saml' | 'oidc'

interface SsoRow {
  id?: string
  provider: SsoProvider
  label: string
  enabled: boolean
  metadata_url: string | null
  entity_id: string | null
  client_id: string | null
  issuer: string | null
  domain_hint: string | null
}

const PROVIDER_LABELS: Record<SsoProvider, string> = {
  google: 'Google Workspace',
  azure: 'Microsoft Entra ID',
  saml: 'Custom SAML 2.0',
  oidc: 'Custom OIDC',
}

export default function SSOSettings() {
  const { staff } = useAuth()
  const { track } = useAnalytics()
  const { showToast } = useToast()

  const ssoEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.SSO)

  const [rows, setRows] = useState<SsoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ssoEnabled) {
      track(ANALYTICS_EVENTS.SETTINGS_SSO_VIEWED)
      loadProviders()
    }
  }, [ssoEnabled, track])

  const loadProviders = async () => {
    if (!staff?.business_id) return
    setLoading(true)
    const { data } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('business_id', staff.business_id)
    const existing = (data || []).map((r: any) => ({
      id: r.id, provider: r.provider, label: r.label || '', enabled: r.enabled,
      metadata_url: r.metadata_url, entity_id: r.entity_id,
      client_id: r.client_id, issuer: r.issuer, domain_hint: r.domain_hint,
    })) as SsoRow[]
    setRows(existing)
    setLoading(false)
  }

  const addProvider = (provider: SsoProvider) => {
    if (rows.some(r => r.provider === provider)) return
    setRows(prev => [...prev, {
      provider, label: PROVIDER_LABELS[provider], enabled: false,
      metadata_url: null, entity_id: null, client_id: null, issuer: null, domain_hint: null,
    }])
  }

  const updateRow = (provider: SsoProvider, patch: Partial<SsoRow>) => {
    setRows(prev => prev.map(r => r.provider === provider ? { ...r, ...patch } : r))
  }

  const removeRow = (provider: SsoProvider) => {
    setRows(prev => prev.filter(r => r.provider !== provider))
  }

  const save = async () => {
    if (!staff?.business_id) return
    setSaving(true)
    try {
      // Upssert configured rows; delete rows for providers the admin removed.
      const upserts = rows.map(r => ({
        business_id: staff.business_id,
        provider: r.provider,
        label: r.label || PROVIDER_LABELS[r.provider],
        enabled: r.enabled,
        metadata_url: r.metadata_url || null,
        entity_id: r.entity_id || null,
        client_id: r.client_id || null,
        issuer: r.issuer || null,
        domain_hint: r.domain_hint || null,
      }))
      const { error: upErr } = await supabase
        .from('sso_providers')
        .upsert(upserts, { onConflict: 'business_id,provider' })
      if (upErr) throw upErr

      const keptProviders = rows.map(r => r.provider)
      if (keptProviders.length > 0) {
        await supabase
          .from('sso_providers')
          .delete()
          .eq('business_id', staff.business_id)
          .not('provider', 'in', `(${keptProviders.map(p => `'${p}'`).join(',')})`)
      }
      showToast('SSO providers saved', 'success')
      loadProviders()
    } catch (err) {
      console.error('Save SSO providers failed:', err)
      showToast('Could not save SSO providers', 'error')
    } finally {
      setSaving(false)
    }
  }

  // If not enabled, show beta access request
  if (!ssoEnabled) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-medium text-black">Single Sign-On</h1>
            <p className="text-sm text-black mt-0.5">Enterprise identity provider integration</p>
          </div>
        </div>

        {/* Beta Access Banner */}
        <div className="bg-gradient-to-br from-black to-black rounded-2xl p-8 mb-6 text-white">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 rounded-full bg-[var(--av-warning-soft)]0/20 text-amber-300 text-xs font-medium">
                  Beta Feature
                </span>
                <span className="px-3 py-1 rounded-full bg-white text-white/70 text-xs">
                  Enterprise Feature
                </span>
              </div>
              <h2 className="text-xl font-semibold mb-2">Enterprise SSO Integration</h2>
              <p className="text-white/70 text-sm leading-relaxed mb-4">
                Secure single sign-on with SAML 2.0 and OIDC support for Okta, Azure AD,
                Google Workspace, and other major identity providers. Streamline team access
                while maintaining enterprise-grade security.
              </p>
              <div className="flex items-center gap-4">
                <a
                  href="mailto:hello@riverwayse.com?subject=SSO%20Beta%20Access%20Request"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-xl text-sm font-medium hover:bg-slate-700 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  Request Beta Access
                </a>
                <span className="text-white/80 text-sm">
                  Join the beta program for early access
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Features Preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#4285F4]/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#4285F4]" />
              </div>
              <h3 className="font-medium">SAML 2.0 & OIDC</h3>
            </div>
            <p className="text-sm text-black">
              Support for industry-standard SAML 2.0 and OpenID Connect protocols.
              Compatible with Okta, Azure AD, OneLogin, and more.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-medium">Auto-Provisioning</h3>
            </div>
            <p className="text-sm text-black">
              Automatically provision and deprovision team members based on
              your IdP groups. No manual invite process needed.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Lock className="w-5 h-5 text-[var(--av-warning)]" />
              </div>
              <h3 className="font-medium">Enforced Security</h3>
            </div>
            <p className="text-sm text-black">
              Mandatory SSO for your team. Users cannot bypass enterprise
              authentication or use password-only login.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-[var(--av-primary)]" />
              </div>
              <h3 className="font-medium">Multi-Domain</h3>
            </div>
            <p className="text-sm text-black">
              Support for multiple domains and automatic routing.
              Perfect for organizations with complex structures.
            </p>
          </div>
        </div>

        {/* Supported Providers */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
          <h3 className="font-medium mb-4">Supported Identity Providers</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Okta', color: 'bg-blue-600' },
              { name: 'Azure AD', color: 'bg-[var(--av-primary-soft)]0' },
              { name: 'Google', color: 'bg-[var(--av-danger-soft)]0' },
              { name: 'OneLogin', color: 'bg-purple-600' },
              { name: 'Ping Identity', color: 'bg-orange-500' },
              { name: 'Duo', color: 'bg-teal-500' },
              { name: 'JumpCloud', color: 'bg-[var(--av-danger)]' },
              { name: 'Custom SAML', color: 'bg-black' },
            ].map((provider) => (
              <div
                key={provider.name}
                className="flex items-center gap-3 p-3 rounded-xl bg-black/[0.02] hover:bg-black/[0.04] transition"
              >
                <div className={`w-8 h-8 rounded-lg ${provider.color} flex items-center justify-center text-white text-xs font-bold`}>
                  {provider.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium">{provider.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Beta Note */}
        <div className="mt-6 p-4 rounded-xl bg-[var(--av-warning-soft)] border border-[var(--av-warning)]/30">
          <div className="flex items-start gap-3">
            <Clock4 className="w-5 h-5 text-[var(--av-warning)] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                Beta Access <BetaBadge />
              </p>
              <p className="text-xs text-[var(--av-warning)] mt-1">
                SSO requires Supabase Auth SAML configuration and identity provider setup.
                This feature is currently in beta testing. Contact sales to join the beta program.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // When SSO is enabled - show actual configuration UI
  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-black">Single Sign-On</h1>
          <p className="text-sm text-black mt-0.5">Configure your identity provider</p>
        </div>
        <BetaBadge />
      </div>

      <div className="bg-[var(--av-primary-soft)] border border-[var(--av-primary)]/30 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Shield size={20} className="text-[var(--av-primary)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--av-primary)]">
            Enable an identity provider so your team can sign in with their corporate credentials. Google Workspace and Microsoft Entra ID use Supabase's built-in OAuth; custom SAML/OIDC providers require metadata configured in your Supabase Auth settings.
          </p>
        </div>
      </div>

      {/* Add provider */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <h2 className="font-medium mb-3">Add a provider</h2>
        <div className="flex flex-wrap gap-2">
          {(['google', 'azure', 'saml', 'oidc'] as SsoProvider[]).map(p => {
            const added = rows.some(r => r.provider === p)
            return (
              <button
                key={p}
                onClick={() => addProvider(p)}
                disabled={added}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-black/[0.08] text-sm font-medium hover:bg-black/[0.03] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={15} />
                {PROVIDER_LABELS[p]}
                {added && <Check size={14} className="text-[var(--av-success)]" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Configured providers */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-black/50">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading providers…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-12 text-center text-black/50">
          No SSO providers configured yet. Add one above.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(row => (
            <div key={row.provider} className="bg-white rounded-2xl border border-black/[0.06] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#4285F4]/10 flex items-center justify-center">
                    <Settings className="w-5 h-5 text-[#4285F4]" />
                  </div>
                  <div>
                    <h3 className="font-medium">{PROVIDER_LABELS[row.provider]}</h3>
                    <p className="text-xs text-black/50">{row.provider} • {row.enabled ? 'Enabled' : 'Disabled'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={e => updateRow(row.provider, { enabled: e.target.checked })}
                      className="w-4 h-4"
                    />
                    Enabled
                  </label>
                  <button onClick={() => removeRow(row.provider)} className="p-2 hover:bg-[var(--av-danger-soft)] rounded-lg text-[var(--av-danger)]" title="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Display label</label>
                  <input
                    type="text"
                    value={row.label}
                    onChange={e => updateRow(row.provider, { label: e.target.value })}
                    placeholder={PROVIDER_LABELS[row.provider]}
                    className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Domain hint (optional)</label>
                  <input
                    type="text"
                    value={row.domain_hint || ''}
                    onChange={e => updateRow(row.provider, { domain_hint: e.target.value || null })}
                    placeholder="acme.com"
                    className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                  />
                </div>

                {row.provider === 'saml' && (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Metadata URL</label>
                      <input
                        type="url"
                        value={row.metadata_url || ''}
                        onChange={e => updateRow(row.provider, { metadata_url: e.target.value || null })}
                        placeholder="https://your-idp.com/metadata.xml"
                        className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Entity ID</label>
                      <input
                        type="text"
                        value={row.entity_id || ''}
                        onChange={e => updateRow(row.provider, { entity_id: e.target.value || null })}
                        placeholder="urn:amazon:cognito:sp:..."
                        className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                      />
                    </div>
                  </>
                )}

                {row.provider === 'oidc' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Client ID</label>
                      <input
                        type="text"
                        value={row.client_id || ''}
                        onChange={e => updateRow(row.provider, { client_id: e.target.value || null })}
                        placeholder="your-client-id"
                        className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Issuer URL</label>
                      <input
                        type="url"
                        value={row.issuer || ''}
                        onChange={e => updateRow(row.provider, { issuer: e.target.value || null })}
                        placeholder="https://login.microsoftonline.com/.../v2.0"
                        className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-[var(--av-primary, #4285F4)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {saving ? 'Saving…' : 'Save SSO configuration'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
