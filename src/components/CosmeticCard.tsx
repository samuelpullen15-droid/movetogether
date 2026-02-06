/**
 * CosmeticCard - Card component for cosmetic items in the store
 *
 * Displays a cosmetic item with:
 * - Preview image or icon
 * - Name and rarity badge
 * - Price or owned status
 * - Equipped indicator
 */

import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Image } from 'react-native';
import { Text } from '@/components/Text';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
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
  Lock,
  Sparkles,
  Coins,
  Package,
} from 'lucide-react-native';
import {
  type CosmeticItem,
  type CosmeticType,
  RARITY_COLORS,
  formatRarity,
  formatCoins,
  isPurchasable,
  getCosmeticPreviewUrl,
} from '@/lib/cosmetics-service';
import { useCosmeticsStore } from '@/lib/cosmetics-store';
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

interface CosmeticCardProps {
  item: CosmeticItem;
  onPress: (item: CosmeticItem) => void;
  index?: number;
  userEarnedCoins?: number;
  userPremiumCoins?: number;
  colors?: ReturnType<typeof useThemeColors>;
}

// ============================================
// Component
// ============================================

export function CosmeticCard({
  item,
  onPress,
  index = 0,
  userEarnedCoins = 0,
  userPremiumCoins = 0,
  colors: propColors,
}: CosmeticCardProps) {
  const defaultColors = useThemeColors();
  const colors = propColors || defaultColors;
  const { getOwnedCount } = useCosmeticsStore();

  const [imageLoaded, setImageLoaded] = useState(false);

  const rarityColors = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
  const TypeIcon = getTypeIcon(item.cosmetic_type);
  const ownedCount = getOwnedCount(item.id);
  const imageUrl = getCosmeticPreviewUrl(item);
  const isOwned = item.is_owned || ownedCount > 0;
  const isEquipped = item.is_equipped;
  const isLocked = !isPurchasable(item) && !isOwned;
  const hasSubscriptionRequirement = !!item.subscription_tier_required;

  // Calculate if user can afford
  const canAffordEarned =
    item.earned_coin_price !== null && userEarnedCoins >= item.earned_coin_price;
  const canAffordPremium =
    item.premium_coin_price !== null && userPremiumCoins >= item.premium_coin_price;
  const canAfford = canAffordEarned || canAffordPremium;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  };

  // Get the display price
  const getDisplayPrice = () => {
    if (isOwned) {
      return item.is_consumable && ownedCount > 0 ? `×${ownedCount}` : 'Owned';
    }
    if (isLocked) {
      return hasSubscriptionRequirement
        ? `${item.subscription_tier_required} only`
        : 'Unlock';
    }
    // Show earned price if available and can afford, otherwise premium
    if (item.earned_coin_price !== null) {
      return formatCoins(item.earned_coin_price);
    }
    if (item.premium_coin_price !== null) {
      return formatCoins(item.premium_coin_price);
    }
    return 'Unlock';
  };

  // Get price icon
  const getPriceIcon = () => {
    if (isOwned || isLocked) return null;
    if (item.earned_coin_price !== null) {
      return <Coins size={12} color="#FFD700" strokeWidth={2.5} />;
    }
    if (item.premium_coin_price !== null) {
      return <Sparkles size={12} color="#A855F7" strokeWidth={2.5} />;
    }
    return null;
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).springify()}
      style={styles.wrapper}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressed,
        ]}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.isDark
                ? 'rgba(30, 30, 35, 0.95)'
                : 'rgba(255, 255, 255, 0.95)',
              borderColor: isEquipped
                ? colors.primary
                : colors.isDark
                ? 'rgba(255, 255, 255, 0.1)'
                : 'rgba(0, 0, 0, 0.08)',
            },
            isEquipped && styles.equippedCard,
          ]}
        >
          {/* Preview Area */}
          <View style={styles.previewContainer}>
            <LinearGradient
              colors={[
                `${rarityColors.primary}20`,
                `${rarityColors.secondary}10`,
              ]}
              style={styles.previewGradient}
            >
              {/* Always show icon as fallback */}
              {!imageLoaded && (
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${rarityColors.primary}30` },
                  ]}
                >
                  <TypeIcon size={36} color={rarityColors.primary} strokeWidth={1.5} />
                </View>
              )}
              {/* Attempt to load image if URL exists */}
              {imageUrl && (
                <Image
                  source={{ uri: imageUrl }}
                  style={[
                    styles.previewImage,
                    !imageLoaded && styles.hiddenImage,
                  ]}
                  resizeMode="contain"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageLoaded(false)}
                />
              )}
            </LinearGradient>

            {/* Rarity Badge */}
            <View
              style={[
                styles.rarityBadge,
                { backgroundColor: rarityColors.primary },
              ]}
            >
              <Text style={[styles.rarityText, { color: rarityColors.text }]}>
                {formatRarity(item.rarity)}
              </Text>
            </View>

            {/* Owned/Equipped Indicator */}
            {isOwned && !item.is_consumable && (
              <View
                style={[
                  styles.ownedBadge,
                  {
                    backgroundColor: isEquipped
                      ? colors.primary
                      : colors.isDark
                      ? 'rgba(52, 211, 153, 0.9)'
                      : 'rgba(16, 185, 129, 0.9)',
                  },
                ]}
              >
                <Check size={12} color="#fff" strokeWidth={3} />
              </View>
            )}

            {/* Lock Indicator */}
            {isLocked && (
              <View style={styles.lockOverlay}>
                <Lock size={24} color="rgba(255,255,255,0.8)" strokeWidth={2} />
              </View>
            )}
          </View>

          {/* Info Area */}
          <View style={styles.infoContainer}>
            <Text
              className="font-semibold"
              style={[styles.name, { color: colors.text }]}
              numberOfLines={2}
            >
              {item.name}
            </Text>

            <View style={styles.priceRow}>
              {getPriceIcon()}
              <Text
                style={[
                  styles.priceText,
                  {
                    color: isOwned
                      ? colors.primary
                      : canAfford || isLocked
                      ? colors.text
                      : colors.textSecondary,
                  },
                  isOwned && styles.ownedText,
                ]}
              >
                {getDisplayPrice()}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ============================================
// Compact Variant (for horizontal scrolls)
// ============================================

interface CosmeticCardCompactProps {
  item: CosmeticItem;
  onPress: (item: CosmeticItem) => void;
  colors?: ReturnType<typeof useThemeColors>;
}

export function CosmeticCardCompact({
  item,
  onPress,
  colors: propColors,
}: CosmeticCardCompactProps) {
  const defaultColors = useThemeColors();
  const colors = propColors || defaultColors;
  const [imageLoaded, setImageLoaded] = useState(false);

  const rarityColors = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
  const TypeIcon = getTypeIcon(item.cosmetic_type);
  const imageUrl = getCosmeticPreviewUrl(item);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.compactCard,
        {
          backgroundColor: colors.isDark
            ? 'rgba(30, 30, 35, 0.95)'
            : 'rgba(255, 255, 255, 0.95)',
          borderColor: colors.isDark
            ? 'rgba(255, 255, 255, 0.1)'
            : 'rgba(0, 0, 0, 0.08)',
        },
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={[`${rarityColors.primary}20`, `${rarityColors.secondary}10`]}
        style={styles.compactPreview}
      >
        {!imageLoaded && (
          <TypeIcon size={28} color={rarityColors.primary} strokeWidth={1.5} />
        )}
        {imageUrl && (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.compactImage, !imageLoaded && styles.hiddenImage]}
            resizeMode="contain"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(false)}
          />
        )}
      </LinearGradient>
      <Text
        className="font-medium"
        style={[styles.compactName, { color: colors.text }]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
    </Pressable>
  );
}

// ============================================
// Featured Variant (larger, for promotions)
// ============================================

interface CosmeticCardFeaturedProps {
  item: CosmeticItem;
  onPress: (item: CosmeticItem) => void;
  tagline?: string;
  colors?: ReturnType<typeof useThemeColors>;
}

export function CosmeticCardFeatured({
  item,
  onPress,
  tagline,
  colors: propColors,
}: CosmeticCardFeaturedProps) {
  const defaultColors = useThemeColors();
  const colors = propColors || defaultColors;
  const [imageLoaded, setImageLoaded] = useState(false);

  const rarityColors = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
  const TypeIcon = getTypeIcon(item.cosmetic_type);
  const imageUrl = getCosmeticPreviewUrl(item);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(item);
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => pressed && styles.pressed}>
      <View style={styles.featuredCard}>
        <LinearGradient
          colors={[rarityColors.primary, rarityColors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.featuredGradient}
        >
          <BlurView
            intensity={40}
            tint="dark"
            style={styles.featuredContent}
          >
            <View style={styles.featuredPreview}>
              {!imageLoaded && (
                <TypeIcon size={48} color="#fff" strokeWidth={1.5} />
              )}
              {imageUrl && (
                <Image
                  source={{ uri: imageUrl }}
                  style={[styles.featuredImage, !imageLoaded && styles.hiddenImage]}
                  resizeMode="contain"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageLoaded(false)}
                />
              )}
            </View>

            <View style={styles.featuredInfo}>
              {tagline && (
                <Text style={styles.featuredTagline}>{tagline}</Text>
              )}
              <Text className="font-bold" style={styles.featuredName}>
                {item.name}
              </Text>
              {item.description && (
                <Text style={styles.featuredDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              )}

              <View style={styles.featuredPriceRow}>
                {item.earned_coin_price !== null && (
                  <View style={styles.featuredPrice}>
                    <Coins size={16} color="#FFD700" strokeWidth={2.5} />
                    <Text style={styles.featuredPriceText}>
                      {formatCoins(item.earned_coin_price)}
                    </Text>
                  </View>
                )}
                {item.premium_coin_price !== null && (
                  <View style={styles.featuredPrice}>
                    <Sparkles size={16} color="#A855F7" strokeWidth={2.5} />
                    <Text style={styles.featuredPriceText}>
                      {formatCoins(item.premium_coin_price)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </BlurView>
        </LinearGradient>

        {/* Rarity Label */}
        <View style={[styles.featuredRarity, { backgroundColor: rarityColors.primary }]}>
          <Text style={[styles.rarityText, { color: rarityColors.text }]}>
            {formatRarity(item.rarity)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create({
  // Standard Card
  wrapper: {
    // Width controlled by parent for consistent grid layout
  },
  pressable: {},
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  equippedCard: {
    borderWidth: 2,
  },
  previewContainer: {
    aspectRatio: 1,
    position: 'relative',
  },
  previewGradient: {
    flex: 1,
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
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rarityBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ownedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    padding: 12,
    gap: 6,
  },
  name: {
    fontSize: 14,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {
    fontSize: 13,
    fontWeight: '500',
  },
  ownedText: {
    fontWeight: '600',
  },

  // Compact Card
  compactCard: {
    width: 100,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: 12,
  },
  compactPreview: {
    width: 100,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactImage: {
    width: '60%',
    height: '60%',
  },
  compactName: {
    fontSize: 11,
    padding: 8,
    textAlign: 'center',
  },

  // Featured Card
  featuredCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  featuredGradient: {
    borderRadius: 20,
  },
  featuredContent: {
    flexDirection: 'row',
    padding: 20,
    gap: 16,
  },
  featuredPreview: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredImage: {
    width: '80%',
    height: '80%',
  },
  featuredInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  featuredTagline: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  featuredName: {
    fontSize: 20,
    color: '#fff',
  },
  featuredDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 18,
  },
  featuredPriceRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  featuredPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featuredPriceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  featuredRarity: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
