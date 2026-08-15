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

-- auth.uid() — Supabase returns the current session user's UUID. In CI
-- there is no session, so return NULL. RLS policies that gate on
-- auth.uid() will simply match no rows (safe: deny by default).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$ SELECT NULL::UUID; $$;

-- auth.jwt() — Supabase returns the current session's JWT claims. In CI
-- there is no session; return an empty JSONB so claim-extraction expressions
-- (e.g. auth.jwt() ->> 'sub') resolve to NULL instead of erroring.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB
LANGUAGE sql STABLE AS $$ SELECT '{}'::JSONB; $$;

-- auth.role() — Supabase returns the current role string. In CI return
-- 'authenticated' so role-checking expressions resolve without erroring.
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
LANGUAGE sql STABLE AS $$ SELECT 'authenticated'; $$;

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
