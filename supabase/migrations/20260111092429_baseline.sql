


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."accept_competition_invitation"("p_invitation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_competition_id UUID;
  v_invitee_id UUID;
  v_participant_exists BOOLEAN;
BEGIN
  -- Get invitation details
  SELECT competition_id, invitee_id
  INTO v_competition_id, v_invitee_id
  FROM public.competition_invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND invitee_id = auth.uid();

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check if participant already exists (shouldn't happen, but safety check)
  SELECT EXISTS(
    SELECT 1 FROM public.competition_participants
    WHERE competition_id = v_competition_id
      AND user_id = v_invitee_id
  ) INTO v_participant_exists;

  IF v_participant_exists THEN
    -- If already a participant, just mark invitation as accepted
    UPDATE public.competition_invitations
    SET status = 'accepted', responded_at = NOW()
    WHERE id = p_invitation_id;
    RETURN TRUE;
  END IF;

  -- Add user as participant
  INSERT INTO public.competition_participants (competition_id, user_id)
  VALUES (v_competition_id, v_invitee_id);

  -- Update invitation status
  UPDATE public.competition_invitations
  SET status = 'accepted', responded_at = NOW()
  WHERE id = p_invitation_id;

  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."accept_competition_invitation"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.friendships f
    SET status = 'accepted',
        updated_at = NOW()
    WHERE f.user_id = friend_id_param
      AND f.friend_id = user_id_param
      AND f.status = 'pending';

    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."accept_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_participant_points"("p_competition_id" "uuid", "p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_scoring_type TEXT;
  v_scoring_config JSONB;
  v_total_points NUMERIC := 0;
  v_daily_data RECORD;
  v_move_goal INTEGER;
  v_exercise_goal INTEGER;
  v_stand_goal INTEGER;
BEGIN
  -- Get competition scoring type
  SELECT scoring_type, scoring_config INTO v_scoring_type, v_scoring_config
  FROM public.competitions
  WHERE id = p_competition_id;

  -- Get user goals once for percentage calculation
  SELECT COALESCE(move_goal, 400), COALESCE(exercise_goal, 30), COALESCE(stand_goal, 12)
  INTO v_move_goal, v_exercise_goal, v_stand_goal
  FROM public.user_fitness
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Aggregate points from daily data based on scoring type
  FOR v_daily_data IN
    SELECT * FROM public.competition_daily_data
    WHERE competition_id = p_competition_id
      AND user_id = p_user_id
      AND date >= p_start_date
      AND date <= p_end_date
    ORDER BY date
  LOOP
    CASE v_scoring_type
      WHEN 'ring_close' THEN
        -- 1 point per ring closed (move, exercise, stand)
        v_total_points := v_total_points + 
          CASE WHEN v_daily_data.move_calories > 0 THEN 1 ELSE 0 END +
          CASE WHEN v_daily_data.exercise_minutes > 0 THEN 1 ELSE 0 END +
          CASE WHEN v_daily_data.stand_hours > 0 THEN 1 ELSE 0 END;
      
      WHEN 'percentage' THEN
        -- Points based on percentage of goals (rounded to nearest integer, 1 point per 1%)
        -- Each percentage is rounded to nearest integer before adding to ensure whole number points
        v_total_points := v_total_points +
          LEAST(ROUND((v_daily_data.move_calories::NUMERIC / NULLIF(v_move_goal, 0)) * 100)::INTEGER, 999) +
          LEAST(ROUND((v_daily_data.exercise_minutes::NUMERIC / NULLIF(v_exercise_goal, 0)) * 100)::INTEGER, 999) +
          LEAST(ROUND((v_daily_data.stand_hours::NUMERIC / NULLIF(v_stand_goal, 0)) * 100)::INTEGER, 999);
      
      WHEN 'raw_numbers' THEN
        -- 1 point per calorie, minute, and hour
        v_total_points := v_total_points +
          COALESCE(v_daily_data.move_calories, 0) +
          COALESCE(v_daily_data.exercise_minutes, 0) +
          COALESCE(v_daily_data.stand_hours, 0);
      
      WHEN 'step_count' THEN
        -- 1 point per step
        v_total_points := v_total_points + COALESCE(v_daily_data.step_count, 0);
      
      WHEN 'workout' THEN
        -- Points based on workout metric (stored in daily_data.points)
        v_total_points := v_total_points + COALESCE(v_daily_data.points, 0);
      
      ELSE
        -- Default to ring_close
        v_total_points := v_total_points +
          CASE WHEN v_daily_data.move_calories > 0 THEN 1 ELSE 0 END +
          CASE WHEN v_daily_data.exercise_minutes > 0 THEN 1 ELSE 0 END +
          CASE WHEN v_daily_data.stand_hours > 0 THEN 1 ELSE 0 END;
    END CASE;
  END LOOP;

  -- For percentage scoring, ensure final result is a whole number
  IF v_scoring_type = 'percentage' THEN
    RETURN ROUND(v_total_points)::INTEGER;
  END IF;

  RETURN COALESCE(v_total_points, 0);
END;
$$;


ALTER FUNCTION "public"."calculate_participant_points"("p_competition_id" "uuid", "p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_reset_ai_messages"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.profiles
  SET 
    ai_messages_used = 0,
    ai_messages_reset_at = NOW() + INTERVAL '1 month'
  WHERE id = p_user_id
    AND (
      ai_messages_reset_at IS NULL 
      OR ai_messages_reset_at < NOW()
    );
END;
$$;


ALTER FUNCTION "public"."check_reset_ai_messages"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    friendship_id UUID;
BEGIN
    -- Check if friendship already exists (in either direction)
    SELECT f.id INTO friendship_id
    FROM public.friendships f
    WHERE (f.user_id = user_id_param AND f.friend_id = friend_id_param)
       OR (f.user_id = friend_id_param AND f.friend_id = user_id_param)
    LIMIT 1;

    IF friendship_id IS NOT NULL THEN
        RETURN friendship_id;
    END IF;

    -- Create new friendship (pending status for friend requests)
    INSERT INTO public.friendships (user_id, friend_id, status)
    VALUES (user_id_param, friend_id_param, 'pending')
    RETURNING id INTO friendship_id;

    RETURN friendship_id;
END;
$$;


ALTER FUNCTION "public"."create_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decline_competition_invitation"("p_invitation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.competition_invitations
  SET status = 'declined', responded_at = NOW()
  WHERE id = p_invitation_id
    AND invitee_id = auth.uid()
    AND status = 'pending';

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."decline_competition_invitation"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_fitness_goals"("target_user_id" "uuid") RETURNS TABLE("move_goal" integer, "exercise_goal" integer, "stand_goal" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only allow access if:
  -- 1. User is viewing their own goals (auth.uid() = target_user_id)
  -- 2. Users are friends (accepted friendship)
  -- 3. Users are in the same competition
  IF auth.uid() = target_user_id THEN
    -- User viewing own goals - always allowed
    RETURN QUERY
    SELECT uf.move_goal, uf.exercise_goal, uf.stand_goal
    FROM public.user_fitness uf
    WHERE uf.user_id = target_user_id;
  ELSIF EXISTS (
    -- Check if users are friends (accepted friendship)
    SELECT 1 FROM public.friendships f
    WHERE (
      (f.user_id = auth.uid() AND f.friend_id = target_user_id)
      OR (f.user_id = target_user_id AND f.friend_id = auth.uid())
    )
    AND f.status = 'accepted'
  ) THEN
    -- Users are friends - allow access
    RETURN QUERY
    SELECT uf.move_goal, uf.exercise_goal, uf.stand_goal
    FROM public.user_fitness uf
    WHERE uf.user_id = target_user_id;
  ELSIF EXISTS (
    -- Check if users are in the same competition
    SELECT 1 FROM public.competition_participants cp1
    INNER JOIN public.competition_participants cp2 ON cp1.competition_id = cp2.competition_id
    WHERE cp1.user_id = auth.uid()
    AND cp2.user_id = target_user_id
    LIMIT 1
  ) THEN
    -- Users are in the same competition - allow access
    RETURN QUERY
    SELECT uf.move_goal, uf.exercise_goal, uf.stand_goal
    FROM public.user_fitness uf
    WHERE uf.user_id = target_user_id;
  ELSE
    -- No access - return NULL
    RETURN;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_user_fitness_goals"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    DELETE FROM public.friendships f
    WHERE (f.user_id = user_id_param AND f.friend_id = friend_id_param)
       OR (f.user_id = friend_id_param AND f.friend_id = user_id_param);

    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."remove_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_competition_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM update_competition_status();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_update_competition_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_friendships_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_update_friendships_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_participant_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM update_participant_totals(NEW.participant_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_update_participant_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_competition_status"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.competitions
  SET status = CASE
    WHEN end_date < CURRENT_DATE THEN 'completed'
    WHEN start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE THEN 'active'
    ELSE 'upcoming'
  END
  WHERE status != 'completed' OR (end_date >= CURRENT_DATE - INTERVAL '1 day');
END;
$$;


ALTER FUNCTION "public"."update_competition_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_participant_totals"("p_participant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_competition_id UUID;
  v_user_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_total_move INTEGER := 0;
  v_total_exercise INTEGER := 0;
  v_total_stand INTEGER := 0;
  v_total_steps INTEGER := 0;
  v_move_progress NUMERIC := 0;
  v_exercise_progress NUMERIC := 0;
  v_stand_progress NUMERIC := 0;
  v_move_goal INTEGER;
  v_exercise_goal INTEGER;
  v_stand_goal INTEGER;
  v_days_count INTEGER;
  v_avg_move NUMERIC;
  v_avg_exercise NUMERIC;
  v_avg_stand NUMERIC;
  v_total_points NUMERIC;
BEGIN
  -- Get participant info
  SELECT competition_id, user_id INTO v_competition_id, v_user_id
  FROM public.competition_participants
  WHERE id = p_participant_id;

  -- Get competition dates
  SELECT start_date, end_date INTO v_start_date, v_end_date
  FROM public.competitions
  WHERE id = v_competition_id;

  -- Get user goals
  SELECT COALESCE(move_goal, 400), COALESCE(exercise_goal, 30), COALESCE(stand_goal, 12)
  INTO v_move_goal, v_exercise_goal, v_stand_goal
  FROM public.user_fitness
  WHERE user_id = v_user_id
  LIMIT 1;

  -- Aggregate daily data
  SELECT 
    COALESCE(SUM(move_calories), 0)::INTEGER,
    COALESCE(SUM(exercise_minutes), 0)::INTEGER,
    COALESCE(SUM(stand_hours), 0)::INTEGER,
    COALESCE(SUM(step_count), 0)::INTEGER
  INTO v_total_move, v_total_exercise, v_total_stand, v_total_steps
  FROM public.competition_daily_data
  WHERE participant_id = p_participant_id
    AND date >= v_start_date
    AND date <= v_end_date;

  -- Calculate progress percentages (average across all days in competition)
  SELECT COUNT(DISTINCT date) INTO v_days_count
  FROM public.competition_daily_data
  WHERE participant_id = p_participant_id
    AND date >= v_start_date
    AND date <= v_end_date;

  IF v_days_count > 0 THEN
    v_avg_move := (v_total_move::NUMERIC / v_days_count) / NULLIF(v_move_goal, 0);
    v_avg_exercise := (v_total_exercise::NUMERIC / v_days_count) / NULLIF(v_exercise_goal, 0);
    v_avg_stand := (v_total_stand::NUMERIC / v_days_count) / NULLIF(v_stand_goal, 0);
  END IF;

  -- Allow progress to exceed 1.0 (100%) to show when users exceed their goals
  v_move_progress := COALESCE(v_avg_move, 0);
  v_exercise_progress := COALESCE(v_avg_exercise, 0);
  v_stand_progress := COALESCE(v_avg_stand, 0);

  -- Calculate total points
  SELECT calculate_participant_points(v_competition_id, v_user_id, v_start_date, v_end_date) INTO v_total_points;

  -- Update participant totals
  UPDATE public.competition_participants
  SET
    total_points = v_total_points,
    move_calories = v_total_move,
    exercise_minutes = v_total_exercise,
    stand_hours = v_total_stand,
    step_count = v_total_steps,
    move_progress = v_move_progress,
    exercise_progress = v_exercise_progress,
    stand_progress = v_stand_progress,
    last_sync_at = NOW()
  WHERE id = p_participant_id;
END;
$$;


ALTER FUNCTION "public"."update_participant_totals"("p_participant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_tier" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Validate tier
  IF p_tier NOT IN ('starter', 'mover', 'crusher') THEN
    RAISE EXCEPTION 'Invalid subscription tier: %', p_tier;
  END IF;

  -- Update the subscription tier
  UPDATE public.profiles
  SET subscription_tier = p_tier
  WHERE id = p_user_id;

  -- If upgrading to crusher, reset AI messages
  IF p_tier = 'crusher' THEN
    UPDATE public.profiles
    SET 
      ai_messages_used = 0,
      ai_messages_reset_at = NOW() + INTERVAL '1 month'
    WHERE id = p_user_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_tier" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_competition_participant"("p_competition_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  -- SECURITY DEFINER allows bypassing RLS to check participation
  RETURN EXISTS (
    SELECT 1 FROM public.competition_participants
    WHERE competition_id = p_competition_id
    AND user_id = p_user_id
  );
END;
$$;


ALTER FUNCTION "public"."user_is_competition_participant"("p_competition_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_are_friends"("p_user_id" "uuid", "p_friend_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (
      (f.user_id = p_user_id AND f.friend_id = p_friend_id)
      OR (f.user_id = p_friend_id AND f.friend_id = p_user_id)
    )
    AND f.status = 'accepted'
  );
END;
$$;


ALTER FUNCTION "public"."users_are_friends"("p_user_id" "uuid", "p_friend_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_are_in_same_competition"("p_user_id" "uuid", "p_other_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.competition_participants cp1
    INNER JOIN public.competition_participants cp2 ON cp1.competition_id = cp2.competition_id
    WHERE cp1.user_id = p_user_id
    AND cp2.user_id = p_other_user_id
    LIMIT 1
  );
END;
$$;


ALTER FUNCTION "public"."users_are_in_same_competition"("p_user_id" "uuid", "p_other_user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."competition_daily_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "move_calories" integer DEFAULT 0,
    "exercise_minutes" integer DEFAULT 0,
    "stand_hours" integer DEFAULT 0,
    "step_count" integer DEFAULT 0,
    "distance_meters" numeric(10,2) DEFAULT 0,
    "workouts_completed" integer DEFAULT 0,
    "points" numeric(10,2) DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."competition_daily_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competition_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "inviter_id" "uuid" NOT NULL,
    "invitee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "competition_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."competition_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competition_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_sync_at" timestamp with time zone,
    "total_points" numeric(10,2) DEFAULT 0 NOT NULL,
    "move_calories" integer DEFAULT 0,
    "exercise_minutes" integer DEFAULT 0,
    "stand_hours" integer DEFAULT 0,
    "step_count" integer DEFAULT 0,
    "move_progress" numeric(5,4) DEFAULT 0,
    "exercise_progress" numeric(5,4) DEFAULT 0,
    "stand_progress" numeric(5,4) DEFAULT 0
);


ALTER TABLE "public"."competition_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "scoring_type" "text" DEFAULT 'ring_close'::"text" NOT NULL,
    "scoring_config" "jsonb",
    "is_public" boolean DEFAULT false NOT NULL,
    "repeat_option" "text" DEFAULT 'none'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "competitions_repeat_option_check" CHECK (("repeat_option" = ANY (ARRAY['none'::"text", 'weekly'::"text", 'biweekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "competitions_scoring_type_check" CHECK (("scoring_type" = ANY (ARRAY['ring_close'::"text", 'percentage'::"text", 'raw_numbers'::"text", 'step_count'::"text", 'workout'::"text"]))),
    CONSTRAINT "competitions_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'active'::"text", 'completed'::"text"]))),
    CONSTRAINT "competitions_type_check" CHECK (("type" = ANY (ARRAY['weekend'::"text", 'weekly'::"text", 'monthly'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."competitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "friend_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'accepted'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'blocked'::"text"]))),
    CONSTRAINT "no_self_friendship" CHECK (("user_id" <> "friend_id"))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "phone_number" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "username" "text",
    "phone_hash" "text",
    "primary_device" "text",
    "subscription_tier" "text" DEFAULT 'starter'::"text" NOT NULL,
    "ai_messages_used" integer DEFAULT 0 NOT NULL,
    "ai_messages_reset_at" timestamp with time zone,
    "onboarding_completed" boolean DEFAULT false,
    CONSTRAINT "check_subscription_tier" CHECK (("subscription_tier" = ANY (ARRAY['starter'::"text", 'mover'::"text", 'crusher'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."username" IS 'Check "Is Unique" if there''s that option';



COMMENT ON COLUMN "public"."profiles"."phone_hash" IS 'For matching contacts securely';



COMMENT ON COLUMN "public"."profiles"."primary_device" IS 'Primary fitness device: apple_watch, fitbit, garmin, whoop, oura, iphone, other';



COMMENT ON COLUMN "public"."profiles"."subscription_tier" IS 'User subscription tier: starter (free), mover, or crusher';



COMMENT ON COLUMN "public"."profiles"."ai_messages_used" IS 'Number of AI messages used in the current period';



COMMENT ON COLUMN "public"."profiles"."ai_messages_reset_at" IS 'Timestamp when AI message count should be reset (typically monthly)';



COMMENT ON COLUMN "public"."profiles"."onboarding_completed" IS 'Whether the user has completed onboarding. If true, they should be taken directly to the home screen on sign-in.';



CREATE TABLE IF NOT EXISTS "public"."user_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "move_calories" integer DEFAULT 0,
    "exercise_minutes" integer DEFAULT 0,
    "stand_hours" integer DEFAULT 0,
    "step_count" integer DEFAULT 0,
    "distance_meters" numeric(10,2) DEFAULT 0,
    "workouts_completed" integer DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_fitness" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "move_goal" integer DEFAULT 500 NOT NULL,
    "exercise_goal" integer DEFAULT 30 NOT NULL,
    "stand_goal" integer DEFAULT 12 NOT NULL,
    "height" numeric(5,2),
    "weight" numeric(5,2),
    "target_weight" numeric(5,2),
    "age" integer,
    "gender" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_fitness_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."user_fitness" OWNER TO "postgres";


ALTER TABLE ONLY "public"."competition_daily_data"
    ADD CONSTRAINT "competition_daily_data_competition_id_user_id_date_key" UNIQUE ("competition_id", "user_id", "date");



ALTER TABLE ONLY "public"."competition_daily_data"
    ADD CONSTRAINT "competition_daily_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competition_invitations"
    ADD CONSTRAINT "competition_invitations_competition_id_invitee_id_key" UNIQUE ("competition_id", "invitee_id");



ALTER TABLE ONLY "public"."competition_invitations"
    ADD CONSTRAINT "competition_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competition_participants"
    ADD CONSTRAINT "competition_participants_competition_id_user_id_key" UNIQUE ("competition_id", "user_id");



ALTER TABLE ONLY "public"."competition_participants"
    ADD CONSTRAINT "competition_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "unique_friendship" UNIQUE ("user_id", "friend_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "unique_username" UNIQUE ("username");



ALTER TABLE ONLY "public"."user_activity"
    ADD CONSTRAINT "user_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_activity"
    ADD CONSTRAINT "user_activity_user_id_date_key" UNIQUE ("user_id", "date");



ALTER TABLE ONLY "public"."user_fitness"
    ADD CONSTRAINT "user_fitness_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_fitness"
    ADD CONSTRAINT "user_fitness_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_competition_daily_data_competition_user_date" ON "public"."competition_daily_data" USING "btree" ("competition_id", "user_id", "date");



CREATE INDEX "idx_competition_daily_data_participant" ON "public"."competition_daily_data" USING "btree" ("participant_id");



CREATE INDEX "idx_competition_invitations_competition" ON "public"."competition_invitations" USING "btree" ("competition_id");



CREATE INDEX "idx_competition_invitations_invitee" ON "public"."competition_invitations" USING "btree" ("invitee_id", "status");



CREATE INDEX "idx_competition_invitations_status" ON "public"."competition_invitations" USING "btree" ("status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_competition_participants_competition_id" ON "public"."competition_participants" USING "btree" ("competition_id");



CREATE INDEX "idx_competition_participants_points" ON "public"."competition_participants" USING "btree" ("competition_id", "total_points" DESC);



CREATE INDEX "idx_competition_participants_user_id" ON "public"."competition_participants" USING "btree" ("user_id");



CREATE INDEX "idx_competitions_creator_id" ON "public"."competitions" USING "btree" ("creator_id");



CREATE INDEX "idx_competitions_dates" ON "public"."competitions" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_competitions_status" ON "public"."competitions" USING "btree" ("status");



CREATE INDEX "idx_friendships_friend_id" ON "public"."friendships" USING "btree" ("friend_id");



CREATE INDEX "idx_friendships_status" ON "public"."friendships" USING "btree" ("status");



CREATE INDEX "idx_friendships_user_friend" ON "public"."friendships" USING "btree" ("user_id", "friend_id", "status");



CREATE INDEX "idx_friendships_user_id" ON "public"."friendships" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_onboarding_completed" ON "public"."profiles" USING "btree" ("onboarding_completed") WHERE ("onboarding_completed" = true);



CREATE INDEX "idx_profiles_phone_number" ON "public"."profiles" USING "btree" ("phone_number");



CREATE INDEX "idx_profiles_primary_device" ON "public"."profiles" USING "btree" ("primary_device");



CREATE INDEX "idx_profiles_subscription_tier" ON "public"."profiles" USING "btree" ("subscription_tier");



CREATE INDEX "idx_user_activity_date" ON "public"."user_activity" USING "btree" ("date");



CREATE INDEX "idx_user_activity_user_id" ON "public"."user_activity" USING "btree" ("user_id");



CREATE INDEX "idx_user_activity_user_id_date" ON "public"."user_activity" USING "btree" ("user_id", "date");



CREATE INDEX "idx_user_fitness_user_id" ON "public"."user_fitness" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "on_profile_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_competition_status_trigger" AFTER INSERT OR UPDATE OF "start_date", "end_date" ON "public"."competitions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_competition_status"();



CREATE OR REPLACE TRIGGER "update_competitions_updated_at" BEFORE UPDATE ON "public"."competitions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_friendships_updated_at" BEFORE UPDATE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_friendships_updated_at"();



CREATE OR REPLACE TRIGGER "update_participant_totals_trigger" AFTER INSERT OR UPDATE ON "public"."competition_daily_data" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_participant_totals"();



CREATE OR REPLACE TRIGGER "update_user_fitness_updated_at" BEFORE UPDATE ON "public"."user_fitness" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."competition_daily_data"
    ADD CONSTRAINT "competition_daily_data_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_daily_data"
    ADD CONSTRAINT "competition_daily_data_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."competition_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_daily_data"
    ADD CONSTRAINT "competition_daily_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_invitations"
    ADD CONSTRAINT "competition_invitations_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_invitations"
    ADD CONSTRAINT "competition_invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_invitations"
    ADD CONSTRAINT "competition_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_participants"
    ADD CONSTRAINT "competition_participants_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_participants"
    ADD CONSTRAINT "competition_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_activity"
    ADD CONSTRAINT "user_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_fitness"
    ADD CONSTRAINT "user_fitness_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can check usernames" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Competition creators can send invitations" ON "public"."competition_invitations" FOR INSERT WITH CHECK ((("inviter_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."competitions"
  WHERE (("competitions"."id" = "competition_invitations"."competition_id") AND ("competitions"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Creators can delete their competitions" ON "public"."competitions" FOR DELETE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Creators can update their competitions" ON "public"."competitions" FOR UPDATE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Invitees can respond to invitations" ON "public"."competition_invitations" FOR UPDATE USING ((("invitee_id" = "auth"."uid"()) AND ("status" = 'pending'::"text"))) WITH CHECK (("invitee_id" = "auth"."uid"()));



CREATE POLICY "Users can accept friend requests sent to them" ON "public"."friendships" FOR UPDATE USING ((("auth"."uid"() = "friend_id") AND ("status" = 'pending'::"text"))) WITH CHECK (("auth"."uid"() = "friend_id"));



CREATE POLICY "Users can create competitions" ON "public"."competitions" FOR INSERT WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Users can create own friend requests" ON "public"."friendships" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own fitness data" ON "public"."user_fitness" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own friendships" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "Users can insert own fitness data" ON "public"."user_fitness" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own activity data" ON "public"."user_activity" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own daily data" ON "public"."competition_daily_data" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can join competitions" ON "public"."competition_participants" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can leave competitions" ON "public"."competition_participants" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own fitness data" ON "public"."user_fitness" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own fitness data" ON "public"."user_fitness" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own activity data" ON "public"."user_activity" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own daily data" ON "public"."competition_daily_data" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own participation" ON "public"."competition_participants" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view competition participants' activity data" ON "public"."user_activity" FOR SELECT USING ("public"."users_are_in_same_competition"("auth"."uid"(), "user_id"));



CREATE POLICY "Users can view daily data for competitions they're in" ON "public"."competition_daily_data" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."user_is_competition_participant"("competition_id", "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."competitions" "c"
  WHERE (("c"."id" = "competition_daily_data"."competition_id") AND (("c"."is_public" = true) OR ("c"."creator_id" = "auth"."uid"())))))));



CREATE POLICY "Users can view friends' activity data" ON "public"."user_activity" FOR SELECT USING ("public"."users_are_friends"("auth"."uid"(), "user_id"));



CREATE POLICY "Users can view own activity data" ON "public"."user_activity" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own friendships" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view participants in competitions they're in or publi" ON "public"."competition_participants" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."user_is_competition_participant"("competition_id", "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."competitions" "c"
  WHERE (("c"."id" = "competition_participants"."competition_id") AND ("c"."is_public" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."competitions" "c"
  WHERE (("c"."id" = "competition_participants"."competition_id") AND ("c"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view public competitions" ON "public"."competitions" FOR SELECT USING ((("is_public" = true) OR ("creator_id" = "auth"."uid"()) OR "public"."user_is_competition_participant"("id", "auth"."uid"())));



CREATE POLICY "Users can view their own invitations" ON "public"."competition_invitations" FOR SELECT USING ((("invitee_id" = "auth"."uid"()) OR ("inviter_id" = "auth"."uid"())));



ALTER TABLE "public"."competition_daily_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competition_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competition_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_fitness" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_competition_invitation"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_competition_invitation"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_competition_invitation"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_participant_points"("p_competition_id" "uuid", "p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_participant_points"("p_competition_id" "uuid", "p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_participant_points"("p_competition_id" "uuid", "p_user_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_reset_ai_messages"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_reset_ai_messages"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_reset_ai_messages"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."decline_competition_invitation"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decline_competition_invitation"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decline_competition_invitation"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_fitness_goals"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_fitness_goals"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_fitness_goals"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_friendship"("user_id_param" "uuid", "friend_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_competition_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_competition_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_competition_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_friendships_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_friendships_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_friendships_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_participant_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_participant_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_participant_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_competition_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_competition_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_competition_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_participant_totals"("p_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_participant_totals"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_participant_totals"("p_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_tier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_subscription_tier"("p_user_id" "uuid", "p_tier" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_competition_participant"("p_competition_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_competition_participant"("p_competition_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_competition_participant"("p_competition_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."users_are_friends"("p_user_id" "uuid", "p_friend_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."users_are_friends"("p_user_id" "uuid", "p_friend_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_are_friends"("p_user_id" "uuid", "p_friend_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."users_are_in_same_competition"("p_user_id" "uuid", "p_other_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."users_are_in_same_competition"("p_user_id" "uuid", "p_other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_are_in_same_competition"("p_user_id" "uuid", "p_other_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."competition_daily_data" TO "anon";
GRANT ALL ON TABLE "public"."competition_daily_data" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_daily_data" TO "service_role";



GRANT ALL ON TABLE "public"."competition_invitations" TO "anon";
GRANT ALL ON TABLE "public"."competition_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."competition_participants" TO "anon";
GRANT ALL ON TABLE "public"."competition_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_participants" TO "service_role";



GRANT ALL ON TABLE "public"."competitions" TO "anon";
GRANT ALL ON TABLE "public"."competitions" TO "authenticated";
GRANT ALL ON TABLE "public"."competitions" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_activity" TO "anon";
GRANT ALL ON TABLE "public"."user_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."user_activity" TO "service_role";



GRANT ALL ON TABLE "public"."user_fitness" TO "anon";
GRANT ALL ON TABLE "public"."user_fitness" TO "authenticated";
GRANT ALL ON TABLE "public"."user_fitness" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







