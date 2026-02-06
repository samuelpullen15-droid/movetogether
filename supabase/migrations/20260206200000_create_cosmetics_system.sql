-- ============================================================================
-- COSMETICS SYSTEM WITH DUAL CURRENCY
-- ============================================================================
-- Creates the infrastructure for:
-- - Earned coins (from activity, competitions, achievements, streaks)
-- - Premium coins (purchased via IAP)
-- - Cosmetic items (frames, badges, backgrounds, icons, ring themes)
-- - Consumables (streak freezes, competition boosts)
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE cosmetic_type AS ENUM (
  'profile_frame',
  'achievement_badge',
  'profile_background',
  'app_icon',
  'ring_theme',
  'streak_freeze',
  'competition_boost'
);

CREATE TYPE cosmetic_rarity AS ENUM (
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary'
);

-- ============================================================================
-- COSMETIC CATALOG
-- ============================================================================

CREATE TABLE cosmetic_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  cosmetic_type cosmetic_type NOT NULL,
  rarity cosmetic_rarity NOT NULL DEFAULT 'common',

  -- Pricing (null = not purchasable with that currency)
  earned_coin_price INTEGER,
  premium_coin_price INTEGER,

  -- Unlock conditions (alternative to purchase)
  unlock_condition JSONB,  -- e.g., {"achievement_id": "xxx", "tier": "gold"}
  subscription_tier_required TEXT,  -- 'mover', 'crusher', or null

  -- Visual assets
  asset_url TEXT,
  preview_url TEXT,

  -- Type-specific configuration
  theme_config JSONB,  -- For ring_theme: {"move": "#FF0000", "exercise": "#00FF00", "stand": "#0000FF"}

  -- Consumable properties
  is_consumable BOOLEAN DEFAULT FALSE,
  consumable_duration_hours INTEGER,  -- For streak_freeze: 24
  consumable_effect JSONB,  -- For competition_boost: {"bonus_percentage": 10}

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for store queries
CREATE INDEX idx_cosmetic_items_type ON cosmetic_items(cosmetic_type) WHERE is_active = TRUE;
CREATE INDEX idx_cosmetic_items_rarity ON cosmetic_items(rarity) WHERE is_active = TRUE;

-- ============================================================================
-- USER COIN BALANCES
-- ============================================================================

CREATE TABLE user_coin_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Current balances
  earned_coins INTEGER NOT NULL DEFAULT 0 CHECK (earned_coins >= 0),
  premium_coins INTEGER NOT NULL DEFAULT 0 CHECK (premium_coins >= 0),

  -- Lifetime stats (for analytics/achievements)
  lifetime_earned_coins INTEGER NOT NULL DEFAULT 0,
  lifetime_premium_coins INTEGER NOT NULL DEFAULT 0,
  lifetime_spent_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_spent_premium INTEGER NOT NULL DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX idx_user_coin_balances_user ON user_coin_balances(user_id);

-- ============================================================================
-- USER COSMETIC INVENTORY
-- ============================================================================

CREATE TABLE user_cosmetic_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_item_id UUID NOT NULL REFERENCES cosmetic_items(id),

  -- Acquisition info
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  acquisition_type TEXT NOT NULL CHECK (acquisition_type IN ('purchase', 'unlock', 'gift', 'reward')),
  coins_spent_earned INTEGER DEFAULT 0,
  coins_spent_premium INTEGER DEFAULT 0,

  -- State
  is_equipped BOOLEAN DEFAULT FALSE,

  -- Consumable state
  is_consumed BOOLEAN DEFAULT FALSE,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ  -- For time-limited consumables

  -- NOTE: No UNIQUE constraint here - we use partial index below for consumables
);

-- Only enforce uniqueness for non-consumed items
CREATE UNIQUE INDEX idx_inventory_unique_non_consumable
ON user_cosmetic_inventory(user_id, cosmetic_item_id)
WHERE is_consumed = FALSE;

-- Index for inventory queries
CREATE INDEX idx_user_inventory_user ON user_cosmetic_inventory(user_id);
CREATE INDEX idx_user_inventory_equipped ON user_cosmetic_inventory(user_id) WHERE is_equipped = TRUE;

-- ============================================================================
-- COIN TRANSACTIONS (Audit Log)
-- ============================================================================

