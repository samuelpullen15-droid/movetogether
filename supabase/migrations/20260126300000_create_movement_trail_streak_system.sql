-- Movement Trail Streak System
-- Tracks user activity streaks with milestone rewards along a "trail" progression

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE streak_reward_type AS ENUM (
  'badge',
  'trial_mover',
  'trial_coach',
  'trial_crusher',
  'profile_frame',
  'leaderboard_flair',
  'app_icon',
  'points_multiplier',
  'custom'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Configuration table for all trail checkpoints/milestones
CREATE TABLE streak_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  reward_type streak_reward_type NOT NULL,
  reward_value JSONB DEFAULT '{}',
  icon_name TEXT,
  celebration_type TEXT DEFAULT 'confetti',
  is_repeatable BOOLEAN DEFAULT FALSE,
  repeat_interval INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure repeat_interval is set when is_repeatable is true
  CONSTRAINT repeatable_requires_interval CHECK (
    (is_repeatable = FALSE) OR (is_repeatable = TRUE AND repeat_interval IS NOT NULL AND repeat_interval > 0)
  )
);

COMMENT ON TABLE streak_milestones IS 'Configuration table defining all milestone checkpoints on the Movement Trail';
COMMENT ON COLUMN streak_milestones.day_number IS 'The streak day number when this milestone is reached';
COMMENT ON COLUMN streak_milestones.reward_value IS 'Flexible JSONB storage for reward details like {trial_days: 1, badge_id: "xxx"}';
COMMENT ON COLUMN streak_milestones.is_repeatable IS 'Whether this milestone repeats every repeat_interval days after first achievement';

-- Tracks each user's streak progress
CREATE TABLE user_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  streak_started_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  streak_shields_available INTEGER NOT NULL DEFAULT 1,
  streak_shields_used_this_week INTEGER NOT NULL DEFAULT 0,
  shield_week_start DATE,
  total_active_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only have one streak record
  CONSTRAINT user_streaks_user_id_unique UNIQUE (user_id),

  -- Ensure streaks are non-negative
  CONSTRAINT positive_streaks CHECK (current_streak >= 0 AND longest_streak >= 0),

  -- Ensure longest_streak >= current_streak
  CONSTRAINT longest_gte_current CHECK (longest_streak >= current_streak),

  -- Ensure shields are non-negative
  CONSTRAINT positive_shields CHECK (streak_shields_available >= 0 AND streak_shields_used_this_week >= 0)
);

COMMENT ON TABLE user_streaks IS 'Tracks each user''s current streak progress on the Movement Trail';
COMMENT ON COLUMN user_streaks.last_activity_date IS 'Last day user was active (in their timezone)';
COMMENT ON COLUMN user_streaks.streak_shields_available IS 'Protection tokens that can save a streak from breaking';
COMMENT ON COLUMN user_streaks.shield_week_start IS 'Tracks weekly shield usage reset period';

-- Tracks which milestones users have earned
CREATE TABLE user_milestone_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES streak_milestones(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  earned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  reward_claimed_at TIMESTAMPTZ,
  reward_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Allow repeatable milestones by making unique on date earned
  CONSTRAINT unique_milestone_per_day UNIQUE (user_id, milestone_id, earned_date)
);

COMMENT ON TABLE user_milestone_progress IS 'Records milestones earned by users and reward claim status';
COMMENT ON COLUMN user_milestone_progress.reward_expires_at IS 'For trial rewards, when the trial period ends';

-- Daily activity log for streak calculation
CREATE TABLE streak_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  activity_type TEXT NOT NULL,
  activity_value NUMERIC,
  qualifies_for_streak BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One entry per user per day (aggregated)
  CONSTRAINT unique_user_activity_date UNIQUE (user_id, activity_date)
);

COMMENT ON TABLE streak_activity_log IS 'Daily activity log used for streak calculations';
COMMENT ON COLUMN streak_activity_log.activity_type IS 'Type of activity: steps, workout, competition_goal, etc.';
COMMENT ON COLUMN streak_activity_log.source IS 'Data source: apple_health, fitbit, garmin, etc.';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- streak_milestones indexes
CREATE INDEX idx_streak_milestones_day_number ON streak_milestones(day_number);
CREATE INDEX idx_streak_milestones_is_repeatable ON streak_milestones(is_repeatable) WHERE is_repeatable = TRUE;

