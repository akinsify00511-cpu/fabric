// AI Intent & Data Gateway — the flagship "Tell Avenize what happened"
// capture surface (Architecture §5). A user types (or pastes) natural
// language; we parse intent + entities, show "What I parsed" with
// evidence/confidence/proposed destinations, and on confirm raise a
// business event that downstream modules react to.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { parseIntent } from '../lib/intentParser'
import { useToast } from '../components/Toast'
import { emitBusinessEvent } from '../lib/businessOS'
import {
  Sparkles, Send, Check, X, AlertTriangle, ArrowRight,
  Database, Shield, Loader2, Mic, Paperclip, Image as ImageIcon
} from 'lucide-react'

interface Entity { field: string; value: string; raw: string }
interface Destination { entity_type: string; action: string; reason: string }
interface Intent {
  event_type: string
  summary: string
  entities: Entity[]
  destinations: Destination[]
  confidence: number
  evidence: { source: string; method: string }
  needs_confirmation: boolean
}

interface CaptureAttachment {
  id: string
  name: string
  path: string
  size: number
  type: string
  isImage: boolean
}

interface BrowserSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionResultEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition
  }
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const ATTACHMENT_BUCKET = 'capture-attachments'
const DOCUMENT_ACCEPT = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
].join(',')

