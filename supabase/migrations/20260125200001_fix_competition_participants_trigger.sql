-- =====================================================
-- Fix competition_participants trigger issue
-- The update_updated_at_column trigger was applied to competition_participants
-- but the table doesn't have an updated_at column
-- =====================================================

-- Drop the errant trigger if it exists
DROP TRIGGER IF EXISTS update_competition_participants_updated_at ON public.competition_participants;

-- Also check for any other possible trigger names
DROP TRIGGER IF EXISTS competition_participants_updated_at ON public.competition_participants;
DROP TRIGGER IF EXISTS update_participants_updated_at ON public.competition_participants;

-- Log that we've cleaned up
DO $$
BEGIN
  RAISE NOTICE 'Dropped any updated_at triggers from competition_participants table';
END $$;
