# DOMAIN: PERSONAL EXPERIENCE

**Purpose:** give every authenticated human user an experience derived from their
verified identity, business membership, role, permissions, responsibilities, business
context, entitlements, preferences and relevant activity — not a generic same-for-everyone
dashboard.

**Responsibilities:** canonical personal-context resolution (the authoritative
identity → membership → role → responsibilities → context object consumed by the whole
app), personal workspace (pin/reorder/hide — selection never grants access), personal
notification summaries (responsibility-scoped messages), personal goals, personal AI
memory (respecting privacy boundaries), and the "My Avenize" home surface (My Day / My Work).

**Constitutional basis:** Personalization Constitution (Product Constitution, Article X).
Personalization may change presentation, prioritization, recommendations, workspace
configuration and assistance, but must NEVER grant permissions, bypass RLS, alter
subscription entitlements, or expose information outside the user's authorized scope.

---

## Canonical contract

The single object every consumer derives from. Assembled server-side by the
`my_context()` SECURITY DEFINER RPC (sole authoritative writer is the database;
client hooks just consume it):

```text
my_context() → {
  identity:      { user_id, preferred_name, name, email, avatar? }
  membership:    { staff_id, business_id, role, active_role, member_kind,
                   department, team, position_title }
  responsibilities: {
      departments_headed:  [department_name]
      teams_headed:        [team_name]
      reports_to:          staff_name | null      -- dept/team/direct head (reporting_structure)
      direct_reports:      [staff_name]
      secondary_roles:     [role]
  }
  business:      { business_name, industry, company_size, complexity,
                   organization_id }
  entitlements:  { plan_code, features: [...] }
  workspaces:    { selected_tools, pinned_items, pinned_modules }
  personal:      { locale_language, timezone, notification: {email,push,in_app} }
  ai_memory:     [ {signal, value, note, source} ]   -- legit work context only
  priorities:    { my_attention_count, my_goals: [...], next_best_action? }
}
```

**Sources (all existing canonical objects — NONE duplicated):**

| Contract field | Canonical source | File |
|---|---|---|
| user_id / staff_id / business_id / role | `staff`, `resolve_current_user_context()` | 001 / 20260826190000 |
| active_role (persona) | `staff.active_role`, `set_active_role` | 20260818250000 |
| member_kind | `staff.member_kind (owner/staff/consultant/vendor/expert/partner)` | 20260819015000 |
| secondary roles | `staff_secondary_roles` | 20260818250000 |
| department / team / position_title | `staff_assignments` → departments/teams/positions | 039 |
| reports_to / direct_reports | `reporting_structure` | 023 |
| departments_headed / teams_headed | `departments.head_staff_id`, `teams.*` | 023 / 039 |
| business name / industry / org | `businesses`, `organizations` | 20260817150000 |
| company_size / complexity | staff count + active module count (client derives) | useExperienceContext |
| entitlements / features | `business_entitlements` | Session 8 |
| selected tools | `user_workspace_selections` | 100 |
| locale / timezone / formats | `user_locale` | 012 |
| notification prefs | `notification_preferences` | 013 |
| pinned items / modules | `user_pinned_items` | **20260827000000** (new) |
| personal goals | `user_goals` | **20260827000000** (new) |
| personal AI memory | `user_ai_memory` | **20260827000000** (new) |
| attention / follow-ups | existing tables scoped by responsibilities (see §Layers) | — |

**Explicitly NOT entities** (absorbed into existing ancestors — do not create tables):
`user_profiles` (staff carries identity + personal fields 083), `user_business_memberships`
(staff row IS the membership — one business), `user_roles` / `user_role_assignments`
(staff.role + staff_secondary_roles + staff_functional_roles), `user_responsibilities`
(staff_assignments + reporting_structure + department membership), `user_workspace_preferences`
(user_workspace_selections), `user_saved_views` (saved_searches 038), `user_notification_preferences`
(notification_preferences 013), `user_activity_summary` (user_activity_daily 037 +
usage_events), `user_personal_context` (the my_context() RPC derives on demand — no
denormalized table). This is the One-Source-Per-Concept rule (Article II).

---

## The three genuinely missing pieces (filled by 20260827000000)

1. **`user_pinned_items`** — the missing half of workspace personalization. Module
   selection existed; pin/reorder did not. `entity_type` allowlist: module / customer /
   deal / project / report / lead / invoice. Always business-scoped + user-scoped; a
   user can only pin what their permissions already expose.
2. **`user_goals`** — the missing "My Goals" contract. `category` allowlist derived from
   function home (sales/operations/finance/hr/marketing/projects/general) so a goal of
   "₦20M monthly sales" is impossible for a function that has no sales scope. Progress is
   user-reported OR linked to a real metric (`metric_key` FK → metric_definitions) so
   actuals can flow from governed data (anti-fabrication).
3. **`user_ai_memory`** — personal working-context memory with a hard privacy boundary.
   `kind` allowlist (routine/significant/context), value is an assembled-facts JSONB, and
   a `source` tag labels SYSTEM CAPTURED vs AI INFERRED vs USER ENTERED vs USER CONFIRMED.
   This is NOT surveillance: the RPC only ever assembles facts from data the user can
   already see (their own scope). Wells-of-context are staff responsibilities + preferences,
   NOT private content.

Everything else in the vision already exists and is reached by composition — the mistake
would be to build parallel tables.

---

## Experience layers (how personalization is applied)

