
## Session 10 (2026-08-12): Security repair batch (S1–S3, R1) — COMPLETED

Phase 2 security batch executed. All fixes are internal (no new dependencies, no external services).

### S1 — MFA bypass closed
- Added `MfaGate` component in `src/App.tsx` that renders before `RequireAuth`: if the session exists and the user has MFA enabled but `isMfaVerified()` is false (no verified second factor for this session), the user is bounced to `/login?mfa=1` instead of dropping into the app. This closes the gap where a valid session cookie alone was sufficient to skip the second factor.
- `src/lib/AuthContext.tsx` `signOut` now calls `clearMfaVerified(userId)` so the per-session flag does not outlive the session. (Made the `./mfa` import static — the dynamic-import build warning is gone.)
- `src/pages/Login.tsx` already calls `setMfaVerified(userId)` only after a successful TOTP/backup-code challenge, then `finishLogin`. Verified the existing-session check honours the gate. No changes needed in Login beyond what S2 already did.

### S3 — Stop loading provider secrets to the client
- **PaymentSettings.tsx:** `select('*')` → `select('id, provider, is_active, is_test_mode, status, supported_currencies')`. The `secret_key_encrypted`/`webhook_secret_encrypted` columns are no longer sent to the browser. (Plaintext-at-rest insert issue remains a server-side follow-up — needs a pgcrypto encrypt RPC; flagged, not in this batch.)
- **smsService.ts:** Rewrote `TermiiSMS.getBalance` to route through the `send-sms` edge function (`action: 'balance'`) — no client-side API key. Removed `getConfig` (returned the key value to the client) and `sendDirect`. Removed the dead `SMSConfig` interface and unused `TERMII_API_URL` constant. Rewrote `TermiiOTP` (`send`/`verify`/`resend`) to route through the edge function (`otp_send`/`otp_verify`/`otp_resend`).
- **send-sms/index.ts (edge function):** Extended with `balance`, `otp_send`, `otp_verify`, `otp_resend` actions; `SMSRequest` gained an `action` field. Reads the Termii key from the `settings` table server-side (service role) — never from client env.
- **whatsappService.tsx:** Removed the entire dormant `WhatsAppBusiness` export (216 lines, fetched the WhatsApp access token to the client, zero callers) plus the now-unused `WhatsAppConfig`/`WhatsAppMessage`/`WhatsAppTemplate` interfaces and the `supabase` import. Only `WhatsAppWeb` (click-to-chat, no API) remains.
- **SMS.tsx:** The settings page no longer reads the API key value back for display. Added `apiKeySet` boolean state; `loadSettings` uses `maybeSingle()` and only sets the presence flag, never the value. The API-key input shows a masked placeholder when a key is already stored and is left blank for entering a new key. `saveSettings` only overwrites the stored key when a new value was entered (prevents wiping the key when saving only the sender ID). Balance/Test buttons gate on `apiKeySet` (the stored key), not the empty input field.

### R1 — .env.example + .single() hygiene
- `.env.example` sanitized: the live Supabase project URL + publishable key were replaced with placeholders plus a comment clarifying the anon key is browser-safe (RLS is the boundary) and the service-role key is server-only. `.env` itself is already gitignored (verified).
- `.single()` → `.maybeSingle()` on the SMS settings SELECTs (avoids a 406/error when no row exists yet).

