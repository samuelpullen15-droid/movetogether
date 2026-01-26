-- =====================================================
-- Rate Limit provider_tokens Writes
-- Prevent spam/DoS attacks - users should only have 1-2 provider tokens
-- =====================================================

-- 1. Add rate limiting trigger for provider_tokens
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_provider_tokens_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_tokens INTEGER := 5;  -- Max 5 provider tokens per user (generous limit)
  v_current_count INTEGER;
  v_last_insert TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '10 seconds';  -- Min 10 seconds between inserts
BEGIN
  -- Check total count for this user
  SELECT COUNT(*), MAX(created_at)
  INTO v_current_count, v_last_insert
  FROM public.provider_tokens
  WHERE user_id = NEW.user_id;

  -- Check if user has too many tokens
  IF v_current_count >= v_max_tokens THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % provider tokens allowed per user', v_max_tokens
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if inserting too quickly
  IF v_last_insert IS NOT NULL AND v_last_insert > NOW() - v_min_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before adding another provider token'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create trigger (only if table exists)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'provider_tokens') THEN
    DROP TRIGGER IF EXISTS check_provider_tokens_rate_limit_trigger ON public.provider_tokens;
    CREATE TRIGGER check_provider_tokens_rate_limit_trigger
      BEFORE INSERT ON public.provider_tokens
      FOR EACH ROW EXECUTE FUNCTION public.check_provider_tokens_rate_limit();
  END IF;
END $$;

-- 3. Also limit update frequency
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_provider_tokens_update_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_interval INTERVAL := INTERVAL '1 second';  -- Min 1 second between updates
BEGIN
  -- Check if updating too quickly
  IF OLD.updated_at IS NOT NULL AND OLD.updated_at > NOW() - v_min_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before updating provider token'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'provider_tokens') THEN
    -- Check if updated_at column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'provider_tokens'
        AND column_name = 'updated_at'
    ) THEN
      DROP TRIGGER IF EXISTS check_provider_tokens_update_rate_limit_trigger ON public.provider_tokens;
      CREATE TRIGGER check_provider_tokens_update_rate_limit_trigger
        BEFORE UPDATE ON public.provider_tokens
        FOR EACH ROW EXECUTE FUNCTION public.check_provider_tokens_update_rate_limit();
    END IF;
  END IF;
END $$;
