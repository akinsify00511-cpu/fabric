-- Company Home Page Builder
-- Enables businesses to create/edit a customizable company home page

-- Main table for home page content blocks
CREATE TABLE company_home_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN (
    'hero',           -- Large banner with title and description
    'announcement',   -- Important news/updates
    'team_spotlight', -- Featured team member(s)
    'metrics',        -- Key stats/numbers
    'gallery',        -- Image gallery
    'quote',          -- Testimonial or quote
    'cta',            -- Call to action button
    'text'            -- Rich text section
  )),
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  -- Content structure varies by block_type:
  -- hero: { subtitle, cta_text, cta_link, background_image }
  -- announcement: { body, author, published_at, priority }
  -- team_spotlight: { staff_ids[], description }
  -- metrics: { items: [{ label, value, change }] }
  -- gallery: { images: [{ url, caption }], layout }
  -- quote: { text, author, role, avatar_url }
  -- cta: { text, link, style }
  -- text: { body }
  "order" INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN DEFAULT false,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX idx_company_home_blocks_business ON company_home_blocks(business_id);
CREATE INDEX idx_company_home_blocks_order ON company_home_blocks(business_id, "order");
CREATE INDEX idx_company_home_blocks_published ON company_home_blocks(business_id, published);

-- RLS Policies
ALTER TABLE company_home_blocks ENABLE ROW LEVEL SECURITY;

-- Everyone in the business can view published blocks
CREATE POLICY "View published blocks" ON company_home_blocks
  FOR SELECT USING (
    published = true AND 
    business_id IN (
      SELECT business_id FROM staff WHERE id = auth.uid()
    )
  );

-- Only owners and managers can view all blocks (including drafts)
CREATE POLICY "View all blocks for editors" ON company_home_blocks
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM staff 
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Only owners and managers can create blocks
CREATE POLICY "Create blocks" ON company_home_blocks
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT business_id FROM staff 
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Only owners and managers can update blocks
CREATE POLICY "Update blocks" ON company_home_blocks
  FOR UPDATE USING (
    business_id IN (
      SELECT business_id FROM staff 
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Only owners and managers can delete blocks
CREATE POLICY "Delete blocks" ON company_home_blocks
  FOR DELETE USING (
    business_id IN (
      SELECT business_id FROM staff 
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Comments on announcements
CREATE TABLE home_block_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES company_home_blocks(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE home_block_comments ENABLE ROW LEVEL SECURITY;

-- Anyone in business can view comments
CREATE POLICY "View comments" ON home_block_comments
  FOR SELECT USING (
    staff_id IN (
      SELECT id FROM staff WHERE business_id = (
        SELECT business_id FROM company_home_blocks WHERE id = block_id
      )
    )
  );

-- Anyone in business can comment
CREATE POLICY "Create comments" ON home_block_comments
  FOR INSERT WITH CHECK (
    staff_id IN (
      SELECT id FROM staff WHERE business_id = (
        SELECT business_id FROM company_home_blocks WHERE id = block_id
      )
    )
  );

-- Only comment author can update/delete
CREATE POLICY "Update own comments" ON home_block_comments
  FOR UPDATE USING (staff_id = auth.uid());

CREATE POLICY "Delete own comments" ON home_block_comments
  FOR DELETE USING (staff_id = auth.uid());

-- Reactions on announcements
CREATE TABLE home_block_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES company_home_blocks(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  reaction_type TEXT NOT NULL DEFAULT 'like', -- like, celebrate, insight, love
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(block_id, staff_id)
);

ALTER TABLE home_block_reactions ENABLE ROW LEVEL SECURITY;

-- View reactions if you can see the block
CREATE POLICY "View reactions" ON home_block_reactions
  FOR SELECT USING (
    staff_id IN (
      SELECT id FROM staff WHERE business_id = (
        SELECT business_id FROM company_home_blocks WHERE id = block_id
      )
    )
  );

-- Add reaction if in business
CREATE POLICY "Add reactions" ON home_block_reactions
  FOR INSERT WITH CHECK (
    staff_id IN (
      SELECT id FROM staff WHERE business_id = (
        SELECT business_id FROM company_home_blocks WHERE id = block_id
      )
    )
  );

-- Remove own reactions
CREATE POLICY "Remove own reactions" ON home_block_reactions
  FOR DELETE USING (staff_id = auth.uid());

-- Update own reactions
CREATE POLICY "Update own reactions" ON home_block_reactions
  FOR UPDATE USING (staff_id = auth.uid());

-- Trigger to update updated_at
CREATE TRIGGER update_company_home_blocks_updated_at
  BEFORE UPDATE ON company_home_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_home_block_comments_updated_at
  BEFORE UPDATE ON home_block_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample blocks for demo (will only work in demo mode)
-- This is a placeholder, actual demo data should be seeded differently
