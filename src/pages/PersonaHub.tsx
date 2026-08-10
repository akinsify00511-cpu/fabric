// Persona Intelligence Hub — surfaces the "Last 3 Conversations" addendum
// persona & needs intelligence: §7-§11. Dynamic Persona Profile, Needs
// Identification, Job-to-be-Done, Five Need Types, Persona Journey Map,
// Adaptive Experience, Discovery Loop, Conflict Detection, Success Metrics.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  UserCircle, Loader2, Target, Compass, Repeat, AlertTriangle,
  TrendingUp, BookOpen
} from 'lucide-react'

type Tab = 'profiles' | 'needs' | 'journeys' | 'discovery'

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'profiles', label: 'Persona Profiles', icon: UserCircle },
  { key: 'needs', label: 'Needs & Signals', icon: Target },
  { key: 'journeys', label: 'Journey Maps', icon: Compass },
  { key: 'discovery', label: 'Discovery Loop', icon: Repeat },
]

export default function PersonaHub() {
  const { staff } = useAuth()
  const [tab, setTab] = useState<Tab>('profiles')
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <UserCircle size={24} className="text-[var(--av-primary)]" /> Persona Intelligence
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          Avenize understands not just a user's role, but what they're trying to achieve, what they need, what blocks them, and what would make them materially more effective.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 mb-5 bg-[var(--av-surface)] p-1 rounded-xl">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white text-[var(--av-primary)] shadow-[var(--av-elevation-1)]' : 'text-[var(--av-text-secondary)] hover:text-[var(--av-text)]'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'profiles' && <ProfilesTab bid={staff?.business_id} />}
      {tab === 'needs' && <NeedsTab bid={staff?.business_id} />}
      {tab === 'journeys' && <JourneysTab bid={staff?.business_id} />}
      {tab === 'discovery' && <DiscoveryTab bid={staff?.business_id} />}
    </div>
  )
}

function ProfilesTab({ bid }: { bid?: string }) {
  const [profiles, setProfiles] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)

  async function load() {
    if (!bid) return
    const [p, s] = await Promise.all([
      supabase.from('persona_profiles').select('*,staff:staff_id(name,email)').eq('business_id', bid),
      supabase.from('staff').select('id,name,email,role').eq('business_id', bid),
    ])
    setProfiles(p.data || []); setStaffList(s.data || []); setLoading(false)
  }
  useEffect(() => { load() }, [bid])

  async function createFor(staffId: string) {
    if (!bid) return
    await supabase.from('persona_profiles').insert({ business_id: bid, staff_id: staffId, role: 'staff' })
    load()
  }
  async function save() {
    if (!editing) return
    await supabase.from('persona_profiles').update({
      persona_type: editing.persona_type, objectives: editing.objectives,
      kpis: editing.kpis, responsibilities: editing.responsibilities,
      capability_level: editing.capability_level,
    }).eq('id', editing.id)
    setEditing(null); load()
  }

  if (loading) return <Loading />
  const withProfile = new Set(profiles.map(p => p.staff_id))
  const unprofiled = staffList.filter(s => !withProfile.has(s.id))

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)]">
        A dynamic profile captures identity, role, authority, responsibilities, objectives, KPIs, skills, workload, interaction preferences, common tasks, pain points, behaviour patterns, information/decision/automation needs and accessibility.
      </div>
      {unprofiled.length > 0 && (
        <div className="rounded-xl border border-[var(--av-border)] bg-white p-4">
          <div className="text-sm font-medium text-[var(--av-text)] mb-2">Staff without a persona profile</div>
          <div className="flex flex-wrap gap-2">
            {unprofiled.map(s => (
              <button key={s.id} onClick={() => createFor(s.id)} className="text-xs px-3 py-1.5 bg-[var(--av-primary-soft)] text-[var(--av-primary)] rounded-lg font-medium">+ {s.name}</button>
            ))}
          </div>
        </div>
      )}
      {profiles.map(p => (
        <div key={p.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
          {editing?.id === p.id ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Persona type (CEO, CFO, Manager…)" value={editing.persona_type || ''} onChange={e => setEditing({ ...editing, persona_type: e.target.value })} className="rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm" />
                <select value={editing.capability_level || 'intermediate'} onChange={e => setEditing({ ...editing, capability_level: e.target.value })} className="rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm bg-white">
                  <option value="beginner">beginner</option><option value="intermediate">intermediate</option><option value="advanced">advanced</option><option value="expert">expert</option>
                </select>
              </div>
              <input placeholder="Objectives" value={editing.objectives || ''} onChange={e => setEditing({ ...editing, objectives: e.target.value })} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm" />
              <input placeholder="Responsibilities" value={editing.responsibilities || ''} onChange={e => setEditing({ ...editing, responsibilities: e.target.value })} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm text-[var(--av-text-secondary)]">Cancel</button>
                <button onClick={save} className="px-3 py-1.5 text-sm bg-[var(--av-primary)] text-white rounded-lg font-medium">Save</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-[var(--av-text)]">{p.staff?.name || 'Staff'}</div>
                  <div className="text-xs text-[var(--av-text-tertiary)]">{p.persona_type || '—'} · {p.capability_level}</div>
                </div>
                <button onClick={() => setEditing(p)} className="text-xs px-3 py-1.5 bg-[var(--av-surface-2)] rounded-lg font-medium">Edit</button>
              </div>
              {p.objectives && <div className="text-sm text-[var(--av-text-secondary)] mt-1"><b>Objective:</b> {p.objectives}</div>}
              {p.responsibilities && <div className="text-xs text-[var(--av-text-tertiary)] mt-0.5">{p.responsibilities}</div>}
              <NeedChips needs={p.information_needs} label="Information needs" />
              <NeedChips needs={p.decision_needs} label="Decision needs" />
              <NeedChips needs={p.automation_needs} label="Automation needs" />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function NeedsTab({ bid }: { bid?: string }) {
  const [signals, setSignals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      const { data } = await supabase.from('persona_need_signals').select('*,staff:staff_id(name)').eq('business_id', bid).order('created_at', { ascending: false }).limit(30)
      if (active) { setSignals(data || []); setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])
  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)]">
        Needs are inferred from repeated questions, searches, errors, abandoned workflows, manual exports, support requests and repeated navigation. Each signal maps to a job-to-be-done.
      </div>
      {signals.length === 0 ? <Empty text="No need signals yet. As people use Avenize, friction and recurring needs appear here." /> : signals.map(s => (
        <div key={s.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--av-text)] capitalize">{s.signal_type.replace(/_/g,' ')}</span>
            {s.staff?.name && <span className="text-xs text-[var(--av-text-tertiary)]">{s.staff.name}</span>}
          </div>
          {s.inferred_need && <p className="text-sm text-[var(--av-primary)] mt-1">Inferred need: {s.inferred_need}</p>}
          {s.job_to_be_done && Object.keys(s.job_to_be_done).length > 0 && (
            <p className="text-xs text-[var(--av-text-tertiary)] mt-1">JTBD: {JSON.stringify(s.job_to_be_done)}</p>
          )}
          {s.validated && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--av-success)]/15 text-[var(--av-success)] font-medium">validated</span>}
        </div>
      ))}
    </div>
  )
}

