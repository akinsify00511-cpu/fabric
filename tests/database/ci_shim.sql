-- CI shim: minimal Supabase-compatible surface so migrations apply cleanly
-- against PostgreSQL in GitHub Actions. This is NOT run against the real
-- Supabase; it exists so CI can assert migration files are syntactically valid
-- and apply without error — catching drift before it ships.

-- pgcrypto: provides gen_random_uuid() used by every table PK.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- PostGIS: Supabase installs PostGIS in the `extensions` schema and the
-- presence/field migrations explicitly reference extensions.geography and
-- extensions.ST_* functions. The PostGIS CI image pre-installs the extension
-- in the default schema, so move the extension itself into the Supabase-like
-- schema before migrations run.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF v_schema IS NULL THEN
    CREATE EXTENSION postgis WITH SCHEMA extensions;
  ELSIF v_schema <> 'extensions' THEN
    EXECUTE 'ALTER EXTENSION postgis SET SCHEMA extensions';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'CI PostGIS setup failed: %', SQLERRM;
END $$;

-- ltree: used by 023_organogram (reporting_structure hierarchy type).
CREATE EXTENSION IF NOT EXISTS ltree;

-- supabase_realtime publication: migrations ALTER this to add tables for
-- realtime subscriptions. Create it here so ALTER PUBLICATION succeeds.
DO $$ BEGIN
  CREATE PUBLICATION supabase_realtime;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------------
-- Supabase roles (bare PostgreSQL lacks them; migrations GRANT to these)
-- ------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', ''),
    NULL
  )::UUID;
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::JSONB, '{}'::JSONB);
$$;

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
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('108_schema_version_tracking', 'schema_version_tracking')
ON CONFLICT DO NOTHING;
