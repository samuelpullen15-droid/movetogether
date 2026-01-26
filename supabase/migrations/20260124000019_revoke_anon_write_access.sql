-- =====================================================
-- CRITICAL: Revoke Anonymous Write Access
-- These tables/views should NEVER be writable by anon
-- =====================================================

-- 1. rate_limits - Only service_role should write
REVOKE INSERT, UPDATE, DELETE ON public.rate_limits FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limits FROM authenticated;

-- 2. daily_activity (VIEW) - Views shouldn't be writable, but revoke anyway
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'daily_activity') THEN
    REVOKE ALL ON public.daily_activity FROM anon;
  END IF;
END $$;

-- 3. user_achievement_stats (VIEW) - Views shouldn't be writable
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'user_achievement_stats') THEN
    REVOKE ALL ON public.user_achievement_stats FROM anon;
  END IF;
END $$;

-- 4. competitions - Only authenticated users should write (with RLS)
REVOKE INSERT, UPDATE, DELETE ON public.competitions FROM anon;

-- 5. user_activity_aggregates (VIEW) - Views shouldn't be writable
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'user_activity_aggregates') THEN
    REVOKE ALL ON public.user_activity_aggregates FROM anon;
  END IF;
END $$;

-- 6. competition_daily_data - Only service_role should write
REVOKE INSERT, UPDATE, DELETE ON public.competition_daily_data FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.competition_daily_data FROM authenticated;

-- 7. user_achievement_progress - Only service_role should write
REVOKE INSERT, UPDATE, DELETE ON public.user_achievement_progress FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_achievement_progress FROM authenticated;

-- 8. competition_participants - Only authenticated users should write (with RLS)
REVOKE INSERT, UPDATE, DELETE ON public.competition_participants FROM anon;

-- Also revoke SELECT from anon on sensitive tables
REVOKE SELECT ON public.rate_limits FROM anon;
REVOKE SELECT ON public.competition_daily_data FROM anon;
REVOKE SELECT ON public.user_achievement_progress FROM anon;

-- Ensure service_role retains full access where needed
GRANT ALL ON public.rate_limits TO service_role;
GRANT ALL ON public.competition_daily_data TO service_role;
GRANT ALL ON public.user_achievement_progress TO service_role;
