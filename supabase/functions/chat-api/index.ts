import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'get_my_chat_messages' | 'get_chat_user_profile' | 'send_message' | 'get_message_reactions' | 'add_chat_reaction' | 'remove_chat_reaction';

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

    const token = authHeader.replace('Bearer ', '');
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
      case 'get_my_chat_messages': {
        const competitionId = params.competition_id as string;
        const limit = (params.limit as number) || 50;
        const offset = (params.offset as number) || 0;

        if (!competitionId) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is a participant
        const { data: participant, error: participantError } = await supabase
          .from('competition_participants')
          .select('id')
          .eq('competition_id', competitionId)
          .eq('user_id', userId)
          .maybeSingle();

        if (participantError) {
          console.error('Participant check error:', participantError);
          throw participantError;
        }

        if (!participant) {
          console.log('User not a participant:', { userId, competitionId });
          return new Response(
            JSON.stringify({ error: 'Not a participant in this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('User is participant, fetching messages...');
        const { data, error } = await supabase
          .from('competition_chat_messages')
          .select('*')
          .eq('competition_id', competitionId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          console.error('Chat messages query error:', error);
          throw error;
        }
        console.log('Fetched messages count:', data?.length || 0);

        // Fetch sender profiles for all messages
        if (data && data.length > 0) {
          const senderIds = [...new Set(data.map((msg: any) => msg.sender_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', senderIds);

          const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

          // Fetch reactions for all messages
          const messageIds = data.map((msg: any) => msg.id);
          const { data: reactions } = await supabase
            .from('competition_chat_reactions')
            .select('message_id, user_id, reaction_type')
            .in('message_id', messageIds);

          // Group reactions by message
          const reactionsMap = new Map<string, Record<string, string[]>>();
          (reactions || []).forEach((r: any) => {
            if (!reactionsMap.has(r.message_id)) {
              reactionsMap.set(r.message_id, {});
            }
            const msgReactions = reactionsMap.get(r.message_id)!;
            if (!msgReactions[r.reaction_type]) {
              msgReactions[r.reaction_type] = [];
            }
            msgReactions[r.reaction_type].push(r.user_id);
          });

          // Enrich messages with sender profile data and reactions
          result = data.map((msg: any) => {
            const senderProfile = profileMap.get(msg.sender_id);
            const msgReactions = reactionsMap.get(msg.id);
            return {
              ...msg,
              sender_username: senderProfile?.username,
              sender_full_name: senderProfile?.full_name,
              sender_avatar_url: senderProfile?.avatar_url,
              reactions: msgReactions || null,
            };
          });
        } else {
          result = data;
        }
        break;
      }

      case 'get_chat_user_profile': {
        const targetUserId = params.user_id as string;
        if (!targetUserId) {
          return new Response(
            JSON.stringify({ error: 'user_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .eq('id', targetUserId)
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'send_message': {
        const competitionId = params.competition_id as string;
        const messageContent = params.message_content as string;

        if (!competitionId || !messageContent) {
          return new Response(
            JSON.stringify({ error: 'competition_id and message_content are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is a participant
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

        // Insert the message
        const { data: message, error: insertError } = await supabase
          .from('competition_chat_messages')
          .insert({
            competition_id: competitionId,
            sender_id: userId,
            message_content: messageContent,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Get sender profile
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('username, full_name, avatar_url')
          .eq('id', userId)
          .single();

        result = {
          ...message,
          sender_username: senderProfile?.username,
          sender_full_name: senderProfile?.full_name,
          sender_avatar_url: senderProfile?.avatar_url,
        };
        break;
      }

      case 'get_message_reactions': {
        const messageId = params.message_id as string;
        if (!messageId) {
          return new Response(
            JSON.stringify({ error: 'message_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('competition_chat_reactions')
          .select('message_id, user_id, reaction_type')
          .eq('message_id', messageId);

        if (error) throw error;

        // Group by reaction type
        const grouped: Record<string, string[]> = {};
        (data || []).forEach((r: any) => {
          if (!grouped[r.reaction_type]) {
            grouped[r.reaction_type] = [];
          }
          grouped[r.reaction_type].push(r.user_id);
        });

        result = grouped;
        break;
      }

      case 'add_chat_reaction': {
        const messageId = params.message_id as string;
        const reactionType = params.reaction_type as string;

        if (!messageId || !reactionType) {
          return new Response(
            JSON.stringify({ error: 'message_id and reaction_type are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify the message exists and user can react (is participant in competition)
        const { data: message } = await supabase
          .from('competition_chat_messages')
          .select('id, competition_id')
          .eq('id', messageId)
          .single();

        if (!message) {
          return new Response(
            JSON.stringify({ error: 'Message not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify user is a participant
        const { data: participant } = await supabase
          .from('competition_participants')
          .select('id')
          .eq('competition_id', message.competition_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (!participant) {
          return new Response(
            JSON.stringify({ error: 'Not a participant in this competition' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Remove any existing reaction from this user on this message
        await supabase
          .from('competition_chat_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId);

        // Insert the new reaction
        const { data, error } = await supabase
          .from('competition_chat_reactions')
          .insert({
            message_id: messageId,
            user_id: userId,
            reaction_type: reactionType,
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
        break;
      }

      case 'remove_chat_reaction': {
        const messageId = params.message_id as string;
        const reactionType = params.reaction_type as string;

        if (!messageId) {
          return new Response(
            JSON.stringify({ error: 'message_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete the reaction
        const deleteQuery = supabase
          .from('competition_chat_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId);

        if (reactionType) {
          deleteQuery.eq('reaction_type', reactionType);
        }

        const { error } = await deleteQuery;

        if (error) throw error;
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
    console.error('Error in chat-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
