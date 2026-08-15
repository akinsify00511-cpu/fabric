// Representation Engine — lets users choose how data is displayed.
//
// Design principle (Avenize): "the employee experiences it as simply as
// WhatsApp." Numbers shouldn't force a single shape. A revenue figure can be
// a big number, a trend sparkline, a progress bar toward a target, a
// breakdown of components, or a table of detail — depending on what the user
// is trying to understand RIGHT NOW.
//
// The engine recommends a representation based on available data, but the
// user can always override. Their choice persists per metric key.
//
// No external charting library — SVG sparklines + CSS bars. Build-from-within.

import { useState, useEffect, useMemo, type ReactNode } from 'react'
import {
  Hash, TrendingUp, Target as TargetIcon, PieChart, Table as TableIcon,
  ChevronDown, Info,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RepresentationType = 'number' | 'trend' | 'progress' | 'breakdown' | 'table'

export interface BreakdownItem {
  label: string
  value: number
}

export interface RepresentableData {
  /** Stable key for persisting user's representation choice (e.g. 'revenue'). */
  metricKey: string
  label: string
  value: number | null
  unit?: 'currency' | 'percent' | 'duration_days' | 'number' | 'ratio'
  /** For progress representation: the target/goal value. */
  target?: number
  /** For trend representation: chronological series of past values. */
  historical?: number[]
  /** For breakdown representation: component parts that sum to the whole. */
  breakdown?: BreakdownItem[]
  /** Drill-down link. */
  to?: string
  /** Confidence tag for the value. */
  confidence?: 'high' | 'medium' | 'low' | 'insufficient' | 'error'
}

export interface RepresentationOption {
  type: RepresentationType
  label: string
  icon: typeof Hash
  /** Whether this representation has the data it needs. */
  available: boolean
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatValue(value: number | null, unit?: string): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (unit === 'currency') {
    const abs = Math.abs(value)
    if (abs >= 1_000_000_000) return `₦${(value / 1_000_000_000).toFixed(1)}B`
    if (abs >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `₦${(value / 1_000).toFixed(0)}K`
    return `₦${Math.round(value).toLocaleString()}`
  }
  if (unit === 'percent') return `${Math.round(value)}%`
  if (unit === 'duration_days') return `${Math.round(value)}d`
  if (unit === 'ratio') return value.toFixed(2)
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)
}

// ---------------------------------------------------------------------------
// Smart recommendation
// ---------------------------------------------------------------------------

function recommend(data: RepresentableData): RepresentationType {
  if (data.historical && data.historical.length > 1) return 'trend'
  if (data.target != null && data.value != null) return 'progress'
  if (data.breakdown && data.breakdown.length > 0) return 'breakdown'
  return 'number'
}

function buildOptions(data: RepresentableData): RepresentationOption[] {
  return [
    { type: 'number', label: 'Number', icon: Hash, available: data.value != null },
    { type: 'trend', label: 'Trend', icon: TrendingUp, available: !!(data.historical && data.historical.length > 1) },
    { type: 'progress', label: 'Progress', icon: TargetIcon, available: data.target != null && data.value != null },
    { type: 'breakdown', label: 'Breakdown', icon: PieChart, available: !!(data.breakdown && data.breakdown.length > 0) },
    { type: 'table', label: 'Table', icon: TableIcon, available: true },
  ]
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'avenize_representation_prefs'

function loadPrefs(): Record<string, RepresentationType> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function savePref(key: string, type: RepresentationType) {
  try {
    const prefs = loadPrefs()
    prefs[key] = type
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch { /* non-blocking */ }
}

// ---------------------------------------------------------------------------
// SVG Sparkline (no external deps)
// ---------------------------------------------------------------------------

function Sparkline({ data, width = 100, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)
  const points = data.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const isUp = data[data.length - 1] >= data[0]
  const color = isUp ? 'var(--av-success)' : 'var(--av-danger)'
  const linePath = `M ${points.join(' L ')}`
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={areaPath} fill={color} opacity={0.08} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={points[points.length - 1].split(',')[0]} cy={points[points.length - 1].split(',')[1]} r={2.5} fill={color} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// CSS Progress Bar
// ---------------------------------------------------------------------------

function ProgressBar({ value, target, unit }: { value: number; target: number; unit?: string }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0
  const isOver = value >= target
  const remaining = target - value
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-semibold text-[var(--av-text)]">{formatValue(value, unit)}</span>
        <span className="text-[11px] text-[var(--av-text-muted)]">of {formatValue(target, unit)}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--av-surface)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: isOver ? 'var(--av-success)' : 'var(--av-primary)' }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className={`text-[11px] ${isOver ? 'text-[var(--av-success)]' : 'text-[var(--av-text-muted)]'}`}>
          {isOver ? 'Target reached' : `${pct.toFixed(0)}% there`}
        </span>
        {!isOver && (
          <span className="text-[11px] text-[var(--av-text-muted)]">{formatValue(remaining, unit)} to go</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CSS Breakdown Bars
// ---------------------------------------------------------------------------

function BreakdownBars({ items, unit }: { items: BreakdownItem[]; unit?: string }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  const sorted = [...items].sort((a, b) => b.value - a.value)
  // Generate distinct colors using the brand palette
  const colors = ['var(--av-primary)', 'var(--av-success)', 'var(--av-warning)', 'var(--av-accent)', 'var(--av-info)', 'var(--av-danger)']
  return (
    <div className="w-full space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden bg-[var(--av-surface)]">
        {sorted.map((item, i) => (
          <div
            key={i}
            className="h-full transition-all duration-300"
            style={{ width: `${(item.value / total) * 100}%`, background: colors[i % colors.length] }}
            title={`${item.label}: ${formatValue(item.value, unit)}`}
          />
        ))}
      </div>
      <div className="space-y-0.5">
        {sorted.slice(0, 4).map((item, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-[var(--av-text-secondary)] truncate">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
              {item.label}
            </span>
            <span className="font-medium text-[var(--av-text)] ml-2">{formatValue(item.value, unit)}</span>
          </div>
        ))}
        {sorted.length > 4 && (
          <div className="text-[10px] text-[var(--av-text-muted)]">+{sorted.length - 4} more</div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table View
// ---------------------------------------------------------------------------

function TableView({ data }: { data: RepresentableData }) {
  const rows: { label: string; value: string }[] = [
    { label: data.label, value: formatValue(data.value, data.unit) },
  ]
  if (data.target != null) rows.push({ label: 'Target', value: formatValue(data.target, data.unit) })
  if (data.historical && data.historical.length > 0) {
    rows.push({ label: 'History (oldest→newest)', value: data.historical.map(v => formatValue(v, data.unit)).join(' → ') })
  }
  if (data.breakdown && data.breakdown.length > 0) {
    data.breakdown.forEach(b => rows.push({ label: `  ${b.label}`, value: formatValue(b.value, data.unit) }))
  }
  if (data.confidence) rows.push({ label: 'Confidence', value: data.confidence })
  return (
    <div className="w-full">
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--av-border)] last:border-0">
              <td className="py-1 pr-3 text-[var(--av-text-secondary)] truncate max-w-[140px]">{r.label}</td>
              <td className="py-1 text-right font-medium text-[var(--av-text)]">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Number View (the big number)
// ---------------------------------------------------------------------------

function NumberView({ data }: { data: RepresentableData }) {
  const v = data.value
  const isInsufficient = data.confidence === 'insufficient'
  if (isInsufficient) {
    return <p className="text-xs text-[var(--av-text-muted)] leading-snug">Not enough data yet.</p>
  }
  return (
    <div className="text-2xl font-bold text-[var(--av-text)]">
      {formatValue(v, data.unit)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Representation Selector (the dropdown)
// ---------------------------------------------------------------------------

function RepresentationSelector({
  options,
  current,
  recommended,
  onSelect,
}: {
  options: RepresentationOption[]
  current: RepresentationType
  recommended: RepresentationType
  onSelect: (t: RepresentationType) => void
}) {
  const [open, setOpen] = useState(false)
  const available = options.filter(o => o.available)
  if (available.length <= 1) return null // nothing to switch between

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-[var(--av-text-muted)] hover:bg-[var(--av-surface)] hover:text-[var(--av-text-secondary)] transition-colors"
        title="Change how this data is shown"
      >
        {(() => { const Icon = options.find(o => o.type === current)?.icon || Hash; return <Icon size={11} /> })()}
        <ChevronDown size={10} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg bg-[var(--av-surface-elevated)] shadow-[var(--av-shadow-md)] border border-[var(--av-border)] py-1">
          {available.map(opt => {
            const Icon = opt.icon
            const isRec = opt.type === recommended
            const isCur = opt.type === current
            return (
              <button
                key={opt.type}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(opt.type); setOpen(false) }}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs hover:bg-[var(--av-surface)] transition-colors"
              >
                <span className="flex items-center gap-2 text-[var(--av-text-secondary)]">
                  <Icon size={12} />
                  {opt.label}
                </span>
                <span className="flex items-center gap-1">
                  {isRec && !isCur && <Info size={9} className="text-[var(--av-primary)]" />}
                  {isCur && <span className="text-[var(--av-primary)]">✓</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main: RepresentationEngine
// ---------------------------------------------------------------------------

export interface RepresentationEngineProps {
  data: RepresentableData
  /** Optional extra content rendered in the card footer (e.g. ClaimTag). */
  footer?: ReactNode
  /** Compact mode: smaller padding, no label row. */
  compact?: boolean
  className?: string
}

export function RepresentationEngine({ data, footer, compact, className }: RepresentationEngineProps) {
  const options = useMemo(() => buildOptions(data), [data])
  const recommended = useMemo(() => recommend(data), [data])
  const [current, setCurrent] = useState<RepresentationType>(() => {
    const prefs = loadPrefs()
    const saved = prefs[data.metricKey]
    // Only use saved pref if it's still available for this data
    if (saved && options.find(o => o.type === saved)?.available) return saved
    return recommended
  })

  useEffect(() => {
    // If the current representation is no longer available (data changed),
    // fall back to the recommendation.
    if (!options.find(o => o.type === current)?.available) {
      setCurrent(recommended)
    }
  }, [options, current, recommended])

  const handleSelect = (t: RepresentationType) => {
    setCurrent(t)
    savePref(data.metricKey, t)
  }

  const showSelector = options.filter(o => o.available).length > 1

  return (
    <div className={`rounded-2xl bg-[var(--av-surface-elevated)] ${compact ? 'p-3' : 'p-5'} shadow-[var(--av-shadow-sm)] hover:shadow-[var(--av-shadow-md)] transition-shadow ${className || ''}`}>
      {/* Header: label + selector */}
      {!compact && (
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-medium text-[var(--av-text-secondary)] truncate">{data.label}</span>
          {showSelector && (
            <RepresentationSelector
              options={options}
              current={current}
              recommended={recommended}
              onSelect={handleSelect}
            />
          )}
        </div>
      )}
      {compact && showSelector && (
        <div className="absolute top-2 right-2">
          <RepresentationSelector
            options={options}
            current={current}
            recommended={recommended}
            onSelect={handleSelect}
          />
        </div>
      )}

      {/* Body: the active representation */}
      <div className="min-h-[28px]">
        {current === 'number' && <NumberView data={data} />}
        {current === 'trend' && data.historical && (
          <div>
            <div className="text-xl font-bold text-[var(--av-text)] mb-1">
              {formatValue(data.value, data.unit)}
            </div>
            <Sparkline data={data.historical} />
          </div>
        )}
        {current === 'progress' && data.target != null && data.value != null && (
          <ProgressBar value={data.value} target={data.target} unit={data.unit} />
        )}
        {current === 'breakdown' && data.breakdown && (
          <BreakdownBars items={data.breakdown} unit={data.unit} />
        )}
        {current === 'table' && <TableView data={data} />}
      </div>

      {/* Footer */}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hook: useRepresentation (for pages that want to manage state externally)
// ---------------------------------------------------------------------------

export function useRepresentation(metricKey: string, data: RepresentableData) {
  const recommended = useMemo(() => recommend(data), [data])
  const options = useMemo(() => buildOptions(data), [data])
  const [type, setType] = useState<RepresentationType>(() => {
    const prefs = loadPrefs()
    const saved = prefs[metricKey]
    if (saved && options.find(o => o.type === saved)?.available) return saved
    return recommended
  })

  useEffect(() => {
    if (!options.find(o => o.type === type)?.available) setType(recommended)
  }, [options, type, recommended])

  const setTypePersisted = (t: RepresentationType) => {
    setType(t)
    savePref(metricKey, t)
  }

  return { type, setType: setTypePersisted, recommended, options }
}
