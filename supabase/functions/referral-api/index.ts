import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | 'get_my_referral_code'
  | 'get_user_by_referral_code'
  | 'register_referral'
  | 'process_referral_rewards'
  | 'get_my_referral_stats';

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
    const token = authHeader?.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Some actions require authentication, some don't
    let userId: string | null = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { action, params = {} }: RequestBody = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: unknown;

    switch (action) {
      // ================================================================
      // GET MY REFERRAL CODE
      // ================================================================
      case 'get_my_referral_code': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('referral_code, full_name, username')
          .eq('id', userId)
          .single();

        if (!profile?.referral_code) {
          return new Response(
            JSON.stringify({ error: 'Referral code not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = {
          referral_code: profile.referral_code,
          referral_link: `https://movetogetherfitness.com/referral/${profile.referral_code}`,
          referrer_name: profile.full_name || profile.username || 'User',
        };
        break;
      }

      // ================================================================
      // GET USER BY REFERRAL CODE (no auth required - for preview)
      // ================================================================
      case 'get_user_by_referral_code': {
        const referralCode = (params.referral_code as string)?.toUpperCase();
        if (!referralCode) {
          return new Response(
            JSON.stringify({ error: 'referral_code is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: referrer } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .eq('referral_code', referralCode)
          .single();

        if (!referrer) {
          return new Response(
            JSON.stringify({ error: 'Invalid referral code' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = {
          referrer_name: referrer.full_name || referrer.username || 'A friend',
          referrer_avatar: referrer.avatar_url,
          reward_description: '7-day Mover trial',
        };
        break;
      }

      // ================================================================
      // REGISTER REFERRAL
      // ================================================================
      case 'register_referral': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const referralCode = (params.referral_code as string)?.toUpperCase();
        if (!referralCode) {
          return new Response(
            JSON.stringify({ error: 'referral_code is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Find referrer by code
        const { data: referrer } = await supabase
          .from('profiles')
          .select('id, referral_code')
          .eq('referral_code', referralCode)
          .single();

        if (!referrer) {
          return new Response(
            JSON.stringify({ error: 'Invalid referral code' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Cannot refer yourself
        if (referrer.id === userId) {
          return new Response(
            JSON.stringify({ error: 'You cannot use your own referral code' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if user has already been referred
        const { data: existing } = await supabase
          .from('user_referrals')
          .select('id')
          .eq('referee_id', userId)
          .maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({ error: 'You have already been referred by someone' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create referral record
        const { data: referral, error: insertError } = await supabase
          .from('user_referrals')
          .insert({
            referrer_id: referrer.id,
            referee_id: userId,
            referral_code: referralCode,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        result = {
          success: true,
          referral_id: referral.id,
          message: 'Referral registered! Complete onboarding to claim your reward.',
        };
        break;
      }

      // ================================================================
      // PROCESS REFERRAL REWARDS
      // ================================================================
      case 'process_referral_rewards': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Find referral record where user is the referee
        const { data: referral } = await supabase
          .from('user_referrals')
          .select('*')
          .eq('referee_id', userId)
          .maybeSingle();

        if (!referral) {
          // No referral to process - not an error, just nothing to do
          result = { success: true, rewards_granted: { referee_reward: false, referrer_reward: false } };
          break;
        }

        // Check if user has completed onboarding
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', userId)
          .single();

        if (!profile?.onboarding_completed) {
          return new Response(
            JSON.stringify({ error: 'Complete onboarding first' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const rewardsGranted = {
          referee_reward: false,
          referrer_reward: false,
        };

        const TRIAL_HOURS = 168; // 7 days
        const now = new Date();
        const expiresAt = new Date(now.getTime() + TRIAL_HOURS * 60 * 60 * 1000);

        // Grant referee reward (7-day Mover trial)
        if (!referral.referee_reward_granted) {
          const { error: trialError } = await supabase
            .from('user_trials')
            .upsert({
              id: crypto.randomUUID(),
              user_id: userId,
              trial_type: 'trial_mover',
              milestone_progress_id: null,
              activated_at: now.toISOString(),
              expires_at: expiresAt.toISOString(),
              source: 'referral',
            }, {
              onConflict: 'user_id,trial_type',
            });

          if (trialError) {
            console.error('Error granting referee trial:', trialError);
          } else {
            await supabase
              .from('user_referrals')
              .update({
                referee_reward_granted: true,
                referee_reward_granted_at: now.toISOString(),
                referee_completed_onboarding: true,
                updated_at: now.toISOString(),
              })
              .eq('id', referral.id);

            rewardsGranted.referee_reward = true;
          }
        }

        // Grant referrer reward (7-day Mover trial)
        if (!referral.referrer_reward_granted) {
          const { error: trialError } = await supabase
            .from('user_trials')
            .upsert({
              id: crypto.randomUUID(),
              user_id: referral.referrer_id,
              trial_type: 'trial_mover',
              milestone_progress_id: null,
              activated_at: now.toISOString(),
              expires_at: expiresAt.toISOString(),
              source: 'referral',
            }, {
              onConflict: 'user_id,trial_type',
            });

          if (trialError) {
            console.error('Error granting referrer trial:', trialError);
          } else {
            await supabase
              .from('user_referrals')
              .update({
                referrer_reward_granted: true,
                referrer_reward_granted_at: now.toISOString(),
                updated_at: now.toISOString(),
              })
              .eq('id', referral.id);

            rewardsGranted.referrer_reward = true;
          }
        }

        result = {
          success: true,
          rewards_granted: rewardsGranted,
          trial_type: 'trial_mover',
          trial_duration_days: 7,
        };
        break;
      }

      // ================================================================
      // GET MY REFERRAL STATS
      // ================================================================
      case 'get_my_referral_stats': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: stats } = await supabase.rpc('get_referral_stats', {
          p_user_id: userId,
        });

        result = stats || { total_referrals: 0, completed_referrals: 0 };
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
    console.error('Error in referral-api:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
