// supabase/functions/dm-api/index.ts
// Direct Messages API — 1-on-1 private messaging between friends.
// Follows the exact same pattern as chat-api/index.ts.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';

// Zod schemas for action params
const friendIdSchema = z.object({
  friend_id: z.string().uuid(),
});

const conversationIdSchema = z.object({
  conversation_id: z.string().uuid(),
});

const getMessagesSchema = z.object({
  conversation_id: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  message_content: z.string().min(1).max(5000).transform((s) => s.trim()),
});

const addReactionSchema = z.object({
  message_id: z.string().uuid(),
  reaction_type: z.string().min(1).max(50),
});

const removeReactionSchema = z.object({
  message_id: z.string().uuid(),
  reaction_type: z.string().min(1).max(50).optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_conversations'
  | 'get_or_create_conversation'
  | 'get_messages'
  | 'send_message'
  | 'mark_read'
  | 'add_reaction'
  | 'remove_reaction';

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
      console.error('[dm-api] Auth error:', authError);
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
      // =====================================================================
      // GET_CONVERSATIONS — List all conversations for the current user
      // =====================================================================
      case 'get_conversations': {
        // Get bidirectional block list
        const { data: blocks } = await supabase
          .from('friendships')
          .select('user_id, friend_id')
          .eq('status', 'blocked')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        const blockedUserIds = new Set<string>();
        (blocks || []).forEach((b: any) => {
          if (b.user_id === userId) blockedUserIds.add(b.friend_id);
          if (b.friend_id === userId) blockedUserIds.add(b.user_id);
        });

        // Fetch all conversations the user is part of
        const { data: conversations, error: convError } = await supabase
          .from('dm_conversations')
          .select('*')
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
          .order('updated_at', { ascending: false });

        if (convError) throw convError;

        if (!conversations || conversations.length === 0) {
          result = [];
          break;
        }

        // Filter out conversations with blocked users
        const filtered = conversations.filter((c: any) => {
          const partnerId = c.user1_id === userId ? c.user2_id : c.user1_id;
          return !blockedUserIds.has(partnerId);
        });

        // Get partner profiles
        const partnerIds = filtered.map((c: any) =>
          c.user1_id === userId ? c.user2_id : c.user1_id
        );
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', partnerIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

        // Get last message for each conversation
        const conversationIds = filtered.map((c: any) => c.id);

        // For each conversation, get last message and unread count
        const enriched = await Promise.all(
          filtered.map(async (conv: any) => {
            const partnerId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
            const partner = profileMap.get(partnerId);

            // Last message
            const { data: lastMsgs } = await supabase
              .from('dm_messages')
              .select('message_content, created_at, sender_id')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: false })
              .limit(1);

            const lastMessage = lastMsgs && lastMsgs.length > 0
              ? { content: lastMsgs[0].message_content, created_at: lastMsgs[0].created_at, sender_id: lastMsgs[0].sender_id }
              : null;

            // Unread count
            const { count: unreadCount } = await supabase
              .from('dm_messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', conv.id)
              .neq('sender_id', userId)
              .is('read_at', null);

            return {
              id: conv.id,
              partner: {
                id: partnerId,
                username: partner?.username || null,
                full_name: partner?.full_name || null,
                avatar_url: partner?.avatar_url || null,
              },
              last_message: lastMessage,
              unread_count: unreadCount || 0,
              updated_at: conv.updated_at,
            };
          })
        );

        result = enriched;
        break;
      }

      // =====================================================================
      // GET_OR_CREATE_CONVERSATION — Find or create conversation with a friend
      // =====================================================================
      case 'get_or_create_conversation': {
        const v = validateParams(friendIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const friendId = v.data.friend_id;

        if (friendId === userId) {
          return new Response(
            JSON.stringify({ error: 'Cannot message yourself' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check accepted friendship (bidirectional)
        const { data: friendship } = await supabase
          .from('friendships')
          .select('id, status')
          .or(
            `and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`
          )
          .eq('status', 'accepted')
          .maybeSingle();

        if (!friendship) {
          return new Response(
            JSON.stringify({ error: 'You must be friends to start a conversation' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check block (bidirectional)
        const { data: blockRecord } = await supabase
          .from('friendships')
          .select('id')
          .eq('status', 'blocked')
          .or(
            `and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`
          )
          .maybeSingle();

        if (blockRecord) {
          return new Response(
            JSON.stringify({ error: 'Cannot message this user' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Canonical ordering: user1 = min, user2 = max
        const user1 = userId < friendId ? userId : friendId;
        const user2 = userId < friendId ? friendId : userId;

        // Try to find existing conversation
        const { data: existing } = await supabase
          .from('dm_conversations')
          .select('*')
          .eq('user1_id', user1)
          .eq('user2_id', user2)
          .maybeSingle();

        let conversation = existing;

        if (!conversation) {
          // Create new conversation
          const { data: newConv, error: createError } = await supabase
            .from('dm_conversations')
            .insert({ user1_id: user1, user2_id: user2 })
            .select()
            .single();

          if (createError) throw createError;
          conversation = newConv;
        }

        // Get partner profile
        const { data: partnerProfile } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .eq('id', friendId)
          .single();

        result = {
          id: conversation.id,
          partner: {
            id: friendId,
            username: partnerProfile?.username || null,
            full_name: partnerProfile?.full_name || null,
            avatar_url: partnerProfile?.avatar_url || null,
          },
        };
        break;
      }

      // =====================================================================
      // GET_MESSAGES — Fetch message history for a conversation
      // =====================================================================
      case 'get_messages': {
        const v = validateParams(getMessagesSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const conversationId = v.data.conversation_id;
        const limit = v.data.limit;
        const offset = v.data.offset;

        // Verify user is in this conversation
        const { data: conv } = await supabase
          .from('dm_conversations')
          .select('id, user1_id, user2_id')
          .eq('id', conversationId)
          .maybeSingle();

        if (!conv || (conv.user1_id !== userId && conv.user2_id !== userId)) {
          return new Response(
            JSON.stringify({ error: 'Not a member of this conversation' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch messages
        const { data: messages, error: msgError } = await supabase
          .from('dm_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (msgError) throw msgError;

        if (!messages || messages.length === 0) {
          result = [];
          break;
        }

        // Fetch sender profiles
        const senderIds = [...new Set(messages.map((m: any) => m.sender_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', senderIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

        // Fetch reactions for all messages
        const messageIds = messages.map((m: any) => m.id);
        const { data: reactions } = await supabase
          .from('dm_reactions')
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

        // Enrich messages
        result = messages.map((msg: any) => {
          const senderProfile = profileMap.get(msg.sender_id);
          return {
            ...msg,
            sender_username: senderProfile?.username || null,
            sender_full_name: senderProfile?.full_name || null,
            sender_avatar_url: senderProfile?.avatar_url || null,
            reactions: reactionsMap.get(msg.id) || null,
          };
        });
        break;
      }

      // =====================================================================
      // SEND_MESSAGE — Send a DM in a conversation
      // =====================================================================
      case 'send_message': {
        const v = validateParams(sendMessageSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const conversationId = v.data.conversation_id;
        const messageContent = v.data.message_content;

        // Rate limit: 60 messages per minute
        if (!checkRateLimit(userId, 'send_message', RATE_LIMITS.SEND_MESSAGE.maxRequests, RATE_LIMITS.SEND_MESSAGE.windowMs)) {
          return rateLimitResponse(corsHeaders);
        }

        // Verify user is in this conversation
        const { data: conv } = await supabase
          .from('dm_conversations')
          .select('id, user1_id, user2_id')
          .eq('id', conversationId)
          .maybeSingle();

        if (!conv || (conv.user1_id !== userId && conv.user2_id !== userId)) {
          return new Response(
            JSON.stringify({ error: 'Not a member of this conversation' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const partnerId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;

        // Verify accepted friendship still exists
        const { data: friendship } = await supabase
          .from('friendships')
          .select('id')
          .or(
            `and(user_id.eq.${userId},friend_id.eq.${partnerId}),and(user_id.eq.${partnerId},friend_id.eq.${userId})`
          )
          .eq('status', 'accepted')
          .maybeSingle();

        if (!friendship) {
          return new Response(
            JSON.stringify({ error: 'You must be friends to send messages' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check bidirectional block
        const { data: blockRecord } = await supabase
          .from('friendships')
          .select('id')
          .eq('status', 'blocked')
          .or(
            `and(user_id.eq.${userId},friend_id.eq.${partnerId}),and(user_id.eq.${partnerId},friend_id.eq.${userId})`
          )
          .maybeSingle();

        if (blockRecord) {
          return new Response(
            JSON.stringify({ error: 'Cannot message this user' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Insert message
        const { data: message, error: insertError } = await supabase
          .from('dm_messages')
          .insert({
            conversation_id: conversationId,
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

        // Send push notification to partner (fire and forget)
        try {
          await fetch(
            `${SUPABASE_URL}/functions/v1/send-notification`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                type: 'direct_message',
                recipientUserId: partnerId,
                senderUserId: userId,
                data: {
                  senderName: senderProfile?.full_name || senderProfile?.username || 'Someone',
                  messagePreview: messageContent.substring(0, 100),
                  conversationId,
                },
              }),
            }
          );
        } catch (notifErr) {
          console.error('[dm-api] Error sending push notification:', notifErr);
        }

        result = {
          ...message,
          sender_username: senderProfile?.username || null,
          sender_full_name: senderProfile?.full_name || null,
          sender_avatar_url: senderProfile?.avatar_url || null,
        };
        break;
      }

      // =====================================================================
      // MARK_READ — Mark all unread messages from partner as read
      // =====================================================================
      case 'mark_read': {
        const v = validateParams(conversationIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const conversationId = v.data.conversation_id;

        // Verify user is in this conversation
        const { data: conv } = await supabase
          .from('dm_conversations')
          .select('id, user1_id, user2_id')
          .eq('id', conversationId)
          .maybeSingle();

        if (!conv || (conv.user1_id !== userId && conv.user2_id !== userId)) {
          return new Response(
            JSON.stringify({ error: 'Not a member of this conversation' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Mark all unread messages from the other user as read
        const { error: updateError, count } = await supabase
          .from('dm_messages')
          .update({ read_at: new Date().toISOString() })
          .eq('conversation_id', conversationId)
          .neq('sender_id', userId)
          .is('read_at', null);

        if (updateError) throw updateError;

        result = { success: true, count: count || 0 };
        break;
      }

      // =====================================================================
      // ADD_REACTION — Add a reaction to a DM message
      // =====================================================================
      case 'add_reaction': {
        const v = validateParams(addReactionSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const messageId = v.data.message_id;
        const reactionType = v.data.reaction_type;

        // Verify message exists and user is in the conversation
        const { data: message } = await supabase
          .from('dm_messages')
          .select('id, conversation_id')
          .eq('id', messageId)
          .single();

        if (!message) {
          return new Response(
            JSON.stringify({ error: 'Message not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: conv } = await supabase
          .from('dm_conversations')
          .select('id, user1_id, user2_id')
          .eq('id', message.conversation_id)
          .maybeSingle();

        if (!conv || (conv.user1_id !== userId && conv.user2_id !== userId)) {
          return new Response(
            JSON.stringify({ error: 'Not a member of this conversation' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Remove existing reaction from this user on this message
        await supabase
          .from('dm_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId);

        // Insert new reaction
        const { data, error } = await supabase
          .from('dm_reactions')
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

      // =====================================================================
      // REMOVE_REACTION — Remove a reaction from a DM message
      // =====================================================================
      case 'remove_reaction': {
        const v = validateParams(removeReactionSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);
        const messageId = v.data.message_id;
        const reactionType = v.data.reaction_type;

        let deleteQuery = supabase
          .from('dm_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId);

        if (reactionType) {
          deleteQuery = deleteQuery.eq('reaction_type', reactionType);
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
    console.error('[dm-api] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
