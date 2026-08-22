import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Building2, CheckCircle2, CreditCard, Loader2, ShieldCheck, Copy, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { startPlanCheckout } from '../lib/payments'

const PLANS = {
  starter: { name: 'Starter', monthly: 15000, yearly: 150000 },
  team: { name: 'Team', monthly: 48000, yearly: 480000 },
  business: { name: 'Business', monthly: 112000, yearly: 1120000 },
  pro: { name: 'Pro', monthly: 186000, yearly: 1860000 },
  scale: { name: 'Scale', monthly: 380000, yearly: 3800000 },
} as const

type PlanCode = keyof typeof PLANS

interface PaymentInstructions {
  bank_name: string | null
  account_name: string | null
  account_number: string | null
  note: string | null
}

interface PaymentRequest {
  ok: boolean
  reference?: string
  plan_code?: string
  billing_cycle?: string
  amount_cents?: number
  currency?: string
  status?: string
  instructions?: PaymentInstructions
}

const money = (value: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)

export default function Premium() {
  const [params] = useSearchParams()
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const planCode = (params.get('plan') || 'starter') as PlanCode
  const billing = params.get('billing') === 'yearly' ? 'yearly' : 'monthly'
  const plan = PLANS[planCode] || PLANS.starter
  const amount = billing === 'yearly' ? plan.yearly : plan.monthly
  const [request, setRequest] = useState<PaymentRequest | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // If a payment request already exists (e.g. the user returns to this page),
  // resume it instead of showing the form again.
  useEffect(() => {
    if (!session) return
    let cancelled = false
    const load = async () => {
      try {
        const { data } = await supabase.rpc('my_payment_request')
        if (cancelled || !data?.ok || data.status === 'none') return
        setRequest(data as PaymentRequest)
      } catch { /* best-effort: the form path still works */ }
    }
    void load()
    return () => { cancelled = true }
  }, [session])

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const createRequest = async () => {
    if (!session) {
      window.location.assign(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      return
    }
    setBusy(true); setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('request_plan_payment', { p_plan_code: planCode, p_billing_cycle: billing })
      if (rpcError) throw rpcError
      if (!data?.ok) throw new Error(data?.error || 'Unable to create payment request')
      setRequest(data as PaymentRequest)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the payment request. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Primary rail: Paystack checkout. The server sets the price and decides
  // success (webhook + verification); the browser only redirects.
  const startCardCheckout = async () => {
    if (!session) {
      window.location.assign(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      return
    }
    setBusy(true); setError(null)
    try {
      const checkout = await startPlanCheckout(planCode, billing)
      window.location.assign(checkout.authorizationUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the secure checkout. Please try again.')
      setBusy(false)
    }
  }

  const cancelRequest = async () => {
    setBusy(true)
    try { await supabase.rpc('cancel_payment_request') } catch { /* best-effort */ }
    setRequest(null)
    setBusy(false)
  }

  // Payment request created: show the transfer instructions.
  if (request?.ok && request.reference) {
    const reqAmount = (request.amount_cents ?? 0) / 100
    const ins: PaymentInstructions = request.instructions ?? { bank_name: null, account_name: null, account_number: null, note: null }
    const configured = !!(ins.bank_name && ins.account_number)
    return (
      <div className="min-h-screen bg-[var(--av-surface-2)] p-6">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl border border-black/5 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-[var(--av-primary)]/10 text-[var(--av-primary)] flex items-center justify-center"><Building2 size={22} /></div>
              <div><p className="text-sm text-black/50">Bank transfer</p><h1 className="text-2xl font-bold text-black">Complete your payment</h1></div>
            </div>

            {configured ? (
              <div className="space-y-3 mb-6">
                <InstructionRow label="Bank" value={ins.bank_name!} onCopy={() => copy('bank', ins.bank_name!)} copied={copied === 'bank'} />
                <InstructionRow label="Account name" value={ins.account_name || ''} onCopy={() => copy('name', ins.account_name || '')} copied={copied === 'name'} />
                <InstructionRow label="Account number" value={ins.account_number!} onCopy={() => copy('number', ins.account_number!)} copied={copied === 'number'} />
                <InstructionRow label="Amount" value={money(reqAmount)} onCopy={() => copy('amount', String(reqAmount))} copied={copied === 'amount'} />
                <InstructionRow label="Reference" value={request.reference} onCopy={() => copy('ref', request.reference!)} copied={copied === 'ref'} />
              </div>
            ) : (
              <div className="rounded-xl bg-amber-50 text-amber-800 p-4 text-sm mb-6">
                {ins.note || 'Payment instructions have not been configured yet. Contact support to activate a paid plan.'}
              </div>
            )}

            <p className="text-sm text-black/60 mb-6">
              Transfer exactly <strong>{money(reqAmount)}</strong> and use the reference above as the transfer
              narration. Your {plan.name} plan activates as soon as the payment is confirmed — usually within
              one business day.
            </p>

            <div className="flex gap-3">
              <Link to="/app/subscription" className="flex-1 text-center px-4 py-3 rounded-xl bg-[var(--av-primary)] text-white font-medium">Done</Link>
              <button onClick={cancelRequest} disabled={busy} className="px-4 py-3 rounded-xl border border-black/10 text-sm text-black/60 disabled:opacity-60">Cancel request</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--av-surface-2)] p-6">
      <div className="max-w-5xl mx-auto">
        <Link to="/pricing" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black mb-8"><ArrowLeft size={16} /> Back to plans</Link>
        <div className="grid lg:grid-cols-[1fr_420px] gap-6">
          <section className="bg-white rounded-2xl border border-black/5 p-8">
            <div className="flex items-center gap-3 mb-6"><div className="w-11 h-11 rounded-xl bg-[var(--av-primary)]/10 text-[var(--av-primary)] flex items-center justify-center"><CreditCard size={22} /></div><div><p className="text-sm text-black/50">Plan upgrade</p><h1 className="text-2xl font-bold text-black">Choose how to pay</h1></div></div>
            <div className="rounded-xl bg-black/[0.03] p-5 mb-6"><p className="text-sm text-black/50 mb-1">Selected plan</p><div className="flex items-center justify-between"><strong className="text-xl text-black">{plan.name}</strong><span className="font-semibold text-black">{money(amount)}</span></div><p className="text-sm text-black/50 mt-1">Billed {billing}</p></div>
            <div className="space-y-3 text-sm text-black/65 mb-8">
              <p className="flex gap-2"><ShieldCheck size={18} className="text-[var(--av-success)] shrink-0" /> Pay instantly by card or bank with Paystack — your plan activates as soon as the payment is verified.</p>
              <p className="flex gap-2"><ShieldCheck size={18} className="text-[var(--av-success)] shrink-0" /> Or pay by manual bank transfer with a unique reference — confirmed within one business day.</p>
              <p className="flex gap-2"><ShieldCheck size={18} className="text-[var(--av-success)] shrink-0" /> No free trial is attached to this purchase.</p>
            </div>
            {error && <div className="rounded-xl bg-red-50 text-red-700 p-4 text-sm mb-5">{error}</div>}
            <button onClick={startCardCheckout} disabled={busy} className="w-full py-3.5 rounded-xl bg-[var(--av-primary)] text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2">{busy ? <><Loader2 size={19} className="animate-spin" /> Starting secure checkout…</> : <>Pay now with Paystack <Zap size={18} /></>}</button>
            <button onClick={createRequest} disabled={busy} className="w-full mt-3 py-3 rounded-xl border border-black/10 text-sm text-black/70 font-medium disabled:opacity-60">Pay by bank transfer instead</button>
          </section>
          <aside className="bg-white rounded-2xl border border-black/5 p-8 h-fit"><h2 className="font-bold text-lg text-black mb-5">Order summary</h2><div className="flex justify-between text-sm mb-3"><span className="text-black/60">{plan.name}</span><span className="text-black">{money(amount)}</span></div><div className="border-t border-black/5 pt-4 mt-4 flex justify-between"><strong className="text-black">Total due now</strong><strong className="text-xl text-black">{money(amount)}</strong></div><p className="text-xs text-black/45 mt-5">Paystack checkout is verified server-side — your plan activates only after Avenize confirms the transaction with Paystack.</p></aside>
        </div>
      </div>
    </div>
  )
}

function InstructionRow({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-black/50">{label}</p>
        <p className="font-medium text-black truncate">{value}</p>
      </div>
      <button onClick={onCopy} className="p-2 rounded-lg hover:bg-black/10 shrink-0" title={`Copy ${label}`}>
        {copied ? <CheckCircle2 size={16} className="text-[var(--av-success)]" /> : <Copy size={16} className="text-black/50" />}
      </button>
    </div>
  )
}
