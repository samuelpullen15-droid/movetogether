import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_my_invitations'
  | 'get_invitation_competition_id'
  | 'accept_competition_invitation'
  | 'decline_competition_invitation'
  | 'get_existing_invitation_invitees'
  | 'get_inviter_info'
  | 'create_invitations'
  | 'get_competition_name';

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
      case 'get_my_invitations': {
        console.log('[invitation-api] get_my_invitations START for user:', userId);

        // Step 1: Query invitations
        console.log('[invitation-api] Step 1: Querying competition_invitations...');
        const { data: invitations, error: invError } = await supabase
          .from('competition_invitations')
          .select('id, competition_id, inviter_id, status, invited_at')
          .eq('invitee_id', userId)
          .eq('status', 'pending');

        if (invError) {
          console.error('[invitation-api] Step 1 FAILED:', invError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch invitations', details: invError.message, code: invError.code }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log('[invitation-api] Step 1 SUCCESS: found', invitations?.length || 0, 'invitations');

        if (!invitations || invitations.length === 0) {
          console.log('[invitation-api] No invitations, returning empty array');
          result = [];
          break;
        }

        // Step 2: Get competition details
        const competitionIds = [...new Set(invitations.map((i: any) => i.competition_id))];
        console.log('[invitation-api] Step 2: Fetching competitions for IDs:', competitionIds);

        const { data: competitions, error: compError } = await supabase
          .from('competitions')
          .select('id, name, start_date, end_date, type, status')
          .in('id', competitionIds);

        if (compError) {
          console.error('[invitation-api] Step 2 FAILED (non-fatal):', compError);
        } else {
          console.log('[invitation-api] Step 2 SUCCESS: found', competitions?.length || 0, 'competitions');
        }

        const competitionMap = new Map(competitions?.map((c: any) => [c.id, c]) || []);

        // Step 3: Get inviter profiles
        const inviterIds = [...new Set(invitations.map((i: any) => i.inviter_id))];
        console.log('[invitation-api] Step 3: Fetching profiles for IDs:', inviterIds);

        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', inviterIds);

        if (profileError) {
          console.error('[invitation-api] Step 3 FAILED (non-fatal):', profileError);
        } else {
          console.log('[invitation-api] Step 3 SUCCESS: found', profiles?.length || 0, 'profiles');
        }

        const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

        // Step 4: Build result
        console.log('[invitation-api] Step 4: Building result...');
        result = invitations.map((inv: any) => ({
          ...inv,
          competitions: competitionMap.get(inv.competition_id) || null,
          inviter: profileMap.get(inv.inviter_id),
        }));
        console.log('[invitation-api] Step 4 SUCCESS: returning', result.length, 'invitations');
        break;
      }

      case 'get_invitation_competition_id': {
        const invitationId = params.invitation_id as string;
        console.log('[invitation-api] get_invitation_competition_id called:', { invitationId, userId });

        if (!invitationId) {
          return new Response(
            JSON.stringify({ error: 'invitation_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('competition_invitations')
          .select('competition_id')
          .eq('id', invitationId)
          .eq('invitee_id', userId)
          .single();

        if (error) {
          console.error('[invitation-api] get_invitation_competition_id error:', error);
          throw error;
        }

        console.log('[invitation-api] get_invitation_competition_id found:', data);
        result = data?.competition_id;
        break;
      }

      case 'accept_competition_invitation': {
        const invitationId = params.invitation_id as string;
        const skipBuyIn = params.skip_buy_in === true;
        console.log('[invitation-api] accept_competition_invitation called:', { invitationId, userId, skipBuyIn });

        if (!invitationId) {
          return new Response(
            JSON.stringify({ error: 'invitation_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get and verify invitation
        const { data: invitation, error: invitationError } = await supabase
          .from('competition_invitations')
          .select('id, competition_id, status')
          .eq('id', invitationId)
          .eq('invitee_id', userId)
          .single();

        if (invitationError) {
          console.error('[invitation-api] accept_competition_invitation lookup error:', invitationError);
        }

        if (!invitation) {
          console.error('[invitation-api] accept_competition_invitation: invitation not found for id:', invitationId, 'userId:', userId);
          return new Response(
            JSON.stringify({ error: 'Invitation not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[invitation-api] accept_competition_invitation found invitation:', invitation);

        if (invitation.status !== 'pending') {
          console.log('[invitation-api] accept_competition_invitation: invitation status is', invitation.status);
          return new Response(
            JSON.stringify({ error: 'Invitation is not pending' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if already a participant
        const { data: existingParticipant } = await supabase
          .from('competition_participants')
          .select('id')
          .eq('competition_id', invitation.competition_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (existingParticipant) {
          // Just update invitation status
          await supabase
            .from('competition_invitations')
            .update({ status: 'accepted' })
            .eq('id', invitationId);

          result = { success: true, already_participant: true };
          break;
        }

        // Check for buy-in prize pool
        const { data: buyInPool } = await supabase
          .from('prize_pools')
          .select('id, buy_in_amount')
          .eq('competition_id', invitation.competition_id)
          .eq('status', 'active')
          .eq('pool_type', 'buy_in')
          .maybeSingle();

        if (buyInPool) {
          if (skipBuyIn) {
            // Join without paying — not prize eligible
            const { error: skipError } = await supabase
              .from('competition_participants')
              .insert({
                competition_id: invitation.competition_id,
                user_id: userId,
                prize_eligible: false,
              });

            if (skipError) throw skipError;

            // Update invitation status
            await supabase
              .from('competition_invitations')
              .update({ status: 'accepted' })
              .eq('id', invitationId);

            result = { success: true, competition_id: invitation.competition_id };
            break;
          }

          result = {
            requires_buy_in: true,
            buy_in_amount: parseFloat(buyInPool.buy_in_amount),
            competition_id: invitation.competition_id,
            invitation_id: invitationId,
          };
          break;
        }

        // Add user to competition
        const { error: participantError } = await supabase
          .from('competition_participants')
          .insert({
            competition_id: invitation.competition_id,
            user_id: userId,
          });

        if (participantError) throw participantError;

        // Update invitation status
        const { error: updateError } = await supabase
          .from('competition_invitations')
          .update({ status: 'accepted' })
          .eq('id', invitationId);

        if (updateError) throw updateError;

        result = { success: true, competition_id: invitation.competition_id };
        break;
      }

      case 'decline_competition_invitation': {
        const invitationId = params.invitation_id as string;
        if (!invitationId) {
          return new Response(
            JSON.stringify({ error: 'invitation_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('competition_invitations')
          .update({ status: 'declined' })
          .eq('id', invitationId)
          .eq('invitee_id', userId)
          .eq('status', 'pending');

        if (error) throw error;
        result = { success: true };
        break;
      }

      case 'get_existing_invitation_invitees': {
        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is creator or participant
        const { data: competition } = await supabase
          .from('competitions')
          .select('creator_id')
          .eq('id', competitionId)
          .single();

        if (competition?.creator_id !== userId) {
          const { data: participant } = await supabase
            .from('competition_participants')
            .select('id')
            .eq('competition_id', competitionId)
            .eq('user_id', userId)
            .maybeSingle();

          if (!participant) {
            return new Response(
              JSON.stringify({ error: 'Not authorized' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const { data, error } = await supabase
          .from('competition_invitations')
          .select('invitee_id')
          .eq('competition_id', competitionId);

        if (error) throw error;
        result = data?.map((i: any) => i.invitee_id) || [];
        break;
      }

      case 'get_inviter_info': {
        const inviterId = params.inviter_id as string;
        if (!inviterId) {
          return new Response(
            JSON.stringify({ error: 'inviter_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .eq('id', inviterId)
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'get_competition_name': {
        const competitionId = params.competition_id as string;
        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('competitions')
          .select('name')
          .eq('id', competitionId)
          .single();

        if (error) throw error;
        result = data?.name;
        break;
      }

      case 'create_invitations': {
        const competitionId = params.competition_id as string;
        const inviteeIds = params.invitee_ids as string[];

        if (!competitionId || !inviteeIds) {
          return new Response(
            JSON.stringify({ error: 'competition_id and invitee_ids are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Filter out self
        const filteredInviteeIds = inviteeIds.filter(id => id !== userId);

        if (filteredInviteeIds.length === 0) {
          result = { success: true, created: 0 };
          break;
        }

        // Verify user is creator or participant
        const { data: competition } = await supabase
          .from('competitions')
          .select('creator_id')
          .eq('id', competitionId)
          .single();

        if (competition?.creator_id !== userId) {
          const { data: participant } = await supabase
            .from('competition_participants')
            .select('id')
            .eq('competition_id', competitionId)
            .eq('user_id', userId)
            .maybeSingle();

          if (!participant) {
            return new Response(
              JSON.stringify({ error: 'Not authorized to create invitations' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Check existing invitations
        const { data: existingInvitations } = await supabase
          .from('competition_invitations')
          .select('invitee_id')
          .eq('competition_id', competitionId)
          .in('invitee_id', filteredInviteeIds);

        const existingInviteeIds = new Set(existingInvitations?.map((i: any) => i.invitee_id) || []);

        // Create new invitations
        const newInviteeIds = filteredInviteeIds.filter(id => !existingInviteeIds.has(id));

        if (newInviteeIds.length === 0) {
          result = { success: true, created: 0 };
          break;
        }

        const invitationRecords = newInviteeIds.map(inviteeId => ({
          competition_id: competitionId,
          inviter_id: userId,
          invitee_id: inviteeId,
          status: 'pending',
        }));

        const { error: insertError } = await supabase
          .from('competition_invitations')
          .insert(invitationRecords);

        if (insertError) throw insertError;

        result = { success: true, created: newInviteeIds.length, invitee_ids: newInviteeIds };
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
    console.error('Error in invitation-api:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    return new Response(
      JSON.stringify({ error: errorMessage, stack: errorStack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
