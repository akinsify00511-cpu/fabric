// Avenize Governance Control Center — the human window into the autonomous
// governance system (NOT just another admin dashboard).
//
// Scope of responsibility (per the master directive):
//  * constitution monitor (rules + layers from the machine-readable registry)
//  * incidents (live error command center)
//  * autonomy center (bounded safe-repair queue with attempt limits)
//  * human decision center (Level-4 approvals/rejections)
//  * audit center (searchable actions with before/after + approval evidence)
//  * dependency map (UNKNOWN never rendered as healthy)
//  * customer journey health (honest blocked-by markers)
//  * release gate (latest compliance verdict)
//
// All reads/writes go through is_riverways_admin()-gated SECURITY DEFINER
// RPCs. Non-admins get a restricted screen — the RPC gate is the real
// boundary (the client check is UX-only).

import { useEffect, useState } from 'react'
import {
  ShieldCheck, Lock, AlertTriangle, Activity, Bot, KeyRound, Search,
  RefreshCw, CheckCircle2, FileText, Network, Route,
  Loader2, ChevronDown, ChevronRight,
} from 'lucide-react'
import { isRiverwaysAdmin } from '../lib/riverwaysAdmin'
import {
  getGovernanceOverview, getSelfHealth, getIncidents, getAutonomyFeed,
  searchAudit, transitionIncident, createIncident, decideHumanDecision,
  getDecisionsFeed, sortedIncidents,
  INCIDENT_LIFECYCLE, ACTORS, SEVERITY_ORDER,
  type GovernanceOverview, type SelfHealth, type GovernanceIncident,
  type AutonomyAction, type HumanDecision, type AuditEntry, type IncidentStatus,
} from '../lib/governanceControl'
import constitutionRegistry from '../../governance/constitution-registry.json'
import enforcementRegistry from '../../governance/enforcement-registry.json'
import autonomyRegistry from '../../governance/autonomy-policy-registry.json'
import featureRegistry from '../../governance/feature-registry.json'

type TabKey = 'home' | 'constitution' | 'incidents' | 'autonomy' | 'decisions' | 'audit' | 'dependencies' | 'journey' | 'release'
const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'home', label: 'Home', icon: Activity },
  { key: 'constitution', label: 'Constitution', icon: FileText },
  { key: 'incidents', label: 'Incidents', icon: AlertTriangle },
  { key: 'autonomy', label: 'Autonomy', icon: Bot },
  { key: 'decisions', label: 'Human Decisions', icon: KeyRound },
  { key: 'audit', label: 'Audit', icon: Search },
  { key: 'dependencies', label: 'Dependencies', icon: Network },
  { key: 'journey', label: 'Journey Health', icon: Route },
  { key: 'release', label: 'Release', icon: CheckCircle2 },
]

const SEV_STYLE: Record<string, string> = {
  P0: 'bg-[var(--av-danger)] text-[var(--av-surface)]',
  P1: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
  P2: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
  P3: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
  P4: 'bg-[var(--av-surface-2)] text-[var(--av-text-muted)]',
}

const STATUS_STYLE: Record<string, string> = {
  RESOLVED: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
  CLOSED: 'bg-[var(--av-surface-2)] text-[var(--av-text-muted)]',
  DETECTED: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
  ESCALATED: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
}

