// ============================================
// MEETINGS V2 - With Video Calling + Recording
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import VideoRoom from '../components/VideoRoom'
import StartMeetingModal from '../components/StartMeetingModal'
import { 
  Video, Calendar, Clock, Users, Plus, Search, Filter,
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor,
  PhoneOff, MoreVertical, Edit3, Trash2, Download, 
  Play, Pause, Settings, Copy, Link, ExternalLink
} from 'lucide-react'

interface Meeting {
  id: string
  title: string
  date: string
  start_time: string
  end_time?: string
  duration?: number
  status: 'scheduled' | 'in_progress' | 'completed'
  meeting_link?: string
  attendees?: string[]
  notes?: string
  recording_url?: string
  host_id: string
  business_id: string
  created_at: string
}

interface ScheduledMeeting {
  id: string
  title: string
  date: string
  start_time: string
  end_time?: string
  meeting_link: string
  attendees: { name: string; email?: string }[]
  created_by: string
}

export default function MeetingsV2() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  // Video room state
  const [showVideoRoom, setShowVideoRoom] = useState(false)
  const [currentRoom, setCurrentRoom] = useState<{ name: string; displayName: string; isHost: boolean } | null>(null)
  const [showStartModal, setShowStartModal] = useState(false)
  
  // Scheduled meetings
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [scheduledMeetings, setScheduledMeetings] = useState<ScheduledMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming'>('all')

  // Load meetings
  const loadMeetings = useCallback(async () => {
    if (!staff?.business_id) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('date', { ascending: false })

      if (error) throw error
      setMeetings((data as Meeting[]) ?? [])
      
      // Also fetch scheduled meetings
      const today = new Date().toISOString().split('T')[0]
      const upcoming = (data as Meeting[])?.filter(m => m.date >= today && m.status === 'scheduled') || []
      setScheduledMeetings(upcoming as unknown as ScheduledMeeting[])
    } catch (err) {
      console.warn('Failed to load meetings:', err)
      // Don't show error - meetings table might not exist yet
    } finally {
      setLoading(false)
    }
  }, [staff?.business_id])

  useEffect(() => {
    loadMeetings()
  }, [loadMeetings])

  // Start video meeting
  const handleStartMeeting = (roomName: string, displayName: string, isHost: boolean) => {
    setCurrentRoom({ name: roomName, displayName, isHost })
    setShowVideoRoom(true)
    
    // Save meeting to database if logged in
    if (staff?.business_id) {
      saveMeeting(roomName, displayName)
    }
  }

  // Save meeting to database
  const saveMeeting = async (roomName: string, title: string) => {
    if (!staff?.business_id) return

    try {
      await supabase.from('meetings').insert({
        business_id: staff.business_id,
        host_id: staff.id,
        title: title || `Meeting ${new Date().toLocaleString()}`,
        date: new Date().toISOString().split('T')[0],
        start_time: new Date().toTimeString().slice(0, 5),
        status: 'in_progress',
        meeting_link: `https://meet.jit.si/${roomName}`
      })
    } catch (err) {
      console.warn('Failed to save meeting:', err)
    }
  }

  // Close video room
  const handleCloseVideoRoom = () => {
    setShowVideoRoom(false)
    setCurrentRoom(null)
    loadMeetings() // Refresh list
  }

  // Copy meeting link
  const copyMeetingLink = (meeting: ScheduledMeeting) => {
    navigator.clipboard.writeText(meeting.meeting_link)
    showToast('Meeting link copied!', 'success')
  }

  // Get filtered meetings
  const getFilteredMeetings = () => {
    const today = new Date().toISOString().split('T')[0]
    
    return meetings.filter(m => {
      const matchesSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase())
      if (filter === 'today') return matchesSearch && m.date === today
      if (filter === 'upcoming') return matchesSearch && m.date > today
      return matchesSearch
    })
  }

  const displayName = staff?.full_name || staff?.name || 'Guest'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--av-text)]">Meetings</h1>
          <p className="text-[var(--av-text-muted)] mt-1">Video calls and meeting recordings</p>
        </div>
        
        <button
          onClick={() => setShowStartModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-[#4285F4] text-white rounded-xl font-medium hover:opacity-90 transition shadow-lg shadow-blue-500/25"
        >
          <Video size={20} />
          Start Meeting
        </button>
      </div>

      {/* Quick Start Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <button
          onClick={() => handleStartMeeting(`avenize-${Date.now().toString(36)}`, displayName, true)}
          className="bg-gradient-to-br from-blue-500 to-[#4285F4] rounded-2xl p-6 text-white text-left hover:opacity-90 transition"
        >
          <div className="w-12 h-12 bg-[var(--av-surface)]/20 rounded-xl flex items-center justify-center mb-4">
            <Video size={24} />
          </div>
          <h3 className="font-semibold text-lg mb-1">Start Instant Meeting</h3>
          <p className="text-[var(--av-primary-soft)] text-sm">Begin a video call right now</p>
        </button>

        <button
          onClick={() => setShowStartModal(true)}
          className="bg-[var(--av-surface)] border-2 border-[var(--av-border)] rounded-2xl p-6 text-left hover:border-[var(--av-primary-soft)] hover:bg-[var(--av-primary-soft)] transition"
        >
          <div className="w-12 h-12 bg-[var(--av-primary-soft)] rounded-xl flex items-center justify-center mb-4">
            <Calendar size={24} className="text-[var(--av-primary)]" />
          </div>
          <h3 className="font-semibold text-lg text-[var(--av-text)] mb-1">Schedule Meeting</h3>
          <p className="text-[var(--av-text-muted)] text-sm">Plan a meeting for later</p>
        </button>

        <button
          onClick={() => setShowStartModal(true)}
          className="bg-[var(--av-surface)] border-2 border-[var(--av-border)] rounded-2xl p-6 text-left hover:border-purple-300 hover:bg-purple-50 transition"
        >
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
            <Link size={24} className="text-purple-600" />
          </div>
          <h3 className="font-semibold text-lg text-[var(--av-text)] mb-1">Join with Link</h3>
          <p className="text-[var(--av-text-muted)] text-sm">Enter a meeting link</p>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--av-text-disabled)]" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search meetings..."
            className="w-full pl-12 pr-4 py-3 border border-[var(--av-border-strong)] rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <div className="flex bg-[var(--av-surface-2)] rounded-xl p-1">
          {(['all', 'today', 'upcoming'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium transition capitalize ${
                filter === f ? 'bg-[var(--av-surface)] text-[var(--av-text)] shadow-sm' : 'text-[var(--av-text-muted)] hover:text-[var(--av-text)]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Meeting List */}
      <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--av-border)]">
          <h2 className="font-semibold text-[var(--av-text)]">Recent Meetings</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[var(--av-text-muted)]">Loading meetings...</p>
          </div>
        ) : getFilteredMeetings().length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-[var(--av-surface-2)] rounded-full flex items-center justify-center mx-auto mb-4">
              <Video size={32} className="text-[var(--av-text-disabled)]" />
            </div>
            <h3 className="font-medium text-[var(--av-text)] mb-1">No meetings yet</h3>
            <p className="text-[var(--av-text-muted)] text-sm mb-4">Start your first video meeting or schedule one</p>
            <button
              onClick={() => handleStartMeeting(`avenize-${Date.now().toString(36)}`, displayName, true)}
              className="px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg hover:bg-[var(--av-primary-hover)] transition"
            >
              Start Meeting
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {getFilteredMeetings().map(meeting => (
              <div key={meeting.id} className="p-4 hover:bg-gray-50 transition">
                <div className="flex items-center gap-4">
                  {/* Status indicator */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    meeting.status === 'in_progress' 
                      ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' 
                      : meeting.status === 'completed'
                      ? 'bg-[var(--av-surface-2)] text-[var(--av-text-muted)]'
                      : 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]'
                  }`}>
                    {meeting.status === 'in_progress' ? (
                      <div className="w-3 h-3 bg-[var(--av-success)] rounded-full animate-pulse" />
                    ) : (
                      <Video size={20} />
                    )}
                  </div>

                  {/* Meeting info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[var(--av-text)] truncate">{meeting.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-[var(--av-text-muted)] mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {new Date(meeting.date).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {meeting.start_time}
                      </span>
                      {meeting.attendees && meeting.attendees.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users size={14} />
                          {meeting.attendees.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {meeting.status !== 'completed' && (
                      <button
                        onClick={() => handleStartMeeting(meeting.meeting_link?.split('/').pop() || meeting.id, displayName, meeting.host_id === staff?.id)}
                        className="px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg hover:bg-[var(--av-primary-hover)] transition text-sm font-medium"
                      >
                        {meeting.status === 'in_progress' ? 'Rejoin' : 'Join'}
                      </button>
                    )}
                    <button
                      onClick={() => copyMeetingLink(meeting as unknown as ScheduledMeeting)}
                      className="p-2 text-[var(--av-text-disabled)] hover:text-[var(--av-text-muted)] hover:bg-[var(--av-surface-2)] rounded-lg transition"
                      title="Copy link"
                    >
                      <Copy size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Features Info */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Video, title: 'HD Video', desc: 'Crystal clear video calls' },
          { icon: Mic, title: 'Audio', desc: 'Noise-free audio' },
          { icon: Monitor, title: 'Screen Share', desc: 'Share your screen' },
          { icon: Users, title: 'Unlimited', desc: 'Up to 100 participants' },
        ].map((feature, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--av-surface-elevated)] rounded-lg flex items-center justify-center text-[var(--av-primary)]">
              <feature.icon size={20} />
            </div>
            <div>
              <p className="font-medium text-[var(--av-text)]">{feature.title}</p>
              <p className="text-xs text-[var(--av-text-muted)]">{feature.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Video Room Modal */}
      {showVideoRoom && currentRoom && (
        <VideoRoom
          roomName={currentRoom.name}
          displayName={currentRoom.displayName}
          isHost={currentRoom.isHost}
          onClose={handleCloseVideoRoom}
        />
      )}

      {/* Start Meeting Modal */}
      <StartMeetingModal
        isOpen={showStartModal}
        onClose={() => setShowStartModal(false)}
        onStartMeeting={handleStartMeeting}
      />
    </div>
  )
}
