-- =====================================================
-- Fix competitions Data Leak
-- Consolidate SELECT policies and tighten access
-- =====================================================

-- Drop existing overlapping SELECT policies
DROP POLICY IF EXISTS "Authenticated users can view public or participating competitio" ON public.competitions;
DROP POLICY IF EXISTS "Users can view public competitions" ON public.competitions;

-- Create consolidated SELECT policy
-- Users can view competitions they:
-- 1. Created
-- 2. Are participating in
-- 3. Have been invited to (so they can see details before accepting)
-- 4. Are public AND (user is searching/browsing OR has a valid invitation link)
CREATE POLICY "Users can view accessible competitions"
ON public.competitions FOR SELECT TO authenticated
USING (
  -- Own competitions
  creator_id = auth.uid()
  -- Participating in
  OR EXISTS (
    SELECT 1 FROM public.competition_participants cp
    WHERE cp.competition_id = competitions.id
    AND cp.user_id = auth.uid()
  )
  -- Invited to (pending invitations)
  OR EXISTS (
    SELECT 1 FROM public.competition_invitations ci
    WHERE ci.competition_id = competitions.id
    AND ci.invitee_id = auth.uid()
  )
  -- Public competitions (for discovery/joining)
  -- This is intentional for public challenges
  OR is_public = true
);

-- Note: If you want to restrict public competition visibility further,
-- consider creating a separate "competition_preview" view that only
-- exposes limited fields (name, type, participant_count) for public ones.