-- user_streaks indexes
CREATE INDEX idx_user_streaks_user_id ON user_streaks(user_id);
CREATE INDEX idx_user_streaks_current_streak ON user_streaks(current_streak DESC);
CREATE INDEX idx_user_streaks_longest_streak ON user_streaks(longest_streak DESC);
CREATE INDEX idx_user_streaks_last_activity ON user_streaks(last_activity_date DESC);

-- user_milestone_progress indexes
CREATE INDEX idx_user_milestone_progress_user_id ON user_milestone_progress(user_id);
CREATE INDEX idx_user_milestone_progress_milestone_id ON user_milestone_progress(milestone_id);
CREATE INDEX idx_user_milestone_progress_earned_at ON user_milestone_progress(earned_at DESC);
CREATE INDEX idx_user_milestone_progress_unclaimed ON user_milestone_progress(user_id)
  WHERE reward_claimed = FALSE;

-- streak_activity_log indexes
CREATE INDEX idx_streak_activity_log_user_id ON streak_activity_log(user_id);
CREATE INDEX idx_streak_activity_log_activity_date ON streak_activity_log(activity_date DESC);
CREATE INDEX idx_streak_activity_log_user_date ON streak_activity_log(user_id, activity_date DESC);
CREATE INDEX idx_streak_activity_log_qualifies ON streak_activity_log(user_id, activity_date)
  WHERE qualifies_for_streak = TRUE;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_streak_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables with updated_at column
CREATE TRIGGER trigger_streak_milestones_updated_at
  BEFORE UPDATE ON streak_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_streak_updated_at();

CREATE TRIGGER trigger_user_streaks_updated_at
  BEFORE UPDATE ON user_streaks
  FOR EACH ROW
  EXECUTE FUNCTION update_streak_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE streak_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_milestone_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE streak_activity_log ENABLE ROW LEVEL SECURITY;

-- streak_milestones policies (read-only for all authenticated users)
CREATE POLICY "Anyone can view streak milestones"
  ON streak_milestones
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Service role can manage milestones
CREATE POLICY "Service role can manage streak milestones"
  ON streak_milestones
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- user_streaks policies
CREATE POLICY "Users can view their own streak"
  ON user_streaks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streak"
  ON user_streaks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streak"
  ON user_streaks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to view other users' streaks for leaderboards (read-only)
CREATE POLICY "Users can view other users streaks for leaderboards"
  ON user_streaks
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Service role full access
CREATE POLICY "Service role can manage user streaks"
  ON user_streaks
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- user_milestone_progress policies
CREATE POLICY "Users can view their own milestone progress"
  ON user_milestone_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own milestone progress"
  ON user_milestone_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own milestone progress"
  ON user_milestone_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role can manage milestone progress"
  ON user_milestone_progress
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- streak_activity_log policies
CREATE POLICY "Users can view their own activity log"
  ON streak_activity_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity log"
  ON streak_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own activity log"
  ON streak_activity_log
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role can manage activity log"
  ON streak_activity_log
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================================
-- SEED DATA: MILESTONE CHECKPOINTS
-- ============================================================================

