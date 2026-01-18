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
AS $$
BEGIN
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

GRANT EXECUTE ON FUNCTION public.upsert_user_activity(UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_activity(UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.update_competition_standings(
  p_competition_id UUID,
  p_user_id UUID,
  p_date DATE,
  p_score NUMERIC,
  p_rings_closed INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_participant_id UUID;
  v_activity RECORD;
BEGIN
  SELECT id INTO v_participant_id
  FROM public.competition_participants
  WHERE competition_id = p_competition_id
    AND user_id = p_user_id;
  
  IF v_participant_id IS NULL THEN
    RETURN;
  END IF;
  
  SELECT 
    COALESCE(move_calories, 0) as move_calories,
    COALESCE(exercise_minutes, 0) as exercise_minutes,
    COALESCE(stand_hours, 0) as stand_hours,
    COALESCE(step_count, 0) as step_count,
    COALESCE(distance_meters, 0) as distance_meters,
    COALESCE(workouts_completed, 0) as workouts_completed
  INTO v_activity
  FROM public.user_activity
  WHERE user_id = p_user_id
    AND date = p_date;
  
  IF v_activity IS NULL THEN
    RETURN;
  END IF;
  
  INSERT INTO public.competition_daily_data (
    competition_id,
    participant_id,
    user_id,
    date,
    move_calories,
    exercise_minutes,
    stand_hours,
    step_count,
    distance_meters,
    workouts_completed,
    points,
    synced_at
  ) VALUES (
    p_competition_id,
    v_participant_id,
    p_user_id,
    p_date,
    v_activity.move_calories,
    v_activity.exercise_minutes,
    v_activity.stand_hours,
    v_activity.step_count,
    v_activity.distance_meters,
    v_activity.workouts_completed,
    p_score,
    NOW()
  )
  ON CONFLICT (competition_id, user_id, date)
  DO UPDATE SET
    move_calories = EXCLUDED.move_calories,
    exercise_minutes = EXCLUDED.exercise_minutes,
    stand_hours = EXCLUDED.stand_hours,
    step_count = EXCLUDED.step_count,
    distance_meters = EXCLUDED.distance_meters,
    workouts_completed = EXCLUDED.workouts_completed,
    points = EXCLUDED.points,
    synced_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_competition_standings(UUID, UUID, DATE, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_competition_standings(UUID, UUID, DATE, NUMERIC, INTEGER) TO service_role;
