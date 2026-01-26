-- =====================================================
-- Lock Down competition_daily_data Writes
-- Data should only be written via RPC functions or Edge Functions
-- Direct user writes allow data manipulation/cheating
-- =====================================================

-- 1. Drop permissive INSERT/UPDATE/DELETE policies
-- =====================================================
DROP POLICY IF EXISTS "Users can insert their own daily data" ON public.competition_daily_data;
DROP POLICY IF EXISTS "Users can update their own daily data" ON public.competition_daily_data;
DROP POLICY IF EXISTS "Users can delete their own daily data" ON public.competition_daily_data;

-- 2. Create service_role only write policies
-- =====================================================
-- Service role can manage all competition daily data
CREATE POLICY "Service role manages competition daily data"
ON public.competition_daily_data FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 3. Revoke direct write access from authenticated users
-- =====================================================
-- Users should use update_competition_standings RPC instead
REVOKE INSERT, UPDATE, DELETE ON public.competition_daily_data FROM authenticated;

-- 4. Keep SELECT access for participants (already set in previous migration)
-- =====================================================
-- The "Participants can view competition daily data" policy remains from 20260124000001
