-- Migration: Add score locking for timezone-aware competition endings
-- Each participant's score is locked when their local midnight arrives
-- This ensures fairness across timezones without needing a global grace period

-- Add score_locked_at column to track when each participant's score was locked
ALTER TABLE competition_participants
ADD COLUMN IF NOT EXISTS score_locked_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for efficient queries on locked status
CREATE INDEX IF NOT EXISTS idx_competition_participants_score_locked
ON competition_participants(competition_id, score_locked_at);

-- Comment explaining the column
COMMENT ON COLUMN competition_participants.score_locked_at IS
'Timestamp when this participant''s score was locked (their local midnight passed). NULL means score is still active.';
