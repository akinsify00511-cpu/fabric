# AVENIZE - AI Agent Instructions

## Design Taste Skills

This repository includes premium design taste skills to ensure all UI output looks intentional and professional:

### Available Skills (`.agents/skills/`)

| Skill | Use When | Key Focus |
|-------|----------|-----------|
| **taste-skill** | Any frontend work | Anti-slop, 3-dial system (VARIANCE/MOTION/DENSITY), design read first |
| **soft-skill** | High-end consumer/agency builds | Awwwards-tier, haptic depth, cinematic motion |
| **minimalist-skill** | Workspace/product UI | Linear/Notion vibes, editorial typography, warm monochrome |
| **redesign-skill** | Improving existing projects | Audit-first, fix hierarchy, spacing, states |

### Quick Reference: Taste Skill 3 Dials

```
DESIGN_VARIANCE: 8   (1=Symmetry, 10=Artsy)
MOTION_INTENSITY: 6  (1=Static, 10=Cinematic)
VISUAL_DENSITY: 4    (1=Airy, 10=Packed)
```

For Avenize's workspace/product UI, use: VARIANCE: 5-6, MOTION: 3-4, DENSITY: 2-3

### Design Rules (From taste-skill)

**Anti-patterns to avoid:**
- ❌ AI-purple gradients, centered hero over dark mesh
- ❌ Three equal feature cards
- ❌ Generic glassmorphism on everything
- ❌ Inter + slate-900 defaults
- ❌ Fake product previews built from styled divs
- ❌ AI copywriting clichés ("Elevate", "Seamless", "Game-changer")

**Preferred patterns:**
- ✅ Phosphor or Lucide icons (standardized stroke)
- ✅ Motion animations for interactive elements
- ✅ Skeleton loaders instead of spinners
- ✅ Realistic content, not "John Doe" placeholders
- ✅ Google Sans Flex typography
- ✅ Token-based colors from brand system

---

## Brand System (Google Standard Edition)

Treat Avenize as if it were built by Google's Workspace team — indistinguishable from Gmail, Calendar, or Admin Console.

### Color Tokens (CSS Custom Properties)

```css
/* Brand / Primary */
--google-blue: #4285F4;
--google-blue-hover: #3367D6;
--google-blue-active: #2A5DB0;
--google-blue-light: rgba(66, 133, 244, 0.08);

/* Surfaces */
--surface-primary: #FFFFFF;
--surface-secondary: #F8F9FA;
--surface-tertiary: #F1F3F4;
--surface-inverse: #202124;

/* Text */
--text-primary: #202124;
--text-secondary: #5F6368;
--text-tertiary: #9AA0A6;
--text-disabled: #DADCE0;

/* Semantic */
--color-success: #34A853;
--color-warning: #FBBC05;
--color-error: #EA4335;
--color-info: #4285F4;

/* Workspace accents */
--accent-sales: #4285F4;
--accent-finance: #34A853;
--accent-projects: #FBBC05;
--accent-hr: #8B5CF6;
--accent-comms: #EC4899;
--accent-ai: #06B6D4;
--accent-automation: #F97316;
--accent-analytics: #6366F1;

/* Borders */
--border-light: #E8EAED;
--border-medium: #DADCE0;
```

### Elevation (Shadows - no borders on cards)

```css
--elevation-1: 0 1px 2px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06);
--elevation-2: 0 2px 4px rgba(0,0,0,.1), 0 4px 8px rgba(0,0,0,.06);
--elevation-3: 0 4px 8px rgba(0,0,0,.1), 0 8px 16px rgba(0,0,0,.06);
--elevation-4: 0 8px 16px rgba(0,0,0,.1), 0 16px 32px rgba(0,0,0,.08);
```

### Radius Scale

```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-pill: 9999px;
--radius-full: 50%;
```

### Motion

