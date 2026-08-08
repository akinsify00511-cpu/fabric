import { useState, useEffect } from 'react'
import { Bell, Mail, Check, Save, RotateCcw, MessageSquare } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'

interface NotificationPreferences {
  // In-app
  in_app_onboarding: boolean
  in_app_tasks: boolean
  in_app_payments: boolean
  in_app_reminders: boolean
  in_app_marketing: boolean
  in_app_social: boolean
  in_app_system: boolean
  // Email
  email_onboarding: boolean
  email_tasks: boolean
  email_payments: boolean
  email_reminders: boolean
  email_marketing: boolean
  email_weekly_digest: boolean
  email_monthly_report: boolean
  email_feature_updates: boolean
  email_tips_tricks: boolean
  email_promotions: boolean
  // SMS
  sms_onboarding: boolean
  sms_tasks: boolean
  sms_payments: boolean
  sms_reminders: boolean
  sms_marketing: boolean
  sms_security: boolean
}

const defaultPreferences: NotificationPreferences = {
  // In-app
  in_app_onboarding: true,
  in_app_tasks: true,
  in_app_payments: true,
  in_app_reminders: true,
  in_app_marketing: false,
  in_app_social: true,
  in_app_system: true,
  // Email
  email_onboarding: true,
  email_tasks: true,
  email_payments: true,
  email_reminders: true,
  email_marketing: false,
  email_weekly_digest: true,
  email_monthly_report: true,
  email_feature_updates: false,
  email_tips_tricks: true,
  email_promotions: false,
  // SMS
  sms_onboarding: false,
  sms_tasks: false,
  sms_payments: true,
  sms_reminders: true,
  sms_marketing: false,
  sms_security: true,
}

