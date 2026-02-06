-- =====================================================
-- Fix remaining policy inconsistencies
-- Ensure all policies explicitly target authenticated role
-- Wrapped in existence checks for idempotency
-- =====================================================

-- notification_preferences DELETE - add TO authenticated
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Users can delete own notification preferences" ON public.notification_preferences;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'notification_preferences'
      AND policyname = 'Users can delete own notification preferences'
    ) THEN
      CREATE POLICY "Users can delete own notification preferences"
      ON public.notification_preferences FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
    END IF;
  END IF;
END $$;

-- provider_tokens - recreate to ensure consistency
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_tokens' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Users can insert own provider tokens" ON public.provider_tokens;
    DROP POLICY IF EXISTS "Users can update own provider tokens" ON public.provider_tokens;
    DROP POLICY IF EXISTS "Users can delete own provider tokens" ON public.provider_tokens;
    DROP POLICY IF EXISTS "Users can view own provider tokens" ON public.provider_tokens;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'provider_tokens' AND policyname = 'Users can view own provider tokens'
    ) THEN
      CREATE POLICY "Users can view own provider tokens"
      ON public.provider_tokens FOR SELECT TO authenticated
      USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'provider_tokens' AND policyname = 'Users can insert own provider tokens'
    ) THEN
      CREATE POLICY "Users can insert own provider tokens"
      ON public.provider_tokens FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'provider_tokens' AND policyname = 'Users can update own provider tokens'
    ) THEN
      CREATE POLICY "Users can update own provider tokens"
      ON public.provider_tokens FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'provider_tokens' AND policyname = 'Users can delete own provider tokens'
    ) THEN
      CREATE POLICY "Users can delete own provider tokens"
      ON public.provider_tokens FOR DELETE TO authenticated
      USING (user_id = auth.uid());
    END IF;
  END IF;
END $$;

-- notification_preferences - recreate to ensure consistency
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
    DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
    DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'notification_preferences' AND policyname = 'Users can view own notification preferences'
    ) THEN
      CREATE POLICY "Users can view own notification preferences"
      ON public.notification_preferences FOR SELECT TO authenticated
      USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'notification_preferences' AND policyname = 'Users can insert own notification preferences'
    ) THEN
      CREATE POLICY "Users can insert own notification preferences"
      ON public.notification_preferences FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'notification_preferences' AND policyname = 'Users can update own notification preferences'
    ) THEN
      CREATE POLICY "Users can update own notification preferences"
      ON public.notification_preferences FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
    END IF;
  END IF;
END $$;
