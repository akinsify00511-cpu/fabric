// Governance routing contract — /avenize/governance is a nested SHIM
// under the Riverways Admin control plane, not a standalone destination.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const APP = fs.readFileSync(path.resolve(__dirname, '../../../src/App.tsx'), 'utf-8')

describe('Governance route shim', () => {
  it('standalone route redirects into the admin surface', () => {
    expect(APP).toContain('path="/avenize/governance"')
    expect(APP).toContain('/riverways-admin?section=governance')
  })
  it('governance panel is not lazy-imported as a page', () => {
    expect(APP).not.toContain("import('./pages/GovernanceControlCenter')")
  })
  it('lazy pages still work normally', () => {
    expect(APP).toContain("import('./pages/RiverwaysAdmin')")
  })
})
