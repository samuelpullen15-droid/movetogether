import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_my_notification_preferences'
  | 'upsert_my_notification_preferences'
  | 'get_my_privacy_settings'
  | 'upsert_my_privacy_settings';

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
      case 'get_my_notification_preferences': {
        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;

        // Return defaults if no preferences exist
        result = data || {
          user_id: userId,
          competition_updates: true,
          friend_requests: true,
          achievement_alerts: true,
          daily_reminders: true,
          weekly_summaries: true,
        };
        break;
      }

      case 'upsert_my_notification_preferences': {
        const preferences = params as Record<string, unknown>;
        delete preferences.action;

        const { data: existing } = await supabase
          .from('notification_preferences')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          const { data, error } = await supabase
            .from('notification_preferences')
            .update({ ...preferences, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .select()
            .single();

          if (error) throw error;
          result = data;
        } else {
          const { data, error } = await supabase
            .from('notification_preferences')
            .insert({ user_id: userId, ...preferences })
            .select()
            .single();

          if (error) throw error;
          result = data;
        }
        break;
      }

      case 'get_my_privacy_settings': {
        const { data, error } = await supabase
          .from('privacy_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;

        // Return defaults if no settings exist
        result = data || {
          user_id: userId,
          profile_visibility: 'public',
          show_detailed_stats: true,
          allow_friend_requests: 'everyone',
          show_activity_feed: true,
        };
        break;
      }

      case 'upsert_my_privacy_settings': {
        const settings = params as Record<string, unknown>;
        delete settings.action;

        const { data: existing } = await supabase
          .from('privacy_settings')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          const { data, error } = await supabase
            .from('privacy_settings')
            .update({ ...settings, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .select()
            .single();

          if (error) throw error;
          result = data;
        } else {
          const { data, error } = await supabase
            .from('privacy_settings')
            .insert({ user_id: userId, ...settings })
            .select()
            .single();

          if (error) throw error;
          result = data;
        }
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
    console.error('Error in settings-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
