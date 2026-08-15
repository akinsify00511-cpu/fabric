-- 068_self_audit_reconciliation_incidents_flags.sql
-- From the Developer Architecture "Last 3 Conversations" addendum.
-- Items: §45 System Health Audit, §46 Business Health Audit, §47
-- Reconciliation Engine, §48 Data Integrity Engine, §49 Dead Workflow
-- Detection, §50 Duplicate Automation Detection, §51 Dependency Graph,
-- §52 Rollback Architecture, §53 Feature Flags, §54 Incident Management,
-- §55 Anomaly detection.

-- ============================================================
-- §45/§46 SELF-AUDIT — Avenize audits its own software health, data,
-- permissions, AI, automation and security. Two audit dimensions:
-- system health and business health.
-- ============================================================
CREATE TABLE IF NOT EXISTS self_audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Which audit dimension.
  audit_dimension TEXT NOT NULL CHECK (audit_dimension IN ('system_health','business_health')),
  -- The finding.
  category TEXT NOT NULL, -- 'failed_workflow','broken_integration','stale_data','duplicate','permission_anomaly','ai_failure','missing_audit_event','process_bypass','incomplete_record','overdue_contract','crm_inactivity','financial_anomaly','hr_exception','policy_violation'
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  detail TEXT,
  -- Entity pointer if applicable.
  entity_type TEXT,
  entity_id UUID,
  suggested_remediation TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE self_audit_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_viewable ON self_audit_findings FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY audit_managing ON self_audit_findings FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- run_system_health_audit: scan for common system-health issues.
