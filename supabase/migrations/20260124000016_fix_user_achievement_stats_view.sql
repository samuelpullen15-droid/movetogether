-- =====================================================
-- Fix user_achievement_stats View Data Leak
-- Add user_id filtering to prevent viewing all users' stats
-- =====================================================

-- Only run if user_achievement_progress table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_achievement_progress' AND table_schema = 'public') THEN
    -- Recreate view with security filter
    -- Only shows own stats or stats of users you can view (friends with privacy check)
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
         OR public.can_view_profile(auth.uid(), user_id)
      GROUP BY user_id
    $view$;

    -- Ensure proper ownership
    ALTER VIEW public.user_achievement_stats OWNER TO postgres;

    -- Revoke direct access from anon
    REVOKE ALL ON public.user_achievement_stats FROM anon;
  END IF;
END $$;
