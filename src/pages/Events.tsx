import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Calendar, Plus, Clock, MapPin, Users, Video, ChevronRight,
  Search, Filter, Grid3X3, List, ChevronLeft, User, Mail,
  CheckCircle2, XCircle, AlertCircle, ExternalLink
} from 'lucide-react'

type Event = {
  id: string
  title: string
  description: string
  start_date: string
  end_date: string
  location_type: 'physical' | 'virtual' | 'hybrid'
  location_name: string
  location_url: string
  max_capacity: number
  current_registrations: number
  requires_registration: boolean
  is_published: boolean
  is_cancelled: boolean
  cover_image_url: string
}

type Registration = {
  id: string
  full_name: string
  email: string
  status: string
  rsvp_status: string
  checked_in: boolean
  created_at: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Events() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<Event[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'registrations'>('upcoming')

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '17:00',
    locationType: 'physical' as 'physical' | 'virtual',
    locationName: '',
    locationUrl: '',
    maxCapacity: '',
    requiresRegistration: true,
    isPublished: false,
  })

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    setLoading(true)

    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('business_id', staff?.business_id)
      .order('start_date', { ascending: true })

    if (data) {
      setEvents(data as Event[])
    } else {
      // Demo data
      setEvents([
        {
          id: '1',
          title: 'Product Launch Webinar',
          description: 'Join us for the unveiling of our new product line',
          start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
          location_type: 'virtual',
          location_name: 'Zoom',
          location_url: 'https://zoom.us/j/123456',
          max_capacity: 100,
          current_registrations: 45,
          requires_registration: true,
          is_published: true,
          is_cancelled: false,
          cover_image_url: '',
        },
        {
          id: '2',
          title: 'Team Building Workshop',
          description: 'Interactive workshop for team collaboration',
          start_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
          location_type: 'physical',
          location_name: 'Downtown Conference Center',
          location_url: '',
          max_capacity: 50,
          current_registrations: 32,
          requires_registration: true,
          is_published: true,
          is_cancelled: false,
          cover_image_url: '',
        },
      ])
    }

    setLoading(false)
  }

  async function handleCreateEvent() {
    if (!formData.title || !formData.startDate) {
      showToast('Fill required fields', 'error')
      return
    }

    const startDateTime = `${formData.startDate}T${formData.startTime}:00`
    const endDateTime = `${formData.endDate || formData.startDate}T${formData.endTime}:00`

    const { error } = await supabase.from('events').insert({
      business_id: staff?.business_id,
      organizer_id: staff?.id,
      title: formData.title,
      description: formData.description,
      start_date: startDateTime,
      end_date: endDateTime,
      location_type: formData.locationType,
      location_name: formData.locationName,
      location_url: formData.locationUrl,
      max_capacity: formData.maxCapacity ? parseInt(formData.maxCapacity) : null,
      requires_registration: formData.requiresRegistration,
      is_published: formData.isPublished,
    })

    if (error) {
      showToast('Failed to create event', 'error')
    } else {
      showToast('Event created!', 'success')
      setShowCreateModal(false)
      setFormData({
        title: '', description: '', startDate: '', startTime: '09:00',
        endDate: '', endTime: '17:00', locationType: 'physical',
        locationName: '', locationUrl: '', maxCapacity: '',
        requiresRegistration: true, isPublished: false,
      })
      loadData()
    }
  }

  async function handleRegister(event: Event) {
    const { error } = await supabase.rpc('register_for_event', {
      p_event_id: event.id,
      p_email: 'user@example.com', // Would get from auth
      p_full_name: 'Demo User',
    })

    if (error) {
      showToast('Registration failed', 'error')
    } else {
      showToast('Registered successfully!', 'success')
      loadData()
    }
  }

  // Calendar logic
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []

    // Add empty slots for days before the first of the month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }

    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }

    return days
  }

  const days = getDaysInMonth(currentMonth)

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.start_date)
      return eventDate.toDateString() === date.toDateString()
    })
  }

  const filteredEvents = events.filter((event) => {
    const eventDate = new Date(event.start_date)
    const now = new Date()
    if (activeTab === 'upcoming') {
      return eventDate >= now && !event.is_cancelled
    } else {
      return eventDate < now || event.is_cancelled
    }
  })

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-gray-900">Events</h1>
          <p className="text-sm text-black/50 mt-0.5">Manage and promote your events</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
          >
            <Plus size={16} />
            New Event
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'past', label: 'Past' },
          { key: 'registrations', label: 'Registrations' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === tab.key ? 'avenize-gradient text-white' : 'border border-black/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Calendar View */}
      {activeTab !== 'registrations' && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-4 border-b border-black/[0.06]">
            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 hover:bg-black/[0.05] rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <h2 className="font-semibold">{MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h2>
            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 hover:bg-black/[0.05] rounded-lg">
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {DAYS.map((day) => (
              <div key={day} className="p-3 text-center text-sm font-medium text-black/50 border-b border-black/[0.06]">
                {day}
              </div>
            ))}
            {days.map((day, i) => {
              if (!day) {
                return <div key={i} className="min-h-24 border-b border-r border-black/[0.06]" />
              }
              const dayEvents = getEventsForDate(day)
              const isToday = day.toDateString() === new Date().toDateString()
              return (
                <div
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-24 p-2 border-b border-r border-black/[0.06] cursor-pointer hover:bg-black/[0.02] ${
                    isToday ? 'bg-indigo-50' : ''
                  }`}
                >
                  <div className={`text-sm font-medium mb-1 ${
                    isToday ? 'w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center' : ''
                  }`}>
                    {day.getDate()}
                  </div>
                  {dayEvents.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedEvent(event)
                        setShowEventModal(true)
                      }}
                      className="text-xs px-2 py-1 rounded bg-indigo-100 text-indigo-700 mb-1 truncate"
                    >
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-xs text-black/40">+{dayEvents.length - 2} more</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Events List (for past) */}
      {activeTab === 'past' && (
        <div className="space-y-4">
          {filteredEvents.map((event) => (
            <div key={event.id} className="bg-white rounded-2xl border border-black/[0.06] p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <Calendar size={24} className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">{event.title}</h3>
                    <p className="text-sm text-black/50 mt-1">{event.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-black/40">
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {new Date(event.start_date).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {event.location_name || event.location_type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {event.current_registrations}/{event.max_capacity || '∞'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Registrations Tab */}
      {activeTab === 'registrations' && (
        <div className="bg-white rounded-2xl border border-black/[0.06]">
          <div className="p-4 border-b border-black/[0.06]">
            <div className="flex items-center gap-4">
              <Search className="text-black/30" size={16} />
              <input
                placeholder="Search registrations..."
                className="flex-1 outline-none"
              />
            </div>
          </div>
          <div className="divide-y divide-black/[0.06]">
            {[
              { name: 'Sarah Johnson', email: 'sarah@company.com', event: 'Product Launch Webinar', status: 'registered', rsvp: 'yes' },
              { name: 'Michael Chen', email: 'michael@startup.io', event: 'Product Launch Webinar', status: 'attended', rsvp: 'yes' },
              { name: 'Emily Davis', email: 'emily@agency.com', event: 'Team Building Workshop', status: 'registered', rsvp: 'maybe' },
            ].map((reg, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <User size={18} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium">{reg.name}</p>
                    <p className="text-sm text-black/50">{reg.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm">{reg.event}</p>
                  <div className="flex items-center gap-2 justify-end mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      reg.status === 'attended' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {reg.status}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      reg.rsvp === 'yes' ? 'bg-green-100 text-green-700' : reg.rsvp === 'no' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      RSVP: {reg.rsvp}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-black/[0.06]">
              <h2 className="font-semibold">Create New Event</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Event Title *</label>
                <input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Annual Conference 2024"
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What's this event about?"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">End Time</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Location Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'physical', label: 'In-Person', icon: MapPin },
                    { value: 'virtual', label: 'Virtual', icon: Video },
                    { value: 'hybrid', label: 'Hybrid', icon: Users },
                  ].map((opt) => {
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setFormData({ ...formData, locationType: opt.value as any })}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-1 ${
                          formData.locationType === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-black/10'
                        }`}
                      >
                        <Icon size={18} />
                        <span className="text-xs">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Location</label>
                <input
                  value={formData.locationName}
                  onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
                  placeholder={formData.locationType === 'virtual' ? 'Zoom/Meet link' : 'Venue name'}
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Max Capacity</label>
                  <input
                    type="number"
                    value={formData.maxCapacity}
                    onChange={(e) => setFormData({ ...formData, maxCapacity: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.requiresRegistration}
                  onChange={(e) => setFormData({ ...formData, requiresRegistration: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Require registration</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isPublished}
                  onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Publish immediately</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg border border-black/10">
                Cancel
              </button>
              <button onClick={handleCreateEvent} className="px-4 py-2 rounded-lg avenize-gradient text-white font-medium">
                Create Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {showEventModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="p-6 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">{selectedEvent.title}</h2>
              <button onClick={() => setShowEventModal(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-black/60">{selectedEvent.description}</p>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-black/40">Date</p>
                  <p className="font-medium">{new Date(selectedEvent.start_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-black/40">Time</p>
                  <p className="font-medium">
                    {new Date(selectedEvent.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div>
                  <p className="text-black/40">Location</p>
                  <p className="font-medium">{selectedEvent.location_name || selectedEvent.location_type}</p>
                </div>
                <div>
                  <p className="text-black/40">Capacity</p>
                  <p className="font-medium">{selectedEvent.current_registrations}/{selectedEvent.max_capacity || '∞'}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleRegister(selectedEvent)}
                  className="flex-1 py-2 rounded-lg avenize-gradient text-white font-medium"
                >
                  Register
                </button>
                {selectedEvent.location_url && (
                  <a
                    href={selectedEvent.location_url}
                    target="_blank"
                    className="px-4 py-2 rounded-lg border border-black/10 flex items-center gap-2"
                  >
                    <ExternalLink size={16} />
                    Join
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