function Badge({ text, style }: { text: string; style: string }) {
  return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${style}`}>{text}</span>
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-[var(--av-text)] mb-3">{title}</h3>
      {children}
    </div>
  )
}

export default function GovernanceControlCenter() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [tab, setTab] = useState<TabKey>('home')
  const [overview, setOverview] = useState<GovernanceOverview | null>(null)
  const [selfHealth, setSelfHealth] = useState<SelfHealth | null>(null)
  const [incidents, setIncidents] = useState<GovernanceIncident[]>([])
  const [autonomy, setAutonomy] = useState<AutonomyAction[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [createForm, setCreateForm] = useState(false)
  const [newIncident, setNewIncident] = useState({ component: 'database', severity: 'P2', description: '' })

  const load = async (which?: 'view') => {
    setRefreshing(true)
    const g = await getGovernanceOverview()
    setOverview(g)
    const h = await getSelfHealth()
    setSelfHealth(h)
    if (!which || which === 'view') {
      setIncidents(await getIncidents())
      setAutonomy(await getAutonomyFeed())
      setAudit(await searchAudit(undefined, undefined, 50))
    }
    setRefreshing(false)
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const ok = await isRiverwaysAdmin()
      if (!active) return
      setAuthorized(ok)
      if (ok) await load()
    })()
    return () => { active = false }
  }, [])

  const verdict = overview?.latest_report?.payload?.verdict
  const complianceScore = verdict?.compliance_score

  if (authorized === null) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--av-text-muted)]" />
      </div>
    )
  }
  if (!authorized) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Lock className="w-8 h-8 text-[var(--av-warning)] mb-3" />
        <h1 className="text-xl font-semibold text-[var(--av-text)] mb-2">Governance Control Center</h1>
        <p className="text-sm text-[var(--av-text-muted)]">
          Restricted to Riverways operators (<code>is_riverways_admin()</code>). The page fails closed — no partial payload.
        </p>
      </div>
    )
  }

  const openIncidents = overview?.incidents
  const autonomyStats = overview?.autonomy
  const pendingDecisions = overview?.decisions?.pending ?? 0

  return (
    <div className="min-h-screen bg-[var(--av-surface-2)]">
      <header className="border-b border-[var(--av-border)] bg-[var(--av-surface)]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-6 h-6 text-[var(--av-primary)]" />
              <h1 className="text-xl font-semibold text-[var(--av-text)]">Governance Control Center</h1>
            </div>
            <p className="text-sm text-[var(--av-text-muted)]">
              Human window into the autonomous governance system — constitutions define what must be true; the enforcement engine makes it real.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selfHealth && (
              <Badge
                text={selfHealth.status}
                style={selfHealth.status === 'healthy'
                  ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]'
                  : 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]'}
              />
            )}
            {verdict && (
              <Badge
                text={verdict.result ?? 'UNKNOWN'}
                style={verdict.result === 'RELEASE APPROVED'
                  ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]'
                  : 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]'}
              />
            )}
            <button
              onClick={() => load('view')}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)] hover:opacity-80"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto pb-2">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md whitespace-nowrap ${
                  tab === key
                    ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)] font-medium'
                    : 'text-[var(--av-text-muted)] hover:bg-[var(--av-surface-2)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {key === 'decisions' && pendingDecisions > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--av-warning-soft)] text-[var(--av-warning)]">
                    {pendingDecisions}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'home' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Compliance" value={complianceScore != null ? `${complianceScore}%` : '—'}
              hint={complianceScore == null ? 'no report published yet' : 'from the latest CI report'} />
            <StatCard label="Open Incidents" value={String(openIncidents?.open ?? '—')}
              hint={openIncidents ? `${openIncidents.p0_open} P0 / ${openIncidents.p1_open} P1` : ''} danger={!!openIncidents && openIncidents.open > 0} />
            <StatCard label="Autonomy (today)" value={String(autonomyStats?.succeeded_today ?? '—')}
              hint={autonomyStats ? `${autonomyStats.queued} queued / ${autonomyStats.escalated} escalated` : ''} />
            <StatCard label="Pending Decisions" value={String(pendingDecisions)}
              hint="human authority queue" danger={pendingDecisions > 0} />
          </div>
        )}
        {tab === 'home' && (
          <div className="grid md:grid-cols-2 gap-4">
            <Section title="Latest incidents (P0–P2 first)">
              <IncidentRows
                rows={incidents.slice(0, 8)}
                onTransition={(id, to) => transitionIncident(id, to).then(() => load('view')) }
              />
            </Section>
            <Section title="Governance self-health">
              <SelfHealthPanel health={selfHealth} />
              <p className="mt-3 text-xs text-[var(--av-text-muted)]">
                If monitoring stops or audit ingestion fails, the engine reports DEGRADED — never healthy (NO FALSE GREEN).
              </p>
            </Section>
          </div>
        )}

        {tab === 'constitution' && (
          <div className="grid md:grid-cols-2 gap-4">
            <Section title="Layers (L0–L3)">
              <div className="space-y-2">
                {(constitutionRegistry.layers as { id: string; document: string; priority: number }[]).map(l => (
                  <div key={l.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--av-text)]">{l.id}</span>
                    <span className="text-[var(--av-text-muted)] text-xs font-mono">{l.document}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--av-text-muted)]">
                Priority establishes deterministic precedence; no lower layer may contradict a higher layer.
              </p>
            </Section>
            <Section title="Enforcement registry (executable rules)">
              <div className="max-h-80 overflow-y-auto space-y-1.5">
                {(enforcementRegistry.rules as { rule_id: string; layer: string; severity: string; requirement: string; blocking: boolean }[]).map(r => (
                  <div key={r.rule_id} className="flex items-start gap-2 text-sm">
                    <Badge text={r.severity} style={SEV_STYLE[r.severity] ?? ''} />
                    <div>
                      <span className="font-medium text-[var(--av-text)]">{r.rule_id}</span>
                      <span className="text-[var(--av-text-muted)]"> — {r.requirement}</span>
                      {r.blocking && <span className="ml-2 text-xs text-[var(--av-danger)]">blocking</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {tab === 'incidents' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold text-[var(--av-text)]">Live Error Command Center</h2>
              <button
                onClick={() => setCreateForm(v => !v)}
                className="px-3 py-1.5 text-sm rounded-lg bg-[var(--av-primary)] text-[var(--av-surface)] hover:opacity-90"
              >
                New incident
              </button>
            </div>
            {createForm && (
              <div className="mb-4 rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-4">
                <div className="grid md:grid-cols-3 gap-3">
                  <input
                    value={newIncident.component}
                    onChange={e => setNewIncident(v => ({ ...v, component: e.target.value }))}
                    placeholder="component"
                    className="rounded-lg border border-[var(--av-border)] bg-[var(--av-surface)] px-3 py-2 text-sm text-[var(--av-text)]"
                  />
                  <select
                    value={newIncident.severity}
                    onChange={e => setNewIncident(v => ({ ...v, severity: e.target.value as any }))}
                    className="rounded-lg border border-[var(--av-border)] bg-[var(--av-surface)] px-3 py-2 text-sm text-[var(--av-text)]"
                  >
                    {(['P0','P1','P2','P3','P4'] as const).map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button
                    onClick={async () => {
                      if (!newIncident.description.trim()) return
                      await createIncident(newIncident.component, newIncident.severity as any, newIncident.description)
                      setNewIncident({ component: 'database', severity: 'P2', description: '' })
                      setCreateForm(false)
                      await load('view')
                    }}
                    className="rounded-lg bg-[var(--av-primary)] text-[var(--av-surface)] px-3 py-2 text-sm hover:opacity-90"
                  >
                    Create
                  </button>
                </div>
                <div className="mt-2">
                  <input
                    value={newIncident.description}
                    onChange={e => setNewIncident(v => ({ ...v, description: e.target.value }))}
                    placeholder="description (what, not cause)"
                    className="w-full rounded-lg border border-[var(--av-border)] bg-[var(--av-surface)] px-3 py-2 text-sm text-[var(--av-text)]"
                  />
                </div>
              </div>
            )}
            <IncidentRows
              rows={incidents}
              onTransition={(id, to) => transitionIncident(id, to).then(() => load('view'))}
            />
          </div>
        )}

        {tab === 'autonomy' && (
          <div>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <Section title="Bounded autonomy (levels 2–3 only)">
                <div className="space-y-2">
                  {(autonomyRegistry.policies as { action: string; risk: string; max_attempts: number }[]).map(p => (
                    <div key={p.action} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-[var(--av-text)]">{p.action}</span>
                      <span className="text-[var(--av-text-muted)]">risk {p.risk} · max_attempts {p.max_attempts}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-[var(--av-text-muted)]">
                  Precondition → execution → postcondition → rollback → escalation are all enforced; attempts stop at max_attempts, never loops.
                </p>
              </Section>
              <Section title="Queue (newest first)">
                <AutonomyFeed rows={autonomy} />
              </Section>
            </div>
          </div>
        )}

        {tab === 'decisions' && (
          <Section title="Human Decision Center (Level 4 authority)">
            <DecisionsPanel onDecide={(id, d) => decideHumanDecision(id, d).then(() => load('view'))} />
          </Section>
        )}

        {tab === 'audit' && (
          <Section title="Audit Center (searchable)">
            <AuditPanel rows={audit} />
          </Section>
        )}

        {tab === 'dependencies' && <DependencyMap />}

        {tab === 'journey' && (
          <Section title="Customer Journey Health (from the feature registry)">
            <div className="space-y-1.5">
              {(featureRegistry.features as { feature: string; status: string; health: string }[]).map(f => (
                <div key={f.feature} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[var(--av-text)]">{f.feature}</span>
                  <Badge
                    text={f.health.replaceAll('-', ' ')}
                    style={f.health === 'operational'
                      ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]'
                      : 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]'}
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--av-text-muted)]">
              More valuable than infrastructure monitoring: this tracks the product workflows customers actually depend on.
            </p>
          </Section>
        )}

        {tab === 'release' && (
          <Section title="Release Gate (latest published report)">
            {verdict ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--av-text)]">Verdict:</span>
                  <Badge text={verdict.result ?? 'UNKNOWN'}
                    style={verdict.result === 'RELEASE APPROVED'
                      ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]'
                      : 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]'} />
                </div>
                <div className="text-[var(--av-text-muted)]">
                  Channel: {overview?.latest_report?.channel ?? '—'} · published {overview?.latest_report?.published_at ?? 'n/a'}
                </div>
                {(verdict as any)?.reasons?.length > 0 && (
                  <div>
                    <span className="font-medium text-[var(--av-text)]">Blocking:</span>
                    <ul className="list-disc ml-5 text-[var(--av-text-muted)]">
                      {(verdict as any).reasons.map((r: string) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--av-text-muted)]">
                No compliance report has been published yet — run <code>npm run avenize:governance:report</code> then publish it via <code>publish_compliance_report</code>. UNKNOWN never counts as healthy.
              </p>
            )}
          </Section>
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------- components

function StatCard({ label, value, hint, danger = false }: { label: string; value: string | number; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface)] p-4">
      <div className="text-xs text-[var(--av-text-muted)]">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${danger ? 'text-[var(--av-danger)]' : 'text-[var(--av-text)]'}`}>{value}</div>
      {hint && <div className="text-xs text-[var(--av-text-muted)] mt-1">{hint}</div>}
    </div>
  )
}

