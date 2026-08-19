-- ============================================
-- RLS Attack Test Suite (plain SQL — no pgTAP dependency)
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
-- RLS only applies to non-superuser, non-owner sessions, so after seeding
-- (as the table owner) the suite switches to the `authenticated` role with
-- SET LOCAL ROLE — the same role Supabase API requests run as.
--
-- Assertions use plain-SQL helpers that RAISE EXCEPTION on failure, so
-- running with `psql -v ON_ERROR_STOP=1` fails the step on any violation.
--
-- Run on a live/test DB with migrations applied:
--   psql "$DB_URL" -f tests/database/ci_shim.sql  # CI only; skip on Supabase
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/database/04_rls_attack_suite.sql
-- ============================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS tests;

-- ------------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------------

-- Impersonate a user by setting the JWT claims GUC. The CI shim's auth.uid()
-- reads request.jwt.claims->'sub'; on real Supabase pgTAP impersonation uses
-- the same mechanism.
CREATE OR REPLACE FUNCTION tests.set_user(p_user_uuid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user_uuid::text, 'role', 'authenticated')::text,
    false);
$$;

-- Assert the single-column result set of p_query equals p_expected.
CREATE OR REPLACE FUNCTION tests.assert_results_eq(
  p_query text, p_expected text[], p_description text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text[];
BEGIN
  EXECUTE format('SELECT array_agg((x)::text) FROM (%s) AS q(x)', p_query)
    INTO v_actual;
  IF v_actual IS NOT DISTINCT FROM p_expected THEN
    RAISE NOTICE 'ok - %', p_description;
  ELSE
    RAISE EXCEPTION 'FAIL - % (expected %, got %)', p_description, p_expected, v_actual;
  END IF;
END $$;

-- Assert the single-column result set of p_query does NOT equal p_unexpected.
CREATE OR REPLACE FUNCTION tests.assert_results_ne(
  p_query text, p_unexpected text, p_description text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE format('SELECT (x)::text FROM (%s) AS q(x) LIMIT 1', p_query)
    INTO v_actual;
  IF v_actual IS DISTINCT FROM p_unexpected THEN
    RAISE NOTICE 'ok - %', p_description;
  ELSE
    RAISE EXCEPTION 'FAIL - % (must not equal %, got %)', p_description, p_unexpected, v_actual;
  END IF;
END $$;

-- Attempt a write that MUST be blocked (RLS/constraint). Never raises.
CREATE OR REPLACE FUNCTION tests.attempt_write(p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE NOTICE 'write unexpectedly succeeded (assertion is the read-back below)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'write blocked as expected: %', SQLERRM;
END $$;

GRANT USAGE ON SCHEMA tests TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;

-- ------------------------------------------------------------------
-- SETUP: two tenants, two owner users, two staff rows.
-- Deterministic UUIDs so the test is reproducible.
-- Runs as the connection owner (superuser): bypasses RLS for seeding.
-- ------------------------------------------------------------------
DO $$
BEGIN
  -- Seed fixtures directly: disable the business-insert side-effect trigger
  -- (auto-create #general channel) which expects staff to already exist.
  ALTER TABLE public.businesses DISABLE TRIGGER on_business_created;

  INSERT INTO auth.users (id, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'owner-a@biz-a.test'),
    ('22222222-2222-2222-2222-222222222222', 'owner-b@biz-b.test')
  ON CONFLICT (id) DO NOTHING;

  -- Organizations first (businesses.organization_id is NOT NULL after the
  -- org-hierarchy migration).
  INSERT INTO public.organizations (id, name) VALUES
    ('aaa00000-0000-0000-0000-000000000001', 'Org A Test'),
    ('bbb00000-0000-0000-0000-000000000001', 'Org B Test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.businesses (id, name, organization_id) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Business A Test', 'aaa00000-0000-0000-0000-000000000001'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Business B Test', 'bbb00000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.staff (id, business_id, user_id, name, email, role)
  VALUES
    ('aa000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Owner A', 'owner-a@biz-a.test', 'owner'),
    ('bb000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Owner B', 'owner-b@biz-b.test', 'owner')
  ON CONFLICT (id) DO NOTHING;

  -- Seed rows in both scopes (superuser: bypasses RLS).
  INSERT INTO public.deals (id, business_id, title, stage, owner_id)
  VALUES ('dddd0001-0000-0000-0000-000000000001',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'Business B secret deal', 'prospect', 'bb000000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.deals (id, business_id, title, stage, owner_id)
  VALUES ('dddd000a-0000-0000-0000-000000000001',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'Business A own deal', 'prospect',
          'aa000000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.contacts (id, business_id, name, full_name, email)
  VALUES ('cccc0001-0000-0000-0000-000000000001',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'Business B secret contact', 'Business B secret contact', 'b@biz-b.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoices (id, business_id, invoice_number, client_name, client_email, total, status, issue_date)
  VALUES ('11110001-0000-0000-0000-0000000000ff',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'INV-B-001', 'Business B Client', 'b@biz-b.test', 1000, 'draft', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  ALTER TABLE public.businesses ENABLE TRIGGER on_business_created;
END $$;

-- ------------------------------------------------------------------
-- From here on, act as the `authenticated` role (RLS enforced).
-- ------------------------------------------------------------------
SET LOCAL ROLE authenticated;

-- TEST GROUP 1: cross-tenant READ on core business tables.
-- Acting as Owner A, every row scoped to Business B must be invisible.
SELECT tests.set_user('11111111-1111-1111-1111-111111111111');

SELECT tests.assert_results_eq(
  'SELECT count(*) FROM public.deals WHERE business_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  ARRAY['0'],
  'Owner A cannot read Business B deals (RLS hides them)'
);

SELECT tests.assert_results_eq(
  'SELECT count(*) FROM public.contacts WHERE business_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  ARRAY['0'],
  'Owner A cannot read Business B contacts'
);

SELECT tests.assert_results_eq(
  'SELECT count(*) FROM public.invoices WHERE business_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  ARRAY['0'],
  'Owner A cannot read Business B invoices'
);

-- TEST GROUP 2: cross-tenant WRITE must be blocked.
SELECT tests.attempt_write(
  'INSERT INTO public.deals (business_id, title, stage, owner_id)
   VALUES (''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',
           ''A tried to write into B'', ''prospect'',
           ''aa000000-0000-0000-0000-000000000001'')'
);

-- Read-back as Owner B: A's injected row must not exist in B's scope.
SELECT tests.set_user('22222222-2222-2222-2222-222222222222');
SELECT tests.assert_results_eq(
  'SELECT count(*) FROM public.deals WHERE title = ''A tried to write into B''',
  ARRAY['0'],
  'Owner A could not inject a deal into Business B scope (write blocked)'
);

-- TEST GROUP 3: SECURITY DEFINER RPC membership guard.
-- Per-business RPCs that take a p_business_id param MUST verify the caller
-- belongs to that business (RLS does not protect SECURITY DEFINER fns).
SELECT tests.set_user('11111111-1111-1111-1111-111111111111');

SELECT tests.assert_results_ne(
  'SELECT COALESCE((result->>''authorized'')::boolean, true) FROM (SELECT public.automation_health(''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'') AS result) t',
  'true',
  'Owner A calling automation_health with Business B id is denied (membership guard)'
);

SELECT tests.assert_results_ne(
  'SELECT COALESCE((result->>''authorized'')::boolean, true) FROM (SELECT public.owner_intelligence(''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'') AS result) t',
  'true',
  'Owner A calling owner_intelligence with Business B id is denied (cross-tenant RPC guard)'
);

SELECT tests.assert_results_eq(
  'SELECT COALESCE((result->>''authorized'')::boolean, false) FROM (SELECT public.sector_benchmark(''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'') AS result) t',
  ARRAY['false'],
  'Owner A calling sector_benchmark with Business B id returns authorized=false (no leak)'
);

-- TEST GROUP 4: positive control — each owner sees their OWN data.
SELECT tests.set_user('11111111-1111-1111-1111-111111111111');
SELECT tests.assert_results_eq(
  'SELECT count(*) FROM public.deals WHERE business_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'' AND title = ''Business A own deal''',
  ARRAY['1'],
  'Owner A can read their own deals (positive control)'
);

SELECT tests.set_user('22222222-2222-2222-2222-222222222222');
SELECT tests.assert_results_eq(
  'SELECT count(*) FROM public.deals WHERE business_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  ARRAY['0'],
  'Owner B cannot read Business A deals (symmetric isolation)'
);

-- ------------------------------------------------------------------
-- CLEANUP: back to the owner role, remove test rows, roll the whole
-- transaction back so the suite is re-runnable and leaves no residue.
-- ------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
DELETE FROM public.deals WHERE id IN (
  'dddd0001-0000-0000-0000-000000000001',
  'dddd000a-0000-0000-0000-000000000001'
);
DELETE FROM public.contacts WHERE id = 'cccc0001-0000-0000-0000-000000000001';
DELETE FROM public.invoices WHERE id = '11110001-0000-0000-0000-0000000000ff';

ROLLBACK;
