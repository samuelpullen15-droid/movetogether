-- =====================================================
-- Fix Infinite Recursion Between competitions and competition_participants
-- The two tables' RLS policies were querying each other, causing infinite recursion
-- =====================================================

-- 1. Create helper function to check if competition is public
-- This breaks the competition_participants → competitions recursion
-- =====================================================
CREATE OR REPLACE FUNCTION public.competition_is_public(p_competition_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_public FROM competitions WHERE id = p_competition_id),
    false
  );
$$;

-- 2. Create helper function to check if user is competition creator
-- =====================================================
CREATE OR REPLACE FUNCTION public.user_is_competition_creator(p_competition_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM competitions
    WHERE id = p_competition_id
    AND creator_id = p_user_id
  );
$$;

-- 3. Drop and recreate competition_participants SELECT policy
-- Use SECURITY DEFINER function for is_public check
-- =====================================================
DROP POLICY IF EXISTS "Users can view participants in their competitions" ON public.competition_participants;

CREATE POLICY "Users can view participants in their competitions"
ON public.competition_participants FOR SELECT TO authenticated
USING (
  -- Can always see own participation
  user_id = auth.uid()
  -- Or can see if in same competition (using SECURITY DEFINER function to avoid recursion)
  OR public.user_is_in_competition(competition_id, auth.uid())
  -- Or can see if competition is public (using SECURITY DEFINER function to avoid recursion)
  OR public.competition_is_public(competition_id)
);

-- 4. Drop and recreate competitions SELECT policy
-- Use SECURITY DEFINER function for participant check
-- =====================================================
DROP POLICY IF EXISTS "Users can view accessible competitions" ON public.competitions;
DROP POLICY IF EXISTS "Authenticated users can view public or participating competitions" ON public.competitions;
DROP POLICY IF EXISTS "Users can view competitions they created or participate in" ON public.competitions;

CREATE POLICY "Users can view accessible competitions"
ON public.competitions FOR SELECT TO authenticated
USING (
  -- Can view if creator
  creator_id = auth.uid()
  -- Can view if participant (using SECURITY DEFINER function to avoid recursion)
  OR public.user_is_in_competition(id, auth.uid())
  -- Can view if invited
  OR EXISTS (
    SELECT 1 FROM public.competition_invitations ci
    WHERE ci.competition_id = competitions.id
    AND ci.invitee_id = auth.uid()
  )
  -- Can view if public
  OR is_public = true
);

-- 5. Grant execute on new helper functions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.competition_is_public(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.competition_is_public(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_is_competition_creator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_competition_creator(UUID, UUID) TO service_role;
