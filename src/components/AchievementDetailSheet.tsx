// AchievementDetailSheet.tsx - Bottom sheet modal for achievement details

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, BottomSheetMethods } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, Check, Star } from 'lucide-react-native';
import { AchievementMedal } from './AchievementMedal';
import { AchievementWithProgress, TIER_CONFIG, TIER_ORDER, AchievementCategory } from '@/lib/achievements-types';

interface AchievementDetailSheetProps {
  sheetRef: React.RefObject<BottomSheetMethods>;
  achievement: AchievementWithProgress | null;
  onUpgradePress: () => void;
}

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  competition: 'Competition',
  consistency: 'Consistency',
  milestone: 'Milestones',
  social: 'Social',
};

export function AchievementDetailSheet({ sheetRef, achievement, onUpgradePress }: AchievementDetailSheetProps) {
  const insets = useSafeAreaInsets();

  const snapPoints = useMemo(() => ['70%', '90%'], []);

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
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView style={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.medalContainer}>
              <AchievementMedal tier={currentTier} icon={icon} size="large" locked={isLocked} />
            </View>
            <Text style={styles.achievementName}>{name}</Text>
            <Text style={styles.achievementDescription}>{description}</Text>
            <View style={[styles.categoryBadge, { backgroundColor: isLocked ? '#2C2C2E' : '#FA114F' }]}>
              <Text style={styles.categoryBadgeText}>{CATEGORY_LABELS[category]}</Text>
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
          {nextTier && (
            <View style={styles.progressSection}>
              <Text style={styles.sectionTitle}>Progress to {TIER_CONFIG[nextTier].label}</Text>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { backgroundColor: '#0A0A0A' }]}>
                  <LinearGradient
                    colors={
                      [TIER_CONFIG[nextTier].colors.primary, TIER_CONFIG[nextTier].colors.secondary]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressFill, { width: `${achievement.progressToNextTier}%` }]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {formatNumber(currentProgress)} / {formatNumber(tiers[nextTier].threshold)}
                </Text>
              </View>
            </View>
          )}

          {/* Tier Breakdown */}
          <View style={styles.tierBreakdown}>
            <Text style={styles.sectionTitle}>Tier Breakdown</Text>
            {TIER_ORDER.map((tier) => {
              const isUnlocked = tiersUnlocked[tier] !== null;
              const tierProgress = currentProgress;
              const tierThreshold = tiers[tier].threshold;
              const isEarnedButLocked = tierProgress >= tierThreshold && !isUnlocked && !canAccess;
              const remaining = Math.max(0, tierThreshold - tierProgress);
              const colors = TIER_CONFIG[tier].colors;

              return (
                <View key={tier} style={styles.tierRow}>
                  <View style={styles.tierRowLeft}>
                    <View
                      style={[
                        styles.tierDot,
                        {
                          backgroundColor: isUnlocked ? colors.primary : '#2C2C2E',
                          borderColor: isUnlocked ? colors.accent : '#3A3A3C',
                        },
                      ]}
                    />
                    <View style={styles.tierInfo}>
                      <Text style={styles.tierName}>{TIER_CONFIG[tier].label}</Text>
                      <Text style={styles.tierThreshold}>{formatNumber(tierThreshold)}</Text>
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
                      <Text style={styles.tierRemainingText}>{remaining > 0 ? `${remaining} to go` : ''}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Points Value */}
          {currentTier && tiersUnlocked[currentTier] !== null && canAccess && (
            <View style={styles.pointsSection}>
              <Text style={styles.pointsLabel}>Achievement Points</Text>
              <Text style={styles.pointsValue}>+{TIER_CONFIG[currentTier].points}</Text>
            </View>
          )}
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: '#1C1C1E',
  },
  handleIndicator: {
    backgroundColor: '#48484A',
  },
  contentContainer: {
    flex: 1,
  },
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
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  achievementDescription: {
    fontSize: 16,
    color: '#8E8E93',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
    backgroundColor: '#0A0A0A',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    color: '#8E8E93',
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
    borderBottomColor: '#2C2C2E',
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
    color: '#FFFFFF',
    marginBottom: 2,
  },
  tierThreshold: {
    fontSize: 14,
    color: '#8E8E93',
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
    color: '#8E8E93',
  },
  pointsSection: {
    alignItems: 'center',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  pointsLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  pointsValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFD700',
  },
});

export default AchievementDetailSheet;
