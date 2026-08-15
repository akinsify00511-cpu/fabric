import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, CircleDot, Grid2X2, LineChart, PieChart, Sparkles, Table2, Target, TrendingUp } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

export type FabricView = 'recommended' | 'kpi' | 'trend' | 'progress' | 'breakdown' | 'table'

export interface FabricMetric {
  label: string
  value: string
  change?: string
  tone?: 'positive' | 'negative' | 'neutral'
}

interface FabricViewEngineProps {
  widgetKey: string
  title: string
  value: string
  change?: string | null
  data?: number[]
  dataLabels?: string[]
  breakdown?: FabricMetric[]
  goal?: number
  goalLabel?: string
  currency?: string
  description?: string
  defaultView?: FabricView
  className?: string
}

const STORAGE_PREFIX = 'fabric:view:'
const REPRESENTATIONS: Array<{ id: FabricView; label: string; hint: string; icon: typeof Grid2X2 }> = [
  { id: 'recommended', label: 'Recommended', hint: 'Best for this data', icon: Sparkles },
  { id: 'kpi', label: 'Number', hint: 'Fastest to scan', icon: Grid2X2 },
  { id: 'trend', label: 'Trend', hint: 'See movement over time', icon: LineChart },
  { id: 'progress', label: 'Progress', hint: 'See progress to a goal', icon: TrendingUp },
  { id: 'breakdown', label: 'Breakdown', hint: 'See what makes it up', icon: PieChart },
  { id: 'table', label: 'Table', hint: 'See the underlying values', icon: Table2 },
]

const VALID_VIEWS = new Set<FabricView>(REPRESENTATIONS.map(view => view.id))
const preferencePromises = new Map<string, Promise<Record<string, FabricView>>>()

function loadPreferences(userId: string): Promise<Record<string, FabricView>> {
  const existing = preferencePromises.get(userId)
  if (existing) return existing
  const promise = supabase
    .from('user_preferences')
    .select('dashboard_view_preferences')
    .eq('user_id', userId)
    .maybeSingle()
    .then(({ data }) => {
      const raw = data?.dashboard_view_preferences
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
      return Object.fromEntries(Object.entries(raw).filter(([, value]) => VALID_VIEWS.has(value as FabricView))) as Record<string, FabricView>
    })
    .catch(() => ({}))
  preferencePromises.set(userId, promise)
  return promise
}

async function savePreference(userId: string, widgetKey: string, view: FabricView) {
  try {
    const current = await loadPreferences(userId)
    const next = { ...current, [widgetKey]: view }
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, dashboard_view_preferences: next }, { onConflict: 'user_id' })
    if (error) throw error
    preferencePromises.set(userId, Promise.resolve(next))
  } catch {
    // A preference failure must never affect the business data or dashboard.
  }
}

const toneClass = (tone: FabricMetric['tone']) => {
  if (tone === 'negative') return 'text-red-600'
  if (tone === 'positive') return 'text-emerald-600'
  return 'text-slate-500'
}

function formatAxisValue(value: number, currency = '₦') {
  if (Math.abs(value) >= 1_000_000) return `${currency}${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${currency}${Math.round(value / 1_000)}k`
  return `${currency}${Math.round(value)}`
}

function recommendView(data: number[], breakdown: FabricMetric[], goal?: number): Exclude<FabricView, 'recommended'> {
  if (goal && goal > 0) return 'progress'
  if (data.length >= 3) return 'trend'
  if (breakdown.length >= 2) return 'breakdown'
  return 'kpi'
}

