import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'search_users'
  | 'search_users_by_emails'
  | 'search_users_by_phones';

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

    // Helper to check if users are friends
    const areFriends = async (userId1: string, userId2: string): Promise<boolean> => {
      const { data } = await supabase
        .from('friendships')
        .select('id')
        .eq('status', 'accepted')
        .or(`and(user_id.eq.${userId1},friend_id.eq.${userId2}),and(user_id.eq.${userId2},friend_id.eq.${userId1})`)
        .maybeSingle();
      return !!data;
    };

    // Helper to get all bidirectional blocked user IDs for the current user
    const getBlockedUserIds = async (): Promise<Set<string>> => {
      const { data: blocks } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .eq('status', 'blocked')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

      const blockedIds = new Set<string>();
      (blocks || []).forEach((b: any) => {
        if (b.user_id === userId) blockedIds.add(b.friend_id);
        if (b.friend_id === userId) blockedIds.add(b.user_id);
      });
      return blockedIds;
    };

    // Helper to filter users by privacy settings
    const filterByPrivacy = async (users: any[]): Promise<any[]> => {
      if (!users || users.length === 0) return [];

      const userIds = users.map((u: any) => u.id);
      const [{ data: privacySettings }, blockedIds] = await Promise.all([
        supabase
          .from('privacy_settings')
          .select('user_id, profile_visibility')
          .in('user_id', userIds),
        getBlockedUserIds(),
      ]);

      const privacyMap = new Map(
        privacySettings?.map((p: any) => [p.user_id, p.profile_visibility]) || []
      );

      const filteredUsers = [];
      for (const u of users) {
        if (u.id === userId) continue; // Exclude self

        // Check bidirectional block (either user blocked the other)
        if (blockedIds.has(u.id)) continue;

        const visibility = privacyMap.get(u.id) || 'public';

        if (visibility === 'public') {
          filteredUsers.push(u);
        } else if (visibility === 'friends_only' || visibility === 'private') {
          const friends = await areFriends(userId, u.id);
          if (friends) filteredUsers.push(u);
        }
      }

      return filteredUsers;
    };

    switch (action) {
      case 'search_users': {
        const query = params.query as string;
        const limit = (params.limit as number) || 20;

        if (!query || query.length < 2) {
          return new Response(
            JSON.stringify({ error: 'Query must be at least 2 characters' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const searchPattern = `%${query.toLowerCase()}%`;

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, email, subscription_tier')
          .or(`username.ilike.${searchPattern},full_name.ilike.${searchPattern},phone_number.ilike.${searchPattern}`)
          .neq('id', userId)
          .limit(limit * 2); // Fetch extra to account for privacy filtering

        if (error) throw error;

        const filtered = await filterByPrivacy(data || []);
        result = filtered.slice(0, limit);
        break;
      }

      case 'search_users_by_emails': {
        const emails = params.emails as string[];
        const limit = (params.limit as number) || 50;

        if (!emails || !Array.isArray(emails) || emails.length === 0) {
          return new Response(
            JSON.stringify({ error: 'emails array is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const lowerEmails = emails.map((e: string) => e.toLowerCase());

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, email, subscription_tier')
          .in('email', lowerEmails)
          .neq('id', userId)
          .limit(limit * 2);

        if (error) throw error;

        const filtered = await filterByPrivacy(data || []);
        result = filtered.slice(0, limit);
        break;
      }

      case 'search_users_by_phones': {
        const phones = params.phones as string[];
        const limit = (params.limit as number) || 50;

        if (!phones || !Array.isArray(phones) || phones.length === 0) {
          return new Response(
            JSON.stringify({ error: 'phones array is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, email, subscription_tier')
          .in('phone_number', phones)
          .neq('id', userId)
          .limit(limit * 2);

        if (error) throw error;

        const filtered = await filterByPrivacy(data || []);
        result = filtered.slice(0, limit);
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
    console.error('Error in search-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
