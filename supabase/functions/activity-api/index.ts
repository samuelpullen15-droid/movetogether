import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_activity_feed'
  | 'get_activity_feed_profiles'
  | 'get_activity_feed_reactions'
  | 'get_activity_owner'
  | 'add_reaction'
  | 'remove_reaction'
  | 'add_comment';

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
      case 'get_activity_feed': {
        const limit = (params.limit as number) || 20;
        const offset = (params.offset as number) || 0;

        // Get user's friends
        const { data: friendships } = await supabase
          .from('friendships')
          .select('user_id, friend_id')
          .eq('status', 'accepted')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        const friendIds = friendships?.map((f: any) =>
          f.user_id === userId ? f.friend_id : f.user_id
        ) || [];

        // Include self in feed
        const feedUserIds = [userId, ...friendIds];

        const { data, error } = await supabase
          .from('activity_feed')
          .select('*')
          .in('user_id', feedUserIds)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        result = data || [];
        break;
      }

      case 'get_activity_feed_profiles': {
        const userIds = params.user_ids as string[];
        if (!userIds || !Array.isArray(userIds)) {
          return new Response(
            JSON.stringify({ error: 'user_ids array is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', userIds);

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_activity_feed_reactions': {
        const activityIds = params.activity_ids as string[];
        if (!activityIds || !Array.isArray(activityIds)) {
          return new Response(
            JSON.stringify({ error: 'activity_ids array is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('activity_reactions')
          .select('*')
          .in('activity_id', activityIds);

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_activity_owner': {
        const activityId = params.activity_id as string;
        if (!activityId) {
          return new Response(
            JSON.stringify({ error: 'activity_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('activity_feed')
          .select('user_id')
          .eq('id', activityId)
          .single();

        if (error) throw error;
        result = data?.user_id;
        break;
      }

      case 'add_reaction': {
        const activityId = params.activity_id as string;
        const reactionType = params.reaction_type as string;

        if (!activityId || !reactionType) {
          return new Response(
            JSON.stringify({ error: 'activity_id and reaction_type are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if activity exists and user can react (is friend or owner)
        const { data: activity } = await supabase
          .from('activity_feed')
          .select('user_id')
          .eq('id', activityId)
          .single();

        if (!activity) {
          return new Response(
            JSON.stringify({ error: 'Activity not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if already reacted
        const { data: existing } = await supabase
          .from('activity_reactions')
          .select('id')
          .eq('activity_id', activityId)
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          // Update existing reaction
          const { data, error } = await supabase
            .from('activity_reactions')
            .update({ reaction_type: reactionType })
            .eq('id', existing.id)
            .select()
            .single();

          if (error) throw error;
          result = data;
        } else {
          // Insert new reaction
          const { data, error } = await supabase
            .from('activity_reactions')
            .insert({
              activity_id: activityId,
              user_id: userId,
              reaction_type: reactionType,
            })
            .select()
            .single();

          if (error) throw error;
          result = data;
        }
        break;
      }

      case 'remove_reaction': {
        const activityId = params.activity_id as string;
        if (!activityId) {
          return new Response(
            JSON.stringify({ error: 'activity_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('activity_reactions')
          .delete()
          .eq('activity_id', activityId)
          .eq('user_id', userId);

        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'add_comment': {
        const activityId = params.activity_id as string;
        const content = params.content as string;

        if (!activityId || !content) {
          return new Response(
            JSON.stringify({ error: 'activity_id and content are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify activity exists
        const { data: activity } = await supabase
          .from('activity_feed')
          .select('id')
          .eq('id', activityId)
          .single();

        if (!activity) {
          return new Response(
            JSON.stringify({ error: 'Activity not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('activity_comments')
          .insert({
            activity_id: activityId,
            user_id: userId,
            content,
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
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
    console.error('Error in activity-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
