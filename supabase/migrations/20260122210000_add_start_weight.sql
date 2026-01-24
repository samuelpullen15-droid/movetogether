-- Add start_weight column to user_fitness table
-- This allows users to manually set their starting weight for weight loss tracking

ALTER TABLE public.user_fitness
ADD COLUMN IF NOT EXISTS start_weight numeric(5,2);

-- Add a comment for documentation
COMMENT ON COLUMN public.user_fitness.start_weight IS 'User-defined starting weight for weight loss progress tracking (in lbs)';
