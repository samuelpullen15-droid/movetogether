-- =====================================================
-- Strict Achievement Data Access
-- Remove can_view_profile() - own data only
-- Friends' achievements can be accessed via secure functions
-- Only run if user_achievement_progress table exists
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_achievement_progress' AND table_schema = 'public') THEN
    -- 1. user_achievement_progress - own data only
    DROP POLICY IF EXISTS "Users can view accessible achievement progress" ON public.user_achievement_progress;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'user_achievement_progress'
      AND policyname = 'Users can view own achievement progress'
    ) THEN
      CREATE POLICY "Users can view own achievement progress"
      ON public.user_achievement_progress FOR SELECT TO authenticated
      USING (user_id = auth.uid());
    END IF;

    -- 2. user_achievement_stats view - own data only
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.user_achievement_stats
      WITH (security_invoker = on)
      AS
      SELECT
        user_id,
        count(*) FILTER (WHERE platinum_unlocked_at IS NOT NULL) AS platinum_count,
        count(*) FILTER (WHERE gold_unlocked_at IS NOT NULL) AS gold_count,
        count(*) FILTER (WHERE silver_unlocked_at IS NOT NULL) AS silver_count,
        count(*) FILTER (WHERE bronze_unlocked_at IS NOT NULL) AS bronze_count,
        (
          (count(*) FILTER (WHERE platinum_unlocked_at IS NOT NULL) * 4) +
          (count(*) FILTER (WHERE gold_unlocked_at IS NOT NULL) * 3) +
          (count(*) FILTER (WHERE silver_unlocked_at IS NOT NULL) * 2) +
          (count(*) FILTER (WHERE bronze_unlocked_at IS NOT NULL) * 1)
        ) AS achievement_score
      FROM public.user_achievement_progress
      WHERE user_id = auth.uid()
      GROUP BY user_id
    $view$;

    -- 3. Create secure function to get another user's achievement stats (with privacy check)
    CREATE OR REPLACE FUNCTION public.get_user_achievement_stats(p_user_id uuid)
    RETURNS TABLE (
      platinum_count bigint,
      gold_count bigint,
      silver_count bigint,
      bronze_count bigint,
      achievement_score bigint
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    BEGIN
      -- Only allow if viewing own data OR can view profile
      IF p_user_id = auth.uid() OR can_view_profile(auth.uid(), p_user_id) THEN
        RETURN QUERY
        SELECT
          count(*) FILTER (WHERE uap.platinum_unlocked_at IS NOT NULL),
          count(*) FILTER (WHERE uap.gold_unlocked_at IS NOT NULL),
          count(*) FILTER (WHERE uap.silver_unlocked_at IS NOT NULL),
          count(*) FILTER (WHERE uap.bronze_unlocked_at IS NOT NULL),
          (
            (count(*) FILTER (WHERE uap.platinum_unlocked_at IS NOT NULL) * 4) +
            (count(*) FILTER (WHERE uap.gold_unlocked_at IS NOT NULL) * 3) +
            (count(*) FILTER (WHERE uap.silver_unlocked_at IS NOT NULL) * 2) +
            (count(*) FILTER (WHERE uap.bronze_unlocked_at IS NOT NULL) * 1)
          )
        FROM user_achievement_progress uap
        WHERE uap.user_id = p_user_id;
      ELSE
        -- Return empty if not authorized
        RETURN;
      END IF;
    END;
    $func$;

    -- Grant execute to authenticated only
    REVOKE EXECUTE ON FUNCTION public.get_user_achievement_stats(uuid) FROM anon;
    GRANT EXECUTE ON FUNCTION public.get_user_achievement_stats(uuid) TO authenticated;
  END IF;
END $$;
