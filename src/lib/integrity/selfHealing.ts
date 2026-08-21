import { supabase } from '../supabase'

export type IntegrityStatus = 'healthy' | 'missing' | 'registered'

export interface IntegrityFinding {
  rule_key: string
  status: IntegrityStatus
  object_type: string | null
  object_name: string | null
  evidence: Record<string, unknown>
}

/**
 * Runs the trusted integrity contract scanner.
 *
 * This is intentionally admin-only. The database function performs the
 * authorization check; the browser never receives credentials capable of
 * changing schema or executing arbitrary SQL.
 */
export async function runIntegrityScan(): Promise<IntegrityFinding[]> {
  const { data, error } = await supabase.rpc('run_integrity_scan')
  if (error) throw error
  return (data ?? []) as IntegrityFinding[]
}

/**
 * Safe RPC wrapper used by feature code. A failed integrity dependency is
 * returned as an error rather than becoming an undefined value that can
 * crash a React render.
 */
export async function callRpcSafely<T>(
  rpcName: string,
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: Error | null }> {
  const result = args === undefined
    ? await supabase.rpc(rpcName)
    : await supabase.rpc(rpcName, args)

  if (result.error) {
    return { data: null, error: result.error }
  }

  return { data: (result.data as T | null) ?? null, error: null }
}
