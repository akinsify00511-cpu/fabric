import { useState, useEffect, useCallback } from 'react'
import {
  Clock, Gavel, ListChecks, CheckCircle2, AlertTriangle,
  Loader2, Users, TrendingUp, Calendar,
} from 'lucide-react'
import { fetchMeetingAnalytics, type MeetingAnalytics } from '../lib/businessOS'

const BRAND = {
  primary: '#155BB4',
  primarySoft: 'rgba(21, 91, 180, 0.08)',
  surface: '#FFFFFF',
  surface2: '#F8F9FA',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: '#157342',
  danger: '#EA4335',
  warning: '#B45309',
}

export default function MeetingAnalyticsView() {
  const [analytics, setAnalytics] = useState<MeetingAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchMeetingAnalytics(period)
    setAnalytics(data)
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F9FA' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: BRAND.primary }} />
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F9FA' }}>
        <div className="text-center">
          <TrendingUp size={48} className="mx-auto mb-3" style={{ color: BRAND.textMuted }} />
          <p className="text-sm" style={{ color: BRAND.textSecondary }}>
            Meeting analytics not available yet.
          </p>
          <p className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
            This feature requires the analytics migration to be deployed.
          </p>
        </div>
      </div>
    )
  }

  const t = analytics.totals
  const periods = [7, 30, 90]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F9FA' }}>
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: BRAND.text }}>
              Meeting Analytics
            </h1>
            <p className="text-sm" style={{ color: BRAND.textSecondary }}>
              Productivity intelligence across all your meetings.
            </p>
          </div>
          <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: BRAND.surface2 }}>
            {periods.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition"
                style={{
                  backgroundColor: period === p ? BRAND.surface : 'transparent',
                  color: period === p ? BRAND.primary : BRAND.textSecondary,
                  boxShadow: period === p ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                }}
              >
                {p}d
              </button>
            ))}
          </div>
        </div>

        {/* Small data note */}
        {analytics.small_data_note && (
          <div className="mb-4 p-3 rounded-lg flex items-start gap-2" style={{ backgroundColor: 'rgba(180,83,9,0.08)', color: BRAND.warning }}>
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <p className="text-xs">{analytics.small_data_note}</p>
          </div>
        )}

        {/* Totals grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard icon={Calendar} label="Meetings" value={t.total_meetings} color={BRAND.primary} />
          <StatCard icon={Clock} label="Total hours" value={t.total_hours.toFixed(1)} color={BRAND.textSecondary} />
          <StatCard icon={Gavel} label="Decisions" value={t.total_decisions} color={BRAND.success} />
          <StatCard icon={ListChecks} label="Actions" value={t.total_actions} color={BRAND.warning} />
          <StatCard
            icon={CheckCircle2}
            label="Completion"
            value={analytics.action_completion_pct !== null ? `${analytics.action_completion_pct}%` : '—'}
            color={analytics.action_completion_pct !== null && analytics.action_completion_pct >= 70 ? BRAND.success : BRAND.warning}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Meeting waste */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: BRAND.text }}>
              <AlertTriangle size={18} style={{ color: BRAND.warning }} />
              Meetings without outcomes ({analytics.wasted_meetings_count})
            </h2>
            <p className="text-xs mb-4" style={{ color: BRAND.textMuted }}>
              Meetings that produced no decisions AND no action items — potential time waste.
            </p>
            {analytics.wasted_meetings.length > 0 ? (
              <div className="space-y-2">
                {analytics.wasted_meetings.map(m => (
                  <div key={m.meeting_id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: BRAND.surface2 }}>
                    <span className="text-sm truncate" style={{ color: BRAND.text }}>{m.title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {m.duration_hours !== null && (
                        <span className="text-xs" style={{ color: BRAND.textMuted }}>{m.duration_hours.toFixed(1)}h</span>
                      )}
                      <span className="text-xs" style={{ color: BRAND.textMuted }}>
                        {new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: BRAND.textMuted }}>
                No wasted meetings in this period. Every meeting produced decisions or actions.
              </p>
            )}
          </div>

          {/* Per-staff load */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: BRAND.text }}>
              <Users size={18} style={{ color: BRAND.primary }} />
              Meeting load by person
            </h2>
            {analytics.per_staff.length > 0 ? (
              <div className="space-y-2">
                {analytics.per_staff.map(s => {
                  const total = s.meetings_created + s.meetings_attended
                  const maxTotal = Math.max(...analytics.per_staff.map(x => x.meetings_created + x.meetings_attended), 1)
                  return (
                    <div key={s.staff_id} className="p-3 rounded-lg" style={{ backgroundColor: BRAND.surface2 }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium" style={{ color: BRAND.text }}>{s.staff_name}</span>
                        <span className="text-xs" style={{ color: BRAND.textMuted }}>{total} total</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: BRAND.border }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(total / maxTotal) * 100}%`,
                            backgroundColor: BRAND.primary,
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs" style={{ color: BRAND.textMuted }}>
                        <span>{s.meetings_created} created</span>
                        <span>{s.meetings_attended} attended</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm" style={{ color: BRAND.textMuted }}>
                No staff meeting data in this period.
              </p>
            )}
          </div>
        </div>

        {/* Per-status breakdown */}
        <div className="mt-6 rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: BRAND.text }}>
            Meetings by status
          </h2>
          <div className="flex flex-wrap gap-2">
            {analytics.per_status.map(s => (
              <div
                key={s.status}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: BRAND.surface2, color: BRAND.textSecondary }}
              >
                <span style={{ color: BRAND.text }}>{s.count}</span> {s.status}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Clock; label: string; value: string | number; color: string
}) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
      <Icon size={18} style={{ color }} />
      <div className="text-2xl font-bold mt-2" style={{ color: BRAND.text }}>{value}</div>
      <div className="text-xs" style={{ color: BRAND.textMuted }}>{label}</div>
    </div>
  )
}
