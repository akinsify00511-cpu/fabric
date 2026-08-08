// ============================================
// MEETING COMPONENTS - AVENIZE
// Reusable components for meeting management
// ============================================

import React, { useState } from 'react'
import {
  Users, Clock, Calendar, MapPin, Link as LinkIcon,
  Mic, Video, VideoOff, Phone, Plus, X, Check, Loader2,
  Edit3, Trash2, Send, Bell, UserCheck, FileText
} from 'lucide-react'
import { Avatar } from './ImageComponents'

// AVENIZE BRAND COLORS
const BRAND = {
  primary: '#4285F4',
  success: '#34A853',
  warning: '#FBBC05',
  danger: '#EA4335',
  surface: '#F8F9FA',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
}

// ============================================
// MEETING ATTENDEE SELECTOR
// ============================================
interface Attendee {
  id: string
  name: string
  email: string
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
  checked_in?: boolean
  check_in_time?: string
}

interface StaffMember {
  id: string
  full_name: string
  email: string
}

interface Attendee {
  id: string
  name: string
  email: string
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
  checked_in?: boolean
  check_in_time?: string
}

interface AttendeeSelectorProps {
  allStaff: StaffMember[]
  selectedAttendees: Attendee[]
  onAttendeesChange: (attendees: Attendee[]) => void
}