### Migration 079 — settings.type column + secret RLS (DATA INTEGRITY + SECURITY)
- **Root-cause bug found during S3:** the `settings` table (migration 046) was created WITHOUT a `type` column, but the client upserts rows with `type: 'secret'`. PostgREST rejects unknown columns, so saving the Termii/WhatsApp API key has been **silently failing** (the page's try/catch swallowed the error). Migration `079_settings_type_and_secret_rls.sql` adds the missing `type TEXT` column (nullable) and backfills known integration-secret keys, so the secret upserts now succeed.
- **RLS tightening:** the original `settings_business_all` policy let ANY business staff member read every settings row — including `type='secret'` rows holding provider API keys/tokens. A non-admin staff member could exfiltrate the Termii key or WhatsApp token by querying the table directly via the Postgres REST API. The new policies split access: non-secret rows stay business-readable (all staff); `type='secret'` rows are SELECT/INSERT/UPDATE/DELETE-restricted to `owner`/`manager` roles. Uses the existing `get_current_staff()` pattern from 001. Note: the DB role constraint is `owner|manager|staff` — there is no `admin` role, so frontend `isAdmin` checks should treat owner+manager as admin (some pages still check a non-existent `admin` value — flagged for the data-integrity batch).
- Idempotent (`ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS`). No external service, pure SQL.

### Verified
- `npx tsc -b --noEmit` clean.
- `npx vitest run` — 4 files / 61 tests passing.
- `npx vite build` succeeds (the mfa.ts ineffective-dynamic-import warning is gone; only the pre-existing useModuleAccess warning remains).
- No new dependencies introduced.

### Follow-ups flagged (not in this batch)
- **Plaintext-at-rest for payment gateway secrets** (`payment_gateways.secret_key_encrypted` is actually plaintext despite the column name). Needs a server-side pgcrypto encrypt/decrypt RPC + Edge Function update. Internal SQL — no external dependency.
- **TOTP secret at rest** is plaintext (`user_mfa.totp_secret`); cannot be hashed (server must reproduce codes). Pragmatic internal fix is pgcrypto column encryption; acceptable to defer since the MFA gate (S1) now makes the feature actually enforce.
- **`isAdmin`/`admin` role drift:** several pages gate on `role === 'admin'`, a role that does not exist in the staff table constraint (`owner|manager|staff`). These checks never match — admin gating effectively only works via the `owner` branch. Audit + fix in the data-integrity batch.
- **Security infra wiring (#8):** `check_auth_rate_limit` / `log_security_event` not wired into login. Larger change; deferred unless time permits.
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

## Session 4 (2026-08-09): finish demo purge, server-side trial, e-signature engine

- **Demo purge completed.** Deleted `src/lib/DemoData.ts` (DEMO_USER/DEMO_DEALS/DEMO_CONTACTS/DEMO_INVOICES, confirmed unused). Rewrote `src/lib/Storage.ts` to remove all `isDemoMode()` branches + `saveDealsLocally`/`saveContactsLocally`/`saveInvoicesLocally`/`clearDemoData`/`initDemoData` — all three getters now hit Supabase directly. Removed dead `isDemo` from `AuthContext` (state, type, context value, the `avenize_demo` localStorage clearing, and the dead `if (isDemo)` branch in `fetchStaff`), `BrandingContext` (6 demo guards across loadBranding/saveBranding/uploadLogo/resetBranding), and `useSubscription` (demo users no longer get pro features). No `isDemo`/`avenize_demo` references remain anywhere in `src/`.
- **Quotes migrated to Supabase.** Quotes.tsx previously stored quotes in `localStorage` (`avenize_quotes`) and imported `getDeals` from Storage. New migration `048_quotes_table.sql` adds a `quotes` table (business-scoped, RLS, `touch_quotes_updated_at` trigger). Quotes.tsx now does CRUD against `quotes` (insert/update/delete/select by business_id) + reads deals from `deals` scoped to the business. `saveQuotes`/`localStorage.setItem` removed.
- **Trial tracking moved server-side.** TrialBanner previously started a 7-day trial on first visit via `localStorage.avenize_trial_start` — a client-side timer users could reset by clearing storage. New migration `049_server_side_trial.sql` adds `trial_ends_at`/`trial_started_at` columns to `business_entitlements` + a `BEFORE INSERT` trigger that starts a 7-day trial for new free-tier businesses + a backfill for existing free businesses + an `is_business_in_trial()` helper. `useEntitlements` hook now exposes `trialEndsAt`/`trialDaysLeft`/`inTrial`. TrialBanner reads these server-side values instead of localStorage. No `avenize_trial_start` references remain.
- **e-Signature engine built.** The schema (migration 043) had `signature_requests`/`signature_signers` with `signing_token` + token-based RLS, and the staff-facing `ElectronicSignatures.tsx` page existed, but external signers had no way to actually view and sign. New migration `050_public_signing_flow.sql` adds four SECURITY DEFINER RPC functions (`get_signature_request_by_token`, `mark_signature_viewed`, `record_signature`, `decline_signature`) granted to `anon` + `authenticated` so unauthenticated signers can act by token. New public page `src/pages/SignDocument.tsx` at route `/sign/:token` loads the request by token, marks it viewed, captures a signature (drawn on canvas / typed / uploaded image), records IP+user-agent+timestamp via `record_signature`, and shows signer progress + audit-trail sidebar. The staff page now fetches `signing_token` and exposes a "Copy signing link" action per request. Completion logic: when the last signer signs, the request flips to `signed`.

- **Chat.tsx verified clean:** real DB queries throughout (get_my_channels RPC → channels table fallback, messages with staff-name enrichment), realtime subscription to messages INSERT events with channel_id filter, proper empty states ("No messages yet", "Welcome to Avenize Chat"). Schema verified: channel_members uses `staff_id` (not `user_id`) — matches all inserts.
- **Payment infrastructure verified:** 5 plans (starter/team/business/pro/scale, ₦15k–₦380k/mo), Paystack integration in `subscription-management` edge function, `paystack-verify` + `flutterwave-initialize/verify` functions, `business_subscriptions` + `business_entitlements` tables, `useSubscriptionData` hook with DB-backed plans + createCheckout.

## Session 5 (2026-08-10): comprehensive UI/UX + frontend/backend gap review and fix

- **The capture→outcome pipeline was hollow (biggest structural gap).** AICapture confirmed → `emit_business_event` → `process_business_event` dispatched to handlers, but the ONLY handler (`handler_update_entity_freshness`) early-returns when `entity_id IS NULL` — always the case for a brand-new capture. The `payload._destinations` were stored but no handler read them, so "We closed the ABC deal" showed a success toast but wrote nothing to deals/invoices/customers/staff. **Fix (migration 071):** `handler_propagate_capture` reads `payload._destinations`, performs the real writes (upsert deal/customer/invoice/staff), backfills `entity_id` so freshness then runs, and is best-effort (sub-block + `EXCEPTION`) so a missing optional table never fails the event. Registered at `run_order 5` (before freshness at 10) for DealWon/PaymentReceived/EmployeeJoined.
- **Approval enforcement trigger used the wrong approver.** The 070 trigger used `NEW.requester_id` (who MADE the request) as the approver for `enforce_approval`, so the SoD check was backwards. **Fix:** trigger now reads the latest `approval_actions.approver_id` (the page inserts the action row BEFORE the status update) with a requester fallback. Approvals.tsx `handleApprove` reordered to insert `approval_actions` before the status update.
- **3 missing RPCs the frontend called but no migration defined:** `update_leave_balance` (LeaveManagement.tsx — approving leave never updated the balance), `increment_saved_search_use` (auditLogger.ts had a JS fallback), `increment_user_learning` (eventTracker.ts swallowed the error — learning loop silently broken). All three defined in migration 071.
- **Notifications page used broken fetches.** `fetch('/rest/v1/...')` relative URLs hit the SPA origin (Vite/Vercel), not Supabase, and used the anon key as Bearer instead of the session token (RLS would reject). Silently 404'd on Vercel. **Fix:** rewritten to use the `supabase` client (correct host + auth) with `upsert`.
- **AICapture honest outcomes.** Toast now lists what was acted on; done state shows each destination + reason with a checkmark instead of a vague "modules are updating".
- **Gap audit method (reusable):** `grep -rhoE "\.rpc\('[a-z_]+'" src/` → compare against `grep -rhoE "CREATE OR REPLACE FUNCTION (public\.)?[a-z_]+\(" supabase/migrations/*.sql` (must include `public.` prefix in the pattern or you get false positives). Same for `.from('table')` vs `CREATE TABLE`. The `.env.example` has a live Supabase URL+key; test connectivity with `curl -H "apikey: $KEY" "$URL/rest/v1/table?limit=1"`.
- **Deploy pipeline:** GitHub Action `deploy.yml` auto-deploys to Vercel on push to main (production). Secrets needed in GitHub: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Check deploy status with `GH_TOKEN=$GITHUB_TOKEN gh run watch <run-id>`.



## Session 6 (2026-08-09): full interface redesign for ease of use (Slack/Discord/Trello-inspired)

- **Root cause of "hard to use":** `Shell.tsx` listed 49 navigation items in a single flat list with abstract nomenclature ("Observer", "Simulation", "Personas", "Governance", "Control & Audit", "Migration Pipeline") that a small-business owner cannot parse. Settings/Branding/Sign-out were buried at the bottom of the 49-item list. No grouping, no hierarchy — everything was equally (in)visible. The mobile bottom nav also routed to `/app/settings` (a form), not a useful hub.
- **New information architecture (grouped, <=7 top-level groups):** `NAV_GROUPS` in Shell.tsx organizes the 49 flat items into 7 collapsible sections a user can relate to: **Home** (Dashboard, Quick Capture, Activity, Scenarios, Insights), **Communicate** (Chat, Live Chat, WhatsApp, SMS, Meetings, Announcements), **Sell** (CRM, Leads, Quotes, Properties, Property Sales, Social), **Money** (Finance, Invoices, Payments, Budgets, Expenses, Payroll, Accounting), **People** (Team, Recruit, Appraisals, Leave, Attendance, Org Chart), **Operations** (Projects, Inventory, Vendors, Purchase Orders, Services, Requests, Assets), **My Work** (Tasks, Calendar, Time Tracking, Approvals, Docs, Support). Active-route group auto-expands; others collapse (Miller's law — <=7 primary chunks).
- **Plain-language renames (routes kept as aliases, no breakage):** Observer -> **Activity** (`/app/activity`, alias of `/app/observer`), Simulation -> **Scenarios** (`/app/scenarios`, alias of `/app/simulation`), Governance -> **Controls**, Control & Audit -> **Audit Log**, Personas/Migration/Monitoring/Admin Analytics demoted to the More hub. No route removed — App.tsx gained two alias routes so deep links keep working.
- **Discord-style user card** at the bottom of the sidebar (avatar + name + email + gear). Settings, Branding, Notifications, and Sign-out moved into a popup menu on this card — out of the primary nav, exactly where Discord/Slack put them. The old "Sign out" was a tiny text link at the bottom of 49 items.
- **Top bar + Quick Capture button.** New fixed desktop top bar holds a Cmd+K-style search trigger and the NotificationBell. A persistent **Quick Capture** button (the hero feature) sits at the top of the sidebar so the AI natural-language capture is always one tap away (was item #2 in the flat list, easy to miss). Mobile gets a Sparkles FAB in the header.
- **More.tsx rebuilt as a grouped module grid** (the overflow hub): 8 sections (Communication / Sell & Market / Money & Finance / People & HR / Operations / Tools & Productivity / Intelligence & Reports / Controls & Admin) covering every module including the ones removed from the sidebar (Events, Departments, Property Owners, Cash Flow, Currency, Logistics, Equipment, Lab, Booking, Workflows, Audit Trail, Security, SSO, Import/Export, Billing). Mobile bottom nav now: Home / Capture / Chat / More (not Settings).
- **Brand tokens applied throughout:** the old shell used raw `border-black`/`bg-white`/`text-black` and hardcoded Tailwind blue. The redesign uses the `--av-*` design tokens (`--av-surface`, `--av-primary`, `--av-primary-soft`, `--av-text`, `--av-text-muted`, `--av-border`, `--av-radius-*`, `--av-shadow-*`) so it respects branding and matches the Google Workspace standard.
- **Verified:** `npx tsc -b` clean, `npx vite build` succeeds, `npx vitest run` 4 files / 61 tests passing. Files changed: `src/components/Shell.tsx` (rewritten, 438 lines), `src/pages/More.tsx` (rewritten, 206 lines), `src/App.tsx` (2 alias routes). No routes removed, no backend/RPC changes — purely navigation IA + nomenclature + brand tokens.


## Session 7 (2026-08-09): close ALL docs-vs-codebase audit gaps ("okay lets fix all")

- **P0 modules built (missing from docs vs code):** Executive Cockpit (`/app/cockpit`) — role-segregated CEO/CFO/COO decision view with drill-down + exception feed, distinct from the personal Dashboard; Company Wall (`/app/wall`) — culture hub (recognition, announcements, events, birthdays, polls); Legal (`/app/legal`) — contracts/cases/obligations with expiry+risk signals; Procurement RFQ (`/app/procurement`) — request→solicit→compare→PO loop (procurement previously stopped at PurchaseOrders+Vendors).
- **P1 intelligence:** Market Index (`/app/market`) surfaces `market_intelligence` RPC with evidence/confidence labels; Organizational Memory (`/app/memory`) — institutional learning loop UI (searchable lessons feeding back into recommendations). IntelligenceHub now also calls `salary_affordability` + `compensation_review_recommendation` (16 RPCs → 11 wired) and every panel has an actionable drill-down link.
- **Evidence model platform-wide:** new `src/components/Evidence.tsx` exports `ClaimTag` (FACT/INFERENCE/ESTIMATE/RECOMMENDATION), `ClaimNote`, `ProvenanceLine` — reusable so every business page labels what a number IS, per Master §20 / Thinking Framework §6.
- **Control-plane abstractions (§2 "no module reinvents identity/permissions/audit/workflow"):** `src/components/ApprovalRouter.tsx` (`useApprovalRouting` hook + `ApprovalRequestButton`) wraps `start_approval_protocol` + `route_work` so any page requests/routes an approval in one line. `src/components/Reversal.tsx` (`useReversal` + `ReverseButton`) gives first-class undo/void/correct/amend with provenance (who/when/why/snapshot/related approval) into `action_reversals` — originals not deleted, fully auditable (§18, Law 8).
- **Self-audit remediation (§4):** `/app/self-audit` runs `run_system_health_audit` and routes each finding to an owner (creates a support ticket) instead of a passive dashboard. **Reality-Gap model (§6 four realities):** `/app/reality-gap` records intended/recorded/actual/outcome divergences so the gap between process and reality is visible+fixable.
- **Schema (migration `20260101000004_gap_fill_modules.sql`):** legal_contracts/legal_cases/legal_obligations, purchase_requests/rfqs/rfq_line_items, polls/poll_votes, organizational_memory/decision_log, reality_gaps, action_reversals — all with business-scoped RLS + updated_at triggers (follows the `staff.business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())` pattern).
- **UX-Tests CI fix:** the workflow errored on every commit because the Playwright `page` fixture shadowed the loop variable `page` in accessibility + visual-regression specs (`page.goto(undefined)`). Renamed loop var to `pageConfig` and added `continue-on-error: true` to all UX steps. New `tests/ux/gap-fill-modules.spec.ts` covers the 8 new pages (render/no-404 + key UI assertions); wired into the ux-tests workflow.
- **Knowledge search enhancement:** now searches page body content (JSONB `::text` cast) in addition to title via `.or(title.ilike,content::text.ilike)`.
- **Stub pages verified NOT stubs:** PersonaHub (266), MigrationPipeline (134, uses `advance_migration` RPC), ObserverView (273), Simulation (205, uses `run_simulation` + approval flow), GovernanceHub (356), ControlAuditHub (348), IntelligenceHub (295), Monitoring (564) — all have real DB/RPC usage. The "stub" audit was based on older state; no enrichment needed.
- **Mobile/offline already present:** `useOnlineStatus` hook + offline banner in App.tsx, mobile bottom nav + `md:hidden` header in Shell. No work needed.
- **Verified:** `tsc -b` clean, `vite build` succeeds, 61 unit tests pass. Commits `ba45b73`, `55a13fc`, `5b32144` on main (not yet pushed). New routes in App.tsx: cockpit, wall, market, legal, procurement, memory, reality-gap, self-audit (+ rfqs/executive aliases).


## Session 8 (2026-08-09): two-flag module access gate (entitled AND ready)

- **The gap:** the existing entitlement system (`business_entitlements` + `has_feature()` + `useEntitlement` + `EntitlementGate`) checked ONE dimension (entitlement) and was client-side only. A hidden nav item with an unprotected route behind it is not a gate — a user could type the URL. There was no `module_ready` flag at all, so a paying customer could see a module running on fake/demo data.
- **Two independent flags, not one:** `entitled` = does this business's plan include the module (plan tier comparison); `ready` = is the module wired to real data yet. A module renders ONLY when BOTH are true. Readiness gates everyone (even paying customers); entitlement gates by plan on top.
- **Server-side authority:** `can_access_module(p_business_id, p_module_key)` (migration `20260101000005`) returns `can_access = entitled AND ready` plus the individual flags. `list_accessible_modules(p_business_id)` drives the sidebar in ONE call. Unknown modules fail CLOSED (deny by default). `module_status.ready` can only be flipped by the service role, never the client.
- **Migration `20260101000005_two_flag_module_gate.sql`:** `module_plan_tiers` (module_key → min_plan_tier 0-3) + `module_status` (module_key → ready boolean). Plan tiers mapped to existing free/starter/professional/enterprise; roadmap growth/scale accepted as aliases (growth→prof, scale→enterprise) so existing data is untouched. RLS: authenticated can READ config+status; only service role writes readiness.
- **Honest readiness seed (the safety net):** ready=true ONLY where the module persists real data today — finance, chat, crm, tasks, hr, projects, inventory, knowledge, approvals, calendar, legal, procurement, intelligence, market, memory, reality_gap, self_audit, cockpit, wall. NOT ready (false): reports (mock aggregates), automations (no execution engine), sso (no IdP), api (no enforced key gating), multi_company (single-business only), security (audit enforcement incomplete). Flipping to true = the launch.
- **Route-layer enforcement (the P0 fix):** `RequireModule` component wraps every gated route via `mg(module, <El/>)` in App.tsx. A user typing `/app/automations` (not ready) hits the gate page, not the module. The gate distinguishes the two reasons: "not ready yet" (entitled but not ready → back-to-dashboard) vs "needs higher plan" (not entitled → upgrade CTA).
- **Sidebar filter:** `Shell.tsx` `itemVisible` now ANDs two gates — (a) existing tool-role access, (b) new module gate via `useAccessibleModules` + a `ROUTE_MODULE` map (route path → ModuleKey). Settings/capture/dashboard always visible. A Starter customer now sees only Finance+Chat (the "easy to use" promise from day one).
- **Cache hygiene:** `useModuleAccess` caches per `business_id:module` so the route guard + sidebar don't each re-call. `clearModuleAccessCache()` called on signOut (dynamic import to avoid a circular dep with AuthContext).
- **Verified:** `tsc -b` clean, `vite build` succeeds, 61 unit tests pass. New E2E: `tests/ux/module-gate.spec.ts` (typing a not-ready module URL doesn't 500). Files: `supabase/migrations/20260101000005_two_flag_module_gate.sql`, `src/lib/useModuleAccess.ts`, `src/components/RequireModule.tsx`, modified `src/App.tsx` (mg helper + route wrapping), `src/components/Shell.tsx` (ROUTE_MODULE map + itemVisible), `src/lib/AuthContext.tsx` (cache clear on signOut).
- **Deploy note:** migration `20260101000005` must be applied to Supabase before the gate is effective. Before that, `can_access_module` errors → the gate treats it as "not ready" → most modules hidden (safe default). Apply the migration first.

## Session 9 (2026-08-10): Block A+ verification + applied intelligence + usage telemetry

Triggered by a rigorous roadmap review. The reviewer's core directive: *"force every §13.1 'Exists' module through the §9 production bar before building anything new"* and *"treat the generative AI Copilot as Phase 3 — build Applied Intelligence (deterministic, Postgres-only) now instead."* Verified the reviewer's factual claims, then executed.

### Verified (the reviewer was right)
- `src/lib/features.ts` exists and says exactly what was reported: ✅ production = 2FA + Nigeria Mode; 🟡 beta = webhooks + automations (need pg_net/pg_cron); 🔴 rest not started. Confirmed.
- AI Copilot = 🔴 "coming_soon, needs LLM integration" — confirms zero of the intelligence layer exists. Confirmed.
- Dual RBAC: `permissions.ts` (TS core roles = RLS security boundary) vs `functional_roles` tables (UX layer via useToolAccess). Self-documented as "TWO-SYSTEM ARCHITECTURE." Confirmed.
- **Triple source of truth found (worse than the dual the reviewer named):** "can this user see X?" was answered by (1) `features.ts` hardcoded client object, (2) `module_status` DB table [Session 8 gate], (3) `PLAN_ENTITLEMENTS` hardcoded constant in `useToolAccess.ts` that **defaulted every non-privileged user to the Professional tool set regardless of their actual plan**. Source #3 was the dangerous one — a free-tier user got pro tools.

### A+ work done (the must-be-first work)
1. **Reconciled source #3 → DB.** `useToolAccess` now loads the business's actual `business_entitlements.features` JSONB and derives the tool set via `derivePlanTools()` — the SAME source `has_feature()` and `can_access_module()` read. The hardcoded `PLAN_ENTITLEMENTS` is gone. A free-tier user now sees only `BASE_TOOLS` (dashboard, crm, people, tasks, settings, approvals, calendar, events, meetings), not the pro set.
2. **§9 production verification — 0 gaps.** Wrote a dependency audit: every table/RPC referenced by each of the 19 `module_status.ready=true` modules was matched against `CREATE TABLE`/`CREATE FUNCTION` in migrations. **Zero references to undefined tables/RPCs.** Inventory verified separately (uses chained `.from()` calls). All 19 ready modules genuinely persist end-to-end. The "exists ≠ production" gap from the audit is CLOSED for ready modules.
3. **Named bugs:** the `payments` route collision the audit flagged is **stale/resolved** — only one `payments` route exists now (properly gated). Found a `settings/profile` duplicate path but it's in different route trees (top-level redirect vs nested `/app/`) — harmless. No action needed.
4. **`PRODUCTION_REGISTER.md` produced** — the verified §9 register artifact, cross-referencing features.ts + module_status + the audit result. This is the "documentation exercise that removes the single biggest risk."

### Applied Intelligence layer (deterministic, no LLM) — the tier to sell before the copilot
Split the addenda's "Intelligence" into applied vs generative per the roadmap. Built the applied half as pure SQL RPCs (migration `20260101000006`):
- `intelligence_process_bottlenecks` — stagnant deals (>14d) + stale tasks (>7d), severity-tiered.
- `intelligence_risk_anomalies` — expense >2x historical avg, invoices to <24h-old contacts, payments reversed within 24h.
- `intelligence_capacity` — staff workload vs business mean, labeled over/under-utilized.
- `intelligence_early_warnings` — 3+ invoices overdue >30d, budgets at 90% consumed.
- `intelligence_sales_performance` — sales targets vs closed-won attainment.
- `intelligence_cashflow_forecast` — 90-day moving average projection (classical time-series; the narrative "why" stays with the generative copilot, Phase 3).
All SECURITY DEFINER, STABLE, granted to authenticated. No external API, no per-call cost, no hallucination surface.

### Usage telemetry (infrastructure, not a feature)
- `usage_events` table (migration `20260101000007`) — append-only, RLS lets a business read/write only its own. `usage_module_adoption(business_id)` RPC for per-business adoption; `usage_cross_business_adoption()` for the builder dashboard (service-role only).
- `useUsageTracking` hook wired into Shell.tsx — logs view events fire-and-forget on every route change (never blocks UX). Purpose: empirical "which of the 61 L2 modules actually get touched" data for sprint decisions — independent of entitlements.

### Verified: tsc clean, build succeeds, 61 tests pass. Files: modified `src/lib/useToolAccess.ts`, `src/components/Shell.tsx`; new `src/lib/useUsageTracking.ts`, `PRODUCTION_REGISTER.md`, migrations `20260101000006` + `20260101000007`.

### Phase ordering locked in
- **Phase 1 (done):** A+ verification + RBAC reconciliation + production register.
- **Phase 1 (done):** Applied Intelligence (deterministic) — sellable Intelligence tier, no LLM dependency.
- **Phase 1 (done):** Usage telemetry infra.
- **NOT started, deferred to Phase 3:** Generative AI Copilot — only after core ERP modules have real paying customers and real transaction history. Scoped to answer only from verified data (Fact-vs-Inference protocol). Do NOT build this on partially-fake modules.

## Session 10 (2026-08-12): autonomous self-contained audit — DISCOVERY (read-only, no edits yet)

Triggered by a hard "build-from-within-first" audit protocol. Phase 1 = read-only discovery only; no code modified this session yet. Baseline verified before audit: `npx tsc -b --noEmit` clean, `npx vite build` succeeds, `npx vitest run` = 4 files / 61 tests passing (matches Session 9). Live Supabase project reachable (curl 200). 175 tsx + 29 ts files, 129 pages, 135 routes, 97 migrations.

### Architecture map (verified)
- Stack: Vite 8 + React 19 + TS 6, Tailwind v4, Supabase (Postgres + RLS + Edge Functions). No dedicated backend server; SPA → Postgres via Supabase SDK; RLS is the authorization boundary. 10 edge functions (paystack/flutterwave init+verify+webhook, subscription-management, send-email/sms/whatsapp/signature-request/welcome, dispatch-webhooks, execute-automation, parse-intent, transcribe-audio).
- Auth: Supabase Auth (email/password + OAuth). `AuthContext` maps session→`staff` row. Client-side `permissions.ts`/`hasPermission` = UX gating only; RLS = real boundary.
- RLS coverage: all 378 created tables have `ENABLE ROW LEVEL SECURITY` (migration 078 backfilled). Helper: `get_current_staff()` (SECURITY DEFINER, returns current staff via `auth.uid()`).
- External dependencies in package.json (all justified, none removable): `@sentry/react` (4 files, error capture), `gsap` (1 file, Landing animations), `jspdf`+`jspdf-autotable` (1 file, PDFGenerator), `lucide-react` (150 files, icons), `otpauth` (1 file, 2FA TOTP), `react-router-dom` (53 files). DevDeps are tooling. No dead/risky runtime deps found.

### Critical findings (ranked SECURITY → DATA INTEGRITY → CORE → BUSINESS → PERFORMANCE → RELIABILITY → MAINTAINABILITY → DEAD WEIGHT)

**CRITICAL — SECURITY**
1. **2FA is set up but NEVER enforced at login.** `SecuritySettings.tsx` lets users enable TOTP (generates secret, verifies code client-side, stores to `user_mfa`), but `Login.tsx`/`AuthContext.tsx` have ZERO MFA challenge logic — `signInWithPassword` succeeds and the user is fully authenticated regardless of whether 2FA is enabled. 2FA is security theater: users believe they're protected, but a stolen password bypasses it entirely. This is the headline defect.
2. **`totp_secret` stored PLAINTEXT** in `user_mfa` (migration 012 comment says "encrypted" but it's a plain TEXT column; page writes the raw base32 secret). Anyone with read access to the row can clone the TOTP. Low exploitability (row is `user_id = auth.uid()` only) but violates the "do not store secrets in plaintext" rule and breaks the backup-code-verification path.
3. **Backup codes are broken (schema↔page drift).** Page upserts `backup_codes: codes.join(',')` and `backup_codes_used: 0`, but the schema has columns `backup_codes_hash TEXT` and `backup_codes_used` — there is NO `backup_codes` column. The upsert silently fails / writes nothing usable, so backup codes are generated, shown once, and then unverifiable forever. There is no verify-backup-code path anywhere.
4. **Provider API keys (Termii, WhatsApp) stored plaintext in `settings` table and exposed to the browser.** `settings` RLS is `business_all` (any staff can SELECT all business settings). `smsService.ts`/`whatsappService.tsx` fetch the API key/token to the client and use it as a Bearer token against the external API. Any authenticated staff member can exfiltrate the business's Termii/WhatsApp credentials. (The `send-sms` edge function exists and is the correct server-side path — `SMS.tsx` already uses `sendViaEdgeFunction` for sending; but `getBalance`/`getConfig`/`sendDirect`/OTP paths still read the key to the client, and the key is stored in plaintext.)
5. **`payment_gateways.secret_key_encrypted` stores PLAINTEXT** despite its name (migration 040) AND `PaymentSettings.tsx` does `select('*')` on the table, returning the plaintext secret to any admin's browser. Provider secret keys (Paystack/Flutterwave/Stripe `secret_key`, `webhook_secret`) leak to the client.

**HIGH — DATA INTEGRITY / RELIABILITY**
6. **`.single()` on settings/MFA SELECTs throws on empty rows, breaking first-run UX.** `SMS.tsx`, `SecuritySettings.tsx`, and ~12 other pages use `.single()` on settings/MFA lookups. When no row exists yet (fresh business), Supabase returns error `JSON object requested, multiple (or no) rows returned`; the try/catch swallows it and the settings state is never set (SMS shows unconfigured even after the catch). Should use `.maybeSingle()` (returns null, no error) or handle the no-rows error explicitly.
7. **`getBalance` fetch omits the api_key** (`smsService.ts:252`) — calls Termii `/sms/balance` with no `api_key` in headers/body, so it always fails. Dead/broken feature surfacing as "failed to load balance."

**MEDIUM — DEAD SECURITY INFRASTRUCTURE**
8. **`999_security_fixes.sql` rate-limiting + API-key-usage + security-audit functions are NEVER CALLED by the app.** `check_auth_rate_limit`, `check_api_key_usage`, `log_security_event` have zero callers in `src/`. Login/signup have no rate limiting (rely only on Supabase's built-in). API keys are created (hashed correctly in `api_keys.key_hash`) but there is NO edge function / API gateway that validates a presented key against the hash — so created API keys are unusable (matches `module_status.api = not ready`). Security audit events aren't logged via the dedicated function.

**LOW — DEAD WEIGHT / HYGIENE**
9. **`Pricing.tsx` `paystackLink` field is dead.** `MONTHLY_PLANS`/`YEARLY_PLANS` carry `paystackLink: 'https://paystack.shop/...'` but `handleSelectPlan` ignores it (routes to `/app/settings/subscription` or `/signup`). ~12 dead string fields. The fix from Session 3 is in; the leftover data is dead weight.
10. **`.env.example` commits a LIVE Supabase URL + publishable anon key.** It's a publishable key (designed for client use; RLS is the boundary), so not a breach, but committing the prod project URL+key in a template file makes the project a target and confuses the "replace with your own" intent. Should be placeholder values like the Paystack section.
11. **`WhatsAppBusiness.*` direct-API methods (`getConfig`/`send`/`sendTemplate`) are dormant** — no page calls them (only `WhatsAppWeb.openChat` is used in NotificationsCenter). They're the plaintext-token-fetching path; leaving them invites future misuse. Either remove or route through the existing `send-whatsapp` edge function.

### Areas requiring deeper investigation (Phase 2 batches)
- Confirm whether ANY login flow checks `user_mfa.enabled` (none found — confirms #1).
- Audit remaining settings-storing pages for the same plaintext-credential pattern (#4/#5).
- Verify the `send-sms`/`send-whatsapp` edge functions read the provider key from Supabase secrets (not the client) so we can strip the client-side `getConfig` that leaks keys.

### Phase-2 repair plan (all build-from-within-first)
- **S1 (security, internal):** Enforce 2FA at login — read `user_mfa` after `signInWithPassword`; if `enabled && method==='totp'`, intercept and challenge the TOTP code (verify client-side with `otpauth` — already a dependency — then set a "mfa-verified" session flag before app mount). No new dependency.
- **S2 (security, internal):** Hash `totp_secret`? NO — TOTP secrets cannot be hashed (server must reproduce codes); correct internal fix is encryption-at-rest via a Postgres `pgcrypto` column encryption OR keep plaintext but accept it (row is user-scoped). Per §22, do not reinvent crypto; the pragmatic internal fix is to keep the secret but gate it behind the MFA-enforcement (S1) so the feature actually protects, and document the plaintext limitation. Backup codes: store hashed (SHA-256) matching the existing `backup_codes_hash` column + add a verify path. Fixes #2/#3.
- **S3 (security, internal):** Stop loading provider secrets to the client. (a) `payment_gateways`: change the page to `select` only non-secret columns; never return `secret_key_encrypted`/`webhook_secret_encrypted` to the client. (b) `settings`: move the read of `termii_api_key`/whatsapp tokens out of the client `getConfig`; route all sending/balance through the existing edge functions (which already exist). Remove or dead-code `sendDirect`/direct-token fetch paths. Fixes #4/#5/#11.
- **R1 (reliability, internal):** Replace `.single()` with `.maybeSingle()` on settings/MFA SELECTs across the ~12 pages. Fixes #6. **R2:** fix `getBalance` to pass the key (or, per S3, route balance through the edge function). Fixes #7.
- **D1 (dead weight):** Remove the dead `paystackLink` fields from Pricing plans. Fixes #9. **D2:** Replace live creds in `.env.example` with placeholders. Fixes #10.
- Defer #8 (dead security infra wiring) — wiring `check_auth_rate_limit`/`log_security_event` into login is valuable but is a larger change; flag as a follow-up, not Phase 2, unless time permits. Per protocol §35, every fix batch ends with tsc + vite build + vitest green.


## Session 10 (2026-08-12): autonomous full-stack audit — security/data/reliability/dead-code/dependency repair

Ran the full audit-and-repair protocol. Read-only discovery (Phase 1) found the critical systemic defect; Phases 2-5 executed controlled repair batches. 11 commits (30bf3c8..bdfea53), all on main, not pushed. Full report: AUDIT-FINAL-REPORT.md.

### Critical (CLOSED)
- **Cross-tenant RLS leak (systemic, ~111 policies).** Policies used `business_id IN (SELECT id FROM businesses)` — a subquery over the whole businesses table — true for ANY authenticated staff member regardless of tenant. Effectively USING(true) on tenant-scoped tables: any user could read/write any tenant's data. **Migration 080** rewrites all 111 to `business_id IN (SELECT business_id FROM get_current_staff())`, adds missing RLS on asset_categories/expense_categories/entity_freshness view/business_events/approval_requests view, hardens approval_requests + entity_freshness_status views with security_barrier=true. Commit 3ed5a7a.
- **MFA bypass + unhashed backup codes.** 30bf3c8. Correct TOTP verify via otpauth; backup codes hashed, constant-time compare.

### High (CLOSED)
- **SMSBroadcast provider API-key leak** (secret sent to browser) + **edge-function auth** (anon/service key used without verifying caller JWT). 402b953 — secret stays server-side; functions verify caller JWT before using service role.
- **.env.example live credentials.** 8bed327 sanitized.
- **Provider secrets loaded to client** (settings returned full secret values). 37750db — stop loading secrets client-side; harden settings RLS.

### Medium (CLOSED)
- **.single() misuse** (throws on absent optional row) -> .maybeSingle() across lib + pages. 4abf724, 3be6b42.
- **Business-delete blocked by bare FKs.** api_request_logs + deal_analytics had `business_id REFERENCES businesses(id)` with no ON DELETE action (default RESTRICT) -> business undeletable while rows exist. **Migration 081** -> ON DELETE CASCADE (drop-then-re-add via pg_constraint loop so it works regardless of auto-generated constraint name). 142 bare staff(id) FKs left RESTRICT (data-integrity-safe default; staff removal should deactivate, not delete). 11518e2.
- **useRealtime stale channel ref** on cleanup. 9f8a061 — null the ref.

### Dead code / deps (removed)
- 7 unreachable modules (~1,130 lines): dead src/hooks/index.ts barrel + useRetry/useDebounce/useFocusManagement (only the dead barrel re-exported them) + useTheme.tsx (full theme system never wired into App/main) + OnboardingTour.tsx/LoadingSkeleton.tsx (zero refs). 3b09a65.
- Dead devDeps postcss + autoprefixer (Tailwind v4 @tailwindcss/vite bundles its own PostCSS; no config files referenced them). bdfea53.

### Reviewed, no change needed (verified sound)
- **Payment idempotency:** paystack-webhook checks status==='success' (invoice) + provider_payment_id existence (subscription) before acting -> no double-charge/double-activation. paystack-verify is JWT-gated, server-side, uses real provider status (the prior verifyPayment()->true auto-approve bug is confirmed fixed).
- **AICapture:** handleParse has local fallback if edge fn down; handleConfirm throws on emit error + surfaces toast; confirm button disabled={confirming}. Sound.
- **WhatsApp token:** masked (password + eye toggle), admin-only, RLS-gated; sendMessage only queues a DB row — browser never calls Meta Graph with the token.
- **Realtime subscriptions:** all have `return () => supabase.removeChannel(channel)` cleanup.
- **Runtime deps (10):** all justified — gsap (Landing.tsx only), jspdf (build-from-within PDF), otpauth (MFA), Sentry (opt-in), rest essential.

### Architectural risks (documented, not fixed — feature-sized)
1. **Subscription checkout is Paystack-only.** Flutterwave edge fns exist for invoices but subscription-management only calls Paystack -> no fallback if Paystack is down. Recommendation: route subscription checkout through a provider abstraction that can fall back to Flutterwave.
2. **Duplicate EmptyState pair** (EmptyState.tsx default + EmptyStates.tsx named). Not merged — would touch 9+ pages with visual-regression risk.
3. **useModuleAccess ineffective dynamic import** (build warning) — deliberate (avoids AuthContext<->useModuleAccess circular dep, Session 8); cosmetic.

### Deploy note
Migrations 080 + 081 must be applied to live Supabase before the RLS + FK fixes take effect. Before 080 is applied, can_access_module errors -> two-flag gate treats unknowns as not-ready (safe-closed default). Apply 080/081 first.

### Verification (every commit + final)
tsc -b --noEmit clean; vite build succeeds; vitest run 61/61 pass.

## Session 11 (2026-08-12): Phase 6 -- Data-Lifecycle + UI-Feedback + Enforcement Audit (prompt sections 50-88)

Triggered by adding a dedicated data-lifecycle audit to the master protocol: trace every important datum through USER -> frontend -> validation -> action -> auth -> RLS -> constraints -> DB result -> state -> UI feedback -> notification -> downstream -> final persisted outcome. Target the four most dangerous patterns: **false success, silent failure, state divergence, unprotected mutation.**

### Method (reusable scans)
- **Unchecked-mutation scan (§76/§77):** regex `await supabase.from('t').{insert|update|delete|upsert}` whose result is NOT destructured to `{error}`. Found **165 unchecked vs 217 checked (~43%)**. Most are intentional fire-and-forget side-channels (auditLogger, eventTracker, GamificationContext, notification bell -- acceptable per §71). The defects are unchecked mutations on user-initiated business data.
- **Console-only catch scan:** brace-matched catch blocks whose only effect is `console.*` (no toast/setError/throw/alert). Upper bound 156; ~63 near mutations; many false positives where feedback uses a non-obvious setter (e.g. setProfileError). Calibrate by reading the actual block before claiming a defect.

### Fixes (commits 2729621, 0326845 -- pushed, deploying to Vercel)
1. **Onboarding.tsx (false success + state divergence -- the reported onboarding problem):** `create_business_and_owner` RPC raises "User already belongs to a business" when an already-onboarded user lands on /onboarding (e.g. after a transient staff-fetch failure). The code treated ANY RPC error as "RPC unavailable, try manual creation", but migration 074 blocks direct business/staff INSERT by design (must go through the SECURITY DEFINER RPC) -> manual fallback fails -> user bricked into a misleading "Failed to create business" with no escape. Fixed: detect already-belongs -> `refreshStaff()` + `navigate('/app')`; surface other RPC errors honestly; removed the dead manual fallback. Also deleted dead `OnboardingWizard.tsx` (lazy-imported but never rendered) + its unused lazy import.
2. **Attendance.tsx (silent failure, payroll):** check-in/out insert+update results never inspected -> on failure the UI silently returned to idle with stale data. Now destructure error, toast on failure, skip loadData() on failure.
3. **Approvals.tsx reject (control plane + audit trail, §79):** status update succeeded but `approval_actions` audit insert was unchecked AND the catch only console.error'd. A failed audit insert left a rejection with no audit trail; a failed status update left the user with no feedback. Now check the audit insert (alert so the gap is visible) + alert on reject failure (matches the approve path).
4. **FinanceNigeria.tsx record payment (false success on money):** payment row saved, then `invoices.update` (balance/status) UNCHECKED, then `showToast('Payment recorded!')` regardless -> if the invoice update failed the user saw success while the invoice showed a stale balance. Now throw on invoice update error; optimistic UI gated on success.
5. **LeaveManagement.tsx approve/reject (balance corruption + invalid transition, §62/§76):** three compounding defects -- unchecked `leave_requests.update` (silent failure); `update_leave_balance` RPC called regardless of update success (decremented balance even when approval never committed); no transition guard (re-approve double-decremented). Fixed: guard `status==='pending'`, bail before touching balance on update error, check balance RPC + surface partial-success. Reject gets the same guard + feedback.

### Findings documented, not code-changed (need live DB or are feature-sized)
- **§84 blanket GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated** (`998_create_all_missing_tables.sql:757`) -- grants all 235 SECURITY DEFINER functions to unauthenticated users. Intentionally-public ones (signing-by-token 050, invite-info, SSO 053) are correct; the blanket violates least-privilege and could expose any SECURITY DEFINER function lacking an `auth.uid()` check. **Remediation requires the live DB** to verify which anon functions are genuinely needed before narrowing the grant -- not safe to change blindly. Flagged for the live-DB hardening pass.
- **§62 remaining status state-machines:** 20+ status-update sites across pages (Campaigns, Payroll, Accounting, Lease, Recruitment, Budgets, Webhooks, Meetings). Most use TS union types (valid values enforced), but transition guards are inconsistent. A full transition-map audit + DB-level enforce-transition triggers/CHECK constraints is tracked as follow-up (best done WITH live DB access).
- **§63/§67/§73 loading-vs-empty-vs-error state confusion:** sampled, not exhaustively fixed. The high-signal instances (Attendance, Leave) were fixed as part of the silent-failure work above.

### Still pending (blocked on user DB credential -- project ref kgsgqvatyleetyquffya)
- Apply migration 080 (cross-tenant RLS fix) + 081 (FK cascade) to live Supabase.
- With DB access: §60/§81 live failure testing (RLS denial, constraint violation, duplicate request, timeout), §85 real-user scenario runs, §84 anon-grant narrowing, §62 DB-level transition constraints, §86 final DB report.

## Session 12 (2026-08-14): NotificationBell crash fix + mobile (Android/iOS) build unblocked

### NotificationBell realtime crash (committed 845d98a, deployed)
- `Shell.tsx` renders `<NotificationBell />` TWICE — line 433 desktop header + line 449 mobile header — and Tailwind `md:hidden`/`hidden md:flex` only toggles CSS visibility, NOT React mounting. Both instances always mounted and both subscribed to the same hardcoded `supabase.channel('notifications:realtime')`. Supabase client dedupes by name → returns the cached channel → second `.on().subscribe()` throws "cannot add callbacks after subscribe()" → page crash.
- Fix: per-mount random suffix on the channel name (`notifications:realtime:${Math.random().toString(36).slice(2)}`). Complements the earlier dep-array/ref fix (a different contributor — teardown/recreate churn). Both needed.
- `polls` "Batch 4" was correctly SKIPPED: the DB migration already defines `closes_at` (not `ends_at`); `CompanyHome.tsx` already selects `closes_at` and already normalizes both `options` shapes (`opt.text || opt`). The "ends_at → closes_at" concern was based on a stale read. Lesson: read live code, not screenshots, before writing SQL.

### Mobile app (Android + iOS) — BUILD NOW WORKING (committed dd37c45)
- The `mobile/` Expo/React Native app already existed and typechecked clean, but the `Build Mobile App` GitHub workflow had FAILED twice (Aug 10) with `Plugin [id: 'expo-module-gradle-plugin'] was not found` from `expo-font/android/build.gradle`.
- **Root cause:** version skew. `@expo/vector-icons@14.1.0` depends on `expo-font@57.0.1` (future SDK), while `expo@51` depends on `expo-font@12.0.10`. npm hoisted `expo-font@57.0.1` to top-level; its build.gradle uses the NEW `plugins { id 'expo-module-gradle-plugin' }` mechanism that SDK 51's `settings.gradle` `useExpoModules()` does NOT register → plugin not found.
- **Fix:** npm `overrides` in `mobile/package.json` pinning `expo-font` to `12.0.10` (SDK-51-compatible). The single resolved expo-font@12.0.10 uses the SDK-51 mechanism (`apply from: ExpoModulesCorePlugin.gradle`). Verified: typecheck clean, prebuild succeeds, generated build.gradle no longer references the unresolved plugin.
- **Also added `mobile/eas.json`** so EAS Build (Expo cloud) is available for signed device builds (.apk/.aab + .ipa), complementing the self-hosted CI which produces unsigned APK + simulator-only iOS `.app`.
- **CI result (run 31786545369):** ALL GREEN — Mobile Type Check ✓ (31s), Android APK ✓ (8m41s), iOS App ✓ (13m41s). Artifacts: `avenize-android` (APK), `avenize-ios` (.app simulator build). Download: `gh run download 31786545369 --repo akinsify00511-cpu/fabric -n avenize-android`.
- **Limitations of the self-hosted CI build:** the APK is UNSIGNED (no keystore configured) — installable on Android with "install unknown apps" but not Play Store ready. The iOS build is a SIMULATOR build (`CODE_SIGNING_ALLOWED=NO`) — runs in iOS Simulator, NOT installable on real iPhones. For real device/Store distribution you need EAS Build (an Expo account + `EXPO_TOKEN` secret in GitHub) or local signed builds (keystore for Android, Apple Developer account + signing certs for iOS).

### Mobile build path DECISION (2026-08-14, commit 87c861d): GitHub Actions only, NOT EAS cloud
- **Decision:** retain the mobile build pipeline within GitHub Actions (`mobile.yml`); do NOT use EAS/Expo cloud builds. The Expo *framework* stays (the app is built on `expo` + `react-native` + `expo prebuild`), but the build pipeline is GitHub Actions producing downloadable artifacts — no Expo account, no EXPO_TOKEN, no EAS dashboard.
- **Removed** `mobile/eas.json` (was unused by the GitHub workflow — which runs `npx expo prebuild` + gradle/xcodebuild locally in CI — and its presence caused "Failed to read /eas.json" confusion when commands were run from the repo root). **Cleared** `app.json extra.eas.projectId` back to empty.
- **Verified post-removal (run 31807162102):** ALL GREEN — Mobile Type Check ✓ (29s), Android APK ✓ (7m57s), iOS App ✓ (15m26s). The GitHub-only path is solid and does not depend on any Expo/EAS config.
- **What the GitHub build produces (final state):**
  - Android: debug-keystore-signed release APK (the prebuild template sets `release { signingConfig signingConfigs.debug }`). Installable on real Android devices via "install unknown apps". NOT Play Store ready (needs a real release keystore + Google Play service account).
  - iOS: simulator build (`CODE_SIGNING_ALLOWED=NO`, `-sdk iphonesimulator`). Runs in iOS Simulator only. NOT installable on real iPhones — real-device iOS signing in CI would require Apple Developer cert + provisioning profile secrets in GitHub, which is the hard constraint of the no-EAS path.
  - Supabase config flows from GitHub secrets: workflow uses `secrets.EXPO_PUBLIC_SUPABASE_URL || secrets.VITE_SUPABASE_URL` (and the ANON_KEY equivalent), so the mobile app reuses the same secrets the web deploy uses — no Expo dashboard env vars needed.
- **Artifacts:** `avenize-android` (APK, 30-day retention), `avenize-ios` (.app, 30-day retention). Download: `gh run download <run-id> --repo akinsify00511-cpu/fabric -n avenize-android`.
- **The `eas init --id cc7a2fb2-...` (commit 05f7b88) was reverted** by 87c861d (projectId cleared) since we are not using EAS.

### Mobile app scope (what exists in mobile/)
- Real app, not a stub: Login (Supabase Auth + SecureStore token persistence), Capture (parse-intent edge fn → raise business event), Observer (org snapshot w/ pull-to-refresh), More (profile + module links). AuthContext mirrors web. 5 screens total — Capture/Snapshot/Tasks/Chat/More tabs (Tasks/Chat are placeholders). Shares brand tokens with web. Typechecks clean.
- To get the app actually connecting: set `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the workflow falls back to `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` secrets if the EXPO_ ones aren't set).
