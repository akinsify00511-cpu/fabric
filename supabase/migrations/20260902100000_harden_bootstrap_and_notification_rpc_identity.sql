CREATE OR REPLACE FUNCTION public.bootstrap_business(p_business_name text, p_staff_full_name text, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(business_id uuid, user_id uuid, staff_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp'
AS $$
DECLARE v_user_id uuid; v_business_id uuid; v_staff_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  v_user_id := auth.uid();
  INSERT INTO public.businesses(name) VALUES (p_business_name) RETURNING id INTO v_business_id;
  INSERT INTO public.staff(business_id,user_id,name,email,role,full_name)
  SELECT v_business_id,v_user_id,p_staff_full_name,COALESCE(raw_user_meta_data->>'email',''),'owner',p_staff_full_name
  FROM auth.users WHERE id=v_user_id RETURNING id INTO v_staff_id;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Authenticated user not found'; END IF;
  RETURN QUERY SELECT v_business_id,v_user_id,v_staff_id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_default_notification_preferences(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.notification_preferences(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
END; $$;
