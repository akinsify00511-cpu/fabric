import { describe, it, expect } from 'vitest'
import {
  deriveFunction, deriveSeniority, getFunctionHome, functionLabel,
  seniorityLabel, type BusinessFunction,
} from '../../../src/lib/functionHome'

describe('function derivation', () => {
  it('derives function from job title keywords', () => {
    expect(deriveFunction('Marketing Manager', null)).toBe('marketing')
    expect(deriveFunction('Head of Growth', null)).toBe('marketing')
    expect(deriveFunction('Sales Lead', null)).toBe('sales')
    expect(deriveFunction('Account Executive', null)).toBe('sales')
    expect(deriveFunction('Senior Accountant', null)).toBe('finance')
    expect(deriveFunction('CFO', null)).toBe('finance')
    expect(deriveFunction('HR Officer', null)).toBe('hr')
    expect(deriveFunction('Recruitment Specialist', null)).toBe('hr')
    expect(deriveFunction('Operations Coordinator', null)).toBe('operations')
    expect(deriveFunction('Project Manager', null)).toBe('projects')
  })

  it('explicit department beats job-title guess', () => {
    // A "Project Manager" in the Finance department should resolve to finance.
    expect(deriveFunction('Project Manager', 'Finance')).toBe('finance')
    expect(deriveFunction('Generalist', 'Human Resources')).toBe('hr')
    expect(deriveFunction('Lead', 'Marketing')).toBe('marketing')
  })

  it('falls back to active tools when title/department are empty', () => {
    expect(deriveFunction(null, null, ['campaigns', 'social', 'crm'])).toBe('marketing')
    expect(deriveFunction('', '', ['invoices', 'expenses', 'finance'])).toBe('finance')
    expect(deriveFunction('', '', ['people', 'attendance', 'leave'])).toBe('hr')
  })

  it('returns general when no signal is available', () => {
    expect(deriveFunction(null, null, [])).toBe('general')
    expect(deriveFunction('', '', [])).toBe('general')
    expect(deriveFunction('CEO', null, [])).toBe('general') // CEO = whole-business
  })
})

describe('seniority derivation', () => {
  it('maps DB roles to seniority tiers', () => {
    expect(deriveSeniority('owner')).toBe('executive')
    expect(deriveSeniority('admin')).toBe('executive')
    expect(deriveSeniority('manager')).toBe('manager')
    expect(deriveSeniority('team_lead')).toBe('lead')
    expect(deriveSeniority('staff')).toBe('individual')
    expect(deriveSeniority(null)).toBe('individual')
  })
})

describe('function home composition', () => {
  it('returns a marketing config with function-specific cards', () => {
    const home = getFunctionHome('marketing', 'manager')
    expect(home.primaryCards).toContain('campaign_performance')
    expect(home.primaryCards).toContain('lead_quality')
    // Marketing manager still sees the whole-business pulse.
    expect(home.primaryCards).toContain('pulse')
    expect(home.primaryCta.to).toBe('/app/campaigns')
  })

  it('returns a finance config with receivables', () => {
    const home = getFunctionHome('finance', 'manager')
    expect(home.primaryCards).toContain('receivables')
    expect(home.primaryCards).toContain('cash')
    expect(home.primaryCta.to).toBe('/app/finance')
  })

  it('returns an HR config with attendance + leave', () => {
    const home = getFunctionHome('hr', 'manager')
    expect(home.primaryCards).toContain('attendance')
    expect(home.primaryCards).toContain('leave_balance')
    expect(home.primaryCards).toContain('people')
  })

  it('returns an operations config with workload', () => {
    const home = getFunctionHome('operations', 'manager')
    expect(home.primaryCards).toContain('workload')
    expect(home.primaryCards).toContain('operations')
  })

  it('returns a projects config with project_delivery', () => {
    const home = getFunctionHome('projects', 'manager')
    expect(home.primaryCards).toContain('project_delivery')
    expect(home.primaryCards).toContain('workload')
  })

  it('individuals get a trimmed personal view', () => {
    const exec = getFunctionHome('sales', 'executive')
    const individual = getFunctionHome('sales', 'individual')
    expect(individual.primaryCards.length).toBeLessThan(exec.primaryCards.length)
    expect(individual.secondaryCards).toEqual([])
    // Still keeps at least 2 cards so the home isn't empty.
    expect(individual.primaryCards.length).toBeGreaterThanOrEqual(2)
  })

  it('general falls back to the whole-business window', () => {
    const home = getFunctionHome('general', 'executive')
    expect(home.primaryCards).toContain('state')
    expect(home.primaryCards).toContain('revenue')
    expect(home.primaryCards).toContain('cash')
    expect(home.primaryCta.to).toBe('/app/cockpit')
  })

  it('every function has a pulse sequence (the connected organism)', () => {
    const fns: BusinessFunction[] = ['marketing', 'sales', 'finance', 'hr', 'operations', 'projects', 'general']
    for (const fn of fns) {
      const home = getFunctionHome(fn, 'manager')
      expect(home.pulseSequence.length).toBeGreaterThan(0)
      expect(home.pulseSequence.length).toBeGreaterThanOrEqual(5)
    }
  })
})

describe('labels', () => {
  it('labels every function', () => {
    expect(functionLabel('marketing')).toBe('Marketing')
    expect(functionLabel('finance')).toBe('Finance')
    expect(functionLabel('hr')).toBe('People')
    expect(functionLabel('general')).toBe('Business')
  })

  it('labels seniority', () => {
    expect(seniorityLabel('executive')).toBe('Executive')
    expect(seniorityLabel('individual')).toBe('')
  })
})
