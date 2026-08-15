# Avenize Schema Manifest — The Database Contract

> **Purpose:** This document is the single source of truth for the Avenize
> database schema. It classifies every frontend-referenced table into one of
> three layers, documents the reconciliation status, and defines the CI gate
> that prevents future drift.
>
> **Generated:** 2026-08-15. Auto-verified by `scripts/schema-drift-check.sh`.
>
> **Status:** ✅ ALL 112 MIGRATIONS PASS. ✅ ZERO SCHEMA DRIFT (204/204 tables, 78/78 RPCs backed).

---

## The Three Layers

### Layer 1 — Core Schema (healthy)
Tables the frontend queries that have a backing `CREATE TABLE` migration with
matching columns. **200 tables.** This is the normal, healthy state.

### Layer 2 — Historical Drift (repaired)
Tables that existed in both frontend and migrations but had **column/type
mismatches** — the frontend queried `deals.assigned_to` but the schema had
`deals.owner_id`; the intelligence RPCs referenced `invoices.contact_id` but
the table uses `client_name`; `budgets.amount` vs `budgets.total_amount`;
`sales_targets.target_amount` vs `revenue_target`. All repaired in this batch
(112/112 migrations now pass CI). No new tables created — only existing
migrations made idempotent and column-correct.

### Layer 3 — Frontend-Only (verified not gaps)
4 references that appeared unbacked but are actually valid:

| Reference | Type | Defined in |
|-----------|------|------------|
| `approval_requests` | VIEW (compat layer over `approvals`) | 046, hardened in 080 |
| `entity_freshness_status` | VIEW | 058, hardened in 080 |
| `avatars` | Storage bucket | 030 |
| `signatures` | Storage bucket | 082 |

**Zero real gaps.** Every `.from('table')` call in the frontend has a backing
schema object (table, view, or storage bucket).

---

## Reconciliation Summary

| Metric | Count |
|--------|-------|
| Frontend table references (`.from('table')`) | 204 |
| Backed by `CREATE TABLE` | 200 |
| Backed by `CREATE VIEW` | 2 |
| Backed by storage bucket | 2 |
| **Unbacked (drift)** | **0** |
| Frontend RPC references (`.rpc('fn')`) | 78 |
| Backed by `CREATE FUNCTION` | 78 |
| **Unbacked RPCs** | **0** |
| Migration files | 112 |
| Migrations passing CI | 112 |
| **Migration failures** | **0** |

---

## Migration Repair Patterns Applied

Every failing migration was made **idempotent** so it can be re-applied safely
on a live database. The patterns (reusable for future migrations):

### 1. Conditional DDL (avoid "already exists" errors)
```sql
-- ✅ DO block catches the error and continues
DO $$ BEGIN
  ALTER TABLE some_table ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "..." ON some_table FOR SELECT USING (...);
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'some_table not found, skipping';
END $$;

-- ✅ DROP before CREATE (idempotent re-run)
DROP POLICY IF EXISTS "policy_name" ON some_table;
CREATE POLICY "policy_name" ON some_table ...;

-- ✅ CREATE OR REPLACE for triggers/functions
CREATE OR REPLACE TRIGGER trigger_name ...
```

### 2. Column existence guards (avoid "column does not exist")
```sql
-- ✅ ADD COLUMN IF NOT EXISTS before use
ALTER TABLE some_table ADD COLUMN IF NOT EXISTS new_col TEXT;
-- Safe to DROP NOT NULL only after the column exists
DO $$ BEGIN
  ALTER TABLE some_table ALTER COLUMN new_col DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
```

### 3. Function signature conflicts (avoid "not unique")
```sql
-- ✅ DROP all overloads with specific signatures + CASCADE before redefining
DROP FUNCTION IF EXISTS my_func(TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS my_func() CASCADE;
CREATE OR REPLACE FUNCTION my_func() RETURNS TABLE (...) AS $$ ... $$;

-- ✅ GRANT with explicit signature
GRANT EXECUTE ON FUNCTION my_func(TEXT, TEXT) TO authenticated;
```

