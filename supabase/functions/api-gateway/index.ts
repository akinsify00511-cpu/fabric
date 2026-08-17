// api-gateway — the public API gateway (#extensibility).
// Validates a presented `avenize_` API key via the verify_api_key RPC (which
// hashes it server-side + enforces active/expiry/IP-allowlist), then proxies a
// READ-ONLY request to the authenticated business's data.
//
// Security:
//   - The raw key is NEVER stored. verify_api_key hashes it (sha256) and matches
//     key_hash. This function passes the raw key straight to the RPC; it does
//     not log or persist it.
//   - Read-only: only GET. No write/insert/update/delete through the gateway.
//     The api_keys.permissions/scopes are checked; 'data:read' is required.
//   - Business-scoped: every query is filtered to the key's business_id. A key
//     for business A can never read business B's data.
//   - RLS is the backstop: the anon client + explicit business_id filter is the
//     primary boundary; RLS enforces it server-side.
//
// Usage:
//   GET /functions/v1/api-gateway/contacts
//   Authorization: Bearer avenize_<key>
//   → returns the business's contacts (read-only)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// The read-only resource map: path segment → table + columns. This is the
// explicit allowlist of what the public API exposes. Adding a resource here
// is a deliberate act — never wildcard.
const RESOURCES: Record<string, { table: string; select: string }> = {
  contacts: { table: 'contacts', select: 'id,name,email,phone,company,created_at' },
  deals: { table: 'deals', select: 'id,title,stage,value,contact_id,created_at' },
  invoices: { table: 'invoices', select: 'id,invoice_number,client_name,client_email,total_amount,status,due_date,created_at' },
  products: { table: 'products', select: 'id,name,sku,price,stock,category,created_at' },
  tasks: { table: 'tasks', select: 'id,title,status,priority,assignee_id,due_date,created_at' },
}

interface VerifiedKey {
  api_key_id: string
  business_id: string
  scopes: string[]
  permissions: string[]
}

async function verifyKey(rawKey: string, ip: string | null): Promise<VerifiedKey | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data, error } = await supabase.rpc('verify_api_key', {
    p_raw_key: rawKey,
    p_ip: ip,
  })

  if (error || !data) return null
  // verify_api_key returns a single row (or null). Normalize.
  const row = Array.isArray(data) ? data[0] : data
  if (!row || !row.business_id) return null

  return {
    api_key_id: row.api_key_id,
    business_id: row.business_id,
    scopes: row.scopes || [],
    permissions: row.permissions || [],
  }
}

Deno.serve(async (req) => {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Read-only: only GET is allowed through the gateway.
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed. The public API is read-only (GET only).' }, 405)
  }

  // Extract the key from the Authorization header.
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing or malformed Authorization header. Use: Bearer avenize_<key>' }, 401)
  }
  const rawKey = authHeader.substring(7).trim()
  if (!rawKey.startsWith('avenize_')) {
    return json({ error: 'Invalid API key format.' }, 401)
  }

  // Client IP (best-effort, for IP-allowlist enforcement).
  const ip = req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || null

  // Verify the key (server-side hash + active/expiry/IP checks).
  const verified = await verifyKey(rawKey, ip)
  if (!verified) {
    // Deliberately generic — no oracle about which check failed.
    return json({ error: 'Invalid, expired, or inactive API key.' }, 401)
  }

  // Scope check: data:read required.
  if (!verified.scopes.includes('data:read')) {
    return json({ error: 'API key lacks the data:read scope.' }, 403)
  }

  // Parse the requested resource from the URL path.
  // /functions/v1/api-gateway/contacts  →  "contacts"
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const gatewayIdx = pathParts.findIndex((p) => p === 'api-gateway')
  const resource = pathParts[gatewayIdx + 1]

  if (!resource || !RESOURCES[resource]) {
    return json({
      error: `Unknown resource: "${resource || '(none)'}".`,
      available: Object.keys(RESOURCES),
    }, 404)
  }

  // Fetch the resource, scoped to the key's business. Explicit business_id
  // filter is the primary boundary; RLS is the backstop.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, anonKey)

  const cfg = RESOURCES[resource]
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)

  const { data, error } = await supabase
    .from(cfg.table)
    .select(cfg.select)
    .eq('business_id', verified.business_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return json({ error: 'Failed to fetch resource.', detail: error.message }, 500)
  }

  return json({
    resource,
    count: data.length,
    data,
  }, 200)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}
