import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';

// Zod schemas for action params
const getActivityFeedSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

const userIdsSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(200),
});

const activityIdsSchema = z.object({
  activity_ids: z.array(z.string().uuid()).min(1).max(200),
});

const activityIdSchema = z.object({
  activity_id: z.string().uuid(),
});

const addReactionSchema = z.object({
  activity_id: z.string().uuid(),
  reaction_type: z.string().min(1).max(50),
});

const addCommentSchema = z.object({
  activity_id: z.string().uuid(),
  content: z.string().min(1).max(2000).transform((s) => s.trim()),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_activity_feed'
  | 'get_activity_feed_profiles'
  | 'get_activity_feed_reactions'
  | 'get_activity_comments'
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
        const v = validateParams(getActivityFeedSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const limit = v.data.limit;
        const offset = v.data.offset;

        // Get user's friends (accepted only)
        const { data: friendships } = await supabase
          .from('friendships')
          .select('user_id, friend_id, status')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        // Build friend IDs (accepted) and blocked IDs (bidirectional)
        const friendIds: string[] = [];
        const blockedUserIds = new Set<string>();

        (friendships || []).forEach((f: any) => {
          const otherId = f.user_id === userId ? f.friend_id : f.user_id;
          if (f.status === 'accepted') {
            friendIds.push(otherId);
          } else if (f.status === 'blocked') {
            // Bidirectional: block applies regardless of who initiated
            blockedUserIds.add(otherId);
          }
        });

        // Include self in feed, exclude blocked users
        const feedUserIds = [userId, ...friendIds].filter((id) => !blockedUserIds.has(id));

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
        const v = validateParams(userIdsSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const userIds = v.data.user_ids;

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', userIds);

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_activity_feed_reactions': {
        const v = validateParams(activityIdsSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const activityIds = v.data.activity_ids;

        const { data, error } = await supabase
          .from('activity_reactions')
          .select('*')
          .in('activity_id', activityIds);

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_activity_owner': {
        const v = validateParams(activityIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const activityId = v.data.activity_id;

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
        const v = validateParams(addReactionSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const activityId = v.data.activity_id;
        const reactionType = v.data.reaction_type;

        // Rate limit: 30 reactions per minute
        if (!checkRateLimit(userId, 'add_reaction', RATE_LIMITS.ADD_REACTION.maxRequests, RATE_LIMITS.ADD_REACTION.windowMs)) {
          return rateLimitResponse(corsHeaders);
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
        const v = validateParams(activityIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const activityId = v.data.activity_id;

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
        const v = validateParams(addCommentSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const activityId = v.data.activity_id;
        const content = v.data.content;

        // Rate limit: 30 comments per minute
        if (!checkRateLimit(userId, 'add_comment', RATE_LIMITS.ADD_COMMENT.maxRequests, RATE_LIMITS.ADD_COMMENT.windowMs)) {
          return rateLimitResponse(corsHeaders);
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

      case 'get_activity_comments': {
        const v = validateParams(activityIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const activityId = v.data.activity_id;

        const { data: comments, error: commentsError } = await supabase
          .from('activity_comments')
          .select('id, user_id, content, created_at')
          .eq('activity_id', activityId)
          .order('created_at', { ascending: true });

        if (commentsError) throw commentsError;

        // Enrich with user profiles
        if (comments && comments.length > 0) {
          const commentUserIds = [...new Set(comments.map((c: any) => c.user_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', commentUserIds);

          const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
          result = comments.map((c: any) => ({
            ...c,
            user: profileMap.get(c.user_id) || null,
          }));
        } else {
          result = [];
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
    console.error('Error in activity-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