function makeAttachmentId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
  return cleaned || 'attachment'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AICapture() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [input, setInput] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [guardrail, setGuardrail] = useState<{ checked: boolean; rung?: string; allowed?: boolean; reason?: string } | null>(null)
  const [parsing, setParsing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [attachments, setAttachments] = useState<CaptureAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)

  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const voiceBaseRef = useRef('')
  const finalVoiceRef = useRef('')

  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    setSpeechSupported(Boolean(SpeechRecognitionCtor))

    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-NG'

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        transcript += result[0]?.transcript || ''
      }

      if (!transcript) return

      let finalTranscript = ''
      let interimTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) finalTranscript += result[0]?.transcript || ''
        else interimTranscript += result[0]?.transcript || ''
      }

      if (finalTranscript) finalVoiceRef.current += `${finalVoiceRef.current ? ' ' : ''}${finalTranscript.trim()}`
      const liveTranscript = `${finalVoiceRef.current}${interimTranscript ? ` ${interimTranscript.trim()}` : ''}`.trim()
      setInput(`${voiceBaseRef.current}${liveTranscript ? `${voiceBaseRef.current ? ' ' : ''}${liveTranscript}` : ''}`.trim())
    }

    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        showToast(`Voice input stopped: ${event.error.replace(/-/g, ' ')}`, 'error')
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition

    return () => {
      recognition.abort()
      recognitionRef.current = null
    }
  }, [showToast])

  function toggleVoice() {
    if (!speechSupported || !recognitionRef.current) {
      showToast('Voice input is not supported in this browser', 'error')
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }

    voiceBaseRef.current = input.trim()
    finalVoiceRef.current = ''
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch (error) {
      console.error(error)
      showToast('Could not start voice input', 'error')
      setIsListening(false)
    }
  }

  async function uploadAttachment(file: File, isImage: boolean) {
    if (!staff?.business_id) {
      showToast('Your business session is not ready yet', 'error')
      return
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      showToast(`${file.name} is larger than the 10 MB limit`, 'error')
      return
    }

    if (!isImage && !DOCUMENT_ACCEPT.split(',').includes(file.type)) {
      showToast('That file type is not supported. Use PDF, Office, CSV or text files.', 'error')
      return
    }

    const id = makeAttachmentId()
    const path = `${staff.business_id}/captures/${id}-${safeFileName(file.name)}`
    setUploading(true)

    try {
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })

      if (error) throw error

      setAttachments(prev => [...prev, {
        id,
        name: file.name,
        path,
        size: file.size,
        type: file.type || 'application/octet-stream',
        isImage,
      }])
    } catch (error) {
      console.error(error)
      showToast(`Could not upload ${file.name}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>, isImage: boolean) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    void Promise.all(files.map(file => uploadAttachment(file, isImage)))
  }

  function removeAttachment(id: string) {
    const attachment = attachments.find(item => item.id === id)
    if (!attachment) return

    // Best-effort cleanup. The capture has not been committed yet, so an
    // orphaned upload must never block the user from continuing.
    void supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.path]).catch(error => {
      console.warn('Capture attachment cleanup failed', error)
    })
    setAttachments(prev => prev.filter(item => item.id !== id))
  }

  async function handleParse() {
    if (!input.trim()) return
    setParsing(true); setIntent(null); setDone(false); setGuardrail(null)
    try {
      const { data, error } = await supabase.functions.invoke('parse-intent', {
        body: { text: input.trim() },
      })
      if (error) throw error
      setIntent(data.intent)
      if (data.guardrail) setGuardrail(data.guardrail)
    } catch (e) {
      // Fallback: local parse so the feature works even if the edge fn
      // isn't deployed yet. Mirrors the edge fn's deterministic parser.
      setIntent(localParse(input.trim()))
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirm() {
    if (!intent || !staff?.business_id || uploading) return
    setConfirming(true)
    try {
      // Raise the canonical business event. Downstream handlers in the
      // event bus (handler_propagate_capture → handler_update_entity_freshness)
      // perform the real writes proposed by each destination.
      const payload: Record<string, any> = {}
      for (const e of intent.entities) payload[e.field] = e.value
      payload._raw = input.trim()
      payload._destinations = intent.destinations
      payload._attachments = attachments.map(attachment => ({
        id: attachment.id,
        name: attachment.name,
        path: attachment.path,
        size: attachment.size,
        type: attachment.type,
      }))

      await emitBusinessEvent({
        business_id: staff.business_id,
        event_type: intent.event_type,
        entity_type: intent.event_type === 'DealWon' ? 'deal'
          : intent.event_type === 'PaymentReceived' ? 'invoice'
          : intent.event_type === 'EmployeeJoined' || intent.event_type === 'EmployeeExited' ? 'staff'
          : intent.event_type === 'InventoryLow' ? 'product'
          : 'note',
        payload,
        related_entities: intent.destinations.map(d => ({ type: d.entity_type, action: d.action })),
        source: 'ai_gateway',
        actor_id: staff.id,
        capture_mode: 'natural_language',
        confidence: intent.confidence,
      })
      setDone(true)
      const actedOn = intent.destinations
        .map(d => d.action.replace(/_/g, ' '))
        .slice(0, 3)
        .join(', ')
      showToast(`Captured — updating: ${actedOn}`, 'success')
    } catch (e) {
      console.error(e)
      showToast('Could not commit the capture', 'error')
    } finally {
      setConfirming(false)
    }
  }

  function reset() {
    if (isListening) recognitionRef.current?.stop()
    setInput(''); setIntent(null); setDone(false); setGuardrail(null); setAttachments([])
    voiceBaseRef.current = ''
    finalVoiceRef.current = ''
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <Sparkles size={24} className="text-[var(--av-primary)]" />
          Tell Avenize what happened
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          Describe an activity in plain language. Avenize interprets it, shows what it parsed, and updates the right records — after you confirm.
        </p>
      </div>

      {/* Examples */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          'We just closed the ABC Properties deal for ₦45m. John handled it and the client will pay 40% upfront.',
          'Client paid ₦2.5m for invoice INV-204 today.',
          'We hired a new sales rep, Tola, started Monday.',
          'Stock of cement is low, only 20 bags left, reorder level is 50.',
        ].map((ex, i) => (
          <button key={i} onClick={() => setInput(ex)}
            className="text-xs px-3 py-1.5 rounded-full bg-[var(--av-surface-2)] text-[var(--av-text-secondary)] hover:bg-[var(--av-primary-soft)] hover:text-[var(--av-primary)] transition">
            {ex.slice(0, 42)}…
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="relative">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={3}
          placeholder="e.g. We closed the ABC deal for ₦45m, John handled it, 40% upfront…"
          className="w-full rounded-2xl border border-[var(--av-border)] bg-white p-4 pr-28 text-[var(--av-text)] placeholder:text-[var(--av-text-tertiary)] focus:border-[var(--av-primary)] focus:outline-none resize-none"
        />

        <input
          ref={attachmentInputRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={event => handleAttachmentChange(event, false)}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={event => handleAttachmentChange(event, true)}
        />

        <div className="absolute right-3 bottom-3 flex items-center gap-1">
          <button
            type="button"
            title={speechSupported ? (isListening ? 'Stop voice input' : 'Voice input') : 'Voice input is not supported in this browser'}
            aria-label={speechSupported ? (isListening ? 'Stop voice input' : 'Start voice input') : 'Voice input is not supported in this browser'}
            onClick={toggleVoice}
            disabled={!speechSupported}
            className={`p-2 rounded-lg transition ${isListening ? 'bg-[var(--av-danger)]/10 text-[var(--av-danger)]' : 'hover:bg-[var(--av-surface-2)] text-[var(--av-text-secondary)]'} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isListening ? <span className="relative flex h-[18px] w-[18px] items-center justify-center"><span className="absolute h-3 w-3 rounded-full bg-[var(--av-danger)] animate-ping opacity-40" /><span className="h-2.5 w-2.5 rounded-full bg-[var(--av-danger)]" /></span> : <Mic size={18} />}
          </button>
          <button
            type="button"
            title="Attach file"
            aria-label="Attach file"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={uploading}
            className="p-2 rounded-lg hover:bg-[var(--av-surface-2)] text-[var(--av-text-secondary)] disabled:opacity-40"
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            title="Add image"
            aria-label="Add image"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
            className="p-2 rounded-lg hover:bg-[var(--av-surface-2)] text-[var(--av-text-secondary)] disabled:opacity-40"
          >
            <ImageIcon size={18} />
          </button>
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Capture attachments">
          {attachments.map(attachment => (
            <div key={attachment.id} className="flex items-center gap-2 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface-2)] px-2.5 py-2 max-w-full">
              {attachment.isImage ? (
                <AttachmentPreview path={attachment.path} name={attachment.name} />
              ) : (
                <Paperclip size={15} className="text-[var(--av-primary)] shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium text-[var(--av-text)] truncate max-w-[190px]">{attachment.name}</div>
                <div className="text-[11px] text-[var(--av-text-tertiary)]">{formatBytes(attachment.size)} · {attachment.isImage ? 'image' : 'file'}</div>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(attachment.id)}
                title={`Remove ${attachment.name}`}
                aria-label={`Remove ${attachment.name}`}
                className="p-1 rounded-md hover:bg-white text-[var(--av-text-secondary)]"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <div className="mt-2 text-xs text-[var(--av-text-secondary)] flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> Uploading attachment…
        </div>
      )}

      <div className="flex justify-end mt-3">
        <button onClick={handleParse} disabled={!input.trim() || parsing || uploading}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50 transition">
          {parsing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          Interpret this
        </button>
      </div>

      {/* What I parsed */}
      {intent && !done && (
        <div className="mt-6 rounded-2xl border border-[var(--av-border)] bg-white shadow-[var(--av-elevation-2)] overflow-hidden">
          <div className="px-5 py-4 bg-[var(--av-surface-2)] border-b border-[var(--av-border)]">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2">
                <Check size={18} className="text-[var(--av-success)]" /> What I parsed
              </h2>
              <ConfidencePill value={intent.confidence} />
            </div>
            <p className="text-xs text-[var(--av-text-tertiary)] mt-1 flex items-center gap-1">
              <Shield size={12} /> Evidence: {intent.evidence.source} · {intent.evidence.method}
            </p>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <span className="text-xs font-medium uppercase text-[var(--av-text-tertiary)]">Detected event</span>
              <div className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)] font-medium text-sm">
                <Database size={14} /> {intent.event_type}
              </div>
            </div>

            {intent.entities.length > 0 && (
              <div>
                <span className="text-xs font-medium uppercase text-[var(--av-text-tertiary)]">Extracted</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {intent.entities.map((e, i) => (
                    <div key={i} className="px-3 py-1.5 rounded-lg bg-[var(--av-surface-2)] text-sm">
                      <span className="text-[var(--av-text-tertiary)]">{e.field}:</span>{' '}
                      <span className="font-medium text-[var(--av-text)]">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="text-xs font-medium uppercase text-[var(--av-text-tertiary)]">Proposed destinations</span>
              <div className="mt-1 space-y-1.5">
                {intent.destinations.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <ArrowRight size={14} className="text-[var(--av-text-tertiary)] mt-0.5 shrink-0" />
                    <span><span className="font-medium text-[var(--av-text)]">{d.entity_type}.{d.action}</span>
                      <span className="text-[var(--av-text-secondary)]"> — {d.reason}</span></span>
                  </div>
                ))}
              </div>
            </div>

            {intent.needs_confirmation && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--av-warning)]/10 text-[var(--av-warning)] text-sm">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                This looks consequential. Avenize won't commit it until you confirm.
              </div>
            )}

            {guardrail && guardrail.checked && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${guardrail.allowed ? 'bg-[var(--av-success)]/10 text-[var(--av-success)]' : 'bg-[var(--av-danger)]/10 text-[var(--av-danger)]'}`}>
                <Shield size={16} className="mt-0.5 shrink-0" />
                <span>
                  <b>AI guardrail:</b> rung <code className="text-xs">{guardrail.rung}</code> — {guardrail.reason}
                  {!guardrail.allowed && ' — action blocked, circuit breaker tripped.'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={reset} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)] transition">
                <X size={16} /> Discard
              </button>
              <button onClick={handleConfirm} disabled={confirming || uploading}
                className="flex items-center gap-2 px-5 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50 transition">
                {confirming ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Confirm & commit
              </button>
            </div>
          </div>
        </div>
      )}

      {done && (
        <div className="mt-6 rounded-2xl border border-[var(--av-success)]/30 bg-[var(--av-success)]/5 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Check size={28} className="text-[var(--av-success)]" />
            <div>
              <h2 className="font-semibold text-[var(--av-text)]">Captured and propagated</h2>
              <p className="text-sm text-[var(--av-text-secondary)]">
                The {intent?.event_type} event is on the bus and handlers wrote to the destination records.
              </p>
            </div>
          </div>
          <div className="space-y-1.5 mb-4">
            {intent?.destinations.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-[var(--av-text-secondary)]">
                <Check size={14} className="text-[var(--av-success)] mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium text-[var(--av-text)]">{d.action.replace(/_/g, ' ')}</span>
                  {' — '}{d.reason}
                </span>
              </div>
            ))}
          </div>
          <button onClick={reset} className="text-[var(--av-primary)] text-sm font-medium hover:underline">
            Capture something else
          </button>
        </div>
      )}
    </div>
  )
}

function AttachmentPreview({ path, name }: { path: string; name: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 60 * 60).then(({ data, error }) => {
      if (active && !error && data?.signedUrl) setPreviewUrl(data.signedUrl)
    })
    return () => { active = false }
  }, [path])

  if (!previewUrl) {
    return <span className="w-10 h-10 rounded-lg bg-[var(--av-primary-soft)] flex items-center justify-center shrink-0"><ImageIcon size={16} className="text-[var(--av-primary)]" /></span>
  }

  return <img src={previewUrl} alt={name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
}

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.8 ? 'var(--av-success)' : value >= 0.6 ? 'var(--av-warning)' : 'var(--av-error)'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {pct}% confidence
    </span>
  )
}

// Local fallback parser — delegates to the shared deterministic parser so
// the edge function and client never diverge.
function localParse(text: string): Intent {
  return parseIntent(text) as Intent
}