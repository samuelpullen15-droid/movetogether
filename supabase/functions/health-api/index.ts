import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_my_fitness_goals'
  | 'get_my_weight_settings'
  | 'upsert_my_fitness'
  | 'check_activity_exists_today'
  | 'check_streak_milestone_exists';

interface RequestBody {
  action: Action;
  params?: Record<string, unknown>;
}

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

    // Extract JWT token from Bearer header
    const token = authHeader.replace('Bearer ', '');

    // Create admin client and verify JWT
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const { action, params = {} }: RequestBody = await req.json();

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
        const fitnessData = params as Record<string, unknown>;

        // Remove action from params if accidentally included
        delete fitnessData.action;

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
        const activityType = params.activity_type as string;

        if (!activityType) {
          return new Response(
            JSON.stringify({ error: 'activity_type is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
        const streakDays = params.streak_days as number;

        if (streakDays === undefined) {
          return new Response(
            JSON.stringify({ error: 'streak_days is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
    console.error('Error in health-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
