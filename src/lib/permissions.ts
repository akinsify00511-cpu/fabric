/**
 * AVENIZE ROLE-BASED ACCESS CONTROL (RBAC)
 *
 * This file defines the CORE ROLE PERMISSIONS matrix.
 *
 * TWO-SYSTEM ARCHITECTURE:
 *
 * 1. Core Roles (this file) - Used for:
 *    - Staff.role field (the 5 values allowed by the DB CHECK constraint)
 *    - UI-level permission checks (canCreate, canEdit, etc.)
 *    - RLS policy enforcement at database level
 *
 * 2. Functional Roles (database tables) - Used for:
 *    - Business-configurable roles (Sales, Marketing, Finance, etc.)
 *    - Tool-level access control via useToolAccess hook
 *    - Per-business customization
 *    - See: functional_roles, functional_role_tools, staff_functional_roles tables
 *
 * RECONCILIATION:
 * - Core roles are the SECURITY BOUNDARY (enforced by RLS)
 * - Functional roles are the UX LAYER (tool visibility in navigation)
 * - owner/admin roles bypass functional role filtering (see useToolAccess.ts)
 *
 * Role union matches the staff.role CHECK constraint in migration 024:
 *   CHECK (role IN ('owner', 'admin', 'manager', 'team_lead', 'staff'))
 * Do NOT add values here that the database cannot store — they are unreachable
 * dead weight and mislead readers about what the security boundary allows.
 *
 * TOOL_KEY MAPPING (for useToolAccess.ts):
 * - dashboard, crm, projects, finance, quotes, payments, accounting
 * - people, inventory, reports, tasks, campaigns, social
 * - automations, tickets, chat, approvals, requisitions, meetings
 * - knowledge, calendar, events, time-tracking, cashflow
 * - merit, social-recognition, integrations, api, branding, settings
 */

export type Role = 'owner' | 'admin' | 'manager' | 'team_lead' | 'staff'

export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 90,
  admin: 80,
  manager: 70,
  team_lead: 60,
  staff: 40,
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Business Owner',
  admin: 'Admin Manager',
  manager: 'Manager',
  team_lead: 'Team Lead',
  staff: 'Staff',
}

export type Module = 
  | 'dashboard' | 'tasks' | 'projects' | 'invoices' | 'expenses'
  | 'inventory' | 'clients' | 'leads' | 'deals' | 'staff'
  | 'payroll' | 'leave' | 'reports' | 'meetings' | 'documents'
  | 'settings' | 'purchases' | 'approvals' | 'analytics'

export type Permission = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'manage'

type ModulePermissions = Partial<Record<Module, Permission[]>>
type PermissionMatrix = Record<Role, ModulePermissions>

