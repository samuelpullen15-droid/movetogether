import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';

// Zod schemas for action params
const userIdParamSchema = z.object({
  user_id: z.string().uuid(),
});

const optionalUserIdSchema = z.object({
  user_id: z.string().uuid().optional(),
});

const timezoneSchema = z.object({
  timezone: z.string().min(1).max(50).refine((tz) => tz.includes('/'), {
    message: 'Invalid timezone format',
  }),
});

const usernameParamSchema = z.object({
  username: z.string().min(1).max(100),
});

const phoneNumberSchema = z.object({
  phone_number: z.string().min(7).max(20),
});

const subscriptionTierSchema = z.object({
  subscription_tier: z.enum(['starter', 'mover', 'crusher']),
});

const userActivityDateSchema = z.object({
  user_id: z.string().uuid(),
  activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const userCompDailyDataSchema = z.object({
  user_id: z.string().uuid(),
  data_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const recentActivitySchema = z.object({
  user_id: z.string().uuid(),
  limit: z.number().int().min(1).max(730).optional().default(365),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('[profile-api] Request received:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('[profile-api] Env vars:', { hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_SERVICE_ROLE_KEY });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse body first to get action
    const body = await req.json();
    const action = body.action;
    console.log('[profile-api] Action:', action);

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
      console.error('[profile-api] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log('[profile-api] Verified user ID:', userId);

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const params = body.params || {};
    let result: unknown;

    switch (action) {
      case 'get_my_profile': {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url, username, phone_number, primary_device, subscription_tier, ai_messages_used, ai_messages_reset_at, onboarding_completed, terms_accepted_at, privacy_accepted_at, guidelines_accepted_at, legal_agreement_version, created_at, updated_at, last_seen_at')
          .eq('id', userId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          return new Response(
            JSON.stringify({ error: 'Profile not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = data;
        break;
      }

      case 'get_user_profile': {
        const v = validateParams(userIdParamSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const targetUserId = v.data.user_id;

        if (userId !== targetUserId) {
          const { data: canView } = await supabase.rpc('can_view_profile', {
            p_viewer_id: userId,
            p_profile_id: targetUserId,
          });
          if (!canView) {
            return new Response(
              JSON.stringify({ error: 'Profile not accessible' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, subscription_tier, created_at, last_seen_at')
          .eq('id', targetUserId)
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'update_last_seen': {
        // Update the user's last_seen_at timestamp
        const { data, error } = await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', userId)
          .select('last_seen_at')
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'update_timezone': {
        const v = validateParams(timezoneSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const timezone = v.data.timezone;

        const { data, error } = await supabase
          .from('profiles')
          .update({ timezone })
          .eq('id', userId)
          .select('timezone')
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'check_username_available': {
        const v = validateParams(usernameParamSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const username = v.data.username;

        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', username)
          .neq('id', userId)
          .maybeSingle();

        result = { available: !existing };
        break;
      }

      case 'get_user_fitness_goals': {
        const v = validateParams(optionalUserIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const targetUserId = v.data.user_id || userId;

        if (targetUserId !== userId) {
          const { data: canView } = await supabase.rpc('can_view_profile', {
            p_viewer_id: userId,
            p_profile_id: targetUserId,
          });
          if (!canView) {
            return new Response(
              JSON.stringify({ error: 'Not accessible' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const { data, error } = await supabase
          .from('user_fitness')
          .select('move_goal, exercise_goal, stand_goal')
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (error) throw error;
        result = data || { move_goal: 500, exercise_goal: 30, stand_goal: 12 };
        break;
      }

      case 'get_user_activity_for_date': {
        const v = validateParams(userActivityDateSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const targetUserId = v.data.user_id;
        const activityDate = v.data.activity_date;

        if (targetUserId !== userId) {
          const { data: canView } = await supabase.rpc('can_view_profile', {
            p_viewer_id: userId,
            p_profile_id: targetUserId,
          });
          if (!canView) {
            return new Response(
              JSON.stringify({ error: 'Not accessible' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const { data, error } = await supabase
          .from('user_activity')
          .select('*')
          .eq('user_id', targetUserId)
          .eq('date', activityDate)
          .maybeSingle();

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_user_competition_daily_data_for_date': {
        const v = validateParams(userCompDailyDataSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const targetUserId = v.data.user_id;
        const dataDate = v.data.data_date;

        const { data, error } = await supabase
          .from('competition_daily_data')
          .select('*')
          .eq('user_id', targetUserId)
          .eq('date', dataDate);

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_user_competition_stats': {
        const v = validateParams(optionalUserIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const targetUserId = v.data.user_id || userId;

        // Get all competitions the user participates in (include name for test filtering)
        const { data: participantData, error } = await supabase
          .from('competition_participants')
          .select('competition_id, total_points, competitions(id, status, name)')
          .eq('user_id', targetUserId);

        if (error) throw error;

        // Filter to only active and completed competitions (exclude pending/cancelled/test)
        const validStatuses = ['active', 'completed'];
        const validParticipations = (participantData || []).filter((p: any) => {
          if (!p.competitions?.status || !validStatuses.includes(p.competitions.status)) {
            return false;
          }
          // Exclude test competitions
          const name = (p.competitions?.name || '').toLowerCase();
          if (name.includes('test')) {
            return false;
          }
          return true;
        });

        // Deduplicate by competition_id (in case of duplicate entries)
        const seenCompetitionIds = new Set<string>();
        const deduplicatedParticipations = validParticipations.filter((p: any) => {
          if (seenCompetitionIds.has(p.competition_id)) {
            return false;
          }
          seenCompetitionIds.add(p.competition_id);
          return true;
        });

        // Calculate total points from ACTIVE competitions only (current points being earned)
        const activeParticipations = deduplicatedParticipations.filter(
          (p: any) => p.competitions?.status === 'active'
        );

        const totalPoints = activeParticipations.reduce(
          (sum: number, p: any) => sum + (Number(p.total_points) || 0),
          0
        );

        // Count only active competitions (currently participating in)
        const competitionsJoined = activeParticipations.length;

        // Count completed competitions and wins
        let competitionsWon = 0;
        const completedCompetitionIds = deduplicatedParticipations
          .filter((p: any) => p.competitions?.status === 'completed')
          .map((p: any) => p.competition_id);

        // For each completed competition, check if user won
        for (const competitionId of completedCompetitionIds) {
          // Get all participants for this competition
          const { data: allParticipants } = await supabase
            .from('competition_participants')
            .select('user_id, total_points')
            .eq('competition_id', competitionId)
            .order('total_points', { ascending: false });

          // Only count as a win if:
          // 1. There were at least 2 participants (winning alone doesn't count)
          // 2. The target user is in first place
          if (
            allParticipants &&
            allParticipants.length >= 2 &&
            allParticipants[0].user_id === targetUserId
          ) {
            competitionsWon++;
          }
        }

        const stats = {
          competitions_joined: competitionsJoined,
          competitions_won: competitionsWon,
          total_points: totalPoints,
        };
        result = stats;
        break;
      }

      case 'get_user_recent_activity': {
        const v = validateParams(recentActivitySchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const targetUserId = v.data.user_id;
        const limit = v.data.limit;

        if (targetUserId !== userId) {
          const { data: canView } = await supabase.rpc('can_view_profile', {
            p_viewer_id: userId,
            p_profile_id: targetUserId,
          });
          if (!canView) {
            return new Response(
              JSON.stringify({ error: 'Not accessible' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const { data, error } = await supabase
          .from('user_activity')
          .select('*')
          .eq('user_id', targetUserId)
          .order('date', { ascending: false })
          .limit(limit);

        if (error) throw error;
        result = data || [];
        break;
      }

      case 'get_user_achievement_progress': {
        const v = validateParams(optionalUserIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const targetUserId = v.data.user_id || userId;

        if (targetUserId !== userId) {
          const { data: canView } = await supabase.rpc('can_view_profile', {
            p_viewer_id: userId,
            p_profile_id: targetUserId,
          });
          if (!canView) {
            return new Response(
              JSON.stringify({ error: 'Not accessible' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const { data, error } = await supabase
          .from('user_achievement_progress')
          .select('*')
          .eq('user_id', targetUserId);

        if (error) throw error;
        result = data || [];
        break;
      }

      case 'update_phone_verified': {
        const v = validateParams(phoneNumberSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const phoneNumber = v.data.phone_number;
        const { error } = await supabase
          .from('profiles')
          .update({
            phone_number: phoneNumber,
            phone_verified: true,
            phone_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'save_phone_number': {
        const v = validateParams(phoneNumberSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const phoneNumber = v.data.phone_number;
        const { error } = await supabase
          .from('profiles')
          .update({
            phone_number: phoneNumber,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'get_phone_status': {
        const { data, error } = await supabase
          .from('profiles')
          .select('phone_verified')
          .eq('id', userId)
          .single();
        if (error) throw error;
        result = { phone_verified: data?.phone_verified === true };
        break;
      }

      case 'revoke_phone': {
        const { error } = await supabase
          .from('profiles')
          .update({
            phone_number: null,
            phone_verified: false,
            phone_verified_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'update_subscription_tier': {
        const v = validateParams(subscriptionTierSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const subscriptionTier = v.data.subscription_tier;
        const { error } = await supabase
          .from('profiles')
          .update({ subscription_tier: subscriptionTier })
          .eq('id', userId);
        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'complete_onboarding': {
        const { error } = await supabase
          .from('profiles')
          .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq('id', userId);
        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'reset_onboarding': {
        const { error } = await supabase
          .from('profiles')
          .update({ onboarding_completed: false, updated_at: new Date().toISOString() })
          .eq('id', userId);
        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'get_fair_play_status': {
        const { data, error } = await supabase
          .from('profiles')
          .select('fair_play_acknowledged')
          .eq('id', userId)
          .single();
        if (error) throw error;
        result = { fair_play_acknowledged: data?.fair_play_acknowledged === true };
        break;
      }

      case 'acknowledge_fair_play': {
        const { error } = await supabase
          .from('profiles')
          .update({
            fair_play_acknowledged: true,
            fair_play_acknowledged_at: new Date().toISOString(),
          })
          .eq('id', userId);
        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'get_coach_intro_status': {
        const { data, error } = await supabase
          .from('profiles')
          .select('coach_spark_intro_seen')
          .eq('id', userId)
          .single();
        if (error) throw error;
        result = { coach_spark_intro_seen: data?.coach_spark_intro_seen === true };
        break;
      }

      case 'update_coach_intro_seen': {
        const { error } = await supabase
          .from('profiles')
          .update({
            coach_spark_intro_seen: true,
            coach_spark_intro_seen_at: new Date().toISOString(),
          })
          .eq('id', userId);
        if (error) throw error;
        result = { success: true };
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
    console.error('[profile-api] Error:', error);
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
