-- Prize Pool Tables Migration
-- Creates all tables needed for the prize pool feature

-- Pending prize pools (before payment is confirmed)
CREATE TABLE IF NOT EXISTS pending_prize_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  prize_amount DECIMAL(10, 2) NOT NULL CHECK (prize_amount >= 5 AND prize_amount <= 500),
  payout_structure JSONB NOT NULL DEFAULT '{"first": 100}',
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment', 'completed', 'failed', 'cancelled')),
  prize_pool_id UUID, -- Set when payment completes and active pool is created
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active prize pools (payment confirmed)
CREATE TABLE IF NOT EXISTS prize_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_amount DECIMAL(10, 2) NOT NULL,
  remaining_balance DECIMAL(10, 2) NOT NULL,
  payout_structure JSONB NOT NULL DEFAULT '{"first": 100}',
  allowed_payout_methods TEXT[] NOT NULL DEFAULT ARRAY['VISA_PREPAID_CARD'],
  creator_payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (creator_payment_status IN ('pending', 'paid', 'failed')),
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_refund_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'funded', 'distributing', 'completed', 'refunded', 'cancelled')),
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competition_id)
);

-- Prize payouts (individual winner payments)
CREATE TABLE IF NOT EXISTS prize_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_pool_id UUID NOT NULL REFERENCES prize_pools(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  winner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  placement INTEGER NOT NULL CHECK (placement >= 1),
  payout_amount DECIMAL(10, 2) NOT NULL,
  payout_method TEXT NOT NULL DEFAULT 'VISA_PREPAID_CARD',
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  tremendous_order_id TEXT,
  tremendous_reward_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'executed', 'delivered', 'failed', 'cancelled')),
  -- Claim flow fields
  claim_status TEXT NOT NULL DEFAULT 'unclaimed' CHECK (claim_status IN ('unclaimed', 'claimed', 'expired')),
  chosen_reward_type TEXT, -- e.g., 'VISA_PREPAID_CARD', 'AMAZON', 'TARGET', etc.
  claimed_at TIMESTAMPTZ,
  claim_expires_at TIMESTAMPTZ, -- Winners have limited time to claim
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  executed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  seen_by_winner BOOLEAN NOT NULL DEFAULT false,
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(prize_pool_id, winner_id)
);

-- Add columns if table already existed without them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prize_payouts' AND column_name = 'seen_by_winner'
  ) THEN
    ALTER TABLE prize_payouts ADD COLUMN seen_by_winner BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prize_payouts' AND column_name = 'seen_at'
  ) THEN
    ALTER TABLE prize_payouts ADD COLUMN seen_at TIMESTAMPTZ;
  END IF;

  -- Claim flow columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prize_payouts' AND column_name = 'claim_status'
  ) THEN
    ALTER TABLE prize_payouts ADD COLUMN claim_status TEXT NOT NULL DEFAULT 'unclaimed';
    ALTER TABLE prize_payouts ADD CONSTRAINT prize_payouts_claim_status_check
      CHECK (claim_status IN ('unclaimed', 'claimed', 'expired'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prize_payouts' AND column_name = 'chosen_reward_type'
  ) THEN
    ALTER TABLE prize_payouts ADD COLUMN chosen_reward_type TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prize_payouts' AND column_name = 'claimed_at'
  ) THEN
    ALTER TABLE prize_payouts ADD COLUMN claimed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prize_payouts' AND column_name = 'claim_expires_at'
  ) THEN
    ALTER TABLE prize_payouts ADD COLUMN claim_expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Prize audit log
