# Live DB Apply Runbook — project `kgsgqvatyleetyquffya`

**Why this exists:** the live database was hand-managed and has never had the
repo migration chain applied through `supabase db push`. The deployed frontend
(2026-08-20 build) now talks to dozens of objects the live DB does not have.
The browser console shows this as 404 / 400 / 406 / PGRST202 noise. Supabase
Auth itself is healthy — every failure below is schema drift.

## Probed live state (2026-08-20, via publishable key — re-probed same day: UNCHANGED, chain still not applied)

| Object | Live state | Consequence |
|---|---|---|
| `staff.active` | **missing** (legacy `is_active` exists) | every `active=eq.true` query → 400 |
| `staff.member_kind` | **missing** | member-kind filters break |
| `staff.email`, `staff.job_title` | present | — |
| `businesses.organization_id` | present | — |
| `businesses.slug` | **missing** | public booking link lookup breaks |
| `leave_requests` | exists (hand-built) but **anon 42501 + 400 on `business_id`/`status`/`start_date` filters** — shape diverged from the chain | leave dashboards → 400 |
| `claims`, `kpi_metrics` | present | — |
| `email_campaigns`, `user_workspace_selections`, `usage_events` | **missing tables** (PGRST205) | marketing page, workspace selection, telemetry → 404 |
| `create_business_and_owner` | **missing** | **new users cannot onboard** |
| `check_auth_rate_limit`, `log_security_event` | **missing** | rate limiting + security events dead (frontend fails open) |
| `business_brain`, `current_metrics`, `open_recommendations`, `business_value_ledger`, `profitability_leakage`, `can_access_module` | **missing** (PGRST202) | entire intelligence layer → 404 |
| `get_current_staff` | exists, anon denied (correct) | — |

