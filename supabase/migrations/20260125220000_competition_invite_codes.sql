-- Competition Invite Codes
-- Allows sharing competitions via unique invite links

-- Add invite_code column to competitions table
ALTER TABLE competitions
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_competitions_invite_code ON competitions(invite_code) WHERE invite_code IS NOT NULL;

-- Function to generate a unique invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  -- Generate 8 character code (no ambiguous chars like 0/O, 1/I/L)
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create invite code for a competition
CREATE OR REPLACE FUNCTION get_or_create_invite_code(p_competition_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_invite_code TEXT;
  v_creator_id UUID;
  v_attempts INTEGER := 0;
BEGIN
  -- Check if competition already has an invite code
  SELECT invite_code INTO v_invite_code
  FROM competitions
  WHERE id = p_competition_id;

  IF v_invite_code IS NOT NULL THEN
    RETURN v_invite_code;
  END IF;

  -- Generate unique invite code (with retry for collisions)
  LOOP
    v_invite_code := generate_invite_code();

    BEGIN
      UPDATE competitions
      SET invite_code = v_invite_code
      WHERE id = p_competition_id;

      EXIT; -- Success, exit loop
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts >= 10 THEN
        RAISE EXCEPTION 'Could not generate unique invite code after 10 attempts';
      END IF;
    END;
  END LOOP;

  RETURN v_invite_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to join competition via invite code
CREATE OR REPLACE FUNCTION join_competition_by_invite(p_invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_competition_id UUID;
  v_competition_name TEXT;
  v_competition_status TEXT;
  v_user_id UUID;
  v_existing_participant UUID;
  v_is_public BOOLEAN;
  v_participant_count INTEGER;
  v_max_participants INTEGER;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Find competition by invite code
  SELECT id, name, status, is_public, max_participants
  INTO v_competition_id, v_competition_name, v_competition_status, v_is_public, v_max_participants
  FROM competitions
  WHERE invite_code = UPPER(p_invite_code);

  IF v_competition_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid invite code');
  END IF;

  -- Check if competition is still joinable
  IF v_competition_status NOT IN ('upcoming', 'active') THEN
    RETURN json_build_object('success', false, 'error', 'This competition is no longer accepting participants');
  END IF;

  -- Check if already a participant
  SELECT id INTO v_existing_participant
  FROM competition_participants
  WHERE competition_id = v_competition_id AND user_id = v_user_id;

  IF v_existing_participant IS NOT NULL THEN
    RETURN json_build_object(
      'success', true,
      'already_joined', true,
      'competition_id', v_competition_id,
      'competition_name', v_competition_name
    );
  END IF;

  -- Check participant limit
  IF v_max_participants IS NOT NULL THEN
    SELECT COUNT(*) INTO v_participant_count
    FROM competition_participants
    WHERE competition_id = v_competition_id;

    IF v_participant_count >= v_max_participants THEN
      RETURN json_build_object('success', false, 'error', 'This competition is full');
    END IF;
  END IF;

  -- Add user as participant
  INSERT INTO competition_participants (competition_id, user_id, joined_at)
  VALUES (v_competition_id, v_user_id, NOW());

  RETURN json_build_object(
    'success', true,
    'competition_id', v_competition_id,
    'competition_name', v_competition_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_or_create_invite_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION join_competition_by_invite(TEXT) TO authenticated;
