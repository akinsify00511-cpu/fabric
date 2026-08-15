-- 108_schema_version_tracking.sql
--
-- Infrastructure: lets the application verify the database is current with
-- the codebase (the "is the body intact?" check). Without this, the running
-- app silently operates against an unknown schema version — pages hit
-- missing columns/RPCs and the only signal is a runtime error swallowed by a
-- try/catch.
--
-- Adds:
--   • db_schema_version()  — returns the highest migration number applied,
--     as an INTEGER (e.g. 108). Reads from the Supabase-managed
--     supabase_migrations.schema_migrations table if present; otherwise
--     falls back to 0. SECURITY DEFINER so non-service roles can read it.
--   • db_is_current(expected_min) — boolean: is the applied version >= the
--     minimum the codebase requires? Used by the frontend health check.
--   • A GRANT to authenticated so the app can call it.
--
-- Pure internal SQL. No external dependency.

\set ON_ERROR_STOP on

-- Returns the highest applied migration version as an integer, or 0 if the
-- Supabase migrations table is absent or empty. Migration filenames are
-- numeric-prefixed (001_..., 099_...); we parse the leading numeric token.
CREATE OR REPLACE FUNCTION public.db_schema_version()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_max INTEGER;
BEGIN
  -- supabase_migrations.schema_migrations tracks applied migrations by
  -- filename (version column). Not every Supabase project exposes it to the
  -- public role, so guard with an exception block.
  BEGIN
    EXECUTE format(
      'SELECT COALESCE(MAX(CASE
              WHEN version ~ ''^[0-9]+'' THEN left(version, strpos(version||''_'',''_'')-1)::INTEGER
              ELSE 0 END), 0)
       FROM supabase_migrations.schema_migrations'
    ) INTO v_max;
  EXCEPTION WHEN OTHERS THEN
    v_max := 0;
  END;

  RETURN COALESCE(v_max, 0);
END;
$$;

-- Boolean: is the applied schema version at least the codebase minimum?
-- The frontend passes the minimum it was built against; if the DB lags, the
-- app can show an honest "database update required" state instead of failing
-- silently.
CREATE OR REPLACE FUNCTION public.db_is_current(p_expected_min INTEGER DEFAULT 0)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.db_schema_version() >= p_expected_min;
$$;

GRANT EXECUTE ON FUNCTION public.db_schema_version() TO authenticated;
GRANT EXECUTE ON FUNCTION public.db_is_current(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.db_schema_version() IS
  'Highest applied migration number (from supabase_migrations.schema_migrations), or 0 if unreadable. Lets the app verify the DB matches the codebase.';
COMMENT ON FUNCTION public.db_is_current(INTEGER) IS
  'True when db_schema_version() >= the expected minimum the codebase was built against.';