**Chain gap found + fixed (2026-08-20):** `leave_requests` is only ever
`CREATE TABLE IF NOT EXISTS` (002/032/039) — a no-op against the hand-built
live table, so the chain alone would NOT have fixed the 400s. Migration
`zzzz_live_schema_reconcile.sql` (sorts last, idempotent, tested on
postgres:15 against both a simulated divergent live shape and the fresh
chain) additively adds the missing `leave_requests` columns, backfills
`business_id` from the staff row, normalizes the status CHECK (NOT VALID so
legacy rows don't block it), grants the table to `authenticated`, backfills
`staff.active` from legacy `is_active` (deactivated users stay deactivated),
and backfills `businesses.slug` from the name.

## Step 1 — apply the chain (needs DB credentials; cannot be done from CI)

```bash
# Supabase Dashboard → Project Settings → Database → Connection string
export SUPABASE_DB_URL='postgresql://postgres:<password>@db.kgsgqvatyleetyquffya.supabase.co:5432/postgres'
scripts/apply_migrations_live.sh
```

The script applies all migrations in filename order, logs per-file OK/FAIL to
`supabase/migration_apply_report.txt`, and runs a second pass for failures
caused by ordering. Everything is idempotent — re-running is safe. Any file
that still fails after pass 2 needs manual review (the report contains the
Postgres error for each); expect a small number of failures where the
hand-built live schema diverged from what an early migration assumes
(e.g. an object created out-of-band with a different shape). Those are
resolved case-by-case — do NOT force-drop live objects without checking
their data first.

## Step 2 — verify

```bash
export SUPABASE_ANON_KEY='sb_publishable_...'   # Project Settings → API keys
scripts/verify_live_db.sh
```

Every line should print `ok`. Then reload the app: the 404/400 console noise
should be gone, onboarding should complete, and the Brain cards should
populate.

## Step 3 — reconcile the orphaned account(s)

The console shows user `361710ac-33e5-4793-95b6-291e4e6b0253` querying with
business `f2d580d1-de71-4a6c-825e-2d907150886f` while their own staff lookup
returns **0 rows** (the 406). That means an authenticated user with a business
reference but no `staff` row — membership resolution (correctly) says
`onboarding_required`, but re-running onboarding would create a **second**
business. After Step 1, run in the SQL editor:

```sql
-- 1. Confirm the gap
SELECT id, user_id, business_id, role, active FROM public.staff
 WHERE user_id = '361710ac-33e5-4793-95b6-291e4e6b0253';
SELECT id, name FROM public.businesses
 WHERE id = 'f2d580d1-de71-4a6c-825e-2d907150886f';

-- 2. If the business exists but no staff row: restore membership
INSERT INTO public.staff (business_id, user_id, name, email, role, member_kind, active)
SELECT 'f2d580d1-de71-4a6c-825e-2d907150886f',
       '361710ac-33e5-4793-95b6-291e4e6b0253',
       COALESCE(u.raw_user_meta_data->>'full_name', 'Owner'),
       u.email, 'owner', 'owner', true
FROM auth.users u
WHERE u.id = '361710ac-33e5-4793-95b6-291e4e6b0253'
ON CONFLICT DO NOTHING;
```

(Adjust names/ids if more than one account is affected — run the diagnostic
query for each.)

## Notes

- After the chain is applied, `zzz_auth_protocol_repair.sql` guarantees the
  final definitions of the auth RPCs win (it is alphabetically last on
  purpose).
- `pg_cron`/`pg_net` jobs are guarded no-ops; enable the extensions in
  Dashboard → Database → Extensions for the scheduled jobs (metrics refresh,
  digests, detectors) to run.
- Edge functions are deployed separately from DB migrations
  (`supabase functions deploy`) — the console errors above are all DB-side,
  but the newer edge functions (`capture-process`, `webauthn`, `api-gateway`)
  will also need a first deploy if they have never been pushed.

## Current drift baseline (2026-08-23, contract probe via publishable key)

The Production Contract comparator (`scripts/verify_production_contract.py`,
probe mode) reports the live project as:

- **129 frontend-referenced objects OK / 305 missing / 0 signature drift**
  (105 tables + 2 views + 191 functions + 7 storage buckets)
- **11 of 12 edge functions missing** (only `paystack-webhook` is deployed,
  and verified healthy: OPTIONS → 204, unsigned POST → 401 from its own
  HMAC check — i.e. platform JWT is correctly OFF and the signature gate
  works. The other 11 need a first deploy via
  `scripts/deploy_edge_functions.sh`, which sets the correct per-function
  JWT policy)

> Detection fix (2026-08-23): an earlier probe matched the exact sentence
> "no matches found in the schema cache", but this PostgREST version says
> "no matches **were** found" — a false-negative that hid 191 missing
> functions (reported as 320 ok / 114 missing). Detection now matches the
> stable fragments / the PGRST202 code.

## Step 4 — deploy edge functions + secrets (after Step 1)

```bash
export SUPABASE_ACCESS_TOKEN=<dashboard → Account → Access Tokens>
bash scripts/deploy_edge_functions.sh          # all 12, correct JWT policy per function

supabase secrets set \
  PAYSTACK_SECRET_KEY=sk_live_... \
  RESEND_API_KEY=re_... \
  EMAIL_FROM="Avenize <hello@avenize.app>" \
  RESEND_WEBHOOK_SECRET=whsec_... \
  APP_URL=https://avenize.riverwayse.com \
  EMAIL_SERVICE_CRON_SECRET=<random> \
  PLATFORM_HEALTH_CRON_SECRET=<random> \
  --project-ref kgsgqvatyleetyquffya

# Meta Conversions API (optional — the server-authoritative Purchase signal
# for ad attribution; paystack-webhook fires it after verified settlement):
supabase secrets set \
  META_PIXEL_ID=<meta events manager pixel id> \
  META_CAPI_ACCESS_TOKEN=<meta conversions api token> \
  --project-ref kgsgqvatyleetyquffya
# The browser pixel id is a PUBLIC build-time value (like the Supabase anon
# key), not an edge secret: set VITE_META_PIXEL_ID in Vercel env vars.
```

## Step 5 — production contract + E2E gates (the definition of "done")

```bash
bash scripts/verify-production.sh   # objects: expect PRODUCTION READY
bash scripts/e2e-production.sh      # journeys: expect E2E READY
```

`verify-production.sh` self-calibrates the publishable URL+key from the
deployed bundle, so no credentials are needed for the object gate. The deploy
workflow runs it on every production deploy — it stays RED until Steps 1–4
are complete. That is the gate working as intended.

`e2e-production.sh` exercises the real journeys (signup → onboarding →
membership → dashboard intelligence → manual + Paystack payment rails →
email rail → frontend). With email confirmation enabled, pass a confirmed
test account for the authenticated steps:

```bash
E2E_EMAIL=... E2E_PASSWORD=... bash scripts/e2e-production.sh
```
