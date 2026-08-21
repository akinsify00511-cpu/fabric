import { useEffect, useState } from 'react'
import { ShieldCheck, Database, Activity, Wrench, AlertTriangle, RefreshCw } from 'lucide-react'
import { getRiverwaysAdminOverview, isRiverwaysAdmin, type RiverwaysAdminOverview } from '../lib/riverwaysAdmin'

function Stat({ label, value, icon: Icon, tone = 'default' }: { label: string; value: string | number; icon: typeof Activity; tone?: 'default' | 'warning' }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><Icon className={tone === 'warning' ? 'text-amber-600' : 'text-slate-700'} size={20} /></div>
    <div className="mt-3 text-3xl font-semibold text-slate-950">{value}</div>
  </div>
}

export default function RiverwaysAdmin() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [overview, setOverview] = useState<RiverwaysAdminOverview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const ok = await isRiverwaysAdmin()
      setAuthorized(ok)
      if (!ok) return
      setOverview(await getRiverwaysAdminOverview())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Riverways Admin')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">Loading Riverways Admin…</div>
  if (!authorized) return <div className="min-h-screen grid place-items-center bg-slate-950 px-6"><div className="max-w-md rounded-2xl bg-white p-8 text-center"><ShieldCheck className="mx-auto mb-4 text-red-600" size={40}/><h1 className="text-xl font-semibold">Access denied</h1><p className="mt-2 text-sm text-slate-500">This console is restricted to authorized Riverways platform administrators.</p></div></div>
  if (error) return <div className="min-h-screen grid place-items-center bg-slate-950 px-6"><div className="max-w-md rounded-2xl bg-white p-8 text-center"><AlertTriangle className="mx-auto mb-4 text-amber-600" size={40}/><h1 className="text-xl font-semibold">Command center unavailable</h1><p className="mt-2 text-sm text-slate-500">{error}</p><button onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"><RefreshCw size={16}/> Retry</button></div></div>

  const i = overview!.integrity
  const d = overview!.dependencies
  return <div className="min-h-screen bg-slate-950 text-white">
    <header className="border-b border-white/10 px-6 py-5"><div className="mx-auto flex max-w-7xl items-center justify-between"><div><p className="text-xs uppercase tracking-[0.2em] text-slate-400">Riverways Platform</p><h1 className="mt-1 text-2xl font-semibold">Admin Command Center</h1></div><div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-sm text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400"/> Protected</div></div></header>
    <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <section><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-medium">Platform health</h2><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><RefreshCw size={15}/> Refresh</button></div><div className="grid gap-4 md:grid-cols-3"><Stat label="Database" value={overview!.database.status} icon={Database}/><Stat label="Dependencies healthy" value={`${d.healthy}/${d.total}`} icon={Activity}/><Stat label="Open findings" value={i.open_findings} icon={AlertTriangle} tone={i.open_findings ? 'warning' : 'default'}/></div></section>
      <section><h2 className="mb-4 text-lg font-medium">Integrity engine</h2><div className="grid gap-4 md:grid-cols-4"><Stat label="Rules" value={i.rules} icon={ShieldCheck}/><Stat label="Findings" value={i.findings} icon={AlertTriangle}/><Stat label="Repairs" value={i.repairs} icon={Wrench}/><Stat label="Healthy dependencies" value={d.healthy} icon={Activity}/></div></section>
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><h2 className="text-lg font-medium">Self-healing status</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Riverways Admin monitors platform integrity separately from tenant workspaces. Safe repairs can be automated; security-sensitive or destructive changes remain protected behind explicit authorization.</p><div className="mt-5 flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300">Dependency monitoring active</span><span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300">Database protection active</span><span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-amber-300">Restricted repairs require approval</span></div></section>
    </main>
  </div>
}
