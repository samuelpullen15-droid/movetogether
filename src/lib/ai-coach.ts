import { supabase, isSupabaseConfigured } from './supabase';
import { CoachMessage } from './coach-service';

export interface CoachMessageResponse {
  message: string;
  messagesRemaining: number;
}

/**
 * Send a message to the AI Coach via Supabase Edge Function
 * Returns the AI response and messages remaining (for internal use only)
 */
export async function sendCoachMessage(
  userMessage: string,
  conversationHistory: CoachMessage[]
): Promise<CoachMessageResponse> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase not configured');
  }

  // Get the current session to ensure we're authenticated
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session) {
    throw new Error('Not authenticated');
  }

  try {
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('ai-coach', {
      body: {
        message: userMessage,
        conversationHistory: conversationHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
    });

    if (error) {
      // Check if it's a 429 rate limit error
      if (error.status === 429 || (error as any).context?.status === 429) {
        throw new Error('RATE_LIMIT_REACHED');
      }
      // Check if it's a 403 subscription error
      if (error.status === 403 || (error as any).context?.status === 403) {
        throw new Error('SUBSCRIPTION_REQUIRED');
      }
      throw error;
    }

    // Handle response errors
    if (!data) {
      throw new Error('No response from AI Coach');
    }

    // Check if the response has an error property (from the Edge Function)
    if (data.error) {
      // Check for rate limit error (429)
      if (data.error.includes('limit') || data.error.includes('429')) {
        throw new Error('RATE_LIMIT_REACHED');
      }
      throw new Error(data.error);
    }

    // Validate response structure
    if (!data.message || typeof data.message !== 'string') {
      throw new Error('Invalid response format from AI Coach');
    }

    return {
      message: data.message,
      messagesRemaining: data.messagesRemaining ?? 0,
    };
  } catch (error: any) {
    // Re-throw specific error messages
    if (error.message === 'RATE_LIMIT_REACHED' || error.message === 'SUBSCRIPTION_REQUIRED') {
      throw error;
    }
    
    // Handle network/API errors
    console.error('[AI Coach] Error sending message:', error);
    
    // Check if it's an HTTP error with status code
    if (error.status === 429) {
      throw new Error('RATE_LIMIT_REACHED');
    }
    if (error.status === 403) {
      throw new Error('SUBSCRIPTION_REQUIRED');
    }
    
    throw new Error('Failed to send message to AI Coach. Please try again.');
  }
}
