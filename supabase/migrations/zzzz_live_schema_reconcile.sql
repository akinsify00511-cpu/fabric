-- zzzz_live_schema_reconcile.sql
-- Reconciles the hand-managed LIVE database shape with the repo chain.
--
-- The live DB (project kgsgqvatyleetyquffya) was built by hand, so several
-- tables exist with a DIFFERENT shape than the chain's CREATE TABLE IF NOT
-- EXISTS assumes. CREATE TABLE IF NOT EXISTS is a no-op on those tables, so
-- the columns the frontend filters on never appear (browser console: 400s on
-- leave_requests business_id/status/start_date, staff.active, and 404s on
-- businesses.slug lookups). This file adds the missing columns additively,
-- backfills from legacy twin columns where they exist, and normalizes the
-- status CHECK. Idempotent. Named zzzz_ so it sorts AFTER zzz_* and its
-- view of the schema is final.

-- ============================================
-- 1. leave_requests — live table predates the chain and lacks the columns
--    the frontend filters on. All additive + nullable so existing rows and
--    any legacy shape are untouched.
-- ============================================
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS business_id UUID;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS staff_id UUID;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS leave_type_id UUID;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS total_days NUMERIC(5,1);
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS days_requested NUMERIC(5,1);
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill business_id from the staff row (RLS keys off business_id; rows
-- without it would be invisible to every policy in the chain).
UPDATE public.leave_requests lr
   SET business_id = s.business_id
  FROM public.staff s
 WHERE lr.staff_id = s.id
   AND lr.business_id IS NULL;

-- Normalize the status CHECK: a hand-built table may carry a CHECK with a
-- different value set, which would reject 'approved'/'rejected'/'cancelled'
-- writes from the app. Drop any CHECK touching status, add the canonical
-- superset as NOT VALID (existing rows are not re-validated).
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname = 'public'
       AND rel.relname = 'leave_requests'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending','approved','rejected','cancelled','escalated')) NOT VALID;

-- The hand-built table was never granted to PostgREST roles (live probe:
-- 42501). Authenticated access is required; anon stays denied (RLS governs).
-- Guarded so the file also applies on bare Postgres without Supabase roles.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated';
  END IF;
END $$;

-- ============================================
-- 2. staff.active — the chain (002) adds `active` DEFAULT TRUE, but the live
--    table's legacy flag is `is_active`. Backfill so deactivated users stay
--    deactivated instead of silently becoming active.
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'is_active'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'active'
  ) THEN
    EXECUTE 'UPDATE public.staff SET active = COALESCE(is_active, TRUE) WHERE active IS DISTINCT FROM COALESCE(is_active, TRUE)';
  END IF;
END $$;

-- ============================================
-- 3. businesses.slug — 043 adds the column; backfill from the business name
--    so public booking links work for pre-existing businesses.
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'slug'
  ) THEN
    EXECUTE $q$
      UPDATE public.businesses
         SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
       WHERE slug IS NULL
    $q$;
  END IF;
END $$;
