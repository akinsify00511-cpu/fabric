import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { Shield, Palette, Globe, Key, ChevronRight, User, Building, Zap, Users, Plug, Share2, MessageSquare } from 'lucide-react'

export default function Settings() {
  const { staff } = useAuth()

  const SETTINGS_ITEMS = [
    { to: '/app/settings/profile', icon: User, label: 'Profile', desc: 'Your account details', color: 'bg-purple-50 text-purple-500' },
    { to: '/branding', icon: Palette, label: 'Branding', desc: 'Colors, logo, theme', color: 'bg-pink-50 text-pink-500' },
    { to: '/security', icon: Shield, label: 'Security', desc: '2FA, audit log', color: 'bg-red-50 text-red-500' },
    { to: '/sso', icon: Key, label: 'Single Sign-On', desc: 'SAML, OIDC, Okta, Azure', color: 'bg-blue-50 text-blue-500' },
    { to: '/integrations', icon: Plug, label: 'Integrations', desc: 'Social media, SMS, payments', color: 'bg-cyan-50 text-cyan-500' },
    { to: '/api', icon: Zap, label: 'API & Webhooks', desc: 'REST API, integrations', color: 'bg-orange-50 text-orange-500' },
    { to: '/portal', icon: Users, label: 'Customer Portal', desc: 'Client self-service', color: 'bg-indigo-50 text-indigo-500' },
    { to: '/settings?lang', icon: Globe, label: 'Language', desc: 'i18n, timezone', color: 'bg-green-50 text-green-500' },
  ]

  return (
    <div className="pb-20">
      <h1 className="text-xl font-medium text-[var(--avenize-black)] mb-6">Settings</h1>

      {/* User Info */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl avenize-gradient flex items-center justify-center text-white text-xl font-bold">
            {staff?.full_name?.charAt(0) || staff?.name?.charAt(0) || '?'}
          </div>
          <div>
            <p className="font-semibold text-lg">{staff?.full_name || staff?.name || 'User'}</p>
            <p className="text-sm text-black/50">{staff?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-black/[0.05] text-xs capitalize">
              {staff?.role || 'Staff'}
            </span>
          </div>
        </div>
      </div>

      {/* Settings Links */}
      <div className="space-y-3">
        {SETTINGS_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 p-4 rounded-xl border border-black/[0.06] hover:bg-black/[0.02] transition-colors"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                <Icon size={18} />
              </div>
              <div className="flex-1">
                <p className="font-medium">{item.label}</p>
                <p className="text-xs text-black/50">{item.desc}</p>
              </div>
              <ChevronRight size={16} className="text-black/30" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
