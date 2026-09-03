-- Brutal closure: remove accidental public execution and harden cross-tenant mutation paths.
REVOKE EXECUTE ON FUNCTION public.builder_dashboard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.business_relationships(UUID,TEXT,UUID,INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_capture(TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_lead_request(UUID,TEXT,TEXT,TEXT,UUID,NUMERIC,TEXT,NUMERIC,TEXT,JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_quote(UUID,TEXT,JSONB,UUID,NUMERIC,NUMERIC,TIMESTAMPTZ,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_sales_order(UUID,UUID,UUID,UUID,JSONB,NUMERIC,TEXT,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.demand_pipeline(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.demand_revenue(UUID,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_recording(TEXT,INTEGER,BIGINT,UUID,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_recording_signed_url(TEXT,INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_meeting_reports(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_capture_view(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_saved_search_use(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_user_learning(UUID,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_meeting_to_crm(UUID,TEXT,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_security_event(TEXT,UUID,TEXT,TEXT,TEXT,UUID,JSONB,BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_demand(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_leave_balance(UUID,UUID,NUMERIC,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_manual_time_entry(TEXT,TIMESTAMPTZ,TIMESTAMPTZ,BOOLEAN,TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_mfa_backup_codes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_webhook_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_functional_roles(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_job_types(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_pipeline_stages(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_daily_summary(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.builder_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_relationships(UUID,TEXT,UUID,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_capture(TEXT,TEXT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lead_request(UUID,TEXT,TEXT,TEXT,UUID,NUMERIC,TEXT,NUMERIC,TEXT,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quote(UUID,TEXT,JSONB,UUID,NUMERIC,NUMERIC,TIMESTAMPTZ,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order(UUID,UUID,UUID,UUID,JSONB,NUMERIC,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demand_pipeline(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demand_revenue(UUID,TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_recording(TEXT,INTEGER,BIGINT,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recording_signed_url(TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meeting_reports(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_capture_view(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_saved_search_use(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_user_learning(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_meeting_to_crm(UUID,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT,UUID,TEXT,TEXT,TEXT,UUID,JSONB,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_demand(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_leave_balance(UUID,UUID,NUMERIC,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_manual_time_entry(TEXT,TIMESTAMPTZ,TIMESTAMPTZ,BOOLEAN,TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_webhook_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exchange_rate(TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_currency(NUMERIC,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_user_learning(p_user_id UUID,p_field TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF p_field IS NULL OR p_field !~ '^[A-Za-z0-9_-]{1,64}$' THEN RAISE EXCEPTION 'invalid learning field' USING ERRCODE='22023'; END IF;
  UPDATE public.user_learning
  SET learning_data=jsonb_set(COALESCE(learning_data,'{}'::jsonb),ARRAY[p_field],to_jsonb(COALESCE((learning_data->>p_field)::INT,0)+1),true),updated_at=NOW()
  WHERE user_id=auth.uid();
END; $$;

CREATE OR REPLACE FUNCTION public.increment_saved_search_use(p_search_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_business UUID; v_user UUID; v_shared BOOLEAN;
BEGIN
  SELECT business_id,user_id,is_shared INTO v_business,v_user,v_shared FROM public.saved_searches WHERE id=p_search_id;
  IF v_business IS NULL OR NOT EXISTS (SELECT 1 FROM public.get_current_staff() s WHERE s.business_id=v_business) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF v_user IS DISTINCT FROM auth.uid() AND COALESCE(v_shared,false) IS NOT TRUE THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  UPDATE public.saved_searches SET use_count=use_count+1,updated_at=NOW() WHERE id=p_search_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_leave_balance(p_staff_id UUID,p_leave_type_id UUID,p_days NUMERIC,p_type TEXT DEFAULT 'approve')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.staff%ROWTYPE; v_balance public.leave_balances%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.staff WHERE user_id=auth.uid() AND COALESCE(is_active,active,true) LIMIT 1;
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('owner','admin','manager') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF p_days IS NULL OR p_days <= 0 OR p_days > 366 THEN RAISE EXCEPTION 'invalid leave days' USING ERRCODE='22023'; END IF;
  IF p_type NOT IN ('approve','reject','pending') THEN RAISE EXCEPTION 'invalid balance operation' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_balance FROM public.leave_balances WHERE staff_id=p_staff_id AND leave_type_id=p_leave_type_id AND year=EXTRACT(YEAR FROM NOW())::INT FOR UPDATE;
  IF v_balance.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id=p_staff_id AND s.business_id=v_actor.business_id) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  IF p_type='approve' THEN
    IF v_balance.used_days+p_days > v_balance.total_days THEN RAISE EXCEPTION 'leave balance exceeded'; END IF;
    UPDATE public.leave_balances SET used_days=used_days+p_days,pending_days=GREATEST(pending_days-p_days,0),updated_at=NOW() WHERE id=v_balance.id;
  ELSIF p_type='reject' THEN
    UPDATE public.leave_balances SET pending_days=GREATEST(pending_days-p_days,0),updated_at=NOW() WHERE id=v_balance.id;
  ELSE
    IF v_balance.pending_days+p_days > v_balance.total_days-v_balance.used_days THEN RAISE EXCEPTION 'leave balance exceeded'; END IF;
    UPDATE public.leave_balances SET pending_days=pending_days+p_days,updated_at=NOW() WHERE id=v_balance.id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.link_meeting_to_crm(p_meeting_id UUID,p_entity_type TEXT,p_entity_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_business UUID;
BEGIN
  SELECT business_id INTO v_business FROM public.meetings WHERE id=p_meeting_id;
  IF v_business IS NULL OR NOT EXISTS (SELECT 1 FROM public.get_current_staff() s WHERE s.business_id=v_business) THEN RETURN FALSE; END IF;
  IF p_entity_type NOT IN ('lead','deal','contact','customer') THEN RETURN FALSE; END IF;
  IF p_entity_type='lead' AND NOT EXISTS (SELECT 1 FROM public.leads WHERE id=p_entity_id AND business_id=v_business) THEN RETURN FALSE; END IF;
  IF p_entity_type='deal' AND NOT EXISTS (SELECT 1 FROM public.deals WHERE id=p_entity_id AND business_id=v_business) THEN RETURN FALSE; END IF;
  IF p_entity_type='contact' AND NOT EXISTS (SELECT 1 FROM public.contacts WHERE id=p_entity_id AND business_id=v_business) THEN RETURN FALSE; END IF;
  IF p_entity_type='customer' AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id=p_entity_id AND business_id=v_business) THEN RETURN FALSE; END IF;
  UPDATE public.meetings SET related_entity_type=p_entity_type,related_entity_id=p_entity_id WHERE id=p_meeting_id;
  RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.create_quote(p_lead_id UUID,p_title TEXT,p_items JSONB DEFAULT '[]'::jsonb,p_request_id UUID DEFAULT NULL,p_subtotal NUMERIC DEFAULT NULL,p_vat NUMERIC DEFAULT 0,p_valid_until TIMESTAMPTZ DEFAULT NULL,p_assigned_to UUID DEFAULT NULL)
RETURNS UUID SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_contact UUID; v_id UUID; v_total NUMERIC; v_subtotal NUMERIC; v_lead public.leads%ROWTYPE; v_req_business UUID; v_assignee_business UUID;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id=p_lead_id;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;
  v_business:=v_lead.business_id;
  IF NOT EXISTS(SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id=v_business) THEN RAISE EXCEPTION 'not a member'; END IF;
  IF p_request_id IS NOT NULL THEN
    SELECT business_id INTO v_req_business FROM public.lead_requests WHERE id=p_request_id AND lead_id=p_lead_id;
    IF v_req_business IS DISTINCT FROM v_business THEN RAISE EXCEPTION 'invalid request'; END IF;
  END IF;
  IF p_assigned_to IS NOT NULL THEN
    SELECT business_id INTO v_assignee_business FROM public.staff WHERE id=p_assigned_to AND COALESCE(is_active,active,true);
    IF v_assignee_business IS DISTINCT FROM v_business THEN RAISE EXCEPTION 'invalid assignee'; END IF;
  END IF;
  IF (p_subtotal IS NOT NULL AND p_subtotal < 0) OR COALESCE(p_vat,0) < 0 THEN RAISE EXCEPTION 'negative quote amount'; END IF;
  IF p_valid_until IS NOT NULL AND p_valid_until <= NOW() THEN RAISE EXCEPTION 'quote expiry must be in the future'; END IF;
  v_contact:=(SELECT c.id FROM public.contacts c WHERE c.lead_id=p_lead_id AND c.business_id=v_business LIMIT 1);
  v_subtotal:=COALESCE(p_subtotal,(SELECT SUM((item->>'quantity')::numeric*(item->>'unit_price')::numeric) FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) AS item));
  IF COALESCE(v_subtotal,0) < 0 THEN RAISE EXCEPTION 'negative quote subtotal'; END IF;
  v_total:=COALESCE(v_subtotal,0)+COALESCE(p_vat,0);
  INSERT INTO public.quotes(business_id,quote_number,lead_id,request_id,contact_id,client_name,client_email,title,items,subtotal,vat_amount,total,valid_until,assigned_to,access_token,status)
  VALUES(v_business,'Q-'||upper(substring(encode(gen_random_bytes(6),'hex') from 1 for 10)),p_lead_id,p_request_id,v_contact,v_lead.full_name,v_lead.email,p_title,COALESCE(p_items,'[]'::jsonb),COALESCE(v_subtotal,0),COALESCE(p_vat,0),v_total,p_valid_until,COALESCE(p_assigned_to,(SELECT id FROM public.staff WHERE user_id=auth.uid() AND business_id=v_business LIMIT 1)),encode(gen_random_bytes(24),'hex'),'draft') RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_sales_order(p_lead_id UUID DEFAULT NULL,p_request_id UUID DEFAULT NULL,p_quote_id UUID DEFAULT NULL,p_contact_id UUID DEFAULT NULL,p_items JSONB DEFAULT '[]'::jsonb,p_total NUMERIC DEFAULT 0,p_title TEXT DEFAULT NULL,p_assigned_to UUID DEFAULT NULL)
RETURNS UUID SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
DECLARE v_business UUID; v_assignee UUID; v_id UUID; v_lead UUID:=p_lead_id; v_contact UUID:=p_contact_id; v_quote_total NUMERIC;
BEGIN
  IF p_total IS NULL OR p_total < 0 THEN RAISE EXCEPTION 'invalid order total'; END IF;
  IF p_quote_id IS NOT NULL THEN
    SELECT q.business_id,q.assigned_to,q.lead_id,q.request_id,q.contact_id,q.total INTO v_business,v_assignee,v_lead,p_request_id,v_contact,v_quote_total FROM public.quotes q WHERE q.id=p_quote_id AND q.status='accepted';
    IF v_business IS NULL THEN RAISE EXCEPTION 'accepted quote not found'; END IF;
    IF p_total IS DISTINCT FROM v_quote_total THEN RAISE EXCEPTION 'order total must match accepted quote'; END IF;
  ELSIF p_request_id IS NOT NULL THEN
    SELECT r.business_id,COALESCE(r.assigned_to,(SELECT id FROM public.staff WHERE user_id=auth.uid() AND business_id=r.business_id LIMIT 1)),r.lead_id,r.contact_id INTO v_business,v_assignee,v_lead,v_contact FROM public.lead_requests r WHERE r.id=p_request_id;
  ELSIF p_lead_id IS NOT NULL THEN
    SELECT l.business_id,COALESCE(l.assigned_to,(SELECT id FROM public.staff WHERE user_id=auth.uid() AND business_id=l.business_id LIMIT 1)),l.id INTO v_business,v_assignee,v_lead FROM public.leads l WHERE l.id=p_lead_id;
  ELSE
    SELECT s.business_id,s.id INTO v_business,v_assignee FROM public.staff s WHERE s.user_id=auth.uid() AND COALESCE(s.is_active,s.active,true) LIMIT 1;
  END IF;
  IF v_business IS NULL OR NOT EXISTS(SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id=v_business) THEN RAISE EXCEPTION 'not a member'; END IF;
  IF p_contact_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contacts c WHERE c.id=p_contact_id AND c.business_id=v_business) THEN RAISE EXCEPTION 'invalid contact'; END IF;
  IF p_lead_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=p_lead_id AND l.business_id=v_business) THEN RAISE EXCEPTION 'invalid lead'; END IF;
  IF p_request_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lead_requests r WHERE r.id=p_request_id AND r.business_id=v_business) THEN RAISE EXCEPTION 'invalid request'; END IF;
  IF p_assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.staff s WHERE s.id=p_assigned_to AND s.business_id=v_business AND COALESCE(s.is_active,s.active,true)) THEN RAISE EXCEPTION 'invalid assignee'; END IF;
  INSERT INTO public.sales_orders(business_id,contact_id,lead_id,request_id,quote_id,items,total,status,assigned_to) VALUES(v_business,v_contact,v_lead,p_request_id,p_quote_id,COALESCE(p_items,'[]'::jsonb),p_total,'confirmed',COALESCE(p_assigned_to,v_assignee)) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.respond_to_quote(p_token TEXT,p_action TEXT)
RETURNS public.quotes SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
DECLARE v_quote public.quotes%ROWTYPE;
BEGIN
  IF p_action NOT IN ('accepted','rejected') THEN RAISE EXCEPTION 'invalid action'; END IF;
  SELECT * INTO v_quote FROM public.quotes WHERE access_token=p_token AND (expires_at IS NULL OR expires_at>NOW()) FOR UPDATE;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'quote not found or expired'; END IF;
  IF v_quote.status IN ('accepted','rejected') THEN IF v_quote.status=p_action THEN RETURN v_quote; ELSE RAISE EXCEPTION 'quote is already finalized'; END IF; END IF;
  UPDATE public.quotes SET status=p_action,updated_at=NOW() WHERE id=v_quote.id RETURNING * INTO v_quote;
  IF v_quote.request_id IS NOT NULL AND p_action='accepted' THEN UPDATE public.lead_requests SET status='accepted',updated_at=NOW() WHERE id=v_quote.request_id AND business_id=v_quote.business_id; END IF;
  RETURN v_quote;
END; $$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice_id UUID,p_amount NUMERIC,p_payment_method TEXT DEFAULT 'manual',p_reference TEXT DEFAULT NULL,p_business_id UUID DEFAULT NULL)
RETURNS JSONB SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
DECLARE v_staff RECORD; v_bid UUID; v_invoice RECORD; v_existing RECORD; v_new_paid NUMERIC(12,2); v_new_balance NUMERIC(12,2); v_new_status TEXT; v_payment_id UUID;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff();
  IF NOT FOUND OR v_staff.business_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','NOT_AUTHORIZED'); END IF;
  v_bid:=COALESCE(p_business_id,v_staff.business_id);
  IF v_bid IS DISTINCT FROM v_staff.business_id THEN RETURN jsonb_build_object('ok',false,'error','NOT_AUTHORIZED'); END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RETURN jsonb_build_object('ok',false,'error','INVALID_AMOUNT'); END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND business_id=v_bid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','INVOICE_NOT_FOUND'); END IF;
  IF p_reference IS NOT NULL AND btrim(p_reference)<>'' THEN
    SELECT * INTO v_existing FROM public.payments WHERE business_id=v_bid AND reference=p_reference ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('ok',true,'already',true,'payment_id',v_existing.id,'amount',v_existing.amount); END IF;
  END IF;
  IF p_amount > GREATEST(v_invoice.total-COALESCE(v_invoice.amount_paid,0),0) THEN RETURN jsonb_build_object('ok',false,'error','OVERPAYMENT_NOT_ALLOWED'); END IF;
  v_new_paid:=COALESCE(v_invoice.amount_paid,0)+p_amount; v_new_balance:=v_invoice.total-v_new_paid;
  v_new_status:=CASE WHEN v_new_balance<=0 THEN 'paid' WHEN v_new_balance<v_invoice.total THEN 'sent' ELSE v_invoice.status END;
  UPDATE public.invoices SET amount_paid=v_new_paid,balance=v_new_balance,status=v_new_status WHERE id=p_invoice_id;
  INSERT INTO public.payments(business_id,invoice_id,amount,payment_method,reference,date) VALUES(v_bid,p_invoice_id,p_amount,p_payment_method,p_reference,CURRENT_DATE) RETURNING id INTO v_payment_id;
  RETURN jsonb_build_object('ok',true,'payment_id',v_payment_id,'amount_paid',v_new_paid,'balance',v_new_balance,'status',v_new_status);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'error','DUPLICATE_PAYMENT_REFERENCE');
WHEN OTHERS THEN RAISE NOTICE 'record_invoice_payment failed: %',SQLERRM; RETURN jsonb_build_object('ok',false,'error','PAYMENT_RECORD_FAILED'); END; $$;
REVOKE EXECUTE ON FUNCTION public.record_invoice_payment(UUID,NUMERIC,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID,NUMERIC,TEXT,TEXT,UUID) TO authenticated;