export default function NotificationSettings() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences)

  useEffect(() => {
    loadPreferences()
  }, [staff?.user_id])

  async function loadPreferences() {
    if (!staff?.user_id) return
    setLoading(true)
    
    try {
      const { data } = await fetch(`/rest/v1/notification_preferences?user_id=eq.${staff.user_id}`, {
        headers: {
          'Content-Type': 'application/json',
          'apikey': (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${(import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''}`,
        },
      }).then(r => r.json())
      
      if (data && data.length > 0) {
        setPreferences({
          ...defaultPreferences,
          ...data[0],
        })
      }
    } catch (err) {
      console.error('Failed to load preferences:', err)
    }
    setLoading(false)
  }

  async function savePreferences() {
    if (!staff?.user_id) return
    setSaving(true)
    
    try {
      const response = await fetch(`/rest/v1/notification_preferences?user_id=eq.${staff.user_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${(import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          ...preferences,
          updated_at: new Date().toISOString(),
        }),
      })

      if (response.ok) {
        showToast('Preferences saved successfully!', 'success')
      } else {
        // Try inserting if not exists
        await fetch(`/rest/v1/notification_preferences`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '',
            'Authorization': `Bearer ${(import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''}`,
          },
          body: JSON.stringify({
            user_id: staff.user_id,
            ...preferences,
          }),
        })
        showToast('Preferences saved!', 'success')
      }
    } catch (err) {
      console.error('Failed to save preferences:', err)
      showToast('Failed to save preferences', 'error')
    }
    setSaving(false)
  }

  function resetToDefaults() {
    setPreferences(defaultPreferences)
    showToast('Reset to defaults', 'success')
  }

  function togglePreference(key: keyof NotificationPreferences) {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Notification Settings</h1>
          <p className="text-sm text-black mt-1">Choose how you want to be notified</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-black/[0.03]"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={savePreferences}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white text-sm disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* In-App Notifications */}
      <section className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Bell size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-semibold">In-App Notifications</h2>
            <p className="text-sm text-black">Notifications you see inside the app</p>
          </div>
        </div>

        <div className="space-y-4">
          <PreferenceToggle
            label="Onboarding & Getting Started"
            description="Welcome messages, setup guides, and first-step tips"
            checked={preferences.in_app_onboarding}
            onChange={() => togglePreference('in_app_onboarding')}
          />
          <PreferenceToggle
            label="Task Updates"
            description="When tasks are assigned, completed, or overdue"
            checked={preferences.in_app_tasks}
            onChange={() => togglePreference('in_app_tasks')}
          />
          <PreferenceToggle
            label="Payments & Billing"
            description="Payment confirmations and subscription updates"
            checked={preferences.in_app_payments}
            onChange={() => togglePreference('in_app_payments')}
          />
          <PreferenceToggle
            label="Reminders & Deadlines"
            description="Trial expiring, follow-ups, and important reminders"
            checked={preferences.in_app_reminders}
            onChange={() => togglePreference('in_app_reminders')}
          />
          <PreferenceToggle
            label="Team Activity"
            description="When team members join or interact"
            checked={preferences.in_app_social}
            onChange={() => togglePreference('in_app_social')}
          />
          <PreferenceToggle
            label="System Updates"
            description="Security alerts and account changes"
            checked={preferences.in_app_system}
            onChange={() => togglePreference('in_app_system')}
          />
          <PreferenceToggle
            label="Tips & Feature Highlights"
            description="Learn about features you might like"
            checked={preferences.in_app_marketing}
            onChange={() => togglePreference('in_app_marketing')}
            highlight
          />
        </div>
      </section>

      {/* Email Notifications */}
      <section className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Mail size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold">Email Notifications</h2>
            <p className="text-sm text-black">Get important updates delivered to your inbox</p>
          </div>
        </div>

        <div className="space-y-4">
          <PreferenceToggle
            label="Onboarding Emails"
            description="Welcome series and getting started guides"
            checked={preferences.email_onboarding}
            onChange={() => togglePreference('email_onboarding')}
          />
          <PreferenceToggle
            label="Task Notifications"
            description="Important task updates via email"
            checked={preferences.email_tasks}
            onChange={() => togglePreference('email_tasks')}
          />
          <PreferenceToggle
            label="Payment Confirmations"
            description="Receipts and payment confirmations"
            checked={preferences.email_payments}
            onChange={() => togglePreference('email_payments')}
          />
          <PreferenceToggle
            label="Trial & Subscription Reminders"
            description="Days left in trial and renewal reminders"
            checked={preferences.email_reminders}
            onChange={() => togglePreference('email_reminders')}
          />
          
          <div className="border-t border-black/[0.06] pt-4 mt-4">
            <p className="text-sm font-medium text-black mb-3">Marketing Emails</p>
            <PreferenceToggle
              label="Weekly Digest"
              description="Summary of your week's activity"
              checked={preferences.email_weekly_digest}
              onChange={() => togglePreference('email_weekly_digest')}
            />
            <PreferenceToggle
              label="Monthly Report"
              description="Performance insights and trends"
              checked={preferences.email_monthly_report}
              onChange={() => togglePreference('email_monthly_report')}
            />
            <PreferenceToggle
              label="Tips & Tutorials"
              description="How-to guides and best practices"
              checked={preferences.email_tips_tricks}
              onChange={() => togglePreference('email_tips_tricks')}
            />
            <PreferenceToggle
              label="New Features"
              description="Learn about new features and updates"
              checked={preferences.email_feature_updates}
              onChange={() => togglePreference('email_feature_updates')}
            />
            <PreferenceToggle
              label="Promotions & Offers"
              description="Special deals and promotional content"
              checked={preferences.email_promotions}
              onChange={() => togglePreference('email_promotions')}
              highlight
            />
          </div>
        </div>
      </section>

      {/* SMS Notifications */}
      <section className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <MessageSquare size={20} className="text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold">SMS Notifications</h2>
            <p className="text-sm text-black">Get important updates via text message</p>
          </div>
        </div>

        <div className="space-y-4">
          <PreferenceToggle
            label="Payment Confirmations"
            description="SMS alerts for payments and invoices"
            checked={preferences.sms_payments}
            onChange={() => togglePreference('sms_payments')}
          />
          <PreferenceToggle
            label="Reminders & Alerts"
            description="Task due dates, meetings, and deadlines"
            checked={preferences.sms_reminders}
            onChange={() => togglePreference('sms_reminders')}
          />
          <PreferenceToggle
            label="Security Alerts"
            description="Login alerts and account security notifications"
            checked={preferences.sms_security}
            onChange={() => togglePreference('sms_security')}
          />
          <PreferenceToggle
            label="Task Updates"
            description="When tasks are assigned or completed"
            checked={preferences.sms_tasks}
            onChange={() => togglePreference('sms_tasks')}
          />
          <PreferenceToggle
            label="Welcome Messages"
            description="Onboarding and welcome SMS"
            checked={preferences.sms_onboarding}
            onChange={() => togglePreference('sms_onboarding')}
          />
          <PreferenceToggle
            label="Promotions & Marketing"
            description="Special offers and promotional SMS"
            checked={preferences.sms_marketing}
            onChange={() => togglePreference('sms_marketing')}
            highlight
          />
        </div>

        <div className="mt-4 pt-4 border-t border-black/[0.06]">
          <p className="text-xs text-black">
            <strong>Note:</strong> SMS charges may apply based on your Termii plan. 
            Configure your SMS settings in <a href="/app/settings?tab=sms" className="text-blue-600 hover:underline">Settings</a>.
          </p>
        </div>
      </section>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
        <p>
          <strong>💡 Tip:</strong> You'll always receive emails for security-related notifications 
          and payment confirmations, regardless of your settings.
        </p>
      </div>
    </div>
  )
}

function PreferenceToggle({ 
  label, 
  description, 
  checked, 
  onChange, 
  highlight 
}: { 
  label: string
  description: string
  checked: boolean
  onChange: () => void
  highlight?: boolean
}) {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition ${
      highlight ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-black/10'
    }`}>
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only"
        />
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
          checked 
            ? 'bg-[var(--av-primary, #4285F4)] border-[var(--av-primary, #4285F4)]' 
            : 'border-black/20'
        }`}>
          {checked && <Check size={12} className="text-white" />}
        </div>
      </div>
      <div className="flex-1">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-black">{description}</div>
      </div>
    </label>
  )
}