INSERT INTO streak_milestones (day_number, name, description, reward_type, reward_value, icon_name, celebration_type, is_repeatable, repeat_interval)
VALUES
  -- Day 3: First Steps
  (3, 'First Steps', 'You''ve taken your first steps on the Movement Trail! Three days of consistent activity is a great start.',
   'badge',
   '{"badge_id": "first_steps", "badge_name": "First Steps", "badge_tier": "bronze"}',
   'footprints',
   'sparkle',
   FALSE, NULL),

  -- Day 7: Week Warrior
  (7, 'Week Warrior', 'A full week of movement! Unlock a 24-hour preview of Mover features.',
   'trial_mover',
   '{"trial_days": 1, "badge_id": "week_warrior", "features": ["unlimited_competitions", "detailed_analytics"]}',
   'calendar-week',
   'confetti',
   FALSE, NULL),

  -- Day 14: Fortnight Fighter
  (14, 'Fortnight Fighter', 'Two weeks strong! Earn an exclusive profile frame to show off your dedication.',
   'profile_frame',
   '{"frame_id": "fortnight_fighter", "frame_name": "Fortnight Fighter Frame", "frame_rarity": "uncommon"}',
   'shield-check',
   'fireworks',
   FALSE, NULL),

  -- Day 21: Three Week Trek
  (21, 'Three Week Trek', 'Three weeks of consistency! Try AI Coach Spark free for 24 hours.',
   'trial_coach',
   '{"trial_days": 1, "coach_type": "spark", "messages_included": 10}',
   'mountain',
   'sparkle',
   FALSE, NULL),

  -- Day 30: Monthly Mover
  (30, 'Monthly Mover', 'One month of movement! Earn a special badge and 3 days of Mover access.',
   'trial_mover',
   '{"trial_days": 3, "badge_id": "monthly_mover", "badge_name": "Monthly Mover", "badge_tier": "silver"}',
   'calendar-check',
   'confetti',
   FALSE, NULL),

  -- Day 45: Halfway Hero
  (45, 'Halfway Hero', 'Halfway to your first 90 days! Stand out on the leaderboards with special flair.',
   'leaderboard_flair',
   '{"flair_id": "halfway_hero", "flair_name": "Halfway Hero", "flair_color": "#FFD700", "flair_duration_days": 30}',
   'star-half',
   'sparkle',
   FALSE, NULL),

  -- Day 60: Two Month Titan
  (60, 'Two Month Titan', 'Two months of dedication! Enjoy 48 hours of AI coaching.',
   'trial_coach',
   '{"trial_days": 2, "coach_type": "spark", "messages_included": 20}',
   'dumbbell',
   'fireworks',
   FALSE, NULL),

  -- Day 90: Quarter Champion
  (90, 'Quarter Champion', 'A full quarter of consistent movement! Unlock an exclusive app icon.',
   'app_icon',
   '{"icon_id": "quarter_champion", "icon_name": "Quarter Champion", "icon_rarity": "rare"}',
   'trophy',
   'fireworks',
   FALSE, NULL),

  -- Day 100: Century Club
  (100, 'Century Club', 'Welcome to the Century Club! 100 days of movement earns you a badge, 7-day Mover trial, and permanent leaderboard flair.',
   'custom',
   '{"badge_id": "century_club", "badge_name": "Century Club", "badge_tier": "gold", "trial_type": "mover", "trial_days": 7, "flair_id": "century_club", "flair_permanent": true}',
   'hundred-points',
   'fireworks',
   FALSE, NULL),

  -- Day 150: Trail Blazer
  (150, 'Trail Blazer', 'You''re blazing your own trail! 150 days of dedication.',
   'badge',
   '{"badge_id": "trail_blazer", "badge_name": "Trail Blazer", "badge_tier": "gold"}',
   'fire',
   'confetti',
   FALSE, NULL),

  -- Day 200: Double Century
  (200, 'Double Century', '200 days! Earn an exclusive profile frame and commemorative badge.',
   'custom',
   '{"badge_id": "double_century", "badge_name": "Double Century", "badge_tier": "gold", "frame_id": "double_century", "frame_name": "Double Century Frame", "frame_rarity": "rare"}',
   'award',
   'fireworks',
   FALSE, NULL),

  -- Day 250: Legendary
  (250, 'Legendary', 'You''ve achieved legendary status! Enjoy a full week of AI coaching.',
   'trial_coach',
   '{"trial_days": 7, "coach_type": "spark", "messages_included": 50}',
   'crown',
   'fireworks',
   FALSE, NULL),

  -- Day 300: Movement Master
  (300, 'Movement Master', '300 days of movement mastery! Unlock a rare app icon and badge.',
   'custom',
   '{"badge_id": "movement_master", "badge_name": "Movement Master", "badge_tier": "platinum", "icon_id": "movement_master", "icon_name": "Movement Master", "icon_rarity": "epic"}',
   'gem',
   'fireworks',
   FALSE, NULL),

  -- Day 365: Year of Movement
  (365, 'Year of Movement', 'A FULL YEAR of movement! You''ve earned a 14-day Crusher trial and the legendary "365" badge. This is an incredible achievement!',
   'trial_crusher',
   '{"trial_days": 14, "badge_id": "year_of_movement", "badge_name": "365 Days", "badge_tier": "platinum", "badge_permanent": true, "features": ["all_crusher_features", "ai_coach_unlimited"]}',
   'sun',
   'fireworks',
   FALSE, NULL),

  -- Repeatable Century Milestone (every 100 days after 365)
  (465, 'Century Milestone', 'Another 100 days of movement! You continue to inspire. Earn a special century badge.',
   'badge',
   '{"badge_id": "century_milestone", "badge_name": "Century Milestone", "badge_tier": "platinum", "shows_count": true}',
   'infinity',
   'confetti',
   TRUE, 100);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a user qualifies for any new milestones
