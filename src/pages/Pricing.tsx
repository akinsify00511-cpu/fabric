import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { captureAttribution } from '../lib/attribution'

interface PricingTier {
  plan_code: string
  display_name: string
  tagline: string
  features: string[]
  monthly_cents: number
  yearly_cents: number
  is_founding_price: boolean
  founding_label: string | null
  is_popular: boolean
}

const FALLBACK: PricingTier[] = [
  { plan_code: 'starter', display_name: 'Starter', tagline: 'One person running a simple operation', features: ['Core CRM & deals', 'Invoicing with VAT & WHT', 'Tasks & basic approvals', 'Up to 5 team members'], monthly_cents: 1500000, yearly_cents: 15000000, is_founding_price: true, founding_label: '2026 Founding Pricing', is_popular: false },
  { plan_code: 'team', display_name: 'Team', tagline: 'A small team working together', features: ['Everything in Starter', 'AI-assisted capture', 'Department groups', 'Up to 15 seats'], monthly_cents: 4800000, yearly_cents: 48000000, is_founding_price: true, founding_label: '2026 Founding Pricing', is_popular: false },
  { plan_code: 'business', display_name: 'Business', tagline: 'Multiple teams and departments', features: ['Everything in Team', 'Multi-location inventory', 'Approval workflows', 'Up to 30 seats'], monthly_cents: 11200000, yearly_cents: 112000000, is_founding_price: true, founding_label: '2026 Founding Pricing', is_popular: true },
  { plan_code: 'pro', display_name: 'Pro', tagline: 'A growing, complex organization', features: ['Everything in Business', 'Committees & OKRs', 'Advanced intelligence & risk', 'Up to 60 seats'], monthly_cents: 18600000, yearly_cents: 186000000, is_founding_price: true, founding_label: '2026 Founding Pricing', is_popular: false },
  { plan_code: 'scale', display_name: 'Scale', tagline: 'Large or multi-subsidiary operations', features: ['Everything in Pro', 'SSO & custom roles', 'Multi-subsidiary & audit trail', 'Dedicated support'], monthly_cents: 38000000, yearly_cents: 380000000, is_founding_price: true, founding_label: '2026 Founding Pricing', is_popular: false },
]

const money = (cents: number) => '₦' + Math.round(cents / 100).toLocaleString()

function Card({ tier, yearly }: { tier: PricingTier; yearly: boolean }) {
  const navigate = useNavigate()
  const monthly = yearly ? Math.round(tier.yearly_cents / 12) : tier.monthly_cents
  const go = () => tier.plan_code === 'scale' ? navigate('/contact') : navigate(`/upgrade?plan=${encodeURIComponent(tier.plan_code)}&billing=${yearly ? 'yearly' : 'monthly'}`)
  return <div className="rounded-2xl p-6 relative bg-white border transition" style={{ borderColor: tier.is_popular ? 'var(--av-primary)' : '#E8EAED', borderWidth: tier.is_popular ? 2 : 1 }}>
    {tier.is_popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium text-white bg-[var(--av-primary)]">Most popular</span>}
    <h3 className="font-bold text-lg text-black">{tier.display_name}</h3><p className="text-xs text-black/50 mb-4">{tier.tagline}</p>
    <div className="mb-1"><span className="text-3xl font-bold text-black">{money(monthly)}</span><span className="text-sm text-black/55">/month</span></div>
    {yearly && <p className="text-xs text-[var(--av-success)] mb-3">Billed yearly · {money(tier.yearly_cents)}/yr</p>}
    {tier.is_founding_price && tier.founding_label && <div className="flex gap-1.5 items-center mb-4 text-xs text-[var(--av-primary)]"><Lock size={11}/> {tier.founding_label} — price locked while subscribed</div>}
    <ul className="space-y-2 mb-6">{tier.features.map((f, i) => <li key={i} className="flex gap-2 text-sm text-black/65"><Check size={14} className="mt-0.5 text-[var(--av-success)] shrink-0"/>{f}</li>)}</ul>
    <button onClick={go} className={`w-full py-2.5 rounded-lg text-sm font-medium ${tier.is_popular ? 'bg-[var(--av-primary)] text-white' : 'bg-[#F8F9FA] text-black border border-black/10'}`}>{tier.plan_code === 'scale' ? 'Contact sales' : 'Continue to checkout'} <ArrowRight size={15} className="inline ml-1"/></button>
  </div>
}

export default function Pricing() {
  const [tiers, setTiers] = useState(FALLBACK)
  const [yearly, setYearly] = useState(true)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { captureAttribution(); let active = true; supabase.rpc('get_pricing_tiers').then(({ data, error }) => { if (active && !error && Array.isArray(data) && data.length) setTiers(data as PricingTier[]) }); return () => { active = false } }, [])
  const faqs = [
    ['What payment methods do you accept?', 'Paystack supports card, bank transfer, USSD and other available Nigerian payment methods.'],
    ['When does my subscription become active?', 'Only after Paystack confirms a successful payment. The browser callback cannot activate access by itself.'],
    ['Can I change plans later?', 'Yes. You can upgrade or downgrade according to the subscription rules shown in your account.'],
    ['Is there a free trial?', 'No. Avenize is paid from the first subscription payment.'],
  ]
  return <div className="min-h-screen bg-white">
    <section className="pt-24 pb-14 px-4 bg-[#F8F9FA]"><div className="max-w-5xl mx-auto text-center"><Link to="/" className="text-2xl font-semibold text-black">Avenize</Link><h1 className="text-4xl sm:text-5xl font-bold text-black mt-8 mb-4">Simple, honest pricing</h1><p className="text-lg text-black/60 mb-7">Choose a paid plan. Pay securely. Start using Avenize after payment confirmation.</p><div className="inline-flex rounded-full p-1 bg-white border border-black/10"><button onClick={() => setYearly(false)} className={`px-5 py-2 rounded-full text-sm ${!yearly ? 'bg-[var(--av-primary)] text-white' : 'text-black/60'}`}>Monthly</button><button onClick={() => setYearly(true)} className={`px-5 py-2 rounded-full text-sm ${yearly ? 'bg-[var(--av-primary)] text-white' : 'text-black/60'}`}>Yearly · save ~17%</button></div></div></section>
    <section className="py-16 px-4"><div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-5 gap-4">{tiers.map(t => <Card key={t.plan_code} tier={t} yearly={yearly}/>)}</div></section>
    <section className="py-16 px-4 bg-[#F8F9FA]"><div className="max-w-3xl mx-auto"><h2 className="text-3xl font-bold text-black mb-8 text-center">Questions</h2>{faqs.map(([q,a], i) => <div key={q} className="mb-3 rounded-xl bg-white p-5"><button onClick={() => setOpen(open === i ? null : i)} className="w-full flex justify-between text-left font-medium text-black"><span>{q}</span><ChevronDown size={20} className={open === i ? 'rotate-180' : ''}/></button>{open === i && <p className="mt-4 text-sm text-black/60">{a}</p>}</div>)}</div></section>
  </div>
}