CREATE TABLE coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Transaction type categorization
  transaction_type TEXT NOT NULL,
  -- Types: 'earn_rings', 'earn_competition', 'earn_achievement', 'earn_streak',
  --        'purchase_iap', 'spend_cosmetic', 'spend_consumable', 'refund', 'admin_grant'

  -- Delta values (positive = credit, negative = debit)
  earned_coin_delta INTEGER DEFAULT 0,
  premium_coin_delta INTEGER DEFAULT 0,

  -- Balance after transaction
  earned_coin_balance_after INTEGER NOT NULL,
  premium_coin_balance_after INTEGER NOT NULL,

  -- Reference to related entity
  reference_type TEXT,  -- 'cosmetic_item', 'competition', 'achievement', 'iap_product', 'streak'
  reference_id TEXT,

  -- Additional context
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for transaction history queries
CREATE INDEX idx_coin_transactions_user ON coin_transactions(user_id);
CREATE INDEX idx_coin_transactions_user_created ON coin_transactions(user_id, created_at DESC);
CREATE INDEX idx_coin_transactions_type ON coin_transactions(transaction_type);

-- ============================================================================
-- IAP COIN PRODUCTS
-- ============================================================================

CREATE TABLE iap_coin_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revenuecat_product_id TEXT NOT NULL UNIQUE,

  name TEXT NOT NULL,
  description TEXT,

  -- Coin values
  premium_coins INTEGER NOT NULL,
  bonus_coins INTEGER DEFAULT 0,  -- Extra coins as promotion

  -- Pricing (for display, actual price comes from store)
  price_usd DECIMAL(10, 2) NOT NULL,

  -- Display order and status
  sort_order INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ACTIVE COSMETIC EFFECTS
-- ============================================================================
-- Tracks what cosmetics are currently equipped/active for each user
-- One effect per type (e.g., one profile_frame at a time)

CREATE TABLE active_cosmetic_effects (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  effect_type TEXT NOT NULL,  -- 'profile_frame', 'ring_theme', etc.

  cosmetic_item_id UUID NOT NULL REFERENCES cosmetic_items(id),
  inventory_id UUID NOT NULL REFERENCES user_cosmetic_inventory(id),

  -- For consumables
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- For time-limited effects like streak_freeze

  -- For competition-specific boosts
  competition_id UUID,

  PRIMARY KEY (user_id, effect_type)
);

