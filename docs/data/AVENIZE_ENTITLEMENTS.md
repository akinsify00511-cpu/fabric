# AVENIZE ENTITLEMENTS

**Version:** 1.0 (2026-08-24). One centralized entitlement layer answers
"can this user/business perform X?" — plan logic is never duplicated across pages.

## The two flags (Session 8 architecture, still canonical)

A module renders ONLY when BOTH are true:
- **entitled** — the business's plan tier includes the module
  (`module_plan_tiers.min_plan_tier` vs `resolve_plan_tier(plan)`).
- **ready** — the module is wired to real data (`module_status.ready`, service-role
  writable only — the client can never flip readiness).

Authority: `can_access_module(p_business_id, p_module_key)` →
`{can_access, entitled, ready}`. Unknown modules fail CLOSED.
`list_accessible_modules(p_business_id)` drives the sidebar in one call.

## Layers

| Layer | Mechanism | Scope |
|---|---|---|
| Plan tier | `business_entitlements.plan` (8 codes: free/starter/team/business/professional/pro/scale/enterprise) | business |
| Module entitlement | `module_plan_tiers` | module × plan |
| Module readiness | `module_status.ready` (service-role only) | module (global) |
| Route enforcement | `RequireModule` wraps gated routes | UX (RLS remains the boundary) |
| Role gate | `staff.role` via RLS + permissions.ts UX | user |
| Workspace selection | `user_workspace_selections.selected_tools` (removal-only filter) | user UX |

Selection can never grant access; intersection only.

## Limits enforced server-side

- AI copilot: daily per-business cap (100 user messages) in ask-avenize edge fn.
- Payments: plan price from `pricing_tiers` server-side at checkout; the browser
  NEVER supplies a price. Founding price honored via `business_subscriptions.price_locked`.
- Subscriptions → entitlements sync via trigger (20260821170000).

## Plans & pricing

- `pricing_tiers` is the single source of truth: founding_* prices (current),
  future_* prices (activated by setting `founding_period_ends_at`), seats,
  is_popular. A price change is an UPDATE, not a code change.
- `get_pricing_tiers()` RPC returns the ACTIVE price.
- Plans: starter ₦15k/150k, team ₦48k/480k, business ₦112k/1.12M (monthly/yearly,
  kobo units); scale/enterprise per `pricing_tiers` rows.

## Rules

1. New feature → add its module to `module_plan_tiers` + `module_status`
   (ready=false until production-verified), gate the route with `RequireModule`,
   and let `can_access_module` be the only answer.
2. Never check plan names in page components. Never hardcode prices outside
   `pricing_tiers` (fallback display constants must be labeled as fallbacks).
3. Entitlement denials render honest upgrade or not-ready states — never a broken page.
