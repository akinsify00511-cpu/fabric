/**
 * Role-Aware Home Configuration — the single source of truth for what each
 * business role sees on the BusinessHome (`/app`).
 *
 * PRINCIPLE: Avenize has ONE Business Brain. Different roles see different
 * WINDOWS into the same connected business organism. This config declares,
 * per role: the hero framing, the priority cards (intelligence surfaces),
 * the primary metrics to emphasize, and the Ask-Avenize / module entry
 * points — composed from the SAME reusable primitives, not 8 separate
 * homepages.
 *
 * SECURITY: role personalization is UX ONLY. It NEVER grants access. RLS +
 * backend authorization remain the final authority (a marketing user's home
 * emphasizes marketing cards, but they cannot read finance rows RLS denies).
 * This config only changes what is EMPHASIZED, never what is EXPOSED.
 *
 * The card "kind" maps to a reusable card primitive in BusinessHomeCards.tsx.
 * Each kind is backed by a real intelligence RPC (business_brain /
 * profitability / leakage / health / etc.) — no fabricated metrics.
 */
import type { Role } from './permissions'

/** The reusable card kinds composed into a role home. */
export type CardKind =
  | 'state'            // Business State (classify_business_state)
  | 'next_best_action' // Next Best Action (next_best_action)
  | 'pulse'            // Business Pulse / health dimensions (current_business_health)
  | 'revenue'          // Revenue metric (governed kpi)
  | 'cash'             // Cash / receivables (governed kpi + overdue)
  | 'profit'           // Profitability / margin (ebitda)
  | 'pipeline'         // Sales pipeline (deals)
  | 'opportunities'    // Detected opportunities (recommendations)
  | 'risks'            // Risks / leakage (leakage detection + business_risks)
  | 'operations'       // Operational health (bottlenecks / tasks)
  | 'people'           // People health (headcount / attendance)
  | 'customers'        // Customer / CRM health
  | 'value_ledger'     // Avenize value created (business_value_ledger)
  | 'diagnoses'        // Cross-module diagnosis (diagnose_business)
  // ── Function-specific kinds (Session 29) — backed by REAL tables ──
  | 'campaign_performance' // email_campaigns: active/sent, recipients, performance
  | 'lead_quality'         // leads: new/qualified/converted funnel + stagnation
  | 'receivables'          // invoices: unpaid/overdue aging + collection risk
  | 'attendance'           // attendance_records: present/absent/late today
  | 'leave_balance'        // leave_requests: pending approvals + upcoming leave
  | 'project_delivery'     // projects: active/done/on_hold + deadlines
  | 'workload'             // tasks + projects: capacity / overload signal

export interface RoleHomeConfig {
  /** The hero eyebrow + framing line template. `{name}` is the user's first name. */
  heroEyebrow: string
  /** Hero subtitle when business is healthy. Uses real state when available. */
  heroHealthy: string
  /** Hero subtitle when business needs attention. */
  heroAttention: string
  /** Hero subtitle for a brand-new business (gamified onboarding). */
  heroNew: string
  /** Ordered card kinds to render on the first viewport. */
  primaryCards: CardKind[]
  /** Secondary cards rendered below the fold. */
  secondaryCards: CardKind[]
  /** The CTA label for the primary action. */
  primaryCta: { label: string; to: string }
  /** Which tool route to deep-link for "your work". */
  workRoute: string
}

/**
 * Map a staff role to a home config. The 5 DB-valid roles (owner, admin,
 * manager, team_lead, staff) are all handled. `manager`/`team_lead` get
 * operational windows; `staff` gets a personal-work window. `admin` is
 * treated as a privileged owner-style window (admin IS a real DB role, per
 * Session 10 reconciliation).
 */
export function getRoleHomeConfig(role: Role | null | undefined): RoleHomeConfig {
  switch (role) {
    case 'owner':
    case 'admin':
      return OWNER_HOME
    case 'manager':
      return MANAGER_HOME
    case 'team_lead':
      return TEAM_LEAD_HOME
    case 'staff':
      return STAFF_HOME
    default:
      return OWNER_HOME
  }
}

/** The role display label for the hero greeting. */
export function roleLabel(role: Role | null | undefined): string {
  switch (role) {
    case 'owner': return 'Owner'
    case 'admin': return 'Administrator'
    case 'manager': return 'Manager'
    case 'team_lead': return 'Team Lead'
    case 'staff': return 'Team'
    default: return ''
  }
}

// ── Owner / Admin — the whole-business window ───────────────────────────
const OWNER_HOME: RoleHomeConfig = {
  heroEyebrow: 'Your business at a glance',
  heroHealthy: 'Your business is in a strong position.',
  heroAttention: 'Your business needs attention today.',
  heroNew: "Let's build your business picture.",
  primaryCards: ['state', 'next_best_action', 'revenue', 'cash', 'profit', 'pulse'],
  secondaryCards: ['opportunities', 'risks', 'operations', 'value_ledger', 'diagnoses'],
  primaryCta: { label: 'View Business Brain', to: '/app/cockpit' },
  workRoute: '/app',
}

// ── Manager — cross-functional execution window ─────────────────────────
const MANAGER_HOME: RoleHomeConfig = {
  heroEyebrow: 'Your team at a glance',
  heroHealthy: 'Your team is executing well.',
  heroAttention: 'A few things on your team need attention.',
  heroNew: "Let's get your team moving.",
  primaryCards: ['state', 'next_best_action', 'operations', 'people', 'pipeline', 'pulse'],
  secondaryCards: ['risks', 'opportunities', 'value_ledger'],
  primaryCta: { label: 'View Operations', to: '/app/operations' },
  workRoute: '/app/tasks',
}

// ── Team Lead — delivery window ─────────────────────────────────────────
const TEAM_LEAD_HOME: RoleHomeConfig = {
  heroEyebrow: 'Your work at a glance',
  heroHealthy: 'Your projects are on track.',
  heroAttention: 'Some work on your plate needs attention.',
  heroNew: 'Start by assigning your first task.',
  primaryCards: ['next_best_action', 'operations', 'people', 'pulse'],
  secondaryCards: ['risks', 'opportunities'],
  primaryCta: { label: 'Open My Work', to: '/app/tasks' },
  workRoute: '/app/tasks',
}

// ── Staff — personal work window (limited business visibility) ──────────
const STAFF_HOME: RoleHomeConfig = {
  heroEyebrow: 'Your work at a glance',
  heroHealthy: "You're all caught up.",
  heroAttention: 'You have work that needs your attention.',
  heroNew: 'Welcome — your workspace is ready.',
  primaryCards: ['next_best_action', 'operations'],
  secondaryCards: [],
  primaryCta: { label: 'Open My Work', to: '/app/tasks' },
  workRoute: '/app/tasks',
}
