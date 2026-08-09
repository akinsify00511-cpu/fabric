import { useState, useEffect } from 'react'
import { MapPin, Users, Clock, Phone, MessageSquare, Navigation, Zap, AlertCircle, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

type FieldTeam = {
  id: string
  name: string
  role: string
  status: string
  location: string
  lat?: number
  lng?: number
  lastUpdate: string
  phone: string
}

type MapJob = {
  id: string
  title: string
  address: string
  status: string
  assignedTo: string
  time: string
}

export default function FieldLocation() {
  const { staff } = useAuth()
  const [activeTab, setActiveTab] = useState<'map' | 'team' | 'jobs'>('map')
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [fieldTeams, setFieldTeams] = useState<FieldTeam[]>([])
  const [jobsOnMap, setJobsOnMap] = useState<MapJob[]>([])

  useEffect(() => {
    if (!staff?.business_id) return
    const loadData = async () => {
      try {
        const { data: staffData } = await supabase
          .from('staff')
          .select('id, name, full_name, role, phone, location, status, last_active_at')
          .eq('business_id', staff.business_id)
        if (staffData) {
          const teams: FieldTeam[] = staffData.map((s: any) => ({
            id: s.id,
            name: s.full_name || s.name,
            role: s.role || 'Team Member',
            status: s.status || 'active',
            location: s.location || '—',
            lastUpdate: s.last_active_at
              ? `${Math.max(1, Math.floor((Date.now() - new Date(s.last_active_at).getTime()) / 60000))} min ago`
              : '—',
            phone: s.phone || '—',
          }))
          setFieldTeams(teams)
        }

        const { data: tasksData } = await supabase
          .from('tasks')
          .select('id, title, status, address, location, assignee:assignee_id(name, full_name), due_date')
          .eq('business_id', staff.business_id)
          .order('created_at', { ascending: false })
          .limit(10)
        if (tasksData) {
          const jobs: MapJob[] = tasksData.map((t: any) => ({
            id: t.id,
            title: t.title || 'Untitled task',
            address: t.address || t.location || '—',
            status: t.status || 'pending',
            assignedTo: t.assignee?.full_name || t.assignee?.name || 'Unassigned',
            time: t.due_date ? new Date(t.due_date).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—',
          }))
          setJobsOnMap(jobs)
        }
      } catch (err) {
        console.error('Failed to load field data:', err)
      }
    }
    loadData()
  }, [staff?.business_id])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'idle': return 'bg-amber-500'
      case 'on_route': return 'bg-blue-500'
      case 'offline': return 'bg-black'
      default: return 'bg-black'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'On Site'
      case 'idle': return 'Idle'
      case 'on_route': return 'En Route'
      case 'offline': return 'Offline'
      default: return status
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Field Location Tracking</h1>
          <p className="text-black">Track your field team in real-time</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-green-600">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Live tracking active</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'map', label: 'Map View', icon: MapPin },
          { id: 'team', label: 'Team Status', icon: Users },
          { id: 'jobs', label: 'Jobs on Map', icon: Zap },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id ? 'bg-[#4285F4] text-white' : 'bg-white text-black'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* MAP VIEW */}
      {activeTab === 'map' && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Map Placeholder */}
          <div className="lg:col-span-2 bg-gradient-to-br to-[#4285F4]/10 to-purple-100 rounded-2xl h-[500px] flex items-center justify-center relative overflow-hidden">
            {/* Grid pattern to simulate map */}
            <div className="absolute inset-0 opacity-20">
              <svg width="100%" height="100%">
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#6366f1" strokeWidth="0.5"/>
                </pattern>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
            
            {/* Simulated map content */}
            <div className="text-center z-10">
              <MapPin size={64} className="text-[#4285F4] mx-auto mb-4" />
              <h3 className="text-xl font-bold text-black mb-2">Interactive Map</h3>
              <p className="text-black mb-4">Live location of all field team members</p>
              <div className="flex flex-wrap justify-center gap-3">
                <span className="px-3 py-1 bg-white rounded-full text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Active: 3
                </span>
                <span className="px-3 py-1 bg-white rounded-full text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Idle: 1
                </span>
                <span className="px-3 py-1 bg-white rounded-full text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> En Route: 1
                </span>
              </div>
            </div>

            {/* Team markers on map */}
            {fieldTeams.map((member, index) => (
              <div
                key={member.id}
                className="absolute cursor-pointer group"
                style={{ left: `${20 + (index * 15)}%`, top: `${30 + (index * 10)}%` }}
                onClick={() => setSelectedTeam(member.id)}
              >
                <div className={`w-8 h-8 rounded-full ${getStatusColor(member.status)} border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-lg`}>
                  {member.name.charAt(0)}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-lg p-2 min-w-[150px] opacity-0 group-hover:opacity-100 transition z-20">
                  <p className="font-medium text-sm">{member.name}</p>
                  <p className="text-xs text-black">{member.role}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Team Sidebar */}
          <div className="bg-white rounded-xl border border-white overflow-hidden">
            <div className="p-4 border-b border-white">
              <h3 className="font-bold text-black">Field Team ({fieldTeams.length})</h3>
            </div>
            <div className="divide-y divide-white max-h-[400px] overflow-y-auto">
              {fieldTeams.map((member) => (
                <div
                  key={member.id}
                  className={`p-4 hover:bg-white cursor-pointer transition ${selectedTeam === member.id ? 'bg-[#4285F4]/5' : ''}`}
                  onClick={() => setSelectedTeam(member.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-[#4285F4]/10 flex items-center justify-center text-[#4285F4] font-bold">
                        {member.name.charAt(0)}
                      </div>
                      <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${getStatusColor(member.status)} border-2 border-white`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-black">{member.name}</p>
                      <p className="text-xs text-black">{member.role}</p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-black">
                        <Navigation size={10} />
                        <span>{member.location}</span>
                      </div>
                    </div>
                    <span className="text-xs text-black">{member.lastUpdate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TEAM STATUS VIEW */}
      {activeTab === 'team' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fieldTeams.length === 0 ? (
            <div className="col-span-full text-center py-12 text-[#5F6368]">
              No field team members yet. Add staff from the People page to see them here.
            </div>
          ) : fieldTeams.map((member) => (
            <div key={member.id} className="bg-white rounded-xl p-6 border border-white">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-[#4285F4]/10 flex items-center justify-center text-[#4285F4] font-bold text-lg">
                      {member.name.charAt(0)}
                    </div>
                    <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${getStatusColor(member.status)} border-2 border-white`} />
                  </div>
                  <div>
                    <p className="font-bold text-black">{member.name}</p>
                    <p className="text-sm text-black">{member.role}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  member.status === 'active' ? 'bg-green-100 text-green-700' :
                  member.status === 'idle' ? 'bg-amber-100 text-amber-700' :
                  member.status === 'on_route' ? 'bg-blue-100 text-blue-700' :
                  'bg-white text-black'
                }`}>
                  {getStatusText(member.status)}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-black">
                  <MapPin size={14} />
                  <span>{member.location}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-black">
                  <Clock size={14} />
                  <span>Last update: {member.lastUpdate}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-black">
                  <Phone size={14} />
                  <a href={`tel:${member.phone}`} className="text-[#4285F4] hover:underline">{member.phone}</a>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button className="flex-1 py-2 bg-[#4285F4]/5 text-[#4285F4] rounded-lg text-sm font-medium hover:bg-[#4285F4]/10 transition flex items-center justify-center gap-1">
                  <Navigation size={14} />
                  Track
                </button>
                <button className="flex-1 py-2 bg-[#4285F4] text-white rounded-lg text-sm font-medium hover:bg-[#4285F4] transition flex items-center justify-center gap-1">
                  <Phone size={14} />
                  Call
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* JOBS ON MAP */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          {jobsOnMap.length === 0 ? (
            <div className="text-center py-12 text-[#5F6368]">
              No field jobs yet. Assign tasks with locations to see them on the map.
            </div>
          ) : jobsOnMap.map((job) => (
            <div key={job.id} className="bg-white rounded-xl p-5 border border-white flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                job.status === 'completed' ? 'bg-green-100' :
                job.status === 'in_progress' ? 'bg-blue-100' :
                'bg-white'
              }`}>
                {job.status === 'completed' ? (
                  <CheckCircle size={24} className="text-green-600" />
                ) : job.status === 'in_progress' ? (
                  <Zap size={24} className="text-blue-600" />
                ) : (
                  <AlertCircle size={24} className="text-black" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-bold text-black">{job.title}</p>
                <p className="text-sm text-black">{job.address}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-black">
                  <span>Assigned to: {job.assignedTo}</span>
                  <span>|</span>
                  <span>{job.time}</span>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                job.status === 'completed' ? 'bg-green-100 text-green-700' :
                job.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                'bg-white text-black'
              }`}>
                {job.status === 'completed' ? 'Completed' :
                 job.status === 'in_progress' ? 'In Progress' : 'Pending'}
              </span>
              <button className="p-2 hover:bg-white rounded-lg transition">
                <Navigation size={20} className="text-black" />
              </button>
            </div>
          ))}

          <div className="bg-[#4285F4]/5 rounded-xl p-6 border border-[#4285F4]/10">
            <div className="flex items-center gap-3 mb-3">
              <Zap size={24} className="text-[#4285F4]" />
              <h3 className="font-bold text-black">Pro Tip</h3>
            </div>
            <p className="text-sm text-black">
              Your field team can share their live location directly from the Avenize mobile app. 
              When they start a job, their location is automatically tracked and visible here on the map.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
