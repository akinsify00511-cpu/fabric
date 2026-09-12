DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename = ANY(ARRAY['api_keys','bank_accounts','bank_transactions','business_entitlements','business_branding','payments','quotes','requisitions','settings','staff','notifications']) AND 'public'=ANY(roles) LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',r.policyname,r.schemaname,r.tablename); END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys','bank_accounts','bank_transactions','business_entitlements','business_branding','payments','quotes','requisitions','settings','staff','notifications','auth_rate_limits'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',t);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['api_keys_owner_manage','bank_accounts_member_manage','bank_transactions_member_manage','business_entitlements_member_manage','business_entitlements_member_read','business_branding_owner_manager_write','business_branding_member_read','payments_member_manage','payments_member_read','quotes_member_manage','requisitions_member_manage','settings_member_manage','settings_member_read','staff_owner_admin_manage','staff_member_read','staff_self_update','notifications_member_manage'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',p,CASE WHEN p LIKE 'api_keys%' THEN 'api_keys' WHEN p LIKE 'bank_accounts%' THEN 'bank_accounts' WHEN p LIKE 'bank_transactions%' THEN 'bank_transactions' WHEN p LIKE 'business_entitlements%' THEN 'business_entitlements' WHEN p LIKE 'business_branding%' THEN 'business_branding' WHEN p LIKE 'payments%' THEN 'payments' WHEN p LIKE 'quotes%' THEN 'quotes' WHEN p LIKE 'requisitions%' THEN 'requisitions' WHEN p LIKE 'settings%' THEN 'settings' WHEN p LIKE 'staff%' THEN 'staff' ELSE 'notifications' END);
  END LOOP;
END $$;

CREATE POLICY api_keys_owner_manage ON public.api_keys FOR ALL TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role='owner')) WITH CHECK (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role='owner'));
CREATE POLICY bank_accounts_member_manage ON public.bank_accounts FOR ALL TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s)) WITH CHECK (business_id IN (SELECT s.business_id FROM public.get_current_staff() s));
CREATE POLICY bank_transactions_member_manage ON public.bank_transactions FOR ALL TO authenticated USING (bank_account_id IN (SELECT b.id FROM public.bank_accounts b WHERE b.business_id IN (SELECT s.business_id FROM public.get_current_staff() s))) WITH CHECK (bank_account_id IN (SELECT b.id FROM public.bank_accounts b WHERE b.business_id IN (SELECT s.business_id FROM public.get_current_staff() s)));
CREATE POLICY business_entitlements_member_manage ON public.business_entitlements FOR ALL TO authenticated USING (business_id IN (SELECT s.business_id FROM public.staff s WHERE s.user_id=auth.uid() AND s.role IN ('owner','admin'))) WITH CHECK (business_id IN (SELECT s.business_id FROM public.staff s WHERE s.user_id=auth.uid() AND s.role IN ('owner','admin')));
CREATE POLICY business_entitlements_member_read ON public.business_entitlements FOR SELECT TO authenticated USING (business_id IN (SELECT s.business_id FROM public.staff s WHERE s.user_id=auth.uid()));
CREATE POLICY business_branding_owner_manager_write ON public.business_branding FOR ALL TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role IN ('owner','manager'))) WITH CHECK (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role IN ('owner','manager')));
CREATE POLICY business_branding_member_read ON public.business_branding FOR SELECT TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s));
CREATE POLICY payments_member_manage ON public.payments FOR ALL TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role IN ('owner','manager'))) WITH CHECK (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role IN ('owner','manager')));
CREATE POLICY payments_member_read ON public.payments FOR SELECT TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s));
CREATE POLICY quotes_member_manage ON public.quotes FOR ALL TO authenticated USING (business_id IN (SELECT s.business_id FROM public.staff s WHERE s.user_id=auth.uid())) WITH CHECK (business_id IN (SELECT s.business_id FROM public.staff s WHERE s.user_id=auth.uid()));
CREATE POLICY requisitions_member_manage ON public.requisitions FOR ALL TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s)) WITH CHECK (business_id IN (SELECT s.business_id FROM public.get_current_staff() s));
CREATE POLICY settings_member_manage ON public.settings FOR ALL TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role IN ('owner','admin')) AND (type IS DISTINCT FROM 'secret' OR EXISTS (SELECT 1 FROM public.get_current_staff() s2 WHERE s2.business_id=settings.business_id AND s2.role IN ('owner','manager')))) WITH CHECK (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role IN ('owner','admin')) AND (type IS DISTINCT FROM 'secret' OR EXISTS (SELECT 1 FROM public.get_current_staff() s2 WHERE s2.business_id=settings.business_id AND s2.role IN ('owner','manager'))));
CREATE POLICY settings_member_read ON public.settings FOR SELECT TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s) AND (type IS DISTINCT FROM 'secret' OR EXISTS (SELECT 1 FROM public.get_current_staff() s2 WHERE s2.business_id=settings.business_id AND s2.role IN ('owner','manager'))));
CREATE POLICY staff_owner_admin_manage ON public.staff FOR ALL TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role IN ('owner','admin'))) WITH CHECK (business_id IN (SELECT s.business_id FROM public.get_current_staff() s WHERE s.role IN ('owner','admin')));
CREATE POLICY staff_member_read ON public.staff FOR SELECT TO authenticated USING (business_id IN (SELECT s.business_id FROM public.get_current_staff() s) OR user_id=auth.uid());
CREATE POLICY staff_self_update ON public.staff FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY notifications_member_manage ON public.notifications FOR ALL TO authenticated USING (user_id=auth.uid() OR business_id IN (SELECT s.business_id FROM public.get_current_staff() s)) WITH CHECK (user_id=auth.uid() OR business_id IN (SELECT s.business_id FROM public.get_current_staff() s));

GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(text,text,integer,integer,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_auth_failure(text,text,integer,integer,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_auth_rate_limit(text,text) TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
DO $$ BEGIN ALTER FUNCTION public.check_auth_rate_limit(text,text,integer,integer,integer) SET search_path=public,pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.record_auth_failure(text,text,integer,integer,integer) SET search_path=public,pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.reset_auth_rate_limit(text,text) SET search_path=public,pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.validate_invite_token(text) SET search_path=public,pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
REVOKE ALL ON TABLE public.auth_rate_limits FROM anon, authenticated;
COMMENT ON TABLE public.auth_rate_limits IS 'Security control: pre-auth rate limiting; direct Data API access disabled.';
