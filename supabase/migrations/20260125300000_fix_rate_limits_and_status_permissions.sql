-- Fix permissions for rate_limits table and update_competition_status function
-- These were inadvertently locked down by security migrations
-- This migration MUST run after all the security lockdown migrations

-- ============================================
-- 1. FIX rate_limits table permissions
-- ============================================

-- Grant authenticated users access to rate_limits table for their own records
GRANT SELECT, INSERT, UPDATE ON public.rate_limits TO authenticated;

-- Enable RLS on rate_limits if not already enabled
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can insert own rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can update own rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Service role manages rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Service role full access to rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "rate_limits_crusher_only" ON public.rate_limits;

-- Create RLS policies for rate_limits - authenticated users can manage their own
CREATE POLICY "Users can view own rate limits"
  ON public.rate_limits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own rate limits"
  ON public.rate_limits FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own rate limits"
  ON public.rate_limits FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role needs full access for cleanup and admin operations
CREATE POLICY "Service role full access to rate limits"
  ON public.rate_limits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 2. FIX update_competition_status function
-- ============================================

-- Grant execute permission on update_competition_status to authenticated users
-- This function is called by a trigger when creating/updating competitions
GRANT EXECUTE ON FUNCTION public.update_competition_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_update_competition_status() TO authenticated;

-- ============================================
-- 3. FIX competitions table INSERT permission
-- ============================================

-- Ensure authenticated users can insert competitions
GRANT INSERT ON public.competitions TO authenticated;

-- Drop and recreate the insert policy for competitions
DROP POLICY IF EXISTS "Users can create competitions" ON public.competitions;
DROP POLICY IF EXISTS "authenticated_can_create_competitions" ON public.competitions;

CREATE POLICY "Users can create competitions"
  ON public.competitions FOR INSERT
  TO authenticated
  WITH CHECK (creator_id = auth.uid());

-- ============================================
-- 4. FIX competition_participants INSERT
-- ============================================

-- Ensure authenticated users can join competitions
GRANT INSERT ON public.competition_participants TO authenticated;

DROP POLICY IF EXISTS "Users can join competitions" ON public.competition_participants;
DROP POLICY IF EXISTS "Users can add themselves to competitions" ON public.competition_participants;

CREATE POLICY "Users can join competitions"
  ON public.competition_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
