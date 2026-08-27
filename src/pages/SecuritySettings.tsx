import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { useFeatureFlag, FEATURE_FLAG_KEYS } from '../lib/useFeatureFlag'
import { useAnalytics, ANALYTICS_EVENTS } from '../lib/analytics'
import { BetaBadge } from '../components/BetaTesterGate'
import {
  Shield, Smartphone, Key, Clock, CheckCircle2, Trash2, AlertTriangle, Clock4, Fingerprint
} from 'lucide-react'
import { TOTP, Secret } from 'otpauth'
import { hashBackupCode } from '../lib/mfa'
import {
  registerPasskey, fetchMyPasskeys, revokePasskey, passkeysSupported, type PasskeyCredential,
} from '../lib/passkeys'

type MFAStatus = {
  enabled: boolean
  method: string
  totp_confirmed_at: string | null
  backup_codes_used: number
  backup_codes_total: number
  backup_codes_remaining: number
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
  const [,setTotpUrl] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'security' | 'audit'>('security')
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([])
  const [passkeyBusy, setPasskeyBusy] = useState(false)

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
      .maybeSingle()

    if (mfaData) {
      const storedHashes = (mfaData.backup_codes_hash || '').split(',').filter(Boolean)
      setMfa({
        enabled: mfaData.enabled,
        method: mfaData.method,
        totp_confirmed_at: mfaData.totp_confirmed_at,
        backup_codes_used: mfaData.backup_codes_used ?? 0,
        backup_codes_total: 10,
        backup_codes_remaining: storedHashes.length,
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

  useEffect(() => {
    if (user && passkeysSupported) {
      fetchMyPasskeys().then(setPasskeys)
    }
  }, [user])

  const handleRegisterPasskey = async () => {
    if (passkeyBusy) return
    setPasskeyBusy(true)
    try {
      const ok = await registerPasskey()
      if (ok) {
        showToast('Passkey added — you can now sign in with this device.', 'success')
        setPasskeys(await fetchMyPasskeys())
      } else {
        showToast('Could not add the passkey.', 'error')
      }
    } catch (e) {
      const msg = (e as Error)?.message || ''
      if (!/cancel|abort|notallowed/i.test(msg)) {
        showToast(msg || 'Could not add the passkey.', 'error')
      }
    } finally {
      setPasskeyBusy(false)
    }
  }

  const handleRevokePasskey = async (credentialId: string) => {
    const ok = await revokePasskey(credentialId)
    showToast(ok ? 'Passkey removed.' : 'Could not remove the passkey.', ok ? 'success' : 'error')
    if (ok) setPasskeys(await fetchMyPasskeys())
  }

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
    // Store only SHA-256 hashes (native crypto.subtle) — codes are one-time
    // secrets, so they are hashed like passwords, never stored in plaintext.
    const hashes = await Promise.all(codes.map(c => hashBackupCode(c)))

    const { error: upsertError } = await supabase.from('user_mfa').upsert({
      user_id: user.id,
      enabled: true,
      method: 'totp',
      totp_secret: totpSecret,
      totp_confirmed_at: new Date().toISOString(),
      backup_codes_hash: hashes.join(','),
      backup_codes_used: 0,
    })

    if (upsertError) {
      showToast('Failed to enable 2FA. Please try again.', 'error')
      return
    }

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
        <div className="h-8 bg-[var(--av-surface-3)] rounded w-48" />
        <div className="h-64 bg-[var(--av-surface-3)] rounded" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--av-text)]">Security</h1>
          <p className="text-sm text-[var(--av-text)] mt-0.5">Protect your account and monitor activity</p>
        </div>
      </div>

      <div className="flex gap-1 bg-[var(--av-surface-elevated)] rounded-xl p-1 border border-[var(--av-border-strong)]/[0.06] mb-6 w-fit">
        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'security'
              ? 'avenize-gradient text-white'
              : 'text-[var(--av-text)] hover:text-[var(--av-text)]'
          }`}
        >
          Security
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'audit'
              ? 'avenize-gradient text-white'
              : 'text-[var(--av-text)] hover:text-[var(--av-text)]'
          }`}
        >
          Audit Log
        </button>
      </div>

      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] overflow-hidden">
            <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  mfa?.enabled ? 'bg-[var(--av-success-soft)]' : 'bg-[var(--av-warning-soft)]'
                }`}>
                  {mfa?.enabled ? (
                    <Shield className="w-6 h-6 text-[var(--av-success)]" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-[var(--av-warning)]" />
                  )}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-medium">Two-Factor Authentication</h2>
                  <p className="text-sm text-[var(--av-text)]">
                    {mfa?.enabled
                      ? 'Your account is protected with 2FA'
                      : 'Add an extra layer of security to your account'}
                  </p>
                </div>
                {mfa?.enabled ? (
                  <span className="px-3 py-1 rounded-full bg-[var(--av-success-soft)] text-[var(--av-success)] text-sm font-medium">
                    Enabled
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-[var(--av-warning-soft)] text-[var(--av-warning)] text-sm font-medium">
                    Not Enabled
                  </span>
                )}
              </div>
            </div>

            <div className="p-6">
              {mfa?.enabled ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--av-success-soft)]">
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-[var(--av-success)]" />
                      <div>
                        <p className="text-sm font-medium">Authenticator App</p>
                        <p className="text-xs text-[var(--av-text)]">Enabled on {new Date(mfa.totp_confirmed_at!).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-[var(--av-success)]" />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-black/[0.02]">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-[var(--av-text)]" />
                      <div>
                        <p className="text-sm font-medium">Backup Codes</p>
                        <p className="text-xs text-[var(--av-text)]">
                          {mfa.backup_codes_remaining} of {mfa.backup_codes_total} remaining
                        </p>
                      </div>
                    </div>
                    <button className="text-sm text-[#8B5CF6] hover:underline">
                      View Codes
                    </button>
                  </div>

                  <button
                    onClick={disable2FA}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--av-danger-soft)] text-[var(--av-danger)] text-sm font-medium hover:bg-[var(--av-danger-soft)]"
                  >
                    Disable 2FA
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {!twoFactorEnabled && (
                    <div className="p-4 rounded-xl bg-[var(--av-warning-soft)] border border-[var(--av-warning)]/30">
                      <div className="flex items-start gap-3">
                        <Clock4 className="w-5 h-5 text-[var(--av-warning)] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                            Beta Feature
                            <BetaBadge />
                          </p>
                          <p className="text-xs text-[var(--av-warning)] mt-1">
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
                          <Smartphone className="w-6 h-6 text-[#8B5CF6] mb-2" />
                          <h3 className="text-sm font-medium mb-1">Authenticator App</h3>
                          <p className="text-xs text-[var(--av-text)]">
                            Use Google Authenticator, Authy, or any TOTP app
                          </p>
                        </div>
                        <div className="flex-1 p-4 rounded-xl bg-black/[0.02]">
                          <Key className="w-6 h-6 text-[#8B5CF6] mb-2" />
                          <h3 className="text-sm font-medium mb-1">Backup Codes</h3>
                          <p className="text-xs text-[var(--av-text)]">
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

          <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Password</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Last changed</p>
                <p className="text-xs text-[var(--av-text)]">Never</p>
              </div>
              <button className="px-4 py-2 rounded-lg border border-[var(--av-border)] text-sm hover:bg-[var(--av-surface-3)]">
                Change Password
              </button>
            </div>
          </div>

          {/* Passkeys — internal WebAuthn (no external auth provider) */}
          {passkeysSupported && (
            <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <Fingerprint size={16} className="text-[var(--av-primary)]" /> Passkeys
                </h2>
                <button
                  onClick={handleRegisterPasskey}
                  disabled={passkeyBusy}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white hover:opacity-90 disabled:opacity-50"
                >
                  {passkeyBusy ? 'Adding…' : 'Add passkey'}
                </button>
              </div>
              <p className="text-xs text-[var(--av-text-muted)] mb-4">
                Sign in with fingerprint, face, or device PIN — no password needed. Verification happens on Avenize's own servers.
              </p>
              {passkeys.length === 0 ? (
                <p className="text-xs text-[var(--av-text-muted)] bg-black/[0.02] rounded-xl p-3">
                  No passkeys yet. Add one to enable one-tap sign-in on this device.
                </p>
              ) : (
                <div className="space-y-2">
                  {passkeys.map((pk) => (
                    <div key={pk.id} className="flex items-center gap-3 p-3 rounded-xl bg-black/[0.02]">
                      <Fingerprint size={16} className="text-[var(--av-primary)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {pk.device_name || 'Passkey'}
                          {pk.backed_up && <span className="text-[10px] text-[var(--av-text-muted)]"> (synced)</span>}
                        </p>
                        <p className="text-xs text-[var(--av-text-muted)]">
                          Added {new Date(pk.created_at).toLocaleDateString()}
                          {pk.last_used_at && ` · used ${new Date(pk.last_used_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevokePasskey(pk.credential_id)}
                        title="Remove passkey"
                        className="p-1.5 rounded-lg text-[var(--av-danger)] hover:bg-[var(--av-danger-soft,#FDECEA)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">Active Sessions</h2>
              <button className="text-xs text-[var(--av-danger)] hover:underline">
                Sign out all devices
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-black/[0.02]">
                <div className="w-10 h-10 rounded-lg bg-[#8B5CF6]/10 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-[#8B5CF6]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Current Device</p>
                  <p className="text-xs text-[var(--av-text)]">Active now</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-[var(--av-success-soft)] text-[var(--av-success)]">Active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] overflow-hidden">
          <div className="p-4 border-b border-[var(--av-border-strong)]/[0.06]">
            <h2 className="text-sm font-medium">Activity Log</h2>
            <p className="text-xs text-[var(--av-text)]">Recent actions on your account</p>
          </div>
          <div className="divide-y divide-black/[0.04]">
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-[var(--av-text)]">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No activity recorded yet</p>
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-4 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    log.action === 'delete' ? 'bg-[var(--av-danger-soft)]' :
                    log.action === 'login' ? 'bg-[var(--av-success-soft)]' :
                    'bg-[var(--av-primary-soft)]'
                  }`}>
                    {log.action === 'login' ? (
                      <CheckCircle2 className="w-4 h-4 text-[var(--av-success)]" />
                    ) : log.action === 'delete' ? (
                      <Trash2 className="w-4 h-4 text-[var(--av-danger)]" />
                    ) : (
                      <Clock className="w-4 h-4 text-[var(--av-primary)]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{getActionLabel(log.action)}</span>
                      {' '}
                      <span className="text-[var(--av-text)]/60">{log.resource_type}</span>
                      {log.resource_name && `: ${log.resource_name}`}
                    </p>
                    <p className="text-xs text-[var(--av-text)]">
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
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06]">
              <h2 className="text-lg font-semibold">Set Up 2FA</h2>
              <p className="text-sm text-[var(--av-text)]">
                {setupStep === 'verify' && 'Enter the 6-digit code from your authenticator app'}
                {setupStep === 'backup' && 'Save your backup codes'}
              </p>
            </div>

            <div className="p-6">
              {setupStep === 'verify' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[var(--av-surface)]">
                    <p className="text-sm font-medium mb-2">Manual entry code:</p>
                    <code className="text-xs font-mono break-all bg-[var(--av-surface)] px-3 py-2 rounded block">
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
                      className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)] text-center text-2xl tracking-widest"
                      maxLength={6}
                      autoFocus
                    />
                    <p className="text-xs text-[var(--av-text)] mt-2 text-center">
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
                  <div className="p-4 rounded-xl bg-[var(--av-success-soft)] border border-[var(--av-success-soft)]">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-5 h-5 text-[var(--av-success)]" />
                      <p className="text-sm font-medium text-[var(--av-success)]">2FA Enabled!</p>
                    </div>
                    <p className="text-xs text-[var(--av-success)]">
                      Your account is now more secure.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--av-warning-soft)] border border-[var(--av-warning-soft)]">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-[var(--av-warning)] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-[var(--av-warning)]">Save these codes!</p>
                        <p className="text-xs text-[var(--av-warning)] mt-1">
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

            <div className="px-6 py-4 border-t border-[var(--av-border-strong)]/[0.06]">
              <button
                onClick={() => {
                  setShowSetup2FA(false)
                  setVerifyCode('')
                }}
                className="w-full text-center text-sm text-[var(--av-text)] hover:text-[var(--av-text)]"
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
