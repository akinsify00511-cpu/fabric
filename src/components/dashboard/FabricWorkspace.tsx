import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  LayoutDashboard,
  List,
  MoreHorizontal,
  PanelsTopLeft,
  PieChart,
  Plus,
  Sparkles,
  Table2,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'

type WorkspaceMode = 'overview' | 'operations' | 'focus'
type Representation = 'recommended' | 'number' | 'trend' | 'progress' | 'breakdown' | 'table'

export type FabricWorkspaceProps = {
  userName?: string
  businessName?: string
  revenue?: number
  revenueChange?: number | null
  pipelineValue?: number
  teamMembers?: number
  pendingTasks?: number
  revenueData?: number[]
  activities?: Array<{ id: string; text: string; time: string; type?: string }>
  upcoming?: Array<{ id: string; text: string; time: string; priority?: string }>
}

const representations: Array<{ id: Representation; label: string; hint: string }> = [
  { id: 'recommended', label: 'Recommended', hint: 'Best for this data' },
  { id: 'number', label: 'Number', hint: 'Fastest to scan' },
  { id: 'trend', label: 'Trend', hint: 'See movement over time' },
  { id: 'progress', label: 'Progress', hint: 'See progress toward a goal' },
  { id: 'breakdown', label: 'Breakdown', hint: 'See what makes it up' },
  { id: 'table', label: 'Table', hint: 'See the underlying values' },
]

