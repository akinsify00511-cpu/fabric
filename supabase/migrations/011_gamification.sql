-- AVENIZE Layer 1 - Gamification & Onboarding
-- XP, levels, streaks, badges, achievements, tutorials

-- ============================================
-- USER XP & LEVELS
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
-- XP TRANSACTIONS (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_amount INTEGER NOT NULL,
  action_type TEXT NOT NULL, -- 'login', 'task_complete', 'deal_won', etc.
  description TEXT,
  bonus_multiplier DECIMAL(3,2) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACHIEVEMENTS / BADGES
-- ============================================
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL, -- 'first_login', 'first_deal', 'week_streak'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT DEFAULT '🏆',
  category TEXT DEFAULT 'general', -- 'engagement', 'sales', 'team', 'consistency'
  xp_reward INTEGER DEFAULT 10,
  rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER ACHIEVEMENTS (unlocked badges)
-- ============================================
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  notification_shown BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, achievement_id)
);

-- ============================================
-- DAILY CHALLENGES
-- ============================================
CREATE TABLE IF NOT EXISTS daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  action_type TEXT NOT NULL, -- 'create_deal', 'complete_task', 'send_message'
  target_count INTEGER DEFAULT 1,
  xp_reward INTEGER DEFAULT 25,
  challenge_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challenge_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE(challenge_id, user_id)
);

-- ============================================
-- ONBOARDING PROGRESS
-- ============================================
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  -- Step tracking
  step_profile BOOLEAN DEFAULT FALSE,
  step_invite_team BOOLEAN DEFAULT FALSE,
  step_first_deal BOOLEAN DEFAULT FALSE,
  step_first_task BOOLEAN DEFAULT FALSE,
  step_first_chat BOOLEAN DEFAULT FALSE,
  step_first_invoice BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FEATURE TIPS (contextual help)
-- ============================================
CREATE TABLE IF NOT EXISTS feature_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tip_key TEXT NOT NULL, -- 'create_first_deal', 'invite_team'
  shown BOOLEAN DEFAULT FALSE,
  dismissed BOOLEAN DEFAULT FALSE,
  shown_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tip_key)
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_tips ENABLE ROW LEVEL SECURITY;

-- User XP: own record only
CREATE POLICY "XP own"
  ON user_xp FOR ALL
  USING (user_id = auth.uid());

-- XP Transactions: own only
CREATE POLICY "XP transactions own"
  ON xp_transactions FOR ALL
  USING (user_id = auth.uid());

-- Achievements: viewable by all business members, managed by owner
CREATE POLICY "Achievements view"
  ON achievements FOR SELECT
  USING (TRUE);

-- User Achievements: own only
CREATE POLICY "User achievements own"
  ON user_achievements FOR ALL
  USING (user_id = auth.uid());

-- Daily Challenges: business scope
CREATE POLICY "Challenges business"
  ON daily_challenges FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Challenges create"
  ON daily_challenges FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- Challenge Completions: own only
CREATE POLICY "Completions own"
  ON challenge_completions FOR ALL
  USING (user_id = auth.uid());

-- Onboarding: own only
CREATE POLICY "Onboarding own"
  ON onboarding_progress FOR ALL
  USING (user_id = auth.uid());

-- Feature Tips: own only
CREATE POLICY "Tips own"
  ON feature_tips FOR ALL
  USING (user_id = auth.uid());

-- ============================================
-- SEED ACHIEVEMENTS
-- ============================================
INSERT INTO achievements (key, name, description, icon, category, xp_reward, rarity) VALUES
  -- Onboarding
  ('first_login', 'Welcome Aboard!', 'Logged in for the first time', '👋', 'engagement', 10, 'common'),
  ('complete_profile', 'All About You', 'Completed your profile', '✨', 'engagement', 15, 'common'),
  
  -- Sales
  ('first_deal', 'First Deal!', 'Created your first deal', '🤝', 'sales', 25, 'common'),
  ('deal_won', 'Deal Closer!', 'Won your first deal', '🎉', 'sales', 50, 'rare'),
  ('deals_5', 'Getting Momentum', 'Won 5 deals', '📈', 'sales', 100, 'rare'),
  ('deals_25', 'Sales Machine', 'Won 25 deals', '💰', 'sales', 250, 'epic'),
  ('pipeline_10k', 'Big Pipeline', 'Had $10k in active pipeline', '💎', 'sales', 75, 'rare'),
  
  -- Tasks
  ('first_task', 'Task Taker', 'Created your first task', '✅', 'engagement', 15, 'common'),
  ('tasks_10', 'Task Master', 'Completed 10 tasks', '🏃', 'engagement', 50, 'rare'),
  ('tasks_50', 'Productivity Pro', 'Completed 50 tasks', '⚡', 'engagement', 150, 'epic'),
  
  -- Consistency
  ('streak_3', 'Getting Started', '3-day login streak', '🔥', 'consistency', 30, 'common'),
  ('streak_7', 'Week Warrior', '7-day login streak', '🔥', 'consistency', 75, 'rare'),
  ('streak_30', 'Monthly Master', '30-day login streak', '🔥', 'consistency', 300, 'legendary'),
  
  -- Team
  ('invite_first', 'Team Builder', 'Invited your first team member', '👥', 'team', 40, 'rare'),
  ('team_5', 'Growing Team', 'Have 5 team members', '🎪', 'team', 100, 'epic'),
  
  -- Finance
  ('first_invoice', 'Invoice Issued', 'Sent your first invoice', '📄', 'sales', 25, 'common'),
  ('invoice_paid', 'Ka-ching!', 'Got your first invoice paid', '💵', 'sales', 50, 'rare'),
  ('revenue_1k', 'First Thousand', 'Earned $1,000 in revenue', '💲', 'sales', 100, 'rare'),
  ('revenue_10k', 'Five Figures!', 'Earned $10,000 in revenue', '💵', 'sales', 250, 'epic'),
  ('revenue_100k', 'Six Figures!', 'Earned $100,000 in revenue', '💎', 'sales', 500, 'legendary'),
  
  -- Chat
  ('first_message', 'Breaking the Ice', 'Sent your first chat message', '💬', 'engagement', 15, 'common'),
  ('messages_100', 'Chatty Cathy', 'Sent 100 chat messages', '🗣️', 'engagement', 75, 'rare'),
  
  -- Knowledge
  ('first_doc', 'Documentor', 'Created your first document', '📝', 'engagement', 20, 'common'),
  ('docs_10', 'Wiki Wizard', 'Created 10 documents', '📚', 'engagement', 100, 'rare'),

