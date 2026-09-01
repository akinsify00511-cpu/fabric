// Sarah — Avenize's business operating assistant.
// Uses a real LLM when OPENAI_API_KEY is configured, while grounding every
// answer in the caller's live, RLS-scoped business context. Deterministic
// routing remains the safe fallback if the AI provider is unavailable.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const DAILY_CAP = 100

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}
function fmtMoney(n: number, currency = '₦') { return `${currency}${Math.round(n).toLocaleString()}` }
function findMetric(ctx: any, keys: string[]) { return (ctx.metrics || []).find((m: any) => keys.some((k) => (m.key || '').toLowerCase().includes(k))) }
function trend(m: any) { if (!m || m.change_percent == null) return ''; return ` (${m.change_percent >= 0 ? 'up' : 'down'} ${Math.abs(m.change_percent).toFixed(1)}% vs last period)` }
const STATE_LABELS: Record<string,string> = { growing:'growing', stable:'stable', scaling:'scaling fast', stressed:'under pressure', recovering:'recovering', at_risk:'at risk', cash_constrained:'cash-constrained', sales_constrained:'sales-constrained', capacity_constrained:'capacity-constrained', operationally_constrained:'operationally constrained', opportunity_rich:'opportunity-rich', insufficient_data:'still being measured' }

function deterministic(question: string, ctx: any) {
  const q = question.trim()
  if (/how is (my |the )?(business|company)|business (doing|health)|overall health|state of (my |the )?business/i.test(q)) {
    const parts = []
    if (ctx.state) parts.push(`Your business is ${STATE_LABELS[ctx.state] ?? ctx.state}`)
    if (ctx.healthScore != null) parts.push(`with an overall health score of ${Math.round(ctx.healthScore)}/100`)
    const top = ctx.recommendations?.[0]; if (top?.statement || top?.title) parts.push(`The most important thing right now is ${top.statement ?? top.title}.`)
    return { intent:'business_health', confidence:ctx.healthScore != null ? 'high':'medium', sources:['business context'], answer:parts.length ? `${parts.join(' ')}.` : "I don't have enough business data yet to give you a reliable health assessment." }
  }
  if (/revenue|sales (doing|numbers|figure)|income|how much (did we|have we) (make|earn|sell)/i.test(q)) {
    const m = findMetric(ctx,['revenue','income']); if (!m || m.current_value == null) return { intent:'revenue',confidence:'low',sources:[],answer:"I don't have enough recorded revenue data to give you a reliable number yet." }
    return { intent:'revenue',confidence:'high',sources:[`metric:${m.key}`],answer:`Revenue this period is ${fmtMoney(m.current_value)}${trend(m)}${m.target_value ? `, which is ${Math.round((m.current_value/m.target_value)*100)}% of the ${fmtMoney(m.target_value)} target.` : '.'}` }
  }
  if (/cash ?(flow|position)?|money (in|out)|runway/i.test(q)) {
    const m = findMetric(ctx,['cash','cashflow','net']); if (!m || m.current_value == null) return { intent:'cash',confidence:'low',sources:[],answer:"I don't have enough cash-flow data to give you a reliable position yet." }
    return { intent:'cash',confidence:'high',sources:[`metric:${m.key}`],answer:`Net cash this period is ${fmtMoney(m.current_value)}${trend(m)}.` }
  }
  if (/overdue|unpaid|who owes|receivable|outstanding invoice/i.test(q)) {
    if (ctx.overdueInvoices == null) return { intent:'overdue',confidence:'low',sources:[],answer:"I can't reliably assess overdue invoices because invoice data is not available right now." }
    return { intent:'overdue',confidence:'high',sources:['invoices'],answer:ctx.overdueInvoices === 0 ? 'You have no overdue invoices right now.' : `You have ${ctx.overdueInvoices} overdue invoice${ctx.overdueInvoices === 1 ? '' : 's'}. I would make collections a priority if cash is under pressure.` }
  }
  if (/what should i (do|focus)|what'?s (the )?(most important|priority|next)|next best|where should i (focus|start)/i.test(q)) {
    const nba = ctx.nextBestAction; const top = ctx.recommendations?.[0]; const item = nba?.statement || top?.statement || top?.title
    return { intent:'next_action',confidence:item ? 'high':'low',sources:item ? ['next best action engine'] : [],answer:item ? `${item}${nba?.expectedImpact ? ` Expected impact: ${nba.expectedImpact}.` : ''}` : 'I do not see a reliable priority yet. Give me more operating data and I will surface the highest-value action.' }
  }
  const parts=[]
  if(ctx.state) parts.push(`business state: ${STATE_LABELS[ctx.state] ?? ctx.state}`)
  if(ctx.healthScore!=null) parts.push(`health: ${Math.round(ctx.healthScore)}/100`)
  const rev=findMetric(ctx,['revenue','income']); if(rev?.current_value!=null) parts.push(`revenue: ${fmtMoney(rev.current_value)}${trend(rev)}`)
  const top=ctx.recommendations?.[0]; if(top?.statement || top?.title) parts.push(`top priority: ${top.statement ?? top.title}`)
  return { intent:'business_context',confidence:parts.length ? 'medium':'low',sources:parts.length ? ['business context']:[],answer:parts.length ? `Here is what I can establish from your live data: ${parts.join('; ')}. Tell me what decision you are trying to make and I will work through it with you.` : "I don't have enough live business context to answer that reliably yet." }
}

