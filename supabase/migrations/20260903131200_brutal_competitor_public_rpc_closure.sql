-- Close remaining high-value public RPC surfaces. Trigger helpers and intentionally public
-- token/rate-limit endpoints are left alone; business data/AI/admin helpers are not.
REVOKE EXECUTE ON FUNCTION public.deal_stage_age_days(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.feature_discovery(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_meeting_report(UUID,BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_team_count(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_workspace_arrangement() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_feature_flag(TEXT,UUID,BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_plan_tier(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deal_stage_age_days(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.feature_discovery(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_meeting_report(UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_workspace_arrangement() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_feature_flag(TEXT,UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_plan_tier(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_admin(UUID) TO authenticated;
