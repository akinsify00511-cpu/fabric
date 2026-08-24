import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildFbc,
  captureAttribution,
  clearStoredAttribution,
  getStoredAttribution,
  readCookie,
} from '../../../src/lib/attribution'

// Ad-provenance capture: UTM + Meta click ids (fbclid → fbc) must survive
// from the public-surface visit through to checkout, where
// getStoredAttribution() rides along into the payment ledger.
describe('buildFbc', () => {
  it('follows Meta’s documented fb.1.<ts_ms>.<fbclid> format', () => {
    expect(buildFbc('AbCdEf', 1700000000000)).toBe('fb.1.1700000000000.AbCdEf')
  })
})

describe('readCookie', () => {
  it('reads a cookie by name and returns null when absent', () => {
    document.cookie = '_fbp=fb.1.123.456'
    expect(readCookie('_fbp')).toBe('fb.1.123.456')
    expect(readCookie('_fbc')).toBeNull()
  })

  it('does not match a cookie whose name is a suffix of another', () => {
    document.cookie = 'x_fbp=wrong'
    document.cookie = '_fbp=fb.1.999.999'
    expect(readCookie('_fbp')).toBe('fb.1.999.999')
  })
})

describe('captureAttribution', () => {
  beforeEach(() => {
    clearStoredAttribution()
    document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    document.cookie = '_fbc=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    window.history.pushState({}, '', '/')
  })

  it('captures UTM + fbclid and computes fbc at capture time', () => {
    window.history.pushState({}, '', '/pricing?utm_source=facebook&utm_medium=cpc&utm_campaign=launch&utm_content=ad_a&utm_term=set_1&fbclid=IwAR123')
    captureAttribution()
    const stored = getStoredAttribution()
    expect(stored).toMatchObject({
      source: 'facebook',
      medium: 'cpc',
      campaign: 'launch',
      content: 'ad_a',
      term: 'set_1',
      fbclid: 'IwAR123',
      landingPath: '/pricing',
    })
    expect(stored?.fbc).toMatch(/^fb\.1\.\d+\.IwAR123$/)
    expect(stored?.capturedAt).toBeTruthy()
  })

  it('does not overwrite a richer capture with an empty visit', () => {
    window.history.pushState({}, '', '/pricing?utm_source=facebook&fbclid=keepme')
    captureAttribution()
    window.history.pushState({}, '', '/pricing')
    captureAttribution()
    expect(getStoredAttribution()?.fbclid).toBe('keepme')
  })

  it('captures on fbclid alone (no UTM params)', () => {
    window.history.pushState({}, '', '/?fbclid=clickonly')
    captureAttribution()
    const stored = getStoredAttribution()
    expect(stored?.fbclid).toBe('clickonly')
    expect(stored?.fbc).toMatch(/^fb\.1\.\d+\.clickonly$/)
  })

  it('captures nothing for a bare visit', () => {
    captureAttribution()
    expect(getStoredAttribution()).toBeNull()
  })
})

describe('getStoredAttribution', () => {
  beforeEach(() => {
    clearStoredAttribution()
    document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    document.cookie = '_fbc=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('normalizes a legacy stored row (pre click-id fields) without crashing', () => {
    localStorage.setItem('avenize_attribution', JSON.stringify({
      source: 'google', medium: 'organic', campaign: null, landingPath: '/', referrer: null, capturedAt: 'x',
    }))
    const stored = getStoredAttribution()
    expect(stored?.source).toBe('google')
    expect(stored?.fbc).toBeNull()
    expect(stored?.fbp).toBeNull()
    expect(stored?.content).toBeNull()
  })

  it('prefers the live pixel cookies over the captured values', () => {
    localStorage.setItem('avenize_attribution', JSON.stringify({
      source: 'facebook', fbclid: 'abc', fbc: 'fb.1.1.abc', fbp: null, capturedAt: 'x',
    }))
    document.cookie = '_fbp=fb.1.777.live'
    document.cookie = '_fbc=fb.1.888.live'
    const stored = getStoredAttribution()
    expect(stored?.fbp).toBe('fb.1.777.live')
    expect(stored?.fbc).toBe('fb.1.888.live')
  })
})
