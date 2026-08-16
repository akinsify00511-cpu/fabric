import { Link } from 'react-router-dom'
import { Shield, Palette, Globe, Key, ChevronRight, User, Zap, Users, Plug, CreditCard, KeyRound, Sparkles } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useLocale } from '../lib/LocaleContext'

export default function Settings() {
  const { staff } = useAuth()
  const { translations } = useLocale()
  const tr = (key: string, fallback: string) => (translations as unknown as Record<string, string>)?.[key] || fallback

  const SETTINGS_ITEMS = [
    { to: '/app/settings/profile', icon: User, label: 'Profile', desc: 'Your account details', color: 'bg-purple-50 text-purple-500' },
    { to: '/app/subscription', icon: CreditCard, label: 'Subscription & Billing', desc: 'Plan, payments, invoices', color: 'bg-[#4285F4]/5 text-[#4285F4]' },
    { to: '/app/branding', icon: Palette, label: 'Branding', desc: 'Colors, logo, theme', color: 'bg-pink-50 text-pink-500' },
    { to: '/app/security', icon: Shield, label: 'Security', desc: '2FA, audit log', color: 'bg-red-50 text-red-500' },
    { to: '/app/sso', icon: Key, label: 'Single Sign-On', desc: 'SAML, OIDC, Okta, Azure', color: 'bg-blue-50 text-blue-500' },
    { to: '/app/integrations', icon: Plug, label: 'Integrations', desc: 'Social media, SMS, payments', color: 'bg-cyan-50 text-cyan-500' },
    { to: '/app/settings/api-keys', icon: KeyRound, label: 'API Keys', desc: 'Developer API access', color: 'bg-orange-50 text-orange-500' },
    { to: '/app/settings/webhooks', icon: Zap, label: 'Webhooks', desc: 'Outbound event delivery', color: 'bg-amber-50 text-amber-500' },
    { to: '/app/portal', icon: Users, label: 'Customer Portal', desc: 'Client self-service', color: 'bg-teal-50 text-teal-500' },
    { to: '/settings?lang', icon: Globe, label: 'Language', desc: 'i18n, timezone', color: 'bg-green-50 text-green-500' },
  ]

  return (
    <div className="pb-20">
      <h1 className="text-xl font-medium text-black mb-6">{tr('settings', 'Settings')}</h1>

      <div className="bg-[var(--av-primary-soft)] border border-[var(--av-primary)]/20 rounded-2xl p-5 mb-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-[var(--av-primary)] text-white flex items-center justify-center shrink-0"><Sparkles size={18} /></div>
        <div className="flex-1">
          <p className="font-semibold text-[var(--av-text)]">Make your workspace yours</p>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">Choose the tools you need for your role. Your permissions stay in place; this only simplifies what you see every day.</p>
        </div>
        <Link to="/app/more?customize=1" className="shrink-0 px-4 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium">Customize</Link>
      </div>

      <div className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl avenize-gradient flex items-center justify-center text-white text-xl font-bold">
            {staff?.full_name?.charAt(0) || staff?.name?.charAt(0) || '?'}
          </div>
          <div>
            <p className="font-semibold text-lg">{staff?.full_name || staff?.name || tr('user', 'User')}</p>
            <p className="text-sm text-black">{staff?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-black/[0.05] text-xs capitalize">{staff?.role || tr('staff', 'Staff')}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {SETTINGS_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.to} to={item.to} className="flex items-center gap-3 p-4 rounded-xl border border-black/[0.06] hover:bg-black/10 transition-colors">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}><Icon size={18} /></div>
              <div className="flex-1">
                <p className="font-medium">{tr(`setting_${item.label.toLowerCase().replace(/\s+/g, '_')}`, item.label)}</p>
                <p className="text-xs text-black">{tr(`setting_${item.label.toLowerCase().replace(/\s+/g, '_')}_desc`, item.desc)}</p>
              </div>
              <ChevronRight size={16} className="text-black" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
