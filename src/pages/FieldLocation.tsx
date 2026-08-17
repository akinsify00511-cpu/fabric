import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, MapPin, Navigation, Plus, RefreshCw, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { enqueuePresenceAction, getPresenceQueue, presenceNetworkState, removePresenceAction } from '../lib/presenceQueue'
import { MotionButton, MotionCard, StatePulse } from '../components/OrganismMotion'

type Visit = { id: string; assigned_staff_id: string; customer_name: string; customer_address: string | null; latitude: number | null; longitude: number | null; radius_meters: number; scheduled_at: string | null; status: string; arrived_at: string | null; completed_at: string | null; arrival_distance_meters: number | null; arrival_verification_status: string; completion_distance_meters: number | null; completion_verification_status: string; outcome: string | null; notes: string | null }
type Staff = { id: string; name: string | null; full_name: string | null; role: string | null }
async function getPosition() { if (!navigator.geolocation) return null; return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })) }

export default function FieldLocation() {
  const { staff, session } = useAuth()
  const { showToast } = useToast()
  const isManager = ['owner','admin','manager','team_lead'].includes(staff?.role || '')
  const [visits, setVisits] = useState<Visit[]>([])
  const [team, setTeam] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ assigned_staff_id: '', customer_name: '', customer_address: '', latitude: '', longitude: '', radius_meters: '150', scheduled_at: '', notes: '' })
  const [queued, setQueued] = useState(getPresenceQueue().filter(x => x.kind.includes('visit')).length)

  const load = useCallback(async () => {
    if (!staff?.business_id || !staff.id) return
    setLoading(true)
    try {
      const [{ data: visitData, error: visitError }, { data: staffData }] = await Promise.all([
        supabase.from('field_visits').select('id,assigned_staff_id,customer_name,customer_address,latitude,longitude,radius_meters,scheduled_at,status,arrived_at,completed_at,arrival_distance_meters,arrival_verification_status,completion_distance_meters,completion_verification_status,outcome,notes').eq('business_id', staff.business_id).order('scheduled_at', { ascending: true }),
        isManager ? supabase.from('staff').select('id,name,full_name,role').eq('business_id', staff.business_id).order('full_name') : Promise.resolve({ data: [] as Staff[], error: null }),
      ])
      if (visitError) throw visitError
      setVisits((visitData || []) as Visit[])
      setTeam((staffData || []) as Staff[])
    } catch (error) { console.error('field_visits.load', error); showToast('Field visits could not be refreshed.', 'error') }
    finally { setLoading(false) }
  }, [isManager, showToast, staff?.business_id, staff?.id])

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return
    for (const item of getPresenceQueue().filter(x => x.kind === 'start_visit' || x.kind === 'complete_visit')) {
      try {
        const fn = item.kind === 'start_visit' ? 'start_field_visit' : 'complete_field_visit'
        const { error } = await supabase.rpc(fn, item.payload)
        if (error) throw error
        removePresenceAction(item.id)
      } catch (error: any) {
        if (String(error?.message || '').match(/fetch|network|Failed to/i)) break
        removePresenceAction(item.id)
        showToast('A queued field event could not be applied and needs attention.', 'error')
      }
    }
    setQueued(getPresenceQueue().filter(x => x.kind.includes('visit')).length)
    await load()
  }, [load, showToast])

  useEffect(() => {
    if (!session) return
    void load()
    const onOnline = () => { setOnline(true); void flushQueue() }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [flushQueue, load, session])

  const act = async (visit: Visit, kind: 'start_visit' | 'complete_visit') => {
    setBusyId(visit.id)
    const id = crypto.randomUUID()
    let position: GeolocationPosition | null = null
    try { position = await getPosition() } catch { /* evidence remains explicit as unavailable */ }
    const base = { p_visit_id: visit.id, p_lat: position?.coords.latitude ?? null, p_lng: position?.coords.longitude ?? null, p_accuracy_meters: position?.coords.accuracy ?? null, p_device: navigator.userAgent.slice(0,240), p_network_state: presenceNetworkState(), p_client_event_id: id }
    const payload = kind === 'complete_visit' ? { ...base, p_outcome: 'Completed', p_notes: visit.notes || null } : base
    if (!navigator.onLine) { enqueuePresenceAction({ kind, payload, id }); setQueued(getPresenceQueue().filter(x => x.kind.includes('visit')).length); showToast('Visit event saved offline and queued for sync.', 'success'); setBusyId(null); return }
    try {
      const { data, error } = await supabase.rpc(kind === 'start_visit' ? 'start_field_visit' : 'complete_field_visit', payload)
      if (error) throw error
      showToast(data?.verification_status === 'verified' ? 'Visit verified from your current location.' : 'Visit recorded; location evidence is not fully verified.', data?.verification_status === 'verified' ? 'success' : 'info')
      await load()
    } catch (error: any) {
      if (!navigator.onLine || String(error?.message || '').match(/fetch|network|Failed to/i)) { enqueuePresenceAction({ kind, payload, id }); setQueued(getPresenceQueue().filter(x => x.kind.includes('visit')).length); showToast('Network interrupted. The field event is queued safely.', 'info') }
      else showToast(String(error?.message || 'Field visit action failed.'), 'error')
    } finally { setBusyId(null) }
  }

  const createVisit = async () => {
    if (!form.assigned_staff_id || !form.customer_name) return
    try {
      const { error } = await supabase.rpc('create_field_visit', { p_assigned_staff_id: form.assigned_staff_id, p_customer_name: form.customer_name, p_customer_address: form.customer_address || null, p_lat: form.latitude ? Number(form.latitude) : null, p_lng: form.longitude ? Number(form.longitude) : null, p_radius_meters: Number(form.radius_meters) || 150, p_scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null, p_notes: form.notes || null })
      if (error) throw error
      setShowCreate(false); setForm({ assigned_staff_id:'',customer_name:'',customer_address:'',latitude:'',longitude:'',radius_meters:'150',scheduled_at:'',notes:'' }); showToast('Field visit assigned.', 'success'); await load()
    } catch (error: any) { showToast(String(error?.message || 'Could not create field visit.'), 'error') }
  }

  const active = useMemo(() => visits.filter(v => !['completed','cancelled'].includes(v.status)).length, [visits])
  const verified = useMemo(() => visits.filter(v => v.arrival_verification_status === 'verified').length, [visits])

  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="max-w-6xl mx-auto pb-20 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-black/50"><StatePulse active={active > 0} /> Field operations</div><h1 className="text-3xl font-bold mt-1">Verified field visits</h1><p className="text-sm text-black/60 mt-1">Avenize records the claim, time, location evidence and verification result without covert continuous tracking.</p></div>
        <div className="flex items-center gap-3">{online ? <Wifi className="text-green-600" size={16}/> : <WifiOff className="text-amber-600" size={16}/>} {queued > 0 && <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800">{queued} queued</span>}{isManager && <MotionButton onClick={() => setShowCreate(v => !v)} className="px-4 py-2 rounded-lg bg-black text-white flex items-center gap-2"><Plus size={16}/> Assign visit</MotionButton>}</div>
      </div>
      {showCreate && isManager && <MotionCard className="bg-white border border-black/10 rounded-2xl p-5 grid md:grid-cols-2 gap-4">
        <select value={form.assigned_staff_id} onChange={e=>setForm({...form,assigned_staff_id:e.target.value})} className="border rounded-lg px-3 py-2"><option value="">Assign salesperson</option>{team.map(member=><option key={member.id} value={member.id}>{member.full_name || member.name || member.id}</option>)}</select>
        <input value={form.customer_name} onChange={e=>setForm({...form,customer_name:e.target.value})} placeholder="Customer / company" className="border rounded-lg px-3 py-2" />
        <input value={form.customer_address} onChange={e=>setForm({...form,customer_address:e.target.value})} placeholder="Customer address" className="border rounded-lg px-3 py-2 md:col-span-2" />
        <input value={form.latitude} onChange={e=>setForm({...form,latitude:e.target.value})} placeholder="Latitude (optional)" className="border rounded-lg px-3 py-2" />
        <input value={form.longitude} onChange={e=>setForm({...form,longitude:e.target.value})} placeholder="Longitude (optional)" className="border rounded-lg px-3 py-2" />
        <input value={form.radius_meters} onChange={e=>setForm({...form,radius_meters:e.target.value})} placeholder="Verification radius (m)" className="border rounded-lg px-3 py-2" />
        <input type="datetime-local" value={form.scheduled_at} onChange={e=>setForm({...form,scheduled_at:e.target.value})} className="border rounded-lg px-3 py-2" />
        <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Visit objective / notes" className="border rounded-lg px-3 py-2 md:col-span-2" />
        <div className="md:col-span-2 flex justify-end gap-2"><button onClick={()=>setShowCreate(false)} className="px-4 py-2 rounded-lg border">Cancel</button><MotionButton onClick={()=>void createVisit()} className="px-4 py-2 rounded-lg bg-green-600 text-white">Create visit</MotionButton></div>
      </MotionCard>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><Metric title="Active visits" value={active}/><Metric title="Verified arrivals" value={verified}/><Metric title="Completed" value={visits.filter(v=>v.status==='completed').length}/><Metric title="Coverage" value={visits.length ? `${Math.round((verified/visits.length)*100)}%` : '—'}/></div>
      <MotionCard className="bg-white rounded-2xl border border-black/10 overflow-hidden">
        <div className="p-5 border-b border-black/10 flex justify-between"><div><h2 className="font-semibold">Visit timeline</h2><p className="text-xs text-black/50">Evidence is event-based: arrival and completion, not hidden background surveillance.</p></div><button onClick={()=>void load()} className="p-2 rounded-lg hover:bg-black/5" aria-label="Refresh visits"><RefreshCw size={16}/></button></div>
        {loading ? <div className="p-10 text-center"><RefreshCw className="mx-auto animate-spin"/></div> : visits.length===0 ? <div className="p-10 text-center text-black/50"><MapPin className="mx-auto mb-2"/><p>No field visits have been assigned.</p></div> : <div className="divide-y divide-black/5">{visits.map(visit=><div key={visit.id} className="p-5 grid lg:grid-cols-[1fr_auto] gap-4"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{visit.customer_name}</h3><span className="text-xs px-2 py-1 rounded-full bg-black/5 capitalize">{visit.status.replace('_',' ')}</span></div><p className="text-sm text-black/60 mt-1">{visit.customer_address || 'Customer location not specified'}</p><div className="flex flex-wrap gap-4 text-xs text-black/60 mt-3"><span>{visit.scheduled_at ? new Date(visit.scheduled_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'}) : 'Unscheduled'}</span><span className="inline-flex items-center gap-1"><ShieldCheck size={13}/>{visit.arrival_verification_status.replace('_',' ')}</span>{visit.arrival_distance_meters != null && <span className="inline-flex items-center gap-1"><Navigation size={13}/>{Math.round(visit.arrival_distance_meters)}m from target</span>}</div></div><div className="flex items-center gap-2 lg:self-center">{!['completed','cancelled'].includes(visit.status) && visit.assigned_staff_id===staff?.id && <MotionButton disabled={busyId===visit.id} onClick={()=>void act(visit,visit.arrived_at ? 'complete_visit' : 'start_visit')} className={`px-4 py-2 rounded-lg text-white ${visit.arrived_at ? 'bg-black' : 'bg-green-600'}`}>{busyId===visit.id ? <RefreshCw size={16} className="animate-spin"/> : visit.arrived_at ? 'Complete visit' : 'I am here'}</MotionButton>}{visit.arrival_verification_status==='verified' && <CheckCircle2 className="text-green-600" size={22}/>}</div></div>)}</div>}
      </MotionCard>
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 text-sm flex gap-3"><AlertTriangle size={18} className="shrink-0"/><p>Location evidence is only captured when a salesperson checks in or completes a visit. Avenize records what was claimed, what evidence was available, and the verification result.</p></div>
    </div>
  )
}
function Metric({ title, value }: { title: string; value: string | number }) { return <MotionCard className="bg-white rounded-xl border border-black/10 p-4"><p className="text-xs text-black/50">{title}</p><p className="text-2xl font-bold mt-1">{value}</p></MotionCard> }
