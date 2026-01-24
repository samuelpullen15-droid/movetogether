// src/hooks/useChatModeration.ts
//
// Hook for sending chat messages with AI moderation
// Messages are checked server-side before being broadcast
// Toxic messages are blocked immediately

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

interface SendMessageResult {
  success: boolean;
  allowed?: boolean;
  blocked?: boolean;
  reason?: string;
  muted_until?: string;
  warnings_remaining?: number;
}

interface UseChatModerationOptions {
  competitionId: string;
  onMessageBlocked?: (reason: string) => void;
  onMuted?: (until: string) => void;
}

// Get Supabase URL from environment
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;

export function useChatModeration(options: UseChatModerationOptions) {
  const { competitionId, onMessageBlocked, onMuted } = options;
  
  const [isSending, setIsSending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [warningsRemaining, setWarningsRemaining] = useState<number | null>(null);
  
  // Track recent blocked messages for local UI feedback
  const recentBlocksRef = useRef<number>(0);

  // Check if the mute has expired
  const checkMuteStatus = useCallback(() => {
    if (mutedUntil) {
      const muteEnd = new Date(mutedUntil).getTime();
      if (Date.now() >= muteEnd) {
        setIsMuted(false);
        setMutedUntil(null);
        return false;
      }
      return true;
    }
    return false;
  }, [mutedUntil]);

  // Send a message with moderation
  const sendMessage = useCallback(async (
    messageContent: string,
    messageId?: string
  ): Promise<SendMessageResult> => {
    // Check mute status first
    if (checkMuteStatus()) {
      return {
        success: false,
        allowed: false,
        reason: 'You are currently muted',
        muted_until: mutedUntil || undefined,
      };
    }

    // Basic client-side validation (server will also validate)
    const trimmedContent = messageContent.trim();
    if (!trimmedContent) {
      return { success: false, reason: 'Message cannot be empty' };
    }

    if (trimmedContent.length > 2000) {
      return { success: false, reason: 'Message too long (max 2000 characters)' };
    }

    setIsSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        return { success: false, reason: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/moderate-chat-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            competition_id: competitionId,
            message_content: trimmedContent,
            message_id: messageId,
          }),
        }
      );

      const result = await response.json();

      // Handle muted response
      if (result.muted_until) {
        setIsMuted(true);
        setMutedUntil(result.muted_until);
        onMuted?.(result.muted_until);
      }

      // Handle blocked message
      if (result.blocked) {
        recentBlocksRef.current += 1;
        setWarningsRemaining(result.warnings_remaining ?? null);
        onMessageBlocked?.(result.reason || 'Message blocked');
        
        return {
          success: false,
          allowed: false,
          blocked: true,
          reason: result.reason,
          warnings_remaining: result.warnings_remaining,
          muted_until: result.muted_until,
        };
      }

      // Handle other errors
      if (!response.ok || result.error) {
        return {
          success: false,
          reason: result.error || 'Failed to send message',
        };
      }

      // Message allowed
      recentBlocksRef.current = 0; // Reset on successful send
      
      return {
        success: true,
        allowed: true,
      };

    } catch (error) {
      console.error('Chat moderation error:', error);
      return {
        success: false,
        reason: 'Network error. Please try again.',
      };
    } finally {
      setIsSending(false);
    }
  }, [competitionId, checkMuteStatus, mutedUntil, onMessageBlocked, onMuted]);

  // Get remaining mute time in a human-readable format
  const getMuteTimeRemaining = useCallback((): string | null => {
    if (!mutedUntil) return null;

    const remaining = new Date(mutedUntil).getTime() - Date.now();
    if (remaining <= 0) {
      setIsMuted(false);
      setMutedUntil(null);
      return null;
    }

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, [mutedUntil]);

  return {
    sendMessage,
    isSending,
    isMuted,
    mutedUntil,
    warningsRemaining,
    getMuteTimeRemaining,
    checkMuteStatus,
    recentBlockCount: recentBlocksRef.current,
  };
}
