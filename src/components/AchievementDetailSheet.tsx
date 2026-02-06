// AchievementDetailSheet.tsx - Bottom sheet modal for achievement details

import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/Text';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetMethods } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, Check, Star } from 'lucide-react-native';
import { AchievementMedal } from './AchievementMedal';
import { AchievementWithProgress, TIER_CONFIG, TIER_ORDER, AchievementCategory } from '@/lib/achievements-types';
import { useThemeColors } from '@/lib/useThemeColors';

interface AchievementDetailSheetProps {
  sheetRef: React.RefObject<BottomSheetMethods>;
  achievement: AchievementWithProgress | null;
  onUpgradePress: () => void;
  onClose?: () => void;
  colors?: ReturnType<typeof useThemeColors>;
}

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  competition: 'Competition',
  consistency: 'Consistency',
  milestone: 'Milestones',
  social: 'Social',
};

export function AchievementDetailSheet({ sheetRef, achievement, onUpgradePress, onClose, colors: propColors }: AchievementDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const defaultColors = useThemeColors();
  const colors = propColors || defaultColors;

  const snapPoints = useMemo(() => ['85%'], []);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!achievement) return null;

  const { name, description, category, icon, currentTier, nextTier, currentProgress, tiers, tiersUnlocked, canAccess } = achievement;

  const isLocked = !canAccess;
  const hasProgress = currentProgress > 0;

  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor: colors.isDark ? '#1C1C1E' : '#FFFFFF' }}
      handleIndicatorStyle={{ backgroundColor: colors.isDark ? '#48484A' : '#D1D1D6' }}
      backdropComponent={renderBackdrop}
      onChange={(index) => {
        if (index === -1) {
          onClose?.();
        }
      }}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.medalContainer}>
              <AchievementMedal tier={currentTier} icon={icon} size="large" locked={isLocked} colors={colors} />
            </View>
            <Text className="font-bold" style={[styles.achievementName, { color: colors.text }]}>{name}</Text>
            <Text style={[styles.achievementDescription, { color: colors.textSecondary }]}>{description}</Text>
            <View style={[styles.categoryBadge, { backgroundColor: isLocked ? (colors.isDark ? '#2C2C2E' : '#E5E5EA') : '#FA114F' }]}>
              <Text style={[styles.categoryBadgeText, { color: isLocked ? colors.textSecondary : '#FFFFFF' }]}>{CATEGORY_LABELS[category]}</Text>
            </View>
          </View>

          {/* Upgrade CTA */}
          {!canAccess && (
            <View style={styles.upgradeBanner}>
              <LinearGradient
                colors={['#FF9500', '#FF6B00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.upgradeBannerGradient}
              >
                <View style={styles.upgradeBannerContent}>
                  <Lock size={20} color="#000000" />
                  <View style={styles.upgradeBannerTextContainer}>
                    <Text style={styles.upgradeBannerTitle}>
                      {hasProgress && currentTier ? "You've made progress!" : 'Unlock Achievements'}
                    </Text>
                    {hasProgress && currentTier && (
                      <Text style={styles.upgradeBannerSubtitle}>
                        You've already earned {TIER_CONFIG[currentTier].label}. Upgrade to claim it!
                      </Text>
                    )}
                  </View>
                </View>
                <Pressable onPress={onUpgradePress} style={styles.upgradeButton}>
                  <Text style={styles.upgradeButtonText}>Upgrade</Text>
                </Pressable>
              </LinearGradient>
            </View>
          )}

          {/* Progress Section */}
          {nextTier && tiers[nextTier] && (
            <View style={styles.progressSection}>
              <Text className="font-bold" style={[styles.sectionTitle, { color: colors.text }]}>Progress to {TIER_CONFIG[nextTier].label}</Text>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { backgroundColor: colors.isDark ? '#0A0A0A' : '#E5E5EA', borderColor: colors.isDark ? '#2C2C2E' : '#D1D1D6' }]}>
                  <LinearGradient
                    colors={
                      [TIER_CONFIG[nextTier].colors.primary, TIER_CONFIG[nextTier].colors.secondary]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressFill, { width: `${achievement.progressToNextTier}%` }]}
                  />
                </View>
                <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                  {formatNumber(currentProgress)} / {formatNumber(tiers[nextTier]!.threshold)}
                </Text>
              </View>
            </View>
          )}

          {/* Tier Breakdown */}
          <View style={styles.tierBreakdown}>
            <Text className="font-bold" style={[styles.sectionTitle, { color: colors.text }]}>Tier Breakdown</Text>
            {TIER_ORDER.filter((tier) => tiers[tier]).map((tier) => {
              const isUnlocked = tiersUnlocked[tier] !== null;
              const tierProgress = currentProgress;
              const tierThreshold = tiers[tier]!.threshold;
              const isEarnedButLocked = tierProgress >= tierThreshold && !isUnlocked && !canAccess;
              const remaining = Math.max(0, tierThreshold - tierProgress);
              const tierColors = TIER_CONFIG[tier].colors;

              return (
                <View key={tier} style={[styles.tierRow, { borderBottomColor: colors.isDark ? '#2C2C2E' : '#E5E5EA' }]}>
                  <View style={styles.tierRowLeft}>
                    <View
                      style={[
                        styles.tierDot,
                        {
                          backgroundColor: isUnlocked ? tierColors.primary : (colors.isDark ? '#2C2C2E' : '#E5E5EA'),
                          borderColor: isUnlocked ? tierColors.accent : (colors.isDark ? '#3A3A3C' : '#D1D1D6'),
                        },
                      ]}
                    />
                    <View style={styles.tierInfo}>
                      <Text style={[styles.tierName, { color: colors.text }]}>{TIER_CONFIG[tier].label}</Text>
                      <Text style={[styles.tierThreshold, { color: colors.textSecondary }]}>{formatNumber(tierThreshold)}</Text>
                    </View>
                  </View>
                  <View style={styles.tierRowRight}>
                    {isUnlocked ? (
                      <View style={styles.tierStatusContainer}>
                        <Check size={16} color="#22C55E" />
                        <Text style={styles.tierStatusText}>{formatDate(tiersUnlocked[tier])}</Text>
                      </View>
                    ) : isEarnedButLocked ? (
                      <View style={[styles.tierStatusBadge, { backgroundColor: 'rgba(255, 149, 0, 0.15)' }]}>
                        <Text style={[styles.tierStatusBadgeText, { color: '#FF9500' }]}>Earned!</Text>
                      </View>
                    ) : (
                      <Text style={[styles.tierRemainingText, { color: colors.textSecondary }]}>{remaining > 0 ? `${remaining} to go` : ''}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Points Value */}
          {currentTier && tiersUnlocked[currentTier] !== null && canAccess && (
            <View style={[styles.pointsSection, { borderTopColor: colors.isDark ? '#2C2C2E' : '#E5E5EA' }]}>
              <Text style={[styles.pointsLabel, { color: colors.textSecondary }]}>Achievement Points</Text>
              <Text style={styles.pointsValue}>+{TIER_CONFIG[currentTier].points}</Text>
            </View>
          )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  medalContainer: {
    marginBottom: 16,
  },
  achievementName: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  achievementDescription: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  upgradeBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  upgradeBannerGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upgradeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  upgradeBannerTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  upgradeBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  upgradeBannerSubtitle: {
    fontSize: 14,
    color: '#000000',
    opacity: 0.8,
  },
  upgradeButton: {
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    minWidth: 80,
    textAlign: 'right',
  },
  tierBreakdown: {
    marginBottom: 32,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tierRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tierDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    marginRight: 12,
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  tierThreshold: {
    fontSize: 14,
  },
  tierRowRight: {
    alignItems: 'flex-end',
  },
  tierStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tierStatusText: {
    fontSize: 14,
    color: '#22C55E',
  },
  tierStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierStatusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tierRemainingText: {
    fontSize: 14,
  },
  pointsSection: {
    alignItems: 'center',
    paddingVertical: 20,
    borderTopWidth: 1,
  },
  pointsLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  pointsValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFD700',
  },
});

export default AchievementDetailSheet;
