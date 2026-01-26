-- Add column to track if rings_closed notification was sent
-- Prevents duplicate notifications when health data syncs multiple times

ALTER TABLE user_activity
ADD COLUMN IF NOT EXISTS rings_closed_notified BOOLEAN DEFAULT FALSE;

-- Add index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_user_activity_rings_notified
ON user_activity(user_id, date)
WHERE rings_closed_notified = TRUE;
