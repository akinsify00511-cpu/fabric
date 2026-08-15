import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Check,
  ChevronDown,
  CircleDot,
  Grid2X2,
  List,
  LineChart,
  PieChart,
  Table2,
  TrendingUp,
} from 'lucide-react'

export type FabricView = 'kpi' | 'trend' | 'progress' | 'breakdown' | 'table'

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

const VIEWS: Array<{ id: FabricView; label: string; icon: typeof Grid2X2 }> = [
  { id: 'kpi', label: 'Number', icon: Grid2X2 },
  { id: 'trend', label: 'Trend', icon: LineChart },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'breakdown', label: 'Breakdown', icon: PieChart },
  { id: 'table', label: 'Table', icon: Table2 },
]

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

export default function FabricViewEngine({
  widgetKey,
  title,
  value,
  change,
  data = [],
  dataLabels = [],
  breakdown = [],
  goal,
  goalLabel = 'Goal',
  currency = '₦',
  description,
  defaultView = 'kpi',
  className = '',
}: FabricViewEngineProps) {
  const [view, setView] = useState<FabricView>(defaultView)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}${widgetKey}`) as FabricView | null
      if (saved && VIEWS.some(item => item.id === saved)) setView(saved)
    } catch {
      // Preferences are an enhancement; the data view must still render.
    }
  }, [widgetKey])

  const selectView = (next: FabricView) => {
    setView(next)
    setOpen(false)
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${widgetKey}`, next)
    } catch {
      // Ignore storage restrictions (private mode, embedded browser, etc.).
    }
  }

  const max = useMemo(() => Math.max(...data, 1), [data])
  const current = data[data.length - 1] || 0
  const progress = goal && goal > 0 ? Math.min((current / goal) * 100, 100) : 0
  const selected = VIEWS.find(item => item.id === view) || VIEWS[0]
  const SelectedIcon = selected.icon

  return (
    <section className={`rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.04)] ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</div>
          {description && <div className="mt-1 text-xs text-slate-500">{description}</div>}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(currentOpen => !currentOpen)}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <SelectedIcon size={13} />
            View
            <ChevronDown size={13} />
          </button>
          {open && (
            <div className="absolute right-0 z-30 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Represent as</div>
              {VIEWS.map(item => {
                const Icon = item.icon
                const active = item.id === view
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectView(item.id)}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition ${active ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Icon size={14} />
                    <span className="flex-1">{item.label}</span>
                    {active && <Check size={13} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {view === 'kpi' && (
        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <div className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">{value}</div>
            {change && <div className={`mt-2 text-sm font-semibold ${change.startsWith('-') ? 'text-red-600' : 'text-emerald-600'}`}>{change}</div>}
          </div>
          <CircleDot className="mb-1 text-slate-200" size={34} strokeWidth={1.5} />
        </div>
      )}

      {view === 'trend' && (
        <div className="mt-5">
          <div className="flex items-end justify-between">
            <div className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">{value}</div>
            {change && <span className={`text-sm font-semibold ${change.startsWith('-') ? 'text-red-600' : 'text-emerald-600'}`}>{change}</span>}
          </div>
          <div className="mt-5 flex h-28 items-end gap-1.5 rounded-2xl bg-slate-50 px-3 py-3">
            {data.length > 0 ? data.map((point, index) => (
              <div key={`${point}-${index}`} className="group flex h-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-md transition ${index === data.length - 1 ? 'bg-slate-950' : 'bg-slate-300 group-hover:bg-slate-400'}`}
                  style={{ height: `${Math.max((point / max) * 100, 6)}%` }}
                  title={`${dataLabels[index] || `Period ${index + 1}`}: ${formatAxisValue(point, currency)}`}
                />
              </div>
            )) : <div className="flex w-full items-center justify-center text-xs text-slate-400">No trend data yet</div>}
          </div>
          {dataLabels.length > 0 && (
            <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>{dataLabels[0]}</span><span>{dataLabels[dataLabels.length - 1]}</span></div>
          )}
        </div>
      )}

      {view === 'progress' && (
        <div className="mt-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">{value}</div>
              <div className="mt-1 text-xs text-slate-500">{goalLabel}</div>
            </div>
            <div className="text-right text-sm font-semibold text-slate-700">{Math.round(progress)}%</div>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-950 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          {goal !== undefined && <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>Current</span><span>{formatAxisValue(goal, currency)} target</span></div>}
        </div>
      )}

      {view === 'breakdown' && (
        <div className="mt-5 space-y-3">
          <div className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">{value}</div>
          {breakdown.length > 0 ? breakdown.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className={`font-semibold ${toneClass(item.tone)}`}>{item.value} {item.change || ''}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.max(8, 100 - index * 17)}%` }} />
              </div>
            </div>
          )) : <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-400">No breakdown available yet.</div>}
        </div>
      )}

      {view === 'table' && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Metric</span><span>Value</span><span>Change</span>
          </div>
          {(breakdown.length > 0 ? breakdown : [{ label: title, value, change: change || undefined }]).map((item, index) => (
            <div key={`${item.label}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-slate-100 px-3 py-2.5 text-xs">
              <span className="truncate text-slate-600">{item.label}</span>
              <span className="font-semibold text-slate-900">{item.value}</span>
              <span className={toneClass(item.tone)}>{item.change || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
