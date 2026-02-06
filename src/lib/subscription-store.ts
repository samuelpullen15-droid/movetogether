import { create } from 'zustand';
import {
  hasEntitlement,
  getOfferings,
  purchasePackage as purchaseRevenueCatPackage,
  restorePurchases,
  isRevenueCatEnabled,
  getCustomerInfo,
} from './revenuecatClient';
import type { PurchasesPackage } from './revenuecatClient';
import { useAuthStore } from './auth-store';
import { profileApi } from './edge-functions';

export type SubscriptionTier = 'starter' | 'mover' | 'crusher';

interface SubscriptionState {
  tier: SubscriptionTier;
  isLoading: boolean;
  packages: {
    mover_monthly: PurchasesPackage | null;
    mover_annual: PurchasesPackage | null;
    crusher_monthly: PurchasesPackage | null;
    crusher_annual: PurchasesPackage | null;
  };
  checkTier: () => Promise<void>;
  loadOfferings: () => Promise<void>;
  initializeSubscription: () => Promise<void>;
  purchasePackage: (packageId: 'mover_monthly' | 'mover_annual' | 'crusher_monthly' | 'crusher_annual') => Promise<boolean | 'cancelled'>;
  restore: () => Promise<boolean>;
  syncTierToSupabase: () => Promise<void>;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: 'starter',
  isLoading: true,
  packages: {
    mover_monthly: null,
    mover_annual: null,
    crusher_monthly: null,
    crusher_annual: null,
  },

  checkTier: async () => {
    if (!isRevenueCatEnabled()) {
      console.warn('[Subscription] RevenueCat not enabled - defaulting to starter tier');
      set({ tier: 'starter', isLoading: false });
      return;
    }

    set({ isLoading: true });

    try {
      // Check RevenueCat entitlements (single source of truth)
      const moverResult = await hasEntitlement('mover');
      const crusherResult = await hasEntitlement('crusher');

      let tier: SubscriptionTier = 'starter';

      if (crusherResult.ok && crusherResult.data) {
        tier = 'crusher';
      } else if (moverResult.ok && moverResult.data) {
        tier = 'mover';
      }

      console.log('[Subscription] Tier from RevenueCat:', tier);
      set({ tier, isLoading: false });

      // Sync to Supabase for backup/display purposes only (not used for access control)
      try {
        await get().syncTierToSupabase();
      } catch (syncError) {
        console.error('[Subscription] Error syncing tier to Supabase (keeping tier from RevenueCat):', syncError);
      }
    } catch (error) {
      console.error('[Subscription] Error checking tier:', error);
      set({ tier: 'starter', isLoading: false });
    }
  },

  loadOfferings: async () => {
    if (!isRevenueCatEnabled()) {
      console.log('RevenueCat not enabled, skipping loadOfferings');
      return;
    }

    console.log('Loading offerings from RevenueCat...');
    const result = await getOfferings();
    if (result.ok && result.data.current) {
      const packages = result.data.current.availablePackages;
      console.log('📦 All available packages from RevenueCat:', packages.map(p => ({ 
        identifier: p.identifier, 
        productId: p.product.identifier,
        packageType: p.packageType
      })));
      
      // Try to match packages by identifier first
      let loadedPackages = {
        mover_monthly: packages.find((pkg) => pkg.identifier === 'mover_monthly' || pkg.identifier.includes('mover') && pkg.identifier.includes('monthly')) ?? null,
        mover_annual: packages.find((pkg) => pkg.identifier === 'mover_annual' || pkg.identifier.includes('mover') && pkg.identifier.includes('annual')) ?? null,
        crusher_monthly: packages.find((pkg) => pkg.identifier === 'crusher_monthly' || pkg.identifier.includes('crusher') && pkg.identifier.includes('monthly')) ?? null,
        crusher_annual: packages.find((pkg) => pkg.identifier === 'crusher_annual' || pkg.identifier.includes('crusher') && pkg.identifier.includes('annual')) ?? null,
      };
      
      // If not found by identifier, try matching by product ID or package type
      if (!loadedPackages.mover_monthly && packages.length > 0) {
        // Try to find monthly packages - RevenueCat default is $rc_monthly
        const monthlyPackages = packages.filter(p => 
          p.identifier === '$rc_monthly' || 
          p.packageType === 'MONTHLY' ||
          p.product.identifier.toLowerCase().includes('monthly')
        );
        const annualPackages = packages.filter(p => 
          p.identifier === '$rc_annual' || 
          p.packageType === 'ANNUAL' ||
          p.product.identifier.toLowerCase().includes('annual')
        );
        
        // If we have monthly packages, use the first one for mover_monthly (lower tier)
        // If we have multiple, we might need to differentiate by product ID
        if (monthlyPackages.length > 0) {
          loadedPackages.mover_monthly = monthlyPackages[0];
          if (monthlyPackages.length > 1) {
            loadedPackages.crusher_monthly = monthlyPackages[1];
          }
        }
        if (annualPackages.length > 0) {
          loadedPackages.mover_annual = annualPackages[0];
          if (annualPackages.length > 1) {
            loadedPackages.crusher_annual = annualPackages[1];
          }
        }
      }
      
      console.log('✅ Mapped packages:', {
        mover_monthly: loadedPackages.mover_monthly ? { identifier: loadedPackages.mover_monthly.identifier, productId: loadedPackages.mover_monthly.product.identifier } : 'NOT FOUND',
        mover_annual: loadedPackages.mover_annual ? { identifier: loadedPackages.mover_annual.identifier, productId: loadedPackages.mover_annual.product.identifier } : 'NOT FOUND',
        crusher_monthly: loadedPackages.crusher_monthly ? { identifier: loadedPackages.crusher_monthly.identifier, productId: loadedPackages.crusher_monthly.product.identifier } : 'NOT FOUND',
        crusher_annual: loadedPackages.crusher_annual ? { identifier: loadedPackages.crusher_annual.identifier, productId: loadedPackages.crusher_annual.product.identifier } : 'NOT FOUND',
      });
      
      set({ packages: loadedPackages });
    } else {
      console.error('❌ Failed to load offerings:', result.reason, result.error);
      // Don't throw - just leave packages as null
    }
  },

