import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useExperienceContext } from '../lib/useExperienceContext'
import { composeBusinessDigest, fetchFeatureDiscovery, formatNaira, type BusinessDigest, type FeatureDiscoveryResult } from '../lib/businessOS'
import {
  ArrowRight, Bell, BriefcaseBusiness, CheckCircle2, ChevronDown, CircleAlert,
  Clock3, LayoutGrid, PieChart, Search, Settings2, Table2, TrendingUp,
  Package, FolderKanban, Users2, Wallet, AlertTriangle, Plus, Mail, Sparkles,
} from 'lucide-react'

type View = 'recommended' | 'number' | 'trend' | 'progress' | 'breakdown' | 'table'
type Mode = 'overview' | 'operations' | 'focus'

const VIEW_LABELS: Record<View, string> = {
  recommended: 'Recommended', number: 'Number', trend: 'Trend',
  progress: 'Progress', breakdown: 'Breakdown', table: 'Table',
}
const VIEW_ICONS = {
  recommended: LayoutGrid, number: BriefcaseBusiness, trend: TrendingUp,
  progress: CircleAlert, breakdown: PieChart, table: Table2,
}

const money = (v: number) =>
  v >= 1e9 ? `₦${(v / 1e9).toFixed(1)}B` :
  v >= 1e6 ? `₦${(v / 1e6).toFixed(1)}M` :
  v >= 1e3 ? `₦${(v / 1e3).toFixed(0)}k` :
  `₦${v.toLocaleString()}`

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`av-card p-5 ${className}`}>
      {children}
    </section>
  )
}

