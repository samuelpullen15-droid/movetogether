/**
 * Cosmetics Service
 *
 * Provides helper functions, formatting utilities, and business logic
 * for the cosmetics store feature. Works alongside cosmeticsApi in edge-functions.ts.
 */

import {
  cosmeticsApi,
  type CosmeticItem,
  type CosmeticType,
  type CosmeticRarity,
  type UserCoinBalance,
  type CosmeticInventoryItem,
  type CoinTransaction,
  type IapCoinProduct,
  type ActiveCosmeticEffect,
} from './edge-functions';

// Re-export types for convenience
export type {
  CosmeticItem,
  CosmeticType,
  CosmeticRarity,
  UserCoinBalance,
  CosmeticInventoryItem,
  CoinTransaction,
  IapCoinProduct,
  ActiveCosmeticEffect,
};

// ============================================
// Constants
// ============================================

export const COSMETIC_TYPE_LABELS: Record<CosmeticType, string> = {
  profile_frame: 'Profile Frames',
  achievement_badge: 'Badges',
  profile_background: 'Backgrounds',
  app_icon: 'App Icons',
  ring_theme: 'Ring Themes',
  streak_freeze: 'Streak Freezes',
  competition_boost: 'Boosts',
};

export const COSMETIC_TYPE_ICONS: Record<CosmeticType, string> = {
  profile_frame: 'frame',
  achievement_badge: 'award',
  profile_background: 'image',
  app_icon: 'smartphone',
  ring_theme: 'palette',
  streak_freeze: 'shield',
  competition_boost: 'zap',
};

export const RARITY_COLORS: Record<CosmeticRarity, { primary: string; secondary: string; text: string }> = {
  common: { primary: '#9CA3AF', secondary: '#6B7280', text: '#F9FAFB' },
  uncommon: { primary: '#34D399', secondary: '#10B981', text: '#ECFDF5' },
  rare: { primary: '#60A5FA', secondary: '#3B82F6', text: '#EFF6FF' },
  epic: { primary: '#A78BFA', secondary: '#8B5CF6', text: '#F5F3FF' },
  legendary: { primary: '#FBBF24', secondary: '#F59E0B', text: '#FFFBEB' },
};

export const RARITY_ORDER: CosmeticRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// ============================================
// Image URL Helpers
// ============================================

const COSMETICS_BUCKET = 'cosmetics';

/**
 * Get full URL for a cosmetic asset from Supabase Storage.
 * Asset paths are stored as relative paths like "frames/simple_ring.png"
 * This constructs the full public storage URL.
 */
export function getCosmeticImageUrl(assetPath: string | null | undefined): string | null {
  // Handle null, undefined, or empty strings
  if (!assetPath || assetPath.trim() === '') return null;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  // Construct public storage URL
  return `${supabaseUrl}/storage/v1/object/public/${COSMETICS_BUCKET}/${assetPath}`;
}

/**
 * Get the preview URL for a cosmetic item, with fallback to asset_url.
 * Use this for displaying cosmetic previews in cards and sheets.
 */
export function getCosmeticPreviewUrl(item: CosmeticItem): string | null {
  return getCosmeticImageUrl(item.preview_url) || getCosmeticImageUrl(item.asset_url);
}

/**
 * Check if an item was added recently (within 7 days).
 * Used to display "NEW" badge on cosmetic cards.
 */
export function isNewItem(item: CosmeticItem): boolean {
  if (!item.created_at) return false;
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  return new Date(item.created_at).getTime() > sevenDaysAgo;
}

/**
 * Get the effect description for consumable items.
 * Returns a human-readable description of what the consumable does.
 */
export function getEffectDescription(item: CosmeticItem): string {
  if (!item.is_consumable) return '';

  if (item.cosmetic_type === 'competition_boost') {
    const bonus = (item.consumable_effect as { bonus_percentage?: number })?.bonus_percentage || 10;
    return `+${bonus}% bonus to your final competition score`;
  }

  if (item.cosmetic_type === 'streak_freeze') {
    const hours = item.consumable_duration_hours || 24;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return days === 1
        ? 'Protects your streak for 1 day if you miss activity'
        : `Protects your streak for ${days} days if you miss activity`;
    }
    return `Protects your streak for ${hours} hours if you miss activity`;
  }

  return '';
}

// ============================================
// Formatting Helpers
// ============================================

/**
 * Format a coin amount with thousands separators
 */
export function formatCoins(amount: number): string {
  return amount.toLocaleString();
}

/**
 * Format a coin balance display string
 */
