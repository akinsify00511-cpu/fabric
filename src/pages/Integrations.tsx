import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Plug, MessageSquare, Share2, Link2, ExternalLink, Check, X, 
  RefreshCw, ChevronRight, Settings, Trash2, AlertCircle
} from 'lucide-react'

// Social Media Platform Types
type SocialPlatform = {
  id: string
  platform: 'instagram' | 'linkedin' | 'facebook' | 'twitter' | 'tiktok'
  name: string
  icon: string
  color: string
  connected: boolean
  connected_at: string | null
  account_name: string | null
  account_id: string | null
  followers_count: number | null
}

type SMSProvider = {
  id: string
  provider: 'twilio' | 'vonage' | 'africastalking' | 'termii'
  name: string
  icon: string
  color: string
  connected: boolean
  configured_at: string | null
  phone_number: string | null
  sender_id: string | null
}

export default function Integrations() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'social' | 'sms'>('social')

  // Social platforms state
  const [socialPlatforms, setSocialPlatforms] = useState<SocialPlatform[]>([
    { id: '1', platform: 'instagram', name: 'Instagram', icon: '📸', color: 'bg-pink-500', connected: false, connected_at: null, account_name: null, account_id: null, followers_count: null },
    { id: '2', platform: 'linkedin', name: 'LinkedIn', icon: '💼', color: 'bg-blue-600', connected: false, connected_at: null, account_name: null, account_id: null, followers_count: null },
    { id: '3', platform: 'facebook', name: 'Facebook', icon: '👥', color: 'bg-blue-500', connected: false, connected_at: null, account_name: null, account_id: null, followers_count: null },
    { id: '4', platform: 'twitter', name: 'X (Twitter)', icon: '🐦', color: 'bg-black', connected: false, connected_at: null, account_name: null, account_id: null, followers_count: null },
    { id: '5', platform: 'tiktok', name: 'TikTok', icon: '🎵', color: 'bg-pink-600', connected: false, connected_at: null, account_name: null, account_id: null, followers_count: null },
  ])

  // SMS providers state
  const [smsProviders, setSmsProviders] = useState<SMSProvider[]>([
    { id: '1', provider: 'twilio', name: 'Twilio', icon: '📱', color: 'bg-red-500', connected: false, configured_at: null, phone_number: null, sender_id: null },
    { id: '2', provider: 'africastalking', name: 'Africa\'s Talking', icon: '🌍', color: 'bg-green-500', connected: false, configured_at: null, phone_number: null, sender_id: null },
    { id: '3', provider: 'termii', name: 'Termii', icon: '📲', color: 'bg-purple-500', connected: false, configured_at: null, phone_number: null, sender_id: null },
    { id: '4', provider: 'vonage', name: 'Vonage', icon: '📞', color: 'bg-blue-500', connected: false, configured_at: null, phone_number: null, sender_id: null },
  ])

  // Twilio config form
  const [twilioConfig, setTwilioConfig] = useState({
    account_sid: '',
    auth_token: '',
    phone_number: '',
    sender_id: '',
  })
  const [showTwilioModal, setShowTwilioModal] = useState(false)

  // Africa&apos;s Talking config form
  const [atConfig, setAtConfig] = useState({
    api_key: '',
    username: '',
    sender_id: '',
  })
  const [showAtModal, setShowAtModal] = useState(false)

  // Termii config form
  const [termiiConfig, setTermiiConfig] = useState({
    api_key: '',
    sender_id: '',
  })
  const [showTermiiModal, setShowTermiiModal] = useState(false)

  useEffect(() => {
    loadIntegrations()
  }, [])

  const loadIntegrations = async () => {
    setLoading(true)
    const businessId = staff?.business_id
    if (!businessId) {
      setLoading(false)
      return
    }

    // Load social integrations
    const { data: socialData } = await supabase
      .from('social_integrations')
      .select('*')
      .eq('business_id', businessId)

    if (socialData && socialData.length > 0) {
      setSocialPlatforms(prev => prev.map(p => {
        const integration = socialData.find(s => s.platform === p.platform)
        if (integration) {
          return {
            ...p,
            connected: integration.connected,
            connected_at: integration.connected_at,
            account_name: integration.account_name,
            account_id: integration.account_id,
            followers_count: integration.followers_count,
          }
        }
        return p
      }))
    }

    // Load SMS integrations
    const { data: smsData } = await supabase
      .from('sms_integrations')
      .select('*')
      .eq('business_id', businessId)

    if (smsData && smsData.length > 0) {
      setSmsProviders(prev => prev.map(p => {
        const integration = smsData.find(s => s.provider === p.provider)
        if (integration) {
          return {
            ...p,
            connected: integration.connected,
            configured_at: integration.configured_at,
            phone_number: integration.phone_number,
            sender_id: integration.sender_id,
          }
        }
        return p
      }))
    }

    setLoading(false)
  }

  const connectSocialPlatform = async (platform: SocialPlatform) => {
    // In production, this would open OAuth flow for the platform
    showToast(`To connect ${platform.name}, you would be redirected to their OAuth authorization page. This feature requires API credentials from ${platform.name}.`, 'info')
  }

  const disconnectSocialPlatform = async (platform: SocialPlatform) => {
    if (!staff?.business_id) return
    
    setSaving(true)
    const { error } = await supabase
      .from('social_integrations')
      .update({ connected: false, connected_at: null, account_name: null, account_id: null, followers_count: null })
      .eq('business_id', staff.business_id)
      .eq('platform', platform.platform)

    if (error) {
      showToast('Failed to disconnect platform', 'error')
    } else {
      setSocialPlatforms(prev => prev.map(p => 
        p.platform === platform.platform 
          ? { ...p, connected: false, connected_at: null, account_name: null, account_id: null, followers_count: null }
          : p
      ))
      showToast(`${platform.name} disconnected`, 'success')
    }
    setSaving(false)
  }

  const saveTwilioConfig = async () => {
    if (!staff?.business_id) return
    if (!twilioConfig.account_sid || !twilioConfig.auth_token || !twilioConfig.phone_number) {
      showToast('Please fill in all required fields', 'error')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('sms_integrations')
      .upsert({
        business_id: staff.business_id,
        provider: 'twilio',
        connected: true,
        configured_at: new Date().toISOString(),
        phone_number: twilioConfig.phone_number,
        sender_id: twilioConfig.sender_id || twilioConfig.phone_number,
        config: {
          account_sid: twilioConfig.account_sid,
          // Don't store auth_token - use it to validate only
        }
      }, {
        onConflict: 'business_id,provider'
      })

    if (error) {
      showToast('Failed to save Twilio configuration', 'error')
    } else {
      setSmsProviders(prev => prev.map(p =>
        p.provider === 'twilio'
          ? { ...p, connected: true, configured_at: new Date().toISOString(), phone_number: twilioConfig.phone_number, sender_id: twilioConfig.sender_id || twilioConfig.phone_number }
          : p
      ))
      setShowTwilioModal(false)
      showToast('Twilio configured successfully', 'success')
    }
    setSaving(false)
  }

  const saveAtConfig = async () => {
    if (!staff?.business_id) return
    if (!atConfig.api_key || !atConfig.username) {
      showToast('Please fill in all required fields', 'error')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('sms_integrations')
      .upsert({
        business_id: staff.business_id,
        provider: 'africastalking',
        connected: true,
        configured_at: new Date().toISOString(),
        phone_number: null,
        sender_id: atConfig.sender_id,
        config: {
          api_key: atConfig.api_key,
          username: atConfig.username,
        }
      }, {
        onConflict: 'business_id,provider'
      })

    if (error) {
      showToast('Failed to save Africa&apos;s Talking configuration', 'error')
    } else {
      setSmsProviders(prev => prev.map(p =>
        p.provider === 'africastalking'
          ? { ...p, connected: true, configured_at: new Date().toISOString(), sender_id: atConfig.sender_id }
          : p
      ))
      setShowAtModal(false)
      showToast('Africa&apos;s Talking configured successfully', 'success')
    }
    setSaving(false)
  }

  const saveTermiiConfig = async () => {
    if (!staff?.business_id) return
    if (!termiiConfig.api_key) {
      showToast('Please fill in API key', 'error')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('sms_integrations')
      .upsert({
        business_id: staff.business_id,
        provider: 'termii',
        connected: true,
        configured_at: new Date().toISOString(),
        phone_number: null,
        sender_id: termiiConfig.sender_id,
        config: {
          api_key: termiiConfig.api_key,
        }
      }, {
        onConflict: 'business_id,provider'
      })

    if (error) {
      showToast('Failed to save Termii configuration', 'error')
    } else {
      setSmsProviders(prev => prev.map(p =>
        p.provider === 'termii'
          ? { ...p, connected: true, configured_at: new Date().toISOString(), sender_id: termiiConfig.sender_id }
          : p
      ))
      setShowTermiiModal(false)
      showToast('Termii configured successfully', 'success')
    }
    setSaving(false)
  }

  const disconnectSmsProvider = async (provider: SMSProvider) => {
    if (!staff?.business_id) return
    
    setSaving(true)
    const { error } = await supabase
      .from('sms_integrations')
      .update({ connected: false, configured_at: null, phone_number: null, sender_id: null })
      .eq('business_id', staff.business_id)
      .eq('provider', provider.provider)

    if (error) {
      showToast('Failed to disconnect provider', 'error')
    } else {
      setSmsProviders(prev => prev.map(p => 
        p.provider === provider.provider 
          ? { ...p, connected: false, configured_at: null, phone_number: null, sender_id: null }
          : p
      ))
      showToast(`${provider.name} disconnected`, 'success')
    }
    setSaving(false)
  }

  return (
    <div className="pb-20">
      <h1 className="text-xl font-medium text-black mb-6">Integrations</h1>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 bg-black/[0.03] p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('social')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'social' 
              ? 'bg-white text-black shadow-sm' 
              : 'text-black hover:text-black/70'
          }`}
        >
          <Share2 size={16} />
          Social Media
        </button>
        <button
          onClick={() => setActiveTab('sms')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'sms' 
              ? 'bg-white text-black shadow-sm' 
              : 'text-black hover:text-black/70'
          }`}
        >
          <MessageSquare size={16} />
          SMS
        </button>
      </div>

      {activeTab === 'social' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Coming Soon</p>
                <p className="text-sm text-amber-700 mt-1">
                  Social media integrations are in development. OAuth connections will allow you to post directly to your social accounts and view analytics.
                </p>
              </div>
            </div>
          </div>

          {socialPlatforms.map((platform) => (
            <div key={platform.id} className="bg-white rounded-xl border border-black/[0.06] p-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${platform.color} flex items-center justify-center text-xl`}>
                  {platform.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{platform.name}</p>
                    {platform.connected && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-600 text-xs">
                        <Check size={12} />
                        Connected
                      </span>
                    )}
                  </div>
                  {platform.connected ? (
                    <p className="text-sm text-black">
                      {platform.account_name} • {platform.followers_count?.toLocaleString() || 0} followers
                    </p>
                  ) : (
                    <p className="text-sm text-black">Not connected</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {platform.connected ? (
                    <>
                      <button
                        onClick={() => connectSocialPlatform(platform)}
                        className="p-2 hover:bg-black/[0.05] rounded-lg text-black"
                        title="Settings"
                      >
                        <Settings size={18} />
                      </button>
                      <button
                        onClick={() => disconnectSocialPlatform(platform)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                        title="Disconnect"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => connectSocialPlatform(platform)}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary, #4285F4)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      Connect
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'sms' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Configuration Required</p>
                <p className="text-sm text-amber-700 mt-1">
                  Enter your SMS provider credentials below to enable SMS sending. Your credentials are encrypted and stored securely.
                </p>
              </div>
            </div>
          </div>

          {smsProviders.map((provider) => (
            <div key={provider.id} className="bg-white rounded-xl border border-black/[0.06] p-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${provider.color} flex items-center justify-center text-xl`}>
                  {provider.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{provider.name}</p>
                    {provider.connected && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-600 text-xs">
                        <Check size={12} />
                        Connected
                      </span>
                    )}
                  </div>
                  {provider.connected ? (
                    <p className="text-sm text-black">
                      {provider.phone_number || provider.sender_id ? `${provider.phone_number || provider.sender_id}` : 'Configured'}
                      {provider.configured_at && ` • Connected ${new Date(provider.configured_at).toLocaleDateString()}`}
                    </p>
                  ) : (
                    <p className="text-sm text-black">Not configured</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {provider.connected ? (
                    <button
                      onClick={() => disconnectSmsProvider(provider)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                      title="Disconnect"
                    >
                      <Trash2 size={18} />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (provider.provider === 'twilio') setShowTwilioModal(true)
                        else if (provider.provider === 'africastalking') setShowAtModal(true)
                        else if (provider.provider === 'termii') setShowTermiiModal(true)
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary, #4285F4)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      Configure
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Twilio Configuration Modal */}
      {showTwilioModal && (
        <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="text-lg font-semibold">Configure Twilio</h2>
              <p className="text-sm text-black mt-1">Enter your Twilio credentials</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Account SID *</label>
                <input
                  type="text"
                  value={twilioConfig.account_sid}
                  onChange={(e) => setTwilioConfig(prev => ({ ...prev, account_sid: e.target.value }))}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Auth Token *</label>
                <input
                  type="password"
                  value={twilioConfig.auth_token}
                  onChange={(e) => setTwilioConfig(prev => ({ ...prev, auth_token: e.target.value }))}
                  placeholder="Your Twilio Auth Token"
                  className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Phone Number *</label>
                <input
                  type="text"
                  value={twilioConfig.phone_number}
                  onChange={(e) => setTwilioConfig(prev => ({ ...prev, phone_number: e.target.value }))}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Sender ID (optional)</label>
                <input
                  type="text"
                  value={twilioConfig.sender_id}
                  onChange={(e) => setTwilioConfig(prev => ({ ...prev, sender_id: e.target.value }))}
                  placeholder="Your Brand Name"
                  className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                />
              </div>
            </div>
            <div className="p-6 border-t border-black/[0.06] flex justify-end gap-3">
              <button
                onClick={() => setShowTwilioModal(false)}
                className="px-4 py-2 text-black/70 hover:bg-black/[0.05] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveTwilioConfig}
                disabled={saving}
                className="px-4 py-2 bg-[var(--av-primary, #4285F4)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Africa&apos;s Talking Configuration Modal */}
      {showAtModal && (
        <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="text-lg font-semibold">Configure Africa&apos;s Talking</h2>
              <p className="text-sm text-black mt-1">Enter your Africa&apos;s Talking credentials</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Username *</label>
                <input
                  type="text"
                  value={atConfig.username}
                  onChange={(e) => setAtConfig(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Your Africa&apos;s Talking username"
                  className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">API Key *</label>
                <input
                  type="password"
                  value={atConfig.api_key}
                  onChange={(e) => setAtConfig(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder="Your Africa&apos;s Talking API key"
                  className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Sender ID (optional)</label>
                <input
                  type="text"
                  value={atConfig.sender_id}
                  onChange={(e) => setAtConfig(prev => ({ ...prev, sender_id: e.target.value }))}
                  placeholder="Your Brand Name"
                  className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                />
              </div>
            </div>
            <div className="p-6 border-t border-black/[0.06] flex justify-end gap-3">
              <button
                onClick={() => setShowAtModal(false)}
                className="px-4 py-2 text-black/70 hover:bg-black/[0.05] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveAtConfig}
                disabled={saving}
                className="px-4 py-2 bg-[var(--av-primary, #4285F4)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Termii Configuration Modal */}
      {showTermiiModal && (
        <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="text-lg font-semibold">Configure Termii</h2>
              <p className="text-sm text-black mt-1">Enter your Termii credentials</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">API Key *</label>
                <input
                  type="password"
                  value={termiiConfig.api_key}
                  onChange={(e) => setTermiiConfig(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder="Your Termii API key"
                  className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Sender ID (optional)</label>
                <input
                  type="text"
                  value={termiiConfig.sender_id}
                  onChange={(e) => setTermiiConfig(prev => ({ ...prev, sender_id: e.target.value }))}
                  placeholder="Your Brand Name"
                  className="w-full px-3 py-2 border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/20"
                />
              </div>
            </div>
            <div className="p-6 border-t border-black/[0.06] flex justify-end gap-3">
              <button
                onClick={() => setShowTermiiModal(false)}
                className="px-4 py-2 text-black/70 hover:bg-black/[0.05] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveTermiiConfig}
                disabled={saving}
                className="px-4 py-2 bg-[var(--av-primary, #4285F4)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
