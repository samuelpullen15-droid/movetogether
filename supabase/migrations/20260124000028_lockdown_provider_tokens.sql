-- =====================================================
-- Lock Down provider_tokens Writes
-- Tokens should only be written by server after OAuth validation
-- Prevents token injection attacks
-- Wrapped in existence check for idempotency
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_tokens' AND table_schema = 'public') THEN
    -- Drop user write policies
    DROP POLICY IF EXISTS "Users can insert own provider tokens" ON public.provider_tokens;
    DROP POLICY IF EXISTS "Users can update own provider tokens" ON public.provider_tokens;
    DROP POLICY IF EXISTS "Users can delete own provider tokens" ON public.provider_tokens;

    -- Keep SELECT for users to check their connection status
    -- (already exists: "Users can view own provider tokens")

    -- All writes go through service_role only
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'provider_tokens'
      AND policyname = 'Service role manages provider tokens'
    ) THEN
      CREATE POLICY "Service role manages provider tokens"
      ON public.provider_tokens FOR ALL TO service_role
      USING (true) WITH CHECK (true);
    END IF;

    -- Revoke direct write access
    REVOKE INSERT, UPDATE, DELETE ON public.provider_tokens FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.provider_tokens FROM anon;
  END IF;
END $$;
