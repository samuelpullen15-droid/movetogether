-- Migration: Fix stale competition statuses
-- This runs the update_competition_status() function to fix any competitions
-- where the status hasn't been updated (e.g., competitions that ended but still show as 'active')

-- Run the existing status update function to fix all stale statuses
SELECT update_competition_status();

-- Log how many competitions were updated to each status
DO $$
DECLARE
  active_count INTEGER;
  upcoming_count INTEGER;
  completed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO active_count FROM competitions WHERE status = 'active';
  SELECT COUNT(*) INTO upcoming_count FROM competitions WHERE status = 'upcoming';
  SELECT COUNT(*) INTO completed_count FROM competitions WHERE status = 'completed';

  RAISE NOTICE 'Competition status counts after update: active=%, upcoming=%, completed=%',
    active_count, upcoming_count, completed_count;
END $$;