-- Index for quick lookups
CREATE INDEX idx_active_effects_user ON active_cosmetic_effects(user_id);
CREATE INDEX idx_active_effects_expires ON active_cosmetic_effects(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- COIN REWARD CONFIGURATION
-- ============================================================================
-- Stores the coin values for various activities (easily adjustable)

CREATE TABLE coin_reward_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_type TEXT NOT NULL UNIQUE,
  earned_coins INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default reward values
INSERT INTO coin_reward_config (reward_type, earned_coins, description) VALUES
  ('rings_closed_all', 10, 'Close all 3 activity rings'),
  ('competition_win_1st', 100, 'Win 1st place in competition'),
  ('competition_win_2nd', 50, 'Win 2nd place in competition'),
  ('competition_win_3rd', 25, 'Win 3rd place in competition'),
  ('competition_complete', 10, 'Complete any competition'),
  ('streak_milestone_7', 25, '7-day streak milestone'),
  ('streak_milestone_30', 100, '30-day streak milestone'),
  ('streak_milestone_100', 500, '100-day streak milestone'),
  ('achievement_bronze', 10, 'Unlock bronze achievement'),
  ('achievement_silver', 25, 'Unlock silver achievement'),
  ('achievement_gold', 50, 'Unlock gold achievement'),
  ('achievement_platinum', 100, 'Unlock platinum achievement'),
  ('weekly_challenge_complete', 50, 'Complete weekly challenge'),
  ('referral_success', 100, 'Successful referral signup');

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Enable RLS with deny-all default (service_role bypass only)

ALTER TABLE cosmetic_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_coin_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cosmetic_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE iap_coin_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_cosmetic_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_reward_config ENABLE ROW LEVEL SECURITY;

-- No policies created = deny all for anon/authenticated
-- All access through Edge Functions with service_role

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get or create user coin balance
CREATE OR REPLACE FUNCTION get_or_create_coin_balance(p_user_id UUID)
RETURNS user_coin_balances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance user_coin_balances;
BEGIN
  -- Try to get existing balance
  SELECT * INTO v_balance FROM user_coin_balances WHERE user_id = p_user_id;

  -- Create if not exists
  IF NOT FOUND THEN
    INSERT INTO user_coin_balances (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_balance;
  END IF;

  RETURN v_balance;
END;
$$;

-- Function to credit coins to a user
CREATE OR REPLACE FUNCTION credit_coins(
  p_user_id UUID,
  p_earned_coins INTEGER DEFAULT 0,
  p_premium_coins INTEGER DEFAULT 0,
  p_transaction_type TEXT DEFAULT 'admin_grant',
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS coin_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance user_coin_balances;
  v_transaction coin_transactions;
BEGIN
  -- Get or create balance
  v_balance := get_or_create_coin_balance(p_user_id);

  -- Update balance
  UPDATE user_coin_balances
  SET
    earned_coins = earned_coins + COALESCE(p_earned_coins, 0),
    premium_coins = premium_coins + COALESCE(p_premium_coins, 0),
    lifetime_earned_coins = lifetime_earned_coins + GREATEST(COALESCE(p_earned_coins, 0), 0),
    lifetime_premium_coins = lifetime_premium_coins + GREATEST(COALESCE(p_premium_coins, 0), 0),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_balance;

  -- Record transaction
  INSERT INTO coin_transactions (
    user_id,
    transaction_type,
    earned_coin_delta,
    premium_coin_delta,
    earned_coin_balance_after,
    premium_coin_balance_after,
    reference_type,
    reference_id,
    metadata
  ) VALUES (
    p_user_id,
    p_transaction_type,
    COALESCE(p_earned_coins, 0),
    COALESCE(p_premium_coins, 0),
    v_balance.earned_coins,
    v_balance.premium_coins,
    p_reference_type,
    p_reference_id,
    p_metadata
  )
  RETURNING * INTO v_transaction;

  RETURN v_transaction;
END;
$$;

-- Function to debit coins from a user
CREATE OR REPLACE FUNCTION debit_coins(
  p_user_id UUID,
  p_earned_coins INTEGER DEFAULT 0,
  p_premium_coins INTEGER DEFAULT 0,
  p_transaction_type TEXT DEFAULT 'spend_cosmetic',
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS coin_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance user_coin_balances;
  v_transaction coin_transactions;
BEGIN
  -- Get current balance
  SELECT * INTO v_balance FROM user_coin_balances WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User has no coin balance';
  END IF;

  -- Check sufficient balance
  IF v_balance.earned_coins < COALESCE(p_earned_coins, 0) THEN
    RAISE EXCEPTION 'Insufficient earned coins';
  END IF;

  IF v_balance.premium_coins < COALESCE(p_premium_coins, 0) THEN
    RAISE EXCEPTION 'Insufficient premium coins';
  END IF;

  -- Update balance
  UPDATE user_coin_balances
  SET
    earned_coins = earned_coins - COALESCE(p_earned_coins, 0),
    premium_coins = premium_coins - COALESCE(p_premium_coins, 0),
    lifetime_spent_earned = lifetime_spent_earned + COALESCE(p_earned_coins, 0),
    lifetime_spent_premium = lifetime_spent_premium + COALESCE(p_premium_coins, 0),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_balance;

  -- Record transaction (negative delta)
  INSERT INTO coin_transactions (
    user_id,
    transaction_type,
    earned_coin_delta,
    premium_coin_delta,
    earned_coin_balance_after,
    premium_coin_balance_after,
    reference_type,
    reference_id,
    metadata
  ) VALUES (
    p_user_id,
    p_transaction_type,
    -COALESCE(p_earned_coins, 0),
    -COALESCE(p_premium_coins, 0),
    v_balance.earned_coins,
    v_balance.premium_coins,
    p_reference_type,
    p_reference_id,
    p_metadata
  )
  RETURNING * INTO v_transaction;

  RETURN v_transaction;
END;
$$;

-- ============================================================================
-- LOCK DOWN FUNCTIONS (Security)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION get_or_create_coin_balance FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_coin_balance TO service_role;

REVOKE EXECUTE ON FUNCTION credit_coins FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION credit_coins TO service_role;

REVOKE EXECUTE ON FUNCTION debit_coins FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION debit_coins TO service_role;
