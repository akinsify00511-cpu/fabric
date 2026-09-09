-- Production security hardening: every public function must use an explicit search_path.
-- Applies only where no function-level search_path is already configured.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proconfig IS NULL
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions, auth, storage, pg_temp',
      r.schema_name, r.function_name, r.identity_args
    );
  END LOOP;
END $$;
