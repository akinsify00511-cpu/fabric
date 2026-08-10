// Simulation & Decision Support — model consequential actions before
// executing them (§17; Doc2 §7). Salary increase, mass hire, revenue
// change. Each output is an ESTIMATE with assumptions + ranges. Flow:
// Simulate -> Modify -> Request approval -> Execute -> Audit.

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { FlaskConical, Play, Send, Check, Loader2, AlertCircle, TrendingUp, DollarSign } from 'lucide-react'

type Scenario = 'salary_increase' | 'mass_hire' | 'revenue_change'

const SCENARIOS: { key: Scenario; label: string; icon: any; hint: string }[] = [
  { key: 'salary_increase', label: 'Salary increase', icon: DollarSign, hint: 'Model the payroll, cash and margin impact of a raise.' },
  { key: 'mass_hire', label: 'Hire people', icon: TrendingUp, hint: 'How does new headcount affect payroll coverage?' },
  { key: 'revenue_change', label: 'Revenue change', icon: AlertCircle, hint: 'What if revenue rises or falls?' },
]

export default function Simulation() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [scenario, setScenario] = useState<Scenario>('salary_increase')
  const [inputs, setInputs] = useState<Record<string, string>>({ raise_pct: '10' })
  const [outputs, setOutputs] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [saved, setSaved] = useState(false)

  function setField(k: string, v: string) { setInputs(p => ({ ...p, [k]: v })); setOutputs(null); setSaved(false) }

  async function runSim() {
    if (!staff?.business_id) return
    setRunning(true); setOutputs(null); setSaved(false)
    try {
      const { data, error } = await supabase.rpc('run_simulation', {
        p_business_id: staff.business_id, p_scenario: scenario,
        p_inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])),
      })
      if (error) throw error
      setOutputs(data)
    } catch (e) { console.error(e); showToast('Could not run simulation', 'error') } finally { setRunning(false) }
  }

  async function requestApproval() {
    if (!staff?.business_id || !outputs) return
    setRequesting(true)
    try {
      const { error } = await supabase.from('simulations').insert({
        business_id: staff.business_id, scenario, inputs,
        outputs, status: 'requested', requested_by: staff.id, requested_at: new Date().toISOString(),
      })
      if (error) throw error
      setSaved(true)
      showToast('Simulation sent for approval', 'success')
    } catch (e) { console.error(e); showToast('Could not request approval', 'error') } finally { setRequesting(false) }
  }

  const active = SCENARIOS.find(s => s.key === scenario)!

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <FlaskConical size={24} className="text-[var(--av-primary)]" />
          Simulate before you act
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          Model the downstream impact of a consequential change. Every estimate shows assumptions and a range. Approve before executing.
        </p>
      </div>

      {/* Scenario picker */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {SCENARIOS.map(s => (
          <button key={s.key} onClick={() => { setScenario(s.key); setInputs({}); setOutputs(null); setSaved(false) }}
            className={`text-left p-4 rounded-xl border transition ${scenario === s.key ? 'border-[var(--av-primary)] bg-[var(--av-primary-soft)]' : 'border-[var(--av-border)] bg-white hover:border-[var(--av-primary)]'}`}>
            <s.icon size={20} className={scenario === s.key ? 'text-[var(--av-primary)]' : 'text-[var(--av-text-secondary)]'} />
            <div className="font-medium text-[var(--av-text)] mt-2 text-sm">{s.label}</div>
            <div className="text-xs text-[var(--av-text-tertiary)] mt-0.5">{s.hint}</div>
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="rounded-2xl bg-white p-5 shadow-[var(--av-elevation-1)] mb-5">
        <h2 className="font-semibold text-[var(--av-text)] mb-3 flex items-center gap-2"><active.icon size={18} /> {active.label} — inputs</h2>
        <div className="grid grid-cols-2 gap-4">
          {scenario === 'salary_increase' && (
            <>
              <Field label="Raise (%)" value={inputs.raise_pct ?? ''} onChange={v => setField('raise_pct', v)} placeholder="10" />
              <Field label="Staff ID (optional — blank = all)" value={inputs.staff_id ?? ''} onChange={v => setField('staff_id', v)} placeholder="leave blank for everyone" />
            </>
          )}
          {scenario === 'mass_hire' && (
            <>
              <Field label="How many" value={inputs.count ?? ''} onChange={v => setField('count', v)} placeholder="5" />
              <Field label="Avg annual salary" value={inputs.avg_salary ?? ''} onChange={v => setField('avg_salary', v)} placeholder="50000" />
            </>
          )}
          {scenario === 'revenue_change' && (
            <Field label="Revenue change (%)" value={inputs.delta_pct ?? ''} onChange={v => setField('delta_pct', v)} placeholder="-20" />
          )}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={runSim} disabled={running}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50 transition">
            {running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} Simulate
          </button>
        </div>
      </div>

      {/* Outputs */}
      {outputs && (
        <div className="rounded-2xl border border-[var(--av-border)] bg-white shadow-[var(--av-elevation-2)] overflow-hidden">
          <div className="px-5 py-4 bg-[var(--av-surface-2)] border-b border-[var(--av-border)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--av-text)]">Projected impact</h2>
            <span className="text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--av-warning)]/15 text-[var(--av-warning)]">Estimate — not a guarantee</span>
          </div>
          <div className="p-5 space-y-4">
            <OutputsGrid outputs={outputs} />
            {outputs.alternatives && (
              <div>
                <span className="text-xs font-medium uppercase text-[var(--av-text-tertiary)]">Alternatives to consider</span>
                <div className="mt-1 space-y-1.5">
                  {outputs.alternatives.map((a: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Check size={14} className="text-[var(--av-success)] mt-0.5" />
                      <span className="text-[var(--av-text-secondary)]"><b className="text-[var(--av-text)]">{a.label}</b>
                        {a.note && ` — ${a.note}`}{a.raise_pct && ` — ${a.raise_pct*100}%`}{a.count && ` — ${a.count} hires`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {outputs.assumptions && (
              <div className="text-xs text-[var(--av-text-tertiary)] border-t border-[var(--av-border)] pt-3">
                <b>Assumptions:</b> {Array.isArray(outputs.assumptions) ? outputs.assumptions.join('; ') : outputs.assumptions}
              </div>
            )}
            {!saved ? (
              <div className="flex justify-end pt-2">
                <button onClick={requestApproval} disabled={requesting}
                  className="flex items-center gap-2 px-5 py-2 bg-[var(--av-primary)] text-white rounded-xl font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50 transition">
                  {requesting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Request approval
                </button>
              </div>
            ) : (
              <div className="text-sm text-[var(--av-success)] flex items-center gap-2 pt-2"><Check size={16} /> Sent for approval. An approver can execute or reject it.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OutputsGrid({ outputs }: { outputs: any }) {
  const keys = Object.keys(outputs).filter(k => !['alternatives', 'assumptions', 'type', 'note'].includes(k))
  return (
    <div className="grid grid-cols-2 gap-3">
      {keys.map(k => {
        const o = outputs[k]
        if (!o || typeof o !== 'object') return null
        const isFact = o.type === 'FACT'
        return (
          <div key={k} className="rounded-xl bg-[var(--av-surface)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase text-[var(--av-text-tertiary)]">{k.replace(/_/g, ' ')}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-medium"
                style={{ backgroundColor: isFact ? 'rgba(52,168,83,0.12)' : 'rgba(251,188,5,0.15)', color: isFact ? 'var(--av-success)' : 'var(--av-warning)' }}>
                {o.type || 'ESTIMATE'}
              </span>
            </div>
            <div className="text-xl font-semibold text-[var(--av-text)] mt-1">{fmt(o.value)}</div>
            {o.range_low != null && o.range_high != null && (
              <div className="text-[11px] text-[var(--av-text-tertiary)]">range {fmt(o.range_low)} – {fmt(o.range_high)}</div>
            )}
            {o.assumption && <div className="text-[11px] text-[var(--av-text-secondary)] mt-1">{o.assumption}</div>}
          </div>
        )
      })}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--av-text-secondary)]">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-[var(--av-border)] bg-white px-3 py-2 text-[var(--av-text)] focus:border-[var(--av-primary)] focus:outline-none" />
    </label>
  )
}
function fmt(v: any): string {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isInteger(n)) return n.toLocaleString()
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 })
}
