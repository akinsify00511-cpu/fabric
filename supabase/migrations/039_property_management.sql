-- Migration: Property & Real Estate Management
-- Core property management tables for real estate businesses

-- ============================================
-- PROPERTY LISTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Property Details
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL CHECK (property_type IN (
    'residential', 'commercial', 'land', 'industrial', 'mixed_use'
  )),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('sale', 'rent', 'both')),
  -- Location
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'Nigeria',
  postal_code TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  -- Property Specs
  bedrooms INTEGER,
  bathrooms INTEGER,
  parking_spaces INTEGER,
  total_area_sqm DECIMAL(12, 2),
  furnished BOOLEAN DEFAULT FALSE,
  -- Pricing
  price DECIMAL(15, 2), -- Sale price
  rent_amount DECIMAL(15, 2), -- Monthly rent
  price_type TEXT CHECK (price_type IN ('fixed', 'negotiable', 'per_sqm')),
  -- Status
  status TEXT DEFAULT 'available' CHECK (status IN (
    'available', 'under_offer', 'sold', 'rented', 'withdrawn', 'pending'
  )),
  -- Media
  images JSONB DEFAULT '[]'::jsonb,
  documents JSONB DEFAULT '[]'::jsonb,
  -- Agent/Owner
  assigned_agent_id UUID REFERENCES staff(id),
  owner_id UUID REFERENCES clients(id),
  -- Commission
  commission_rate DECIMAL(5, 2), -- Percentage
  commission_fixed DECIMAL(15, 2),
  -- SEO
  slug TEXT UNIQUE,
  meta_title TEXT,
  meta_description TEXT,
  -- Timestamps
  listed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Properties are viewable by business" ON properties
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Properties are manageable by business" ON properties
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_properties_business ON properties(business_id);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_listing ON properties(listing_type);
CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(city, state);

CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- PROPERTY ENQUIRIES
-- ============================================
CREATE TABLE IF NOT EXISTS property_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Contact Info
  client_id UUID REFERENCES clients(id),
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  -- Enquiry Details
  enquiry_type TEXT CHECK (enquiry_type IN ('viewing', 'purchase', 'rental', 'information')),
  message TEXT,
  preferred_date DATE,
  preferred_time TIME,
  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'viewing_scheduled', 'qualified', 'lost')),
  notes TEXT,
  assigned_to UUID REFERENCES staff(id),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE property_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enquiries viewable by business" ON property_enquiries
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Enquiries manageable by business" ON property_enquiries
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_enquiries_property ON property_enquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON property_enquiries(status);

