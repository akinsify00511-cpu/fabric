import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, LocateFixed, RefreshCw, ShieldCheck, Wifi, WifiOff, XCircle } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { enqueuePresenceAction, getPresenceQueue, presenceNetworkState, removePresenceAction } from '../lib/presenceQueue'
import { MotionButton, MotionCard, StatePulse } from '../components/OrganismMotion'

type AttendanceRecord = {
  id: string
  date: string
  check_in_at: string | null
  check_out_at: string | null
  work_hours: number | null
  status: string
  verification_status: string
  verification_reason: string | null
  check_in_distance_meters: number | null
  check_out_distance_meters: number | null
}

async function getPosition() {
  if (!navigator.geolocation) return null
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  })
}

function errorMessage(error: any) {
  const message = String(error?.message || '')
  if (message.includes('LOCATION_REQUIRED')) return 'Location is required for this business. Enable location and try again.'
  if (message.includes('OUTSIDE_GEOFENCE')) return 'You are outside the allowed work location.'
  if (message.includes('NOT_CLOCKED_IN')) return 'You do not have an active clock-in for today.'
  if (message.includes('STAFF_NOT_FOUND')) return 'Your staff profile could not be verified. Please sign in again.'
  return 'The action could not be completed. Nothing was silently discarded; try again or reconnect.'
}