CREATE OR REPLACE FUNCTION check_streak_milestones(p_user_id UUID, p_current_streak INTEGER)
RETURNS TABLE (
  milestone_id UUID,
  day_number INTEGER,
  name TEXT,
  reward_type streak_reward_type,
  reward_value JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.id,
    sm.day_number,
    sm.name,
    sm.reward_type,
    sm.reward_value
  FROM streak_milestones sm
  WHERE
    -- Non-repeatable milestones the user hasn't earned yet
    (
      sm.is_repeatable = FALSE
      AND sm.day_number <= p_current_streak
      AND NOT EXISTS (
        SELECT 1 FROM user_milestone_progress ump
        WHERE ump.user_id = p_user_id AND ump.milestone_id = sm.id
      )
    )
    OR
    -- Repeatable milestones (check if eligible for next occurrence)
    (
      sm.is_repeatable = TRUE
      AND p_current_streak >= sm.day_number
      AND (p_current_streak - sm.day_number) % sm.repeat_interval = 0
      AND NOT EXISTS (
        SELECT 1 FROM user_milestone_progress ump
        WHERE ump.user_id = p_user_id
        AND ump.milestone_id = sm.id
        AND ump.earned_date = CURRENT_DATE
      )
    )
  ORDER BY sm.day_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's current streak status with next milestone info
CREATE OR REPLACE FUNCTION get_user_streak_status(p_user_id UUID)
RETURNS TABLE (
  current_streak INTEGER,
  longest_streak INTEGER,
  last_activity_date DATE,
  total_active_days INTEGER,
  streak_shields_available INTEGER,
  days_until_next_milestone INTEGER,
  next_milestone_name TEXT,
  next_milestone_reward_type streak_reward_type
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.current_streak,
    us.longest_streak,
    us.last_activity_date,
    us.total_active_days,
    us.streak_shields_available,
    (
      SELECT MIN(sm.day_number) - us.current_streak
      FROM streak_milestones sm
      WHERE sm.day_number > us.current_streak
        AND (
          sm.is_repeatable = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM user_milestone_progress ump
            WHERE ump.user_id = p_user_id AND ump.milestone_id = sm.id
          )
        )
        OR sm.is_repeatable = TRUE
    ) AS days_until_next_milestone,
    (
      SELECT sm.name
      FROM streak_milestones sm
      WHERE sm.day_number > us.current_streak
        AND (
          (sm.is_repeatable = FALSE
           AND NOT EXISTS (
             SELECT 1 FROM user_milestone_progress ump
             WHERE ump.user_id = p_user_id AND ump.milestone_id = sm.id
           ))
          OR sm.is_repeatable = TRUE
        )
      ORDER BY sm.day_number ASC
      LIMIT 1
    ) AS next_milestone_name,
    (
      SELECT sm.reward_type
      FROM streak_milestones sm
      WHERE sm.day_number > us.current_streak
        AND (
          (sm.is_repeatable = FALSE
           AND NOT EXISTS (
             SELECT 1 FROM user_milestone_progress ump
             WHERE ump.user_id = p_user_id AND ump.milestone_id = sm.id
           ))
          OR sm.is_repeatable = TRUE
        )
      ORDER BY sm.day_number ASC
      LIMIT 1
    ) AS next_milestone_reward_type
  FROM user_streaks us
  WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION check_streak_milestones(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_streak_status(UUID) TO authenticated;
