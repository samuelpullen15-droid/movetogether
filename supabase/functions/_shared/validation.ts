// Shared Zod validation utilities for Edge Functions
// Provides common schemas and a validation helper

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Re-export z for use in edge functions
export { z };

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/** UUID v4 string */
export const uuidSchema = z.string().uuid();

/** Positive integer for pagination limit */
export const limitSchema = z.number().int().min(1).max(200).optional().default(20);

/** Non-negative integer for pagination offset */
export const offsetSchema = z.number().int().min(0).optional().default(0);

/** Non-empty trimmed string with max length */
export const shortStringSchema = (maxLength = 200) =>
  z.string().min(1).max(maxLength).transform((s) => s.trim());

/** Message content — non-empty, max 5000 chars */
export const messageContentSchema = z
  .string()
  .min(1, 'Message cannot be empty')
  .max(5000, 'Message too long')
  .transform((s) => s.trim());

/** Comment content — non-empty, max 2000 chars */
export const commentContentSchema = z
  .string()
  .min(1, 'Comment cannot be empty')
  .max(2000, 'Comment too long')
  .transform((s) => s.trim());

/** Reaction type — short alphanumeric + emoji */
export const reactionTypeSchema = z.string().min(1).max(50);

/** ISO date string (YYYY-MM-DD) */
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** ISO datetime string */
export const datetimeStringSchema = z.string().datetime();

/** Competition name */
export const competitionNameSchema = z.string().min(1).max(100).transform((s) => s.trim());

/** Username */
export const usernameSchema = z.string().min(3).max(30).regex(/^[a-zA-Z0-9._-]+$/);

/** Phone number */
export const phoneNumberSchema = z.string().min(7).max(20);

/** Email */
export const emailSchema = z.string().email().max(255);

/** Subscription tier */
export const subscriptionTierSchema = z.enum(['starter', 'mover', 'crusher']);

/** Scoring type */
export const scoringTypeSchema = z.enum(['rings', 'steps', 'calories', 'exercise_minutes', 'custom']);

/** Array of UUIDs */
export const uuidArraySchema = z.array(uuidSchema).min(1).max(100);

// ============================================================================
// VALIDATION HELPER
// ============================================================================

export interface ValidationResult<T> {
  success: true;
  data: T;
}

export interface ValidationError {
  success: false;
  error: string;
}

/**
 * Validate params against a Zod schema.
 * Returns parsed data on success or an error string on failure.
 */
export function validateParams<T>(
  schema: z.ZodType<T>,
  params: unknown
): ValidationResult<T> | ValidationError {
  const result = schema.safeParse(params);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return { success: false, error: `Validation error: ${issues}` };
  }
  return { success: true, data: result.data };
}

/**
 * Helper to create a 400 response for validation errors
 */
export function validationErrorResponse(error: string, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