export function formatCoinBalance(earned: number, premium: number): string {
  if (premium > 0 && earned > 0) {
    return `${formatCoins(earned)} + ${formatCoins(premium)} premium`;
  } else if (premium > 0) {
    return `${formatCoins(premium)} premium`;
  }
  return formatCoins(earned);
}

/**
 * Format a price for display, showing both earned and premium options if available
 */
export function formatPrice(
  earnedPrice: number | null,
  premiumPrice: number | null
): { earned: string | null; premium: string | null } {
  return {
    earned: earnedPrice !== null ? formatCoins(earnedPrice) : null,
    premium: premiumPrice !== null ? formatCoins(premiumPrice) : null,
  };
}

/**
 * Format a cosmetic type for display
 */
export function formatCosmeticType(type: CosmeticType): string {
  return COSMETIC_TYPE_LABELS[type] || type;
}

/**
 * Format rarity for display (capitalize first letter)
 */
export function formatRarity(rarity: CosmeticRarity): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

/**
 * Format duration in hours to human-readable string
 */
export function formatDuration(hours: number): string {
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''}`;
}

/**
 * Format a transaction type for display
 */
export function formatTransactionType(type: string): string {
  const labels: Record<string, string> = {
    earn_ring_closure: 'Rings Closed',
    earn_competition_win: 'Competition Win',
    earn_competition_placement: 'Competition Placement',
    earn_competition_participation: 'Competition Complete',
    earn_achievement: 'Achievement Unlocked',
    earn_streak: 'Streak Milestone',
    earn_weekly_challenge: 'Weekly Challenge',
    purchase_cosmetic: 'Store Purchase',
    purchase_iap: 'Coin Purchase',
    gift: 'Gift Received',
    refund: 'Refund',
  };
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================
// Business Logic Helpers
// ============================================

/**
 * Check if user can afford a cosmetic item
 */
export function canAfford(
  balance: UserCoinBalance,
  item: CosmeticItem,
  usePremium: boolean
): boolean {
  if (usePremium && item.premium_coin_price !== null) {
    return balance.premium_coins >= item.premium_coin_price;
  }
  if (item.earned_coin_price !== null) {
    return balance.earned_coins >= item.earned_coin_price;
  }
  return false;
}

/**
 * Get the best price option for a cosmetic item based on user's balance
 */
export function getBestPriceOption(
  balance: UserCoinBalance,
  item: CosmeticItem
): { usePremium: boolean; price: number; canAfford: boolean } | null {
  const earnedPrice = item.earned_coin_price;
  const premiumPrice = item.premium_coin_price;

  // If only one option available, use it
  if (earnedPrice === null && premiumPrice !== null) {
    return {
      usePremium: true,
      price: premiumPrice,
      canAfford: balance.premium_coins >= premiumPrice,
    };
  }
  if (premiumPrice === null && earnedPrice !== null) {
    return {
      usePremium: false,
      price: earnedPrice,
      canAfford: balance.earned_coins >= earnedPrice,
    };
  }
  if (earnedPrice === null && premiumPrice === null) {
    return null; // Item cannot be purchased (unlock only)
  }

  // Both options available - prefer earned coins if user can afford
  const canAffordEarned = balance.earned_coins >= earnedPrice!;
  const canAffordPremium = balance.premium_coins >= premiumPrice!;

  if (canAffordEarned) {
    return { usePremium: false, price: earnedPrice!, canAfford: true };
  }
  if (canAffordPremium) {
    return { usePremium: true, price: premiumPrice!, canAfford: true };
  }

  // Can't afford either, show earned price option
  return { usePremium: false, price: earnedPrice!, canAfford: false };
}

/**
 * Check if a cosmetic item is purchasable (has a price)
 */
export function isPurchasable(item: CosmeticItem): boolean {
  return item.earned_coin_price !== null || item.premium_coin_price !== null;
}

/**
 * Check if a cosmetic item is equippable (non-consumable)
 */
export function isEquippable(item: CosmeticItem): boolean {
  return !item.is_consumable;
}

/**
 * Get ring theme colors from a cosmetic item
 */
export function getRingThemeColors(item: CosmeticItem): { move: string; exercise: string; stand: string } | null {
  if (item.cosmetic_type !== 'ring_theme' || !item.theme_config) {
    return null;
  }
  return item.theme_config;
}

/**
 * Check if an inventory item is currently active (equipped or consumable in effect)
 */
export function isItemActive(
  inventoryItem: CosmeticInventoryItem,
  activeEffects: ActiveCosmeticEffect[]
): boolean {
  return activeEffects.some(effect => effect.inventory_id === inventoryItem.id);
}

/**
 * Calculate time remaining for a consumable effect
 */
export function getTimeRemaining(expiresAt: string | null): {
  expired: boolean;
  hours: number;
  minutes: number;
  formatted: string;
} {
  if (!expiresAt) {
    return { expired: false, hours: 0, minutes: 0, formatted: 'Permanent' };
  }

  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { expired: true, hours: 0, minutes: 0, formatted: 'Expired' };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  let formatted: string;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    formatted = `${days}d ${hours % 24}h remaining`;
  } else if (hours > 0) {
    formatted = `${hours}h ${minutes}m remaining`;
  } else {
    formatted = `${minutes}m remaining`;
  }

  return { expired: false, hours, minutes, formatted };
}

/**
 * Sort cosmetic items by rarity and then by name
 */
export function sortByRarityAndName(items: CosmeticItem[]): CosmeticItem[] {
  return [...items].sort((a, b) => {
    const rarityDiff = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    if (rarityDiff !== 0) return rarityDiff;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Group cosmetic items by type
 */
export function groupByType(items: CosmeticItem[]): Record<CosmeticType, CosmeticItem[]> {
  const grouped: Record<CosmeticType, CosmeticItem[]> = {
    profile_frame: [],
    achievement_badge: [],
    profile_background: [],
    app_icon: [],
    ring_theme: [],
    streak_freeze: [],
    competition_boost: [],
  };

  for (const item of items) {
    if (grouped[item.cosmetic_type]) {
      grouped[item.cosmetic_type].push(item);
    }
  }

  return grouped;
}

/**
 * Filter items by ownership status
 */
export function filterByOwnership(
  items: CosmeticItem[],
  owned: boolean
): CosmeticItem[] {
  return items.filter(item => item.is_owned === owned);
}

/**
 * Get the count of unowned items in a category
 */
export function getUnownedCount(items: CosmeticItem[]): number {
  return items.filter(item => !item.is_owned && isPurchasable(item)).length;
}

// ============================================
// IAP Helpers
// ============================================

/**
 * Format IAP product price display
 */
export function formatIapPrice(product: IapCoinProduct): string {
  return `$${product.price_usd.toFixed(2)}`;
}

/**
 * Calculate value per dollar for IAP product
 */
export function getCoinsPerDollar(product: IapCoinProduct): number {
  const totalCoins = product.premium_coins + product.bonus_coins;
  return Math.round(totalCoins / product.price_usd);
}

/**
 * Format IAP product bonus display
 */
export function formatIapBonus(product: IapCoinProduct): string | null {
  if (product.bonus_coins <= 0) return null;
  const percentage = Math.round((product.bonus_coins / product.premium_coins) * 100);
  return `+${percentage}% bonus`;
}

/**
 * Get the best value IAP product
 */
export function getBestValueProduct(products: IapCoinProduct[]): IapCoinProduct | null {
  if (products.length === 0) return null;

  let best = products[0];
  let bestValue = getCoinsPerDollar(best);

  for (const product of products) {
    const value = getCoinsPerDollar(product);
    if (value > bestValue) {
      best = product;
      bestValue = value;
    }
  }

  return best;
}

// ============================================
// Transaction History Helpers
// ============================================

/**
 * Group transactions by date
 */
export function groupTransactionsByDate(
  transactions: CoinTransaction[]
): { date: string; transactions: CoinTransaction[] }[] {
  const groups = new Map<string, CoinTransaction[]>();

  for (const tx of transactions) {
    const date = new Date(tx.created_at).toLocaleDateString();
    const existing = groups.get(date) || [];
    existing.push(tx);
    groups.set(date, existing);
  }

  return Array.from(groups.entries()).map(([date, txs]) => ({
    date,
    transactions: txs,
  }));
}

/**
 * Calculate net coin change for a list of transactions
 */
export function calculateNetChange(transactions: CoinTransaction[]): {
  earnedNet: number;
  premiumNet: number;
} {
  let earnedNet = 0;
  let premiumNet = 0;

  for (const tx of transactions) {
    earnedNet += tx.earned_coin_delta;
    premiumNet += tx.premium_coin_delta;
  }

  return { earnedNet, premiumNet };
}

// ============================================
// Service Functions
// ============================================

/**
 * Fetch store catalog with automatic error handling
 */
export async function fetchStoreCatalog(filters?: {
  cosmetic_type?: CosmeticType;
  rarity?: CosmeticRarity;
}): Promise<{ data: CosmeticItem[] | null; error: string | null }> {
  const { data, error } = await cosmeticsApi.getStoreCatalog(filters);
  if (error) {
    console.error('[CosmeticsService] fetchStoreCatalog error:', error.message);
    return { data: null, error: error.message };
  }
  return { data: data || [], error: null };
}

/**
 * Fetch user's coin balance
 */
export async function fetchCoinBalance(): Promise<{
  data: UserCoinBalance | null;
  error: string | null;
}> {
  const { data, error } = await cosmeticsApi.getMyCoinBalance();
  if (error) {
    console.error('[CosmeticsService] fetchCoinBalance error:', error.message);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

/**
 * Fetch user's inventory
 */
export async function fetchInventory(filters?: {
  cosmetic_type?: CosmeticType;
  rarity?: CosmeticRarity;
}): Promise<{ data: CosmeticInventoryItem[] | null; error: string | null }> {
  const { data, error } = await cosmeticsApi.getMyInventory(filters);
  if (error) {
    console.error('[CosmeticsService] fetchInventory error:', error.message);
    return { data: null, error: error.message };
  }
  return { data: data || [], error: null };
}

/**
 * Fetch active effects
 */
export async function fetchActiveEffects(): Promise<{
  data: ActiveCosmeticEffect[] | null;
  error: string | null;
}> {
  const { data, error } = await cosmeticsApi.getActiveEffects();
  if (error) {
    console.error('[CosmeticsService] fetchActiveEffects error:', error.message);
    return { data: null, error: error.message };
  }
  return { data: data || [], error: null };
}

/**
 * Purchase a cosmetic item
 */
export async function purchaseCosmetic(
  cosmeticItemId: string,
  usePremiumCoins = false
): Promise<{
  success: boolean;
  inventoryItem?: CosmeticInventoryItem;
  transaction?: CoinTransaction;
  error?: string;
}> {
  const { data, error } = await cosmeticsApi.purchaseCosmetic(cosmeticItemId, usePremiumCoins);
  if (error) {
    console.error('[CosmeticsService] purchaseCosmetic error:', error.message);
    return { success: false, error: error.message };
  }
  if (!data?.success) {
    return { success: false, error: 'Purchase failed' };
  }
  return {
    success: true,
    inventoryItem: data.inventory_item,
    transaction: data.transaction,
  };
}

/**
 * Equip a cosmetic item
 */
export async function equipCosmetic(
  inventoryId: string
): Promise<{ success: boolean; effectType?: string; error?: string }> {
  const { data, error } = await cosmeticsApi.equipCosmetic(inventoryId);
  if (error) {
    console.error('[CosmeticsService] equipCosmetic error:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, effectType: data?.effect_type };
}

/**
 * Unequip a cosmetic item
 */
export async function unequipCosmetic(
  inventoryId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await cosmeticsApi.unequipCosmetic(inventoryId);
  if (error) {
    console.error('[CosmeticsService] unequipCosmetic error:', error.message);
    return { success: false, error: error.message };
  }
  return { success: data?.success || false };
}

/**
 * Use a consumable item
 */
export async function useConsumable(
  inventoryId: string,
  competitionId?: string
): Promise<{
  success: boolean;
  effectType?: string;
  expiresAt?: string;
  error?: string;
}> {
  const { data, error } = await cosmeticsApi.useConsumable(inventoryId, competitionId);
  if (error) {
    console.error('[CosmeticsService] useConsumable error:', error.message);
    return { success: false, error: error.message };
  }
  return {
    success: data?.success || false,
    effectType: data?.effect_type,
    expiresAt: data?.expires_at ?? undefined,
  };
}

/**
 * Fetch IAP coin bundles
 */
export async function fetchCoinBundles(): Promise<{
  data: IapCoinProduct[] | null;
  error: string | null;
}> {
  const { data, error } = await cosmeticsApi.getCoinBundles();
  if (error) {
    console.error('[CosmeticsService] fetchCoinBundles error:', error.message);
    return { data: null, error: error.message };
  }
  return { data: data || [], error: null };
}

/**
 * Fetch transaction history
 */
export async function fetchTransactionHistory(
  limit = 50,
  offset = 0
): Promise<{
  data: { transactions: CoinTransaction[]; total_count: number } | null;
  error: string | null;
}> {
  const { data, error } = await cosmeticsApi.getTransactionHistory(limit, offset);
  if (error) {
    console.error('[CosmeticsService] fetchTransactionHistory error:', error.message);
    return { data: null, error: error.message };
  }
  return {
    data: {
      transactions: data?.transactions || [],
      total_count: data?.total_count || 0,
    },
    error: null,
  };
}
