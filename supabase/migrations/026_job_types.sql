-- ============================================
-- Configurable Job Types
-- Allows each business to define their own job/project types
-- ============================================

CREATE TABLE IF NOT EXISTS job_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#6366F1',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, label)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_types_business ON job_types(business_id);
CREATE INDEX IF NOT EXISTS idx_job_types_sort ON job_types(business_id, sort_order);

-- Pipeline Stages (per business)
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#6366F1',
  probability INTEGER DEFAULT 50,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, key)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_business ON pipeline_stages(business_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_sort ON pipeline_stages(business_id, sort_order);

-- Enable RLS
ALTER TABLE job_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_types
CREATE POLICY "Users can view own business job types"
  ON job_types FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage own business job types"
  ON job_types FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for pipeline_stages
CREATE POLICY "Users can view own business pipeline stages"
  ON pipeline_stages FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage own business pipeline stages"
  ON pipeline_stages FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_job_types_updated_at
  BEFORE UPDATE ON job_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Default Job Types (seeded per business)
-- ============================================
CREATE OR REPLACE FUNCTION seed_default_job_types(p_business_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO job_types (business_id, label, color, sort_order) VALUES
    (p_business_id, 'General', '#6366F1', 1),
    (p_business_id, 'Restoration', '#10B981', 2),
    (p_business_id, 'Real Estate', '#F59E0B', 3),
    (p_business_id, 'Paint Production', '#8B5CF6', 4)
  ON CONFLICT (business_id, label) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Default Pipeline Stages (seeded per business)
-- ============================================
CREATE OR REPLACE FUNCTION seed_default_pipeline_stages(p_business_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO pipeline_stages (business_id, key, label, color, probability, sort_order) VALUES
    (p_business_id, 'inquiry', 'Inquiry', '#6366F1', 10, 1),
    (p_business_id, 'quoted', 'Quoted', '#8B5CF6', 25, 2),
    (p_business_id, 'negotiating', 'Negotiating', '#F59E0B', 50, 3),
    (p_business_id, 'won', 'Won', '#10B981', 100, 4),
    (p_business_id, 'lost', 'Lost', '#EF4444', 0, 5)
  ON CONFLICT (business_id, key) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Trigger to auto-seed defaults on business creation
-- ============================================
CREATE OR REPLACE FUNCTION on_business_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_job_types(NEW.id);
  PERFORM seed_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This would need a trigger on businesses table
-- For existing businesses, run manually:
-- SELECT seed_default_job_types(business_id) FROM businesses;

-- ============================================
-- Seed for existing businesses
-- ============================================
DO $$
DECLARE
  b RECORD;
BEGIN
  FOR b IN SELECT id FROM businesses LOOP
    PERFORM seed_default_job_types(b.id);
    PERFORM seed_default_pipeline_stages(b.id);
  END LOOP;
END $$;

COMMENT ON TABLE job_types IS 'Business-configurable job/project types (formerly hardcoded)';
COMMENT ON TABLE pipeline_stages IS 'Business-configurable pipeline stages with probability';
