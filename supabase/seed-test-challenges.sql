-- ============================================================================
-- SEED TEST CHALLENGES
-- ============================================================================
-- Run this to generate sample weekly challenges for testing the UI.
-- Usage: npx supabase db reset (applies automatically) OR run manually via SQL editor
--
-- This creates challenges for the current week with varying progress states.

-- First, generate the standard weekly challenges from templates
SELECT generate_weekly_challenges();

-- Now let's update Sam's (your) user ID with some sample progress
-- Replace with your actual user ID if different
DO $$
DECLARE
  test_user_id UUID := '46354069-e0b4-49c9-929b-5418df1b7aad'; -- Sam's user ID
  challenge RECORD;
  progress_value INTEGER;
  is_completed BOOLEAN;
BEGIN
  -- Loop through each active challenge and set different progress states for demo
  FOR challenge IN
    SELECT * FROM weekly_challenges
    WHERE is_active = TRUE
      AND NOW() BETWEEN starts_at AND ends_at
    ORDER BY created_at
  LOOP
    -- Determine random progress state for demo variety
    CASE challenge.challenge_type
      WHEN 'ring_closure' THEN
        -- 85% complete (almost done!)
        progress_value := FLOOR(challenge.target_value * 0.85);
        is_completed := FALSE;
      WHEN 'steps' THEN
        -- 100% complete - ready to claim
        progress_value := challenge.target_value;
        is_completed := TRUE;
      WHEN 'calories' THEN
        -- 45% progress
        progress_value := FLOOR(challenge.target_value * 0.45);
        is_completed := FALSE;
      WHEN 'workouts' THEN
        -- 100% complete and already claimed
        progress_value := challenge.target_value;
        is_completed := TRUE;
      WHEN 'early_bird' THEN
        -- 60% progress
        progress_value := FLOOR(challenge.target_value * 0.6);
        is_completed := FALSE;
      WHEN 'competition_participation' THEN
        -- 100% complete - ready to claim
        progress_value := challenge.target_value;
        is_completed := TRUE;
      ELSE
        progress_value := FLOOR(challenge.target_value * 0.5);
        is_completed := FALSE;
    END CASE;

    -- Insert or update progress
    INSERT INTO user_challenge_progress (
      user_id,
      challenge_id,
      current_value,
      completed_at,
      reward_claimed,
      reward_claimed_at
    ) VALUES (
      test_user_id,
      challenge.id,
      progress_value,
      CASE WHEN is_completed THEN NOW() - INTERVAL '1 hour' ELSE NULL END,
      CASE WHEN challenge.challenge_type = 'workouts' THEN TRUE ELSE FALSE END, -- Only workouts is claimed
      CASE WHEN challenge.challenge_type = 'workouts' THEN NOW() - INTERVAL '30 minutes' ELSE NULL END
    )
    ON CONFLICT (user_id, challenge_id) DO UPDATE SET
      current_value = EXCLUDED.current_value,
      completed_at = EXCLUDED.completed_at,
      reward_claimed = EXCLUDED.reward_claimed,
      reward_claimed_at = EXCLUDED.reward_claimed_at,
      updated_at = NOW();

    RAISE NOTICE 'Set % challenge progress to %/%', challenge.challenge_type, progress_value, challenge.target_value;
  END LOOP;
END $$;

-- Show what was created
SELECT
  wc.title,
  wc.challenge_type,
  wc.target_value,
  wc.icon,
  wc.accent_color,
  wc.reward_type,
  ucp.current_value,
  ROUND((ucp.current_value::numeric / wc.target_value::numeric) * 100, 1) as percent_complete,
  CASE
    WHEN ucp.reward_claimed THEN 'CLAIMED'
    WHEN ucp.completed_at IS NOT NULL THEN 'READY TO CLAIM'
    ELSE 'IN PROGRESS'
  END as status
FROM weekly_challenges wc
LEFT JOIN user_challenge_progress ucp ON ucp.challenge_id = wc.id
  AND ucp.user_id = '46354069-e0b4-49c9-929b-5418df1b7aad'
WHERE wc.is_active = TRUE
  AND NOW() BETWEEN wc.starts_at AND wc.ends_at
ORDER BY wc.created_at;