function IncidentRows({ rows, onTransition }: {
  rows: GovernanceIncident[]
  onTransition: (id: string, to: IncidentStatus) => void
}) {
  if (!rows.length) return <p className="text-sm text-[var(--av-text-muted)]">No incidents recorded yet.</p>
  const sorted = sortedIncidents(rows)
  return (
    <div className="space-y-2">
      {sorted.map(r => (
        <IncidentRow key={r.id} r={r} onTransition={onTransition} />
      ))}
    </div>
  )
}

function IncidentRow({ r, onTransition }: { r: GovernanceIncident; onTransition: (id: string, to: IncidentStatus) => void }) {
  const [open, setOpen] = useState(false)
  const isOpen = !['RESOLVED','CLOSED'].includes(r.status)
  return (
    <div className="rounded-xl border border-[var(--av-border)] bg-[var(--av-surface-2)] p-3">
      <div className="flex items-start gap-2">
        <button onClick={() => setOpen(v => !v)} className="mt-0.5 text-[var(--av-text-muted)]">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <Badge text={r.severity} style={SEV_STYLE[r.severity] ?? ''} />
        <Badge text={r.status} style={STATUS_STYLE[r.status] ?? 'bg-[var(--av-surface-2)]'} />
        <span className="font-mono text-xs text-[var(--av-text-muted)]">{r.incident_key}</span>
        <span className="text-sm text-[var(--av-text)] flex-1">{r.description}</span>
      </div>
      {open && (
        <div className="ml-8 mt-2 text-sm text-[var(--av-text-muted)] space-y-1">
          <div>component: <span className="font-mono">{r.component}</span></div>
          {r.impact && <div>impact: {r.impact}</div>}
          {r.root_cause && <div>root cause: {r.root_cause}</div>}
          <div>detected {r.detected_at}{r.resolved_at ? ` · resolved ${r.resolved_at}` : ''}</div>
          {isOpen && (
            <div className="pt-1 flex flex-wrap gap-1.5">
              {INCIDENT_LIFECYCLE.filter(s => s !== r.status).map(s => (
                <button
                  key={s}
                  onClick={() => onTransition(r.id, s)}
                  className="px-2 py-1 text-xs rounded-md bg-[var(--av-primary-soft)] text-[var(--av-primary)] hover:opacity-80"
                >
                  → {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AutonomyFeed({ rows }: { rows: AutonomyAction[] }) {
  if (!rows.length) return <p className="text-sm text-[var(--av-text-muted)]">No autonomous actions queued yet.</p>
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {rows.map(a => (
        <div key={a.id} className="rounded-lg border border-[var(--av-border)] bg-[var(--av-surface-2)] p-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[var(--av-text)]">{a.action}</span>
            <Badge text={`L${a.level}`} style="bg-[var(--av-primary-soft)] text-[var(--av-primary)]" />
            <Badge text={a.status}
              style={a.status === 'succeeded'
                ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]'
                : (a.status === 'escalated' || a.status === 'failed')
                  ? 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]'
                  : 'bg-[var(--av-surface-2)] text-[var(--av-text-muted)]'} />
            <span className="text-xs text-[var(--av-text-muted)]">attempt {a.attempts}/{a.max_attempts}</span>
            <span className="ml-auto text-xs text-[var(--av-text-muted)]">{a.queued_at}</span>
          </div>
          {a.last_error && <div className="mt-1 text-xs text-[var(--av-danger)]">{a.last_error}</div>}
        </div>
      ))}
    </div>
  )
}

function DecisionsPanel({ onDecide }: { onDecide: (id: string, d: 'approved' | 'rejected') => void }) {
  const [rows, setRows] = useState<HumanDecision[]>([])
  useEffect(() => {
    ;(async () => {
      const feed = await getDecisionsFeed()
      setRows(feed)
    })()
  }, [onDecide])

  if (!rows.length) {
    return <p className="text-sm text-[var(--av-text-muted)]">No human decisions pending.</p>
  }
  return (
    <div className="space-y-2">
      {rows.map(d => (
        <div key={d.id} className="rounded-lg border border-[var(--av-border)] bg-[var(--av-surface-2)] p-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge text={d.risk} style="bg-[var(--av-warning-soft)] text-[var(--av-warning)]" />
            <span className="font-medium text-[var(--av-text)]">{d.title}</span>
          </div>
          <div className="text-xs text-[var(--av-text-muted)] mt-1">{d.reason}</div>
          {d.status === 'pending' && (
            <div className="mt-2 flex gap-2">
              <button onClick={() => onDecide(d.id, 'approved')}
                className="px-2 py-1 text-xs rounded-md bg-[var(--av-success-soft)] text-[var(--av-success)]">APPROVE</button>
              <button onClick={() => onDecide(d.id, 'rejected')}
                className="px-2 py-1 text-xs rounded-md bg-[var(--av-danger-soft)] text-[var(--av-danger)]">REJECT</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AuditPanel({ rows }: { rows: AuditEntry[] }) {
  const [actionFilter, setActionFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [filtered, setFiltered] = useState<AuditEntry[]>(rows)
  useEffect(() => setFiltered(rows), [rows])
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder="action contains…"
          className="rounded-lg border border-[var(--av-border)] bg-[var(--av-surface)] px-3 py-1.5 text-sm text-[var(--av-text)]" />
        <select value={actorFilter} onChange={e => setActorFilter(e.target.value)}
          className="rounded-lg border border-[var(--av-border)] bg-[var(--av-surface)] px-3 py-1.5 text-sm text-[var(--av-text)]">
          <option value="">All actors</option>
          {ACTORS.map(a => <option key={a}>{a}</option>)}
        </select>
        <button className="px-3 py-1.5 text-sm rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)]"
          onClick={async () => setFiltered(await searchAudit(actionFilter || undefined, actorFilter || undefined, 100))}>
          Search
        </button>
      </div>
      <div className="space-y-1.5">
        {filtered.length === 0 && <p className="text-sm text-[var(--av-text-muted)]">No audit entries.</p>}
        {filtered.map(a => (
          <div key={a.id} className="flex items-start gap-3 text-xs border-b border-[var(--av-border)] pb-1.5">
            <span className="text-[var(--av-text-muted)] whitespace-nowrap">{a.created_at}</span>
            <Badge text={a.actor} style="bg-[var(--av-surface-2)] text-[var(--av-text-muted)]" />
            <span className="font-medium text-[var(--av-text)]">{a.action}</span>
            {a.target && <span className="font-mono text-[var(--av-text-muted)]">{a.target}</span>}
            <span className={a.result === 'success'
              ? 'text-[var(--av-success)]'
              : 'text-[var(--av-danger)]'}>{a.result}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DependencyMap() {
  const tree = [
    { name: 'AUTH', children: [
      { name: 'BUSINESS', children: [
        { name: 'PEOPLE' }, { name: 'CRM', children: [{ name: 'LEADS' }, { name: 'REQUESTS' }, { name: 'QUOTES' }, { name: 'ORDERS' }] },
        { name: 'MEETINGS' }, { name: 'PAYMENTS' }, { name: 'INTELLIGENCE' },
      ] },
    ] },
  ]
  return (
    <Section title="System Dependency Map (unverifiable never renders as healthy)">
      <div className="text-sm space-y-1">
        {renderTree(tree, 0)}
      </div>
      <p className="mt-3 text-xs text-[var(--av-text-muted)]">
        UNKNOWN state but never green. The map colours only what a live validator can prove.
      </p>
    </Section>
  )

  function renderTree(nodes: any[], depth: number): React.ReactNode {
    return nodes.map((n: any) => (
      <div key={n.name}>
        <div className="flex items-center gap-2" style={{ paddingLeft: depth * 16 }}>
          <span className="font-mono text-[var(--av-text)]">{n.name}</span>
          <span className="w-2 h-2 rounded-full bg-[var(--av-warning)]" title="UNKNOWN until verified" />
        </div>
        {n.children && renderTree(n.children, depth + 1)}
      </div>
    ))
  }
}

function SelfHealthPanel({ health }: { health: SelfHealth | null }) {
  if (!health) return <p className="text-sm text-[var(--av-text-muted)]">self-health probe unavailable.</p>
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center gap-2">
        <Badge text={health.status}
          style={health.status === 'healthy'
            ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]'
            : 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]'} />
        {!health.checks?.event_ingest && (
          <Badge text="event ingest failing" style="bg-[var(--av-danger-soft)] text-[var(--av-danger)]" />
        )}
        {!health.checks?.audit_ingest && (
          <Badge text="audit ingest failing" style="bg-[var(--av-danger-soft)] text-[var(--av-danger)]" />
        )}
      </div>
      <div className="text-xs text-[var(--av-text-muted)]">
        latest event: {health.checks?.latest_event_at ?? 'none yet'}
      </div>
    </div>
  )
}
