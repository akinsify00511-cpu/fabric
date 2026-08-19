-- CI shim: minimal Supabase-compatible surface so migrations apply cleanly
-- against PostgreSQL in GitHub Actions. This is NOT run against the real
-- Supabase; it exists so CI can assert migration files are syntactically valid
-- and apply without error — catching drift before it ships.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- PostGIS must live in the Supabase-compatible `extensions` schema because
-- production migrations reference extensions.geography and extensions.ST_*.
-- The postgis/postgis image preloads PostGIS into public, so in this fresh CI
-- database we recreate it in the expected schema rather than trying the
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

DO $$ BEGIN
  CREATE PUBLICATION supabase_realtime;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
LANGUAGE sql STABLE AS $$ SELECT 'authenticated';
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS auth.users (