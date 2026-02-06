-- ============================================================================
-- SEASONAL EVENTS
-- ============================================================================
-- Extends the competitions table with seasonal event metadata.
-- Seasonal events are admin-created themed challenges that all users can join
-- (bypasses Starter tier competition limits). They reuse all existing
-- competition infrastructure: leaderboard, daily scoring, group chat, etc.
--
-- event_theme JSONB: { color, secondaryColor, icon, emoji, tagline, rewardDescription }
-- event_reward JSONB: { type, trial_hours, min_days_completed, source }

-- ============================================================================
-- STEP 1: Add columns to competitions table
-- ============================================================================

ALTER TABLE public.competitions
ADD COLUMN IF NOT EXISTS is_seasonal_event BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.competitions
ADD COLUMN IF NOT EXISTS event_theme JSONB DEFAULT NULL;

ALTER TABLE public.competitions
ADD COLUMN IF NOT EXISTS event_reward JSONB DEFAULT NULL;

COMMENT ON COLUMN public.competitions.is_seasonal_event
    IS 'Whether this competition is an admin-created seasonal event';
COMMENT ON COLUMN public.competitions.event_theme
    IS 'Theme metadata: { color, secondaryColor, icon, emoji, tagline, rewardDescription }';
COMMENT ON COLUMN public.competitions.event_reward
    IS 'Completion reward config: { type, trial_hours, min_days_completed, source }';

-- ============================================================================
-- STEP 2: Index for seasonal event lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_competitions_seasonal
ON public.competitions(is_seasonal_event, status)
WHERE is_seasonal_event = true;

-- NOTE: Seed data for seasonal events should be inserted manually or via a
-- separate seed script, using a real creator_id that exists in the profiles table.
