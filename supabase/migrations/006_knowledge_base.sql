-- AVENIZE Layer 1 - Knowledge Base (Notion competitor)
-- Spaces, pages, rich content, versioning

-- ============================================
-- KNOWLEDGE SPACES TABLE (top-level containers)
-- ============================================
CREATE TABLE IF NOT EXISTS kb_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon_emoji TEXT DEFAULT '📁',
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS kb_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES kb_spaces(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES kb_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content JSONB DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb, -- TipTap/ProseMirror JSON
  icon_emoji TEXT,
  cover_url TEXT,
  slug TEXT, -- URL-friendly identifier
  is_published BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES staff(id),
  last_edited_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAGE VERSIONS TABLE (for history)
-- ============================================
CREATE TABLE IF NOT EXISTS kb_page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES kb_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB,
  version_number INTEGER NOT NULL,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAGE PERMISSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS kb_page_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES kb_pages(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_id, staff_id)
);

-- ============================================
-- PAGE COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS kb_page_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES kb_pages(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES kb_page_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAGE TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS kb_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  space_id UUID REFERENCES kb_spaces(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  content JSONB,
  icon_emoji TEXT DEFAULT '📄',
  is_shared BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE kb_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_page_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_templates ENABLE ROW LEVEL SECURITY;

-- Spaces: visible to all in business
CREATE POLICY "Spaces visible to business"
  ON kb_spaces FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Spaces create"
  ON kb_spaces FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Spaces update"
  ON kb_spaces FOR UPDATE
  USING (created_by = (SELECT id FROM staff WHERE user_id = auth.uid()) OR is_default = TRUE);

-- Pages: visible if space accessible (inherits from space)
CREATE POLICY "Pages visible"
  ON kb_pages FOR SELECT
  USING (space_id IN (SELECT id FROM kb_spaces WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Pages create"
  ON kb_pages FOR INSERT
  WITH CHECK (space_id IN (SELECT id FROM kb_spaces WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Pages update"
  ON kb_pages FOR UPDATE
  USING (
    created_by = (SELECT id FROM staff WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM kb_page_permissions WHERE page_id = kb_pages.id AND staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()) AND role IN ('editor', 'admin'))
  );

-- Versions: visible to page viewers
CREATE POLICY "Versions visible"
  ON kb_page_versions FOR SELECT
  USING (page_id IN (SELECT id FROM kb_pages WHERE space_id IN (SELECT id FROM kb_spaces WHERE business_id IN (SELECT business_id FROM get_current_staff()))));

CREATE POLICY "Versions create"
  ON kb_page_versions FOR INSERT
  WITH CHECK (page_id IN (SELECT id FROM kb_pages WHERE space_id IN (SELECT id FROM kb_spaces WHERE business_id IN (SELECT business_id FROM get_current_staff()))));

-- Permissions: own permissions
CREATE POLICY "Permissions view"
  ON kb_page_permissions FOR SELECT
  USING (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()) OR page_id IN (SELECT id FROM kb_pages WHERE created_by = (SELECT id FROM staff WHERE user_id = auth.uid())));

CREATE POLICY "Permissions manage"
  ON kb_page_permissions FOR ALL
  USING (page_id IN (SELECT id FROM kb_pages WHERE created_by = (SELECT id FROM staff WHERE user_id = auth.uid())));

-- Comments: visible to space members
CREATE POLICY "Comments visible"
  ON kb_page_comments FOR SELECT
  USING (page_id IN (SELECT id FROM kb_pages WHERE space_id IN (SELECT id FROM kb_spaces WHERE business_id IN (SELECT business_id FROM get_current_staff()))));

CREATE POLICY "Comments create"
  ON kb_page_comments FOR INSERT
  WITH CHECK (page_id IN (SELECT id FROM kb_pages WHERE space_id IN (SELECT id FROM kb_spaces WHERE business_id IN (SELECT business_id FROM get_current_staff()))));

CREATE POLICY "Comments update"
  ON kb_page_comments FOR UPDATE
  USING (created_by = (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Templates: business-wide
CREATE POLICY "Templates visible"
  ON kb_templates FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Templates create"
  ON kb_templates FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get all pages for a space (flat or nested)
CREATE OR REPLACE FUNCTION get_space_pages(p_space_id UUID)
RETURNS TABLE (
  id UUID,
  parent_id UUID,
  title TEXT,
  icon_emoji TEXT,
  slug TEXT,
  is_archived BOOLEAN,
  created_by UUID,
  updated_at TIMESTAMPTZ,
  depth INT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE page_tree AS (
    SELECT
      p.id,
      p.parent_id,
      p.title,
      p.icon_emoji,
      p.slug,
      p.is_archived,
      p.created_by,
      p.updated_at,
      0 as depth
    FROM kb_pages p
    WHERE p.space_id = p_space_id AND p.parent_id IS NULL AND NOT p.is_archived
    
    UNION ALL
    
    SELECT
      p.id,
      p.parent_id,
      p.title,
      p.icon_emoji,
      p.slug,
      p.is_archived,
      p.created_by,
      p.updated_at,
      pt.depth + 1
    FROM kb_pages p
    INNER JOIN page_tree pt ON p.parent_id = pt.id
    WHERE NOT p.is_archived
  )
  SELECT * FROM page_tree ORDER BY depth, title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create default knowledge space for new business
CREATE OR REPLACE FUNCTION create_default_kb_space()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
  v_space_id UUID;
  v_welcome_page_id UUID;
BEGIN
  SELECT id INTO v_owner_id FROM staff WHERE business_id = NEW.id AND role = 'owner' LIMIT 1;
  
  -- Create default space
  INSERT INTO kb_spaces (business_id, name, description, icon_emoji, is_default, created_by)
  VALUES (NEW.id, 'Getting Started', 'Welcome to your knowledge base', '🚀', TRUE, v_owner_id)
  RETURNING id INTO v_space_id;
  
  -- Create welcome page
  INSERT INTO kb_pages (space_id, title, content, icon_emoji, created_by, last_edited_by)
  VALUES (
    v_space_id,
    'Welcome to Avenize',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Welcome to your knowledge base"}]},{"type":"paragraph","content":[{"type":"text","text":"This is your central hub for documentation, processes, and team knowledge."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Getting Started"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Add pages to organize your content"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Invite team members to collaborate"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Create templates for recurring documents"}]}]}]}]}',
    '👋',
    v_owner_id,
    v_owner_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_business_created_kb
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION create_default_kb_space();

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER kb_spaces_updated_at BEFORE UPDATE ON kb_spaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER kb_pages_updated_at BEFORE UPDATE ON kb_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER kb_page_comments_updated_at BEFORE UPDATE ON kb_page_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
