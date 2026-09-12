-- Close the cross-tenant policy predicate vulnerability class.
--
-- The broken form `business_id IN (SELECT id FROM businesses)` is an
-- existence check over every tenant, not an authorization check. This
-- migration repairs any remaining live policy using that predicate and makes
-- the repair self-healing for databases that accumulated legacy policies.
--
-- Security invariant: business-scoped client policies must derive the
-- business boundary from the authenticated staff context (or an explicitly
-- authorized accessible-business function), never from the existence of the
-- business row itself.

DO $$
DECLARE
  p record;
  v_qual text;
  v_check text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = ARRAY['public']::name[]
      AND (
        coalesce(qual, '') ~* 'business_id[[:space:]]+IN[[:space:]]*\([[:space:]]*SELECT[[:space:]]+businesses\.id[[:space:]]+FROM[[:space:]]+businesses'
        OR coalesce(with_check, '') ~* 'business_id[[:space:]]+IN[[:space:]]*\([[:space:]]*SELECT[[:space:]]+businesses\.id[[:space:]]+FROM[[:space:]]+businesses'
      )
  LOOP
    v_qual := CASE WHEN p.qual IS NULL THEN NULL ELSE regexp_replace(
      p.qual,
      'business_id[[:space:]]+IN[[:space:]]*\([[:space:]]*SELECT[[:space:]]+businesses\.id[[:space:]]+FROM[[:space:]]+businesses[[:space:]]*\)',
      'business_id IN (SELECT business_id FROM get_current_staff())',
      'gi'
    ) END;
    v_check := CASE WHEN p.with_check IS NULL THEN NULL ELSE regexp_replace(
      p.with_check,
      'business_id[[:space:]]+IN[[:space:]]*\([[:space:]]*SELECT[[:space:]]+businesses\.id[[:space:]]+FROM[[:space:]]+businesses[[:space:]]*\)',
      'business_id IN (SELECT business_id FROM get_current_staff())',
      'gi'
    ) END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);

    IF p.cmd = 'INSERT' THEN
      IF v_check IS NOT NULL THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR INSERT WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, v_check);
      END IF;
    ELSIF p.cmd = 'SELECT' THEN
      IF v_qual IS NOT NULL THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR SELECT USING (%s)', p.policyname, p.schemaname, p.tablename, v_qual);
      END IF;
    ELSIF p.cmd = 'UPDATE' THEN
      IF v_qual IS NOT NULL AND v_check IS NOT NULL THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE USING (%s) WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, v_qual, v_check);
      ELSIF v_qual IS NOT NULL THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE USING (%s)', p.policyname, p.schemaname, p.tablename, v_qual);
      ELSIF v_check IS NOT NULL THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, v_check);
      END IF;
    ELSIF p.cmd = 'DELETE' THEN
      IF v_qual IS NOT NULL THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR DELETE USING (%s)', p.policyname, p.schemaname, p.tablename, v_qual);
      END IF;
    ELSE
      IF v_qual IS NOT NULL AND v_check IS NOT NULL THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL USING (%s) WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, v_qual, v_check);
      ELSIF v_qual IS NOT NULL THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL USING (%s)', p.policyname, p.schemaname, p.tablename, v_qual);
      ELSIF v_check IS NOT NULL THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, v_check);
      END IF;
    END IF;
  END LOOP;
END $$;
