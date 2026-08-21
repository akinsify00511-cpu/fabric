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
