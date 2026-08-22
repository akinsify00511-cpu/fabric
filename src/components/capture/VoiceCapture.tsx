// Voice capture modal for Quick Capture (checklist item 3 — Mic).
// Fully in-browser flow: getUserMedia (permission) → MediaRecorder (audio
// evidence) + Web Speech API live transcription running on the same mic →
// private upload → editable transcript → the transcript feeds the existing
// parse-intent → confirm → business-event flow. No external transcription
// service. Browsers without SpeechRecognition still save the audio and let
// the user type what they said. Error recovery at every step.

import { useEffect, useRef, useState } from 'react'
import { Mic, X, Square, RefreshCw, Loader2, AlertTriangle, Keyboard } from 'lucide-react'
import {
  createCaptureAttachment,
  deleteCaptureAttachment,
  finalizeCaptureAttachment,
  uploadCaptureFile,
} from '../../lib/captureAttachments'

// Minimal Web Speech API typings (not in lib.dom).
interface SpeechRecognitionResultLite {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEventLite {
  resultIndex: number
  results: SpeechRecognitionResultLite[]
}
interface SpeechRecognitionLite {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionEventLite) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLite) | null {
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  return 'audio/webm'
}

export interface VoiceCaptureResult {
  transcript: string
  attachment: {
    attachmentId: string
    fileName: string
    mimeType: string
    sizeBytes: number
    durationSeconds: number
    transcript: string
  } | null // null in live-speech mode (no audio file)
}

type Phase = 'permission' | 'recording' | 'live' | 'processing' | 'editing' | 'error'

interface Props {
  onComplete: (result: VoiceCaptureResult) => void
  onClose: () => void
}

