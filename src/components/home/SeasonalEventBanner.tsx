/**
 * SeasonalEventBanner
 *
 * Home screen banner for seasonal fitness events.
 * Self-contained: fetches its own data and renders nothing if no events exist.
 * Shows at most one event (first active, or first upcoming).
 */

import React, { useState, useCallback } from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Users, Calendar } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useThemeColors } from '@/lib/useThemeColors';
import { competitionApi, type SeasonalEvent } from '@/lib/edge-functions';

export function SeasonalEventBanner() {
  const router = useRouter();
  const colors = useThemeColors();
  const [event, setEvent] = useState<SeasonalEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const loadEvent = useCallback(async () => {
    try {
      const { data, error } = await competitionApi.getSeasonalEvents();
      if (error || !data || data.length === 0) {
        setEvent(null);
        return;
      }
      // Prefer active events, then upcoming
      const active = data.find((e) => e.status === 'active');
      const upcoming = data.find((e) => e.status === 'upcoming');
      setEvent(active || upcoming || data[0]);
    } catch {
      setEvent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
    }, [loadEvent])
  );

  const handlePress = () => {
    if (!event) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/competition-detail?id=${event.id}`);
  };

  const handleJoin = async () => {
    if (!event || joining) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoining(true);
    try {
      const { error } = await competitionApi.joinSeasonalEvent(event.id);
      if (!error) {
        setEvent((prev) => (prev ? { ...prev, user_joined: true, participant_count: prev.participant_count + 1 } : null));
      }
    } finally {
      setJoining(false);
    }
  };

  // Don't render while loading or if no event
  if (loading || !event) return null;

  const theme = event.event_theme;
  const primaryColor = theme?.color || '#FA114F';
  const secondaryColor = theme?.secondaryColor || '#FF6B9D';

  // Calculate days info
  const now = new Date();
  const startDate = new Date(event.start_date + 'T00:00:00');
  const endDate = new Date(event.end_date + 'T23:59:59');
  const isActive = event.status === 'active';
  const daysLeft = isActive
    ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : Math.max(0, Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
      >
        <BlurView
          intensity={colors.isDark ? 30 : 80}
          tint={colors.isDark ? 'dark' : 'light'}
          style={[
            styles.container,
            {
              backgroundColor: colors.isDark
                ? 'rgba(28, 28, 30, 0.7)'
                : 'rgba(255, 255, 255, 0.3)',
              borderWidth: colors.isDark ? 0 : 1,
              borderColor: colors.isDark ? 'transparent' : 'rgba(255, 255, 255, 0.8)',
            },
          ]}
        >
          {/* Accent gradient stripe */}
          <LinearGradient
            colors={[primaryColor, secondaryColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentStripe}
          />

          {/* Header row */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {theme?.emoji && (
                <Text style={styles.emoji}>{theme.emoji}</Text>
              )}
              <Text
                className="text-black dark:text-white text-lg font-semibold"
                numberOfLines={1}
                style={{ flex: 1 }}
              >
                {event.name}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
          </View>

          {/* Tagline */}
          {theme?.tagline && (
            <Text className="text-gray-600 dark:text-gray-400 text-sm mb-3">
              {theme.tagline}
            </Text>
          )}

          {/* Status row */}
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Calendar size={14} color={primaryColor} />
              <Text className="text-gray-600 dark:text-gray-400 text-xs ml-1">
                {isActive
                  ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`
                  : `Starts in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Users size={14} color={primaryColor} />
              <Text className="text-gray-600 dark:text-gray-400 text-xs ml-1">
                {event.participant_count} competing
              </Text>
            </View>
          </View>

          {/* CTA button */}
          {event.user_joined ? (
            <Pressable onPress={handlePress} style={styles.ctaContainer}>
              <LinearGradient
                colors={[primaryColor, secondaryColor]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaButton}
              >
                <Text className="text-white text-sm font-semibold">View Leaderboard</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={handleJoin} disabled={joining} style={styles.ctaContainer}>
              <LinearGradient
                colors={[primaryColor, secondaryColor]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.ctaButton, joining && { opacity: 0.7 }]}
              >
                {joining ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white text-sm font-semibold">Join Challenge</Text>
                )}
              </LinearGradient>
            </Pressable>
          )}

          {/* Reward teaser */}
          {theme?.rewardDescription && (
            <Text className="text-gray-500 dark:text-gray-500 text-xs text-center mt-2">
              {theme.rewardDescription}
            </Text>
          )}
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 20,
    paddingTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  accentStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  emoji: {
    fontSize: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaContainer: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  ctaButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
});

export default SeasonalEventBanner;
