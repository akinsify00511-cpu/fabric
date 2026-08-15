-- AVENIZE Layer 1 - Business Branding & Portfolio
-- Custom branding, portfolios, and public profiles

-- ============================================
-- BUSINESS BRANDING SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS business_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  -- Brand Identity
  brand_name TEXT,
  tagline TEXT,
  logo_url TEXT,
  logo_dark_url TEXT, -- For dark mode
  favicon_url TEXT,
  og_image_url TEXT, -- Social sharing image
  -- Colors
  primary_color TEXT DEFAULT '#6366F1',
  secondary_color TEXT DEFAULT '#8B5CF6',
  accent_color TEXT DEFAULT '#EC4899',
  background_color TEXT DEFAULT '#FFFFFF',
  text_color TEXT DEFAULT '#1F2937',
  -- Typography
  font_family TEXT DEFAULT 'Inter',
  heading_font TEXT,
  -- Visual Identity
  brand_pattern TEXT, -- CSS pattern for backgrounds
  border_radius TEXT DEFAULT '12px',
  button_style TEXT DEFAULT 'rounded', -- rounded, sharp, pill
  -- Presentation
  brand_video_url TEXT,
  brand_story TEXT,
  year_founded INTEGER,
  team_size TEXT, -- '1-10', '11-50', '51-200', '201-500', '500+'
  industry TEXT,
  headquarters TEXT,
  -- Contact
  website TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  -- Social Links
  social_links JSONB DEFAULT '{}', -- {linkedin, twitter, facebook, instagram, youtube}
  -- Status
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BUSINESS PORTFOLIO SECTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL CHECK (section_type IN (
    'hero', 'about', 'services', 'portfolio', 'team', 'testimonials',
    'contact', 'gallery', 'stats', 'cta', 'faq', 'pricing', 'blog'
  )),
  title TEXT,
  subtitle TEXT,
  content JSONB DEFAULT '{}', -- Section-specific content
  -- Layout
  layout TEXT DEFAULT 'default', -- default, minimal, wide, centered
  background_style TEXT, -- solid, gradient, pattern, image
  background_image_url TEXT,
  background_color TEXT,
  -- Order
  order_index INTEGER DEFAULT 0,
  -- Visibility
  is_visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PORTFOLIO ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN (
    'project', 'service', 'product', 'case_study', 'certification', 'award'
  )),
  title TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  -- Media
  cover_image_url TEXT,
  gallery JSONB DEFAULT '[]', -- Array of image URLs
  video_url TEXT,
  -- Details
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  client TEXT,
  industry TEXT,
  -- Metrics
  metrics JSONB DEFAULT '{}', -- {revenue, users, growth}
  -- Links
  live_url TEXT,
  case_study_url TEXT,
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  featured BOOLEAN DEFAULT FALSE,
  -- Order
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TEAM MEMBERS (public profile)
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id), -- Link to internal staff
  -- Public profile
  full_name TEXT NOT NULL,
  title TEXT,
  department TEXT,
  bio TEXT,
  expertise JSONB DEFAULT '[]', -- Array of expertise areas
  -- Media
  avatar_url TEXT,
  linkedin_url TEXT,
  twitter_url TEXT,
  -- Display
  is_leadership BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TESTIMONIALS
-- ============================================
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_title TEXT,
  client_company TEXT,
  client_avatar_url TEXT,
  content TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  -- Source
  source TEXT CHECK (source IN ('google', 'linkedin', 'facebook', 'internal', 'other')),
  source_url TEXT,
  -- Media
  video_url TEXT,
  -- Status
  is_featured BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT TRUE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOM DOMAINS
