-- Migration: Lock down all RPC functions to service_role only
-- Per security rules: All data access must go through Edge Functions
-- Frontend should never call RPCs directly - only Edge Functions can

-- Helper function to safely revoke and grant permissions
CREATE OR REPLACE FUNCTION _temp_lockdown_function(func_name text, func_args text DEFAULT '')
RETURNS void AS $$
DECLARE
  full_signature text;
  oid_val oid;
BEGIN
  -- Build the function signature
  IF func_args = '' THEN
    full_signature := func_name || '()';
  ELSE
    full_signature := func_name || '(' || func_args || ')';
  END IF;

  -- Check if function exists by trying to get its OID
  BEGIN
    EXECUTE format('SELECT %L::regprocedure::oid', full_signature) INTO oid_val;

    -- Function exists, revoke and grant
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', full_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', full_signature);
    RAISE NOTICE 'Locked down function: %', full_signature;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping function % (not found or different signature): %', full_signature, SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Profile RPCs
-- ============================================
SELECT _temp_lockdown_function('get_my_profile');
SELECT _temp_lockdown_function('get_user_profile', 'uuid');
SELECT _temp_lockdown_function('check_username_available', 'text');
SELECT _temp_lockdown_function('get_user_fitness_goals', 'uuid');
SELECT _temp_lockdown_function('get_user_activity_for_date', 'uuid, date');
SELECT _temp_lockdown_function('get_user_activity_for_date', 'p_user_id uuid, p_date date');
SELECT _temp_lockdown_function('get_user_competition_daily_data_for_date', 'uuid, date');
SELECT _temp_lockdown_function('get_user_competition_daily_data_for_date', 'p_user_id uuid, p_date date');
SELECT _temp_lockdown_function('get_user_competition_stats', 'uuid');
SELECT _temp_lockdown_function('get_user_recent_activity', 'uuid, integer');
SELECT _temp_lockdown_function('get_user_achievement_progress', 'uuid');

-- ============================================
-- Competition RPCs
-- ============================================
SELECT _temp_lockdown_function('get_competition_full', 'uuid');
SELECT _temp_lockdown_function('get_competition_participants_with_profiles', 'uuid');
SELECT _temp_lockdown_function('get_competition_pending_invitations', 'uuid');
SELECT _temp_lockdown_function('get_my_competition_ids');
SELECT _temp_lockdown_function('get_my_participant_record', 'uuid');
SELECT _temp_lockdown_function('get_competition_scoring_info', 'uuid');
SELECT _temp_lockdown_function('get_my_competition_daily_data', 'uuid, date, date');
SELECT _temp_lockdown_function('get_competition_creator', 'uuid');
SELECT _temp_lockdown_function('get_competition_name', 'uuid');
SELECT _temp_lockdown_function('get_public_competitions', 'integer, integer');
SELECT _temp_lockdown_function('join_public_competition', 'uuid');
SELECT _temp_lockdown_function('get_competition_participants', 'uuid');

-- ============================================
-- Friends RPCs
-- ============================================
SELECT _temp_lockdown_function('get_my_blocked_friendships');
SELECT _temp_lockdown_function('get_my_friends');
SELECT _temp_lockdown_function('get_pending_friend_requests');
SELECT _temp_lockdown_function('get_sent_friend_requests');
SELECT _temp_lockdown_function('check_are_friends', 'uuid');
SELECT _temp_lockdown_function('check_are_friends', 'uuid, uuid');
SELECT _temp_lockdown_function('create_friendship', 'uuid');
SELECT _temp_lockdown_function('accept_friendship', 'uuid');
SELECT _temp_lockdown_function('remove_friendship', 'uuid');
SELECT _temp_lockdown_function('block_user', 'uuid');
SELECT _temp_lockdown_function('unblock_user', 'uuid');

-- ============================================
-- Activity Feed RPCs
-- ============================================
SELECT _temp_lockdown_function('get_activity_feed', 'integer');
SELECT _temp_lockdown_function('get_activity_feed_profiles', 'uuid[]');
SELECT _temp_lockdown_function('get_activity_feed_reactions', 'uuid[]');
SELECT _temp_lockdown_function('get_activity_owner', 'uuid');
SELECT _temp_lockdown_function('add_reaction', 'uuid, text');
SELECT _temp_lockdown_function('remove_reaction', 'uuid, text');
SELECT _temp_lockdown_function('add_comment', 'uuid, text');

