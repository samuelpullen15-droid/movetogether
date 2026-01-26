-- =====================================================
-- Lock Down provider_tokens Writes
-- Tokens should only be written by server after OAuth validation
-- Prevents token injection attacks
-- =====================================================

-- Drop user write policies
DROP POLICY IF EXISTS "Users can insert own provider tokens" ON public.provider_tokens;
DROP POLICY IF EXISTS "Users can update own provider tokens" ON public.provider_tokens;
DROP POLICY IF EXISTS "Users can delete own provider tokens" ON public.provider_tokens;

-- Keep SELECT for users to check their connection status
-- (already exists: "Users can view own provider tokens")

-- All writes go through service_role only
CREATE POLICY "Service role manages provider tokens"
ON public.provider_tokens FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Revoke direct write access
REVOKE INSERT, UPDATE, DELETE ON public.provider_tokens FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.provider_tokens FROM anon;
