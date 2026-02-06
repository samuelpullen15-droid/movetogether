-- Seed script to create a test competition in the "locked" state
-- This competition has end_date in the past but status='active'
-- which simulates the state where user's local midnight passed but competition isn't fully completed

-- Get the current user's ID (you may need to replace this with your actual user ID)
-- Run: SELECT id FROM auth.users LIMIT 1; to find your user ID

DO $$
DECLARE
  test_user_id UUID;
  test_competition_id UUID;
BEGIN
  -- Get the first user (adjust this query if you want a specific user)
  SELECT id INTO test_user_id FROM auth.users LIMIT 1;

  IF test_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found. Please create a user first.';
  END IF;

  -- Generate a new UUID for the competition
  test_competition_id := gen_random_uuid();

  -- Create the test competition
  -- end_date is 2 days ago, start_date is 5 days ago, status is 'active'
  INSERT INTO competitions (
    id,
    creator_id,
    name,
    description,
    start_date,
    end_date,
    type,
    status,
    is_public,
    scoring_type,
    created_at
  ) VALUES (
    test_competition_id,
    test_user_id,
    '🔒 Test Locked Competition',
    'This is a test competition to demonstrate the locked score overlay. Your local midnight has passed!',
    (CURRENT_DATE - INTERVAL '5 days')::DATE,
    (CURRENT_DATE - INTERVAL '2 days')::DATE,
    'weekly',
    'active',  -- Keep as active so the locked overlay shows
    false,
    'rings',
    NOW()
  );

  -- Add the user as a participant with some points
  INSERT INTO competition_participants (
    competition_id,
    user_id,
    points,
    joined_at,
    score_locked_at  -- NULL means not locked in DB yet, but UI will show locked based on dates
  ) VALUES (
    test_competition_id,
    test_user_id,
    847,  -- Some test points
    NOW() - INTERVAL '5 days',
    NULL  -- Score not locked in DB, but UI calculates locked state from dates
  );

  -- Add a few fake participants to make the leaderboard interesting
  -- Participant 2 (ahead)
  INSERT INTO competition_participants (
    competition_id,
    user_id,
    points,
    joined_at,
    display_name  -- Use display_name for fake participants
  ) VALUES (
    test_competition_id,
    gen_random_uuid(),  -- Fake user ID
    923,
    NOW() - INTERVAL '4 days',
    'FitnessFan99'
  );

  -- Participant 3 (behind)
  INSERT INTO competition_participants (
    competition_id,
    user_id,
    points,
    joined_at,
    display_name
  ) VALUES (
    test_competition_id,
    gen_random_uuid(),
    756,
    NOW() - INTERVAL '3 days',
    'HealthyHero'
  );

  RAISE NOTICE 'Created test locked competition: %', test_competition_id;
  RAISE NOTICE 'User % added as participant with 847 points', test_user_id;

END $$;

-- To clean up later, run:
-- DELETE FROM competitions WHERE name = '🔒 Test Locked Competition';
