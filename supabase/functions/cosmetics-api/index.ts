import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z, validateParams, validationErrorResponse } from '../_shared/validation.ts';

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const cosmeticIdSchema = z.object({
  cosmetic_item_id: z.string().uuid(),
});

const inventoryIdSchema = z.object({
  inventory_id: z.string().uuid(),
});

const purchaseSchema = z.object({
  cosmetic_item_id: z.string().uuid(),
  use_premium_coins: z.boolean().optional().default(false),
});

const useConsumableSchema = z.object({
  inventory_id: z.string().uuid(),
  competition_id: z.string().uuid().optional(), // For competition boosts
});

const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

const storeFilterSchema = z.object({
  cosmetic_type: z.enum([
    'profile_frame', 'achievement_badge', 'profile_background',
    'app_icon', 'ring_theme', 'streak_freeze', 'competition_boost'
  ]).optional(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
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
  console.log('[cosmetics-api] Request received:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const action = body.action;
    console.log('[cosmetics-api] Action:', action);

    // Service role client for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('[cosmetics-api] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log('[cosmetics-api] Verified user ID:', userId);

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
      // GET_STORE_CATALOG - All active items with user ownership status
      // ======================================================================
      case 'get_store_catalog': {
        const v = validateParams(storeFilterSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        let query = supabase
          .from('cosmetic_items')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (v.data.cosmetic_type) {
          query = query.eq('cosmetic_type', v.data.cosmetic_type);
        }
        if (v.data.rarity) {
          query = query.eq('rarity', v.data.rarity);
        }

        const { data: items, error: itemsError } = await query;
        if (itemsError) throw itemsError;

        // Get user's inventory to mark owned items
        const { data: inventory } = await supabase
          .from('user_cosmetic_inventory')
          .select('cosmetic_item_id, is_equipped, is_consumed')
          .eq('user_id', userId);

        const ownedMap = new Map<string, { is_equipped: boolean; is_consumed: boolean }>();
        (inventory || []).forEach((item: any) => {
          // For non-consumables, just track ownership
          // For consumables, track unconsumed ones
          if (!item.is_consumed) {
            ownedMap.set(item.cosmetic_item_id, {
              is_equipped: item.is_equipped,
              is_consumed: item.is_consumed,
            });
          }
        });

        // Count consumables owned
        const consumableCount = new Map<string, number>();
        (inventory || []).forEach((item: any) => {
          if (!item.is_consumed) {
            const count = consumableCount.get(item.cosmetic_item_id) || 0;
            consumableCount.set(item.cosmetic_item_id, count + 1);
          }
        });

        const catalogWithOwnership = (items || []).map((item: any) => ({
          ...item,
          is_owned: ownedMap.has(item.id),
          is_equipped: ownedMap.get(item.id)?.is_equipped || false,
          owned_count: consumableCount.get(item.id) || 0,
        }));

        result = catalogWithOwnership;
        break;
      }

      // ======================================================================
      // GET_MY_INVENTORY - User's owned cosmetics
      // ======================================================================
      case 'get_my_inventory': {
        const v = validateParams(storeFilterSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        let query = supabase
          .from('user_cosmetic_inventory')
          .select(`
            *,
            cosmetic_item:cosmetic_items(*)
          `)
          .eq('user_id', userId)
          .eq('is_consumed', false)
          .order('acquired_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        // Filter by cosmetic_type if provided
        let filtered = data || [];
        if (v.data.cosmetic_type) {
          filtered = filtered.filter(
            (item: any) => item.cosmetic_item?.cosmetic_type === v.data.cosmetic_type
          );
        }
        if (v.data.rarity) {
          filtered = filtered.filter(
            (item: any) => item.cosmetic_item?.rarity === v.data.rarity
          );
        }

        result = filtered;
        break;
      }

      // ======================================================================
      // GET_MY_COIN_BALANCE - Current coin balances
      // ======================================================================
      case 'get_my_coin_balance': {
        // Use helper function to get or create balance
        const { data, error } = await supabase.rpc('get_or_create_coin_balance', {
          p_user_id: userId,
        });

        if (error) throw error;
        result = data;
        break;
      }

      // ======================================================================
      // PURCHASE_COSMETIC - Buy with earned or premium coins
      // ======================================================================
      case 'purchase_cosmetic': {
        const v = validateParams(purchaseSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const { cosmetic_item_id, use_premium_coins } = v.data;

        // Get the cosmetic item
        const { data: item, error: itemError } = await supabase
          .from('cosmetic_items')
          .select('*')
          .eq('id', cosmetic_item_id)
          .eq('is_active', true)
          .single();

        if (itemError || !item) {
          return new Response(
            JSON.stringify({ error: 'Item not found or not available' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if user already owns this item (for non-consumables)
        if (!item.is_consumable) {
          const { data: existing } = await supabase
            .from('user_cosmetic_inventory')
            .select('id')
            .eq('user_id', userId)
            .eq('cosmetic_item_id', cosmetic_item_id)
            .eq('is_consumed', false)
            .maybeSingle();

          if (existing) {
            return new Response(
              JSON.stringify({ error: 'You already own this item' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Determine price
        const price = use_premium_coins ? item.premium_coin_price : item.earned_coin_price;

        if (price === null) {
          return new Response(
            JSON.stringify({
              error: `This item cannot be purchased with ${use_premium_coins ? 'premium' : 'earned'} coins`,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Debit coins
        const { data: transaction, error: debitError } = await supabase.rpc('debit_coins', {
          p_user_id: userId,
          p_earned_coins: use_premium_coins ? 0 : price,
          p_premium_coins: use_premium_coins ? price : 0,
          p_transaction_type: item.is_consumable ? 'spend_consumable' : 'spend_cosmetic',
          p_reference_type: 'cosmetic_item',
          p_reference_id: cosmetic_item_id,
          p_metadata: { item_name: item.name, use_premium_coins },
        });

        if (debitError) {
          console.error('[cosmetics-api] Debit error:', debitError);
          return new Response(
            JSON.stringify({ error: debitError.message || 'Insufficient coins' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Add to inventory
        const { data: inventoryItem, error: inventoryError } = await supabase
          .from('user_cosmetic_inventory')
          .insert({
            user_id: userId,
            cosmetic_item_id: cosmetic_item_id,
            acquisition_type: 'purchase',
            coins_spent_earned: use_premium_coins ? 0 : price,
            coins_spent_premium: use_premium_coins ? price : 0,
          })
          .select(`*, cosmetic_item:cosmetic_items(*)`)
          .single();

        if (inventoryError) throw inventoryError;

        result = {
          success: true,
          inventory_item: inventoryItem,
          transaction,
        };
        break;
      }

      // ======================================================================
      // EQUIP_COSMETIC - Equip a non-consumable from inventory
      // ======================================================================
      case 'equip_cosmetic': {
        const v = validateParams(inventoryIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const { inventory_id } = v.data;

        // Get inventory item with cosmetic details
        const { data: inventoryItem, error: invError } = await supabase
          .from('user_cosmetic_inventory')
          .select(`*, cosmetic_item:cosmetic_items(*)`)
          .eq('id', inventory_id)
          .eq('user_id', userId)
          .single();

        if (invError || !inventoryItem) {
          return new Response(
            JSON.stringify({ error: 'Item not found in your inventory' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (inventoryItem.cosmetic_item.is_consumable) {
          return new Response(
            JSON.stringify({ error: 'Consumables cannot be equipped, use use_consumable instead' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const effectType = inventoryItem.cosmetic_item.cosmetic_type;

        // Unequip any currently equipped item of same type
        await supabase
          .from('user_cosmetic_inventory')
          .update({ is_equipped: false })
          .eq('user_id', userId)
          .eq('is_equipped', true)
          .in('cosmetic_item_id', (
            await supabase
              .from('cosmetic_items')
              .select('id')
              .eq('cosmetic_type', effectType)
          ).data?.map((i: any) => i.id) || []);

        // Equip the new item
        await supabase
          .from('user_cosmetic_inventory')
          .update({ is_equipped: true })
          .eq('id', inventory_id);

        // Update active effects
        await supabase
          .from('active_cosmetic_effects')
          .upsert({
            user_id: userId,
            effect_type: effectType,
            cosmetic_item_id: inventoryItem.cosmetic_item_id,
            inventory_id: inventory_id,
            activated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,effect_type' });

        result = { success: true, effect_type: effectType };
        break;
      }

      // ======================================================================
      // UNEQUIP_COSMETIC - Unequip a cosmetic
      // ======================================================================
      case 'unequip_cosmetic': {
        const v = validateParams(inventoryIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const { inventory_id } = v.data;

        // Get inventory item
        const { data: inventoryItem, error: invError } = await supabase
          .from('user_cosmetic_inventory')
          .select(`*, cosmetic_item:cosmetic_items(*)`)
          .eq('id', inventory_id)
          .eq('user_id', userId)
          .single();

        if (invError || !inventoryItem) {
          return new Response(
            JSON.stringify({ error: 'Item not found in your inventory' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const effectType = inventoryItem.cosmetic_item.cosmetic_type;

        // Unequip
        await supabase
          .from('user_cosmetic_inventory')
          .update({ is_equipped: false })
          .eq('id', inventory_id);

        // Remove from active effects
        await supabase
          .from('active_cosmetic_effects')
          .delete()
          .eq('user_id', userId)
          .eq('effect_type', effectType);

        result = { success: true };
        break;
      }

      // ======================================================================
      // USE_CONSUMABLE - Activate a streak freeze or competition boost
      // ======================================================================
      case 'use_consumable': {
        const v = validateParams(useConsumableSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const { inventory_id, competition_id } = v.data;

        // Get inventory item
        const { data: inventoryItem, error: invError } = await supabase
          .from('user_cosmetic_inventory')
          .select(`*, cosmetic_item:cosmetic_items(*)`)
          .eq('id', inventory_id)
          .eq('user_id', userId)
          .eq('is_consumed', false)
          .single();

        if (invError || !inventoryItem) {
          return new Response(
            JSON.stringify({ error: 'Consumable not found in your inventory' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!inventoryItem.cosmetic_item.is_consumable) {
          return new Response(
            JSON.stringify({ error: 'This item is not a consumable' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const cosmeticType = inventoryItem.cosmetic_item.cosmetic_type;
        const durationHours = inventoryItem.cosmetic_item.consumable_duration_hours;
        const expiresAt = durationHours
          ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
          : null;

        // For competition boost, require competition_id
        if (cosmeticType === 'competition_boost' && !competition_id) {
          return new Response(
            JSON.stringify({ error: 'competition_id is required for competition boosts' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if user already has an active effect of this type
        const { data: existingEffect } = await supabase
          .from('active_cosmetic_effects')
          .select('*')
          .eq('user_id', userId)
          .eq('effect_type', cosmeticType)
          .maybeSingle();

        if (existingEffect) {
          // For competition boosts, check if same competition
          if (cosmeticType === 'competition_boost' && existingEffect.competition_id === competition_id) {
            return new Response(
              JSON.stringify({ error: 'You already have a boost active for this competition' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          // For streak freeze, check if not expired
          if (cosmeticType === 'streak_freeze' && existingEffect.expires_at) {
            const expiry = new Date(existingEffect.expires_at);
            if (expiry > new Date()) {
              return new Response(
                JSON.stringify({ error: 'You already have an active streak freeze' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        // Mark as consumed
        await supabase
          .from('user_cosmetic_inventory')
          .update({
            is_consumed: true,
            consumed_at: new Date().toISOString(),
            expires_at: expiresAt,
          })
          .eq('id', inventory_id);

        // Create active effect
        await supabase
          .from('active_cosmetic_effects')
          .upsert({
            user_id: userId,
            effect_type: cosmeticType,
            cosmetic_item_id: inventoryItem.cosmetic_item_id,
            inventory_id: inventory_id,
            activated_at: new Date().toISOString(),
            expires_at: expiresAt,
            competition_id: competition_id || null,
          }, { onConflict: 'user_id,effect_type' });

        result = {
          success: true,
          effect_type: cosmeticType,
          expires_at: expiresAt,
          effect: inventoryItem.cosmetic_item.consumable_effect,
        };
        break;
      }

      // ======================================================================
      // GET_ACTIVE_EFFECTS - Currently equipped/active cosmetics
      // ======================================================================
      case 'get_active_effects': {
        const { data, error } = await supabase
          .from('active_cosmetic_effects')
          .select(`
            *,
            cosmetic_item:cosmetic_items(*)
          `)
          .eq('user_id', userId);

        if (error) throw error;

        // Filter out expired effects
        const now = new Date();
        const activeEffects = (data || []).filter((effect: any) => {
          if (!effect.expires_at) return true;
          return new Date(effect.expires_at) > now;
        });

        result = activeEffects;
        break;
      }

      // ======================================================================
      // GET_COIN_BUNDLES - Available IAP products
      // ======================================================================
      case 'get_coin_bundles': {
        const { data, error } = await supabase
          .from('iap_coin_products')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (error) throw error;
        result = data || [];
        break;
      }

      // ======================================================================
      // GET_TRANSACTION_HISTORY - Coin history
      // ======================================================================
      case 'get_transaction_history': {
        const v = validateParams(paginationSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const { limit, offset } = v.data;

        const { data, error, count } = await supabase
          .from('coin_transactions')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        result = {
          transactions: data || [],
          total_count: count,
          limit,
          offset,
        };
        break;
      }

      // ======================================================================
      // GET_REWARD_CONFIG - Get coin reward values (for display)
      // ======================================================================
      case 'get_reward_config': {
        const { data, error } = await supabase
          .from('coin_reward_config')
          .select('*')
          .eq('is_active', true);

        if (error) throw error;

        // Convert to map for easy lookup
        const configMap: Record<string, number> = {};
        (data || []).forEach((config: any) => {
          configMap[config.reward_type] = config.earned_coins;
        });

        result = configMap;
        break;
      }

      // ======================================================================
      // UNLOCK_COSMETIC - Unlock via achievement (internal use)
      // ======================================================================
      case 'unlock_cosmetic': {
        const v = validateParams(cosmeticIdSchema, params);
        if (!v.success) return validationErrorResponse(v.error, corsHeaders);

        const { cosmetic_item_id } = v.data;

        // Check if item exists and has unlock condition
        const { data: item, error: itemError } = await supabase
          .from('cosmetic_items')
          .select('*')
          .eq('id', cosmetic_item_id)
          .single();

        if (itemError || !item) {
          return new Response(
            JSON.stringify({ error: 'Item not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if already owned
        const { data: existing } = await supabase
          .from('user_cosmetic_inventory')
          .select('id')
          .eq('user_id', userId)
          .eq('cosmetic_item_id', cosmetic_item_id)
          .maybeSingle();

        if (existing) {
          result = { success: true, already_owned: true };
          break;
        }

        // Add to inventory (unlocked, not purchased)
        const { data: inventoryItem, error: inventoryError } = await supabase
          .from('user_cosmetic_inventory')
          .insert({
            user_id: userId,
            cosmetic_item_id: cosmetic_item_id,
            acquisition_type: 'unlock',
          })
          .select(`*, cosmetic_item:cosmetic_items(*)`)
          .single();

        if (inventoryError) throw inventoryError;

        result = { success: true, inventory_item: inventoryItem };
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
    console.error('[cosmetics-api] Error:', error);
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
