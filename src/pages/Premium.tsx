import { useState } from 'react'
import { Check, Lock, Zap, Crown, Star, Shield, BarChart3, Users, Bell, Globe, Palette, Clock, FileText, CreditCard } from 'lucide-react'

const FREE_FEATURES = [
  { name: 'Basic Dashboard', icon: BarChart3, included: true },
  { name: 'Up to 5 Team Members', icon: Users, included: true },
  { name: 'CRM Basics', icon: Users, included: true },
  { name: 'Task Management', icon: Check, included: true },
  { name: '50MB Storage', icon: FileText, included: true },
]

const PREMIUM_FEATURES = [
  { 
    name: 'Unlimited Team Members', 
    icon: Users, 
    locked: true,
    preview: '50+ team members',
    description: 'Scale your team without limits'
  },
  { 
    name: 'Advanced Analytics', 
    icon: BarChart3, 
    locked: true,
    preview: 'Real-time dashboards & reports',
    description: 'Deep insights into your business performance'
  },
  { 
    name: 'Priority Support', 
    icon: Bell, 
    locked: true,
    preview: '24/7 dedicated support',
    description: 'Get help fast when you need it'
  },
  { 
    name: 'Custom Branding', 
    icon: Palette, 
    locked: true,
    preview: 'Your logo, colors, domain',
    description: 'Make it truly yours with white-label'
  },
  { 
    name: 'API Access', 
    icon: Globe, 
    locked: true,
    preview: 'Full REST API & webhooks',
    description: 'Integrate with any system'
  },
  { 
    name: 'Time Tracking', 
    icon: Clock, 
    locked: true,
    preview: 'Automatic time logs & reports',
    description: 'Bill accurately and track productivity'
  },
  { 
    name: 'Invoicing & Payments', 
    icon: CreditCard, 
    locked: true,
    preview: 'Send invoices, accept payments',
    description: 'Get paid faster with integrated payments'
  },
  { 
    name: 'Advanced Security', 
    icon: Shield, 
    locked: true,
    preview: 'SSO, 2FA, audit logs',
    description: 'Enterprise-grade security for your data'
  },
]

