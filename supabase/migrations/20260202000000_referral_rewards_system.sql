-- ============================================================================
-- REFERRAL REWARDS SYSTEM
-- ============================================================================
-- Enables user-to-user referrals with trial reward incentives.
-- Each user gets a unique 8-char referral code auto-assigned on profile creation.
-- When a referred user completes onboarding, both referrer and referee
-- receive a 7-day Mover trial via the existing user_trials table.

-- ============================================================================
-- STEP 1: Add referral_code column to profiles
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Index for fast lookups by referral code
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code
ON public.profiles(referral_code)
WHERE referral_code IS NOT NULL;

-- ============================================================================
-- STEP 2: Create user_referrals tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_referrals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,

    -- Status tracking
    referee_completed_onboarding BOOLEAN DEFAULT FALSE,
    referee_reward_granted BOOLEAN DEFAULT FALSE,
    referee_reward_granted_at TIMESTAMPTZ,
    referrer_reward_granted BOOLEAN DEFAULT FALSE,
    referrer_reward_granted_at TIMESTAMPTZ,

    -- Timestamps
    referred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each user can only be referred once
    CONSTRAINT unique_referee UNIQUE (referee_id),

    -- Cannot refer yourself
    CONSTRAINT no_self_referral CHECK (referrer_id != referee_id)
);

-- Comments
COMMENT ON TABLE public.user_referrals IS 'Tracks user-to-user referrals and reward status';
COMMENT ON COLUMN public.user_referrals.referrer_id IS 'The user who shared their referral code';
COMMENT ON COLUMN public.user_referrals.referee_id IS 'The user who signed up using the referral code';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer
ON public.user_referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_user_referrals_referee
ON public.user_referrals(referee_id);

-- ============================================================================
-- STEP 3: Row Level Security
-- ============================================================================

ALTER TABLE public.user_referrals ENABLE ROW LEVEL SECURITY;

-- Users can view their own referral records (as referrer or referee)
CREATE POLICY "Users can view own referrals"
ON public.user_referrals
FOR SELECT
TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- Service role can manage all referral operations
CREATE POLICY "Service role can manage referrals"
ON public.user_referrals
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- STEP 4: Referral code generation function
-- ============================================================================

-- Generate a unique 8-char alphanumeric code (excludes ambiguous chars: 0/O/1/I/L)
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;
    RETURN result;
END;
$$;

COMMENT ON FUNCTION generate_referral_code() IS 'Generates an 8-char alphanumeric referral code without ambiguous characters';

-- ============================================================================
-- STEP 5: Auto-assign referral code on profile creation
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_code TEXT;
    v_attempts INTEGER := 0;
    v_exists BOOLEAN;
BEGIN
    -- Only assign if code is not already set
    IF NEW.referral_code IS NULL THEN
        LOOP
            v_code := generate_referral_code();

            -- Check if code already exists
            SELECT EXISTS(
                SELECT 1 FROM public.profiles WHERE referral_code = v_code
            ) INTO v_exists;

            IF NOT v_exists THEN
                NEW.referral_code := v_code;
                EXIT;
            END IF;

            v_attempts := v_attempts + 1;
            IF v_attempts >= 10 THEN
                RAISE EXCEPTION 'Could not generate unique referral code after 10 attempts';
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger on INSERT
DROP TRIGGER IF EXISTS trigger_assign_referral_code ON public.profiles;
CREATE TRIGGER trigger_assign_referral_code
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION assign_referral_code();

-- ============================================================================
-- STEP 6: Backfill existing users with referral codes
-- ============================================================================

DO $$
DECLARE
    rec RECORD;
    v_code TEXT;
    v_exists BOOLEAN;
    v_attempts INTEGER;
BEGIN
    FOR rec IN
        SELECT id FROM public.profiles WHERE referral_code IS NULL
    LOOP
        v_attempts := 0;
        LOOP
            v_code := generate_referral_code();

            SELECT EXISTS(
                SELECT 1 FROM public.profiles WHERE referral_code = v_code
            ) INTO v_exists;

            IF NOT v_exists THEN
                UPDATE public.profiles SET referral_code = v_code WHERE id = rec.id;
                EXIT;
            END IF;

            v_attempts := v_attempts + 1;
            IF v_attempts >= 10 THEN
                RAISE WARNING 'Could not generate unique referral code for user %', rec.id;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

-- ============================================================================
-- STEP 7: Referral stats helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_referral_stats(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_referrals INTEGER;
    v_completed_referrals INTEGER;
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE referee_completed_onboarding = TRUE)
    INTO v_total_referrals, v_completed_referrals
    FROM public.user_referrals
    WHERE referrer_id = p_user_id;

    RETURN json_build_object(
        'total_referrals', COALESCE(v_total_referrals, 0),
        'completed_referrals', COALESCE(v_completed_referrals, 0)
    );
END;
$$;

COMMENT ON FUNCTION get_referral_stats(UUID) IS 'Returns referral counts for a user (total and completed)';
