-- =====================================================
-- RLS Security Remediation - Part 2
-- Fix views and anonymous access issues
-- =====================================================

-- 1. Make views use security_invoker so they respect RLS
-- =====================================================
-- This ensures views run with the caller's permissions, not the definer's

DO $$
BEGIN
  -- daily_activity view
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'daily_activity') THEN
    ALTER VIEW public.daily_activity SET (security_invoker = on);
  END IF;

  -- user_achievement_stats view
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'user_achievement_stats') THEN
    ALTER VIEW public.user_achievement_stats SET (security_invoker = on);
  END IF;

  -- user_achievement_progress view
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'user_achievement_progress') THEN
    ALTER VIEW public.user_achievement_progress SET (security_invoker = on);
  END IF;

  -- user_activity_aggregates view
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'user_activity_aggregates') THEN
    ALTER VIEW public.user_activity_aggregates SET (security_invoker = on);
  END IF;
END $$;

-- 2. FIX competitions: Add policy to restrict anonymous access
-- =====================================================
-- Drop any existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can view public competitions" ON public.competitions;
DROP POLICY IF EXISTS "Public competitions are viewable by anyone" ON public.competitions;

-- Ensure only authenticated users can view competitions they're involved in
-- Public competitions should only be visible to authenticated users
CREATE POLICY "Authenticated users can view public or participating competitions"
ON public.competitions FOR SELECT TO authenticated
USING (
  is_public = true
  OR creator_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.competition_participants cp
    WHERE cp.competition_id = competitions.id
    AND cp.user_id = auth.uid()
  )
);

-- 3. FIX competition_daily_data: Restrict to participants
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view competition daily data" ON public.competition_daily_data;
DROP POLICY IF EXISTS "Authenticated users can view competition daily data" ON public.competition_daily_data;

CREATE POLICY "Participants can view competition daily data"
ON public.competition_daily_data FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.competition_participants cp
    WHERE cp.competition_id = competition_daily_data.competition_id
    AND cp.user_id = auth.uid()
  )
);

-- 4. FIX competition_participants: Restrict to co-participants
-- =====================================================
DROP POLICY IF EXISTS "Anyone can view competition participants" ON public.competition_participants;
DROP POLICY IF EXISTS "Authenticated users can view participants" ON public.competition_participants;

CREATE POLICY "Users can view participants in their competitions"
ON public.competition_participants FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.competition_participants cp2
    WHERE cp2.competition_id = competition_participants.competition_id
    AND cp2.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = competition_participants.competition_id
    AND c.is_public = true
  )
);

-- 5. Ensure rate_limits has no anonymous access
-- =====================================================
-- Revoke all access from anon role
REVOKE ALL ON public.rate_limits FROM anon;

-- Grant only to service_role
GRANT ALL ON public.rate_limits TO service_role;
