-- ============================================
-- Analytics & Events Tracking System
-- Captures all user interactions for insights
-- ============================================

-- Event categories
CREATE TYPE event_category AS ENUM (
  'page_view',
  'user_action',
  'feature_usage',
  'search',
  'filter',
  'export',
  'import',
  'notification',
  'payment',
  'auth',
  'error',
  'performance',
  'engagement'
);

-- User engagement metrics
CREATE TYPE engagement_type AS ENUM (
  'session_start',
  'session_end',
  'feature_discovered',
  'feature_used',
  'feature_mastered',
  'task_completed',
  'goal_achieved',
  'streak_maintained',
  'onboarding_completed'
);

-- ============================================
-- Analytics Events Table
-- Captures all events across the application
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Event details
  event_name TEXT NOT NULL,
  category event_category NOT NULL,
  
  -- Context
  page TEXT,
  component TEXT,
  action TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Performance (for tracking)
  duration_ms INTEGER,
  
  -- Session tracking
  session_id TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist (analytics_events may have been created by 019 with fewer cols)
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS event_name TEXT;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_events_business ON analytics_events(business_id);
CREATE INDEX IF NOT EXISTS idx_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON analytics_events(category);
CREATE INDEX IF NOT EXISTS idx_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events(created_at DESC);
CREATE INDEX idx_events_session ON analytics_events(session_id);

-- ============================================
-- User Engagement Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS user_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Session data
  session_id TEXT NOT NULL,
  session_start TIMESTAMPTZ NOT NULL,
  session_end TIMESTAMPTZ,
  session_duration_seconds INTEGER,
  
  -- Engagement metrics
  pages_visited INTEGER DEFAULT 0,
  actions_performed INTEGER DEFAULT 0,
  features_used TEXT[] DEFAULT '{}',
  searches_made INTEGER DEFAULT 0,
  
  -- Onboarding progress
  onboarding_step INTEGER DEFAULT 0,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  
  -- Streaks
  current_streak_days INTEGER DEFAULT 0,
  longest_streak_days INTEGER DEFAULT 0,
  last_active_date DATE,
  
  -- Engagement score (0-100)
  engagement_score INTEGER DEFAULT 0,
  
  -- Feature discovery tracking (JSONB for flexibility)
  feature_discovery JSONB DEFAULT '{}',
  feature_mastery JSONB DEFAULT '{}',
  
  -- Learning loop data
  learning_data JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_engagement_user ON user_engagement(user_id);
CREATE INDEX idx_engagement_business ON user_engagement(business_id);
CREATE INDEX idx_engagement_date ON user_engagement(last_active_date);

-- ============================================
-- User Activity Summary (Daily)
-- Aggregated daily stats per user
-- ============================================
CREATE TABLE IF NOT EXISTS user_activity_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  activity_date DATE NOT NULL,
  
  -- Activity counts
  session_count INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  actions INTEGER DEFAULT 0,
  
  -- Feature usage (JSONB)
  features_used JSONB DEFAULT '{}',
  
  -- Engagement metrics
  engagement_score INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, activity_date)
);

CREATE INDEX idx_activity_user_date ON user_activity_daily(user_id, activity_date DESC);

-- ============================================
-- Feature Adoption Metrics
-- Track which features users discover and use
-- ============================================
CREATE TABLE IF NOT EXISTS feature_adoption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  feature_name TEXT NOT NULL,
  feature_category TEXT,
  
  -- Discovery stats
  users_discovered INTEGER DEFAULT 0,
  discovery_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Usage stats
  users_who_used INTEGER DEFAULT 0,
  usage_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Mastery stats
  users_mastered INTEGER DEFAULT 0,
  mastery_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Average engagement per use
  avg_engagement DECIMAL(5,2) DEFAULT 0,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, feature_name)
);

CREATE INDEX idx_adoption_feature ON feature_adoption(feature_name);

