-- Avenize Layer 1 - Social Media Module
-- Posts, scheduling, metrics for IG/LinkedIn, branding

-- ============================================
-- SOCIAL POSTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'facebook', 'twitter', 'tiktok')),
  content TEXT NOT NULL,
  image_url TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  impressions_count INTEGER DEFAULT 0,
  reach_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SOCIAL METRICS TABLE (aggregated daily)
-- ============================================
CREATE TABLE IF NOT EXISTS social_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'facebook', 'twitter', 'tiktok')),
  date DATE NOT NULL,
  followers_count INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  engagement_count INTEGER DEFAULT 0,
  impressions_count INTEGER DEFAULT 0,
  reach_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, platform, date)
);

-- ============================================
-- BRAND ASSETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('logo', 'banner', 'avatar', 'font', 'color', 'template')),
  file_url TEXT,
  color_hex TEXT, -- for color assets
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMPANY PROFILE (branding info)
-- ============================================
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS brand_tagline TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS brand_colors TEXT; -- JSON array of hex colors
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS primary_platform TEXT CHECK (primary_platform IN ('instagram', 'linkedin', 'facebook', 'twitter', 'tiktok'));

-- ============================================
-- RLS FOR SOCIAL TABLES
-- ============================================
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

-- Social posts: same business
CREATE POLICY "Social posts same business"
  ON social_posts FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Social metrics: same business
CREATE POLICY "Social metrics same business"
  ON social_metrics FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Brand assets: same business
CREATE POLICY "Brand assets same business"
  ON brand_assets FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS social_posts_updated_at ON social_posts;
CREATE TRIGGER social_posts_updated_at BEFORE UPDATE ON social_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS brand_assets_updated_at ON brand_assets;
CREATE TRIGGER brand_assets_updated_at BEFORE UPDATE ON brand_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
