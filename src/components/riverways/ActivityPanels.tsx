import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  fetchActivityFeed, fetchUserActivity, fetchOrgActivity, fetchAiActivity,
  fetchBillingActivity, fetchSecurityCenter, fetchErrorCenter, fetchSelfHealing,
  fetchPlatformAnalytics, globalSearch,
  type PlatformActivityEvent, type GlobalSearchResult, type SecurityCenter,
  type SelfHealingSummary, type AiActivity, type BillingActivity, type PlatformAnalytics,
} from '../../lib/riverwaysActivity'

const sevTone: Record<string, string> = {
  info: 'text-slate-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
  critical: 'text-red-400 font-semibold',
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">{text}</div>
}

function EventRow({ e }: { e: PlatformActivityEvent }) {
  return (
    <div className="flex items-start gap-3 border-b border-white/5 px-4 py-2.5 last:border-0">
      <span className="w-16 shrink-0 pt-0.5 text-xs text-slate-500">{timeAgo(e.created_at)}</span>
      <span className={`shrink-0 font-mono text-xs ${sevTone[e.severity] ?? sevTone.info}`}>{e.event_type}</span>
      <div className="min-w-0 flex-1 text-sm text-slate-300">
        <span className="text-slate-400">{e.actor_email ?? 'system'}</span>
        {e.business_name ? <span className="text-slate-500"> · {e.business_name}</span> : null}
        {e.feature ? <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-300">{e.feature}</span> : null}
        {e.result ? <span className="ml-2 text-[11px] text-slate-500">{e.result}</span> : null}
      </div>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? 'border-amber-400/30 bg-amber-400/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</div>
    </div>
  )
}

/** Area 1 — live system activity stream (realtime). */
export function ActivityPanel() {
  const [events, setEvents] = useState<PlatformActivityEvent[]>([])
  const [severity, setSeverity] = useState<string>('')
  const [live, setLive] = useState(false)

  useEffect(() => {
    let mounted = true
    fetchActivityFeed({ limit: 100, severity: severity || null }).then(r => {
      if (mounted) setEvents(r.events)
    })
    const ch = supabase
      .channel(`riverways-activity:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'platform_activity_events' },
        (payload) => {
          const row = payload.new as PlatformActivityEvent
          if (severity && row.severity !== severity) return
          setEvents(prev => [row, ...prev].slice(0, 150))
        })
      .subscribe((status) => { if (mounted) setLive(status === 'SUBSCRIBED') })
    return () => { mounted = false; supabase.removeChannel(ch) }
  }, [severity])

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          {live ? 'Live stream connected' : 'Showing latest recorded events'}
        </div>
        <select value={severity} onChange={e => setSeverity(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-slate-300">
          <option value="">All severities</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
          <option value="critical">critical</option>
        </select>
      </div>
      {events.length === 0
        ? <Empty text="No platform activity recorded yet. Events appear here as people use Avenize." />
        : <div className="rounded-2xl border border-white/10 bg-white/[0.03]">{events.map(e => <EventRow key={e.id} e={e} />)}</div>}
    </section>
  )
}

/** Area 2 — per-user activity. */
export function UsersPanel() {
  const [email, setEmail] = useState('')
  const [data, setData] = useState<{ counts: Record<string, number>; recent: PlatformActivityEvent[] } | null>(null)

  const run = async () => {
    if (!email.trim()) return
    const r = await fetchUserActivity(email.trim())
    setData({ counts: r.counts, recent: r.recent })
  }

  return (
    <section>
      <div className="mb-4 flex gap-2">
        <input value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void run()}
          placeholder="user@example.com"
          className="w-72 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600" />
        <button onClick={() => void run()} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-950">Inspect</button>
      </div>
      {data && (
        <div className="space-y-4">
          {Object.keys(data.counts).length === 0
            ? <Empty text="No recorded activity for this user yet." />
            : <>
                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries(data.counts).map(([k, n]) => (
                    <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="font-mono text-xs text-slate-400">{k}</div>
                      <div className="mt-1 text-xl font-semibold">{n}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03]">{data.recent.map(e => <EventRow key={e.id} e={e} />)}</div>
              </>}
        </div>
      )}
    </section>
  )
}

/** Area 3 — per-organization activity. */
export function OrgsPanel() {
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<GlobalSearchResult['organizations']>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [data, setData] = useState<{ business?: string; members?: number; feature_counts?: Record<string, number>; recent?: PlatformActivityEvent[] } | null>(null)

  const search = async () => {
    if (!q.trim()) return
    const r = await globalSearch(q.trim())
    setMatches(r.organizations)
  }
  const inspect = async (id: string) => {
    setSelected(id)
    setData(await fetchOrgActivity(id))
  }

  return (
    <section>
      <div className="mb-4 flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void search()}
          placeholder="Organization name"
          className="w-72 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600" />
        <button onClick={() => void search()} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-950">Find</button>
      </div>
      {matches.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {matches.map(o => (
            <button key={o.id} onClick={() => void inspect(o.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${selected === o.id ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'}`}>
              {o.name}
            </button>
          ))}
        </div>
      )}
      {data && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
            <span className="font-semibold text-white">{data.business}</span>
            <span className="ml-3 text-slate-400">{data.members ?? 0} members</span>
          </div>
          {data.feature_counts && Object.keys(data.feature_counts).length > 0 && (
            <div className="grid gap-2 sm:grid-cols-4">
              {Object.entries(data.feature_counts).map(([f, n]) => (
                <div key={f} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="text-xs text-slate-400">{f}</div>
                  <div className="mt-1 text-xl font-semibold">{n}</div>
                </div>
              ))}
            </div>
          )}
          {data.recent && data.recent.length > 0
            ? <div className="rounded-2xl border border-white/10 bg-white/[0.03]">{data.recent.map(e => <EventRow key={e.id} e={e} />)}</div>
            : <Empty text="No recorded activity for this organization yet." />}
        </div>
      )}
    </section>
  )
}

