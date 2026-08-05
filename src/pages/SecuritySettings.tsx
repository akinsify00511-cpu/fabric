import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { useFeatureFlag, FEATURE_FLAG_KEYS } from '../lib/useFeatureFlag'
import { useAnalytics, ANALYTICS_EVENTS } from '../lib/analytics'
import BetaTesterGate from '../components/BetaTesterGate'
import { BetaBadge, FeatureComingSoon } from '../components/BetaTesterGate'
import {
  Shield, Smartphone, Key, Clock, CheckCircle2, Trash2, AlertTriangle, Clock4, Sparkles
} from 'lucide-react'
import { TOTP, Secret } from 'otpauth'

type MFAStatus = {
  enabled: boolean
  method: string
  totp_confirmed_at: string | null
  backup_codes_used: number
}

type AuditLog = {
  id: string
  action: string
  resource_type: string
  resource_name: string
  created_at: string
  ip_address: string
}

// Secure random string using crypto API
function generateSecureRandom(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const randomValues = new Uint32Array(length)
  crypto.getRandomValues(randomValues)
  return Array.from(randomValues, v => chars[v % chars.length]).join('')
}

// Generate backup codes with secure random
function generateBackupCodes(count: number): string[] {
  return Array.from({ length: count }, () => {
    const part1 = generateSecureRandom(4)
    const part2 = generateSecureRandom(4)
    return `${part1}-${part2}`
  })
}

