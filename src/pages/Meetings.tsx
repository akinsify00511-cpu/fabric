// ============================================
// MEETINGS PAGE - AVENIZE
// Comprehensive Meeting Management System
// Features: Schedule, Invite, Remind, Record, Attend, Summarize
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useBusiness } from '../lib/BusinessContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { Avatar } from '../components/ImageComponents'
import {
  AttendeeSelector,
  AgendaBuilder,
  AttendanceTaker,
  MeetingRecorder,
  MeetingDetailHeader
} from '../components/MeetingComponents'
import {
  Search, Plus, Clock, Calendar, Video, 
  Users, Trash2, X, ChevronRight, 
  Edit3, Send, Bell, CheckCircle2, AlertCircle, 
  Play, Pause, MapPin, Link as LinkIcon, 
  Loader2, Copy, Check, ExternalLink,
  Mic, MicOff, Phone, FileText, Sparkles
} from 'lucide-react'

// AVENIZE BRAND COLORS
const BRAND = {
  primary: 'var(--av-primary)',
  success: '#34A853',
  warning: '#FBBC05',
  danger: '#EA4335',
  surface: '#F8F9FA',
  surface2: '#F1F3F4',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
}

interface Meeting {
  id: string
  title: string
  description?: string
  date: string
  start_time: string
  end_time?: string
  location?: string
  meeting_link?: string
  attendees: MeetingAttendee[]
  agenda?: string
  notes?: string
  recording_url?: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  staff_id: string
  business_id: string
  created_at: string
}

interface MeetingAttendee {
  id: string
  name: string
  email: string
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
  checked_in?: boolean
  check_in_time?: string
}

interface AgendaItem {
  id: string
  title: string
  duration_minutes: number
  completed: boolean
  notes?: string
}

type ViewMode = 'list' | 'detail' | 'create' | 'edit'

