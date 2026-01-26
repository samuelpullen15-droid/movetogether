// Per security rules: Uses Edge Functions instead of direct RPC calls
import { supabase } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { chatApi } from './edge-functions';

// Reaction types for chat messages
export type ReactionType = 'love' | 'thumbsUp' | 'thumbsDown' | 'laugh' | 'exclamation' | 'question';

export interface ChatMessage {
  id: string;
  oderId: string; // sender_id (keeping original field name for compatibility)
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: string;
  reactions?: Partial<Record<ReactionType, string[]>>; // reaction type -> array of user IDs
}

interface DatabaseChatMessage {
  id: string;
  competition_id: string;
  sender_id: string;
  message_content: string;
  created_at: string;
  sender?: {
    username: string;
    full_name: string;
    avatar_url: string;
  };
}

/**
 * Load all chat messages for a competition
 * Per security rules: Uses Edge Function instead of direct table access
 */
export async function loadChatMessages(competitionId: string): Promise<ChatMessage[]> {
  try {
    // Per security rules: Use Edge Function instead of direct RPC
    const { data, error } = await chatApi.getMyChatMessages(competitionId, 500, 0);

    if (error) {
      console.error('[ChatService] Error loading messages:', error);
      return [];
    }

    if (!data || (data as any[]).length === 0) {
      return [];
    }

    // Edge Function returns messages in DESC order (newest first), reverse for chat display (oldest first)
    const sortedData = [...(data as any[])].reverse();

    return sortedData.map((msg: any) => {
      // Edge Function returns flat structure with sender fields
      const firstName = msg.sender_full_name?.split(' ')[0] || msg.sender_username || 'User';

      return {
        id: msg.id,
        oderId: msg.user_id || msg.sender_id,
        senderName: firstName,
        senderAvatar: getAvatarUrl(msg.sender_avatar_url, firstName, msg.sender_username),
        text: msg.content || msg.message_content,
        timestamp: msg.created_at,
        reactions: msg.reactions || undefined,
      };
    });
  } catch (error) {
    console.error('[ChatService] Error in loadChatMessages:', error);
    return [];
  }
}

/**
 * Send a chat message to a competition
 * Per security rules: Uses Edge Function instead of direct table access
 */
export async function sendChatMessage(
  competitionId: string,
  _senderId: string,
  messageContent: string
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  try {
    // Per security rules: Use Edge Function instead of direct table access
    const { data, error } = await chatApi.sendMessage(competitionId, messageContent);

    if (error) {
      console.error('[ChatService] Error sending message:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'No data returned' };
    }

    const firstName = data.sender_full_name?.split(' ')[0] || data.sender_username || 'User';

    return {
      success: true,
      message: {
        id: data.id,
        oderId: data.sender_id,
        senderName: firstName,
        senderAvatar: getAvatarUrl(data.sender_avatar_url, firstName, data.sender_username),
        text: data.message_content,
        timestamp: data.created_at,
      },
    };
  } catch (error: any) {
    console.error('[ChatService] Error in sendChatMessage:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Subscribe to new chat messages for a competition
 */
export function subscribeToChatMessages(
  competitionId: string,
  onNewMessage: (message: ChatMessage) => void
): () => void {
  console.log('[ChatService] Subscribing to chat messages for competition:', competitionId);

  const channel: RealtimeChannel = supabase
    .channel(`chat:${competitionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'competition_chat_messages',
        filter: `competition_id=eq.${competitionId}`,
      },
      async (payload) => {
        console.log('[ChatService] New message received:', payload);

        const newMsg = payload.new as DatabaseChatMessage;

        // Per security rules: Use Edge Function instead of direct table access
        const { data: senderData } = await chatApi.getChatUserProfile(newMsg.sender_id);

        const sender = (senderData as any) || { username: 'User', full_name: null, avatar_url: null };
        const firstName = sender.full_name?.split(' ')[0] || sender.username || 'User';

        const message: ChatMessage = {
          id: newMsg.id,
          oderId: newMsg.sender_id,
          senderName: firstName,
          senderAvatar: getAvatarUrl(sender.avatar_url, firstName, sender.username),
          text: newMsg.message_content,
          timestamp: newMsg.created_at,
        };

        onNewMessage(message);
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    console.log('[ChatService] Unsubscribing from chat messages');
    supabase.removeChannel(channel);
  };
}

/**
 * Add a reaction to a chat message
 */
export async function addChatReaction(
  messageId: string,
  reactionType: ReactionType
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await chatApi.addChatReaction(messageId, reactionType);
    if (error) {
      console.error('[ChatService] Error adding reaction:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error('[ChatService] Error in addChatReaction:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Remove a reaction from a chat message
 */
export async function removeChatReaction(
  messageId: string,
  reactionType?: ReactionType
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await chatApi.removeChatReaction(messageId, reactionType);
    if (error) {
      console.error('[ChatService] Error removing reaction:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error('[ChatService] Error in removeChatReaction:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