async function askLLM(question: string, ctx: any, history: any[]) {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return null
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5.5'
  const system = `You are Sarah, the senior business operating assistant inside Avenize. You are not a generic chatbot. You act like a sharp chief-of-staff/business operator: understand the owner's situation, identify what matters, explain why, challenge weak assumptions, and turn insight into practical next actions.\n\nGROUNDING RULES:\n- Treat the LIVE BUSINESS CONTEXT below as your source of truth for company-specific facts and numbers. Never invent a number, customer, employee, transaction, KPI, or event.\n- If the data is missing or conflicting, say so clearly and tell the user what data is needed.\n- Distinguish facts from inference and recommendations.\n- Prefer concise, decisive answers with a clear recommendation when appropriate.\n- When a question requires a write/action, explain the proposed action and ask for confirmation rather than pretending you executed it.\n- You know Avenize modules such as CRM, sales, finance, operations, tasks, people, inventory and intelligence, but only claim specific records when they appear in the supplied context.\n- Maintain continuity with the recent conversation when useful.\n\nLIVE BUSINESS CONTEXT:\n${JSON.stringify(ctx)}\n\nRECENT CONVERSATION:\n${JSON.stringify(history.slice(-10))}`
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
    body:JSON.stringify({ model, temperature:0.2, messages:[{role:'system',content:system},{role:'user',content:question}], max_tokens:900 })
  })
  if (!res.ok) throw new Error(`AI provider ${res.status}`)
  const data = await res.json()
  const answer = data?.choices?.[0]?.message?.content?.trim()
  if (!answer) throw new Error('AI provider returned no answer')
  return { answer, provider:'ai', confidence:'grounded', sources:['live business context'] }
}

