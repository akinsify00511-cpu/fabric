# Live DB Apply Runbook — project `kgsgqvatyleetyquffya`

**Why this exists:** the live database was hand-managed and has never had the
repo migration chain applied through `supabase db push`. The deployed frontend
(2026-08-20 build) now talks to dozens of objects the live DB does not have.
The browser console shows this as 404 / 400 / 406 / PGRST202 noise. Supabase
Auth itself is healthy — every failure below is schema drift.

## Probed live state (2026-08-20, via publishable key)

| Object | Live state | Consequence |
|---|---|---|
| `staff.active` | **missing** (legacy `is_active` exists) | every `active=eq.true` query → 400 |
| `staff.member_kind` | **missing** | member-kind filters break |
| `staff.email`, `staff.job_title` | present | — |
| `businesses.organization_id` | present | — |
| `businesses.slug` | **missing** | public booking link lookup breaks |
| `leave_requests.start_date` | **missing** | leave dashboards → 400 |
| `claims`, `kpi_metrics` | present | — |
| `email_campaigns`, `user_workspace_selections`, `usage_events` | **missing tables** | marketing page, workspace selection, telemetry → 404 |
| `create_business_and_owner` | **missing** | **new users cannot onboard** |
| `check_auth_rate_limit`, `log_security_event` | **missing** | rate limiting + security events dead (frontend fails open) |
| `business_brain`, `current_metrics`, `open_recommendations`, `business_value_ledger`, `profitability_leakage` | **missing** | entire intelligence layer → PGRST202 |
| `get_current_staff` | exists, anon denied (correct) | — |

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
