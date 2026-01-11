-- ============================================
-- Add subscription tier columns to profiles table
-- ============================================

-- Add subscription_tier column (default 'starter')
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'starter';

-- Add ai_messages_used column (default 0)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ai_messages_used INTEGER NOT NULL DEFAULT 0;

-- Add ai_messages_reset_at column (timestamp for when to reset AI message count)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ai_messages_reset_at TIMESTAMPTZ NULL;

-- Add check constraint for subscription_tier
ALTER TABLE public.profiles
ADD CONSTRAINT check_subscription_tier 
CHECK (subscription_tier IN ('starter', 'mover', 'crusher'));

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.subscription_tier IS 'User subscription tier: starter (free), mover, or crusher';
COMMENT ON COLUMN public.profiles.ai_messages_used IS 'Number of AI messages used in the current period';
COMMENT ON COLUMN public.profiles.ai_messages_reset_at IS 'Timestamp when AI message count should be reset (typically monthly)';

-- Create index on subscription_tier for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(subscription_tier);

-- ============================================
-- Function to update subscription tier from RevenueCat webhook
-- This can be called from a webhook handler or manually
-- ============================================

CREATE OR REPLACE FUNCTION public.update_subscription_tier(
  p_user_id UUID,
  p_tier TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Validate tier
  IF p_tier NOT IN ('starter', 'mover', 'crusher') THEN
    RAISE EXCEPTION 'Invalid subscription tier: %', p_tier;
  END IF;

  -- Update the subscription tier
  UPDATE public.profiles
  SET subscription_tier = p_tier
  WHERE id = p_user_id;

  -- If upgrading to crusher, reset AI messages
  IF p_tier = 'crusher' THEN
    UPDATE public.profiles
    SET 
      ai_messages_used = 0,
      ai_messages_reset_at = NOW() + INTERVAL '1 month'
    WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function to check and reset AI messages if needed
-- Call this periodically or before checking AI message limits
-- ============================================

CREATE OR REPLACE FUNCTION public.check_reset_ai_messages(
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET 
    ai_messages_used = 0,
    ai_messages_reset_at = NOW() + INTERVAL '1 month'
  WHERE id = p_user_id
    AND (
      ai_messages_reset_at IS NULL 
      OR ai_messages_reset_at < NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