function ViewPicker({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const [open, setOpen] = useState(false)
  const Icon = VIEW_ICONS[value]
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-2 rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm text-[var(--av-text)] hover:bg-[var(--av-surface-2)]">
        <Icon size={15} />{VIEW_LABELS[value]}<ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface)] p-2 shadow-xl">
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-[var(--av-text-muted)]">How do you want to understand this?</p>
          {(Object.keys(VIEW_LABELS) as View[]).map(v => {
            const I = VIEW_ICONS[v]
            return (
              <button key={v} onClick={() => { onChange(v); setOpen(false) }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${value === v ? 'bg-[var(--av-surface-2)] font-medium' : 'hover:bg-[var(--av-surface-2)]'}`}>
                <I size={16} /><span>{VIEW_LABELS[v]}</span>
                {v === 'recommended' && <span className="ml-auto text-[10px] text-[var(--av-primary)]">BEST</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Adaptive context ──────────────────────────────────────────────────
// The dashboard adapts to three signals: what the user is authorized to see
// (entitled+role), what they chose to surface (selected), and company size.
// A tool is "active" for the dashboard when authorized AND selected.
interface DashboardStats {
  revenue: number
  revenueChange: number
  pipeline: number
  dealCount: number
  people: number
  overdue: number
  pendingTasks: number
  lowStock: number
  activeProjects: number
  overdueInvoices: number
  staleDeals: number
}

const EMPTY_STATS: DashboardStats = {
  revenue: 0, revenueChange: 0, pipeline: 0, dealCount: 0,
  people: 0, overdue: 0, pendingTasks: 0, lowStock: 0, activeProjects: 0,
  overdueInvoices: 0, staleDeals: 0,
}

export default function Dashboard() {
  const { staff } = useAuth()
  // Single authoritative context — drives which KPIs/data/actions the dashboard
  // shows. Replaces the per-screen re-derivation of accessibleTools + selection.
  const { isToolActive, complexity, isPrivileged } = useExperienceContext()
  // §K: the active persona (if the user switched roles) drives the context-aware
  // dashboard; falls back to the primary role. Security stays staff.role + RLS.
  const role = (staff?.active_role ?? staff?.role) || 'staff'
  const [mode, setMode] = useState<Mode>('overview')
  const [view, setView] = useState<View>('recommended')
  const [query, setQuery] = useState('')
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS)
  const [tasks, setTasks] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [digest, setDigest] = useState<BusinessDigest | null>(null)
  const [discovery, setDiscovery] = useState<FeatureDiscoveryResult | null>(null)

  const hasFinance = isToolActive('finance')
  const hasCRM = isToolActive('crm')
  const hasInventory = isToolActive('inventory')
  const hasProjects = isToolActive('projects')
  const hasPeople = isToolActive('people')
  // Company-size tiers drive complexity (solo → minimal, team → full).
  // `complexity` is the authoritative progressive-complexity signal from the
  // Experience Context (derived from headcount + active-module breadth),
  // not the stats.staff count the dashboard happens to fetch.
  const isSolo = complexity === 'solo'

  useEffect(() => {
    if (!staff?.business_id) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const bid = staff.business_id
      // Fetch only what the user's active tools need — a solo consultant with
      // no inventory doesn't pay the query cost for products. Tasks + staff
      // are always fetched (core attention + company-size signal).
      // Supabase query builders are thenables, not Promise instances; cast
      // through unknown so Promise.all accepts the mixed conditional array.
      const fetches: Promise<any>[] = [
        supabase.from('tasks').select('id,title,due_date,priority,status,created_at')
          .eq('business_id', bid).eq('status', 'pending')
          .order('due_date', { ascending: true }).limit(8) as unknown as Promise<any>,
        supabase.from('staff').select('id').eq('business_id', bid) as unknown as Promise<any>,
      ]
      if (hasFinance) {
        fetches.push(supabase.from('invoices').select('total,status,created_at').eq('business_id', bid) as unknown as Promise<any>)
      }
      if (hasCRM) {
        fetches.push(supabase.from('deals').select('value,stage,created_at').eq('business_id', bid) as unknown as Promise<any>)
      }
      if (hasInventory) {
        fetches.push(supabase.from('products').select('stock,low_stock_threshold').eq('business_id', bid) as unknown as Promise<any>)
      }
      if (hasProjects) {
        fetches.push(supabase.from('projects').select('id,status').eq('business_id', bid) as unknown as Promise<any>)
      }
      const results = await Promise.all(fetches)
      if (cancelled) return
      const [pending, people, invoices, deals, products, projects] = results

      const now = new Date()
      const month = now.getMonth(), year = now.getFullYear()
      const overdue = (pending.data || []).filter((x: any) => x.due_date && new Date(x.due_date) < now).length

      let revenue = 0, revenueChange = 0, pipeline = 0, dealCount = 0, lowStock = 0, activeProjects = 0
      let overdueInvoices = 0, staleDeals = 0
      if (invoices?.data) {
        const paid = invoices.data.filter((x: any) => x.status === 'paid')
        revenue = paid.filter((x: any) => {
          const d = new Date(x.created_at); return d.getMonth() === month && d.getFullYear() === year
        }).reduce((s: number, x: any) => s + (x.total || 0), 0)
        const prev = paid.filter((x: any) => {
          const d = new Date(x.created_at), pm = month === 0 ? 11 : month - 1, py = month === 0 ? year - 1 : year
          return d.getMonth() === pm && d.getFullYear() === py
        }).reduce((s: number, x: any) => s + (x.total || 0), 0)
        revenueChange = prev ? Math.round(((revenue - prev) / prev) * 100) : 0
        // Overdue invoices: sent/issued but past some implied due window and unpaid.
        overdueInvoices = invoices.data.filter((x: any) =>
          x.status && x.status !== 'paid' && x.status !== 'draft' && x.status !== 'cancelled' &&
          x.created_at && new Date(x.created_at) < new Date(now.getTime() - 30 * 86400000)
        ).length
      }
      if (deals?.data) {
        pipeline = deals.data.filter((x: any) => x.stage !== 'lost' && x.stage !== 'won').reduce((s: number, x: any) => s + (x.value || 0), 0)
        dealCount = deals.data.length
        // Stale deals: open and untouched for >14 days (the intelligence threshold).
        staleDeals = deals.data.filter((x: any) =>
          x.stage !== 'won' && x.stage !== 'lost' &&
          x.created_at && new Date(x.created_at) < new Date(now.getTime() - 14 * 86400000)
        ).length
      }
      if (products?.data) {
        lowStock = products.data.filter((x: any) =>
          typeof x.stock === 'number' && typeof x.low_stock_threshold === 'number' && x.stock <= x.low_stock_threshold
        ).length
      }
      if (projects?.data) {
        activeProjects = projects.data.filter((x: any) => x.status !== 'completed' && x.status !== 'cancelled').length
      }

      setStats({
        revenue, revenueChange, pipeline, dealCount,
        people: people.data?.length || 0, overdue,
        pendingTasks: pending.data?.length || 0, lowStock, activeProjects,
        overdueInvoices, staleDeals,
      })
      setTasks(pending.data || [])
      // Activities: prefer deals (CRM), fall back to invoices (finance), then tasks.
      const dealActs = (deals?.data || []).slice(0, 5).map((x: any, i: number) => ({
        id: `d${i}`, text: `${x.stage || 'New'} deal`, value: money(x.value || 0),
        date: new Date(x.created_at).toLocaleDateString(),
      }))
      const invActs = (invoices?.data || []).slice(0, 5).map((x: any, i: number) => ({
        id: `i${i}`, text: `${x.status || 'New'} invoice`, value: money(x.total || 0),
        date: new Date(x.created_at).toLocaleDateString(),
      }))
      setActivities(dealActs.length > 0 ? dealActs : invActs)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [staff?.business_id, hasFinance, hasCRM, hasInventory, hasProjects])

  // §7.4: load the composed business digest preview (owner/admin only, best-effort).
  // Surfaces the plain-language summary the owner would receive via email, so
  // the Dashboard IS the digest. Non-blocking — stays null if the RPC isn't deployed.
  useEffect(() => {
    if (!staff?.business_id || !isPrivileged) return
    let active = true
    composeBusinessDigest(staff.business_id, 'daily').then(d => { if (active) setDigest(d) })
    return () => { active = false }
  }, [staff?.business_id, isPrivileged])

  // P0 #13: the autonomous feature-discovery engine. Suggests unexplored tools
  // with a REAL value estimate computed from the business's own data ("Inventory
  // could help you identify ₦X in trapped capital"). Best-effort, non-blocking.
  // Only for privileged users (discovery is a decision-owner surface) and only
  // when there's something to suggest.
  useEffect(() => {
    if (!staff?.business_id || !isPrivileged) return
    let active = true
    fetchFeatureDiscovery(staff.business_id).then(d => { if (active) setDiscovery(d) })
    return () => { active = false }
  }, [staff?.business_id, isPrivileged])

  const firstName = staff?.full_name?.split(' ')[0] || staff?.name?.split(' ')[0] || 'there'
  const filteredTasks = useMemo(() =>
    tasks.filter(t => !query || String(t.title).toLowerCase().includes(query.toLowerCase())),
  [tasks, query])

  // ── Contextual "Attention" items (#4) ───────────────────────────────
  // The "What needs you" card used to show overdue TASKS only. A finance user
  // cares about overdue invoices; an inventory user about low stock; a CRM
  // user about stale deals. Aggregate every signal the user's active tools
  // surface, ordered by urgency, each linking to the right page.
  type AttentionItem = { id: string; label: string; to: string; tone: 'amber' | 'red' }
  const attentionItems: AttentionItem[] = []
  if (stats.overdue > 0) attentionItems.push({ id: 'tasks', label: `${stats.overdue} overdue task${stats.overdue > 1 ? 's' : ''}`, to: '/app/tasks', tone: 'red' })
  if (hasFinance && stats.overdueInvoices > 0) attentionItems.push({ id: 'inv', label: `${stats.overdueInvoices} overdue invoice${stats.overdueInvoices > 1 ? 's' : ''}`, to: '/app/payments', tone: 'red' })
  if (hasInventory && stats.lowStock > 0) attentionItems.push({ id: 'stock', label: `${stats.lowStock} low-stock product${stats.lowStock > 1 ? 's' : ''}`, to: '/app/inventory', tone: 'amber' })
  if (hasCRM && stats.staleDeals > 0) attentionItems.push({ id: 'deals', label: `${stats.staleDeals} stale deal${stats.staleDeals > 1 ? 's' : ''} (>14d)`, to: '/app/crm', tone: 'amber' })
  if (attentionItems.length === 0 && stats.pendingTasks > 0) attentionItems.push({ id: 'pending', label: `${stats.pendingTasks} pending task${stats.pendingTasks > 1 ? 's' : ''}`, to: '/app/tasks', tone: 'amber' })

  // ── Role-aware focus (#6) ───────────────────────────────────────────
  // "My Focus" mode adapts to the user's role rather than showing the same
  // generic task list. Owners/managers see the cross-cutting attention items
  // (approvals + overdue everywhere); a finance-focused role sees invoices;
  // a sales role sees pipeline/stale deals.
  const roleFocus: { label: string; metric: { label: string; value: number; change: number }; hint: string } = useMemo(() => {
    if (isPrivileged) {
      return {
        label: "Owner's view",
        metric: hasFinance && stats.revenue > 0 ? { label: 'Revenue', value: stats.revenue, change: stats.revenueChange } : { label: 'Pending tasks', value: stats.pendingTasks, change: 0 },
        hint: 'You oversee the whole business — approvals and overdue items across every team surface here.',
      }
    }
    if (role === 'manager' || role === 'team_lead') {
      return {
        label: "Manager's view",
        metric: hasProjects && stats.activeProjects > 0 ? { label: 'Active projects', value: stats.activeProjects, change: 0 } : { label: 'Pending tasks', value: stats.pendingTasks, change: 0 },
        hint: 'Your team\'s deliverables and blockers surface first.',
      }
    }
    // staff / default — focus on their own work.
    return {
      label: 'My work',
      metric: { label: 'Tasks due', value: stats.pendingTasks, change: 0 },
      hint: 'Your assigned tasks and deadlines.',
    }
  }, [isPrivileged, role, hasFinance, hasProjects, stats])

  // ── Adaptive KPI cards ──────────────────────────────────────────────
  // Build the card set from the user's active tools. Always includes
  // "Needs attention" (overdue tasks) — that's universal.
  type KpiCard = { label: string; value: string; sub: string; subColor: string; icon: typeof Wallet }
  const kpiCards: KpiCard[] = []
  if (hasFinance) {
    kpiCards.push({
      label: 'Revenue', value: money(stats.revenue), icon: Wallet,
      sub: `${stats.revenueChange >= 0 ? '+' : ''}${stats.revenueChange}% vs last month`,
      subColor: 'text-emerald-600',
    })
  }
  if (hasCRM) {
    kpiCards.push({
      label: 'Pipeline', value: money(stats.pipeline), icon: TrendingUp,
      sub: `${stats.dealCount} open opportunities`, subColor: 'text-[var(--av-text-muted)]',
    })
  }
  if (hasProjects) {
    kpiCards.push({
      label: 'Active Projects', value: String(stats.activeProjects), icon: FolderKanban,
      sub: 'In progress', subColor: 'text-[var(--av-text-muted)]',
    })
  }
  if (hasInventory) {
    kpiCards.push({
      label: 'Low Stock', value: String(stats.lowStock), icon: Package,
      sub: stats.lowStock > 0 ? 'Needs reorder' : 'All healthy',
      subColor: stats.lowStock > 0 ? 'text-[var(--av-warning)]' : 'text-emerald-600',
    })
  }
  if (hasPeople && !isSolo) {
    kpiCards.push({
      label: 'People', value: String(stats.people), icon: Users2,
      sub: 'In your company', subColor: 'text-[var(--av-text-muted)]',
    })
  }
  // Always show attention (universal) — counts every contextual attention
  // signal, not just overdue tasks, so a finance-only user sees their overdue
  // invoices reflected here too.
  const totalAttention = stats.overdue + (hasFinance ? stats.overdueInvoices : 0) + (hasInventory ? stats.lowStock : 0) + (hasCRM ? stats.staleDeals : 0)
  kpiCards.push({
    label: 'Needs attention', value: String(totalAttention), icon: AlertTriangle,
    sub: totalAttention > 0 ? 'Across your tools' : 'All caught up',
    subColor: totalAttention > 0 ? 'text-[var(--av-warning)]' : 'text-emerald-600',
  })

  // ── Adaptive primary metric (the pulse card) ────────────────────────
  // Pick the most relevant primary metric based on active tools + data. In
  // focus mode the role-aware metric (roleFocus) wins so the pulse reflects
  // what THIS role should be watching.
  const primaryMetric: { label: string; value: number; change: number } =
    mode === 'focus' ? roleFocus.metric :
    hasFinance && stats.revenue > 0 ? { label: 'Revenue', value: stats.revenue, change: stats.revenueChange } :
    hasCRM && stats.pipeline > 0 ? { label: 'Pipeline', value: stats.pipeline, change: 0 } :
    hasProjects && stats.activeProjects > 0 ? { label: 'Active Projects', value: stats.activeProjects, change: 0 } :
    { label: 'Tasks', value: stats.pendingTasks, change: 0 }

  const recommended: View = view === 'recommended'
    ? (primaryMetric.value > 0 ? 'trend' : 'number') as View
    : view

  // ── Adaptive quick actions ──────────────────────────────────────────
  type QuickAction = { label: string; to: string; icon: typeof Plus }
  const quickActions: QuickAction[] = []
  if (hasCRM) quickActions.push({ label: 'New deal', to: '/app/crm', icon: Plus })
  if (hasFinance) quickActions.push({ label: 'New invoice', to: '/app/payments', icon: Plus })
  if (hasProjects) quickActions.push({ label: 'New project', to: '/app/projects', icon: Plus })
  if (hasInventory) quickActions.push({ label: 'Add product', to: '/app/inventory', icon: Plus })
  quickActions.push({ label: 'New task', to: '/app/tasks', icon: Plus }) // always

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-72 rounded bg-[var(--av-surface-2)]" />
        <div className="h-40 rounded-2xl bg-[var(--av-surface-2)]" />
        <div className="h-64 rounded-2xl bg-[var(--av-surface-2)]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-20">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-[var(--av-text-secondary)]">Your workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--av-text)]">Good morning, {firstName}</h1>
          <p className="mt-1 text-sm text-[var(--av-text-secondary)]">Here's what matters right now.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-[var(--av-text-muted)]" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search anything…" className="w-48 rounded-lg border border-[var(--av-border)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--av-border-strong)]" />
          </div>
          <Link to="/app/notifications" className="rounded-lg border border-[var(--av-border)] p-2 hover:bg-[var(--av-surface-2)]" aria-label="Notifications">
            <Bell size={17} />
          </Link>
        </div>
      </header>

      {/* §7.4: Today's digest — the plain-language summary the owner would
          receive via email, surfaced on the Dashboard itself. Owner/admin
          only. Each line is one fact with a one-tap action (§5.5). */}
      {digest?.authorized && digest.lines.length > 0 && (
        <div className="rounded-2xl bg-[var(--av-surface)] p-4 shadow-sm ring-1 ring-[var(--av-border)]">
          <div className="mb-2 flex items-center gap-2">
            <Mail size={15} className="text-[#155BB4]" />
            <h2 className="text-sm font-semibold text-[var(--av-text)]">Today's digest</h2>
            <span className="text-xs text-[var(--av-text-muted)]">· arrives by email too</span>
          </div>
          <ul className="space-y-1.5">
            {digest.lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm text-[var(--av-text)]">
                <span>{l.text}</span>
                {l.action && l.route && (
                  <Link to={l.route} className="shrink-0 text-xs font-medium text-[#155BB4] hover:underline">
                    {l.action} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* P0 #13: feature discovery — suggests unexplored tools with a REAL value
          estimate from the business's own data. The autonomous trial experience:
          Avenize notices "you haven't explored Inventory" and shows why it
          matters (₦X in trapped capital), with an Explore action. */}
      {discovery?.authorized && discovery.suggestions.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-[#155BB4]/5 to-[#34A853]/5 p-4 ring-1 ring-[var(--av-border)]">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={15} className="text-[#155BB4]" />
            <h2 className="text-sm font-semibold text-[var(--av-text)]">Worth exploring</h2>
            <span className="text-xs text-[var(--av-text-muted)]">· based on your business</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {discovery.suggestions.slice(0, 4).map((s) => {
              const estimate = formatNaira(s.value_estimate)
              return (
                <Link
                  key={s.module_key}
                  to={s.explore_route}
                  className="group rounded-xl bg-[var(--av-surface)] p-3 ring-1 ring-[var(--av-border)] hover:ring-[#155BB4]/40 hover:shadow-sm transition"
                >
                  <p className="text-sm font-semibold text-[var(--av-text)]">{s.value_headline}</p>
                  {estimate && (
                    <p className="mt-0.5 text-lg font-bold text-[#155BB4]">
                      {estimate} <span className="text-xs font-normal text-[var(--av-text-secondary)]">{s.value_estimate_label}</span>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[var(--av-text-secondary)] line-clamp-2">{s.value_explanation}</p>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#155BB4] group-hover:underline">
                    Explore {s.display_name} <ArrowRight size={12} />
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick actions — adapted to the user's active tools */}
      {quickActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a, i) => (
            <Link key={i} to={a.to} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--av-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--av-primary-hover)]">
              <a.icon size={15} /> {a.label}
            </Link>
          ))}
        </div>
      )}

      {/* Mode tabs — solo businesses don't need an "operations" distinction
          (no teams/departments to run operations across), so collapse to the
          single focus/overview choice that matters to a one-person business. */}
      {!isSolo && (
        <div className="flex gap-1 rounded-xl bg-[var(--av-surface-2)] p-1 w-fit">
          {(['overview', 'operations', 'focus'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-lg px-4 py-2 text-sm capitalize ${mode === m ? 'bg-[var(--av-surface)] shadow-sm font-medium text-[var(--av-text)]' : 'text-[var(--av-text-secondary)]'}`}>
              {m === 'focus' ? 'My Focus' : m}
            </button>
          ))}
        </div>
      )}

      {/* Adaptive KPI cards — only tools the user has selected/authorized */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiCards.map((c, i) => {
          const Icon = c.icon
          return (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--av-text-secondary)]">{c.label}</p>
                <Icon size={15} className="text-[var(--av-text-muted)]" />
              </div>
              <p className="mt-2 text-2xl font-semibold">{c.value}</p>
              <p className={`mt-1 text-xs ${c.subColor}`}>{c.sub}</p>
            </Card>
          )
        })}
      </div>

      {mode !== 'focus' && (
        <div className="grid gap-5 lg:grid-cols-5">
          <Card className="p-5 lg:col-span-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--av-text-muted)]">Business pulse</p>
                <h2 className="mt-1 text-lg font-semibold">{primaryMetric.label}</h2>
              </div>
              <div className="flex gap-2">
                <ViewPicker value={view} onChange={setView} />
                <button className="rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm hover:bg-[var(--av-surface-2)]">Explain</button>
              </div>
            </div>
            <div className="mt-6 min-h-40 flex items-end gap-2 rounded-xl bg-[var(--av-surface-2)] p-5">
              {primaryMetric.value === 0 ? (
                // Honest + gamified empty state: don't fabricate a sparkline
                // when there is no underlying data. Frames the first action as
                // the start of building this metric — not a dead end.
                <div className="flex w-full flex-col items-center justify-center gap-2 py-6 text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--av-primary-soft)' }}>
                    <TrendingUp size={22} style={{ color: 'var(--av-primary)' }} />
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mt-1" style={{ backgroundColor: 'var(--av-success-soft)', color: 'var(--av-success)' }}>
                    <Sparkles size={12} /> Building your {primaryMetric.label.toLowerCase()} story
                  </div>
                  <p className="text-sm" style={{ color: 'var(--av-text-secondary)' }}>No {primaryMetric.label.toLowerCase()} data yet.</p>
                  <p className="text-xs max-w-xs" style={{ color: 'var(--av-text-muted)' }}>This fills in as you use {primaryMetric.label === 'Revenue' || primaryMetric.label === 'Pipeline' ? 'this tool' : 'your workspace'} — your first entry starts the trend.</p>
                </div>
              ) : recommended === 'number' ? (
                <div className="text-5xl font-semibold">{money(primaryMetric.value)}</div>
              ) : recommended === 'progress' ? (
                <div className="w-full">
                  <div className="flex justify-between text-sm"><span>Monthly goal</span><span>{money(primaryMetric.value)}</span></div>
                  <div className="mt-3 h-4 overflow-hidden rounded-full bg-[var(--av-surface-3)]"><div className="h-full rounded-full bg-[var(--av-primary)]" style={{ width: '70%' }} /></div>
                </div>
              ) : recommended === 'breakdown' ? (
                <div className="w-full space-y-3">
                  <div className="flex justify-between text-sm"><span>{primaryMetric.label}</span><b>{money(primaryMetric.value)}</b></div>
                  <div className="flex justify-between text-sm"><span>Tasks</span><b>{stats.pendingTasks}</b></div>
                </div>
              ) : recommended === 'table' ? (
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="py-2">{primaryMetric.label}</td><td className="py-2 text-right font-medium">{money(primaryMetric.value)}</td></tr>
                    <tr><td className="py-2">Change</td><td className="py-2 text-right">{primaryMetric.change}%</td></tr>
                  </tbody>
                </table>
              ) : (
                <div className="w-full">
                  <div className="flex h-28 items-end gap-2">
                    {[42, 55, 48, 68, 60, 82, Math.max(18, Math.min(100, 60 + primaryMetric.change))].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-md bg-[var(--av-primary)]" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-[var(--av-text-muted)]"><span>7 months ago</span><span>Now</span></div>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-[var(--av-text-muted)]">Recommended view is based on the information and can be changed anytime.</p>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--av-text-muted)]">Attention</p>
                <h2 className="mt-1 text-lg font-semibold">What needs you</h2>
              </div>
              <CircleAlert size={19} className={attentionItems.length > 0 ? 'text-[var(--av-warning)]' : 'text-emerald-500'} />
            </div>
            <div className="mt-4 space-y-2">
              {attentionItems.slice(0, 5).map(a => (
                <Link to={a.to} key={a.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-[var(--av-surface-2)]">
                  <span className={`h-2 w-2 rounded-full ${a.tone === 'red' ? 'bg-[var(--av-danger)]' : 'bg-[var(--av-warning-soft)]0'}`} />
                  <span className="min-w-0 flex-1 truncate text-sm">{a.label}</span>
                  <ArrowRight size={15} className="text-[var(--av-text-muted)]" />
                </Link>
              ))}
              {attentionItems.length === 0 && (
                <div className="py-8 text-center">
                  <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: 'var(--av-success-soft)' }}>
                    <CheckCircle2 size={22} style={{ color: 'var(--av-success)' }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--av-text)' }}>You're all caught up</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--av-text-muted)' }}>Nothing needs your attention right now — a clear desk is progress.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--av-text-muted)]">{mode === 'focus' ? roleFocus.label : 'Your work'}</p>
              <h2 className="mt-1 text-lg font-semibold">Next actions</h2>
              {mode === 'focus' && <p className="mt-1 text-xs text-[var(--av-text-muted)]">{roleFocus.hint}</p>}
            </div>
            <Link to="/app/tasks" className="text-sm font-medium text-[var(--av-text)]">View all</Link>
          </div>
          <div className="mt-4 space-y-1">
            {filteredTasks.slice(0, 6).map(t => (
              <Link key={t.id} to="/app/tasks" className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-[var(--av-surface-2)]">
                <CheckCircle2 size={18} className="text-[var(--av-text-muted)]" />
                <span className="flex-1 truncate text-sm">{t.title}</span>
                <span className="text-xs text-[var(--av-text-muted)]">{t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No date'}</span>
              </Link>
            ))}
            {filteredTasks.length === 0 && <p className="py-8 text-center text-sm text-[var(--av-text-muted)]">Nothing here yet.</p>}
          </div>
        </Card>

        {/* Activity card — hidden for solo businesses (a one-person business
            has little cross-team activity noise; showing an empty/"No recent
            activity" state is more clutter than value). Enterprise/mid get the
            full activity feed. */}
        {!isSolo && (
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--av-text-muted)]">Recent</p>
                <h2 className="mt-1 text-lg font-semibold">Activity</h2>
              </div>
              <Clock3 size={18} className="text-[var(--av-text-muted)]" />
            </div>
            <div className="mt-4 space-y-3">
              {activities.map(a => (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="h-2 w-2 rounded-full bg-[var(--av-text-disabled)]" />
                  <span className="flex-1">{a.text}</span>
                  <span className="text-xs text-[var(--av-text-muted)]">{a.value}</span>
                </div>
              ))}
              {activities.length === 0 && <p className="py-8 text-center text-sm text-[var(--av-text-muted)]">No recent activity.</p>}
            </div>
          </Card>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Settings2 size={18} className="text-[var(--av-text-secondary)]" />
            <div>
              <p className="text-sm font-medium">Make Avenize yours</p>
              <p className="text-xs text-[var(--av-text-muted)]">Set up your organization, then choose what matters to you.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/app/settings/workspace" className="rounded-lg bg-[var(--av-primary)] px-3 py-2 text-sm text-white hover:bg-[var(--av-primary-hover)]">Customize</Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
