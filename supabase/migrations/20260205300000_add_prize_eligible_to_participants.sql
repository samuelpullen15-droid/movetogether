-- ============================================================
-- Add prize_eligible flag to competition_participants
-- ============================================================
-- Allows users to join buy-in competitions without paying.
-- Opted-out users compete normally but are ineligible for prizes.
-- Prizes cascade to the next eligible participant.

-- 1. Add prize_eligible column (default true for all existing participants)
ALTER TABLE competition_participants
  ADD COLUMN IF NOT EXISTS prize_eligible BOOLEAN NOT NULL DEFAULT true;

-- 2. Partial index for efficient prize-eligible filtering during distribution
CREATE INDEX IF NOT EXISTS idx_participants_prize_eligible
  ON competition_participants(competition_id, total_points DESC)
  WHERE prize_eligible = true;
