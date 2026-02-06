// Shared in-memory rate limiting for Edge Functions
// Uses a Map to track request counts per user+action within time windows.
// State persists between requests on the same Deno Deploy isolate.
// On cold start, limits reset — this is acceptable as a defense-in-depth measure.

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// Global rate limit store (persists across requests in same isolate)
const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leaks (every 5 minutes)
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of store.entries()) {
    // Remove entries older than 2 hours (covers any window size we use)
    if (now - entry.windowStart > 2 * 60 * 60 * 1000) {
      store.delete(key);
    }
  }
}

/**
 * Check if a request is within rate limits.
 *
 * @param userId - The authenticated user's ID
 * @param action - The action being performed (e.g., 'send_message')
 * @param maxRequests - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns true if the request is allowed, false if rate limited
 */
export function checkRateLimit(
  userId: string,
  action: string,
  maxRequests: number,
  windowMs: number
): boolean {
  cleanupExpiredEntries();

  const key = `${userId}:${action}`;
  const now = Date.now();
  const entry = store.get(key);

  // No entry or window expired — start fresh
  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }

  // Within window — check count
  if (entry.count >= maxRequests) {
    return false;
  }

  // Increment and allow
  entry.count++;
  return true;
}

/**
 * Helper to create a 429 rate limit response
 */
export function rateLimitResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': '60',
      },
    }
  );
}

// Rate limit presets (requests per window)
export const RATE_LIMITS = {
  /** DM messages: 60 per minute */
  SEND_MESSAGE: { maxRequests: 60, windowMs: 60 * 1000 },
  /** Friend requests: 20 per hour */
  CREATE_FRIENDSHIP: { maxRequests: 20, windowMs: 60 * 60 * 1000 },
  /** Reactions: 30 per minute */
  ADD_REACTION: { maxRequests: 30, windowMs: 60 * 1000 },
  /** Comments: 30 per minute */
  ADD_COMMENT: { maxRequests: 30, windowMs: 60 * 1000 },
  /** Competition creation: 10 per hour */
  CREATE_COMPETITION: { maxRequests: 10, windowMs: 60 * 60 * 1000 },
} as const;
