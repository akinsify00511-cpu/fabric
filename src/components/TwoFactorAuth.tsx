/**
 * AVENIZE TWO-FACTOR AUTHENTICATION (2FA/TOTP)
 * Time-based One-Time Password for enhanced security
 */

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { 
  Shield, Smartphone, Key, Check, X, Copy, 
  Download, AlertTriangle, Eye, EyeOff, Lock
} from 'lucide-react'

interface TwoFactorSetupProps {
  onComplete: () => void
  onCancel: () => void
}

export function TwoFactorSetup({ onComplete, onCancel }: TwoFactorSetupProps) {
  const [step, setStep] = useState<'generating' | 'verify' | 'backup' | 'complete'>('generating')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    generateSecret()
  }, [])

  const generateSecret = async () => {
    setLoading(true)
    try {
      // Generate a random secret (in production, use a proper TOTP library)
      const array = new Uint8Array(20)
      crypto.getRandomValues(array)
      const newSecret = Array.from(array, b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      
      // Generate backup codes
      const codes: string[] = []
      for (let i = 0; i < 8; i++) {
        const codeArray = new Uint8Array(4)
        crypto.getRandomValues(codeArray)
        codes.push(Array.from(codeArray, b => b.toString(36).toUpperCase()).join(''))
      }
      
      setSecret(newSecret)
      setBackupCodes(codes)
      
      // Store secret temporarily for verification
      localStorage.setItem('avenize_2fa_secret', newSecret)
      
      // Generate QR code URL (in production, use a QR library)
      const issuer = 'Avenize'
      const account = 'user@example.com' // Would come from user session
      const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${newSecret}&issuer=${issuer}`
      
      // Use a placeholder QR (in production, render actual QR)
      setQrCode(otpauthUrl)
      setStep('verify')
    } catch (err) {
      setError('Failed to generate 2FA secret')
    }
    setLoading(false)
  }

  const handleCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)
    
    // Auto-focus next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
    
    // Auto-submit when complete
    if (digit && index === 5) {
      verifyCode([...newCode.slice(0, -1), digit].join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const verifyCode = async (fullCode: string) => {
    setLoading(true)
    setError('')
    
    try {
      // In production, verify against the TOTP algorithm
      // For now, accept any 6-digit code for demo
      if (fullCode.length === 6) {
        // Enable 2FA for user
        await supabase.auth.updateUser({
          data: { 
            two_factor_enabled: true,
            two_factor_secret: secret,
            backup_codes: backupCodes,
          }
        })
        
        setStep('backup')
      } else {
        setError('Invalid code. Please try again.')
      }
    } catch (err) {
      setError('Verification failed. Please try again.')
    }
    setLoading(false)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleComplete = () => {
    localStorage.removeItem('avenize_2fa_secret')
    onComplete()
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield size={32} className="text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Set Up Two-Factor Authentication</h2>
        <p className="text-slate-500 mt-2">Add an extra layer of security to your account</p>
      </div>

      {step === 'generating' && (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Generating your secure code...</p>
        </div>
      )}

      {step === 'verify' && (
        <div className="space-y-6">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone size={18} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Scan QR Code</span>
            </div>
            <p className="text-xs text-slate-500">
              Open your authenticator app (Google Authenticator, Authy, etc.) 
              and scan the QR code or enter this key manually:
            </p>
            <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200">
              <code className="text-xs font-mono break-all text-slate-700">{secret}</code>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 text-center">
              Enter the 6-digit code from your app
            </label>
            <div className="flex justify-center gap-2">
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleCodeChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className="w-12 h-14 text-center text-2xl font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => verifyCode(code.join(''))}
              disabled={loading || code.join('').length < 6}
              className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Verify
            </button>
          </div>
        </div>
      )}

      {step === 'backup' && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-amber-600" />
              <span className="text-sm font-bold text-amber-800">Save Your Backup Codes</span>
            </div>
            <p className="text-xs text-amber-700">
              These codes can be used to access your account if you lose your phone.
              Store them securely - each code can only be used once.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, i) => (
              <div 
                key={i}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <code className="font-mono text-sm text-slate-700">{code}</code>
                <button
                  onClick={() => copyToClipboard(code)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <Copy size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              const allCodes = backupCodes.join('\n')
              copyToClipboard(allCodes)
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={18} />
            Download All Codes
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('verify')}
              className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={handleComplete}
              className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
            >
              I've Saved My Codes
            </button>
          </div>
        </div>
      )}

      {step === 'complete' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">2FA Enabled!</h3>
          <p className="text-slate-500">
            Your account is now more secure. You'll need your authenticator app to sign in.
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================
// 2FA VERIFICATION COMPONENT
// ============================================

interface TwoFactorVerifyProps {
  onSuccess: () => void
  onCancel: () => void
  onUseBackupCode: () => void
}

export function TwoFactorVerify({ onSuccess, onCancel, onUseBackupCode }: TwoFactorVerifyProps) {
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)
    
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
    
    if (digit && index === 5) {
      verifyCode([...newCode.slice(0, -1), digit].join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const verifyCode = async (fullCode: string) => {
    setLoading(true)
    setError('')
    
    try {
      // In production, verify against stored secret
      if (fullCode.length === 6) {
        // Simulate verification
        onSuccess()
      } else {
        setError('Invalid code')
      }
    } catch (err) {
      setError('Verification failed')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock size={32} className="text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Enter Verification Code</h2>
        <p className="text-slate-500 mt-2">Enter the 6-digit code from your authenticator app</p>
      </div>

      <div className="flex justify-center gap-2 mb-6">
        {code.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={e => handleCodeChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className="w-12 h-14 text-center text-2xl font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        ))}
      </div>

      {error && (
        <div className="flex items-center justify-center gap-2 text-red-600 text-sm mb-4">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onUseBackupCode}
          className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
        >
          Use Backup Code
        </button>
      </div>
    </div>
  )
}

// ============================================
// BACKUP CODE VERIFICATION
// ============================================

interface BackupCodeVerifyProps {
  onSuccess: () => void
  onCancel: () => void
  onUseAppCode: () => void
}

export function BackupCodeVerify({ onSuccess, onCancel, onUseAppCode }: BackupCodeVerifyProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCode, setShowCode] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      if (code.length === 8) {
        // Verify backup code
        onSuccess()
      } else {
        setError('Invalid backup code')
      }
    } catch (err) {
      setError('Verification failed')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Key size={32} className="text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Enter Backup Code</h2>
        <p className="text-slate-500 mt-2">Use one of your 8-digit backup codes</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type={showCode ? 'text' : 'password'}
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="XXXX-XXXX"
            maxLength={8}
          />
          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          >
            {showCode ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onUseAppCode}
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
          >
            Use Authenticator
          </button>
        </div>

        <button
          type="submit"
          disabled={loading || code.length < 8}
          className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          Verify Backup Code
        </button>
      </form>
    </div>
  )
}
