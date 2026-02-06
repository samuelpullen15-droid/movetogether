/**
 * Cosmetics Store (Zustand)
 *
 * State management for the cosmetics store feature including:
 * - Coin balances (earned + premium)
 * - Store catalog
 * - User inventory
 * - Active effects (equipped items, active consumables)
 * - IAP coin bundles
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchStoreCatalog,
  fetchCoinBalance,
  fetchInventory,
  fetchActiveEffects,
  fetchCoinBundles,
  fetchTransactionHistory,
  purchaseCosmetic as purchaseCosmeticService,
  equipCosmetic as equipCosmeticService,
  unequipCosmetic as unequipCosmeticService,
  useConsumable as useConsumableService,
  groupByType,
  type CosmeticItem,
  type CosmeticType,
  type CosmeticRarity,
  type UserCoinBalance,
  type CosmeticInventoryItem,
  type CoinTransaction,
  type IapCoinProduct,
  type ActiveCosmeticEffect,
} from './cosmetics-service';

// ============================================
// Types
// ============================================

interface CosmeticsState {
  // Data
  coinBalance: UserCoinBalance | null;
  catalog: CosmeticItem[];
  catalogByType: Record<CosmeticType, CosmeticItem[]>;
  inventory: CosmeticInventoryItem[];
  activeEffects: ActiveCosmeticEffect[];
  coinBundles: IapCoinProduct[];
  transactions: CoinTransaction[];
  transactionsTotalCount: number;

  // Loading states
  isLoadingBalance: boolean;
  isLoadingCatalog: boolean;
  isLoadingInventory: boolean;
  isLoadingEffects: boolean;
  isLoadingBundles: boolean;
  isLoadingTransactions: boolean;
  isPurchasing: boolean;
  isEquipping: boolean;

  // Errors
  error: string | null;

  // Hydration
  _hasHydrated: boolean;

  // Actions
  setHasHydrated: (hasHydrated: boolean) => void;
  fetchCoinBalance: () => Promise<void>;
  fetchCatalog: (filters?: { cosmetic_type?: CosmeticType; rarity?: CosmeticRarity }) => Promise<void>;
  fetchInventory: (filters?: { cosmetic_type?: CosmeticType; rarity?: CosmeticRarity }) => Promise<void>;
  fetchActiveEffects: () => Promise<void>;
  fetchCoinBundles: () => Promise<void>;
  fetchTransactionHistory: (limit?: number, offset?: number, append?: boolean) => Promise<void>;
  purchaseCosmetic: (cosmeticItemId: string, usePremiumCoins?: boolean) => Promise<{ success: boolean; error?: string }>;
  equipCosmetic: (inventoryId: string) => Promise<{ success: boolean; error?: string }>;
  unequipCosmetic: (inventoryId: string) => Promise<{ success: boolean; error?: string }>;
  useConsumable: (inventoryId: string, competitionId?: string) => Promise<{ success: boolean; expiresAt?: string; error?: string }>;
  refreshAll: () => Promise<void>;
  clearError: () => void;
  reset: () => void;

  // Computed getters
  getEquippedItem: (effectType: string) => ActiveCosmeticEffect | undefined;
  getActiveRingTheme: () => { move: string; exercise: string; stand: string } | null;
  hasStreakFreezeActive: () => boolean;
  getCompetitionBoost: (competitionId: string) => ActiveCosmeticEffect | undefined;
  getOwnedCount: (cosmeticItemId: string) => number;
  getEquippedInventoryItem: (effectType: string) => CosmeticInventoryItem | undefined;
}

// ============================================
// Default State
// ============================================

const defaultState = {
  coinBalance: null,
  catalog: [],
  catalogByType: {
    profile_frame: [],
    achievement_badge: [],
    profile_background: [],
    app_icon: [],
    ring_theme: [],
    streak_freeze: [],
    competition_boost: [],
  } as Record<CosmeticType, CosmeticItem[]>,
  inventory: [],
  activeEffects: [],
  coinBundles: [],
  transactions: [],
  transactionsTotalCount: 0,
  isLoadingBalance: false,
  isLoadingCatalog: false,
  isLoadingInventory: false,
  isLoadingEffects: false,
  isLoadingBundles: false,
  isLoadingTransactions: false,
  isPurchasing: false,
  isEquipping: false,
  error: null,
  _hasHydrated: false,
};

// ============================================
// Store
// ============================================

export const useCosmeticsStore = create<CosmeticsState>()(
  persist(
    (set, get) => ({
      ...defaultState,

      setHasHydrated: (hasHydrated) => {
        set({ _hasHydrated: hasHydrated });
      },

      fetchCoinBalance: async () => {
        set({ isLoadingBalance: true, error: null });
        try {
          const { data, error } = await fetchCoinBalance();
          if (error) {
            set({ error, isLoadingBalance: false });
            return;
          }
          set({ coinBalance: data, isLoadingBalance: false });
        } catch (err) {
          console.error('[CosmeticsStore] fetchCoinBalance error:', err);
          set({ error: 'Failed to load coin balance', isLoadingBalance: false });
        }
      },

      fetchCatalog: async (filters) => {
        set({ isLoadingCatalog: true, error: null });
        try {
          const { data, error } = await fetchStoreCatalog(filters);
          if (error) {
            set({ error, isLoadingCatalog: false });
            return;
          }
          const catalogItems = data || [];
          set({
            catalog: catalogItems,
            catalogByType: groupByType(catalogItems),
            isLoadingCatalog: false,
          });
        } catch (err) {
          console.error('[CosmeticsStore] fetchCatalog error:', err);
          set({ error: 'Failed to load store catalog', isLoadingCatalog: false });
        }
      },

      fetchInventory: async (filters) => {
        set({ isLoadingInventory: true, error: null });
        try {
          const { data, error } = await fetchInventory(filters);
          if (error) {
            set({ error, isLoadingInventory: false });
            return;
          }
          set({ inventory: data || [], isLoadingInventory: false });
        } catch (err) {
          console.error('[CosmeticsStore] fetchInventory error:', err);
          set({ error: 'Failed to load inventory', isLoadingInventory: false });
        }
      },

      fetchActiveEffects: async () => {
        set({ isLoadingEffects: true, error: null });
        try {
          const { data, error } = await fetchActiveEffects();
          if (error) {
            set({ error, isLoadingEffects: false });
            return;
          }
          set({ activeEffects: data || [], isLoadingEffects: false });
        } catch (err) {
          console.error('[CosmeticsStore] fetchActiveEffects error:', err);
          set({ error: 'Failed to load active effects', isLoadingEffects: false });
        }
      },

      fetchCoinBundles: async () => {
        set({ isLoadingBundles: true, error: null });
        try {
          const { data, error } = await fetchCoinBundles();
          if (error) {
            set({ error, isLoadingBundles: false });
            return;
          }
          set({ coinBundles: data || [], isLoadingBundles: false });
        } catch (err) {
          console.error('[CosmeticsStore] fetchCoinBundles error:', err);
          set({ error: 'Failed to load coin bundles', isLoadingBundles: false });
        }
      },

      fetchTransactionHistory: async (limit = 50, offset = 0, append = false) => {
        set({ isLoadingTransactions: true, error: null });
        try {
          const { data, error } = await fetchTransactionHistory(limit, offset);
          if (error) {
            set({ error, isLoadingTransactions: false });
            return;
          }
          const newTransactions = data?.transactions || [];
          set({
            transactions: append
              ? [...get().transactions, ...newTransactions]
              : newTransactions,
            transactionsTotalCount: data?.total_count || 0,
            isLoadingTransactions: false,
          });
        } catch (err) {
          console.error('[CosmeticsStore] fetchTransactionHistory error:', err);
          set({ error: 'Failed to load transaction history', isLoadingTransactions: false });
        }
      },

      purchaseCosmetic: async (cosmeticItemId, usePremiumCoins = false) => {
        set({ isPurchasing: true, error: null });
        try {
          const result = await purchaseCosmeticService(cosmeticItemId, usePremiumCoins);
          if (!result.success) {
            set({ error: result.error, isPurchasing: false });
            return { success: false, error: result.error };
          }

          // Refresh balance and inventory after successful purchase
          await Promise.all([
            get().fetchCoinBalance(),
            get().fetchInventory(),
            get().fetchCatalog(), // Refresh to update is_owned status
          ]);

          set({ isPurchasing: false });
          return { success: true };
        } catch (err) {
          console.error('[CosmeticsStore] purchaseCosmetic error:', err);
          const errorMsg = 'Purchase failed';
          set({ error: errorMsg, isPurchasing: false });
          return { success: false, error: errorMsg };
        }
      },

      equipCosmetic: async (inventoryId) => {
        set({ isEquipping: true, error: null });
        try {
          const result = await equipCosmeticService(inventoryId);
          if (!result.success) {
            set({ error: result.error, isEquipping: false });
            return { success: false, error: result.error };
          }

          // Refresh active effects and inventory
          await Promise.all([
            get().fetchActiveEffects(),
            get().fetchInventory(),
          ]);

          set({ isEquipping: false });
          return { success: true };
        } catch (err) {
          console.error('[CosmeticsStore] equipCosmetic error:', err);
          const errorMsg = 'Failed to equip item';
          set({ error: errorMsg, isEquipping: false });
          return { success: false, error: errorMsg };
        }
      },

      unequipCosmetic: async (inventoryId) => {
        set({ isEquipping: true, error: null });
        try {
          const result = await unequipCosmeticService(inventoryId);
          if (!result.success) {
            set({ error: result.error, isEquipping: false });
            return { success: false, error: result.error };
          }

          // Refresh active effects and inventory
          await Promise.all([
            get().fetchActiveEffects(),
            get().fetchInventory(),
          ]);

          set({ isEquipping: false });
          return { success: true };
        } catch (err) {
          console.error('[CosmeticsStore] unequipCosmetic error:', err);
          const errorMsg = 'Failed to unequip item';
          set({ error: errorMsg, isEquipping: false });
          return { success: false, error: errorMsg };
        }
      },

      useConsumable: async (inventoryId, competitionId) => {
        set({ isEquipping: true, error: null });
        try {
          const result = await useConsumableService(inventoryId, competitionId);
          if (!result.success) {
            set({ error: result.error, isEquipping: false });
            return { success: false, error: result.error };
          }

          // Refresh active effects and inventory
          await Promise.all([
            get().fetchActiveEffects(),
            get().fetchInventory(),
          ]);

          set({ isEquipping: false });
          return { success: true, expiresAt: result.expiresAt };
        } catch (err) {
          console.error('[CosmeticsStore] useConsumable error:', err);
          const errorMsg = 'Failed to use consumable';
          set({ error: errorMsg, isEquipping: false });
          return { success: false, error: errorMsg };
        }
      },

      refreshAll: async () => {
        await Promise.all([
          get().fetchCoinBalance(),
          get().fetchCatalog(),
          get().fetchInventory(),
          get().fetchActiveEffects(),
        ]);
      },

      clearError: () => {
        set({ error: null });
      },

      reset: () => {
        set(defaultState);
      },

      // Computed getters
      getEquippedItem: (effectType) => {
        return get().activeEffects.find((e) => e.effect_type === effectType);
      },

      getActiveRingTheme: () => {
        const ringThemeEffect = get().activeEffects.find(
          (e) => e.effect_type === 'ring_theme'
        );
        if (!ringThemeEffect?.cosmetic_item?.theme_config) {
          return null;
        }
        return ringThemeEffect.cosmetic_item.theme_config;
      },

      hasStreakFreezeActive: () => {
        const streakFreeze = get().activeEffects.find(
          (e) => e.effect_type === 'streak_freeze'
        );
        if (!streakFreeze) return false;

        // Check if it's still active (not expired)
        if (streakFreeze.expires_at) {
          const expiresAt = new Date(streakFreeze.expires_at);
          return expiresAt > new Date();
        }
        return true;
      },

      getCompetitionBoost: (competitionId) => {
        return get().activeEffects.find(
          (e) =>
            e.effect_type === 'competition_boost' &&
            e.competition_id === competitionId
        );
      },

      getOwnedCount: (cosmeticItemId) => {
        return get().inventory.filter(
          (item) =>
            item.cosmetic_item_id === cosmeticItemId && !item.is_consumed
        ).length;
      },

      getEquippedInventoryItem: (effectType) => {
        const effect = get().activeEffects.find((e) => e.effect_type === effectType);
        if (!effect) return undefined;
        return get().inventory.find((item) => item.id === effect.inventory_id);
      },
    }),
    {
      name: 'cosmetics-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist minimal data for offline display
      partialize: (state) => ({
        coinBalance: state.coinBalance,
        activeEffects: state.activeEffects,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('[CosmeticsStore] Error rehydrating:', error);
            useCosmeticsStore.getState().setHasHydrated(true);
          } else if (state) {
            state.setHasHydrated(true);
          }
        };
      },
    }
  )
);

// ============================================
// Selectors
// ============================================

export const selectCoinBalance = (state: CosmeticsState) => state.coinBalance;
export const selectEarnedCoins = (state: CosmeticsState) =>
  state.coinBalance?.earned_coins ?? 0;
export const selectPremiumCoins = (state: CosmeticsState) =>
  state.coinBalance?.premium_coins ?? 0;
export const selectTotalCoins = (state: CosmeticsState) =>
  (state.coinBalance?.earned_coins ?? 0) + (state.coinBalance?.premium_coins ?? 0);

export const selectCatalog = (state: CosmeticsState) => state.catalog;
export const selectCatalogByType = (state: CosmeticsState) => state.catalogByType;
export const selectInventory = (state: CosmeticsState) => state.inventory;
export const selectActiveEffects = (state: CosmeticsState) => state.activeEffects;
export const selectCoinBundles = (state: CosmeticsState) => state.coinBundles;
export const selectTransactions = (state: CosmeticsState) => state.transactions;

export const selectIsLoadingAny = (state: CosmeticsState) =>
  state.isLoadingBalance ||
  state.isLoadingCatalog ||
  state.isLoadingInventory ||
  state.isLoadingEffects;

export const selectError = (state: CosmeticsState) => state.error;

// ============================================
// Hooks
// ============================================

/**
 * Hook to get the active ring theme colors.
 * Returns null if no custom theme is equipped.
 */
export function useActiveRingTheme(): { move: string; exercise: string; stand: string } | null {
  return useCosmeticsStore((state) => state.getActiveRingTheme());
}

/**
 * Hook to check if a streak freeze is currently active
 */
export function useHasStreakFreezeActive(): boolean {
  return useCosmeticsStore((state) => state.hasStreakFreezeActive());
}

/**
 * Hook to get coin balance with formatted display
 */
export function useCoinBalanceDisplay(): {
  earned: number;
  premium: number;
  total: number;
  earnedFormatted: string;
  premiumFormatted: string;
  isLoading: boolean;
} {
  const coinBalance = useCosmeticsStore(selectCoinBalance);
  const isLoading = useCosmeticsStore((state) => state.isLoadingBalance);

  const earned = coinBalance?.earned_coins ?? 0;
  const premium = coinBalance?.premium_coins ?? 0;

  return {
    earned,
    premium,
    total: earned + premium,
    earnedFormatted: earned.toLocaleString(),
    premiumFormatted: premium.toLocaleString(),
    isLoading,
  };
}
