-- Migration: Secure competition join/leave with RLS policies and validation

-- ============================================
-- 1. Update accept_competition_invitation function with validation
-- ============================================
CREATE OR REPLACE FUNCTION "public"."accept_competition_invitation"("p_invitation_id" "uuid") 
RETURNS boolean
LANGUAGE "plpgsql" 
SECURITY DEFINER
AS $$
DECLARE
  v_competition_id UUID;
  v_invitee_id UUID;
  v_participant_exists BOOLEAN;
  v_competition_status TEXT;
  v_competition_is_public BOOLEAN;
  v_competition_creator_id UUID;
BEGIN
  -- Get invitation details and verify it's for the current user
  SELECT 
    ci.competition_id, 
    ci.invitee_id,
    c.status,
    c.is_public,
    c.creator_id
  INTO 
    v_competition_id, 
    v_invitee_id,
    v_competition_status,
    v_competition_is_public,
    v_competition_creator_id
  FROM public.competition_invitations ci
  INNER JOIN public.competitions c ON c.id = ci.competition_id
  WHERE ci.id = p_invitation_id
    AND ci.status = 'pending'
    AND ci.invitee_id = auth.uid();

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Validation: Cannot join competitions that have already completed
  -- Allow joining 'upcoming' or 'active' competitions (not 'completed')
  IF v_competition_status = 'completed' THEN
    RETURN FALSE;
  END IF;

  -- Check if participant already exists
  SELECT EXISTS(
    SELECT 1 FROM public.competition_participants
    WHERE competition_id = v_competition_id
      AND user_id = v_invitee_id
  ) INTO v_participant_exists;

  IF v_participant_exists THEN
    -- If already a participant, just mark invitation as accepted
    UPDATE public.competition_invitations
    SET status = 'accepted', responded_at = NOW()
    WHERE id = p_invitation_id;
    RETURN TRUE;
  END IF;

  -- Add user as participant
  INSERT INTO public.competition_participants (competition_id, user_id)
  VALUES (v_competition_id, v_invitee_id);

  -- Update invitation status
  UPDATE public.competition_invitations
  SET status = 'accepted', responded_at = NOW()
  WHERE id = p_invitation_id;

  RETURN TRUE;
END;
$$;

-- ============================================
-- 2. Create function to join public competition
-- ============================================
CREATE OR REPLACE FUNCTION "public"."join_public_competition"("p_competition_id" "uuid") 
RETURNS boolean
LANGUAGE "plpgsql" 
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_competition_status TEXT;
  v_competition_is_public BOOLEAN;
  v_participant_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get competition details
  SELECT status, is_public
  INTO v_competition_status, v_competition_is_public
  FROM public.competitions
  WHERE id = p_competition_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Validation: Must be public competition
  IF NOT v_competition_is_public THEN
    RETURN FALSE;
  END IF;

  -- Validation: Cannot join competitions that have already completed
  -- Allow joining 'upcoming' or 'active' competitions (not 'completed')
  IF v_competition_status = 'completed' THEN
    RETURN FALSE;
  END IF;

  -- Check if already a participant
  SELECT EXISTS(
    SELECT 1 FROM public.competition_participants
    WHERE competition_id = p_competition_id
      AND user_id = v_user_id
  ) INTO v_participant_exists;

  IF v_participant_exists THEN
    RETURN FALSE; -- Already a participant
  END IF;

  -- Add user as participant
  INSERT INTO public.competition_participants (competition_id, user_id)
  VALUES (p_competition_id, v_user_id);

  RETURN TRUE;
END;
$$;

-- ============================================
-- 3. RLS Policies for competition_participants
-- ============================================

-- Enable RLS if not already enabled
ALTER TABLE "public"."competition_participants" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only insert (join) if:
-- 1. They are the competition creator (always allowed)
-- 2. Competition is public OR they have a pending invitation
-- 3. Competition status is 'upcoming' or 'active' (not 'completed')
-- 4. They're not already a participant (checked via function to avoid recursion)
DROP POLICY IF EXISTS "Users can join competitions with invitation or public" ON competition_participants;
CREATE POLICY "Users can join competitions with invitation or public"
ON "public"."competition_participants"
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    -- Allow if user is the competition creator (always allowed)
    EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_id
        AND c.creator_id = auth.uid()
    )
    OR
    (
      -- Public competition that is upcoming or active
      EXISTS (
        SELECT 1 FROM public.competitions c
        WHERE c.id = competition_id
          AND c.is_public = true
          AND (c.status = 'upcoming' OR c.status = 'active')
      )
      OR
      -- Has pending invitation
      EXISTS (
        SELECT 1 FROM public.competition_invitations ci
        WHERE ci.competition_id = competition_participants.competition_id
          AND ci.invitee_id = auth.uid()
          AND ci.status = 'pending'
      )
    )
  )
);

-- Policy: Users can only delete (leave) their own participation
-- Additional validation happens in Edge Function (subscription check, creator check)
DROP POLICY IF EXISTS "Users can leave competitions they joined" ON competition_participants;
CREATE POLICY "Users can leave competitions they joined"
ON "public"."competition_participants"
FOR DELETE
USING (auth.uid() = user_id);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION "public"."join_public_competition"("uuid") TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."accept_competition_invitation"("uuid") TO authenticated;

COMMENT ON FUNCTION "public"."join_public_competition"("uuid") IS 'Allows users to join public competitions that are upcoming or active';
COMMENT ON FUNCTION "public"."accept_competition_invitation"("uuid") IS 'Accepts a competition invitation and adds user as participant with validation';
