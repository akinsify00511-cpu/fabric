// Quick Capture multimodal attachments (checklist item 3 — Clip/Mic/Image).
// Client layer over the capture_attachments table + private capture-attachments
// bucket. Mirrors the meeting Phase B signed-path pattern (§32): the client
// NEVER uses getPublicUrl — it creates a pending row + private upload path via
// create_capture_attachment, uploads to storage (RLS-scoped), finalizes, and
// reads back via generate_capture_attachment_url + createSignedUrl.

import { supabase } from './supabase'
import { isSchemaAvailable, markSchemaUnavailable, isPermanentSchemaError } from './schemaAvailability'

/** True while the capture-attachment RPC surface (migration 20260819050000)
 *  is present server-side. First permanent drift error flips it false and
 *  every wrapper skips the round trip afterwards (schema-drift breaker). */
function available(name: string): boolean {
  return isSchemaAvailable(`rpc:${name}`)
}
function markPermanent(name: string, error: unknown): void {
  if (isPermanentSchemaError(error as { code?: string; message?: string })) markSchemaUnavailable(`rpc:${name}`)
}

export type CaptureAttachmentKind = 'file' | 'image' | 'audio'

export interface CaptureAttachment {
  id: string
  business_id: string
  staff_id: string | null
  kind: CaptureAttachmentKind
  file_name: string
  mime_type: string
  size_bytes: number | null
  storage_path: string
  status: 'pending' | 'available' | 'failed'
  width: number | null
  height: number | null
  duration_seconds: number | null
  transcript: string | null
  transcript_status: 'pending' | 'completed' | 'failed' | null
  ocr: CaptureOcr | null
  ocr_status: 'pending' | 'completed' | 'failed' | null
  event_id: string | null
  entity_type: string | null
  entity_id: string | null
  created_at: string
}

export interface CaptureOcr {
  vendor: string | null
  amount: number | null
  currency: string | null
  date: string | null
  line_items: Array<{ description: string; amount: number | null }>
  confidence: number
}

// ---------------------------------------------------------------------------
// Pure validation helpers (unit-tested; the RPC re-enforces server-side — §28)
// ---------------------------------------------------------------------------

export const CAPTURE_MAX_BYTES: Record<CaptureAttachmentKind, number> = {
  image: 15 * 1024 * 1024, // 15MB
  audio: 50 * 1024 * 1024, // 50MB
  file: 25 * 1024 * 1024,  // 25MB
}

const FILE_MIME_ALLOWLIST = new Set([
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
])

export function isMimeAllowed(kind: CaptureAttachmentKind, mime: string): boolean {
  if (kind === 'image') return mime.startsWith('image/')
  // MediaRecorder on most browsers produces audio/webm; Chrome Android can
  // produce video/webm for audio-only recordings — accept both.
  if (kind === 'audio') return mime.startsWith('audio/') || mime === 'video/webm'
  return FILE_MIME_ALLOWLIST.has(mime) || mime.startsWith('image/')
}

export function validateCaptureFile(
  kind: CaptureAttachmentKind,
  file: { name: string; type: string; size: number }
): { ok: true } | { ok: false; reason: string } {
  if (!isMimeAllowed(kind, file.type)) {
    return { ok: false, reason: `${kind === 'file' ? 'That file type' : `That is not a supported ${kind} format`} (${file.type || 'unknown'}) isn't supported.` }
  }
  const max = CAPTURE_MAX_BYTES[kind]
  if (file.size > max) {
    return { ok: false, reason: `Too large — ${formatBytes(file.size)} exceeds the ${formatBytes(max)} limit.` }
  }
  if (file.size === 0) {
    return { ok: false, reason: 'That file is empty.' }
  }
  return { ok: true }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function acceptAttrForKind(kind: CaptureAttachmentKind): string {
  if (kind === 'image') return 'image/*'
  if (kind === 'audio') return 'audio/*'
  return '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,image/*'
}

// ---------------------------------------------------------------------------
// Image compression (client-side canvas — no external dependency)
// ---------------------------------------------------------------------------

export const IMAGE_MAX_DIMENSION = 1920
export const IMAGE_COMPRESS_SKIP_BYTES = 300 * 1024 // small images: don't bother

// Compress when the file is large enough that a JPEG re-encode + downscale
// pays off. PNGs with likely transparency stay PNG below the threshold.
export function shouldCompressImage(file: { type: string; size: number }): boolean {
  if (!file.type.startsWith('image/')) return false
  if (file.type === 'image/gif') return false // animated — canvas would freeze frame 1
  return file.size > IMAGE_COMPRESS_SKIP_BYTES
}

export async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: file, width: bitmap.width, height: bitmap.height }
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  )
  return { blob: blob ?? file, width, height }
}