export function AttendeeSelector({ allStaff, selectedAttendees, onAttendeesChange }: AttendeeSelectorProps) {
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const addAttendee = (staff: StaffMember) => {
    if (selectedAttendees.find(a => a.id === staff.id)) return
    onAttendeesChange([...selectedAttendees, {
      id: staff.id,
      name: staff.full_name,
      email: staff.email,
      status: 'pending'
    }])
    setShowDropdown(false)
    setSearch('')
  }

  const removeAttendee = (id: string) => {
    onAttendeesChange(selectedAttendees.filter(a => a.id !== id))
  }

  const filteredStaff = allStaff.filter(s => 
    !selectedAttendees.find(a => a.id === s.id) &&
    (s.full_name.toLowerCase().includes(search.toLowerCase()) ||
     s.email.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
        Invite Attendees
      </label>
      
      {/* Selected Attendees */}
      {selectedAttendees.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedAttendees.map(attendee => (
            <div 
              key={attendee.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
              style={{ backgroundColor: BRAND.surface }}
            >
              <Avatar name={attendee.name} size={20} style="adventurer" />
              <span style={{ color: BRAND.text }}>{attendee.name}</span>
              <button 
                onClick={() => removeAttendee(attendee.id)}
                className="p-0.5 rounded-full hover:bg-black/10"
              >
                <X size={14} style={{ color: BRAND.textMuted }} />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Add Attendee */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search staff to invite..."
          value={search}
          onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
          onFocus={() => setShowDropdown(true)}
          className="w-full px-4 py-2.5 rounded-xl text-sm"
          style={{ 
            border: `1px solid ${BRAND.border}`,
            color: BRAND.text
          }}
        />
        
        {showDropdown && filteredStaff.length > 0 && (
          <div 
            className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
            style={{ backgroundColor: 'white', border: `1px solid ${BRAND.border}` }}
          >
            {filteredStaff.slice(0, 5).map(staff => (
              <button
                key={staff.id}
                onClick={() => addAttendee(staff)}
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left"
              >
                <Avatar name={staff.full_name} size={32} style="adventurer" />
                <div>
                  <div className="text-sm font-medium" style={{ color: BRAND.text }}>{staff.full_name}</div>
                  <div className="text-xs" style={{ color: BRAND.textMuted }}>{staff.email}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// AGENDA BUILDER
// ============================================
interface AgendaItem {
  id: string
  title: string
  duration_minutes: number
  completed: boolean
}

interface AgendaBuilderProps {
  items: AgendaItem[]
  onChange: (items: AgendaItem[]) => void
}

export function AgendaBuilder({ items, onChange }: AgendaBuilderProps) {
  const [newItem, setNewItem] = useState('')

  const addItem = () => {
    if (!newItem.trim()) return
    onChange([...items, {
      id: Date.now().toString(),
      title: newItem.trim(),
      duration_minutes: 10,
      completed: false
    }])
    setNewItem('')
  }

  const updateItem = (id: string, updates: Partial<AgendaItem>) => {
    onChange(items.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  const removeItem = (id: string) => {
    onChange(items.filter(item => item.id !== id))
  }

  const totalMinutes = items.reduce((sum, item) => sum + item.duration_minutes, 0)

  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
        Agenda ({items.length} items, ~{totalMinutes} min)
      </label>
      
      {/* Items */}
      <div className="space-y-2 mb-3">
        {items.map((item, index) => (
          <div 
            key={item.id}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ backgroundColor: BRAND.surface }}
          >
            <div 
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={{ backgroundColor: BRAND.primary, color: 'white' }}
            >
              {index + 1}
            </div>
            <input
              type="text"
              value={item.title}
              onChange={e => updateItem(item.id, { title: e.target.value })}
              className="flex-1 bg-transparent text-sm"
              style={{ color: BRAND.text }}
              placeholder="Agenda item..."
            />
            <input
              type="number"
              value={item.duration_minutes}
              onChange={e => updateItem(item.id, { duration_minutes: parseInt(e.target.value) || 0 })}
              className="w-16 px-2 py-1 rounded-lg text-xs text-center"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
              min={1}
            />
            <span className="text-xs" style={{ color: BRAND.textMuted }}>min</span>
            <button onClick={() => removeItem(item.id)} className="p-1">
              <X size={16} style={{ color: BRAND.textMuted }} />
            </button>
          </div>
        ))}
      </div>
      
      {/* Add Item */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Add agenda item..."
          className="flex-1 px-4 py-2.5 rounded-xl text-sm"
          style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
        />
        <button
          onClick={addItem}
          className="px-4 py-2.5 rounded-xl text-white text-sm font-medium"
          style={{ backgroundColor: BRAND.primary }}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}

// ============================================
// ATTENDANCE TAKER
// ============================================
interface AttendeeWithAttendance {
  id: string
  name: string
  email: string
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
  checked_in?: boolean
  check_in_time?: string
}

interface AttendanceTakerProps {
  attendees: AttendeeWithAttendance[]
  onCheckIn: (attendeeId: string) => void
}

export function AttendanceTaker({ attendees, onCheckIn }: AttendanceTakerProps) {
  const checkedIn = attendees.filter(a => a.checked_in).length
  const total = attendees.length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <label className="text-sm font-medium" style={{ color: BRAND.textSecondary }}>
          Attendance
        </label>
        <span className="text-sm" style={{ color: BRAND.textSecondary }}>
          {checkedIn}/{total} present
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="h-2 rounded-full mb-4" style={{ backgroundColor: BRAND.surface }}>
        <div 
          className="h-2 rounded-full transition-all"
          style={{ 
            width: `${total > 0 ? (checkedIn / total) * 100 : 0}%`,
            backgroundColor: BRAND.success 
          }}
        />
      </div>
      
      {/* Attendee List */}
      <div className="space-y-2">
        {attendees.map(attendee => (
          <div 
            key={attendee.id}
            className="flex items-center justify-between p-3 rounded-xl"
            style={{ backgroundColor: attendee.checked_in ? 'rgba(52, 168, 83, 0.08)' : BRAND.surface }}
          >
            <div className="flex items-center gap-3">
              <Avatar name={attendee.name} size={36} style="adventurer" />
              <div>
                <div className="text-sm font-medium" style={{ color: BRAND.text }}>{attendee.name}</div>
                <div className="text-xs" style={{ color: BRAND.textMuted }}>{attendee.email}</div>
              </div>
            </div>
            <button
              onClick={() => onCheckIn(attendee.id)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ 
                backgroundColor: attendee.checked_in ? BRAND.success : 'transparent',
                color: attendee.checked_in ? 'white' : BRAND.primary,
                border: `1px solid ${attendee.checked_in ? BRAND.success : BRAND.primary}`
              }}
            >
              {attendee.checked_in ? (
                <>
                  <Check size={14} />
                  Present
                </>
              ) : (
                <>
                  <UserCheck size={14} />
                  Check In
                </>
              )}
            </button>
          </div>
        ))}
        
        {attendees.length === 0 && (
          <div className="text-center py-8 text-sm" style={{ color: BRAND.textMuted }}>
            No attendees to track
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// MEETING RECORDER
// ============================================
interface MeetingRecorderProps {
  isRecording: boolean
  recordingTime: number
  isVideoOn: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onToggleVideo: () => void
}

export function MeetingRecorder({ 
  isRecording, 
  recordingTime, 
  isVideoOn, 
  onStartRecording, 
  onStopRecording,
  onToggleVideo 
}: MeetingRecorderProps) {
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-4">
      {/* Recording Indicator */}
      {isRecording && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: BRAND.danger }} />
          <span className="text-sm font-mono" style={{ color: BRAND.danger }}>
            {formatTime(recordingTime)}
          </span>
        </div>
      )}
      
      {/* Video Toggle */}
      <button
        onClick={onToggleVideo}
        className="p-3 rounded-full transition"
        style={{ 
          backgroundColor: isVideoOn ? 'rgba(66, 133, 244, 0.1)' : 'transparent',
          border: `1px solid ${isVideoOn ? BRAND.primary : BRAND.border}`
        }}
      >
        {isVideoOn ? (
          <Video size={20} style={{ color: BRAND.primary }} />
        ) : (
          <VideoOff size={20} style={{ color: BRAND.textMuted }} />
        )}
      </button>
      
      {/* Record Button */}
      <button
        onClick={isRecording ? onStopRecording : onStartRecording}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition"
        style={{ 
          backgroundColor: isRecording ? BRAND.danger : BRAND.primary,
          color: 'white'
        }}
      >
        {isRecording ? (
          <>
            <div className="w-3 h-3 rounded-sm bg-white" />
            Stop Recording
          </>
        ) : (
          <>
            <Mic size={18} />
            Start Recording
          </>
        )}
      </button>
    </div>
  )
}

// ============================================
// MEETING DETAIL HEADER
// ============================================
interface MeetingDetailHeaderProps {
  title: string
  date: string
  startTime: string
  endTime?: string
  location?: string
  meetingLink?: string
  status: string
  onEdit: () => void
  onDelete: () => void
  onSendReminder: () => void
}

export function MeetingDetailHeader({
  title,
  date,
  startTime,
  endTime,
  location,
  meetingLink,
  status,
  onEdit,
  onDelete,
  onSendReminder
}: MeetingDetailHeaderProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const formatTime = (time24: string) => {
    const [hours, minutes] = time24.split(':')
    const h = parseInt(hours)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${minutes} ${ampm}`
  }

  const statusColors: Record<string, {bg: string, color: string}> = {
    scheduled: { bg: 'rgba(66, 133, 244, 0.1)', color: BRAND.primary },
    in_progress: { bg: 'rgba(52, 168, 83, 0.1)', color: BRAND.success },
    completed: { bg: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' },
    cancelled: { bg: 'rgba(234, 67, 53, 0.1)', color: BRAND.danger },
  }
  const statusStyle = statusColors[status] || statusColors.scheduled

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span 
              className="px-3 py-1 rounded-full text-xs font-medium capitalize"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
            >
              {status.replace('_', ' ')}
            </span>
          </div>
          <h1 className="text-2xl font-semibold mb-3" style={{ color: BRAND.text }}>{title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: BRAND.textSecondary }}>
            <span className="flex items-center gap-2">
              <Calendar size={16} />
              {formatDate(date)}
            </span>
            <span className="flex items-center gap-2">
              <Clock size={16} />
              {formatTime(startTime)}
              {endTime && ` - ${formatTime(endTime)}`}
            </span>
            {location && (
              <span className="flex items-center gap-2">
                <MapPin size={16} />
                {location}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onSendReminder}
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: BRAND.surface }}
            title="Send Reminder"
          >
            <Bell size={18} style={{ color: BRAND.warning }} />
          </button>
          {meetingLink && (
            <a
              href={meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl"
              style={{ backgroundColor: BRAND.surface }}
              title="Join Meeting"
            >
              <Video size={18} style={{ color: BRAND.primary }} />
            </a>
          )}
          <button
            onClick={onEdit}
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: BRAND.surface }}
          >
            <Edit3 size={18} style={{ color: BRAND.textMuted }} />
          </button>
          <button
            onClick={onDelete}
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: 'rgba(234, 67, 53, 0.1)' }}
          >
            <Trash2 size={18} style={{ color: BRAND.danger }} />
          </button>
        </div>
      </div>
    </div>
  )
}
