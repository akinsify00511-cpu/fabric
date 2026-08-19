// Discovery Intelligence — Phase B as a product layer (B7–B14).
// One surface: where the business appears in search + AI answers (SEO/AEO/GEO),
// whether AI describes the brand truthfully (B8), who gets cited instead (B9),
// what to build next (B10/B11), and what discovery produced in revenue (B14).
//
// Role-based information architecture (Phase D): executives + marketing see
// this; other employees don't. The UX gate here is emphasis only — RLS +
// membership-guarded RPCs are the security boundary.
//
// §22: every number comes from recorded observations/referrals. Empty means
// empty — the page teaches how to start, it never fabricates coverage.

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import {
  fetchDiscoveryOverview, fetchDiscoveryLeaderboard, fetchDiscoveryBrandTruths,
  fetchDiscoveryRoi, seedDiscoveryDefaults,
  type DiscoveryOverview, type DiscoveryLeaderboardRow, type DiscoveryBrandTruthRow,
  type DiscoveryRoi, type ContentOpportunity, type DiscoveryTarget,
} from '../lib/businessOS'
import { classifyBrandMismatch } from '../lib/discoveryIntel'
import { deriveFunction } from '../lib/functionHome'
import { useToast } from '../components/Toast'
import EmptyState from '../components/EmptyState'
import { ClaimTag, ClaimNote } from '../components/Evidence'
import {
  Globe, Search, Sparkles, ShieldAlert, ShieldCheck, Loader2, Plus,
  TrendingUp, AlertTriangle, Lock, FileText, Target, CheckCircle2,
  CircleDot, XCircle,
} from 'lucide-react'

const ENGINES = ['google', 'bing', 'chatgpt', 'perplexity', 'claude', 'gemini', 'other']

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'text-[var(--av-danger)] bg-[var(--av-danger-soft)]',
  high: 'text-[var(--av-danger)] bg-[var(--av-danger-soft)]',
  medium: 'text-[var(--av-warning)] bg-[var(--av-warning-soft)]',
  low: 'text-[var(--av-info)] bg-[var(--av-primary-soft)]',
}

const OPP_STATUSES = ['suggested', 'approved', 'in_progress', 'published', 'rejected'] as const

function useDiscoveryAccess() {
  const { staff } = useAuth()
  if (!staff) return false
  if (staff.role === 'owner' || staff.role === 'admin' || staff.role === 'manager') return true
  return deriveFunction(staff.job_title, staff.department ?? null, []) === 'marketing'
}

