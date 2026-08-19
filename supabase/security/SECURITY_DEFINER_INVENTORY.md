# SECURITY DEFINER Inventory (generated — scripts/security_inventory.py)

- Functions scanned (latest definition): **417**
- SECURITY DEFINER: **271**
- Public/token-gated by design: **12**
- Flagged: **271** (BIZID_UNGUARDED: **77**)

| Function | Params | DEFINER | Guarded | biz_id | search_path | Grants | Flags |
|---|---|---|---|---|---|---|---|
| `_ensure_test_auth_user` | p_email TEXT | YES | no |  | NO | service_role | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `accept_invite` | p_invite_id TEXT,
  p_staff_full_name TEXT,
  p_user_id UUID | YES | yes |  | NO | authenticated | NO_SEARCH_PATH |
| `accept_invite` | p_token TEXT,
  p_staff_name TEXT DEFAULT NULL | YES | yes |  | NO | authenticated | NO_SEARCH_PATH |
| `accept_invite` | p_token TEXT,
  p_user_id UUID,
  p_name TEXT,
  p_email TEX | YES | yes |  | NO | authenticated | NO_SEARCH_PATH |
| `accept_portal_invitation` | p_token TEXT | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `acknowledge_incident` | p_incident_id UUID, p_reason TEXT DEFAULT NULL | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `acknowledge_recommendation` | p_claim_id UUID, p_by UUID | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `action_authority_rung_rank` | p_rung TEXT |  | no |  | NO | default |  |
| `action_protocol_steps` |  |  | no |  | NO | default |  |
| `add_manual_time_entry` | p_description TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `advance_action_step` | p_run_id UUID, p_step TEXT, p_note TEXT DEFAULT NULL, p_resu | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `advance_incident` | p_incident_id UUID, p_stage TEXT | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `advance_migration` | p_job_id UUID, p_stage TEXT | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `apply_goods_receipt` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `approval_requests_update` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `approve_requisition` | p_requisition_id UUID,
  p_amount_approved NUMERIC DEFAULT N | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `approve_time_off` | p_request_id UUID | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `assess_four_reality_discrepancy` | p_assessment_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `audit_procurement_event` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `audit_property_commission` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `audit_row_change` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `audit_signature_event` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `automation_health` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `automation_health_with_dlq` | p_business_id UUID | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `award_xp` | p_user_id UUID,
  p_xp_amount INTEGER,
  p_action_type TEXT, | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `award_xp_with_streak` | p_user_id UUID,
  p_xp_amount INTEGER,
  p_action TEXT,
  p_ | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `blocked_work` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `bootstrap_business` | p_business_name TEXT,
  p_owner_name TEXT,
  p_email TEXT,
  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `bootstrap_business` | p_business_name TEXT,
  p_staff_full_name TEXT,
  p_user_id  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `br_set_risk_score` |  |  | no |  | NO | default |  |
| `broadcast_notification` | p_business_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body  | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `builder_dashboard` |  |  | yes |  | NO | authenticated |  |
| `business_brain` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `business_relationships` | p_business_id UUID, p_start_type TEXT, p_start_id UUID, p_ma | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `business_value_ledger` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `calculate_level` | p_xp INTEGER |  | no |  | NO | default |  |
| `can_access_module` | p_business_id UUID,
  p_module_key TEXT |  | no | yes | NO | authenticated |  |
| `can_add_team_member` | p_business_id UUID |  | no | yes | NO | default |  |
| `can_approve` | p_business_id UUID, p_staff_id UUID, p_entity_type TEXT, p_a | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `cancel_registration` | p_registration_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `cancel_subscription` | p_business_id UUID, p_cancel_at_period_end BOOLEAN DEFAULT t | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `capacity_intelligence` | p_business_id UUID | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `cashflow_forecast_intelligence` | p_business_id UUID, p_days INT DEFAULT 30 | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `check_achievements` | p_user_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `check_ai_action_authority` | p_business_id UUID, p_agent_id UUID, p_capability TEXT, p_ru | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `check_api_key_usage` | p_key_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `check_auth_rate_limit` | p_identifier TEXT,
  p_action TEXT,
  p_max_attempts INTEGER | YES | no |  | NO | anon' | NO_SEARCH_PATH |
