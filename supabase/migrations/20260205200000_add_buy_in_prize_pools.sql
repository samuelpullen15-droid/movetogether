-- ============================================================
-- Add buy-in prize pool support
-- ============================================================
-- Adds a "buy_in" pool_type option so that every participant
-- pays a fixed amount to join, growing the prize pool.

-- 1. Add buy-in columns to prize_pools
ALTER TABLE prize_pools
  ADD COLUMN IF NOT EXISTS pool_type TEXT NOT NULL DEFAULT 'creator_funded'
    CHECK (pool_type IN ('creator_funded', 'buy_in')),
  ADD COLUMN IF NOT EXISTS buy_in_amount DECIMAL(10, 2)
    CHECK (buy_in_amount IS NULL OR (buy_in_amount >= 1 AND buy_in_amount <= 100)),
  ADD COLUMN IF NOT EXISTS participant_count INTEGER NOT NULL DEFAULT 0;

-- 2. Add buy-in columns to pending_prize_pools
ALTER TABLE pending_prize_pools
  ADD COLUMN IF NOT EXISTS pool_type TEXT NOT NULL DEFAULT 'creator_funded'
    CHECK (pool_type IN ('creator_funded', 'buy_in')),
  ADD COLUMN IF NOT EXISTS buy_in_amount DECIMAL(10, 2);

-- 3. Add buy_in_amount to competitions (denormalized for card display)
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS buy_in_amount DECIMAL(10, 2);

-- 4. Create buy_in_payments table to track individual participant payments
CREATE TABLE IF NOT EXISTS buy_in_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_pool_id UUID NOT NULL REFERENCES prize_pools(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 1 AND amount <= 100),
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_charge_id TEXT,
  stripe_refund_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(prize_pool_id, user_id)
);

-- 5. RLS: enable deny-all (no policies per security model)
ALTER TABLE buy_in_payments ENABLE ROW LEVEL SECURITY;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_buy_in_payments_pool ON buy_in_payments(prize_pool_id);
CREATE INDEX IF NOT EXISTS idx_buy_in_payments_competition ON buy_in_payments(competition_id);
CREATE INDEX IF NOT EXISTS idx_buy_in_payments_user ON buy_in_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_buy_in_payments_status ON buy_in_payments(status);

-- 7. updated_at trigger
DROP TRIGGER IF EXISTS update_buy_in_payments_updated_at ON buy_in_payments;
CREATE TRIGGER update_buy_in_payments_updated_at
  BEFORE UPDATE ON buy_in_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
