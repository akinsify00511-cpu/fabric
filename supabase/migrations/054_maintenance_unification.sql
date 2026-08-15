-- 054_maintenance_unification.sql

-- Fallback: ensure maintenance_records exists (created by 039, but 039 may fail before reaching it)
CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID,
  asset_id UUID,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  assigned_to UUID,
  source_type TEXT DEFAULT 'equipment',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unify the equipment-scoped maintenance_records and property-scoped
-- maintenance_requests so one maintenance engine serves internal asset
-- maintenance AND tenant-reported facility/property issues, per the
-- Architecture doc §13.4 ("Facility Maintenance expansion").
--
-- Design choice: extend maintenance_records with a source_type discriminator
-- and a nullable asset_id (was NOT NULL), rather than rewriting either
-- table. Existing asset maintenance rows keep working (source_type defaults
-- to 'equipment'); property/facility maintenance can now be recorded
-- against the same engine. A UNION view surfaces both sources for any
-- cross-cutting maintenance dashboard.

-- 1. Relax asset_id to nullable so the same table can hold maintenance
--    not tied to an asset (property/facility work).
DO $$ BEGIN
  ALTER TABLE maintenance_records
    ALTER COLUMN asset_id DROP NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'maintenance_records table not found, skipping'; END $$;

-- 2. Add the source discriminator + a property reference for property-
--    sourced maintenance, so the engine knows the origin and can link back.
DO $$ BEGIN
  ALTER TABLE maintenance_records
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'equipment'
      CHECK (source_type IN ('equipment', 'property', 'facility')),
    ADD COLUMN IF NOT EXISTS property_id UUID,
    ADD COLUMN IF NOT EXISTS reported_by_client UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'maintenance_records/column not found, skipping'; END $$;

-- Backfill + indexes: only if table exists
DO $$ BEGIN
  UPDATE maintenance_records SET source_type = 'equipment' WHERE source_type IS NULL;
  CREATE INDEX IF NOT EXISTS idx_maintenance_source_type ON maintenance_records(source_type);
  CREATE INDEX IF NOT EXISTS idx_maintenance_property_id ON maintenance_records(property_id);
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'maintenance_records not found, skipping'; END $$;

ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS business_id UUID;
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS assigned_to UUID;

-- 3. RLS policies for the new property/facility rows mirror the existing
--    business-scoped equipment policies (maintenance_records already has
--    RLS enabled in 039_operations_backbone; the policies below cover the
--    new source types within the same business boundary).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'maintenance_records' AND policyname = 'maintenance_property_viewable_by_business'
  ) THEN
    CREATE POLICY maintenance_property_viewable_by_business
      ON maintenance_records FOR SELECT
      USING (source_type IN ('property','facility')
             AND business_id IN (SELECT id FROM businesses));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'maintenance_records' AND policyname = 'maintenance_property_managing_by_business'
  ) THEN
    CREATE POLICY maintenance_property_managing_by_business
      ON maintenance_records FOR ALL
      USING (source_type IN ('property','facility')
             AND business_id IN (SELECT id FROM businesses));
  END IF;
END $$;

-- 4. Unified maintenance view — one row per maintenance item across both
--    engines, normalized to a common shape for dashboards/reporting.
CREATE OR REPLACE VIEW unified_maintenance AS
SELECT
  id,
  business_id,
  source_type,
  asset_id,
  property_id,
  title,
  description,
  status,
  category,
  priority,
  cost,
  scheduled_date,
  completed_date,
  performed_by,
  assigned_to,
  created_at,
  updated_at,
  'maintenance_records'::TEXT AS origin_table
FROM maintenance_records
UNION ALL
SELECT
  mr.id,
  mr.business_id,
  'property'::TEXT AS source_type,
  NULL::UUID AS asset_id,
  mr.property_id,
  mr.title,
  mr.description,
  mr.status,
  mr.category,
  mr.priority,
  mr.cost,
  NULL::DATE AS scheduled_date,
  NULL::TIMESTAMPTZ AS completed_date,
  NULL::UUID AS performed_by,
  mr.assigned_to,
  mr.created_at,
  mr.updated_at,
  'maintenance_requests'::TEXT AS origin_table
FROM maintenance_requests mr;

COMMENT ON VIEW unified_maintenance IS
  'Cross-engine maintenance view (equipment + property + facility) for unified dashboards. See Architecture §13.4.';
