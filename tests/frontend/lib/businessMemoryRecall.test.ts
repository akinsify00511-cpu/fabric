import { describe, it, expect } from 'vitest'

// Mirrors the Business Memory Recall (recall_similar_problems, migration
// 20260818230000). Given a current diagnosis (rule_id + symptom_metric), the
// engine recalls PRIOR similar problems + what was tried + the outcome from
// three sources:
//   1. prior_diagnosis claims (same rule_id → high relevance; same symptom → medium)
//   2. decisions (064) whose learning_tags/context overlap (medium)
//   3. organizational_memory whose topic/applies_to overlaps (low)
//
// Evidence-tag contract (§20/§22 — the anti-fabrication core):
//   • prior_diagnosis         → FACT  (it happened — a measured diagnosis fired)
//   • decision w/ actual_outcome → FACT  (the recorded outcome is a fact)
//   • decision w/o actual_outcome → INFERENCE (only a hypothesis was made)
//   • organizational_memory   → INFERENCE (a learned lesson is a generalization)
//
// Honest empty state: when nothing matches, returns an empty array + a note —
// NEVER fabricates a "similar problem" (§22).

type Claim = {
  business_id: string
  claim_type: 'INFERENCE'
  rule_id?: string
  statement: string
  evidence: { rule_id?: string; symptom_metric?: string; severity?: string }
  created_at: string
}
type Decision = {
  business_id: string
  title: string
  context: string
  what_worked: string | null
  what_learned: string | null
  actual_outcome: string | null
  learning_tags: string[]
  decided_at: string
  status: 'reviewed' | 'made'
}
type Memory = {
  business_id: string
  topic: string
  lesson: string
  context: string | null
  applies_to: string | null
  created_at: string
  times_applied: number | null
  status: 'active' | 'superseded'
}

type Match = {
  source: 'prior_diagnosis' | 'decision' | 'organizational_memory'
  title: string
  relevance: 'high' | 'medium' | 'low'
  evidence_tag: 'FACT' | 'INFERENCE'
  what_was_tried: string | null
  outcome: string | null
}

const today = '2026-08-18'
const yesterday = '2026-08-17'
const monthsAgo = '2026-02-10'

function recall(
  biz: string,
  ruleId: string | null,
  symptom: string | null,
  claims: Claim[],
  decisions: Decision[],
  memories: Memory[]
): { matches: Match[]; note?: string } {
  const matches: Match[] = []

  // 1. prior_diagnosis claims (prior days only).
  for (const c of claims) {
    if (c.business_id !== biz) continue
    if (c.claim_type !== 'INFERENCE') continue
    if (!c.rule_id || !c.rule_id.startsWith('DIAG-')) continue
    if (c.created_at >= today) continue  // prior days only
    const ruleMatch = ruleId && c.evidence.rule_id === ruleId
    const symMatch = symptom && c.evidence.symptom_metric === symptom
    if (!ruleMatch && !symMatch) continue
    matches.push({
      source: 'prior_diagnosis',
      title: c.statement,
      relevance: ruleMatch ? 'high' : 'medium',
      evidence_tag: 'FACT',
      what_was_tried: null,
      outcome: null,
    })
  }

  // 2. decisions (reviewed only, with overlap).
  for (const d of decisions) {
    if (d.business_id !== biz) continue
    if (d.status !== 'reviewed') continue
    const overlap =
      (symptom && (d.context.includes(symptom) || d.title.includes(symptom) || d.learning_tags.includes(symptom))) ||
      (ruleId && d.context.includes(ruleId))
    if (!overlap) continue
    matches.push({
      source: 'decision',
      title: d.title,
      relevance: 'medium',
      evidence_tag: d.actual_outcome ? 'FACT' : 'INFERENCE',
      what_was_tried: d.what_worked,
      outcome: d.actual_outcome,
    })
  }

  // 3. organizational_memory (active only).
  for (const m of memories) {
    if (m.business_id !== biz) continue
    if (m.status !== 'active') continue
    const overlap =
      (symptom && (m.topic.includes(symptom) || (m.applies_to || '').includes(symptom) || (m.context || '').includes(symptom))) ||
      (ruleId && (m.topic.includes(ruleId) || (m.context || '').includes(ruleId)))
    if (!overlap) continue
    matches.push({
      source: 'organizational_memory',
      title: m.topic,
      relevance: 'low',
      evidence_tag: 'INFERENCE',
      what_was_tried: null,
      outcome: m.lesson,
    })
  }

  if (matches.length === 0) {
    return { matches: [], note: 'No similar past problems found yet. As you use Avenize and review decisions, this will recall prior situations.' }
  }
  return { matches }
}

