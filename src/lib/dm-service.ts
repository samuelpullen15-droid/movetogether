/**
 * DM Service
 *
 * Client-side service for direct messages. Follows the same pattern
 * as chat-service.ts but for 1-on-1 conversations.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { dmApi, type DMConversationSummary, type DMMessageRaw } from './edge-functions';

export type ReactionType = 'love' | 'thumbsUp' | 'thumbsDown' | 'laugh' | 'exclamation' | 'question';

export interface DMMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: string;
  readAt: string | null;
  reactions?: Partial<Record<ReactionType, string[]>>;
}

export interface DMConversation {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerAvatar: string;
  partnerUsername: string | null;
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
  updatedAt: string;
}

// ============================================================================
// LOAD CONVERSATIONS
// ============================================================================

export async function loadConversations(): Promise<DMConversation[]> {
  try {
    const { data, error } = await dmApi.getConversations();
    if (error || !data) return [];

    return data.map((conv: DMConversationSummary) => {
      const displayName = conv.partner.full_name || conv.partner.username || 'User';
      return {
        id: conv.id,
        partnerId: conv.partner.id,
        partnerName: displayName,
        partnerAvatar: getAvatarUrl(conv.partner.avatar_url, displayName, conv.partner.username || ''),
        partnerUsername: conv.partner.username,
        lastMessage: conv.last_message
          ? { content: conv.last_message.content, createdAt: conv.last_message.created_at, senderId: conv.last_message.sender_id }
          : null,
        unreadCount: conv.unread_count,
        updatedAt: conv.updated_at,
      };
    });
  } catch (error) {
    console.error('[dm-service] Error loading conversations:', error);
    return [];
  }
}

// ============================================================================
// LOAD MESSAGES
// ============================================================================

export async function loadDMMessages(conversationId: string, limit = 50, offset = 0): Promise<DMMessage[]> {
  try {
    const { data, error } = await dmApi.getMessages(conversationId, limit, offset);
    if (error || !data) return [];

    // Messages come in DESC order, reverse for display (oldest first)
    return (data as DMMessageRaw[]).reverse().map(mapRawMessage);
  } catch (error) {
    console.error('[dm-service] Error loading messages:', error);
    return [];
  }
}

function mapRawMessage(msg: DMMessageRaw): DMMessage {
  const firstName = (msg.sender_full_name || msg.sender_username || 'User').split(' ')[0];
  return {
    id: msg.id,
    senderId: msg.sender_id,
    senderName: firstName,
    senderAvatar: getAvatarUrl(msg.sender_avatar_url, firstName, msg.sender_username || ''),
    text: msg.message_content,
    timestamp: msg.created_at,
    readAt: msg.read_at,
    reactions: msg.reactions
      ? (msg.reactions as Partial<Record<ReactionType, string[]>>)
      : undefined,
  };
}

// ============================================================================
// SEND MESSAGE
// ============================================================================

export async function sendDM(
  conversationId: string,
  messageContent: string
): Promise<{ success: boolean; message?: DMMessage; error?: string }> {
  try {
    const { data, error } = await dmApi.sendMessage(conversationId, messageContent);
    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to send message' };
    }

    return {
      success: true,
      message: mapRawMessage(data as DMMessageRaw),
    };
  } catch (error) {
    console.error('[dm-service] Error sending message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}

// ============================================================================
// MARK READ
// ============================================================================

export async function markConversationRead(conversationId: string): Promise<void> {
  try {
    await dmApi.markRead(conversationId);
  } catch (error) {
    console.error('[dm-service] Error marking conversation as read:', error);
  }
}

// ============================================================================
// GET OR CREATE CONVERSATION
// ============================================================================

export async function getOrCreateConversation(
  friendId: string
): Promise<{ conversationId: string | null; error?: string }> {
  try {
    const { data, error } = await dmApi.getOrCreateConversation(friendId);
    if (error || !data) {
      // Extract the actual error from the edge function response body
      let errorMsg = 'Failed to create conversation';
      const funcError = error as any;
      try {
        if (funcError?.context?.body) {
          const body = typeof funcError.context.body === 'string'
            ? JSON.parse(funcError.context.body)
            : funcError.context.body;
          if (body?.error) errorMsg = body.error;
        }
      } catch {
        // Fall back to generic message
      }
      if (errorMsg === 'Failed to create conversation') {
        errorMsg = error?.message || errorMsg;
      }
      console.error('[dm-service] Error creating conversation:', errorMsg, funcError?.status);
      return { conversationId: null, error: errorMsg };
    }
    return { conversationId: data.id };
  } catch (error) {
    console.error('[dm-service] Error creating conversation:', error);
    return { conversationId: null, error: 'Failed to create conversation' };
  }
}

// ============================================================================
// REALTIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to new messages in a specific conversation.
 * Returns an unsubscribe function.
 */
export function subscribeToDMMessages(
  conversationId: string,
  onNewMessage: (message: DMMessage) => void
): () => void {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {};
  }

  const channel: RealtimeChannel = supabase
    .channel(`dm:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      async (payload) => {
        try {
          const newMsg = payload.new as any;

          // Fetch sender profile
          const { data: sender } = await supabase!
            .from('profiles')
            .select('username, full_name, avatar_url')
            .eq('id', newMsg.sender_id)
            .single();

          const firstName = (sender?.full_name || sender?.username || 'User').split(' ')[0];
          const message: DMMessage = {
            id: newMsg.id,
            senderId: newMsg.sender_id,
            senderName: firstName,
            senderAvatar: getAvatarUrl(sender?.avatar_url, firstName, sender?.username || ''),
            text: newMsg.message_content,
            timestamp: newMsg.created_at,
            readAt: newMsg.read_at || null,
          };

          onNewMessage(message);
        } catch (err) {
          console.error('[dm-service] Error processing realtime message:', err);
        }
      }
    )
    .subscribe();

  return () => {
    supabase!.removeChannel(channel);
  };
}

/**
 * Subscribe to ALL new DM messages for the current user.
 * Used for the global unread badge on the social tab.
 * Returns an unsubscribe function.
 */
export function subscribeToAllDMs(
  userId: string,
  onNewMessage: () => void
): () => void {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {};
  }

  const channel: RealtimeChannel = supabase
    .channel(`dm-global:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
      },
      (payload) => {
        const msg = payload.new as any;
        // Only trigger for messages from other users
        if (msg.sender_id !== userId) {
          onNewMessage();
        }
      }
    )
    .subscribe();

  return () => {
    supabase!.removeChannel(channel);
  };
}

// ============================================================================
// REACTIONS
// ============================================================================

export async function addDMReaction(
  messageId: string,
  reactionType: ReactionType
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await dmApi.addReaction(messageId, reactionType);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    console.error('[dm-service] Error adding reaction:', error);
    return { success: false, error: 'Failed to add reaction' };
  }
}

export async function removeDMReaction(
  messageId: string,
  reactionType?: ReactionType
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await dmApi.removeReaction(messageId, reactionType);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    console.error('[dm-service] Error removing reaction:', error);
    return { success: false, error: 'Failed to remove reaction' };
  }
}
