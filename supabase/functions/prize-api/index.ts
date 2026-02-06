import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';

// Zod schemas for action params
const markPrizeSeenSchema = z.object({
  payout_id: z.string().uuid(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_my_prize_payouts'
  | 'mark_prize_seen';

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

    // Verify JWT
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
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
      case 'get_my_prize_payouts': {
        // Fetch all prize payouts for the authenticated user with competition details
        const { data, error } = await supabase
          .from('prize_payouts')
          .select(`
            id,
            competition_id,
            placement,
            payout_amount,
            status,
            claim_status,
            chosen_reward_type,
            claim_expires_at,
            recipient_email,
            seen_by_winner,
            created_at,
            competitions (
              name
            )
          `)
          .eq('winner_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[prize-api] Error fetching prize payouts:', error);
          throw error;
        }

        result = data || [];
        break;
      }

      case 'mark_prize_seen': {
        const validated = validateParams(markPrizeSeenSchema, params);
        if (!validated.success) {
          return validationErrorResponse(validated.error, corsHeaders);
        }
        const payoutId = validated.data.payout_id;

        // Only allow marking as seen if the payout belongs to the authenticated user
        const { error: updateError } = await supabase
          .from('prize_payouts')
          .update({
            seen_by_winner: true,
            seen_at: new Date().toISOString(),
          })
          .eq('id', payoutId)
          .eq('winner_id', userId);

        if (updateError) {
          console.error('[prize-api] Error marking prize as seen:', updateError);
          throw updateError;
        }

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
    console.error('Error in prize-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