function JourneysTab({ bid }: { bid?: string }) {
  const [journeys, setJourneys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      const { data } = await supabase.from('persona_journeys').select('*').eq('business_id', bid).order('updated_at', { ascending: false })
      if (active) { setJourneys(data || []); setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])
  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)]">
        For every major persona and workflow: trigger → goal → information → decision → action → dependencies → expected outcome → possible failure → recovery path.
      </div>
      {journeys.length === 0 ? <Empty text="No journey maps yet. Document a persona workflow to make the handoffs explicit." /> : journeys.map(j => (
        <div key={j.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
          <div className="font-medium text-[var(--av-text)]">{j.persona_type} · {j.workflow}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
            {j.trigger && <Field label="Trigger" value={j.trigger} />}
            {j.goal && <Field label="Goal" value={j.goal} />}
            {j.decision && <Field label="Decision" value={j.decision} />}
            {j.action && <Field label="Action" value={j.action} />}
            {j.expected_outcome && <Field label="Expected outcome" value={j.expected_outcome} />}
            {j.possible_failure && <Field label="Failure" value={j.possible_failure} />}
            {j.recovery_path && <Field label="Recovery" value={j.recovery_path} />}
          </div>
        </div>
      ))}
    </div>
  )
}

function DiscoveryTab({ bid }: { bid?: string }) {
  const [iterations, setIterations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      const { data } = await supabase.from('persona_discovery_iterations').select('*,staff:staff_id(name)').eq('business_id', bid).order('created_at', { ascending: false })
      if (active) { setIterations(data || []); setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])
  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)] flex items-start gap-2">
        <Repeat size={18} className="text-[var(--av-primary)] mt-0.5" />
        Loop: observe → identify friction → infer underlying need → validate with user → adapt → measure outcome → learn. Each iteration improves the persona model.
      </div>
      {iterations.length === 0 ? <Empty text="No discovery iterations yet." /> : iterations.map(i => (
        <div key={i.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
          {i.staff?.name && <div className="text-xs text-[var(--av-text-tertiary)]">{i.staff.name}</div>}
          {i.observed_behavior && <div className="text-sm text-[var(--av-text)] mt-0.5"><b>Observed:</b> {i.observed_behavior}</div>}
          {i.inferred_need && <div className="text-sm text-[var(--av-primary)]"><b>Inferred:</b> {i.inferred_need}</div>}
          {i.adaptation_made && <div className="text-xs text-[var(--av-text-secondary)]"><b>Adaptation:</b> {i.adaptation_made}</div>}
          {i.learning && <div className="text-xs text-[var(--av-info)] italic mt-1"><BookOpen size={12} className="inline mr-1" />{i.learning}</div>}
        </div>
      ))}
    </div>
  )
}

function Loading() { return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div> }
function Empty({ text }: { text: string }) { return <div className="rounded-xl bg-white p-6 text-center text-sm text-[var(--av-text-tertiary)] shadow-[var(--av-elevation-1)]">{text}</div> }
function Field({ label, value }: { label: string; value: string }) {
  return <div><span className="text-[var(--av-text-tertiary)]">{label}: </span><span className="text-[var(--av-text)]">{value}</span></div>
}
function NeedChips({ needs, label }: { needs: any; label: string }) {
  if (!needs || (Array.isArray(needs) && needs.length === 0)) return null
  return (
    <div className="mt-2">
      <span className="text-[11px] text-[var(--av-text-tertiary)] uppercase">{label}:</span>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {(Array.isArray(needs) ? needs : []).map((n: any, i: number) => (
          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--av-surface-2)] text-[var(--av-text-secondary)]">{typeof n === 'string' ? n : JSON.stringify(n)}</span>
        ))}
      </div>
    </div>
  )
}