export default function FabricViewEngine({
  widgetKey, title, value, change, data = [], dataLabels = [], breakdown = [], goal,
  goalLabel = 'Goal', currency = '₦', description, defaultView = 'recommended', className = '',
}: FabricViewEngineProps) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [view, setView] = useState<FabricView>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}${widgetKey}`) as FabricView | null
      return saved && VALID_VIEWS.has(saved) ? saved : defaultView
    } catch { return defaultView }
  })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    if (!userId) return () => { active = false }
    loadPreferences(userId).then(preferences => {
      const saved = preferences[widgetKey]
      if (active && saved) setView(saved)
    })
    return () => { active = false }
  }, [userId, widgetKey])

  const effectiveView = view === 'recommended' ? recommendView(data, breakdown, goal) : view
  const selected = REPRESENTATIONS.find(item => item.id === view) || REPRESENTATIONS[0]
  const EffectiveIcon = REPRESENTATIONS.find(item => item.id === effectiveView)?.icon || Grid2X2

  const selectView = (next: FabricView) => {
    setView(next)
    setOpen(false)
    try { localStorage.setItem(`${STORAGE_PREFIX}${widgetKey}`, next) } catch { /* best effort */ }
    if (userId) void savePreference(userId, widgetKey, next)
  }

  const max = useMemo(() => Math.max(...data, 1), [data])
  const current = data[data.length - 1] || 0
  const progress = goal && goal > 0 ? Math.min((current / goal) * 100, 100) : 0

  return (
    <section className={`rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.03),0_12px_30px_rgba(15,23,42,.045)] ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</div>
            {view === 'recommended' && <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"><Sparkles size={9} /> Recommended</span>}
          </div>
          {description && <div className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{description}</div>}
        </div>

        <div className="relative shrink-0">
          <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
            <EffectiveIcon size={13} /> {selected.label} <ChevronDown size={13} />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_16px_50px_rgba(15,23,42,.14)]">
              <div className="px-2.5 pb-1.5 pt-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">How do you want to understand this?</div>
                <div className="mt-0.5 text-[11px] text-slate-400">FABRIC keeps the data the same and changes only the representation.</div>
              </div>
              {REPRESENTATIONS.map(item => {
                const Icon = item.icon
                const active = item.id === view
                const recommended = item.id === 'recommended'
                return (
                  <button key={item.id} type="button" role="menuitem" onClick={() => selectView(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${active ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-white/10' : 'bg-slate-100'}`}><Icon size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs font-semibold">{item.label}{recommended && <Sparkles size={10} />}</span>
                      <span className={`mt-0.5 block text-[10px] ${active ? 'text-white/60' : 'text-slate-400'}`}>{item.hint}</span>
                    </span>
                    {active && <Check size={14} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {view === 'recommended' && (
        <div className="mt-3 flex items-center gap-2 text-[10px] font-medium text-slate-400">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100"><EffectiveIcon size={11} /></span>
          Showing {REPRESENTATIONS.find(item => item.id === effectiveView)?.label.toLowerCase()} because it best fits this data.
        </div>
      )}

      {effectiveView === 'kpi' && <div className="mt-6 flex items-end justify-between gap-4"><div><div className="text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-5xl">{value}</div>{change && <div className={`mt-2 text-sm font-semibold ${change.startsWith('-') ? 'text-red-600' : 'text-emerald-600'}`}>{change}</div>}</div><CircleDot className="mb-1 text-slate-200" size={34} strokeWidth={1.5} /></div>}

      {effectiveView === 'trend' && <div className="mt-5"><div className="flex items-end justify-between"><div className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">{value}</div>{change && <span className={`text-sm font-semibold ${change.startsWith('-') ? 'text-red-600' : 'text-emerald-600'}`}>{change}</span>}</div><div className="mt-5 flex h-28 items-end gap-1.5 rounded-2xl bg-slate-50 px-3 py-3">{data.length > 0 ? data.map((point, index) => <div key={`${point}-${index}`} className="group flex h-full flex-1 items-end"><div className={`w-full rounded-t-md transition ${index === data.length - 1 ? 'bg-slate-950' : 'bg-slate-300 group-hover:bg-slate-400'}`} style={{ height: `${Math.max((point / max) * 100, 6)}%` }} title={`${dataLabels[index] || `Period ${index + 1}`}: ${formatAxisValue(point, currency)}`} /></div>) : <div className="flex w-full items-center justify-center text-xs text-slate-400">No trend data yet</div>}</div>{dataLabels.length > 0 && <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>{dataLabels[0]}</span><span>{dataLabels[dataLabels.length - 1]}</span></div>}</div>}

      {effectiveView === 'progress' && <div className="mt-6"><div className="flex items-end justify-between gap-4"><div><div className="text-4xl font-semibold tracking-[-0.045em] text-slate-950">{value}</div><div className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Target size={12} />{goalLabel}</div></div><div className="text-right text-sm font-semibold text-slate-700">{Math.round(progress)}%</div></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-950 transition-all duration-500" style={{ width: `${progress}%` }} /></div>{goal !== undefined && <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>Current</span><span>{formatAxisValue(goal, currency)} target</span></div>}</div>}

      {effectiveView === 'breakdown' && <div className="mt-5 space-y-3"><div className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">{value}</div>{breakdown.length > 0 ? breakdown.map((item, index) => <div key={`${item.label}-${index}`}><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-slate-700">{item.label}</span><span className={`font-semibold ${toneClass(item.tone)}`}>{item.value} {item.change || ''}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.max(8, 100 - index * 17)}%` }} /></div></div>) : <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-400">No breakdown available yet.</div>}</div>}

      {effectiveView === 'table' && <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100"><div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span>Metric</span><span>Value</span><span>Change</span></div>{(breakdown.length > 0 ? breakdown : [{ label: title, value, change: change || undefined }]).map((item, index) => <div key={`${item.label}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-slate-100 px-3 py-2.5 text-xs"><span className="truncate text-slate-600">{item.label}</span><span className="font-semibold text-slate-900">{item.value}</span><span className={toneClass(item.tone)}>{item.change || '—'}</span></div>)}</div>}
    </section>
  )
}
