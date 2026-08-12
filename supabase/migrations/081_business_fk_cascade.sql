-- 081_business_fk_cascade.sql
--
-- Two business-scoped child tables were created with a bare
-- `business_id ... REFERENCES businesses(id)` and NO ON DELETE action:
--
--   api_request_logs.business_id  (migration 015)
--   deal_analytics.business_id    (migration 034)
--
-- The default action is RESTRICT, so deleting a business would fail as long
-- as either table holds a row for it -- the business becomes undeletable and
-- the rows are effectively orphaned from a lifecycle standpoint. Both tables
-- are purely business-owned child data (API request logs, deal win/loss
-- analytics) with no cross-tenant meaning, so they should be cleaned up when
-- the business is deleted, matching the ~295 other business FKs that already
-- use ON DELETE CASCADE.
--
-- Pure internal SQL. No new dependency.

\set ON_ERROR_STOP on

-- api_request_logs: drop whatever FK name Postgres assigned, re-add named.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'api_request_logs'::regclass AND contype = 'f'
             AND connamespace = 'public'::regnamespace LOOP
    EXECUTE format('ALTER TABLE public.api_request_logs DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.api_request_logs
  ADD CONSTRAINT api_request_logs_business_fk
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- deal_analytics: same.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'deal_analytics'::regclass AND contype = 'f'
             AND connamespace = 'public'::regnamespace LOOP
    EXECUTE format('ALTER TABLE public.deal_analytics DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.deal_analytics
  ADD CONSTRAINT deal_analytics_business_fk
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
