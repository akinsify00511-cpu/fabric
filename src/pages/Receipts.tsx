import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Receipt, Upload, Loader2, CheckCircle2, XCircle, Eye,
  AlertTriangle, FileText, Trash2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { parseReceiptText, type ParsedReceipt, type Confidence } from '../lib/receiptParser'
import {
  createReceiptUploadPath, finalizeReceiptExtraction, confirmReceipt,
  rejectReceipt, fetchReceipts, receiptSignedUrl, type ReceiptDocument,
} from '../lib/businessOS'

const CONF_STYLE: Record<string, string> = {
  high: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
  medium: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
  low: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
}

const STATUS_STYLE: Record<string, string> = {
  uploaded: 'bg-[var(--av-surface-2)] text-[var(--av-text-muted)]',
  processing: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
  extracted: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
  confirmed: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
  rejected: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
}

function ConfChip({ field, confidence }: { field: string; confidence?: string }) {
  if (!confidence) return null
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CONF_STYLE[confidence] || CONF_STYLE.low}`}>
      {field}: {confidence}
    </span>
  )
}

const CATEGORIES = [
  'operations', 'meals', 'travel', 'office_supplies', 'utilities',
  'software', 'marketing', 'maintenance', 'medical', 'payroll', 'other',
]

export default function Receipts() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [receipts, setReceipts] = useState<ReceiptDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const [draft, setDraft] = useState<ParsedReceipt | null>(null)
  const [draftReceiptId, setDraftReceiptId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setReceipts(await fetchReceipts())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!staff?.business_id) { setLoading(false); return }
    load()
  }, [staff?.business_id, load])

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please upload a receipt image (jpg, png, webp).', 'error')
      return
    }
    setProcessing(true)
    try {
      setProcessingStep('Preparing upload…')
      const up = await createReceiptUploadPath(file.name)
      if (!up) { showToast('Could not prepare the upload.', 'error'); return }

      setProcessingStep('Uploading…')
      const { error: upErr } = await supabase.storage
        .from('receipts')
        .upload(up.storagePath, file, { contentType: file.type })
      if (upErr) { showToast('Upload failed: ' + upErr.message, 'error'); return }

      setProcessingStep('Reading the receipt…')
      const { createWorker } = await import('tesseract.js')
      // Fully self-hosted: worker script, wasm core, and language data are
      // vendored under /public/tesseract — no CDN fetch at runtime.
      const worker = await createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract',
        langPath: '/tesseract/lang',
        gzip: true,
      })
      try {
        const { data } = await worker.recognize(file)
        const parsed = parseReceiptText(data.text || '')
        setDraft(parsed)
        setDraftReceiptId(up.receiptId)
        setProcessingStep('Saving extraction…')
        const ok = await finalizeReceiptExtraction(up.receiptId, data.text || '', {
          vendor: parsed.vendor,
          receipt_number: parsed.receipt_number,
          receipt_date: parsed.receipt_date,
          currency: parsed.currency,
          subtotal: parsed.subtotal,
          tax: parsed.tax,
          discount: parsed.discount,
          total: parsed.total,
          payment_method: parsed.payment_method,
          category: parsed.category,
          expense_account: parsed.expense_account,
          line_items: parsed.line_items,
          field_confidence: parsed.field_confidence,
          overall_confidence: parsed.overall_confidence,
        })
        if (!ok) showToast('Extraction saved locally but could not be stored.', 'error')
      } finally {
        await worker.terminate()
      }
    } catch (e) {
      console.error('[receipts] process failed:', e)
      showToast('Could not read that image. Try a clearer photo.', 'error')
    } finally {
      setProcessing(false)
      setProcessingStep('')
    }
  }

  const updateDraft = (field: keyof ParsedReceipt, value: unknown) => {
    setDraft((d) => (d ? { ...d, [field]: value } : d))
  }

  const handleConfirm = async () => {
    if (!draft || !draftReceiptId) return
    setConfirming(true)
    try {
      // Persist any human edits before confirming.
      const ok = await finalizeReceiptExtraction(draftReceiptId, '', {
        vendor: draft.vendor,
        receipt_number: draft.receipt_number,
        receipt_date: draft.receipt_date,
        currency: draft.currency,
        subtotal: draft.subtotal,
        tax: draft.tax,
        discount: draft.discount,
        total: draft.total,
        payment_method: draft.payment_method,
        category: draft.category,
        expense_account: draft.expense_account,
        line_items: draft.line_items,
        field_confidence: draft.field_confidence,
        overall_confidence: draft.overall_confidence,
      })
      if (!ok) { showToast('Could not save your corrections.', 'error'); return }
      const entryId = await confirmReceipt(draftReceiptId)
      if (!entryId) {
        showToast('Could not confirm — check the total amount.', 'error')
        return
      }
      showToast('Receipt confirmed — expense recorded.', 'success')
      setDraft(null)
      setDraftReceiptId(null)
      await load()
    } finally {
      setConfirming(false)
    }
  }

  const handleReject = async () => {
    if (!draftReceiptId) return
    const ok = await rejectReceipt(draftReceiptId)
    showToast(ok ? 'Receipt discarded.' : 'Could not discard.', ok ? 'success' : 'error')
    setDraft(null)
    setDraftReceiptId(null)
    await load()
  }

  const viewOriginal = async (path: string) => {
    const url = await receiptSignedUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
    else showToast('Could not open the original image.', 'error')
  }

  const conf = (f: string): Confidence | undefined =>
    (draft?.field_confidence?.[f] as Confidence | undefined)

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2 text-[var(--av-text)]">
            <Receipt size={20} className="text-[var(--av-primary)]" /> Receipts
          </h1>
          <p className="text-sm text-[var(--av-text-muted)] mt-1">
            Snap a receipt — Avenize reads it, extracts the details, and you confirm before it becomes an expense.
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        className="av-card p-6 border-2 border-dashed border-[var(--av-border)] text-center cursor-pointer hover:border-[var(--av-primary)] transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) handleFile(f)
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
        {processing ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Loader2 size={28} className="animate-spin text-[var(--av-primary)]" />
            <p className="text-sm text-[var(--av-text-muted)]">{processingStep}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <Upload size={28} className="text-[var(--av-primary)]" />
            <p className="text-sm font-medium text-[var(--av-text)]">Drop a receipt photo, or tap to choose</p>
            <p className="text-xs text-[var(--av-text-muted)]">JPG, PNG or WebP. Nothing is recorded until you confirm.</p>
          </div>
        )}
      </div>

      {/* Review panel */}
      {draft && (
        <div className="av-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--av-text)]">Review what we found</h2>
            <span className={`text-xs px-2 py-1 rounded-full ${draft.overall_confidence > 0.6 ? CONF_STYLE.high : draft.overall_confidence > 0.35 ? CONF_STYLE.medium : CONF_STYLE.low}`}>
              {Math.round(draft.overall_confidence * 100)}% extraction confidence
            </span>
          </div>

          {draft.overall_confidence < 0.35 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--av-warning-soft)]">
              <AlertTriangle size={16} className="text-[var(--av-warning)] mt-0.5 shrink-0" />
              <p className="text-xs text-[var(--av-warning)]">
                We could only partially read this receipt. Check every field carefully before confirming.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Vendor" conf={conf('vendor')}>
              <input value={draft.vendor ?? ''} onChange={(e) => updateDraft('vendor', e.target.value || null)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-[var(--av-surface)]" placeholder="Store / vendor name" />
            </Field>
            <Field label="Receipt number" conf={conf('receipt_number')}>
              <input value={draft.receipt_number ?? ''} onChange={(e) => updateDraft('receipt_number', e.target.value || null)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-[var(--av-surface)]" placeholder="Optional" />
            </Field>
            <Field label="Date" conf={conf('receipt_date')}>
              <input type="date" value={draft.receipt_date ?? ''} onChange={(e) => updateDraft('receipt_date', e.target.value || null)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-[var(--av-surface)]" />
            </Field>
            <Field label="Currency" conf={conf('currency')}>
              <select value={draft.currency} onChange={(e) => updateDraft('currency', e.target.value)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-[var(--av-surface)]">
                {['NGN', 'USD', 'EUR', 'GBP', 'GHS'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Subtotal" conf={conf('subtotal')}>
              <input type="number" step="0.01" value={draft.subtotal ?? ''} onChange={(e) => updateDraft('subtotal', e.target.value ? +e.target.value : null)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-[var(--av-surface)]" />
            </Field>
            <Field label="Tax / VAT" conf={conf('tax')}>
              <input type="number" step="0.01" value={draft.tax ?? ''} onChange={(e) => updateDraft('tax', e.target.value ? +e.target.value : null)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-[var(--av-surface)]" />
            </Field>
            <Field label="Discount" conf={conf('discount')}>
              <input type="number" step="0.01" value={draft.discount ?? ''} onChange={(e) => updateDraft('discount', e.target.value ? +e.target.value : null)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-[var(--av-surface)]" />
            </Field>
            <Field label="Total" conf={conf('total')}>
              <input type="number" step="0.01" value={draft.total ?? ''} onChange={(e) => updateDraft('total', e.target.value ? +e.target.value : null)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm font-semibold bg-[var(--av-surface)]" />
            </Field>
            <Field label="Payment method" conf={conf('payment_method')}>
              <select value={draft.payment_method ?? ''} onChange={(e) => updateDraft('payment_method', e.target.value || null)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-[var(--av-surface)]">
                <option value="">Unknown</option>
                {['cash', 'card', 'pos', 'transfer', 'mobile_money'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Category" conf={conf('category')}>
              <select value={draft.category ?? 'operations'} onChange={(e) => updateDraft('category', e.target.value)}
                className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-[var(--av-surface)]">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
          </div>

          {draft.line_items.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--av-text-muted)] mb-2">Line items we found</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {draft.line_items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-[var(--av-border)] last:border-0">
                    <span className="text-[var(--av-text)] truncate">{item.description}{item.quantity ? ` ×${item.quantity}` : ''}</span>
                    <span className="text-[var(--av-text-muted)] shrink-0 ml-3">{item.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleConfirm}
              disabled={confirming || !draft.total}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium disabled:opacity-50"
            >
              {confirming ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Confirm — record expense
            </button>
            <button
              onClick={handleReject}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--av-border)] text-sm text-[var(--av-text-muted)]"
            >
              <Trash2 size={15} /> Discard
            </button>
          </div>
        </div>
      )}

      {/* Receipt list */}
      <div className="av-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--av-border)] flex items-center gap-2">
          <FileText size={15} className="text-[var(--av-text-muted)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Your receipts</span>
        </div>
        {loading ? (
          <div className="p-6 text-center"><Loader2 size={20} className="animate-spin mx-auto text-[var(--av-primary)]" /></div>
        ) : receipts.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm font-medium text-[var(--av-text)]">Your first receipt</p>
            <p className="text-xs text-[var(--av-text-muted)] max-w-sm mx-auto">
              Snap a photo of any receipt. Avenize reads the vendor, amounts and date — you confirm, and the expense is tracked automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--av-border)]">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--av-text)] truncate">
                    {r.vendor || r.original_filename || 'Receipt'}
                  </p>
                  <p className="text-xs text-[var(--av-text-muted)]">
                    {r.receipt_date || new Date(r.created_at).toLocaleDateString()}
                    {r.total != null && ` · ${r.currency} ${r.total.toLocaleString()}`}
                    {r.overall_confidence != null && ` · ${Math.round(r.overall_confidence * 100)}% confidence`}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full capitalize ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span>
                <button onClick={() => viewOriginal(r.storage_path)} title="View original"
                  className="p-1.5 rounded-lg text-[var(--av-text-muted)] hover:bg-[var(--av-surface-2)]">
                  <Eye size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-[var(--av-text-muted)]">
        Expenses confirmed here appear in <button className="underline" onClick={() => navigate('/app/finance')}>Finance</button>.
      </p>
    </div>
  )
}

function Field({ label, conf, children }: { label: string; conf?: Confidence; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-xs font-medium text-[var(--av-text-muted)] mb-1">
        {label}
        {conf && <ConfChip field="" confidence={conf} />}
      </span>
      {children}
    </label>
  )
}
