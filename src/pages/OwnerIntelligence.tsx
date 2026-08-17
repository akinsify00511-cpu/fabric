// Owner-Only Business Intelligence — checklist #18.
// A private intelligence layer ordinary users cannot access. Owner/admin-gated
// at THREE layers (defense-in-depth): (1) client role check here (UX only),
// (2) the owner_intelligence RPC verifies role IN ('owner','admin') AND business
// membership via get_current_staff (the real boundary — SECURITY DEFINER bypasses
// RLS so the RPC guard is the security control), (3) RLS on usage_events.
//
// #21 boundary: surfaces ONLY operational/usage data (usage_events + automations).
// NEVER legal_cases, disciplinary, board finance, or litigation — those live
// behind separate walled policies and are excluded from this layer by design.
// The RPC declares data_scope = 'operational_and_usage_only'.

import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { fetchOwnerIntelligence, fetchSectorBenchmark, type OwnerIntelligence, type SectorBenchmark } from '../lib/businessOS'
import { ClaimTag, ClaimNote } from '../components/Evidence'
import {
  ShieldCheck, ShieldAlert, Loader2, Activity, Zap, Clock, AlertTriangle,
  BarChart3, TrendingDown, Settings2, Lock, CheckCircle2, XCircle, Globe,
} from 'lucide-react'

function useIsOwnerAdmin() {
  const { staff } = useAuth()
  return staff?.role === 'owner' || staff?.role === 'admin'
}

const REUSE_COLORS: Record<string, string> = {
  reused: 'text-green-700 bg-green-50',
  returning: 'text-blue-700 bg-blue-50',
  activated: 'text-amber-700 bg-amber-50',
  view_only: 'text-gray-600 bg-gray-100',
}

