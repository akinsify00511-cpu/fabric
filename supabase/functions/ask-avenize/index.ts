// Sarah — Avenize's native business operating assistant.
// No external AI provider. Reasoning is produced from live, RLS-scoped
// Avenize data using an explicit multi-factor decision engine.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const DAILY_CAP = 100

type Metric = { key?: string; current_value?: number | null; target_value?: number | null; change_percent?: number | null; label?: string }
type Context = { businessName: string | null; currency: string; state: string | null; healthScore: number | null; metrics: Metric[]; recommendations: any[]; nextBestAction: any; overdueInvoices: number | null }

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }) }
function money(n: number, currency: string) { return `${currency === 'NGN' ? '₦' : currency}${Math.round(n).toLocaleString()}` }
function metric(ctx: Context, names: string[]) { return ctx.metrics.find(m => names.some(n => `${m.key ?? ''} ${m.label ?? ''}`.toLowerCase().includes(n))) }
function trend(m?: Metric) { return m?.change_percent == null ? '' : `, ${m.change_percent >= 0 ? 'up' : 'down'} ${Math.abs(m.change_percent).toFixed(1)}% versus the previous period` }
function stateLabel(s: string | null) { return ({ growing:'growing', stable:'stable', scaling:'scaling quickly', stressed:'under pressure', recovering:'recovering', at_risk:'at risk', cash_constrained:'cash-constrained', sales_constrained:'sales-constrained', capacity_constrained:'capacity-constrained', operationally_constrained:'operationally constrained', opportunity_rich:'full of opportunity', insufficient_data:'still being measured' } as Record<string,string>)[s ?? ''] ?? s }
function clean(v: any) { return typeof v === 'string' ? v.replace(/\s+/g,' ').trim() : '' }

function priorities(ctx: Context) {
  const out: {score:number; text:string; why:string; source:string}[] = []
  const health = ctx.healthScore
  if (health != null && health < 50) out.push({score:100-health, text:'Stabilise the weakest part of the business before chasing expansion.', why:`the health score is ${Math.round(health)}/100`, source:'business health'})
  if (ctx.overdueInvoices != null && ctx.overdueInvoices > 0) out.push({score:85 + Math.min(ctx.overdueInvoices,15), text:`Follow up on the ${ctx.overdueInvoices} overdue invoice${ctx.overdueInvoices === 1 ? '' : 's'} and protect cash collection.`, why:'cash already earned is waiting to be collected', source:'invoices'})
  const rev = metric(ctx,['revenue','income','sales'])
  if (rev?.current_value != null && rev.target_value != null && rev.target_value > 0) {
    const pct = rev.current_value / rev.target_value * 100
    if (pct < 70) out.push({score:80 + (70-pct)/10, text:'Close the revenue gap with focused sales activity rather than spreading effort across every opportunity.', why:`revenue is at ${Math.round(pct)}% of target${trend(rev)}`, source:`metric:${rev.key ?? 'revenue'}`})
    else if (pct >= 100) out.push({score:55, text:'Protect the revenue momentum and identify what is driving the result so it can be repeated.', why:`revenue is at ${Math.round(pct)}% of target`, source:`metric:${rev.key ?? 'revenue'}`})
  }
  const top = ctx.nextBestAction
  if (clean(top?.statement)) out.push({score:90, text:clean(top.statement), why:clean(top.expectedImpact) ? `expected impact: ${clean(top.expectedImpact)}` : 'it is the current next-best-action signal', source:'next best action'})
  for (const r of ctx.recommendations.slice(0,3)) {
    const text = clean(r?.statement ?? r?.title)
    if (text) out.push({score:70, text, why:clean(r?.reason ?? r?.rationale), source:'recommendation engine'})
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,3)
}

