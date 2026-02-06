import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';

/**
 * Process Coin Reward Edge Function
 *
 * Called internally by other edge functions to award earned coins to users.
 * Supports various reward types like ring completion, competition wins, etc.
 *
 * This function is designed to be called server-to-server (from other edge functions)
 * but can also be called with proper auth for testing/admin purposes.
 */

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const rewardSchema = z.object({
  user_id: z.string().uuid(),
  reward_type: z.string().min(1).max(50),
  reference_type: z.string().optional(),
  reference_id: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  override_amount: z.number().int().positive().optional(), // Optional override for custom amounts
});

const batchRewardSchema = z.object({
  rewards: z.array(rewardSchema).min(1).max(100),
});

// ============================================================================
// CORS HEADERS
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  console.log('[process-coin-reward] Request received:', req.method);

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

    const body = await req.json();
    const action = body.action;
    console.log('[process-coin-reward] Action:', action);

    // Service role client for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // For server-to-server calls, we accept either:
    // 1. A valid service role key in the request
    // 2. A valid user JWT (for testing/admin)
    const authHeader = req.headers.get('Authorization');

    // Check if it's the service role key being used
    const isServiceRole = authHeader?.includes(SUPABASE_SERVICE_ROLE_KEY);

    if (!isServiceRole && authHeader) {
      // Verify user JWT
      const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
      if (SUPABASE_ANON_KEY) {
        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const { error: authError } = await supabaseClient.auth.getUser();
        if (authError) {
          console.error('[process-coin-reward] Auth error:', authError);
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const params = body.params || {};
    let result: unknown;

    switch (action) {
      // ======================================================================
      // PROCESS_REWARD - Award coins for a single event
      // ======================================================================
      case 'process_reward': {
        const v = validateParams(rewardSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const { user_id, reward_type, reference_type, reference_id, metadata, override_amount } = v.data;

        // Get reward config
        const { data: config, error: configError } = await supabase
          .from('coin_reward_config')
          .select('earned_coins')
          .eq('reward_type', reward_type)
          .eq('is_active', true)
          .maybeSingle();

        if (configError) throw configError;

        const earnedCoins = override_amount || config?.earned_coins || 0;

        if (earnedCoins <= 0) {
          console.log(`[process-coin-reward] No reward configured for type: ${reward_type}`);
          result = { success: true, coins_awarded: 0, reason: 'no_reward_configured' };
          break;
        }

        // Prevent duplicate rewards for the same reference
        if (reference_type && reference_id) {
          const { data: existingTx } = await supabase
            .from('coin_transactions')
            .select('id')
            .eq('user_id', user_id)
            .eq('transaction_type', `earn_${reward_type}`)
            .eq('reference_type', reference_type)
            .eq('reference_id', reference_id)
            .maybeSingle();

          if (existingTx) {
            console.log(`[process-coin-reward] Reward already processed for ${reference_type}:${reference_id}`);
            result = { success: true, coins_awarded: 0, reason: 'already_rewarded' };
            break;
          }
        }

        // Credit coins
        const { data: transaction, error: creditError } = await supabase.rpc('credit_coins', {
          p_user_id: user_id,
          p_earned_coins: earnedCoins,
          p_premium_coins: 0,
          p_transaction_type: `earn_${reward_type}`,
          p_reference_type: reference_type || null,
          p_reference_id: reference_id || null,
          p_metadata: metadata || null,
        });

        if (creditError) throw creditError;

        console.log(`[process-coin-reward] Awarded ${earnedCoins} coins to ${user_id} for ${reward_type}`);

        result = {
          success: true,
          coins_awarded: earnedCoins,
          transaction,
        };
        break;
      }

      // ======================================================================
      // PROCESS_BATCH_REWARDS - Award coins for multiple events
      // ======================================================================
      case 'process_batch_rewards': {
        const v = validateParams(batchRewardSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const results: any[] = [];

        for (const reward of v.data.rewards) {
          try {
            // Get reward config
            const { data: config } = await supabase
              .from('coin_reward_config')
              .select('earned_coins')
              .eq('reward_type', reward.reward_type)
              .eq('is_active', true)
              .maybeSingle();

            const earnedCoins = reward.override_amount || config?.earned_coins || 0;

            if (earnedCoins <= 0) {
              results.push({
                user_id: reward.user_id,
                reward_type: reward.reward_type,
                success: true,
                coins_awarded: 0,
                reason: 'no_reward_configured',
              });
              continue;
            }

            // Prevent duplicate rewards
            if (reward.reference_type && reward.reference_id) {
              const { data: existingTx } = await supabase
                .from('coin_transactions')
                .select('id')
                .eq('user_id', reward.user_id)
                .eq('transaction_type', `earn_${reward.reward_type}`)
                .eq('reference_type', reward.reference_type)
                .eq('reference_id', reward.reference_id)
                .maybeSingle();

              if (existingTx) {
                results.push({
                  user_id: reward.user_id,
                  reward_type: reward.reward_type,
                  success: true,
                  coins_awarded: 0,
                  reason: 'already_rewarded',
                });
                continue;
              }
            }

            // Credit coins
            await supabase.rpc('credit_coins', {
              p_user_id: reward.user_id,
              p_earned_coins: earnedCoins,
              p_premium_coins: 0,
              p_transaction_type: `earn_${reward.reward_type}`,
              p_reference_type: reward.reference_type || null,
              p_reference_id: reward.reference_id || null,
              p_metadata: reward.metadata || null,
            });

            results.push({
              user_id: reward.user_id,
              reward_type: reward.reward_type,
              success: true,
              coins_awarded: earnedCoins,
            });
          } catch (err: any) {
            results.push({
              user_id: reward.user_id,
              reward_type: reward.reward_type,
              success: false,
              error: err.message,
            });
          }
        }

        const totalAwarded = results.reduce((sum, r) => sum + (r.coins_awarded || 0), 0);
        result = {
          success: true,
          total_coins_awarded: totalAwarded,
          results,
        };
        break;
      }

      // ======================================================================
      // CREDIT_IAP_PURCHASE - Credit premium coins from IAP
      // ======================================================================
      case 'credit_iap_purchase': {
        const iapSchema = z.object({
          user_id: z.string().uuid(),
          product_id: z.string().min(1),
          transaction_id: z.string().min(1),
        });

        const v = validateParams(iapSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const { user_id, product_id, transaction_id } = v.data;

        // Check if already processed
        const { data: existingTx } = await supabase
          .from('coin_transactions')
          .select('id')
          .eq('reference_type', 'iap_transaction')
          .eq('reference_id', transaction_id)
          .maybeSingle();

        if (existingTx) {
          return new Response(
            JSON.stringify({ error: 'Transaction already processed' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get product details
        const { data: product, error: productError } = await supabase
          .from('iap_coin_products')
          .select('*')
          .eq('revenuecat_product_id', product_id)
          .eq('is_active', true)
          .single();

        if (productError || !product) {
          return new Response(
            JSON.stringify({ error: 'Product not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const totalCoins = product.premium_coins + (product.bonus_coins || 0);

        // Credit coins
        const { data: transaction, error: creditError } = await supabase.rpc('credit_coins', {
          p_user_id: user_id,
          p_earned_coins: 0,
          p_premium_coins: totalCoins,
          p_transaction_type: 'purchase_iap',
          p_reference_type: 'iap_transaction',
          p_reference_id: transaction_id,
          p_metadata: {
            product_id,
            product_name: product.name,
            base_coins: product.premium_coins,
            bonus_coins: product.bonus_coins,
            price_usd: product.price_usd,
          },
        });

        if (creditError) throw creditError;

        console.log(`[process-coin-reward] IAP: Credited ${totalCoins} premium coins to ${user_id}`);

        result = {
          success: true,
          premium_coins_credited: totalCoins,
          product,
          transaction,
        };
        break;
      }

      // ======================================================================
      // GET_USER_BALANCE - Quick balance check
      // ======================================================================
      case 'get_user_balance': {
        const userIdSchema = z.object({ user_id: z.string().uuid() });
        const v = validateParams(userIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const { data, error } = await supabase.rpc('get_or_create_coin_balance', {
          p_user_id: v.data.user_id,
        });

        if (error) throw error;
        result = data;
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
  } catch (error: any) {
    console.error('[process-coin-reward] Error:', error);
    return new Response(
      JSON.stringify({
        error: error?.message || 'Internal server error',
        details: error?.details || error?.hint || '',
        code: error?.code || '',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
