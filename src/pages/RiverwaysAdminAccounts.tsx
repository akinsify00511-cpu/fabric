import { useEffect, useState } from 'react'
import { Search, ShieldCheck, UserCog, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

const TYPES = ['owner','admin','manager','staff','sales','marketing','finance','operations','viewer'] as const

type UserRow = { id: string; email: string | null; created_at: string; account_type: string | null }

export default function RiverwaysAdminAccounts() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.rpc('riverways_admin_list_accounts', { p_search: q || null })
      if (error) throw error
      setUsers((data ?? []) as UserRow[])
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load accounts') }
    finally { setLoading(false) }
  }

  async function assign(userId: string, type: string) {
    setSaving(userId); setError('')
    try {
      const { error } = await supabase.rpc('riverways_assign_account_type', { p_user_id: userId, p_account_type: type })
      if (error) throw error
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to assign account type') }
    finally { setSaving(null) }
  }

  useEffect(() => { void load() }, [])

  return <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-slate-400">Platform access</p><h2 className="mt-1 text-xl font-semibold">Account Management</h2></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"><RefreshCw size={15}/> Refresh</button></div>
    <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2"><Search size={16} className="text-slate-500"/><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load() }} placeholder="Search by email" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"/></div>
    {error && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}
    {loading ? <div className="py-10 text-center text-sm text-slate-400">Loading accounts…</div> : <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-500"><tr><th className="pb-3">Account</th><th className="pb-3">Current type</th><th className="pb-3">Assign type</th></tr></thead><tbody>{users.map(u => <tr key={u.id} className="border-t border-white/10"><td className="py-4"><div className="flex items-center gap-2"><ShieldCheck size={16} className="text-slate-400"/><span>{u.email ?? u.id}</span></div></td><td className="py-4 text-slate-400">{u.account_type ?? 'Unassigned'}</td><td className="py-4"><select disabled={saving === u.id} value={u.account_type ?? ''} onChange={e => void assign(u.id, e.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2"><option value="" disabled>Choose type</option>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>{saving === u.id && <UserCog className="ml-2 inline text-slate-400" size={16}/>}</td></tr>)}</tbody></table>{users.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No accounts found.</div>}</div>}
  </section>
}
