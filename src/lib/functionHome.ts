/**
 * Function × Seniority derivation — evolves the home role model from the
 * coarse Owner/Manager/Team Lead/Staff hierarchy into FUNCTION × SENIORITY.
 *
 * The business roles (owner/admin/manager/team_lead/staff) express
 * SENIORITY (how much of the business you oversee). They do NOT express
 * FUNCTION (which part of the business you run). A "Marketing Manager" and
 * a "Finance Manager" are both `manager` seniority, but they need
 * substantially different intelligence windows. This module derives the
 * function from the staff member's job_title / department / active tools,
 * then composes a function-specific home on top of the seniority window.
 *
 * Derivation is best-effort and falls back to 'general' (the whole-business
 * window). It NEVER grants access — it only changes which cards are
 * EMPHASIZED. RLS remains the authority (a marketing user who somehow
 * reaches finance rows is still denied by RLS regardless of what the home
 * shows).
 *
 * The signal priority (most authoritative first):
 *   1. staff.department (explicit, if set)
 *   2. staff.job_title (keyword match — "Marketing Manager", "Sales Lead",
 *      "Accountant", "HR Officer", "Operations Coordinator", "Project
 *      Manager" all resolve to a function)
 *   3. active tools (a user whose workspace selection is all marketing
 *      tools is treated as marketing)
 *   4. fallback → 'general'
 */
import type { Role } from './permissions'
import type { CardKind } from './roleHomeConfig'

/** The 7 functions Avenize understands. 'general' = whole-business. */
export type BusinessFunction =
  | 'general'     // whole-business (owner/admin, or undetectable)
  | 'marketing'   // campaigns, reach, leads, conversion
  | 'sales'       // pipeline, deals, revenue
  | 'finance'     // cash, invoices, expenses, profit
  | 'hr'          // people, attendance, leave, payroll
  | 'operations'  // processes, capacity, bottlenecks
  | 'projects'    // delivery, milestones, workload

/** The seniority axis (from the DB role). */
export type Seniority = 'executive' | 'manager' | 'lead' | 'individual'

/** Job-title keyword → function mapping. Ordered; first match wins. */
const TITLE_KEYWORDS: Array<{ fn: BusinessFunction; keywords: string[] }> = [
  { fn: 'marketing', keywords: ['marketing', 'growth', 'content', 'brand', 'social media', 'campaign', 'seo', 'cmo'] },
  { fn: 'sales', keywords: ['sales', 'account executive', 'account manager', 'business development', 'bd ', 'sdr', 'ae ', 'closer', 'revenue', 'cro'] },
  { fn: 'finance', keywords: ['finance', 'accountant', 'accounting', 'cfo', 'bookkeep', 'treasury', 'audit', 'tax', 'payroll'] },
  { fn: 'hr', keywords: ['hr ', 'human resource', 'people ops', 'people officer', 'recruit', 'talent', 'chro', 'l&d', 'learning and development'] },
  { fn: 'operations', keywords: ['operation', 'ops ', 'logistics', 'supply chain', 'procurement', 'warehouse', 'facility', 'coo'] },
  { fn: 'projects', keywords: ['project', 'delivery', 'pmo', 'scrum', 'product owner', 'program'] },
]

/** Department string → function (explicit signal beats title guess). */
const DEPARTMENT_MAP: Record<string, BusinessFunction> = {
  marketing: 'marketing',
  sales: 'sales',
  finance: 'finance',
  accounting: 'finance',
  hr: 'hr',
  'human resources': 'hr',
  'people & culture': 'hr',
  operations: 'operations',
  ops: 'operations',
  logistics: 'operations',
  procurement: 'operations',
  projects: 'projects',
  delivery: 'projects',
  'project management': 'projects',
}

/** Tool-key → function fallback (when title/department are empty). */
const TOOL_FUNCTION_MAP: Record<string, BusinessFunction> = {
  campaigns: 'marketing',
  social: 'marketing',
  crm: 'sales',
  leads: 'sales',
  deals: 'sales',
  invoices: 'finance',
  expenses: 'finance',
  finance: 'finance',
  accounting: 'finance',
  people: 'hr',
  attendance: 'hr',
  leave: 'hr',
  payroll: 'hr',
  inventory: 'operations',
  vendors: 'operations',
  'purchase-orders': 'operations',
  projects: 'projects',
  tasks: 'projects',
}

/**
 * Derive the business function from every available signal.
 * @param jobTitle   staff.job_title (free text)
 * @param department staff.department (free text, if set)
 * @param activeTools the user's active (entitled ∩ selected) tool keys
 */
