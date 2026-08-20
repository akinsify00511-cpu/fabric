// Observer Perspective — a single living view of the whole organization
// (Intelligence §3). Not a dashboard collection: one screen showing
// People, Money, Sales, Operations, Inventory, Risk, Attention and the
// explainable Intelligence Indexes — all with freshness.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { isSchemaAvailable, markSchemaUnavailable, isPermanentSchemaError } from '../lib/schemaAvailability'
import FreshnessBadge from '../components/FreshnessBadge'
import { useRecentEvents } from '../components/FreshnessBadge'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import {
  Users, Wallet, TrendingUp, Activity, Boxes, AlertTriangle,
  ShieldCheck, Sparkles, ArrowRight, Loader2, CheckCircle2
} from 'lucide-react'

interface Snapshot {
  people: any; money: any; operations: any; inventory: any; risk: any; generated_at: string
}
interface Exception {
  id: string; domain: string; severity: string; title: string; detail: string;
  entity_type: string; entity_id: string; suggested_action: string; detected_at: string; resolved: boolean
}
interface Index { signals: Record<string, number>; score: number; components: string[] }

export default function ObserverView() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [exc, setExc] = useState<Exception[]>([])
  const [indexes, setIndexes] = useState<Record<string, Index> | null>(null)
  const [loading, setLoading] = useState(true)
  const events = useRecentEvents(bid, 12)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      // Circuit breaker: a permanently-missing object (migration not yet
      // applied) is probed once per session, then skipped — the page keeps
      // rendering its empty state without a 404 wall in the console.
      const snapKey = 'rpc:observer_snapshot'
      const idxKey = 'rpc:intelligence_indexes'
      const excKey = 'table:attention_exceptions'
      try {
        const [s, ix, e] = await Promise.all([
          isSchemaAvailable(snapKey)
            ? supabase.rpc('observer_snapshot', { p_business_id: bid }).then((r) => {
                if (isPermanentSchemaError(r.error)) markSchemaUnavailable(snapKey)
                return r
              })
            : Promise.resolve({ data: null, error: null }),
          isSchemaAvailable(idxKey)
            ? supabase.rpc('intelligence_indexes', { p_business_id: bid }).then((r) => {
                if (isPermanentSchemaError(r.error)) markSchemaUnavailable(idxKey)
                return r
              })
            : Promise.resolve({ data: null, error: null }),
          isSchemaAvailable(excKey)
            ? supabase.from('attention_exceptions').select('*')
                .eq('business_id', bid).eq('resolved', false)
                .order('detected_at', { ascending: false }).limit(20).then((r) => {
                  if (isPermanentSchemaError(r.error)) markSchemaUnavailable(excKey)
                  return r
                })
            : Promise.resolve({ data: null, error: null }),
        ])
        if (active) {
          setSnap(s.data)
          setIndexes(ix.data)
          setExc(e.data || [])
        }
      } catch (e) { console.error(e) } finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
  if (!snap) return (
    <div className="p-6 max-w-7xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="p-10 text-[var(--av-text-secondary)] text-center">No snapshot data available yet.</div>
    </div>
  )

  const openExc = exc.filter(e => !e.resolved)
  const critical = openExc.filter(e => e.severity === 'critical').length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <Sparkles size={24} className="text-[var(--av-primary)]" />
            Organization Snapshot
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            The whole business at a glance — what's happening and what needs attention.
          </p>
        </div>
        <FreshnessBadge businessId={bid!} entityType="organization" />
      </div>

      {/* Attention first — exception-first (§29) */}
      <section className="mb-6">
        <SectionHead icon={<AlertTriangle size={18} className="text-[var(--av-error)]" />} title="Needs Attention"
          right={<span className="text-xs text-[var(--av-text-tertiary)]">{openExc.length} open{critical > 0 && ` · ${critical} critical`}</span>} />
        {openExc.length === 0 ? (
          <EmptyCard text="Nothing requires attention right now." icon={<CheckCircle2 className="text-[var(--av-success)]" />} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {openExc.map(e => (
              <div key={e.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <SevDot sev={e.severity} />
                    <span className="text-xs font-medium uppercase text-[var(--av-text-tertiary)]">{e.domain}</span>
                  </div>
                  <span className="text-[11px] text-[var(--av-text-tertiary)]">{timeAgo(e.detected_at)}</span>
                </div>
                <h3 className="font-medium text-[var(--av-text)] mt-1">{e.title}</h3>
                {e.detail && <p className="text-sm text-[var(--av-text-secondary)] mt-0.5">{e.detail}</p>}
                {e.suggested_action && (
                  <p className="text-xs text-[var(--av-primary)] mt-2 flex items-center gap-1">
                    <ArrowRight size={12} /> {e.suggested_action}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Domain tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Tile icon={<Users size={20} />} color="var(--av-accent-hr)" title="People"
          rows={[['Headcount', snap.people?.headcount ?? 0]]} />
        <Tile icon={<Wallet size={20} />} color="var(--av-accent-finance)" title="Money"
          rows={[
            ['Receivables', money(snap.money?.receivables)],
            ['Overdue', money(snap.money?.overdue_receivables), true],
            ['Collected', money(snap.money?.invoices_paid)],
          ]} />
        <Tile icon={<Activity size={20} />} color="var(--av-accent-projects)" title="Operations"
          rows={[
            ['Open tasks', snap.operations?.open_tasks ?? 0],
            ['Overdue', snap.operations?.overdue_tasks ?? 0, (snap.operations?.overdue_tasks ?? 0) > 0],
          ]} />
        <Tile icon={<Boxes size={20} />} color="var(--av-accent-sales)" title="Inventory"
          rows={[['Low stock items', snap.inventory?.low_stock_count ?? 0, (snap.inventory?.low_stock_count ?? 0) > 0]]} />
      </div>

      {/* Risk strip */}
      {snap.risk && (
        <section className="mb-6 rounded-2xl bg-[var(--av-surface)] p-5">
          <SectionHead icon={<ShieldCheck size={18} className="text-[var(--av-warning)]" />} title="Risk Watch" />
          <div className="flex flex-wrap gap-3 mt-2">
            <RiskChip label="Overdue receivables" value={money(snap.risk.overdue_receivables)} warn={snap.risk.overdue_receivables > 0} />
            <RiskChip label="Low stock items" value={String(snap.risk.low_stock_items ?? 0)} warn={(snap.risk.low_stock_items ?? 0) > 0} />
            <RiskChip label="Unpaid payroll" value={snap.risk.payroll_unpaid ? 'Yes' : 'No'} warn={snap.risk.payroll_unpaid} />
          </div>
        </section>
      )}

      {/* Intelligence Indexes */}
      {indexes && (
        <section className="mb-6">
          <SectionHead icon={<TrendingUp size={18} className="text-[var(--av-primary)]" />} title="Intelligence Indexes"
            right={<span className="text-xs text-[var(--av-text-tertiary)]">explainable · click signals to drill in</span>} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mt-2">
            {Object.entries(indexes).map(([k, ix]) => (
              <div key={k} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize text-[var(--av-text)]">{k.replace('_', ' ')}</span>
                  <ScoreRing score={ix.score} />
                </div>
                <div className="mt-3 space-y-1">
                  {Object.entries(ix.signals).map(([s, v]) => (
                    <div key={s} className="flex justify-between text-xs">
                      <span className="text-[var(--av-text-secondary)]">{s.replace(/_/g, ' ')}</span>
                      <span className="font-medium text-[var(--av-text)]">{formatSig(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Live event stream — the business mirror updating */}
      <section>
        <SectionHead icon={<Activity size={18} className="text-[var(--av-accent-comms)]" />} title="Live Activity"
          right={<span className="text-xs text-[var(--av-success)]">● realtime</span>} />
        {events.length === 0 ? (
          <EmptyCard text="Business events will appear here as they happen." />
        ) : (
          <div className="rounded-xl bg-white shadow-[var(--av-elevation-1)] divide-y divide-[var(--av-border)]">
            {events.map(e => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--av-primary)]" />
                  <span className="font-medium text-[var(--av-text)]">{e.event_type}</span>
                  <span className="text-[var(--av-text-tertiary)]">{e.entity_type}</span>
                </span>
                <span className="text-xs text-[var(--av-text-tertiary)]">{timeAgo(e.occurred_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SectionHead({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2">{icon}{title}</h2>
      {right}
    </div>
  )
}

function Tile({ icon, color, title, rows }: { icon: React.ReactNode; color: string; title: string; rows: [string, any, boolean?][] }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-[var(--av-elevation-1)]">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '18', color }}>{icon}</span>
        <span className="font-medium text-[var(--av-text)]">{title}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(([label, val, warn]) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-[var(--av-text-secondary)]">{label}</span>
            <span className="font-medium" style={{ color: warn ? 'var(--av-error)' : 'var(--av-text)' }}>{String(val)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RiskChip({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: warn ? 'rgba(234,67,53,0.08)' : 'var(--av-surface-2)' }}>
      <div className="text-xs text-[var(--av-text-tertiary)]">{label}</div>
      <div className="text-sm font-medium" style={{ color: warn ? 'var(--av-error)' : 'var(--av-text)' }}>{value}</div>
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? 'var(--av-success)' : score >= 50 ? 'var(--av-warning)' : 'var(--av-error)'
  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16" fill="none" stroke="var(--av-surface-2)" strokeWidth="4" />
        <circle cx="20" cy="20" r="16" fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${(score / 100) * 100.5} 100.5`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  )
}

function EmptyCard({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return <div className="rounded-xl bg-white p-6 text-center text-sm text-[var(--av-text-tertiary)] shadow-[var(--av-elevation-1)]">{icon && <div className="flex justify-center mb-2">{icon}</div>}{text}</div>
}

function SevDot({ sev }: { sev: string }) {
  const c = sev === 'critical' ? 'var(--av-error)' : sev === 'warning' ? 'var(--av-warning)' : 'var(--av-info)'
  return <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
}

function money(n: any): string {
  if (n == null) return '0'
  const v = Number(n)
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(0) + 'k'
  return String(v)
}
function formatSig(v: any): string {
  if (typeof v === 'number' && !Number.isInteger(v) && Math.abs(v) <= 1) return (v * 100).toFixed(0) + '%'
  return String(v)
}
function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
