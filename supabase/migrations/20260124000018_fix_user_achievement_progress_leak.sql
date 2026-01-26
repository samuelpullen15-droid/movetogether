-- =====================================================
-- Fix user_achievement_progress Data Leak
-- Remove overly permissive SELECT policy
-- =====================================================

-- Drop the overly permissive policy that allows viewing ALL users' progress
DROP POLICY IF EXISTS "Users can view others achievement progress" ON public.user_achievement_progress;

-- Keep existing "Users can view own achievement progress" policy
-- But also add ability to view friends' progress via can_view_profile

-- Drop and recreate to consolidate
DROP POLICY IF EXISTS "Users can view own achievement progress" ON public.user_achievement_progress;

CREATE POLICY "Users can view accessible achievement progress"
ON public.user_achievement_progress FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_view_profile(auth.uid(), user_id)
);
