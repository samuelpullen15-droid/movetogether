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
  console.log('[AI Coach] sendCoachMessage called');
  
  if (!isSupabaseConfigured() || !supabase) {
    console.error('[AI Coach] Supabase not configured');
    throw new Error('Supabase not configured');
  }

  // Get the current session and refresh if needed
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  console.log('[AI Coach] Session check:', { 
    hasSession: !!session, 
    sessionError: sessionError?.message,
    userId: session?.user?.id 
  });
  
  if (sessionError || !session) {
    throw new Error('Not authenticated');
  }

  // Refresh the session to ensure we have a valid token
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  
  const activeSession = refreshData?.session || session;
  
  console.log('[AI Coach] Using session:', {
    refreshed: !!refreshData?.session,
    refreshError: refreshError?.message,
  });

  if (!activeSession?.access_token) {
    throw new Error('No valid access token');
  }

  try {
    console.log('[AI Coach] Invoking Edge Function with message:', userMessage.slice(0, 50));
    console.log('[AI Coach] Access token (first 20 chars):', activeSession.access_token?.slice(0, 20));
    
    // Get the Supabase URL and anon key
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const functionUrl = `${supabaseUrl}/functions/v1/ai-coach`;
    
    console.log('[AI Coach] Function URL:', functionUrl);
    
    // Make direct fetch call - need both apikey and Authorization headers
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey || '',
        'Authorization': `Bearer ${activeSession.access_token}`,
      },
      body: JSON.stringify({
        message: userMessage,
        conversationHistory: conversationHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    console.log('[AI Coach] Response status:', response.status);
    
    const responseText = await response.text();
    console.log('[AI Coach] Response body:', responseText);
    
    if (!response.ok) {
      // Try to parse error
      let errorMessage = 'Unknown error';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorData.message || responseText;
      } catch {
        errorMessage = responseText;
      }
      
      if (response.status === 429) {
        throw new Error('RATE_LIMIT_REACHED');
      }
      if (response.status === 403) {
        throw new Error('SUBSCRIPTION_REQUIRED');
      }
      throw new Error(errorMessage);
    }
    
    const data = JSON.parse(responseText);
    console.log('[AI Coach] Parsed data:', data);

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
    
    throw new Error(error.message || 'Failed to send message to AI Coach. Please try again.');
  }
}