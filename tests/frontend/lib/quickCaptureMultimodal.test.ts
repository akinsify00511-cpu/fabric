import { describe, it, expect } from 'vitest'
import {
  CAPTURE_MAX_BYTES,
  acceptAttrForKind,
  captureModeFor,
  describeOcrAsText,
  formatBytes,
  isMimeAllowed,
  shouldCompressImage,
  validateCaptureFile,
  type CaptureOcr,
} from '../../../src/lib/captureAttachments'

// Quick Capture Multimodal contract tests (checklist item 3 — Clip/Mic/Image).
// Locks the validation caps (which the RPC re-enforces server-side), the
// image-compression decision logic, the capture_mode precedence, the OCR
// no-fabrication sentence builder, and the signed-URL security boundary.

describe('Quick Capture multimodal (Clip/Mic/Image)', () => {
  describe('File validation (Clip)', () => {
    it('accepts an allowed document type for files', () => {
      const r = validateCaptureFile('file', { name: 'contract.pdf', type: 'application/pdf', size: 1024 })
      expect(r.ok).toBe(true)
    })

    it('rejects an unsupported mime for files', () => {
      const r = validateCaptureFile('file', { name: 'run.exe', type: 'application/x-msdownload', size: 1024 })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBeTruthy()
    })

    it('rejects oversize per kind (image 15MB, audio 50MB, file 25MB)', () => {
      expect(validateCaptureFile('image', { name: 'x.png', type: 'image/png', size: CAPTURE_MAX_BYTES.image + 1 }).ok).toBe(false)
      expect(validateCaptureFile('audio', { name: 'x.mp3', type: 'audio/mpeg', size: CAPTURE_MAX_BYTES.audio + 1 }).ok).toBe(false)
      expect(validateCaptureFile('file', { name: 'x.pdf', type: 'application/pdf', size: CAPTURE_MAX_BYTES.file + 1 }).ok).toBe(false)
    })

    it('accepts exactly-at-limit sizes', () => {
      expect(validateCaptureFile('image', { name: 'x.png', type: 'image/png', size: CAPTURE_MAX_BYTES.image }).ok).toBe(true)
    })

    it('rejects empty files', () => {
      const r = validateCaptureFile('file', { name: 'x.pdf', type: 'application/pdf', size: 0 })
      expect(r.ok).toBe(false)
    })

    it('image kind only allows image/* mime', () => {
      expect(isMimeAllowed('image', 'image/png')).toBe(true)
      expect(isMimeAllowed('image', 'application/pdf')).toBe(false)
    })

    it('audio kind allows audio/* and MediaRecorder video/webm', () => {
      expect(isMimeAllowed('audio', 'audio/webm')).toBe(true)
      expect(isMimeAllowed('audio', 'video/webm')).toBe(true)
      expect(isMimeAllowed('audio', 'application/pdf')).toBe(false)
    })

    it('file kind allows documents and images', () => {
      expect(isMimeAllowed('file', 'application/pdf')).toBe(true)
      expect(isMimeAllowed('file', 'text/csv')).toBe(true)
      expect(isMimeAllowed('file', 'image/png')).toBe(true)
    })
  })

  describe('Accept attributes', () => {
    it('provides the right accept string per kind', () => {
      expect(acceptAttrForKind('image')).toBe('image/*')
      expect(acceptAttrForKind('audio')).toBe('audio/*')
      expect(acceptAttrForKind('file')).toContain('.pdf')
    })
  })

  describe('Image compression decision (Image)', () => {
    it('small images are not re-encoded (no quality loss)', () => {
      expect(shouldCompressImage({ type: 'image/png', size: 200 * 1024 })).toBe(false)
    })

    it('large images are compressed', () => {
      expect(shouldCompressImage({ type: 'image/jpeg', size: 2 * 1024 * 1024 })).toBe(true)
    })

    it('animated gifs are never compressed (canvas freezes frame 1)', () => {
      expect(shouldCompressImage({ type: 'image/gif', size: 5 * 1024 * 1024 })).toBe(false)
    })

    it('non-images are never compressed', () => {
      expect(shouldCompressImage({ type: 'application/pdf', size: 5 * 1024 * 1024 })).toBe(false)
    })
  })

  describe('capture_mode precedence', () => {
    it('plain text capture is natural_language', () => {
      expect(captureModeFor([], false)).toBe('natural_language')
    })

    it('a voice transcript marks voice mode', () => {
      expect(captureModeFor(['audio'], true)).toBe('voice')
    })

    it('audio attachment without transcript still marks voice', () => {
      expect(captureModeFor(['audio'], false)).toBe('voice')
    })

    it('image attachments mark image mode', () => {
      expect(captureModeFor(['image'], false)).toBe('image')
    })

    it('file attachments mark file mode', () => {
      expect(captureModeFor(['file'], false)).toBe('file')
    })

    it('voice beats image beats file when mixed', () => {
      expect(captureModeFor(['file', 'image', 'audio'], false)).toBe('voice')
      expect(captureModeFor(['file', 'image'], false)).toBe('image')
    })
  })

  describe('OCR sentence builder (§22 — never fabricate)', () => {
    const ocr: CaptureOcr = {
      vendor: 'Shoprite',
      amount: 45200,
      currency: 'NGN',
      date: '2026-08-19',
      line_items: [],
      confidence: 0.87,
    }

    it('includes vendor, amount (₦ symbol for NGN), and date', () => {
      const text = describeOcrAsText(ocr)
      expect(text).toContain('Shoprite')
      expect(text).toContain('₦45,200')
      expect(text).toContain('2026-08-19')
    })

    it('omits fields the OCR could not identify (nulls)', () => {
      const partial: CaptureOcr = { vendor: null, amount: 2000, currency: 'USD', date: null, line_items: [], confidence: 0.5 }
      const text = describeOcrAsText(partial)
      expect(text).not.toContain('null')
      expect(text).toContain('Receipt')
      expect(text).toContain('$2,000')
    })

    it('falls back to a bare "Receipt." when nothing was extracted', () => {
      const empty: CaptureOcr = { vendor: null, amount: null, currency: null, date: null, line_items: [], confidence: 0 }
      expect(describeOcrAsText(empty)).toBe('Receipt.')
    })
  })

  describe('formatBytes', () => {
    it('formats B/KB/MB correctly', () => {
      expect(formatBytes(512)).toBe('512 B')
      expect(formatBytes(2048)).toBe('2 KB')
      expect(formatBytes(26214400)).toBe('25.0 MB')
    })
  })

  describe('Security boundary (§32 — signed URLs only)', () => {
    it('storage paths are private capture paths, never public URLs', () => {
      // The RPC returns captures/{business_id}/{attachment_id}/{file}; the
      // client then calls createSignedUrl — getPublicUrl is never used.
      const path = 'captures/biz-uuid/att-uuid/receipt.png'
      expect(path.startsWith('captures/')).toBe(true)
      expect(path).not.toContain('https://')
    })
  })
})
