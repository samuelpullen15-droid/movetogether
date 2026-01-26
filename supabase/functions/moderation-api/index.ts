import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_active_suspension'
  | 'has_active_suspension'
  | 'get_unacknowledged_warning'
  | 'has_unacknowledged_warnings'
  | 'acknowledge_warning';

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
      case 'get_active_suspension': {
        const now = new Date().toISOString();

        const { data, error } = await supabase
          .from('account_suspensions')
          .select('*')
          .eq('user_id', userId)
          .is('lifted_at', null)
          .lte('starts_at', now)
          .or(`ends_at.is.null,ends_at.gt.${now}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        result = data;
        break;
      }

      case 'has_active_suspension': {
        const checkUserId = (params.user_id as string) || userId;

        // Only allow checking own suspension
        if (checkUserId !== userId) {
          return new Response(
            JSON.stringify({ error: 'Cannot check suspension for another user' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const now = new Date().toISOString();

        const { data } = await supabase
          .from('account_suspensions')
          .select('id')
          .eq('user_id', userId)
          .is('lifted_at', null)
          .lte('starts_at', now)
          .or(`ends_at.is.null,ends_at.gt.${now}`)
          .limit(1)
          .maybeSingle();

        result = !!data;
        break;
      }

      case 'get_unacknowledged_warning': {
        const { data, error } = await supabase
          .from('account_warnings')
          .select('*')
          .eq('user_id', userId)
          .is('acknowledged_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        result = data;
        break;
      }

      case 'has_unacknowledged_warnings': {
        const checkUserId = (params.user_id as string) || userId;

        // Only allow checking own warnings
        if (checkUserId !== userId) {
          return new Response(
            JSON.stringify({ error: 'Cannot check warnings for another user' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data } = await supabase
          .from('account_warnings')
          .select('id')
          .eq('user_id', userId)
          .is('acknowledged_at', null)
          .limit(1)
          .maybeSingle();

        result = !!data;
        break;
      }

      case 'acknowledge_warning': {
        const warningId = params.warning_id as string;
        if (!warningId) {
          return new Response(
            JSON.stringify({ error: 'warning_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify warning belongs to user
        const { data: warning } = await supabase
          .from('account_warnings')
          .select('id, user_id')
          .eq('id', warningId)
          .single();

        if (!warning || warning.user_id !== userId) {
          return new Response(
            JSON.stringify({ error: 'Warning not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('account_warnings')
          .update({ acknowledged_at: new Date().toISOString() })
          .eq('id', warningId);

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
  } catch (error) {
    console.error('Error in moderation-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