### 4. Generated column chains (PostgreSQL limitation)
```sql
-- ❌ Can't reference a generated column in another generated expression
total_deductions NUMERIC GENERATED ALWAYS AS (paye + pension) STORED,
net_salary NUMERIC GENERATED ALWAYS AS (gross - total_deductions) STORED, -- ERROR

-- ✅ Inline the formula
net_salary NUMERIC GENERATED ALWAYS AS (gross - (paye + pension)) STORED,
```

### 5. Dollar-quote collisions in nested blocks
```sql
-- ❌ Inner $$ terminates the outer DO block
DO $$ BEGIN
  PERFORM cron.schedule('job', '* * * * *', $$ SELECT ...; $$);
END $$;

-- ✅ Use a named delimiter
DO $cron_register$ BEGIN
  PERFORM cron.schedule('job', '* * * * *', $$ SELECT ...; $$);
END $cron_register$;
```

### 6. PostgreSQL syntax not supported as-is
```sql
-- ❌ CREATE TYPE IF NOT EXISTS (not supported)
CREATE TYPE IF NOT EXISTS my_enum AS ENUM ('a', 'b');

-- ✅ Wrap in DO block
DO $$ BEGIN CREATE TYPE my_enum AS ENUM ('a', 'b');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ❌ ADD CONSTRAINT IF NOT EXISTS (not supported)
ALTER TABLE t ADD CONSTRAINT IF NOT EXISTS c ...;

-- ✅ Wrap in DO block
DO $$ BEGIN ALTER TABLE t ADD CONSTRAINT c ...;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

### 7. Extension availability (pg_cron, pg_net may not be in CI)
```sql
-- ✅ Best-effort: create if available, skip if not
DO $$ BEGIN
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION pg_cron WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron not available, skipping';
END $$;

-- ✅ Guard all uses
DO $cron$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(...);
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron.schedule failed, skipping';
END $cron$;
```

### 8. Column name drift (frontend vs schema)
The most common Layer 2 pattern. Always verify the actual schema column name
before writing SQL that references it:
```sql
-- ❌ Assumed column name
WHERE b.amount > 0  -- budgets table has total_amount, not amount

-- ✅ Verified column name
WHERE b.total_amount > 0
```

---

## CI Gate

### `scripts/schema-drift-check.sh`
Runs locally and in CI. Extracts all `.from('table')` and `.rpc('fn')`
references from `src/` and checks each against `CREATE TABLE`/`CREATE VIEW`/
storage bucket / `CREATE FUNCTION` definitions in `supabase/migrations/`.

- **Exit 0:** No drift — all frontend references have schema backing.
- **Exit 1:** Table drift — a frontend `.from('table')` has no backing schema.
- **Exit 2:** RPC drift (advisory — some may be Supabase built-ins).

### `.github/workflows/schema-drift.yml`
Two jobs on every PR/push touching `src/` or `supabase/migrations/`:
1. **schema-drift:** runs the drift check script.
2. **migration-test:** spins up Postgres 15, applies the CI shim + all 112
   migrations, fails if any migration errors.

---

## How to Add a New Table (Without Introducing Drift)

1. **Create the migration first:** `supabase/migrations/NNN_descriptive_name.sql`
   with `CREATE TABLE IF NOT EXISTS` + RLS + `updated_at` trigger.
2. **Then query it from the frontend:** `supabase.from('new_table').select(...)`.
3. **Run the check:** `bash scripts/schema-drift-check.sh` — must pass.
4. **Test the migration:** the CI migration-test job applies all migrations
   from scratch; if yours fails, the build fails.

## How to Fix Drift When Detected

1. Run `bash scripts/schema-drift-check.sh` — it lists the unbacked tables/RPCs.
2. If the table is new: add a `CREATE TABLE` migration.
3. If the table is a view alias: add a `CREATE VIEW` migration.
4. If the reference is wrong (typo, renamed table): fix the frontend code.
5. Re-run the check until it passes.