```css
--duration-fast: 100ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

### React BRAND Object

```tsx
const BRAND = {
  primary: '#4285F4',
  primaryHover: '#3367D6',
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  surface: '#F8F9FA',
  surface2: '#F1F3F4',
  surfaceElevated: '#FFFFFF',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: '#34A853',
  warning: '#FBBC05',
  danger: '#EA4335',
}
```

## Hard Rules

1. **Every color from tokens** — never hardcoded hex in components
2. **Cards: shadow, no border** — use elevation tokens, never add borders to cards
3. **Typography: var(--font-family)** — Google Sans Flex
4. **Radius from tokens** — 8/12/16/24px only
5. **Spacing: 4px grid** — --space-1 to --space-9
6. **Motion: 100-300ms** — cubic-bezier(0.2, 0, 0, 1), no bounce/spring
7. **Gradient only marketing** — never in /app/* chrome

## Files

- Token file: `src/styles/avenize-tokens.css`
- Design spec: `AVENIZE-DESIGN-SPECIFICATION.md`
- Brand doc: `/workspace/Avenize-Brand-System-Google-Standard.md`

---

## Demo Mode Removal (2026-08-09)

### What was done
- All page-level `DEMO_*` setter fallbacks replaced with `setX([])` (empty arrays)
- `isDemo` guards removed from pages and `TrialBanner` (AuthContext still exports `isDemo` but it's hardcoded `false` — dead code, safe to ignore)
- `SarahChat` rebranded as "Help Guide" — no more fake "AI Assistant" claims; `Bot` icon → `HelpCircle`
- `CompanyHome` birthdays/awards/polls/bestStaff now fetch from `staff`/`merit_entries`/`polls` tables
- `FieldLocation` field teams/jobs now fetch from `staff`/`tasks` tables with empty states
- `Knowledge.tsx` `DEMO_PAGES` fallback removed
- `paystack.ts` `verifyPayment()` security bug fixed (was returning `true` → auto-approve; now returns `false`)
- `.env.example` cleaned: removed `VITE_PAYSTACK_SECRET_KEY` (must only be in Edge Function secrets), clarified placeholders

### What still has demo code (acceptable)
- `src/lib/DemoData.ts` still exports `DEMO_USER`/`DEMO_DEALS`/`clearDemoData`/`initDemoData` but is no longer imported anywhere — candidate for deletion
- `DEMO_*` type-checking constants remain in some pages (unused in runtime paths)
- `AuthContext.tsx` still has `isDemo` (hardcoded `false`) — dead code
- `BrandingContext.tsx` / `useSubscription.tsx` have `isDemo` branches (dead since `isDemo` is always `false`)

### What is NOT done (lower priority)
- `Quotes.tsx` still uses `localStorage('avenize_quotes')` — needs Supabase table migration
- Trial tracking is client-side `localStorage` — should move to `business_entitlements.trial_ends_at`
- No public `/sign/:token` page for external document signers
- Paystack payment verification has no server-side Edge Function (verifyPayment returns false)
- `SarahChat` responses are still rule-based (not real AI), but honestly branded as Help Guide now
- Landing page testimonials are marketing content (not verified real customer quotes)
- No end-to-end testing across the 10 roles has been run

### Architecture gaps (from Avenize-Complete-Architecture.md, not in scope of demo removal)
- e-Signature engine (Sign) — net new, no signing flow exists
- Property vertical — net new (records, owners/tenants, sales, leasing, inspection)
- Website Builder — net new
- Public Appointments — net new
- Customer-facing Live Chat — net new (existing chat is internal team chat)
- Vendor/PO workflow — net new
- i18n scaffolded but not applied across 60 pages
- Email/SMS/WhatsApp providers not live
- pg_net/pg_cron extensions need manual enable
- Trigger-based audit logging not built
- Real data export (current returns mock)

## Architecture & Build (verified, commit 735a612)

- **Stack:** Vite + React 19 + TypeScript, Tailwind v4, Supabase (Postgres + RLS + Edge Functions), no dedicated backend server — the SPA talks to Postgres directly via the Supabase SDK; RLS is the real authorization boundary.
- **Build/verify:** `npm install` → `npx tsc -b --noEmit` (typecheck) → `npx vite build` (production build). Both must pass before committing. No Postgres runtime in the dev container, so DB tests (`tests/database/*.sql`, pgTAP) and Playwright tests run in CI with a live Supabase.
- **RLS pattern:** business-scoped tables use `business_id = (SELECT business_id FROM public.get_current_staff())` where `get_current_staff()` (defined in `001_initial_schema.sql`) returns the current staff row via `auth.uid()`. Client-side `src/lib/permissions.ts` is UX gating only — never the security control.
- **Migrations:** `supabase/migrations/*.sql`, numbered `0NN_name.sql`. Use `\set ON_ERROR_STOP on`. `CREATE OR REPLACE FUNCTION` + `CREATE TABLE IF NOT EXISTS` for idempotency. `update_updated_at()` trigger helper lives in `007_automations.sql`.
- **Two parallel stock models:** `products` (has its own `stock` integer column) and `inventory` (separate table, no `product_id` FK). `stock_movements.inventory_id` FK→`inventory`. Update `products.stock` directly when receiving goods against a PO line that references `products`.
- **UI↔schema drift is the highest-risk defect class:** several pages (ElectronicSignatures, PublicAppointments) previously queried tables with no migration. When adding a page, confirm every `.from('table')` has a backing migration before shipping.

## Recent work (2026-08)

- Migrations `043_signatures_appointments_schema.sql`, `044_property_vertical_completion.sql`, `045_purchase_vendor_workflow.sql` added the signature/appointments/property-vertical/PO schemas that pages were referencing but missing.
- `ElectronicSignatures.tsx`: removed demo-data fallback; now does a joined `signature_requests`↔`signature_signers` query and a normalized two-step insert.
- `PublicAppointments.tsx`: replaced `Math.random()` slot "availability" with a real overlap query against `appointments`.
- `Services.tsx` (new): admin page to manage the service catalog the public booking page reads from.

## Session 2 (2026-08-09): property + procurement UIs, fake-data purge, drift backfill

- **New management UIs** (all real-DB, RLS-scoped, token design system):
  - `PropertyOwners.tsx` — CRUD owners with property-count join.
  - `PropertySales.tsx` — offers/closings tracker; creates approval-gated commissions (inserts `property_commissions` + linked `approvals` row so payouts are manager-approved before Finance pays).
  - `Vendors.tsx` — CRUD suppliers (contact, payment terms).
  - `PurchaseOrders.tsx` — multi-line PO creation (auto-fills from product record), draft→sent→received lifecycle, goods-receipt recording that triggers `apply_goods_receipt` (auto-bumps `received_quantity`, advances PO status, increments `products.stock`).
- **Fake-data purge:** `OwnerInsights.tsx` was entirely hardcoded mock (`SARAH_STATS`, `MODULE_USAGE`, `RECENT_ACTIVITY`, `PERFORMANCE`) — owner saw fabricated revenue/deal numbers. Rewrote to fetch real metrics (invoice revenue w/ MoM delta, deal/staff/property counts) and real activity from `audit_logs`. Sarah/Modules tabs now honestly state they need a dedicated analytics pipeline. `DocumentsHub.tsx` had the same demo-fallback anti-pattern masking the real `documents`/`document_folders` tables (038) — removed.
- **Migration 046 `046_missing_table_backfill.sql`:** defined 9 tables + 1 view that pages queried but no migration created, each reconciled with the exact columns the page uses:
  - `e_invoices` (FIRS e-invoicing), `chat_conversations`+`chat_messages` (LiveChat, with a trigger auto-maintaining `last_message`/`unread_count`), `payroll_records`, `training_records`, `sms_templates`, `jobs` (construction pipeline), `cashflow`, `settings` (key-value integration config), `avatars` storage bucket, and `approval_requests` **view** (compat layer over the 039 `approvals` engine).
- **Approvals page drift fix:** `approval_requests` was a phantom table name; the real engine table is `approvals` (039) with different column names. Created a compatibility VIEW (`current_level`←`current_step`, `type`←`entity_type`, `entity_name`←`description`, `requester`←joined staff name) + `INSTEAD OF UPDATE` trigger so the page works without duplicating the engine. Routed approve/reject writes from `approval_decisions` (017, requisition-only, wrong columns) to `approval_actions` (039, the engine's real action log).
- **Drift scan method:** `grep -rhoE "\.from\('[a-z_]+'\)" src/pages/*.tsx` → verify each has a backing `CREATE TABLE`/`CREATE VIEW` migration. Run this before shipping any page. Note: `supabase.storage.from('bucket')` is not a table — exclude storage buckets from the scan.

## Session 3 (2026-08-09): demo-mode purge, first-visit onboarding, payment routing

- **Demo mode fully removed.** The app had a `localStorage`-based demo mode (`avenize_demo` flag) that injected hardcoded fake staff ("Adebayo Johnson / TechBuild Nigeria Ltd") and fake data arrays (DEMO_CHANNELS, DEMO_MESSAGES with "Sarah Johnson"/"Michael Okonkwo") into 12 pages. Real users hitting Chat would see fabricated conversations. Removed: `handleDemoLogin` + "Try Demo Account" button from Login.tsx; demo initialization block from AuthContext.tsx (`isDemo` kept as `const [isDemo] = useState(false)` for type compat); demo early-return from App.tsx RequireAuth. AuthContext now clears stale demo flags on load. The 12 pages that still reference `isDemo` have dead branches (always `false`) — real DB queries now always run.
- **First-visit onboarding popups.** New `ToolOnboardingPopup` component + `useToolOnboarding` hook (`src/lib/useToolOnboarding.ts`). Shows a dismissible coachmark explaining each tool the first time a user visits it — one headline, one line of guidance, one suggested action. Tracks "seen" per tool in `localStorage` (`avenize_tool_onboarding`). Wired into Shell via the existing `TOOL_KEY_MAP` (route → toolKey). Covers 18 tools (dashboard, chat, tasks, calendar, crm, finance, meetings, etc.). This replaces the deleted demo page with contextual, per-tool guidance.
- **Payment routing fix.** Pricing.tsx used static Paystack Shop links (`https://paystack.shop/pay/scale-avenize`) that bypass subscription tracking. The app already has a `subscription-management` edge function with `createCheckout` that creates tracked Paystack transactions + records in `business_subscriptions`. Fixed: CTAs now route authenticated users to `/app/settings/subscription` (tracked checkout), new visitors to `/signup`. The in-app Subscription page already calls `createCheckout` correctly.
- **Chat.tsx verified clean:** real DB queries throughout (get_my_channels RPC → channels table fallback, messages with staff-name enrichment), realtime subscription to messages INSERT events with channel_id filter, proper empty states ("No messages yet", "Welcome to Avenize Chat"). Schema verified: channel_members uses `staff_id` (not `user_id`) — matches all inserts.
- **Payment infrastructure verified:** 5 plans (starter/team/business/pro/scale, ₦15k–₦380k/mo), Paystack integration in `subscription-management` edge function, `paystack-verify` + `flutterwave-initialize/verify` functions, `business_subscriptions` + `business_entitlements` tables, `useSubscriptionData` hook with DB-backed plans + createCheckout.
