-- =====================================================
-- Lock Down All Direct Writes
-- Move all writes to secure RPC functions
-- Wrapped in existence checks for idempotency
-- =====================================================

-- 1. user_achievement_stats (VIEW - shouldn't be writable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'user_achievement_stats') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.user_achievement_stats FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.user_achievement_stats FROM anon;
  END IF;
END $$;

-- 2. user_fitness - lock direct writes, create RPC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_fitness' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.user_fitness FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.user_fitness FROM anon;

    CREATE OR REPLACE FUNCTION public.upsert_my_fitness(
      p_move_goal integer DEFAULT NULL,
      p_exercise_goal integer DEFAULT NULL,
      p_stand_goal integer DEFAULT NULL,
      p_height numeric DEFAULT NULL,
      p_weight numeric DEFAULT NULL,
      p_target_weight numeric DEFAULT NULL,
      p_start_weight numeric DEFAULT NULL,
      p_age integer DEFAULT NULL,
      p_gender text DEFAULT NULL,
      p_pronouns text DEFAULT NULL,
      p_birthday date DEFAULT NULL
    )
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_user_id uuid := auth.uid();
      v_id uuid;
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      INSERT INTO user_fitness (user_id, move_goal, exercise_goal, stand_goal, height, weight, target_weight, start_weight, age, gender, pronouns, birthday)
      VALUES (
        v_user_id,
        COALESCE(p_move_goal, 500),
        COALESCE(p_exercise_goal, 30),
        COALESCE(p_stand_goal, 12),
        p_height, p_weight, p_target_weight, p_start_weight, p_age, p_gender, p_pronouns, p_birthday
      )
      ON CONFLICT (user_id) DO UPDATE SET
        move_goal = COALESCE(p_move_goal, user_fitness.move_goal),
        exercise_goal = COALESCE(p_exercise_goal, user_fitness.exercise_goal),
        stand_goal = COALESCE(p_stand_goal, user_fitness.stand_goal),
        height = COALESCE(p_height, user_fitness.height),
        weight = COALESCE(p_weight, user_fitness.weight),
        target_weight = COALESCE(p_target_weight, user_fitness.target_weight),
        start_weight = COALESCE(p_start_weight, user_fitness.start_weight),
        age = COALESCE(p_age, user_fitness.age),
        gender = COALESCE(p_gender, user_fitness.gender),
        pronouns = COALESCE(p_pronouns, user_fitness.pronouns),
        birthday = COALESCE(p_birthday, user_fitness.birthday),
        updated_at = NOW()
      WHERE user_fitness.user_id = v_user_id
      RETURNING id INTO v_id;

      RETURN v_id;
    END;
    $func$;

    REVOKE EXECUTE ON FUNCTION public.upsert_my_fitness FROM anon;
    GRANT EXECUTE ON FUNCTION public.upsert_my_fitness TO authenticated;
  END IF;
END $$;


-- 3. activity_reactions - lock direct writes, create RPC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_reactions' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.activity_reactions FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.activity_reactions FROM anon;

    CREATE OR REPLACE FUNCTION public.add_reaction(
      p_activity_id uuid,
      p_emoji text
    )
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_user_id uuid := auth.uid();
      v_id uuid;
      v_activity_owner uuid;
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      -- Verify activity exists and is viewable
      SELECT user_id INTO v_activity_owner
      FROM user_activity
      WHERE id = p_activity_id;

      IF v_activity_owner IS NULL THEN
        RAISE EXCEPTION 'Activity not found';
      END IF;

      IF v_activity_owner != v_user_id AND NOT can_view_profile(v_user_id, v_activity_owner) THEN
        RAISE EXCEPTION 'Cannot react to this activity';
      END IF;

      INSERT INTO activity_reactions (activity_id, user_id, emoji)
      VALUES (p_activity_id, v_user_id, p_emoji)
      RETURNING id INTO v_id;

      RETURN v_id;
    END;
    $func$;

    CREATE OR REPLACE FUNCTION public.remove_reaction(p_reaction_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_user_id uuid := auth.uid();
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      DELETE FROM activity_reactions
      WHERE id = p_reaction_id AND user_id = v_user_id;

      RETURN FOUND;
    END;
    $func$;

    REVOKE EXECUTE ON FUNCTION public.add_reaction FROM anon;
    REVOKE EXECUTE ON FUNCTION public.remove_reaction FROM anon;
    GRANT EXECUTE ON FUNCTION public.add_reaction TO authenticated;
    GRANT EXECUTE ON FUNCTION public.remove_reaction TO authenticated;
  END IF;
END $$;


-- 4. notification_preferences - lock direct writes, create RPC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.notification_preferences FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.notification_preferences FROM anon;

    CREATE OR REPLACE FUNCTION public.upsert_my_notification_preferences(
      p_push_enabled boolean DEFAULT NULL,
      p_email_enabled boolean DEFAULT NULL,
      p_competition_updates boolean DEFAULT NULL,
      p_friend_activity boolean DEFAULT NULL,
      p_achievement_alerts boolean DEFAULT NULL,
      p_coach_messages boolean DEFAULT NULL
    )
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_user_id uuid := auth.uid();
      v_id uuid;
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      INSERT INTO notification_preferences (user_id, push_enabled, email_enabled, competition_updates, friend_activity, achievement_alerts, coach_messages)
      VALUES (
        v_user_id,
        COALESCE(p_push_enabled, true),
        COALESCE(p_email_enabled, true),
        COALESCE(p_competition_updates, true),
        COALESCE(p_friend_activity, true),
        COALESCE(p_achievement_alerts, true),
        COALESCE(p_coach_messages, true)
      )
      ON CONFLICT (user_id) DO UPDATE SET
        push_enabled = COALESCE(p_push_enabled, notification_preferences.push_enabled),
        email_enabled = COALESCE(p_email_enabled, notification_preferences.email_enabled),
        competition_updates = COALESCE(p_competition_updates, notification_preferences.competition_updates),
        friend_activity = COALESCE(p_friend_activity, notification_preferences.friend_activity),
        achievement_alerts = COALESCE(p_achievement_alerts, notification_preferences.achievement_alerts),
        coach_messages = COALESCE(p_coach_messages, notification_preferences.coach_messages),
        updated_at = NOW()
      WHERE notification_preferences.user_id = v_user_id
      RETURNING id INTO v_id;

      RETURN v_id;
    END;
    $func$;

    REVOKE EXECUTE ON FUNCTION public.upsert_my_notification_preferences FROM anon;
    GRANT EXECUTE ON FUNCTION public.upsert_my_notification_preferences TO authenticated;
  END IF;
END $$;


-- 5. privacy_settings - lock direct writes, create RPC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'privacy_settings' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.privacy_settings FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.privacy_settings FROM anon;

    CREATE OR REPLACE FUNCTION public.upsert_my_privacy_settings(
      p_profile_visibility text DEFAULT NULL,
      p_activity_visibility text DEFAULT NULL,
      p_allow_friend_requests boolean DEFAULT NULL,
      p_show_in_search boolean DEFAULT NULL
    )
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_user_id uuid := auth.uid();
      v_id uuid;
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      INSERT INTO privacy_settings (user_id, profile_visibility, activity_visibility, allow_friend_requests, show_in_search)
      VALUES (
        v_user_id,
        COALESCE(p_profile_visibility, 'friends'),
        COALESCE(p_activity_visibility, 'friends'),
        COALESCE(p_allow_friend_requests, true),
        COALESCE(p_show_in_search, true)
      )
      ON CONFLICT (user_id) DO UPDATE SET
        profile_visibility = COALESCE(p_profile_visibility, privacy_settings.profile_visibility),
        activity_visibility = COALESCE(p_activity_visibility, privacy_settings.activity_visibility),
        allow_friend_requests = COALESCE(p_allow_friend_requests, privacy_settings.allow_friend_requests),
        show_in_search = COALESCE(p_show_in_search, privacy_settings.show_in_search),
        updated_at = NOW()
      WHERE privacy_settings.user_id = v_user_id
      RETURNING user_id INTO v_id;

      RETURN v_id;
    END;
    $func$;

    REVOKE EXECUTE ON FUNCTION public.upsert_my_privacy_settings FROM anon;
    GRANT EXECUTE ON FUNCTION public.upsert_my_privacy_settings TO authenticated;
  END IF;
END $$;


-- 6. friendships - lock direct writes (RPC functions already exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'friendships' AND table_schema = 'public') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.friendships FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.friendships FROM anon;

    -- Ensure existing friendship functions work with service_role
    -- create_friendship, accept_friendship, remove_friendship already exist
    -- Make sure they're SECURITY DEFINER

    CREATE OR REPLACE FUNCTION public.send_friend_request(p_friend_id uuid)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_user_id uuid := auth.uid();
      v_id uuid;
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF v_user_id = p_friend_id THEN
        RAISE EXCEPTION 'Cannot send friend request to yourself';
      END IF;

      IF NOT can_send_friend_request(v_user_id, p_friend_id) THEN
        RAISE EXCEPTION 'Cannot send friend request to this user';
      END IF;

      INSERT INTO friendships (user_id, friend_id, status)
      VALUES (v_user_id, p_friend_id, 'pending')
      RETURNING id INTO v_id;

      RETURN v_id;
    END;
    $func$;

    CREATE OR REPLACE FUNCTION public.respond_to_friend_request(p_friendship_id uuid, p_accept boolean)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_user_id uuid := auth.uid();
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      IF p_accept THEN
        UPDATE friendships
        SET status = 'accepted', updated_at = NOW()
        WHERE id = p_friendship_id
          AND friend_id = v_user_id
          AND status = 'pending';
      ELSE
        DELETE FROM friendships
        WHERE id = p_friendship_id
          AND friend_id = v_user_id
          AND status = 'pending';
      END IF;

      RETURN FOUND;
    END;
    $func$;

    CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_user_id uuid := auth.uid();
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      DELETE FROM friendships
      WHERE status = 'accepted'
        AND ((user_id = v_user_id AND friend_id = p_friend_id)
          OR (user_id = p_friend_id AND friend_id = v_user_id));

      RETURN FOUND;
    END;
    $func$;

    REVOKE EXECUTE ON FUNCTION public.send_friend_request FROM anon;
    REVOKE EXECUTE ON FUNCTION public.respond_to_friend_request FROM anon;
    REVOKE EXECUTE ON FUNCTION public.remove_friend FROM anon;
    GRANT EXECUTE ON FUNCTION public.send_friend_request TO authenticated;
    GRANT EXECUTE ON FUNCTION public.respond_to_friend_request TO authenticated;
    GRANT EXECUTE ON FUNCTION public.remove_friend TO authenticated;
  END IF;
END $$;
