-- Team Competitions
-- Adds team support to the existing competition system.
-- Creator configures 2-4 teams, participants pick which team to join.
-- Team score = average of members' total_points.

-- ============================================================
-- 1. Add team columns to competitions table
-- ============================================================
ALTER TABLE competitions
ADD COLUMN IF NOT EXISTS is_team_competition BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE competitions
ADD COLUMN IF NOT EXISTS team_count INTEGER DEFAULT NULL
CHECK (team_count IS NULL OR (team_count >= 2 AND team_count <= 4));

-- ============================================================
-- 2. Create competition_teams table
-- ============================================================
CREATE TABLE IF NOT EXISTS competition_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  team_number INTEGER NOT NULL CHECK (team_number >= 1 AND team_number <= 4),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competition_id, team_number)
);

-- Index for fast lookup by competition
CREATE INDEX IF NOT EXISTS idx_competition_teams_competition
ON competition_teams(competition_id);

-- ============================================================
-- 3. Add team_id to competition_participants
-- ============================================================
ALTER TABLE competition_participants
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES competition_teams(id) ON DELETE SET NULL DEFAULT NULL;

-- Index for team-based queries (only on rows that have a team)
CREATE INDEX IF NOT EXISTS idx_competition_participants_team
ON competition_participants(team_id) WHERE team_id IS NOT NULL;

-- Index for team competitions filter
CREATE INDEX IF NOT EXISTS idx_competitions_is_team
ON competitions(is_team_competition) WHERE is_team_competition = true;

-- ============================================================
-- 4. RLS Policies for competition_teams
-- ============================================================
ALTER TABLE competition_teams ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see teams for competitions they have access to
CREATE POLICY "competition_teams_select_policy" ON competition_teams
FOR SELECT TO authenticated
USING (
  -- Public competitions
  competition_id IN (
    SELECT id FROM competitions WHERE is_public = true
  )
  -- Competitions user participates in
  OR competition_id IN (
    SELECT competition_id FROM competition_participants WHERE user_id = auth.uid()
  )
  -- Competitions user created
  OR competition_id IN (
    SELECT id FROM competitions WHERE creator_id = auth.uid()
  )
  -- Competitions with pending invitations for user
  OR competition_id IN (
    SELECT competition_id FROM competition_invitations
    WHERE invitee_id = auth.uid() AND status = 'pending'
  )
);

-- Service role has full access (for Edge Functions)
CREATE POLICY "service_role_competition_teams_all" ON competition_teams
FOR ALL TO service_role
USING (true) WITH CHECK (true);
