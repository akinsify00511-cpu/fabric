// Builder / Board Dashboard — checklist #19/#34.
// The PLATFORM-OPERATOR surface (the Avenize builder's view), distinct from
// the per-business owner intelligence (#18). Shows AGGREGATE cross-business
// patterns: which modules get adopted/abandoned platform-wide, onboarding
// conversion, sector×module adoption — for sprint/product decisions.
//
// NOT a business-owner feature. The RPC gates on a platform_admins email
// allowlist (verified server-side via auth.uid), NOT a business role. A
// business owner/admin is NOT a platform admin and gets an "unauthorized"
// payload. This is the real boundary — the client check is UX-only.
//
// #21 boundary: aggregate only. Never business names, owner emails, customer
// data, or walled content (legal, disciplinary, payroll, litigation). The
// underlying cross-business RPCs stay REVOKED from authenticated; this page
// calls builder_dashboard, the only authenticated-callable aggregator.

import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { fetchBuilderDashboard, type BuilderDashboard } from '../lib/businessOS'
import { ClaimTag, ClaimNote } from '../components/Evidence'
import {
  Loader2, ShieldCheck, Lock, BarChart3, Users, TrendingUp, Globe,
  Activity, AlertTriangle,
} from 'lucide-react'

export default function BuilderDashboardPage() {
  const { session } = useAuth()
  const userEmail = session?.user?.email
  const [data, setData] = useState<BuilderDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const result = await fetchBuilderDashboard()
        if (!active) return
        setData(result)
      } catch (e: any) {
        console.error('builder_dashboard failed (non-blocking):', e)
        if (/could not find the function|PGRST202/i.test(e?.message || '')) {
          setError('The builder dashboard is not yet configured on this deployment.')
        } else {
          setError('Could not load platform analytics. Please try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Builder Dashboard</h1>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
          <p className="text-sm text-gray-600">{error || 'No platform analytics available yet.'}</p>
        </div>
      </div>
    )
  }

  // The RPC gate: non-platform-admins get authorized=false.
  if (!data.authorized) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-6 h-6 text-amber-600" />
          <h1 className="text-xl font-semibold text-gray-900">Builder Dashboard</h1>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <ShieldCheck className="w-8 h-8 text-amber-600 mb-3" />
          <p className="text-sm text-amber-800">
            This is the platform-operator dashboard for the Avenize team. It is
            not available to business accounts. Access is controlled by a
            platform-admin allowlist, verified server-side.
          </p>
          {userEmail && (
            <p className="text-xs text-amber-700 mt-3">Signed in as {userEmail}.</p>
          )}
        </div>
      </div>
    )
  }

  const oc = data.onboarding_conversion
  const cba = data.cross_business_adoption || []
  const smu = data.sector_module_usage || []

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Builder Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Platform-wide patterns across all businesses — aggregate only, for product decisions.
          </p>
        </div>
        <ClaimTag type="FACT" />
      </div>

      {/* #21 boundary */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 flex items-start gap-2">
        <Lock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-800">
          <strong>Data scope:</strong> aggregate counts and rates only. This view never exposes
          business names, owner identities, customer data, or privileged/walled content. The
          underlying queries are service-role-only; this page is the sole authorized aggregator.
        </p>
      </div>

      {/* Onboarding conversion */}
      {oc && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            Onboarding Conversion (All Businesses)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Authenticated" value={oc.total_authenticated} />
            <Stat label="Completed" value={oc.total_completed} tone="green" />
            <Stat label="Abandoned" value={oc.total_abandoned} tone={oc.total_abandoned > 0 ? 'amber' : undefined} />
            <Stat
              label="Conversion rate"
              value={oc.conversion_rate != null ? `${oc.conversion_rate}%` : '—'}
            />
            <Stat label="Median steps reached" value={oc.median_steps_reached ?? '—'} />
            <Stat
              label="Avg duration"
              value={oc.avg_duration_seconds != null ? `${Math.round(oc.avg_duration_seconds / 60)} min` : '—'}
            />
          </div>
          {oc.total_authenticated < 5 && (
            <ClaimNote tone="muted">Small sample ({oc.total_authenticated} businesses) — treat conversion rate as directional, not definitive (§21).</ClaimNote>
          )}
        </section>
      )}

      {/* Cross-business module adoption */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          Module Adoption (Platform-Wide)
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          How many businesses actually touch each module — the empirical "which of the 61 modules get used" data, independent of entitlements.
        </p>
        {cba.length === 0 ? (
          <ClaimNote tone="muted">No module usage recorded yet. As businesses use Avenize, adoption counts will appear here.</ClaimNote>
        ) : (
          <div className="space-y-2">
            {cba.slice(0, 15).map((m) => {
              const max = cba[0]?.businesses_touching || 1
              return (
                <div key={m.module_key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900 capitalize">{m.module_key.replace(/_/g, ' ')}</span>
                    <span className="text-gray-500">
                      {m.businesses_touching} business{m.businesses_touching === 1 ? '' : 'es'} · {m.total_events} events
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(m.businesses_touching / max) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Sector × module adoption */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-600" />
          Sector × Module Adoption
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Which sectors adopt which modules — product-market signal. "Selecting" = chosen at setup; "using" = touched in 30 days. Adoption rate = using / selecting.
        </p>
        {smu.length === 0 ? (
          <ClaimNote tone="muted">No sector adoption data yet. As more businesses across sectors configure their workspaces, the sector×module map will appear here.</ClaimNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="text-left py-2 pr-4 font-medium">Sector</th>
                  <th className="text-left py-2 pr-4 font-medium">Module</th>
                  <th className="text-right py-2 pr-4 font-medium">Selecting</th>
                  <th className="text-right py-2 pr-4 font-medium">Using</th>
                  <th className="text-right py-2 font-medium">Adoption %</th>
                </tr>
              </thead>
              <tbody>
                {smu.slice(0, 20).map((s, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 text-gray-900">{s.industry}</td>
                    <td className="py-2 pr-4 text-gray-700 capitalize">{s.module_key.replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-4 text-right text-gray-600">{s.businesses_selecting}</td>
                    <td className="py-2 pr-4 text-right text-gray-600">{s.businesses_using}</td>
                    <td className="py-2 text-right">
                      {s.adoption_rate != null ? (
                        <span className={s.adoption_rate < 30 ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>
                          {s.adoption_rate}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ClaimNote tone="muted">
          Low adoption rates (selecting but not using) flag a say-vs-use gap — a product-market signal that a module is promised but not delivering.
        </ClaimNote>
      </section>

      {/* Honest product-gap note (#16 items 4-7, blocked) */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          What this dashboard cannot tell you yet
        </h2>
        <ClaimNote tone="muted">
          External market variance (emerging sector behavior, product-market gaps vs. competitors,
          industry positioning beyond Avenize's own customers) requires sourced external data —
          not fabricated from first-party telemetry (§22). The sector×module table here is a
          first-party benchmark only. Cross-referencing with external industry reports is a follow-up.
        </ClaimNote>
      </section>

      <div className="flex items-center gap-2 text-xs text-gray-400 pt-2">
        <Users className="w-3 h-3" />
        <span>Builder dashboard — platform-operator surface. Aggregate only, no business PII.</span>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'green' | 'amber' }) {
  const color = tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900'
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  )
}
