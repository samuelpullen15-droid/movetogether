/**
 * SkeletonLoader
 *
 * A reusable skeleton loading component with shimmer animation.
 * Provides various shapes and preset layouts for consistent loading states.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/lib/useThemeColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// TYPES
// ============================================================================

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number;
  lastLineWidth?: `${number}%`;
  spacing?: number;
  style?: ViewStyle;
}

interface SkeletonCardProps {
  height?: number;
  style?: ViewStyle;
}

interface SkeletonListItemProps {
  hasAvatar?: boolean;
  avatarSize?: number;
  lines?: number;
  style?: ViewStyle;
}

// ============================================================================
// SHIMMER ANIMATION
// ============================================================================

function Shimmer({ style }: { style?: ViewStyle }) {
  const colors = useThemeColors();
  const translateX = useSharedValue(-SCREEN_WIDTH);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(SCREEN_WIDTH, {
        duration: 1200,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const shimmerColors = colors.isDark
    ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']
    : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)'];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      <LinearGradient
        colors={shimmerColors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

// ============================================================================
// BASE SKELETON
// ============================================================================

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const colors = useThemeColors();

  const baseColor = colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor: baseColor,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Shimmer />
    </View>
  );
}

// ============================================================================
// SKELETON SHAPES
// ============================================================================

export function SkeletonCircle({
  size = 40,
  style,
}: {
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <Skeleton
      width={size}
      height={size}
      borderRadius={size / 2}
      style={style}
    />
  );
}

export function SkeletonRect({
  width = '100%',
  height = 100,
  borderRadius = 12,
  style,
}: SkeletonProps) {
  return (
    <Skeleton
      width={width}
      height={height}
      borderRadius={borderRadius}
      style={style}
    />
  );
}

// ============================================================================
// SKELETON TEXT
// ============================================================================

export function SkeletonText({
  lines = 3,
  lineHeight = 14,
  lastLineWidth = '60%',
  spacing = 8,
  style,
}: SkeletonTextProps) {
  return (
    <View style={[styles.textContainer, style]}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          height={lineHeight}
          borderRadius={lineHeight / 2}
          style={index > 0 ? { marginTop: spacing } : undefined}
        />
      ))}
    </View>
  );
}

// ============================================================================
// SKELETON PRESETS
// ============================================================================

/**
 * Card skeleton with header and content
 */
export function SkeletonCard({ height = 180, style }: SkeletonCardProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        {
          height,
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        },
        style,
      ]}
    >
      <View style={styles.cardHeader}>
        <SkeletonCircle size={36} />
        <View style={styles.cardHeaderText}>
          <Skeleton width={120} height={14} />
          <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
        </View>
      </View>
      <View style={styles.cardContent}>
        <SkeletonText lines={2} lastLineWidth="75%" />
      </View>
      <Skeleton width="100%" height={8} borderRadius={4} style={{ marginTop: 'auto' }} />
    </View>
  );
}

/**
 * List item skeleton with optional avatar
 */
export function SkeletonListItem({
  hasAvatar = true,
  avatarSize = 48,
  lines = 2,
  style,
}: SkeletonListItemProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.listItem,
        {
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        },
        style,
      ]}
    >
      {hasAvatar && <SkeletonCircle size={avatarSize} />}
      <View style={[styles.listItemContent, hasAvatar && { marginLeft: 12 }]}>
        <Skeleton width="70%" height={16} />
        {lines > 1 && <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />}
        {lines > 2 && <Skeleton width="40%" height={12} style={{ marginTop: 4 }} />}
      </View>
    </View>
  );
}

/**
 * Avatar with name skeleton
 */
export function SkeletonAvatar({
  size = 40,
  showName = true,
  style,
}: {
  size?: number;
  showName?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.avatar, style]}>
      <SkeletonCircle size={size} />
      {showName && (
        <Skeleton
          width={60}
          height={12}
          style={{ marginTop: 8 }}
        />
      )}
    </View>
  );
}

