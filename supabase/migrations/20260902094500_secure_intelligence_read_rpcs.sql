-- Defense-in-depth tenant guards for SECURITY DEFINER read RPCs.
-- These functions are callable by authenticated users, so every business-scoped
-- read must independently prove membership in the requested business.

CREATE OR REPLACE FUNCTION public.current_metrics(p_business_id uuid)
RETURNS TABLE(metric_key text, name text, category text, unit text, formula text, current_value numeric, previous_value numeric, change_percent numeric, sample_size integer, confidence text, insufficient_note text, period text, last_calculated_at timestamp with time zone)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT km.metric_key,md.name,NULL::text,md.unit,md.formula,km.current_value,km.previous_value,km.change_percent,km.sample_size,km.confidence,md.insufficient_note,md.period,km.last_calculated_at
  FROM public.kpi_metrics km LEFT JOIN public.metric_definitions md ON md.key=km.metric_key
  WHERE km.business_id=p_business_id
    AND EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.business_id=p_business_id AND COALESCE(s.is_active,s.active,true))
  ORDER BY md.name;
$$;

CREATE OR REPLACE FUNCTION public.risk_summary(p_business_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.business_id=p_business_id AND COALESCE(s.is_active,s.active,true))
    THEN jsonb_build_object('total', count(*),'open', count(*) FILTER (WHERE status='open'),'high', count(*) FILTER (WHERE risk_score>=15),'by_category', COALESCE((SELECT jsonb_object_agg(category,cat_data) FROM (SELECT category,jsonb_build_object('total',count(*),'open',count(*) FILTER (WHERE status='open'),'avg_score',round(avg(risk_score)::numeric,1)) AS cat_data FROM business_risks WHERE business_id=p_business_id GROUP BY category) sub),'{}'::jsonb))
    ELSE jsonb_build_object('authorized',false) END
  FROM business_risks WHERE business_id=p_business_id;
$$;

CREATE OR REPLACE FUNCTION public.open_recommendations(p_business_id uuid,p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,rule_id text,severity text,statement text,evidence jsonb,expected_impact jsonb,status text,owner_id uuid,action_type text,linked_action_id uuid,created_at timestamp with time zone,subject_type text,subject_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $$
  SELECT c.id,c.rule_id,c.severity,c.statement,c.evidence,c.expected_impact,c.status,c.owner_id,c.action_type,c.linked_action_id,c.created_at,c.subject_type,c.subject_id
  FROM public.claims c
  WHERE c.business_id=p_business_id AND c.claim_type='RECOMMENDATION'
    AND c.status NOT IN ('rejected','outcome_recorded','superseded','expired')
    AND EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.business_id=p_business_id AND COALESCE(s.is_active,s.active,true))
  ORDER BY CASE c.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,c.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),100);
$$;

CREATE OR REPLACE FUNCTION public.data_quality_findings(p_business_id uuid)
RETURNS TABLE(id uuid,category text,severity text,title text,detail text,entity_type text,entity_id uuid,suggested_remediation text,resolved boolean,created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $$
  SELECT f.id,f.category,f.severity,f.title,f.detail,f.entity_type,f.entity_id,f.suggested_remediation,f.resolved,f.created_at
  FROM public.self_audit_findings f
  WHERE f.business_id=p_business_id AND f.audit_dimension='data_quality'
    AND EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.business_id=p_business_id AND COALESCE(s.is_active,s.active,true))
  ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,f.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.blocked_work(p_business_id uuid)
RETURNS TABLE(dependent_type text,dependent_id uuid,unsatisfied_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.business_id=p_business_id AND COALESCE(s.is_active,s.active,true)) THEN RETURN; END IF;
  RETURN QUERY SELECT wd.dependent_type,wd.dependent_id,count(*) FROM public.work_dependencies wd WHERE wd.business_id=p_business_id AND wd.satisfied=false GROUP BY wd.dependent_type,wd.dependent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sla_breaches(p_business_id uuid)
RETURNS TABLE(entity_type text,entity_id uuid,sla_status text,age_hours numeric,target_hours numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.business_id=p_business_id AND COALESCE(s.is_active,s.active,true)) THEN RETURN; END IF;
  RETURN QUERY SELECT t.entity_type,t.entity_id,t.sla_status,round(extract(epoch from (now()-t.created_at))/3600,1),d.target_complete_hours
  FROM public.sla_trackers t LEFT JOIN public.sla_definitions d ON d.business_id=t.business_id AND d.entity_type=t.entity_type AND d.is_active
  WHERE t.business_id=p_business_id AND t.sla_status IN ('warning','breached');
END;
$$;
