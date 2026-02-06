import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';

// Zod schemas for action params
const activityTypeSchema = z.object({
  activity_type: z.string().min(1).max(50),
});

const streakMilestoneSchema = z.object({
  achievement_type: z.string().min(1).max(50).optional(),
  streak_days: z.number().int().min(0),
});

const milestoneProgressIdSchema = z.object({
  milestone_progress_id: z.string().uuid(),
});

const streakTimezoneSchema = z.object({
  timezone: z.string().min(1).max(50),
});

const userIdSchema = z.object({
  user_id: z.string().uuid(),
});

const upsertFitnessSchema = z.object({
  move_goal: z.number().min(0).max(10000).optional(),
  exercise_goal: z.number().min(0).max(600).optional(),
  stand_goal: z.number().min(0).max(24).optional(),
  weight: z.number().min(0).max(1000).optional().nullable(),
  target_weight: z.number().min(0).max(1000).optional().nullable(),
  start_weight: z.number().min(0).max(1000).optional().nullable(),
  height: z.number().min(0).max(300).optional().nullable(),
}).passthrough();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_my_fitness_goals'
  | 'get_my_weight_settings'
  | 'upsert_my_fitness'
  | 'check_activity_exists_today'
  | 'check_streak_milestone_exists'
  | 'get_my_streak'
  | 'get_all_milestones'
  | 'get_my_milestone_progress'
  | 'claim_streak_reward'
  | 'use_streak_shield'
  | 'update_streak_timezone'
  | 'get_user_streak';

type TrialRewardType = 'trial_mover' | 'trial_coach' | 'trial_crusher';

interface RequestBody {
  action: Action;
  params?: Record<string, unknown>;
}

