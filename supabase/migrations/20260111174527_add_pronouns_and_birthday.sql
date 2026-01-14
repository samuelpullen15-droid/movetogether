-- Add pronouns and birthday columns to user_fitness table

-- Add pronouns column
ALTER TABLE public.user_fitness
ADD COLUMN IF NOT EXISTS pronouns TEXT;

-- Add birthday column (date of birth)
ALTER TABLE public.user_fitness
ADD COLUMN IF NOT EXISTS birthday DATE;

-- Add comment to clarify the difference between gender and pronouns
COMMENT ON COLUMN public.user_fitness.gender IS 'Legacy field - use pronouns column instead. Gender values: male, female, other';
COMMENT ON COLUMN public.user_fitness.pronouns IS 'User preferred pronouns (e.g., he/him, she/her, they/them, other, prefer not to say)';
