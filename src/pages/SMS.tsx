import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { TermiiSMS, SMSUtils, SMS_TEMPLATES } from '../lib/smsService'
import {
  MessageSquare, Save, Eye, EyeOff, Check, AlertCircle, RefreshCw,
  Send, History, Settings, Zap, ExternalLink, Copy
} from 'lucide-react'

interface SMSSettings {
  apiKey: string
  senderId: string
  channel: 'dnd' | 'whatsapp' | 'generic'
}

interface SMSLog {
  id: string
  recipient: string
  message: string
  message_id: string | null
  status: string
  error_message: string | null
  channel: string | null
  created_at: string
}

const CHANNELS = [
  { value: 'dnd', label: 'DND (Do Not Disturb)', description: 'Best for transactional messages. Bypasses DND restrictions.' },
  { value: 'whatsapp', label: 'WhatsApp', description: 'Send messages via WhatsApp Business.' },
  { value: 'generic', label: 'Generic', description: 'Standard SMS channel. May be blocked by DND.' },
]

export default function SMSSettings() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'settings' | 'history' | 'templates'>('settings')
  
  // Settings state
  const [settings, setSettings] = useState<SMSSettings>({
    apiKey: '',
    senderId: 'Avenize',
    channel: 'dnd',
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [checkingBalance, setCheckingBalance] = useState(false)
  
  // Test SMS state
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('Hello! This is a test SMS from Avenize.')
  const [sendingTest, setSendingTest] = useState(false)
  
  // History state
  const [smsHistory, setSmsHistory] = useState<SMSLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(0)
  const historyPerPage = 20

  // Load settings
  useEffect(() => {
    loadSettings()
  }, [staff?.user_id])

  // Load history when tab changes
  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory()
    }
  }, [activeTab, historyPage])

  async function loadSettings() {
    setLoading(true)
    try {
      const { data: apiKey } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'termii_api_key')
        .single()
      
      const { data: senderId } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'termii_sender_id')
        .single()
      
      const { data: channel } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'termii_channel')
        .single()

      setSettings({
        apiKey: apiKey?.value || '',
        senderId: senderId?.value || 'Avenize',
        channel: (channel?.value as 'dnd' | 'whatsapp' | 'generic') || 'dnd',
      })
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
    setLoading(false)
  }

  async function saveSettings() {
    if (!settings.apiKey) {
      showToast('Please enter your Termii API key', 'error')
      return
    }
    if (!settings.senderId) {
      showToast('Please enter a sender ID', 'error')
      return
    }

    setSaving(true)
    try {
      await supabase
        .from('settings')
        .upsert({ key: 'termii_api_key', value: settings.apiKey, type: 'secret' }, { onConflict: 'key' })

      await supabase
        .from('settings')
        .upsert({ key: 'termii_sender_id', value: settings.senderId, type: 'string' }, { onConflict: 'key' })

      await supabase
        .from('settings')
        .upsert({ key: 'termii_channel', value: settings.channel, type: 'string' }, { onConflict: 'key' })

      showToast('SMS settings saved!', 'success')
      
      // Check balance after saving
      checkBalance()
    } catch (error) {
      console.error('Failed to save settings:', error)
      showToast('Failed to save settings', 'error')
    }
    setSaving(false)
  }

  async function checkBalance() {
    setCheckingBalance(true)
    try {
      const result = await TermiiSMS.getBalance()
      if (result.success && result.balance !== undefined) {
        setBalance(result.balance)
        showToast(`Balance: ₦${result.balance.toFixed(2)}`, 'success')
      } else {
        setBalance(null)
        showToast(result.error || 'Failed to check balance', 'error')
      }
    } catch (error) {
      console.error('Failed to check balance:', error)
      showToast('Failed to check balance', 'error')
    }
    setCheckingBalance(false)
  }

  async function sendTestSMS() {
    if (!testPhone) {
      showToast('Please enter a phone number', 'error')
      return
    }
    if (!testMessage) {
      showToast('Please enter a message', 'error')
      return
    }

    if (!TermiiSMS.isValidPhoneNumber(testPhone)) {
      showToast('Please enter a valid Nigerian phone number', 'error')
      return
    }

    setSendingTest(true)
    try {
      const result = await TermiiSMS.sendViaEdgeFunction({
        to: testPhone,
        message: testMessage,
        channel: settings.channel as 'dnd' | 'whatsapp' | 'generic',
      })

      if (result.success) {
        showToast('Test SMS sent successfully!', 'success')
        // Reload history
        loadHistory()
      } else {
        showToast(result.error || 'Failed to send SMS', 'error')
      }
    } catch (error) {
      console.error('Failed to send test SMS:', error)
      showToast('Failed to send test SMS', 'error')
    }
    setSendingTest(false)
  }

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(historyPage * historyPerPage, (historyPage + 1) * historyPerPage - 1)

      if (error) throw error
      setSmsHistory((data as SMSLog[]) || [])
    } catch (error) {
      console.error('Failed to load history:', error)
      showToast('Failed to load SMS history', 'error')
    }
    setHistoryLoading(false)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    showToast('Copied to clipboard', 'success')
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-black/10 rounded w-48" />
        <div className="h-64 bg-black/10 rounded" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-black">SMS Settings</h1>
          <p className="text-sm text-black mt-0.5">Configure Termii SMS for notifications</p>
        </div>
        {balance !== null && (
          <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg">
            <Zap size={16} />
            <span className="text-sm font-medium">Balance: ₦{balance.toFixed(2)}</span>
            <button onClick={checkBalance} disabled={checkingBalance} className="ml-1 hover:bg-green-100 p-1 rounded">
              <RefreshCw size={14} className={checkingBalance ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        {[
          { id: 'settings', label: 'Settings', icon: Settings },
          { id: 'history', label: 'History', icon: History },
          { id: 'templates', label: 'Templates', icon: MessageSquare },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'avenize-gradient text-white'
                  : 'text-black hover:text-black'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* API Configuration */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="font-semibold mb-4">Termii Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.apiKey}
                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                    placeholder="Enter your Termii API key"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 focus:border-[#4285F4] focus:ring-2 focus:ring-[#4285F4]/20 outline-none pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-black hover:text-black"
                  >
                    {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-black mt-1.5">
                  Get your API key from <a href="https://termii.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">termii.com <ExternalLink size={10} className="inline" /></a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Sender ID</label>
                <input
                  type="text"
                  value={settings.senderId}
                  onChange={(e) => setSettings({ ...settings, senderId: e.target.value })}
                  placeholder="e.g., Avenize"
                  maxLength={11}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 focus:border-[#4285F4] focus:ring-2 focus:ring-[#4285F4]/20 outline-none"
                />
                <p className="text-xs text-black mt-1.5">
                  Alphanumeric sender ID (up to 11 characters)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Default Channel</label>
                <div className="space-y-2">
                  {CHANNELS.map((channel) => (
                    <label
                      key={channel.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        settings.channel === channel.value
                          ? 'border-[#4285F4] bg-[#4285F4]/5'
                          : 'border-black/10 hover:bg-black/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="channel"
                        value={channel.value}
                        checked={settings.channel === channel.value}
                        onChange={(e) => setSettings({ ...settings, channel: e.target.value as typeof settings.channel })}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium text-sm">{channel.label}</div>
                        <div className="text-xs text-black">{channel.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4285F4] text-white font-medium hover:opacity-90 disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  onClick={checkBalance}
                  disabled={checkingBalance || !settings.apiKey}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 hover:bg-black/10 disabled:opacity-50"
                >
                  <RefreshCw size={16} className={checkingBalance ? 'animate-spin' : ''} />
                  {checkingBalance ? 'Checking...' : 'Check Balance'}
                </button>
              </div>
            </div>
          </div>

          {/* Test SMS */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="font-semibold mb-4">Send Test SMS</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="e.g., 08012345678 or +2348012345678"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 focus:border-[#4285F4] focus:ring-2 focus:ring-[#4285F4]/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Message</label>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 focus:border-[#4285F4] focus:ring-2 focus:ring-[#4285F4]/20 outline-none resize-none"
                />
                <div className="flex justify-between mt-1.5">
                  <p className="text-xs text-black">
                    Estimated segments: {SMSUtils.calculateSMSCount(testMessage)}
                  </p>
                  <p className="text-xs text-black">
                    {testMessage.length} / 160 characters
                  </p>
                </div>
              </div>

              <button
                onClick={sendTestSMS}
                disabled={sendingTest || !settings.apiKey}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
              >
                <Send size={16} />
                {sendingTest ? 'Sending...' : 'Send Test SMS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
          <div className="p-4 border-b border-black/[0.06] flex items-center justify-between">
            <h2 className="font-semibold">SMS History</h2>
            <button
              onClick={loadHistory}
              disabled={historyLoading}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {historyLoading ? (
            <div className="p-8 text-center text-black">Loading...</div>
          ) : smsHistory.length === 0 ? (
            <div className="p-8 text-center text-black">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
              <p>No SMS history yet</p>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead className="bg-black/[0.02]">
                  <tr className="text-left text-xs font-medium text-black uppercase">
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {smsHistory.map((sms) => (
                    <tr key={sms.id} className="hover:bg-black/10">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{sms.recipient}</span>
                          <button
                            onClick={() => copyToClipboard(sms.recipient)}
                            className="text-black hover:text-black"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-xs truncate text-sm" title={sms.message}>
                          {sms.message}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          sms.status === 'sent' ? 'bg-green-100 text-green-700' :
                          sms.status === 'delivered' ? 'bg-blue-100 text-blue-700' :
                          sms.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {sms.status === 'failed' && <AlertCircle size={12} />}
                          {SMSUtils.getStatusName(sms.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-black">
                        {SMSUtils.formatSMSTime(sms.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="p-4 border-t border-black/[0.06] flex items-center justify-between">
                <button
                  onClick={() => setHistoryPage(Math.max(0, historyPage - 1))}
                  disabled={historyPage === 0}
                  className="px-3 py-1.5 rounded-lg border border-black/10 text-sm hover:bg-black/10 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-black">
                  Page {historyPage + 1}
                </span>
                <button
                  onClick={() => setHistoryPage(historyPage + 1)}
                  disabled={smsHistory.length < historyPerPage}
                  className="px-3 py-1.5 rounded-lg border border-black/10 text-sm hover:bg-black/10 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
            <p>
              <strong>💡 Tip:</strong> These templates use variable placeholders like <code className="bg-blue-100 px-1 rounded">{'{{customer_name}}'}</code> that will be replaced with actual values when sending.
            </p>
          </div>

          {Object.entries(SMS_TEMPLATES).map(([slug, template]) => (
            <div key={slug} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium">{template.name}</h3>
                  <p className="text-xs text-black">Slug: {template.slug}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(template.message)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Copy size={12} />
                  Copy
                </button>
              </div>
              <p className="text-sm bg-black/[0.03] p-3 rounded-lg">
                {template.message}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {template.variables.map((variable) => (
                  <code key={variable} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                    {'{{' + variable + '}}'}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
