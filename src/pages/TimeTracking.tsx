import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Clock, Play, Square, Plus, Calendar, ChevronLeft, ChevronRight,
  CheckCircle2, Coffee, Plane, Heart, User, Trash2, Edit3,
  Timer, TrendingUp, Target, AlertCircle
} from 'lucide-react'

type TimeEntry = {
  id: string
  description: string | null
  start_time: string
  end_time: string | null
  duration_minutes: number | null
  billable: boolean
  tags: string[]
  task?: { title: string }
  project?: { name: string }
}

type DailySummary = {
  date: string
  total_minutes: number
  billable_minutes: number
  non_billable_minutes: number
  target_minutes: number
  goal_met: boolean
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LEAVE_TYPES = [
  { value: 'vacation', label: 'Vacation', icon: Plane, color: 'bg-blue-100 text-blue-600' },
  { value: 'sick', label: 'Sick Leave', icon: Heart, color: 'bg-red-100 text-red-600' },
  { value: 'personal', label: 'Personal', icon: User, color: 'bg-purple-100 text-purple-600' },
  { value: 'unpaid', label: 'Unpaid', icon: Clock, color: 'bg-gray-100 text-gray-600' },
]

export default function TimeTracking() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [summaries, setSummaries] = useState<DailySummary[]>([])
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [showManualModal, setShowManualModal] = useState(false)
  const [showTimeOffModal, setShowTimeOffModal] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)

  // Manual entry form
  const [manualForm, setManualForm] = useState({
    description: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    billable: true,
  })

  // Time off form
  const [timeOffForm, setTimeOffForm] = useState({
    leaveType: 'vacation',
    startDate: '',
    endDate: '',
    reason: '',
  })

  function getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  }

  function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  async function loadData() {
    setLoading(true)

    // Check for active entry
    const { data: active } = await supabase.rpc('get_active_time_entry')
    if (active && active.length > 0) {
      setActiveEntry(active[0] as TimeEntry)
      const start = new Date(active[0].start_time).getTime()
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }

    // Load entries for the week
    const startDate = weekStart.toISOString().split('T')[0]
    const endDate = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: entriesData } = await supabase
      .from('time_entries')
      .select('*, task:tasks(title), project:projects(name)')
      .eq('staff_id', staff?.id)
      .gte('start_time', startDate)
      .lte('start_time', endDate)
      .order('start_time', { ascending: false })

    setEntries((entriesData as any[]) ?? [])

    // Load daily summaries
    const { data: summaryData } = await supabase
      .from('daily_time_summaries')
      .select('*')
      .eq('staff_id', staff?.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    setSummaries((summaryData as DailySummary[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [staff?.id, weekStart])

  // Timer effect
  useEffect(() => {
    if (!activeEntry) return
    const interval = setInterval(() => {
      const start = new Date(activeEntry.start_time).getTime()
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [activeEntry])

  async function handleStart() {
    setSaving(true)
    const { data, error } = await supabase.rpc('start_time_tracking', {
      p_description: 'Working...',
    })
    if (error) {
      showToast('Failed to start', 'error')
    } else {
      showToast('Timer started!', 'success')
      loadData()
    }
    setSaving(false)
  }

  async function handleStop() {
    setSaving(true)
    const { error } = await supabase.rpc('stop_time_tracking')
    if (error) {
      showToast('Failed to stop', 'error')
    } else {
      showToast(`Logged ${Math.floor(elapsed / 60)} minutes`, 'success')
      setActiveEntry(null)
      setElapsed(0)
      loadData()
    }
    setSaving(false)
  }

  async function handleAddManual() {
    setSaving(true)
    const startTime = `${manualForm.date}T${manualForm.startTime}:00`
    const endTime = `${manualForm.date}T${manualForm.endTime}:00`

    const { error } = await supabase.rpc('add_manual_time_entry', {
      p_description: manualForm.description,
      p_start_time: startTime,
      p_end_time: endTime,
      p_billable: manualForm.billable,
    })

    if (error) {
      showToast('Failed to add entry', 'error')
    } else {
      showToast('Time entry added!', 'success')
      setShowManualModal(false)
      loadData()
    }
    setSaving(false)
  }

  async function handleRequestTimeOff() {
    if (!timeOffForm.startDate || !timeOffForm.endDate) {
      showToast('Select dates', 'error')
      return
    }

    setSaving(true)
    const { error } = await supabase.rpc('request_time_off', {
      p_leave_type: timeOffForm.leaveType,
      p_start_date: timeOffForm.startDate,
      p_end_date: timeOffForm.endDate,
      p_reason: timeOffForm.reason || null,
    })

    if (error) {
      showToast('Failed to request', 'error')
    } else {
      showToast('Time off requested!', 'success')
      setShowTimeOffModal(false)
      setTimeOffForm({ leaveType: 'vacation', startDate: '', endDate: '', reason: '' })
    }
    setSaving(false)
  }

  async function deleteEntry(entry: TimeEntry) {
    if (!confirm('Delete this time entry?')) return
    await supabase.from('time_entries').delete().eq('id', entry.id)
    showToast('Entry deleted', 'info')
    loadData()
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000)
    const summary = summaries.find((s) => s.date === date.toISOString().split('T')[0])
    return { date, summary, isToday: date.toDateString() === new Date().toDateString() }
  })

  const weekTotal = summaries.reduce((sum, s) => sum + s.total_minutes, 0)

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Time Tracking</h1>
          <p className="text-sm text-black/50 mt-0.5">Track your work hours and request time off</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-black/10 text-sm"
          >
            <Plus size={14} />
            Manual
          </button>
          <button
            onClick={() => setShowTimeOffModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-black/10 text-sm"
          >
            <Calendar size={14} />
            Time Off
          </button>
        </div>
      </div>

      {/* Timer Card */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <div className="text-center">
          <div className="text-5xl font-mono font-bold text-[var(--avenize-black)] mb-4">
            {formatElapsed(elapsed)}
          </div>
          <div className="flex justify-center gap-3">
            {activeEntry ? (
              <button
                onClick={handleStop}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500 text-white font-medium disabled:opacity-50"
              >
                <Square size={18} />
                Stop
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 rounded-xl avenize-gradient text-white font-medium disabled:opacity-50"
              >
                <Play size={18} />
                Start Timer
              </button>
            )}
          </div>
          {activeEntry && (
            <p className="text-sm text-black/50 mt-3">
              {activeEntry.description || 'Tracking time...'}
            </p>
          )}
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000))}
          className="p-2 rounded-lg hover:bg-black/[0.05]"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="font-medium">
          {weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} -{' '}
          {new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </h2>
        <button
          onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000))}
          className="p-2 rounded-lg hover:bg-black/[0.05]"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Week Overview */}
      <div className="grid grid-cols-7 gap-2 mb-6">
        {weekDays.map(({ date, summary, isToday }) => (
          <div
            key={date.toISOString()}
            className={`p-3 rounded-xl text-center ${
              isToday ? 'avenize-gradient text-white' : 'bg-white border border-black/[0.06]'
            }`}
          >
            <p className={`text-xs ${isToday ? 'text-white/80' : 'text-black/40'}`}>
              {WEEKDAYS[date.getDay()]}
            </p>
            <p className="text-lg font-bold">{date.getDate()}</p>
            <p className={`text-xs ${isToday ? 'text-white/80' : 'text-black/50'}`}>
              {summary ? `${Math.round(summary.total_minutes / 60)}h` : '—'}
            </p>
            {summary?.goal_met && (
              <CheckCircle2 size={14} className={`mx-auto mt-1 ${isToday ? 'text-white' : 'text-green-500'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Week Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 text-black/50 mb-1">
            <Clock size={16} />
            <span className="text-xs">Total Hours</span>
          </div>
          <p className="text-2xl font-bold">{(weekTotal / 60).toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 text-black/50 mb-1">
            <Target size={16} />
            <span className="text-xs">Target</span>
          </div>
          <p className="text-2xl font-bold">40h</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 text-black/50 mb-1">
            <TrendingUp size={16} />
            <span className="text-xs">Progress</span>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {Math.round((weekTotal / (40 * 60)) * 100)}%
          </p>
        </div>
      </div>

      {/* Today's Entries */}
      <h3 className="font-medium mb-3">This Week's Entries</h3>
      <div className="space-y-2">
        {entries.length === 0 ? (
          <div className="bg-white rounded-xl border border-black/[0.06] p-6 text-center">
            <Clock className="w-10 h-10 mx-auto text-black/20 mb-2" />
            <p className="text-black/50">No time entries this week</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="bg-white rounded-xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Clock size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">{entry.description || 'No description'}</p>
                    <p className="text-sm text-black/50">
                      {new Date(entry.start_time).toLocaleDateString()} •{' '}
                      {new Date(entry.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {entry.end_time ? new Date(entry.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {entry.duration_minutes ? `${Math.round(entry.duration_minutes / 60 * 10) / 10}h` : 'Active'}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    entry.billable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {entry.billable ? 'Billable' : 'Non-billable'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Manual Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="font-semibold">Add Manual Entry</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Description</label>
                <input
                  value={manualForm.description}
                  onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  placeholder="What did you work on?"
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Date</label>
                <input
                  type="date"
                  value={manualForm.date}
                  onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={manualForm.startTime}
                    onChange={(e) => setManualForm({ ...manualForm, startTime: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">End Time</label>
                  <input
                    type="time"
                    value={manualForm.endTime}
                    onChange={(e) => setManualForm({ ...manualForm, endTime: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualForm.billable}
                  onChange={(e) => setManualForm({ ...manualForm, billable: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Billable hours</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-2">
              <button onClick={() => setShowManualModal(false)} className="px-4 py-2 rounded-lg border border-black/10">
                Cancel
              </button>
              <button onClick={handleAddManual} disabled={saving} className="px-4 py-2 rounded-lg avenize-gradient text-white font-medium disabled:opacity-50">
                {saving ? 'Adding...' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time Off Modal */}
      {showTimeOffModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="font-semibold">Request Time Off</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Leave Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {LEAVE_TYPES.map((type) => {
                    const Icon = type.icon
                    return (
                      <button
                        key={type.value}
                        onClick={() => setTimeOffForm({ ...timeOffForm, leaveType: type.value })}
                        className={`p-3 rounded-xl border text-left ${
                          timeOffForm.leaveType === type.value
                            ? `${type.color} border-transparent`
                            : 'border-black/10'
                        }`}
                      >
                        <Icon size={18} className="mb-1" />
                        <p className="text-sm font-medium">{type.label}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={timeOffForm.startDate}
                    onChange={(e) => setTimeOffForm({ ...timeOffForm, startDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">End Date</label>
                  <input
                    type="date"
                    value={timeOffForm.endDate}
                    onChange={(e) => setTimeOffForm({ ...timeOffForm, endDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Reason (optional)</label>
                <textarea
                  value={timeOffForm.reason}
                  onChange={(e) => setTimeOffForm({ ...timeOffForm, reason: e.target.value })}
                  placeholder="Any additional details..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-2">
              <button onClick={() => setShowTimeOffModal(false)} className="px-4 py-2 rounded-lg border border-black/10">
                Cancel
              </button>
              <button onClick={handleRequestTimeOff} disabled={saving} className="px-4 py-2 rounded-lg avenize-gradient text-white font-medium disabled:opacity-50">
                {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