// ---------------------------------------------------------------------------
// OCR → human-readable capture sentence (feeds the existing intent parser)
// ---------------------------------------------------------------------------

// Turns the OCR extraction into one natural-language sentence the intent
// parser (parse-intent) understands. Only identified fields are included —
// never fabricated (§22).
export function describeOcrAsText(ocr: CaptureOcr): string {
  const parts: string[] = []
  if (ocr.vendor) parts.push(`Receipt from ${ocr.vendor}`)
  else parts.push('Receipt')
  if (ocr.amount != null) {
    const symbol = ocr.currency === 'NGN' ? '₦' : ocr.currency === 'USD' ? '$' : ''
    parts.push(`for ${symbol}${ocr.amount.toLocaleString()}`)
  }
  if (ocr.date) parts.push(`on ${ocr.date}`)
  return parts.join(' ') + '.'
}

// The capture_mode value recorded on the business event — how the capture
// was evidenced (default natural_language for plain text).
export function captureModeFor(kinds: CaptureAttachmentKind[], hasVoiceTranscript: boolean): string {
  if (hasVoiceTranscript || kinds.includes('audio')) return 'voice'
  if (kinds.includes('image')) return 'image'
  if (kinds.includes('file')) return 'file'
  return 'natural_language'
}

// ---------------------------------------------------------------------------
// Supabase wrappers (best-effort/non-blocking — §24)
// ---------------------------------------------------------------------------

const BUCKET = 'capture-attachments'

export async function createCaptureAttachment(
  kind: CaptureAttachmentKind,
  fileName: string,
  mimeType: string,
  sizeBytes: number
): Promise<{ attachmentId: string; storagePath: string } | { error: string }> {
  try {
    if (!available('create_capture_attachment')) return { error: 'Attachment service not available yet' }
    const { data, error } = await supabase.rpc('create_capture_attachment', {
      p_kind: kind,
      p_file_name: fileName,
      p_mime_type: mimeType,
      p_size_bytes: sizeBytes,
    })
    if (error) { markPermanent('create_capture_attachment', error); return { error: error.message } }
    if (data?.error) return { error: data.error }
    if (!data?.attachment_id || !data?.storage_path) return { error: 'Upload setup failed' }
    return { attachmentId: data.attachment_id, storagePath: data.storage_path }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Upload setup failed' }
  }
}

export async function finalizeCaptureAttachment(
  attachmentId: string,
  meta: { sizeBytes?: number; width?: number; height?: number; durationSeconds?: number } = {}
): Promise<boolean> {
  try {
    if (!available('finalize_capture_attachment')) return false
    const { data, error } = await supabase.rpc('finalize_capture_attachment', {
      p_attachment_id: attachmentId,
      p_size_bytes: meta.sizeBytes ?? null,
      p_width: meta.width ?? null,
      p_height: meta.height ?? null,
      p_duration_seconds: meta.durationSeconds ?? null,
    })
    if (error) { markPermanent('finalize_capture_attachment', error); return false }
    return data === true
  } catch {
    return false
  }
}

