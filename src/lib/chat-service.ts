import { supabase } from './supabase';
import { getAvatarUrl } from './avatar-utils';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
 */
export async function loadChatMessages(competitionId: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from('competition_chat_messages')
      .select(`
        id,
        competition_id,
        sender_id,
        message_content,
        created_at,
        sender:sender_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('competition_id', competitionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[ChatService] Error loading messages:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((msg: any) => {
      const sender = msg.sender || {};
      const firstName = sender.full_name?.split(' ')[0] || sender.username || 'User';

      return {
        id: msg.id,
        oderId: msg.sender_id,
        senderName: firstName,
        senderAvatar: getAvatarUrl(sender.avatar_url, firstName, sender.username),
        text: msg.message_content,
        timestamp: msg.created_at,
      };
    });
  } catch (error) {
    console.error('[ChatService] Error in loadChatMessages:', error);
    return [];
  }
}

/**
 * Send a chat message to a competition
 */
export async function sendChatMessage(
  competitionId: string,
  senderId: string,
  messageContent: string
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('competition_chat_messages')
      .insert({
        competition_id: competitionId,
        sender_id: senderId,
        message_content: messageContent,
      })
      .select(`
        id,
        competition_id,
        sender_id,
        message_content,
        created_at,
        sender:sender_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      console.error('[ChatService] Error sending message:', error);
      return { success: false, error: error.message };
    }

    const sender = (data as any).sender || {};
    const firstName = sender.full_name?.split(' ')[0] || sender.username || 'User';

    return {
      success: true,
      message: {
        id: data.id,
        oderId: data.sender_id,
        senderName: firstName,
        senderAvatar: getAvatarUrl(sender.avatar_url, firstName, sender.username),
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

        // Fetch sender info since it's not included in realtime payload
        const { data: senderData } = await supabase
          .from('profiles')
          .select('username, full_name, avatar_url')
          .eq('id', newMsg.sender_id)
          .single();

        const sender = senderData || { username: 'User', full_name: null, avatar_url: null };
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
