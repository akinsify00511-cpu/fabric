# Production Migration Matrix

> Section 1 (Foundation) of the master readiness checklist: "A tracked list of
> every migration file against whether it's confirmed applied to the live
> database. Currently discovered ad hoc, function by function — this needs to
> be a standing artifact, checked before any release."

This is that standing artifact. It is regenerated from
`supabase/migrations/*.sql` by `scripts/generate_migration_matrix.py`. The
`live_status` column reflects the best-known state of the live Supabase
(project `kgsgqvatyleetyquffya`) as of the last probe (Session 19,
2026-08-15) and must be re-verified before every release.

## How to verify (reusable probe method)

```bash
SUPA_URL="https://kgsgqvatyleetyquffya.supabase.co"
KEY="sb_publishable_..."   # from deployed JS bundle, NOT a JWT
# EXISTS check: empty-body POST; "no matches in schema cache" = truly missing
for rpc in create_business_and_owner can_access_module platform_ops; do
  detail=$(curl -s -X POST "$SUPA_URL/rest/v1/rpc/$rpc" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d '{}' | grep -oE '"details":"[^"]*"' | head -1)
  echo "$detail" | grep -q "no matches" && echo "MISSING: $rpc" || echo "exists: $rpc"
done
```

`db_schema_version()` (migration 108) returns the highest applied migration
number once 108 itself is applied — a single-call sanity check.

## Status legend

| live_status | meaning |
|---|---|
| CONFIRMED_APPLIED | verified on the live DB (probe returned the function/table) |
| MISSING | verified NOT on the live DB (probe: "no matches in schema cache") |
| UNKNOWN | not yet probed — must be verified before release |
| INTERNAL_ONLY | table/RPC added by a migration that is itself MISSING; applies when the parent migration lands |

## Migration matrix (131 migrations)

This table is generated. Re-run `python3 scripts/generate_migration_matrix.py`
after adding migrations to refresh it. The **release gate**: every migration
listed `MISSING` or `UNKNOWN` must be applied (or confirmed unnecessary) before
a release. The live-DB apply is a manual step requiring DB credentials — it
cannot be done from the codebase.

### Confirmed MISSING on live DB (probe, Session 19 — must be applied)

These migrations exist in Git but are NOT applied to the live Supabase. They
are the single highest-priority deployment action. All are idempotent
(`CREATE OR REPLACE` / `IF NOT EXISTS` / `ON CONFLICT`).

| migration | what it provides | impact of being missing |
|---|---|---|
| `063` | intelligence RPCs (`market_intelligence`, `salary_affordability`…) | Market Index page errors; intelligence layer non-functional |
| `080` | cross-tenant RLS fix (111 policies) | **SECURITY: any user can read/write any tenant's data** |
| `081` | FK cascade (business-delete unblocked) | business undeletable while child rows exist |
| `082` | self-audit function grant + idempotent re-declare | self-audit page empty |
| `083` | staff personal fields + onboarding job_title | Profile saves silently drop new fields; onboarding defaults to 'Owner' |
| `085`–`099` | intelligence + recommendation + OKR + risk + trust + MPR + golden datasets + intelligence notifications | entire intelligence layer empty (degrades gracefully — best-effort empty states) |
| `108` | schema version tracking (`db_schema_version`) | no single-call version check |
| `111` | analytics events reconciliation (canonical `record_analytics_event`) | analytics 401 / unbounded retry queue |
| `20260101000008`–`20260101000014` | self-instrumentation, owner/builder intelligence, sector intel, automation health, API-key gateway | owner/builder/ops surfaces empty; API keys unusable |
| `20260817150000` | org hierarchy (organizations, memberships, resolver) | subsidiaries non-functional |
| `20260817110000`–`1100` | attendance geofencing, field visits | attendance/field-visit pages broken |
| `20260818100000` | org hierarchy `is_active`→`active` fix | subsidiary access resolver errors |
| `20260818120000` | Riverwayse ops dashboard (tables + RPCs) | ops dashboard shows "couldn't load" |
| `20260818120100` | platform pager tracking (paged_at, platform_pages) | proactive paging can't dedup |
| `20260818130000` | reconcile duplicate tables (drop recurring_costs/payroll_entries) | duplicate tables still exist; §0.5 unresolved |

> Until `080` is applied, RLS is effectively USING(true) on tenant-scoped
> tables — the highest-risk defect in the system. Apply `080` first.

### Confirmed EXISTS on live DB (probe, Session 19)

| migration | what it provides |
|---|---|
| `998` (get_my_channels) | chat channels RPC |

(The live DB has ~88 tables; the vast majority of the 393 migration-defined
tables have NOT been applied. The frontend degrades gracefully — best-effort
empty states per §24 — but `create_business_and_owner` missing means NEW USERS
CANNOT ONBOARD.)

## Release gate (checklist)

Before tagging a release, confirm:
- [ ] Every `MISSING` migration above has been applied to the live Supabase
      via `supabase db push` or the dashboard, OR explicitly marked
      "deferred" with a stated reason.
- [ ] `db_schema_version()` returns the highest migration number.
- [ ] The RLS attack test suite (Section 1 item 4) passes against the live DB.
- [ ] A sample RPC probe (`create_business_and_owner`, `can_access_module`,
      `platform_ops`) returns data, not "no matches in schema cache".
