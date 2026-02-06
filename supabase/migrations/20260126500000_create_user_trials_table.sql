-- ============================================================================
-- USER TRIALS TABLE
-- ============================================================================
-- Tracks active trial rewards earned through the streak milestone system.
-- This table provides a denormalized view for quick trial status lookups.

-- Create the user_trials table
CREATE TABLE IF NOT EXISTS public.user_trials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    trial_type TEXT NOT NULL CHECK (trial_type IN (
        'trial_mover',
        'trial_coach',
        'trial_crusher'
    )),
    milestone_progress_id UUID REFERENCES public.user_milestone_progress(id) ON DELETE SET NULL,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL DEFAULT 'streak_milestone',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each user can only have one active trial of each type at a time
    -- Upserting will replace the old trial with a new one
    CONSTRAINT unique_user_trial_type UNIQUE (user_id, trial_type)
);

-- Add comments
COMMENT ON TABLE public.user_trials IS 'Tracks active trial rewards from streak milestones';
COMMENT ON COLUMN public.user_trials.trial_type IS 'Type of trial: trial_mover, trial_coach, trial_crusher';
COMMENT ON COLUMN public.user_trials.milestone_progress_id IS 'Reference to the milestone that granted this trial';
COMMENT ON COLUMN public.user_trials.activated_at IS 'When the trial was activated';
COMMENT ON COLUMN public.user_trials.expires_at IS 'When the trial expires';
COMMENT ON COLUMN public.user_trials.source IS 'Source of the trial (streak_milestone, promotion, etc.)';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for checking trials by user (covers active trial lookups)
CREATE INDEX IF NOT EXISTS idx_user_trials_user_expires
ON public.user_trials(user_id, expires_at DESC);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_user_trials_expires_at
ON public.user_trials(expires_at);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.user_trials ENABLE ROW LEVEL SECURITY;

-- Users can view their own trials
CREATE POLICY "Users can view own trials"
ON public.user_trials
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Only service role can insert/update (via Edge Functions)
CREATE POLICY "Service role can manage trials"
ON public.user_trials
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_trials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_trials_updated_at ON public.user_trials;
CREATE TRIGGER trigger_user_trials_updated_at
    BEFORE UPDATE ON public.user_trials
    FOR EACH ROW
    EXECUTE FUNCTION update_user_trials_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a user has an active trial of a specific type
CREATE OR REPLACE FUNCTION has_active_trial(
    p_user_id UUID,
    p_trial_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_trials
        WHERE user_id = p_user_id
          AND trial_type = p_trial_type
          AND expires_at > NOW()
    );
END;
$$;

COMMENT ON FUNCTION has_active_trial IS 'Check if user has an active trial of the specified type';

-- Function to get all active trials for a user
CREATE OR REPLACE FUNCTION get_active_trials(p_user_id UUID)
RETURNS TABLE (
    trial_type TEXT,
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    hours_remaining INTEGER,
    minutes_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.trial_type,
        t.activated_at,
        t.expires_at,
        EXTRACT(EPOCH FROM (t.expires_at - NOW()))::INTEGER / 3600 AS hours_remaining,
        (EXTRACT(EPOCH FROM (t.expires_at - NOW()))::INTEGER % 3600) / 60 AS minutes_remaining
    FROM public.user_trials t
    WHERE t.user_id = p_user_id
      AND t.expires_at > NOW()
    ORDER BY t.expires_at ASC;
END;
$$;

COMMENT ON FUNCTION get_active_trials IS 'Get all active trials for a user with time remaining';

-- Function to get effective subscription tier (considering trials)
-- This is useful for permission checks that need to consider trials
CREATE OR REPLACE FUNCTION get_effective_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_subscription_tier TEXT;
    v_has_crusher_trial BOOLEAN;
    v_has_mover_trial BOOLEAN;
BEGIN
    -- Get the user's actual subscription tier
    SELECT subscription_tier INTO v_subscription_tier
    FROM public.profiles
    WHERE id = p_user_id;

    -- If already crusher, return that
    IF v_subscription_tier = 'crusher' THEN
        RETURN 'crusher';
    END IF;

    -- Check for crusher trial
    v_has_crusher_trial := has_active_trial(p_user_id, 'trial_crusher');
    IF v_has_crusher_trial THEN
        RETURN 'crusher';
    END IF;

    -- If already mover, return that
    IF v_subscription_tier = 'mover' THEN
        RETURN 'mover';
    END IF;

    -- Check for mover or coach trial (both grant mover-level access)
    v_has_mover_trial := has_active_trial(p_user_id, 'trial_mover')
                      OR has_active_trial(p_user_id, 'trial_coach');
    IF v_has_mover_trial THEN
        RETURN 'mover';
    END IF;

    -- Default to starter
    RETURN COALESCE(v_subscription_tier, 'starter');
END;
$$;

COMMENT ON FUNCTION get_effective_tier IS 'Get user effective tier considering both subscription and active trials';

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

-- Function to clean up expired trials (optional, for housekeeping)
CREATE OR REPLACE FUNCTION cleanup_expired_trials()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete trials that expired more than 30 days ago
    -- We keep recently expired trials for analytics/prompts
    DELETE FROM public.user_trials
    WHERE expires_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RAISE NOTICE 'Cleaned up % expired trial records', deleted_count;
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_trials IS 'Remove trial records that expired more than 30 days ago';
