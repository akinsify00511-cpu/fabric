-- CI shim: minimal Supabase-compatible surface so migrations apply cleanly
-- against a bare postgres:15 in GitHub Actions. This is NOT run against the
-- real Supabase (which provides these natively); it only exists so CI can
-- assert the migration files are syntactically valid and apply without
-- error — catching drift before it ships. Applied before migrations in the
-- database-tests CI job.
--
-- Stubs provided:
--   • pgcrypto (gen_random_uuid) — real extension, available in pg15.
--   • auth schema + auth.uid() — returns NULL in CI (no real session).
--   • auth.users — minimal table matching the columns 001 inserts into.
--   • storage schema + storage.buckets — minimal stub for bucket DDL.
--   • supabase_migrations schema + schema_migrations — stub for 108's read.
--   • pg_net / pg_cron — skipped (guarded by DO $$ IF EXISTS in migrations,
--     so absence is a no-op; we do NOT stub them to keep CI light).

-- pgcrypto: provides gen_random_uuid() used by every table PK.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ltree: used by 023_organogram (reporting_structure hierarchy type).
CREATE EXTENSION IF NOT EXISTS ltree;

-- supabase_realtime publication: migrations ALTER this to add tables for
-- realtime subscriptions. Create it here so ALTER PUBLICATION succeeds.
-- (CREATE PUBLICATION IF NOT EXISTS is not supported; use a DO block.)
DO $$ BEGIN
  CREATE PUBLICATION supabase_realtime;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------------
-- Supabase roles (bare Postgres lacks them; migrations GRANT to these)
-- ------------------------------------------------------------------
-- Supabase defines anon (unauthenticated), authenticated (logged-in app
-- users), and service_role (bypasses RLS). Create them as no-login roles so
-- GRANT statements resolve. RLS still gates them in CI the same way.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- ------------------------------------------------------------------
-- auth schema stub
-- ------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

-- auth.uid() — Supabase returns the current session user's UUID. In
-- production this reads from the JWT claim `sub`. Here we read from a
-- settable GUC (`request.jwt.claims`) so RLS attack tests can switch users
-- via set_config(). Returns NULL when no claims are set (safe: deny by
-- default), matching real Supabase behavior for an unauthenticated session.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', ''),
    NULL
  )::UUID;
$$;

-- auth.jwt() — Supabase returns the current session's JWT claims. Read from
-- the same settable GUC so tests can inject claims. Empty JSONB when unset.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::JSONB, '{}'::JSONB);
$$;

-- auth.role() — Supabase returns the current role string. In CI return
-- 'authenticated' so role-checking expressions resolve without erroring.
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
LANGUAGE sql STABLE AS $$ SELECT 'authenticated'; $$;

-- update_updated_at_column() — defined in 025/026/027 but referenced by
-- 023 (which sorts before 025). Provide it here so 023's triggers apply.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- auth.users — 001's create_business RPC inserts (email, encrypted_password,
-- raw_user_meta_data) and RETURNING id. Provide those columns + an id PK.
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  encrypted_password TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------
-- storage schema stub (for storage.buckets + storage.objects policies)
-- ------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT,
  public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- storage.foldername(name) — Supabase storage helper used in RLS policies
-- (030). Returns the folder path components as a text array.
CREATE OR REPLACE FUNCTION storage.foldername(p_name TEXT)
RETURNS TEXT[] LANGUAGE sql STABLE AS $$
  SELECT string_to_array(p_name, '/');
$$;
CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT,
  owner UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------
-- supabase_migrations stub (108's db_schema_version reads it)
-- ------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version TEXT PRIMARY KEY,
  statements TEXT[],
  name TEXT
);
-- Pre-seed with the highest applied number so db_schema_version() resolves
-- non-zero in CI (simulates an up-to-date DB).
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('108_schema_version_tracking', 'schema_version_tracking')
ON CONFLICT DO NOTHING;