-- ============================================
-- Health RPCs
-- ============================================
SELECT _temp_lockdown_function('get_my_fitness_goals');
SELECT _temp_lockdown_function('get_my_weight_settings');
SELECT _temp_lockdown_function('upsert_my_fitness', 'integer, integer, integer, numeric, numeric, numeric, numeric');
SELECT _temp_lockdown_function('upsert_my_fitness', 'p_move_goal integer, p_exercise_goal integer, p_stand_goal integer, p_current_weight numeric, p_goal_weight numeric, p_height numeric, p_bmi numeric');
SELECT _temp_lockdown_function('check_activity_exists_today', 'text');
SELECT _temp_lockdown_function('check_streak_milestone_exists', 'text, integer');

-- ============================================
-- Invitation RPCs
-- ============================================
SELECT _temp_lockdown_function('get_my_invitations');
SELECT _temp_lockdown_function('get_invitation_competition_id', 'uuid');
SELECT _temp_lockdown_function('accept_competition_invitation', 'uuid');
SELECT _temp_lockdown_function('decline_competition_invitation', 'uuid');
SELECT _temp_lockdown_function('get_existing_invitation_invitees', 'uuid, uuid[]');
SELECT _temp_lockdown_function('get_inviter_info', 'uuid');

-- ============================================
-- Settings RPCs
-- ============================================
SELECT _temp_lockdown_function('get_my_notification_preferences');
SELECT _temp_lockdown_function('upsert_my_notification_preferences', 'boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean');
SELECT _temp_lockdown_function('get_my_privacy_settings');
SELECT _temp_lockdown_function('upsert_my_privacy_settings', 'text, boolean, boolean, boolean, boolean, boolean, jsonb, text, text, boolean');

-- ============================================
-- Moderation RPCs
-- ============================================
SELECT _temp_lockdown_function('get_active_suspension', 'uuid');
SELECT _temp_lockdown_function('get_active_suspension');
SELECT _temp_lockdown_function('has_active_suspension', 'uuid');
SELECT _temp_lockdown_function('has_active_suspension');
SELECT _temp_lockdown_function('get_unacknowledged_warning', 'uuid');
SELECT _temp_lockdown_function('get_unacknowledged_warning');
SELECT _temp_lockdown_function('has_unacknowledged_warnings', 'uuid');
SELECT _temp_lockdown_function('has_unacknowledged_warnings');
SELECT _temp_lockdown_function('acknowledge_warning', 'uuid');

-- ============================================
-- Search RPCs
-- ============================================
SELECT _temp_lockdown_function('search_users', 'text, integer');
SELECT _temp_lockdown_function('search_users', 'text');
SELECT _temp_lockdown_function('search_users_by_emails', 'text[], integer');
SELECT _temp_lockdown_function('search_users_by_emails', 'text[]');
SELECT _temp_lockdown_function('search_users_by_phones', 'text[], integer');
SELECT _temp_lockdown_function('search_users_by_phones', 'text[]');

-- ============================================
-- Achievements RPCs
-- ============================================
SELECT _temp_lockdown_function('get_my_achievements');
SELECT _temp_lockdown_function('get_user_achievements', 'uuid');

-- ============================================
-- Chat RPCs
-- ============================================
SELECT _temp_lockdown_function('get_my_chat_messages', 'uuid, integer, integer');
SELECT _temp_lockdown_function('get_my_chat_messages', 'uuid');

-- ============================================
-- Bulk lockdown for any functions we may have missed
-- Query pg_proc to find all custom functions and lock them down
-- ============================================
DO $$
DECLARE
  func_record RECORD;
  func_signature text;
BEGIN
  -- Find all functions in public schema that are not system functions
  FOR func_record IN
    SELECT
      p.proname as func_name,
      pg_get_function_identity_arguments(p.oid) as func_args,
      p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'  -- Regular functions only
      AND p.proname NOT LIKE '_temp_%'  -- Skip our temp function
      AND p.proname NOT LIKE 'pg_%'  -- Skip PostgreSQL system functions
  LOOP
    BEGIN
      -- Build function signature
      IF func_record.func_args = '' THEN
        func_signature := func_record.func_name || '()';
      ELSE
        func_signature := func_record.func_name || '(' || func_record.func_args || ')';
      END IF;

      -- Revoke from public/anon/authenticated, grant to service_role
      EXECUTE format('REVOKE ALL ON FUNCTION %I(%s) FROM public, anon, authenticated',
                     func_record.func_name, func_record.func_args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %I(%s) TO service_role',
                     func_record.func_name, func_record.func_args);

      RAISE NOTICE 'Bulk locked down: %', func_signature;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not lock down %: %', func_signature, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Clean up the helper function
DROP FUNCTION IF EXISTS _temp_lockdown_function(text, text);

-- Add a comment explaining the security model
COMMENT ON SCHEMA public IS 'Public schema with RPC functions locked to service_role only. All client access must go through Edge Functions.';
