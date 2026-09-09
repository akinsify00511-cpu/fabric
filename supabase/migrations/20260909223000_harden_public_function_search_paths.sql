-- Production security hardening: pin search_path on remaining public functions flagged by Supabase.
-- These are SECURITY INVOKER trigger/helper/query functions; explicitly pinning the path
-- removes role-controlled search_path resolution without changing authorization semantics.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid,
           n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = false
      AND p.proname IN (
        'update_updated_at','enforce_content_quality_gate','check_staff_automations',
        'touch_quotes_updated_at','set_first_response','user_is_admin','generate_mfa_backup_codes',
        'update_updated_at_column','br_set_risk_score','touch_workspace_selections_updated_at',
        'create_default_kb_space','check_invoice_automations','check_task_automations',
        'action_protocol_steps','update_daily_summary','seed_default_job_types','get_webhook_events',
        'on_business_created','seed_default_functional_roles','seed_default_pipeline_stages',
        'get_team_count','col_text','action_authority_rung_rank','trigger_deal_automation',
        'set_updated_at','deal_stage_age_days','enforce_payment_transaction_transition',
        'contract_normalize_args','check_deal_automations','ensure_business_approval_config',
        'can_add_team_member','update_subsidiary_profile_timestamp','sanitize_platform_payload',
        'sync_payment_aliases','sync_notification_message','sync_contact_name'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions, auth, storage, pg_temp',
      r.schema_name, r.function_name, r.identity_args
    );
  END LOOP;
END $$;
