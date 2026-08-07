-- ============================================
-- Fix Missing Tables
-- Run this in Supabase SQL Editor to create missing tables
-- ============================================

-- ============================================
-- USER XP & LEVELS (Gamification)
-- ============================================
CREATE TABLE IF NOT EXISTS user_xp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_total INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak_days INTEGER DEFAULT 0,
  last_active_date DATE,
  longest_streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================
-- USER LEARNING (Personalization)
-- ============================================
CREATE TABLE IF NOT EXISTS user_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Behavioral patterns
  preferred_times JSONB DEFAULT '{}',
  preferred_days JSONB DEFAULT '{}',
  avg_session_duration INTEGER DEFAULT 0,
  avg_actions_per_session INTEGER DEFAULT 0,
  
  -- Most used features
  top_features JSONB DEFAULT '[]',
  
  -- Communication preferences
  preferred_channel TEXT DEFAULT 'in_app',
  notification_frequency TEXT DEFAULT 'daily',
  
  -- Work style insights
  work_style TEXT DEFAULT 'balanced',
  multitasking_level INTEGER DEFAULT 50,
  
  -- Learning feedback
  positive_signals INTEGER DEFAULT 0,
  negative_signals INTEGER DEFAULT 0,
  suggestions_shown INTEGER DEFAULT 0,
  suggestions_accepted INTEGER DEFAULT 0,
  
  -- Learning data
  learning_data JSONB DEFAULT '{"interactions": {}}',
  
  last_learning_at TIMESTAMPTZ DEFAULT NOW(),
  learning_confidence DECIMAL(5,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER ACHIEVEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  achievement_key TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  
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

-- ============================================
-- BUSINESS ENTITLEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS business_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  features JSONB DEFAULT '{}',
  team_limit INTEGER DEFAULT 3,
  storage_limit_mb INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ANALYTICS EVENTS
-- ============================================
CREATE TYPE IF NOT EXISTS event_category AS ENUM (
  'page_view', 'user_action', 'feature_usage', 'search', 'filter',
  'export', 'import', 'notification', 'payment', 'auth', 'error', 'performance', 'engagement'
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  category event_category NOT NULL,
  page TEXT,
  component TEXT,
  action TEXT,
  metadata JSONB DEFAULT '{}',
  duration_ms INTEGER,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CHANNELS (Chat)
-- ============================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'public' CHECK (type IN ('public', 'private', 'direct')),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, name)
);

-- ============================================
-- TASKS
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assignee_id UUID REFERENCES staff(id),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Function to get user's channels
CREATE OR REPLACE FUNCTION get_my_channels()
RETURNS TABLE (
  id UUID,
  business_id UUID,
  name TEXT,
  description TEXT,
  type TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.business_id, c.name, c.description, c.type, c.created_by, c.created_at
  FROM channels c
  INNER JOIN channel_members cm ON c.id = cm.channel_id
  INNER JOIN staff s ON cm.staff_id = s.id
  WHERE s.user_id = auth.uid()
  ORDER BY c.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record analytics event
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

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_xp_user ON user_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_learning_user ON user_learning(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_user_unlocked ON user_achievements(user_id, unlocked);
CREATE INDEX IF NOT EXISTS idx_business_entitlements_business ON business_entitlements(business_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_business ON analytics_events(business_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channels_business ON channels(business_id);
CREATE INDEX IF NOT EXISTS idx_tasks_business ON tasks(business_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- user_xp policies
CREATE POLICY "Users can view own XP"
  ON user_xp FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own XP"
  ON user_xp FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own XP"
  ON user_xp FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- user_learning policies
CREATE POLICY "Users can view own learning"
  ON user_learning FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own learning"
  ON user_learning FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own learning"
  ON user_learning FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- user_achievements policies
CREATE POLICY "Users can view own achievements"
  ON user_achievements FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own achievements"
  ON user_achievements FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own achievements"
  ON user_achievements FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- business_entitlements policies
CREATE POLICY "Staff can read own business entitlements"
  ON business_entitlements FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage business entitlements"
  ON business_entitlements FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- analytics_events policies
CREATE POLICY "Users can view own analytics"
  ON analytics_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service can insert analytics"
  ON analytics_events FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Admins can view business analytics"
  ON analytics_events FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- channels policies
CREATE POLICY "Staff can view business channels"
  ON channels FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Channel members can view channels"
  ON channels FOR SELECT
  USING (
    id IN (
      SELECT channel_id FROM channel_members
      INNER JOIN staff ON channel_members.staff_id = staff.id
      WHERE staff.user_id = auth.uid()
    )
  );

-- tasks policies
CREATE POLICY "Staff can view business tasks"
  ON tasks FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can create tasks"
  ON tasks FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can update business tasks"
  ON tasks FOR UPDATE
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- SEED DEFAULT ACHIEVEMENTS
-- ============================================
INSERT INTO user_achievements (user_id, achievement_key, achievement_name, achievement_description, category, points)
SELECT 
  u.id as user_id,
  ach.key as achievement_key,
  ach.name as achievement_name,
  ach.description as achievement_description,
  ach.category,
  ach.points
FROM auth.users u
CROSS JOIN (
  VALUES 
    ('first_login', 'Welcome Aboard', 'Logged in for the first time', 'usage', 10),
    ('first_task', 'Task Starter', 'Completed your first task', 'usage', 25),
    ('explorer', 'Explorer', 'Visited 10 different pages', 'exploration', 50),
    ('consistent', 'Consistent', 'Used the app 3 days in a row', 'consistency', 100),
    ('power_user', 'Power User', 'Used 5 different features', 'mastery', 150),
    ('week_streak', 'Week Warrior', 'Maintained a 7-day streak', 'consistency', 500),
    ('speed_demon', 'Speed Demon', 'Completed 10 tasks in a day', 'usage', 75),
    ('social_butterfly', 'Social Butterfly', 'Invited your first team member', 'usage', 100)
) AS ach(key, name, description, category, points)
ON CONFLICT (user_id, achievement_key) DO NOTHING;

-- ============================================
-- ENABLE REALTIME (optional)
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- ============================================
-- Done!
-- ============================================
SELECT 'All missing tables created successfully!' as status;
