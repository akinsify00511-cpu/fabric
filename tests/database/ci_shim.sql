-- CI shim: minimal Supabase-compatible surface so migrations apply cleanly
-- against PostgreSQL in GitHub Actions. This is NOT run against the real
-- Supabase; it exists so CI can assert migration files are syntactically valid
-- and apply without error — catching drift before it ships.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- PostGIS must live in the Supabase-compatible `extensions` schema because
-- production migrations reference extensions.geography and extensions.ST_*.
-- The postgis/postgis image preloads PostGIS into public, so in this fresh CI
-- database we recreate it in the expected schema rather than using the
-- unsupported ALTER EXTENSION ... SET SCHEMA operation.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    DROP EXTENSION postgis CASCADE;
  END IF;
  CREATE EXTENSION postgis WITH SCHEMA extensions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE EXTENSION IF NOT EXISTS ltree;

-- Supabase realtime publication: migrations ALTER this to add tables for
-- realtime subscriptions. Create it here so ALTER PUBLICATION succeeds.
DO $$ BEGIN
  CREATE PUBLICATION supabase_realtime;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Supabase roles.
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

-- auth schema stub.
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

-- update_updated_at_column() is referenced by an early migration before the
-- migration that normally defines it.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- auth.users — minimal table matching the columns the early create_business
-- RPC inserts and returns.
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  encrypted_password TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- storage schema stub for storage.buckets + storage.objects policies.
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

-- supabase_migrations stub (schema version tracking migration reads it).
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version TEXT PRIMARY KEY,
  statements TEXT[],
  name TEXT
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('108_schema_version_tracking', 'schema_version_tracking')
ON CONFLICT DO NOTHING;
