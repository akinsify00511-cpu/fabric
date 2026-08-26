// Safe-storage self-heal for the Supabase JS client's IndexedDB/session cache.
//
// The user's onboarding page logged "Corruption: block checksum mismatch"
// (IndexedDB data corruption, often browser-extension-originated — the
// apollo_everywhere inject.bundle.js noise in the same trace). When the
// code persists supabase-auth-js's cached session in IndexedDB and the
// page synchronously hits a corrupt block, even SP_AUTH-restore getSession
// stalls (no session, no error, just a destroyed client boot loop).
//
// This module is a listen-once repair: on the first DOM error that matches
// the IndexedDB-corruption signature, it wipes the auth caches, drops the
// IndexedDB database(s) the storage prefix uses, and schedules recovery.

const CORRUPTION_PATTERN = /Corruption:\s*block\s+checksum\s+mismatch|checksum\s+mismatch/i

/** True when a window error event matches the IndexedDB corruption signature. */
export function isStorageCorruptionMessage(message: string): boolean {
  return CORRUPTION_PATTERN.test(message)
}

export interface StorageHealHooks {
  /** wipe the supabase storage prefixes (usually localStorage) */
  clearFallback?: () => void
  /** delete indexedDB databases (auth-storage or supabase-auth) */
  deleteDatabases?: (names: string[]) => void
  /** invoked after the wipe (usually a sign-out + redirect) */
  onHealed?: () => void
}

/** Install a (once) window error listener that triggers the heal sequence. */
export function installStorageSelfHeal(prefix: string, hooks: StorageHealHooks): () => void {
  let fired = false
  const handler = (event: ErrorEvent): void => {
    if (fired) return
    if (!isStorageCorruptionMessage(event?.message ?? '')) return
    fired = true
    try { hooks.clearFallback?.() } catch { /* ignore */ }
    try { hooks.deleteDatabases?.([`${prefix}-auth-storage`, 'supabase-auth-storage']) } catch { /* ignore */ }
    hooks.onHealed?.()
  }
  window.addEventListener('error', handler)
  // Un-hear after first max (otherwise next boot pages init a new listener per mount).
  return () => window.removeEventListener('error', handler)
}

/** Delete an IndexedDB database best-effort. */
export function deleteIndexedDatabase(name: string): void {
  try { indexedDB.deleteDatabase(name) } catch { /* ignore */ }
}

/** Clear all localStorage entries under the supabase auth prefix. */
export function clearSupabaseLocalStorage(prefix: string): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) doomed.push(k)
    }
    for (const key of doomed) localStorage.removeItem(key)
  } catch { /* ignore */ }
}
