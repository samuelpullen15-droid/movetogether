-- =====================================================
-- Fix service_role access to user_fitness
-- Edge Functions use service_role and need write access
-- =====================================================

-- Grant service_role full access to user_fitness table
GRANT ALL ON public.user_fitness TO service_role;

-- Also ensure service_role has access to related tables used by Edge Functions
GRANT ALL ON public.user_activity TO service_role;
GRANT ALL ON public.activity_feed TO service_role;
GRANT ALL ON public.competition_daily_data TO service_role;
GRANT ALL ON public.competition_participants TO service_role;
