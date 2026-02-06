import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';

// Zod schemas for action params
const otherUserIdSchema = z.object({
  other_user_id: z.string().uuid(),
});

const recipientIdSchema = z.object({
  recipient_id: z.string().uuid(),
});

const acceptFriendshipSchema = z.object({
  request_id: z.string().uuid().optional(),
  friend_id: z.string().uuid().optional(),
}).refine((d) => d.request_id || d.friend_id, {
  message: 'request_id or friend_id is required',
});

const removeFriendshipSchema = z.object({
  friendship_id: z.string().uuid().optional(),
  friend_id: z.string().uuid().optional(),
}).refine((d) => d.friendship_id || d.friend_id, {
  message: 'friendship_id or friend_id is required',
});

const blockedUserIdSchema = z.object({
  blocked_user_id: z.string().uuid(),
});

const targetDateSchema = z.object({
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_my_friends'
  | 'get_pending_friend_requests'
  | 'get_sent_friend_requests'
  | 'check_are_friends'
  | 'create_friendship'
  | 'accept_friendship'
  | 'remove_friendship'
  | 'get_my_blocked_friendships'
  | 'block_user'
  | 'get_friends_daily_leaderboard';

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
      case 'get_my_friends': {
        // Get friendships where current user is either user_id or friend_id with status 'accepted'
        const { data: friendships, error } = await supabase
          .from('friendships')
          .select('id, user_id, friend_id, status, created_at')
          .eq('status', 'accepted')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        if (error) throw error;

        // Get friend IDs
        const friendIds = friendships?.map((f: any) =>
          f.user_id === userId ? f.friend_id : f.user_id
        ) || [];

        // Get friend profiles (include last_seen_at for active status)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, last_seen_at, subscription_tier')
          .in('id', friendIds);

        const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

        result = friendships?.map((f: any) => {
          const friendId = f.user_id === userId ? f.friend_id : f.user_id;
          const profile = profileMap.get(friendId);
          return {
            friendship_id: f.id,
            friend_id: friendId,
            username: profile?.username,
            full_name: profile?.full_name,
            avatar_url: profile?.avatar_url,
            last_seen_at: profile?.last_seen_at,
            subscription_tier: profile?.subscription_tier || null,
            created_at: f.created_at,
          };
        });
        break;
      }

      case 'get_pending_friend_requests': {
        // Incoming requests where current user is friend_id
        const { data: requests, error } = await supabase
          .from('friendships')
          .select('id, user_id, created_at')
          .eq('friend_id', userId)
          .eq('status', 'pending');

        if (error) throw error;

        const senderIds = requests?.map((r: any) => r.user_id) || [];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', senderIds);

        const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

        result = requests?.map((r: any) => ({
          request_id: r.id,
          sender_id: r.user_id,
          username: profileMap.get(r.user_id)?.username,
          full_name: profileMap.get(r.user_id)?.full_name,
          avatar_url: profileMap.get(r.user_id)?.avatar_url,
          created_at: r.created_at,
        }));
        break;
      }

      case 'get_sent_friend_requests': {
        // Outgoing requests where current user is user_id
        const { data: requests, error } = await supabase
          .from('friendships')
          .select('id, friend_id, created_at')
          .eq('user_id', userId)
          .eq('status', 'pending');

        if (error) throw error;

        const recipientIds = requests?.map((r: any) => r.friend_id) || [];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', recipientIds);

        const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

        result = requests?.map((r: any) => ({
          request_id: r.id,
          recipient_id: r.friend_id,
          username: profileMap.get(r.friend_id)?.username,
          full_name: profileMap.get(r.friend_id)?.full_name,
          avatar_url: profileMap.get(r.friend_id)?.avatar_url,
          created_at: r.created_at,
        }));
        break;
      }

      case 'check_are_friends': {
        const v = validateParams(otherUserIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const otherUserId = v.data.other_user_id;

        const { data } = await supabase
          .from('friendships')
          .select('id')
          .eq('status', 'accepted')
          .or(`and(user_id.eq.${userId},friend_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},friend_id.eq.${userId})`)
          .maybeSingle();

        result = { are_friends: !!data };
        break;
      }

      case 'create_friendship': {
        const v = validateParams(recipientIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const recipientId = v.data.recipient_id;

        // Rate limit: 20 friend requests per hour
        if (!checkRateLimit(userId, 'create_friendship', RATE_LIMITS.CREATE_FRIENDSHIP.maxRequests, RATE_LIMITS.CREATE_FRIENDSHIP.windowMs)) {
          return rateLimitResponse(corsHeaders);
        }

        if (userId === recipientId) {
          return new Response(
            JSON.stringify({ error: 'Cannot send friend request to yourself' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check existing friendship
        const { data: existing } = await supabase
          .from('friendships')
          .select('id, status')
          .or(`and(user_id.eq.${userId},friend_id.eq.${recipientId}),and(user_id.eq.${recipientId},friend_id.eq.${userId})`)
          .maybeSingle();

        if (existing) {
          if (existing.status === 'accepted') {
            return new Response(
              JSON.stringify({ error: 'Already friends' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          if (existing.status === 'pending') {
            return new Response(
              JSON.stringify({ error: 'Request already pending' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          if (existing.status === 'blocked') {
            return new Response(
              JSON.stringify({ error: 'Cannot send request' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const { data, error } = await supabase
          .from('friendships')
          .insert({
            user_id: userId,
            friend_id: recipientId,
            status: 'pending',
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'accept_friendship': {
        const v = validateParams(acceptFriendshipSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const requestId = v.data.request_id;
        const friendId = v.data.friend_id;

        let friendshipId: string;

        if (requestId) {
          // Find by request ID - verify user is the recipient
          const { data: request } = await supabase
            .from('friendships')
            .select('id, friend_id, status')
            .eq('id', requestId)
            .single();

          if (!request || request.friend_id !== userId) {
            return new Response(
              JSON.stringify({ error: 'Request not found' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (request.status !== 'pending') {
            return new Response(
              JSON.stringify({ error: 'Request is not pending' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          friendshipId = request.id;
        } else {
          // Find by friend_id - the sender of the request
          // Current user (userId) is the recipient, friendId is the sender
          const { data: request } = await supabase
            .from('friendships')
            .select('id, status')
            .eq('user_id', friendId)
            .eq('friend_id', userId)
            .eq('status', 'pending')
            .single();

          if (!request) {
            return new Response(
              JSON.stringify({ error: 'Request not found' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          friendshipId = request.id;
        }

        const { data, error } = await supabase
          .from('friendships')
          .update({ status: 'accepted' })
          .eq('id', friendshipId)
          .select()
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'remove_friendship': {
        const v = validateParams(removeFriendshipSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const friendshipId = v.data.friendship_id;
        const friendId = v.data.friend_id;

        let query = supabase.from('friendships').delete();

        if (friendshipId) {
          // Verify user is part of the friendship
          const { data: friendship } = await supabase
            .from('friendships')
            .select('user_id, friend_id')
            .eq('id', friendshipId)
            .single();

          if (!friendship || (friendship.user_id !== userId && friendship.friend_id !== userId)) {
            return new Response(
              JSON.stringify({ error: 'Friendship not found' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          query = query.eq('id', friendshipId);
        } else {
          query = query.or(
            `and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`
          );
        }

        const { error } = await query;
        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'get_my_blocked_friendships': {
        const { data, error } = await supabase
          .from('friendships')
          .select('id, friend_id, created_at')
          .eq('user_id', userId)
          .eq('status', 'blocked');

        if (error) throw error;

        const blockedIds = data?.map((b: any) => b.friend_id) || [];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', blockedIds);

        const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

        result = data?.map((b: any) => ({
          id: b.id,
          blocked_user_id: b.friend_id,
          username: profileMap.get(b.friend_id)?.username,
          full_name: profileMap.get(b.friend_id)?.full_name,
          avatar_url: profileMap.get(b.friend_id)?.avatar_url,
          created_at: b.created_at,
        }));
        break;
      }

      case 'block_user': {
        const v = validateParams(blockedUserIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const blockedUserId = v.data.blocked_user_id;

        if (userId === blockedUserId) {
          return new Response(
            JSON.stringify({ error: 'Cannot block yourself' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Step 1: Delete any pending or accepted friendships between the two users (either direction)
        await supabase
          .from('friendships')
          .delete()
          .in('status', ['pending', 'accepted'])
          .or(`and(user_id.eq.${userId},friend_id.eq.${blockedUserId}),and(user_id.eq.${blockedUserId},friend_id.eq.${userId})`);

        // Step 2: Check if a block record already exists from the current user
        const { data: existingBlock } = await supabase
          .from('friendships')
          .select('id')
          .eq('user_id', userId)
          .eq('friend_id', blockedUserId)
          .eq('status', 'blocked')
          .maybeSingle();

        // Step 3: If no block record exists, create one
        if (!existingBlock) {
          const { error: insertError } = await supabase
            .from('friendships')
            .insert({
              user_id: userId,
              friend_id: blockedUserId,
              status: 'blocked',
            });

          if (insertError) throw insertError;
        }

        result = { success: true };
        break;
      }

      case 'get_friends_daily_leaderboard': {
        const v = validateParams(targetDateSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        // IMPORTANT: Activity data is stored using the client's LOCAL date (not UTC).
        // The client should always pass target_date based on its local timezone.
        // If no date is provided, we log a warning since UTC fallback may be wrong
        // for users in western timezones after ~4pm local time.
        let targetDate = v.data.target_date;
        if (!targetDate) {
          const now = new Date();
          targetDate = now.toISOString().split('T')[0];
          console.log(`[friends-api] WARNING: No target_date provided for leaderboard, using UTC: ${targetDate}`);
        }

        // Get accepted friendships (excluding blocked)
        const { data: friendships } = await supabase
          .from('friendships')
          .select('user_id, friend_id, status')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        const friendIds: string[] = [];
        const blockedIds = new Set<string>();

        (friendships || []).forEach((f: any) => {
          const otherId = f.user_id === userId ? f.friend_id : f.user_id;
          if (f.status === 'accepted') {
            friendIds.push(otherId);
          } else if (f.status === 'blocked') {
            blockedIds.add(otherId);
          }
        });

        // Include self, exclude blocked
        const leaderboardUserIds = [userId, ...friendIds].filter((id) => !blockedIds.has(id));

        if (leaderboardUserIds.length === 0) {
          result = [];
          break;
        }

        // Fetch activity data, fitness goals, and profiles in parallel
        const [activityResult, fitnessResult, profilesResult] = await Promise.all([
          supabase
            .from('user_activity')
            .select('user_id, move_calories, exercise_minutes, stand_hours')
            .in('user_id', leaderboardUserIds)
            .eq('date', targetDate),
          supabase
            .from('user_fitness')
            .select('user_id, move_goal, exercise_goal, stand_goal')
            .in('user_id', leaderboardUserIds),
          supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url, subscription_tier')
            .in('id', leaderboardUserIds),
        ]);

        const activityMap = new Map(
          (activityResult.data || []).map((a: any) => [a.user_id, a])
        );
        const fitnessMap = new Map(
          (fitnessResult.data || []).map((f: any) => [f.user_id, f])
        );
        const profileMap = new Map(
          (profilesResult.data || []).map((p: any) => [p.id, p])
        );

        // Default goals
        const DEFAULT_MOVE_GOAL = 500;
        const DEFAULT_EXERCISE_GOAL = 30;
        const DEFAULT_STAND_GOAL = 12;

        // Calculate scores for each user
        const entries = leaderboardUserIds.map((uid) => {
          const activity = activityMap.get(uid);
          const fitness = fitnessMap.get(uid);
          const profile = profileMap.get(uid);

          const moveCalories = activity?.move_calories || 0;
          const exerciseMinutes = activity?.exercise_minutes || 0;
          const standHours = activity?.stand_hours || 0;

          const moveGoal = fitness?.move_goal || DEFAULT_MOVE_GOAL;
          const exerciseGoal = fitness?.exercise_goal || DEFAULT_EXERCISE_GOAL;
          const standGoal = fitness?.stand_goal || DEFAULT_STAND_GOAL;

          const movePercentage = Math.min((moveCalories / moveGoal) * 100, 100);
          const exercisePercentage = Math.min((exerciseMinutes / exerciseGoal) * 100, 100);
          const standPercentage = Math.min((standHours / standGoal) * 100, 100);

          const dailyScore = (movePercentage + exercisePercentage + standPercentage) / 3;
          const ringsClosed = [movePercentage, exercisePercentage, standPercentage]
            .filter((p) => p >= 100).length;

          return {
            user_id: uid,
            full_name: profile?.full_name || null,
            username: profile?.username || null,
            avatar_url: profile?.avatar_url || null,
            subscription_tier: profile?.subscription_tier || 'starter',
            daily_score: Math.round(dailyScore * 10) / 10,
            rings_closed: ringsClosed,
            move_percentage: Math.round(movePercentage * 10) / 10,
            exercise_percentage: Math.round(exercisePercentage * 10) / 10,
            stand_percentage: Math.round(standPercentage * 10) / 10,
            is_self: uid === userId,
          };
        });

        // Sort by score descending, ties broken alphabetically
        entries.sort((a, b) => {
          if (b.daily_score !== a.daily_score) return b.daily_score - a.daily_score;
          const nameA = (a.full_name || a.username || '').toLowerCase();
          const nameB = (b.full_name || b.username || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });

        // Assign ranks
        result = entries.map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));
        break;
      }

      case 'count_blocked': {
        const { count, error } = await supabase
          .from('friendships')
          .select('id', { count: 'exact', head: true })
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
          .eq('status', 'blocked');

        if (error) throw error;
        result = { count: count || 0 };
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
    console.error('Error in friends-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
