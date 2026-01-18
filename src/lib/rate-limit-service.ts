/**
 * Rate Limiting Service
 * 
 * Provides server-side rate limiting using the rate_limits table in Supabase.
 * This prevents abuse of API endpoints and operations.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  error?: string;
}

/**
 * Check rate limit for a user operation
 * @param userId - User ID
 * @param endpoint - Endpoint/operation identifier (e.g., 'create-competition', 'send-friend-request')
 * @param limit - Maximum number of requests allowed
 * @param windowMinutes - Time window in minutes (e.g., 60 for hourly, 1440 for daily)
 * @returns Rate limit check result
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limit: number,
  windowMinutes: number
): Promise<RateLimitResult> {
  if (!isSupabaseConfigured() || !supabase) {
    // If Supabase not configured, allow the request (development mode)
    console.warn('[RateLimit] Supabase not configured, allowing request');
    return { allowed: true, remaining: limit };
  }

  try {
    // Round window start to the appropriate period for consistent tracking
    const now = new Date();
    const windowStartRounded = new Date(now);
    
    if (windowMinutes >= 1440) {
      // Daily: round to start of day (00:00:00)
      windowStartRounded.setHours(0, 0, 0, 0);
    } else if (windowMinutes >= 60) {
      // Hourly: round to start of hour (e.g., 14:00:00)
      windowStartRounded.setMinutes(0, 0, 0);
    } else {
      // Minute-based: round to start of minute
      windowStartRounded.setSeconds(0, 0);
    }

    // Query for exact window match (using unique constraint on user_id, endpoint, window_start)
    const { data: existing, error: selectError } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .eq('window_start', windowStartRounded.toISOString())
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') {
      console.error('[RateLimit] Error checking rate limit:', selectError);
      // On error, allow the request to avoid blocking legitimate users
      return { allowed: true, remaining: limit };
    }

    if (existing) {
      // Check if limit exceeded
      if (existing.request_count >= limit) {
        return { 
          allowed: false, 
          remaining: 0,
          error: 'Rate limit exceeded. Please try again later.'
        };
      }

      // Increment count
      const { error: updateError } = await supabase
        .from('rate_limits')
        .update({ 
          request_count: existing.request_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[RateLimit] Error updating rate limit:', updateError);
        // On error, allow the request
        return { allowed: true, remaining: limit };
      }

      return { 
        allowed: true, 
        remaining: limit - existing.request_count - 1 
      };
    }

    // Create new rate limit record
    const { error: insertError } = await supabase
      .from('rate_limits')
      .insert({
        user_id: userId,
        endpoint,
        request_count: 1,
        window_start: windowStartRounded.toISOString(),
      });

    if (insertError) {
      console.error('[RateLimit] Error creating rate limit record:', insertError);
      // On error, allow the request
      return { allowed: true, remaining: limit };
    }

    return { allowed: true, remaining: limit - 1 };
  } catch (error) {
    console.error('[RateLimit] Unexpected error:', error);
    // On error, allow the request to avoid blocking legitimate users
    return { allowed: true, remaining: limit };
  }
}

/**
 * Rate limit configurations for different operations
 */
export const RATE_LIMITS = {
  COMPETITION_CREATION: { limit: 10, windowMinutes: 1440 }, // 10 per day
  FRIEND_REQUEST: { limit: 30, windowMinutes: 1440 }, // 30 per day
  HEALTH_SYNC: { limit: 20, windowMinutes: 60 }, // 20 per hour
  IMAGE_UPLOAD: { limit: 10, windowMinutes: 60 }, // 10 per hour
  AI_COACH: { limit: 10, windowMinutes: 1 }, // 10 per minute (existing)
} as const;
