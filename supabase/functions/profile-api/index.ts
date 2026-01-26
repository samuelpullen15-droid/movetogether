import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const body = await req.json();
    const action = body.action;
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
        const targetUserId = params.user_id as string;
        if (!targetUserId) {
          return new Response(
            JSON.stringify({ error: 'user_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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

      case 'check_username_available': {
        const username = params.username as string;
        if (!username) {
          return new Response(
            JSON.stringify({ error: 'username is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
        const targetUserId = (params.user_id as string) || userId;

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
        const targetUserId = params.user_id as string;
        const activityDate = params.activity_date as string;

        if (!targetUserId || !activityDate) {
          return new Response(
            JSON.stringify({ error: 'user_id and activity_date are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
        const targetUserId = params.user_id as string;
        const dataDate = params.data_date as string;

        if (!targetUserId || !dataDate) {
          return new Response(
            JSON.stringify({ error: 'user_id and data_date are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
        const targetUserId = (params.user_id as string) || userId;

        const { data, error } = await supabase
          .from('competition_participants')
          .select('competition_id, total_points, competitions(status)')
          .eq('user_id', targetUserId);

        if (error) throw error;

        const stats = {
          total_competitions: data?.length || 0,
          completed_competitions: data?.filter((p: any) => p.competitions?.status === 'completed').length || 0,
          wins: 0,
        };
        result = stats;
        break;
      }

      case 'get_user_recent_activity': {
        const targetUserId = params.user_id as string;
        const limit = (params.limit as number) || 365;

        if (!targetUserId) {
          return new Response(
            JSON.stringify({ error: 'user_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
        const targetUserId = (params.user_id as string) || userId;

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
  } catch (error) {
    const errorObj = error as any;
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        code: errorObj?.code,
        details: errorObj?.details,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
