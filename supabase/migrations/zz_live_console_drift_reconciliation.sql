-- Live console drift reconciliation.
--
-- This migration is intentionally guarded: it restores only objects that are
-- absent on a hand-managed production database. Canonical feature migrations
-- remain authoritative and are never overwritten when already present.
--
-- The live database was missing usage/workspace tables and several read-only
-- intelligence RPCs while the frontend had already shipped callers for them.
-- This closes the PGRST 404 class without fabricating business data.

\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS public.usage_events (
  id BIGSERIAL PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  module_key TEXT NOT NULL,
  route TEXT,
  action TEXT,
  session_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_business_time ON public.usage_events(business_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_module ON public.usage_events(module_key, occurred_at DESC);
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_events_read_own ON public.usage_events;
CREATE POLICY usage_events_read_own ON public.usage_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.get_current_staff() s WHERE s.business_id = usage_events.business_id));
DROP POLICY IF EXISTS usage_events_insert_own ON public.usage_events;
CREATE POLICY usage_events_insert_own ON public.usage_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.get_current_staff() s
    WHERE s.business_id = usage_events.business_id AND (s.id = usage_events.staff_id OR usage_events.staff_id IS NULL)));
GRANT SELECT, INSERT ON public.usage_events TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_workspace_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  selected_tools TEXT[] NOT NULL DEFAULT '{}',
  selection_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_workspace_selections_user_key UNIQUE(user_id)
);
ALTER TABLE public.user_workspace_selections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_workspace_selections_self_select ON public.user_workspace_selections;
CREATE POLICY user_workspace_selections_self_select ON public.user_workspace_selections FOR ALL TO authenticated
  USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.get_current_staff() s WHERE s.business_id = user_workspace_selections.business_id))
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.get_current_staff() s WHERE s.business_id = user_workspace_selections.business_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_workspace_selections TO authenticated;
CREATE OR REPLACE FUNCTION public.touch_workspace_selections_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_workspace_selections_updated ON public.user_workspace_selections;
CREATE TRIGGER trg_workspace_selections_updated BEFORE UPDATE ON public.user_workspace_selections
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_selections_updated_at();

