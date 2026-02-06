-- Seed script to create a test seasonal event
-- Run this in Supabase SQL Editor or via: psql -f seed-seasonal-event.sql
--
-- USAGE: Before running, replace 'YOUR_USER_ID_HERE' with your actual user ID.
--        You can find it in Supabase Dashboard → Authentication → Users.

DO $$
DECLARE
  creator_id UUID := 'YOUR_USER_ID_HERE';  -- ← Replace with your user ID
  event_id UUID;
BEGIN
  -- Verify the user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = creator_id) THEN
    RAISE EXCEPTION 'User % not found. Replace YOUR_USER_ID_HERE with a valid user ID.', creator_id;
  END IF;

  event_id := gen_random_uuid();

  INSERT INTO competitions (
    id,
    creator_id,
    name,
    description,
    start_date,
    end_date,
    type,
    status,
    scoring_type,
    is_public,
    is_seasonal_event,
    event_theme,
    event_reward,
    created_at,
    updated_at
  ) VALUES (
    event_id,
    creator_id,
    'February Fitness Frenzy',
    'Kick off February with daily movement! Close your rings for 10 days to earn a free Mover trial.',
    '2026-02-01',
    '2026-02-28',
    'monthly',
    'active',
    'ring_close',
    true,
    true,
    '{"color": "#E11D48", "secondaryColor": "#F43F5E", "icon": "flame", "emoji": "🔥", "tagline": "Move every day in February", "rewardDescription": "Complete 10 active days to earn 72 hours of Mover features!"}'::jsonb,
    '{"type": "trial_mover", "trial_hours": 72, "min_days_completed": 10, "source": "seasonal_event_feb_2026"}'::jsonb,
    NOW(),
    NOW()
  );

  -- Add the creator as a participant so there's at least one person
  INSERT INTO competition_participants (
    competition_id,
    user_id,
    joined_at
  ) VALUES (
    event_id,
    creator_id,
    NOW()
  );

  RAISE NOTICE 'Seasonal event created with ID: %', event_id;
  RAISE NOTICE 'Creator/participant: %', creator_id;
END $$;
