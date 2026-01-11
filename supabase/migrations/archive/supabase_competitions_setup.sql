-- ============================================
-- Competitions Table Setup
-- ============================================

-- Create competitions table
CREATE TABLE IF NOT EXISTS public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('weekend', 'weekly', 'monthly', 'custom')),
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
  scoring_type TEXT NOT NULL DEFAULT 'ring_close' CHECK (scoring_type IN ('ring_close', 'percentage', 'raw_numbers', 'step_count', 'workout')),
  scoring_config JSONB, -- For workout scoring: { workoutTypes: [], workoutMetric: '' }
  is_public BOOLEAN NOT NULL DEFAULT false,
  repeat_option TEXT NOT NULL DEFAULT 'none' CHECK (repeat_option IN ('none', 'weekly', 'biweekly', 'monthly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create competition_participants table
CREATE TABLE IF NOT EXISTS public.competition_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  -- Metrics for the competition period (aggregated from daily data)
  total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  move_calories INTEGER DEFAULT 0,
  exercise_minutes INTEGER DEFAULT 0,
  stand_hours INTEGER DEFAULT 0,
  step_count INTEGER DEFAULT 0,
  -- Progress percentages (0-1)
  move_progress NUMERIC(5, 4) DEFAULT 0,
  exercise_progress NUMERIC(5, 4) DEFAULT 0,
  stand_progress NUMERIC(5, 4) DEFAULT 0,
  UNIQUE(competition_id, user_id)
);

-- Create competition_daily_data table to store daily metrics for each participant
CREATE TABLE IF NOT EXISTS public.competition_daily_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.competition_participants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  move_calories INTEGER DEFAULT 0,
  exercise_minutes INTEGER DEFAULT 0,
  stand_hours INTEGER DEFAULT 0,
  step_count INTEGER DEFAULT 0,
  distance_meters NUMERIC(10, 2) DEFAULT 0,
  workouts_completed INTEGER DEFAULT 0,
  points NUMERIC(10, 2) DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competition_id, user_id, date)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_competitions_creator_id ON public.competitions(creator_id);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON public.competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_dates ON public.competitions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_competition_participants_competition_id ON public.competition_participants(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_participants_user_id ON public.competition_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_competition_participants_points ON public.competition_participants(competition_id, total_points DESC);
CREATE INDEX IF NOT EXISTS idx_competition_daily_data_competition_user_date ON public.competition_daily_data(competition_id, user_id, date);
CREATE INDEX IF NOT EXISTS idx_competition_daily_data_participant ON public.competition_daily_data(participant_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for competitions updated_at
DROP TRIGGER IF EXISTS update_competitions_updated_at ON public.competitions;
CREATE TRIGGER update_competitions_updated_at
  BEFORE UPDATE ON public.competitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Create helper function BEFORE policies to avoid infinite recursion
-- This function uses SECURITY DEFINER to bypass RLS when checking participation
CREATE OR REPLACE FUNCTION public.user_is_competition_participant(p_competition_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- SECURITY DEFINER allows bypassing RLS to check participation
  RETURN EXISTS (
    SELECT 1 FROM public.competition_participants
    WHERE competition_id = p_competition_id
    AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_daily_data ENABLE ROW LEVEL SECURITY;

-- Competitions policies
DROP POLICY IF EXISTS "Users can view public competitions" ON public.competitions;
CREATE POLICY "Users can view public competitions" ON public.competitions
  FOR SELECT
  USING (
    is_public = true OR 
    creator_id = auth.uid() OR 
    public.user_is_competition_participant(competitions.id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can create competitions" ON public.competitions;
CREATE POLICY "Users can create competitions" ON public.competitions
  FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can update their competitions" ON public.competitions;
CREATE POLICY "Creators can update their competitions" ON public.competitions
  FOR UPDATE
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can delete their competitions" ON public.competitions;
CREATE POLICY "Creators can delete their competitions" ON public.competitions
  FOR DELETE
  USING (auth.uid() = creator_id);

-- Competition participants policies
DROP POLICY IF EXISTS "Users can view participants in competitions they're in or public competitions" ON public.competition_participants;
CREATE POLICY "Users can view participants in competitions they're in or public competitions" ON public.competition_participants
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    public.user_is_competition_participant(competition_id, auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_participants.competition_id
      AND c.is_public = true
    ) OR
    EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_participants.competition_id
      AND c.creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can join competitions" ON public.competition_participants;
CREATE POLICY "Users can join competitions" ON public.competition_participants
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own participation" ON public.competition_participants;
CREATE POLICY "Users can update their own participation" ON public.competition_participants
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave competitions" ON public.competition_participants;
CREATE POLICY "Users can leave competitions" ON public.competition_participants
  FOR DELETE
  USING (auth.uid() = user_id);

-- Competition daily data policies
DROP POLICY IF EXISTS "Users can view daily data for competitions they're in" ON public.competition_daily_data;
CREATE POLICY "Users can view daily data for competitions they're in" ON public.competition_daily_data
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    public.user_is_competition_participant(competition_id, auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_daily_data.competition_id
      AND (c.is_public = true OR c.creator_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert their own daily data" ON public.competition_daily_data;
CREATE POLICY "Users can insert their own daily data" ON public.competition_daily_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own daily data" ON public.competition_daily_data;
CREATE POLICY "Users can update their own daily data" ON public.competition_daily_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Helper Functions
-- ============================================

-- Function to calculate participant points based on scoring type
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

  RETURN COALESCE(v_total_points, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update participant totals from daily data
CREATE OR REPLACE FUNCTION update_participant_totals(p_participant_id UUID)
RETURNS VOID AS $$
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
  v_move_goal INTEGER;
  v_exercise_goal INTEGER;
  v_stand_goal INTEGER;
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

  -- Get user goals
  SELECT COALESCE(move_goal, 400), COALESCE(exercise_goal, 30), COALESCE(stand_goal, 12)
  INTO v_move_goal, v_exercise_goal, v_stand_goal
  FROM public.user_fitness
  WHERE user_id = v_user_id
  LIMIT 1;

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

  -- Update participant totals
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update participant totals when daily data is inserted/updated
CREATE OR REPLACE FUNCTION trigger_update_participant_totals()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_participant_totals(NEW.participant_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_participant_totals_trigger ON public.competition_daily_data;
CREATE TRIGGER update_participant_totals_trigger
  AFTER INSERT OR UPDATE ON public.competition_daily_data
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_participant_totals();

-- Function to update competition status based on dates
CREATE OR REPLACE FUNCTION update_competition_status()
RETURNS VOID AS $$
BEGIN
  UPDATE public.competitions
  SET status = CASE
    WHEN end_date < CURRENT_DATE THEN 'completed'
    WHEN start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE THEN 'active'
    ELSE 'upcoming'
  END
  WHERE status != 'completed' OR (end_date >= CURRENT_DATE - INTERVAL '1 day');
END;
$$ LANGUAGE plpgsql;

-- Run status update on insert/update
CREATE OR REPLACE FUNCTION trigger_update_competition_status()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_competition_status();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_competition_status_trigger ON public.competitions;
CREATE TRIGGER update_competition_status_trigger
  AFTER INSERT OR UPDATE OF start_date, end_date ON public.competitions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_competition_status();