| `check_deal_automations` |  |  | no |  | NO | default |  |
| `check_in_attendee` | p_registration_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `check_invoice_automations` |  |  | no |  | NO | default |  |
| `check_separation_of_duties` | p_business_id UUID, p_staff_id UUID, p_entity_type TEXT,
  p | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `check_staff_automations` |  |  | no |  | NO | default |  |
| `check_task_automations` |  |  | no |  | NO | default |  |
| `classify_business_state` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `cleanup_expired_rate_limits` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `cleanup_golden_datasets` |  | YES | no |  | NO | authenticated, service_role | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `clear_active_role` | p_staff_id UUID | YES | yes |  | NO | authenticated | NO_SEARCH_PATH |
| `clock_in_staff` | p_lat numeric default null,p_lng numeric default null,p_accu |  | yes |  | NO | authenticated |  |
| `clock_out_staff` | p_lat numeric default null,p_lng numeric default null,p_accu |  | yes |  | NO | authenticated |  |
| `col_text` | r RECORD, c TEXT |  | no |  | NO | default |  |
| `company_tree` | p_business_id UUID, p_root_id UUID DEFAULT NULL | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `compensation_review_recommendation` | p_business_id UUID, p_staff_id UUID | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `complete_field_visit` | p_visit_id uuid,p_outcome text,p_notes text default null,p_l |  | yes |  | NO | authenticated |  |
| `compose_business_digest` | p_business_id UUID,
  p_digest_type TEXT DEFAULT 'daily' |  | yes | yes | NO | authenticated |  |
| `compose_business_review` | p_business_id UUID,
  p_period_start DATE DEFAULT NULL,
  p_ | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `compute_all_business_health` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `compute_business_health` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `compute_ebitda` | p_business_id UUID,
  p_period_start DATE DEFAULT NULL,
  p_ |  | yes | yes | NO | authenticated |  |
| `confirm_receipt` | p_receipt_id UUID |  | yes |  | NO | authenticated |  |
| `continuity_status` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `convenience_index` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `convert_currency` | p_amount DECIMAL, p_from_currency TEXT, p_to_currency TEXT | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `copilot_daily_usage` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `create_action_task` | p_action_id UUID,
  p_title TEXT,
  p_assignee_id UUID DEFAU |  | yes |  | NO | authenticated |  |
| `create_business_and_owner` | p_business_name TEXT,
  p_industry TEXT DEFAULT NULL,
  p_st | YES | yes |  | NO | authenticated | NO_SEARCH_PATH |
| `create_capture` | p_title TEXT,
  p_capture_type TEXT DEFAULT 'screen',
  p_de |  | yes |  | NO | authenticated |  |
| `create_default_channel` |  |  | yes |  | NO | default |  |
| `create_default_kb_space` |  |  | yes |  | NO | default |  |
| `create_default_notification_preferences` | p_user_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `create_field_visit` | p_assigned_staff_id uuid,p_customer_name text,p_customer_pho |  | yes |  | NO | authenticated |  |
| `create_invite` | p_email TEXT,
  p_role TEXT | YES | yes |  | NO | authenticated | NO_SEARCH_PATH |
| `create_invite` | p_email TEXT,
  p_role TEXT DEFAULT 'staff',
  p_business_id |  | yes | yes | NO | authenticated |  |
| `create_invite` | p_email TEXT,
  p_role TEXT DEFAULT 'staff',
  p_member_kind |  | yes | yes | NO | authenticated |  |
| `create_invoice` | p_client_name TEXT,
  p_items JSONB,                       - |  | yes | yes | NO | authenticated |  |
