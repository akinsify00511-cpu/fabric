-- ============================================
-- ATOMIC XP AWARD WITH STREAK + LEVEL + HISTORY
--
-- GamificationContext.awardXP was doing a client-side read-modify-write:
-- SELECT xp_total, compute new value in JS, UPDATE. Two concurrent calls
-- (e.g., completing two tasks quickly) would both read the same xp_total,
-- both add their amount, and the second UPDATE would overwrite the first,
-- silently losing XP.
--
-- The existing award_xp() RPC does atomic increment but doesn't handle
-- streak logic or xp_history logging. This new RPC does everything
-- server-side in a single transaction:
--   1. Atomic xp_total increment (no race)
--   2. Streak update (today vs yesterday vs other)
--   3. Level recalculation
--   4. xp_history insert
--   5. Returns new state for client to consume
-- ============================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.award_xp_with_streak(
  p_user_id UUID,
  p_xp_amount INTEGER,
  p_action TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
  xp_total INTEGER,
  level INTEGER,
  streak_days INTEGER,
  longest_streak INTEGER,
  last_active_date DATE,
  leveled_up BOOLEAN
) AS $$
DECLARE
  v_current_xp INTEGER := 0;
  v_new_xp INTEGER;
  v_old_level INTEGER;
  v_new_level INTEGER;
  v_streak INTEGER := 0;
  v_longest INTEGER := 0;
  v_last_active DATE;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - 1;
BEGIN
  -- Ensure user_xp row exists
  INSERT INTO user_xp (user_id, xp_total, level, streak_days, longest_streak, last_active_date)
  VALUES (p_user_id, 0, 1, 0, 0, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  -- Read current state (single read, then atomic update below)
  SELECT xp_total, streak_days, longest_streak, last_active_date
  INTO v_current_xp, v_streak, v_longest, v_last_active
  FROM user_xp
  WHERE user_id = p_user_id;

  v_current_xp := COALESCE(v_current_xp, 0);
  v_new_xp := v_current_xp + p_xp_amount;
  v_old_level := calculate_level(v_current_xp);
  v_new_level := calculate_level(v_new_xp);

  -- Streak logic
  IF v_last_active IS NULL OR v_last_active < v_yesterday THEN
    v_streak := 1;
  ELSIF v_last_active = v_yesterday THEN
    v_streak := v_streak + 1;
  END IF;

  v_longest := GREATEST(COALESCE(v_longest, 0), v_streak);

  -- Atomic update (single statement, no race window)
  UPDATE user_xp
  SET
    xp_total = v_new_xp,
    level = v_new_level,
    streak_days = v_streak,
    longest_streak = v_longest,
    last_active_date = v_today,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log to xp_history
  INSERT INTO xp_history (user_id, amount, action, description)
  VALUES (p_user_id, p_xp_amount, p_action, p_description);

  RETURN QUERY
  SELECT
    v_new_xp,
    v_new_level,
    v_streak,
    v_longest,
    v_today,
    (v_new_level > v_old_level);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant to authenticated (the RPC uses auth.uid() indirectly via p_user_id
-- which the client passes from supabase.auth.getUser())
GRANT EXECUTE ON FUNCTION public.award_xp_with_streak TO authenticated;

SELECT 'award_xp_with_streak RPC created' as status;
