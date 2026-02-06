-- ============================================================================
-- Clear Test Challenge Progress Data
-- ============================================================================
-- This migration removes fake/test progress data that was seeded for development.
-- Real progress tracking is now wired up through the health sync system.

-- Delete all user_challenge_progress records that were seeded
-- (we're clearing ALL progress since the system wasn't tracking real data)
DELETE FROM user_challenge_progress;

-- Log the cleanup
DO $$
BEGIN
  RAISE NOTICE 'Cleared all test challenge progress data. Real tracking is now enabled.';
END $$;
