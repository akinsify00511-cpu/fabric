import { useState, useEffect } from 'react'
import {
  Clock, MapPin, CheckCircle, XCircle, Calendar,
  RefreshCw, User, Fingerprint, Wifi, WifiOff,
  AlertTriangle, Check, Camera
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface AttendanceRecord {
  id: string
  staff_id: string
  date: string
  check_in: string
  check_out: string
  work_hours: number
  status: string
  check_in_location: string
  check_in_within_geo_fence: boolean
  notes: string
}

interface AttendanceSummary {
  present_days: number
  absent_days: number
  late_days: number
  total_work_hours: number
  on_time_percentage: number
}

export default function AttendancePage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<AttendanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [locationStatus, setLocationStatus] = useState<'granted' | 'denied' | 'unavailable'>('unavailable')

  useEffect(() => {
    loadData()
    
    // Update current time every minute
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [staff?.business_id, staff?.id])

  useEffect(() => {
    // Check geolocation permission
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setLocationStatus('granted'),
        () => setLocationStatus('denied'),
        { timeout: 5000 }
      )
    } else {
      setLocationStatus('unavailable')
    }
  }, [])

  async function loadData() {
    if (!staff?.business_id || !staff?.id) return
    setLoading(true)

    try {
      const today = new Date().toISOString().split('T')[0]

      // Load today's record
      const { data: todayData } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('date', today)
        .single()

      setTodayRecord(todayData)

      // Load recent records
      const { data: recent } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('staff_id', staff.id)
        .order('date', { ascending: false })
        .limit(14)

      setRecords(recent || [])

      // Load summary
      const { data: summaryData } = await supabase
        .from('attendance_summary')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('month', new Date().getMonth() + 1)
        .eq('year', new Date().getFullYear())
        .single()

      if (summaryData) {
        setSummary(summaryData)
      } else {
        // Calculate summary from records
        const present = recent?.filter(r => ['present', 'late', 'half_day'].includes(r.status)).length || 0
        const absent = recent?.filter(r => r.status === 'absent').length || 0
        const late = recent?.filter(r => r.status === 'late').length || 0
        const totalHours = recent?.reduce((sum, r) => sum + (r.work_hours || 0), 0) || 0

        setSummary({
          present_days: present,
          absent_days: absent,
          late_days: late,
          total_work_hours: totalHours,
          on_time_percentage: present > 0 ? ((present - late) / present) * 100 : 100,
        })
      }
    } catch (e) {
      console.error('Failed to load attendance:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCheckIn() {
    if (!staff?.id || !staff?.business_id) return
    setChecking(true)

    try {
      let lat: number | null = null
      let lng: number | null = null
      let locationText = 'Unknown'

      // Try to get location
      if ('geolocation' in navigator) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
          })
          lat = position.coords.latitude
          lng = position.coords.longitude
          locationText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        } catch (e) {
          console.log('Could not get location')
        }
      }

      const now = new Date()
      const today = now.toISOString().split('T')[0]
      
      // Determine if late (after 9 AM)
      const hour = now.getHours()
      const isLate = hour >= 9

      await supabase.from('attendance_records').insert({
        staff_id: staff.id,
        business_id: staff.business_id,
        date: today,
        check_in: now.toISOString(),
        status: isLate ? 'late' : 'present',
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_location: locationText,
        check_in_within_geo_fence: false,
        check_in_device: navigator.userAgent,
      })

      loadData()
    } catch (e) {
      console.error('Failed to check in:', e)
    } finally {
      setChecking(false)
    }
  }

  async function handleCheckOut() {
    if (!todayRecord?.id) return
    setChecking(true)

    try {
      const now = new Date()
      
      await supabase.from('attendance_records').update({
        check_out: now.toISOString(),
        check_out_device: navigator.userAgent,
      }).eq('id', todayRecord.id)

      loadData()
    } catch (e) {
      console.error('Failed to check out:', e)
    } finally {
      setChecking(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const isLate = currentTime.getHours() >= 9
  const isWeekend = currentTime.getDay() === 0 || currentTime.getDay() === 6

  const statusConfig: Record<string, { bg: string; text: string; icon: any }> = {
    present: { bg: 'bg-green-100', text: 'text-green-600', icon: CheckCircle },
    late: { bg: 'bg-amber-100', text: 'text-amber-600', icon: Clock },
    absent: { bg: 'bg-red-100', text: 'text-red-600', icon: XCircle },
    half_day: { bg: 'bg-blue-100', text: 'text-blue-600', icon: Clock },
    on_leave: { bg: 'bg-purple-100', text: 'text-purple-600', icon: Calendar },
    holiday: { bg: 'bg-indigo-100', text: 'text-indigo-600', icon: Calendar },
    weekend: { bg: 'bg-gray-100', text: 'text-gray-600', icon: Calendar },
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <Fingerprint size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
            <p className="text-sm text-black/50">Track your work hours</p>
          </div>
        </div>
      </div>

      {/* Check In/Out Card */}
      <div className={`rounded-2xl border-2 p-6 mb-6 ${
        todayRecord 
          ? todayRecord.check_out 
            ? 'bg-gray-50 border-gray-200' 
            : 'bg-green-50 border-green-200' 
          : isWeekend 
            ? 'bg-purple-50 border-purple-200'
            : isLate 
              ? 'bg-amber-50 border-amber-200'
              : 'bg-blue-50 border-blue-200'
      }`}>
        <div className="text-center">
          <div className="text-4xl font-bold mb-2">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-black/50 mb-4">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>

          {isWeekend ? (
            <div className="p-4 bg-purple-100 rounded-xl text-purple-700">
              <Calendar size={24} className="mx-auto mb-2" />
              <p className="font-medium">Weekend - No attendance required</p>
            </div>
          ) : todayRecord ? (
            <div className="space-y-4">
              {todayRecord.check_in && (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <CheckCircle size={20} />
                  <span>Checked in at {new Date(todayRecord.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              {todayRecord.check_out ? (
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <Clock size={20} />
                  <span>Checked out at {new Date(todayRecord.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <Check size={20} />
                    <span>You're checked in!</span>
                  </div>
                  <button
                    onClick={handleCheckOut}
                    disabled={checking}
                    className="w-full max-w-xs mx-auto py-4 rounded-xl bg-red-500 text-white font-semibold text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {checking ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <>
                        <XCircle size={20} />
                        Check Out
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleCheckIn}
              disabled={checking}
              className="w-full max-w-xs mx-auto py-4 rounded-xl bg-green-500 text-white font-semibold text-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {checking ? (
                <RefreshCw size={20} className="animate-spin" />
              ) : (
                <>
                  <CheckCircle size={20} />
                  Check In
                </>
              )}
            </button>
          )}

          {locationStatus === 'granted' && (
            <div className="flex items-center justify-center gap-2 mt-4 text-xs text-black/40">
              <Wifi size={12} />
              <span>Location enabled</span>
            </div>
          )}
          {locationStatus === 'denied' && (
            <div className="flex items-center justify-center gap-2 mt-4 text-xs text-amber-600">
              <AlertTriangle size={12} />
              <span>Location unavailable - check manually</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="Present" 
          value={summary?.present_days || 0} 
          icon={<CheckCircle size={18} />} 
          color="bg-green-500" 
        />
        <StatCard 
          title="Late" 
          value={summary?.late_days || 0} 
          icon={<Clock size={18} />} 
          color="bg-amber-500" 
        />
        <StatCard 
          title="Absent" 
          value={summary?.absent_days || 0} 
          icon={<XCircle size={18} />} 
          color="bg-red-500" 
        />
        <StatCard 
          title="Hours" 
          value={`${(summary?.total_work_hours || 0).toFixed(1)}h`} 
          icon={<Clock size={18} />} 
          color="bg-blue-500" 
        />
      </div>

      {/* Recent Records */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="p-4 border-b border-black/[0.06]">
          <h2 className="font-semibold">Recent Attendance</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-black/40">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
            Loading...
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-black/40">
            <Calendar size={48} className="mx-auto mb-4 text-black/20" />
            <p>No attendance records yet</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {records.map(record => {
              const status = statusConfig[record.status] || statusConfig.present
              const StatusIcon = status.icon
              const isToday = record.date === today

              return (
                <div key={record.id} className={`p-4 ${isToday ? 'bg-blue-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${status.bg} ${status.text} flex items-center justify-center`}>
                        <StatusIcon size={18} />
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {new Date(record.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {isToday && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500 text-white">Today</span>}
                        </div>
                        <div className="text-sm text-black/50">
                          {record.check_in && (
                            <>In: {new Date(record.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                          )}
                          {record.check_out && (
                            <> • Out: {new Date(record.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                          )}
                          {record.work_hours && (
                            <> • {record.work_hours.toFixed(1)}h</>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${status.bg} ${status.text}`}>
                      {record.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-white mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-black/50">{title}</div>
    </div>
  )
}