const money = (value = 0) => `₦${value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : value.toLocaleString()}`

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_10px_30px_rgba(15,23,42,.04)] ${className}`}>{children}</section>
}

function RepresentationPicker({ value, onChange }: { value: Representation; onChange: (value: Representation) => void }) {
  const [open, setOpen] = useState(false)
  const current = representations.find(item => item.id === value) ?? representations[0]
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" aria-haspopup="listbox" aria-expanded={open}>
        <PanelsTopLeft size={16} /> View <ChevronDown size={15} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl" role="listbox">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">How do you want to understand this?</div>
          {representations.map(item => (
            <button key={item.id} type="button" role="option" aria-selected={item.id === current.id} onClick={() => { onChange(item.id); setOpen(false) }} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
              <span><span className="block text-sm font-medium text-slate-800">{item.label}</span><span className="block text-xs text-slate-400">{item.hint}</span></span>
              {item.id === current.id && <Check size={16} className="text-slate-700" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RevenueView({ representation, revenue, revenueChange, data }: { representation: Representation; revenue: number; revenueChange?: number | null; data: number[] }) {
  const view = representation === 'recommended' ? 'trend' : representation
  if (view === 'number') return <div className="py-5"><div className="text-5xl font-semibold tracking-tight text-slate-950">{money(revenue)}</div><div className="mt-2 text-sm text-slate-500">Revenue this month</div></div>
  if (view === 'progress') return <div className="py-5"><div className="flex items-end justify-between"><div><div className="text-4xl font-semibold text-slate-950">{money(revenue)}</div><div className="text-sm text-slate-500">of ₦100M annual target</div></div><span className="text-sm font-semibold text-emerald-600">{Math.min(Math.round((revenue / 100_000_000) * 100), 100)}%</span></div><div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.min((revenue / 100_000_000) * 100, 100)}%` }} /></div></div>
  if (view === 'breakdown') return <div className="space-y-3 py-4">{['Roofing', 'Coatings', 'Realtor', 'Academy'].map((name, index) => { const share = [52, 28, 14, 6][index]; return <div key={name}><div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{name}</span><span className="font-medium text-slate-800">{money(revenue * share / 100)}</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-700" style={{ width: `${share}%` }} /></div></div> })}</div>
  if (view === 'table') return <div className="overflow-hidden rounded-2xl border border-slate-100"><table className="w-full text-sm"><tbody>{data.map((value, index) => <tr key={index} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3 text-slate-500">Period {index + 1}</td><td className="px-4 py-3 text-right font-medium text-slate-800">{money(value)}</td></tr>)}</tbody></table></div>
  return <div className="pt-3"><div className="mb-4 flex items-end justify-between"><div><div className="text-4xl font-semibold tracking-tight text-slate-950">{money(revenue)}</div><div className="mt-1 text-sm text-slate-500">Revenue this month</div></div>{revenueChange !== null && revenueChange !== undefined && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${revenueChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{revenueChange >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(revenueChange)}%</span>}</div><div className="flex h-28 items-end gap-2">{data.length ? data.map((value, index) => <div key={index} className="flex-1 rounded-t-md bg-slate-200 transition-all first:bg-slate-300 last:bg-slate-800" style={{ height: `${Math.max(value, 6)}%` }} />) : <div className="text-sm text-slate-400">No revenue data yet</div>}</div></div>
}

export default function FabricWorkspace({ userName = 'there', businessName = 'All Companies', revenue = 0, revenueChange = null, pipelineValue = 0, teamMembers = 0, pendingTasks = 0, revenueData = [], activities = [], upcoming = [] }: FabricWorkspaceProps) {
  const [mode, setMode] = useState<WorkspaceMode>('overview')
  const [representation, setRepresentation] = useState<Representation>('recommended')
  const [companyOpen, setCompanyOpen] = useState(false)
  const [focus, setFocus] = useState(false)
  const companies = ['All Companies', 'Plusworld Coating', 'Plusworld Roofing', 'Plusworld Realtor', 'Plusworld Academy', 'Dandys']
  const attention = useMemo(() => Math.max(1, pendingTasks), [pendingTasks])

  return (
    <div className="min-h-full bg-[#f7f8fa] pb-20 text-slate-950">
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex items-center gap-2 text-sm text-slate-500"><LayoutDashboard size={16} /><span>Workspace</span></div><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Good morning, {userName}</h1><p className="mt-1 text-sm text-slate-500">Here’s what needs your attention.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><button type="button" onClick={() => setCompanyOpen(v => !v)} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200"><Building2 size={16} />{businessName}<ChevronDown size={15} /></button>{companyOpen && <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">{companies.map(company => <button key={company} type="button" onClick={() => setCompanyOpen(false)} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">{company}</button>)}</div>}</div>
            <button type="button" onClick={() => setFocus(v => !v)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium shadow-sm ring-1 ${focus ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200'}`}><Target size={16} /> Focus</button>
          </div>
        </header>

        <div className="mb-6 flex items-center justify-between overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-100">
          {([['overview', 'Overview', LayoutDashboard], ['operations', 'Operations', BriefcaseBusiness], ['focus', 'My Focus', Target]] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setMode(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${mode === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Icon size={16} />{label}</button>)}
          <button type="button" className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"><Plus size={16} /> Customize</button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Revenue', money(revenue), revenueChange, TrendingUp, '/app/finance'],
            ['Pipeline', money(pipelineValue), null, BarChart3, '/app/crm'],
            ['People', teamMembers.toLocaleString(), null, Users, '/app/people'],
            ['Needs attention', attention.toString(), null, CircleAlert, '/app/tasks'],
          ].map(([label, value, change, Icon, href]) => <Link key={label as string} to={href as string} className="group rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_10px_30px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5"><div className="mb-5 flex items-center justify-between"><span className="text-sm text-slate-500">{label as string}</span><Icon size={18} className="text-slate-400 group-hover:text-slate-700" /></div><div className="text-3xl font-semibold tracking-tight">{value as string}</div>{typeof change === 'number' && <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(change)}% vs last month</div>}</Link>)}
        </div>

        {!focus && <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_1fr]">
          <Surface className="p-5 sm:p-6"><div className="mb-2 flex items-start justify-between"><div><div className="flex items-center gap-2"><TrendingUp size={17} className="text-slate-500" /><h2 className="font-semibold">Revenue</h2></div><p className="mt-1 text-xs text-slate-400">A clear view of movement and performance.</p></div><div className="flex items-center gap-1"><RepresentationPicker value={representation} onChange={setRepresentation} /><button type="button" title="More options" className="rounded-xl p-2 text-slate-400 hover:bg-slate-50"><MoreHorizontal size={18} /></button></div></div><RevenueView representation={representation} revenue={revenue} revenueChange={revenueChange} data={revenueData} /><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-950"><Sparkles size={15} /> Explain this</button><Link to="/app/finance" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-950">Open Finance <ArrowUpRight size={15} /></Link></div></Surface>
          <Surface className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Attention</h2><p className="mt-1 text-xs text-slate-400">Items that may need action.</p></div><CircleAlert size={18} className="text-slate-400" /></div><div className="space-y-2">{upcoming.slice(0, 5).map(item => <Link to="/app/tasks" key={item.id} className="flex items-center gap-3 rounded-2xl p-3 hover:bg-slate-50"><span className={`h-2 w-2 shrink-0 rounded-full ${item.priority === 'high' ? 'bg-rose-500' : 'bg-amber-400'}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-700">{item.text}</span><span className="mt-0.5 block text-xs text-slate-400">{item.time}</span></span><ArrowUpRight size={15} className="text-slate-300" /></Link>)}{!upcoming.length && <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">Nothing urgent right now.</div>}</div></Surface>
        </div>}

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Surface className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Recent activity</h2><p className="mt-1 text-xs text-slate-400">What has changed across your workspace.</p></div><Clock3 size={18} className="text-slate-400" /></div><div className="space-y-1">{activities.slice(0, 5).map(item => <div key={item.id} className="flex gap-3 rounded-2xl p-3"><div className="mt-1 h-2 w-2 rounded-full bg-slate-300" /><div className="min-w-0"><div className="text-sm text-slate-700">{item.text}</div><div className="mt-1 text-xs text-slate-400">{item.time}</div></div></div>)}{!activities.length && <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">No recent activity yet.</div>}</div></Surface>
          <Surface className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Your work</h2><p className="mt-1 text-xs text-slate-400">The next actions on your plate.</p></div><List size={18} className="text-slate-400" /></div><div className="space-y-2">{upcoming.slice(0, 5).map(item => <Link to="/app/tasks" key={item.id} className="flex items-center gap-3 rounded-2xl p-3 hover:bg-slate-50"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Check size={15} className="text-slate-600" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-700">{item.text}</span><span className="block text-xs text-slate-400">{item.time}</span></span></Link>)}{!upcoming.length && <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">You’re clear.</div>}</div></Surface>
        </div>

        <div className="mt-4 rounded-3xl bg-slate-950 p-5 text-white shadow-xl sm:p-6"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium"><Sparkles size={13} /> FABRIC workspace</div><h2 className="text-xl font-semibold tracking-tight">One business. One operating picture.</h2><p className="mt-1 max-w-2xl text-sm text-slate-300">Choose the way you understand your data. FABRIC keeps the underlying business truth consistent while adapting the presentation to your role.</p></div><button type="button" onClick={() => setRepresentation('recommended')} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"><Sparkles size={16} /> Use recommended views</button></div></div>
      </div>
    </div>
  )
}