Live sidebar + home surface must read **one** authoritative context. The existing
`useExperienceContext` (Session 20) is that hook for nav/dashboard. This domain adds the
server-assembled `my_context()` so the same object can feed the home surface, knowledge-
aided notifications, and personalization without 15 client round-trips.

### Layer 1 — identity + membership
Auth → staff → business → organization. Canonical resolver `resolve_current_user_context()`
(20260826190000). Onboarding idempotence prevents re-onboarding of returning users.

### Layer 2 — role + permissions (UX) + entitlements (authority)
`staff.role` + `staff_secondary_roles` (identity/UX), `staff_functional_roles` (tool
access, UX), `business_entitlements` + plan tier + `can_access_module` (authority). A
personalization NEVER flips these; it only re-orders what is shown *within* what the
authority grants.

### Layer 3 — responsibilities (departments/teams/position)
`staff_assignments` + `departments`/`teams` + `reporting_structure`. The `my_context()`
responsibilities block drives "what matters to this person" (their team's overdue items,
their direct reports' follow-ups, the department they head).

### Layer 4 — gravitas (role × function home)
`functionHome.ts` derives the 7 function windows (marketing/sales/finance/hr/operations/
projects/general) from `job_title`/`department`/active tools; seniority from `role`. The
home surface ("My Avenize") renders the derived window, not the generic dashboard.

### Layer 5 — preferences
`user_locale`, `notification_preferences`, `user_workspace_selections` (hide tools).
Pinned items + module pinning extend this (new table).

### Layer 6 — behaviour
`usage_events` + `user_activity_daily` + `user_learning` + `feature_activation` signal
recently-used areas and frequently-performed actions. The home surface can prompt
("You appear to spend most of your time on Leads and Quotes — add them to your workspace?")
from these signals, but only ever as an opt-in suggestion (never auto-coupled).

### Layer 7 — priorities (My Day)
Responsibilities-scoped attention aggregation: the home surface assembles, for the current
user's scope, overdue tasks, approvals awaiting them, today's meetings, low stock /
overdue invoices / stale deals **only for the areas their responsibilities touch**. Reuses
the existing data-quality and intelligence signals; nothing new computed.

### Layer 8 — help (AI memory inside the boundary)
`user_ai_memory` records legitimate work context ("Femi usually reviews sales on Monday
mornings" when that pattern is observable from usage). The `next_best_action` engine
(business_brain) already exists and is reused verbatim; personal memory only gives it the
user's responsibilities so it can say "your team's conversion dropped" rather than a
business-generic statement. Honest: memory entries are labelled with source and are only
ever derivable from the user's own authorized data.

---

## Personal notifications (responsibility-scoped)

The existing event-driven notification system (036/099/emails) is the backbone; this
domain adds the **summary derivation**, not a second notification system. The same
underlying events produce different summaries by responsibility + scope:

```text
salesperson → "3 leads need follow-up"       + "1 quotation ₦8.4M waiting 3 days"
accountant  → "2 invoices overdue"
owner       → "Revenue is 8% below your weekly target"
manager     → "Your team's activity has fallen below normal"
employee    → "1 approval waiting"
```

Each line is a label + severity over an existing notified object scoped to the user's
responsibilities. `my_context()` returns `priorities.notification_summary` so the bell
and the home surface render the same responsibility-scoped message. Anti-spam (¦25)
holds: only responsibility-relevant, never spammy, never duplicated per event.

---

## Personal goals

`user_goals` + the derived progress line. Avenize connects
`Goal → activity → progress → recommendation → outcome`:
- progress computed from a linked governed metric (`metric_key`) when present (FACT), or
  from user-confirmed values (USER CONFIRMED); never AI-invented (¦22).
- goals are role-appropriate RPC-side (the function-home allowlist) so a "sales" goal
  cannot be attached to an unrelated function.
- the home surface shows "My Goals" with honest progress bars or an insufficient-data note.

---

## Security boundaries

- **RLS remains the only authorization boundary.** The three new tables are RLS-locked:
  a user reads/writes only their own rows (user_id = auth.uid()); `user_ai_memory` is
  own-rows too and never stores private content, only work-context facts within the
  user's scope.
- **Personalization can never grant access.** Pinning a deal only surfaces a deal the
  user already has permission to see. `my_context()` is SECURITY DEFINER but gates every
  scoped reference through the same `get_current_staff()` / business-membership checks;
  cross-business references are excluded.
- **Anti-surveillance / privacy.** `my_context()` assembles only data the caller can
  already see; no PII aggregation beyond the caller's own identity; no cross-tenant memory.

---

## Tests (frontend contract + postgres:15 smoke)

- Contract tests: `personalExperience.test.ts` — canonical context shape, pinned-item
  allowlist + never-grants-access, goal category allowlist, AI-memory source labels,
  notification-summary responsibility layering.
- postgres:15 functional smoke: my_context() returns correct identity/responsibilities
  for owner/staff/manager; outsider denied (42501); a non-member sees no other business's
  data; goals + pinned + ai_memory all RLS locked to owner row.

---

## Definition of Done

- A returning user is never re-onboarded (resolver is the authority).
- Nav/home/notifications all consume ONE `my_context()` object.
- Personalization changes presentation only — never permissions, RLS,
  entitlements, or scope.
- Owner, staff, manager, sales, accountant, operations each get a visibly different
  home surface with zero code duplication.
- RLS/other-tenant denial proven by test.