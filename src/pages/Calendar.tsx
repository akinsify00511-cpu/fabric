import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import FeatureSuggestions from '../components/FeatureSuggestions'
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock,
  MapPin, Users, X, Check, Trash2, Edit3
} from 'lucide-react'

type Event = {
  id: string
  title: string
  description: string | null
  event_type: 'event' | 'meeting' | 'deadline' | 'reminder'
  start_time: string
  end_time: string | null
  all_day: boolean
  location: string | null
  status: string
  organizer_name: string | null
}

type StaffMember = {
  id: string
  full_name: string | null
  name: string
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const EVENT_COLORS = {
  event: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-700' },
  meeting: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-700' },
  deadline: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-700' },
  reminder: { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-700' },
}

// Demo events
const DEMO_EVENTS: Event[] = [
  { id: 'ev-1', title: 'Team Standup', description: 'Daily sync meeting', event_type: 'meeting', start_time: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(), end_time: new Date(new Date().setHours(9, 30, 0, 0)).toISOString(), all_day: false, location: 'Conference Room A', status: 'confirmed', organizer_name: 'Sarah Johnson' },
  { id: 'ev-2', title: 'Q4 Planning', description: 'Quarterly review session', event_type: 'meeting', start_time: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(), end_time: new Date(new Date().setHours(16, 0, 0, 0)).toISOString(), all_day: false, location: 'Board Room', status: 'confirmed', organizer_name: 'Michael Okonkwo' },
  { id: 'ev-3', title: 'Project Deadline', description: 'Client deliverable due', event_type: 'deadline', start_time: new Date(new Date().setHours(17, 0, 0, 0)).toISOString(), end_time: null, all_day: true, location: null, status: 'pending', organizer_name: 'You' },
  { id: 'ev-4', title: 'Client Call', description: 'Follow up on proposal', event_type: 'meeting', start_time: new Date(new Date().setHours(11, 0, 0, 0)).toISOString(), end_time: new Date(new Date().setHours(11, 30, 0, 0)).toISOString(), all_day: false, location: 'Zoom', status: 'confirmed', organizer_name: 'Aisha Bello' },
]

const DEMO_STAFF: StaffMember[] = [
  { id: 'staff-1', full_name: 'Sarah Johnson', name: 'Sarah Johnson' },
  { id: 'staff-2', full_name: 'Michael Okonkwo', name: 'Michael Okonkwo' },
  { id: 'staff-3', full_name: 'Aisha Bello', name: 'Aisha Bello' },
]

export default function Calendar() {
  const { staff, isDemo } = useAuth()
  const { showToast } = useToast()
  const [events, setEvents] = useState<Event[]>([])
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')
  const [showEventModal, setShowEventModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

  // New event form
  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventType, setEventType] = useState<Event['event_type']>('event')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [attendees, setAttendees] = useState<string[]>([])

  const loadEvents = async () => {
    setLoading(true)

    // Use demo data for demo mode or when RPC fails
    if (isDemo || !staff?.business_id) {
      setEvents(DEMO_EVENTS)
      setStaffMembers(DEMO_STAFF)
      setLoading(false)
      return
    }

    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59)

      const { data } = await supabase.rpc('get_events_in_range', {
        p_start: startOfMonth.toISOString(),
        p_end: endOfMonth.toISOString(),
      })

      const { data: staffData } = await supabase.from('staff').select('id, full_name, name')

      if (data && Array.isArray(data) && data.length > 0) {
        setEvents(data as Event[])
      }
      if (staffData) {
        setStaffMembers(staffData as StaffMember[])
      }
    } catch {
      setEvents(DEMO_EVENTS)
      setStaffMembers(DEMO_STAFF)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadEvents()
  }, [currentDate])

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: (Date | null)[] = []

    // Padding for first week
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null)
    }

    // Days of month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }

    return days
  }

  const getEventsForDate = (date: Date) => {
    return events.filter((e) => {
      const eventDate = new Date(e.start_time)
      return eventDate.toDateString() === date.toDateString()
    })
  }

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  const openNewEvent = (date?: Date) => {
    const d = date || new Date()
    setEditingEvent(null)
    setEventTitle('')
    setEventDescription('')
    setEventType('event')
    setStartDate(d.toISOString().split('T')[0])
    setStartTime('09:00')
    setEndTime('10:00')
    setAllDay(false)
    setLocation('')
    setAttendees([])
    setShowEventModal(true)
  }

  const openEditEvent = (event: Event) => {
    setEditingEvent(event)
    setEventTitle(event.title)
    setEventDescription(event.description || '')
    setEventType(event.event_type)
    const start = new Date(event.start_time)
    setStartDate(start.toISOString().split('T')[0])
    setStartTime(start.toTimeString().slice(0, 5))
    setAllDay(event.all_day)
    setLocation(event.location || '')
    setShowEventModal(true)
  }

  const saveEvent = async () => {
    if (!eventTitle.trim()) {
      showToast('Enter event title', 'error')
      return
    }

    const startDateTime = allDay
      ? `${startDate}T00:00:00`
      : `${startDate}T${startTime}:00`

    const endDateTime = allDay
      ? `${startDate}T23:59:59`
      : `${startDate}T${endTime}:00`

    if (editingEvent) {
      // Update
      const { error } = await supabase
        .from('events')
        .update({
          title: eventTitle,
          description: eventDescription,
          event_type: eventType,
          start_time: startDateTime,
          end_time: endDateTime,
          all_day: allDay,
          location,
        })
        .eq('id', editingEvent.id)

      if (error) {
        showToast('Failed to update event', 'error')
      } else {
        showToast('Event updated!', 'success')
        setShowEventModal(false)
        loadEvents()
      }
    } else {
      // Create
      const { error } = await supabase.from('events').insert({
        title: eventTitle,
        description: eventDescription,
        event_type: eventType,
        start_time: startDateTime,
        end_time: endDateTime,
        all_day: allDay,
        location,
        organizer_id: staff?.id,
      })

      if (error) {
        showToast('Failed to create event', 'error')
      } else {
        showToast('Event created!', 'success')
        setShowEventModal(false)
        loadEvents()
      }
    }
  }

  const deleteEvent = async () => {
    if (!editingEvent) return
    if (!confirm('Delete this event?')) return

    await supabase.from('events').delete().eq('id', editingEvent.id)
    showToast('Event deleted', 'info')
    setShowEventModal(false)
    loadEvents()
  }

  const days = getDaysInMonth(currentDate)
  const today = new Date()

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Calendar</h1>
          <p className="text-sm text-black/50 mt-0.5">
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-2 rounded-xl hover:bg-black/[0.05]"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg border border-black/10 text-sm hover:bg-black/[0.02]"
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="p-2 rounded-xl hover:bg-black/[0.05]"
          >
            <ChevronRight size={20} />
          </button>
          <button
            onClick={() => openNewEvent()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
          >
            <Plus size={16} />
            New Event
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-black/[0.06]">
          {DAYS.map((day) => (
            <div key={day} className="px-3 py-2 text-center text-xs font-medium text-black/40 uppercase">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {days.map((date, i) => {
            if (!date) {
              return <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-black/[0.04]" />
            }

            const dayEvents = getEventsForDate(date)
            const isToday = date.toDateString() === today.toDateString()
            const isSelected = selectedDate?.toDateString() === date.toDateString()

            return (
              <div
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={`min-h-[100px] border-b border-r border-black/[0.04] p-1 cursor-pointer hover:bg-black/[0.02] transition-colors ${
                  isSelected ? 'bg-[var(--avenize-accent-end)]/5' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                      isToday
                        ? 'avenize-gradient text-white'
                        : 'text-black/60'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openNewEvent(date)
                    }}
                    className="p-1 rounded hover:bg-black/[0.05] opacity-0 group-hover:opacity-100"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {/* Events */}
                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => {
                    const color = EVENT_COLORS[event.event_type] || EVENT_COLORS.event
                    return (
                      <button
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditEvent(event)
                        }}
                        className={`w-full px-1.5 py-0.5 rounded text-xs truncate ${color.bg} ${color.text} text-left hover:opacity-80`}
                      >
                        {event.title}
                      </button>
                    )
                  })}
                  {dayEvents.length > 3 && (
                    <p className="text-xs text-black/30 pl-1">+{dayEvents.length - 3} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Date Events */}
      {selectedDate && (
        <div className="mt-6 bg-white rounded-2xl border border-black/[0.06] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            <button
              onClick={() => openNewEvent(selectedDate)}
              className="text-sm text-[var(--avenize-accent-end)] hover:underline"
            >
              + Add event
            </button>
          </div>

          {getEventsForDate(selectedDate).length === 0 ? (
            <p className="text-sm text-black/40">No events scheduled</p>
          ) : (
            <div className="space-y-3">
              {getEventsForDate(selectedDate).map((event) => {
                const color = EVENT_COLORS[event.event_type] || EVENT_COLORS.event
                const start = new Date(event.start_time)
                const end = event.end_time ? new Date(event.end_time) : null

                return (
                  <button
                    key={event.id}
                    onClick={() => openEditEvent(event)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl border border-black/[0.06] hover:border-[var(--avenize-accent-end)] transition-colors text-left"
                  >
                    <div className={`w-1 h-full min-h-[40px] rounded-full ${color.bg.replace('100', '500')}`} />
                    <div className="flex-1">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-sm text-black/50">
                        {!event.all_day && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {end && ` - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          </span>
                        )}
                        {event.all_day && 'All day'}
                        {event.location && (
                          <span className="flex items-center gap-1 mt-1">
                            <MapPin size={12} />
                            {event.location}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${color.bg} ${color.text}`}>
                      {event.event_type}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="px-6 py-4 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">
                {editingEvent ? 'Edit Event' : 'New Event'}
              </h2>
              <button
                onClick={() => setShowEventModal(false)}
                className="p-2 hover:bg-black/[0.05] rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <input
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Event title"
                  className="w-full px-4 py-3 rounded-xl border border-black/10 text-lg font-medium"
                />
              </div>

              {/* Type */}
              <div className="flex gap-2">
                {(['event', 'meeting', 'deadline', 'reminder'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setEventType(type)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                      eventType === type
                        ? `${EVENT_COLORS[type].bg} ${EVENT_COLORS[type].text}`
                        : 'bg-black/[0.04] text-black/60'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-black/50 block mb-1">Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-black/10"
                  />
                </div>
                {!allDay && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-black/50 block mb-1">Start</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-black/10"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-black/50 block mb-1">End</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-black/10"
                      />
                    </div>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">All day event</span>
              </label>

              {/* Location */}
              <div>
                <label className="text-xs text-black/50 block mb-1">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Add location or video link"
                  className="w-full px-4 py-2 rounded-xl border border-black/10"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-black/50 block mb-1">Description</label>
                <textarea
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  placeholder="Add details"
                  rows={3}
                  className="w-full px-4 py-2 rounded-xl border border-black/10 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-between">
              {editingEvent ? (
                <button
                  onClick={deleteEvent}
                  className="px-4 py-2 rounded-lg text-red-500 hover:bg-red-50"
                >
                  Delete
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 rounded-lg border border-black/10"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEvent}
                  className="px-4 py-2 rounded-lg avenize-gradient text-white font-medium"
                >
                  {editingEvent ? 'Save Changes' : 'Create Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Feature Suggestions */}
      <FeatureSuggestions suggestions={[
        { label: 'Meetings', path: '/app/meetings', description: 'Schedule meetings' },
        { label: 'Tasks', path: '/app/tasks', description: 'Create task deadlines' },
        { label: 'Chat', path: '/app/chat', description: 'Discuss events' },
      ]} />
    </div>
  )
}