  initializeSubscription: async () => {
    console.log('[Subscription] Initializing subscription state...');
    const { checkTier, loadOfferings } = get();
    
    // Call both in parallel for faster initialization
    await Promise.all([
      checkTier(),
      loadOfferings(),
    ]);
    
    console.log('[Subscription] Subscription state initialized');
  },

  purchasePackage: async (packageId: 'mover_monthly' | 'mover_annual' | 'crusher_monthly' | 'crusher_annual') => {
    const { packages } = get();
    const packageToPurchase = packages[packageId];

    if (!packageToPurchase) {
      console.error('Package not found:', packageId, 'Available packages:', packages);
      return false;
    }

    // Check if RevenueCat is enabled before attempting purchase
    if (!isRevenueCatEnabled()) {
      console.error('RevenueCat not enabled. In development mode, ensure EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY is set.');
      return false;
    }

    const result = await purchaseRevenueCatPackage(packageToPurchase);
    if (result.ok) {
      // Check entitlements to determine new tier and sync to Supabase
      // This ensures the database is the source of truth for subscription tier
      await get().checkTier();
      // Explicitly sync to Supabase after purchase (checkTier already does this, but be explicit)
      await get().syncTierToSupabase();
      return true;
    }
    
    // If user cancelled, return a special value so we can handle it gracefully
    if (result.reason === 'user_cancelled') {
      console.log('Purchase cancelled by user');
      return 'cancelled' as any; // Return 'cancelled' string to indicate cancellation
    }
    
    // Log the failure reason for debugging
    console.error('Purchase failed:', result.reason, result.error);
    return false;
  },

  restore: async () => {
    const result = await restorePurchases();
    if (result.ok) {
      // Check entitlements to determine tier and sync to Supabase
      await get().checkTier();
      // Explicitly sync to Supabase after restore
      await get().syncTierToSupabase();
      return true;
    }
    return false;
  },

  /**
   * Sync tier TO Supabase for backup/display only
   * NOTE: This writes to Supabase, does not read from it
   * RevenueCat webhooks should also update this field
   */
  syncTierToSupabase: async () => {
    const { tier } = get();
    const user = useAuthStore.getState().user;

    if (!user) {
      return;
    }

    try {
      // Only update if tier has changed
      if (user.subscriptionTier === tier) {
        console.log('[Subscription] Tier already synced to Supabase:', tier);
        return;
      }

      console.log('[Subscription] Syncing tier to Supabase:', tier);
      const { error } = await profileApi.updateSubscriptionTier(tier);

      if (error) {
        console.error('[Subscription] Error syncing tier to Supabase:', error);
      } else {
        console.log('[Subscription] Successfully synced tier to Supabase');
        // Update local auth store
        const updatedUser = { ...user, subscriptionTier: tier };
        useAuthStore.getState().setUser(updatedUser);
      }
    } catch (error) {
      console.error('[Subscription] Error syncing tier to Supabase:', error);
    }
  },
}));
