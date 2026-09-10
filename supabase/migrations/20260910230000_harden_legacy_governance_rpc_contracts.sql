CREATE OR REPLACE FUNCTION public.cost_governor(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth', 'storage', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.get_current_staff() s
    WHERE s.business_id = p_business_id
  ) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  RETURN jsonb_build_object('authorized', true, 'status', 'ok', 'actions', jsonb_build_array());
END
$function$;

CREATE OR REPLACE FUNCTION public.said_vs_used(p_business_id uuid)
RETURNS TABLE(module_key text, selected boolean, actually_used boolean, distinct_staff_used integer, event_count bigint, last_seen timestamptz, gap_label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth', 'storage', 'pg_temp'
AS $function$
  WITH authorized AS (
    SELECT EXISTS (
      SELECT 1 FROM public.get_current_staff() s
      WHERE s.business_id = p_business_id
    ) AS ok
  ),
  selected AS (
    SELECT unnest(COALESCE(selected_tools, '{}'::text[])) AS tool_key
    FROM user_workspace_selections, authorized
    WHERE business_id = p_business_id AND authorized.ok
  ),
  used AS (
    SELECT module_key,
           COUNT(DISTINCT staff_id)::int AS distinct_staff,
           COUNT(*)::bigint AS events,
           MAX(occurred_at) AS last_seen
    FROM usage_events, authorized
    WHERE business_id = p_business_id
      AND occurred_at >= NOW() - INTERVAL '30 days'
      AND authorized.ok
    GROUP BY module_key
  ),
  all_tools AS (
    SELECT tool_key AS module_key FROM selected
    UNION
    SELECT module_key FROM used
  )
  SELECT q.module_key,
         q.selected,
         q.actually_used,
         q.distinct_staff_used,
         q.event_count,
         q.last_seen,
         q.gap_label
  FROM (
    SELECT t.module_key,
           (s.tool_key IS NOT NULL) AS selected,
           (u.module_key IS NOT NULL) AS actually_used,
           COALESCE(u.distinct_staff, 0)::int AS distinct_staff_used,
           COALESCE(u.events, 0)::bigint AS event_count,
           u.last_seen,
           CASE
             WHEN s.tool_key IS NOT NULL AND u.module_key IS NULL THEN 'selected_unused'
             WHEN s.tool_key IS NULL AND u.module_key IS NOT NULL THEN 'used_unselected'
             WHEN u.distinct_staff >= 3 THEN 'adopted'
             WHEN u.distinct_staff >= 1 THEN 'trying'
             ELSE 'untouched'
           END AS gap_label
    FROM all_tools t
    LEFT JOIN selected s ON s.tool_key = t.module_key
    LEFT JOIN used u ON u.module_key = t.module_key
  ) q
  ORDER BY CASE q.gap_label
    WHEN 'selected_unused' THEN 0
    WHEN 'used_unselected' THEN 1
    WHEN 'trying' THEN 2
    WHEN 'adopted' THEN 3
    ELSE 4
  END, COALESCE(q.event_count, 0) DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.cost_governor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.said_vs_used(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
