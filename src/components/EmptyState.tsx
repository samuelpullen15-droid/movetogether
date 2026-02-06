import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Text, DisplayText } from '@/components/Text';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useThemeColors } from '@/lib/useThemeColors';
import * as Haptics from 'expo-haptics';
import LottieView from 'lottie-react-native';
import type { LucideIcon } from 'lucide-react-native';

// Pre-defined Lottie animation URLs (can be expanded)
export const EMPTY_STATE_ANIMATIONS = {
  noData: 'https://assets10.lottiefiles.com/packages/lf20_tll0j4bb.json',
  noFriends: 'https://assets7.lottiefiles.com/packages/lf20_wZbGqd.json',
  noCompetitions: 'https://assets2.lottiefiles.com/packages/lf20_ydo1amjm.json',
  noAchievements: 'https://assets3.lottiefiles.com/packages/lf20_touohxv0.json',
  noMessages: 'https://assets9.lottiefiles.com/packages/lf20_u25cckyh.json',
  search: 'https://assets2.lottiefiles.com/packages/lf20_wnqlfojb.json',
} as const;

interface EmptyStateProps {
  /** Icon component from lucide-react-native */
  icon?: LucideIcon;
  /** Lottie animation source (URL or require) */
  lottieSource?: string | { uri: string } | number;
  /** Title text */
  title: string;
  /** Description text */
  description?: string;
  /** Primary action button */
  actionLabel?: string;
  /** Primary action callback */
  onAction?: () => void;
  /** Secondary action button */
  secondaryActionLabel?: string;
  /** Secondary action callback */
  onSecondaryAction?: () => void;
  /** Custom icon size (default: 64) */
  iconSize?: number;
  /** Custom icon color (uses theme accent by default) */
  iconColor?: string;
  /** Lottie animation size (default: 150) */
  lottieSize?: number;
  /** Whether to loop the Lottie animation (default: true) */
  lottieLoop?: boolean;
  /** Container style */
  style?: ViewStyle;
  /** Compact mode - smaller spacing */
  compact?: boolean;
  /** Large background word for atmosphere (e.g., "COMPETE", "FRIENDS") */
  atmosphereWord?: string;
}

export function EmptyState({
  icon: Icon,
  lottieSource,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  iconSize = 64,
  iconColor,
  lottieSize = 150,
  lottieLoop = true,
  style,
  compact = false,
  atmosphereWord,
}: EmptyStateProps) {
  const colors = useThemeColors();
  const resolvedIconColor = iconColor || '#FA114F';

  const handleAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAction?.();
  };

  const handleSecondaryAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSecondaryAction?.();
  };

  // Resolve lottie source
  const getLottieSource = () => {
    if (!lottieSource) return null;
    if (typeof lottieSource === 'string') {
      return { uri: lottieSource };
    }
    return lottieSource;
  };

  const resolvedLottieSource = getLottieSource();

  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      {/* Atmosphere word — huge faint rotated text for depth */}
      {atmosphereWord && (
        <Animated.View entering={FadeIn.duration(1000)} style={styles.atmosphereContainer} pointerEvents="none">
          <DisplayText
            className="font-extrabold"
            style={{
              fontSize: 80,
              color: colors.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
              transform: [{ rotate: '-5deg' }],
              letterSpacing: 4,
            }}
          >
            {atmosphereWord}
          </DisplayText>
        </Animated.View>
      )}

      {/* Illustration / Icon */}
      {resolvedLottieSource ? (
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <LottieView
            source={resolvedLottieSource}
            autoPlay
            loop={lottieLoop}
            style={[styles.lottie, { width: lottieSize, height: lottieSize }]}
          />
        </Animated.View>
      ) : Icon ? (
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          style={[
            styles.iconContainer,
            {
              backgroundColor: colors.isDark
                ? `${resolvedIconColor}15`
                : `${resolvedIconColor}10`,
            },
          ]}
        >
          <Icon size={iconSize} color={resolvedIconColor} strokeWidth={1.5} />
        </Animated.View>
      ) : null}

      {/* Title */}
      <Animated.View entering={FadeInUp.delay(200).springify()}>
        <Text
          style={[
            styles.title,
            compact && styles.titleCompact,
            { color: colors.text },
          ]}
        >
          {title}
        </Text>
      </Animated.View>

      {/* Description */}
      {description && (
        <Animated.View entering={FadeInUp.delay(300).springify()}>
          <Text
            style={[
              styles.description,
              compact && styles.descriptionCompact,
              { color: colors.textSecondary },
            ]}
          >
            {description}
          </Text>
        </Animated.View>
      )}

      {/* Action Buttons */}
      {(actionLabel || secondaryActionLabel) && (
        <Animated.View
          entering={FadeInUp.delay(400).springify()}
          style={styles.actionsContainer}
        >
          {actionLabel && onAction && (
            <Pressable
              onPress={handleAction}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: '#FA114F' },
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text style={styles.actionButtonText}>{actionLabel}</Text>
            </Pressable>
          )}

          {secondaryActionLabel && onSecondaryAction && (
            <Pressable
              onPress={handleSecondaryAction}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  backgroundColor: colors.isDark
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.05)',
                },
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <Text
                style={[styles.secondaryButtonText, { color: colors.text }]}
              >
                {secondaryActionLabel}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  containerCompact: {
    paddingVertical: 24,
  },
  atmosphereContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  lottie: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  titleCompact: {
    fontSize: 18,
    marginBottom: 6,
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  descriptionCompact: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 240,
  },
  actionsContainer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 180,
    alignItems: 'center',
  },
  actionButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});

export default EmptyState;
