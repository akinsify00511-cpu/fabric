import { useEffect, useState } from 'react'
import {
  ShieldCheck, Activity, AlertTriangle, RefreshCw, Search, Radio, Users,
  Building2, Bot, CreditCard, ShieldAlert, Wrench, BarChart3, HeartPulse,
} from 'lucide-react'
import { getRiverwaysAdminOverview, isRiverwaysAdmin, type RiverwaysAdminOverview } from '../lib/riverwaysAdmin'
import { globalSearch, type GlobalSearchResult } from '../lib/riverwaysActivity'
import {
  ActivityPanel, UsersPanel, OrgsPanel, AiPanel, BillingPanel,
  SecurityPanel, ErrorsPanel, HealingPanel, AnalyticsPanel,
} from '../components/riverways/ActivityPanels'

type TabKey = 'activity' | 'users' | 'orgs' | 'ai' | 'billing' | 'security' | 'errors' | 'healing' | 'analytics'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Activity }> = [
  { key: 'activity', label: 'Live Activity', icon: Radio },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'orgs', label: 'Organizations', icon: Building2 },
  { key: 'ai', label: 'AI Activity', icon: Bot },
  { key: 'billing', label: 'Billing', icon: CreditCard },
  { key: 'security', label: 'Security', icon: ShieldAlert },
  { key: 'errors', label: 'Errors', icon: AlertTriangle },
  { key: 'healing', label: 'Self-Healing', icon: Wrench },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
]

function GlobalSearchBox() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<GlobalSearchResult | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!q.trim()) { setRes(null); return }
    setBusy(true)
    setRes(await globalSearch(q.trim()))
    setBusy(false)
  }

  const hasResults = res && (res.users.length + res.organizations.length + res.events.length + res.incidents.length + res.rpcs.length) > 0

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void run()}
            placeholder="Search users, organizations, RPCs, incidents, events…"
            className="w-full rounded-xl border border-white/10 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600" />
        </div>
        <button onClick={() => void run()} className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-slate-950">
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      {res && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
          {!hasResults && <p className="text-sm text-slate-500">No matches across users, organizations, RPCs, incidents or events.</p>}
          {res.users.length > 0 && (
            <div className="mb-3"><div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Users</div>
              {res.users.map((u, i) => <div key={i} className="py-1 text-sm text-slate-300">{u.email}</div>)}</div>)}
          {res.organizations.length > 0 && (
            <div className="mb-3"><div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Organizations</div>
              {res.organizations.map(o => <div key={o.id} className="py-1 text-sm text-slate-300">{o.name}{o.industry ? ` · ${o.industry}` : ''}</div>)}</div>)}
          {res.rpcs.length > 0 && (
            <div className="mb-3"><div className="mb-1 text-xs uppercase tracking-wider text-slate-500">RPCs / functions</div>
              {res.rpcs.map((r, i) => <div key={i} className="py-1 font-mono text-xs text-slate-300">{r.proname}</div>)}</div>)}
          {res.incidents.length > 0 && (
            <div className="mb-3"><div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Incidents</div>
              {res.incidents.map((inc, i) => <div key={i} className="py-1 text-sm text-slate-300">{inc.title} · <span className="text-slate-500">{inc.status}</span></div>)}</div>)}
          {res.events.length > 0 && (
            <div><div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Activity events</div>
              {res.events.map((e, i) => <div key={i} className="py-1 font-mono text-xs text-slate-300">{e.event_type}{e.feature ? ` · ${e.feature}` : ''}</div>)}</div>)}
        </div>
      )}
    </div>
  )
}

export default function RiverwaysAdmin() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [overview, setOverview] = useState<RiverwaysAdminOverview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('activity')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const ok = await isRiverwaysAdmin()
      setAuthorized(ok)
      if (!ok) return
      setOverview(await getRiverwaysAdminOverview())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Riverways Admin')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">Loading Riverways Admin…</div>
  if (!authorized) return <div className="min-h-screen grid place-items-center bg-slate-950 px-6"><div className="max-w-md rounded-2xl bg-white p-8 text-center"><ShieldCheck className="mx-auto mb-4 text-red-600" size={40}/><h1 className="text-xl font-semibold">Access denied</h1><p className="mt-2 text-sm text-slate-500">This console is restricted to authorized Riverways platform administrators.</p></div></div>
  if (error) return <div className="min-h-screen grid place-items-center bg-slate-950 px-6"><div className="max-w-md rounded-2xl bg-white p-8 text-center"><AlertTriangle className="mx-auto mb-4 text-amber-600" size={40}/><h1 className="text-xl font-semibold">Command center unavailable</h1><p className="mt-2 text-sm text-slate-500">{error}</p><button onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"><RefreshCw size={16}/> Retry</button></div></div>

  const d = overview?.dependencies
  const healthy = d ? d.total > 0 && d.healthy === d.total : true

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Riverways Platform</p>
            <h1 className="mt-1 text-2xl font-semibold">Activity & Operations Center</h1>
          </div>
          <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${healthy ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300'}`}>
            <HeartPulse size={15} />
            {d ? `Platform ${healthy ? 'healthy' : `${d.healthy}/${d.total} healthy`}` : 'Platform status loading'}
          </div>
        </div>
        <div className="mx-auto mt-4 max-w-7xl"><GlobalSearchBox /></div>
      </header>

      <nav className="border-b border-white/10 px-6">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto py-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm ${tab === key ? 'bg-white text-slate-950 font-medium' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {tab === 'activity' && <ActivityPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'orgs' && <OrgsPanel />}
        {tab === 'ai' && <AiPanel />}
        {tab === 'billing' && <BillingPanel />}
        {tab === 'security' && <SecurityPanel />}
        {tab === 'errors' && <ErrorsPanel />}
        {tab === 'healing' && <HealingPanel />}
        {tab === 'analytics' && <AnalyticsPanel />}

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-medium">Privacy boundary</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This console shows <em className="text-slate-300">who did what, when, where, which feature, and whether the system is healthy</em>.
            Passwords, auth tokens, API keys, payment credentials, private secrets, and private conversation contents are never stored in the
            activity stream — the server strips credential-like keys before any event is recorded.
          </p>
        </section>
      </main>
    </div>
  )
}
