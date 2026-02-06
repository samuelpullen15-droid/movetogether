-- =====================================================
-- FIX: Rate limit trigger references wrong column name
--
-- The check_user_activity_rate_limit trigger was referencing
-- 'created_at' but the user_activity table uses 'synced_at'
-- =====================================================

CREATE OR REPLACE FUNCTION "public"."check_user_activity_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_max_inserts_per_hour INTEGER := 100;  -- Max 100 activity records per hour
  v_max_per_day INTEGER := 500;  -- Max 500 activity records per day
  v_hourly_count INTEGER;
  v_daily_count INTEGER;
  v_last_insert TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '1 second';  -- Min 1 second between inserts
BEGIN
  -- Service role bypasses rate limits (used by Edge Functions)
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Check hourly rate limit (using synced_at, not created_at)
  SELECT COUNT(*), MAX(synced_at)
  INTO v_hourly_count, v_last_insert
  FROM public.user_activity
  WHERE user_id = NEW.user_id
    AND synced_at > NOW() - INTERVAL '1 hour';

  IF v_hourly_count >= v_max_inserts_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % activity records per hour', v_max_inserts_per_hour
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if inserting too quickly
  IF v_last_insert IS NOT NULL AND v_last_insert > NOW() - v_min_interval THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before adding another activity record'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check daily rate limit (using synced_at, not created_at)
  SELECT COUNT(*)
  INTO v_daily_count
  FROM public.user_activity
  WHERE user_id = NEW.user_id
    AND synced_at > NOW() - INTERVAL '1 day';

  IF v_daily_count >= v_max_per_day THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % activity records per day', v_max_per_day
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- Also fix the update rate limit trigger
CREATE OR REPLACE FUNCTION "public"."check_user_activity_update_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_max_updates_per_hour INTEGER := 200;  -- Max 200 updates per hour
  v_update_count INTEGER;
BEGIN
  -- Service role bypasses rate limits (used by Edge Functions)
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Count recent updates for this user (using synced_at)
  SELECT COUNT(*)
  INTO v_update_count
  FROM public.user_activity
  WHERE user_id = NEW.user_id
    AND synced_at > NOW() - INTERVAL '1 hour';

  IF v_update_count >= v_max_updates_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % activity updates per hour', v_max_updates_per_hour
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
