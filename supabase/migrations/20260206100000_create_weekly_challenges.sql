-- ============================================================================
-- Weekly Challenges System
-- ============================================================================
-- Adds weekly rotating challenges that give users goals beyond daily rings.
-- Challenges can reward cosmetics, trial extensions, or achievement progress.

-- ============================================================================
-- WEEKLY CHALLENGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Challenge definition
  title TEXT NOT NULL,
  description TEXT,
  challenge_type TEXT NOT NULL, -- 'ring_closure', 'competition_wins', 'steps', 'calories', 'workouts', 'early_bird', etc.
  target_value INTEGER NOT NULL,

  -- Reward configuration
  reward_type TEXT, -- 'cosmetic', 'trial_mover', 'trial_crusher', 'achievement_boost', 'badge'
  reward_value JSONB DEFAULT '{}', -- e.g., { "cosmetic_id": "...", "trial_days": 3 }

  -- Challenge window
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,

  -- Tier requirements (null = available to all)
  min_tier TEXT CHECK (min_tier IN ('starter', 'mover', 'crusher')),

  -- Display
  icon TEXT DEFAULT 'trophy', -- lucide icon name
  accent_color TEXT DEFAULT '#FA114F',

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active challenges lookup
CREATE INDEX idx_weekly_challenges_active ON weekly_challenges (is_active, starts_at, ends_at);

-- ============================================================================
-- USER CHALLENGE PROGRESS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_challenge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES weekly_challenges(id) ON DELETE CASCADE,

  -- Progress tracking
  current_value INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ, -- NULL until completed
  reward_claimed BOOLEAN DEFAULT FALSE,
  reward_claimed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one progress record per user per challenge
  UNIQUE(user_id, challenge_id)
);

-- Index for user's challenges lookup
CREATE INDEX idx_user_challenge_progress_user ON user_challenge_progress (user_id);
CREATE INDEX idx_user_challenge_progress_challenge ON user_challenge_progress (challenge_id);
CREATE INDEX idx_user_challenge_progress_unclaimed ON user_challenge_progress (user_id, reward_claimed) WHERE completed_at IS NOT NULL;

-- ============================================================================
-- CHALLENGE TEMPLATES TABLE (for recurring weekly challenges)
-- ============================================================================

CREATE TABLE IF NOT EXISTS challenge_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template definition
  title_template TEXT NOT NULL, -- e.g., "Close {target} rings this week"
  description_template TEXT,
  challenge_type TEXT NOT NULL,

  -- Difficulty variants
  easy_target INTEGER NOT NULL,
  medium_target INTEGER NOT NULL,
  hard_target INTEGER NOT NULL,

  -- Reward templates
  easy_reward_type TEXT,
  easy_reward_value JSONB DEFAULT '{}',
  medium_reward_type TEXT,
  medium_reward_value JSONB DEFAULT '{}',
  hard_reward_type TEXT,
  hard_reward_value JSONB DEFAULT '{}',

  -- Display
  icon TEXT DEFAULT 'trophy',
  accent_color TEXT DEFAULT '#FA114F',

  -- Eligibility
  min_tier TEXT CHECK (min_tier IN ('starter', 'mover', 'crusher')),

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SEED CHALLENGE TEMPLATES
-- ============================================================================

