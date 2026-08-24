import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, ShieldCheck, Zap } from 'lucide-react'
import { startPlanCheckout } from '../lib/payments'
import { trackInitiateCheckout, trackPageView } from '../lib/metaPixel'
import { useAuth } from '../lib/AuthContext'

const PLANS = {
  starter: { name: 'Starter', monthly: 15000, yearly: 150000 },
  team: { name: 'Team', monthly: 48000, yearly: 480000 },
  business: { name: 'Business', monthly: 112000, yearly: 1120000 },
  pro: { name: 'Pro', monthly: 186000, yearly: 1860000 },
  scale: { name: 'Scale', monthly: 380000, yearly: 3800000 },
} as const

type PlanCode = keyof typeof PLANS

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

  // Public marketing surface: page view for the ads funnel.
  useEffect(() => { trackPageView() }, [])

  const startCheckout = async () => {
    if (!session) {
      window.location.assign(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const checkout = await startPlanCheckout(planCode, billing)
      // Intent event only — Purchase fires solely on server-verified payment.
      trackInitiateCheckout(amount, 'NGN')
      window.location.assign(checkout.authorizationUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the secure Paystack checkout. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--av-surface-2)] p-6">
      <div className="max-w-5xl mx-auto">
        <Link to="/pricing" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black mb-8"><ArrowLeft size={16} /> Back to plans</Link>
        <div className="grid lg:grid-cols-[1fr_420px] gap-6">
          <section className="bg-white rounded-2xl border border-black/5 p-8">
            <div className="flex items-center gap-3 mb-6"><div className="w-11 h-11 rounded-xl bg-[var(--av-primary)]/10 text-[var(--av-primary)] flex items-center justify-center"><CreditCard size={22} /></div><div><p className="text-sm text-black/50">Secure checkout</p><h1 className="text-2xl font-bold text-black">Pay with Paystack</h1></div></div>
            <div className="rounded-xl bg-black/[0.03] p-5 mb-6"><p className="text-sm text-black/50 mb-1">Selected plan</p><div className="flex items-center justify-between"><strong className="text-xl text-black">{plan.name}</strong><span className="font-semibold text-black">{money(amount)}</span></div><p className="text-sm text-black/50 mt-1">Billed {billing}</p></div>
            <div className="space-y-3 text-sm text-black/65 mb-8">
              <p className="flex gap-2"><ShieldCheck size={18} className="text-[var(--av-success)] shrink-0" /> Use the same secure Paystack checkout for every published Avenize plan.</p>
              <p className="flex gap-2"><ShieldCheck size={18} className="text-[var(--av-success)] shrink-0" /> Your plan activates only after Avenize verifies the successful transaction server-side.</p>
              <p className="flex gap-2"><ShieldCheck size={18} className="text-[var(--av-success)] shrink-0" /> No free trial is attached to this purchase.</p>
            </div>
            {error && <div className="rounded-xl bg-red-50 text-red-700 p-4 text-sm mb-5">{error}</div>}
            <button onClick={startCheckout} disabled={busy} className="w-full py-3.5 rounded-xl bg-[var(--av-primary)] text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2">{busy ? <><Loader2 size={19} className="animate-spin" /> Starting secure checkout…</> : <>Continue to Paystack <Zap size={18} /></>}</button>
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-black/45"><CheckCircle2 size={14} className="text-[var(--av-success)]" /> Secure payment verification by Avenize</div>
          </section>
          <aside className="bg-white rounded-2xl border border-black/5 p-8 h-fit"><h2 className="font-bold text-lg text-black mb-5">Order summary</h2><div className="flex justify-between text-sm mb-3"><span className="text-black/60">{plan.name}</span><span className="text-black">{money(amount)}</span></div><div className="border-t border-black/5 pt-4 mt-4 flex justify-between"><strong className="text-black">Total due now</strong><strong className="text-xl text-black">{money(amount)}</strong></div><p className="text-xs text-black/45 mt-5">The checkout server determines the payable amount. Avenize records the transaction and activates the subscription only after successful Paystack verification.</p></aside>
        </div>
      </div>
    </div>
  )
}
