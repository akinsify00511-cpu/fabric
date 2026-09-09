-- Production security hardening: internal RLS-protected tables must not be directly exposed
-- to anon/authenticated. Server-side SECURITY DEFINER / service-role paths remain available.

revoke all on table
  public.auth_rate_limits,
  public.autonomy_actions,
  public.business_email_domains,
  public.email_events,
  public.governance_audit_log,
  public.governance_events,
  public.governance_incidents,
  public.governance_reports,
  public.human_decisions,
  public.integrity_dependencies,
  public.intelligence_notification_log,
  public.payment_webhook_events,
  public.plan_pricing,
  public.platform_alert_thresholds,
  public.platform_error_events,
  public.platform_incident_investigations,
  public.platform_incidents,
  public.platform_integration_status,
  public.platform_oncall_contacts,
  public.platform_pages,
  public.platform_payment_instructions,
  public.report_filters,
  public.report_snapshots,
  public.transactional_email_templates,
  public.webauthn_challenges,
  public.webhook_logs
from anon, authenticated;