export default function AttendancePage() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [today, setToday] = useState<AttendanceRecord | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [locationReady, setLocationReady] = useState(false)
  const [queued, setQueued] = useState(0)

  const load = useCallback(async () => {
    if (!staff?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id,date,check_in_at,check_out_at,work_hours,status,verification_status,verification_reason,check_in_distance_meters,check_out_distance_meters')
        .eq('staff_id', staff.id)
        .order('date', { ascending: false })
        .limit(31)
      if (error) throw error
      const rows = (data || []) as AttendanceRecord[]
      setRecords(rows)
      const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())
      setToday(rows.find(row => row.date === todayKey) || null)
    } catch (error) {
      console.error('attendance.load', error)
      showToast('Attendance could not be refreshed. Your existing records are unchanged.', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, staff?.id])

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return
    const items = getPresenceQueue()
    setQueued(items.length)
    for (const item of items) {
      try {
        if (item.kind === 'clock_in') {
          const { error } = await supabase.rpc('clock_in_staff', item.payload)
          if (error) throw error
        } else if (item.kind === 'clock_out') {
          const { error } = await supabase.rpc('clock_out_staff', item.payload)
          if (error) throw error
        }
        removePresenceAction(item.id)
      } catch (error: any) {
        const message = String(error?.message || '')
        if (message.includes('fetch') || message.includes('network') || message.includes('Failed to')) break
        removePresenceAction(item.id)
        showToast(errorMessage(error), 'error')
      }
    }
    setQueued(getPresenceQueue().length)
    await load()
  }, [load, showToast])

  useEffect(() => {
    void load()
    const onOnline = () => { setOnline(true); void syncQueue() }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    setQueued(getPresenceQueue().length)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [load, syncQueue])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(() => setLocationReady(true), () => setLocationReady(false), { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 })
  }, [])

  const perform = async (kind: 'clock_in' | 'clock_out') => {
    if (!staff?.id) return
    setBusy(true)
    const clientEventId = crypto.randomUUID()
    let position: GeolocationPosition | null = null
    try { position = await getPosition() } catch { /* server policy decides whether location is mandatory */ }
    const payload = {
      p_lat: position?.coords.latitude ?? null,
      p_lng: position?.coords.longitude ?? null,
      p_accuracy_meters: position?.coords.accuracy ?? null,
      p_device: navigator.userAgent.slice(0, 240),
      p_network_state: presenceNetworkState(),
      p_client_event_id: clientEventId,
    }

    if (!navigator.onLine) {
      enqueuePresenceAction({ kind, payload, id: clientEventId })
      setQueued(getPresenceQueue().length)
      showToast(`${kind === 'clock_in' ? 'Clock-in' : 'Clock-out'} saved offline. It will sync automatically when you reconnect.`, 'success')
      setBusy(false)
      return
    }

    try {
      const { data, error } = await supabase.rpc(kind === 'clock_in' ? 'clock_in_staff' : 'clock_out_staff', payload)
      if (error) throw error
      showToast(data?.verification_status === 'verified' ? 'Recorded and location verified.' : 'Recorded. Location evidence is not fully verified.', data?.verification_status === 'verified' ? 'success' : 'info')
      await load()
    } catch (error: any) {
      if (!navigator.onLine || String(error?.message || '').match(/fetch|network|Failed to/i)) {
        enqueuePresenceAction({ kind, payload, id: clientEventId })
        setQueued(getPresenceQueue().length)
        showToast('Network interrupted. The event is safely queued and will retry.', 'info')
      } else {
        showToast(errorMessage(error), 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const stats = useMemo(() => {
    const present = records.filter(r => ['present', 'late', 'half_day'].includes(r.status)).length
    const late = records.filter(r => r.status === 'late').length
    const hours = records.reduce((sum, r) => sum + Number(r.work_hours || 0), 0)
    const verified = records.filter(r => r.verification_status === 'verified').length
    return { present, late, hours, verified }
  }, [records])

  const checkedIn = Boolean(today?.check_in_at && !today?.check_out_at)

  return (
    <div className="max-w-5xl mx-auto pb-20 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-black/60 uppercase tracking-wider"><StatePulse active={checkedIn} /> Presence</div>
          <h1 className="text-3xl font-bold text-black mt-1">Attendance</h1>
          <p className="text-sm text-black/60 mt-1">Your attendance record is evidence-backed, auditable and resilient to network interruptions.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {online ? <><Wifi size={16} className="text-green-600" /> Online</> : <><WifiOff size={16} className="text-amber-600" /> Offline</>}
          {queued > 0 && <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800">{queued} pending sync</span>}
        </div>
      </div>

      <MotionCard className={`rounded-2xl border p-6 ${checkedIn ? 'border-green-200 bg-green-50' : 'border-black/10 bg-white'}`}>
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <p className="text-sm text-black/60">Today</p>
            <div className="text-4xl font-bold mt-1">{new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</div>
            <p className="text-sm text-black/60 mt-2">{new Intl.DateTimeFormat('en-NG', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p>
            <div className="flex flex-wrap gap-3 mt-4 text-xs">
              <span className="inline-flex items-center gap-1"><LocateFixed size={13} /> {locationReady ? 'Location available' : 'Location not verified'}</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> Server verified</span>
            </div>
          </div>
          <div className="min-w-[220px]">
            {!today?.check_in_at ? (
              <MotionButton onClick={() => void perform('clock_in')} disabled={busy} className="w-full py-4 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-50">
                {busy ? <RefreshCw className="mx-auto animate-spin" size={20} /> : 'Clock in'}
              </MotionButton>
            ) : !today.check_out_at ? (
              <MotionButton onClick={() => void perform('clock_out')} disabled={busy} className="w-full py-4 rounded-xl bg-black text-white font-semibold disabled:opacity-50">
                {busy ? <RefreshCw className="mx-auto animate-spin" size={20} /> : 'Clock out'}
              </MotionButton>
            ) : (
              <div className="rounded-xl bg-white border border-black/10 p-4 text-center"><CheckCircle2 className="mx-auto text-green-600 mb-2" size={24} /><p className="font-semibold">Day completed</p><p className="text-xs text-black/60 mt-1">{Number(today.work_hours || 0).toFixed(2)} hours</p></div>
            )}
          </div>
        </div>
        {today && (
          <div className="mt-5 pt-5 border-t border-black/10 grid sm:grid-cols-3 gap-4 text-sm">
            <Evidence label="Clock-in" value={today.check_in_at ? new Date(today.check_in_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—'} />
            <Evidence label="Verification" value={today.verification_status.replace('_', ' ')} />
            <Evidence label="Evidence" value={today.verification_reason || 'Recorded by authenticated staff'} />
          </div>
        )}
      </MotionCard>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric title="Present" value={stats.present} />
        <Metric title="Late" value={stats.late} />
        <Metric title="Hours" value={`${stats.hours.toFixed(1)}h`} />
        <Metric title="Verified" value={stats.verified} />
      </div>

      <MotionCard className="bg-white rounded-2xl border border-black/10 overflow-hidden">
        <div className="p-5 border-b border-black/10 flex items-center justify-between"><div><h2 className="font-semibold">Recent attendance</h2><p className="text-xs text-black/50 mt-1">Captured time and server verification are retained separately.</p></div><button onClick={() => void load()} className="p-2 rounded-lg hover:bg-black/5" aria-label="Refresh attendance"><RefreshCw size={16} /></button></div>
        {loading ? <div className="p-10 text-center"><RefreshCw className="mx-auto animate-spin" /></div> : records.length === 0 ? <div className="p-10 text-center text-black/50"><CalendarDays className="mx-auto mb-2" /><p>No attendance records yet.</p></div> : (
          <div className="divide-y divide-black/5">
            {records.map(record => (
              <div key={record.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div><p className="font-medium">{new Date(`${record.date}T00:00:00`).toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}</p><p className="text-xs text-black/60 mt-1">{record.check_in_at ? new Date(record.check_in_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'}) : '—'} → {record.check_out_at ? new Date(record.check_out_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'}) : 'Open'} · {Number(record.work_hours || 0).toFixed(2)}h</p></div>
                <div className="flex items-center gap-2 text-xs"><span className="px-2 py-1 rounded-full bg-black/5 capitalize">{record.status.replace('_',' ')}</span><span className={`px-2 py-1 rounded-full ${record.verification_status === 'verified' ? 'bg-green-100 text-green-700' : record.verification_status === 'outside_geofence' ? 'bg-amber-100 text-amber-800' : 'bg-black/5 text-black/60'}`}>{record.verification_status.replace('_',' ')}</span></div>
              </div>
            ))}
          </div>
        )}
      </MotionCard>

      {!locationReady && <div className="flex gap-3 items-start p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><p>Location evidence is currently unavailable. Avenize will not invent a location or silently mark it verified. Your business policy determines whether clock-in can continue without it.</p></div>}
    </div>
  )
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return <MotionCard className="bg-white rounded-xl border border-black/10 p-4"><p className="text-xs text-black/50">{title}</p><p className="text-2xl font-bold mt-1">{value}</p></MotionCard>
}

function Evidence({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-black/50">{label}</p><p className="font-medium capitalize mt-1">{value}</p></div>
}
