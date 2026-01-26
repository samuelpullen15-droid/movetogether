-- =====================================================
-- RLS Security Remediation
-- Fixes critical vulnerabilities from security audit
-- =====================================================

-- 1. FIX user_activity: Remove overly permissive policy
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can view activity data" ON public.user_activity;

-- 2. FIX profiles: Make username check privacy-aware
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can check usernames" ON public.profiles;

CREATE POLICY "Users can view profiles with privacy check"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR can_view_profile(auth.uid(), id)
);

-- 3. Views inherit security from underlying tables - no RLS changes needed:
--    - daily_activity (VIEW)
--    - user_achievement_stats (VIEW)
--    - user_achievement_progress (VIEW)
-- Security is enforced on the underlying user_activity and achievements tables

-- 4. FIX provider_tokens: Enable RLS and add policies (if table exists)
-- =====================================================
DO $$
BEGIN
  -- Check if provider_tokens is a table (not a view)
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'provider_tokens'
  ) THEN
    ALTER TABLE public.provider_tokens ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if any
    DROP POLICY IF EXISTS "Users can view own provider tokens" ON public.provider_tokens;
    DROP POLICY IF EXISTS "Users can insert own provider tokens" ON public.provider_tokens;
    DROP POLICY IF EXISTS "Users can update own provider tokens" ON public.provider_tokens;
    DROP POLICY IF EXISTS "Users can delete own provider tokens" ON public.provider_tokens;

    CREATE POLICY "Users can view own provider tokens"
    ON public.provider_tokens FOR SELECT TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can insert own provider tokens"
    ON public.provider_tokens FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own provider tokens"
    ON public.provider_tokens FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

    CREATE POLICY "Users can delete own provider tokens"
    ON public.provider_tokens FOR DELETE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- 5. FIX activity_reactions: Enable RLS and add policies (if table exists)
-- =====================================================
DO $$
BEGIN
  -- Check if activity_reactions is a table (not a view)
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'activity_reactions'
  ) THEN
    ALTER TABLE public.activity_reactions ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if any
    DROP POLICY IF EXISTS "Users can view reactions on viewable activities" ON public.activity_reactions;
    DROP POLICY IF EXISTS "Users can add reactions" ON public.activity_reactions;
    DROP POLICY IF EXISTS "Users can delete own reactions" ON public.activity_reactions;

    CREATE POLICY "Users can view reactions on viewable activities"
    ON public.activity_reactions FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_activity ua
        WHERE ua.id = activity_reactions.activity_id
        AND (ua.user_id = auth.uid() OR can_view_profile(auth.uid(), ua.user_id))
      )
    );

    CREATE POLICY "Users can add reactions"
    ON public.activity_reactions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can delete own reactions"
    ON public.activity_reactions FOR DELETE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- 6. FIX rate_limits: Remove anon access, restrict to service role
-- =====================================================
DROP POLICY IF EXISTS "anon_can_insert_rate_limits" ON public.rate_limits;
DROP POLICY IF EXISTS "anon_can_read_rate_limits" ON public.rate_limits;

-- Ensure service role can manage all rate limits
DROP POLICY IF EXISTS "Service role manages rate limits" ON public.rate_limits;
CREATE POLICY "Service role manages rate limits"
ON public.rate_limits FOR ALL TO service_role
USING (true) WITH CHECK (true);