INSERT INTO challenge_templates (
  title_template, description_template, challenge_type,
  easy_target, medium_target, hard_target,
  easy_reward_type, easy_reward_value,
  medium_reward_type, medium_reward_value,
  hard_reward_type, hard_reward_value,
  icon, accent_color
) VALUES
-- Ring closure challenges
(
  'Close {target} rings this week',
  'Close any ring (Move, Exercise, or Stand) to count toward this challenge.',
  'ring_closure',
  7, 14, 21,
  'badge', '{"badge_id": "ring_closer_bronze"}',
  'badge', '{"badge_id": "ring_closer_silver"}',
  'trial_mover', '{"trial_days": 3}',
  'circle-dot', '#FA114F'
),
-- Step challenges
(
  'Walk {target} steps this week',
  'Every step counts! Track your daily walks and runs.',
  'steps',
  50000, 100000, 200000,
  'badge', '{"badge_id": "step_master_bronze"}',
  'badge', '{"badge_id": "step_master_silver"}',
  'achievement_boost', '{"achievement_id": "total_steps", "bonus": 10000}',
  'footprints', '#00D4FF'
),
-- Calorie challenges
(
  'Burn {target} active calories this week',
  'Get moving and burn those calories!',
  'calories',
  2000, 4000, 7000,
  'badge', '{"badge_id": "calorie_crusher_bronze"}',
  'badge', '{"badge_id": "calorie_crusher_silver"}',
  'trial_crusher', '{"trial_days": 1}',
  'flame', '#FF6B35'
),
-- Workout challenges
(
  'Complete {target} workouts this week',
  'Any workout counts - walking, running, cycling, strength training, and more!',
  'workouts',
  3, 5, 7,
  'badge', '{"badge_id": "workout_warrior_bronze"}',
  'badge', '{"badge_id": "workout_warrior_silver"}',
  'trial_mover', '{"trial_days": 5}',
  'dumbbell', '#92E82A'
),
-- Early bird challenges
(
  'Log activity before 8 AM on {target} days',
  'Start your day right! Log any activity before 8 AM local time.',
  'early_bird',
  2, 4, 7,
  'badge', '{"badge_id": "early_bird_bronze"}',
  'badge', '{"badge_id": "early_bird_silver"}',
  'cosmetic', '{"cosmetic_type": "profile_frame", "cosmetic_id": "sunrise"}',
  'sunrise', '#FFB800'
),
-- Competition challenges
(
  'Participate in {target} competitions',
  'Join competitions and compete with friends!',
  'competition_participation',
  1, 2, 3,
  'badge', '{"badge_id": "competitor_bronze"}',
  'badge', '{"badge_id": "competitor_silver"}',
  'trial_crusher', '{"trial_days": 2}',
  'trophy', '#FFD700'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to generate weekly challenges from templates
CREATE OR REPLACE FUNCTION generate_weekly_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template RECORD;
  week_start TIMESTAMPTZ;
  week_end TIMESTAMPTZ;
  difficulty TEXT;
  target_val INTEGER;
  reward_type_val TEXT;
  reward_value_val JSONB;
BEGIN
  -- Calculate this week's start (Monday 00:00 UTC) and end (Sunday 23:59 UTC)
  week_start := date_trunc('week', NOW()) + INTERVAL '0 hours';
  week_end := week_start + INTERVAL '7 days' - INTERVAL '1 second';

  -- Check if challenges already exist for this week
  IF EXISTS (
    SELECT 1 FROM weekly_challenges
    WHERE starts_at = week_start AND ends_at = week_end
  ) THEN
    RETURN; -- Challenges already generated
  END IF;

  -- Generate 3 challenges: easy, medium, hard
  FOR template IN SELECT * FROM challenge_templates WHERE is_active = TRUE LOOP
    -- Randomly select difficulty for this template
    difficulty := (ARRAY['easy', 'medium', 'hard'])[1 + floor(random() * 3)::int];

    CASE difficulty
      WHEN 'easy' THEN
        target_val := template.easy_target;
        reward_type_val := template.easy_reward_type;
        reward_value_val := template.easy_reward_value;
      WHEN 'medium' THEN
        target_val := template.medium_target;
        reward_type_val := template.medium_reward_type;
        reward_value_val := template.medium_reward_value;
      WHEN 'hard' THEN
        target_val := template.hard_target;
        reward_type_val := template.hard_reward_type;
        reward_value_val := template.hard_reward_value;
    END CASE;

    INSERT INTO weekly_challenges (
      title, description, challenge_type, target_value,
      reward_type, reward_value,
      starts_at, ends_at,
      min_tier, icon, accent_color
    ) VALUES (
      REPLACE(template.title_template, '{target}', target_val::text),
      template.description_template,
      template.challenge_type,
      target_val,
      reward_type_val,
      reward_value_val,
      week_start,
      week_end,
      template.min_tier,
      template.icon,
      template.accent_color
    );
  END LOOP;
END;
$$;

-- Lock down the function
REVOKE EXECUTE ON FUNCTION generate_weekly_challenges FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_weekly_challenges TO service_role;

-- Function to update challenge progress for a user
CREATE OR REPLACE FUNCTION update_challenge_progress(
  p_user_id UUID,
  p_challenge_type TEXT,
  p_increment INTEGER DEFAULT 1
)
RETURNS TABLE(challenge_id UUID, new_value INTEGER, just_completed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  challenge RECORD;
  current_progress RECORD;
  new_progress INTEGER;
  was_completed BOOLEAN;
BEGIN
  -- Get all active challenges of this type
  FOR challenge IN
    SELECT wc.* FROM weekly_challenges wc
    WHERE wc.challenge_type = p_challenge_type
      AND wc.is_active = TRUE
      AND NOW() BETWEEN wc.starts_at AND wc.ends_at
  LOOP
    -- Get or create progress record
    INSERT INTO user_challenge_progress (user_id, challenge_id, current_value)
    VALUES (p_user_id, challenge.id, 0)
    ON CONFLICT (user_id, challenge_id) DO NOTHING;

    -- Get current progress
    SELECT * INTO current_progress
    FROM user_challenge_progress
    WHERE user_id = p_user_id AND challenge_id = challenge.id;

    -- Skip if already completed
    IF current_progress.completed_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    -- Update progress
    new_progress := current_progress.current_value + p_increment;
    was_completed := new_progress >= challenge.target_value;

    UPDATE user_challenge_progress
    SET
      current_value = new_progress,
      completed_at = CASE WHEN was_completed THEN NOW() ELSE NULL END,
      updated_at = NOW()
    WHERE user_id = p_user_id AND challenge_id = challenge.id;

    -- Return the result
    challenge_id := challenge.id;
    new_value := new_progress;
    just_completed := was_completed;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- Lock down the function
REVOKE EXECUTE ON FUNCTION update_challenge_progress FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_challenge_progress TO service_role;

-- Function to claim a challenge reward
CREATE OR REPLACE FUNCTION claim_challenge_reward(
  p_user_id UUID,
  p_challenge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  progress_record RECORD;
  challenge_record RECORD;
BEGIN
  -- Get progress record
  SELECT * INTO progress_record
  FROM user_challenge_progress
  WHERE user_id = p_user_id AND challenge_id = p_challenge_id;

  IF progress_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No progress record found');
  END IF;

  IF progress_record.completed_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Challenge not completed');
  END IF;

  IF progress_record.reward_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward already claimed');
  END IF;

  -- Get challenge details
  SELECT * INTO challenge_record
  FROM weekly_challenges
  WHERE id = p_challenge_id;

  -- Mark reward as claimed
  UPDATE user_challenge_progress
  SET
    reward_claimed = TRUE,
    reward_claimed_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id AND challenge_id = p_challenge_id;

  -- Return reward details for client to process
  RETURN jsonb_build_object(
    'success', true,
    'reward_type', challenge_record.reward_type,
    'reward_value', challenge_record.reward_value
  );
END;
$$;

-- Lock down the function
REVOKE EXECUTE ON FUNCTION claim_challenge_reward FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_challenge_reward TO service_role;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_challenge_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER weekly_challenges_updated_at
  BEFORE UPDATE ON weekly_challenges
  FOR EACH ROW
  EXECUTE FUNCTION update_challenge_timestamp();

CREATE TRIGGER user_challenge_progress_updated_at
  BEFORE UPDATE ON user_challenge_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_challenge_timestamp();

-- ============================================================================
-- ENABLE RLS (deny-all by default, access via service_role)
-- ============================================================================

ALTER TABLE weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_templates ENABLE ROW LEVEL SECURITY;

-- No policies needed - all access via Edge Functions with service_role

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE weekly_challenges IS 'Weekly rotating challenges that give users goals beyond daily rings';
COMMENT ON TABLE user_challenge_progress IS 'Tracks user progress on weekly challenges';
COMMENT ON TABLE challenge_templates IS 'Templates used to generate weekly challenges automatically';
COMMENT ON FUNCTION generate_weekly_challenges IS 'Generates weekly challenges from templates. Called by cron job.';
COMMENT ON FUNCTION update_challenge_progress IS 'Updates user progress on challenges. Called after activity sync.';
COMMENT ON FUNCTION claim_challenge_reward IS 'Claims a challenge reward. Returns reward details for client processing.';