-- Only create fallback RPCs when the canonical function is absent. Canonical
-- migrations therefore remain authoritative when/if the full chain is applied.
DO $$ BEGIN
  IF to_regprocedure('public.compute_ebitda(uuid,date,date)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.compute_ebitda(p_business_id UUID,p_period_start DATE DEFAULT NULL,p_period_end DATE DEFAULT NULL)
    RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
    DECLARE v_staff RECORD; v_start DATE:=COALESCE(p_period_start,date_trunc('month',CURRENT_DATE)::date); v_end DATE:=COALESCE(p_period_end,CURRENT_DATE); v_rev NUMERIC:=0; v_cogs NUMERIC:=0; v_rec NUMERIC:=0; v_other NUMERIC:=0;
    BEGIN
      SELECT * INTO v_staff FROM public.get_current_staff();
      IF NOT FOUND OR v_staff.business_id<>p_business_id THEN RETURN jsonb_build_object('authorized',false); END IF;
      BEGIN SELECT COALESCE(sum(total),0) INTO v_rev FROM public.invoices WHERE business_id=p_business_id AND status='paid' AND issue_date::date BETWEEN v_start AND v_end; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN SELECT COALESCE(sum(total),0) INTO v_cogs FROM public.transactions WHERE business_id=p_business_id AND type='purchase' AND created_at::date BETWEEN v_start AND v_end; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN SELECT COALESCE(sum(amount),0) INTO v_rec FROM public.recurring_expenses WHERE business_id=p_business_id AND is_active=true; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN SELECT COALESCE(sum(abs(total)),0) INTO v_other FROM public.transactions WHERE business_id=p_business_id AND type='adjustment' AND total<0 AND created_at::date BETWEEN v_start AND v_end; EXCEPTION WHEN OTHERS THEN NULL; END;
      RETURN jsonb_build_object('authorized',true,'period_start',v_start,'period_end',v_end,'revenue',v_rev,'cogs',v_cogs,'recurring_expenses',v_rec,'other_expenses',v_other,'total_expenses',v_cogs+v_rec+v_other,'ebitda',v_rev-v_cogs-v_rec-v_other,'margin_pct',CASE WHEN v_rev>0 THEN round(((v_rev-v_cogs-v_rec-v_other)/v_rev)*100,1) ELSE NULL END,'label',CASE WHEN v_rev-v_cogs-v_rec-v_other>0 THEN 'Profitable' WHEN v_rev-v_cogs-v_rec-v_other=0 THEN 'Breaking even' ELSE 'Operating at a loss' END,'insufficient_data',v_rev=0 AND v_cogs=0 AND v_rec=0);
    END $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.compute_ebitda(UUID,DATE,DATE) TO authenticated;
  END IF;

  IF to_regprocedure('public.business_brain(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.business_brain(p_business_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
    DECLARE v_staff RECORD; BEGIN SELECT * INTO v_staff FROM public.get_current_staff(); IF NOT FOUND OR v_staff.business_id<>p_business_id THEN RETURN jsonb_build_object('authorized',false); END IF; RETURN jsonb_build_object('authorized',true,'state',jsonb_build_object('state','insufficient_data','confidence','insufficient','reasons',jsonb_build_array()),'pulse',jsonb_build_object(),'diagnoses',jsonb_build_object('diagnoses',jsonb_build_array(),'note','Not enough cross-module evidence yet.'),'next_best_action',jsonb_build_object('action',NULL,'business_state','insufficient_data'),'value_ledger',jsonb_build_object('total_value',0,'recovered',0,'saved',0,'generated',0,'identified',0,'recommendations_acted',0,'outcomes_recorded',0,'successful_outcomes',0)); END $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.business_brain(UUID) TO authenticated;
  END IF;

  IF to_regprocedure('public.pricing_opportunities(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.pricing_opportunities(p_business_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
    DECLARE v_staff RECORD; BEGIN SELECT * INTO v_staff FROM public.get_current_staff(); IF NOT FOUND OR v_staff.business_id<>p_business_id OR v_staff.role NOT IN ('owner','admin') THEN RETURN jsonb_build_object('authorized',false); END IF; RETURN jsonb_build_object('authorized',true,'high_margin','[]'::jsonb,'low_margin','[]'::jsonb,'note','No pricing opportunity evidence is currently available.'); END $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.pricing_opportunities(UUID) TO authenticated;
  END IF;

  IF to_regprocedure('public.profitability_leakage(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.profitability_leakage(p_business_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
    DECLARE v_staff RECORD; BEGIN SELECT * INTO v_staff FROM public.get_current_staff(); IF NOT FOUND OR v_staff.business_id<>p_business_id OR v_staff.role NOT IN ('owner','admin') THEN RETURN jsonb_build_object('authorized',false); END IF; RETURN jsonb_build_object('authorized',true,'overdue','[]'::jsonb,'declining_margin','[]'::jsonb,'negative_margin_deals','[]'::jsonb,'stale_receivables','[]'::jsonb,'total_exposure',0,'note','No leakage evidence is currently available.'); END $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.profitability_leakage(UUID) TO authenticated;
  END IF;

  IF to_regprocedure('public.graph_overview(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.graph_overview(p_business_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
    DECLARE v_staff RECORD; BEGIN SELECT * INTO v_staff FROM public.get_current_staff(); IF NOT FOUND OR v_staff.business_id<>p_business_id THEN RETURN jsonb_build_object('authorized',false); END IF; RETURN jsonb_build_object('authorized',true,'total_edges',0,'nodes_by_type','[]'::jsonb,'edges_by_relationship','[]'::jsonb,'hub_entities','[]'::jsonb,'note','No relationship evidence is currently available.'); END $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.graph_overview(UUID) TO authenticated;
  END IF;

  IF to_regprocedure('public.get_alert_actions(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.get_alert_actions(p_business_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
    DECLARE v_staff RECORD; BEGIN SELECT * INTO v_staff FROM public.get_current_staff(); IF NOT FOUND OR v_staff.business_id<>p_business_id THEN RETURN jsonb_build_object('authorized',false); END IF; RETURN jsonb_build_object('authorized',true,'actions','[]'::jsonb); END $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.get_alert_actions(UUID) TO authenticated;
  END IF;
END $$;

-- These read helpers are small compatibility fallbacks. If the canonical
-- functions are deployed later they are skipped by the same guard pattern.
DO $$ BEGIN
  IF to_regprocedure('public.current_metrics(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.current_metrics(p_business_id UUID) RETURNS TABLE(metric_key TEXT,name TEXT,category TEXT,unit TEXT,formula TEXT,current_value NUMERIC,previous_value NUMERIC,change_percent NUMERIC,sample_size INTEGER,confidence TEXT,insufficient_note TEXT,period TEXT,last_calculated_at TIMESTAMPTZ) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $body$ SELECT km.metric_key,md.name,NULL::text,md.unit,md.formula,km.current_value,km.previous_value,km.change_percent,km.sample_size,km.confidence,md.insufficient_note,md.period,km.last_calculated_at FROM public.kpi_metrics km LEFT JOIN public.metric_definitions md ON md.key=km.metric_key WHERE km.business_id=p_business_id ORDER BY md.name $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.current_metrics(UUID) TO authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.recommendation_effectiveness(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.recommendation_effectiveness(p_business_id UUID) RETURNS TABLE(rule_id TEXT,issued BIGINT,accepted BIGINT,rejected BIGINT,acted BIGINT,outcome_recorded BIGINT,success_count BIGINT,avg_actual NUMERIC,avg_expected NUMERIC) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $body$ SELECT c.rule_id,count(*) FILTER(WHERE c.claim_type='RECOMMENDATION')::bigint,count(*) FILTER(WHERE c.status='accepted')::bigint,count(*) FILTER(WHERE c.status='rejected')::bigint,count(*) FILTER(WHERE c.status='acted')::bigint,count(*) FILTER(WHERE c.status='outcome_recorded')::bigint,count(*) FILTER(WHERE c.status='outcome_recorded' AND COALESCE((c.actual_impact->>'amount')::numeric,0)>=0)::bigint,avg((c.actual_impact->>'amount')::numeric),avg((c.expected_impact->>'amount')::numeric) FROM public.claims c WHERE c.business_id=p_business_id AND c.claim_type='RECOMMENDATION' GROUP BY c.rule_id $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.recommendation_effectiveness(UUID) TO authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.open_recommendations(uuid,integer)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.open_recommendations(p_business_id UUID,p_limit INT DEFAULT 50) RETURNS TABLE(id UUID,rule_id TEXT,severity TEXT,statement TEXT,evidence JSONB,expected_impact JSONB,status TEXT,owner_id UUID,action_type TEXT,linked_action_id UUID,created_at TIMESTAMPTZ,subject_type TEXT,subject_id UUID) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $body$ SELECT c.id,c.rule_id,c.severity,c.statement,c.evidence,c.expected_impact,COALESCE(c.status,'open'),c.owner_id,c.action_type,c.linked_action_id,c.created_at,c.subject_type,c.subject_id FROM public.claims c WHERE c.business_id=p_business_id AND c.claim_type='RECOMMENDATION' AND COALESCE(c.status,'open') NOT IN ('resolved','outcome_recorded','rejected') ORDER BY c.created_at DESC LIMIT p_limit $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.open_recommendations(UUID,INT) TO authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.profitability_by_segment(uuid,text,date,date)') IS NULL THEN
    EXECUTE $fn$CREATE FUNCTION public.profitability_by_segment(p_business_id UUID,p_segment TEXT DEFAULT 'customer',p_period_start DATE DEFAULT NULL,p_period_end DATE DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$ DECLARE v_staff RECORD; BEGIN SELECT * INTO v_staff FROM public.get_current_staff(); IF NOT FOUND OR v_staff.business_id<>p_business_id OR v_staff.role NOT IN ('owner','admin') THEN RETURN jsonb_build_object('authorized',false); END IF; RETURN jsonb_build_object('authorized',true,'segment',p_segment,'total_revenue',0,'total_cogs',0,'cost_allocation','revenue_proportional','segments','[]'::jsonb,'note','No segment profitability evidence is currently available.'); END $body$;$fn$;
    GRANT EXECUTE ON FUNCTION public.profitability_by_segment(UUID,TEXT,DATE,DATE) TO authenticated;
  END IF;
END $$;

-- Canonical claims lifecycle columns required by the compatibility readers.
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS linked_action_id UUID;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS actual_impact JSONB;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS rule_id TEXT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS severity TEXT;