function answer(question: string, ctx: Context) {
  const q = question.toLowerCase()
  const rev = metric(ctx,['revenue','income','sales'])
  const cash = metric(ctx,['cashflow','cash flow','cash','net cash'])
  const recs = priorities(ctx)
  const health = ctx.healthScore
  const asks = (...terms: string[]) => terms.some(t => q.includes(t))

  if (asks('how is my business','how is the business','business doing','business health','overall health','state of my business')) {
    const facts:string[]=[]
    if (ctx.state) facts.push(`The business is currently ${stateLabel(ctx.state)}`)
    if (health != null) facts.push(`with a health score of ${Math.round(health)}/100`)
    if (rev?.current_value != null) facts.push(`revenue is ${money(rev.current_value,ctx.currency)} this period${trend(rev)}`)
    const p=recs[0]
    return {intent:'business_health',confidence:facts.length ? 'high':'low',sources:['business health','business metrics','decision engine'],answer:facts.length ? `${facts.join(' ')}. ${p ? `My read: ${p.text} The reason is ${p.why || 'it has the strongest current signal'}.` : 'I do not see a stronger priority in the available data.'}` : 'I cannot reliably assess the business yet because the required live health and operating data is not available.'}
  }
  if (asks('revenue','sales','income','made','earned')) {
    if (!rev?.current_value == null) return {intent:'revenue',confidence:'low',sources:[],answer:'I do not have a reliable revenue figure in the live business data yet.'}
    return {intent:'revenue',confidence:'high',sources:[`metric:${rev.key ?? 'revenue'}`],answer:`Revenue this period is ${money(rev.current_value as number,ctx.currency)}${trend(rev)}${rev.target_value != null && rev.target_value > 0 ? `. That is ${Math.round((rev.current_value as number / rev.target_value) * 100)}% of the ${money(rev.target_value,ctx.currency)} target.` : '.'}`}
  }
  if (asks('cash','cash flow','cashflow','runway','money in','money out')) {
    if (cash?.current_value == null) return {intent:'cash',confidence:'low',sources:[],answer:'I do not have enough live cash-flow data to give you a reliable cash position.'}
    return {intent:'cash',confidence:'high',sources:[`metric:${cash.key ?? 'cash'}`],answer:`Net cash this period is ${money(cash.current_value,ctx.currency)}${trend(cash)}. ${ctx.overdueInvoices ? `There are also ${ctx.overdueInvoices} overdue invoice${ctx.overdueInvoices===1?'':'s'}, so collections deserve attention.` : 'There are no overdue invoices in the current data.'}`}
  }
  if (asks('overdue','unpaid','who owes','receivable','outstanding invoice','invoice')) {
    if (ctx.overdueInvoices == null) return {intent:'collections',confidence:'low',sources:[],answer:'Invoice data is not available enough for me to make a reliable collections assessment.'}
    return {intent:'collections',confidence:'high',sources:['invoices','decision engine'],answer:ctx.overdueInvoices === 0 ? 'There are no overdue invoices in the current live data.' : `There are ${ctx.overdueInvoices} overdue invoice${ctx.overdueInvoices===1?'':'s'}. I would make collection follow-up a priority because recovering already-earned cash is usually lower-friction than creating new demand.`}
  }
  if (asks('what should i','what do i','what is the priority','what’s the priority','what next','next best','focus on','where should i')) {
    const p=recs[0]
    return {intent:'next_action',confidence:p?'high':'low',sources:p?[p.source]:[],answer:p ? `Your highest-priority move is: ${p.text} ${p.why ? `Why: ${p.why}.` : ''}` : 'I do not have a strong enough live signal to name a priority yet. I would rather tell you that than invent one.'}
  }
  if (asks('risk','danger','problem','wrong','concern','putting revenue at risk')) {
    const risks=[]
    if (ctx.overdueInvoices) risks.push(`${ctx.overdueInvoices} overdue invoice${ctx.overdueInvoices===1?'':'s'}`)
    if (rev?.current_value != null && rev.target_value != null && rev.target_value > 0 && rev.current_value < rev.target_value) risks.push(`revenue running at ${Math.round(rev.current_value/rev.target_value*100)}% of target`)
    if (health != null && health < 60) risks.push(`a health score of ${Math.round(health)}/100`)
    if (!risks.length) return {intent:'risk',confidence:'medium',sources:['decision engine'],answer:'I do not see a material risk signal in the live data I can access right now. That is not the same as saying there is no risk; it means the current signals are not strong enough to flag one.'}
    return {intent:'risk',confidence:'high',sources:['business metrics','invoices','decision engine'],answer:`The strongest current risk signals are: ${risks.join('; ')}. I would address the highest-impact item first rather than spreading effort across all of them.`}
  }
  const p=recs[0]
  const snapshot=[]
  if (ctx.state) snapshot.push(`state: ${stateLabel(ctx.state)}`)
  if (health != null) snapshot.push(`health: ${Math.round(health)}/100`)
  if (rev?.current_value != null) snapshot.push(`revenue: ${money(rev.current_value,ctx.currency)}${trend(rev)}`)
  if (ctx.overdueInvoices != null) snapshot.push(`overdue invoices: ${ctx.overdueInvoices}`)
  return {intent:'business_reasoning',confidence:snapshot.length?'medium':'low',sources:snapshot.length?['live business context','decision engine']:[],answer:snapshot.length ? `Sarah's current read: ${snapshot.join('; ')}. ${p ? `The strongest action signal is: ${p.text}` : 'I need more operating data before I can make a strong recommendation.'} If you tell me the decision you are facing, I can break it into facts, risks and the next move.`}
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:CORS_HEADERS})
  if (req.method !== 'POST') return json({error:'Method not allowed'},405)
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'')
  if(!jwt) return json({error:'Unauthorized'},401)
  const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}}})
  const service=createClient(url,serviceKey)
  const started=Date.now()
  try {
    const {data:userData}=await userClient.auth.getUser(); const user=userData?.user
    if(!user) return json({error:'Unauthorized'},401)
    const {data:staff}=await userClient.from('staff').select('id,business_id').eq('user_id',user.id).limit(1).maybeSingle()
    if(!staff?.business_id) return json({error:'No business membership.'},403)
    let body:any; try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const question=String(body.question||'').trim(); if(!question)return json({error:'Ask a question.'},400); if(question.length>2000)return json({error:'Question too long.'},400)
    const {count}=await service.from('copilot_messages').select('id',{count:'exact',head:true}).eq('business_id',staff.business_id).eq('role','user').gte('created_at',new Date(new Date().setHours(0,0,0,0)).toISOString())
    if((count??0)>=DAILY_CAP)return json({error:`Daily limit reached (${DAILY_CAP} questions per business). Try again tomorrow.`},429)
    const [healthRes,metricsRes,recsRes,brainRes,overdueRes,businessRes]=await Promise.allSettled([
      userClient.rpc('current_business_health',{p_business_id:staff.business_id}),
      userClient.rpc('current_metrics',{p_business_id:staff.business_id}),
      userClient.rpc('open_recommendations',{p_business_id:staff.business_id}),
      userClient.rpc('business_brain',{p_business_id:staff.business_id}),
      userClient.from('invoices').select('id',{count:'exact',head:true}).lt('due_date',new Date().toISOString()).in('status',['sent','overdue','partial']),
      userClient.from('businesses').select('name,currency').eq('id',staff.business_id).maybeSingle(),
    ])
    const healthRaw=healthRes.status==='fulfilled'?healthRes.value.data:null
    const healthScore=(Array.isArray(healthRaw)?healthRaw[0]?.overall_score:healthRaw?.overall_score) ?? null
    const metrics=metricsRes.status==='fulfilled'?(metricsRes.value.data||[]):[]
    const recs=recsRes.status==='fulfilled'?(recsRes.value.data||[]):[]
    const brain=brainRes.status==='fulfilled'?brainRes.value.data:null
    const overdue=overdueRes.status==='fulfilled'?(overdueRes.value.count??null):null
    const business=businessRes.status==='fulfilled'?businessRes.value.data:null
    const ctx:Context={businessName:business?.name??null,currency:business?.currency??'NGN',state:brain?.state?.state??brain?.business_state?.state??null,healthScore,metrics,recommendations:recs,nextBestAction:brain?.next_best_action??brain?.nba??null,overdueInvoices:overdue}
    const result=answer(question,ctx)
    const snapshot={businessName:ctx.businessName,state:ctx.state,healthScore:ctx.healthScore,metricKeys:metrics.map((m:any)=>m.key).slice(0,20)}
    await service.from('copilot_messages').insert([{business_id:staff.business_id,user_id:user.id,role:'user',content:question,context_snapshot:snapshot},{business_id:staff.business_id,user_id:user.id,role:'assistant',content:result.answer,provider:'native',sources:result.sources,intent:result.intent,context_snapshot:snapshot}])
    try{await service.rpc('emit_platform_activity',{p_event_type:'ai.completed',p_feature:'ask-avenize',p_business_id:staff.business_id,p_result:'completed',p_severity:'info',p_service:'edge-fn',p_correlation_id:null,p_payload:{intent:result.intent,provider:'native',duration_ms:Date.now()-started}})}catch{}
    return json({answer:result.answer,sources:result.sources,intent:result.intent,confidence:result.confidence,provider:'native',assistant:'Sarah'})
  } catch(e) { console.error('[ask-avenize]',e); return json({error:'Something went wrong answering that. Try again.'},500) }
})
