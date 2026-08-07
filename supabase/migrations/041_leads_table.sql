-- ============================================
-- Leads Table
-- Public-facing lead capture for sales funnel
-- ============================================

-- Leads table for capturing website/app leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Contact information
  full_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  
  -- Lead details
  source TEXT DEFAULT 'website', -- website, referral, social, etc.
  interested_in TEXT, -- crm, finance, projects, hr, full
  message TEXT,
  
  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  assigned_to UUID REFERENCES staff(id),
  
  -- Tracking
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  contacted_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_source ON leads(source);
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE INDEX idx_leads_email ON leads(email);

-- RLS - Allow public insert for lead capture, authenticated users can view
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert leads (public form)
CREATE POLICY "Anyone can create leads"
  ON leads FOR INSERT
  WITH CHECK (TRUE);

-- Allow authenticated users to view leads in their business
CREATE POLICY "Users can view business leads"
  ON leads FOR SELECT
  USING (
    assigned_to IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
    OR assigned_to IS NULL -- Unassigned leads visible to all
  );

-- Allow update for assigned staff
CREATE POLICY "Users can update assigned leads"
  ON leads FOR UPDATE
  USING (
    assigned_to IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE leads IS 'Public-facing lead capture for sales funnel';
COMMENT ON COLUMN leads.source IS 'Lead source: website, referral, social, ad, etc.';
COMMENT ON COLUMN leads.status IS 'Lead lifecycle: new, contacted, qualified, converted, lost';
COMMENT ON COLUMN leads.interested_in IS 'Product interest: crm, finance, projects, hr, full';
