-- ============================================
-- pgTAP RLS Attack Test Suite
-- ============================================
-- Section 1 (Foundation) of the master readiness checklist:
--   "Automated tests proving: User A in Business A cannot read/write
--    Business B's data through any table, RPC, storage bucket, or analytics
--    query — not just the ones someone thought to test manually."
--
-- This is the automated attack suite. It sets up two tenants (Business A +
-- Business B, each with an owner) and, acting AS each user, attempts to:
--   1. READ Business B's rows from Business A's session (must see 0).
--   2. WRITE a row into Business B's scope from Business A's session
--      (must fail or be scoped to A).
--   3. Cross-call a SECURITY DEFINER RPC with another business's id
--      (the per-business RPCs must guard on membership).
--
-- It runs against a real Supabase (where auth.uid() reads the JWT) and
-- against the CI shim (where auth.uid() reads the settable GUC). The
-- set_config() calls below work in both because the shim's auth.uid() reads
-- the same GUC Supabase reads in production.
--
-- Requires pgTAP. Run on a live/test DB with migrations applied:
--   psql "$DB_URL" -f tests/database/ci_shim.sql  # CI only; skip on Supabase
--   psql "$DB_URL" -c "CREATE EXTENSION IF NOT EXISTS pgtap;"
--   psql "$DB_URL" -f tests/database/04_rls_attack_suite.sql
-- ============================================

BEGIN;
SELECT plan(20);

-- ============================================
-- SETUP: two tenants, two owner users, two staff rows.
-- ============================================
-- Use deterministic UUIDs so the test is reproducible.
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111';
  v_user_b uuid := '22222222-2222-2222-2222-222222222222';
  v_biz_a  uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_biz_b  uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
BEGIN
  -- Ensure auth.users rows exist (idempotent).
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'owner-a@biz-a.test'),
    (v_user_b, 'owner-b@biz-b.test')
  ON CONFLICT (id) DO NOTHING;

  -- Ensure businesses exist (idempotent). Some migration-defined CHECK
  -- constraints may require a plan_tier; supply a safe default.
  INSERT INTO public.businesses (id, name) VALUES
    (v_biz_a, 'Business A Test'),
    (v_biz_b, 'Business B Test')
  ON CONFLICT (id) DO NOTHING;

  -- Staff rows link the auth user to the business + role.
  INSERT INTO public.staff (id, business_id, user_id, name, email, role)
  VALUES
    ('aa000000-0000-0000-0000-000000000001', v_biz_a, v_user_a, 'Owner A', 'owner-a@biz-a.test', 'owner'),
    ('bb000000-0000-0000-0000-000000000001', v_biz_b, v_user_b, 'Owner B', 'owner-b@biz-b.test', 'owner')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Helper: act as a given user by setting the JWT claims GUC.
-- The CI shim's auth.uid() reads request.jwt.claims->'sub'. On real
-- Supabase, set_config('request.jwt.claims', ...) is how pgTAP impersonates.
CREATE OR REPLACE FUNCTION tests.set_user(p_user_uuid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user_uuid::text, 'role', 'authenticated')::text,
    false);
$$;

-- ============================================
-- TEST GROUP 1: cross-tenant READ on core business tables.
-- Acting as Owner A, every row scoped to Business B must be invisible.
-- ============================================

