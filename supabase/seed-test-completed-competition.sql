-- Seed script to create a test competition in the "completed" state
-- This is useful for testing the celebratory results overlay with confetti

-- Run this in Supabase SQL Editor or via: psql -f seed-test-completed-competition.sql

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

  -- Create the test competition with status='completed'
  -- end_date is 3 days ago, start_date is 10 days ago
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
    '🏆 Test Completed Competition',
    'This is a test competition to demonstrate the celebratory results overlay with confetti!',
    (CURRENT_DATE - INTERVAL '10 days')::DATE,
    (CURRENT_DATE - INTERVAL '3 days')::DATE,
    'weekly',
    'completed',
    false,
    'ring_close',
    NOW()
  );

  -- Add the real user as the WINNER with high score
  INSERT INTO competition_participants (
    competition_id,
    user_id,
    total_points,
    joined_at
  ) VALUES (
    test_competition_id,
    test_user_id,
    1250,  -- Winner score
    NOW() - INTERVAL '10 days'
  );

  RAISE NOTICE '✅ Created test completed competition: %', test_competition_id;
  RAISE NOTICE 'User % is the WINNER with 1250 points', test_user_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Navigate to: /competition-detail?id=%', test_competition_id;

END $$;

-- To clean up later, run:
-- DELETE FROM competitions WHERE name = '🏆 Test Completed Competition';
