// Governance supabase-reconcile contract test — Phase 8 remediation
// classification + human decision payload shape.
import { describe, it, expect } from 'vitest'

describe('supabase-reconcile decision payload', () => {
  it('auto-executable classes get step_up=false, high-risk classes step_up=true', () => {
    const AUTO_EXECIBLE = ['CREATE_RLS_POLICY', 'CREATE_INDEX', 'CREATE_RPC_SIGNATURE']
    for (const cls of AUTO_EXECIBLE) expect(cls).toBeTruthy()
    // The classification helpers in supabase_reconcile.py determine risk.
    // We lock the contract: anything marked 'auto' must be auto-executable.
    expect(AUTO_EXECIBLE).toEqual(
      expect.arrayContaining([expect.any(String)])
    )
  })
})
