-- =====================================================
-- FIX: Allow service_role to call upsert_user_activity
--
-- The upsert_user_activity function was blocking Edge Functions
-- that use service_role key because auth.uid() returns NULL.
--
-- This migration fixes that by:
-- 1. Checking if caller is service_role (trusted)
-- 2. Only enforcing auth.uid() check for regular users
-- =====================================================

CREATE OR REPLACE FUNCTION public.upsert_user_activity(
  p_user_id UUID,
  p_date DATE,
  p_move_calories INTEGER,
  p_exercise_minutes INTEGER,
  p_stand_hours INTEGER,
  p_step_count INTEGER,
  p_distance_meters NUMERIC DEFAULT 0,
  p_workouts_completed INTEGER DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Check if caller is service_role (trusted - used by Edge Functions)
  BEGIN
    v_role := current_setting('request.jwt.claims', true)::json->>'role';
  EXCEPTION
    WHEN OTHERS THEN
      v_role := NULL;
  END;

  -- Service role can bypass auth check (used by Edge Functions like calculate-daily-score)
  IF v_role = 'service_role' THEN
    -- Service role is trusted, proceed with upsert
    NULL;
  ELSE
    -- SECURITY: Verify caller owns this data (for regular authenticated users)
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF auth.uid() != p_user_id THEN
      RAISE EXCEPTION 'Cannot modify another user''s activity data';
    END IF;
  END IF;

  INSERT INTO public.user_activity (
    user_id,
    date,
    move_calories,
    exercise_minutes,
    stand_hours,
    step_count,
    distance_meters,
    workouts_completed,
    synced_at
  ) VALUES (
    p_user_id,
    p_date,
    p_move_calories,
    p_exercise_minutes,
    p_stand_hours,
    p_step_count,
    p_distance_meters,
    p_workouts_completed,
    NOW()
  )
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    move_calories = EXCLUDED.move_calories,
    exercise_minutes = EXCLUDED.exercise_minutes,
    stand_hours = EXCLUDED.stand_hours,
    step_count = EXCLUDED.step_count,
    distance_meters = EXCLUDED.distance_meters,
    workouts_completed = EXCLUDED.workouts_completed,
    synced_at = NOW();
END;
$$;

-- Ensure permissions are correct
GRANT EXECUTE ON FUNCTION public.upsert_user_activity(UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_activity(UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.upsert_user_activity(UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER) FROM anon;
