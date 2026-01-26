-- =====================================================
-- Fix update_participant_totals function
-- Remove any reference to updated_at column which doesn't exist
-- on competition_participants table
-- Handle missing user_fitness data gracefully
-- =====================================================

CREATE OR REPLACE FUNCTION "public"."update_participant_totals"("p_participant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
  v_move_goal INTEGER := 400;  -- Default
  v_exercise_goal INTEGER := 30;  -- Default
  v_stand_goal INTEGER := 12;  -- Default
  v_days_count INTEGER;
  v_avg_move NUMERIC;
  v_avg_exercise NUMERIC;
  v_avg_stand NUMERIC;
  v_total_points NUMERIC;
BEGIN
  -- Get participant info
  SELECT competition_id, user_id INTO v_competition_id, v_user_id
  FROM public.competition_participants
  WHERE id = p_participant_id;

  -- Get competition dates
  SELECT start_date, end_date INTO v_start_date, v_end_date
  FROM public.competitions
  WHERE id = v_competition_id;

  -- Get user goals from user_fitness table
  -- Use a BEGIN/EXCEPTION block to handle cases where the table or columns don't exist
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
    -- If table/columns don't exist or any error, use defaults
    v_move_goal := 400;
    v_exercise_goal := 30;
    v_stand_goal := 12;
  END;

  -- Aggregate daily data
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

  -- Calculate progress percentages (average across all days in competition)
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

  -- Allow progress to exceed 1.0 (100%) to show when users exceed their goals
  v_move_progress := COALESCE(v_avg_move, 0);
  v_exercise_progress := COALESCE(v_avg_exercise, 0);
  v_stand_progress := COALESCE(v_avg_stand, 0);

  -- Calculate total points
  SELECT calculate_participant_points(v_competition_id, v_user_id, v_start_date, v_end_date) INTO v_total_points;

  -- Update participant totals (NO updated_at - column doesn't exist)
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
