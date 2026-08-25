// Governance assistant — deterministic routing contract (no hallucination
// allowed; every query maps via ROUTES against registries/feed data).
import { describe, it, expect } from 'vitest'
import { askGovernance } from '../../../src/lib/governanceAssistant'

// import side-effect-free helpers so the imports resolve before describe runs.

describe('governance assistant routing', () => {
  it('routes governance keywords through ROUTES and reports fired rule', async () => {
    const hits = [
      { q: 'How many incidents broke today?', id: 'incidents.top' },
      { q: 'show autonomy queue', id: 'autonomy.queue' },
      { q: 'any pending human decisions?', id: 'decisions.pending' },
      { q: 'audit log', id: 'audit.answer' },
      { q: 'governance health status', id: 'self.health' },
      { q: 'how many constitution rules?', id: 'index.registry' },
    ]
    for (const h of hits) {
      const out = await askGovernance(h.q)
      expect(out.confidence).toBe('grounded')
      expect(out.fired[0]).toBe(h.id)
    }
  })

  it('unmatched query answers "I don\'t know" instead of fabricating', async () => {
    const out = await askGovernance('summarize unrelated colour theory')
    expect(out.confidence).toBe('guided')
    expect(out.fired).toHaveLength(0)
    expect(out.answer).toContain("I don't know")
  })
})
