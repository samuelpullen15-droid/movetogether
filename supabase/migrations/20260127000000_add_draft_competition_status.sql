-- Add 'draft' status to competitions for the prize pool payment flow
-- Draft competitions are created when user starts the creation wizard
-- and are finalized (changed to 'upcoming' or 'active') after successful payment

-- Drop the existing constraint
ALTER TABLE competitions
DROP CONSTRAINT IF EXISTS competitions_status_check;

-- Add the new constraint with 'draft' included
ALTER TABLE competitions
ADD CONSTRAINT competitions_status_check
CHECK (status = ANY (ARRAY['draft'::text, 'upcoming'::text, 'active'::text, 'completed'::text]));

-- Add an index for quickly finding draft competitions (for cleanup jobs)
CREATE INDEX IF NOT EXISTS idx_competitions_draft_status ON competitions(status) WHERE status = 'draft';

-- Update RLS policies to hide draft competitions from public views
-- Only the creator should see their own draft competitions

-- Drop existing select policy and recreate with draft filtering
DROP POLICY IF EXISTS "competitions_select_policy" ON competitions;

CREATE POLICY "competitions_select_policy" ON competitions
FOR SELECT TO authenticated
USING (
  -- Users can see their own drafts
  (status = 'draft' AND creator_id = auth.uid())
  OR
  -- Users can see non-draft competitions they're part of or that are public
  (
    status != 'draft'
    AND (
      is_public = true
      OR creator_id = auth.uid()
      OR id IN (SELECT competition_id FROM competition_participants WHERE user_id = auth.uid())
      OR id IN (SELECT competition_id FROM competition_invitations WHERE invitee_id = auth.uid())
    )
  )
);

-- Comment for documentation
COMMENT ON CONSTRAINT competitions_status_check ON competitions IS
'Valid competition statuses: draft (being created), upcoming (scheduled), active (in progress), completed (finished)';