/**
 * Stats card skeleton (for home screen widgets)
 */
export function SkeletonStatsCard({ style }: { style?: ViewStyle }) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.statsCard,
        {
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        },
        style,
      ]}
    >
      <View style={styles.statsHeader}>
        <Skeleton width={140} height={18} />
        <Skeleton width={20} height={20} borderRadius={10} />
      </View>
      <View style={styles.statsContent}>
        <View style={styles.statsRow}>
          <SkeletonCircle size={64} />
          <View style={styles.statsText}>
            <Skeleton width={100} height={28} />
            <Skeleton width={80} height={14} style={{ marginTop: 6 }} />
          </View>
        </View>
      </View>
      <Skeleton width="100%" height={6} borderRadius={3} style={{ marginTop: 16 }} />
    </View>
  );
}

/**
 * Competition card skeleton
 */
export function SkeletonCompetitionCard({ style }: { style?: ViewStyle }) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.competitionCard,
        {
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        },
        style,
      ]}
    >
      <View style={styles.competitionHeader}>
        <Skeleton width="60%" height={20} />
        <Skeleton width={60} height={24} borderRadius={12} />
      </View>
      <Skeleton width="40%" height={14} style={{ marginTop: 8 }} />
      <View style={styles.competitionAvatars}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCircle key={i} size={32} style={i > 0 ? { marginLeft: -8 } : undefined} />
        ))}
        <Skeleton width={40} height={14} style={{ marginLeft: 8 }} />
      </View>
      <Skeleton width="100%" height={40} borderRadius={12} style={{ marginTop: 16 }} />
    </View>
  );
}

/**
 * Leaderboard row skeleton
 */
export function SkeletonLeaderboardRow({
  rank,
  style,
}: {
  rank?: number;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.leaderboardRow,
        {
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        },
        style,
      ]}
    >
      <View style={styles.leaderboardRank}>
        <Skeleton width={24} height={24} borderRadius={6} />
      </View>
      <SkeletonCircle size={44} style={{ marginLeft: 12 }} />
      <View style={styles.leaderboardContent}>
        <Skeleton width={100} height={16} />
        <Skeleton width={60} height={12} style={{ marginTop: 4 }} />
      </View>
      <Skeleton width={50} height={20} style={{ marginLeft: 'auto' }} />
    </View>
  );
}

/**
 * Profile header skeleton
 */
export function SkeletonProfileHeader({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.profileHeader, style]}>
      <SkeletonCircle size={100} />
      <Skeleton width={140} height={24} style={{ marginTop: 16 }} />
      <Skeleton width={100} height={14} style={{ marginTop: 8 }} />
      <View style={styles.profileStats}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.profileStat}>
            <Skeleton width={40} height={24} />
            <Skeleton width={60} height={12} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Cosmetic card skeleton for store
 */
export function SkeletonCosmeticCard({ style }: { style?: ViewStyle }) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.cosmeticCard,
        {
          backgroundColor: colors.isDark ? 'rgba(30, 30, 35, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        },
        style,
      ]}
    >
      {/* Preview area */}
      <View style={styles.cosmeticPreview}>
        <Skeleton width="100%" height="100%" borderRadius={0} />
        {/* Rarity badge */}
        <View style={styles.cosmeticBadge}>
          <Skeleton width={50} height={18} borderRadius={6} />
        </View>
      </View>
      {/* Info area */}
      <View style={styles.cosmeticInfo}>
        <Skeleton width="80%" height={14} />
        <Skeleton width={60} height={13} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/**
 * Challenge card skeleton for weekly challenges
 */