-- ============================================
-- User Personalization & Learning Loop
-- Stores user's behavior patterns and preferences
-- ============================================
CREATE TABLE IF NOT EXISTS user_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Behavioral patterns
  preferred_times JSONB DEFAULT '{}', -- {"morning": 60, "afternoon": 20, "evening": 20}
  preferred_days JSONB DEFAULT '{}',  -- {"mon": 20, "tue": 15, ...}
  avg_session_duration INTEGER DEFAULT 0,
  avg_actions_per_session INTEGER DEFAULT 0,
  
  -- Most used features (ranked)
  top_features JSONB DEFAULT '[]', -- ["crm", "tasks", "calendar"]
  
  -- Communication preferences
  preferred_channel TEXT DEFAULT 'in_app', -- email, in_app, both
  notification_frequency TEXT DEFAULT 'daily', -- realtime, daily, weekly
  
  -- Work style insights
  work_style TEXT DEFAULT 'balanced', -- quick_tasks, deep_work, collaborative, balanced
  multitasking_level INTEGER DEFAULT 50, -- 0-100
  
  -- Learning feedback
  positive_signals INTEGER DEFAULT 0,
  negative_signals INTEGER DEFAULT 0,
  suggestions_shown INTEGER DEFAULT 0,
  suggestions_accepted INTEGER DEFAULT 0,
  
  -- Last updated
  last_learning_at TIMESTAMPTZ DEFAULT NOW(),
  learning_confidence DECIMAL(5,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Achievements & Gamification
-- ============================================
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  achievement_key TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  category TEXT NOT NULL, -- usage, exploration, consistency, mastery
  
  -- Progress
  progress_current INTEGER DEFAULT 0,
  progress_target INTEGER DEFAULT 1,
  progress_percent INTEGER DEFAULT 0,
  
  -- Status
  unlocked BOOLEAN DEFAULT FALSE,
  unlocked_at TIMESTAMPTZ,
  
  -- Points
  points INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, achievement_key)
);

ALTER TABLE user_achievements ADD COLUMN IF NOT EXISTS unlocked BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_unlocked ON user_achievements(user_id, unlocked);

-- ============================================
-- Admin Analytics Summary (Pre-computed)
-- Updated periodically for dashboard performance
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Time period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT NOT NULL, -- daily, weekly, monthly
  
  -- User metrics
  total_users INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  
  -- Engagement metrics
  avg_session_duration INTEGER DEFAULT 0,
  avg_pages_per_session DECIMAL(5,2) DEFAULT 0,
  avg_actions_per_session DECIMAL(5,2) DEFAULT 0,
  
  -- Feature metrics
  top_features JSONB DEFAULT '[]',
  feature_adoption_rates JSONB DEFAULT '{}',
  
  -- Retention metrics
  day_1_retention DECIMAL(5,2) DEFAULT 0,
  day_7_retention DECIMAL(5,2) DEFAULT 0,
  day_30_retention DECIMAL(5,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, period_start, period_type)
);

-- ============================================
-- Functions
-- ============================================

