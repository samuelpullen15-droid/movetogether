import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'get_invite_code' | 'join_by_invite' | 'get_competition_by_invite';

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
    const token = authHeader?.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Some actions require authentication, some don't
    let userId: string | null = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { action, params = {} }: RequestBody = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: unknown;

    switch (action) {
      case 'get_invite_code': {
        // Requires authentication
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is a participant in the competition
        const { data: participant } = await supabase
          .from('competition_participants')
          .select('id')
          .eq('competition_id', competitionId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!participant) {
          return new Response(
            JSON.stringify({ error: 'Not a participant in this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get or create invite code using database function
        const { data, error } = await supabase.rpc('get_or_create_invite_code', {
          p_competition_id: competitionId,
        });

        if (error) throw error;
        result = { invite_code: data };
        break;
      }

      case 'get_competition_by_invite': {
        // Does NOT require authentication - used for preview before joining
        const inviteCode = (params.invite_code as string)?.toUpperCase();
        if (!inviteCode) {
          return new Response(
            JSON.stringify({ error: 'invite_code is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: competition, error } = await supabase
          .from('competitions')
          .select(`
            id,
            name,
            description,
            start_date,
            end_date,
            status,
            scoring_type,
            max_participants,
            is_public,
            created_by
          `)
          .eq('invite_code', inviteCode)
          .single();

        if (error || !competition) {
          return new Response(
            JSON.stringify({ error: 'Invalid invite code' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get participant count
        const { count } = await supabase
          .from('competition_participants')
          .select('id', { count: 'exact', head: true })
          .eq('competition_id', competition.id);

        // Get creator info
        const { data: creator } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', competition.created_by)
          .single();

        result = {
          ...competition,
          participant_count: count || 0,
          creator_name: creator?.full_name || creator?.username || 'Unknown',
        };
        break;
      }

      case 'join_by_invite': {
        // Requires authentication
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const inviteCode = (params.invite_code as string)?.toUpperCase();
        const skipBuyIn = params.skip_buy_in === true;
        if (!inviteCode) {
          return new Response(
            JSON.stringify({ error: 'invite_code is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check for buy-in prize pool before joining
        const { data: compByCode } = await supabase
          .from('competitions')
          .select('id')
          .eq('invite_code', inviteCode)
          .maybeSingle();

        if (compByCode) {
          const { data: buyInPool } = await supabase
            .from('prize_pools')
            .select('id, buy_in_amount')
            .eq('competition_id', compByCode.id)
            .eq('status', 'active')
            .eq('pool_type', 'buy_in')
            .maybeSingle();

          if (buyInPool) {
            if (skipBuyIn) {
              // Join without paying — not prize eligible
              const { error: skipError } = await supabase
                .from('competition_participants')
                .insert({
                  competition_id: compByCode.id,
                  user_id: userId,
                  prize_eligible: false,
                });

              if (skipError) throw skipError;
              result = { success: true, competition_id: compByCode.id };
              break;
            }

            result = {
              requires_buy_in: true,
              buy_in_amount: parseFloat(buyInPool.buy_in_amount),
              competition_id: compByCode.id,
            };
            break;
          }
        }

        // Use database function to join
        const { data, error } = await supabase.rpc('join_competition_by_invite', {
          p_invite_code: inviteCode,
        });

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
    console.error('Error in invite-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