-- ============================================
CREATE TABLE IF NOT EXISTS custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  subdomain TEXT,
  -- DNS
  dns_verified BOOLEAN DEFAULT FALSE,
  dns_records JSONB DEFAULT '{}',
  ssl_enabled BOOLEAN DEFAULT FALSE,
  ssl_cert_url TEXT,
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'active', 'error', 'disabled')),
  error_message TEXT,
  verified_at TIMESTAMPTZ,
  -- Redirects
  redirect_to TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PUBLIC PAGE SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS public_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  -- Page settings
  page_type TEXT DEFAULT 'portfolio' CHECK (page_type IN ('portfolio', 'careers', 'booking')),
  slug TEXT UNIQUE, -- Custom URL slug
  is_enabled BOOLEAN DEFAULT TRUE,
  -- SEO
  meta_title TEXT,
  meta_description TEXT,
  meta_keywords TEXT[],
  og_title TEXT,
  og_description TEXT,
  og_image_url TEXT,
  -- Privacy
  require_login BOOLEAN DEFAULT FALSE,
  allowed_email_domains TEXT[], -- Only allow specific email domains
  password_protected BOOLEAN DEFAULT FALSE,
  password_hash TEXT,
  -- Analytics
  track_analytics BOOLEAN DEFAULT TRUE,
  analytics_id TEXT, -- Google Analytics ID
  -- Legal
  privacy_policy_url TEXT,
  terms_url TEXT,
  cookie_banner_enabled BOOLEAN DEFAULT TRUE,
  -- Status
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BRAND ASSETS
-- ============================================
CREATE TABLE IF NOT EXISTS brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'logo', 'icon', 'image', 'video', 'document', 'font', 'template', 'other'
  )),
  file_url TEXT NOT NULL,
  file_size INTEGER, -- bytes
  mime_type TEXT,
  dimensions JSONB, -- {width, height}
  -- Metadata
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  is_primary BOOLEAN DEFAULT FALSE,
  -- Versioning
  version INTEGER DEFAULT 1,
  previous_version_id UUID REFERENCES brand_assets(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE business_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

-- Branding: business owners/managers
DROP POLICY IF EXISTS "Branding view" ON business_branding;
CREATE POLICY "Branding view"
  ON business_branding FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "Branding manage" ON business_branding;
CREATE POLICY "Branding manage"
  ON business_branding FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Portfolio sections
CREATE POLICY "Portfolio sections view"
  ON portfolio_sections FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Portfolio sections manage"
  ON portfolio_sections FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Portfolio items
CREATE POLICY "Portfolio items view"
  ON portfolio_items FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Portfolio items manage"
  ON portfolio_items FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Team
CREATE POLICY "Team view"
  ON portfolio_team FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Team manage"
  ON portfolio_team FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Testimonials
CREATE POLICY "Testimonials view"
  ON testimonials FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Testimonials manage"
  ON testimonials FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Custom domains
CREATE POLICY "Custom domains view"
  ON custom_domains FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Custom domains manage"
  ON custom_domains FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Public pages
CREATE POLICY "Public pages view"
  ON public_pages FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Public pages manage"
  ON public_pages FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Brand assets
CREATE POLICY "Brand assets view"
  ON brand_assets FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Brand assets manage"
  ON brand_assets FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Save branding settings
CREATE OR REPLACE FUNCTION save_business_branding(p_branding JSONB)
RETURNS VOID AS $$
BEGIN
  INSERT INTO business_branding (business_id, primary_color, secondary_color, accent_color, font_family, brand_name, tagline, logo_url)
  VALUES (
    (SELECT business_id FROM get_current_staff()),
    p_branding->>'primary_color',
    p_branding->>'secondary_color',
    p_branding->>'accent_color',
    p_branding->>'font_family',
    p_branding->>'brand_name',
    p_branding->>'tagline',
    p_branding->>'logo_url'
  )
  ON CONFLICT (business_id) DO UPDATE SET
    primary_color = COALESCE(p_branding->>'primary_color', business_branding.primary_color),
    secondary_color = COALESCE(p_branding->>'secondary_color', business_branding.secondary_color),
    accent_color = COALESCE(p_branding->>'accent_color', business_branding.accent_color),
    font_family = COALESCE(p_branding->>'font_family', business_branding.font_family),
    brand_name = COALESCE(p_branding->>'brand_name', business_branding.brand_name),
    tagline = COALESCE(p_branding->>'tagline', business_branding.tagline),
    logo_url = COALESCE(p_branding->>'logo_url', business_branding.logo_url),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get public business profile
CREATE OR REPLACE FUNCTION get_public_profile(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'business_id', b.id,
    'brand_name', COALESCE(bb.brand_name, b.name),
    'tagline', bb.tagline,
    'logo_url', bb.logo_url,
    'primary_color', bb.primary_color,
    'portfolio_items', (
      SELECT jsonb_agg(jsonb_build_object(
        'title', pi.title,
        'short_description', pi.short_description,
        'cover_image_url', pi.cover_image_url,
        'category', pi.category
      ) ORDER BY pi.order_index)
      FROM portfolio_items pi
      WHERE pi.business_id = b.id AND pi.status = 'active'
    ),
    'team', (
      SELECT jsonb_agg(jsonb_build_object(
        'full_name', pt.full_name,
        'title', pt.title,
        'avatar_url', pt.avatar_url,
        'expertise', pt.expertise
      ) ORDER BY pt.order_index)
      FROM portfolio_team pt
      WHERE pt.business_id = b.id
    ),
    'testimonials', (
      SELECT jsonb_agg(jsonb_build_object(
        'client_name', t.client_name,
        'client_company', t.client_company,
        'content', t.content,
        'rating', t.rating
      ) ORDER BY t.order_index)
      FROM testimonials t
      WHERE t.business_id = b.id AND t.is_published = TRUE
    )
  ) INTO v_result
  FROM businesses b
  LEFT JOIN business_branding bb ON bb.business_id = b.id
  WHERE b.id = p_business_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE TRIGGER business_branding_updated_at BEFORE UPDATE ON business_branding FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER portfolio_sections_updated_at BEFORE UPDATE ON portfolio_sections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER portfolio_items_updated_at BEFORE UPDATE ON portfolio_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER portfolio_team_updated_at BEFORE UPDATE ON portfolio_team FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER testimonials_updated_at BEFORE UPDATE ON testimonials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER custom_domains_updated_at BEFORE UPDATE ON custom_domains FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER public_pages_updated_at BEFORE UPDATE ON public_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
