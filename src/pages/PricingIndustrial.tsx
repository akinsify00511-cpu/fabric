// ============================================
// PRICING PAGE - AFRICBUILD/AVENIZE
// Industrial-styled pricing page
// ============================================

import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'

const PLANS = [
  {
    code: '01',
    name: 'Starter',
    tier: 'Solo',
    price: '₦15,000',
    period: 'flat / month',
    minSeats: '1–5 staff',
    features: [
      'Core job & project tracking',
      'Invoicing with VAT & WHT tracking',
      'Basic inventory (single location)',
    ],
    cta: 'Start free setup',
    ctaLink: '/signup',
    highlight: false,
  },
  {
    code: '02',
    name: 'Business',
    tier: 'Small Team',
    price: '₦8,000',
    period: 'per seat / month · min. 6 seats',
    minSeats: '6–25 staff',
    features: [
      'Everything in Starter',
      'AI operational alerts (rules engine)',
      'Department groups & task management',
      'Offline field sync',
    ],
    cta: 'Start free setup',
    ctaLink: '/signup',
    highlight: false,
  },
  {
    code: '03',
    name: 'Pro',
    tier: 'Mid-Size',
    price: '₦6,500',
    period: 'per seat / month · min. 26 seats',
    minSeats: '26–75 staff',
    badge: '50-staff sweet spot',
    features: [
      'Everything in Business',
      'Advanced reporting & multi-location',
      'Approval workflows',
      'Full API access',
    ],
    cta: 'Talk to sales',
    ctaLink: '/contact',
    highlight: true,
  },
  {
    code: '04',
    name: 'Enterprise',
    tier: 'Large',
    price: 'Custom',
    period: 'contact for quote',
    minSeats: '75+ staff',
    features: [
      'Everything in Pro',
      'SSO & data residency',
      'Dedicated support',
      'Custom integrations',
    ],
    cta: 'Contact us',
    ctaLink: '/contact',
    highlight: false,
  },
]

const PIPELINE_STAGES = ['Enquiry', 'Quoted', 'Materials Allocated', 'In Progress', 'Invoiced', 'Paid']

