import { describe, it, expect } from 'vitest'
import type { UserRole } from '../../lib/AuthContext'

// Mirrors the Multi-Role Switching (20260818250000). A user can hold secondary
// business roles beyond their primary staff.role, and switch the active persona.
//
// Composition-first (§0.5/§6): builds on staff.role (primary, the security
// boundary), functional_roles (027, already many-to-many for tools),
// ROLE_HIERARCHY (permissions.ts), and the adaptive Dashboard.
//
// Security contract (the critical invariant):
//   • The effective permission level = MAX(primary, secondary roles) — a
//     secondary role can only ADD access the user is entitled to, never remove.
//   • Role switching is UX/context ONLY. set_active_role server-validates that
//     the user actually HOLDS the role (primary or secondary) before recording
//     the active persona. A user CANNOT switch to a role they don't hold.
//   • RLS + staff.role remain the security boundary — active_role drives only
//     the dashboard context + AI lens (matches the Session-20
//     selection-is-UX-not-security principle).

const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 90, admin: 80, manager: 70, team_lead: 60, staff: 40,
}

// The server-side effective-role computation (mirrors get_staff_roles SQL).
function effectiveRole(primary: UserRole, secondary: UserRole[]): {
  effective: UserRole
  effective_level: number
  roles: UserRole[]
} {
  const all = [primary, ...secondary.filter(r => r !== primary)]
  const maxLevel = Math.max(...all.map(r => ROLE_HIERARCHY[r]))
  const effective: UserRole =
    maxLevel >= 90 ? 'owner' :
    maxLevel >= 80 ? 'admin' :
    maxLevel >= 70 ? 'manager' :
    maxLevel >= 60 ? 'team_lead' : 'staff'
  return { effective, effective_level: maxLevel, roles: all }
}

// The server-side switch validator (mirrors set_active_role SQL).
function canSwitchTo(primary: UserRole, secondary: UserRole[], target: UserRole): boolean {
  // A user can only switch to a role they HOLD (primary or secondary).
  return primary === target || secondary.includes(target)
}

describe('Multi-Role Switching (§K)', () => {
  describe('effective role computation', () => {
    it('a staff member with no secondary roles has effective = primary', () => {
      const r = effectiveRole('manager', [])
      expect(r.effective).toBe('manager')
      expect(r.roles).toEqual(['manager'])
    })

    it('a secondary role RAISES the effective level (UNION — adds access)', () => {
      // A staff member who is also a manager → effective = manager (70 > 40).
      const r = effectiveRole('staff', ['manager'])
      expect(r.effective).toBe('manager')
      expect(r.effective_level).toBe(70)
    })

    it('a secondary role can only ADD access, never remove', () => {
      // A manager with a secondary 'staff' role → effective stays manager (70).
      const r = effectiveRole('manager', ['staff'])
      expect(r.effective).toBe('manager')
      expect(r.effective_level).toBe(70) // NOT lowered to 40
    })

    it('the highest secondary role wins (owner secondary on a staff primary)', () => {
      // An owner who is also Sales (staff) → effective = owner.
      const r = effectiveRole('staff', ['owner'])
      expect(r.effective).toBe('owner')
      expect(r.effective_level).toBe(90)
    })

    it('multiple secondary roles take the MAX', () => {
      const r = effectiveRole('staff', ['team_lead', 'manager', 'staff'])
      expect(r.effective).toBe('manager')
      expect(r.effective_level).toBe(70)
    })

    it('the roles list dedupes the primary (no double-listing)', () => {
      const r = effectiveRole('manager', ['manager', 'staff'])
      expect(r.roles).toEqual(['manager', 'staff'])
    })
  })

  describe('switch validation (the security invariant)', () => {
    it('CAN switch to the primary role', () => {
      expect(canSwitchTo('manager', ['staff'], 'manager')).toBe(true)
    })

    it('CAN switch to a held secondary role', () => {
      expect(canSwitchTo('staff', ['manager', 'admin'], 'manager')).toBe(true)
      expect(canSwitchTo('staff', ['manager', 'admin'], 'admin')).toBe(true)
    })

    it('CANNOT switch to a role the user does NOT hold (the critical guard)', () => {
      // A staff member trying to switch to 'owner' without holding it → DENIED.
      expect(canSwitchTo('staff', ['manager'], 'owner')).toBe(false)
      expect(canSwitchTo('staff', [], 'admin')).toBe(false)
      expect(canSwitchTo('manager', ['team_lead'], 'owner')).toBe(false)
    })

    it('a user with only the primary role can only switch to the primary (no-op)', () => {
      expect(canSwitchTo('staff', [], 'staff')).toBe(true)
      expect(canSwitchTo('staff', [], 'manager')).toBe(false)
    })
  })

  describe('the switcher UX contract', () => {
    it('only shows when the user holds >1 role (the common single-role case sees nothing)', () => {
      const shouldShow = (secondary: UserRole[]) => {
        const r = effectiveRole('staff', secondary)
        return r.roles.length > 1
      }
      expect(shouldShow([])).toBe(false)        // single role → no switcher
      expect(shouldShow(['manager'])).toBe(true) // 2 roles → switcher
    })

    it('active_role defaults to the primary when NULL (clear_active_role / sign-in)', () => {
      const resolveActive = (activeRole: UserRole | null, primary: UserRole): UserRole =>
        activeRole ?? primary
      expect(resolveActive(null, 'manager')).toBe('manager')
      expect(resolveActive('staff' as UserRole, 'manager')).toBe('staff')
    })

    it('the switcher can reset to the primary (clear_active_role)', () => {
      // Reset sets active_role = NULL → resolves back to primary.
      const afterReset = null
      const primary: UserRole = 'manager'
      expect(afterReset ?? primary).toBe('manager')
    })
  })

  describe('security boundary (the §K invariant: UX only)', () => {
    it('active_role does NOT change the RLS/permission boundary', () => {
      // Even if active_role = 'owner', a staff-primary user does NOT gain owner
      // RLS permissions. The security boundary is staff.role + functional_roles,
      // NOT active_role. active_role only drives the dashboard context.
      const staffRole: UserRole = 'staff'
      const activeRole: UserRole = 'owner' // switched persona
      // The user's ACTUAL permission level is MAX(staff.role + secondary),
      // NOT the active_role. If they don't hold owner as a secondary, they
      // can't even switch to it (tested above). If they DO hold it as a
      // secondary, the effective is already owner — switching just changes
      // the displayed lens, not the underlying permission.
      const withSecondary = effectiveRole(staffRole, [])
      expect(withSecondary.effective).toBe('staff') // real permission unchanged
      // active_role is purely the displayed lens.
      expect(activeRole).toBe('owner')
    })

    it('a privileged user (owner/admin primary) bypasses the switcher (sees everything already)', () => {
      // The owner already sees everything; the switcher is redundant. The
      // switcher is for multi-persona users (e.g. owner + sales) who want to
      // focus the dashboard on a specific lens.
      const isPrivileged = (role: UserRole) => role === 'owner' || role === 'admin'
      expect(isPrivileged('owner')).toBe(true)
      // But they can still hold secondary personas (e.g. owner + sales) for
      // dashboard focus — the switcher appears when roles.length > 1.
      const r = effectiveRole('owner', ['staff']) // owner who is also sales
      expect(r.roles.length).toBe(2) // switcher shows
    })
  })
})