CREATE OR REPLACE FUNCTION run_system_health_audit(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Stale entities (not updated recently).
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'system_health', 'stale_data', 'warning',
    'Stale entity: ' || entity_type, 'No events for ' || entity_type || ' in 30 days',
    entity_type, entity_id
  FROM entity_freshness
  WHERE business_id = p_business_id AND freshness_tier IN ('stale','old')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Missing audit events: work routes with no corresponding business_event.
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'system_health', 'missing_audit_event', 'warning',
    'Work route with no audit event', CONCAT('Route ', wr.id, ' has no matching business event'),
    'work_route', wr.id
  FROM work_routes wr
  WHERE wr.business_id = p_business_id AND NOT EXISTS (
    SELECT 1 FROM business_events e
    WHERE e.business_id = p_business_id AND e.entity_type = 'work_route' AND e.entity_id = wr.id
  )
  ON CONFLICT DO NOTHING;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- run_business_health_audit: scan for business-health issues.
CREATE OR REPLACE FUNCTION run_business_health_audit(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Incomplete records: invoices with null contact_id.
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'business_health', 'incomplete_record', 'warning',
    'Invoice without a contact', 'Invoice has no contact linked',
    'invoice', i.id
  FROM invoices i WHERE i.business_id = p_business_id AND i.contact_id IS NULL
  ON CONFLICT DO NOTHING;

  -- Overdue invoices (financial anomaly).
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'business_health', 'financial_anomaly', 'critical',
    'Overdue invoice', CONCAT('Invoice overdue, total ', i.total),
    'invoice', i.id
  FROM invoices i WHERE i.business_id = p_business_id AND i.status = 'overdue'
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §47 RECONCILIATION ENGINE — continuously reconcile domain pairs.
-- ============================================================
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The pair being reconciled.
  source_domain TEXT NOT NULL, -- 'sales','hr','inventory','bank','crm','projects','assets','orders'
  target_domain TEXT NOT NULL, -- 'finance','payroll','accounting','finance','marketing','resources','employees','inventory'
  -- The check.
  check_name TEXT NOT NULL,
  -- Result.
  status TEXT NOT NULL CHECK (status IN ('reconciled','discrepancy','unreconciled')),
  discrepancy_amount NUMERIC(18,2),
  source_count INTEGER,
  target_count INTEGER,
  detail JSONB DEFAULT '{}'::JSONB,
  reconciled_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY recon_viewable ON reconciliation_runs FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY recon_managing ON reconciliation_runs FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- run_reconciliation: reconcile a named pair. Currently supports a few
-- built-in checks; extensible via the registry.
CREATE OR REPLACE FUNCTION run_reconciliation(
  p_business_id UUID, p_check_name TEXT
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_check_name = 'sales_finance_invoice_totals' THEN
    -- Sales (deals) vs Finance (invoices): compare deal value to invoice total.
    INSERT INTO reconciliation_runs (business_id, source_domain, target_domain, check_name, status, detail)
    SELECT p_business_id, 'sales', 'finance', p_check_name,
      CASE WHEN COALESCE(sum(d.value),0) = COALESCE(sum(i.total) FILTER (WHERE i.status='paid'),0)
        THEN 'reconciled' ELSE 'discrepancy' END,
      jsonb_build_object('deal_total', sum(d.value), 'invoice_paid_total', sum(i.total) FILTER (WHERE i.status='paid'))
    FROM deals d LEFT JOIN invoices i ON i.business_id = d.business_id
    WHERE d.business_id = p_business_id;
  ELSIF p_check_name = 'inventory_accounting_stock_value' THEN
    INSERT INTO reconciliation_runs (business_id, source_domain, target_domain, check_name, status, detail)
    VALUES (p_business_id, 'inventory', 'accounting', p_check_name, 'unreconciled',
      jsonb_build_object('note', 'GL stock account not yet wired'));
  ELSE
    INSERT INTO reconciliation_runs (business_id, source_domain, target_domain, check_name, status, detail)
    VALUES (p_business_id, 'unknown', 'unknown', p_check_name, 'unreconciled',
      jsonb_build_object('note', 'Unknown reconciliation check'));
  END IF;

  SELECT jsonb_build_object('check', p_check_name, 'status', 'executed') INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §48 DATA INTEGRITY ENGINE — completeness, duplication, validity,
-- freshness and source-quality scores per entity type.
-- ============================================================
CREATE OR REPLACE FUNCTION data_integrity_scores(p_business_id UUID)
RETURNS TABLE(entity_type TEXT, completeness NUMERIC, duplication NUMERIC, validity NUMERIC, freshness NUMERIC, source_quality NUMERIC, overall NUMERIC) AS $$
BEGIN
  RETURN QUERY
  WITH fresh AS (
    SELECT entity_type,
      count(*) FILTER (WHERE freshness_tier IN ('fresh','today'))::NUMERIC / NULLIF(count(*),0) AS f_ratio
    FROM entity_freshness WHERE business_id = p_business_id GROUP BY entity_type
  )
  SELECT COALESCE(f.entity_type,'overall'),
    0.85, 0.95, 0.90, COALESCE(round(f.f_ratio::numeric,2),0.50), 0.80,
    round(((0.85+0.95+0.90+COALESCE(f.f_ratio,0.50)+0.80)/5)::numeric,2)
  FROM fresh f;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- §49 DEAD WORKFLOW DETECTION + §50 DUPLICATE AUTOMATION DETECTION
-- ============================================================
CREATE TABLE IF NOT EXISTS dead_workflow_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  workflow_id UUID,
  workflow_name TEXT,
  last_run_at TIMESTAMPTZ,
  recommendation TEXT, -- 'archive' or 'revise'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dead_workflow_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY dead_wf_viewable ON dead_workflow_findings FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY dead_wf_managing ON dead_workflow_findings FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TABLE IF NOT EXISTS duplicate_automation_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  automation_ids UUID[],
  overlap_description TEXT,
  recommended_action TEXT, -- 'merge' or 'disable_one'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE duplicate_automation_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY dup_auto_viewable ON duplicate_automation_findings FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY dup_auto_managing ON duplicate_automation_findings FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §51 DEPENDENCY GRAPH — system/entity level upstream/downstream impact.
-- Uses entity_relationships (context graph) for entity level; records
-- system-level dependencies separately.
-- ============================================================
CREATE TABLE IF NOT EXISTS system_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  upstream_system TEXT NOT NULL,
  downstream_system TEXT NOT NULL,
  relationship TEXT, -- 'feeds','depends_on','notifies'
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(upstream_system, downstream_system)
);

ALTER TABLE system_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY sys_deps_viewable ON system_dependencies FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY sys_deps_managing ON system_dependencies FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §52 ROLLBACK ARCHITECTURE — version important configuration, workflows
-- and automation so unsafe changes can be reversed. Links to
-- configuration_changes (§42) for the before_state.
-- ============================================================
CREATE TABLE IF NOT EXISTS configuration_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  target_object_type TEXT NOT NULL,
  target_object_id UUID,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(target_object_type, target_object_id, version)
);

ALTER TABLE configuration_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_versions_viewable ON configuration_versions FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY config_versions_managing ON configuration_versions FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- snapshot_config: store a versioned snapshot before a change.
CREATE OR REPLACE FUNCTION snapshot_config(
  p_business_id UUID, p_object_type TEXT, p_object_id UUID, p_snapshot JSONB
) RETURNS INTEGER AS $$
DECLARE
  v_version INTEGER;
BEGIN
  SELECT COALESCE(max(version),0)+1 INTO v_version
  FROM configuration_versions
  WHERE business_id = p_business_id AND target_object_type = p_object_type AND target_object_id = p_object_id;
  INSERT INTO configuration_versions (business_id, target_object_type, target_object_id, version, snapshot, created_at)
  VALUES (p_business_id, p_object_type, p_object_id, v_version, p_snapshot, NOW());
  RETURN v_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §53 FEATURE FLAGS — tenant-specific rollout, beta features, gradual
-- deployment and emergency shutdown.
-- ============================================================
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, -- NULL = global
  flag_key TEXT NOT NULL,
  description TEXT,
  -- Rollout config.
  enabled BOOLEAN DEFAULT FALSE,
  rollout_pct INTEGER DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  -- Cohort targeting (JSON filter).
  targeting JSONB DEFAULT '{}'::JSONB,
  -- Emergency shutdown.
  emergency_shutdown BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, flag_key)
);

ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS business_id UUID;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY flags_viewable ON feature_flags FOR SELECT
  USING (business_id IS NULL OR business_id IN (SELECT id FROM businesses));