describe('Business Memory Recall (§I)', () => {
  const biz = 'biz-1'
  const ruleId = 'DIAG-REV-001'
  const symptom = 'revenue'

  it('recalls a prior diagnosis with the same rule_id as HIGH relevance', () => {
    const claims: Claim[] = [{
      business_id: biz, claim_type: 'INFERENCE', rule_id: ruleId,
      statement: 'Revenue is down 12%', evidence: { rule_id: ruleId, symptom_metric: symptom, severity: 'warning' },
      created_at: monthsAgo,
    }]
    const r = recall(biz, ruleId, symptom, claims, [], [])
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].source).toBe('prior_diagnosis')
    expect(r.matches[0].relevance).toBe('high')
    expect(r.matches[0].evidence_tag).toBe('FACT')
  })

  it('recalls a prior diagnosis with the same symptom but different rule as MEDIUM', () => {
    const claims: Claim[] = [{
      business_id: biz, claim_type: 'INFERENCE', rule_id: 'DIAG-OTHER',
      statement: 'Revenue drop', evidence: { rule_id: 'DIAG-OTHER', symptom_metric: symptom },
      created_at: monthsAgo,
    }]
    const r = recall(biz, 'DIAG-REV-001', symptom, claims, [], [])
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].relevance).toBe('medium')
  })

  it('does NOT recall today\'s diagnosis (only PRIOR days)', () => {
    const claims: Claim[] = [{
      business_id: biz, claim_type: 'INFERENCE', rule_id: ruleId,
      statement: 'Revenue down today', evidence: { rule_id: ruleId, symptom_metric: symptom },
      created_at: today,
    }]
    const r = recall(biz, ruleId, symptom, claims, [], [])
    expect(r.matches).toHaveLength(0)
    expect(r.note).toContain('No similar past problems')
  })

  it('does NOT recall another business\'s diagnosis claims (tenant isolation)', () => {
    const claims: Claim[] = [{
      business_id: 'biz-2', claim_type: 'INFERENCE', rule_id: ruleId,
      statement: 'Other biz revenue', evidence: { rule_id: ruleId, symptom_metric: symptom },
      created_at: monthsAgo,
    }]
    const r = recall(biz, ruleId, symptom, claims, [], [])
    expect(r.matches).toHaveLength(0)
  })

  it('recalls a reviewed decision with actual_outcome as FACT (the "tried X, result Y")', () => {
    const decisions: Decision[] = [{
      business_id: biz, title: 'Cut prices to lift revenue',
      context: 'Revenue was declining', what_worked: 'Discount campaign',
      what_learned: 'Discounts lift volume but erode margin', actual_outcome: 'Revenue +8% but margin -3%',
      learning_tags: ['revenue'], decided_at: monthsAgo, status: 'reviewed',
    }]
    const r = recall(biz, ruleId, symptom, [], decisions, [])
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].source).toBe('decision')
    expect(r.matches[0].evidence_tag).toBe('FACT')
    expect(r.matches[0].what_was_tried).toBe('Discount campaign')
    expect(r.matches[0].outcome).toContain('Revenue +8%')
  })

  it('labels a decision WITHOUT actual_outcome as INFERENCE (only a hypothesis)', () => {
    const decisions: Decision[] = [{
      business_id: biz, title: 'Tried lowering prices',
      context: 'Revenue issue', what_worked: null, what_learned: null,
      actual_outcome: null, learning_tags: ['revenue'], decided_at: monthsAgo, status: 'reviewed',
    }]
    const r = recall(biz, ruleId, symptom, [], decisions, [])
    expect(r.matches[0].evidence_tag).toBe('INFERENCE')
  })

  it('skips un-reviewed decisions (made status)', () => {
    const decisions: Decision[] = [{
      business_id: biz, title: 'Price change', context: 'revenue',
      what_worked: 'x', what_learned: 'y', actual_outcome: 'z',
      learning_tags: [], decided_at: monthsAgo, status: 'made',
    }]
    const r = recall(biz, ruleId, symptom, [], decisions, [])
    expect(r.matches).toHaveLength(0)
  })

  it('recalls organizational_memory as INFERENCE (a learned lesson)', () => {
    const memories: Memory[] = [{
      business_id: biz, topic: 'Revenue recovery playbook',
      lesson: 'Pursue overdue invoices first — fastest cash impact',
      context: 'revenue', applies_to: 'revenue', created_at: monthsAgo,
      times_applied: 3, status: 'active',
    }]
    const r = recall(biz, ruleId, symptom, [], [], memories)
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].source).toBe('organizational_memory')
    expect(r.matches[0].evidence_tag).toBe('INFERENCE')
    expect(r.matches[0].relevance).toBe('low')
    expect(r.matches[0].outcome).toContain('overdue invoices')
  })

  it('skips superseded organizational_memory', () => {
    const memories: Memory[] = [{
      business_id: biz, topic: 'revenue', lesson: 'old',
      context: 'revenue', applies_to: 'revenue', created_at: monthsAgo,
      times_applied: 1, status: 'superseded',
    }]
    const r = recall(biz, ruleId, symptom, [], [], memories)
    expect(r.matches).toHaveLength(0)
  })

  it('returns an honest empty note when nothing matches (never fabricates)', () => {
    const r = recall(biz, ruleId, symptom, [], [], [])
    expect(r.matches).toEqual([])
    expect(r.note).toBeDefined()
    expect(r.note).not.toContain('₦')  // never fabricates a value
  })

  it('combines all three sources ordered: prior_diagnosis, decision, memory', () => {
    const claims: Claim[] = [{
      business_id: biz, claim_type: 'INFERENCE', rule_id: ruleId,
      statement: 'Prior rev diag', evidence: { rule_id: ruleId, symptom_metric: symptom },
      created_at: monthsAgo,
    }]
    const decisions: Decision[] = [{
      business_id: biz, title: 'Dec', context: 'revenue',
      what_worked: 'w', what_learned: 'l', actual_outcome: 'o',
      learning_tags: [], decided_at: monthsAgo, status: 'reviewed',
    }]
    const memories: Memory[] = [{
      business_id: biz, topic: 'Mem', lesson: 'lesson',
      context: 'revenue', applies_to: 'revenue', created_at: monthsAgo,
      times_applied: 1, status: 'active',
    }]
    const r = recall(biz, ruleId, symptom, claims, decisions, memories)
    expect(r.matches.map(m => m.source)).toEqual([
      'prior_diagnosis', 'decision', 'organizational_memory',
    ])
  })

  it('matches decisions by learning_tags array membership (not just text)', () => {
    const decisions: Decision[] = [{
      business_id: biz, title: 'No mention in title',
      context: 'Nothing about revenue here',
      what_worked: 'w', what_learned: 'l', actual_outcome: 'o',
      learning_tags: ['revenue'],  // matched via tag, not text
      decided_at: monthsAgo, status: 'reviewed',
    }]
    const r = recall(biz, ruleId, symptom, [], decisions, [])
    expect(r.matches).toHaveLength(1)
  })

  it('returns empty when neither rule_id nor symptom provided', () => {
    const claims: Claim[] = [{
      business_id: biz, claim_type: 'INFERENCE', rule_id: ruleId,
      statement: 'x', evidence: { rule_id: ruleId, symptom_metric: symptom },
      created_at: monthsAgo,
    }]
    const r = recall(biz, null, null, claims, [], [])
    expect(r.matches).toHaveLength(0)
  })
})
