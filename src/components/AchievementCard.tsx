// AchievementCard.tsx - Card component for achievement display

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/Text';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronRight } from 'lucide-react-native';
import { AchievementMedal } from './AchievementMedal';
import { AchievementWithProgress, TIER_CONFIG, TIER_ORDER } from '@/lib/achievements-types';
import { useThemeColors } from '@/lib/useThemeColors';

interface AchievementCardProps {
  achievement: AchievementWithProgress;
  onPress: (achievement: AchievementWithProgress) => void;
  index?: number;
  colors?: ReturnType<typeof useThemeColors>;
}

export function AchievementCard({ achievement, onPress, index = 0, colors: propColors }: AchievementCardProps) {
  const defaultColors = useThemeColors();
  const colors = propColors || defaultColors;
  const {
    name,
    icon,
    currentTier,
    nextTier,
    canAccess,
    tiersUnlocked,
  } = achievement;

  const isLocked = !canAccess;
  const highestUnlockedTier = currentTier;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(achievement);
  };

  // Get border color based on highest unlocked tier
  const getBorderColor = () => {
    if (isLocked) return colors.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
    if (highestUnlockedTier) {
      return TIER_CONFIG[highestUnlockedTier].colors.primary;
    }
    return colors.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)';
  };

  // Get background color based on highest unlocked tier
  const getBackgroundColor = () => {
    if (isLocked) return colors.isDark ? '#1F1F23' : '#F2F2F7';
    if (highestUnlockedTier) {
      // Use a more transparent version of the tier color for background
      const tierColor = TIER_CONFIG[highestUnlockedTier].colors.primary;
      // Convert hex to rgba with low opacity (around 15-20%)
      if (tierColor.startsWith('#')) {
        const r = parseInt(tierColor.slice(1, 3), 16);
        const g = parseInt(tierColor.slice(3, 5), 16);
        const b = parseInt(tierColor.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${colors.isDark ? 0.15 : 0.12})`;
      }
      return colors.isDark ? '#1F1F23' : '#F2F2F7';
    }
    return colors.isDark ? '#1F1F23' : '#F2F2F7';
  };

  // Get unselected tier badge color
  const getUnselectedTierColor = () => colors.isDark ? '#2C2C2E' : '#E5E5EA';
  const getUnselectedTierBorder = () => colors.isDark ? '#3A3A3C' : '#D1D1D6';

  return (
    <Animated.View 
      entering={FadeInDown.delay(index * 30).springify()}
      style={styles.wrapper}
    >
      <View style={[styles.card, { borderColor: getBorderColor(), backgroundColor: getBackgroundColor() }, isLocked && styles.lockedContainer]}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.pressable,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.medalContainer}>
            <AchievementMedal
              tier={currentTier}
              icon={icon}
              size="medium"
              locked={isLocked}
              colors={colors}
            />
          </View>

          <View style={styles.content}>
            <Text className="font-bold" style={[styles.name, { color: isLocked ? colors.textSecondary : colors.text }]} numberOfLines={2}>
              {name}
            </Text>

            <View style={styles.tierBadges}>
              {TIER_ORDER.map((tier) => {
                const isUnlocked = tiersUnlocked[tier] !== null;
                const tierColors = TIER_CONFIG[tier].colors;

                return (
                  <View
                    key={tier}
                    style={[
                      styles.tierBadge,
                      {
                        backgroundColor: isUnlocked ? tierColors.primary : getUnselectedTierColor(),
                        borderColor: isUnlocked ? tierColors.accent : getUnselectedTierBorder(),
                      },
                    ]}
                  />
                );
              })}
            </View>

            {!nextTier && highestUnlockedTier === 'platinum' && (
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>✨ MAXED</Text>
              </View>
            )}

            {nextTier && (
              <View style={styles.nextTierContainer}>
                <Text style={[styles.nextTierText, { color: colors.textSecondary }]}>
                  Next:{' '}
                  <Text style={{ color: TIER_CONFIG[nextTier].colors.primary, fontWeight: '700' }}>
                    {TIER_CONFIG[nextTier].label}
                  </Text>
                </Text>
                <ChevronRight size={12} strokeWidth={2.5} color={TIER_CONFIG[nextTier].colors.primary} style={styles.nextTierChevron} />
              </View>
            )}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    width: '100%',
    padding: 16,
  },
  pressable: {
    padding: 0,
    alignItems: 'center',
    minHeight: 180,
    justifyContent: 'space-between',
    width: '100%',
  },
  pressed: {
    opacity: 0.8,
  },
  lockedContainer: {
    opacity: 0.6,
  },
  medalContainer: {
    marginBottom: 12,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    flex: 1,
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 3,
    minHeight: 40,
  },
  tierBadges: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  tierBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  statusBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFD700',
  },
  nextTierContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    gap: 0,
  },
  nextTierText: {
    fontSize: 12,
  },
  nextTierChevron: {
    marginLeft: 0,
  },
});

export default AchievementCard;