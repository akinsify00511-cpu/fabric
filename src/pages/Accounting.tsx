import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, FileText, Plus, Wallet, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'

type Account = { id: string; code: string; name: string; type: 'asset'|'liability'|'equity'|'revenue'|'expense'; opening_balance: number | null }
type Entry = { id: string; entry_number: string; date: string; description: string | null; status: string }
type Line = { journal_entry_id: string; account_id: string; debit: number | null; credit: number | null }
type DraftLine = { account_id: string; debit: string; credit: string; description: string }

const types = ['asset','liability','equity','revenue','expense'] as const
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Accounting() {
  const { staff } = useAuth(); const { showToast } = useToast(); const businessId = staff?.business_id
  const [accounts,setAccounts]=useState<Account[]>([]); const [entries,setEntries]=useState<Entry[]>([]); const [lines,setLines]=useState<Line[]>([])
  const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null); const [tab,setTab]=useState<'chart'|'journal'|'reports'>('chart'); const [report,setReport]=useState<'balance'|'income'>('balance')
  const [showAccount,setShowAccount]=useState(false); const [showEntry,setShowEntry]=useState(false); const [saving,setSaving]=useState(false)
  const [code,setCode]=useState(''); const [name,setName]=useState(''); const [type,setType]=useState<Account['type']>('asset'); const [opening,setOpening]=useState('0')
  const [date,setDate]=useState(new Date().toISOString().slice(0,10)); const [description,setDescription]=useState(''); const [draft,setDraft]=useState<DraftLine[]>([{account_id:'',debit:'',credit:'',description:''},{account_id:'',debit:'',credit:'',description:''}])

  const load = useCallback(async()=>{
    if(!businessId){setLoading(false);return} setLoading(true);setError(null)
    const [a,e,l]=await Promise.all([
      supabase.from('accounts').select('id,code,name,type,opening_balance').eq('business_id',businessId).order('code'),
      supabase.from('journal_entries').select('id,entry_number,date,description,status').eq('business_id',businessId).order('date',{ascending:false}).limit(200),
      supabase.from('journal_lines').select('journal_entry_id,account_id,debit,credit').eq('business_id',businessId).limit(5000),
    ])
    if(a.error||e.error||l.error){setError('Accounting data could not be loaded. Financial figures are not shown as zero when the ledger is unavailable.');setAccounts([]);setEntries([]);setLines([]);setLoading(false);return}
    setAccounts((a.data??[]) as Account[]);setEntries((e.data??[]) as Entry[]);setLines((l.data??[]) as Line[]);setLoading(false)
  },[businessId])
  useEffect(()=>{void load()},[load])

  const totals = useMemo(()=>{
    const map = new Map<string,{debit:number;credit:number}>(); lines.forEach(l=>{const x=map.get(l.account_id)||{debit:0,credit:0};x.debit+=Number(l.debit||0);x.credit+=Number(l.credit||0);map.set(l.account_id,x)})
    return new Map(accounts.map(a=>{const x=map.get(a.id)||{debit:0,credit:0};const opening=Number(a.opening_balance||0);const balance=['asset','expense'].includes(a.type)?opening+x.debit-x.credit:opening+x.credit-x.debit;return [a.id,{...x,balance}] as const}))
  },[accounts,lines])
  const revenue=accounts.filter(a=>a.type==='revenue').reduce((s,a)=>s+(totals.get(a.id)?.credit||0)-(totals.get(a.id)?.debit||0),0)
  const expenses=accounts.filter(a=>a.type==='expense').reduce((s,a)=>s+(totals.get(a.id)?.debit||0)-(totals.get(a.id)?.credit||0),0)
  const netIncome=revenue-expenses
  const assets=accounts.filter(a=>a.type==='asset').reduce((s,a)=>s+(totals.get(a.id)?.balance||0),0)
  const liabilities=accounts.filter(a=>a.type==='liability').reduce((s,a)=>s+(totals.get(a.id)?.balance||0),0)
  const equity=accounts.filter(a=>a.type==='equity').reduce((s,a)=>s+(totals.get(a.id)?.balance||0),0)+netIncome
  const debits=draft.reduce((s,l)=>s+(Number(l.debit)||0),0); const credits=draft.reduce((s,l)=>s+(Number(l.credit)||0),0)

  async function createAccount(){
    if(!businessId||!code.trim()||!name.trim()){showToast('Enter an account code and name.','error');return} setSaving(true)
    const {error:e}=await supabase.from('accounts').insert({business_id:businessId,code:code.trim(),name:name.trim(),type,opening_balance:Number(opening)||0})
    if(e)showToast('Account was not saved.','error');else{showToast('Account created.','success');setCode('');setName('');setOpening('0');setShowAccount(false);void load()}setSaving(false)
  }
  async function createEntry(){
    if(!businessId){showToast('Business context is unavailable.','error');return}
    const usable=draft.filter(l=>l.account_id&&(Number(l.debit)||0)>0||(l.account_id&&(Number(l.credit)||0)>0))
    if(usable.length<2||Math.abs(debits-credits)>0.01||debits<=0){showToast('A posted entry needs at least two valid, balanced lines.','error');return}
    setSaving(true)
    const {error:e}=await supabase.rpc('create_journal_entry_with_lines',{p_business_id:businessId,p_date:date,p_reference:null,p_description:description.trim()||null,p_currency:'NGN',p_lines:usable.map(l=>({account_id:l.account_id,debit:Number(l.debit)||0,credit:Number(l.credit)||0,description:l.description.trim()||null,currency:'NGN'}))})
    if(e)showToast(e.message||'Journal entry was not saved.','error');else{showToast('Journal entry posted with ledger lines.','success');setShowEntry(false);setDescription('');setDraft([{account_id:'',debit:'',credit:'',description:''},{account_id:'',debit:'',credit:'',description:''}]);void load()}setSaving(false)
  }
  const addLine=()=>setDraft(v=>[...v,{account_id:'',debit:'',credit:'',description:''}]); const removeLine=(i:number)=>setDraft(v=>v.length>2?v.filter((_,x)=>x!==i):v)

  return <div className="pb-20"><div className="flex flex-wrap justify-between gap-3 mb-6"><div><h1 className="text-xl font-medium">Accounting</h1><p className="text-sm opacity-70 mt-1">Ledger-derived double-entry accounting</p></div><div className="flex gap-2"><button onClick={()=>setShowAccount(true)} className="px-3 py-2 rounded-lg border flex items-center gap-1"><Plus size={14}/>Account</button><button onClick={()=>setShowEntry(true)} className="px-4 py-2 rounded-lg avenize-gradient text-white flex items-center gap-1"><Plus size={14}/>New Entry</button></div></div>
    {error&&<div className="mb-5 p-4 rounded-xl border border-[var(--av-danger)]/20 bg-[var(--av-danger-soft)] text-sm">{error}</div>}
    <div className="flex gap-2 mb-5">{(['chart','journal','reports'] as const).map(k=><button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-lg text-sm ${tab===k?'avenize-gradient text-white':'border'}`}>{k==='chart'?'Chart of Accounts':k==='journal'?'Journal':'Reports'}</button>)}</div>
    {loading?<div className="p-8 text-center opacity-60">Loading ledger…</div>:tab==='chart'?<div className="space-y-4">{types.map(t=>{const rows=accounts.filter(a=>a.type===t);return <section key={t} className="rounded-2xl border overflow-hidden"><div className="px-4 py-3 border-b font-medium capitalize">{t}s <span className="opacity-50 text-xs">{rows.length}</span></div>{rows.length===0?<div className="p-4 text-sm opacity-60">No accounts configured.</div>:rows.map(a=><div key={a.id} className="px-4 py-3 flex justify-between text-sm"><span><span className="font-mono opacity-50 mr-3">{a.code}</span>{a.name}</span><span className="font-mono">{money(totals.get(a.id)?.balance||0)}</span></div>)}</section>})}</div>:tab==='journal'?<div className="rounded-2xl border divide-y">{entries.map(e=><div key={e.id} className="p-4 flex justify-between gap-3"><div><p className="font-medium">{e.entry_number}</p><p className="text-sm opacity-60">{e.description||'No description'}</p></div><div className="text-right text-sm"><p>{new Date(e.date).toLocaleDateString()}</p><p className="opacity-60">{e.status}</p></div></div>)}{entries.length===0&&<div className="p-8 text-center opacity-60"><FileText className="mx-auto mb-2"/>No journal entries yet.</div>}</div>:<div className="space-y-5"><div className="flex gap-2"><button onClick={()=>setReport('balance')} className={`px-3 py-2 rounded-lg text-sm ${report==='balance'?'avenize-gradient text-white':'border'}`}>Balance Sheet</button><button onClick={()=>setReport('income')} className={`px-3 py-2 rounded-lg text-sm ${report==='income'?'avenize-gradient text-white':'border'}`}>Income Statement</button></div>{report==='income'?<section className="rounded-2xl border p-5"><h2 className="font-semibold mb-4">Income Statement</h2><div className="flex justify-between py-2"><span>Revenue</span><b>{money(revenue)}</b></div><div className="flex justify-between py-2"><span>Expenses</span><b>{money(expenses)}</b></div><div className="flex justify-between py-3 border-t font-semibold"><span>Net income</span><b>{money(netIncome)}</b></div><p className="text-xs opacity-50 mt-3">Derived from posted journal lines plus account opening balances where applicable.</p></section>:<section className="rounded-2xl border p-5"><h2 className="font-semibold mb-4">Balance Sheet</h2><div className="flex justify-between py-2"><span>Total assets</span><b>{money(assets)}</b></div><div className="flex justify-between py-2"><span>Total liabilities</span><b>{money(liabilities)}</b></div><div className="flex justify-between py-2"><span>Equity incl. current net income</span><b>{money(equity)}</b></div><div className="flex justify-between py-3 border-t font-semibold"><span>Liabilities + equity</span><b>{money(liabilities+equity)}</b></div><p className="text-xs opacity-50 mt-3">Derived from the ledger. Opening balances remain opening balances; posted activity comes from journal lines.</p></section>}</div>}

    {showAccount&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="w-full max-w-md rounded-2xl bg-[var(--av-surface-elevated)] border p-6"><div className="flex justify-between mb-4"><h2 className="font-semibold">New account</h2><button onClick={()=>setShowAccount(false)}><X size={18}/></button></div><div className="space-y-3"><input className="w-full border rounded-lg p-2" placeholder="Code" value={code} onChange={e=>setCode(e.target.value)}/><input className="w-full border rounded-lg p-2" placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/><select className="w-full border rounded-lg p-2" value={type} onChange={e=>setType(e.target.value as Account['type'])}>{types.map(t=><option key={t} value={t}>{t}</option>)}</select><input className="w-full border rounded-lg p-2" type="number" placeholder="Opening balance" value={opening} onChange={e=>setOpening(e.target.value)}/><button disabled={saving} onClick={()=>void createAccount()} className="w-full py-2 rounded-lg avenize-gradient text-white">{saving?'Saving…':'Create account'}</button></div></div></div>}
    {showEntry&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-[var(--av-surface-elevated)] border p-6"><div className="flex justify-between mb-4"><h2 className="font-semibold">Post journal entry</h2><button onClick={()=>setShowEntry(false)}><X size={18}/></button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4"><input className="border rounded-lg p-2" type="date" value={date} onChange={e=>setDate(e.target.value)}/><input className="border rounded-lg p-2" placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)}/></div><div className="space-y-2">{draft.map((l,i)=><div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_130px_130px_1fr_auto] gap-2 items-center"><select className="border rounded-lg p-2" value={l.account_id} onChange={e=>setDraft(v=>v.map((x,n)=>n===i?{...x,account_id:e.target.value}:x))}><option value="">Account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select><input className="border rounded-lg p-2" type="number" min="0" placeholder="Debit" value={l.debit} onChange={e=>setDraft(v=>v.map((x,n)=>n===i?{...x,debit:e.target.value,credit:''}:x))}/><input className="border rounded-lg p-2" type="number" min="0" placeholder="Credit" value={l.credit} onChange={e=>setDraft(v=>v.map((x,n)=>n===i?{...x,credit:e.target.value,debit:''}:x))}/><input className="border rounded-lg p-2" placeholder="Line description" value={l.description} onChange={e=>setDraft(v=>v.map((x,n)=>n===i?{...x,description:e.target.value}:x))}/><button onClick={()=>removeLine(i)} className="p-2 opacity-60"><X size={16}/></button></div>)}</div><button onClick={addLine} className="mt-3 px-3 py-2 rounded-lg border">Add line</button><div className={`mt-4 p-3 rounded-lg text-sm ${Math.abs(debits-credits)<=0.01&&debits>0?'bg-[var(--av-success-soft)]':'bg-[var(--av-warning-soft)]'}`}>Debit {money(debits)} · Credit {money(credits)} · {Math.abs(debits-credits)<=0.01&&debits>0?'Balanced':'Not balanced'}</div><button disabled={saving} onClick={()=>void createEntry()} className="w-full mt-4 py-2 rounded-lg avenize-gradient text-white">{saving?'Posting…':'Post entry'}</button></div></div>}
  </div>
}