serve(async (req) => {
  console.log('[health-api] Request received:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('[health-api] Env vars:', { hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_SERVICE_ROLE_KEY });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse body first to get action
    const body = await req.json();
    const { action, params = {} } = body as RequestBody;
    console.log('[health-api] Action:', action);

    // Create service role client for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify JWT via Supabase auth (validates signature, not just decode)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('[health-api] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log('[health-api] Verified user ID:', userId);

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    let result: unknown;

    switch (action) {
      case 'get_my_fitness_goals': {
        const { data, error } = await supabase
          .from('user_fitness')
          .select('move_goal, exercise_goal, stand_goal')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        result = data || { move_goal: 500, exercise_goal: 30, stand_goal: 12 };
        break;
      }

      case 'get_my_weight_settings': {
        const { data, error } = await supabase
          .from('user_fitness')
          .select('weight, target_weight, start_weight, height')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        result = data;
        break;
      }

      case 'upsert_my_fitness': {
        const v = validateParams(upsertFitnessSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const fitnessData = v.data as Record<string, unknown>;

        const { data: existing } = await supabase
          .from('user_fitness')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          const { data, error } = await supabase
            .from('user_fitness')
            .update({ ...fitnessData, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .select()
            .single();

          if (error) throw error;
          result = data;
        } else {
          const { data, error } = await supabase
            .from('user_fitness')
            .insert({ user_id: userId, ...fitnessData })
            .select()
            .single();

          if (error) throw error;
          result = data;
        }
        break;
      }

      case 'check_activity_exists_today': {
        const v = validateParams(activityTypeSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const activityType = v.data.activity_type;

        // Check activity_feed table for today's activity of given type
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data } = await supabase
          .from('activity_feed')
          .select('id')
          .eq('user_id', userId)
          .eq('activity_type', activityType)
          .gte('created_at', todayStart.toISOString())
          .maybeSingle();

        result = { exists: !!data };
        break;
      }

      case 'check_streak_milestone_exists': {
        const v = validateParams(streakMilestoneSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const streakDays = v.data.streak_days;

        // Check activity_feed for streak milestone of given days
        const { data } = await supabase
          .from('activity_feed')
          .select('id')
          .eq('user_id', userId)
          .eq('activity_type', 'streak_milestone')
          .eq('metadata->>streakDays', String(streakDays))
          .maybeSingle();

        result = { exists: !!data };
        break;
      }

      // ================================================================
      // STREAK ACTIONS
      // ================================================================

      case 'get_my_streak': {
        const { data, error } = await supabase
          .from('user_streaks')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_all_milestones': {
        const { data, error } = await supabase
          .from('streak_milestones')
          .select('*')
          .order('day_number', { ascending: true });

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_my_milestone_progress': {
        const { data, error } = await supabase
          .from('user_milestone_progress')
          .select(`
            *,
            milestone:streak_milestones (*)
          `)
          .eq('user_id', userId)
          .order('earned_at', { ascending: false });

        if (error) throw error;
        result = data;
        break;
      }

      case 'claim_streak_reward': {
        const v = validateParams(milestoneProgressIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const milestoneProgressId = v.data.milestone_progress_id;

        // Get the milestone progress with milestone data
        const { data: progress, error: fetchError } = await supabase
          .from('user_milestone_progress')
          .select(`
            *,
            milestone:streak_milestones (*)
          `)
          .eq('id', milestoneProgressId)
          .eq('user_id', userId)
          .single();

        if (fetchError || !progress) {
          return new Response(
            JSON.stringify({ error: 'Milestone progress not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (progress.reward_claimed) {
          return new Response(
            JSON.stringify({ error: 'Reward already claimed' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const milestone = progress.milestone as any;
        const rewardType = milestone?.reward_type;
        const rewardValue = milestone?.reward_value || {};
        const now = new Date();

        // Calculate expiration for trial rewards
        let rewardExpiresAt: string | null = null;
        const trialTypes: TrialRewardType[] = ['trial_mover', 'trial_coach', 'trial_crusher'];

        if (trialTypes.includes(rewardType)) {
          const trialHours = (rewardValue.trial_hours as number) || 24;
          const expiresAt = new Date(now.getTime() + trialHours * 60 * 60 * 1000);
          rewardExpiresAt = expiresAt.toISOString();

          // Create/update trial record
          const { error: trialError } = await supabase
            .from('user_trials')
            .upsert({
              user_id: userId,
              trial_type: rewardType,
              milestone_progress_id: milestoneProgressId,
              activated_at: now.toISOString(),
              expires_at: rewardExpiresAt,
              source: 'streak_milestone',
            }, {
              onConflict: 'user_id,trial_type',
            });

          if (trialError) {
            console.error('Error creating trial record:', trialError);
            // Continue anyway - milestone progress update is more important
          }
        }

        // Update milestone progress
        const { error: updateError } = await supabase
          .from('user_milestone_progress')
          .update({
            reward_claimed: true,
            reward_claimed_at: now.toISOString(),
            reward_expires_at: rewardExpiresAt,
          })
          .eq('id', milestoneProgressId)
          .eq('user_id', userId);

        if (updateError) throw updateError;

        result = {
          success: true,
          reward_claimed_at: now.toISOString(),
          reward_expires_at: rewardExpiresAt,
          reward_type: rewardType,
          is_trial: trialTypes.includes(rewardType),
        };
        break;
      }

      case 'use_streak_shield': {
        // Get current streak data
        const { data: streakData, error: fetchError } = await supabase
          .from('user_streaks')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (fetchError || !streakData) {
          return new Response(
            JSON.stringify({ error: 'Streak data not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (streakData.streak_shields_available <= 0) {
          return new Response(
            JSON.stringify({ error: 'No shields available' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Use a shield
        const { error: updateError } = await supabase
          .from('user_streaks')
          .update({
            streak_shields_available: streakData.streak_shields_available - 1,
            streak_shields_used_this_week: streakData.streak_shields_used_this_week + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (updateError) throw updateError;

        result = {
          success: true,
          current_streak: streakData.current_streak,
          shields_remaining: streakData.streak_shields_available - 1,
        };
        break;
      }

      case 'update_streak_timezone': {
        const v = validateParams(streakTimezoneSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const timezone = v.data.timezone;

        // Validate timezone
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        } catch {
          return new Response(
            JSON.stringify({ error: 'Invalid timezone' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update or create streak record with new timezone
        const { data: existing } = await supabase
          .from('user_streaks')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('user_streaks')
            .update({
              timezone,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('user_streaks')
            .insert({
              user_id: userId,
              timezone,
              current_streak: 0,
              longest_streak: 0,
              streak_shields_available: 1,
              streak_shields_used_this_week: 0,
              total_active_days: 0,
            });

          if (error) throw error;
        }

        result = { success: true, timezone };
        break;
      }

      case 'get_user_streak': {
        const v = validateParams(userIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const targetUserId = v.data.user_id;

        const { data, error } = await supabase
          .from('user_streaks')
          .select('current_streak, longest_streak, total_active_days')
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (error) throw error;
        result = data || { current_streak: 0, longest_streak: 0, total_active_days: 0 };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in health-api:', error);
    const errorMessage = error?.message || 'Internal server error';
    const errorDetails = error?.details || error?.hint || '';
    const errorCode = error?.code || '';
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: errorDetails,
        code: errorCode,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