export function SkeletonChallengeCard({ style }: { style?: ViewStyle }) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        {
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
          backgroundColor: colors.isDark ? '#1F1F23' : '#FFFFFF',
          padding: 16,
        },
        style,
      ]}
    >
      {/* Top row: icon + progress */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Skeleton width={48} height={48} borderRadius={12} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Skeleton width={80} height={12} />
            <Skeleton width={40} height={12} />
          </View>
          <Skeleton width="100%" height={8} borderRadius={4} />
        </View>
      </View>
      {/* Title + description */}
      <View style={{ marginBottom: 12 }}>
        <Skeleton width="85%" height={16} style={{ marginBottom: 4 }} />
        <Skeleton width="60%" height={13} />
      </View>
      {/* Status area */}
      <Skeleton width={100} height={28} borderRadius={8} />
    </View>
  );
}

/**
 * Conversation row skeleton for DM list
 */
export function SkeletonConversationRow({ style }: { style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 14,
        },
        style,
      ]}
    >
      <SkeletonCircle size={52} />
      <View style={{ flex: 1, marginLeft: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton width={120} height={16} />
          <Skeleton width={30} height={12} />
        </View>
        <Skeleton width="80%" height={14} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/**
 * Chat bubble skeleton for messages
 */
export function SkeletonChatBubble({
  isOwn = false,
  style,
}: {
  isOwn?: boolean;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        {
          alignSelf: isOwn ? 'flex-end' : 'flex-start',
          maxWidth: '80%',
        },
        style,
      ]}
    >
      <View
        style={{
          backgroundColor: isOwn
            ? 'rgba(139, 92, 246, 0.3)'
            : colors.isDark
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(0,0,0,0.06)',
          borderRadius: 20,
          padding: 16,
        }}
      >
        <Skeleton width={isOwn ? 120 : 180} height={16} />
        {!isOwn && <Skeleton width={140} height={16} style={{ marginTop: 8 }} />}
      </View>
    </View>
  );
}

/**
 * Activity ring skeleton
 */
export function SkeletonActivityRing({ size = 160, style }: { size?: number; style?: ViewStyle }) {
  const colors = useThemeColors();

  return (
    <View style={[styles.activityRing, { width: size, height: size }, style]}>
      <View
        style={[
          styles.ringOuter,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          },
        ]}
      />
      <View
        style={[
          styles.ringMiddle,
          {
            width: size * 0.75,
            height: size * 0.75,
            borderRadius: (size * 0.75) / 2,
            borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          },
        ]}
      />
      <View
        style={[
          styles.ringInner,
          {
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: (size * 0.5) / 2,
            borderColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          },
        ]}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  skeleton: {
    position: 'relative',
  },
  textContainer: {
    width: '100%',
  },
  card: {
    borderRadius: 20,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  cardContent: {
    marginTop: 16,
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  listItemContent: {
    flex: 1,
  },
  avatar: {
    alignItems: 'center',
  },
  statsCard: {
    borderRadius: 24,
    padding: 20,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsContent: {
    marginTop: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsText: {
    marginLeft: 16,
  },
  competitionCard: {
    borderRadius: 20,
    padding: 16,
  },
  competitionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  competitionAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  leaderboardRank: {
    width: 32,
    alignItems: 'center',
  },
  leaderboardContent: {
    flex: 1,
    marginLeft: 12,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  profileStats: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 32,
  },
  profileStat: {
    alignItems: 'center',
  },
  cosmeticCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cosmeticPreview: {
    aspectRatio: 1,
    position: 'relative',
  },
  cosmeticBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  cosmeticInfo: {
    padding: 12,
  },
  activityRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuter: {
    position: 'absolute',
    borderWidth: 12,
  },
  ringMiddle: {
    position: 'absolute',
    borderWidth: 12,
  },
  ringInner: {
    position: 'absolute',
    borderWidth: 12,
  },
});

export default {
  Skeleton,
  SkeletonCircle,
  SkeletonRect,
  SkeletonText,
  SkeletonCard,
  SkeletonListItem,
  SkeletonAvatar,
  SkeletonStatsCard,
  SkeletonCompetitionCard,
  SkeletonLeaderboardRow,
  SkeletonProfileHeader,
  SkeletonCosmeticCard,
  SkeletonChallengeCard,
  SkeletonConversationRow,
  SkeletonChatBubble,
  SkeletonActivityRing,
};