export default function Meetings() {
  const { staff } = useAuth()
  const { activeBusinessId } = useBusiness()
  const { showToast } = useToast()
  // Per-subsidiary: meetings scope to the active subsidiary (switchable via
  // the SubsidiarySwitcher). Falls back to the staff's own business.
  const bid = activeBusinessId ?? staff?.business_id ?? null
  
  // Core state
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('list')
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    location: '',
    meeting_link: '',
    notes: '',
  })
  const [invitees, setInvitees] = useState<MeetingAttendee[]>([])
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([])
  const [allStaff, setAllStaff] = useState<any[]>([])
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [isVideoOn, setIsVideoOn] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load meetings
  const loadMeetings = useCallback(async () => {
    if (!bid) return
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('business_id', bid)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(100)
      
      if (error) throw error
      
      const transformedMeetings = (data || []).map((m: any) => ({
        ...m,
        attendees: typeof m.attendees === 'string' ? JSON.parse(m.attendees) : (m.attendees || [])
      }))
      
      setMeetings(transformedMeetings)
    } catch (err) {
      console.error('Failed to load meetings:', err)
      showToast('Failed to load meetings', 'error')
    } finally {
      setLoading(false)
    }
  }, [bid, showToast])

  // Load staff for invitees
  const loadStaff = useCallback(async () => {
    if (!bid) return
    
    try {
      const { data } = await supabase
        .from('staff')
        .select('id, full_name, email')
        .eq('business_id', bid)
      
      setAllStaff(data || [])
    } catch (err) {
      console.error('Failed to load staff:', err)
    }
  }, [bid])

  useEffect(() => {
    loadMeetings()
    loadStaff()
  }, [loadMeetings, loadStaff])

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording])

  // Format helpers
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })
  }

  const formatTime12h = (time24: string) => {
    if (!time24) return ''
    const [hours, minutes] = time24.split(':')
    const h = parseInt(hours)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${minutes} ${ampm}`
  }

  // Create Meeting
  const createMeeting = async () => {
    if (!formData.title.trim() || !bid || !staff?.id) {
      showToast('Please enter meeting title', 'error')
      return
    }

    try {
      const meetingData = {
        title: formData.title.trim(),
        description: formData.description || null,
        date: formData.date,
        start_time: formData.start_time,
        end_time: formData.end_time || null,
        location: formData.location || null,
        meeting_link: formData.meeting_link || null,
        agenda: agendaItems.length > 0 ? JSON.stringify(agendaItems) : null,
        notes: formData.notes || null,
        attendees: invitees,
        status: 'scheduled' as const,
        staff_id: staff.id,
        business_id: bid,
      }

      const { data, error } = await supabase
        .from('meetings')
        .insert(meetingData)
        .select()
        .single()

      if (error) throw error

      const newMeeting = { ...data, attendees: invitees }
      setMeetings(prev => [newMeeting, ...prev])
      showToast('Meeting scheduled!', 'success')
      resetForm()
      setView('list')
      
      if (invitees.length > 0) {
        sendInvites(newMeeting)
      }
    } catch (err) {
      console.error('Failed to create meeting:', err)
      showToast('Failed to create meeting', 'error')
    }
  }

  // Update Meeting
  const updateMeeting = async () => {
    if (!selectedMeeting || !formData.title.trim()) return

    try {
      const { error } = await supabase
        .from('meetings')
        .update({
          title: formData.title.trim(),
          description: formData.description || null,
          date: formData.date,
          start_time: formData.start_time,
          end_time: formData.end_time || null,
          location: formData.location || null,
          meeting_link: formData.meeting_link || null,
          agenda: agendaItems.length > 0 ? JSON.stringify(agendaItems) : null,
          notes: formData.notes || null,
          attendees: invitees,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedMeeting.id)

      if (error) throw error

      setMeetings(prev => prev.map(m => 
        m.id === selectedMeeting.id ? { ...m, ...formData, attendees: invitees } : m
      ))
      
      showToast('Meeting updated!', 'success')
      setView('detail')
    } catch (err) {
      console.error('Failed to update meeting:', err)
      showToast('Failed to update meeting', 'error')
    }
  }

  // Send Invites
  const sendInvites = async (meeting: Meeting) => {
    try {
      let sent = 0
      for (const attendee of meeting.attendees) {
        const { error } = await supabase.from('notifications').insert({
          business_id: bid,
          staff_id: attendee.id,
          title: 'Meeting Invitation',
          message: `You've been invited to: ${meeting.title} on ${formatDate(meeting.date)} at ${formatTime12h(meeting.start_time)}`,
          type: 'meeting',
          related_id: meeting.id,
        })
        if (!error) sent++
      }
      if (sent === 0) {
        showToast('Failed to send invitations', 'error')
      } else if (sent < meeting.attendees.length) {
        showToast(`Invitations sent to ${sent} of ${meeting.attendees.length} attendees`, 'success')
      } else {
        showToast(`Invitations sent to ${meeting.attendees.length} attendees`, 'success')
      }
    } catch (err) {
      showToast('Failed to send invites', 'error')
    }
  }

  // Send Reminder
  const sendReminder = async (meeting: Meeting) => {
    try {
      let sent = 0
      for (const attendee of meeting.attendees) {
        const { error } = await supabase.from('notifications').insert({
          business_id: bid,
          staff_id: attendee.id,
          title: 'Meeting Reminder',
          message: `Reminder: ${meeting.title} starts at ${formatTime12h(meeting.start_time)}`,
          type: 'reminder',
          related_id: meeting.id,
        })
        if (!error) sent++
      }
      if (sent === 0) {
        showToast('Failed to send reminders', 'error')
      } else if (sent < meeting.attendees.length) {
        showToast(`Reminders sent to ${sent} of ${meeting.attendees.length} attendees`, 'success')
      } else {
        showToast(`Reminders sent to ${meeting.attendees.length} attendees`, 'success')
      }
    } catch (err) {
      showToast('Failed to send reminders', 'error')
    }
  }

  // Delete Meeting
  const deleteMeeting = async (id: string) => {
    if (!confirm('Delete this meeting? This cannot be undone.')) return
    
    try {
      const { error } = await supabase.from('meetings').delete().eq('id', id)
      if (error) throw error
      
      setMeetings(prev => prev.filter(m => m.id !== id))
      setSelectedMeeting(null)
      setView('list')
      showToast('Meeting deleted', 'success')
    } catch (err) {
      console.error('Failed to delete meeting:', err)
      showToast('Failed to delete meeting', 'error')
    }
  }

  // Check In Attendee
  const checkInAttendee = async (meetingId: string, attendeeId: string) => {
    const now = new Date().toISOString()
    
    setMeetings(prev => prev.map(m => {
      if (m.id === meetingId) {
        return {
          ...m,
          attendees: m.attendees.map(a => 
            a.id === attendeeId 
              ? { ...a, checked_in: true, check_in_time: now }
              : a
          )
        }
      }
      return m
    }))

    if (selectedMeeting?.id === meetingId) {
      setSelectedMeeting(prev => prev ? {
        ...prev,
        attendees: prev.attendees.map(a => 
          a.id === attendeeId 
            ? { ...a, checked_in: true, check_in_time: now }
            : a
        )
      } : null)
    }
  }

  // Recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: isVideoOn 
      })
      
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        await saveRecording(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      showToast('Recording started!', 'success')
    } catch (err) {
      console.error('Failed to start recording:', err)
      showToast('Camera/microphone access denied', 'error')
    }
  }

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const saveRecording = async (blob: Blob) => {
    if (!selectedMeeting || !staff?.id) {
      showToast('No meeting selected', 'error')
      return
    }

    try {
      const fileName = `meetings/${selectedMeeting.id}/${Date.now()}.webm`
      const { error: uploadError } = await supabase.storage
        .from('meeting-recordings')
        .upload(fileName, blob)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('meeting-recordings')
        .getPublicUrl(fileName)

      await supabase
        .from('meetings')
        .update({ recording_url: urlData.publicUrl })
        .eq('id', selectedMeeting.id)

      setMeetings(prev => prev.map(m => 
        m.id === selectedMeeting.id ? { ...m, recording_url: urlData.publicUrl } : m
      ))
      setSelectedMeeting(prev => prev ? { ...prev, recording_url: urlData.publicUrl } : null)
      
      showToast('Recording saved!', 'success')
    } catch (err) {
      console.error('Failed to save recording:', err)
      showToast('Failed to save recording', 'error')
    }
  }

  // Reset Form
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      start_time: '09:00',
      end_time: '10:00',
      location: '',
      meeting_link: '',
      notes: '',
    })
    setInvitees([])
    setAgendaItems([])
  }

  // Open Edit Modal
  const openEditModal = () => {
    if (!selectedMeeting) return
    setFormData({
      title: selectedMeeting.title,
      description: selectedMeeting.description || '',
      date: selectedMeeting.date,
      start_time: selectedMeeting.start_time,
      end_time: selectedMeeting.end_time || '',
      location: selectedMeeting.location || '',
      meeting_link: selectedMeeting.meeting_link || '',
      notes: selectedMeeting.notes || '',
    })
    setInvitees(selectedMeeting.attendees || [])
    setAgendaItems(selectedMeeting.agenda ? JSON.parse(selectedMeeting.agenda) : [])
    setView('edit')
  }

  // Copy Meeting Link
  const copyMeetingLink = (link: string) => {
    navigator.clipboard.writeText(link)
    showToast('Link copied!', 'success')
  }

  // Get meetings by date
  const todayStr = new Date().toISOString().split('T')[0]
  const filteredMeetings = meetings.filter(m => {
    const matchesSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterStatus === 'all' || m.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const todayMeetings = filteredMeetings.filter(m => m.date === todayStr)
  const upcomingMeetings = filteredMeetings.filter(m => m.date > todayStr)
  const pastMeetings = filteredMeetings.filter(m => m.date < todayStr)

  const getStatusBadge = (status: Meeting['status']) => {
    const styles: Record<string, {bg: string, color: string, icon: any}> = {
      scheduled: { bg: 'rgba(66, 133, 244, 0.1)', color: '#4285F4', icon: Clock },
      in_progress: { bg: 'rgba(52, 168, 83, 0.1)', color: '#34A853', icon: Play },
      completed: { bg: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6', icon: CheckCircle2 },
      cancelled: { bg: 'rgba(234, 67, 53, 0.1)', color: '#EA4335', icon: AlertCircle },
    }
    const style = styles[status] || styles.scheduled
    const Icon = style.icon
    
    return (
      <span 
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        <Icon size={12} />
        {status.replace('_', ' ')}
      </span>
    )
  }

  // Render Meeting Card
  const renderMeetingCard = (meeting: Meeting) => (
    <div 
      key={meeting.id}
      className="p-5 rounded-2xl transition-all hover:-translate-y-0.5 cursor-pointer"
      style={{ 
        backgroundColor: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)'
      }}
      onClick={() => {
        setSelectedMeeting(meeting)
        setView('detail')
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {getStatusBadge(meeting.status)}
            <span className="text-xs" style={{ color: BRAND.textMuted }}>
              {formatDate(meeting.date)}
            </span>
          </div>
          <h3 className="font-semibold truncate mb-1" style={{ color: BRAND.text }}>
            {meeting.title}
          </h3>
          <div className="flex items-center gap-3 text-sm" style={{ color: BRAND.textSecondary }}>
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {formatTime12h(meeting.start_time)}
              {meeting.end_time && ` - ${formatTime12h(meeting.end_time)}`}
            </span>
            {meeting.location && (
              <span className="flex items-center gap-1">
                <MapPin size={14} />
                {meeting.location}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {meeting.attendees?.length > 0 && (
            <div className="flex -space-x-2">
              {meeting.attendees.slice(0, 3).map((a, i) => (
                <Avatar key={a.id || i} name={a.name} size={28} style="adventurer" />
              ))}
              {meeting.attendees.length > 3 && (
                <div 
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{ backgroundColor: '#4285F4', color: 'white' }}
                >
                  +{meeting.attendees.length - 3}
                </div>
              )}
            </div>
          )}
          {meeting.recording_url && (
            <div className="p-1.5 rounded-full" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
              <Video size={14} style={{ color: '#8B5CF6' }} />
            </div>
          )}
          <ChevronRight size={20} style={{ color: BRAND.textMuted }} />
        </div>
      </div>
    </div>
  )

  // Render Create/Edit Form
  const renderForm = () => (
    <div className="pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setView('list')}
          className="p-2 rounded-xl"
          style={{ backgroundColor: BRAND.surface }}
        >
          <X size={20} />
        </button>
        <h1 className="text-xl font-semibold" style={{ color: BRAND.text }}>
          {selectedMeeting ? 'Edit Meeting' : 'Schedule New Meeting'}
        </h1>
      </div>

      <div className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
            Meeting Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
            placeholder="Weekly Team Standup"
            className="w-full px-4 py-3 rounded-xl text-sm"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
          />
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
              Start Time *
            </label>
            <input
              type="time"
              value={formData.start_time}
              onChange={e => setFormData({...formData, start_time: e.target.value})}
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
              End Time
            </label>
            <input
              type="time"
              value={formData.end_time}
              onChange={e => setFormData({...formData, end_time: e.target.value})}
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
            />
          </div>
        </div>

        {/* Location & Link */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
              placeholder="Conference Room A"
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
              Meeting Link
            </label>
            <input
              type="url"
              value={formData.meeting_link}
              onChange={e => setFormData({...formData, meeting_link: e.target.value})}
              placeholder="https://zoom.us/j/..."
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={e => setFormData({...formData, description: e.target.value})}
            placeholder="Meeting agenda or topics to discuss..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-sm resize-none"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
          />
        </div>

        {/* Attendees */}
        <AttendeeSelector
          allStaff={allStaff}
          selectedAttendees={invitees}
          onAttendeesChange={setInvitees}
        />

        {/* Agenda */}
        <AgendaBuilder
          items={agendaItems}
          onChange={setAgendaItems}
        />

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textSecondary }}>
            Notes
          </label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData({...formData, notes: e.target.value})}
            placeholder="Additional notes or preparation..."
            rows={4}
            className="w-full px-4 py-3 rounded-xl text-sm resize-none"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => setView('list')}
            className="flex-1 py-3 rounded-xl text-sm font-medium"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.textSecondary }}
          >
            Cancel
          </button>
          <button
            onClick={selectedMeeting ? updateMeeting : createMeeting}
            className="flex-1 py-3 rounded-xl text-white text-sm font-medium"
            style={{ backgroundColor: '#4285F4' }}
          >
            {selectedMeeting ? 'Update Meeting' : 'Schedule Meeting'}
          </button>
        </div>
      </div>
    </div>
  )

  // Render Detail View
  const renderDetail = () => {
    if (!selectedMeeting) return null
    
    const agendaItems = selectedMeeting.agenda ? JSON.parse(selectedMeeting.agenda) : []
    const checkedInCount = selectedMeeting.attendees?.filter(a => a.checked_in).length || 0

    return (
      <div className="pb-20">
        {/* Header */}
        <MeetingDetailHeader
          title={selectedMeeting.title}
          date={selectedMeeting.date}
          startTime={selectedMeeting.start_time}
          endTime={selectedMeeting.end_time}
          location={selectedMeeting.location}
          meetingLink={selectedMeeting.meeting_link}
          status={selectedMeeting.status}
          onEdit={openEditModal}
          onDelete={() => deleteMeeting(selectedMeeting.id)}
          onSendReminder={() => sendReminder(selectedMeeting)}
        />

        {/* Quick Actions */}
        <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2">
          <MeetingRecorder
            isRecording={isRecording}
            recordingTime={recordingTime}
            isVideoOn={isVideoOn}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onToggleVideo={() => setIsVideoOn(!isVideoOn)}
          />
          {selectedMeeting.meeting_link && (
            <a
              href={selectedMeeting.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium"
              style={{ backgroundColor: '#4285F4' }}
            >
              <Video size={18} />
              Join Meeting
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {selectedMeeting.description && (
              <div className="p-5 rounded-2xl" style={{ backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 className="font-semibold mb-3" style={{ color: BRAND.text }}>Description</h3>
                <p className="text-sm" style={{ color: BRAND.textSecondary }}>{selectedMeeting.description}</p>
              </div>
            )}

            {/* Agenda */}
            {agendaItems.length > 0 && (
              <div className="p-5 rounded-2xl" style={{ backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 className="font-semibold mb-4" style={{ color: BRAND.text }}>Agenda</h3>
                <div className="space-y-3">
                  {agendaItems.map((item: AgendaItem, index: number) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                        style={{ backgroundColor: 'rgba(66, 133, 244, 0.1)', color: '#4285F4' }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: BRAND.text }}>{item.title}</div>
                        <div className="text-xs" style={{ color: BRAND.textMuted }}>{item.duration_minutes} min</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recording */}
            {selectedMeeting.recording_url && (
              <div className="p-5 rounded-2xl" style={{ backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 className="font-semibold mb-3" style={{ color: BRAND.text }}>Recording</h3>
                <video 
                  src={selectedMeeting.recording_url}
                  controls
                  className="w-full rounded-xl"
                  style={{ backgroundColor: '#000' }}
                />
              </div>
            )}

            {/* Notes */}
            {selectedMeeting.notes && (
              <div className="p-5 rounded-2xl" style={{ backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h3 className="font-semibold mb-3" style={{ color: BRAND.text }}>Notes</h3>
                <p className="text-sm whitespace-pre-wrap" style={{ color: BRAND.textSecondary }}>{selectedMeeting.notes}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Attendees */}
            <div className="p-5 rounded-2xl" style={{ backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold" style={{ color: BRAND.text }}>Attendees</h3>
                <span className="text-xs" style={{ color: BRAND.textMuted }}>
                  {checkedInCount}/{selectedMeeting.attendees?.length || 0} present
                </span>
              </div>
              
              {selectedMeeting.attendees?.length > 0 ? (
                <AttendanceTaker
                  attendees={selectedMeeting.attendees}
                  onCheckIn={(id) => checkInAttendee(selectedMeeting.id, id)}
                />
              ) : (
                <div className="text-center py-6 text-sm" style={{ color: BRAND.textMuted }}>
                  No attendees invited
                </div>
              )}
            </div>

            {/* Meeting Info */}
            <div className="p-5 rounded-2xl" style={{ backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h3 className="font-semibold mb-4" style={{ color: BRAND.text }}>Meeting Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <Calendar size={16} style={{ color: BRAND.textMuted }} />
                  <span style={{ color: BRAND.textSecondary }}>
                    {new Date(selectedMeeting.date).toLocaleDateString('en-NG', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock size={16} style={{ color: BRAND.textMuted }} />
                  <span style={{ color: BRAND.textSecondary }}>
                    {formatTime12h(selectedMeeting.start_time)}
                    {selectedMeeting.end_time && ` - ${formatTime12h(selectedMeeting.end_time)}`}
                  </span>
                </div>
                {selectedMeeting.location && (
                  <div className="flex items-center gap-3">
                    <MapPin size={16} style={{ color: BRAND.textMuted }} />
                    <span style={{ color: BRAND.textSecondary }}>{selectedMeeting.location}</span>
                  </div>
                )}
                {selectedMeeting.meeting_link && (
                  <div className="flex items-center gap-3">
                    <LinkIcon size={16} style={{ color: BRAND.textMuted }} />
                    <button
                      onClick={() => copyMeetingLink(selectedMeeting.meeting_link!)}
                      className="flex items-center gap-1"
                      style={{ color: '#4285F4' }}
                    >
                      Copy Link
                      <Copy size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main Render
  return (
    <div>
      {view === 'create' || view === 'edit' ? (
        renderForm()
      ) : view === 'detail' ? (
        <>
          <button
            onClick={() => setView('list')}
            className="flex items-center gap-2 mb-4 text-sm"
            style={{ color: BRAND.textSecondary }}
          >
            ← Back to meetings
          </button>
          {renderDetail()}
        </>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: BRAND.text }}>Meetings</h1>
              <p className="text-sm mt-1" style={{ color: BRAND.textSecondary }}>
                {todayMeetings.length} today • {upcomingMeetings.length} upcoming
              </p>
            </div>
            <button
              onClick={() => { resetForm(); setView('create') }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium"
              style={{ backgroundColor: '#4285F4' }}
            >
              <Plus size={18} />
              New Meeting
            </button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(66, 133, 244, 0.08)' }}>
              <div className="text-2xl font-bold" style={{ color: '#4285F4' }}>{todayMeetings.length}</div>
              <div className="text-xs" style={{ color: BRAND.textSecondary }}>Today</div>
            </div>
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(52, 168, 83, 0.08)' }}>
              <div className="text-2xl font-bold" style={{ color: '#34A853' }}>{upcomingMeetings.length}</div>
              <div className="text-xs" style={{ color: BRAND.textSecondary }}>Upcoming</div>
            </div>
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(139, 92, 246, 0.08)' }}>
              <div className="text-2xl font-bold" style={{ color: '#8B5CF6' }}>{meetings.filter(m => m.recording_url).length}</div>
              <div className="text-xs" style={{ color: BRAND.textSecondary }}>Recorded</div>
            </div>
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(251, 188, 5, 0.08)' }}>
              <div className="text-2xl font-bold" style={{ color: '#FBBC05' }}>{pastMeetings.length}</div>
              <div className="text-xs" style={{ color: BRAND.textSecondary }}>Past</div>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={18} style={{ color: BRAND.textMuted }} />
              <input
                type="text"
                placeholder="Search meetings..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl text-sm"
                style={{ 
                  backgroundColor: 'white',
                  border: `1px solid ${BRAND.border}`,
                  color: BRAND.text
                }}
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-4 py-3 rounded-xl text-sm"
              style={{ 
                backgroundColor: 'white',
                border: `1px solid ${BRAND.border}`,
                color: BRAND.text
              }}
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Today's Meetings */}
          {todayMeetings.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold mb-3" style={{ color: BRAND.textSecondary }}>TODAY</h2>
              <div className="space-y-3">
                {todayMeetings.map(renderMeetingCard)}
              </div>
            </div>
          )}

          {/* Upcoming Meetings */}
          {upcomingMeetings.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold mb-3" style={{ color: BRAND.textSecondary }}>UPCOMING</h2>
              <div className="space-y-3">
                {upcomingMeetings.map(renderMeetingCard)}
              </div>
            </div>
          )}

          {/* Past Meetings */}
          {pastMeetings.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold mb-3" style={{ color: BRAND.textSecondary }}>PAST</h2>
              <div className="space-y-3">
                {pastMeetings.slice(0, 10).map(renderMeetingCard)}
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredMeetings.length === 0 && !loading && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: 'rgba(66, 133, 244, 0.1)' }}>
                <Video size={32} style={{ color: '#4285F4' }} />
              </div>
              <h3 className="font-semibold mb-2" style={{ color: BRAND.text }}>No meetings found</h3>
              <p className="text-sm mb-4" style={{ color: BRAND.textSecondary }}>
                Schedule your first meeting to get started
              </p>
              <button
                onClick={() => { resetForm(); setView('create') }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium"
                style={{ backgroundColor: '#4285F4' }}
              >
                <Plus size={18} />
                Schedule Meeting
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin" size={24} style={{ color: '#4285F4' }} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