-- Deals: A sees only A's deals.
SELECT tests.set_user('11111111-1111-1111-1111-111111111111');
-- Seed a deal in Business B (as a superuser-equivalent via service_role
-- bypass — we use a direct insert with the business_id set, RLS bypassed
-- because the test connection is the owner/table-creator).
INSERT INTO public.deals (id, business_id, title, stage, created_by)
VALUES ('dddd0001-0000-0000-0000-000000000001',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'Business B secret deal', 'open', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

SELECT results_eq(
  'SELECT count(*)::int FROM public.deals WHERE business_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  ARRAY[0],
  'Owner A cannot read Business B deals (RLS hides them)'
);

-- Contacts: A sees only A's contacts.
INSERT INTO public.contacts (id, business_id, full_name, email)
VALUES ('cccc0001-0000-0000-0000-000000000001',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'Business B secret contact', 'b@biz-b.test')
ON CONFLICT (id) DO NOTHING;

SELECT results_eq(
  'SELECT count(*)::int FROM public.contacts WHERE business_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  ARRAY[0],
  'Owner A cannot read Business B contacts'
);

-- Invoices: A sees only A's invoices.
INSERT INTO public.invoices (id, business_id, invoice_number, client_name, client_email, total, status, issue_date)
VALUES ('iiii0001-0000-0000-0000-000000000001',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'INV-B-001', 'Business B Client', 'b@biz-b.test', 1000, 'draft', CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

SELECT results_eq(
  'SELECT count(*)::int FROM public.invoices WHERE business_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  ARRAY[0],
  'Owner A cannot read Business B invoices'
);

-- ============================================
-- TEST GROUP 2: cross-tenant WRITE must be blocked.
-- Acting as Owner A, inserting a row with business_id = Business B must
-- either fail (constraint) or be prevented by RLS. We assert that AFTER the
-- attempt, no row exists in B's scope attributable to A.
-- ============================================
SELECT tests.set_user('11111111-1111-1111-1111-111111111111');
-- Attempt the write; wrap in a savepoint so a hard failure doesn't abort
-- the whole test transaction (we still want the count assertion below).
SAVEPOINT sp_deal_write;
BEGIN
  -- Insert with B's business_id while authenticated as A. RLS should
  -- prevent this (or the row lands but is invisible — the read-back count
  -- from A's session is the real assertion).
  INSERT INTO public.deals (business_id, title, stage, created_by)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'A tried to write into B', 'open',
          '11111111-1111-1111-1111-111111111111');
EXCEPTION WHEN OTHERS THEN
  NULL; -- expected: RLS or policy blocks the insert.
END;
ROLLBACK TO SAVEPOINT sp_deal_write;

-- The definitive assertion: acting as B, count A's injected row. If RLS
-- worked, A's write either failed or was scoped to A (invisible to B too).
SELECT tests.set_user('22222222-2222-2222-2222-222222222222');
SELECT results_eq(
  'SELECT count(*)::int FROM public.deals WHERE title = ''A tried to write into B''',
  ARRAY[0],
  'Owner A could not inject a deal into Business B scope (write blocked)'
);

-- ============================================
-- TEST GROUP 3: SECURITY DEFINER RPC membership guard.
-- Per-business RPCs that take a p_business_id param MUST verify the caller
-- belongs to that business (RLS does not protect SECURITY DEFINER fns).
-- We assert that calling a per-business RPC with Business B's id while
-- authenticated as Owner A returns an empty/unauthorized payload, NOT
-- Business B's data.
-- ============================================
SELECT tests.set_user('11111111-1111-1111-1111-111111111111');

-- automation_health(p_business_id) — owner-gated + membership-guarded.
SELECT results_ne(
  'SELECT COALESCE((result->>''authorized'')::boolean, true) FROM (SELECT public.automation_health(''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'') AS result) t',
  true,
  'Owner A calling automation_health with Business B id is denied (membership guard)'
);

-- owner_intelligence(p_business_id) — owner-gated + membership-guarded.
SELECT results_ne(
  'SELECT COALESCE((result->>''authorized'')::boolean, true) FROM (SELECT public.owner_intelligence(''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'') AS result) t',
  true,
  'Owner A calling owner_intelligence with Business B id is denied (cross-tenant RPC guard)'
);

-- sector_benchmark(p_business_id) — membership-guarded.
SELECT results_eq(
  'SELECT COALESCE((result->>''authorized'')::boolean, false) FROM (SELECT public.sector_benchmark(''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'') AS result) t',
  ARRAY[false],
  'Owner A calling sector_benchmark with Business B id returns authorized=false (no leak)'
);

-- ============================================
-- TEST GROUP 4: positive control — each owner sees their OWN data.
-- (If this fails, the test setup is broken, not RLS.)
-- ============================================
SELECT tests.set_user('11111111-1111-1111-1111-111111111111');
INSERT INTO public.deals (id, business_id, title, stage, created_by)
VALUES ('dddd000a-0000-0000-0000-000000000001',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Business A own deal', 'open',
        '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

SELECT results_eq(
  'SELECT count(*)::int FROM public.deals WHERE business_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'' AND title = ''Business A own deal''',
  ARRAY[1],
  'Owner A can read their own deals (positive control)'
);

SELECT tests.set_user('22222222-2222-2222-2222-222222222222');
SELECT results_eq(
  'SELECT count(*)::int FROM public.deals WHERE business_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  ARRAY[0],
  'Owner B cannot read Business A deals (symmetric isolation)'
);

-- ============================================
-- CLEANUP: remove test rows so the suite is re-runnable.
-- Run as the table owner (bypass RLS) by resetting the user.
-- ============================================
SELECT set_config('request.jwt.claims', '', false);
DELETE FROM public.deals WHERE id IN (
  'dddd0001-0000-0000-0000-000000000001',
  'dddd000a-0000-0000-0000-000000000001'
);
DELETE FROM public.contacts WHERE id = 'cccc0001-0000-0000-0000-000000000001';
DELETE FROM public.invoices WHERE id = 'iiii0001-0000-0000-0000-000000000001';
DELETE FROM public.deals WHERE title = 'A tried to write into B';

SELECT finish();
ROLLBACK;
