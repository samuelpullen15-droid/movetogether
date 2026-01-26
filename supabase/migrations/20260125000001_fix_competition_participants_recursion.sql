-- =====================================================
-- Fix Infinite Recursion in competition_participants RLS Policy
-- The previous policy queried competition_participants within itself,
-- causing infinite recursion during DELETE operations
-- =====================================================

-- 1. Drop the problematic policy
-- =====================================================
DROP POLICY IF EXISTS "Users can view participants in their competitions" ON public.competition_participants;
DROP POLICY IF EXISTS "Users can view participants in competitions they're in or publi" ON public.competition_participants;

-- 2. Create a helper function to avoid self-referencing in RLS policy
-- This function is SECURITY DEFINER so it bypasses RLS when checking participation
-- =====================================================
CREATE OR REPLACE FUNCTION public.user_is_in_competition(p_competition_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM competition_participants
    WHERE competition_id = p_competition_id
    AND user_id = p_user_id
  );
$$;

-- 3. Create non-recursive SELECT policy for competition_participants
-- =====================================================
CREATE POLICY "Users can view participants in their competitions"
ON public.competition_participants FOR SELECT TO authenticated
USING (
  -- Can always see own participation
  user_id = auth.uid()
  -- Or can see if in same competition (using SECURITY DEFINER function to avoid recursion)
  OR public.user_is_in_competition(competition_id, auth.uid())
  -- Or can see if competition is public
  OR EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = competition_participants.competition_id
    AND c.is_public = true
  )
);

-- 4. Ensure service role can always access (for Edge Functions)
-- =====================================================
DROP POLICY IF EXISTS "Service role full access to competition_participants" ON public.competition_participants;
CREATE POLICY "Service role full access to competition_participants"
ON public.competition_participants FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 5. Grant execute on helper function
-- =====================================================
GRANT EXECUTE ON FUNCTION public.user_is_in_competition(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_in_competition(UUID, UUID) TO service_role;
