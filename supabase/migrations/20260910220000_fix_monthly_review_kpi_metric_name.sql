-- Fix Monthly Performance Review against the live kpi_metrics contract.
-- kpi_metrics does not have a `name` or `category` column; derive display
-- values from source_detail when available and fall back to metric_key.

create or replace function public.monthly_review(
  p_business_id uuid,
  p_period_start date default date_trunc('month'::text, now())::date,
  p_period_end date default (date_trunc('month'::text, now()) + interval '1 month - 1 day')::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, auth, storage, pg_temp
as $function$
declare
  v_health jsonb;
  v_objectives jsonb;
  v_risks jsonb;
  v_recommendations jsonb;
  v_metrics jsonb;
  v_dq jsonb;
begin
  select to_jsonb(t) into v_health
  from (
    select overall_score, dimension_scores, data_quality_penalty,
           insufficient_dimensions, computed_at
    from business_health_scores
    where business_id = p_business_id
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'title', o.title, 'scope', o.scope, 'status', o.status,
    'progress', objective_progress(o.id),
    'key_result_count', (select count(*) from key_results where objective_id = o.id),
    'owner_id', o.owner_id, 'period_end', o.period_end
  ) order by o.period_end nulls last), '[]'::jsonb) into v_objectives
  from strategic_objectives o
  where o.business_id = p_business_id
    and o.level = 'objective'
    and (o.period_end is null or o.period_end >= p_period_start)
    and (o.period_start is null or o.period_start <= p_period_end);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'title', r.title, 'category', r.category,
    'risk_score', r.risk_score, 'status', r.status,
    'mitigation_status', r.mitigation_status, 'due_date', r.due_date
  ) order by r.risk_score desc, r.due_date nulls last), '[]'::jsonb) into v_risks
  from business_risks r
  where r.business_id = p_business_id
    and r.status not in ('closed');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'rule_id', c.rule_id, 'statement', c.statement,
    'severity', c.severity, 'status', c.status,
    'evidence', c.evidence, 'expected_impact', c.expected_impact, 'created_at', c.created_at
  ) order by
    case c.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
    c.created_at desc), '[]'::jsonb) into v_recommendations
  from claims c
  where c.business_id = p_business_id
    and c.claim_type = 'RECOMMENDATION'
    and c.status not in ('rejected','outcome_recorded','superseded','expired');

  select coalesce(jsonb_agg(jsonb_build_object(
    'metric_key', m.metric_key,
    'name', coalesce(nullif(m.source_detail->>'name', ''), initcap(replace(m.metric_key, '_', ' '))),
    'category', coalesce(nullif(m.source_detail->>'category', ''), 'general'),
    'current_value', m.current_value,
    'previous_value', m.previous_value,
    'change_percent', m.change_percent,
    'confidence', m.confidence,
    'sample_size', m.sample_size,
    'target_value', m.target_value,
    'period_end', m.period_end
  ) order by abs(coalesce(m.change_percent, 0)) desc), '[]'::jsonb) into v_metrics
  from kpi_metrics m
  where m.business_id = p_business_id
    and m.metric_key is not null
    and m.period_end >= p_period_start
    and m.period_end <= p_period_end + interval '1 day';

  select to_jsonb(t) into v_dq
  from (
    select
      count(*) filter (where severity = 'critical' and resolved = false) as open_critical,
      count(*) filter (where severity = 'warning' and resolved = false) as open_warning,
      count(*) filter (where resolved = true) as resolved_total
    from self_audit_findings
    where business_id = p_business_id and audit_dimension = 'data_quality'
  ) t;

  return jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'generated_at', now(),
    'health', v_health,
    'objectives', v_objectives,
    'risks', v_risks,
    'recommendations', v_recommendations,
    'metrics', v_metrics,
    'data_quality', v_dq,
    'summary', jsonb_build_object(
      'open_risks', jsonb_array_length(v_risks),
      'high_risks', (select count(*) from jsonb_array_elements(v_risks) x where (x->>'risk_score')::int >= 15),
      'open_recommendations', jsonb_array_length(v_recommendations),
      'critical_recommendations', (select count(*) from jsonb_array_elements(v_recommendations) x where x->>'severity' = 'critical'),
      'objective_count', jsonb_array_length(v_objectives),
      'metric_count', jsonb_array_length(v_metrics)
    )
  );
end;
$function$;
