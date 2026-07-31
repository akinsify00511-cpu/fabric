import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ExternalLink, Loader2, Shield } from 'lucide-react'

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
  provider?: SSOProvider
}

export default function SSOLogin({ email, onSSOClick }: { email: string; onSSOClick?: () => void }) {
  const [providers, setProviders] = useState<SSOConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState<string | null>(null)

  const domain = email?.split('@')[1]?.toLowerCase()

  useEffect(() => {
    if (!domain) {
      setLoading(false)
      return
    }

    const loadSSOOptions = async () => {
      // Find SSO connections for this domain
      const { data } = await supabase
        .from('sso_connections')
        .select('*, provider:sso_providers(*)')
        .eq('domain', domain)
        .eq('status', 'active')

      setProviders((data as SSOConnection[]) ?? [])
      setLoading(false)
    }

    loadSSOOptions()
  }, [domain])

  const handleSSOLogin = async (connection: SSOConnection) => {
    setRedirecting(connection.id)

    // Build SSO URL (this would be your backend OAuth/SAML flow)
    const baseUrl = import.meta.env.VITE_SUPABASE_URL || window.location.origin
    const redirectTo = `${window.location.origin}/auth/callback`

    // For OIDC providers
    if (connection.provider?.provider_type === 'oidc') {
      const params = new URLSearchParams({
        provider: connection.provider.name.toLowerCase(),
        redirect_to: redirectTo,
        connection_id: connection.id,
      })
      window.location.href = `${baseUrl}/auth/v1/authorize?${params}`
    }

    // For SAML providers
    if (connection.provider?.provider_type === 'saml') {
      window.location.href = `${baseUrl}/auth/saml/${connection.id}?redirect_to=${encodeURIComponent(redirectTo)}`
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-black/30" />
      </div>
    )
  }

  if (providers.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-black/[0.1]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-black/40">Or continue with</span>
        </div>
      </div>

      <div className="space-y-2">
        {providers.map((connection) => (
          <button
            key={connection.id}
            onClick={() => handleSSOLogin(connection)}
            disabled={redirecting !== null}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-black/[0.1] hover:bg-black/[0.02] transition-colors disabled:opacity-50"
          >
            {redirecting === connection.id ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <div
                  className="w-6 h-6 rounded flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: connection.provider?.color || '#6366F1' }}
                >
                  {connection.provider?.logo_url ? (
                    <img src={connection.provider.logo_url} alt="" className="w-4 h-4 rounded-sm" />
                  ) : (
                    connection.provider?.name?.charAt(0) || 'S'
                  )}
                </div>
                <span className="font-medium">Sign in with {connection.provider?.name}</span>
                <ExternalLink size={14} className="text-black/30" />
              </>
            )}
          </button>
        ))}
      </div>

      <p className="text-xs text-center text-black/40">
        You'll be redirected to {domain} to authenticate
      </p>
    </div>
  )
}

// SSO Button for login page
export function SSOButton({ provider, onClick }: { provider: SSOProvider; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-black/[0.1] hover:bg-black/[0.02] transition-colors"
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: provider.color }}
      >
        {provider.logo_url ? (
          <img src={provider.logo_url} alt="" className="w-5 h-5 rounded" />
        ) : (
          provider.name.charAt(0)
        )}
      </div>
      <span className="font-medium">Continue with {provider.name}</span>
    </button>
  )
}

// SSO Provider Selector Modal
export function SSOProviderSelector({ onSelect, onClose }: { onSelect: (provider: SSOProvider) => void; onClose: () => void }) {
  const [providers, setProviders] = useState<SSOProvider[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('sso_providers')
        .select('*')
        .eq('is_enabled', true)
        .order('name')

      setProviders((data as SSOProvider[]) ?? [])
      setLoading(false)
    }

    loadProviders()
  }, [])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-6 border-b border-black/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--avenize-accent-end)]" />
            <h2 className="font-semibold">Sign in with SSO</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/[0.05] rounded-lg">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-black/30" />
            </div>
          ) : (
            providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => onSelect(provider)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-black/[0.06] hover:border-[var(--avenize-accent-end)] transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: provider.color }}
                >
                  {provider.logo_url ? (
                    <img src={provider.logo_url} alt="" className="w-6 h-6 rounded" />
                  ) : (
                    provider.name.charAt(0)
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium">{provider.name}</p>
                  <p className="text-xs text-black/50 capitalize">{provider.provider_type}</p>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-black/[0.05] text-xs uppercase">
                  {provider.provider_type}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="px-6 py-4 border-t border-black/[0.06]">
          <p className="text-xs text-center text-black/40">
            Contact your admin if you don't see your organization
          </p>
        </div>
      </div>
    </div>
  )
}
