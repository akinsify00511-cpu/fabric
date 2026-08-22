// AI INTENT & DATA GATEWAY (Architecture §5)
//
// Natural-language capture: "We just closed the ABC Properties deal for ₦45m.
// John handled it and the client will pay 40% upfront."
//
// Turns free text into structured intent: detected event, extracted
// entities, proposed canonical destinations, and a confidence score.
// The client shows a "What I Understood" confirmation before committing.

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

  return {
    event_type,
    summary: `${event_type}: ${entities.map(e => `${e.field}=${e.value}`).join(', ') || 'no structured fields detected'}`,
    entities,
    destinations,
    confidence,
    evidence: { source: 'user_input', method: 'deterministic_nlp_parser' },
    needs_confirmation,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    const text = body.text
    const actorId = body.actor_id || body.staff_id
    if (!text) {
      return new Response(JSON.stringify({ error: 'text required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // SECURITY: Verify the caller and derive business_id from their staff
    // record. This also ensures the guardrail check below actually runs
    // (previously business_id was never sent by the client, so the guardrail
    // was silently skipped for every capture).
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: staffData } = await supabase
      .from('staff')
      .select('business_id, id')
      .eq('user_id', user.id)
      .maybeSingle()
    const businessId = staffData?.business_id || body.business_id
    const resolvedActorId = actorId || staffData?.id
    const result = parse(String(text))

    // §34/§37 AI Action Authority + Guardrails: if this capture implies an
    // autonomous write (destinations with action verbs), classify the
    // requested rung and consult the guardrail. Low-risk read/observe is
    // always allowed; writes require execute_with_approval unless the
    // capability is explicitly authorised higher.
    const writeActions = ['mark_won', 'upsert', 'create', 'mark_paid', 'reduce', 'increase', 'draft', 'calculate']
    const impliesWrite = result.destinations.some(d => writeActions.includes(d.action))
    let guardrail: { checked: boolean; rung?: string; allowed?: boolean; reason?: string } = {
      checked: false,
    }
    if (impliesWrite && businessId) {
      const rung = result.needs_confirmation ? 'execute_with_approval' : 'low_risk_execute'
      guardrail = { checked: true, rung, allowed: true, reason: 'within authority (client confirms)' }
      // If an agent_id was passed, consult the DB-side guardrail too.
      if (body.agent_id) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
          if (supabaseUrl && serviceKey) {
            const grRes = await fetch(`${supabaseUrl}/rest/v1/rpc/run_agent_guardrail`, {
              method: 'POST',
              headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                p_business_id: businessId,
                p_agent_id: body.agent_id,
                p_capability: result.event_type,
                p_rung: rung,
                p_requires_simulation: false,
              }),
            })
            if (grRes.ok) {
              const gr = await grRes.json()
              guardrail = { checked: true, rung, allowed: gr.passed, reason: gr.blocked_reason || 'guardrail passed' }
              // §38 Circuit breaker: if the guardrail blocked, trip it.
              if (!gr.passed) {
                await fetch(`${supabaseUrl}/rest/v1/rpc/trip_circuit_breaker`, {
                  method: 'POST',
                  headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    p_business_id: businessId,
                    p_agent_id: body.agent_id,
                    p_anomaly: `Guardrail blocked ${result.event_type} at rung ${rung}: ${gr.blocked_reason}`,
                  }),
                })
              }
            }
          }
        } catch (e) {
          guardrail.reason = `guardrail check skipped: ${String(e)}`
        }
      }
    }

    return new Response(JSON.stringify({
      intent: result,
      guardrail,
      actor_id: resolvedActorId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
