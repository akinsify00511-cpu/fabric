import { useEffect, useMemo, useState } from 'react'
import { Building2, Plus, Save, Users, Target, BriefcaseBusiness, ChevronRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useBusiness } from '../lib/BusinessContext'
import { useAuth } from '../lib/AuthContext'

interface Subsidiary {
  business_id: string
  display_name: string
  legal_name: string | null
  description: string | null
  industry: string | null
  business_model: string | null
  target_customer: string | null
  currency_code: string
  country_code: string
  timezone: string
  logo_url: string | null
  primary_color: string | null
  website_url: string | null
  phone: string | null
  email: string | null
  address: string | null
  revenue_target: number | null
  sales_target: number | null
}

const EMPTY: Partial<Subsidiary> = {
  display_name: '', legal_name: '', description: '', industry: '', business_model: '',
  target_customer: '', currency_code: 'NGN', country_code: 'NG', timezone: 'Africa/Lagos',
  logo_url: '', primary_color: '#2563EB', website_url: '', phone: '', email: '', address: '',
  revenue_target: null, sales_target: null,
}

export default function Subsidiaries() {
  const { staff } = useAuth()
  const { accessibleBusinesses, activeBusinessId, setActiveBusiness, refresh } = useBusiness()
  const canManage = staff?.role === 'owner' || staff?.role === 'admin'
  const [profiles, setProfiles] = useState<Subsidiary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(activeBusinessId)
  const [draft, setDraft] = useState<Partial<Subsidiary>>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createIndustry, setCreateIndustry] = useState('')
  const [createModel, setCreateModel] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const visibleIds = useMemo(() => accessibleBusinesses.map(b => b.business_id), [accessibleBusinesses])

  async function loadProfiles() {
    if (!visibleIds.length) { setProfiles([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('subsidiary_profiles')
      .select('*')
      .in('business_id', visibleIds)
      .order('display_name')
    if (!error) setProfiles((data ?? []) as Subsidiary[])
    setLoading(false)
  }

  useEffect(() => { loadProfiles() }, [visibleIds.join(',')])

  useEffect(() => {
    const id = selectedId ?? activeBusinessId
    const profile = profiles.find(p => p.business_id === id)
    if (profile) setDraft(profile)
  }, [selectedId, activeBusinessId, profiles])

  function selectSubsidiary(id: string) {
    setSelectedId(id)
    setActiveBusiness(id)
  }

  async function saveProfile() {
    if (!draft.business_id || !canManage) return
    setSaving(true)
    const payload = {
      display_name: draft.display_name?.trim(), legal_name: draft.legal_name || null,
      description: draft.description || null, industry: draft.industry || null,
      business_model: draft.business_model || null, target_customer: draft.target_customer || null,
      currency_code: draft.currency_code || 'NGN', country_code: draft.country_code || 'NG',
      timezone: draft.timezone || 'Africa/Lagos', logo_url: draft.logo_url || null,
      primary_color: draft.primary_color || null, website_url: draft.website_url || null,
      phone: draft.phone || null, email: draft.email || null, address: draft.address || null,
      revenue_target: draft.revenue_target ?? null, sales_target: draft.sales_target ?? null,
    }
    const { error } = await supabase.from('subsidiary_profiles').update(payload).eq('business_id', draft.business_id)
    setSaving(false)
    if (error) { alert(`Could not save subsidiary profile: ${error.message}`); return }
    await loadProfiles()
  }

  async function createSubsidiary() {
    if (!createName.trim() || !canManage) return
    setCreating(true)
    const { data, error } = await supabase.rpc('create_subsidiary', {
      p_name: createName.trim(),
      p_industry: createIndustry.trim() || null,
      p_business_model: createModel.trim() || null,
      p_description: createDescription.trim() || null,
    })
    setCreating(false)
    if (error) { alert(`Could not create subsidiary: ${error.message}`); return }
    setShowCreate(false)
    setCreateName(''); setCreateIndustry(''); setCreateModel(''); setCreateDescription('')
    await refresh()
    await loadProfiles()
    if (typeof data === 'string') { setSelectedId(data); setActiveBusiness(data) }
  }

  const selected = profiles.find(p => p.business_id === (selectedId ?? activeBusinessId))

  return (
    <div className="max-w-7xl mx-auto pb-20 px-1">
      <div className="flex items-center justify-between mb-7">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center"><Building2 size={22} className="text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-black">Subsidiaries</h1>
              <p className="text-sm text-black/55">Each business gets its own profile, CRM configuration and operating context.</p>
            </div>
          </div>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white text-sm font-medium">
            <Plus size={17} /> Create subsidiary
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-5">
        <aside className="bg-white border border-black/[0.07] rounded-2xl overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-black/[0.06] font-semibold text-sm">Business portfolio</div>
          {loading ? <div className="p-6 text-sm text-black/50">Loading subsidiaries…</div> : profiles.map(p => (
            <button key={p.business_id} onClick={() => selectSubsidiary(p.business_id)} className={`w-full text-left p-4 border-b border-black/[0.05] flex items-center gap-3 ${p.business_id === (selectedId ?? activeBusinessId) ? 'bg-blue-50' : 'hover:bg-black/[0.02]'}`}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: p.primary_color || '#2563EB' }}><Building2 size={17} className="text-white" /></div>
              <div className="min-w-0 flex-1"><div className="font-medium truncate">{p.display_name}</div><div className="text-xs text-black/45 truncate">{p.industry || 'Business'} · {p.currency_code}</div></div>
              <ChevronRight size={16} className="text-black/30" />
            </button>
          ))}
        </aside>

        <section className="bg-white border border-black/[0.07] rounded-2xl p-6">
          {!selected ? <div className="py-16 text-center text-black/50">Select a subsidiary to configure its operating profile.</div> : <>
            <div className="flex items-start justify-between gap-4 mb-7">
              <div><p className="text-xs uppercase tracking-wider text-blue-600 font-semibold mb-1">Operating profile</p><h2 className="text-xl font-bold">{selected.display_name}</h2><p className="text-sm text-black/50 mt-1">This profile drives the subsidiary experience and CRM defaults.</p></div>
              <button disabled={saving || !canManage} onClick={saveProfile} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm disabled:opacity-50"><Save size={16} /> {saving ? 'Saving…' : 'Save profile'}</button>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <Field label="Display name" value={draft.display_name ?? ''} onChange={v => setDraft({ ...draft, display_name: v })} />
              <Field label="Legal name" value={draft.legal_name ?? ''} onChange={v => setDraft({ ...draft, legal_name: v })} />
              <Field label="Industry" value={draft.industry ?? ''} onChange={v => setDraft({ ...draft, industry: v })} placeholder="e.g. Roofing & Restoration" />
              <Field label="Business model" value={draft.business_model ?? ''} onChange={v => setDraft({ ...draft, business_model: v })} placeholder="e.g. B2B project sales" />
              <Field label="Target customer" value={draft.target_customer ?? ''} onChange={v => setDraft({ ...draft, target_customer: v })} />
              <Field label="Currency" value={draft.currency_code ?? ''} onChange={v => setDraft({ ...draft, currency_code: v.toUpperCase() })} />
              <Field label="Website" value={draft.website_url ?? ''} onChange={v => setDraft({ ...draft, website_url: v })} />
              <Field label="Primary brand color" value={draft.primary_color ?? ''} onChange={v => setDraft({ ...draft, primary_color: v })} />
              <Field label="Phone" value={draft.phone ?? ''} onChange={v => setDraft({ ...draft, phone: v })} />
              <Field label="Email" value={draft.email ?? ''} onChange={v => setDraft({ ...draft, email: v })} />
              <Field label="Revenue target" type="number" value={draft.revenue_target?.toString() ?? ''} onChange={v => setDraft({ ...draft, revenue_target: v ? Number(v) : null })} />
              <Field label="Sales target" type="number" value={draft.sales_target?.toString() ?? ''} onChange={v => setDraft({ ...draft, sales_target: v ? Number(v) : null })} />
              <div className="md:col-span-2"><label className="block text-xs font-medium text-black/60 mb-1.5">Description</label><textarea value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={3} className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></div>
              <div className="md:col-span-2"><label className="block text-xs font-medium text-black/60 mb-1.5">Address</label><input value={draft.address ?? ''} onChange={e => setDraft({ ...draft, address: e.target.value })} className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mt-7">
              <InfoCard icon={<Users size={18} />} title="Team context" text="Users and departments stay scoped to this subsidiary." />
              <InfoCard icon={<BriefcaseBusiness size={18} />} title="Dedicated CRM" text="Contacts, deals and pipeline stages belong to this business." />
              <InfoCard icon={<Target size={18} />} title="Business intelligence" text="Targets and outcomes can roll up to the parent organization." />
            </div>
          </>}
        </section>
      </div>

      {showCreate && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
        <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl">
          <div className="flex justify-between items-start mb-6"><div><h2 className="text-xl font-bold">Create subsidiary</h2><p className="text-sm text-black/50 mt-1">A new business workspace and CRM will be provisioned automatically.</p></div><button onClick={() => setShowCreate(false)}><X size={20} /></button></div>
          <div className="space-y-4">
            <Field label="Business name" value={createName} onChange={setCreateName} placeholder="e.g. Plusworld Roofing & Restoration" />
            <Field label="Industry" value={createIndustry} onChange={setCreateIndustry} placeholder="e.g. Construction" />
            <Field label="Business model" value={createModel} onChange={setCreateModel} placeholder="e.g. B2B project sales" />
            <div><label className="block text-xs font-medium text-black/60 mb-1.5">Description</label><textarea value={createDescription} onChange={e => setCreateDescription(e.target.value)} rows={3} className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm" /></div>
          </div>
          <button disabled={creating || !createName.trim()} onClick={createSubsidiary} className="w-full mt-6 py-3 rounded-xl bg-black text-white text-sm font-semibold disabled:opacity-40">{creating ? 'Provisioning business…' : 'Create and provision CRM'}</button>
        </div>
      </div>}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <div><label className="block text-xs font-medium text-black/60 mb-1.5">{label}</label><input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></div>
}

function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-xl border border-black/[0.07] p-4"><div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">{icon}</div><div className="font-medium text-sm">{title}</div><div className="text-xs text-black/50 mt-1 leading-5">{text}</div></div>
}
