// Migration Pipeline — Import -> Map -> Clean -> Deduplicate -> Validate ->
// Reconcile -> Migrate -> Verify -> Activate (Doc1 §26). Bring data from
// spreadsheets, existing CRMs and accounting systems into Avenize safely.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { Database, Loader2, ArrowRight, Check, Upload, Plus } from 'lucide-react'

const STAGES = ['import','map','clean','dedup','validate','reconcile','migrate','verify','activate'] as const

export default function MigrationPipeline() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const bid = staff?.business_id
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ source_system: 'csv', target_entity_type: 'customers' })

  async function load() {
    if (!bid) return
    const { data } = await supabase.from('migration_jobs').select('*')
      .eq('business_id', bid).order('created_at', { ascending: false })
    setJobs(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [bid])

  async function create() {
    if (!bid) return
    setCreating(true)
    try {
      const { error } = await supabase.from('migration_jobs').insert({
        business_id: bid, source_system: form.source_system,
        target_entity_type: form.target_entity_type, stage: 'import', status: 'pending',
      })
      if (error) throw error
      showToast('Migration job created', 'success')
      load()
    } catch  { showToast('Could not create job', 'error') } finally { setCreating(false) }
  }

  async function advance(jobId: string, nextStage: string) {
    try {
      await supabase.rpc('advance_migration', { p_job_id: jobId, p_stage: nextStage })
      showToast(`Advanced to ${nextStage}`, 'success')
      load()
    } catch { showToast('Could not advance', 'error') }
  }

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <Database size={24} className="text-[var(--av-primary)]" /> Migration Pipeline
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          Bring data in from spreadsheets, existing CRMs and accounting systems — staged and auditable so nothing corrupts your books.
        </p>
      </div>

      {/* New job */}
      <div className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)] mb-5">
        <h2 className="font-medium text-[var(--av-text)] mb-3 flex items-center gap-2"><Upload size={16} /> New migration job</h2>
        <div className="grid grid-cols-2 gap-3">
          <select value={form.source_system} onChange={e => setForm({ ...form, source_system: e.target.value })}
            className="rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-white">
            <option value="csv">CSV / Spreadsheet</option>
            <option value="quickbooks">QuickBooks</option>
            <option value="hubspot">HubSpot</option>
            <option value="spreadsheet">Excel</option>
            <option value="other">Other</option>
          </select>
          <select value={form.target_entity_type} onChange={e => setForm({ ...form, target_entity_type: e.target.value })}
            className="rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-white">
            <option value="customers">Customers</option>
            <option value="invoices">Invoices</option>
            <option value="products">Products</option>
            <option value="staff">Staff</option>
            <option value="contacts">Contacts</option>
          </select>
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={create} disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus />} Create job
          </button>
        </div>
      </div>

      {/* Jobs + stage tracker */}
      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-sm text-[var(--av-text-tertiary)] shadow-[var(--av-elevation-1)]">No migration jobs yet.</div>
        ) : jobs.map(j => {
          const idx = STAGES.indexOf(j.stage as any)
          return (
            <div key={j.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-medium text-[var(--av-text)]">{j.source_system} → {j.target_entity_type}</span>
                  <span className="text-xs text-[var(--av-text-tertiary)] ml-2">{j.status}</span>
                </div>
                <span className="text-xs text-[var(--av-text-secondary)]">{new Date(j.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {STAGES.map((s, i) => (
                  <div key={s} className="flex items-center">
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-medium ${i < idx ? 'bg-[var(--av-success)]/15 text-[var(--av-success)]' : i === idx ? 'bg-[var(--av-primary)] text-white' : 'bg-[var(--av-surface-2)] text-[var(--av-text-tertiary)]'}`}>
                      {i < idx ? <Check size={12} className="inline" /> : null} {s}
                    </div>
                    {i < STAGES.length - 1 && <ArrowRight size={12} className="text-[var(--av-text-tertiary)] mx-0.5" />}
                  </div>
                ))}
              </div>
              {idx < STAGES.length - 1 && j.status !== 'failed' && (
                <div className="flex justify-end mt-3">
                  <button onClick={() => advance(j.id, STAGES[idx + 1])}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--av-primary-soft)] text-[var(--av-primary)] rounded-lg font-medium hover:bg-[var(--av-primary)] hover:text-white transition">
                    Advance to {STAGES[idx + 1]} <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
