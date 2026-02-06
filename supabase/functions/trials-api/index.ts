import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';

// Zod schemas for action params
const activateTrialSchema = z.object({
  milestone_progress_id: z.string().uuid(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'activate_trial_reward'
  | 'get_active_trials';

interface RequestBody {
  action: Action;
  params?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify JWT
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const { action, params = {} }: RequestBody = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: unknown;

    switch (action) {
      case 'activate_trial_reward': {
        const validated = validateParams(activateTrialSchema, params);
        if (!validated.success) {
          return validationErrorResponse(validated.error, corsHeaders);
        }
        const milestoneProgressId = validated.data.milestone_progress_id;

        // Get the milestone progress with milestone data
        const { data: progress, error: progressError } = await supabase
          .from('user_milestone_progress')
          .select(`
            id,
            user_id,
            milestone_id,
            earned_at,
            reward_claimed,
            reward_claimed_at,
            reward_expires_at,
            milestone:streak_milestones (
              id,
              name,
              reward_type,
              reward_value
            )
          `)
          .eq('id', milestoneProgressId)
          .eq('user_id', userId)
          .single();

        if (progressError || !progress) {
          return new Response(
            JSON.stringify({ error: 'Milestone progress not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const milestone = progress.milestone as any;
        const rewardType = milestone?.reward_type as string;

        // Verify this is a trial reward type
        if (!['trial_mover', 'trial_coach', 'trial_crusher'].includes(rewardType)) {
          return new Response(
            JSON.stringify({ error: 'Not a trial reward type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get trial duration from reward_value
        const rewardValue = milestone?.reward_value || {};
        const trialHours = (rewardValue.trial_hours as number) || 24;

        // Calculate expiration
        const now = new Date();
        const expiresAt = new Date(now.getTime() + trialHours * 60 * 60 * 1000);

        // Update milestone progress with claim info
        const { error: updateError } = await supabase
          .from('user_milestone_progress')
          .update({
            reward_claimed: true,
            reward_claimed_at: now.toISOString(),
            reward_expires_at: expiresAt.toISOString(),
          })
          .eq('id', milestoneProgressId)
          .eq('user_id', userId);

        if (updateError) {
          console.error('[trials-api] Error updating milestone progress:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to activate trial' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create trial record
        const { error: trialInsertError } = await supabase
          .from('user_trials')
          .upsert({
            user_id: userId,
            trial_type: rewardType,
            milestone_progress_id: milestoneProgressId,
            activated_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            source: 'streak_milestone',
          }, {
            onConflict: 'user_id,trial_type',
          });

        if (trialInsertError) {
          console.error('[trials-api] Error inserting trial record:', trialInsertError);
          // Don't fail - milestone progress is already updated
        }

        console.log(`[trials-api] Activated ${rewardType} trial for ${trialHours} hours for user ${userId}`);

        result = {
          success: true,
          trial: {
            id: progress.id,
            milestone_progress_id: milestoneProgressId,
            milestone_name: milestone?.name || 'Unknown Milestone',
            reward_type: rewardType,
            activated_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            trial_hours: trialHours,
          },
        };
        break;
      }

      case 'get_active_trials': {
        // Fetch claimed trial rewards for the user
        const { data: trials, error } = await supabase
          .from('user_milestone_progress')
          .select(`
            id,
            milestone_id,
            earned_at,
            reward_claimed,
            reward_claimed_at,
            reward_expires_at,
            milestone:streak_milestones (
              id,
              name,
              reward_type,
              reward_value
            )
          `)
          .eq('user_id', userId)
          .eq('reward_claimed', true)
          .not('reward_expires_at', 'is', null);

        if (error) {
          console.error('[trials-api] Error fetching trials:', error);
          throw error;
        }

        // Filter to only trial reward types
        const trialTypes = ['trial_mover', 'trial_coach', 'trial_crusher'];
        const filteredTrials = (trials || []).filter((t: any) => {
          const milestone = t.milestone as any;
          return milestone && trialTypes.includes(milestone.reward_type);
        });

        result = filteredTrials;
        break;
      }

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
    console.error('Error in trials-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