CREATE TABLE IF NOT EXISTS prize_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_pool_id UUID REFERENCES prize_pools(id) ON DELETE SET NULL,
  payout_id UUID REFERENCES prize_payouts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add prize_pool_id to competitions if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competitions' AND column_name = 'prize_pool_id'
  ) THEN
    ALTER TABLE competitions ADD COLUMN prize_pool_id UUID REFERENCES prize_pools(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competitions' AND column_name = 'has_prize_pool'
  ) THEN
    ALTER TABLE competitions ADD COLUMN has_prize_pool BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_prize_pools_user ON pending_prize_pools(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_prize_pools_competition ON pending_prize_pools(competition_id);
CREATE INDEX IF NOT EXISTS idx_pending_prize_pools_status ON pending_prize_pools(status);

CREATE INDEX IF NOT EXISTS idx_prize_pools_competition ON prize_pools(competition_id);
CREATE INDEX IF NOT EXISTS idx_prize_pools_creator ON prize_pools(creator_id);
CREATE INDEX IF NOT EXISTS idx_prize_pools_status ON prize_pools(status);

CREATE INDEX IF NOT EXISTS idx_prize_payouts_winner ON prize_payouts(winner_id);
CREATE INDEX IF NOT EXISTS idx_prize_payouts_competition ON prize_payouts(competition_id);

-- Create partial index for unseen payouts (using EXECUTE for conditional DDL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prize_payouts' AND column_name = 'seen_by_winner'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_prize_payouts_unseen'
  ) THEN
    EXECUTE 'CREATE INDEX idx_prize_payouts_unseen ON prize_payouts(winner_id, seen_by_winner) WHERE seen_by_winner = false';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prize_audit_log_pool ON prize_audit_log(prize_pool_id);
CREATE INDEX IF NOT EXISTS idx_prize_audit_log_payout ON prize_audit_log(payout_id);

-- RLS Policies
ALTER TABLE pending_prize_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE prize_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE prize_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prize_audit_log ENABLE ROW LEVEL SECURITY;

-- Pending prize pools: only creator can see their own
CREATE POLICY "pending_prize_pools_select" ON pending_prize_pools
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "pending_prize_pools_insert" ON pending_prize_pools
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Prize pools: creator and participants can view
CREATE POLICY "prize_pools_select" ON prize_pools
FOR SELECT TO authenticated
USING (
  creator_id = auth.uid()
  OR competition_id IN (
    SELECT competition_id FROM competition_participants WHERE user_id = auth.uid()
  )
);

-- Prize payouts: winner can see their own, creator can see all for their competition
CREATE POLICY "prize_payouts_select" ON prize_payouts
FOR SELECT TO authenticated
USING (
  winner_id = auth.uid()
  OR prize_pool_id IN (SELECT id FROM prize_pools WHERE creator_id = auth.uid())
);

-- Winners can mark their payout as seen
CREATE POLICY "prize_payouts_update_seen" ON prize_payouts
FOR UPDATE TO authenticated
USING (winner_id = auth.uid())
WITH CHECK (winner_id = auth.uid());

-- Audit log: viewable by creator and winners involved
CREATE POLICY "prize_audit_log_select" ON prize_audit_log
FOR SELECT TO authenticated
USING (
  actor_id = auth.uid()
  OR prize_pool_id IN (SELECT id FROM prize_pools WHERE creator_id = auth.uid())
  OR payout_id IN (SELECT id FROM prize_payouts WHERE winner_id = auth.uid())
);

-- Service role bypass for edge functions
CREATE POLICY "service_role_pending_prize_pools" ON pending_prize_pools
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_prize_pools" ON prize_pools
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_prize_payouts" ON prize_payouts
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_prize_audit_log" ON prize_audit_log
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pending_prize_pools_updated_at ON pending_prize_pools;
CREATE TRIGGER update_pending_prize_pools_updated_at
  BEFORE UPDATE ON pending_prize_pools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_prize_pools_updated_at ON prize_pools;
CREATE TRIGGER update_prize_pools_updated_at
  BEFORE UPDATE ON prize_pools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_prize_payouts_updated_at ON prize_payouts;
CREATE TRIGGER update_prize_payouts_updated_at
  BEFORE UPDATE ON prize_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
