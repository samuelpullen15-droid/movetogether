-- =====================================================
-- Fix user_achievement_progress Data Leak
-- Remove overly permissive SELECT policy
-- Only run if table exists
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_achievement_progress' AND table_schema = 'public') THEN
    -- Drop the overly permissive policy that allows viewing ALL users' progress
    DROP POLICY IF EXISTS "Users can view others achievement progress" ON public.user_achievement_progress;

    -- Drop and recreate to consolidate
    DROP POLICY IF EXISTS "Users can view own achievement progress" ON public.user_achievement_progress;

    -- Create policy that allows viewing own + friends' progress
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'user_achievement_progress'
      AND policyname = 'Users can view accessible achievement progress'
    ) THEN
      CREATE POLICY "Users can view accessible achievement progress"
      ON public.user_achievement_progress FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR public.can_view_profile(auth.uid(), user_id)
      );
    END IF;
  END IF;
END $$;