/** Area 4 — AI activity. Contents are never surfaced, only metadata. */
export function AiPanel() {
  const [d, setD] = useState<AiActivity | null>(null)
  useEffect(() => { fetchAiActivity().then(setD) }, [])
  if (!d) return <Empty text="Loading AI activity…" />
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="AI requests" value={d.requests ?? 0} />
        <Stat label="Success rate" value={d.success_rate == null ? '—' : `${d.success_rate}%`} />
        <Stat label="Failed" value={d.failed ?? 0} warn={(d.failed ?? 0) > 0} />
        <Stat label="Avg latency" value={d.avg_duration_ms == null ? '—' : `${Math.round(d.avg_duration_ms)}ms`} />
      </div>
      <p className="text-xs text-slate-500">Private AI conversation contents are not stored or displayed here — metadata only.</p>
      {d.by_feature && Object.keys(d.by_feature).length > 0 && (
        <div className="grid gap-2 sm:grid-cols-4">
          {Object.entries(d.by_feature).map(([f, n]) => (
            <div key={f} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-xs text-slate-400">{f}</div>
              <div className="mt-1 text-xl font-semibold">{n}</div>
            </div>
          ))}
        </div>
      )}
      {d.recent && d.recent.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03]">{d.recent.map((e, i) => <EventRow key={`${e.id}-${i}`} e={e} />)}</div>
      )}
    </section>
  )
}