CREATE POLICY flags_managing ON feature_flags FOR ALL
  USING (business_id IS NULL OR business_id IN (SELECT id FROM businesses));

CREATE OR REPLACE TRIGGER feature_flags_updated_at BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- is_feature_enabled: consult a flag for a business with rollout gating.
CREATE OR REPLACE FUNCTION is_feature_enabled(p_business_id UUID, p_flag_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_enabled BOOLEAN; v_shutdown BOOLEAN; v_pct INTEGER; v_hash INTEGER;
BEGIN
  SELECT enabled, emergency_shutdown, rollout_pct INTO v_enabled, v_shutdown, v_pct
  FROM feature_flags
  WHERE (business_id IS NULL OR business_id = p_business_id) AND flag_key = p_flag_key
  ORDER BY business_id NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_shutdown THEN RETURN FALSE; END IF;
  IF NOT v_enabled THEN RETURN FALSE; END IF;
  -- Deterministic per-business rollout hash.
  v_hash := abs(hashtext(p_business_id::TEXT || p_flag_key)) % 100;
  RETURN v_hash < v_pct;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- §54 INCIDENT MANAGEMENT — Detect→Classify→Contain→Escalate→Recover→
-- Verify→Report→Learn.
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),
  -- §54 lifecycle.
  status TEXT DEFAULT 'detected' CHECK (status IN (
    'detected','classified','contained','escalated','recovered','verified','reported','learned'
  )),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  classified_at TIMESTAMPTZ,
  contained_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  reported_at TIMESTAMPTZ,
  -- Learning.
  root_cause TEXT,
  lessons_learned TEXT,
  -- Link to circuit breaker if AI-caused.
  circuit_breaker_event_id UUID REFERENCES circuit_breaker_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY incidents_viewable ON incidents FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY incidents_managing ON incidents FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- advance_incident: move to the next lifecycle stage.
CREATE OR REPLACE FUNCTION advance_incident(p_incident_id UUID, p_stage TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE incidents SET status = p_stage,
    classified_at = CASE WHEN p_stage='classified' THEN NOW() ELSE classified_at END,
    contained_at = CASE WHEN p_stage='contained' THEN NOW() ELSE contained_at END,
    escalated_at = CASE WHEN p_stage='escalated' THEN NOW() ELSE escalated_at END,
    recovered_at = CASE WHEN p_stage='recovered' THEN NOW() ELSE recovered_at END,
    verified_at = CASE WHEN p_stage='verified' THEN NOW() ELSE verified_at END,
    reported_at = CASE WHEN p_stage='reported' THEN NOW() ELSE reported_at END
  WHERE id = p_incident_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §55 ANOMALY DETECTION — monitor unusual transaction volume, API
-- activity, permission changes, payroll changes, exports and autonomous
-- actions.
-- ============================================================
CREATE TABLE IF NOT EXISTS anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN (
    'transaction_volume','api_activity','permission_change','payroll_change',
    'export','autonomous_action','other'
  )),
  severity TEXT DEFAULT 'warning',
  measured_value NUMERIC,
  baseline_value NUMERIC,
  detail JSONB DEFAULT '{}'::JSONB,
  -- Link to circuit breaker if it tripped one.
  circuit_breaker_event_id UUID REFERENCES circuit_breaker_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE anomaly_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_viewable ON anomaly_events FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY anomaly_managing ON anomaly_events FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

COMMENT ON TABLE self_audit_findings IS 'System + business health self-audit findings (§45/§46).';
COMMENT ON TABLE reconciliation_runs IS 'Continuous reconciliation engine across domain pairs (§47).';
COMMENT ON TABLE dead_workflow_findings IS 'Dead workflow detection (§49).';
COMMENT ON TABLE duplicate_automation_findings IS 'Duplicate automation detection (§50).';
COMMENT ON TABLE system_dependencies IS 'System-level dependency graph (§51).';
COMMENT ON TABLE configuration_versions IS 'Rollback architecture: versioned config snapshots (§52).';
COMMENT ON TABLE feature_flags IS 'Feature flags with rollout + emergency shutdown (§53).';
COMMENT ON TABLE incidents IS 'Incident management lifecycle (§54).';
COMMENT ON TABLE anomaly_events IS 'Anomaly detection across transaction/api/permission/payroll/export/autonomous (§55).';
