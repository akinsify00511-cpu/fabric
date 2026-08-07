import { useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useFeatureFlag, FEATURE_FLAG_KEYS } from '../lib/useFeatureFlag'
import { useAnalytics, ANALYTICS_EVENTS } from '../lib/analytics'
import { BetaBadge } from '../components/BetaTesterGate'
import {
  Shield, Lock, Clock4, Users, Mail, Building2, Sparkles, Settings
} from 'lucide-react'

export default function SSOSettings() {
  const { staff } = useAuth()
  const { track } = useAnalytics()

  // Feature flag gating - SSO is behind a flag, defaulted off
  const ssoEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.SSO)

  // Track when users view SSO settings
  useEffect(() => {
    if (ssoEnabled) {
      track(ANALYTICS_EVENTS.SETTINGS_SSO_VIEWED)
    }
  }, [ssoEnabled, track])

  // If not enabled, show beta access request
  if (!ssoEnabled) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-medium text-black">Single Sign-On</h1>
            <p className="text-sm text-black/50 mt-0.5">Enterprise identity provider integration</p>
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
                <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium">
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-xl text-sm font-medium hover:bg-slate-400 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  Request Beta Access
                </a>
                <span className="text-white/50 text-sm">
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
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="font-medium">SAML 2.0 & OIDC</h3>
            </div>
            <p className="text-sm text-black/50">
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
            <p className="text-sm text-black/50">
              Automatically provision and deprovision team members based on
              your IdP groups. No manual invite process needed.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="font-medium">Enforced Security</h3>
            </div>
            <p className="text-sm text-black/50">
              Mandatory SSO for your team. Users cannot bypass enterprise
              authentication or use password-only login.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="font-medium">Multi-Domain</h3>
            </div>
            <p className="text-sm text-black/50">
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
              { name: 'Azure AD', color: 'bg-blue-500' },
              { name: 'Google', color: 'bg-red-500' },
              { name: 'OneLogin', color: 'bg-purple-600' },
              { name: 'Ping Identity', color: 'bg-orange-500' },
              { name: 'Duo', color: 'bg-teal-500' },
              { name: 'JumpCloud', color: 'bg-red-600' },
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
        <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <Clock4 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                Beta Access <BetaBadge />
              </p>
              <p className="text-xs text-amber-700 mt-1">
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
          <p className="text-sm text-black/50 mt-0.5">Configure your identity provider</p>
        </div>
        <BetaBadge />
      </div>

      {/* SSO Configuration UI would go here */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Settings className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="font-medium">SSO Configuration</h2>
            <p className="text-sm text-black/50">Configure your SAML or OIDC provider</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700">
            SSO configuration panel would be rendered here when the feature is fully implemented.
          </p>
        </div>
      </div>
    </div>
  )
}
