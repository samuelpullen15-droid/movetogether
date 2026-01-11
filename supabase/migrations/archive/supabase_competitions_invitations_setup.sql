-- Competition Invitations Setup
-- This allows invited users to accept/decline before joining competitions

-- Create competition_invitations table
CREATE TABLE IF NOT EXISTS public.competition_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(competition_id, invitee_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_competition_invitations_invitee ON public.competition_invitations(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_competition_invitations_competition ON public.competition_invitations(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_invitations_status ON public.competition_invitations(status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.competition_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for competition_invitations
DROP POLICY IF EXISTS "Users can view their own invitations" ON public.competition_invitations;
CREATE POLICY "Users can view their own invitations" ON public.competition_invitations
  FOR SELECT
  USING (invitee_id = auth.uid() OR inviter_id = auth.uid());

DROP POLICY IF EXISTS "Competition creators can send invitations" ON public.competition_invitations;
CREATE POLICY "Competition creators can send invitations" ON public.competition_invitations
  FOR INSERT
  WITH CHECK (
    inviter_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.competitions
      WHERE id = competition_id
      AND creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Invitees can respond to invitations" ON public.competition_invitations;
CREATE POLICY "Invitees can respond to invitations" ON public.competition_invitations
  FOR UPDATE
  USING (invitee_id = auth.uid() AND status = 'pending')
  WITH CHECK (invitee_id = auth.uid());

-- Function to accept an invitation (creates participant and updates invitation status)
CREATE OR REPLACE FUNCTION accept_competition_invitation(p_invitation_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_competition_id UUID;
  v_invitee_id UUID;
  v_participant_exists BOOLEAN;
BEGIN
  -- Get invitation details
  SELECT competition_id, invitee_id
  INTO v_competition_id, v_invitee_id
  FROM public.competition_invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND invitee_id = auth.uid();

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check if participant already exists (shouldn't happen, but safety check)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decline an invitation
CREATE OR REPLACE FUNCTION decline_competition_invitation(p_invitation_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.competition_invitations
  SET status = 'declined', responded_at = NOW()
  WHERE id = p_invitation_id
    AND invitee_id = auth.uid()
    AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: competition_invitations table doesn't have an updated_at column
-- The responded_at column tracks when invitations are accepted/declined