-- Function to record an event
CREATE OR REPLACE FUNCTION record_analytics_event(
  p_business_id UUID,
  p_user_id UUID,
  p_event_name TEXT,
  p_category event_category,
  p_page TEXT DEFAULT NULL,
  p_component TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_duration_ms INTEGER DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO analytics_events (
    business_id, user_id, event_name, category,
    page, component, action, metadata, duration_ms, session_id
  ) VALUES (
    p_business_id, p_user_id, p_event_name, p_category,
    p_page, p_component, p_action, p_metadata, p_duration_ms, p_session_id
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update engagement metrics
CREATE OR REPLACE FUNCTION update_user_engagement(
  p_user_id UUID,
  p_session_id TEXT,
  p_event_type TEXT,
  p_feature_name TEXT DEFAULT NULL,
  p_duration_seconds INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_engagement RECORD;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Get or create engagement record
  SELECT * INTO v_engagement FROM user_engagement
  WHERE user_id = p_user_id AND session_id = p_session_id;
  
  IF NOT FOUND THEN
    INSERT INTO user_engagement (user_id, session_id, session_start, last_active_date)
    VALUES (p_user_id, p_session_id, NOW(), v_today)
    ON CONFLICT (user_id) WHERE session_id = p_session_id DO UPDATE SET
      session_start = NOW(),
      last_active_date = v_today;
    
    SELECT * INTO v_engagement FROM user_engagement
    WHERE user_id = p_user_id;
  END IF;
  
  -- Update based on event type
  CASE p_event_type
    WHEN 'session_end' THEN
      UPDATE user_engagement SET
        session_end = NOW(),
        session_duration_seconds = EXTRACT(EPOCH FROM (NOW() - session_start))::INTEGER,
        updated_at = NOW()
      WHERE user_id = p_user_id AND session_id = p_session_id;
      
      -- Update streak
      PERFORM update_user_streak(p_user_id);
      
      -- Update daily activity
      PERFORM update_daily_activity(p_user_id, v_today);
    
    WHEN 'page_view' THEN
      UPDATE user_engagement SET
        pages_visited = pages_visited + 1,
        updated_at = NOW()
      WHERE user_id = p_user_id AND session_id = p_session_id;
    
    WHEN 'action' THEN
      UPDATE user_engagement SET
        actions_performed = actions_performed + 1,
        updated_at = NOW()
      WHERE user_id = p_user_id AND session_id = p_session_id;
    
    WHEN 'feature_used' THEN
      UPDATE user_engagement SET
        features_used = array_append(features_used, p_feature_name),
        actions_performed = actions_performed + 1,
        updated_at = NOW()
      WHERE user_id = p_user_id AND session_id = p_session_id;
    
    WHEN 'search' THEN
      UPDATE user_engagement SET
        searches_made = searches_made + 1,
        updated_at = NOW()
      WHERE user_id = p_user_id AND session_id = p_session_id;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update user streak
CREATE OR REPLACE FUNCTION update_user_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_engagement RECORD;
  v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
  SELECT * INTO v_engagement FROM user_engagement WHERE user_id = p_user_id;
  
  IF v_engagement.last_active_date = v_yesterday THEN
    -- Consecutive day
    UPDATE user_engagement SET
      current_streak_days = current_streak_days + 1,
      longest_streak_days = GREATEST(longest_streak_days, current_streak_days + 1),
      updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF v_engagement.last_active_date < v_yesterday THEN
    -- Streak broken
    UPDATE user_engagement SET
      current_streak_days = 1,
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Update daily activity summary
CREATE OR REPLACE FUNCTION update_daily_activity(p_user_id UUID, p_date DATE)
RETURNS VOID AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT * INTO v_session FROM user_engagement WHERE user_id = p_user_id;
  
  INSERT INTO user_activity_daily (
    user_id, business_id, activity_date,
    session_count, total_duration_seconds, page_views, actions
  ) VALUES (
    p_user_id, v_session.business_id, p_date,
    1, COALESCE(v_session.session_duration_seconds, 0),
    v_session.pages_visited, v_session.actions_performed
  )
  ON CONFLICT (user_id, activity_date) DO UPDATE SET
    session_count = user_activity_daily.session_count + 1,
    total_duration_seconds = user_activity_daily.total_duration_seconds + EXTRACT(EPOCH FROM (NOW() - v_session.session_start))::INTEGER,
    page_views = user_activity_daily.page_views + v_session.pages_visited,
    actions = user_activity_daily.actions + v_session.actions_performed;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Default Achievements
-- ============================================
ALTER TABLE user_achievements ADD COLUMN IF NOT EXISTS achievement_key TEXT;
ALTER TABLE user_achievements ADD COLUMN IF NOT EXISTS achievement_id UUID;
ALTER TABLE user_achievements ALTER COLUMN achievement_id DROP NOT NULL;
ALTER TABLE user_achievements ADD COLUMN IF NOT EXISTS achievement_name TEXT;
ALTER TABLE user_achievements ADD COLUMN IF NOT EXISTS achievement_description TEXT;
ALTER TABLE user_achievements ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE user_achievements ADD COLUMN IF NOT EXISTS points INTEGER;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users LIMIT 1) THEN
    INSERT INTO user_achievements (user_id, achievement_key, achievement_name, achievement_description, category, points) VALUES
  (gen_random_uuid()::UUID, 'first_login', 'Welcome Aboard', 'Logged in for the first time', 'usage', 10),
  (gen_random_uuid()::UUID, 'first_task', 'Task Starter', 'Completed your first task', 'usage', 25),
  (gen_random_uuid()::UUID, 'explorer', 'Explorer', 'Visited 10 different pages', 'exploration', 50),

  (gen_random_uuid(), 'consistent', 'Consistent', 'Used the app 3 days in a row', 'consistency', 100),
  (gen_random_uuid()::UUID, 'power_user', 'Power User', 'Used 5 different features', 'mastery', 150),
  (gen_random_uuid()::UUID, 'week_streak', 'Week Warrior', 'Maintained a 7-day streak', 'consistency', 500),
  (gen_random_uuid()::UUID, 'speed_demon', 'Speed Demon', 'Completed 10 tasks in a day', 'usage', 75),
  (gen_random_uuid()::UUID, 'social_butterfly', 'Social Butterfly', 'Invited your first team member', 'usage', 100)
ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_adoption ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_summary ENABLE ROW LEVEL SECURITY;

-- Analytics events - admins can view all, users can view own
CREATE POLICY "Admins can view all analytics"
  ON analytics_events FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can view own analytics"
  ON analytics_events FOR SELECT
  USING (user_id = auth.uid());

-- Engagement - users can view own
CREATE POLICY "Users can view own engagement"
  ON user_engagement FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service can update engagement"
  ON user_engagement FOR INSERT
  WITH CHECK (TRUE);

-- Learning - users can view own
CREATE POLICY "Users can view own learning"
  ON user_learning FOR SELECT
  USING (user_id = auth.uid());

-- Achievements - users can view own
CREATE POLICY "Users can view own achievements"
  ON user_achievements FOR SELECT
  USING (user_id = auth.uid());

-- Summary - admins only
CREATE POLICY "Admins can view summary"
  ON analytics_summary FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- Trigger for updated_at
-- ============================================
CREATE TRIGGER update_user_engagement_updated_at
  BEFORE UPDATE ON user_engagement
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_learning_updated_at
  BEFORE UPDATE ON user_learning
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feature_adoption_updated_at
  BEFORE UPDATE ON feature_adoption
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
