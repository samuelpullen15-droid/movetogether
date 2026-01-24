import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SendCompetitionInviteBody {
  recipient_id: string;
  competition_id: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to get their ID
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const senderId = user.id;

    // Parse request body
    const { recipient_id, competition_id }: SendCompetitionInviteBody = await req.json();

    if (!recipient_id || !competition_id) {
      return new Response(
        JSON.stringify({ error: 'recipient_id and competition_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Can't invite yourself
    if (senderId === recipient_id) {
      return new Response(
        JSON.stringify({ error: 'Cannot invite yourself to a competition' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create service role client for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if competition exists and sender is a participant or creator
    const { data: competition, error: compError } = await supabase
      .from('competitions')
      .select('id, name, creator_id, status')
      .eq('id', competition_id)
      .single();

    if (compError || !competition) {
      return new Response(
        JSON.stringify({ error: 'Competition not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if competition is still joinable (upcoming or active)
    if (competition.status === 'completed') {
      return new Response(
        JSON.stringify({ error: 'Cannot invite to a completed competition' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if sender is part of the competition
    const { data: senderParticipation } = await supabase
      .from('competition_participants')
      .select('id')
      .eq('competition_id', competition_id)
      .eq('user_id', senderId)
      .single();

    const isCreator = competition.creator_id === senderId;
    const isParticipant = !!senderParticipation;

    if (!isCreator && !isParticipant) {
      return new Response(
        JSON.stringify({ error: 'You must be part of the competition to invite others' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if recipient exists
    const { data: recipientProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', recipient_id)
      .single();

    if (profileError || !recipientProfile) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if recipient is already in the competition
    const { data: existingParticipation } = await supabase
      .from('competition_participants')
      .select('id')
      .eq('competition_id', competition_id)
      .eq('user_id', recipient_id)
      .single();

    if (existingParticipation) {
      return new Response(
        JSON.stringify({ error: 'User is already in this competition' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if invitation already exists
    const { data: existingInvite } = await supabase
      .from('competition_invitations')
      .select('id, status')
      .eq('competition_id', competition_id)
      .eq('invitee_id', recipient_id)
      .eq('status', 'pending')
      .single();

    if (existingInvite) {
      return new Response(
        JSON.stringify({ error: 'An invitation is already pending for this user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check privacy settings using the database function
    const { data: canSend, error: privacyError } = await supabase
      .rpc('can_send_competition_invite', {
        sender_id: senderId,
        recipient_id: recipient_id,
      });

    if (privacyError) {
      console.error('Error checking privacy settings:', privacyError);
      return new Response(
        JSON.stringify({ error: 'Failed to check privacy settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!canSend) {
      // Generic message - don't reveal specific privacy setting
      return new Response(
        JSON.stringify({ error: 'This user is not accepting competition invites' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert the competition invitation
    const { data: invitation, error: insertError } = await supabase
      .from('competition_invitations')
      .insert({
        competition_id: competition_id,
        inviter_id: senderId,
        invitee_id: recipient_id,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating competition invitation:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to send competition invite' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send notification
    try {
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', senderId)
        .single();

      await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          type: 'competition_invite',
          recipientUserId: recipient_id,
          data: {
            inviterName: senderProfile?.full_name || senderProfile?.username || 'Someone',
            competitionName: competition.name,
            competitionId: competition_id,
            inviterId: senderId,
          },
        }),
      });
    } catch (notifError) {
      // Don't fail the request if notification fails
      console.error('Failed to send notification:', notifError);
    }

    return new Response(
      JSON.stringify({ success: true, invitation_id: invitation.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-competition-invite:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
