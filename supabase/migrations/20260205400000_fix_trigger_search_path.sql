-- Fix trigger_update_participant_totals and update_participant_totals functions
-- Both have SET search_path TO '' which prevents resolving unqualified function names.
-- The trigger calls update_participant_totals without public. prefix,
-- and update_participant_totals calls calculate_participant_points without public. prefix.

-- Fix 1: Recreate trigger function with search_path = public
CREATE OR REPLACE FUNCTION "public"."trigger_update_participant_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
  PERFORM public.update_participant_totals(NEW.participant_id);
  RETURN NEW;
END;
$$;

-- Fix 2: Recreate update_participant_totals with search_path = public
-- so calculate_participant_points resolves correctly
CREATE OR REPLACE FUNCTION "public"."update_participant_totals"("p_participant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_competition_id UUID;
  v_user_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_total_move INTEGER := 0;
  v_total_exercise INTEGER := 0;
  v_total_stand INTEGER := 0;
  v_total_steps INTEGER := 0;
  v_move_progress NUMERIC := 0;
  v_exercise_progress NUMERIC := 0;
  v_stand_progress NUMERIC := 0;
  v_move_goal INTEGER := 400;
  v_exercise_goal INTEGER := 30;
  v_stand_goal INTEGER := 12;
  v_days_count INTEGER;
  v_avg_move NUMERIC;
  v_avg_exercise NUMERIC;
  v_avg_stand NUMERIC;
  v_total_points NUMERIC;
BEGIN
  SELECT competition_id, user_id INTO v_competition_id, v_user_id
  FROM public.competition_participants
  WHERE id = p_participant_id;

  SELECT start_date, end_date INTO v_start_date, v_end_date
  FROM public.competitions
  WHERE id = v_competition_id;

  BEGIN
    SELECT
      COALESCE(move_goal, 400),
      COALESCE(exercise_goal, 30),
      COALESCE(stand_goal, 12)
    INTO v_move_goal, v_exercise_goal, v_stand_goal
    FROM public.user_fitness
    WHERE user_id = v_user_id
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_move_goal := 400;
    v_exercise_goal := 30;
    v_stand_goal := 12;
  END;

  SELECT
    COALESCE(SUM(move_calories), 0)::INTEGER,
    COALESCE(SUM(exercise_minutes), 0)::INTEGER,
    COALESCE(SUM(stand_hours), 0)::INTEGER,
    COALESCE(SUM(step_count), 0)::INTEGER
  INTO v_total_move, v_total_exercise, v_total_stand, v_total_steps
  FROM public.competition_daily_data
  WHERE participant_id = p_participant_id
    AND date >= v_start_date
    AND date <= v_end_date;

  SELECT COUNT(DISTINCT date) INTO v_days_count
  FROM public.competition_daily_data
  WHERE participant_id = p_participant_id
    AND date >= v_start_date
    AND date <= v_end_date;

  IF v_days_count > 0 THEN
    v_avg_move := (v_total_move::NUMERIC / v_days_count) / NULLIF(v_move_goal, 0);
    v_avg_exercise := (v_total_exercise::NUMERIC / v_days_count) / NULLIF(v_exercise_goal, 0);
    v_avg_stand := (v_total_stand::NUMERIC / v_days_count) / NULLIF(v_stand_goal, 0);
  END IF;

  v_move_progress := COALESCE(v_avg_move, 0);
  v_exercise_progress := COALESCE(v_avg_exercise, 0);
  v_stand_progress := COALESCE(v_avg_stand, 0);

  SELECT public.calculate_participant_points(v_competition_id, v_user_id, v_start_date, v_end_date) INTO v_total_points;

  UPDATE public.competition_participants
  SET
    total_points = v_total_points,
    move_calories = v_total_move,
    exercise_minutes = v_total_exercise,
    stand_hours = v_total_stand,
    step_count = v_total_steps,
    move_progress = v_move_progress,
    exercise_progress = v_exercise_progress,
    stand_progress = v_stand_progress,
    last_sync_at = NOW()
  WHERE id = p_participant_id;
END;
$$;

-- Maintain security: only service_role should call these
REVOKE EXECUTE ON FUNCTION public.trigger_update_participant_totals() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_update_participant_totals() TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_participant_totals(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_participant_totals(uuid) TO service_role;
