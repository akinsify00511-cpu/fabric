// Attachment tray for Quick Capture — the visible list of Clip/Image/Mic
// attachments under the capture input: name, size, upload progress, retry on
// failure, remove, plus OCR extraction cards for images and transcript state
// for audio.

import { FileText, Image as ImageIcon, Mic, RefreshCw, X, Sparkles, Loader2 } from 'lucide-react'
import { CaptureOcr, describeOcrAsText, formatBytes } from '../../lib/captureAttachments'
import type { PendingAttachment } from './useAttachmentUploads'

const KIND_ICON = {
  file: FileText,
  image: ImageIcon,
  audio: Mic,
} as const

interface Props {
  items: PendingAttachment[]
  onRetry: (localId: string) => void
  onRemove: (localId: string) => void
  onUseOcr?: (text: string) => void
  onRunOcr?: (localId: string) => void
  ocrRunning?: string | null
}

export default function AttachmentTray({ items, onRetry, onRemove, onUseOcr, onRunOcr, ocrRunning }: Props) {
  if (items.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      {items.map(it => {
        const Icon = KIND_ICON[it.kind]
        return (
          <div key={it.localId} className="rounded-xl border border-[var(--av-border)] bg-white p-3">
            <div className="flex items-center gap-3">
              {it.previewUrl ? (
                <img src={it.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-[var(--av-border)]" />
              ) : (
                <span className="w-10 h-10 rounded-lg bg-[var(--av-surface-2)] flex items-center justify-center text-[var(--av-text-secondary)]">
                  <Icon size={18} />
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--av-text)] truncate">{it.fileName}</div>
                <div className="text-xs text-[var(--av-text-tertiary)]">
                  {formatBytes(it.sizeBytes)}
                  {it.durationSeconds ? ` · ${Math.round(it.durationSeconds)}s` : ''}
                  {it.state === 'uploading' && ` · uploading ${it.progress}%`}
                  {it.state === 'ready' && ' · attached'}
                  {it.transcript && ' · transcribed'}
                </div>
                {it.state === 'uploading' && (
                  <div className="mt-1.5 h-1 rounded-full bg-[var(--av-surface-2)] overflow-hidden">
                    <div className="h-full bg-[var(--av-primary)] transition-all" style={{ width: `${it.progress}%` }} />
                  </div>
                )}
                {it.state === 'failed' && (
                  <div className="mt-1 text-xs text-[var(--av-danger)]">{it.error ?? 'Upload failed'}</div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {it.state === 'failed' && (
                  <button onClick={() => onRetry(it.localId)} title="Retry upload"
                    className="p-1.5 rounded-lg text-[var(--av-primary)] hover:bg-[var(--av-primary-soft)] transition">
                    <RefreshCw size={15} />
                  </button>
                )}
                <button onClick={() => onRemove(it.localId)} title="Remove"
                  className="p-1.5 rounded-lg text-[var(--av-text-tertiary)] hover:bg-[var(--av-surface-2)] transition">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* OCR extraction for images */}
            {it.kind === 'image' && it.state === 'ready' && (onRunOcr || it.ocr) && (
              <div className="mt-2 pt-2 border-t border-[var(--av-border)]">
                {it.ocr ? (
                  <OcrCard ocr={it.ocr} onUse={onUseOcr ? () => onUseOcr(describeOcrAsText(it.ocr!)) : undefined} />
                ) : ocrRunning === it.localId ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--av-text-secondary)]">
                    <Loader2 size={13} className="animate-spin" /> Reading the image…
                  </div>
                ) : onRunOcr ? (
                  <button onClick={() => onRunOcr(it.localId)}
                    className="flex items-center gap-1.5 text-xs font-medium text-[var(--av-primary)] hover:underline">
                    <Sparkles size={13} /> Extract details (vendor, amount, date)
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OcrCard({ ocr, onUse }: { ocr: CaptureOcr; onUse?: () => void }) {
  const hasAny = ocr.vendor || ocr.amount != null || ocr.date
  return (
    <div className="rounded-lg bg-[var(--av-primary-soft)] p-2.5">
      <div className="text-xs font-medium text-[var(--av-primary)] mb-1 flex items-center gap-1">
        <Sparkles size={12} /> What I read from the image
      </div>
      {hasAny ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--av-text)]">
          {ocr.vendor && <span>Vendor: <b>{ocr.vendor}</b></span>}
          {ocr.amount != null && (
            <span>Amount: <b>{ocr.currency === 'NGN' ? '₦' : ocr.currency === 'USD' ? '$' : ''}{ocr.amount.toLocaleString()}</b></span>
          )}
          {ocr.date && <span>Date: <b>{ocr.date}</b></span>}
          {ocr.confidence != null && <span className="text-[var(--av-text-tertiary)]">({Math.round(ocr.confidence * 100)}% confidence)</span>}
        </div>
      ) : (
        <div className="text-xs text-[var(--av-text-secondary)]">I couldn't read clear details from this image — you can still describe it in words.</div>
      )}
      {onUse && hasAny && (
        <button onClick={onUse} className="mt-1.5 text-xs font-medium text-[var(--av-primary)] hover:underline">
          Use these details in the capture
        </button>
      )}
    </div>
  )
}
