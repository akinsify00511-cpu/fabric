// ============================================
// MEETINGS PAGE
// Audio transcription and meeting notes
// ============================================

import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  Mic, Search, Filter, Plus, Clock, Calendar, 
  CheckCircle2, AlertCircle, Loader2, Play, 
  FileText, Trash2, Download, Eye, MoreVertical,
  MessageSquare, Users, ChevronRight
} from 'lucide-react'

interface Meeting {
  id: string
  title: string
  date: string
  duration: number
  status: 'recorded' | 'transcribed' | 'summarized'
  transcript?: string
  summary?: string
  participants: number
}

export default function Meetings() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [showRecorder, setShowRecorder] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
    loadMeetings()
  }, [])

  const loadMeetings = async () => {
    setLoading(true)
    // Demo data for now
    setMeetings([
      {
        id: '1',
        title: 'Q4 Planning Session',
        date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        duration: 1845,
        status: 'summarized',
        transcript: 'Today we discussed the new product roadmap and marketing strategy for Q2...',
        summary: 'Key decisions: Focus on mobile-first features, increase social media budget by 20%. Action items: Update roadmap doc, schedule design team sync.',
        participants: 5,
      },
      {
        id: '2',
        title: 'Weekly Standup',
        date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        duration: 900,
        status: 'transcribed',
        transcript: 'Weekly standup meeting discussing progress on current sprint items...',
        participants: 8,
      },
      {
        id: '3',
        title: 'Product Review',
        date: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        duration: 2700,
        status: 'recorded',
        participants: 4,
      },
    ])
    setLoading(false)
  }

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
  }

  const getStatusBadge = (status: Meeting['status']) => {
    switch (status) {
      case 'summarized':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle2 size={10} />
            Summarized
          </span>
        )
      case 'transcribed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <Loader2 size={10} className="animate-spin" />
            Transcribed
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

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Meetings</h1>
          <p className="text-sm text-black/50 mt-0.5">
            Record, transcribe, and summarize your meetings
          </p>
        </div>
        <button
          onClick={() => setShowRecorder(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium"
        >
          <Mic size={16} />
          New Recording
        </button>
      </div>

      {/* Recording Modal */}
      {showRecorder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">New Recording</h2>
              <button
                onClick={() => setShowRecorder(false)}
                className="p-2 hover:bg-black/[0.05] rounded-lg"
              >
                ×
              </button>
            </div>
            
            <div className="flex flex-col items-center py-8">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
                isRecording 
                  ? 'bg-red-100 animate-pulse' 
                  : 'bg-[var(--avenize-accent-end)]/10'
              }`}>
                <Mic size={40} className={isRecording ? 'text-red-500' : 'text-[var(--avenize-accent-end)]'} />
              </div>
              
              <p className="text-2xl font-mono font-bold mb-2">
                {isRecording ? '00:00:00' : 'Ready to record'}
              </p>
              
              <p className="text-sm text-black/50 mb-6">
                {isRecording 
                  ? 'Recording in progress...' 
                  : 'Click to start recording your meeting'}
              </p>
              
              <button
                onClick={() => setIsRecording(!isRecording)}
                className={`px-8 py-3 rounded-full font-medium text-white transition-all ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'fabric-gradient hover:opacity-90'
                }`}
              >
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            type="text"
            placeholder="Search meetings..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm"
          />
        </div>
        <button className="px-4 py-2.5 rounded-xl border border-black/10 text-sm font-medium flex items-center gap-2">
          <Filter size={16} />
          Filters
        </button>
      </div>

      {/* Meetings List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-black/[0.06] p-4 animate-pulse">
              <div className="h-4 bg-black/5 rounded w-3/4 mb-3" />
              <div className="h-3 bg-black/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {meetings.map((meeting) => (
            <div 
              key={meeting.id}
              className="bg-white rounded-xl border border-black/[0.06] p-4 hover:border-[var(--avenize-accent-end)] transition-colors cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-medium text-[var(--avenize-black)] group-hover:text-[var(--avenize-accent-end)] transition-colors">
                    {meeting.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-black/50">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(meeting.date).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatDuration(meeting.duration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {meeting.participants}
                    </span>
                  </div>
                </div>
                {getStatusBadge(meeting.status)}
              </div>

              {meeting.summary && (
                <p className="text-sm text-black/60 line-clamp-2 mb-3">
                  {meeting.summary}
                </p>
              )}

              {meeting.transcript && (
                <p className="text-sm text-black/40 italic line-clamp-1 mb-3">
                  "{meeting.transcript}"
                </p>
              )}

              <div className="flex items-center gap-2 pt-3 border-t border-black/[0.06]">
                <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-black/[0.05] transition-colors">
                  <Eye size={14} />
                  View
                </button>
                <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-black/[0.05] transition-colors">
                  <FileText size={14} />
                  Transcript
                </button>
                {meeting.status === 'recorded' && (
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-black/[0.05] transition-colors text-blue-600">
                    <Mic size={14} />
                    Transcribe
                  </button>
                )}
                <div className="flex-1" />
                <button className="p-1.5 rounded-lg text-black/30 hover:text-black hover:bg-black/[0.05] transition-colors">
                  <MoreVertical size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && meetings.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-black/[0.03] flex items-center justify-center mx-auto mb-4">
            <Mic size={32} className="text-black/20" />
          </div>
          <h3 className="font-medium text-[var(--avenize-black)] mb-1">No recordings yet</h3>
          <p className="text-sm text-black/50 mb-4">
            Start a new recording to transcribe and summarize your meetings.
          </p>
          <button
            onClick={() => setShowRecorder(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium"
          >
            <Mic size={16} />
            Start Recording
          </button>
        </div>
      )}
    </div>
  )
}
