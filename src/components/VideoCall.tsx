// ============================================
// VIDEO CALL COMPONENT - AVENIZE
// WebRTC-based video calling
// ============================================

import { useState, useRef, useEffect, useCallback } from 'react'
import { Video, VideoOff, Mic, MicOff, PhoneOff, Users, Maximize2, Minimize2, Settings } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

interface Participant {
  id: string
  name: string
  videoEnabled: boolean
  audioEnabled: boolean
  stream?: MediaStream
}

interface VideoCallProps {
  roomId: string
  onLeave: () => void
}

export default function VideoCall({ roomId, onLeave }: VideoCallProps) {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  const [isConnecting, setIsConnecting] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initialize local media
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })
      
      localStreamRef.current = stream
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      
      // Add self as participant
      setParticipants([{
        id: staff?.id || 'local',
        name: staff?.full_name || 'You',
        videoEnabled: true,
        audioEnabled: true,
        stream
      }])
      
      setIsConnecting(false)
      
      // Start duration timer
      durationRef.current = setInterval(() => {
        setCallDuration(d => d + 1)
      }, 1000)
      
      // Set up signaling for WebRTC
      await setupSignaling()
      
    } catch (err) {
      console.error('Failed to access media devices:', err)
      setError('Camera/microphone access denied. Please grant permissions.')
      setIsConnecting(false)
    }
  }, [staff?.id, staff?.full_name])

  // Set up WebRTC signaling via Supabase Realtime
  const setupSignaling = async () => {
    if (!staff?.business_id) return

    const channel = supabase.channel(`video-call:${roomId}`)
    
    channel
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.target !== staff?.id) return
        await handleOffer(payload)
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.target !== staff?.id) return
        await handleAnswer(payload)
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.target !== staff?.id) return
        await handleIceCandidate(payload)
      })
      .on('broadcast', { event: 'user-joined' }, async ({ payload }) => {
        if (payload.userId === staff?.id) return
        await createOffer(payload.userId)
      })
      .on('broadcast', { event: 'user-left' }, ({ payload }) => {
        handleUserLeft(payload.userId)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Announce joining
          channel.send({
            type: 'broadcast',
            event: 'user-joined',
            payload: { userId: staff?.id, name: staff?.full_name }
          })
        }
      })
  }

  // Create WebRTC offer
  const createOffer = async (targetUserId: string) => {
    const pc = createPeerConnection(targetUserId)
    
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    
    const channel = supabase.channel(`video-call:${roomId}`)
    await channel.send({
      type: 'broadcast',
      event: 'offer',
      payload: {
        target: targetUserId,
        sender: staff?.id,
        offer
      }
    })
  }

  // Handle incoming offer
  const handleOffer = async ({ sender, offer }: { sender: string; offer: RTCSessionDescriptionInit }) => {
    const pc = createPeerConnection(sender)
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    
    const channel = supabase.channel(`video-call:${roomId}`)
    await channel.send({
      type: 'broadcast',
      event: 'answer',
      payload: { target: sender, sender: staff?.id, answer }
    })
  }

  // Handle incoming answer
  const handleAnswer = async ({ sender, answer }: { sender: string; answer: RTCSessionDescriptionInit }) => {
    const pc = peerConnectionsRef.current.get(sender)
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer))
    }
  }

  // Handle ICE candidate
  const handleIceCandidate = async ({ sender, candidate }: { sender: string; candidate: RTCIceCandidateInit }) => {
    const pc = peerConnectionsRef.current.get(sender)
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  // Create peer connection
  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const existingPc = peerConnectionsRef.current.get(peerId)
    if (existingPc) return existingPc

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    // Add local stream tracks
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!)
    })

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      setParticipants(prev => prev.map(p => 
        p.id === peerId 
          ? { ...p, stream: remoteStream }
          : p
      ))
    }

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const channel = supabase.channel(`video-call:${roomId}`)
        await channel.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { target: peerId, sender: staff?.id, candidate: event.candidate }
        })
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection with ${peerId}: ${pc.connectionState}`)
    }

    peerConnectionsRef.current.set(peerId, pc)
    return pc
  }

  // Handle user leaving
  const handleUserLeft = (userId: string) => {
    const pc = peerConnectionsRef.current.get(userId)
    if (pc) {
      pc.close()
      peerConnectionsRef.current.delete(userId)
    }
    setParticipants(prev => prev.filter(p => p.id !== userId))
  }

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }

  // Toggle audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsAudioEnabled(audioTrack.enabled)
      }
    }
  }

  // Leave call
  const leaveCall = () => {
    // Clean up
    durationRef.current && clearInterval(durationRef.current)
    
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    
    peerConnectionsRef.current.forEach(pc => pc.close())
    peerConnectionsRef.current.clear()
    
    // Announce leaving
    supabase.channel(`video-call:${roomId}`).send({
      type: 'broadcast',
      event: 'user-left',
      payload: { userId: staff?.id }
    })
    
    onLeave()
  }

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // Format duration
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Initialize on mount
  useEffect(() => {
    initializeMedia()
    
    return () => {
      durationRef.current && clearInterval(durationRef.current)
      localStreamRef.current?.getTracks().forEach(track => track.stop())
      peerConnectionsRef.current.forEach(pc => pc.close())
    }
  }, [initializeMedia])

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 max-w-md text-center">
          <VideoOff size={48} className="mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-bold mb-2">Unable to Start Video Call</h2>
          <p className="text-black mb-4">{error}</p>
          <button
            onClick={onLeave}
            className="px-6 py-2 bg-indigo-500 text-white rounded-lg font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Header */}
      <div className="bg-black px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-medium">In Call</span>
          </div>
          <span className="text-black">{formatDuration(callDuration)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-black text-sm">{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 p-4">
        <div className={`grid gap-4 h-full ${
          participants.length === 1 
            ? 'grid-cols-1 place-items-center' 
            : participants.length === 2 
            ? 'grid-cols-2' 
            : participants.length <= 4 
            ? 'grid-cols-2 grid-rows-2'
            : 'grid-cols-3 grid-rows-2'
        }`}>
          {/* Local Video */}
          <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`}
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center text-white text-2xl font-bold">
                  {staff?.full_name?.charAt(0) || 'Y'}
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/100 rounded text-white text-xs">
              {staff?.full_name || 'You'} (You)
            </div>
          </div>

          {/* Remote Participants */}
          {participants.filter(p => p.id !== staff?.id).map(participant => (
            <VideoParticipant key={participant.id} participant={participant} />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black px-4 py-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleAudio}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
              isAudioEnabled ? 'bg-black hover:bg-black text-white' : 'bg-red-500 text-white'
            }`}
          >
            {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
              isVideoEnabled ? 'bg-black hover:bg-black text-white' : 'bg-red-500 text-white'
            }`}
          >
            {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          
          <button
            onClick={leaveCall}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition"
          >
            <PhoneOff size={24} />
          </button>
          
          <button
            onClick={toggleFullscreen}
            className="w-12 h-12 rounded-full bg-black hover:bg-black text-white flex items-center justify-center transition"
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// Individual participant video component
function VideoParticipant({ participant }: { participant: Participant }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  
  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream
    }
  }, [participant.stream])
  
  return (
    <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
      {participant.stream && participant.videoEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center text-white text-2xl font-bold">
            {participant.name.charAt(0)}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/100 rounded text-white text-xs flex items-center gap-1">
        {!participant.audioEnabled && <MicOff size={10} />}
        {participant.name}
      </div>
    </div>
  )
}
