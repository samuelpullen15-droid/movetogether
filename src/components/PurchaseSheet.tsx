/**
 * PurchaseSheet - Bottom sheet for cosmetic item details and purchase
 *
 * Displays:
 * - Item preview and info
 * - Rarity and type badges
 * - Price options (earned vs premium)
 * - Purchase or equip actions
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from '@/components/Text';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Frame,
  Award,
  ImageIcon,
  Smartphone,
  Palette,
  Shield,
  Zap,
  Check,
  Coins,
  Sparkles,
  Clock,
  Lock,
  PartyPopper,
  Package,
} from 'lucide-react-native';
import { Confetti } from '@/components/Confetti';

import { useCosmeticsStore } from '@/lib/cosmetics-store';
import {
  type CosmeticItem,
  type CosmeticType,
  RARITY_COLORS,
  COSMETIC_TYPE_LABELS,
  formatRarity,
  formatCoins,
  formatDuration,
  canAfford,
  getBestPriceOption,
  isPurchasable,
  isEquippable,
  getCosmeticPreviewUrl,
  getEffectDescription,
} from '@/lib/cosmetics-service';
import { useThemeColors } from '@/lib/useThemeColors';

// ============================================
// Type Icons
// ============================================

const TYPE_ICONS: Record<string, React.FC<{ size: number; color: string; strokeWidth?: number }>> = {
  profile_frame: Frame,
  achievement_badge: Award,
  profile_background: ImageIcon,
  app_icon: Smartphone,
  ring_theme: Palette,
  streak_freeze: Shield,
  competition_boost: Zap,
};

// Helper to safely get icon for a cosmetic type
function getTypeIcon(cosmeticType: string | undefined | null): React.FC<{ size: number; color: string; strokeWidth?: number }> {
  if (!cosmeticType) return Package;
  return TYPE_ICONS[cosmeticType] || Package;
}

// ============================================
// Props
// ============================================

interface PurchaseSheetProps {
  item: CosmeticItem;
  userEarnedCoins: number;
  userPremiumCoins: number;
  onPurchaseComplete: () => void;
  onClose: () => void;
  colors?: ReturnType<typeof useThemeColors>;
}

// ============================================
// Component
// ============================================

export function PurchaseSheet({
  item,
  userEarnedCoins,
  userPremiumCoins,
  onPurchaseComplete,
  onClose,
  colors: propColors,
}: PurchaseSheetProps) {
  const defaultColors = useThemeColors();
  const colors = propColors || defaultColors;
  const { purchaseCosmetic, equipCosmetic, unequipCosmetic, isPurchasing, isEquipping } =
    useCosmeticsStore();

  const [selectedPayment, setSelectedPayment] = useState<'earned' | 'premium'>('earned');
  const [showSuccess, setShowSuccess] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const rarityColors = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
  const TypeIcon = getTypeIcon(item.cosmetic_type);
  const imageUrl = useMemo(() => getCosmeticPreviewUrl(item), [item]);
  const isOwned = item.is_owned;
  const isEquipped = item.is_equipped;
  const isLocked = !isPurchasable(item) && !isOwned;
  const hasSubscriptionRequirement = !!item.subscription_tier_required;

  // Calculate affordability
  const canAffordEarned =
    item.earned_coin_price !== null && userEarnedCoins >= item.earned_coin_price;
  const canAffordPremium =
    item.premium_coin_price !== null && userPremiumCoins >= item.premium_coin_price;
  const canPurchase = canAffordEarned || canAffordPremium;

  // Handle purchase
  const handlePurchase = useCallback(async () => {
    const usePremium = selectedPayment === 'premium';
    const price = usePremium ? item.premium_coin_price : item.earned_coin_price;

    if (price === null) {
      Alert.alert('Error', 'This item cannot be purchased with the selected currency.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await purchaseCosmetic(item.id, usePremium);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onPurchaseComplete();
      }, 1800);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Purchase Failed', result.error || 'Unable to complete purchase.');
    }
  }, [item, selectedPayment, purchaseCosmetic, onPurchaseComplete]);

  // Handle equip/unequip
  const handleEquip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Find the inventory item ID (we need to fetch inventory to get it)
    const { inventory, fetchInventory } = useCosmeticsStore.getState();
    let inventoryItem = inventory.find((i) => i.cosmetic_item_id === item.id && !i.is_consumed);

    if (!inventoryItem) {
      await fetchInventory();
      const updatedInventory = useCosmeticsStore.getState().inventory;
      inventoryItem = updatedInventory.find(
        (i) => i.cosmetic_item_id === item.id && !i.is_consumed
      );
    }

    if (!inventoryItem) {
      Alert.alert('Error', 'Unable to find item in inventory.');
      return;
    }

    if (isEquipped) {
      const result = await unequipCosmetic(inventoryItem.id);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPurchaseComplete();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Error', result.error || 'Unable to unequip item.');
      }
    } else {
      const result = await equipCosmetic(inventoryItem.id);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPurchaseComplete();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Error', result.error || 'Unable to equip item.');
      }
    }
  }, [item, isEquipped, equipCosmetic, unequipCosmetic, onPurchaseComplete]);

  // Show success celebration
  if (showSuccess) {
    return (
      <View style={styles.successContainer}>
        <Confetti count={40} />
        <Animated.View entering={FadeIn.duration(300)} style={styles.successContent}>
          <View style={[styles.successIcon, { backgroundColor: `${colors.primary}20` }]}>
            <PartyPopper size={48} color={colors.primary} strokeWidth={1.5} />
          </View>
          <Text className="font-bold" style={[styles.successTitle, { color: colors.text }]}>
            Purchased!
          </Text>
          <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
            {item.name} has been added to your inventory
          </Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Preview Section */}
      <Animated.View entering={FadeIn.duration(300)} style={styles.previewSection}>
        <LinearGradient
          colors={[`${rarityColors.primary}30`, `${rarityColors.secondary}15`]}
          style={styles.previewGradient}
        >
          {!imageLoaded && (
            <View
              style={[styles.iconContainer, { backgroundColor: `${rarityColors.primary}30` }]}
            >
              <TypeIcon size={52} color={rarityColors.primary} strokeWidth={1.5} />
            </View>
          )}
          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={[styles.previewImage, !imageLoaded && styles.hiddenImage]}
              resizeMode="contain"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(false)}
            />
          )}
        </LinearGradient>
      </Animated.View>

      {/* Info Section */}
      <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.infoSection}>
        {/* Badges */}
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: rarityColors.primary }]}>
            <Text style={[styles.badgeText, { color: rarityColors.text }]}>
              {formatRarity(item.rarity)}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: colors.isDark
                  ? 'rgba(255, 255, 255, 0.1)'
                  : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {COSMETIC_TYPE_LABELS[item.cosmetic_type]}
            </Text>
          </View>
          {item.is_consumable && item.consumable_duration_hours && (
            <View
              style={[
                styles.badge,
                { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
              ]}
            >
              <Clock size={10} color="#3B82F6" strokeWidth={2.5} />
              <Text style={[styles.badgeText, { color: '#3B82F6', marginLeft: 4 }]}>
                {formatDuration(item.consumable_duration_hours)}
              </Text>
            </View>
          )}
        </View>

        {/* Name & Description */}
        <Text className="font-bold" style={[styles.name, { color: colors.text }]}>
          {item.name}
        </Text>
        {item.description && (
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {item.description}
          </Text>
        )}

        {/* Consumable Effect */}
        {item.is_consumable && getEffectDescription(item) && (
          <View
            style={[
              styles.effectBox,
              { backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' },
            ]}
          >
            <Zap size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.effectText, { color: colors.text }]}>
              {getEffectDescription(item)}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Action Section */}
      <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.actionSection}>
        {/* Owned - Show Equip Button */}
        {isOwned && isEquippable(item) && (
          <Pressable
            onPress={handleEquip}
            disabled={isEquipping}
            style={[
              styles.actionButton,
              {
                backgroundColor: isEquipped ? colors.textSecondary : colors.primary,
              },
            ]}
          >
            {isEquipping ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Check size={20} color="#fff" strokeWidth={2.5} />
                <Text style={styles.actionButtonText}>
                  {isEquipped ? 'Unequip' : 'Equip'}
                </Text>
              </>
            )}
          </Pressable>
        )}

        {/* Owned Consumable - Already in inventory */}
        {isOwned && item.is_consumable && (
          <View style={styles.ownedMessage}>
            <Check size={20} color={colors.primary} strokeWidth={2.5} />
            <Text style={[styles.ownedText, { color: colors.primary }]}>
              In Inventory
            </Text>
          </View>
        )}

        {/* Locked - Show lock message */}
        {isLocked && (
          <View style={styles.lockedMessage}>
            <Lock size={20} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.lockedText, { color: colors.textSecondary }]}>
              {hasSubscriptionRequirement
                ? `Requires ${item.subscription_tier_required} subscription`
                : 'Unlock through achievements'}
            </Text>
          </View>
        )}

        {/* Not Owned - Show Purchase Options */}
        {!isOwned && !isLocked && (
          <>
            {/* Payment Options */}
            <View style={styles.paymentOptions}>
              {/* Earned Coins Option */}
              {item.earned_coin_price !== null && (
                <Pressable
                  onPress={() => setSelectedPayment('earned')}
                  style={[
                    styles.paymentOption,
                    {
                      borderColor:
                        selectedPayment === 'earned' ? colors.primary : colors.border,
                      backgroundColor:
                        selectedPayment === 'earned'
                          ? `${colors.primary}15`
                          : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.paymentHeader}>
                    <Coins size={20} color="#FFD700" strokeWidth={2.5} />
                    <Text
                      className="font-semibold"
                      style={[styles.paymentPrice, { color: colors.text }]}
                    >
                      {formatCoins(item.earned_coin_price)}
                    </Text>
                  </View>
                  <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
                    Earned Coins
                  </Text>
                  {!canAffordEarned && (
                    <Text style={styles.insufficientText}>
                      Need {formatCoins(item.earned_coin_price - userEarnedCoins)} more
                    </Text>
                  )}
                  {selectedPayment === 'earned' && (
                    <View style={[styles.selectedIndicator, { backgroundColor: colors.primary }]}>
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </View>
                  )}
                </Pressable>
              )}

              {/* Premium Coins Option */}
              {item.premium_coin_price !== null && (
                <Pressable
                  onPress={() => setSelectedPayment('premium')}
                  style={[
                    styles.paymentOption,
                    {
                      borderColor:
                        selectedPayment === 'premium' ? colors.primary : colors.border,
                      backgroundColor:
                        selectedPayment === 'premium'
                          ? `${colors.primary}15`
                          : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.paymentHeader}>
                    <Sparkles size={20} color="#A855F7" strokeWidth={2.5} />
                    <Text
                      className="font-semibold"
                      style={[styles.paymentPrice, { color: colors.text }]}
                    >
                      {formatCoins(item.premium_coin_price)}
                    </Text>
                  </View>
                  <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
                    Premium Coins
                  </Text>
                  {!canAffordPremium && (
                    <Text style={styles.insufficientText}>
                      Need {formatCoins(item.premium_coin_price - userPremiumCoins)} more
                    </Text>
                  )}
                  {selectedPayment === 'premium' && (
                    <View style={[styles.selectedIndicator, { backgroundColor: colors.primary }]}>
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </View>
                  )}
                </Pressable>
              )}
            </View>

            {/* Purchase Button */}
            <Pressable
              onPress={handlePurchase}
              disabled={
                isPurchasing ||
                (selectedPayment === 'earned' && !canAffordEarned) ||
                (selectedPayment === 'premium' && !canAffordPremium)
              }
              style={[
                styles.actionButton,
                {
                  backgroundColor:
                    (selectedPayment === 'earned' && canAffordEarned) ||
                    (selectedPayment === 'premium' && canAffordPremium)
                      ? colors.primary
                      : colors.textSecondary,
                },
              ]}
            >
              {isPurchasing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {(selectedPayment === 'earned' && canAffordEarned) ||
                  (selectedPayment === 'premium' && canAffordPremium)
                    ? 'Purchase'
                    : 'Insufficient Coins'}
                </Text>
              )}
            </Pressable>
          </>
        )}
      </Animated.View>
    </View>
  );
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },

  // Success state
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  successContent: {
    alignItems: 'center',
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    textAlign: 'center',
  },

  // Preview
  previewSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  previewGradient: {
    width: 140,
    height: 140,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '70%',
    height: '70%',
    position: 'absolute',
  },
  hiddenImage: {
    opacity: 0,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Info
  infoSection: {
    marginBottom: 24,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 24,
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  effectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  effectText: {
    fontSize: 14,
    flex: 1,
  },

  // Action
  actionSection: {
    marginTop: 'auto',
    paddingBottom: 20,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  paymentOption: {
    flex: 1,
    padding: 16,
    paddingTop: 14,
    borderRadius: 16,
    borderWidth: 2,
    position: 'relative',
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  paymentPrice: {
    fontSize: 18,
  },
  paymentLabel: {
    fontSize: 12,
  },
  insufficientText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 6,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  ownedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  ownedText: {
    fontSize: 17,
    fontWeight: '600',
  },
  lockedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  lockedText: {
    fontSize: 15,
    textAlign: 'center',
  },
});
