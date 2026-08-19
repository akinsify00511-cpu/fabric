// Discovery Intelligence — Phase B contract tests.
// Locks the §22 anti-fabrication contract (missing data → null, never
// synthetic), the B8 brand-truth severity ladder, the B9 content-gap rule,
// the B10 priority math, the B14 attribution rollup + provenance parsing.
import { describe, it, expect } from 'vitest'
import {
  presenceRate,
  citationRate,
  competitorCitationCounts,
  isContentGap,
  classifyBrandMismatch,
  opportunityPriority,
  rollupAttribution,
  parseAttribution,
} from '../../../src/lib/discoveryIntel'

describe('presenceRate / citationRate (§22 honest-null contract)', () => {
  it('returns null with no observations — never a synthetic 0%', () => {
    expect(presenceRate([])).toBeNull()
    expect(citationRate([])).toBeNull()
  })

  it('computes exact percentages from recorded observations', () => {
    const obs = [
      { engine: 'google', avenizePresent: true, avenizeCited: false },
      { engine: 'chatgpt', avenizePresent: true, avenizeCited: true },
      { engine: 'bing', avenizePresent: false, avenizeCited: false },
      { engine: 'perplexity', avenizePresent: false, avenizeCited: false },
    ]
    expect(presenceRate(obs)).toBe(50)
    expect(citationRate(obs)).toBe(25)
  })

  it('rounds to one decimal', () => {
    const obs = [
      { engine: 'google', avenizePresent: true, avenizeCited: true },
      { engine: 'bing', avenizePresent: false, avenizeCited: false },
      { engine: 'chatgpt', avenizePresent: false, avenizeCited: false },
    ]
    expect(presenceRate(obs)).toBe(33.3)
  })
})

describe('competitorCitationCounts (B9)', () => {
  it('counts only cited competitors, sorted desc', () => {
    const obs = [
      {
        engine: 'google', avenizePresent: false, avenizeCited: false,
        competitors: [{ name: 'CompX', cited: true }, { name: 'CompY', cited: false }],
      },
      {
        engine: 'chatgpt', avenizePresent: true, avenizeCited: true,
        competitors: [{ name: 'CompX', cited: true }, { name: 'CompZ', cited: true }],
      },
    ]
    expect(competitorCitationCounts(obs)).toEqual([
      { name: 'CompX', cited: 2 },
      { name: 'CompZ', cited: 1 },
    ])
  })

  it('tolerates missing competitor arrays', () => {
    expect(competitorCitationCounts([{ engine: 'google', avenizePresent: true, avenizeCited: false }])).toEqual([])
  })
})

describe('isContentGap (B9 gap → B10 opportunity)', () => {
  it('flags absent brand + cited competitor', () => {
    expect(isContentGap({ avenizePresent: false, competitors: [{ name: 'X', cited: true }] })).toBe(true)
  })
  it('no gap when the brand appears', () => {
    expect(isContentGap({ avenizePresent: true, competitors: [{ name: 'X', cited: true }] })).toBe(false)
  })
  it('no gap when nobody is cited', () => {
    expect(isContentGap({ avenizePresent: false, competitors: [] })).toBe(false)
  })
})

describe('classifyBrandMismatch (B8 AI Brand Truth Monitor)', () => {
  const truth = 'Acme Construction is a construction business.'

  it('accurate statement → no mismatch', () => {
    const v = classifyBrandMismatch(truth, 'Acme Construction is a construction business serving Nigeria.')
    expect(v.mismatch).toBe(false)
    expect(v.severity).toBe('none')
    expect(v.correction).toBeNull()
  })

  it('name present but wrong category → high (name overlap never masks a category error)', () => {
    const v = classifyBrandMismatch(truth, 'Acme Construction is an accounting application.')
    expect(v.mismatch).toBe(true)
    expect(v.severity).toBe('high')
    expect(v.correction).toContain(truth)
  })

  it('wrong category AND brand absent → critical (a wholly different identity)', () => {
    const v = classifyBrandMismatch(truth, 'Smith Corp is an accounting application.')
    expect(v.mismatch).toBe(true)
    expect(v.severity).toBe('critical')
  })

  it('statement with no truth terms and no category assertion → medium', () => {
    const v = classifyBrandMismatch(truth, 'Users have asked about this company recently.')
    expect(v.mismatch).toBe(true)
    expect(v.severity).toBe('medium')
  })

  it('empty statement → no mismatch (nothing to judge)', () => {
    const v = classifyBrandMismatch(truth, '   ')
    expect(v.mismatch).toBe(false)
    expect(v.severity).toBe('none')
  })
})

describe('opportunityPriority (B10)', () => {
  it('a gap with commercial intent + competitor citations scores high', () => {
    const s = opportunityPriority({ isGap: true, intent: 'commercial', competitorCitations: 5, clusterPriority: 5 })
    expect(s).toBe(40 + 20 + 20 + 15) // 95
  })
  it('a non-gap informational topic scores low', () => {
    const s = opportunityPriority({ isGap: false, intent: 'informational', competitorCitations: 0, clusterPriority: 1 })
    expect(s).toBe(13)
  })
  it('never exceeds 100', () => {
    expect(opportunityPriority({ isGap: true, intent: 'transactional', competitorCitations: 99, clusterPriority: 5 })).toBe(100)
  })
})

describe('rollupAttribution (B14)', () => {
  it('counts visits + linked per source, direct when source missing', () => {
    const r = rollupAttribution([
      { source: 'chatgpt', entityId: 'a' },
      { source: 'chatgpt', entityId: null },
      { source: null, entityId: 'b' },
    ])
    expect(r.total).toBe(3)
    expect(r.linked).toBe(2)
    expect(r.bySource[0]).toEqual({ source: 'chatgpt', visits: 2, linked: 1 })
    expect(r.bySource[1]).toEqual({ source: 'direct', visits: 1, linked: 1 })
  })
})

describe('parseAttribution (B14 provenance capture)', () => {
  it('reads explicit UTM params', () => {
    const a = parseAttribution('https://avenize.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=launch', null)
    expect(a).toMatchObject({ source: 'google', medium: 'cpc', campaign: 'launch', landingPath: '/pricing' })
  })

  it('derives ai-citation from an AI engine referrer when no UTM', () => {
    const a = parseAttribution('https://avenize.com/', 'https://chatgpt.com/share/abc')
    expect(a.source).toBe('chatgpt')
    expect(a.medium).toBe('ai-citation')
  })

  it('derives organic from a search engine referrer', () => {
    const a = parseAttribution('https://avenize.com/pricing', 'https://www.google.com/search?q=avenize')
    expect(a.source).toBe('google')
    expect(a.medium).toBe('organic')
  })

  it('returns nulls on a malformed URL — never throws', () => {
    const a = parseAttribution('not a url', null)
    expect(a.source).toBeNull()
  })
})
