import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Shield, Smartphone, Key, Clock, CheckCircle2, XCircle, Download,
  Trash2, AlertTriangle, Eye, EyeOff, Copy, RefreshCw, QrCode
} from 'lucide-react'

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

export default function SecuritySettings() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [mfa, setMfa] = useState<MFAStatus | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showSetup2FA, setShowSetup2FA] = useState(false)
  const [setupStep, setSetupStep] = useState<'qr' | 'verify' | 'backup'>('qr')
  const [totpSecret, setTotpSecret] = useState('')
  const [totpUrl, setTotpUrl] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'security' | 'audit'>('security')

  const loadSecurity = async () => {
    if (!user) return
    setLoading(true)

    // Load MFA status
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

    // Load audit logs
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

  const generateTotpSecret = () => {
    // In production, use a proper TOTP library like otpauth
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let secret = ''
    for (let i = 0; i < 32; i++) {
      secret += chars[Math.floor(Math.random() * chars.length)]
    }
    return secret
  }

  const setup2FA = async () => {
    if (!user) return

    // Generate secret
    const secret = generateTotpSecret()
    const issuer = encodeURIComponent('Avenize')
    const account = encodeURIComponent(user.email || 'user')

    // Create TOTP URL (for authenticator apps)
    const url = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`

    setTotpSecret(secret)
    setTotpUrl(url)
    setShowSetup2FA(true)
    setSetupStep('qr')

    // In production, generate QR code here
  }

  const verifyAndEnable2FA = async () => {
    if (!user || verifyCode.length !== 6) {
      showToast('Please enter a 6-digit code', 'error')
      return
    }

    // In production, verify the code using otpauth
    // For demo, accept any 6 digits
    if (verifyCode.length === 6) {
      // Generate backup codes
      const codes = Array.from({ length: 10 }, () =>
        `${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      )

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
      showToast('2FA enabled successfully!', 'success')
    }
  }

  const disable2FA = async () => {
    if (!user) return
    if (!confirm('Are you sure you want to disable 2FA? Your account will be less secure.')) return

    await supabase.from('user_mfa').delete().eq('user_id', user.id)
    setMfa(null)
    showToast('2FA has been disabled', 'info')
  }

  const downloadBackupCodes = () => {
    const content = `YOUR BACKUP CODES - Store this securely!
    
These codes can be used to access your account if you lose your phone.

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
      invite: 'Invited',
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

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        {[
          { id: 'security', label: 'Security' },
          { id: 'audit', label: 'Audit Log' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.id
                ? 'fabric-gradient text-white'
                : 'text-black/50 hover:text-black'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECURITY TAB */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* 2FA Card */}
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
                    onClick={setup2FA}
                    className="w-full px-4 py-3 rounded-xl fabric-gradient text-white text-sm font-medium"
                  >
                    Set Up 2FA
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Password */}
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

          {/* Active Sessions */}
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

      {/* AUDIT LOG TAB */}
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

      {/* 2FA Setup Modal */}
      {showSetup2FA && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="text-lg font-semibold">Set Up 2FA</h2>
              <p className="text-sm text-black/50">
                {setupStep === 'qr' && 'Scan this QR code with your authenticator app'}
                {setupStep === 'verify' && 'Enter the 6-digit code from your app'}
                {setupStep === 'backup' && 'Save your backup codes'}
              </p>
            </div>

            <div className="p-6">
              {setupStep === 'qr' && (
                <div className="text-center">
                  {/* QR Code placeholder */}
                  <div className="w-48 h-48 mx-auto bg-black/5 rounded-xl flex items-center justify-center mb-4">
                    <QrCode className="w-24 h-24 text-black/20" />
                  </div>
                  <p className="text-xs text-black/50 mb-4">
                    Manual code: <code className="bg-black/5 px-2 py-1 rounded">{totpSecret}</code>
                  </p>
                  <button
                    onClick={() => setSetupStep('verify')}
                    className="w-full py-3 rounded-xl fabric-gradient text-white text-sm font-medium"
                  >
                    Continue
                  </button>
                </div>
              )}

              {setupStep === 'verify' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">Verification Code</label>
                    <input
                      type="text"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full px-4 py-3 rounded-xl border border-black/10 text-center text-2xl tracking-widest"
                      maxLength={6}
                    />
                    <p className="text-xs text-black/40 mt-2 text-center">
                      Enter the 6-digit code from your authenticator app
                    </p>
                  </div>
                  <button
                    onClick={verifyAndEnable2FA}
                    disabled={verifyCode.length !== 6}
                    className="w-full py-3 rounded-xl fabric-gradient text-white text-sm font-medium disabled:opacity-50"
                  >
                    Verify & Enable
                  </button>
                </div>
              )}

              {setupStep === 'backup' && (
                <div className="space-y-4">
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
                    className="w-full py-3 rounded-xl fabric-gradient text-white text-sm font-medium"
                  >
                    Download Codes & Finish
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-black/[0.06]">
              <button
                onClick={() => setShowSetup2FA(false)}
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