Deno.serve(async (req: Request) => {
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS_HEADERS})
  if(req.method!=='POST') return json({error:'Method not allowed'},405)
  const supabaseUrl=Deno.env.get('SUPABASE_URL')!
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'')
  if(!jwt) return json({error:'Unauthorized'},401)
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${jwt}`}}})
  const service=createClient(supabaseUrl,serviceKey)
  const startedAt=Date.now(); let businessId:string|null=null
  try {
    const {data:userData}=await userClient.auth.getUser(); const user=userData?.user
    if(!user) return json({error:'Unauthorized'},401)
    const {data:staffRow}=await userClient.from('staff').select('id,business_id').eq('user_id',user.id).limit(1).maybeSingle()
    if(!staffRow?.business_id) return json({error:'No business membership.'},403)
    businessId=staffRow.business_id
    let body:any; try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const question=String(body.question||'').trim(); if(!question)return json({error:'Ask a question.'},400); if(question.length>2000)return json({error:'Question too long.'},400)
    const {count}=await service.from('copilot_messages').select('id',{count:'exact',head:true}).eq('business_id',businessId).eq('role','user').gte('created_at',new Date(new Date().setHours(0,0,0,0)).toISOString())
    if((count??0)>=DAILY_CAP)return json({error:`Daily limit reached (${DAILY_CAP} questions per business). Try again tomorrow.`},429)

    const [healthRes,metricsRes,recsRes,brainRes,overdueRes,businessRes,historyRes]=await Promise.allSettled([
      userClient.rpc('current_business_health',{p_business_id:businessId}),
      userClient.rpc('current_metrics',{p_business_id:businessId}),
      userClient.rpc('open_recommendations',{p_business_id:businessId}),
      userClient.rpc('business_brain',{p_business_id:businessId}),
      userClient.from('invoices').select('id',{count:'exact',head:true}).lt('due_date',new Date().toISOString()).in('status',['sent','overdue','partial']),
      userClient.from('businesses').select('name,currency').eq('id',businessId).maybeSingle(),
      service.from('copilot_messages').select('role,content').eq('business_id',businessId).eq('user_id',user.id).order('created_at',{ascending:false}).limit(10),
    ])
    const health=healthRes.status==='fulfilled'?healthRes.value.data:null
    const metrics=metricsRes.status==='fulfilled'?(metricsRes.value.data||[]):[]
    const recs=recsRes.status==='fulfilled'?(recsRes.value.data||[]):[]
    const brain=brainRes.status==='fulfilled'?brainRes.value.data:null
    const overdue=overdueRes.status==='fulfilled'?(overdueRes.value.count??null):null
    const business=businessRes.status==='fulfilled'?businessRes.value.data:null
    const history=historyRes.status==='fulfilled'?(historyRes.value.data||[]).reverse():[]
    const ctx={ businessName:business?.name??null,currency:business?.currency??'NGN',state:brain?.state?.state??brain?.business_state?.state??null,healthScore:(Array.isArray(health)?health[0]?.overall_score:health?.overall_score)??null,metrics,recommendations:recs,nextBestAction:brain?.next_best_action??brain?.nba??null,overdueInvoices:overdue }

    let routed:any=null
    try { routed=await askLLM(question,ctx,history) } catch(e) { console.error('[sarah-ai]',e) }
    if(!routed) { const d=deterministic(question,ctx); routed={...d,provider:'deterministic'} }

    const snapshot={businessName:ctx.businessName,state:ctx.state,healthScore:ctx.healthScore,metricKeys:metrics.map((m:any)=>m.key).slice(0,20)}
    await service.from('copilot_messages').insert([{business_id:businessId,user_id:user.id,role:'user',content:question,context_snapshot:snapshot},{business_id:businessId,user_id:user.id,role:'assistant',content:routed.answer,provider:routed.provider,sources:routed.sources,intent:routed.intent??null,context_snapshot:snapshot}])
    try{await service.rpc('emit_platform_activity',{p_event_type:'ai.completed',p_feature:'ask-avenize',p_business_id:businessId,p_result:'completed',p_severity:'info',p_service:'edge-fn',p_correlation_id:null,p_payload:{intent:routed.intent??'assistant',provider:routed.provider,duration_ms:Date.now()-startedAt}})}catch{}
    return json({answer:routed.answer,sources:routed.sources,intent:routed.intent??'assistant',confidence:routed.confidence,provider:routed.provider,assistant:'Sarah'})
  } catch(e) {
    console.error('[ask-avenize]',e)
    return json({error:'Something went wrong answering that. Try again.'},500)
  }
})
