import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendFriendRequestBody {
  recipient_id: string;
}

serve(async (req) => {
  // Handle CORS preflight
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

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT token from Bearer header and verify with service role client
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const senderId = user.id;

    // Parse request body
    const { recipient_id }: SendFriendRequestBody = await req.json();

    if (!recipient_id) {
      return new Response(
        JSON.stringify({ error: 'recipient_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Can't send friend request to yourself
    if (senderId === recipient_id) {
      return new Response(
        JSON.stringify({ error: 'Cannot send friend request to yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Check if already friends or request pending
    const { data: existingFriendship } = await supabase
      .from('friendships')
      .select('id, status')
      .or(`and(user_id.eq.${senderId},friend_id.eq.${recipient_id}),and(user_id.eq.${recipient_id},friend_id.eq.${senderId})`)
      .single();

    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        return new Response(
          JSON.stringify({ error: 'You are already friends with this user' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (existingFriendship.status === 'pending') {
        return new Response(
          JSON.stringify({ error: 'A friend request is already pending' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (existingFriendship.status === 'blocked') {
        // Don't reveal that the user is blocked
        return new Response(
          JSON.stringify({ error: 'This user is not accepting friend requests' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check privacy settings using the database function
    const { data: canSend, error: privacyError } = await supabase
      .rpc('can_send_friend_request', {
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
        JSON.stringify({ error: 'This user is not accepting friend requests' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert the friend request
    const { data: friendship, error: insertError } = await supabase
      .from('friendships')
      .insert({
        user_id: senderId,
        friend_id: recipient_id,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating friend request:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to send friend request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optionally send notification (call send-notification function)
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
          type: 'friend_request_received',
          recipientUserId: recipient_id,
          senderUserId: senderId,
          data: {
            senderName: senderProfile?.full_name || senderProfile?.username || 'Someone',
            senderId: senderId,
          },
        }),
      });
    } catch (notifError) {
      // Don't fail the request if notification fails
      console.error('Failed to send notification:', notifError);
    }

    return new Response(
      JSON.stringify({ success: true, friendship_id: friendship.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-friend-request:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