export default function Premium() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly')

  const monthlyPrice = 49
  const yearlyPrice = 39 // Per month, billed yearly
  const savings = (monthlyPrice - yearlyPrice) * 12

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Hero */}
      <div className="text-center py-12 px-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 text-sm font-medium mb-6">
          <Crown size={16} />
          <span>Unlock Your Business Potential</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-black mb-4">
          Upgrade to <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Pro</span>
        </h1>
        <p className="text-xl text-black/60 max-w-2xl mx-auto mb-8">
          Get access to powerful features that will transform how you run your business. 
          Join thousands of companies already growing with Avenize Pro.
        </p>
        
        {/* Social Proof */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-black/50 mb-8">
          <span className="flex items-center gap-1">
            <Star size={14} className="text-amber-500 fill-amber-500" />
            <strong className="text-black">4.9/5</strong> rating
          </span>
          <span>•</span>
          <span><strong className="text-black">2,500+</strong> businesses</span>
          <span>•</span>
          <span><strong className="text-black">99.9%</strong> uptime</span>
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-white rounded-3xl border border-black/[0.06] p-8 max-w-md mx-auto mb-16 relative overflow-hidden">
        <div className="absolute top-0 right-0 px-4 py-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-medium rounded-bl-xl">
          Save ₦{savings.toLocaleString()}/year
        </div>
        
        <h2 className="text-2xl font-bold mb-2">Pro Plan</h2>
        <p className="text-black/50 text-sm mb-6">Everything you need to scale</p>
        
        {/* Billing Toggle */}
        <div className="flex items-center gap-3 mb-6 p-1 bg-black/[0.04] rounded-xl">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              billingCycle === 'monthly' ? 'bg-white shadow-sm' : ''
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              billingCycle === 'yearly' ? 'bg-white shadow-sm' : ''
            }`}
          >
            Yearly <span className="text-green-600 text-xs">-20%</span>
          </button>
        </div>
        
        {/* Price */}
        <div className="mb-6">
          <div className="flex items-end gap-1">
            <span className="text-5xl font-bold">₦{billingCycle === 'monthly' ? monthlyPrice : yearlyPrice}</span>
            <span className="text-black/50 mb-2">/month</span>
          </div>
          {billingCycle === 'yearly' && (
            <p className="text-sm text-black/50">Billed as ₦{(yearlyPrice * 12).toLocaleString()} yearly</p>
          )}
        </div>
        
        {/* CTA */}
        <button className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-lg hover:shadow-lg hover:shadow-indigo-500/30 transition mb-6">
          Upgrade Now - Start Free Trial
        </button>
        
        <p className="text-center text-sm text-black/50">
          14-day free trial • No credit card required • Cancel anytime
        </p>
        
        {/* Features List */}
        <div className="mt-8 pt-8 border-t border-black/[0.06]">
          <p className="font-medium mb-4">Everything in Free, plus:</p>
          <div className="space-y-3">
            {PREMIUM_FEATURES.slice(0, 5).map((feature) => (
              <div key={feature.name} className="flex items-center gap-3">
                <Check size={18} className="text-green-500 shrink-0" />
                <span className="text-sm">{feature.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Feature Preview Cards */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-8">What You're Missing Out On</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PREMIUM_FEATURES.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div 
                key={feature.name}
                className="bg-white rounded-2xl border border-black/[0.06] p-6 relative overflow-hidden group hover:border-indigo-200 transition"
              >
                {/* Lock Overlay */}
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-black/80 text-white text-xs font-medium rounded-full">
                    <Lock size={12} />
                    Pro Feature
                  </div>
                </div>
                
                {/* Content */}
                <div className={`${feature.locked ? 'blur-sm select-none pointer-events-none' : ''}`}>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
                    <Icon size={24} className="text-indigo-600" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{feature.name}</h3>
                  <p className="text-sm text-black/50 mb-4">{feature.description}</p>
                  
                  {/* Preview */}
                  <div className="bg-black/[0.03] rounded-lg p-3">
                    <p className="text-xs text-black/40 mb-1">Preview:</p>
                    <p className="text-sm font-medium text-indigo-600">{feature.preview}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden mb-16">
        <div className="p-6 border-b border-black/[0.06]">
          <h2 className="text-2xl font-bold">Compare Plans</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black/[0.02]">
              <tr>
                <th className="text-left px-6 py-4 font-medium">Feature</th>
                <th className="text-center px-6 py-4 font-medium">Free</th>
                <th className="text-center px-6 py-4 font-medium bg-indigo-50">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              <tr>
                <td className="px-6 py-4 text-black/60">Team Members</td>
                <td className="px-6 py-4 text-center">5</td>
                <td className="px-6 py-4 text-center bg-indigo-50"><strong>Unlimited</strong></td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-black/60">Storage</td>
                <td className="px-6 py-4 text-center">50MB</td>
                <td className="px-6 py-4 text-center bg-indigo-50"><strong>100GB</strong></td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-black/60">Analytics</td>
                <td className="px-6 py-4 text-center">Basic</td>
                <td className="px-6 py-4 text-center bg-indigo-50"><strong>Advanced</strong></td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-black/60">API Access</td>
                <td className="px-6 py-4 text-center">❌</td>
                <td className="px-6 py-4 text-center bg-indigo-50"><strong>✅</strong></td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-black/60">Custom Branding</td>
                <td className="px-6 py-4 text-center">❌</td>
                <td className="px-6 py-4 text-center bg-indigo-50"><strong>✅</strong></td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-black/60">Priority Support</td>
                <td className="px-6 py-4 text-center">❌</td>
                <td className="px-6 py-4 text-center bg-indigo-50"><strong>✅</strong></td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-black/60">Invoicing & Payments</td>
                <td className="px-6 py-4 text-center">❌</td>
                <td className="px-6 py-4 text-center bg-indigo-50"><strong>✅</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Testimonials */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Trusted by Growing Businesses</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              name: 'Chinedu Okafor',
              role: 'CEO, TechStart Nigeria',
              quote: 'Avenize Pro transformed how we manage our team. The analytics alone saved us 20 hours per week!'
            },
            {
              name: 'Amina Ibrahim',
              role: 'Founder, StyleBox',
              quote: 'Finally, an all-in-one platform that actually works. Worth every kobo!'
            },
            {
              name: 'Emeka Nwosu',
              role: 'Director, EduFirst',
              quote: 'The invoicing feature alone paid for the subscription in the first month.'
            },
          ].map((testimonial, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-black/[0.06]">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} size={16} className="text-amber-500 fill-amber-500" />
                ))}
              </div>
              <p className="text-black/70 mb-4 italic">"{testimonial.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white font-bold">
                  {testimonial.name.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-sm">{testimonial.name}</p>
                  <p className="text-xs text-black/50">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <div className="text-center bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-12 text-white">
        <Zap size={48} className="mx-auto mb-4" />
        <h2 className="text-3xl font-bold mb-4">Ready to Level Up?</h2>
        <p className="text-white/80 mb-8 max-w-lg mx-auto">
          Join 2,500+ Nigerian businesses already growing with Avenize Pro. 
          Start your free trial today - no credit card required.
        </p>
        <button className="px-8 py-4 bg-white text-indigo-600 font-bold rounded-xl hover:bg-white/90 transition shadow-xl">
          Start 14-Day Free Trial
        </button>
        <p className="text-white/60 text-sm mt-4">No credit card required • Cancel anytime</p>
      </div>
    </div>
  )
}
