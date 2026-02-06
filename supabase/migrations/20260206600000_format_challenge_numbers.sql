-- ============================================================================
-- Format Challenge Numbers with Commas
-- ============================================================================
-- Updates the generate_weekly_challenges function to format numbers with commas
-- e.g., "Walk 50,000 steps this week" instead of "Walk 50000 steps this week"

CREATE OR REPLACE FUNCTION generate_weekly_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template RECORD;
  week_start TIMESTAMPTZ;
  week_end TIMESTAMPTZ;
  difficulty TEXT;
  target_val INTEGER;
  reward_type_val TEXT;
  reward_value_val JSONB;
  formatted_target TEXT;
BEGIN
  -- Calculate this week's start (Monday 00:00 UTC) and end (Sunday 23:59 UTC)
  week_start := date_trunc('week', NOW()) + INTERVAL '0 hours';
  week_end := week_start + INTERVAL '7 days' - INTERVAL '1 second';

  -- Check if challenges already exist for this week
  IF EXISTS (
    SELECT 1 FROM weekly_challenges
    WHERE starts_at = week_start AND ends_at = week_end
  ) THEN
    RETURN; -- Challenges already generated
  END IF;

  -- Generate 3 challenges: easy, medium, hard
  FOR template IN SELECT * FROM challenge_templates WHERE is_active = TRUE LOOP
    -- Randomly select difficulty for this template
    difficulty := (ARRAY['easy', 'medium', 'hard'])[1 + floor(random() * 3)::int];

    CASE difficulty
      WHEN 'easy' THEN
        target_val := template.easy_target;
        reward_type_val := template.easy_reward_type;
        reward_value_val := template.easy_reward_value;
      WHEN 'medium' THEN
        target_val := template.medium_target;
        reward_type_val := template.medium_reward_type;
        reward_value_val := template.medium_reward_value;
      WHEN 'hard' THEN
        target_val := template.hard_target;
        reward_type_val := template.hard_reward_type;
        reward_value_val := template.hard_reward_value;
    END CASE;

    -- Format the target with commas (e.g., 50000 -> "50,000")
    formatted_target := to_char(target_val, 'FM999,999,999');

    INSERT INTO weekly_challenges (
      title, description, challenge_type, target_value,
      reward_type, reward_value,
      starts_at, ends_at,
      min_tier, icon, accent_color
    ) VALUES (
      REPLACE(template.title_template, '{target}', formatted_target),
      template.description_template,
      template.challenge_type,
      target_val,
      reward_type_val,
      reward_value_val,
      week_start,
      week_end,
      template.min_tier,
      template.icon,
      template.accent_color
    );
  END LOOP;
END;
$$;

-- Re-apply permissions
REVOKE EXECUTE ON FUNCTION generate_weekly_challenges FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_weekly_challenges TO service_role;