export default function DiscoveryIntelligence() {
  const { staff } = useAuth()
  const allowed = useDiscoveryAccess()
  const bid = staff?.business_id ?? null
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<DiscoveryOverview | null>(null)
  const [leaderboard, setLeaderboard] = useState<DiscoveryLeaderboardRow[]>([])
  const [truths, setTruths] = useState<DiscoveryBrandTruthRow[]>([])
  const [roi, setRoi] = useState<DiscoveryRoi | null>(null)
  const [opportunities, setOpportunities] = useState<ContentOpportunity[]>([])
  const [targets, setTargets] = useState<DiscoveryTarget[]>([])
  const [showObserve, setShowObserve] = useState(false)

  async function loadAll() {
    if (!bid) return
    const [ov, lb, tr, ro] = await Promise.all([
      fetchDiscoveryOverview(bid),
      fetchDiscoveryLeaderboard(bid),
      fetchDiscoveryBrandTruths(bid),
      fetchDiscoveryRoi(bid),
    ])
    setOverview(ov)
    setLeaderboard(lb)
    setTruths(tr)
    setRoi(ro)
    const [{ data: opps }, { data: tgts }] = await Promise.all([
      supabase.from('content_opportunities').select('*').eq('business_id', bid)
        .order('priority_score', { ascending: false }).limit(50),
      supabase.from('discovery_targets').select('*').eq('business_id', bid)
        .eq('active', true).order('priority', { ascending: false }),
    ])
    setOpportunities((opps || []) as ContentOpportunity[])
    setTargets((tgts || []) as DiscoveryTarget[])
  }

  useEffect(() => {
    if (!bid || !allowed) { setLoading(false); return }
    let active = true
    ;(async () => {
      // First run: seed starter truths + tracked queries (idempotent).
      await seedDiscoveryDefaults(bid)
      if (!active) return
      await loadAll()
      if (active) setLoading(false)
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bid, allowed])

  const gapQueries = useMemo(
    () => leaderboard.filter((r) => r.checks > 0 && r.avenize_present === 0 && r.top_competitors.length > 0),
    [leaderboard],
  )

  if (!staff) return null

  if (!allowed) {
    return (
      <div className="max-w-xl mx-auto mt-16">
        <div className="av-card p-8 text-center">
          <Lock size={28} className="mx-auto mb-3 text-[var(--av-text-faint)]" />
          <h1 className="text-lg font-semibold text-[var(--av-text)]">Discovery Intelligence is restricted</h1>
          <p className="mt-2 text-sm text-[var(--av-text-muted)]">
            This surface is for executives and the marketing function. Your role doesn't include
            growth &amp; discovery analytics.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--av-text-muted)]">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading Discovery Intelligence…
      </div>
    )
  }

  const hasData = (overview?.observations_30d ?? 0) > 0

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium tracking-wide uppercase text-[var(--av-primary)]">Growth · Discovery Intelligence</div>
          <h1 className="text-2xl font-semibold text-[var(--av-text)]">Where the market discovers you</h1>
          <p className="mt-1 text-sm text-[var(--av-text-muted)]">
            Search + AI-answer visibility, brand truth, competitor citations, content opportunities — and what they produce.
          </p>
        </div>
        <button
          onClick={() => setShowObserve(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--av-radius-md)] bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] transition"
        >
          <Plus size={16} /> Record observation
        </button>
      </div>

      {/* B13 — Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard icon={Search} label="Presence (30d)" value={overview?.presence_rate != null ? `${overview.presence_rate}%` : '—'} sub={`${overview?.present_30d ?? 0}/${overview?.observations_30d ?? 0} checks`} />
        <StatCard icon={Sparkles} label="AI citations (30d)" value={overview?.citation_rate != null ? `${overview.citation_rate}%` : '—'} sub={`${overview?.cited_30d ?? 0} cited`} />
        <StatCard icon={Globe} label="Tracked queries" value={String(overview?.targets ?? 0)} sub={`${leaderboard.length} active`} />
        <StatCard
          icon={overview?.open_mismatches ? ShieldAlert : ShieldCheck}
          label="Brand truth"
          value={overview?.open_mismatches ? `${overview.open_mismatches} open` : 'Clean'}
          sub={`${overview?.brand_checks ?? 0} checks`}
          tone={overview?.open_mismatches ? 'danger' : 'success'}
        />
        <StatCard icon={TrendingUp} label="Discovery visits" value={String(overview?.referrals ?? 0)} sub={`${overview?.referrals_30d ?? 0} this month`} />
        <StatCard
          icon={Target}
          label="Attributed revenue"
          value={roi?.attributed_revenue ? `₦${Math.round(roi.attributed_revenue).toLocaleString()}` : '—'}
          sub={roi?.linked ? `${roi.linked} linked` : 'no links yet'}
        />
      </div>

      {!hasData && (
        <div className="av-card p-6">
          <EmptyState
            icon={Globe}
            title="No discovery data yet"
            description="We seeded your first tracked queries and brand truths. Record what search engines and AI assistants say when you ask about your business — the trends, gaps and ROI build from there."
            gamified
            milestone="Your first observation"
            hint="Ask an AI assistant about your business, then record what it said."
            tip="Start with your brand name in ChatGPT or Google — one observation starts the picture."
            action={{ label: 'Record observation', onClick: () => setShowObserve(true) }}
          />
        </div>
      )}

      {/* Visibility trend (12 weeks) + per-engine */}
      {hasData && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="av-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[var(--av-text)]">Visibility trend</h2>
              <ClaimTag type="FACT" />
            </div>
            <div className="flex items-end gap-2 h-32">
              {(overview?.trend ?? []).map((w) => {
                const pct = w.checks > 0 ? w.present / w.checks : 0
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-[var(--av-primary)]"
                      style={{ height: `${Math.max(4, pct * 100)}%`, opacity: 0.35 + pct * 0.65 }}
                      title={`${w.week}: ${w.present}/${w.checks} present`}
                    />
                    <div className="text-[10px] text-[var(--av-text-faint)]">{w.week.slice(5)}</div>
                  </div>
                )
              })}
            </div>
            <ClaimNote>Share of recorded checks where your brand appeared, per week.</ClaimNote>
          </div>
          <div className="av-card p-5">
            <h2 className="font-semibold text-[var(--av-text)] mb-3">By engine</h2>
            <div className="space-y-2">
              {(overview?.engines ?? []).map((e) => (
                <div key={e.engine} className="flex items-center gap-3">
                  <div className="w-24 text-sm capitalize text-[var(--av-text)]">{e.engine}</div>
                  <div className="flex-1 h-2 rounded-full bg-[var(--av-surface-2)]">
                    <div
                      className="h-2 rounded-full bg-[var(--av-primary)]"
                      style={{ width: `${e.checks > 0 ? (100 * e.present) / e.checks : 0}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-xs text-[var(--av-text-muted)]">
                    {e.present}/{e.checks} · {e.cited} cited
                  </div>
                </div>
              ))}
              {(overview?.engines ?? []).length === 0 && (
                <p className="text-sm text-[var(--av-text-muted)]">No engine checks recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* B8 — AI Brand Truth Monitor */}
      <div className="av-card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-[var(--av-text)]">AI Brand Truth Monitor</h2>
          <ClaimTag type="INFERENCE" />
        </div>
        <p className="text-sm text-[var(--av-text-muted)] mb-4">
          How AI systems describe your business vs what you declare. Mismatches get a severity and a recommended correction.
        </p>
        <div className="space-y-3">
          {truths.map((t) => (
            <div key={t.truth_id} className="rounded-[var(--av-radius-md)] border border-[var(--av-border)] p-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--av-text-faint)]">{t.aspect.replace(/_/g, ' ')}</span>
                {t.latest_mismatch ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_STYLE[t.latest_severity ?? 'low']}`}>
                    {t.latest_severity} mismatch{Number(t.open_checks) > 1 ? ` · ${t.open_checks} open` : ''}
                  </span>
                ) : t.latest_ai_statement ? (
                  <span className="text-xs px-2 py-0.5 rounded-full text-[var(--av-success)] bg-[var(--av-success-soft)] inline-flex items-center gap-1">
                    <CheckCircle2 size={12} /> accurate
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--av-surface-2)] text-[var(--av-text-muted)]">not checked yet</span>
                )}
              </div>
              <div className="text-sm text-[var(--av-text)]"><span className="font-medium">Expected:</span> {t.expected_statement}</div>
              {t.latest_ai_statement && (
                <div className="mt-1 text-sm text-[var(--av-text-muted)]">
                  <span className="font-medium">AI said{t.latest_engine ? ` (${t.latest_engine})` : ''}:</span> {t.latest_ai_statement}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* B9 — Query leaderboard / competitor visibility */}
      <div className="av-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[var(--av-text)]">Query leaderboard</h2>
          <ClaimTag type="FACT" />
        </div>
        {leaderboard.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No queries tracked"
            description="Tracked queries are the questions your buyers ask search engines and AI assistants."
            gamified
            hint="Your brand queries were seeded — record observations against them."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--av-text-faint)] border-b border-[var(--av-border)]">
                  <th className="py-2 pr-4">Query</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">You</th>
                  <th className="py-2">Cited competitors</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r) => (
                  <tr key={r.target_id} className="border-b border-[var(--av-border)] last:border-0">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-[var(--av-text)]">{r.query}</div>
                      <div className="text-xs text-[var(--av-text-faint)]">{r.cluster}</div>
                    </td>
                    <td className="py-2.5 pr-4 uppercase text-xs text-[var(--av-text-muted)]">{r.kind}</td>
                    <td className="py-2.5 pr-4">
                      {r.checks === 0 ? (
                        <span className="text-[var(--av-text-faint)]">not checked</span>
                      ) : (
                        <span className={r.avenize_present > 0 ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'}>
                          {r.avenize_present}/{r.checks} present · {r.avenize_cited} cited
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {r.top_competitors.length === 0 ? (
                        <span className="text-[var(--av-text-faint)]">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {r.top_competitors.map((c) => (
                            <span key={c.name} className="text-xs px-2 py-0.5 rounded-full bg-[var(--av-surface-2)] text-[var(--av-text-muted)]">
                              {c.name} ×{c.cited}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {gapQueries.length > 0 && (
          <div className="mt-4 rounded-[var(--av-radius-md)] bg-[var(--av-warning-soft)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--av-warning)]">
              <AlertTriangle size={15} /> {gapQueries.length} content gap{gapQueries.length > 1 ? 's' : ''} detected
            </div>
            <p className="mt-1 text-sm text-[var(--av-text-muted)]">
              Competitors are cited where you are absent: {gapQueries.slice(0, 3).map((g) => `“${g.query}”`).join(', ')}
              {gapQueries.length > 3 ? ` and ${gapQueries.length - 3} more` : ''}. Each gap is a content opportunity below.
            </p>
          </div>
        )}
      </div>

      {/* B10/B11 — Content opportunities */}
      <OpportunitiesPanel
        businessId={bid!}
        opportunities={opportunities}
        onChanged={loadAll}
        showToast={showToast}
      />

      {/* B14 — Attribution / Discovery ROI */}
      <div className="av-card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-[var(--av-text)]">Discovery → Revenue</h2>
          <ClaimTag type="FACT" />
        </div>
        <p className="text-sm text-[var(--av-text-muted)] mb-4">
          The closed loop: discovery → visit → signup/deal → revenue. Counted only through explicit links — never estimated.
        </p>
        {roi?.note ? (
          <p className="text-sm text-[var(--av-text-muted)]">{roi.note}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <MiniStat label="Visits" value={String(roi?.referrals ?? 0)} />
              <MiniStat label="Linked" value={String(roi?.linked ?? 0)} />
              <MiniStat label="Won-deal revenue" value={`₦${Math.round(roi?.deal_revenue ?? 0).toLocaleString()}`} />
              <MiniStat label="Subscription revenue" value={`₦${Math.round(roi?.subscription_revenue ?? 0).toLocaleString()}`} />
            </div>
            <div className="space-y-2">
              {(roi?.by_source ?? []).map((s) => (
                <div key={s.source} className="flex items-center gap-3 text-sm">
                  <div className="w-28 capitalize text-[var(--av-text)]">{s.source}</div>
                  <div className="flex-1 h-2 rounded-full bg-[var(--av-surface-2)]">
                    <div
                      className="h-2 rounded-full bg-[var(--av-success)]"
                      style={{ width: `${roi?.referrals ? (100 * s.visits) / roi.referrals : 0}%` }}
                    />
                  </div>
                  <div className="w-24 text-right text-xs text-[var(--av-text-muted)]">{s.visits} visits · {s.linked} linked</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showObserve && (
        <RecordObservationModal
          businessId={bid!}
          targets={targets}
          truths={truths}
          onClose={() => setShowObserve(false)}
          onSaved={async () => { setShowObserve(false); await loadAll(); showToast('Observation recorded', 'success') }}
        />
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: typeof Search
  label: string
  value: string
  sub?: string
  tone?: 'success' | 'danger'
}) {
  const color = tone === 'danger' ? 'text-[var(--av-danger)]' : tone === 'success' ? 'text-[var(--av-success)]' : 'text-[var(--av-primary)]'
  return (
    <div className="av-card p-4">
      <Icon size={16} className={`${color} mb-2`} />
      <div className="text-xs text-[var(--av-text-muted)]">{label}</div>
      <div className="text-xl font-semibold text-[var(--av-text)]">{value}</div>
      {sub && <div className="text-[11px] text-[var(--av-text-faint)] mt-0.5">{sub}</div>}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--av-radius-md)] bg-[var(--av-surface-2)] p-3">
      <div className="text-xs text-[var(--av-text-muted)]">{label}</div>
      <div className="text-lg font-semibold text-[var(--av-text)]">{value}</div>
    </div>
  )
}

function OpportunitiesPanel({ businessId, opportunities, onChanged, showToast }: {
  businessId: string
  opportunities: ContentOpportunity[]
  onChanged: () => Promise<void>
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [intent, setIntent] = useState('informational')
  const [goal, setGoal] = useState('')
  const [rationale, setRationale] = useState('')
  const [saving, setSaving] = useState(false)

  async function createOpportunity() {
    if (!title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('content_opportunities').insert({
      business_id: businessId,
      title: title.trim(),
      search_intent: intent,
      conversion_goal: goal.trim() || null,
      rationale: rationale.trim() || null,
    })
    setSaving(false)
    if (error) { showToast(error.message, 'error'); return }
    setTitle(''); setGoal(''); setRationale(''); setShowCreate(false)
    showToast('Opportunity added', 'success')
    await onChanged()
  }

  async function setStatus(opp: ContentOpportunity, status: ContentOpportunity['status']) {
    const { error } = await supabase.from('content_opportunities').update({ status }).eq('id', opp.id)
    if (error) { showToast(error.message, 'error'); return }
    await onChanged()
  }

  async function toggleGate(opp: ContentOpportunity, field: 'originality_confirmed' | 'evidence_confirmed' | 'human_reviewed') {
    const { error } = await supabase.from('content_opportunities').update({ [field]: !opp[field] }).eq('id', opp.id)
    if (error) { showToast(error.message, 'error'); return }
    await onChanged()
  }

  return (
    <div className="av-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-[var(--av-text)]">Content opportunities</h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--av-primary)] hover:text-[var(--av-primary-hover)]"
        >
          <Plus size={15} /> Add
        </button>
      </div>
      <p className="text-sm text-[var(--av-text-muted)] mb-4">
        What to write and why. Publishing requires the quality gate: originality + evidence + human review. Authority, not volume.
      </p>

      {showCreate && (
        <div className="mb-4 rounded-[var(--av-radius-md)] border border-[var(--av-border)] p-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Working title — e.g. The definitive guide to multi-subsidiary management"
            className="w-full px-3 py-2 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] text-sm bg-[var(--av-surface)] text-[var(--av-text)]"
          />
          <div className="grid md:grid-cols-2 gap-3">
            <select
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              className="px-3 py-2 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] text-sm bg-[var(--av-surface)] text-[var(--av-text)]"
            >
              <option value="informational">Informational intent</option>
              <option value="commercial">Commercial intent</option>
              <option value="transactional">Transactional intent</option>
              <option value="navigational">Navigational intent</option>
            </select>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Conversion goal — e.g. book a demo"
              className="px-3 py-2 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] text-sm bg-[var(--av-surface)] text-[var(--av-text)]"
            />
          </div>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why it matters — cite the evidence (a content gap, a competitor citation, search demand)"
            rows={2}
            className="w-full px-3 py-2 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] text-sm bg-[var(--av-surface)] text-[var(--av-text)]"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm text-[var(--av-text-muted)]">Cancel</button>
            <button
              onClick={createOpportunity}
              disabled={saving || !title.trim()}
              className="px-4 py-1.5 rounded-[var(--av-radius-sm)] bg-[var(--av-primary)] text-white text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add opportunity'}
            </button>
          </div>
        </div>
      )}

      {opportunities.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No content opportunities yet"
          description="Opportunities come from content gaps — queries where competitors get cited and you don't."
          gamified
          milestone="Your first opportunity"
          hint="Record a few observations; gaps surface automatically. Or add one manually."
          tip="One definitive, evidence-backed guide beats ten generic posts."
        />
      ) : (
        <div className="space-y-3">
          {opportunities.map((o) => {
            const gateReady = o.originality_confirmed && o.evidence_confirmed && o.human_reviewed
            return (
              <div key={o.id} className="rounded-[var(--av-radius-md)] border border-[var(--av-border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--av-text)]">{o.title}</div>
                    <div className="mt-0.5 text-xs text-[var(--av-text-faint)]">
                      {o.search_intent ?? 'intent n/a'}{o.conversion_goal ? ` · goal: ${o.conversion_goal}` : ''}
                    </div>
                    {o.rationale && <div className="mt-1 text-sm text-[var(--av-text-muted)]">{o.rationale}</div>}
                  </div>
                  <select
                    value={o.status}
                    onChange={(e) => setStatus(o, e.target.value as ContentOpportunity['status'])}
                    className="px-2 py-1 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] text-xs bg-[var(--av-surface)] text-[var(--av-text)]"
                  >
                    {OPP_STATUSES.map((s) => (
                      <option key={s} value={s} disabled={s === 'published' && !gateReady && o.status !== 'published'}>
                        {s.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[var(--av-text-faint)]">Quality gate:</span>
                  {([
                    ['originality_confirmed', 'Original'],
                    ['evidence_confirmed', 'Evidence'],
                    ['human_reviewed', 'Human-reviewed'],
                  ] as const).map(([field, label]) => (
                    <button
                      key={field}
                      onClick={() => toggleGate(o, field)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                        o[field]
                          ? 'border-[var(--av-success)] text-[var(--av-success)] bg-[var(--av-success-soft)]'
                          : 'border-[var(--av-border)] text-[var(--av-text-muted)]'
                      }`}
                    >
                      {o[field] ? <CheckCircle2 size={11} /> : <CircleDot size={11} />} {label}
                    </button>
                  ))}
                  {!gateReady && o.status !== 'published' && (
                    <span className="inline-flex items-center gap-1 text-[var(--av-text-faint)]">
                      <XCircle size={11} /> publish unlocks when all three are true
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RecordObservationModal({ businessId, targets, truths, onClose, onSaved }: {
  businessId: string
  targets: DiscoveryTarget[]
  truths: DiscoveryBrandTruthRow[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [engine, setEngine] = useState('chatgpt')
  const [present, setPresent] = useState(true)
  const [cited, setCited] = useState(false)
  const [citationUrl, setCitationUrl] = useState('')
  const [competitors, setCompetitors] = useState('')
  const [aiStatement, setAiStatement] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!targetId) return
    setSaving(true)
    const competitorRows = competitors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, cited: true }))
    const { error } = await supabase.from('discovery_observations').insert({
      business_id: businessId,
      target_id: targetId,
      engine,
      avenize_present: present,
      avenize_cited: cited,
      citation_url: citationUrl.trim() || null,
      competitors: competitorRows,
      ai_statement: aiStatement.trim() || null,
      observed_by: staff?.id ?? null,
    })
    if (error) {
      setSaving(false)
      showToast(error.message, 'error')
      return
    }

    // B8: when the observation carries an AI description of the brand, run the
    // deterministic truth check against each declared truth and record it.
    if (aiStatement.trim()) {
      const rows = truths.map((t) => {
        const verdict = classifyBrandMismatch(t.expected_statement, aiStatement)
        return {
          business_id: businessId,
          truth_id: t.truth_id,
          engine,
          ai_statement: aiStatement.trim(),
          mismatch: verdict.mismatch,
          severity: verdict.severity === 'none' ? 'low' : verdict.severity,
          recommended_correction: verdict.correction,
        }
      })
      if (rows.length > 0) {
        const { error: checkError } = await supabase.from('discovery_brand_checks').insert(rows)
        if (checkError) console.warn('[discovery] brand check insert failed:', checkError)
      }
    }

    setSaving(false)
    await onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-[var(--av-radius-lg)] bg-[var(--av-surface)] p-6 shadow-[var(--av-shadow-float)]">
        <h2 className="text-lg font-semibold text-[var(--av-text)] mb-1">Record an observation</h2>
        <p className="text-sm text-[var(--av-text-muted)] mb-4">
          Ask the engine the tracked question, then record exactly what it answered. Facts only.
        </p>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-[var(--av-text-muted)]">Query</span>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] bg-[var(--av-surface)] text-[var(--av-text)]"
            >
              {targets.map((t) => <option key={t.id} value={t.id}>{t.query}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-[var(--av-text-muted)]">Engine</span>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] bg-[var(--av-surface)] text-[var(--av-text)]"
              >
                {ENGINES.map((e) => <option key={e} value={e} className="capitalize">{e}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-4 pb-1">
              <label className="inline-flex items-center gap-1.5 text-sm text-[var(--av-text)]">
                <input type="checkbox" checked={present} onChange={(e) => setPresent(e.target.checked)} /> Appeared
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm text-[var(--av-text)]">
                <input type="checkbox" checked={cited} onChange={(e) => setCited(e.target.checked)} /> Cited
              </label>
            </div>
          </div>
          {cited && (
            <input
              value={citationUrl}
              onChange={(e) => setCitationUrl(e.target.value)}
              placeholder="Citation URL (where it pointed)"
              className="w-full px-3 py-2 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] text-sm bg-[var(--av-surface)] text-[var(--av-text)]"
            />
          )}
          <input
            value={competitors}
            onChange={(e) => setCompetitors(e.target.value)}
            placeholder="Competitors cited (comma-separated names)"
            className="w-full px-3 py-2 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] text-sm bg-[var(--av-surface)] text-[var(--av-text)]"
          />
          <textarea
            value={aiStatement}
            onChange={(e) => setAiStatement(e.target.value)}
            placeholder="If the engine described your business, paste exactly what it said (runs the Brand Truth check)"
            rows={3}
            className="w-full px-3 py-2 rounded-[var(--av-radius-sm)] border border-[var(--av-border)] text-sm bg-[var(--av-surface)] text-[var(--av-text)]"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--av-text-muted)]">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !targetId}
            className="px-5 py-2 rounded-[var(--av-radius-sm)] bg-[var(--av-primary)] text-white text-sm font-medium disabled:opacity-50 hover:bg-[var(--av-primary-hover)]"
          >
            {saving ? 'Saving…' : 'Save observation'}
          </button>
        </div>
      </div>
    </div>
  )
}