export default function SecuritySettings() {
  const { session } = useAuth()
  const { showToast } = useToast()
  const { track } = useAnalytics()
  const [mfa, setMfa] = useState<MFAStatus | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showSetup2FA, setShowSetup2FA] = useState(false)
  const [setupStep, setSetupStep] = useState<'verify' | 'backup'>('verify')
  const [totpSecret, setTotpSecret] = useState('')
  const [totpUrl, setTotpUrl] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'security' | 'audit'>('security')

  // Feature flag gating - 2FA is behind a flag, defaulted off
  const twoFactorEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.TWO_FACTOR_AUTH)
  const user = session?.user

  const loadSecurity = async () => {
    if (!user) return
    setLoading(true)

    const { data: mfaData } = await supabase
      .from('user_mfa')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (mfaData) {
      setMfa({
        enabled: mfaData.enabled,
        method: mfaData.method,
        totp_confirmed_at: mfaData.totp_confirmed_at,
        backup_codes_used: mfaData.backup_codes_used,
      })
    }

    const { data: logsData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    setAuditLogs((logsData as AuditLog[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadSecurity()
  }, [user])

  const setup2FA = async () => {
    if (!user) return

    // Generate secure TOTP secret
    const secret = new Secret()
    const issuer = 'Avenize'
    const account = user.email || 'user'

    // Create proper TOTP
    const totp = new TOTP({
      issuer,
      label: account,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    })

    const url = totp.toString()
    const secretValue = secret.bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '').toUpperCase()

    setTotpSecret(secretValue)
    setTotpUrl(url)
    setShowSetup2FA(true)
    setSetupStep('verify')
  }

  const verifyAndEnable2FA = async () => {
    if (!user || verifyCode.length !== 6) {
      showToast('Please enter a 6-digit code', 'error')
      return
    }

    // Verify TOTP using otpauth
    const totp = new TOTP({
      issuer: 'Avenize',
      label: user.email || 'user',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(totpSecret.replace(/[^A-Z2-7]/g, '').toUpperCase()),
    })

    const delta = totp.validate({ token: verifyCode, window: 1 })

    if (delta === null) {
      showToast('Invalid code. Please check your authenticator app and try again.', 'error')
      return
    }

    // Generate backup codes with secure random
    const codes = generateBackupCodes(10)

    await supabase.from('user_mfa').upsert({
      user_id: user.id,
      enabled: true,
      method: 'totp',
      totp_secret: totpSecret,
      totp_confirmed_at: new Date().toISOString(),
      backup_codes: codes.join(','),
      backup_codes_used: 0,
    })

    setBackupCodes(codes)
    setSetupStep('backup')
    loadSecurity()
    showToast('2FA enabled successfully!', 'success')
  }

  const disable2FA = async () => {
    if (!user) return
    if (!confirm('Are you sure you want to disable 2FA? Your account will be less secure.')) return

    await supabase.from('user_mfa').delete().eq('user_id', user.id)
    setMfa(null)
    setShowSetup2FA(false)
    showToast('2FA has been disabled', 'info')
  }

  const downloadBackupCodes = () => {
    const content = `AVENIZE BACKUP CODES - Store this securely!

${backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

Each code can only be used once!`

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'avenize-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      login: 'Logged in',
      logout: 'Logged out',
      create: 'Created',
      update: 'Updated',
      delete: 'Deleted',
      export: 'Exported',
    }
    return labels[action] || action
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
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Security</h1>
          <p className="text-sm text-black/50 mt-0.5">Protect your account and monitor activity</p>
        </div>
      </div>

      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'security'
              ? 'avenize-gradient text-white'
              : 'text-black/50 hover:text-black'
          }`}
        >
          Security
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'audit'
              ? 'avenize-gradient text-white'
              : 'text-black/50 hover:text-black'
          }`}
        >
          Audit Log
        </button>
      </div>

      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
            <div className="p-6 border-b border-black/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  mfa?.enabled ? 'bg-green-100' : 'bg-yellow-100'
                }`}>
                  {mfa?.enabled ? (
                    <Shield className="w-6 h-6 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-yellow-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-medium">Two-Factor Authentication</h2>
                  <p className="text-sm text-black/50">
                    {mfa?.enabled
                      ? 'Your account is protected with 2FA'
                      : 'Add an extra layer of security to your account'}
                  </p>
                </div>
                {mfa?.enabled ? (
                  <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                    Enabled
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-medium">
                    Not Enabled
                  </span>
                )}
              </div>
            </div>

            <div className="p-6">
              {mfa?.enabled ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-green-50">
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Authenticator App</p>
                        <p className="text-xs text-black/50">Enabled on {new Date(mfa.totp_confirmed_at!).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-black/[0.02]">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-black/40" />
                      <div>
                        <p className="text-sm font-medium">Backup Codes</p>
                        <p className="text-xs text-black/50">
                          {10 - mfa.backup_codes_used} of 10 remaining
                        </p>
                      </div>
                    </div>
                    <button className="text-sm text-[var(--avenize-accent-end)] hover:underline">
                      View Codes
                    </button>
                  </div>

                  <button
                    onClick={disable2FA}
                    className="w-full px-4 py-3 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50"
                  >
                    Disable 2FA
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {!twoFactorEnabled && (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="flex items-start gap-3">
                        <Clock4 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                            Beta Feature
                            <BetaBadge />
                          </p>
                          <p className="text-xs text-amber-700 mt-1">
                            Two-factor authentication is being tested with beta users. Contact support if you'd like early access.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {twoFactorEnabled && !mfa?.enabled && (
                    <>
                      <div className="flex gap-4">
                        <div className="flex-1 p-4 rounded-xl bg-black/[0.02]">
                          <Smartphone className="w-6 h-6 text-[var(--avenize-accent-end)] mb-2" />
                          <h3 className="text-sm font-medium mb-1">Authenticator App</h3>
                          <p className="text-xs text-black/50">
                            Use Google Authenticator, Authy, or any TOTP app
                          </p>
                        </div>
                        <div className="flex-1 p-4 rounded-xl bg-black/[0.02]">
                          <Key className="w-6 h-6 text-[var(--avenize-accent-end)] mb-2" />
                          <h3 className="text-sm font-medium mb-1">Backup Codes</h3>
                          <p className="text-xs text-black/50">
                            10 one-time use codes for emergency access
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          track(ANALYTICS_EVENTS.SETTINGS_2FA_ENABLED)
                          setup2FA()
                        }}
                        className="w-full px-4 py-3 rounded-xl avenize-gradient text-white text-sm font-medium"
                      >
                        Set Up 2FA
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Password</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Last changed</p>
                <p className="text-xs text-black/50">Never</p>
              </div>
              <button className="px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-black/[0.02]">
                Change Password
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">Active Sessions</h2>
              <button className="text-xs text-red-500 hover:underline">
                Sign out all devices
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-black/[0.02]">
                <div className="w-10 h-10 rounded-lg bg-[var(--avenize-accent-end)]/10 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-[var(--avenize-accent-end)]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Current Device</p>
                  <p className="text-xs text-black/50">Active now</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
          <div className="p-4 border-b border-black/[0.06]">
            <h2 className="text-sm font-medium">Activity Log</h2>
            <p className="text-xs text-black/50">Recent actions on your account</p>
          </div>
          <div className="divide-y divide-black/[0.04]">
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-black/40">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No activity recorded yet</p>
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-4 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    log.action === 'delete' ? 'bg-red-100' :
                    log.action === 'login' ? 'bg-green-100' :
                    'bg-blue-100'
                  }`}>
                    {log.action === 'login' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : log.action === 'delete' ? (
                      <Trash2 className="w-4 h-4 text-red-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{getActionLabel(log.action)}</span>
                      {' '}
                      <span className="text-black/60">{log.resource_type}</span>
                      {log.resource_name && `: ${log.resource_name}`}
                    </p>
                    <p className="text-xs text-black/40">
                      {new Date(log.created_at).toLocaleString()}
                      {log.ip_address && ` • ${log.ip_address}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showSetup2FA && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="text-lg font-semibold">Set Up 2FA</h2>
              <p className="text-sm text-black/50">
                {setupStep === 'verify' && 'Enter the 6-digit code from your authenticator app'}
                {setupStep === 'backup' && 'Save your backup codes'}
              </p>
            </div>

            <div className="p-6">
              {setupStep === 'verify' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50">
                    <p className="text-sm font-medium mb-2">Manual entry code:</p>
                    <code className="text-xs font-mono break-all bg-white px-3 py-2 rounded block">
                      {totpSecret.match(/.{1,4}/g)?.join(' ') || totpSecret}
                    </code>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium block mb-2">Verification Code</label>
                    <input
                      type="text"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full px-4 py-3 rounded-xl border border-black/10 text-center text-2xl tracking-widest"
                      maxLength={6}
                      autoFocus
                    />
                    <p className="text-xs text-black/40 mt-2 text-center">
                      Enter the 6-digit code from your authenticator app
                    </p>
                  </div>
                  <button
                    onClick={verifyAndEnable2FA}
                    disabled={verifyCode.length !== 6}
                    className="w-full py-3 rounded-xl avenize-gradient text-white text-sm font-medium disabled:opacity-50"
                  >
                    Verify & Enable
                  </button>
                </div>
              )}

              {setupStep === 'backup' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <p className="text-sm font-medium text-green-800">2FA Enabled!</p>
                    </div>
                    <p className="text-xs text-green-700">
                      Your account is now more secure.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">Save these codes!</p>
                        <p className="text-xs text-yellow-700 mt-1">
                          Store them securely. Each code can only be used once.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {backupCodes.map((code, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg bg-black/[0.05] font-mono text-sm">
                        {code}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      downloadBackupCodes()
                      setShowSetup2FA(false)
                    }}
                    className="w-full py-3 rounded-xl avenize-gradient text-white text-sm font-medium"
                  >
                    Download Codes & Finish
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-black/[0.06]">
              <button
                onClick={() => {
                  setShowSetup2FA(false)
                  setVerifyCode('')
                }}
                className="w-full text-center text-sm text-black/50 hover:text-black"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
