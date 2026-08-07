import { useState } from 'react'
import { MapPin, Users, Clock, Phone, MessageSquare, Navigation, Zap, AlertCircle, CheckCircle } from 'lucide-react'

// Demo field team data
const FIELD_TEAMS = [
  { id: 1, name: 'Chinedu Okafor', role: 'Field Engineer', status: 'active', location: 'Victoria Island, Lagos', lat: 6.4281, lng: 3.4219, lastUpdate: '2 min ago', phone: '+234 801 234 5678' },
  { id: 2, name: 'Amina Bello', role: 'Sales Rep', status: 'active', location: 'Ikeja, Lagos', lat: 6.6059, lng: 3.3499, lastUpdate: '5 min ago', phone: '+234 802 345 6789' },
  { id: 3, name: 'Emeka Nwosu', role: 'Project Manager', status: 'active', location: 'Lekki, Lagos', lat: 6.4312, lng: 3.4551, lastUpdate: '1 min ago', phone: '+234 803 456 7890' },
  { id: 4, name: 'Fatima Ahmed', role: 'Field Technician', status: 'idle', location: 'Surulere, Lagos', lat: 6.4969, lng: 3.3441, lastUpdate: '15 min ago', phone: '+234 804 567 8901' },
  { id: 5, name: 'Olumide Adeyemi', role: 'Delivery Agent', status: 'on_route', location: 'Yaba, Lagos', lat: 6.5014, lng: 3.3633, lastUpdate: '3 min ago', phone: '+234 805 678 9012' },
]

const JOBS_ON_MAP = [
  { id: 1, title: 'Site Inspection - Alhaji Motors', address: '15 Admiralty Way, Lekki', status: 'pending', assignedTo: 'Chinedu Okafor', time: '10:00 AM' },
  { id: 2, title: 'Installation - TechStart Office', address: '24 Broad Street, Lagos Island', status: 'in_progress', assignedTo: 'Emeka Nwosu', time: '11:30 AM' },
  { id: 3, title: 'Maintenance - EduFirst School', address: '8 Adeyemo Alakija, Victoria Island', status: 'completed', assignedTo: 'Fatima Ahmed', time: '9:00 AM' },
]

export default function FieldLocation() {
  const [activeTab, setActiveTab] = useState<'map' | 'team' | 'jobs'>('map')
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'idle': return 'bg-amber-500'
      case 'on_route': return 'bg-blue-500'
      case 'offline': return 'bg-gray-400'
      default: return 'bg-gray-400'
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
          <h1 className="text-2xl font-bold text-gray-900">Field Location Tracking</h1>
          <p className="text-gray-900">Track your field team in real-time</p>
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
                activeTab === tab.id ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-900'
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
          <div className="lg:col-span-2 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl h-[500px] flex items-center justify-center relative overflow-hidden">
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
              <MapPin size={64} className="text-indigo-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Interactive Map</h3>
              <p className="text-gray-900 mb-4">Live location of all field team members</p>
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
            {FIELD_TEAMS.map((member) => (
              <div
                key={member.id}
                className="absolute cursor-pointer group"
                style={{ left: `${20 + (member.id * 15)}%`, top: `${30 + (member.id * 10)}%` }}
                onClick={() => setSelectedTeam(member.id)}
              >
                <div className={`w-8 h-8 rounded-full ${getStatusColor(member.status)} border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-lg`}>
                  {member.name.charAt(0)}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-lg p-2 min-w-[150px] opacity-0 group-hover:opacity-100 transition z-20">
                  <p className="font-medium text-sm">{member.name}</p>
                  <p className="text-xs text-gray-900">{member.role}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Team Sidebar */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Field Team ({FIELD_TEAMS.length})</h3>
            </div>
            <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {FIELD_TEAMS.map((member) => (
                <div
                  key={member.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition ${selectedTeam === member.id ? 'bg-indigo-50' : ''}`}
                  onClick={() => setSelectedTeam(member.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                        {member.name.charAt(0)}
                      </div>
                      <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${getStatusColor(member.status)} border-2 border-white`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-900">{member.role}</p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-900">
                        <Navigation size={10} />
                        <span>{member.location}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-900">{member.lastUpdate}</span>
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
          {FIELD_TEAMS.map((member) => (
            <div key={member.id} className="bg-white rounded-xl p-6 border border-gray-100">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                      {member.name.charAt(0)}
                    </div>
                    <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${getStatusColor(member.status)} border-2 border-white`} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{member.name}</p>
                    <p className="text-sm text-gray-900">{member.role}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  member.status === 'active' ? 'bg-green-100 text-green-700' :
                  member.status === 'idle' ? 'bg-amber-100 text-amber-700' :
                  member.status === 'on_route' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-900'
                }`}>
                  {getStatusText(member.status)}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-900">
                  <MapPin size={14} />
                  <span>{member.location}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-900">
                  <Clock size={14} />
                  <span>Last update: {member.lastUpdate}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-900">
                  <Phone size={14} />
                  <a href={`tel:${member.phone}`} className="text-indigo-600 hover:underline">{member.phone}</a>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button className="flex-1 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition flex items-center justify-center gap-1">
                  <Navigation size={14} />
                  Track
                </button>
                <button className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition flex items-center justify-center gap-1">
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
          {JOBS_ON_MAP.map((job) => (
            <div key={job.id} className="bg-white rounded-xl p-5 border border-gray-100 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                job.status === 'completed' ? 'bg-green-100' :
                job.status === 'in_progress' ? 'bg-blue-100' :
                'bg-gray-100'
              }`}>
                {job.status === 'completed' ? (
                  <CheckCircle size={24} className="text-green-600" />
                ) : job.status === 'in_progress' ? (
                  <Zap size={24} className="text-blue-600" />
                ) : (
                  <AlertCircle size={24} className="text-gray-900" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900">{job.title}</p>
                <p className="text-sm text-gray-900">{job.address}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-900">
                  <span>Assigned to: {job.assignedTo}</span>
                  <span>|</span>
                  <span>{job.time}</span>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                job.status === 'completed' ? 'bg-green-100 text-green-700' :
                job.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-900'
              }`}>
                {job.status === 'completed' ? 'Completed' :
                 job.status === 'in_progress' ? 'In Progress' : 'Pending'}
              </span>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                <Navigation size={20} className="text-gray-900" />
              </button>
            </div>
          ))}

          <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
            <div className="flex items-center gap-3 mb-3">
              <Zap size={24} className="text-indigo-600" />
              <h3 className="font-bold text-gray-900">Pro Tip</h3>
            </div>
            <p className="text-sm text-gray-900">
              Your field team can share their live location directly from the Avenize mobile app. 
              When they start a job, their location is automatically tracked and visible here on the map.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
