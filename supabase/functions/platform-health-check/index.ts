// Supabase Edge Function: Platform Health Checker
//
// The platform has no third-party runtime dependencies, so the only health
// signal is Supabase itself (database + REST). The result is written via
// record_integration_check (service-role). The threshold->incident automation
// (evaluate_platform_alerts, pg_cron every 3 min) then reads this data and
// opens incidents when a consecutive-failure streak crosses the tunable
// threshold.
//
// Invocation: external cron (Vercel cron / GitHub Actions) hits this endpoint
// with the PLATFORM_HEALTH_CRON_SECRET. This secret-gate prevents public
// abuse of the endpoint (it would otherwise let anyone force outbound pings).
// It is NOT a webhook source.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ambient).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckResult {
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  error: string | null
  latencyMs: number | null
}

async function ping(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<{ ok: boolean; status: number; latencyMs: number; error: string | null }> {
  const start = Date.now()
  const timeoutMs = init?.timeoutMs ?? 8000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - start, error: null }
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

async function checkSupabase(supabaseUrl: string): Promise<CheckResult> {
  const r = await ping(`${supabaseUrl}/health/v1`, { timeoutMs: 8000 })
  if (r.ok) return { status: 'healthy', error: null, latencyMs: r.latencyMs }
  if (r.status >= 500) return { status: 'degraded', error: `HTTP ${r.status}`, latencyMs: r.latencyMs }
  // 404 = the health endpoint isn't enabled but the project is reachable.
  if (r.status === 404) return { status: 'healthy', error: null, latencyMs: r.latencyMs }
  return { status: 'down', error: r.error || `HTTP ${r.status}`, latencyMs: r.latencyMs }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Secret gate: this endpoint drives outbound pings. Gate it so the public
  // can't trigger a flood of them.
  const cronSecret = Deno.env.get('PLATFORM_HEALTH_CRON_SECRET')
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret')
    if (provided !== cronSecret) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'missing supabase env' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const supa = await checkSupabase(supabaseUrl)
  const checks: { integration: string; result: CheckResult }[] = [
    { integration: 'supabase', result: supa },
  ]

  // Write each result via the service-role RPC.
  const results = []
  for (const c of checks) {
    const { error } = await supabase.rpc('record_integration_check', {
      p_integration: c.integration,
      p_status: c.result.status,
      p_error: c.result.error,
      p_latency_ms: c.result.latencyMs,
    })
    results.push({ integration: c.integration, status: c.result.status, writeError: error?.message ?? null })
  }

  // After writing, trigger the alert evaluator so incidents open/close
  // immediately rather than waiting for the next 3-min pg_cron tick.
  await Promise.resolve(supabase.rpc('evaluate_platform_alerts')).catch(() => {
    // best-effort; the pg_cron job will pick it up regardless.
  })

  return new Response(JSON.stringify({ checked: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
