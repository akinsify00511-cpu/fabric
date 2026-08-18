// ============================================
// VIDEO ROOM COMPONENT - Jitsi Meet Integration
// Free, no API key required, works on low bandwidth
// ============================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Users, MessageSquare, MoreVertical, Maximize2, Settings } from 'lucide-react'

interface VideoRoomProps {
  roomName: string
  displayName: string
  onClose: () => void
  isHost?: boolean
}

interface Participant {
  id: string
  name: string
  hasVideo: boolean
  hasAudio: boolean
}

export default function VideoRoom({ roomName, displayName, onClose, isHost = false }: VideoRoomProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isAudioMuted, setIsAudioMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [isConnecting, setIsConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Jitsi Meet domain (use their free server or self-host)
  const JITSI_DOMAIN = 'meet.jit.si'
  
  // Generate room URL
  const roomUrl = `https://${JITSI_DOMAIN}/${encodeURIComponent(roomName)}`

  // Generate random avatar color
  const getAvatarColor = (name: string) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  // Handle postMessage from Jitsi iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from Jitsi
      if (event.data?.type === 'jitsi') {
        const { action, data } = event.data
        
        switch (action) {
          case 'video-conference-joined':
            setIsConnecting(false)
            setError(null)
            break
          case 'video-conference-left':
            onClose()
            break
          case 'participant-joined':
            if (data?.participant) {
              setParticipants(prev => [...prev, {
                id: data.participant.id,
                name: data.participant.displayName,
                hasVideo: true,
                hasAudio: true
              }])
            }
            break
          case 'participant-left':
            if (data?.participant?.id) {
              setParticipants(prev => prev.filter(p => p.id !== data.participant.id))
            }
            break
          case 'audio-muted':
            setIsAudioMuted(true)
            break
          case 'audio-unmuted':
            setIsAudioMuted(false)
            break
          case 'video-muted':
            setIsVideoOff(true)
            break
          case 'video-unmuted':
            setIsVideoOff(false)
            break
          case 'screen-sharing-status-changed':
            setIsScreenSharing(data?.on ?? false)
            break
          case 'error':
            setError(data?.message || 'Meeting error occurred')
            break
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onClose])

  // Execute command in Jitsi iframe
  const executeCommand = useCallback((command: string, value?: string) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'jitsi-command',
        action: command,
        value: value
      }, '*')
    }
  }, [])

  // Toggle audio
  const toggleAudio = () => {
    executeCommand('toggle-audio')
    setIsAudioMuted(!isAudioMuted)
  }

  // Toggle video
  const toggleVideo = () => {
    executeCommand('toggle-video')
    setIsVideoOff(!isVideoOff)
  }

  // Toggle screen share
  const toggleScreenShare = () => {
    executeCommand('toggle-share-screen')
    setIsScreenSharing(!isScreenSharing)
  }

  // End call
  const endCall = () => {
    executeCommand('hangup')
    onClose()
  }

  // Get initials from name
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-[var(--av-success-soft)]0 rounded-full animate-pulse" />
          <span className="text-white font-medium">{roomName}</span>
          <span className="text-gray-400 text-sm">• {participants.length + 1} participants</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => executeCommand('toggle-filmstrip')}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition"
            title="Toggle filmstrip"
          >
            <MoreVertical size={20} />
          </button>
          <button
            onClick={() => executeCommand('toggle-fullscreen')}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition"
            title="Fullscreen"
          >
            <Maximize2 size={20} />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main video area */}
      <div className="flex-1 flex relative">
        {/* Jitsi iframe */}
        <iframe
          ref={iframeRef}
          src={`${roomUrl}#jitsi_meet_context_config=${JSON.stringify({
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: true,
            disableDeepLinking: true,
            disableInviteFunctions: true
          })}`}
          className="flex-1 w-full h-full"
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          style={{ border: 'none' }}
        />

        {/* Loading overlay */}
        {isConnecting && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white text-lg">Connecting to meeting...</p>
              <p className="text-gray-400 text-sm mt-2">{roomName}</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[var(--av-danger)] text-white px-6 py-3 rounded-lg shadow-lg">
            <p>{error}</p>
          </div>
        )}

        {/* Side panel - Participants/Chat */}
        {showChat && (
          <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-white font-medium">Participants ({participants.length + 1})</span>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Self */}
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: getAvatarColor(displayName) }}
                >
                  {getInitials(displayName)}
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm">{displayName}</p>
                  <p className="text-gray-500 text-xs">You</p>
                </div>
                <div className="flex gap-1">
                  {!isAudioMuted ? <Mic size={14} className="text-[var(--av-success)]" /> : <MicOff size={14} className="text-[var(--av-danger)]" />}
                  {!isVideoOff ? <Video size={14} className="text-[var(--av-success)]" /> : <VideoOff size={14} className="text-[var(--av-danger)]" />}
                </div>
              </div>
              
              {/* Other participants */}
              {participants.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                    style={{ backgroundColor: getAvatarColor(p.name) }}
                  >
                    {getInitials(p.name)}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm">{p.name}</p>
                  </div>
                  <div className="flex gap-1">
                    {p.hasAudio ? <Mic size={14} className="text-[var(--av-success)]" /> : <MicOff size={14} className="text-[var(--av-danger)]" />}
                    {p.hasVideo ? <Video size={14} className="text-[var(--av-success)]" /> : <VideoOff size={14} className="text-[var(--av-danger)]" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-gray-900 px-4 py-4">
        <div className="flex items-center justify-center gap-3">
          {/* Audio */}
          <button
            onClick={toggleAudio}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              isAudioMuted 
                ? 'bg-[var(--av-danger)] hover:bg-red-700' 
                : 'bg-gray-700 hover:bg-gray-600'
            } text-white`}
            title={isAudioMuted ? 'Unmute' : 'Mute'}
          >
            {isAudioMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          {/* Video */}
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              isVideoOff 
                ? 'bg-[var(--av-danger)] hover:bg-red-700' 
                : 'bg-gray-700 hover:bg-gray-600'
            } text-white`}
            title={isVideoOff ? 'Start video' : 'Stop video'}
          >
            {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
          </button>

          {/* Screen share */}
          <button
            onClick={toggleScreenShare}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              isScreenSharing 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-gray-700 hover:bg-gray-600'
            } text-white`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            <Monitor size={24} />
          </button>

          {/* Participants */}
          <button
            onClick={() => setShowChat(!showChat)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              showChat 
                ? 'bg-gray-600' 
                : 'bg-gray-700 hover:bg-gray-600'
            } text-white relative`}
            title="Participants"
          >
            <Users size={24} />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--av-primary-soft)]0 rounded-full text-xs flex items-center justify-center">
              {participants.length + 1}
            </span>
          </button>

          {/* End call */}
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-[var(--av-danger)] hover:bg-red-700 flex items-center justify-center text-white transition ml-4"
            title="End call"
          >
            <PhoneOff size={24} />
          </button>
        </div>

        {/* Meeting info */}
        <div className="mt-4 text-center">
          <p className="text-gray-400 text-sm">
            Meeting: <span className="text-white">{roomName}</span>
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Powered by Jitsi Meet • No account required
          </p>
        </div>
      </div>
    </div>
  )
}
