import { useState } from 'react'
import { Search, CheckCircle2, XCircle, AlertTriangle, Clock, ExternalLink, Loader2 } from 'lucide-react'
import {
  investigatePayment,
  summarizeInvestigation,
  STAGE_LABELS,
  type InvestigationResult,
  type InvestigationStageStatus,
} from '../../lib/paymentInvestigation'

const STAGE_STYLE: Record<InvestigationStageStatus, { icon: typeof CheckCircle2; cls: string }> = {
  ok: { icon: CheckCircle2, cls: 'text-emerald-400' },
  failed: { icon: XCircle, cls: 'text-red-400' },
  missing: { icon: XCircle, cls: 'text-amber-400' },
  pending: { icon: Clock, cls: 'text-sky-400' },
  external: { icon: ExternalLink, cls: 'text-slate-400' },
}

const money = (cents: number | null, currency: string) =>
  cents == null ? '—' : new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)

export default function PaymentInvestigationPanel() {
  const [reference, setReference] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<InvestigationResult | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const run = async () => {
    if (!reference.trim() && !email.trim()) return
    setBusy(true)
    const res = await investigatePayment(reference, email)
    setBusy(false)
    if (!res) { setUnavailable(true); setResult(null); return }
    setUnavailable(false)
    setResult(res)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Payment Investigation</h2>
        <p className="mt-1 text-sm text-slate-400">
          Trace a payment through the whole chain — checkout → Paystack → webhook → verification → ledger → subscription → entitlement.
          Enter the customer's Paystack reference or email.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Paystack reference (e.g. avz_…)"
          className="min-w-64 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
          placeholder="Customer email"
          className="min-w-64 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600"
        />
        <button
          onClick={() => void run()}
          disabled={busy || (!reference.trim() && !email.trim())}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-slate-950 disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Investigate
        </button>
      </div>

      {unavailable && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-300">
          The payment investigation service is not deployed yet (migration pending). Apply the pending migrations to enable it.
        </div>
      )}

      {result?.error && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">{result.error}</div>
      )}

      {result && !result.error && result.matches.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <p className="font-medium text-slate-200">No payment record found in Avenize</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{result.note}</p>
            </div>
          </div>
        </div>
      )}

      {result?.matches.map((m) => (
        <div key={m.reference} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-sm text-slate-200">{m.reference}</p>
              <p className="mt-1 text-xs text-slate-500">
                {m.business_name ?? m.business_id} · {m.plan_code ?? '—'} {m.billing_cycle ?? ''} · {new Date(m.created_at).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-slate-100">{money(m.amount_cents, m.currency)}</p>
              <p className={`text-xs uppercase tracking-wider ${m.status === 'success' ? 'text-emerald-400' : m.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                {m.status}
              </p>
            </div>
          </div>

          <p className="mt-4 rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{summarizeInvestigation(m)}</p>

          <div className="mt-4 space-y-2">
            {m.stages.map((s) => {
              const style = STAGE_STYLE[s.status] ?? STAGE_STYLE.pending
              const Icon = style.icon
              return (
                <div key={s.stage} className="flex items-start gap-3 text-sm">
                  <Icon size={16} className={`mt-0.5 shrink-0 ${style.cls}`} />
                  <div>
                    <span className="font-medium text-slate-200">{STAGE_LABELS[s.stage] ?? s.stage}</span>
                    <span className="ml-2 text-slate-400">{s.detail}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {m.attribution && Object.keys(m.attribution).length > 0 && (
            <p className="mt-4 text-xs text-slate-500">
              Attribution: {Object.entries(m.attribution).map(([k, v]) => `${k}=${v}`).join(' · ')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
