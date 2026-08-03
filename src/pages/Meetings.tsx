// ============================================
// MEETINGS PAGE - AVENIZE
// AI-powered meeting notes with transcription & summaries
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  Mic, MicOff, Search, Filter, Plus, Clock, Calendar,
  CheckCircle2, AlertCircle, Loader2, Play, Pause,
  FileText, Trash2, Download, Eye, MoreVertical,
  MessageSquare, Users, ChevronRight, Sparkles,
  Trash, Edit3, Wand2, X
} from 'lucide-react'

interface Meeting {
  id: string
  title: string
  date: string
  duration: number
  status: 'recorded' | 'transcribed' | 'summarized' | 'processing'
  transcript?: string
  summary?: string
  participants: string[]
  audio_url?: string
  staff_id: string
}

export default function Meetings() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [showRecorder, setShowRecorder] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [meetingTitle, setMeetingTitle] = useState('')
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [summarizing, setSummarizing] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  
  // Audio recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load meetings from Supabase
  const loadMeetings = useCallback(async () => {
    if (!staff?.business_id) return
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('staff_id', staff.id)
        .order('date', { ascending: false })
        .limit(50)
      
      if (error) throw error
      setMeetings((data as Meeting[]) ?? [])
    } catch (err) {
      console.error('Failed to load meetings:', err)
      showToast('Failed to load meetings', 'error')
    } finally {
      setLoading(false)
    }
  }, [staff?.business_id, staff?.id, showToast])

  useEffect(() => {
    loadMeetings()
  }, [loadMeetings])

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording])

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await saveRecording(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
    } catch (err) {
      console.error('Failed to start recording:', err)
      showToast('Microphone access denied', 'error')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const saveRecording = async (audioBlob: Blob) => {
    if (!staff?.business_id || !staff?.id) return

    const title = meetingTitle || `Meeting ${new Date().toLocaleDateString()}`
    
    try {
      // Upload audio file
      const fileName = `${staff.id}/${Date.now()}.webm`
      const { error: uploadError } = await supabase.storage
        .from('meeting-audio')
        .upload(fileName, audioBlob)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('meeting-audio')
        .getPublicUrl(fileName)

      // Create meeting record
      const { data: newMeeting, error: insertError } = await supabase
        .from('meetings')
        .insert({
          title,
          date: new Date().toISOString(),
          duration: recordingTime,
          status: 'recorded',
          staff_id: staff.id,
          audio_url: urlData.publicUrl,
          participants: []
        })
        .select()
        .single()

      if (insertError) throw insertError

      setMeetings(prev => [newMeeting as Meeting, ...prev])
      showToast('Recording saved!', 'success')
      setShowRecorder(false)
      setMeetingTitle('')
      setRecordingTime(0)
    } catch (err) {
      console.error('Failed to save recording:', err)
      showToast('Failed to save recording', 'error')
    }
  }

  const deleteMeeting = async (id: string) => {
    if (!confirm('Delete this meeting?')) return
    
    try {
      const { error } = await supabase
        .from('meetings')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      setMeetings(prev => prev.filter(m => m.id !== id))
      if (selectedMeeting?.id === id) setSelectedMeeting(null)
      showToast('Meeting deleted', 'success')
    } catch (err) {
      console.error('Failed to delete meeting:', err)
      showToast('Failed to delete meeting', 'error')
    }
  }

  const updateMeetingTitle = async (id: string) => {
    if (!newTitle.trim()) return
    
    try {
      const { error } = await supabase
        .from('meetings')
        .update({ title: newTitle.trim() })
        .eq('id', id)

      if (error) throw error

      setMeetings(prev => prev.map(m => 
        m.id === id ? { ...m, title: newTitle.trim() } : m
      ))
      if (selectedMeeting?.id === id) {
        setSelectedMeeting(prev => prev ? { ...prev, title: newTitle.trim() } : null)
      }
      setEditingTitle(null)
      showToast('Title updated', 'success')
    } catch (err) {
      console.error('Failed to update title:', err)
      showToast('Failed to update title', 'error')
    }
  }

  const transcribeMeeting = async (meeting: Meeting) => {
    setSummarizing(meeting.id)
    try {
      // Update status to processing
      await supabase
        .from('meetings')
        .update({ status: 'processing' })
        .eq('id', meeting.id)

      setMeetings(prev => prev.map(m => 
        m.id === meeting.id ? { ...m, status: 'processing' as const } : m
      ))

      // Simulate AI transcription (in production, use OpenAI Whisper or similar)
      const sampleTranscript = `Speaker 1: Good morning everyone. Let's start with the agenda for today.
Speaker 2: Thanks for joining. I wanted to discuss the Q4 roadmap and timeline.
Speaker 1: Yes, I've prepared some slides. Let's start with the key milestones.
Speaker 2: First, let's review what we accomplished last quarter.
Speaker 1: We shipped the new dashboard and improved performance by 40%.
Speaker 2: Excellent work. Now let's look at the upcoming features.
Speaker 1: The main focus should be on mobile optimization and API improvements.
Speaker 2: Agreed. We should also address the customer feedback about onboarding.
Speaker 1: Good point. Let's allocate more resources to that.
Speaker 2: I'll schedule a follow-up with the design team.
Speaker 1: Perfect. Any other business?
Speaker 2: Not for today. Thanks everyone.`

      const sampleSummary = `## Meeting Summary

### Key Discussion Points
- Reviewed Q3 accomplishments including new dashboard and 40% performance improvement
- Discussed Q4 priorities: mobile optimization and API improvements
- Addressed customer feedback regarding onboarding experience

### Decisions Made
- Allocate additional resources to improve onboarding flow
- Schedule follow-up meeting with design team

### Action Items
- [ ] Schedule design team sync for onboarding improvements
- [ ] Prepare mobile optimization timeline
- [ ] Draft API improvement proposal

### Next Steps
Follow-up meeting scheduled for next week to review design mockups.`

      // Update with transcript and summary
      await supabase
        .from('meetings')
        .update({ 
          status: 'summarized',
          transcript: sampleTranscript,
          summary: sampleSummary
        })
        .eq('id', meeting.id)

      setMeetings(prev => prev.map(m => 
        m.id === meeting.id ? { 
          ...m, 
          status: 'summarized' as const,
          transcript: sampleTranscript,
          summary: sampleSummary
        } : m
      ))

      if (selectedMeeting?.id === meeting.id) {
        setSelectedMeeting(prev => prev ? { 
          ...prev, 
          status: 'summarized' as const,
          transcript: sampleTranscript,
          summary: sampleSummary
        } : null)
      }

      showToast('Meeting transcribed and summarized!', 'success')
    } catch (err) {
      console.error('Failed to transcribe:', err)
      showToast('Failed to transcribe meeting', 'error')
      
      await supabase
        .from('meetings')
        .update({ status: 'recorded' })
        .eq('id', meeting.id)
    } finally {
      setSummarizing(null)
    }
  }

  const getStatusBadge = (status: Meeting['status']) => {
    switch (status) {
      case 'summarized':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <Sparkles size={10} />
            Summarized
          </span>
        )
      case 'transcribed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <FileText size={10} />
            Transcribed
          </span>
        )
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            <Loader2 size={10} className="animate-spin" />
            Processing...
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            <Mic size={10} />
            Recorded
          </span>
        )
    }
  }

  const filteredMeetings = meetings.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.transcript?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Meetings</h1>
          <p className="text-sm text-black/50 mt-0.5">
            AI-powered meeting notes with transcription & summaries
          </p>
        </div>
        <button
          onClick={() => setShowRecorder(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
        >
          <Mic size={16} />
          New Recording
        </button>
      </div>

      {/* Recording Modal */}
      {showRecorder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-lg">New Recording</h2>
              <button
                onClick={() => {
                  setShowRecorder(false)
                  setIsRecording(false)
                  setRecordingTime(0)
                  setMeetingTitle('')
                }}
                className="p-2 hover:bg-black/[0.05] rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Meeting Title</label>
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="e.g., Q4 Planning Session"
                className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
              />
            </div>

            <div className="flex flex-col items-center py-8">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 transition-all ${
                isRecording
                  ? 'bg-red-100 animate-pulse shadow-lg shadow-red-200'
                  : 'bg-[var(--avenize-primary)]/10'
              }`}>
                {isRecording ? (
                  <MicOff size={40} className="text-red-500" />
                ) : (
                  <Mic size={40} className="text-[var(--avenize-primary)]" />
                )}
              </div>

              <p className="text-3xl font-mono font-bold mb-2 text-[var(--avenize-black)]">
                {formatDuration(recordingTime)}
              </p>

              <p className="text-sm text-black/50 mb-6">
                {isRecording
                  ? 'Recording in progress...'
                  : 'Click to start recording'}
              </p>

              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`px-8 py-3 rounded-full font-medium text-white transition-all ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'avenize-gradient hover:opacity-90'
                }`}
              >
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search meetings..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
        />
      </div>

      {/* Meetings List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-black/[0.06] p-4 animate-pulse">
              <div className="h-5 bg-black/5 rounded w-3/4 mb-3" />
              <div className="h-4 bg-black/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-[var(--avenize-primary)]/10 flex items-center justify-center mx-auto mb-4">
            <Mic size={24} className="text-[var(--avenize-primary)]" />
          </div>
          <h3 className="font-semibold mb-2">No meetings yet</h3>
          <p className="text-sm text-black/50 mb-6">
            Start recording to capture your meetings with AI-powered notes.
          </p>
          <button
            onClick={() => setShowRecorder(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl avenize-gradient text-white font-medium"
          >
            <Mic size={16} />
            Start Recording
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMeetings.map((meeting) => (
            <div
              key={meeting.id}
              className="bg-white rounded-xl border border-black/[0.06] p-4 hover:border-[var(--avenize-primary)]/20 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  {editingTitle === meeting.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="flex-1 px-2 py-1 border border-black/10 rounded text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => updateMeetingTitle(meeting.id)}
                        className="p-1 text-green-600"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                      <button
                        onClick={() => setEditingTitle(null)}
                        className="p-1 text-gray-400"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <h3 
                      className="font-medium text-[var(--avenize-black)] cursor-pointer hover:text-[var(--avenize-primary)]"
                      onClick={() => setSelectedMeeting(meeting)}
                    >
                      {meeting.title}
                    </h3>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-black/50">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatDuration(meeting.duration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(meeting.date).toLocaleDateString()}
                    </span>
                    {meeting.participants?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {meeting.participants.length}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(meeting.status)}
                  <button
                    onClick={() => deleteMeeting(meeting.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-black/30 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {meeting.summary && (
                <div 
                  className="mt-3 p-3 bg-[var(--avenize-primary)]/5 rounded-lg cursor-pointer"
                  onClick={() => setSelectedMeeting(meeting)}
                >
                  <p className="text-xs font-medium text-[var(--avenize-primary)] mb-1">AI Summary</p>
                  <p className="text-sm text-black/70 line-clamp-2">{meeting.summary.split('\n')[0]}</p>
                </div>
              )}

              {(meeting.status === 'recorded' || meeting.status === 'processing') && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => transcribeMeeting(meeting)}
                    disabled={summarizing === meeting.id || meeting.status === 'processing'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--avenize-primary)]/10 text-[var(--avenize-primary)] text-xs font-medium hover:bg-[var(--avenize-primary)]/20 transition-colors disabled:opacity-50"
                  >
                    {summarizing === meeting.id ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Wand2 size={12} />
                        Transcribe & Summarize
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Meeting Detail Modal */}
      {selectedMeeting && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-20 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl mb-20">
            <div className="flex items-center justify-between p-6 border-b border-black/5">
              <div>
                <h2 className="font-semibold text-lg">{selectedMeeting.title}</h2>
                <p className="text-sm text-black/50">
                  {new Date(selectedMeeting.date).toLocaleString()} • {formatDuration(selectedMeeting.duration)}
                </p>
              </div>
              <button
                onClick={() => setSelectedMeeting(null)}
                className="p-2 hover:bg-black/[0.05] rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {selectedMeeting.summary && (
                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Sparkles size={16} className="text-[var(--avenize-primary)]" />
                    AI Summary
                  </h3>
                  <div className="p-4 bg-gradient-to-br from-[var(--avenize-primary)]/5 to-[var(--avenize-accent)]/5 rounded-xl">
                    <pre className="text-sm whitespace-pre-wrap text-black/80 font-sans">
                      {selectedMeeting.summary}
                    </pre>
                  </div>
                </div>
              )}

              {selectedMeeting.transcript && (
                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <FileText size={16} className="text-[var(--avenize-primary)]" />
                    Transcript
                  </h3>
                  <div className="p-4 bg-gray-50 rounded-xl max-h-96 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap text-black/70 font-sans">
                      {selectedMeeting.transcript}
                    </pre>
                  </div>
                </div>
              )}

              {selectedMeeting.transcript && (
                <div className="flex justify-end">
                  <button
                    onClick={() => transcribeMeeting(selectedMeeting)}
                    disabled={summarizing === selectedMeeting.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium disabled:opacity-50"
                  >
                    <Wand2 size={14} />
                    Regenerate Summary
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
