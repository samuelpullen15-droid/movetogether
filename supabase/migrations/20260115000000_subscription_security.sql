-- Migration: Secure subscription verification
-- This migration adds server-side subscription verification to prevent client-side bypass

-- ============================================
-- 1. Create function to get user subscription tier
-- ============================================
CREATE OR REPLACE FUNCTION get_user_subscription_tier(p_user_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    (SELECT subscription_tier FROM profiles WHERE id = p_user_id),
    'starter'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_subscription_tier(UUID) IS 'Returns the subscription tier for a user. Defaults to starter if not found.';

-- ============================================
-- 2. RLS Policies for subscription-based access
-- ============================================

-- AI Coach messages/rate_limits: Only allow if tier = 'crusher'
-- Note: The ai-coach Edge Function already checks this, but we add RLS as defense in depth
-- Rate limits table - only crusher tier can insert/update
-- First, ensure the rate_limits table exists (it may not exist yet)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rate_limits') THEN
    DROP POLICY IF EXISTS "rate_limits_crusher_only" ON rate_limits;
    CREATE POLICY "rate_limits_crusher_only" ON rate_limits
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = rate_limits.user_id
          AND profiles.subscription_tier = 'crusher'
        )
      );
  END IF;
END $$;

-- ============================================
-- 3. Helper function to check if user has required tier
-- ============================================
CREATE OR REPLACE FUNCTION has_subscription_tier(
  p_user_id UUID,
  p_required_tier TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_tier TEXT;
  v_tier_hierarchy INTEGER;
  v_required_hierarchy INTEGER;
BEGIN
  -- Get user's tier
  v_user_tier := get_user_subscription_tier(p_user_id);
  
  -- Define tier hierarchy: starter=1, mover=2, crusher=3
  v_tier_hierarchy := CASE v_user_tier
    WHEN 'starter' THEN 1
    WHEN 'mover' THEN 2
    WHEN 'crusher' THEN 3
    ELSE 1
  END;
  
  v_required_hierarchy := CASE p_required_tier
    WHEN 'starter' THEN 1
    WHEN 'mover' THEN 2
    WHEN 'crusher' THEN 3
    ELSE 1
  END;
  
  -- User has required tier if their tier hierarchy >= required hierarchy
  RETURN v_tier_hierarchy >= v_required_hierarchy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION has_subscription_tier(UUID, TEXT) IS 'Checks if user has the required subscription tier or higher. Returns true if user tier >= required tier.';

-- ============================================
-- 4. Grant execute permissions
-- ============================================
GRANT EXECUTE ON FUNCTION get_user_subscription_tier(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_subscription_tier(UUID, TEXT) TO authenticated;
