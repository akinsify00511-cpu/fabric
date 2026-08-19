# RPC Attack Matrix (generated — scripts/security_inventory.py)

Every sensitive RPC must be adversarially tested with: anonymous / wrong tenant / correct-tenant-wrong-role / removed member / sibling business / null params / duplicate calls / replay / extreme input. P0 = SECURITY DEFINER + business_id param + no caller guard (real cross-tenant leak class). P1 = SECURITY DEFINER + no guard.

| RPC | biz_id param | caller guard | grants | class | priority |
|---|---|---|---|---|---|
| `_ensure_test_auth_user` |  | **NO** | service_role | NO_CALLER_GUARD | P1 |
| `acknowledge_recommendation` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `advance_action_step` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `advance_incident` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `advance_migration` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `apply_goods_receipt` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `approval_requests_update` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `assess_four_reality_discrepancy` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `audit_procurement_event` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `audit_property_commission` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `audit_row_change` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `audit_signature_event` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `award_xp` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `award_xp_with_streak` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `blocked_work` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `bootstrap_business` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `bootstrap_business` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `business_relationships` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `can_approve` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `cancel_registration` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `cancel_subscription` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `cashflow_forecast_intelligence` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `check_achievements` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `check_ai_action_authority` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `check_api_key_usage` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `check_auth_rate_limit` |  | **NO** | anon' | PUBLIC_BY_DESIGN | documented |
| `check_in_attendee` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `check_separation_of_duties` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `cleanup_expired_rate_limits` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `cleanup_golden_datasets` |  | **NO** | authenticated, service_role | NO_CALLER_GUARD | P1 |
| `company_tree` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `compute_business_health` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `continuity_status` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `convenience_index` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `convert_currency` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `create_default_notification_preferences` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `create_notification` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `current_business_health` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `current_metrics` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `data_integrity_scores` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `data_quality_findings` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `decide_timesheet` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `deny_time_off` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `detect_contracts_expiring` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `detect_contracts_expiring_all` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `detect_customer_inactive` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `detect_customer_inactive_all` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `detect_payroll_due` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `detect_payroll_due_all` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `early_warnings` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `emit_business_event` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `emit_campaign_converted` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `emit_deal_lost` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `emit_deal_won` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `emit_inventory_low` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `emit_invoice_overdue` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `emit_payment_received` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `emit_project_delayed` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `emit_staff_event` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `emit_staff_joined` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `emit_task_completed` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `enforce_approval` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `enforce_approval_on_status_change` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `execute_automation_action` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `execute_due_automations` |  | **NO** | service_role | NO_CALLER_GUARD | P1 |
| `financial_health_index` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `get_account_balance` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_active_time_entry` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_automation_actions` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_automation_triggers` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_business_branding` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `get_business_subscription` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `get_campaign_stats` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_direct_reports` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_email_template` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `get_enabled_sso_providers` |  | **NO** | anon, authenticated | NO_CALLER_GUARD | P1 |
| `get_events_in_range` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `get_exchange_rate` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_full_team` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_my_channels` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_public_profile` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `get_space_pages` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_sso_login_options` |  | **NO** | default | PUBLIC_BY_DESIGN | documented |
| `get_subscription_invoices` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `get_subscription_payments` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `get_ticket_stats` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_ticket_with_replies` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `get_unread_notification_count` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `grant_business_plan` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `handler_derive_relationships` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `handler_propagate_capture` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `handler_update_entity_freshness` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `has_open_recommendation` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `increment_automation_stats` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `increment_saved_search_use` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `increment_user_learning` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `intelligence_indexes` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `is_feature_enabled` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `issue_recommendation` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `knowledge_concentration` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `link_entities` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `log_security_event` | yes | **NO** | anon' | PUBLIC_BY_DESIGN | documented |
| `maintain_task_actual_hours` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `mark_automation_run_failed` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `mark_automation_run_success` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `mark_notification_read` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `mark_recommendation_acted` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `market_intelligence` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `monthly_review` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `notify_email_channel` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `objective_progress` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `open_recommendations` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `operational_index` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `opportunity_intelligence` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `persona_conflict_detection` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `persona_success_metrics_summary` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `process_bottleneck_intelligence` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `process_business_event` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `recalc_po_total` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `recommendation_effectiveness` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `recompute_timesheet_totals` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `record_analytics_event` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `record_analytics_event` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `record_analytics_event` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `record_audit` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `record_check` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `record_decision_learning` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `record_heartbeat` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `record_otp_verification` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `record_outcome` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `record_recommendation_outcome` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `record_reconciliation` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `recursive_neighbors` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `reprocess_failed_automations` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `resolve_canonical` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `resolve_payment_provider` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `revenue_forecast` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `risk_anomaly_intelligence` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `risk_summary` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `route_work` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `rsvp_event` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `run_agent_guardrail` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `run_behavior_recommendation_rules` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `run_business_health_audit` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `run_due_automations` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `run_reconciliation` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `run_report` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `run_system_health_audit` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `sales_index` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `sales_performance_intelligence` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `scan_all_business_data_quality` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `scan_data_quality` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `scan_exceptions` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `seed_ai_roles` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `seed_golden_dataset` |  | **NO** | authenticated, service_role | NO_CALLER_GUARD | P1 |
| `send_email_notification` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `send_notification` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `set_recommendation_decision` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `similar_decisions` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `sla_breaches` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `snapshot_config` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `start_approval_protocol` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `strategic_alignment` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `submit_timesheet` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `sync_kr_from_metric` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `timesheet_recompute_on_entry_change` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `touch_conversation_on_message` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `track_analytics_event` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `trigger_escalation` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `trip_circuit_breaker` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `trust_health` | yes | **NO** | authenticated | BIZID_UNGUARDED | P0 |
| `trust_index` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `unlock_achievement` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `update_account_balances` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `update_email_template` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `update_leave_balance` |  | **NO** | authenticated | NO_CALLER_GUARD | P1 |
| `update_property_status` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `update_sms_status` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `update_streak` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `update_subscription_from_webhook` | yes | **NO** | default | BIZID_UNGUARDED | P0 |
| `update_user_engagement` |  | **NO** | default | NO_CALLER_GUARD | P1 |
| `verify_api_key` |  | **NO** | anon, authenticated | PUBLIC_BY_DESIGN | documented |
| `accept_invite` |  | yes | authenticated | PUBLIC_BY_DESIGN | documented |
| `accept_invite` |  | yes | authenticated | PUBLIC_BY_DESIGN | documented |
| `accept_invite` |  | yes | authenticated | PUBLIC_BY_DESIGN | documented |
| `accept_portal_invitation` |  | yes | default | guarded | P2 |
| `acknowledge_incident` |  | yes | default | guarded | P2 |
| `add_manual_time_entry` |  | yes | default | guarded | P2 |
| `approve_requisition` |  | yes | default | guarded | P2 |
| `approve_time_off` |  | yes | default | guarded | P2 |
| `automation_health_with_dlq` | yes | yes | authenticated | guarded | P2 |
| `broadcast_notification` | yes | yes | default | guarded | P2 |
| `capacity_intelligence` | yes | yes | default | guarded | P2 |
| `clear_active_role` |  | yes | authenticated | guarded | P2 |
| `compensation_review_recommendation` | yes | yes | default | guarded | P2 |
| `compose_business_review` | yes | yes | authenticated | guarded | P2 |
| `compute_all_business_health` |  | yes | default | guarded | P2 |
| `create_business_and_owner` |  | yes | authenticated | guarded | P2 |
| `create_invite` |  | yes | authenticated | guarded | P2 |
| `create_journal_entry` |  | yes | default | guarded | P2 |
| `create_portal_session` |  | yes | default | guarded | P2 |
| `create_requisition` |  | yes | default | guarded | P2 |
| `decline_signature` |  | yes | anon, authenticated | PUBLIC_BY_DESIGN | documented |
| `deny_requisition` |  | yes | default | guarded | P2 |
| `generate_api_key` |  | yes | default | guarded | P2 |
| `generate_portal_invitation` |  | yes | default | guarded | P2 |
| `generate_reporting_update` |  | yes | default | guarded | P2 |
| `get_active_time_entry` |  | yes | default | guarded | P2 |
| `get_contact_count_by_tags` |  | yes | default | guarded | P2 |
| `get_current_staff` |  | yes | default | guarded | P2 |
| `get_events_in_range` |  | yes | default | guarded | P2 |
| `get_invite_info` |  | yes | anon, authenticated | PUBLIC_BY_DESIGN | documented |
| `get_invite_info` |  | yes | anon, authenticated | PUBLIC_BY_DESIGN | documented |
| `get_my_channels` |  | yes | default | guarded | P2 |
| `get_next_entry_number` |  | yes | default | guarded | P2 |
| `get_org_chart` |  | yes | default | guarded | P2 |
| `get_org_chart` | yes | yes | default | guarded | P2 |
| `get_pending_approvals` |  | yes | default | guarded | P2 |
| `get_portal_invitation` |  | yes | default | guarded | P2 |
| `get_signature_request_by_token` |  | yes | anon, authenticated | PUBLIC_BY_DESIGN | documented |
| `get_staff_roles` |  | yes | authenticated | guarded | P2 |
| `get_time_entries_range` |  | yes | default | guarded | P2 |
| `get_trial_balance` |  | yes | default | guarded | P2 |
| `get_unread_notification_count` |  | yes | default | guarded | P2 |
| `get_upcoming_events` |  | yes | default | guarded | P2 |
| `graph_overview` | yes | yes | authenticated | guarded | P2 |
| `impact_analysis_for` | yes | yes | default | guarded | P2 |
| `join_channel` |  | yes | default | guarded | P2 |
| `leave_channel` |  | yes | default | guarded | P2 |
| `log_audit_event` |  | yes | default | guarded | P2 |
| `log_sso_event` |  | yes | default | guarded | P2 |
| `log_ticket_activity` |  | yes | default | guarded | P2 |
| `mark_notifications_read` |  | yes | default | guarded | P2 |
| `mark_signature_viewed` |  | yes | anon, authenticated | PUBLIC_BY_DESIGN | documented |
| `notify_critical_recommendation` |  | yes | default | guarded | P2 |
| `observer_snapshot` | yes | yes | default | guarded | P2 |
| `people_index` | yes | yes | default | guarded | P2 |
| `pricing_opportunities` | yes | yes | authenticated | guarded | P2 |
| `profitability_by_segment` | yes | yes | authenticated | guarded | P2 |
| `profitability_leakage` | yes | yes | authenticated | guarded | P2 |
| `propagate_impact` | yes | yes | authenticated | guarded | P2 |
| `provision_sso_user` |  | yes | default | guarded | P2 |
| `recall_similar_problems` | yes | yes | authenticated | guarded | P2 |
| `record_diagnosis` | yes | yes | authenticated | guarded | P2 |
| `record_signature` |  | yes | anon, authenticated | PUBLIC_BY_DESIGN | documented |
| `refresh_all_business_metrics` |  | yes | default | guarded | P2 |
| `refresh_business_metrics` | yes | yes | authenticated | guarded | P2 |
| `register_for_event` |  | yes | default | guarded | P2 |
| `request_time_off` |  | yes | default | guarded | P2 |
| `resolve_incident` |  | yes | default | guarded | P2 |
| `resubmit_requisition` |  | yes | default | guarded | P2 |
| `revive_dead_lettered_automation` |  | yes | authenticated | guarded | P2 |
| `run_all_recommendation_rules` |  | yes | default | guarded | P2 |
| `run_recommendation_rules` | yes | yes | authenticated | guarded | P2 |
| `run_simulation` | yes | yes | default | guarded | P2 |
| `salary_affordability` | yes | yes | default | guarded | P2 |
| `save_business_branding` |  | yes | default | guarded | P2 |
| `send_follow_up` |  | yes | default | guarded | P2 |
| `set_active_role` |  | yes | authenticated | guarded | P2 |
| `set_reporting_manager` |  | yes | default | guarded | P2 |
| `start_time_tracking` |  | yes | default | guarded | P2 |
| `stop_time_tracking` |  | yes | default | guarded | P2 |
| `submit_requisition` |  | yes | default | guarded | P2 |
| `sync_organogram` |  | yes | default | guarded | P2 |
| `track_event` |  | yes | default | guarded | P2 |
| `trigger_webhook` |  | yes | default | guarded | P2 |
| `update_sso_session` |  | yes | default | guarded | P2 |
| `user_in_business` | yes | yes | default | guarded | P2 |
| `user_is_admin` | yes | yes | default | guarded | P2 |
| `validate_invite_token` |  | yes | default | PUBLIC_BY_DESIGN | documented |
| `verify_portal_session` |  | yes | default | guarded | P2 |
