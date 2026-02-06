/**
 * CoinBalanceDisplay - Shows user's coin balance (earned + premium)
 *
 * Can be used in:
 * - Store header for full balance display
 * - Navigation header as compact display
 * - Purchase sheets to show available funds
 */

import React from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Coins, Sparkles, ChevronRight } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useCosmeticsStore, useCoinBalanceDisplay } from '@/lib/cosmetics-store';
import { formatCoins } from '@/lib/cosmetics-service';
import { useThemeColors } from '@/lib/useThemeColors';

// ============================================
// Types
// ============================================

interface CoinBalanceDisplayProps {
  /** Display variant */
  variant?: 'full' | 'compact' | 'header';
  /** Whether to show the premium coin balance */
  showPremium?: boolean;
  /** Whether to show a loading indicator while fetching */
  showLoading?: boolean;
  /** Callback when tapped (e.g., to navigate to coin bundles) */
  onPress?: () => void;
  /** Override colors */
  colors?: ReturnType<typeof useThemeColors>;
}

// ============================================
// Component
// ============================================

export function CoinBalanceDisplay({
  variant = 'full',
  showPremium = true,
  showLoading = true,
  onPress,
  colors: propColors,
}: CoinBalanceDisplayProps) {
  const defaultColors = useThemeColors();
  const colors = propColors || defaultColors;
  const { earned, premium, earnedFormatted, premiumFormatted, isLoading } =
    useCoinBalanceDisplay();

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  // Loading state
  if (isLoading && showLoading) {
    return (
      <View style={[styles.loadingContainer, variant === 'compact' && styles.compactContainer]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  // Header variant - minimal display for navigation bar
  if (variant === 'header') {
    return (
      <Pressable onPress={handlePress} disabled={!onPress}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.headerContainer}>
          <BlurView
            intensity={80}
            tint={colors.isDark ? 'dark' : 'light'}
            style={styles.headerBlur}
          >
            <View style={styles.headerContent}>
              <Coins size={14} color="#FFD700" strokeWidth={2.5} />
              <Text style={[styles.headerText, { color: colors.text }]}>
                {earnedFormatted}
              </Text>
              {showPremium && premium > 0 && (
                <>
                  <View style={styles.headerDivider} />
                  <Sparkles size={14} color="#A855F7" strokeWidth={2.5} />
                  <Text style={[styles.headerText, { color: colors.text }]}>
                    {premiumFormatted}
                  </Text>
                </>
              )}
              {onPress && (
                <ChevronRight size={14} color={colors.textSecondary} style={styles.headerChevron} />
              )}
            </View>
          </BlurView>
        </Animated.View>
      </Pressable>
    );
  }

  // Compact variant - for inline displays
  if (variant === 'compact') {
    return (
      <Pressable onPress={handlePress} disabled={!onPress}>
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[
            styles.compactContainer,
            { backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
          ]}
        >
          <View style={styles.compactRow}>
            <View style={styles.coinIcon}>
              <Coins size={16} color="#FFD700" strokeWidth={2.5} />
            </View>
            <Text className="font-semibold" style={[styles.compactAmount, { color: colors.text }]}>
              {earnedFormatted}
            </Text>
            {showPremium && premium > 0 && (
              <>
                <View style={[styles.compactDivider, { backgroundColor: colors.border }]} />
                <View style={styles.coinIcon}>
                  <Sparkles size={16} color="#A855F7" strokeWidth={2.5} />
                </View>
                <Text
                  className="font-semibold"
                  style={[styles.compactAmount, { color: colors.text }]}
                >
                  {premiumFormatted}
                </Text>
              </>
            )}
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  // Full variant - detailed display with labels
  return (
    <Pressable onPress={handlePress} disabled={!onPress}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.fullContainer}>
        <BlurView
          intensity={80}
          tint={colors.isDark ? 'dark' : 'light'}
          style={[styles.fullBlur, { borderColor: colors.border }]}
        >
          <View style={styles.fullContent}>
            {/* Earned Coins */}
            <View style={styles.balanceSection}>
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(255, 215, 0, 0.15)' }]}>
                <Coins size={24} color="#FFD700" strokeWidth={2.5} />
              </View>
              <View style={styles.balanceText}>
                <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                  Earned Coins
                </Text>
                <Text className="font-bold" style={[styles.balanceAmount, { color: colors.text }]}>
                  {earnedFormatted}
                </Text>
              </View>
            </View>

            {/* Divider */}
            {showPremium && (
              <View style={[styles.fullDivider, { backgroundColor: colors.border }]} />
            )}

            {/* Premium Coins */}
            {showPremium && (
              <View style={styles.balanceSection}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                  <Sparkles size={24} color="#A855F7" strokeWidth={2.5} />
                </View>
                <View style={styles.balanceText}>
                  <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                    Premium Coins
                  </Text>
                  <Text className="font-bold" style={[styles.balanceAmount, { color: colors.text }]}>
                    {premiumFormatted}
                  </Text>
                </View>
              </View>
            )}

            {/* Buy More Arrow */}
            {onPress && (
              <View style={styles.buyMoreContainer}>
                <ChevronRight size={20} color={colors.primary} />
              </View>
            )}
          </View>
        </BlurView>
      </Animated.View>
    </Pressable>
  );
}

// ============================================
// Inline Coin Display (for purchase sheets, etc.)
// ============================================

interface InlineCoinDisplayProps {
  amount: number;
  type: 'earned' | 'premium';
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  colors?: ReturnType<typeof useThemeColors>;
}

export function InlineCoinDisplay({
  amount,
  type,
  size = 'medium',
  showLabel = false,
  colors: propColors,
}: InlineCoinDisplayProps) {
  const defaultColors = useThemeColors();
  const colors = propColors || defaultColors;

  const iconSize = size === 'small' ? 14 : size === 'medium' ? 18 : 24;
  const textSize = size === 'small' ? 13 : size === 'medium' ? 16 : 20;
  const iconColor = type === 'earned' ? '#FFD700' : '#A855F7';
  const Icon = type === 'earned' ? Coins : Sparkles;
  const label = type === 'earned' ? 'Earned' : 'Premium';

  return (
    <View style={styles.inlineContainer}>
      <Icon size={iconSize} color={iconColor} strokeWidth={2.5} />
      <Text
        className="font-semibold"
        style={[styles.inlineAmount, { color: colors.text, fontSize: textSize }]}
      >
        {formatCoins(amount)}
      </Text>
      {showLabel && (
        <Text style={[styles.inlineLabel, { color: colors.textSecondary }]}>{label}</Text>
      )}
    </View>
  );
}

// ============================================
// Price Display (for store items)
// ============================================

interface PriceDisplayProps {
  earnedPrice: number | null;
  premiumPrice: number | null;
  userEarnedCoins: number;
  userPremiumCoins: number;
  size?: 'small' | 'medium';
  colors?: ReturnType<typeof useThemeColors>;
}

export function PriceDisplay({
  earnedPrice,
  premiumPrice,
  userEarnedCoins,
  userPremiumCoins,
  size = 'medium',
  colors: propColors,
}: PriceDisplayProps) {
  const defaultColors = useThemeColors();
  const colors = propColors || defaultColors;

  const iconSize = size === 'small' ? 12 : 16;
  const textSize = size === 'small' ? 12 : 15;

  const canAffordEarned = earnedPrice !== null && userEarnedCoins >= earnedPrice;
  const canAffordPremium = premiumPrice !== null && userPremiumCoins >= premiumPrice;

  // If only one price option, show it
  if (earnedPrice === null && premiumPrice !== null) {
    return (
      <View style={styles.priceContainer}>
        <Sparkles size={iconSize} color="#A855F7" strokeWidth={2.5} />
        <Text
          className="font-semibold"
          style={[
            styles.priceText,
            {
              color: canAffordPremium ? colors.text : colors.textSecondary,
              fontSize: textSize,
            },
          ]}
        >
          {formatCoins(premiumPrice)}
        </Text>
      </View>
    );
  }

  if (premiumPrice === null && earnedPrice !== null) {
    return (
      <View style={styles.priceContainer}>
        <Coins size={iconSize} color="#FFD700" strokeWidth={2.5} />
        <Text
          className="font-semibold"
          style={[
            styles.priceText,
            {
              color: canAffordEarned ? colors.text : colors.textSecondary,
              fontSize: textSize,
            },
          ]}
        >
          {formatCoins(earnedPrice)}
        </Text>
      </View>
    );
  }

  // Both prices available - show the one user can afford, or earned if neither
  if (earnedPrice !== null && premiumPrice !== null) {
    if (canAffordEarned) {
      return (
        <View style={styles.priceContainer}>
          <Coins size={iconSize} color="#FFD700" strokeWidth={2.5} />
          <Text
            className="font-semibold"
            style={[styles.priceText, { color: colors.text, fontSize: textSize }]}
          >
            {formatCoins(earnedPrice)}
          </Text>
        </View>
      );
    }

    if (canAffordPremium) {
      return (
        <View style={styles.priceContainer}>
          <Sparkles size={iconSize} color="#A855F7" strokeWidth={2.5} />
          <Text
            className="font-semibold"
            style={[styles.priceText, { color: colors.text, fontSize: textSize }]}
          >
            {formatCoins(premiumPrice)}
          </Text>
        </View>
      );
    }

    // Can't afford either - show earned price
    return (
      <View style={styles.priceContainer}>
        <Coins size={iconSize} color="#FFD700" strokeWidth={2.5} />
        <Text
          className="font-semibold"
          style={[styles.priceText, { color: colors.textSecondary, fontSize: textSize }]}
        >
          {formatCoins(earnedPrice)}
        </Text>
      </View>
    );
  }

  // No price (unlock only)
  return (
    <Text style={[styles.unlockText, { color: colors.textSecondary }]}>Unlock Only</Text>
  );
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create({
  // Loading
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header variant
  headerContainer: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerBlur: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
    marginHorizontal: 4,
  },
  headerChevron: {
    marginLeft: 2,
  },

  // Compact variant
  compactContainer: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coinIcon: {
    marginRight: 2,
  },
  compactAmount: {
    fontSize: 15,
  },
  compactDivider: {
    width: 1,
    height: 16,
    marginHorizontal: 8,
  },

  // Full variant
  fullContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  fullBlur: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fullContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  balanceSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceText: {
    gap: 2,
  },
  balanceLabel: {
    fontSize: 12,
  },
  balanceAmount: {
    fontSize: 22,
  },
  fullDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 16,
  },
  buyMoreContainer: {
    paddingLeft: 8,
  },

  // Inline display
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineAmount: {
    marginLeft: 2,
  },
  inlineLabel: {
    fontSize: 12,
    marginLeft: 4,
  },

  // Price display
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {},
  unlockText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
