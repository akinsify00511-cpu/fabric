// Image capture modal for Quick Capture (checklist item 3 — Image).
// Preview → validation → client-side compression/resize (canvas, no external
// dep) → confirm. The compressed blob + decoded dimensions are handed to the
// parent, which uploads it as an attachment. OCR runs afterwards from the
// attachment tray (capture-process edge fn).

import { useEffect, useState } from 'react'
import { Image as ImageIcon, X, Loader2, AlertTriangle } from 'lucide-react'
import {
  compressImage,
  formatBytes,
  shouldCompressImage,
  validateCaptureFile,
} from '../../lib/captureAttachments'

interface Props {
  file: File
  onComplete: (result: { blob: Blob; width?: number; height?: number; fileName: string }) => void
  onClose: () => void
}

export default function ImageCapture({ file, onComplete, onClose }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(true)
  const [result, setResult] = useState<{ blob: Blob; width?: number; height?: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)

    const check = validateCaptureFile('image', { name: file.name, type: file.type, size: file.size })
    if (!check.ok) {
      setError(check.reason)
      setProcessing(false)
      return () => URL.revokeObjectURL(url)
    }

    let alive = true
    void (async () => {
      try {
        if (shouldCompressImage(file)) {
          const compressed = await compressImage(file)
          if (alive) setResult(compressed)
        } else {
          // Small image — keep as-is, just decode dimensions
          const bitmap = await createImageBitmap(file)
          if (alive) setResult({ blob: file, width: bitmap.width, height: bitmap.height })
        }
      } catch {
        // Un-decodable image — validation passed on mime but the bytes are bad
        if (alive) setError('That image could not be read. Try a different image.')
      } finally {
        if (alive) setProcessing(false)
      }
    })()
    return () => { alive = false; URL.revokeObjectURL(url) }
  }, [file])

  const compressedSmaller = result && result.blob.size < file.size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-[var(--av-elevation-4)] p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2">
            <ImageIcon size={18} className="text-[var(--av-primary)]" /> Image capture
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--av-text-tertiary)] hover:bg-[var(--av-surface-2)]">
            <X size={16} />
          </button>
        </div>

        {previewUrl && !error && (
          <img src={previewUrl} alt="Selected" className="w-full max-h-64 object-contain rounded-xl border border-[var(--av-border)] bg-[var(--av-surface-2)]" />
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--av-danger)]/10 text-[var(--av-danger)] text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {processing && !error && (
          <div className="py-4 text-center">
            <Loader2 size={22} className="animate-spin mx-auto text-[var(--av-primary)]" />
            <p className="mt-2 text-xs text-[var(--av-text-secondary)]">Preparing the image…</p>
          </div>
        )}

        {!processing && !error && result && (
          <>
            <div className="mt-3 text-xs text-[var(--av-text-secondary)] text-center">
              {result.width && result.height ? `${result.width} × ${result.height} · ` : ''}
              {compressedSmaller
                ? <>Compressed {formatBytes(file.size)} → <b>{formatBytes(result.blob.size)}</b></>
                : formatBytes(result.blob.size)}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)] transition">
                Discard
              </button>
              <button
                onClick={() => onComplete({ blob: result.blob, width: result.width, height: result.height, fileName: file.name })}
                className="px-5 py-2 rounded-xl bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] transition">
                Attach image
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
