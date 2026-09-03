// AI INTENT & DATA GATEWAY (Architecture §5)
// Natural-language capture only parses and proposes actions. It never performs
// business mutations. Any downstream commit must independently authorize the
// authenticated actor and tenant.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EntityMatch { field: string; value: string; raw: string }
interface ProposedDestination { entity_type: string; action: string; reason: string }
interface ParsedIntent {
  event_type: string
  summary: string
  entities: EntityMatch[]
  destinations: ProposedDestination[]
  confidence: number
  evidence: { source: string; method: string }
  needs_confirmation: boolean
}

function extractMoney(text: string): string | null {
  const m = text.match(/(₦|NGN|naira|\$|USD)\s?([\d.,]+)\s?(m|million|k|thousand|bn|billion)?/i)
  if (!m) return null
  let n = parseFloat(m[2].replace(/,/g, ''))
  const unit = (m[3] || '').toLowerCase()
  if (unit.startsWith('m') || unit === 'million') n *= 1_000_000
  else if (unit.startsWith('b') || unit === 'billion') n *= 1_000_000_000
  else if (unit.startsWith('k') || unit === 'thousand') n *= 1_000
  return n.toString()
}
function extractPercent(text: string): string | null {
  const m = text.match(/(\d{1,3})\s?%/)
  return m ? m[1] : null
}
function extractName(text: string, after: string[]): string | null {
  for (const a of after) {
    const re = new RegExp(a + '\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)', 'i')
    const m = text.match(re)
    if (m) return m[1]
  }
  return null
}
function detectEventType(text: string): { event_type: string; confidence: number } {
  const t = text.toLowerCase()
  if (/(closed|won|signed the deal|signed up|deal closed)/.test(t)) return { event_type: 'DealWon', confidence: 0.85 }
  if (/(paid|received payment|payment came|money in|settled)/.test(t)) return { event_type: 'PaymentReceived', confidence: 0.8 }
  if (/(hired|joined|onboarded|new hire|started)/.test(t)) return { event_type: 'EmployeeJoined', confidence: 0.8 }
  if (/(left|resigned|exited|fired|let go|quit)/.test(t)) return { event_type: 'EmployeeExited', confidence: 0.75 }
  if (/(low stock|out of stock|reorder|running out|stock finished)/.test(t)) return { event_type: 'InventoryLow', confidence: 0.8 }
  if (/(overdue|late|missed deadline|delayed)/.test(t)) return { event_type: 'TaskOverdue', confidence: 0.7 }
  if (/(expiring|renew|expir)/.test(t)) return { event_type: 'ContractExpiring', confidence: 0.7 }
  if (/(payroll|salary|run payroll|pay salaries)/.test(t)) return { event_type: 'PayrollDue', confidence: 0.7 }
  return { event_type: 'Note', confidence: 0.4 }
}
function parse(text: string): ParsedIntent {
  const { event_type, confidence } = detectEventType(text)
  const entities: EntityMatch[] = []
  const money = extractMoney(text)
  if (money) entities.push({ field: 'amount', value: money, raw: text.match(/(₦|NGN|\$|USD)\s?[\d.,]+\s?(m|million|k|thousand|bn|billion)?/i)?.[0] || money })
  const pct = extractPercent(text)
  if (pct) entities.push({ field: 'upfront_percent', value: pct, raw: `${pct}%` })
  const owner = extractName(text, ['handled by', 'owner', 'rep', 'managed by', 'by'])
  if (owner) entities.push({ field: 'sales_owner', value: owner, raw: owner })
  const q = text.match(/(?:deal|contract|account)\s+(?:for|with|at)\s+([A-Z][A-Za-z0-9 &]+)/)
  if (q) entities.push({ field: 'customer', value: q[1].trim(), raw: q[0] })

  const destinations: ProposedDestination[] = []
  if (event_type === 'DealWon') {
    destinations.push(
      { entity_type: 'deal', action: 'mark_won', reason: 'Sales pipeline should reflect the win' },
      { entity_type: 'customer', action: 'upsert', reason: 'Customer record should exist and link to the deal' },
      { entity_type: 'commission', action: 'calculate', reason: 'Sales owner commission may be due' },
      { entity_type: 'invoice', action: 'draft', reason: 'Upfront portion may need invoicing' },
      { entity_type: 'forecast', action: 'update', reason: 'Revenue forecast should include the win' },
    )
  } else if (event_type === 'PaymentReceived') {
    destinations.push(
      { entity_type: 'receivable', action: 'reduce', reason: 'Outstanding receivable should decrease' },
      { entity_type: 'cash', action: 'increase', reason: 'Cash position should reflect the receipt' },
      { entity_type: 'invoice', action: 'mark_paid', reason: 'Linked invoice may now be settled' },
    )
  } else if (event_type === 'EmployeeJoined') {
    destinations.push(
      { entity_type: 'staff', action: 'create', reason: 'Employee record needed for payroll/permissions' },
      { entity_type: 'organogram', action: 'add', reason: 'Reporting line should be set' },
    )
  } else {
    destinations.push({ entity_type: 'note', action: 'create', reason: 'Capture as a business note' })
  }
  const needs_confirmation = ['DealWon', 'PaymentReceived', 'EmployeeJoined', 'EmployeeExited', 'PayrollDue'].includes(event_type)
  return { event_type, summary: `${event_type}: ${entities.map(e => `${e.field}=${e.value}`).join(', ') || 'no structured fields detected'}`, entities, destinations, confidence, evidence: { source: 'user_input', method: 'deterministic_nlp_parser' }, needs_confirmation }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return new Response(JSON.stringify({ error: 'text required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return new Response(JSON.stringify({ error: 'AI gateway unavailable' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const token = authHeader.slice(7)
    const supabase = createClient(supabaseUrl, serviceKey)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Never trust tenant/actor identifiers supplied by the client. Resolve both
    // exclusively from the authenticated identity.
    const { data: staffRows, error: staffError } = await supabase.from('staff').select('business_id,id,is_active,active').eq('user_id', user.id)
    if (staffError || !staffRows?.length) return new Response(JSON.stringify({ error: 'Staff membership required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const staffData = staffRows.find((s: { is_active?: boolean; active?: boolean }) => (s.is_active ?? s.active ?? true) === true)
    if (!staffData) return new Response(JSON.stringify({ error: 'Active staff membership required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const result = parse(text)
    const writeActions = new Set(['mark_won', 'upsert', 'create', 'mark_paid', 'reduce', 'increase', 'draft', 'calculate', 'update', 'add'])
    const impliesWrite = result.destinations.some(d => writeActions.has(d.action))
    const guardrail = {
      checked: true,
      rung: impliesWrite ? 'execute_with_approval' : 'observe',
      allowed: !impliesWrite,
      reason: impliesWrite
        ? 'Proposal only. A separate authenticated commit path must require explicit user approval and re-authorize tenant/actor.'
        : 'Read/parse only; no mutation capability exposed by this gateway.',
    }

    // Fail closed: if an agent asks this parser to authorize a write, do not
    // let the presence of agent_id bypass approval. This endpoint returns a
    // proposal, never an execution token or mutation authorization.
    if (body.agent_id && impliesWrite) {
      guardrail.allowed = false
      guardrail.reason = 'Agent-originated writes are denied at the intent gateway; explicit human approval and a separate authorized commit path are required.'
    }

    return new Response(JSON.stringify({ intent: result, guardrail, actor_id: staffData.id, business_id: staffData.business_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
