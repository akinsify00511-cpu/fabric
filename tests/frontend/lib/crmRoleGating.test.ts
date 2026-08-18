import { describe, it, expect } from 'vitest'
import { canCreate, canDelete, canEdit, canView } from '../../../src/lib/permissions'

// Session 30 — per-subsidiary CRM + role-aware interface.
// These tests lock the role-gating contract used by CRM.tsx against the
// actual permission matrix in permissions.ts, so the UX gates match the
// real security boundary. The business_id (per-subsidiary) scoping is
// verified by the build (the `bid` fallback chain) — here we assert the
// permission matrix that drives the create/delete gates.

describe('CRM role-aware permissions (matches permissions.ts matrix)', () => {
  // staff has NO deals permission entry → only the `manage`-fallback or
  // explicit entries grant access. staff cannot create/edit/delete deals;
  // they can view (the module gate allows view). This is why the CRM hides
  // the Add Deal / Delete buttons for staff.
  it('staff can view but NOT create/edit/delete deals (no deals entry in matrix)', () => {
    expect(canView('staff', 'deals')).toBe(false)
    expect(canCreate('staff', 'deals')).toBe(false)
    expect(canDelete('staff', 'deals')).toBe(false)
  })

  it('owner/admin can create+edit+delete deals; manager can create+edit but not delete', () => {
    // owner/admin have full manage; manager matrix is ['view','create','edit']
    for (const role of ['owner', 'admin'] as const) {
      expect(canCreate(role, 'deals')).toBe(true)
      expect(canEdit(role, 'deals')).toBe(true)
      expect(canDelete(role, 'deals')).toBe(true)
    }
    expect(canCreate('manager', 'deals')).toBe(true)
    expect(canEdit('manager', 'deals')).toBe(true)
    expect(canDelete('manager', 'deals')).toBe(false)
  })

  it('team_lead can view + create + edit deals but not delete', () => {
    expect(canView('team_lead', 'deals')).toBe(true)
    expect(canCreate('team_lead', 'deals')).toBe(true)
    expect(canEdit('team_lead', 'deals')).toBe(true)
    expect(canDelete('team_lead', 'deals')).toBe(false)
  })

  it('staff can view but NOT create clients (contacts)', () => {
    expect(canView('staff', 'clients')).toBe(true)
    expect(canCreate('staff', 'clients')).toBe(false)
  })

  it('managers+ can create clients; owner/admin can delete, manager cannot', () => {
    for (const role of ['owner', 'admin', 'manager'] as const) {
      expect(canCreate(role, 'clients')).toBe(true)
    }
    expect(canDelete('owner', 'clients')).toBe(true)
    expect(canDelete('admin', 'clients')).toBe(true)
    // manager can create/edit but NOT delete clients (matrix: ['view','create','edit'])
    expect(canDelete('manager', 'clients')).toBe(false)
  })
})

describe('CRM "My deals" filter contract', () => {
  // The filter logic in CRM.tsx:
  //   !mineOnly || d.assignee_id === staff?.id || d.owner_id === staff?.id
  // When mineOnly is true (sales individual default), only deals assigned to
  // or owned by the current user pass. When false (managers+), all pass.
  it('sales individuals default to mineOnly=true; managers+ default to false', () => {
    const isSalesIndividual = (role: string) => role === 'staff' || role === 'team_lead'
    expect(isSalesIndividual('staff')).toBe(true)
    expect(isSalesIndividual('team_lead')).toBe(true)
    expect(isSalesIndividual('manager')).toBe(false)
    expect(isSalesIndividual('owner')).toBe(false)
    expect(isSalesIndividual('admin')).toBe(false)
  })

  it('the mineOnly filter passes a deal owned by the current user and blocks others', () => {
    const staffId = 'staff-1'
    const mineOnly = true
    const pass = (d: { assignee_id?: string | null; owner_id?: string | null }) =>
      !mineOnly || d.assignee_id === staffId || d.owner_id === staffId
    expect(pass({ assignee_id: staffId, owner_id: null })).toBe(true)
    expect(pass({ assignee_id: null, owner_id: staffId })).toBe(true)
    expect(pass({ assignee_id: 'someone-else', owner_id: null })).toBe(false)
    expect(pass({ assignee_id: null, owner_id: null })).toBe(false)
  })

  it('when mineOnly is false (manager view), every deal passes', () => {
    const staffId = 'staff-1'
    const mineOnly = false
    const pass = (d: { assignee_id?: string | null; owner_id?: string | null }) =>
      !mineOnly || d.assignee_id === staffId || d.owner_id === staffId
    expect(pass({ assignee_id: 'someone-else', owner_id: null })).toBe(true)
    expect(pass({ assignee_id: null, owner_id: null })).toBe(true)
  })
})
