/**
 * weekly-recap.tsx
 *
 * Spotify Wrapped-style animated weekly recap screen.
 * Shows stats in dramatic reveal slides with animations.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Dimensions,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Trophy,
  Flame,
  Target,
  Award,
  Users,
  Share2,
  Sparkles,
  TrendingUp,
  Calendar,
  Crown,
  Zap,
  Download,
} from 'lucide-react-native';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { recapApi, WeeklyRecapData } from '@/lib/edge-functions';
import { WeeklyRecapShareCard } from '@/components/WeeklyRecapShareCard';
import { TripleActivityRings, ActivityRing } from '@/components/ActivityRing';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ============================================================================
// TYPES
// ============================================================================

interface SlideProps {
  data: WeeklyRecapData;
  colors: ReturnType<typeof useThemeColors>;
  onNext: () => void;
  onPrevious: () => void;
  isActive: boolean;
  isFirstSlide: boolean;
  isLastSlide: boolean;
}

// Tap zones for navigation (left = back, right = forward)
function NavigationTapZones({ onNext, onPrevious, isFirstSlide }: {
  onNext: () => void;
  onPrevious: () => void;
  isFirstSlide: boolean;
}) {
  return (
    <View style={styles.tapZonesContainer} pointerEvents="box-none">
      {!isFirstSlide && (
        <Pressable
          style={styles.tapZoneLeft}
          onPress={onPrevious}
        />
      )}
      <Pressable
        style={[styles.tapZoneRight, isFirstSlide && styles.tapZoneFull]}
        onPress={onNext}
      />
    </View>
  );
}

// ============================================================================
// ANIMATED COUNTER
// ============================================================================

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  delay?: number;
  style?: any;
  decimals?: number;
}

function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  duration = 1500,
  delay = 0,
  style,
  decimals = 0,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withDelay(
      delay,
      withTiming(value, {
        duration,
        easing: Easing.out(Easing.cubic),
      })
    );

    const interval = setInterval(() => {
      const currentVal = animatedValue.value;
      setDisplayValue(decimals > 0 ? parseFloat(currentVal.toFixed(decimals)) : Math.round(currentVal));
    }, 16);

    const timeout = setTimeout(() => {
      setDisplayValue(decimals > 0 ? parseFloat(value.toFixed(decimals)) : value);
      clearInterval(interval);
    }, delay + duration + 100);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [value, delay, duration, decimals]);

  return (
    <Text className="font-bold" style={style}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </Text>
  );
}

// ============================================================================
// GLOW EFFECT
// ============================================================================

function GlowPulse({ color, size = 200 }: { color: string; size?: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

// ============================================================================
// SLIDE COMPONENTS
// ============================================================================

// Slide 1: Total Rings Overview
function RingsSlide({ data, colors, onNext, onPrevious, isActive, isFirstSlide }: SlideProps) {
  if (!isActive) return null;

  return (
    <View style={styles.slide}>
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={StyleSheet.absoluteFill}
      />

      <NavigationTapZones onNext={onNext} onPrevious={onPrevious} isFirstSlide={isFirstSlide} />

      <View style={styles.slideContent} pointerEvents="none">
        <Text className="font-bold" style={styles.slideLabel}>THIS WEEK{'\n'}YOU CLOSED</Text>

        <View style={styles.ringsContainer}>
          <TripleActivityRings
            size={200}
            moveProgress={1}
            exerciseProgress={1}
            standProgress={1}
            forceRender
          />
        </View>

        <View style={styles.bigNumberContainer}>
          <Text style={styles.bigNumber}>{data.totalRingsClosed}</Text>
          <Text style={styles.bigNumberLabel}>RINGS</Text>
        </View>

        <View style={styles.subStatsRow}>
          <View style={styles.subStat}>
            <Text style={styles.subStatValue}>{data.daysWithActivity}</Text>
            <Text style={styles.subStatLabel}>Active Days</Text>
          </View>
          <View style={styles.subStatDivider} />
          <View style={styles.subStat}>
            <Text style={styles.subStatValue}>{Math.round((data.totalRingsClosed / 21) * 100)}%</Text>
            <Text style={styles.subStatLabel}>Weekly Goal</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// Animated Ring that fills from 0 to target
function AnimatedRing({
  targetPercent,
  color,
  bgColor,
  delay
}: {
  targetPercent: number;
  color: string;
  bgColor: string;
  delay: number;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startDelay = setTimeout(() => {
      const duration = 1500;
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        setProgress(eased * targetPercent);
        if (t < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }, delay);

    return () => clearTimeout(startDelay);
  }, [targetPercent, delay]);

  return (
    <ActivityRing
      size={120}
      strokeWidth={12}
      progress={progress / 100}
      color={color}
      backgroundColor={bgColor}
    />
  );
}

// Slide 2: Ring Breakdown
function RingBreakdownSlide({ data, colors, onNext, onPrevious, isActive, isFirstSlide }: SlideProps) {
  if (!isActive) return null;

  const rings = [
    { name: 'Move', percent: data.avgMovePercent, color: '#FA114F', bgColor: 'rgba(250, 17, 79, 0.3)' },
    { name: 'Exercise', percent: data.avgExercisePercent, color: '#92E82A', bgColor: 'rgba(146, 232, 42, 0.3)' },
    { name: 'Stand', percent: data.avgStandPercent, color: '#00D4FF', bgColor: 'rgba(0, 212, 255, 0.3)' },
  ];

  return (
    <Animated.View
      entering={SlideInRight.duration(400)}
      exiting={SlideOutLeft.duration(400)}
      style={styles.slide}
    >
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={StyleSheet.absoluteFill}
      />

      <NavigationTapZones onNext={onNext} onPrevious={onPrevious} isFirstSlide={isFirstSlide} />

      <View style={styles.slideContent} pointerEvents="none">
        <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginTop: 120 }}>
          <Text className="font-bold" style={styles.slideLabel}>YOUR AVERAGE RINGS</Text>
        </Animated.View>

        <View style={styles.ringsGrid}>
          {rings.map((ring, index) => {
            return (
              <Animated.View
                key={ring.name}
                entering={FadeInUp.delay(400 + index * 150).springify()}
                style={styles.ringCard}
              >
                <View style={styles.ringWithPercent}>
                  <AnimatedRing
                    targetPercent={ring.percent}
                    color={ring.color}
                    bgColor={ring.bgColor}
                    delay={600 + index * 150}
                  />
                  <View style={styles.ringPercentOverlay}>
                    <AnimatedCounter
                      value={ring.percent}
                      suffix="%"
                      delay={600 + index * 150}
                      duration={1500}
                      style={[styles.ringPercentInside, { color: ring.color }]}
                    />
                  </View>
                </View>
                <Text style={[styles.ringNameBelow, { color: ring.color }]}>{ring.name}</Text>
              </Animated.View>
            );
          })}
        </View>

        {data.bestDay && (
          <Animated.View entering={FadeIn.delay(1200)} style={styles.bestDayBadge}>
            <Sparkles size={18} color="#FFD700" />
            <Text style={styles.bestDayText}>
              Best day: <Text style={styles.bestDayHighlight}>{formatDay(data.bestDay)}</Text> ({data.bestDayRings} rings!)
            </Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

// Slide 3: Competitions
function CompetitionsSlide({ data, colors, onNext, onPrevious, isActive, isFirstSlide }: SlideProps) {
  if (!isActive) return null;

  const hasCompetitions = data.competitionsPlayed > 0;

  return (
    <Animated.View
      entering={SlideInRight.duration(400)}
      exiting={SlideOutLeft.duration(400)}
      style={styles.slide}
    >
      <LinearGradient
        colors={hasCompetitions ? ['#9B59B6', '#8E44AD', '#6C3483'] : ['#2C3E50', '#34495E', '#2C3E50']}
        style={StyleSheet.absoluteFill}
      />

      <NavigationTapZones onNext={onNext} onPrevious={onPrevious} isFirstSlide={isFirstSlide} />

      <View style={styles.slideContent} pointerEvents="none">
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={styles.slideLabel}>COMPETITION ARENA</Text>
        </Animated.View>

        <View style={styles.mainStatContainer}>
          <GlowPulse color={hasCompetitions ? 'rgba(155, 89, 182, 0.5)' : 'rgba(255, 255, 255, 0.1)'} size={200} />
          <Animated.View entering={FadeIn.delay(400)} style={styles.iconCircle}>
            <Trophy size={64} color={hasCompetitions ? '#FFD700' : '#FFFFFF'} strokeWidth={2} />
          </Animated.View>
        </View>

        {hasCompetitions ? (
          <>
            <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.compStats}>
              <View style={styles.compStat}>
                <AnimatedCounter
                  value={data.competitionsPlayed}
                  delay={700}
                  duration={1500}
                  style={styles.compNumber}
                />
                <Text style={styles.compLabel}>Competed</Text>
              </View>
              {data.competitionsWon > 0 && (
                <View style={styles.compStat}>
                  <AnimatedCounter
                    value={data.competitionsWon}
                    delay={900}
                    duration={1500}
                    style={[styles.compNumber, { color: '#FFD700' }]}
                  />
                  <Text style={styles.compLabel}>Won 🏆</Text>
                </View>
              )}
            </Animated.View>

            {data.bestPlacement && (
              <Animated.View entering={FadeIn.delay(1200)} style={styles.placementBadge}>
                <Crown size={20} color="#FFD700" />
                <Text style={styles.placementText}>
                  Best Finish: <Text style={styles.placementHighlight}>{getOrdinal(data.bestPlacement)} Place</Text>
                </Text>
              </Animated.View>
            )}
          </>
        ) : (
          <Animated.View entering={FadeInUp.delay(600).springify()}>
            <Text style={styles.noDataText}>No competitions this week</Text>
            <Text style={styles.noDataSubtext}>Join one to compete with friends!</Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

// Slide 4: Streak
function StreakSlide({ data, colors, onNext, onPrevious, isActive, isFirstSlide }: SlideProps) {
  if (!isActive) return null;

  const hasStreak = data.currentStreak > 0;

  return (
    <Animated.View
      entering={SlideInRight.duration(400)}
      exiting={SlideOutLeft.duration(400)}
      style={styles.slide}
    >
      <LinearGradient
        colors={hasStreak ? ['#FF6B35', '#E74C3C', '#C0392B'] : ['#2C3E50', '#34495E', '#2C3E50']}
        style={StyleSheet.absoluteFill}
      />

      <NavigationTapZones onNext={onNext} onPrevious={onPrevious} isFirstSlide={isFirstSlide} />

      <View style={styles.slideContent} pointerEvents="none">
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={styles.slideLabel}>YOUR STREAK</Text>
        </Animated.View>

        <View style={styles.mainStatContainer}>
          <GlowPulse color={hasStreak ? 'rgba(255, 107, 53, 0.5)' : 'rgba(255, 255, 255, 0.1)'} size={250} />
          <Animated.View entering={FadeIn.delay(400)} style={styles.iconCircle}>
            <Flame size={72} color={hasStreak ? '#FFD700' : '#FFFFFF'} fill={hasStreak ? '#FF6B35' : 'transparent'} />
          </Animated.View>
        </View>

        {hasStreak ? (
          <>
            <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.bigNumberContainer}>
              <AnimatedCounter
                value={data.currentStreak}
                delay={700}
                duration={2000}
                style={styles.bigNumber}
              />
              <Text style={styles.bigNumberLabel}>DAY STREAK</Text>
            </Animated.View>

            {data.streakGained > 0 && (
              <Animated.View entering={FadeIn.delay(1200)} style={styles.streakGainBadge}>
                <TrendingUp size={18} color="#92E82A" />
                <Text style={styles.streakGainText}>
                  +{data.streakGained} days this week!
                </Text>
              </Animated.View>
            )}
          </>
        ) : (
          <Animated.View entering={FadeInUp.delay(600).springify()}>
            <Text style={styles.noDataText}>No active streak</Text>
            <Text style={styles.noDataSubtext}>Start one tomorrow!</Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

// Slide 5: Achievements
function AchievementsSlide({ data, colors, onNext, onPrevious, isActive, isFirstSlide }: SlideProps) {
  if (!isActive) return null;

  const hasAchievements = data.achievementsUnlocked > 0;

  return (
    <Animated.View
      entering={SlideInRight.duration(400)}
      exiting={SlideOutLeft.duration(400)}
      style={styles.slide}
    >
      <LinearGradient
        colors={hasAchievements ? ['#F39C12', '#E67E22', '#D35400'] : ['#2C3E50', '#34495E', '#2C3E50']}
        style={StyleSheet.absoluteFill}
      />

      <NavigationTapZones onNext={onNext} onPrevious={onPrevious} isFirstSlide={isFirstSlide} />

      <View style={styles.slideContent} pointerEvents="none">
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={styles.slideLabel}>ACHIEVEMENTS UNLOCKED</Text>
        </Animated.View>

        <View style={styles.mainStatContainer}>
          <GlowPulse color={hasAchievements ? 'rgba(243, 156, 18, 0.5)' : 'rgba(255, 255, 255, 0.1)'} size={200} />
          <Animated.View entering={FadeIn.delay(400)} style={styles.iconCircle}>
            <Award size={64} color={hasAchievements ? '#FFD700' : '#FFFFFF'} strokeWidth={2} />
          </Animated.View>
        </View>

        {hasAchievements ? (
          <>
            <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.bigNumberContainer}>
              <AnimatedCounter
                value={data.achievementsUnlocked}
                delay={700}
                duration={1500}
                style={styles.bigNumber}
              />
              <Text style={styles.bigNumberLabel}>NEW ACHIEVEMENTS</Text>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(1000)} style={styles.achievementsList}>
              {data.achievementNames.slice(0, 3).map((name, index) => (
                <Animated.View
                  key={name}
                  entering={FadeInUp.delay(1100 + index * 100).springify()}
                  style={styles.achievementBadge}
                >
                  <Zap size={14} color="#FFD700" />
                  <Text style={styles.achievementName}>{name}</Text>
                </Animated.View>
              ))}
            </Animated.View>
          </>
        ) : (
          <Animated.View entering={FadeInUp.delay(600).springify()}>
            <Text style={styles.noDataText}>No new achievements</Text>
            <Text style={styles.noDataSubtext}>Keep pushing to unlock more!</Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

// Slide 6: Friend Highlight
function FriendSlide({ data, colors, onNext, onPrevious, isActive, isFirstSlide }: SlideProps) {
  if (!isActive) return null;

  const hasFriend = data.topFriend !== null;

  return (
    <Animated.View
      entering={SlideInRight.duration(400)}
      exiting={SlideOutLeft.duration(400)}
      style={styles.slide}
    >
      <LinearGradient
        colors={hasFriend ? ['#3498DB', '#2980B9', '#1A5276'] : ['#2C3E50', '#34495E', '#2C3E50']}
        style={StyleSheet.absoluteFill}
      />

      <NavigationTapZones onNext={onNext} onPrevious={onPrevious} isFirstSlide={isFirstSlide} />

      <View style={styles.slideContent} pointerEvents="none">
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={styles.slideLabel}>FRIEND SPOTLIGHT</Text>
        </Animated.View>

        <View style={styles.mainStatContainer}>
          <GlowPulse color={hasFriend ? 'rgba(52, 152, 219, 0.5)' : 'rgba(255, 255, 255, 0.1)'} size={200} />
          <Animated.View entering={FadeIn.delay(400)} style={styles.iconCircle}>
            <Users size={64} color={hasFriend ? '#00D4FF' : '#FFFFFF'} strokeWidth={2} />
          </Animated.View>
        </View>

        {hasFriend && data.topFriend ? (
          <>
            <Animated.View entering={FadeInUp.delay(600).springify()}>
              <Text style={styles.friendName}>{data.topFriend.name}</Text>
              <Text style={styles.friendTitle}>Top Performer</Text>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(900)} style={styles.friendStats}>
              <Crown size={24} color="#FFD700" />
              <Text style={styles.friendRings}>
                {data.topFriend.ringsClosed} rings closed
              </Text>
            </Animated.View>
          </>
        ) : (
          <Animated.View entering={FadeInUp.delay(600).springify()}>
            <Text style={styles.noDataText}>Add friends to compete!</Text>
            <Text style={styles.noDataSubtext}>See how they're doing each week</Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

// Slide 7: Summary Card
function SummarySlide({ data, colors, onNext, onPrevious, isActive, isFirstSlide }: SlideProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuthStore();

  if (!isActive) return null;

  const handleShareText = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const shareText = `🎯 My MoveTogether Weekly Recap!\n\n` +
      `💪 ${data.totalRingsClosed} rings closed\n` +
      `🔥 ${data.currentStreak} day streak\n` +
      (data.competitionsWon > 0 ? `🏆 ${data.competitionsWon} competition${data.competitionsWon > 1 ? 's' : ''} won\n` : '') +
      (data.achievementsUnlocked > 0 ? `🎖️ ${data.achievementsUnlocked} new achievement${data.achievementsUnlocked > 1 ? 's' : ''}\n` : '') +
      `\nJoin me on MoveTogether!`;

    try {
      await Share.share({
        message: shareText,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleShareImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowSharePreview(true);
  };

  const captureImage = async (): Promise<string | null> => {
    // Wait for the view to be fully rendered
    await new Promise(resolve => setTimeout(resolve, 200));

    if (!viewShotRef.current?.capture) {
      console.error('ViewShot ref not available');
      return null;
    }

    try {
      const uri = await viewShotRef.current.capture();
      return uri;
    } catch (error) {
      console.error('Error capturing image:', error);
      return null;
    }
  };

  const captureAndShare = async () => {
    if (isCapturing) return;

    setIsCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const uri = await captureImage();

      if (!uri) {
        await handleShareText();
        setShowSharePreview(false);
        return;
      }

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        await handleShareText();
        setShowSharePreview(false);
        return;
      }

      // Share the image
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Your Weekly Recap',
      });

      // Clean up temp file
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }

      setShowSharePreview(false);
    } catch (error) {
      console.error('Error capturing/sharing:', error);
      await handleShareText();
      setShowSharePreview(false);
    } finally {
      setIsCapturing(false);
    }
  };

  const saveToPhotos = async () => {
    if (isSaving) return;

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        console.error('Media library permission denied');
        setIsSaving(false);
        return;
      }

      const uri = await captureImage();

      if (!uri) {
        setIsSaving(false);
        return;
      }

      // Save to camera roll
      await MediaLibrary.saveToLibraryAsync(uri);

      // Clean up temp file
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSharePreview(false);
    } catch (error) {
      console.error('Error saving to photos:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Animated.View
      entering={SlideInRight.duration(400)}
      style={styles.slide}
    >
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#FA114F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <NavigationTapZones onNext={onNext} onPrevious={onPrevious} isFirstSlide={isFirstSlide} />

      <View style={styles.slideContent} pointerEvents="box-none">
        <Animated.View entering={FadeInDown.delay(200).springify()} pointerEvents="none">
          <Text className="font-bold" style={styles.summaryTitle}>Week in Review</Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(400)} style={styles.summaryCard} pointerEvents="none">
          <View style={styles.summaryRow}>
            <Target size={24} color="#FF6B35" />
            <Text style={styles.summaryLabel}>Rings Closed</Text>
            <Text style={styles.summaryValue}>{data.totalRingsClosed}</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Flame size={24} color="#E74C3C" />
            <Text style={styles.summaryLabel}>Current Streak</Text>
            <Text style={styles.summaryValue}>{data.currentStreak} days</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Trophy size={24} color="#9B59B6" />
            <Text style={styles.summaryLabel}>Competitions</Text>
            <Text style={styles.summaryValue}>
              {data.competitionsWon > 0 ? `${data.competitionsWon} won` : `${data.competitionsPlayed} played`}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Award size={24} color="#F39C12" />
            <Text style={styles.summaryLabel}>Achievements</Text>
            <Text style={styles.summaryValue}>{data.achievementsUnlocked} new</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Calendar size={24} color="#3498DB" />
            <Text style={styles.summaryLabel}>Active Days</Text>
            <Text style={styles.summaryValue}>{data.daysWithActivity}/7</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(800).springify()} style={styles.shareButtonContainer} pointerEvents="box-none">
          <Pressable
            onPress={handleShareImage}
            style={({ pressed }) => [
              styles.shareButton,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <LinearGradient
              colors={['#FA114F', '#FF6B5A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shareButtonGradient}
            >
              <Share2 size={22} color="#FFFFFF" />
              <Text style={styles.shareButtonText}>Share Your Week</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(1000)} pointerEvents="none">
          <Text style={styles.motivationText}>
            Keep pushing! Next week awaits. 💪
          </Text>
        </Animated.View>
      </View>

      {/* Share Preview Modal */}
      <Modal
        visible={showSharePreview}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSharePreview(false)}
      >
        <View style={styles.shareModalOverlay}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />

          <Text style={styles.shareModalTitle}>Share Your Recap</Text>

          <ScrollView
            style={styles.shareCardScrollView}
            contentContainerStyle={[styles.shareCardContainer, { paddingBottom: 24 }]}
            showsVerticalScrollIndicator={false}
            bounces={true}
          >
            <ViewShot
              {...{ ref: viewShotRef } as any}
              options={{ format: 'png', quality: 1 }}
            >
              <WeeklyRecapShareCard
                data={data}
                userName={user?.user_metadata?.username}
              />
            </ViewShot>
          </ScrollView>

          <View style={{ width: SCREEN_WIDTH - 48, alignSelf: 'center', gap: 12, marginTop: 20 }}>
            <TouchableOpacity
              onPress={captureAndShare}
              disabled={isCapturing || isSaving}
              activeOpacity={0.8}
              style={{
                width: '100%',
                backgroundColor: '#FA114F',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                paddingVertical: 16,
                borderRadius: 30,
                opacity: isCapturing ? 0.8 : 1,
              }}
            >
              <Share2 size={20} color="#FFFFFF" />
              <Text style={styles.shareModalButtonText}>
                {isCapturing ? 'Preparing...' : 'Share Image'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={saveToPhotos}
              disabled={isCapturing || isSaving}
              activeOpacity={0.8}
              style={{
                width: '100%',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                paddingVertical: 16,
                borderRadius: 30,
                opacity: isSaving ? 0.8 : 1,
              }}
            >
              <Download size={20} color="#FFFFFF" />
              <Text style={styles.shareModalButtonText}>
                {isSaving ? 'Saving...' : 'Save to Photos'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowSharePreview(false)}
              activeOpacity={0.8}
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 16,
                borderRadius: 30,
              }}
            >
              <Text style={styles.shareModalButtonTextSecondary}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function WeeklyRecapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WeeklyRecapData | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const SLIDES = [
    RingsSlide,
    RingBreakdownSlide,
    CompetitionsSlide,
    StreakSlide,
    AchievementsSlide,
    FriendSlide,
    SummarySlide,
  ];

  // Load recap data
  useEffect(() => {
    loadRecapData();
  }, []);

  const loadRecapData = async () => {
    if (!user?.id) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      const result = await recapApi.getMyWeeklyRecap();
      if (result.data) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to load recap');
      }
    } catch (err) {
      console.error('Failed to load weekly recap:', err);
      setError('Failed to load recap');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      router.back();
    }
  }, [currentSlide, router]);

  const handlePrevious = useCallback(() => {
    if (currentSlide > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentSlide((prev) => prev - 1);
    }
  }, [currentSlide]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back();
  }, [router]);

  // Loading state
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color="#FA114F" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading your recap...
        </Text>
      </View>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>
          {error || 'Unable to load recap'}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const CurrentSlideComponent = SLIDES[currentSlide];

  return (
    <View style={styles.container}>
      {/* Close button */}
      <Pressable
        onPress={handleClose}
        style={[styles.closeButton, { top: insets.top + 12 }]}
      >
        <BlurView intensity={80} tint="dark" style={styles.closeButtonBlur}>
          <X size={24} color="#FFFFFF" />
        </BlurView>
      </Pressable>

      {/* Progress dots */}
      <View style={[styles.progressDots, { top: insets.top + 16 }]}>
        {SLIDES.map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressDot,
              {
                backgroundColor: index === currentSlide ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)',
                width: index === currentSlide ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      {/* Current slide */}
      <CurrentSlideComponent
        data={data}
        colors={colors}
        onNext={handleNext}
        onPrevious={handlePrevious}
        isActive={true}
        isFirstSlide={currentSlide === 0}
        isLastSlide={currentSlide === SLIDES.length - 1}
      />
    </View>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDay(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#FA114F',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Close button
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 100,
  },
  closeButtonBlur: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // Progress dots
  progressDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    zIndex: 100,
  },
  progressDot: {
    height: 8,
    borderRadius: 4,
  },

  // Slide
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  slideLabel: {
    fontSize: 35,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 35,
  },

  // Main stat
  mainStatContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringsContainer: {
    marginBottom: 32,
  },

  // Big number
  bigNumberContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  bigNumber: {
    fontSize: 96,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bigNumberLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 2,
    marginTop: -13,
    marginRight: -2,
  },

  // Sub stats
  subStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  subStat: {
    alignItems: 'center',
  },
  subStatValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subStatLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  subStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },

  // Ring breakdown
  ringsBreakdown: {
    width: SCREEN_WIDTH - 48,
    gap: 20,
    marginTop: 24,
    marginBottom: 32,
  },
  ringsGrid: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 32,
    marginTop: 48,
    marginBottom: 32,
  },
  ringCard: {
    alignItems: 'center',
  },
  ringWithPercent: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringPercentOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringPercentInside: {
    fontSize: 28,
    fontWeight: '700',
  },
  ringNameBelow: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringInfo: {
    flex: 1,
  },
  ringName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  ringBarContainer: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  ringBar: {
    height: '100%',
    borderRadius: 4,
  },
  ringPercent: {
    fontSize: 24,
    fontWeight: '700',
  },

  // Best day badge
  bestDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.4)',
  },
  bestDayText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  bestDayHighlight: {
    fontWeight: '700',
    color: '#FFD700',
  },

  // Competition stats
  compStats: {
    flexDirection: 'row',
    gap: 48,
    marginBottom: 24,
  },
  compStat: {
    alignItems: 'center',
  },
  compNumber: {
    fontSize: 56,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  compLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },

  // Placement badge
  placementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.4)',
  },
  placementText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  placementHighlight: {
    fontWeight: '700',
    color: '#FFD700',
  },

  // Streak gain badge
  streakGainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(146, 232, 42, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  streakGainText: {
    fontSize: 16,
    color: '#92E82A',
    fontWeight: '600',
  },

  // Achievements list
  achievementsList: {
    gap: 10,
    marginTop: 16,
  },
  achievementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  achievementName: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
  },

  // Friend slide
  friendName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  friendTitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 24,
  },
  friendStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 24,
  },
  friendRings: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // No data
  noDataText: {
    fontSize: 24,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 16,
  },
  noDataSubtext: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: 8,
  },

  // Summary card
  summaryTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 32,
  },
  summaryCard: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginLeft: 14,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  // Share button
  shareButtonContainer: {
    width: SCREEN_WIDTH - 48,
    marginTop: 24,
    marginBottom: 16,
    zIndex: 10,
  },
  shareButton: {
    borderRadius: 50,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 50,
  },
  shareButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Motivation
  motivationText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },

  // Tap zones for navigation
  tapZonesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '70%',
    flexDirection: 'row',
    zIndex: 1,
  },
  tapZoneLeft: {
    flex: 1,
    height: '100%',
  },
  tapZoneRight: {
    flex: 2,
    height: '100%',
  },
  tapZoneFull: {
    flex: 1,
  },

  // Tap to continue (legacy - can be removed)
  tapToContinue: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tapText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  // Share Modal
  shareModalOverlay: {
    flex: 1,
    paddingTop: 50,
    paddingBottom: 24,
  },
  shareModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 35,
    marginBottom: 16,
    marginHorizontal: 24,
    textAlign: 'center',
  },
  shareCardScrollView: {
    flex: 1,
    width: '100%',
  },
  shareCardContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  shareModalButtonsContainer: {
    width: SCREEN_WIDTH - 48,
    alignItems: 'stretch',
    gap: 12,
    marginTop: 20,
  },
  shareModalButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 30,
  },
  shareModalButtonPrimary: {
    backgroundColor: '#FA114F',
  },
  shareModalButtonSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  shareModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  shareModalButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
});
