import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
  | 'get_my_blocked_friendships';

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

        // Get friend profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
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
        const otherUserId = params.other_user_id as string;
        if (!otherUserId) {
          return new Response(
            JSON.stringify({ error: 'other_user_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
        const recipientId = params.recipient_id as string;
        if (!recipientId) {
          return new Response(
            JSON.stringify({ error: 'recipient_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
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
        // Support both request_id and friend_id patterns
        const requestId = params.request_id as string;
        const friendId = params.friend_id as string;

        if (!requestId && !friendId) {
          return new Response(
            JSON.stringify({ error: 'request_id or friend_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
        const friendshipId = params.friendship_id as string;
        const friendId = params.friend_id as string;

        if (!friendshipId && !friendId) {
          return new Response(
            JSON.stringify({ error: 'friendship_id or friend_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
