-- =====================================================
-- CRITICAL: Revoke Anonymous Write Access
-- These tables/views should NEVER be writable by anon
-- All statements wrapped in existence checks for idempotency
-- =====================================================

-- 1. rate_limits - Only service_role should write
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limits' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.rate_limits FROM anon;
    REVOKE INSERT, UPDATE, DELETE ON public.rate_limits FROM authenticated;
    REVOKE SELECT ON public.rate_limits FROM anon;
    GRANT ALL ON public.rate_limits TO service_role;
  END IF;
END $$;

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
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'competitions' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.competitions FROM anon;
  END IF;
END $$;

-- 5. user_activity_aggregates (VIEW) - Views shouldn't be writable
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'user_activity_aggregates') THEN
    REVOKE ALL ON public.user_activity_aggregates FROM anon;
  END IF;
END $$;

-- 6. competition_daily_data - Only service_role should write
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'competition_daily_data' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.competition_daily_data FROM anon;
    REVOKE INSERT, UPDATE, DELETE ON public.competition_daily_data FROM authenticated;
    REVOKE SELECT ON public.competition_daily_data FROM anon;
    GRANT ALL ON public.competition_daily_data TO service_role;
  END IF;
END $$;

-- 7. user_achievement_progress - Only service_role should write
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_achievement_progress' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.user_achievement_progress FROM anon;
    REVOKE INSERT, UPDATE, DELETE ON public.user_achievement_progress FROM authenticated;
    REVOKE SELECT ON public.user_achievement_progress FROM anon;
    GRANT ALL ON public.user_achievement_progress TO service_role;
  END IF;
END $$;

-- 8. competition_participants - Only authenticated users should write (with RLS)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'competition_participants' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.competition_participants FROM anon;
  END IF;
END $$;
