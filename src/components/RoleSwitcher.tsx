import { useState, useEffect } from 'react'
import { Users, ChevronDown, Check, RotateCcw } from 'lucide-react'
import { useAuth, type UserRole } from '../lib/AuthContext'
import type { StaffRoles } from '../lib/businessOS'

// Dynamically import the wrappers so businessOS stays in its own chunk
// (errorCapture.ts dynamically imports it; a static import here would force
// it into the main chunk and break that split).
const loadBusinessOS = () => import('../lib/businessOS')

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  team_lead: 'Team Lead',
  staff: 'Staff',
}

const ROLE_HINTS: Record<UserRole, string> = {
  owner: 'Whole-business intelligence, financials, strategy',
  admin: 'Business configuration, team oversight',
  manager: 'Active projects, team blockers, operations',
  team_lead: 'Team execution, capacity, processes',
  staff: 'Assigned work, relevant information',
}

/**
 * §K Role Switcher. Shows the roles a user holds (primary + secondary) and
 * lets them switch the active persona. Server-validated (can only switch to a
 * role the user holds). UX/context only — security stays staff.role + RLS.
 *
 * A user with no secondary roles (the common case) sees nothing — the
 * switcher only appears when get_staff_roles returns >1 role.
 */
export function RoleSwitcher() {
  const { staff, refreshStaff } = useAuth()
  const [roles, setRoles] = useState<StaffRoles | null>(null)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    let active = true
    if (staff?.id) {
      loadBusinessOS()
        .then(({ fetchStaffRoles }) => fetchStaffRoles(staff.id))
        .then(r => { if (active) setRoles(r) })
        .catch(() => { /* migration not deployed */ })
    }
    return () => { active = false }
  }, [staff?.id])

  if (!roles?.authorized || !staff) return null
  // Only show the switcher when the user holds MORE than one role.
  const heldRoles = roles.roles ?? [roles.primary]
  if (heldRoles.length <= 1) return null

  const activeRole = staff.active_role ?? roles.primary

  const handleSwitch = async (role: UserRole) => {
    if (role === activeRole) { setOpen(false); return }
    setSwitching(true)
    const { setActiveRole, clearActiveRole } = await loadBusinessOS()
    const result = role === roles.primary
      ? await clearActiveRole(staff.id)  // back to primary
      : await setActiveRole(staff.id, role)
    if (result !== null || role === roles.primary) {
      await refreshStaff()  // refresh the active_role on the staff object
    }
    setSwitching(false)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)] transition"
      >
        <Users size={14} />
        <span className="flex-1 text-left">Viewing as <span className="font-medium text-[var(--av-text)]">{ROLE_LABELS[activeRole]}</span></span>
        <ChevronDown size={14} className={`text-[var(--av-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-[var(--av-border)] py-1">
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--av-text-muted)]">Switch persona</div>
          {heldRoles.map(role => (
            <button
              key={role}
              onClick={() => handleSwitch(role)}
              disabled={switching}
              className={`w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-[var(--av-surface-2)] transition ${role === activeRole ? 'bg-[var(--av-primary-soft)]' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-[var(--av-text)]">{ROLE_LABELS[role]}</span>
                  {role === roles.primary && <span className="text-[9px] text-[var(--av-text-muted)] uppercase">primary</span>}
                  {role === activeRole && <Check size={12} className="text-[var(--av-primary)]" />}
                </div>
                <p className="text-[10px] text-[var(--av-text-muted)] leading-tight">{ROLE_HINTS[role]}</p>
              </div>
            </button>
          ))}
          {activeRole !== roles.primary && (
            <button
              onClick={() => handleSwitch(roles.primary)}
              disabled={switching}
              className="w-full flex items-center gap-2 px-3 py-1.5 mt-1 border-t border-[var(--av-border)] text-xs text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-2)] transition"
            >
              <RotateCcw size={12} />
              Reset to primary ({ROLE_LABELS[roles.primary]})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