export default function OwnerIntelligence() {
  const isOwnerAdmin = useIsOwnerAdmin()
  const { staff } = useAuth()
  const bid = staff?.business_id
  const [data, setData] = useState<OwnerIntelligence | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [benchmark, setBenchmark] = useState<SectorBenchmark | null>(null)

  useEffect(() => {
    if (!bid || !isOwnerAdmin) {
      setLoading(false)
      return
    }
    let active = true
    ;(async () => {
      try {
        const result = await fetchOwnerIntelligence(bid)
        if (!active) return
        setData(result)
      } catch (e: any) {
        // Non-blocking (§24): the RPC may not be deployed, or a transient
        // error. Surface honestly but never crash.
        console.error('owner_intelligence failed (non-blocking):', e)
        if (/could not find the function|PGRST202/i.test(e?.message || '')) {
          setError('Intelligence analytics are not yet configured on this deployment.')
        } else {
          setError('Could not load intelligence analytics. Please try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
      // #16 sector benchmark (best-effort, non-blocking).
      try {
        const sb = await fetchSectorBenchmark(bid)
        if (active) setBenchmark(sb)
      } catch (e) {
        console.error('sector_benchmark failed (non-blocking):', e)
      }
    })()
    return () => { active = false }
  }, [bid, isOwnerAdmin])

  // Layer 1 (UX gate): non-owners never see the analytics. The RPC is the
  // real boundary (layer 2), so even a direct URL or a tampered client
  // cannot read another business's intelligence.
  if (!isOwnerAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-6 h-6 text-amber-600" />
          <h1 className="text-xl font-semibold text-gray-900">Owner Intelligence</h1>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <ShieldAlert className="w-8 h-8 text-amber-600 mb-3" />
          <p className="text-sm text-amber-800">
            This area is restricted to business owners and admins. The analytics here
            cover how your team uses Avenize, which modules are adopted or abandoned,
            and where workflows stall. Access is verified server-side.
          </p>
        </div>
      </div>
    )
  }

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
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Owner Intelligence</h1>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
          <p className="text-sm text-gray-600">{error || 'No intelligence data available yet.'}</p>
          <ClaimNote tone="muted">As your team uses Avenize, analytics will populate here automatically.</ClaimNote>
        </div>
      </div>
    )
  }

  const fa = data.feature_activation || []
  const qt = data.quick_turnoff || []
  const ia = data.ignored_automations || []
  const wf = data.workflow_funnel || []
  const oc = data.onboarding_completion

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            Owner Intelligence
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            How your team actually uses Avenize — adoption, abandonment, and workflow health.
          </p>
        </div>
        <ClaimTag type="FACT" />
      </div>

      {/* #21 boundary declaration */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 flex items-start gap-2">
        <Lock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-800">
          <strong>Data scope:</strong> operational and usage data only. This view never surfaces
          privileged or walled content (legal, disciplinary, board finance, litigation). Access is
          verified server-side — ordinary staff cannot reach this data.
        </p>
      </div>

      {/* Onboarding completion */}
      {oc && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            Onboarding Completion
          </h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500">Completed</div>
              <div className="font-medium text-gray-900">{new Date(oc.completed_at).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Steps reached</div>
              <div className="font-medium text-gray-900">{oc.steps_reached} / 5</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Duration</div>
              <div className="font-medium text-gray-900">{Math.round(oc.duration_seconds / 60)} min</div>
            </div>
          </div>
        </section>
      )}

      {/* Feature activation + reuse */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          Feature Adoption & Reuse
        </h2>
        {fa.length === 0 ? (
          <ClaimNote tone="muted">No feature usage recorded yet. As your team creates, updates, or activates items, modules will appear here with their adoption status.</ClaimNote>
        ) : (
          <div className="space-y-2">
            {fa.map((f) => (
              <div key={f.module_key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <div className="text-sm font-medium text-gray-900 capitalize">{f.module_key.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-gray-500">
                    {f.first_active_at ? `First active ${new Date(f.first_active_at).toLocaleDateString()}` : 'Viewed but not yet used'}
                    {f.last_active_at && ` · last ${new Date(f.last_active_at).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{f.distinct_active_days}d active</span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${REUSE_COLORS[f.reuse_label] || REUSE_COLORS.view_only}`}>
                    {f.reuse_label.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <ClaimNote tone="muted">"view_only" = a module was opened but never used to create/edit. "activated" = used once. "returning" = 2–4 distinct days. "reused" = 5+ days — genuine adoption.</ClaimNote>
      </section>

      {/* Quick turnoff — modules switched off quickly */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-amber-600" />
          Modules Switched Off Quickly
          <ClaimTag type="INFERENCE" />
        </h2>
        <p className="text-xs text-gray-500 mb-3">Tools selected then deselected within 7 days — a signal of mismatched expectations at setup.</p>
        {qt.length === 0 ? (
          <ClaimNote tone="muted">No tools were switched off quickly. Good sign — your team's initial selections are sticking.</ClaimNote>
        ) : (
          <div className="space-y-2">
            {qt.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="text-sm font-medium text-gray-900 capitalize">{t.tool_key.replace(/_/g, ' ')}</div>
                <div className="text-xs text-gray-500">
                  Selected {new Date(t.selected_at).toLocaleDateString()} → off in {t.days_until_turnoff}d
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ignored automations */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-600" />
          Ignored Automations
        </h2>
        <p className="text-xs text-gray-500 mb-3">Automations created but never (or rarely) triggered — candidates for cleanup or reconfiguration.</p>
        {ia.length === 0 ? (
          <ClaimNote tone="muted">No automations recorded. When you create automations, those that never fire will surface here.</ClaimNote>
        ) : (
          <div className="space-y-2">
            {ia.map((a) => {
              const ignored = a.run_count === 0 && a.enabled
              return (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    {ignored ? <XCircle className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    <div>
                      <div className="text-sm font-medium text-gray-900">{a.name}</div>
                      <div className="text-xs text-gray-500">{a.trigger_type} · created {new Date(a.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">{a.run_count} runs</div>
                    <div className="text-xs text-gray-500">{a.enabled ? 'enabled' : 'disabled'}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Workflow funnel */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          Workflow Completion
        </h2>
        <p className="text-xs text-gray-500 mb-3">Which workflows get finished vs abandoned. "Abandoned" = started with no completion within 24 hours.</p>
        {wf.length === 0 ? (
          <ClaimNote tone="muted">No workflow activity recorded yet. As your team works through multi-step processes (quotes, invoices, etc.), completion rates will appear here.</ClaimNote>
        ) : (
          <div className="space-y-3">
            {wf.map((w) => (
              <div key={w.workflow} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-900 capitalize">{w.workflow}</span>
                  <span className="text-gray-500">{w.completed} / {w.started} completed</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${w.completion_rate ?? 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{w.completion_rate ?? '—'}% completion</span>
                  {w.abandoned > 0 && (
                    <span className="text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {w.abandoned} abandoned
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <ClaimNote tone="muted">Abandonment is inferred (a start with no matching completion within 24h) — not a fact that the user gave up, but a measurable signal.</ClaimNote>
      </section>

      {/* Sector benchmark — how this business compares to its sector (#16) */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-600" />
          Sector Benchmark
          <ClaimTag type="INFERENCE" />
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          How your module adoption compares to other businesses in your sector. Aggregated and anonymized — no individual business is ever identified. First-party data only.
        </p>
        {(() => {
          if (!benchmark || !benchmark.modules || benchmark.modules.length === 0) {
            return <ClaimNote tone="muted">No sector benchmark available yet. As more businesses in your sector configure their workspaces, adoption comparisons will appear here.</ClaimNote>
          }
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                  Sector: {benchmark.industry}
                </span>
                <span>Sample size: {benchmark.sector_sample_size} business{benchmark.sector_sample_size === 1 ? '' : 'es'}</span>
                {benchmark.sector_sample_size < 5 && (
                  <span className="text-amber-600">Small sample — treat with caution</span>
                )}
              </div>
              {benchmark.modules.slice(0, 10).map((m) => (
                <div key={m.module_key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900 capitalize flex items-center gap-2">
                      {m.module_key.replace(/_/g, ' ')}
                      {m.i_selected && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">you</span>}
                      {m.i_used && <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700">in use</span>}
                    </span>
                    <span className="text-gray-500">{m.sector_adoption_pct ?? '—'}% of sector</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${m.sector_adoption_pct ?? 0}%` }} />
                  </div>
                </div>
              ))}
              <ClaimNote tone="muted">
                Modules you haven't enabled but are popular in your sector may surface as recommendations.
                External market data (industry trends beyond Avenize's customers) is not fabricated — this is a first-party benchmark only.
              </ClaimNote>
            </div>
          )
        })()}
      </section>

      <div className="flex items-center gap-2 text-xs text-gray-400 pt-2">
        <Settings2 className="w-3 h-3" />
        <span>Owner intelligence reads operational telemetry only. Refreshes as your team uses Avenize.</span>
      </div>
    </div>
  )
}