const PERMISSIONS: PermissionMatrix = {
  owner: {
    dashboard: ['view', 'manage'], tasks: ['view', 'create', 'edit', 'delete', 'manage'],
    projects: ['view', 'create', 'edit', 'delete', 'manage'],
    invoices: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'],
    expenses: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'],
    inventory: ['view', 'create', 'edit', 'delete', 'manage'],
    clients: ['view', 'create', 'edit', 'delete', 'manage'],
    leads: ['view', 'create', 'edit', 'delete', 'manage'],
    deals: ['view', 'create', 'edit', 'delete', 'manage'],
    staff: ['view', 'create', 'edit', 'delete', 'manage'],
    payroll: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    leave: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    reports: ['view', 'create', 'export', 'manage'],
    meetings: ['view', 'create', 'edit', 'delete', 'manage'],
    documents: ['view', 'create', 'edit', 'delete', 'manage'],
    settings: ['view', 'edit'],
    purchases: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    approvals: ['view', 'approve', 'manage'],
    analytics: ['view', 'export', 'manage'],
  },
  admin: {
    dashboard: ['view', 'manage'], tasks: ['view', 'create', 'edit', 'delete', 'manage'],
    projects: ['view', 'create', 'edit', 'delete', 'manage'],
    invoices: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    expenses: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    inventory: ['view', 'create', 'edit', 'delete', 'manage'],
    clients: ['view', 'create', 'edit', 'delete'],
    leads: ['view', 'create', 'edit', 'delete'],
    deals: ['view', 'create', 'edit', 'delete'],
    staff: ['view', 'create', 'edit', 'delete', 'manage'],
    payroll: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    leave: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    reports: ['view', 'create', 'export'],
    meetings: ['view', 'create', 'edit', 'delete', 'manage'],
    documents: ['view', 'create', 'edit', 'delete'],
    settings: ['view', 'edit'],
    purchases: ['view', 'create', 'edit', 'delete', 'approve'],
    approvals: ['view', 'approve', 'manage'],
    analytics: ['view', 'export'],
  },
  manager: {
    dashboard: ['view'], tasks: ['view', 'create', 'edit', 'delete', 'manage'],
    projects: ['view', 'create', 'edit', 'delete', 'manage'],
    invoices: ['view', 'create', 'export'],
    expenses: ['view', 'create', 'export'],
    inventory: ['view', 'create', 'edit'],
    clients: ['view', 'create', 'edit'],
    leads: ['view', 'create', 'edit'],
    deals: ['view', 'create', 'edit'],
    staff: ['view', 'manage'],
    payroll: ['view'],
    leave: ['view', 'approve'],
    reports: ['view', 'export'],
    meetings: ['view', 'create', 'edit'],
    documents: ['view', 'create'],
    settings: ['view'],
    purchases: ['view', 'create'],
    approvals: ['view', 'approve'],
    analytics: ['view'],
  },
  team_lead: {
    dashboard: ['view'], tasks: ['view', 'create', 'edit', 'manage'],
    projects: ['view', 'create', 'edit'],
    invoices: ['view'], expenses: ['view'], inventory: ['view'],
    clients: ['view'], leads: ['view', 'create', 'edit'],
    deals: ['view', 'create', 'edit'], staff: ['view'],
    leave: ['view'], reports: ['view'],
    meetings: ['view', 'create'], documents: ['view'],
    purchases: ['view'], approvals: [], analytics: [],
  },
  staff: {
    dashboard: ['view'], tasks: ['view', 'create', 'edit'], projects: ['view'],
    invoices: ['view'], expenses: ['view', 'create'],
    inventory: ['view'], clients: ['view'],
    leave: ['view', 'create'], reports: ['view'],
    meetings: ['view'], documents: ['view'],
  },
}

// Module to tool_key mapping for useToolAccess.ts integration
export const MODULE_TO_TOOL_KEY: Record<Module, string> = {
  dashboard: 'dashboard',
  tasks: 'tasks',
  projects: 'projects',
  invoices: 'finance',
  expenses: 'finance',
  inventory: 'inventory',
  clients: 'crm',
  leads: 'crm',
  deals: 'crm',
  staff: 'people',
  payroll: 'people',
  leave: 'people',
  reports: 'reports',
  meetings: 'meetings',
  documents: 'knowledge',
  settings: 'settings',
  purchases: 'requisitions',
  approvals: 'approvals',
  analytics: 'reports',
}

export function hasPermission(role: Role, module: Module, permission: Permission): boolean {
  const perms = PERMISSIONS[role]?.[module] || []
  return perms.includes(permission) || perms.includes('manage')
}

export function canView(role: Role, module: Module) { return hasPermission(role, module, 'view') }
export function canCreate(role: Role, module: Module) { return hasPermission(role, module, 'create') }
export function canEdit(role: Role, module: Module) { return hasPermission(role, module, 'edit') }
export function canDelete(role: Role, module: Module) { return hasPermission(role, module, 'delete') }
export function canApprove(role: Role, module: Module) { return hasPermission(role, module, 'approve') }
export function canExport(role: Role, module: Module) { return hasPermission(role, module, 'export') }
export function canManage(role: Role, module: Module) { return hasPermission(role, module, 'manage') }

export function isRoleAtLeast(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export function getModulePermissions(role: Role, module: Module): Permission[] {
  return PERMISSIONS[role]?.[module] || []
}

export function getRoleModules(role: Role): Module[] {
  const perms = PERMISSIONS[role]
  if (!perms) return []
  return Object.entries(perms)
    .filter(([_, p]) => p && p.length > 0)
    .map(([m]) => m as Module)
}

export const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Dashboard', tasks: 'Tasks', projects: 'Projects',
  invoices: 'Invoices', expenses: 'Expenses', inventory: 'Inventory',
  clients: 'Clients', leads: 'Leads', deals: 'Deals',
  staff: 'Staff', payroll: 'Payroll', leave: 'Leave',
  reports: 'Reports', meetings: 'Meetings', documents: 'Documents',
  settings: 'Settings', purchases: 'Purchases', approvals: 'Approvals',
  analytics: 'Analytics',
}
