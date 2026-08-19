import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import {
  Video, VideoOff, Mic, MicOff, Square, Play, Trash2,
  Loader2, Monitor, Camera, MonitorPlay, Clock, X,
} from 'lucide-react'
import {
  createCapture, uploadRecording, finalizeRecording,
  getRecordingSignedUrl, fetchCaptures, incrementCaptureView,
  type MeetingCapture,
} from '../lib/businessOS'

const BRAND = {
  primary: '#155BB4',
  primaryHover: '#1247A0',
  primarySoft: 'rgba(21, 91, 180, 0.08)',
  surface: '#FFFFFF',
  surface2: '#F8F9FA',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: '#157342',
  danger: '#EA4335',
  warning: '#B45309',
}

type CaptureType = 'screen' | 'camera' | 'screen_with_camera' | 'audio_only'

export default function MeetingCapture() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [captureType, setCaptureType] = useState<CaptureType>('screen')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [captures, setCaptures] = useState<MeetingCapture[]>([])
  const [loading, setLoading] = useState(true)
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)
  const [playingTitle, setPlayingTitle] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadCaptures = useCallback(async () => {
    setLoading(true)
    const list = await fetchCaptures()
    setCaptures(list)
    setLoading(false)
  }, [])

  useEffect(() => { loadCaptures() }, [loadCaptures])

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => cleanupStream(), [cleanupStream])

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '—'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const startRecording = async () => {
    if (!title.trim()) {
      showToast('Enter a title first', 'error')
      return
    }

    try {
      let stream: MediaStream
      if (captureType === 'audio_only') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } else if (captureType === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } else {
        // screen or screen_with_camera
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
        stream = screenStream
        if (captureType === 'screen_with_camera') {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          camStream.getTracks().forEach(t => stream.addTrack(t))
        }
      }
      streamRef.current = stream

      const mimeType = captureType === 'audio_only' ? 'audio/webm' : 'video/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        handleUpload(blob)
        cleanupStream()
      }

      recorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch (err) {
      console.error('Failed to start capture:', err)
      showToast('Could not access camera/microphone. Check browser permissions.', 'error')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }

  const handleUpload = async (blob: Blob) => {
    setIsUploading(true)
    try {
      const result = await createCapture(title, captureType, {
        description: description.trim() || undefined,
      })
      if (!result) {
        showToast('Could not create capture record', 'error')
        return
      }
      const uploaded = await uploadRecording(result.uploadPath, blob)
      if (!uploaded) {
        showToast('Upload failed', 'error')
        return
      }
      const finalized = await finalizeRecording(result.uploadPath, {
        durationSeconds: recordingTime,
        sizeBytes: blob.size,
        captureId: result.captureId,
      })
      if (!finalized) {
        showToast('Recording saved but finalization pending', 'info')
      } else {
        showToast('Capture saved!', 'success')
      }
      setTitle('')
      setDescription('')
      setRecordingTime(0)
      await loadCaptures()
    } catch (err) {
      console.error('Upload failed:', err)
      showToast('Upload failed', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const playCapture = async (capture: MeetingCapture) => {
    if (!capture.storage_path) return
    const url = await getRecordingSignedUrl(capture.storage_path)
    if (!url) {
      showToast('Could not access recording (authorization failed)', 'error')
      return
    }
    setPlayingUrl(url)
    setPlayingTitle(capture.title)
    incrementCaptureView(capture.id)
  }

  const deleteCapture = async (id: string) => {
    if (!confirm('Delete this capture? This cannot be undone.')) return
    try {
      const { error } = await supabase
        .from('meeting_captures')
        .update({ deleted_at: new Date().toISOString(), processing_status: 'expired' })
        .eq('id', id)
      if (error) throw error
      showToast('Capture deleted', 'success')
      await loadCaptures()
    } catch (err) {
      showToast('Failed to delete', 'error')
    }
  }

  const captureTypes: { value: CaptureType; label: string; icon: typeof Monitor }[] = [
    { value: 'screen', label: 'Screen', icon: Monitor },
    { value: 'camera', label: 'Camera', icon: Camera },
    { value: 'screen_with_camera', label: 'Screen + Cam', icon: MonitorPlay },
    { value: 'audio_only', label: 'Audio', icon: Mic },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F9FA' }}>
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold" style={{ color: BRAND.text }}>
            Capture
          </h1>
          <p className="text-sm mt-1" style={{ color: BRAND.textSecondary }}>
            Record screen or camera to share with your team — Loom-style async video.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recording Panel */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: BRAND.text }}>
                New Capture
              </h2>

              <input
                type="text"
                placeholder="Title (required)"
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={isRecording || isUploading}
                className="w-full px-3 py-2.5 rounded-lg text-sm mb-3"
                style={{ border: `1px solid ${BRAND.border}`, backgroundColor: BRAND.surface2, color: BRAND.text }}
              />

              <textarea
                placeholder="Description (optional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={isRecording || isUploading}
                rows={2}
                className="w-full px-3 py-2.5 rounded-lg text-sm mb-4 resize-none"
                style={{ border: `1px solid ${BRAND.border}`, backgroundColor: BRAND.surface2, color: BRAND.text }}
              />

              <div className="mb-4">
                <label className="text-xs font-medium mb-2 block" style={{ color: BRAND.textSecondary }}>
                  Capture type
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {captureTypes.map(ct => (
                    <button
                      key={ct.value}
                      onClick={() => setCaptureType(ct.value)}
                      disabled={isRecording || isUploading}
                      className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-xs transition"
                      style={{
                        backgroundColor: captureType === ct.value ? BRAND.primarySoft : BRAND.surface2,
                        border: `1px solid ${captureType === ct.value ? BRAND.primary : BRAND.border}`,
                        color: captureType === ct.value ? BRAND.primary : BRAND.textSecondary,
                      }}
                    >
                      <ct.icon size={18} />
                      <span>{ct.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={isUploading || !title.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium text-white transition"
                    style={{ backgroundColor: !title.trim() ? BRAND.textMuted : BRAND.primary }}
                  >
                    {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Video size={18} />}
                    {isUploading ? 'Uploading...' : 'Start Recording'}
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium text-white transition"
                    style={{ backgroundColor: BRAND.danger }}
                  >
                    <Square size={16} />
                    Stop ({formatTime(recordingTime)})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Captures List */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl p-6" style={{ backgroundColor: BRAND.surface, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: BRAND.text }}>
                Your Captures
              </h2>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin" size={24} style={{ color: BRAND.textMuted }} />
                </div>
              ) : captures.length === 0 ? (
                <div className="text-center py-12">
                  <Video size={48} className="mx-auto mb-3" style={{ color: BRAND.textMuted }} />
                  <p className="text-sm" style={{ color: BRAND.textSecondary }}>
                    No captures yet. Record your first one to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {captures.map(capture => (
                    <div
                      key={capture.id}
                      className="flex items-center gap-4 p-4 rounded-lg"
                      style={{ backgroundColor: BRAND.surface2, border: `1px solid ${BRAND.border}` }}
                    >
                      <button
                        onClick={() => playCapture(capture)}
                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition"
                        style={{ backgroundColor: BRAND.primarySoft }}
                      >
                        <Play size={20} style={{ color: BRAND.primary }} />
                      </button>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium truncate" style={{ color: BRAND.text }}>
                          {capture.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs flex items-center gap-1" style={{ color: BRAND.textMuted }}>
                            <Clock size={12} />
                            {capture.duration_seconds ? formatTime(capture.duration_seconds) : '—'}
                          </span>
                          <span className="text-xs" style={{ color: BRAND.textMuted }}>
                            {formatSize(capture.size_bytes)}
                          </span>
                          <span className="text-xs" style={{ color: BRAND.textMuted }}>
                            {capture.view_count} views
                          </span>
                          {capture.processing_status !== 'available' && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(180,83,9,0.1)', color: BRAND.warning }}>
                              {capture.processing_status}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => deleteCapture(capture.id)}
                        className="p-2 rounded-lg transition flex-shrink-0"
                        style={{ color: BRAND.textMuted }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Playback Modal */}
      {playingUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={() => { setPlayingUrl(null); setPlayingTitle('') }}
        >
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium">{playingTitle}</h3>
              <button
                onClick={() => { setPlayingUrl(null); setPlayingTitle('') }}
                className="p-2 rounded-lg text-white hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            <video src={playingUrl} controls autoPlay className="w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  )
}
