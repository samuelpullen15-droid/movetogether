-- ============================================
-- Create user_fitness table for storing user fitness goals and data
-- ============================================

-- Create the table
CREATE TABLE IF NOT EXISTS public.user_fitness (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  move_goal INTEGER NOT NULL DEFAULT 500,
  exercise_goal INTEGER NOT NULL DEFAULT 30,
  stand_goal INTEGER NOT NULL DEFAULT 12,
  height NUMERIC(5, 2) NULL, -- in cm or inches
  weight NUMERIC(5, 2) NULL, -- in kg or lbs
  target_weight NUMERIC(5, 2) NULL, -- weight goal in kg or lbs
  age INTEGER NULL,
  gender TEXT NULL CHECK (gender IN ('male', 'female', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one row per user
  UNIQUE(user_id)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_fitness_user_id ON public.user_fitness(user_id);

-- Enable Row Level Security
ALTER TABLE public.user_fitness ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Row Level Security Policies
-- ============================================

-- Policy: Users can read their own fitness data
CREATE POLICY "Users can read own fitness data"
ON public.user_fitness
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own fitness data
CREATE POLICY "Users can insert own fitness data"
ON public.user_fitness
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own fitness data
CREATE POLICY "Users can update own fitness data"
ON public.user_fitness
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own fitness data
CREATE POLICY "Users can delete own fitness data"
ON public.user_fitness
FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- Function to automatically update updated_at timestamp
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_user_fitness_updated_at
  BEFORE UPDATE ON public.user_fitness
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