| `create_journal_entry` | p_date DATE,
  p_description TEXT,
  p_lines JSONB -- [{"acc | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `create_meeting` | p_business_id UUID,
  p_title TEXT,
  p_scheduled_start TIME |  | yes | yes | NO | authenticated |  |
| `create_notification` | p_user_id UUID,
  p_business_id UUID,
  p_title TEXT,
  p_me | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `create_portal_session` | p_invitation_id UUID | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `create_receipt_upload_path` | p_filename TEXT |  | yes |  | NO | authenticated |  |
| `create_recording_upload_path` | p_meeting_id UUID DEFAULT NULL,
  p_capture_id UUID DEFAULT  |  | yes |  | NO | authenticated |  |
| `create_requisition` | p_title TEXT,
  p_category_id UUID DEFAULT NULL,
  p_descrip | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `create_subsidiary` | p_name TEXT,
  p_entity_type TEXT DEFAULT 'subsidiary',
  p_ |  | yes | yes | NO | authenticated |  |
| `create_subsidiary` | p_name TEXT,
  p_entity_type TEXT DEFAULT 'subsidiary',
  p_ |  | yes | yes | NO | authenticated |  |
| `current_business_health` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `current_metrics` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `data_integrity_scores` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `data_quality_findings` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `db_is_current` | p_expected_min INTEGER DEFAULT 0 |  | no |  | NO | authenticated |  |
| `db_schema_version` |  |  | no |  | NO | authenticated |  |
| `deal_stage_age_days` | p_deal_id UUID |  | no |  | NO | authenticated |  |
| `decide_timesheet` | p_timesheet_id UUID, p_decision TEXT, p_approver_id UUID, p_ | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `decline_signature` | p_token TEXT | YES | yes |  | NO | anon, authenticated | NO_SEARCH_PATH |
| `delete_platform_oncall` | p_id uuid |  | yes |  | NO | authenticated |  |
| `deny_requisition` | p_requisition_id UUID,
  p_denial_reason TEXT,
  p_denial_no | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `deny_time_off` | p_request_id UUID, p_reason TEXT | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `detect_contracts_expiring` | p_window_days INTEGER DEFAULT 30 | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `detect_contracts_expiring_all` | p_window_days INTEGER DEFAULT 30 | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `detect_customer_inactive` | p_business_id UUID, p_inactive_days INT DEFAULT 90 | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `detect_customer_inactive_all` | p_inactive_days INT DEFAULT 90 | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `detect_payroll_due` | p_window_days INTEGER DEFAULT 7 | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `detect_payroll_due_all` | p_window_days INTEGER DEFAULT 7 | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `diagnose_business` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `early_warnings` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `emit_business_event` | p_business_id UUID,
  p_event_type TEXT,
  p_entity_type TEX | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `emit_campaign_converted` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `emit_deal_lost` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `emit_deal_won` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `emit_inventory_low` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `emit_invoice_overdue` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `emit_payment_received` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `emit_project_delayed` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `emit_staff_event` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `emit_staff_joined` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `emit_task_completed` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `end_meeting` | p_meeting_id UUID |  | yes |  | NO | authenticated |  |
| `enforce_approval` | p_business_id UUID,
  p_approver_id UUID,
  p_entity_type TE | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `enforce_approval_on_status_change` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `ensure_business_approval_config` |  |  | no |  | NO | default |  |
| `evaluate_platform_alerts` |  |  | no |  | NO | default |  |
| `execute_automation_action` | p_automation_id UUID,
  p_trigger_event JSONB | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `execute_due_automations` |  | YES | no |  | NO | service_role | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `expire_recordings` |  |  | no |  | NO | authenticated |  |
| `feature_activation` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `feature_discovery` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `finalize_receipt_extraction` | p_receipt_id UUID,
  p_raw_text TEXT,
  p_fields JSONB |  | yes |  | NO | authenticated |  |
| `finalize_recording` | p_storage_path TEXT,
  p_duration_seconds INT DEFAULT NULL,
 |  | yes |  | NO | authenticated |  |
| `financial_health_index` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `generate_api_key` | p_name TEXT | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `generate_meeting_report` | p_meeting_id UUID,
  p_send_notifications BOOLEAN DEFAULT tr |  | yes |  | NO | authenticated |  |
| `generate_meeting_token` | p_meeting_id UUID,
  p_guest_email TEXT,
  p_guest_name TEXT |  | yes |  | NO | authenticated |  |
| `generate_mfa_backup_codes` |  |  | no |  | NO | default |  |
| `generate_po_number` |  |  | no |  | NO | default |  |
| `generate_portal_invitation` | p_email TEXT,
  p_name TEXT DEFAULT NULL,
  p_can_view_invoi | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `generate_property_slug` | title TEXT, business_id UUID |  | no | yes | NO | default |  |
| `generate_recording_signed_url` | p_storage_path TEXT,
  p_expires_seconds INT DEFAULT 3600 |  | yes |  | NO | authenticated |  |
| `generate_reporting_update` | p_channel_id UUID, p_date DATE | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_account_balance` | p_account_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_active_time_entry` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_active_time_entry` | p_staff_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_alert_actions` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `get_auth_error_message` | p_error_code TEXT |  | no |  | NO | default |  |
| `get_automation_actions` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_automation_triggers` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_business_branding` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `get_business_subscription` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `get_campaign_stats` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_contact_count_by_tags` | p_tags TEXT[] | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_current_accessible_businesses` |  |  | yes |  | NO | authenticated |  |
| `get_current_organization_memberships` |  |  | yes |  | NO | authenticated |  |
| `get_current_staff` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_direct_reports` | p_staff_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_email_template` | p_business_id UUID,
  p_template_type TEXT | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `get_enabled_sso_providers` | p_business_slug TEXT | YES | no |  | NO | anon, authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_events_in_range` | p_business_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `get_events_in_range` | p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_exchange_rate` | p_from_currency TEXT, p_to_currency TEXT | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_full_team` | p_staff_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_invite_info` | invite_id TEXT | YES | yes |  | NO | anon, authenticated | NO_SEARCH_PATH |
| `get_invite_info` | p_token TEXT | YES | yes |  | NO | anon, authenticated | NO_SEARCH_PATH |
| `get_meeting_intelligence` | p_meeting_id UUID |  | yes |  | NO | authenticated |  |
| `get_meeting_reports` | p_meeting_id UUID |  | yes |  | NO | authenticated |  |
| `get_mime_category` | p_mime_type TEXT |  | no |  | NO | default |  |
| `get_my_channels` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_my_channels` | p_user_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_next_entry_number` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_org_chart` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_org_chart` | p_business_id UUID | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `get_pending_approvals` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_plan_features` | p_plan TEXT |  | no |  | NO | default |  |
| `get_portal_invitation` | p_token TEXT | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_pricing_tiers` |  |  | no |  | NO | anon, authenticated |  |
| `get_public_profile` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `get_signature_request_by_token` | p_token TEXT | YES | yes |  | NO | anon, authenticated | NO_SEARCH_PATH |
| `get_space_pages` | p_space_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_sso_login_options` | p_email TEXT | YES | no |  | NO | default | NO_SEARCH_PATH |
| `get_staff_roles` | p_staff_id UUID | YES | yes |  | NO | authenticated | NO_SEARCH_PATH |
| `get_subscription_invoices` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `get_subscription_payments` | p_business_id UUID, p_limit INTEGER DEFAULT 20 | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `get_team_count` | p_business_id UUID |  | yes | yes | NO | default |  |
| `get_ticket_stats` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_ticket_with_replies` | p_ticket_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_time_entries_range` | p_start_date DATE,
  p_end_date DATE | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_trial_balance` | p_year INTEGER, p_month INTEGER | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_unread_notification_count` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_unread_notification_count` | p_user_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `get_upcoming_events` | p_limit INTEGER DEFAULT 10 | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `get_webhook_events` |  |  | no |  | NO | default |  |
| `grant_business_plan` | p_business_id UUID,
  p_plan TEXT,
  p_billing_cycle TEXT,
  | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `graph_overview` | p_business_id UUID | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `handler_derive_relationships` | p_event_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `handler_propagate_capture` | p_event_id UUID | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `handler_update_entity_freshness` | p_event_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `has_feature` | p_business_id UUID, p_feature TEXT |  | no | yes | NO | default |  |
| `has_open_recommendation` | p_business_id UUID, p_rule_id TEXT, p_subject_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `ignored_automations` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `impact_analysis_for` | p_business_id UUID, p_object_type TEXT, p_object_id UUID | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `increment` | p_x INTEGER |  | no |  | NO | default |  |
| `increment_automation_stats` | auto_id UUID, run_duration INTEGER | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `increment_capture_view` | p_capture_id UUID |  | yes |  | NO | authenticated |  |
| `increment_email_clicks` | p_email_id UUID |  | no |  | NO | default |  |
| `increment_email_opens` | p_email_id UUID |  | no |  | NO | default |  |
| `increment_saved_search_use` | p_search_id UUID | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `increment_user_learning` | p_user_id UUID,
  p_field TEXT | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `intelligence_capacity` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `intelligence_cashflow_forecast` | p_business_id UUID, p_days INT DEFAULT 30 |  | no | yes | NO | authenticated |  |
| `intelligence_early_warnings` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `intelligence_indexes` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `intelligence_process_bottlenecks` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `intelligence_risk_anomalies` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `intelligence_sales_performance` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `investigate_business_incident` | p_incident_id uuid,
  p_business_id uuid,
  p_reason text,
  |  | yes | yes | NO | authenticated |  |
| `is_approval_required` | p_business_id UUID,
  p_amount NUMERIC DEFAULT NULL,
  p_cat |  | yes | yes | NO | authenticated |  |
| `is_business_in_trial` | p_business_id UUID |  | no | yes | NO | default |  |
| `is_feature_enabled` | p_business_id UUID, p_flag_key TEXT | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `is_platform_admin` |  |  | yes |  | NO | default |  |
| `issue_recommendation` | p_business_id UUID,
  p_rule_id TEXT,
  p_severity TEXT,
  p | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `join_channel` | p_channel_id UUID | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `join_meeting` | p_meeting_id UUID,
  p_guest_token TEXT DEFAULT NULL |  | yes |  | NO | authenticated |  |
| `knowledge_concentration` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `leave_channel` | p_channel_id UUID | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `leave_meeting` | p_meeting_id UUID,
  p_participant_id UUID |  | yes |  | NO | authenticated |  |
| `link_entities` | p_business_id UUID, p_source_type TEXT, p_source_id UUID,
   | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `list_accessible_modules` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `list_platform_oncall` |  |  | yes |  | NO | authenticated |  |
| `list_platform_thresholds` |  |  | yes |  | NO | authenticated |  |
| `list_recordings` | p_meeting_id UUID DEFAULT NULL |  | yes |  | NO | authenticated |  |
| `log_audit_event` | p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `log_platform_error` | p_source text,
  p_severity text DEFAULT 'error',
  p_messag |  | no | yes | NO | authenticated |  |
| `log_security_event` | p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_email  | YES | no | yes | NO | anon' | NO_SEARCH_PATH |
| `log_sso_event` | p_action TEXT,
  p_connection_id UUID DEFAULT NULL,
  p_prov | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `log_ticket_activity` | p_ticket_id UUID,
  p_action TEXT,
  p_details JSONB DEFAULT | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `maintain_task_actual_hours` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `mark_automation_run_failed` | p_run_id UUID, p_error TEXT | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `mark_automation_run_success` | p_run_id UUID | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `mark_notification_read` | p_notification_id UUID,
  p_user_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `mark_notifications_read` | p_notification_ids UUID[] | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `mark_recommendation_acted` | p_claim_id UUID, p_action_type TEXT, p_action_id UUID | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `mark_signature_viewed` | p_token TEXT | YES | yes |  | NO | anon, authenticated | NO_SEARCH_PATH |
| `market_intelligence` | p_metric TEXT, p_geography TEXT DEFAULT NULL | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `meeting_analytics` | p_period_days INT DEFAULT 30 |  | yes |  | NO | authenticated |  |
| `monthly_review` | p_business_id UUID,
  p_period_start DATE DEFAULT date_trunc | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `next_best_action` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `notify_critical_recommendation` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `notify_email_channel` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `objective_progress` | p_objective_id UUID | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `observer_snapshot` | p_business_id UUID | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `on_business_created` |  |  | no |  | NO | default |  |
| `onboarding_conversion` |  |  | yes |  | NO | default |  |
| `onboarding_funnel` | p_business_id UUID DEFAULT NULL |  | yes | yes | NO | authenticated |  |
| `open_recommendations` | p_business_id UUID, p_limit INT DEFAULT 50 | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `operational_index` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `opportunity_intelligence` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `owner_intelligence` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `page_platform_oncall` | p_incident_id uuid,
  p_severity text DEFAULT 'critical' |  | no |  | NO | default |  |
| `people_index` | p_business_id UUID | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `persona_conflict_detection` | p_business_id UUID, p_staff_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `persona_success_metrics_summary` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `platform_ops` |  |  | yes |  | NO | authenticated |  |
| `pricing_opportunities` | p_business_id UUID,
  p_period_start DATE DEFAULT NULL,
  p_ | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `process_bottleneck_intelligence` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `process_business_event` | p_event_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `profitability_by_segment` | p_business_id UUID,
  p_segment TEXT DEFAULT 'customer',  -- | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `profitability_leakage` | p_business_id UUID,
  p_period_start DATE DEFAULT NULL,
  p_ | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `propagate_impact` | p_business_id UUID,
  p_start_type TEXT,
  p_start_id UUID,
 | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `provision_sso_user` | p_connection_id UUID,
  p_provider_user_id TEXT,
  p_email T | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `quick_turnoff` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `recalc_po_total` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `recall_similar_problems` | p_business_id UUID,
  p_rule_id TEXT DEFAULT NULL,
  p_sympt | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `recommend_plan` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `recommendation_effectiveness` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `recompute_timesheet_totals` | p_timesheet_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `record_analytics_event` | p_business_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NU | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `record_analytics_event` | p_business_id UUID,
  p_user_id UUID,
  p_event_name TEXT,
  | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `record_analytics_event` | p_user_id UUID,
  p_business_id UUID,
  p_event_type TEXT,
  | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `record_audit` | p_business_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_e | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `record_check` | p_monitor_id UUID,
  p_status TEXT,
  p_duration_ms INTEGER  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `record_decision_learning` | p_decision_id UUID, p_actual_outcome TEXT, p_what_worked TEX | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `record_diagnosis` | p_business_id UUID,
  p_rule_id TEXT,
  p_symptom_metric TEX | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `record_heartbeat` | p_heartbeat_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `record_integration_check` | p_integration text,
  p_status text,
  p_error text DEFAULT  |  | no |  | NO | default |  |
| `record_invoice_payment` | p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_method TE |  | yes | yes | NO | authenticated |  |
| `record_otp_verification` | p_pin_id TEXT,
  p_success BOOLEAN | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `record_outcome` | p_claim_id UUID, p_actual JSONB | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `record_recommendation_outcome` | p_claim_id UUID, p_actual_impact JSONB | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `record_reconciliation` | p_business_id UUID, p_metric TEXT, p_sources JSONB, p_tolera | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `record_signature` | p_token TEXT,
  p_signature_image_url TEXT,
  p_ip_address I | YES | yes |  | NO | anon, authenticated | NO_SEARCH_PATH |
| `recursive_neighbors` | p_business_id UUID,
  p_start_type TEXT,
  p_start_id UUID,
 | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `refresh_all_business_metrics` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `refresh_business_metrics` | p_business_id UUID | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `register_for_event` | p_event_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_pho | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `reject_receipt` | p_receipt_id UUID |  | yes |  | NO | authenticated |  |
| `reprocess_failed_automations` |  | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `request_time_off` | p_leave_type TEXT,
  p_start_date DATE,
  p_end_date DATE,
  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `resolve_canonical` | p_business_id UUID, p_alias TEXT | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `resolve_feature_flag` | p_key TEXT,
  p_business_id UUID DEFAULT NULL,
  p_is_beta B |  | no | yes | NO | default |  |
| `resolve_incident` | p_incident_id UUID,
  p_resolution_notes TEXT DEFAULT NULL,
 | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `resolve_payment_provider` | p_business_id UUID, p_currency TEXT | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `resolve_plan_tier` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `resolve_platform_error` | p_error_id uuid,
  p_resolution_note text DEFAULT NULL |  | yes |  | NO | authenticated |  |
| `resubmit_requisition` | p_requisition_id UUID,
  p_changes JSONB DEFAULT NULL | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `revenue_forecast` | p_business_id UUID, p_horizon_months INTEGER DEFAULT 3 | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `revive_dead_lettered_automation` | p_run_id UUID | YES | yes |  | NO | authenticated | NO_SEARCH_PATH |
| `revoke_invite` | p_invite_id UUID |  | yes |  | NO | authenticated |  |
| `revoke_my_passkey` | p_credential_id TEXT |  | yes |  | NO | authenticated |  |
| `risk_anomaly_intelligence` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `risk_summary` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `route_work` | p_business_id UUID, p_request_type TEXT, p_entity_type TEXT, | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `rsvp_event` | p_registration_id UUID,
  p_rsvp_status TEXT | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `run_agent_guardrail` | p_business_id UUID, p_agent_id UUID, p_capability TEXT, p_ru | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `run_all_recommendation_rules` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `run_behavior_recommendation_rules` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `run_business_health_audit` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `run_due_automations` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `run_recommendation_rules` | p_business_id UUID | YES | yes | yes | NO | authenticated | NO_SEARCH_PATH |
| `run_reconciliation` | p_business_id UUID, p_check_name TEXT | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `run_report` | p_report_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `run_simulation` | p_business_id UUID, p_scenario TEXT, p_inputs JSONB | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `run_system_health_audit` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `said_vs_used` | p_business_id UUID |  | no | yes | NO | authenticated |  |
| `salary_affordability` | p_business_id UUID | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `sales_index` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `sales_performance_intelligence` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `save_business_branding` | p_branding JSONB | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `save_meeting_decisions` | p_meeting_id UUID,
  p_decisions JSONB DEFAULT NULL,
  p_act |  | no |  | NO | authenticated, service_role |  |
| `save_transcript` | p_meeting_id UUID,
  p_full_text TEXT,
  p_language TEXT DEF |  | yes |  | NO | authenticated, service_role |  |
| `scan_all_business_data_quality` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `scan_data_quality` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `scan_exceptions` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `search_transcripts` | p_query TEXT,
  p_limit INT DEFAULT 20 |  | yes |  | NO | authenticated |  |
| `sector_benchmark` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `sector_module_usage` |  |  | no |  | NO | default |  |
| `seed_ai_roles` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `seed_default_functional_roles` | p_business_id UUID |  | no | yes | NO | default |  |
| `seed_default_job_types` | p_business_id UUID |  | no | yes | NO | default |  |
| `seed_default_pipeline_stages` | p_business_id UUID |  | no | yes | NO | default |  |
| `seed_golden_dataset` | p_profile TEXT | YES | no |  | NO | authenticated, service_role | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `send_business_digest` | p_business_id UUID,
  p_digest_type TEXT DEFAULT 'daily' |  | yes | yes | NO | authenticated |  |
| `send_email_notification` | p_notification_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `send_follow_up` | p_requisition_id UUID | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `send_notification` | p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `set_active_role` | p_staff_id UUID, p_role TEXT | YES | yes |  | NO | authenticated | NO_SEARCH_PATH |
| `set_first_response` |  |  | no |  | NO | default |  |
| `set_member_kind` | p_staff_id UUID, p_member_kind TEXT |  | yes |  | NO | authenticated |  |
| `set_recommendation_decision` | p_claim_id UUID, p_accepted BOOLEAN, p_by UUID | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `set_reporting_manager` | p_staff_id UUID,
  p_manager_id UUID,
  p_position_title TEX | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `set_updated_at` |  |  | no |  | NO | default |  |
| `similar_decisions` | p_business_id UUID, p_query TEXT DEFAULT NULL, p_tags TEXT[] | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `sla_breaches` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `snapshot_config` | p_business_id UUID, p_object_type TEXT, p_object_id UUID, p_ | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `start_approval_protocol` | p_business_id UUID, p_approval_id UUID, p_initiator_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `start_field_visit` | p_visit_id uuid,p_lat numeric default null,p_lng numeric def |  | yes |  | NO | authenticated |  |
| `start_meeting` | p_meeting_id UUID |  | yes |  | NO | authenticated |  |
| `start_time_tracking` | p_description TEXT DEFAULT NULL,
  p_task_id UUID DEFAULT NU | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `start_trial_on_new_entitlement` |  |  | no |  | NO | default |  |
| `stop_time_tracking` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `strategic_alignment` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `submit_requisition` | p_requisition_id UUID | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `submit_timesheet` | p_timesheet_id UUID, p_submitter_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `sync_business_location_point` |  |  | no |  | NO | default |  |
| `sync_field_visit_point` |  |  | no |  | NO | default |  |
| `sync_kr_from_metric` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `sync_organogram` |  | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `timesheet_recompute_on_entry_change` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `touch_conversation_on_message` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `touch_quotes_updated_at` |  |  | no |  | NO | default |  |
| `touch_workspace_selections_updated_at` |  |  | no |  | NO | default |  |
| `track_analytics_event` | p_event_name TEXT,
  p_meta JSONB DEFAULT '{}',
  p_business | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `track_event` | p_event_name TEXT,
  p_event_category TEXT DEFAULT NULL,
  p | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `trial_assistance` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
| `trigger_deal_automation` |  |  | no |  | NO | default |  |
| `trigger_escalation` | p_trigger_type TEXT,
  p_entity_type TEXT, -- 'task', 'ticke | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `trigger_task_automation` |  |  | no |  | NO | default |  |
| `trigger_webhook` | p_event_type TEXT,
  p_payload JSONB | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `trip_circuit_breaker` | p_business_id UUID, p_agent_id UUID, p_anomaly TEXT, p_thres | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `trust_health` | p_business_id UUID | YES | no | yes | NO | authenticated | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `trust_index` | p_business_id UUID | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `unlock_achievement` | p_user_id UUID, p_achievement_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `update_account_balances` | p_entry_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `update_daily_activity` | p_user_id UUID, p_date DATE |  | no |  | NO | default |  |
| `update_daily_summary` | p_date DATE DEFAULT CURRENT_DATE |  | no |  | NO | default |  |
| `update_email_template` | p_business_id UUID,
  p_template_type TEXT,
  p_subject TEXT | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `update_feature_flag_timestamp` |  |  | no |  | NO | default |  |
| `update_leave_balance` | p_staff_id UUID,
  p_leave_type_id UUID,
  p_days NUMERIC,
  | YES | no |  | NO | authenticated | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `update_platform_incident` | p_incident_id uuid,
  p_status text DEFAULT NULL,
  p_resolu |  | yes |  | NO | authenticated |  |
| `update_platform_threshold` | p_key text,
  p_warning_value numeric DEFAULT NULL,
  p_crit |  | yes |  | NO | authenticated |  |
| `update_property_status` |  | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `update_sms_status` | p_message_id TEXT,
  p_status TEXT,
  p_error_message TEXT D | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `update_sso_session` | p_connection_id UUID,
  p_user_id UUID,
  p_provider_user_id | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `update_streak` | p_user_id UUID | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `update_subscription_from_webhook` | p_business_id UUID,
  p_provider TEXT,
  p_provider_subscrip | YES | no | yes | NO | default | NO_CALLER_GUARD, BIZID_UNGUARDED, NO_SEARCH_PATH |
| `update_subsidiary_profile_timestamp` |  |  | no |  | NO | default |  |
| `update_updated_at` |  |  | no |  | NO | default |  |
| `update_updated_at_column` |  |  | no |  | NO | default |  |
| `update_user_engagement` | p_user_id UUID,
  p_session_id TEXT,
  p_event_type TEXT,
   | YES | no |  | NO | default | NO_CALLER_GUARD, NO_SEARCH_PATH |
| `update_user_streak` | p_user_id UUID |  | no |  | NO | default |  |
| `upsert_platform_oncall` | p_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_emai |  | yes |  | NO | authenticated |  |
| `usage_cross_business_adoption` |  |  | no |  | NO | default |  |
| `usage_module_adoption` | p_business_id UUID, p_since TIMESTAMPTZ DEFAULT NOW( |  | no | yes | NO | authenticated |  |
| `user_in_business` | p_business_id UUID | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `user_is_admin` | p_business_id UUID | YES | yes | yes | NO | default | NO_SEARCH_PATH |
| `validate_invite_token` | p_token TEXT | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `verify_api_key` | p_key TEXT | YES | no |  | NO | anon, authenticated | NO_SEARCH_PATH |
| `verify_api_key` | p_raw_key TEXT, p_ip INET DEFAULT NULL |  | no |  | NO | anon, authenticated |  |
| `verify_custom_domain` | p_domain TEXT |  | no |  | NO | default |  |
| `verify_portal_session` | p_token TEXT | YES | yes |  | NO | default | NO_SEARCH_PATH |
| `won` | or the enum type doesn't
-- exist because 037 failed |  | no |  | NO | default |  |
| `workflow_funnel` | p_business_id UUID |  | yes | yes | NO | authenticated |  |