/** Area 5 — subscription & billing activity. */
export function BillingPanel() {
  const [d, setD] = useState<BillingActivity | null>(null)
  useEffect(() => { fetchBillingActivity().then(setD) }, [])
  if (!d) return <Empty text="Loading billing activity…" />
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-300">By plan</h3>
          {d.by_plan && Object.keys(d.by_plan).length > 0
            ? Object.entries(d.by_plan).map(([p, n]) => <div key={p} className="flex justify-between py-1 text-sm"><span className="text-slate-400">{p}</span><span>{n}</span></div>)
            : <p className="text-sm text-slate-500">No subscription records.</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-300">By status</h3>
          {d.by_status && Object.keys(d.by_status).length > 0
            ? Object.entries(d.by_status).map(([s, n]) => <div key={s} className="flex justify-between py-1 text-sm"><span className={s.includes('fail') || s.includes('past_due') ? 'text-red-300' : 'text-slate-400'}>{s}</span><span>{n}</span></div>)
            : <p className="text-sm text-slate-500">No subscription records.</p>}
        </div>
      </div>
      {d.recent && d.recent.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="mb-2 text-sm font-medium text-slate-300">Recent subscription changes</h3>
          {d.recent.map((r, i) => (
            <div key={i} className="flex justify-between border-b border-white/5 py-1.5 text-sm last:border-0">
              <span className="text-slate-300">{r.business}</span>
              <span className="text-slate-500">{r.plan} · {r.status} · {timeAgo(r.updated_at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Area 6 — security center. */
export function SecurityPanel() {
  const [d, setD] = useState<SecurityCenter | null>(null)
  useEffect(() => { fetchSecurityCenter().then(setD) }, [])
  if (!d) return <Empty text="Loading security center…" />
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Failed logins" value={d.failed_logins ?? 0} warn={(d.failed_logins ?? 0) > 20} />
        <Stat label="MFA failures" value={d.mfa_failures ?? 0} warn={(d.mfa_failures ?? 0) > 5} />
        <Stat label="Permission changes" value={d.permission_changes ?? 0} />
        <Stat label="Suspicious events" value={d.suspicious ?? 0} warn={(d.suspicious ?? 0) > 10} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="RLS violations" value={d.rls_violations ?? 0} warn={(d.rls_violations ?? 0) > 0} />
        <Stat label="Tenant isolation violations" value={d.tenant_isolation_violations ?? 0} warn={(d.tenant_isolation_violations ?? 0) > 0} />
        <Stat label="Admin actions (30d)" value={d.admin_actions ?? 0} />
      </div>
      {d.critical_stream && d.critical_stream.length > 0 && (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.05] p-2">
          <h3 className="px-3 py-2 text-sm font-medium text-red-200">Warning / error / critical stream</h3>
          {d.critical_stream.map((e, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-white/5 px-3 py-2 text-sm last:border-0">
              <span className="w-16 text-xs text-slate-500">{timeAgo(e.created_at)}</span>
              <span className="font-mono text-xs text-red-300">{e.event_type}</span>
              <span className="truncate text-slate-300">{e.actor_email ?? 'system'}{e.feature ? ` · ${e.feature}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Area 8 — error center: incidents + error events as ops cards. */
export function ErrorsPanel() {
  const [d, setD] = useState<{ incidents: Array<Record<string, unknown>>; recent_errors: Array<Record<string, unknown>> } | null>(null)
  useEffect(() => { fetchErrorCenter().then(r => setD(r)) }, [])
  if (!d) return <Empty text="Loading error center…" />
  return (
    <section className="space-y-4">
      {d.incidents.length > 0 && (
        <div className="space-y-3">
          {d.incidents.map((inc, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{String(inc.title)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs ${inc.status === 'resolved' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>{String(inc.status)}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                severity {String(inc.severity ?? '—')} · detected {inc.created_at ? timeAgo(String(inc.created_at)) : '—'}
                {inc.resolved_at ? ` · resolved ${timeAgo(String(inc.resolved_at))}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {d.recent_errors.length > 0
        ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
            {d.recent_errors.map((e, i) => (
              <div key={i} className="border-b border-white/5 px-3 py-2.5 last:border-0">
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0 text-xs text-slate-500">{e.captured_at ? timeAgo(String(e.captured_at)) : '—'}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${e.severity === 'critical' ? 'bg-red-400/15 text-red-300' : 'bg-white/10 text-slate-300'}`}>{String(e.severity)}</span>
                  <span className="truncate text-slate-300">{String(e.message)}</span>
                  {e.resolved_at ? <span className="ml-auto shrink-0 text-[11px] text-emerald-300">resolved</span> : null}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">{String(e.source)}{e.source_detail ? ` · ${String(e.source_detail)}` : ''}</div>
              </div>
            ))}
          </div>
        : <Empty text="No recent errors. The platform is quiet." />}
    </section>
  )
}

/** Area 9 — self-healing engine. */
export function HealingPanel() {
  const [d, setD] = useState<SelfHealingSummary | null>(null)
  useEffect(() => { fetchSelfHealing().then(setD) }, [])
  if (!d) return <Empty text="Loading self-healing status…" />
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">
        <Stat label="Detected" value={d.detected ?? 0} />
        <Stat label="Auto-repaired" value={d.repaired ?? 0} />
        <Stat label="Failed repairs" value={d.failed ?? 0} warn={(d.failed ?? 0) > 0} />
        <Stat label="Awaiting approval" value={d.awaiting_approval ?? 0} warn={(d.awaiting_approval ?? 0) > 0} />
        <Stat label="Rolled back" value={d.rolled_back ?? 0} />
      </div>
      {d.recent_repairs && d.recent_repairs.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
          {d.recent_repairs.map((r, i) => (
            <div key={i} className="border-b border-white/5 px-3 py-2.5 last:border-0">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-mono text-xs text-slate-400">{r.rule_key}</span>
                <span className="truncate text-slate-300">{r.repair_action}</span>
                <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                  r.status === 'succeeded' ? 'bg-emerald-400/10 text-emerald-300'
                  : r.status === 'failed' ? 'bg-red-400/10 text-red-300'
                  : r.status === 'approval_required' ? 'bg-amber-400/10 text-amber-300'
                  : 'bg-white/10 text-slate-300'}`}>{r.status}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {r.started_at ? `started ${timeAgo(r.started_at)}` : 'not started'}
                {r.completed_at ? ` · verified ${timeAgo(r.completed_at)}` : ''}
                {r.error_message ? ` · ${r.error_message}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Area 10 — platform analytics. */
export function AnalyticsPanel() {
  const [d, setD] = useState<PlatformAnalytics | null>(null)
  useEffect(() => { fetchPlatformAnalytics().then(setD) }, [])
  if (!d) return <Empty text="Loading platform analytics…" />
  const maxTouches = Math.max(1, ...(d.module_adoption_30d ?? []).map(m => m.touches))
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">
        <Stat label="DAU" value={d.dau ?? 0} />
        <Stat label="WAU" value={d.wau ?? 0} />
        <Stat label="MAU" value={d.mau ?? 0} />
        <Stat label="Signups (30d)" value={d.signups_30d ?? 0} />
        <Stat label="Organizations" value={d.organizations ?? 0} />
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Module adoption (30d)</h3>
        {(d.module_adoption_30d ?? []).length === 0
          ? <p className="text-sm text-slate-500">No usage telemetry yet.</p>
          : (d.module_adoption_30d ?? []).map(m => (
              <div key={m.module} className="mb-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{m.module}</span><span>{m.touches} touches · {m.businesses} orgs</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/10">
                  <div className="h-1.5 rounded-full bg-emerald-400/70" style={{ width: `${Math.max(4, (m.touches / maxTouches) * 100)}%` }} />
                </div>
              </div>
            ))}
      </div>
      <Stat label="AI events (30d)" value={d.ai_events_30d ?? 0} />
    </section>
  )
}
