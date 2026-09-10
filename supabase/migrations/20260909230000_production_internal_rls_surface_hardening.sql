-- Production security hardening: internal RLS-protected tables must not be directly exposed
-- to anon/authenticated. Server-side SECURITY DEFINER / service-role paths remain available.
--
-- Some historical installations do not contain every internal table. Keep this
-- migration fail-closed for the objects that exist without making a clean
-- database impossible to bootstrap.
do $$
declare
  rel text;
  tables text[] := array[
    'auth_rate_limits','autonomy_actions','business_email_domains','email_events',
    'governance_audit_log','governance_events','governance_incidents','governance_reports',
    'human_decisions','integrity_dependencies','intelligence_notification_log',
    'payment_webhook_events','plan_pricing','platform_alert_thresholds','platform_error_events',
    'platform_incident_investigations','platform_incidents','platform_integration_status',
    'platform_oncall_contacts','platform_pages','platform_payment_instructions',
    'report_filters','report_snapshots','transactional_email_templates',
    'webauthn_challenges','webhook_logs'
  ];
begin
  foreach rel in array tables loop
    if to_regclass('public.' || rel) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', rel);
    end if;
  end loop;
end $$;