export function deriveFunction(
  jobTitle: string | null | undefined,
  department: string | null | undefined,
  activeTools: string[] = [],
): BusinessFunction {
  // 1. Explicit department signal.
  const dept = (department || '').trim().toLowerCase()
  if (dept && DEPARTMENT_MAP[dept]) return DEPARTMENT_MAP[dept]

  // 2. Job-title keyword scan.
  const title = (jobTitle || '').trim().toLowerCase()
  if (title) {
    for (const { fn, keywords } of TITLE_KEYWORDS) {
      if (keywords.some(k => title.includes(k))) return fn
    }
  }

  // 3. Active-tool fallback (pluralistic — pick the dominant function).
  if (activeTools.length) {
    const counts: Partial<Record<BusinessFunction, number>> = {}
    for (const t of activeTools) {
      const f = TOOL_FUNCTION_MAP[t]
      if (f) counts[f] = (counts[f] ?? 0) + 1
    }
    const entries = Object.entries(counts) as Array<[BusinessFunction, number]>
    if (entries.length) {
      entries.sort((a, b) => b[1] - a[1])
      return entries[0][0]
    }
  }

  return 'general'
}

/** Map the DB role to the seniority axis. */
export function deriveSeniority(role: Role | null | undefined): Seniority {
  switch (role) {
    case 'owner':
    case 'admin':
      return 'executive'
    case 'manager':
      return 'manager'
    case 'team_lead':
      return 'lead'
    case 'staff':
      return 'individual'
    default:
      return 'individual'
  }
}

/** A human label for the function (for the hero eyebrow). */
export function functionLabel(fn: BusinessFunction): string {
  switch (fn) {
    case 'marketing': return 'Marketing'
    case 'sales': return 'Sales'
    case 'finance': return 'Finance'
    case 'hr': return 'People'
    case 'operations': return 'Operations'
    case 'projects': return 'Projects'
    default: return 'Business'
  }
}

/** A human label for the seniority (for the hero eyebrow). */
export function seniorityLabel(s: Seniority): string {
  switch (s) {
    case 'executive': return 'Executive'
    case 'manager': return 'Manager'
    case 'lead': return 'Lead'
    default: return ''
  }
}

/**
 * The function-specific card kinds. Each function declares its priority +
 * secondary cards. These REUSE the existing card primitives where the
 * function's data overlaps (e.g. Sales reuses pipeline + revenue), and add
 * NEW function-specific card kinds (campaign_performance, lead_quality,
 * receivables, attendance, leave_balance, project_delivery, workload)
 * backed by REAL tables (email_campaigns, leads, deals, invoices,
 * attendance_records, leave_requests, projects, tasks — verified against
 * migrations, no fabrication per §22).
 *
 * The seniority axis MODIFIES the composition:
 *   - executive/manager → see the function's priority cards + a whole-business
 *     pulse (they oversee the function, not just do work in it).
 *   - lead → see execution + the function's priority cards.
 *   - individual → see their own work within the function (fewer cards).
 */
export interface FunctionHomeConfig {
  /** Hero eyebrow template. Tokens: {fn} function label, {sen} seniority. */
  heroEyebrow: string
  heroHealthy: string
  heroAttention: string
  heroNew: string
  /** Priority cards (first viewport). */
  primaryCards: CardKind[]
  /** Secondary cards (below the fold). */
  secondaryCards: CardKind[]
  /** The primary CTA. */
  primaryCta: { label: string; to: string }
  /** The "your work" route for this function. */
  workRoute: string
  /** The pulse sequence — function-specific connected nodes. */
  pulseSequence: string[]
}

/**
 * Resolve the final home config: function × seniority.
 * Falls back to the general (whole-business) config when the function is
 * 'general' — preserving the existing Owner/Manager/Team Lead/Staff behaviour.
 */
export function getFunctionHome(
  fn: BusinessFunction,
  sen: Seniority,
): FunctionHomeConfig {
  const base = FUNCTION_HOMES[fn] ?? FUNCTION_HOMES.general
  // Seniority modifiers: individuals see a trimmed, personal view.
  if (sen === 'individual') {
    return {
      ...base,
      primaryCards: base.primaryCards.slice(0, Math.max(2, base.primaryCards.length - 1)),
      secondaryCards: [],
    }
  }
  return base
}

// ── Function-specific pulse sequences (the connected-organism nodes) ────
// Each expresses the value chain for that function, top → bottom.
const PULSE_SEQUENCES: Record<BusinessFunction, string[]> = {
  marketing: ['Campaigns', 'Reach', 'Leads', 'Qualified Leads', 'Opportunities', 'Pipeline', 'Revenue'],
  sales: ['Leads', 'Qualified', 'Opportunities', 'Proposals', 'Negotiations', 'Won', 'Revenue'],
  finance: ['Invoicing', 'Receivables', 'Cash', 'Expenses', 'Payables', 'Profit', 'Health'],
  hr: ['Headcount', 'Hiring', 'Attendance', 'Leave', 'Payroll', 'Engagement', 'Retention'],
  operations: ['Suppliers', 'Inventory', 'Orders', 'Fulfillment', 'Capacity', 'Throughput', 'Cost'],
  projects: ['Backlog', 'Active', 'Milestones', 'Workload', 'Blocked', 'Delivery', 'Margin'],
  general: ['Finance', 'Sales', 'Customers', 'Operations', 'People', 'Projects'],
}

