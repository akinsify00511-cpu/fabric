// Upload state manager for Quick Capture attachments (Clip/Mic/Image).
// Each attachment moves: validate → create row+path (RPC) → upload (XHR,
// progress) → finalize (RPC) → ready. Failures keep the blob so a single
// retry re-runs the whole chain; remove cancels in-flight uploads and
// deletes the pending row best-effort.

import { useRef, useState } from 'react'
import {
  CaptureAttachmentKind,
  CaptureOcr,
  UploadHandle,
  createCaptureAttachment,
  deleteCaptureAttachment,
  finalizeCaptureAttachment,
  saveCaptureTranscript,
  uploadCaptureFile,
  validateCaptureFile,
} from '../../lib/captureAttachments'

export interface PendingAttachment {
  localId: string
  kind: CaptureAttachmentKind
  fileName: string
  mimeType: string
  sizeBytes: number
  previewUrl?: string
  progress: number
  state: 'uploading' | 'ready' | 'failed'
  error?: string
  attachmentId?: string
  transcript?: string
  ocr?: CaptureOcr
  width?: number
  height?: number
  durationSeconds?: number
}

let localCounter = 0
const nextLocalId = () => `att-${Date.now()}-${++localCounter}`

export function useAttachmentUploads() {
  const [items, setItems] = useState<PendingAttachment[]>([])
  const blobsRef = useRef<Map<string, Blob>>(new Map())
  const handlesRef = useRef<Map<string, UploadHandle>>(new Map())
  // itemsRef mirrors items so async closures read the latest state without a
  // dependency cycle through setState.
  const itemsRef = useRef<Map<string, PendingAttachment>>(new Map())
  itemsRef.current = new Map(items.map(it => [it.localId, it]))

  function patch(localId: string, p: Partial<PendingAttachment>) {
    setItems(prev => prev.map(it => (it.localId === localId ? { ...it, ...p } : it)))
    const cur = itemsRef.current.get(localId)
    if (cur) itemsRef.current.set(localId, { ...cur, ...p })
  }

  async function runUpload(localId: string) {
    const item = itemsRef.current.get(localId)
    const blob = blobsRef.current.get(localId)
    if (!item || !blob) return

    patch(localId, { state: 'uploading', error: undefined, progress: 0 })

    // 1. Create the pending row + get the private upload path
    const created = await createCaptureAttachment(item.kind, item.fileName, item.mimeType, blob.size)
    if ('error' in created) {
      patch(localId, { state: 'failed', error: created.error })
      return
    }
    patch(localId, { attachmentId: created.attachmentId })

    // 2. Upload with progress
    const handle = uploadCaptureFile(created.storagePath, blob, item.mimeType, pct =>
      patch(localId, { progress: pct })
    )
    handlesRef.current.set(localId, handle)
    const ok = await handle.promise
    handlesRef.current.delete(localId)
    if (!ok) {
      patch(localId, { state: 'failed', error: 'Upload failed. Check your connection and retry.' })
      return
    }

    // 3. Finalize (marks available + stores decoded metadata)
    const finalized = await finalizeCaptureAttachment(created.attachmentId, {
      sizeBytes: blob.size,
      width: item.width,
      height: item.height,
      durationSeconds: item.durationSeconds,
    })
    if (!finalized) {
      patch(localId, { state: 'failed', error: 'Could not finalize the upload.' })
      return
    }
    // Persist an already-known transcript (voice flow) against the row.
    if (item.transcript) {
      void saveCaptureTranscript(created.attachmentId, item.transcript)
    }
    patch(localId, { state: 'ready', progress: 100 })
  }

  function add(
    kind: CaptureAttachmentKind,
    blob: Blob,
    fileName: string,
    extra: Partial<PendingAttachment> = {}
  ): { ok: true; localId: string } | { ok: false; reason: string } {
    const check = validateCaptureFile(kind, { name: fileName, type: blob.type, size: blob.size })
    if (!check.ok) return check
    const localId = nextLocalId()
    blobsRef.current.set(localId, blob)
    const item: PendingAttachment = {
      localId,
      kind,
      fileName,
      mimeType: blob.type || 'application/octet-stream',
      sizeBytes: blob.size,
      progress: 0,
      state: 'uploading',
      ...extra,
    }
    setItems(prev => [...prev, item])
    itemsRef.current.set(localId, item)
    void runUpload(localId)
    return { ok: true, localId }
  }

  // Registers an attachment whose upload already completed elsewhere (the
  // voice flow uploads + transcribes inside its modal, then hands the
  // finished attachment to the tray for display + event linking).
  function registerReady(item: Omit<PendingAttachment, 'localId' | 'state' | 'progress'>) {
    const localId = nextLocalId()
    const full: PendingAttachment = { ...item, localId, state: 'ready', progress: 100 }
    // The voice modal may carry an edited transcript — persist it so the edit
    // is the transcript of record (human verification is the ground truth).
    if (full.attachmentId && full.transcript) {
      void saveCaptureTranscript(full.attachmentId, full.transcript)
    }
    setItems(prev => [...prev, full])
    itemsRef.current.set(localId, full)
    return localId
  }

  function retry(localId: string) {
    void runUpload(localId)
  }

  function remove(localId: string) {
    handlesRef.current.get(localId)?.cancel()
    handlesRef.current.delete(localId)
    const item = itemsRef.current.get(localId)
    if (item?.attachmentId) void deleteCaptureAttachment(item.attachmentId)
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    blobsRef.current.delete(localId)
    itemsRef.current.delete(localId)
    setItems(prev => prev.filter(it => it.localId !== localId))
  }

  const readyAttachments = items.filter(it => it.state === 'ready' && it.attachmentId)
  const hasActiveUploads = items.some(it => it.state === 'uploading')

  return { items, add, registerReady, retry, remove, patchItem: patch, readyAttachments, hasActiveUploads }
}
