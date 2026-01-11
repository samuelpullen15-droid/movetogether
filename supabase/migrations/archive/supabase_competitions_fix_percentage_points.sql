-- Fix percentage scoring to use whole numbers only (1 point per 1%)
-- Update the calculate_participant_points function to round percentage points to integers

CREATE OR REPLACE FUNCTION calculate_participant_points(
  p_competition_id UUID,
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS NUMERIC AS $$
DECLARE
  v_scoring_type TEXT;
  v_scoring_config JSONB;
  v_total_points NUMERIC := 0;
  v_daily_data RECORD;
  v_move_goal INTEGER;
  v_exercise_goal INTEGER;
  v_stand_goal INTEGER;
BEGIN
  -- Get competition scoring type
  SELECT scoring_type, scoring_config INTO v_scoring_type, v_scoring_config
  FROM public.competitions
  WHERE id = p_competition_id;

  -- Get user goals once for percentage calculation
  SELECT COALESCE(move_goal, 400), COALESCE(exercise_goal, 30), COALESCE(stand_goal, 12)
  INTO v_move_goal, v_exercise_goal, v_stand_goal
  FROM public.user_fitness
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Aggregate points from daily data based on scoring type
  FOR v_daily_data IN
    SELECT * FROM public.competition_daily_data
    WHERE competition_id = p_competition_id
      AND user_id = p_user_id
      AND date >= p_start_date
      AND date <= p_end_date
    ORDER BY date
  LOOP
    CASE v_scoring_type
      WHEN 'ring_close' THEN
        -- 1 point per ring closed (move, exercise, stand)
        v_total_points := v_total_points + 
          CASE WHEN v_daily_data.move_calories > 0 THEN 1 ELSE 0 END +
          CASE WHEN v_daily_data.exercise_minutes > 0 THEN 1 ELSE 0 END +
          CASE WHEN v_daily_data.stand_hours > 0 THEN 1 ELSE 0 END;
      
      WHEN 'percentage' THEN
        -- Points based on percentage of goals (rounded to nearest integer, 1 point per 1%)
        -- Each percentage is rounded to nearest integer before adding to ensure whole number points
        v_total_points := v_total_points +
          LEAST(ROUND((v_daily_data.move_calories::NUMERIC / NULLIF(v_move_goal, 0)) * 100)::INTEGER, 999) +
          LEAST(ROUND((v_daily_data.exercise_minutes::NUMERIC / NULLIF(v_exercise_goal, 0)) * 100)::INTEGER, 999) +
          LEAST(ROUND((v_daily_data.stand_hours::NUMERIC / NULLIF(v_stand_goal, 0)) * 100)::INTEGER, 999);
      
      WHEN 'raw_numbers' THEN
        -- 1 point per calorie, minute, and hour
        v_total_points := v_total_points +
          COALESCE(v_daily_data.move_calories, 0) +
          COALESCE(v_daily_data.exercise_minutes, 0) +
          COALESCE(v_daily_data.stand_hours, 0);
      
      WHEN 'step_count' THEN
        -- 1 point per step
        v_total_points := v_total_points + COALESCE(v_daily_data.step_count, 0);
      
      WHEN 'workout' THEN
        -- Points based on workout metric (stored in daily_data.points)
        v_total_points := v_total_points + COALESCE(v_daily_data.points, 0);
      
      ELSE
        -- Default to ring_close
        v_total_points := v_total_points +
          CASE WHEN v_daily_data.move_calories > 0 THEN 1 ELSE 0 END +
          CASE WHEN v_daily_data.exercise_minutes > 0 THEN 1 ELSE 0 END +
          CASE WHEN v_daily_data.stand_hours > 0 THEN 1 ELSE 0 END;
    END CASE;
  END LOOP;

  -- For percentage scoring, ensure final result is a whole number
  IF v_scoring_type = 'percentage' THEN
    RETURN ROUND(v_total_points)::INTEGER;
  END IF;

  RETURN COALESCE(v_total_points, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate all participant points for competitions with percentage scoring
-- This will update existing competitions to have whole number points
UPDATE public.competition_participants cp
SET total_points = (
  SELECT calculate_participant_points(
    cp.competition_id,
    cp.user_id,
    c.start_date,
    c.end_date
  )
  FROM public.competitions c
  WHERE c.id = cp.competition_id
  AND c.scoring_type = 'percentage'
)
WHERE EXISTS (
  SELECT 1
  FROM public.competitions c
  WHERE c.id = cp.competition_id
  AND c.scoring_type = 'percentage'
);
