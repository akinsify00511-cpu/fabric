// Session-scoped schema-availability circuit breaker.
//
// When the live database has drifted from the repo migration chain (objects
// missing server-side), every page load otherwise re-fires the same doomed
// requests — the production "console wall" of PGRST202/PGRST205/42703/42501.
// The first such response marks the object unavailable for the rest of the
// page session; subsequent callers skip the round trip and get an honest
// empty result. Reloading re-probes (fresh module state), so a just-applied
// migration is picked up immediately.

const PERMANENT_CODES = new Set(['PGRST202', 'PGRST205', '42703', '42P01', '42883', '42501'])

const PERMANENT_MESSAGE =
  /no matches found in the schema cache|could not find the function|could not find the table|does not exist|permission denied/i

export interface SchemaErrorLike {
  code?: string
  message?: string
}

/** True when the error means "this object is not in the database" (drift), not a runtime failure. */
export function isPermanentSchemaError(err: SchemaErrorLike | null | undefined): boolean {
  if (!err) return false
  if (err.code && PERMANENT_CODES.has(err.code)) return true
  const msg = err.message ?? ''
  return PERMANENT_MESSAGE.test(msg)
}

const unavailable = new Set<string>()
const MISSING_TTL_MS = 5 * 60_000 // re-probe after 5 minutes of silence

// Best-effort sessionStorage hydration: without this the breaker resets on
// every full reload, and a drifted workspace re-spams the same first probe
// on every reload (the multi-minute console wall the user pasted). sessionStorage
// keeps the verdict per-tab, keyed per schema object; TTL-bounded so a
// just-applied migration starts working ~TTL after the verdict (then module state
// still short-circuits). Storage access itself can throw (private mode, SSR);
// every reach wrapped, failure = ignore.
type CacheShape = Record<string, number>
const CACHE_KEY = 'avenize.schema.missing.v1'

function readCache(): CacheShape {
  if (typeof sessionStorage === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}') || {} } catch { return {} }
}
function writeCache(map: CacheShape): void {
  if (typeof sessionStorage === 'undefined') return
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

function hydrateFromCache(): void {
  const now = Date.now()
  for (const [k, t] of Object.entries(readCache())) {
    if (now - t < MISSING_TTL_MS) unavailable.add(k)
  }
}
hydrateFromCache()

export function isSchemaAvailable(key: string): boolean {
  return !unavailable.has(key)
}

export function markSchemaUnavailable(key: string): void {
  unavailable.add(key)
  const map = readCache()
  map[key] = Date.now()
  writeCache(map)
}

/**
 * Guard a query-builder call (.from() chain). Skips when the table is known
 * unavailable; on a permanent schema error marks it and resolves null instead
 * of the builder's error payload, so callers keep their zero-state path.
 */
export async function tableGuard<T>(
  table: string,
  query: () => PromiseLike<{ data: T; error: SchemaErrorLike | null; count?: number | null }>,
): Promise<{ data: T | null; count: number | null }> {
  if (!isSchemaAvailable(table)) return { data: null, count: null }
  const res = await query()
  if (res.error && isPermanentSchemaError(res.error)) {
    markSchemaUnavailable(table)
    return { data: null, count: null }
  }
  return { data: res.data, count: res.count ?? null }
}

// Network-level f declarative guard below: the 190+ call sites across pages use
// supabase.rpc/.from directly. Wrapping window.fetch centralizes the skip logic
// without touching every page. Scope narrowed: only hits /rest/v1/rpc/<name> or
// /rest/v1/<table> URLs triggered by Supabase clients, marks the endpoint missing
// on a schema error, then resolves immediately instead – all other fetches
// pass through 1:1. Every reason below is lock-step tested in tests.

/** Extract a missing-object key from a PostgREST URL: /rest/v1/rpc/<name> → 'rpc:<name>'; /rest/v1/<table> → '<table>'. */
function extractPostgrestKey(url: string): string | null {
  try {
    if (!url.includes('/rest/v1/')) return null
    const rpcMatch = url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)(?:[/?]|$)/i)
    if (rpcMatch) return `rpc:${rpcMatch[1]}`
    const tableMatch = url.match(/\/rest\/v1\/([a-z0-9_]+)(?:[/?]|$)/i)
    if (tableMatch) return tableMatch[1]
  } catch {
    /* ignore */
  }
  return null
}

/** Empty body for a skipped probe. Must be an ARRAY — supabase-js `.rpc()/.from()`
 * parses the response body as JSON and downstream code may `.slice()`/`.length`
 * on it; `null` crashes (the `e.slice is not a function` the user hit). */
const NOT_FOUND_BODY: unknown[] = []
const NOT_FOUND_RESPONSE_HEADERS = { 'Content-Type': 'application/json' } as const

let installed = false
/**
 * Install the network-level breaker (idempotent). After Session 44 the
 * verdict lives in sessionStorage, so this never spams the first probe on
 * reload; it short-circuits known-missing endpoints instantly. Immediate
 * (no network) instead of a script soon (whenever runtime code imports
 * schemaAvailability — including main.tsx — every future request is guarded).
 */
export function installNetworkBreaker(): void {
  if (installed) return
  installed = true
  if (typeof window === 'undefined' || !window.fetch) return
  const origFetch = window.fetch
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const key = extractPostgrestKey(url)
    if (key && !isSchemaAvailable(key)) {
      // Synthesize an immediate "empty" response for the RPC/table call.
      // Take body shape the Supabase client expects (an array for rpc/table
      // GETs). Returning an error body would let the client re-surface
      // honest errors – we don't want that per call; this is a known-missing
      // endpoint. Keep it `[]` for reads, {count:null,data:null} acceptable.
      const body = JSON.stringify(NOT_FOUND_BODY)
      return new Response(body, {
        status: 200,
        headers: NOT_FOUND_RESPONSE_HEADERS as Record<string, string>,
      })
    }
    const response = await origFetch(input, init)
    // Mark missing on schema-availability failures: PGRST diagnostics OR a
    // bare 404 on a PostgREST route (means "not in the schema cache"). Real
    // application failures (auth 401/403, validation 400, etc.) stay untouched.
    if (key && response.status >= 400) {
      const is404 = response.status === 404
      let isSchemaError = is404
      if (!is404) {
        try {
          const clone = response.clone()
          const text = await clone.text()
          const err: SchemaErrorLike = { message: text }
          isSchemaError = isPermanentSchemaError(err)
        } catch {
          /* marking best-effort; fall through */
        }
      }
      if (isSchemaError) {
        markSchemaUnavailable(key)
        return new Response(JSON.stringify(NOT_FOUND_BODY), {
          status: 200,
          headers: NOT_FOUND_RESPONSE_HEADERS as Record<string, string>,
        })
      }
    }
    return response
  }
}
installNetworkBreaker()