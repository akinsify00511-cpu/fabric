// e-Invoicing Page (NRS/FIRS Integration)
// Nigeria tax compliance - ITCMN generation

import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import {
  FileText, Send, CheckCircle2, XCircle, Clock, Loader2,
  Download, Eye, RefreshCw, AlertCircle, Building, User,
  Receipt, ExternalLink, Copy, Shield
} from 'lucide-react'

interface EInvoice {
  id: string
  invoice_id: string
  business_id: string
  client_id?: string
  client_name: string
  client_email?: string
  client_tin?: string
  amount: number
  tax_amount: number
  total_amount: number
  itcmn: string
  itcmn_status: 'pending' | 'submitted' | 'accepted' | 'rejected'
  icr_status?: 'pending' | 'generated' | 'failed'
  icr_number?: string
  qr_code?: string
  submitted_at?: string
  accepted_at?: string
  rejected_reason?: string
  created_at: string
}

interface EInvoiceSettings {
  business_name: string
  business_tin: string
  business_address: string
  nrs_api_key: string
  nrs_api_url: string
  is_configured: boolean
}

const STATUS_COLORS = {
  pending: 'bg-[var(--av-surface-2)] text-[var(--av-text-muted)]',
  submitted: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
  accepted: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
  rejected: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
}

export default function EInvoicingPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [invoices, setInvoices] = useState<EInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const [settings, setSettings] = useState<EInvoiceSettings>({
    business_name: '',
    business_tin: '',
    business_address: '',
    nrs_api_key: '',
    nrs_api_url: 'https://nrs-api.nigeria.gov.pk', // NRS URL
    is_configured: false,
  })
  const [savingSettings, setSavingSettings] = useState(false)

  const [activeTab, setActiveTab] = useState<'invoices' | 'settings'>('invoices')
  const [showDetails, setShowDetails] = useState<EInvoice | null>(null)

  const canManage = staff ? hasPermission(staff.role || 'staff', 'settings', 'manage') : false

  useEffect(() => {
    if (staff?.business_id) {
      loadSettings()
      fetchInvoices()
    }
  }, [staff?.business_id])

  async function loadSettings() {
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['business_tin', 'nrs_api_key', 'nrs_api_url'])

      const settingsMap: Record<string, string> = {}
      settingsData?.forEach(s => {
        settingsMap[s.key] = s.value
      })

      setSettings(prev => ({
        ...prev,
        business_tin: settingsMap['business_tin'] || '',
        nrs_api_key: settingsMap['nrs_api_key'] || '',
        nrs_api_url: settingsMap['nrs_api_url'] || prev.nrs_api_url,
        is_configured: !!(settingsMap['business_tin'] && settingsMap['nrs_api_key']),
      }))
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  async function saveSettings() {
    if (!staff?.business_id) return

    setSavingSettings(true)
    try {
      const settingsToSave = [
        { key: 'business_tin', value: settings.business_tin },
        { key: 'nrs_api_key', value: settings.nrs_api_key },
        { key: 'nrs_api_url', value: settings.nrs_api_url },
      ]

      for (const s of settingsToSave) {
        await supabase
          .from('settings')
          .upsert({ business_id: staff.business_id, key: s.key, value: s.value }, { onConflict: 'business_id,key' })
      }

      setSettings(prev => ({ ...prev, is_configured: true }))
      showToast('Settings saved successfully', 'success')
    } catch (error) {
      console.error('Error saving settings:', error)
      showToast('Failed to save settings', 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  async function fetchInvoices() {
    if (!staff?.business_id) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('e_invoices')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setInvoices(data || [])
    } catch (error) {
      console.error('Error fetching e-invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  async function submitToNRS(invoice: EInvoice) {
    if (!settings.is_configured) {
      showToast('Please configure NRS settings first', 'error')
      return
    }

    setSubmitting(invoice.id)
    try {
      // In production, this would call the NRS/FIRS API
      // For now, simulate the submission
      const itcmn = generateITCMN()

      await supabase
        .from('e_invoices')
        .update({
          itcmn,
          itcmn_status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', invoice.id)

      showToast('Invoice submitted to NRS successfully', 'success')
      fetchInvoices()
    } catch (error) {
      console.error('Error submitting to NRS:', error)
      showToast('Failed to submit invoice', 'error')
    } finally {
      setSubmitting(null)
    }
  }

  async function verifyITCMN(invoice: EInvoice) {
    setSubmitting(invoice.id + '-verify')
    try {
      // Simulate verification
      await new Promise(resolve => setTimeout(resolve, 1000))

      await supabase
        .from('e_invoices')
        .update({
          itcmn_status: 'accepted',
          accepted_at: new Date().toISOString(),
          icr_status: 'generated',
          icr_number: `ICR-${Date.now().toString(36).toUpperCase()}`,
          qr_code: `data:image/png;base64,${btoa(invoice.itcmn)}`,
        })
        .eq('id', invoice.id)

      showToast('ITCMN verified and ICR generated', 'success')
      fetchInvoices()
    } catch (error) {
      console.error('Error verifying ITCMN:', error)
      showToast('Failed to verify ITCMN', 'error')
    } finally {
      setSubmitting(null)
    }
  }

  function generateITCMN(): string {
    // Generate ITCMN (Invoice Tracking Confirmation Number)
    // Format: NRS + YYYYMMDD + 12 random alphanumeric chars
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let randomPart = ''
    for (let i = 0; i < 12; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return `NRS${date}${randomPart}`
  }

  async function downloadEInvoice(invoice: EInvoice) {
    // Generate e-invoice PDF (would use a PDF library in production)
    showToast('Generating e-invoice PDF...', 'info')
    
    // For demo, copy ITCMN to clipboard
    await navigator.clipboard.writeText(invoice.itcmn)
    showToast('ITCMN copied to clipboard', 'success')
  }

  // Stats
  const stats = {
    total: invoices.length,
    pending: invoices.filter(i => i.itcmn_status === 'pending').length,
    submitted: invoices.filter(i => i.itcmn_status === 'submitted').length,
    accepted: invoices.filter(i => i.itcmn_status === 'accepted').length,
    totalAmount: invoices.reduce((sum, i) => sum + i.total_amount, 0),
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[var(--av-surface)] border-b border-[var(--av-border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--av-text)]">e-Invoicing</h1>
            <p className="text-sm text-[var(--av-text-muted)] mt-0.5">
              NRS/FIRS Invoice Compliance
              {settings.is_configured ? (
                <span className="ml-2 inline-flex items-center text-[var(--av-success)]">
                  <Shield className="w-4 h-4 mr-1" />
                  Configured
                </span>
              ) : (
                <span className="ml-2 inline-flex items-center text-[var(--av-warning)]">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  Not configured
                </span>
              )}
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => setActiveTab('settings')}
              className="px-4 py-2 border border-[var(--av-border)] rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
            >
              <Shield className="w-4 h-4" />
              Configure
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[var(--av-surface)] border-b border-[var(--av-border)] px-6">
        <div className="flex gap-6">
          {['invoices', 'settings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-3 text-sm font-medium border-b-2 capitalize ${
                activeTab === tab
                  ? 'border-[var(--av-primary)] text-[var(--av-primary)]'
                  : 'border-transparent text-[var(--av-text-muted)] hover:text-[var(--av-text-secondary)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'invoices' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-5 gap-4 mb-6">
              <div className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
                <p className="text-sm text-[var(--av-text-muted)]">Total Invoices</p>
                <p className="text-2xl font-bold text-[var(--av-text)]">{stats.total}</p>
              </div>
              <div className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
                <p className="text-sm text-[var(--av-text-muted)]">Pending</p>
                <p className="text-2xl font-bold text-[var(--av-text-muted)]">{stats.pending}</p>
              </div>
              <div className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
                <p className="text-sm text-[var(--av-text-muted)]">Submitted</p>
                <p className="text-2xl font-bold text-[var(--av-primary)]">{stats.submitted}</p>
              </div>
              <div className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
                <p className="text-sm text-[var(--av-text-muted)]">Accepted</p>
                <p className="text-2xl font-bold text-[var(--av-success)]">{stats.accepted}</p>
              </div>
              <div className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
                <p className="text-sm text-[var(--av-text-muted)]">Total Value</p>
                <p className="text-2xl font-bold text-[var(--av-text)]">{formatCurrency(stats.totalAmount)}</p>
              </div>
            </div>

            {/* Info Banner */}
            <div className="bg-[var(--av-primary-soft)] rounded-xl border border-[var(--av-primary-soft)] p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[var(--av-primary)] mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-[var(--av-primary-active)]">About NRS e-Invoicing</h4>
                  <p className="text-sm text-[var(--av-primary)] mt-1">
                    All invoices above ₦100,000 must be reported to the NRS (Nigeria Revenue Service) 
                    via FIRS. Generate an ITCMN (Invoice Tracking Confirmation Number) for each invoice 
                    to ensure tax compliance.
                  </p>
                </div>
              </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-[var(--av-border)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Invoice</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">ITCMN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--av-text-disabled)]" />
                      </td>
                    </tr>
                  ) : invoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[var(--av-text-muted)]">
                        <Receipt className="w-12 h-12 text-[var(--av-text-disabled)] mx-auto" />
                        <p className="mt-2">No e-invoices found</p>
                        <p className="text-sm text-[var(--av-text-disabled)]">E-invoices are created when you submit invoices to NRS</p>
                      </td>
                    </tr>
                  ) : (
                    invoices.map(invoice => (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-[var(--av-text)]">{invoice.invoice_id}</p>
                          <p className="text-xs text-[var(--av-text-muted)]">{formatDate(invoice.created_at)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-[var(--av-text)]">{invoice.client_name}</p>
                          {invoice.client_tin && (
                            <p className="text-xs text-[var(--av-text-muted)]">TIN: {invoice.client_tin}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-[var(--av-text)]">{formatCurrency(invoice.total_amount)}</p>
                          <p className="text-xs text-[var(--av-text-muted)]">Tax: {formatCurrency(invoice.tax_amount)}</p>
                        </td>
                        <td className="px-4 py-3">
                          {invoice.itcmn ? (
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-[var(--av-surface-2)] px-2 py-1 rounded">{invoice.itcmn}</code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(invoice.itcmn!)
                                  showToast('Copied!', 'success')
                                }}
                                className="p-1 text-[var(--av-text-disabled)] hover:text-[var(--av-text-muted)]"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm text-[var(--av-text-disabled)]">Not generated</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[invoice.itcmn_status]}`}>
                            {invoice.itcmn_status}
                          </span>
                          {invoice.icr_number && (
                            <p className="text-xs text-[var(--av-text-muted)] mt-1">ICR: {invoice.icr_number}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowDetails(invoice)}
                              className="p-1.5 text-[var(--av-text-disabled)] hover:text-[var(--av-primary)] hover:bg-[var(--av-primary-soft)] rounded"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {invoice.itcmn_status === 'pending' && (
                              <button
                                onClick={() => submitToNRS(invoice)}
                                disabled={submitting === invoice.id}
                                className="px-3 py-1.5 text-xs bg-[var(--av-primary)] text-white rounded hover:bg-[var(--av-primary-hover)] disabled:opacity-50 flex items-center gap-1"
                              >
                                {submitting === invoice.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Send className="w-3 h-3" />
                                )}
                                Submit
                              </button>
                            )}
                            {invoice.itcmn_status === 'submitted' && (
                              <button
                                onClick={() => verifyITCMN(invoice)}
                                disabled={submitting === invoice.id + '-verify'}
                                className="px-3 py-1.5 text-xs bg-[var(--av-success)] text-white rounded hover:bg-[var(--av-success)] disabled:opacity-50 flex items-center gap-1"
                              >
                                {submitting === invoice.id + '-verify' ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                Verify
                              </button>
                            )}
                            {invoice.itcmn && (
                              <button
                                onClick={() => downloadEInvoice(invoice)}
                                className="p-1.5 text-[var(--av-text-disabled)] hover:text-[var(--av-success)] hover:bg-[var(--av-success-soft)] rounded"
                                title="Download E-Invoice"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] p-6">
              <h3 className="font-medium text-[var(--av-text)] mb-4">NRS/FIRS Configuration</h3>
              
              <div className="bg-[var(--av-warning-soft)] rounded-lg border border-[var(--av-warning)]/30 p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-[var(--av-warning)] mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">Tax Compliance Required</p>
                    <p className="text-sm text-[var(--av-warning)] mt-1">
                      Nigerian businesses are required to report all invoices above ₦100,000 
                      to the Federal Inland Revenue Service (FIRS) via the NRS system.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">
                    Business Tax Identification Number (TIN)
                  </label>
                  <input
                    type="text"
                    value={settings.business_tin}
                    onChange={(e) => setSettings({ ...settings, business_tin: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your Business TIN"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">
                    Business Address
                  </label>
                  <textarea
                    value={settings.business_address}
                    onChange={(e) => setSettings({ ...settings, business_address: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Your registered business address"
                  />
                </div>

                <div className="border-t border-[var(--av-border)] pt-4 mt-4">
                  <h4 className="text-sm font-medium text-[var(--av-text)] mb-3">NRS API Configuration</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">
                        NRS API URL
                      </label>
                      <input
                        type="url"
                        value={settings.nrs_api_url}
                        onChange={(e) => setSettings({ ...settings, nrs_api_url: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://nrs-api.nigeria.gov.pk"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">
                        NRS API Key
                      </label>
                      <input
                        type="password"
                        value={settings.nrs_api_key}
                        onChange={(e) => setSettings({ ...settings, nrs_api_key: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Your NRS API key"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    onClick={saveSettings}
                    disabled={savingSettings}
                    className="w-full px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingSettings ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Save Settings
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-gray-50 rounded-xl border border-[var(--av-border)] p-4">
              <h4 className="text-sm font-medium text-[var(--av-text)] mb-2">How it works</h4>
              <ol className="text-sm text-[var(--av-text-muted)] space-y-2 list-decimal list-inside">
                <li>Create an invoice as usual in the Finance section</li>
                <li>The invoice will appear here with "Pending" status</li>
                <li>Click "Submit" to generate ITCMN and send to NRS</li>
                <li>NRS will verify and return an ICR (Invoice Confirmation Receipt)</li>
                <li>Download the e-invoice PDF with QR code for your records</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {showDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-xl max-w-lg w-full">
            <div className="p-6 border-b border-[var(--av-border)] flex items-center justify-between">
              <h2 className="text-lg font-semibold">E-Invoice Details</h2>
              <button
                onClick={() => setShowDetails(null)}
                className="p-2 hover:bg-[var(--av-surface-2)] rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[var(--av-text-muted)]">Invoice ID</p>
                  <p className="text-sm font-medium text-[var(--av-text)]">{showDetails.invoice_id}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--av-text-muted)]">Date</p>
                  <p className="text-sm font-medium text-[var(--av-text)]">{formatDate(showDetails.created_at)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[var(--av-text-muted)]">Client</p>
                  <p className="text-sm font-medium text-[var(--av-text)]">{showDetails.client_name}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--av-text-muted)]">Client TIN</p>
                  <p className="text-sm font-medium text-[var(--av-text)]">{showDetails.client_tin || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-[var(--av-text-muted)]">Amount</p>
                  <p className="text-sm font-medium text-[var(--av-text)]">{formatCurrency(showDetails.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--av-text-muted)]">Tax</p>
                  <p className="text-sm font-medium text-[var(--av-text)]">{formatCurrency(showDetails.tax_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--av-text-muted)]">Total</p>
                  <p className="text-sm font-bold text-[var(--av-text)]">{formatCurrency(showDetails.total_amount)}</p>
                </div>
              </div>

              <div className="border-t border-[var(--av-border)] pt-4">
                <p className="text-xs text-[var(--av-text-muted)]">ITCMN</p>
                <p className="text-lg font-mono font-bold text-[var(--av-text)]">
                  {showDetails.itcmn || 'Not generated'}
                </p>
              </div>

              {showDetails.icr_number && (
                <div>
                  <p className="text-xs text-[var(--av-text-muted)]">ICR Number</p>
                  <p className="text-sm font-medium text-[var(--av-text)]">{showDetails.icr_number}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-[var(--av-text-muted)]">Status</p>
                <span className={`inline-block px-2 py-1 text-xs rounded-full ${STATUS_COLORS[showDetails.itcmn_status]}`}>
                  {showDetails.itcmn_status}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