-- ============================================
-- LEASE AGREEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS lease_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Parties
  landlord_id UUID REFERENCES clients(id), -- Owner
  tenant_id UUID NOT NULL REFERENCES clients(id),
  -- Lease Terms
  lease_type TEXT CHECK (lease_type IN ('residential', 'commercial', 'land', 'short_term')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_months INTEGER,
  -- Rent
  monthly_rent DECIMAL(15, 2) NOT NULL,
  rent_due_day INTEGER DEFAULT 1, -- Day of month rent is due
  security_deposit DECIMAL(15, 2),
  advance_months INTEGER DEFAULT 1,
  -- Terms
  terms_conditions TEXT,
  renewal_option BOOLEAN DEFAULT FALSE,
  pet_policy TEXT,
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_signature', 'active', 'renewed', 'terminated', 'expired'
  )),
  -- Payment
  next_rent_due DATE,
  -- Timestamps
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lease_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leases viewable by business" ON lease_agreements
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Leases manageable by business" ON lease_agreements
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_leases_property ON lease_agreements(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON lease_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON lease_agreements(status);

CREATE TRIGGER leases_updated_at BEFORE UPDATE ON lease_agreements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RENT PAYMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS rent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES lease_agreements(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES clients(id),
  -- Payment Details
  amount DECIMAL(15, 2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  -- Payment Info
  paid_date DATE,
  payment_method TEXT,
  reference_number TEXT,
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'paid', 'partial', 'overdue', 'waived'
  )),
  late_fee DECIMAL(15, 2) DEFAULT 0,
  notes TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rent_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rent payments viewable by business" ON rent_payments
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Rent payments manageable by business" ON rent_payments
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_rent_lease ON rent_payments(lease_id);
CREATE INDEX IF NOT EXISTS idx_rent_tenant ON rent_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_status ON rent_payments(status);
CREATE INDEX IF NOT EXISTS idx_rent_due ON rent_payments(due_date);

-- ============================================
-- PROPERTY MAINTENANCE
-- ============================================
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES lease_agreements(id),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Reporter
  reported_by UUID REFERENCES clients(id),
  assigned_to UUID REFERENCES staff(id),
  -- Issue Details
  category TEXT CHECK (category IN (
    'plumbing', 'electrical', 'structural', 'hvac', 'appliances',
    'pest_control', 'cleaning', 'landscaping', 'security', 'other'
  )),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  -- Status
  status TEXT DEFAULT 'reported' CHECK (status IN (
    'reported', 'assigned', 'in_progress', 'pending_parts', 'completed', 'cancelled'
  )),
  -- Resolution
  resolution_notes TEXT,
  completed_at TIMESTAMPTZ,
  cost DECIMAL(15, 2),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Maintenance viewable by business" ON maintenance_requests
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Maintenance manageable by business" ON maintenance_requests
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_maintenance_property ON maintenance_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_priority ON maintenance_requests(priority);

CREATE TRIGGER maintenance_updated_at BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- PROPERTY INSPECTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS property_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES lease_agreements(id),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Inspector
  inspector_id UUID REFERENCES staff(id),
  -- Inspection Details
  inspection_type TEXT CHECK (inspection_type IN (
    'move_in', 'move_out', 'routine', 'quarterly', 'annual'
  )),
  scheduled_date TIMESTAMPTZ NOT NULL,
  completed_date TIMESTAMPTZ,
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'in_progress', 'completed', 'cancelled'
  )),
  -- Report
  condition_rating TEXT CHECK (condition_rating IN ('excellent', 'good', 'fair', 'poor')),
  findings TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  recommendations TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE property_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inspections viewable by business" ON property_inspections
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Inspections manageable by business" ON property_inspections
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_inspections_property ON property_inspections(property_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON property_inspections(status);

-- ============================================
-- FUNCTION: Auto-update property status
-- ============================================
CREATE OR REPLACE FUNCTION update_property_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if there's an active lease
  IF EXISTS (
    SELECT 1 FROM lease_agreements
    WHERE property_id = NEW.property_id
    AND status = 'active'
    AND end_date > CURRENT_DATE
  ) THEN
    UPDATE properties SET status = 'rented' WHERE id = NEW.property_id;
  -- Check if there's a pending sale
  ELSIF EXISTS (
    SELECT 1 FROM properties
    WHERE id = NEW.property_id
    AND listing_type IN ('sale', 'both')
    AND status = 'under_offer'
  ) THEN
    -- Keep as under_offer
    NULL;
  ELSE
    UPDATE properties SET status = 'available' WHERE id = NEW.property_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_property_on_lease_change
  AFTER INSERT OR UPDATE OR DELETE ON lease_agreements
  FOR EACH ROW EXECUTE FUNCTION update_property_status();

-- ============================================
-- FUNCTION: Generate property slug
-- ============================================
CREATE OR REPLACE FUNCTION generate_property_slug(title TEXT, business_id UUID)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Create base slug from title
  base_slug := lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;
  
  -- Check for existing slugs
  WHILE EXISTS (
    SELECT 1 FROM properties 
    WHERE slug = final_slug AND business_id = generate_property_slug.business_id
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Audit logging for property changes
-- ============================================
INSERT INTO audit_logs (business_id, action, entity_type, entity_id, new_values)
SELECT 
  business_id,
  'create',
  'property',
  id,
  jsonb_build_object('title', title, 'listing_type', listing_type, 'price', price)
FROM properties WHERE id IN (SELECT id FROM properties);
