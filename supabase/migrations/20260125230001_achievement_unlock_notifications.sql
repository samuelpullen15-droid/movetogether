-- Achievement Unlock Notifications
-- Triggers push notifications when users unlock new achievement tiers
-- Wrapped in existence checks for idempotency

-- Enable pg_net extension for HTTP calls (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to send achievement notification via Edge Function
CREATE OR REPLACE FUNCTION notify_achievement_unlock()
RETURNS TRIGGER AS $$
DECLARE
  v_tier TEXT;
  v_achievement_name TEXT;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Get Supabase URL and service key from vault or settings
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- If settings not available, try environment-based approach
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    -- Skip notification but don't fail the trigger
    RAISE WARNING 'Supabase settings not configured for achievement notifications';
    RETURN NEW;
  END IF;

  -- Determine which tier was just unlocked (changed from NULL to a value)
  IF TG_OP = 'INSERT' THEN
    IF NEW.platinum_unlocked_at IS NOT NULL THEN
      v_tier := 'Platinum';
    ELSIF NEW.gold_unlocked_at IS NOT NULL THEN
      v_tier := 'Gold';
    ELSIF NEW.silver_unlocked_at IS NOT NULL THEN
      v_tier := 'Silver';
    ELSIF NEW.bronze_unlocked_at IS NOT NULL THEN
      v_tier := 'Bronze';
    ELSE
      RETURN NEW;
    END IF;
  ELSE -- UPDATE
    IF NEW.platinum_unlocked_at IS NOT NULL AND OLD.platinum_unlocked_at IS NULL THEN
      v_tier := 'Platinum';
    ELSIF NEW.gold_unlocked_at IS NOT NULL AND OLD.gold_unlocked_at IS NULL THEN
      v_tier := 'Gold';
    ELSIF NEW.silver_unlocked_at IS NOT NULL AND OLD.silver_unlocked_at IS NULL THEN
      v_tier := 'Silver';
    ELSIF NEW.bronze_unlocked_at IS NOT NULL AND OLD.bronze_unlocked_at IS NULL THEN
      v_tier := 'Bronze';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Format achievement name from ID (e.g., 'competition_wins' -> 'Competition Wins')
  v_achievement_name := INITCAP(REPLACE(NEW.achievement_id, '_', ' '));

  -- Call the Edge Function to send the notification asynchronously
  PERFORM extensions.http_post(
    v_supabase_url || '/functions/v1/send-notification',
    jsonb_build_object(
      'type', 'achievement_unlocked',
      'recipientUserId', NEW.user_id::text,
      'data', jsonb_build_object(
        'achievementId', NEW.achievement_id,
        'achievementName', v_achievement_name,
        'tier', v_tier
      )
    ),
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the transaction if notification fails
    RAISE WARNING 'Failed to send achievement notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers only if user_achievement_progress table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_achievement_progress' AND table_schema = 'public') THEN
    -- Create trigger on INSERT (new achievement progress record)
    DROP TRIGGER IF EXISTS trigger_achievement_unlock_insert ON user_achievement_progress;
    CREATE TRIGGER trigger_achievement_unlock_insert
      AFTER INSERT ON user_achievement_progress
      FOR EACH ROW
      WHEN (NEW.bronze_unlocked_at IS NOT NULL
         OR NEW.silver_unlocked_at IS NOT NULL
         OR NEW.gold_unlocked_at IS NOT NULL
         OR NEW.platinum_unlocked_at IS NOT NULL)
      EXECUTE FUNCTION notify_achievement_unlock();

    -- Create trigger on UPDATE (existing record with new tier)
    DROP TRIGGER IF EXISTS trigger_achievement_unlock_update ON user_achievement_progress;
    CREATE TRIGGER trigger_achievement_unlock_update
      AFTER UPDATE ON user_achievement_progress
      FOR EACH ROW
      WHEN (
        (NEW.bronze_unlocked_at IS NOT NULL AND OLD.bronze_unlocked_at IS NULL) OR
        (NEW.silver_unlocked_at IS NOT NULL AND OLD.silver_unlocked_at IS NULL) OR
        (NEW.gold_unlocked_at IS NOT NULL AND OLD.gold_unlocked_at IS NULL) OR
        (NEW.platinum_unlocked_at IS NOT NULL AND OLD.platinum_unlocked_at IS NULL)
      )
      EXECUTE FUNCTION notify_achievement_unlock();
  END IF;
END $$;