// The §32 access gate: RPC verifies membership, returns the private path,
// then the client creates a short-lived signed URL. Never getPublicUrl.
export async function getCaptureAttachmentSignedUrl(attachmentId: string): Promise<string | null> {
  try {
    if (!available('generate_capture_attachment_url')) return null
    const { data: path, error } = await supabase.rpc('generate_capture_attachment_url', {
      p_attachment_id: attachmentId,
    })
    if (error) { markPermanent('generate_capture_attachment_url', error); return null }
    if (!path) return null
    const { data, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600)
    if (signError || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}

export async function linkCaptureToEvent(attachmentId: string, eventId: string): Promise<boolean> {
  try {
    if (!available('link_capture_to_event')) return false
    const { data, error } = await supabase.rpc('link_capture_to_event', {
      p_attachment_id: attachmentId,
      p_event_id: eventId,
    })
    if (error) { markPermanent('link_capture_to_event', error); return false }
    return data === true
  } catch {
    return false
  }
}

export async function saveCaptureTranscript(attachmentId: string, transcript: string): Promise<boolean> {
  try {
    if (!available('save_capture_transcript')) return false
    const { data, error } = await supabase.rpc('save_capture_transcript', {
      p_attachment_id: attachmentId,
      p_transcript: transcript,
    })
    if (error) { markPermanent('save_capture_transcript', error); return false }
    return data === true
  } catch {
    return false
  }
}

export async function deleteCaptureAttachment(attachmentId: string): Promise<void> {
  try {
    if (!available('delete_capture_attachment')) return
    const { data: path, error } = await supabase.rpc('delete_capture_attachment', {
      p_attachment_id: attachmentId,
    })
    if (error) { markPermanent('delete_capture_attachment', error); return }
    if (path) {
      await supabase.storage.from(BUCKET).remove([path])
    }
  } catch {
    // best-effort
  }
}

export async function listEventAttachments(eventId: string): Promise<CaptureAttachment[]> {
  try {
    if (!available('list_capture_attachments')) return []
    const { data, error } = await supabase.rpc('list_capture_attachments', {
      p_event_id: eventId,
    })
    if (error) { markPermanent('list_capture_attachments', error); return [] }
    return (data || []) as CaptureAttachment[]
  } catch {
    return []
  }
}

// Invoke the capture-process edge function (Whisper transcript / OCR).
export async function processCaptureAttachment(
  attachmentId: string,
  action: 'transcribe' | 'ocr'
): Promise<{ transcript?: string; ocr?: CaptureOcr; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('capture-process', {
      body: { attachment_id: attachmentId, action },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    return data ?? {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Processing failed' }
  }
}

// ---------------------------------------------------------------------------
// Upload with progress + retry (XHR — supabase-js storage.upload exposes no
// progress events; the REST endpoint is the same one it wraps)
// ---------------------------------------------------------------------------

export interface UploadHandle {
  promise: Promise<boolean>
  cancel: () => void
}

export function uploadCaptureFile(
  storagePath: string,
  blob: Blob,
  mimeType: string,
  onProgress: (pct: number) => void
): UploadHandle {
  const xhr = new XMLHttpRequest()
  let settled = false

  const promise = (async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || ''
    const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''
    if (!session?.access_token || !supabaseUrl) return false

    return await new Promise<boolean>((resolve) => {
      xhr.open('POST', `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`)
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
      xhr.setRequestHeader('apikey', anonKey)
      xhr.setRequestHeader('Content-Type', mimeType)
      xhr.setRequestHeader('x-upsert', 'true')
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        settled = true
        resolve(xhr.status >= 200 && xhr.status < 300)
      }
      xhr.onerror = () => { settled = true; resolve(false) }
      xhr.onabort = () => { settled = true; resolve(false) }
      xhr.send(blob)
    })
  })()

  return {
    promise,
    cancel: () => { if (!settled) xhr.abort() },
  }
}
