// ============================================
// START MEETING MODAL - Quick meeting creation
// ============================================

import { useState } from 'react'
import { Video, Copy, Link, Calendar, Clock, Users, ExternalLink } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useVideoRoom, shareMeetingLink, copyToClipboard } from '../lib/useVideoRoom'

interface StartMeetingModalProps {
  isOpen: boolean
  onClose: () => void
  onStartMeeting: (roomName: string, displayName: string, isHost: boolean) => void
}

export default function StartMeetingModal({ isOpen, onClose, onStartMeeting }: StartMeetingModalProps) {
  const { staff } = useAuth()
  const [meetingType, setMeetingType] = useState<'instant' | 'scheduled'>('instant')
  const [roomName, setRoomName] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [copied, setCopied] = useState(false)

  const displayName = staff?.full_name || staff?.name || 'Guest'
  const defaultRoomName = `avenize-${Date.now().toString(36)}`

  const handleStartInstant = () => {
    const finalRoomName = roomName || defaultRoomName
    onStartMeeting(finalRoomName, displayName, true)
    onClose()
  }

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/meet/${encodeURIComponent(roomName || defaultRoomName)}`
    await copyToClipboard(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShareLink = async () => {
    await shareMeetingLink(roomName || defaultRoomName, displayName)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Video size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Start a Meeting</h2>
          <p className="text-blue-100 mt-1">Video call with anyone, anywhere</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Meeting type tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setMeetingType('instant')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                meetingType === 'instant'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Video size={16} className="inline mr-2" />
              Instant
            </button>
            <button
              onClick={() => setMeetingType('scheduled')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                meetingType === 'scheduled'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calendar size={16} className="inline mr-2" />
              Schedule
            </button>
          </div>

          {meetingType === 'instant' ? (
            <>
              {/* Room name input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Room Name (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder={defaultRoomName}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Leave empty for auto-generated room
                </p>
              </div>

              {/* Meeting link preview */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <Link size={14} />
                  <span>Meeting link:</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white px-3 py-2 rounded-lg text-sm text-gray-800 border truncate">
                    {roomName || defaultRoomName}
                  </code>
                  <button
                    onClick={handleCopyLink}
                    className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition"
                    title="Copy link"
                  >
                    <Copy size={18} />
                  </button>
                </div>
                {copied && (
                  <p className="text-green-600 text-sm mt-2">✓ Link copied to clipboard!</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 py-3 px-4 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-2"
                >
                  <Copy size={18} />
                  Copy Link
                </button>
                <button
                  onClick={handleStartInstant}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
                >
                  <Video size={18} />
                  Start Now
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Scheduled meeting form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Room Name
                  </label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="team-standup"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Time
                    </label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={onClose}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:opacity-90 transition"
              >
                Schedule Meeting
              </button>
            </>
          )}

          {/* Info */}
          <div className="bg-blue-50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Users size={16} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-900">No account needed</p>
                <p className="text-xs text-blue-700 mt-1">
                  Anyone with the link can join your meeting. Powered by Jitsi Meet.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition"
        >
          ×
        </button>
      </div>
    </div>
  )
}