export default function VoiceCapture({ onComplete, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('permission')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [liveText, setLiveText] = useState('')
  const [transcript, setTranscript] = useState('')
  const [progressLabel, setProgressLabel] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognitionLite | null>(null)
  const finalTranscriptRef = useRef('')
  const cancelledRef = useRef(false)
  // Upload bookkeeping so cancel/error paths can clean up the pending row
  const attachmentIdRef = useRef<string | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const durationRef = useRef(0)

  useEffect(() => {
    cancelledRef.current = false
    void startRecording()
    return () => {
      cancelledRef.current = true
      cleanupMedia()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'recording' && phase !== 'live') return
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  function cleanupMedia() {
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    } catch { /* noop */ }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    try { recognitionRef.current?.abort() } catch { /* noop */ }
    recognitionRef.current = null
  }

  // Start SpeechRecognition on the same mic (when the browser supports it)
  // so the transcript is captured live while MediaRecorder saves the audio.
  function startSpeechRecognition(): boolean {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return false
    finalTranscriptRef.current = ''
    setLiveText('')
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-NG'
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalTranscriptRef.current += r[0].transcript + ' '
        else interim += r[0].transcript
      }
      setLiveText((finalTranscriptRef.current + interim).trim())
    }
    rec.onerror = () => { /* transcription is best-effort; the audio + typing paths remain */ }
    rec.onend = () => { /* stopped alongside the recorder */ }
    recognitionRef.current = rec
    try {
      rec.start()
      return true
    } catch {
      recognitionRef.current = null
      return false
    }
  }

  function stopSpeechRecognition() {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    recognitionRef.current = null
  }

  function capturedTranscript(): string {
    return (finalTranscriptRef.current || liveText).trim()
  }

  async function startRecording() {
    setError(null)
    setElapsed(0)
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // Browser fallback: live speech recognition
      if (getSpeechRecognitionCtor()) return startLive()
      setError('This browser cannot capture audio. Please type your capture instead.')
      setPhase('error')
      return
    }
    setPhase('permission')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const mime = pickAudioMime()
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        if (cancelledRef.current) return
        const blob = new Blob(chunksRef.current, { type: mime })
        blobRef.current = blob
        durationRef.current = elapsed
        stopSpeechRecognition()
        void uploadAndEdit(blob)
      }
      recorderRef.current = recorder
      recorder.start(250)
      startSpeechRecognition()
      setPhase('recording')
    } catch (e) {
      const name = (e as DOMException)?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Microphone access was denied. Allow microphone access in your browser settings and try again.')
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No microphone was found on this device.')
      } else if (name === 'NotReadableError') {
        setError('The microphone is in use by another app. Close it and try again.')
      } else {
        setError('Could not start the microphone.')
      }
      // Error recovery: offer the live-speech fallback if available
      setPhase('error')
    }
  }

  function startLive() {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('This browser supports neither audio recording nor live transcription.')
      setPhase('error')
      return
    }
    setError(null)
    setElapsed(0)
    setLiveText('')
    finalTranscriptRef.current = ''
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-NG'
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalTranscriptRef.current += r[0].transcript + ' '
        else interim += r[0].transcript
      }
      setLiveText((finalTranscriptRef.current + interim).trim())
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') {
        setError('Microphone access was denied.')
        setPhase('error')
      } else if (e.error !== 'aborted') {
        setError('Live transcription stopped. You can edit what was captured.')
        setTranscript((finalTranscriptRef.current || liveText).trim())
        setPhase('editing')
      }
    }
    rec.onend = () => {
      if (cancelledRef.current) return
      setTranscript((finalTranscriptRef.current || liveText).trim())
      setPhase('editing')
    }
    recognitionRef.current = rec
    try {
      rec.start()
      setPhase('live')
    } catch {
      setError('Could not start live transcription.')
      setPhase('error')
    }
  }

  async function uploadAndEdit(blob: Blob) {
    setPhase('processing')
    setProgressLabel('Saving the recording…')

    const created = await createCaptureAttachment('audio', `voice-${Date.now()}.webm`, blob.type, blob.size)
    if ('error' in created) {
      setError(created.error)
      setPhase('error')
      return
    }
    attachmentIdRef.current = created.attachmentId

    const handle = uploadCaptureFile(created.storagePath, blob, blob.type, () => {})
    const ok = await handle.promise
    if (cancelledRef.current) return
    if (!ok) {
      setError('Upload failed. Check your connection and try again.')
      setPhase('error')
      return
    }
    await finalizeCaptureAttachment(created.attachmentId, {
      sizeBytes: blob.size,
      durationSeconds: durationRef.current,
    })

    // The transcript was captured live in the browser (Web Speech API) while
    // recording — no external transcription call. If the browser produced
    // nothing, the editing phase opens empty so the user can type.
    setTranscript(capturedTranscript())
    setPhase('editing')
  }

  function stopRecording() {
    try { recorderRef.current?.stop() } catch { /* noop */ }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function stopLive() {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
  }

  async function discardUploadedAttachment() {
    const id = attachmentIdRef.current
    attachmentIdRef.current = null
    if (id) await deleteCaptureAttachment(id)
  }

  function handleCancel() {
    cancelledRef.current = true
    cleanupMedia()
    void discardUploadedAttachment()
    onClose()
  }

  function handleUse() {
    const text = transcript.trim()
    if (!text) return
    const id = attachmentIdRef.current
    const blob = blobRef.current
    onComplete({
      transcript: text,
      attachment: id && blob ? {
        attachmentId: id,
        fileName: `voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`,
        mimeType: blob.type,
        sizeBytes: blob.size,
        durationSeconds: durationRef.current,
        transcript: text,
      } : null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-[var(--av-elevation-4)] p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2">
            <Mic size={18} className="text-[var(--av-primary)]" /> Voice capture
          </h2>
          <button onClick={handleCancel} className="p-1.5 rounded-lg text-[var(--av-text-tertiary)] hover:bg-[var(--av-surface-2)]">
            <X size={16} />
          </button>
        </div>

        {(phase === 'permission') && (
          <div className="py-8 text-center">
            <Loader2 size={28} className="animate-spin mx-auto text-[var(--av-primary)]" />
            <p className="mt-3 text-sm text-[var(--av-text-secondary)]">Asking for microphone access…</p>
          </div>
        )}

        {(phase === 'recording' || phase === 'live') && (
          <div className="py-6 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-[var(--av-danger)]/10 flex items-center justify-center">
              <span className="w-4 h-4 rounded-full bg-[var(--av-danger)] animate-pulse" />
            </div>
            <div className="mt-3 text-2xl font-semibold text-[var(--av-text)] tabular-nums">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </div>
            <p className="mt-1 text-sm text-[var(--av-text-secondary)]">
              {phase === 'recording' ? 'Listening… describe what happened.' : 'Live transcription… speak clearly.'}
            </p>
            {liveText && (
              <p className="mt-3 text-sm text-[var(--av-text)] bg-[var(--av-surface-2)] rounded-lg p-3 max-h-28 overflow-y-auto">{liveText}</p>
            )}
            <div className="mt-5 flex items-center justify-center gap-3">
              <button onClick={handleCancel}
                className="px-4 py-2 rounded-xl text-sm text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)] transition">
                Cancel
              </button>
              <button onClick={phase === 'recording' ? stopRecording : stopLive}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--av-danger)] text-white text-sm font-medium hover:opacity-90 transition">
                <Square size={14} /> Stop
              </button>
            </div>
          </div>
        )}

        {phase === 'processing' && (
          <div className="py-8 text-center">
            <Loader2 size={28} className="animate-spin mx-auto text-[var(--av-primary)]" />
            <p className="mt-3 text-sm text-[var(--av-text-secondary)]">{progressLabel}</p>
          </div>
        )}

        {phase === 'editing' && (
          <div>
            <p className="text-sm text-[var(--av-text-secondary)] mb-2">
              Check the transcript — edit anything that isn't right. It becomes the capture text.
            </p>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              rows={4}
              autoFocus
              className="w-full rounded-xl border border-[var(--av-border)] p-3 text-sm text-[var(--av-text)] focus:border-[var(--av-primary)] focus:outline-none resize-none"
            />
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => { void discardUploadedAttachment(); setTranscript(''); void startRecording() }}
                className="text-sm text-[var(--av-text-secondary)] hover:text-[var(--av-text)] transition">
                Re-record
              </button>
              <div className="flex gap-2">
                <button onClick={handleCancel}
                  className="px-4 py-2 rounded-xl text-sm text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)] transition">
                  Discard
                </button>
                <button onClick={handleUse} disabled={!transcript.trim()}
                  className="px-5 py-2 rounded-xl bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50 transition">
                  Use transcript
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--av-danger)]/10 text-[var(--av-danger)] text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {attachmentIdRef.current && transcript.trim() === '' && (
                <button onClick={() => setPhase('editing')}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary)] text-white text-sm font-medium">
                  <Keyboard size={14} /> Attach recording & type what you said
                </button>
              )}
              {getSpeechRecognitionCtor() && (
                <button onClick={startLive}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--av-border)] text-sm text-[var(--av-text)] hover:bg-[var(--av-surface-2)]">
                  <Mic size={14} /> Try live transcription instead
                </button>
              )}
              <button onClick={() => { void discardUploadedAttachment(); void startRecording() }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--av-border)] text-sm text-[var(--av-text)] hover:bg-[var(--av-surface-2)]">
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