// ── The 7 function homes ────────────────────────────────────────────────
const FUNCTION_HOMES: Record<BusinessFunction, FunctionHomeConfig> = {
  general: {
    heroEyebrow: 'Your business at a glance',
    heroHealthy: 'Your business is in a strong position.',
    heroAttention: 'Your business needs attention today.',
    heroNew: "Let's build your business picture.",
    primaryCards: ['state', 'next_best_action', 'revenue', 'cash', 'profit', 'pulse'],
    secondaryCards: ['opportunities', 'risks', 'operations', 'people', 'value_ledger', 'diagnoses'],
    primaryCta: { label: 'View Business Brain', to: '/app/cockpit' },
    workRoute: '/app',
    pulseSequence: PULSE_SEQUENCES.general,
  },
  marketing: {
    heroEyebrow: '{fn} engine at a glance',
    heroHealthy: 'Your marketing engine is generating momentum.',
    heroAttention: 'A few marketing signals need your attention.',
    heroNew: "Let's get your first campaign out.",
    primaryCards: ['campaign_performance', 'lead_quality', 'next_best_action', 'pipeline', 'pulse'],
    secondaryCards: ['opportunities', 'risks', 'value_ledger'],
    primaryCta: { label: 'Open Campaigns', to: '/app/campaigns' },
    workRoute: '/app/campaigns',
    pulseSequence: PULSE_SEQUENCES.marketing,
  },
  sales: {
    heroEyebrow: '{fn} at a glance',
    heroHealthy: 'Your pipeline is healthy and converting.',
    heroAttention: 'Your pipeline needs attention today.',
    heroNew: 'Start by adding your first deal.',
    primaryCards: ['pipeline', 'next_best_action', 'revenue', 'customers', 'pulse'],
    secondaryCards: ['opportunities', 'risks', 'value_ledger'],
    primaryCta: { label: 'Open CRM', to: '/app/crm' },
    workRoute: '/app/crm',
    pulseSequence: PULSE_SEQUENCES.sales,
  },
  finance: {
    heroEyebrow: '{fn} at a glance',
    heroHealthy: 'Your finances are in a strong position.',
    heroAttention: 'Your cash position needs attention today.',
    heroNew: 'Start by recording your first invoice.',
    primaryCards: ['cash', 'receivables', 'profit', 'next_best_action', 'pulse'],
    secondaryCards: ['risks', 'opportunities', 'value_ledger', 'diagnoses'],
    primaryCta: { label: 'Open Finance', to: '/app/finance' },
    workRoute: '/app/finance',
    pulseSequence: PULSE_SEQUENCES.finance,
  },
  hr: {
    heroEyebrow: '{fn} at a glance',
    heroHealthy: 'Your team is healthy and engaged.',
    heroAttention: 'Your people need attention today.',
    heroNew: 'Start by adding your first team member.',
    primaryCards: ['people', 'attendance', 'leave_balance', 'next_best_action', 'pulse'],
    secondaryCards: ['opportunities', 'risks'],
    primaryCta: { label: 'Open People', to: '/app/people' },
    workRoute: '/app/people',
    pulseSequence: PULSE_SEQUENCES.hr,
  },
  operations: {
    heroEyebrow: '{fn} at a glance',
    heroHealthy: 'Your operations are running smoothly.',
    heroAttention: 'Your operations need attention today.',
    heroNew: 'Start by adding your first product.',
    primaryCards: ['operations', 'workload', 'next_best_action', 'pulse'],
    secondaryCards: ['risks', 'opportunities', 'value_ledger'],
    primaryCta: { label: 'Open Inventory', to: '/app/inventory' },
    workRoute: '/app/inventory',
    pulseSequence: PULSE_SEQUENCES.operations,
  },
  projects: {
    heroEyebrow: '{fn} at a glance',
    heroHealthy: 'Your projects are on track.',
    heroAttention: 'Some projects need attention today.',
    heroNew: 'Start by creating your first project.',
    primaryCards: ['project_delivery', 'workload', 'next_best_action', 'pulse'],
    secondaryCards: ['risks', 'opportunities', 'value_ledger'],
    primaryCta: { label: 'Open Projects', to: '/app/projects' },
    workRoute: '/app/projects',
    pulseSequence: PULSE_SEQUENCES.projects,
  },
}
