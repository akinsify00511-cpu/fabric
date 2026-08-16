import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useExperienceContext } from '../lib/useExperienceContext'
import {
  ArrowRight, Bell, BriefcaseBusiness, CheckCircle2, ChevronDown, CircleAlert,
  Clock3, LayoutGrid, PieChart, Search, Settings2, Table2, TrendingUp,
  Package, FolderKanban, Users2, Wallet, AlertTriangle, Plus,
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
    <section className={`rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,.06),0_8px_24px_rgba(0,0,0,.03)] ${className}`}>
      {children}
    </section>
  )
}

function ViewPicker({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const [open, setOpen] = useState(false)
  const Icon = VIEW_ICONS[value]
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
        <Icon size={15} />{VIEW_LABELS[value]}<ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">How do you want to understand this?</p>
          {(Object.keys(VIEW_LABELS) as View[]).map(v => {
            const I = VIEW_ICONS[v]
            return (
              <button key={v} onClick={() => { onChange(v); setOpen(false) }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${value === v ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'}`}>
                <I size={16} /><span>{VIEW_LABELS[v]}</span>
                {v === 'recommended' && <span className="ml-auto text-[10px] text-blue-600">BEST</span>}
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
}

const EMPTY_STATS: DashboardStats = {
  revenue: 0, revenueChange: 0, pipeline: 0, dealCount: 0,
  people: 0, overdue: 0, pendingTasks: 0, lowStock: 0, activeProjects: 0,
}

export default function Dashboard() {
  const { staff } = useAuth()
  // Single authoritative context — drives which KPIs/data/actions the dashboard
  // shows. Replaces the per-screen re-derivation of accessibleTools + selection.
  const { isToolActive, companySize } = useExperienceContext()
  const [mode, setMode] = useState<Mode>('overview')
  const [view, setView] = useState<View>('recommended')
  const [query, setQuery] = useState('')
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS)
  const [tasks, setTasks] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const hasFinance = isToolActive('finance')
  const hasCRM = isToolActive('crm')
  const hasInventory = isToolActive('inventory')
  const hasProjects = isToolActive('projects')
  const hasPeople = isToolActive('people')
  // Company-size tiers drive complexity (solo → minimal, team → full).
  // companySize comes from the Experience Context (authoritative headcount),
  // not the stats.staff count the dashboard happens to fetch.
  const isSolo = companySize <= 1

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
      }
      if (deals?.data) {
        pipeline = deals.data.filter((x: any) => x.stage !== 'lost' && x.stage !== 'won').reduce((s: number, x: any) => s + (x.value || 0), 0)
        dealCount = deals.data.length
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

  const firstName = staff?.full_name?.split(' ')[0] || staff?.name?.split(' ')[0] || 'there'
  const filteredTasks = useMemo(() =>
    tasks.filter(t => !query || String(t.title).toLowerCase().includes(query.toLowerCase())),
  [tasks, query])

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
      sub: `${stats.dealCount} open opportunities`, subColor: 'text-slate-400',
    })
  }
  if (hasProjects) {
    kpiCards.push({
      label: 'Active Projects', value: String(stats.activeProjects), icon: FolderKanban,
      sub: 'In progress', subColor: 'text-slate-400',
    })
  }
  if (hasInventory) {
    kpiCards.push({
      label: 'Low Stock', value: String(stats.lowStock), icon: Package,
      sub: stats.lowStock > 0 ? 'Needs reorder' : 'All healthy',
      subColor: stats.lowStock > 0 ? 'text-amber-600' : 'text-emerald-600',
    })
  }
  if (hasPeople && !isSolo) {
    kpiCards.push({
      label: 'People', value: String(stats.people), icon: Users2,
      sub: 'In your company', subColor: 'text-slate-400',
    })
  }
  // Always show attention (universal).
  kpiCards.push({
    label: 'Needs attention', value: String(stats.overdue), icon: AlertTriangle,
    sub: 'Overdue tasks', subColor: 'text-amber-600',
  })

  // ── Adaptive primary metric (the pulse card) ────────────────────────
  // Pick the most relevant primary metric based on active tools + data.
  const primaryMetric: { label: string; value: number; change: number } =
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
        <div className="h-10 w-72 rounded bg-slate-100" />
        <div className="h-40 rounded-2xl bg-slate-100" />
        <div className="h-64 rounded-2xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-20">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-slate-500">Your workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Good morning, {firstName}</h1>
          <p className="mt-1 text-sm text-slate-500">Here's what matters right now.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search anything…" className="w-48 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400" />
          </div>
          <Link to="/app/notifications" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label="Notifications">
            <Bell size={17} />
          </Link>
        </div>
      </header>

      {/* Quick actions — adapted to the user's active tools */}
      {quickActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a, i) => (
            <Link key={i} to={a.to} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              <a.icon size={15} /> {a.label}
            </Link>
          ))}
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {(['overview', 'operations', 'focus'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} className={`rounded-lg px-4 py-2 text-sm capitalize ${mode === m ? 'bg-white shadow-sm font-medium text-slate-900' : 'text-slate-500'}`}>
            {m === 'focus' ? 'My Focus' : m}
          </button>
        ))}
      </div>

      {/* Adaptive KPI cards — only tools the user has selected/authorized */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiCards.map((c, i) => {
          const Icon = c.icon
          return (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{c.label}</p>
                <Icon size={15} className="text-slate-300" />
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
                <p className="text-xs uppercase tracking-wide text-slate-400">Business pulse</p>
                <h2 className="mt-1 text-lg font-semibold">{primaryMetric.label}</h2>
              </div>
              <div className="flex gap-2">
                <ViewPicker value={view} onChange={setView} />
                <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">Explain</button>
              </div>
            </div>
            <div className="mt-6 min-h-40 flex items-end gap-2 rounded-xl bg-slate-50 p-5">
              {recommended === 'number' ? (
                <div className="text-5xl font-semibold">{money(primaryMetric.value)}</div>
              ) : recommended === 'progress' ? (
                <div className="w-full">
                  <div className="flex justify-between text-sm"><span>Monthly goal</span><span>{money(primaryMetric.value)}</span></div>
                  <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-800" style={{ width: '70%' }} /></div>
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
                      <div key={i} className="flex-1 rounded-t-md bg-slate-800/80" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>7 months ago</span><span>Now</span></div>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-400">Recommended view is based on the information and can be changed anytime.</p>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Attention</p>
                <h2 className="mt-1 text-lg font-semibold">What needs you</h2>
              </div>
              <CircleAlert size={19} className="text-amber-500" />
            </div>
            <div className="mt-4 space-y-2">
              {tasks.slice(0, 4).map(t => (
                <Link to="/app/tasks" key={t.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-slate-50">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <ArrowRight size={15} className="text-slate-400" />
                </Link>
              ))}
              {tasks.length === 0 && <p className="py-8 text-center text-sm text-slate-400">You're all caught up.</p>}
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">{mode === 'focus' ? 'My Focus' : 'Your work'}</p>
              <h2 className="mt-1 text-lg font-semibold">Next actions</h2>
            </div>
            <Link to="/app/tasks" className="text-sm font-medium text-slate-700">View all</Link>
          </div>
          <div className="mt-4 space-y-1">
            {filteredTasks.slice(0, 6).map(t => (
              <Link key={t.id} to="/app/tasks" className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-slate-50">
                <CheckCircle2 size={18} className="text-slate-300" />
                <span className="flex-1 truncate text-sm">{t.title}</span>
                <span className="text-xs text-slate-400">{t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No date'}</span>
              </Link>
            ))}
            {filteredTasks.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Nothing here yet.</p>}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Recent</p>
              <h2 className="mt-1 text-lg font-semibold">Activity</h2>
            </div>
            <Clock3 size={18} className="text-slate-400" />
          </div>
          <div className="mt-4 space-y-3">
            {activities.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span className="flex-1">{a.text}</span>
                <span className="text-xs text-slate-400">{a.value}</span>
              </div>
            ))}
            {activities.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No recent activity.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Settings2 size={18} className="text-slate-500" />
            <div>
              <p className="text-sm font-medium">Make Avenize yours</p>
              <p className="text-xs text-slate-400">Set up your organization, then choose what matters to you.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/app/settings/workspace" className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">Customize</Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
