/**
 * AVENIZE ROLE-BASED ACCESS CONTROL (RBAC)
 * Granular permissions system with role hierarchy
 */

export type Role = 'super_admin' | 'owner' | 'admin' | 'manager' | 'team_lead' | 'staff' | 'accountant' | 'sales' | 'hr' | 'viewer'

export const ROLE_HIERARCHY: Record<Role, number> = {
  super_admin: 100,
  owner: 90,
  admin: 80,
  manager: 70,
  team_lead: 60,
  accountant: 50,
  sales: 50,
  hr: 50,
  staff: 40,
  viewer: 10,
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  owner: 'Business Owner',
  admin: 'Admin Manager',
  manager: 'Manager',
  team_lead: 'Team Lead',
  staff: 'Staff',
  accountant: 'Accountant',
  sales: 'Sales Manager',
  hr: 'HR Manager',
  viewer: 'Viewer',
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
  super_admin: {
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
    settings: ['view', 'edit', 'manage'],
    purchases: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    approvals: ['view', 'approve', 'manage'],
    analytics: ['view', 'export', 'manage'],
  },
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
  accountant: {
    dashboard: ['view'], tasks: ['view', 'edit'], projects: ['view'],
    invoices: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'],
    expenses: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'],
    inventory: ['view', 'export'], clients: ['view', 'create'],
    staff: ['view'], payroll: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
    leave: ['view', 'approve'], reports: ['view', 'create', 'export', 'manage'],
    meetings: ['view'], documents: ['view', 'create'],
    purchases: ['view', 'create', 'edit'], approvals: ['view', 'approve'],
    analytics: ['view', 'export'],
  },
  sales: {
    dashboard: ['view'], tasks: ['view', 'create', 'edit'], projects: ['view'],
    invoices: ['view', 'create'], expenses: ['view'],
    clients: ['view', 'create', 'edit'],
    leads: ['view', 'create', 'edit', 'delete', 'manage'],
    deals: ['view', 'create', 'edit', 'delete', 'manage'],
    leave: ['view', 'create'], reports: ['view'],
    meetings: ['view', 'create'], documents: ['view', 'create'],
    analytics: ['view'],
  },
  hr: {
    dashboard: ['view'], tasks: ['view', 'create', 'edit'],
    invoices: ['view'], expenses: ['view'],
    staff: ['view', 'create', 'edit', 'delete', 'manage'],
    payroll: ['view', 'create', 'edit', 'manage'],
    leave: ['view', 'create', 'edit', 'approve', 'manage'],
    reports: ['view', 'create', 'export'],
    meetings: ['view', 'create'], documents: ['view', 'create', 'edit', 'manage'],
    approvals: ['view', 'approve'], analytics: ['view', 'export'],
  },
  staff: {
    dashboard: ['view'], tasks: ['view', 'create', 'edit'], projects: ['view'],
    invoices: ['view'], expenses: ['view', 'create'],
    inventory: ['view'], clients: ['view'],
    leave: ['view', 'create'], reports: ['view'],
    meetings: ['view'], documents: ['view'],
  },
  viewer: {
    dashboard: ['view'], tasks: ['view'], projects: ['view'],
    invoices: ['view'], expenses: ['view'], inventory: ['view'],
    clients: ['view'], leads: ['view'], deals: ['view'],
    staff: ['view'], leave: ['view'], reports: ['view'],
    meetings: ['view'], documents: ['view'],
    purchases: ['view'], analytics: ['view'],
  },
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
