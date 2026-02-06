-- =====================================================
-- Consolidate INSERT Policies
-- Remove duplicate policies that bypass validation
-- Wrapped in existence checks for idempotency
-- =====================================================

-- 1. friendships - keep only the one with full validation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'friendships' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Users can create own friend requests" ON public.friendships;
    DROP POLICY IF EXISTS "Users can insert friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can send friend requests with privacy check" ON public.friendships;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'friendships'
      AND policyname = 'Users can send friend requests'
    ) THEN
      CREATE POLICY "Users can send friend requests"
      ON public.friendships FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND user_id <> friend_id
        AND public.can_send_friend_request(user_id, friend_id)
      );
    END IF;
  END IF;
END $$;

-- 2. user_fitness - ensure TO authenticated is set
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_fitness' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Users can insert own fitness data" ON public.user_fitness;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'user_fitness'
      AND policyname = 'Users can insert own fitness data'
    ) THEN
      CREATE POLICY "Users can insert own fitness data"
      ON public.user_fitness FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
    END IF;
  END IF;
END $$;

-- 3. privacy_settings - ensure TO authenticated is set
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_settings' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Users can insert own privacy settings" ON public.privacy_settings;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'privacy_settings'
      AND policyname = 'Users can insert own privacy settings'
    ) THEN
      CREATE POLICY "Users can insert own privacy settings"
      ON public.privacy_settings FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
    END IF;
  END IF;
END $$;

-- 4. activity_reactions - add validation that the activity exists and is viewable
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_reactions' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Users can add reactions" ON public.activity_reactions;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'activity_reactions'
      AND policyname = 'Users can add reactions'
    ) THEN
      CREATE POLICY "Users can add reactions"
      ON public.activity_reactions FOR INSERT TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.user_activity ua
          WHERE ua.id = activity_id
          AND (ua.user_id = auth.uid() OR public.can_view_profile(auth.uid(), ua.user_id))
        )
      );
    END IF;
  END IF;
END $$;
