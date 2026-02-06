/**
 * challenges-api
 *
 * Edge Function for weekly challenges management.
 * Handles fetching challenges, tracking progress, and claiming rewards.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPES
// ============================================================================

interface ChallengesApiRequest {
  action: string;
  params?: Record<string, unknown>;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { action, params = {} }: ChallengesApiRequest = await req.json();

    let result: unknown;

    switch (action) {
      case 'get_active_challenges':
        result = await getActiveChallenges(supabaseAdmin, user.id);
        break;

      case 'get_challenge_progress':
        result = await getChallengeProgress(
          supabaseAdmin,
          user.id,
          params.challenge_id as string
        );
        break;

      case 'get_all_progress':
        result = await getAllProgress(supabaseAdmin, user.id);
        break;

      case 'claim_reward':
        result = await claimReward(
          supabaseAdmin,
          user.id,
          params.challenge_id as string
        );
        break;

      case 'update_progress':
        result = await updateProgress(
          supabaseAdmin,
          user.id,
          params.challenge_type as string,
          params.increment as number || 1
        );
        break;

      case 'generate_challenges':
        result = await generateChallenges(supabaseAdmin);
        break;

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
    console.error('[challenges-api] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function getActiveChallenges(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const now = new Date().toISOString();

  // Get active challenges
  const { data: challenges, error: challengesError } = await supabase
    .from('weekly_challenges')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now)
    .gte('ends_at', now)
    .order('created_at', { ascending: false });

  if (challengesError) {
    console.error('[challenges-api] Error fetching challenges:', challengesError);
    throw new Error('Failed to fetch challenges');
  }

  if (!challenges || challenges.length === 0) {
    return [];
  }

  // Get user's progress for these challenges
  const challengeIds = challenges.map((c: any) => c.id);
  const { data: progressRecords } = await supabase
    .from('user_challenge_progress')
    .select('*')
    .eq('user_id', userId)
    .in('challenge_id', challengeIds);

  const progressMap = new Map(
    (progressRecords || []).map((p: any) => [p.challenge_id, p])
  );

  // Combine challenges with progress
  return challenges.map((challenge: any) => {
    const progress = progressMap.get(challenge.id);
    return {
      ...challenge,
      progress: progress ? {
        current_value: progress.current_value,
        completed_at: progress.completed_at,
        reward_claimed: progress.reward_claimed,
      } : null,
    };
  });
}

async function getChallengeProgress(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  challengeId: string
) {
  const { data, error } = await supabase
    .from('user_challenge_progress')
    .select(`
      *,
      challenge:weekly_challenges(*)
    `)
    .eq('user_id', userId)
    .eq('challenge_id', challengeId)
    .maybeSingle();

  if (error) {
    console.error('[challenges-api] Error fetching progress:', error);
    throw new Error('Failed to fetch progress');
  }

  return data;
}

async function getAllProgress(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const { data, error } = await supabase
    .from('user_challenge_progress')
    .select(`
      *,
      challenge:weekly_challenges(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[challenges-api] Error fetching all progress:', error);
    throw new Error('Failed to fetch progress');
  }

  return data || [];
}

async function claimReward(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  challengeId: string
) {
  // Use the RPC function for atomic reward claiming
  const { data, error } = await supabase.rpc('claim_challenge_reward', {
    p_user_id: userId,
    p_challenge_id: challengeId,
  });

  if (error) {
    console.error('[challenges-api] Error claiming reward:', error);
    throw new Error('Failed to claim reward');
  }

  const result = data as { success: boolean; error?: string; reward_type?: string; reward_value?: Record<string, unknown> };

  if (!result.success) {
    throw new Error(result.error || 'Failed to claim reward');
  }

  // Process the reward based on type
  if (result.reward_type) {
    await processReward(supabase, userId, result.reward_type, result.reward_value || {});
  }

  return result;
}

async function updateProgress(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  challengeType: string,
  increment: number
) {
  // Use the RPC function for atomic progress update
  const { data, error } = await supabase.rpc('update_challenge_progress', {
    p_user_id: userId,
    p_challenge_type: challengeType,
    p_increment: increment,
  });

  if (error) {
    // Log the actual error for debugging
    console.error('[challenges-api] Error updating progress:', error.message, error.details, error.hint);

    // If no challenges exist, return empty array instead of throwing
    // This allows the app to continue working even if challenges haven't been generated
    if (error.message?.includes('no rows') || error.code === 'PGRST116') {
      console.log('[challenges-api] No active challenges found for type:', challengeType);
      return [];
    }

    throw new Error('Failed to update progress');
  }

  return data || [];
}

async function generateChallenges(
  supabase: ReturnType<typeof createClient>
) {
  // Call the RPC function to generate weekly challenges from templates
  const { error } = await supabase.rpc('generate_weekly_challenges');

  if (error) {
    console.error('[challenges-api] Error generating challenges:', error);
    throw new Error('Failed to generate challenges');
  }

  // Return the newly generated challenges
  const now = new Date().toISOString();
  const { data: challenges } = await supabase
    .from('weekly_challenges')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now)
    .gte('ends_at', now);

  return { generated: true, challenges: challenges || [] };
}

// ============================================================================
// REWARD PROCESSING
// ============================================================================

async function processReward(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  rewardType: string,
  rewardValue: Record<string, unknown>
) {
  console.log(`[challenges-api] Processing reward: ${rewardType}`, rewardValue);

  switch (rewardType) {
    case 'trial_mover':
    case 'trial_crusher': {
      // Create a trial record
      const trialDays = (rewardValue.trial_days as number) || 3;
      const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
      const tierType = rewardType === 'trial_crusher' ? 'crusher' : 'mover';

      await supabase.from('user_trials').insert({
        user_id: userId,
        trial_type: tierType,
        source: 'challenge_reward',
        activated_at: new Date().toISOString(),
        expires_at: expiresAt,
      });
      break;
    }

    case 'badge': {
      // Award badge (store in user_cosmetics or similar)
      const badgeId = rewardValue.badge_id as string;
      if (badgeId) {
        await supabase.from('user_cosmetics').upsert({
          user_id: userId,
          cosmetic_id: badgeId,
          acquired_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,cosmetic_id',
        });
      }
      break;
    }

    case 'achievement_boost': {
      // Add bonus to achievement progress
      const achievementId = rewardValue.achievement_id as string;
      const bonus = (rewardValue.bonus as number) || 0;

      if (achievementId && bonus > 0) {
        // This would need the update_achievement_progress logic
        // For now, log it for manual processing
        console.log(`[challenges-api] Achievement boost: ${achievementId} +${bonus}`);
      }
      break;
    }

    case 'cosmetic': {
      // Award cosmetic item
      const cosmeticId = rewardValue.cosmetic_id as string;
      if (cosmeticId) {
        await supabase.from('user_cosmetics').upsert({
          user_id: userId,
          cosmetic_id: cosmeticId,
          acquired_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,cosmetic_id',
        });
      }
      break;
    }

    default:
      console.log(`[challenges-api] Unknown reward type: ${rewardType}`);
  }
}
