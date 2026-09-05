// Supabase Edge Function: Platform Health Checker
// Secret-gated endpoint for scheduled platform health checks.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

interface CheckResult {
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  error: string | null
  latencyMs: number | null
}

async function ping(url: string, timeoutMs = 8000) {
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - start, error: null as string | null }
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

async function checkSupabase(supabaseUrl: string): Promise<CheckResult> {
  const r = await ping(`${supabaseUrl}/health/v1`)
  if (r.ok || r.status === 404) return { status: 'healthy', error: null, latencyMs: r.latencyMs }
  if (r.status >= 500) return { status: 'degraded', error: `HTTP ${r.status}`, latencyMs: r.latencyMs }
  return { status: 'down', error: r.error || `HTTP ${r.status}`, latencyMs: r.latencyMs }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const cronSecret = Deno.env.get('PLATFORM_HEALTH_CRON_SECRET')
  const provided = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret')
  if (!cronSecret || !provided || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'missing_supabase_env' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const supa = await checkSupabase(supabaseUrl)
  const { error } = await supabase.rpc('record_integration_check', {
    p_integration: 'supabase',
    p_status: supa.status,
    p_error: supa.error,
    p_latency_ms: supa.latencyMs,
  })
  await Promise.resolve(supabase.rpc('evaluate_platform_alerts')).catch(() => {})

  return new Response(JSON.stringify({ checked: 1, results: [{ integration: 'supabase', status: supa.status, writeError: error?.message ?? null }] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
