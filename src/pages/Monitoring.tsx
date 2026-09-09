import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Plus, RefreshCw, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'

type Monitor = { id: string; name: string; monitor_type: string; target_url: string | null; status: 'up' | 'down' | 'degraded' | 'unknown'; last_check_at: string | null; is_active: boolean }
type Incident = { id: string; title: string; severity: 'critical' | 'high' | 'medium' | 'low'; status: string; started_at: string; resolved_at: string | null; affected_users: number | null }
type Heartbeat = { id: string; name: string; status: 'healthy' | 'late' | 'missed' | 'unknown'; last_heartbeat_at: string | null; check_interval_seconds: number | null }
type Summary = { monitor_count: number; up_count: number; degraded_count: number; down_count: number; unknown_count: number; active_incidents: number }

const STATUS = {
  up: { label: 'Operational', icon: CheckCircle2 },
  down: { label: 'Down', icon: XCircle },
  degraded: { label: 'Degraded', icon: AlertTriangle },
  unknown: { label: 'Unknown', icon: Clock },
} as const

export default function Monitoring() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const businessId = staff?.business_id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([])
  const [tab, setTab] = useState<'overview' | 'monitors' | 'incidents' | 'heartbeats'>('overview')
  const [showCreate, setShowCreate] = useState(false)
  const [newMonitor, setNewMonitor] = useState({ name: '', target_url: '', monitor_type: 'http', check_interval: 60 })

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return }
    setLoading(true); setError(null)
    const [summaryRes, monitorsRes, incidentsRes, heartbeatsRes] = await Promise.all([
      supabase.rpc('get_monitoring_summary', { p_business_id: businessId }),
      supabase.from('monitors').select('id,name,monitor_type,target_url,status,last_check_at,is_active').eq('business_id', businessId).order('name'),
      supabase.from('incidents').select('id,title,severity,status,started_at,resolved_at,affected_users').eq('business_id', businessId).order('started_at', { ascending: false }).limit(50),
      supabase.from('heartbeats').select('id,name,status,last_heartbeat_at,check_interval_seconds').eq('business_id', businessId).order('name'),
    ])
    const firstError = summaryRes.error || monitorsRes.error || incidentsRes.error || heartbeatsRes.error
    if (firstError) {
      setError('Monitoring telemetry could not be loaded. Health status is unknown until telemetry is available.')
      setSummary(null); setMonitors([]); setIncidents([]); setHeartbeats([]); setLoading(false); return
    }
    const raw = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data
    setSummary(raw ? { monitor_count: Number(raw.monitor_count ?? 0), up_count: Number(raw.up_count ?? 0), degraded_count: Number(raw.degraded_count ?? 0), down_count: Number(raw.down_count ?? 0), unknown_count: Number(raw.unknown_count ?? 0), active_incidents: Number(raw.active_incidents ?? 0) } : null)
    setMonitors((monitorsRes.data ?? []) as Monitor[])
    setIncidents((incidentsRes.data ?? []) as Incident[])
    setHeartbeats((heartbeatsRes.data ?? []) as Heartbeat[])
    setLoading(false)
  }, [businessId])

  useEffect(() => { void load() }, [load])

  async function createMonitor() {
    if (!businessId || !staff?.id || !newMonitor.name.trim() || !newMonitor.target_url.trim()) { showToast('Enter a name and target URL.', 'error'); return }
    const { error: insertError } = await supabase.from('monitors').insert({ business_id: businessId, created_by: staff.id, name: newMonitor.name.trim(), monitor_type: newMonitor.monitor_type, target_url: newMonitor.target_url.trim(), check_interval: Number(newMonitor.check_interval), status: 'unknown', is_active: true })
    if (insertError) { showToast('Monitor was not saved.', 'error'); return }
    showToast('Monitor created. It remains Unknown until a real check reports a status.', 'success')
    setShowCreate(false); setNewMonitor({ name: '', target_url: '', monitor_type: 'http', check_interval: 60 }); void load()
  }

  const overall = summary ? (summary.down_count > 0 ? 'down' : summary.degraded_count > 0 ? 'degraded' : summary.unknown_count > 0 ? 'unknown' : summary.monitor_count > 0 ? 'up' : 'unknown') : 'unknown'
  const overallCopy = overall === 'up' ? 'All monitored services operational' : overall === 'degraded' ? 'Partial degradation detected' : overall === 'down' ? 'Service outage detected' : 'Health status unknown'
  const OverallIcon = STATUS[overall as keyof typeof STATUS]?.icon ?? Clock

  return <div className="pb-20">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6"><div><h1 className="text-xl font-medium">Monitoring</h1><p className="text-sm opacity-70 mt-1">Evidence-based system health and incidents</p></div><div className="flex gap-2"><button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Refresh</button><button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white"><Plus size={16}/>Add Monitor</button></div></div>
    {error ? <div className="rounded-2xl border border-[var(--av-danger)]/20 bg-[var(--av-danger-soft)] p-4 mb-6 text-sm">{error}</div> : null}
    <div className="rounded-2xl border border-[var(--av-border)] p-5 mb-6"><div className="flex items-center gap-4"><OverallIcon size={36}/><div><h2 className="text-lg font-semibold">{overallCopy}</h2><p className="text-sm opacity-70 mt-1">{summary ? `${summary.up_count} operational · ${summary.degraded_count} degraded · ${summary.down_count} down · ${summary.unknown_count} unknown · ${summary.active_incidents} active incidents` : 'No authoritative telemetry available'}</p></div></div></div>
    <div className="flex gap-2 overflow-x-auto mb-6">{(['overview','monitors','incidents','heartbeats'] as const).map(k => <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${tab === k ? 'avenize-gradient text-white' : 'border'}`}>{k[0].toUpperCase()+k.slice(1)}</button>)}</div>
    {loading ? <div className="p-8 text-center opacity-70">Loading authoritative telemetry…</div> : tab === 'overview' ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><section className="rounded-2xl border p-5"><h3 className="font-medium mb-4">Services</h3>{monitors.length === 0 ? <p className="text-sm opacity-60">No monitors configured.</p> : <div className="space-y-3">{monitors.slice(0,8).map(m => { const C = STATUS[m.status]?.icon ?? Clock; return <div key={m.id} className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{m.name}</p><p className="text-xs opacity-60 truncate max-w-[260px]">{m.target_url || m.monitor_type}</p></div><div className="flex items-center gap-2 text-xs"><C size={14}/>{STATUS[m.status]?.label ?? 'Unknown'}</div></div> })}</div>}</section><section className="rounded-2xl border p-5"><h3 className="font-medium mb-4">Recent incidents</h3>{incidents.length === 0 ? <p className="text-sm opacity-60">No incidents recorded.</p> : <div className="space-y-3">{incidents.slice(0,5).map(i => <div key={i.id} className="p-3 rounded-xl border"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{i.title}</p><span className="text-xs">{i.severity}</span></div><p className="text-xs opacity-60 mt-1">{i.status} · {new Date(i.started_at).toLocaleString()}</p></div>)}</div>}</section><section className="rounded-2xl border p-5 lg:col-span-2"><h3 className="font-medium mb-2">Historical uptime</h3><p className="text-sm opacity-60">Not displayed because no uptime-history source is wired to this surface. Synthetic percentages are intentionally not shown as production telemetry.</p></section></div> : tab === 'monitors' ? <div className="space-y-3">{monitors.map(m => <div key={m.id} className="rounded-2xl border p-4 flex flex-wrap justify-between gap-3"><div><p className="font-medium">{m.name}</p><p className="text-sm opacity-60">{m.target_url || m.monitor_type}</p></div><div className="text-sm">{STATUS[m.status]?.label ?? 'Unknown'}{m.last_check_at ? ` · checked ${new Date(m.last_check_at).toLocaleString()}` : ' · never checked'}</div></div>)}{monitors.length === 0 && <div className="p-8 text-center opacity-60">No monitors configured.</div>}</div> : tab === 'incidents' ? <div className="space-y-3">{incidents.map(i => <div key={i.id} className="rounded-2xl border p-4"><div className="flex justify-between"><p className="font-medium">{i.title}</p><span className="text-xs">{i.severity} · {i.status}</span></div><p className="text-xs opacity-60 mt-1">Started {new Date(i.started_at).toLocaleString()}{i.resolved_at ? ` · Resolved ${new Date(i.resolved_at).toLocaleString()}` : ''}</p></div>)}{incidents.length === 0 && <div className="p-8 text-center opacity-60">No incidents recorded.</div>}</div> : <div className="space-y-3">{heartbeats.map(h => <div key={h.id} className="rounded-2xl border p-4 flex justify-between"><div><p className="font-medium">{h.name}</p><p className="text-xs opacity-60">{h.last_heartbeat_at ? new Date(h.last_heartbeat_at).toLocaleString() : 'No heartbeat recorded'}</p></div><span className="text-sm">{h.status}</span></div>)}{heartbeats.length === 0 && <div className="p-8 text-center opacity-60">No heartbeat monitors configured.</div>}</div>}
    {showCreate ? <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="w-full max-w-md rounded-2xl bg-[var(--av-surface-elevated)] border p-6"><h2 className="text-lg font-semibold mb-4">Add monitor</h2><div className="space-y-3"><input className="w-full border rounded-lg px-3 py-2" placeholder="Monitor name" value={newMonitor.name} onChange={e => setNewMonitor(v => ({...v,name:e.target.value}))}/><input className="w-full border rounded-lg px-3 py-2" placeholder="https://example.com/health" value={newMonitor.target_url} onChange={e => setNewMonitor(v => ({...v,target_url:e.target.value}))}/><select className="w-full border rounded-lg px-3 py-2" value={newMonitor.monitor_type} onChange={e => setNewMonitor(v => ({...v,monitor_type:e.target.value}))}><option value="http">HTTP</option><option value="tcp">TCP</option><option value="heartbeat">Heartbeat</option></select><div className="flex justify-end gap-2 pt-2"><button onClick={() => setShowCreate(false)} className="px-3 py-2 rounded-lg border">Cancel</button><button onClick={() => void createMonitor()} className="px-3 py-2 rounded-lg avenize-gradient text-white">Create</button></div></div></div></div> : null}
  </div>
}
