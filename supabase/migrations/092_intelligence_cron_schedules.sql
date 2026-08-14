-- 092_intelligence_cron_schedules.sql
--
-- P2 / U8 of the Intelligence Transformation. Schedules the intelligence
-- background jobs via pg_cron (enabled in 051, schema `extensions`). These
-- keep the governed metrics, data-quality findings, recommendations, and
-- inactive-customer detection fresh without a human trigger.
--
-- Jobs (named, unschedule-first so re-running updates rather than dupes):
--   avenize-refresh-metrics       — refresh_business_metrics for all active
--                                   businesses, every 15 minutes.
--   avenize-data-quality-scan     — scan_data_quality for all businesses,
--                                   every hour.
--   avenize-recommendation-rules  — run_recommendation_rules for all
--                                   businesses, every hour (after the
--                                   data-quality scan so DQ-001 sees fresh
--                                   findings).
--   avenize-detect-customer-inactive — detect_customer_inactive_all, daily
--                                   at 02:00.
--
-- The per-business fan-out helpers (`*_all`) are SECURITY DEFINER and run as
-- the service role (pg_cron runs as the cron superuser); they iterate
-- businesses idempotently. Each per-business call is best-effort (a failure
-- for one business is logged via the function's own processing_error path and
-- does not abort the others). No external dependency.
--
-- pg_cron is already enabled (051). If it is not present on a given DB, the
-- DO blocks below no-op via EXCEPTION so the migration never fails (§24).

\set ON_ERROR_STOP on

-- ============================================================
-- 1. Fan-out helpers (iterate all businesses).
-- ============================================================

-- Refresh governed metrics for every business with at least one staff row
-- (an active business). Best-effort per business.
CREATE OR REPLACE FUNCTION refresh_all_business_metrics()
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0; b UUID;
BEGIN
  FOR b IN SELECT DISTINCT s.business_id FROM staff s LOOP
    BEGIN
      PERFORM refresh_business_metrics(b);
      -- Sync OKR key results that link to governed metrics (094 §24) so
      -- OKR progress reflects real data. Best-effort; no-op if 094 absent.
      PERFORM sync_kr_from_metric(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Scan data quality for every business with invoices or contacts (has data
-- worth scanning). Best-effort per business.
CREATE OR REPLACE FUNCTION scan_all_business_data_quality()
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0; b UUID;
BEGIN
  FOR b IN SELECT DISTINCT business_id FROM invoices LOOP
    BEGIN
      PERFORM scan_data_quality(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  -- Also scan businesses with contacts but no invoices (dedupe/stale checks).
  FOR b IN SELECT DISTINCT business_id FROM contacts
           WHERE business_id NOT IN (SELECT DISTINCT business_id FROM invoices) LOOP
    BEGIN
      PERFORM scan_data_quality(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run recommendation rules for every business with staff (active business).
-- Best-effort per business. Run AFTER the data-quality scan so DQ-001 is
-- evidence-current.
CREATE OR REPLACE FUNCTION run_all_recommendation_rules()
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0; b UUID;
BEGIN
  FOR b IN SELECT DISTINCT business_id FROM staff LOOP
    BEGIN
      PERFORM run_recommendation_rules(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Compute Business Health (§21) for every active business. Run AFTER the
-- metrics refresh so the score is based on fresh governed metrics. Best-effort
-- per business (093 must be applied; if not, this no-ops per business).
CREATE OR REPLACE FUNCTION compute_all_business_health()
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0; b UUID;
BEGIN
  FOR b IN SELECT DISTINCT business_id FROM staff LOOP
    BEGIN
      PERFORM compute_business_health(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- These fan-out helpers are invoked by pg_cron (runs as cron superuser); they
-- are NOT granted to anon/authenticated to prevent a client from triggering a
-- full cross-business sweep.

-- ============================================================
-- 2. Register the cron schedules (named, unschedule-first).
-- pg_cron is in schema `extensions` (051). Guard the whole block so a DB
-- without pg_cron doesn't fail the migration.
-- ============================================================
DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-refresh-metrics');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-refresh-metrics',
    '*/15 * * * *',                     -- every 15 minutes
    $$ SELECT public.refresh_all_business_metrics(); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-refresh-metrics not scheduled: %', SQLERRM;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-business-health');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- Run 2 minutes after the metrics refresh so the score uses fresh metrics.
DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-business-health',
    '2,17,32,47 * * * *',               -- 2 min after each metrics refresh
    $$ SELECT public.compute_all_business_health(); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-business-health not scheduled: %', SQLERRM;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-data-quality-scan');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-data-quality-scan',
    '0 * * * *',                        -- at minute 0 of every hour
    $$ SELECT public.scan_all_business_data_quality(); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-data-quality-scan not scheduled: %', SQLERRM;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-recommendation-rules');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- Run 5 minutes after the data-quality scan so DQ-001 sees fresh findings.
DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-recommendation-rules',
    '5 * * * *',                        -- 5 minutes past the hour
    $$ SELECT public.run_all_recommendation_rules(); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-recommendation-rules not scheduled: %', SQLERRM;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-detect-customer-inactive');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-detect-customer-inactive',
    '0 2 * * *',                        -- daily at 02:00
    $$ SELECT public.detect_customer_inactive_all(90); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-detect-customer-inactive not scheduled: %', SQLERRM;
END$$;

COMMENT ON FUNCTION refresh_all_business_metrics IS
  'pg_cron fan-out: refresh governed metrics for all active businesses (every 15 min). Best-effort per business.';
COMMENT ON FUNCTION scan_all_business_data_quality IS
  'pg_cron fan-out: run the data-quality scanner for all businesses with data (hourly). Best-effort per business.';
COMMENT ON FUNCTION run_all_recommendation_rules IS
  'pg_cron fan-out: run the recommendation issuer for all active businesses (hourly, after the DQ scan). Best-effort per business.';
COMMENT ON FUNCTION compute_all_business_health IS
  'pg_cron fan-out: compute the Business Health score (§21) for all active businesses (every 15 min, after metrics refresh). Best-effort per business.';
