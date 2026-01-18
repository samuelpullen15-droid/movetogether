# Subscription Security Implementation

This document describes the server-side subscription verification system that prevents users from bypassing premium features.

## Overview

All subscription verification is now done **server-side** in Supabase. Client-side checks are only for UI display (showing/hiding features), never for actual access control.

## Database Functions

### `get_user_subscription_tier(p_user_id UUID)`
Returns the subscription tier for a user. Defaults to 'starter' if not found.

```sql
SELECT get_user_subscription_tier('user-uuid-here');
-- Returns: 'starter', 'mover', or 'crusher'
```

### `has_subscription_tier(p_user_id UUID, p_required_tier TEXT)`
Checks if a user has the required subscription tier or higher.

```sql
SELECT has_subscription_tier('user-uuid-here', 'crusher');
-- Returns: true if user has crusher tier, false otherwise
```

## Subscription Tiers

- **starter**: Free tier (default)
- **mover**: Mid-tier subscription
- **crusher**: Premium tier with AI Coach access

## Edge Functions

### AI Coach (`ai-coach`)
- **Requirement**: `crusher` tier
- **Verification**: Uses `get_user_subscription_tier()` RPC function
- **Response**: Returns 403 if user doesn't have crusher tier

### RevenueCat Webhook (`revenuecat-webhook`)
- **Purpose**: Syncs subscription status from RevenueCat to Supabase
- **Trigger**: Automatically called by RevenueCat on subscription events
- **Action**: Updates `subscription_tier` in `profiles` table

## Client-Side Code

### Subscription Store (`src/lib/subscription-store.ts`)
- `checkTier()`: Checks RevenueCat entitlements and syncs to Supabase
- `purchasePackage()`: After purchase, syncs tier to Supabase
- `restore()`: After restore, syncs tier to Supabase
- `syncTierToSupabase()`: Explicitly syncs current tier to database

**Important**: Client-side subscription checks are ONLY for:
- Showing/hiding UI elements (paywalls, upgrade buttons)
- Displaying current tier in settings
- Navigation guards (preventing navigation to premium screens)

**Never** use client-side checks for:
- API access control
- Feature gating
- Data access permissions

## RLS Policies

RLS policies enforce subscription-based access at the database level:

- **rate_limits**: Only `crusher` tier users can insert/update rate limit records
- Additional policies can be added for other tables as needed

## RevenueCat Integration

### Webhook Setup

1. In RevenueCat Dashboard, go to Project Settings > Webhooks
2. Add webhook URL: `https://<your-project>.supabase.co/functions/v1/revenuecat-webhook`
3. Select events: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `UNCANCELLATION`
4. Set webhook secret in Supabase Edge Function secrets: `REVENUECAT_WEBHOOK_SECRET`

### Manual Sync

The client automatically syncs subscription tier to Supabase when:
- User purchases a subscription
- User restores purchases
- App checks subscription tier on startup

## Migration

Run the migration to create the functions and policies:

```bash
supabase migration up
```

Or apply manually via Supabase Dashboard SQL Editor.

## Testing

1. **Test AI Coach Access**:
   - As starter/mover tier: Should receive 403 error
   - As crusher tier: Should access successfully

2. **Test Subscription Sync**:
   - Purchase subscription → Check `profiles.subscription_tier` updates
   - Cancel subscription → Check tier reverts to 'starter'
   - Restore purchases → Check tier updates correctly

3. **Test Webhook**:
   - Use RevenueCat webhook tester or trigger a real event
   - Verify `profiles.subscription_tier` updates in database

## Security Notes

- All subscription verification happens server-side
- Database is the source of truth for subscription tier
- Edge Functions verify subscription before processing requests
- RLS policies provide defense in depth
- Client-side checks are cosmetic only
