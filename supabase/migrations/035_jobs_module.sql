-- ============================================
-- JOBS MODULE - Field Service Management
-- Core of Avenize for Nigerian field-service businesses
-- ============================================

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  client_address TEXT,
  job_type TEXT DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID REFERENCES staff(id),
  created_by UUID REFERENCES staff(id),
  location_text TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_hours DECIMAL(6,2),
  actual_hours DECIMAL(6,2),
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job updates (field reports, photos, status changes)
CREATE TABLE IF NOT EXISTS job_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  type TEXT NOT NULL DEFAULT 'update'
    CHECK (type IN ('update', 'status_change', 'photo', 'note', 'assignment', 'completion')),
  content TEXT,
  photo_url TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job types (configurable per business)
CREATE TABLE IF NOT EXISTS job_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  default_priority TEXT DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, name)
);

-- Row Level Security
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_types ENABLE ROW LEVEL SECURITY;

-- Jobs: business members can CRUD jobs in their business
CREATE POLICY "jobs_select" ON jobs FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
  ));

CREATE POLICY "jobs_insert" ON jobs FOR INSERT
  WITH CHECK (business_id IN (
    SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
  ));

CREATE POLICY "jobs_update" ON jobs FOR UPDATE
  USING (business_id IN (
    SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
  ));

CREATE POLICY "jobs_delete" ON jobs FOR DELETE
  USING (business_id IN (
    SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
  ));

-- Job updates: business members can see/insert updates
CREATE POLICY "job_updates_select" ON job_updates FOR SELECT
  USING (job_id IN (
    SELECT id FROM jobs WHERE business_id IN (
      SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
    )
  ));

CREATE POLICY "job_updates_insert" ON job_updates FOR INSERT
  WITH CHECK (job_id IN (
    SELECT id FROM jobs WHERE business_id IN (
      SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
    )
  ));

-- Job types: business members can CRUD
CREATE POLICY "job_types_select" ON job_types FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
  ));

CREATE POLICY "job_types_insert" ON job_types FOR INSERT
  WITH CHECK (business_id IN (
    SELECT business_id FROM staff WHERE staff.user_id = auth.uid()
  ));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed default job types for existing businesses
INSERT INTO job_types (business_id, name, icon, color)
SELECT id, 'Installation', 'Wrench', '#3B82F6'
FROM businesses ON CONFLICT (business_id, name) DO NOTHING;

INSERT INTO job_types (business_id, name, icon, color)
SELECT id, 'Repair', 'Hammer', '#F59E0B'
FROM businesses ON CONFLICT (business_id, name) DO NOTHING;

INSERT INTO job_types (business_id, name, icon, color)
SELECT id, 'Maintenance', 'Settings', '#10B981'
FROM businesses ON CONFLICT (business_id, name) DO NOTHING;

INSERT INTO job_types (business_id, name, icon, color)
SELECT id, 'Inspection', 'Search', '#8B5CF6'
FROM businesses ON CONFLICT (business_id, name) DO NOTHING;

INSERT INTO job_types (business_id, name, icon, color)
SELECT id, 'Delivery', 'Truck', '#EF4444'
FROM businesses ON CONFLICT (business_id, name) DO NOTHING;

INSERT INTO job_types (business_id, name, icon, color)
SELECT id, 'Consultation', 'MessageSquare', '#06B6D4'
FROM businesses ON CONFLICT (business_id, name) DO NOTHING;