ON CONFLICT (key) DO NOTHING;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Calculate level from XP (every 100 XP = 1 level, with diminishing returns)
CREATE OR REPLACE FUNCTION calculate_level(p_xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(p_xp / 10))::INTEGER);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Award XP to user
CREATE OR REPLACE FUNCTION award_xp(
  p_user_id UUID,
  p_xp_amount INTEGER,
  p_action_type TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_new_xp INTEGER;
  v_new_level INTEGER;
  v_level_up BOOLEAN := FALSE;
BEGIN
  -- Update XP
  UPDATE user_xp
  SET
    xp_total = xp_total + p_xp_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Get new XP and calculate level
  SELECT xp_total INTO v_new_xp FROM user_xp WHERE user_id = p_user_id;
  v_new_level := calculate_level(v_new_xp);

  -- Check for level up
  SELECT level INTO v_new_level FROM user_xp WHERE user_id = p_user_id;
  UPDATE user_xp SET level = v_new_level WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO xp_transactions (user_id, xp_amount, action_type, description)
  VALUES (p_user_id, p_xp_amount, p_action_type, p_description);

  RETURN v_new_xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check and award achievements
CREATE OR REPLACE FUNCTION check_achievements(p_user_id UUID)
RETURNS TABLE(achievement_id UUID, key TEXT, name TEXT, xp_reward INTEGER) AS $$
DECLARE
  v_user_xp RECORD;
  v_achievements RECORD;
BEGIN
  SELECT * INTO v_user_xp FROM user_xp WHERE user_id = p_user_id;
  
  FOR v_achievements IN
    SELECT a.* FROM achievements a
    WHERE a.id NOT IN (SELECT achievement_id FROM user_achievements WHERE user_id = p_user_id)
  LOOP
    -- Check conditions (simplified)
    IF v_achievements.key = 'streak_3' AND v_user_xp.streak_days >= 3 THEN
      PERFORM unlock_achievement(p_user_id, v_achievements.id);
      RETURN QUERY SELECT v_achievements.id, v_achievements.key, v_achievements.name, v_achievements.xp_reward;
    END IF;
    
    -- Add more conditions as needed
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unlock achievement
CREATE OR REPLACE FUNCTION unlock_achievement(p_user_id UUID, p_achievement_id UUID)
RETURNS VOID AS $$
DECLARE
  v_xp_reward INTEGER;
BEGIN
  -- Get XP reward
  SELECT xp_reward INTO v_xp_reward FROM achievements WHERE id = p_achievement_id;
  
  -- Insert achievement
  INSERT INTO user_achievements (user_id, achievement_id)
  VALUES (p_user_id, p_achievement_id)
  ON CONFLICT DO NOTHING;
  
  -- Award XP
  IF v_xp_reward > 0 THEN
    PERFORM award_xp(p_user_id, v_xp_reward, 'achievement', 'Achievement unlocked');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update streak
CREATE OR REPLACE FUNCTION update_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_last_active DATE;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT last_active_date INTO v_last_active FROM user_xp WHERE user_id = p_user_id;
  
  IF v_last_active IS NULL THEN
    -- First login
    UPDATE user_xp SET streak_days = 1, last_active_date = v_today, longest_streak = 1 WHERE user_id = p_user_id;
  ELSIF v_last_active = v_today - 1 THEN
    -- Consecutive day
    UPDATE user_xp
    SET streak_days = streak_days + 1,
        last_active_date = v_today,
        longest_streak = GREATEST(longest_streak, streak_days + 1)
    WHERE user_id = p_user_id;
  ELSIF v_last_active < v_today - 1 THEN
    -- Streak broken
    UPDATE user_xp SET streak_days = 1, last_active_date = v_today WHERE user_id = p_user_id;
  END IF;
  -- Same day: do nothing
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER user_xp_updated_at BEFORE UPDATE ON user_xp FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER onboarding_progress_updated_at BEFORE UPDATE ON onboarding_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();