export default function PricingIndustrial() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F3EFE6' }}>
      {/* Hero Section */}
      <section 
        className="relative overflow-hidden"
        style={{ backgroundColor: '#1C1B18', padding: '64px 24px 80px' }}
      >
        {/* Grid Pattern */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'repeating-linear-gradient(135deg, rgba(232,163,61,0.045) 0 2px, transparent 2px 22px)',
          }}
        />
        
        <div className="max-w-[1080px] mx-auto relative">
          {/* Eyebrow */}
          <div 
            className="inline-flex items-center gap-2.5 text-xs tracking-widest uppercase"
            style={{ 
              color: '#E8A33D',
              fontFamily: 'IBM Plex Mono, monospace',
              border: '1px solid rgba(232,163,61,0.4)',
              padding: '6px 12px',
              borderRadius: '2px',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#E8A33D' }} />
            Pricing — Job Ticket AB-2026
          </div>

          {/* Headline */}
          <h1 
            className="mt-6 mb-5 max-w-[820px]"
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 'clamp(34px, 5.4vw, 58px)',
              lineHeight: 1.04,
              letterSpacing: '-0.01em',
              color: '#FBF9F4',
            }}
          >
            Stop running your business from memory.
          </h1>

          {/* Subhead */}
          <p 
            className="text-lg max-w-[560px leading-relaxed mb-9"
            style={{ color: '#C9C4B7', fontSize: '17px', lineHeight: 1.6 }}
          >
            One system for your jobs, your inventory, and your money — priced the way your business already thinks: per seat, per month, no IT department required.
          </p>

          {/* Pipeline */}
          <div 
            className="flex flex-wrap max-w-[820px] rounded-sm overflow-hidden"
            style={{ border: '1px solid #3A3833' }}
          >
            {PIPELINE_STAGES.map((stage, i) => (
              <span 
                key={stage}
                className="text-xs tracking-wider uppercase px-3.5 py-2.5 text-center"
                style={{ 
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  borderRight: i < PIPELINE_STAGES.length - 1 ? '1px solid #3A3833' : 'none',
                  color: i < 4 ? '#5E9C6F' : '#8B8779',
                }}
              >
                {stage}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-[76px] px-6">
        <div className="max-w-[1080px] mx-auto">
          {/* Section Header */}
          <div className="mb-3" style={{ 
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '12px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#B84B28',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span>§</span> Rate Card
          </div>
          
          <h2 
            className="mb-3"
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 'clamp(26px, 3.4vw, 36px)',
              letterSpacing: '-0.01em',
              color: '#201E1A',
            }}
          >
            Four tiers. Pick the one that matches your crew.
          </h2>
          
          <p 
            className="max-w-[560px] text-base leading-relaxed"
            style={{ color: '#5A574F', marginBottom: '48px' }}
          >
            Every tier tracks jobs, inventory, and invoicing in Naira, with VAT and WHT handled automatically. AI alerts turn on from Business upward.
          </p>

          {/* Pricing Grid */}
          <div 
            className="grid gap-5"
            style={{ 
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}
          >
            {PLANS.map((plan) => (
              <div 
                key={plan.code}
                className={`relative flex flex-col rounded-sm overflow-hidden ${plan.highlight ? 'ring-2 ring-amber-700 shadow-xl' : ''}`}
                style={{ 
                  backgroundColor: '#FBF9F4',
                  border: `1px solid ${plan.highlight ? '#C8811F' : '#D9D2C2'}`,
                  boxShadow: plan.highlight ? '0 8px 24px rgba(28,27,24,0.1)' : 'none',
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div 
                    className="absolute -rotate-1 shadow-md px-3 py-1.5 text-xs tracking-wider uppercase"
                    style={{
                      top: '-12px',
                      right: '16px',
                      backgroundColor: '#B84B28',
                      color: '#fff',
                      fontFamily: 'IBM Plex Mono, monospace',
                      borderRadius: '2px',
                    }}
                  >
                    {plan.badge}
                  </div>
                )}

                {/* Ticket Top (perforated edge) */}
                <div 
                  className="px-5 py-5 relative"
                  style={{ borderBottom: '1px dashed #D9D2C2' }}
                >
                  {/* Perforation circles */}
                  <div 
                    className="absolute -bottom-3.5 w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: '#F3EFE6', left: '-7px' }}
                  />
                  <div 
                    className="absolute -bottom-3.5 w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: '#F3EFE6', right: '-7px' }}
                  />

                  <div 
                    className="text-xs tracking-wider uppercase mb-1.5"
                    style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#9A9484' }}
                  >
                    Tier / {plan.code} — {plan.tier}
                  </div>
                  
                  <h3 
                    className="text-xl mb-3"
                    style={{ fontFamily: 'Archivo Black, sans-serif', color: '#201E1A', margin: 0 }}
                  >
                    {plan.name}
                  </h3>
                  
                  <div 
                    className="text-2xl font-semibold"
                    style={{ 
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '26px',
                      color: plan.highlight ? '#C8811F' : '#26394A',
                    }}
                  >
                    {plan.price}
                    <small 
                      className="text-xs font-normal block mt-1"
                      style={{ color: '#8B8779', letterSpacing: '0.02em' }}
                    >
                      {plan.period}
                    </small>
                  </div>
                </div>

                {/* Ticket Body */}
                <div className="flex-1 flex flex-col px-5 py-4">
                  <ul className="flex-1 mb-5 list-none p-0">
                    {plan.features.map((feature, i) => (
                      <li 
                        key={i}
                        className="text-sm py-2 flex gap-2"
                        style={{ 
                          borderTop: i === 0 ? 'none' : '1px solid #ECE7DA',
                          color: '#3E3B35',
                          lineHeight: 1.5,
                        }}
                      >
                        <Check 
                          size={14} 
                          className="flex-none mt-0.5" 
                          style={{ color: plan.highlight ? '#C8811F' : '#354C5C' }} 
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link 
                    to={plan.ctaLink}
                    className="block text-center py-3 px-4 text-xs tracking-wider uppercase rounded-sm transition-colors"
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '12.5px',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      textDecoration: 'none',
                      backgroundColor: plan.highlight ? '#E8A33D' : 'transparent',
                      border: `1px solid ${plan.highlight ? '#E8A33D' : '#201E1A'}`,
                      color: plan.highlight ? '#1C1B18' : '#201E1A',
                      fontWeight: plan.highlight ? 600 : 400,
                    }}
                  >
                    {plan.cta}
                  </Link>

                  <div 
                    className="text-center mt-3 text-xs"
                    style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#9A9484' }}
                  >
                    For {plan.minSeats}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Example Box */}
          <div 
            className="mt-12 p-7 rounded-sm"
            style={{ backgroundColor: '#FBF9F4', border: '1px solid #D9D2C2' }}
          >
            <div 
              className="mb-4 text-xs tracking-wider uppercase"
              style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#9A9484' }}
            >
              Sample invoice — 50-staff company on Pro
            </div>
            
            <div 
              className="font-mono text-sm"
              style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '13.5px' }}
            >
              <div className="flex justify-between py-2.5 border-t border-dashed" style={{ borderColor: '#D9D2C2' }}>
                <span>50 seats × ₦6,500/month</span>
                <span>₦325,000</span>
              </div>
              <div className="flex justify-between py-2.5 border-t border-dashed" style={{ borderColor: '#D9D2C2' }}>
                <span>Billing cycle</span>
                <span>Monthly</span>
              </div>
              <div className="flex justify-between py-2.5 border-t border-dashed" style={{ borderColor: '#D9D2C2' }}>
                <span>Annual (2 months free)</span>
                <span>₦3,575,000</span>
              </div>
              <div 
                className="flex justify-between py-3.5 mt-2 text-base font-semibold border-t"
                style={{ borderColor: '#201E1A', color: '#C8811F' }}
              >
                <span>vs. one admin salary</span>
                <span>Cheaper, and it doesn't sleep</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Section */}
      <section style={{ backgroundColor: '#26394A', padding: '64px 24px' }}>
        <div className="max-w-[1080px] mx-auto">
          <div 
            className="mb-2"
            style={{ 
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '12px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#E8A33D',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span>§</span> Why this price works
          </div>
          
          <h2 
            className="mb-3"
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 'clamp(26px, 3.4vw, 36px)',
              letterSpacing: '-0.01em',
              color: '#FBF9F4',
            }}
          >
            Compared to what you're already paying for chaos.
          </h2>
          
          <p className="max-w-[560px] mb-9" style={{ color: '#C9C4B7' }}>
            WhatsApp, Excel, and memory aren't free — they cost you in errors, missed payments, and material waste.
          </p>

          <div className="grid md:grid-cols-3 gap-7">
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.18)', paddingTop: '16px' }}>
              <span 
                className="text-3xl font-semibold block mb-2"
                style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#E8A33D' }}
              >
                ₦150k–₦300k
              </span>
              <p className="text-sm" style={{ color: '#C9C4B7', lineHeight: 1.6, margin: 0 }}>
                Monthly cost of one admin/operations hire. AfriBuild OS replaces 1–2 of those roles and makes the rest of your team more effective.
              </p>
            </div>
            
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.18)', paddingTop: '16px' }}>
              <span 
                className="text-3xl font-semibold block mb-2"
                style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#E8A33D' }}
              >
                ₦1,000,000+
              </span>
              <p className="text-sm" style={{ color: '#C9C4B7', lineHeight: 1.6, margin: 0 }}>
                Typical upfront cost of a comparable local ERP quote, plus 20% annual maintenance. We're cheaper, and live in 30 minutes, not 3 months.
              </p>
            </div>
            
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.18)', paddingTop: '16px' }}>
              <span 
                className="text-3xl font-semibold block mb-2"
                style={{ fontFamily: 'IBM Plex Mono, monospace', color: '#E8A33D' }}
              >
                21 → 14 days
              </span>
              <p className="text-sm" style={{ color: '#C9C4B7', lineHeight: 1.6, margin: 0 }}>
                Our target reduction in "days to cash" — from job completion to money in the bank. That alone pays for the subscription.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{ backgroundColor: '#1C1B18', padding: '72px 24px', textAlign: 'center' }}>
        <div className="max-w-[1080px] mx-auto">
          <blockquote 
            className="max-w-[640px] mx-auto mb-8"
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 'clamp(20px, 2.6vw, 28px)',
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
              color: '#FBF9F4',
            }}
          >
            Your roofing crews are on sites you can't visit daily. Your factory runs out of resin without warning. Your agents chase leads in WhatsApp groups you can't see.{' '}
            <span style={{ color: '#E8A33D' }}>Find out before it's an emergency.</span>
          </blockquote>
          
          <Link 
            to="/signup"
            className="inline-block text-sm tracking-wider uppercase px-8 py-3.5 rounded-sm transition-colors"
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              backgroundColor: '#E8A33D',
              border: '1px solid #E8A33D',
              color: '#1C1B18',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            See plans above
          </Link>
          
          <div 
            className="mt-6 text-xs"
            style={{ 
              fontFamily: 'IBM Plex Mono, monospace',
              color: '#8B8779',
              letterSpacing: '0.04em',
            }}
          >
            SETUP: 30 MINUTES · WORKS ON LOW-END ANDROID · NAIRA, VAT & WHT BUILT IN
          </div>
        </div>
      </section>
    </div>
  )
}
