import { useMemo, useState, type ReactNode } from 'react'
import { Upload, ClipboardPaste, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { buildLeadImportPreview, type ImportPreview } from '../lib/smartLeadImportPreview'
import type { LeadImportRow } from '../lib/smartLeadImport'

export default function SmartLeadImport({ onImport }: { onImport?: (rows: LeadImportRow[]) => void }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const parsed = useMemo(() => {
    if (!text.trim()) return null
    const lines = text.trim().split(/\r?\n/).filter(Boolean)
    const delimiter = lines[0].includes('\t') ? '\t' : ','
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(line => {
      const cells = line.split(delimiter)
      return Object.fromEntries(headers.map((header, i) => [header, cells[i]?.trim().replace(/^"|"$/g, '') ?? '']))
    })
    return { headers, rows }
  }, [text])
  function previewImport() {
    setError(null)
    if (!parsed || !parsed.rows.length) { setError('Paste a header row followed by at least one lead.'); return }
    setPreview(buildLeadImportPreview(parsed.rows, parsed.headers))
  }
  function handleFile(file?: File) {
    if (!file) return
    if (!/\.(csv|xlsx?|xls)$/i.test(file.name)) { setError('Use a CSV or Excel file.'); return }
    if (/\.csv$/i.test(file.name)) {
      const reader = new FileReader(); reader.onload = () => setText(String(reader.result ?? '')); reader.readAsText(file); return
    }
    setError('Excel parsing needs the spreadsheet parser dependency before production import. CSV and Excel paste are available now.')
  }
  return <div className="rounded-xl border border-[var(--av-border)] bg-[var(--av-surface-elevated)] p-5 space-y-5">
    <div><h2 className="text-lg font-semibold text-[var(--av-text)]">Smart Import Leads</h2><p className="text-sm text-[var(--av-text-muted)]">Paste rows copied from Excel or upload a CSV. Fabric cleans and checks the data before it enters your CRM.</p></div>
    <div className="flex flex-wrap gap-3">
      <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm cursor-pointer"><Upload className="w-4 h-4" /> Upload CSV / Excel<input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files?.[0])} /></label>
      <button type="button" onClick={previewImport} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--av-border)] text-sm"><ClipboardPaste className="w-4 h-4" /> Preview pasted data</button>
    </div>
    <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Copy the header row and lead rows from Excel and paste them here..." className="w-full min-h-40 rounded-lg border border-[var(--av-border)] bg-[var(--av-surface)] p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
    {error && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-sm flex gap-2"><XCircle className="w-4 h-4 shrink-0" />{error}</div>}
    {preview && <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat icon={<CheckCircle2 />} label="Ready" value={preview.cleanRows} /><Stat icon={<AlertTriangle />} label="Duplicates" value={preview.duplicateRows} /><Stat icon={<XCircle />} label="Invalid" value={preview.invalidRows} /><Stat icon={<ClipboardPaste />} label="Total" value={preview.totalRows} /></div>}
    {preview && <div className="rounded-lg bg-[var(--av-surface-2)] p-4 text-sm"><p className="font-medium text-[var(--av-text)] mb-2">Detected mapping</p><div className="flex flex-wrap gap-2">{Object.entries(preview.mapping).filter(([, value]) => value).map(([field, value]) => <span key={field} className="px-2 py-1 rounded-md bg-[var(--av-surface)] border border-[var(--av-border)]">{field} ← {value}</span>)}</div></div>}
    {preview && <button type="button" disabled={!preview.cleanRows} onClick={() => parsed && onImport?.(parsed.rows)} className="px-5 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm disabled:opacity-50">Continue to reconciliation</button>}
  </div>
}
function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) { return <div className="rounded-lg border border-[var(--av-border)] p-3"><div className="flex items-center gap-2 text-[var(--av-text-muted)]">{icon}<span className="text-xs">{label}</span></div><div className="text-xl font-semibold text-[var(--av-text)] mt-1">{value}</div></div> }
