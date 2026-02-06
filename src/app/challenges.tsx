// challenges.tsx - Weekly challenges screen

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { Trophy, Clock, Check, Gift } from 'lucide-react-native';
import { BottomSheetMethods } from '@gorhom/bottom-sheet';

import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { ChallengeCard } from '@/components/ChallengeCard';
import { ChallengeDetailSheet } from '@/components/ChallengeDetailSheet';
import { RewardClaimCelebrationModal } from '@/components/RewardClaimCelebrationModal';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonChallengeCard } from '@/components/SkeletonLoader';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { challengesApi, ChallengeWithProgress } from '@/lib/edge-functions';

export default function ChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuthStore();
  const bottomSheetRef = useRef<BottomSheetMethods>(null);

  // State
  const [challenges, setChallenges] = useState<ChallengeWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeWithProgress | null>(null);
  const [claimingReward, setClaimingReward] = useState(false);

  // Celebration modal state
  const [showCelebration, setShowCelebration] = useState(false);
  const [claimedReward, setClaimedReward] = useState<{
    type: string | null;
    value: Record<string, unknown>;
    title: string;
  }>({ type: null, value: {}, title: '' });

  // Load challenges
  const loadChallenges = useCallback(async () => {
    if (!user?.id) return;

    try {
      const result = await challengesApi.getActiveChallenges();
      if (result.data) {
        // If no challenges exist, try to generate them
        if (result.data.length === 0) {
          console.log('[ChallengesScreen] No active challenges, generating...');
          const genResult = await challengesApi.generateChallenges();
          if (genResult.data?.challenges) {
            setChallenges(genResult.data.challenges);
          }
        } else {
          setChallenges(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to load challenges:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Load on mount and focus
  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  useFocusEffect(
    useCallback(() => {
      loadChallenges();
    }, [loadChallenges])
  );

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadChallenges();
    setRefreshing(false);
  }, [loadChallenges]);

  // Challenge press handler
  const handleChallengePress = useCallback((challenge: ChallengeWithProgress) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedChallenge(challenge);
  }, []);

  // Claim reward handler
  const handleClaimReward = useCallback(async (challengeId: string) => {
    if (claimingReward) return;

    const challenge = challenges.find((c) => c.id === challengeId);
    if (!challenge) return;

    setClaimingReward(true);

    try {
      const result = await challengesApi.claimReward(challengeId);

      if (result.data?.success) {
        // Update local state
        setChallenges((prev) =>
          prev.map((c) =>
            c.id === challengeId
              ? { ...c, progress: { ...c.progress!, reward_claimed: true } }
              : c
          )
        );

        // Close the detail sheet
        setSelectedChallenge(null);

        // Show celebration modal
        setClaimedReward({
          type: result.data.reward_type,
          value: result.data.reward_value || {},
          title: challenge.title,
        });
        setShowCelebration(true);
      }
    } catch (error) {
      console.error('Failed to claim reward:', error);
    } finally {
      setClaimingReward(false);
    }
  }, [challenges, claimingReward]);

  // Close celebration modal
  const handleCloseCelebration = useCallback(() => {
    setShowCelebration(false);
  }, []);

  // Calculate stats
  const stats = {
    total: challenges.length,
    completed: challenges.filter((c) => c.progress?.completed_at).length,
    claimed: challenges.filter((c) => c.progress?.reward_claimed).length,
    unclaimed: challenges.filter(
      (c) => c.progress?.completed_at && !c.progress?.reward_claimed
    ).length,
  };

  // Split challenges into active and completed
  const activeChallenges = challenges.filter(
    (c) => !c.progress?.completed_at || !c.progress?.reward_claimed
  );
  const completedChallenges = challenges.filter(
    (c) => c.progress?.completed_at && c.progress?.reward_claimed
  );

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Pull-down background */}
          <View
            style={[
              styles.pullDownBg,
              { backgroundColor: colors.isDark ? '#1a1a2e' : '#f8f9fa' },
            ]}
          />

          {/* Header */}
          <LinearGradient
            colors={colors.isDark ? ['#1a1a2e', '#000000'] : ['#f8f9fa', '#f0f0f5']}
            style={[styles.header, { paddingTop: insets.top + 16 }]}
          >
            <View style={styles.backButton}>
              <LiquidGlassBackButton onPress={() => router.back()} />
            </View>
            <View style={styles.titleRow}>
              <Text className="font-bold" style={[styles.title, { color: colors.text }]}>
                Weekly Challenges
              </Text>
            </View>
          </LinearGradient>

          {/* Skeleton Cards */}
          <View style={styles.listContainer}>
            <SkeletonChallengeCard style={{ marginBottom: 12 }} />
            <SkeletonChallengeCard style={{ marginBottom: 12 }} />
            <SkeletonChallengeCard />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.text}
          />
        }
      >
        {/* Pull-down background */}
        <View
          style={[
            styles.pullDownBg,
            { backgroundColor: colors.isDark ? '#1a1a2e' : '#f8f9fa' },
          ]}
        />

        {/* Header */}
        <LinearGradient
          colors={colors.isDark ? ['#1a1a2e', '#000000'] : ['#f8f9fa', '#f0f0f5']}
          style={[styles.header, { paddingTop: insets.top + 16 }]}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            {/* Back Button */}
            <View style={styles.backButton}>
              <LiquidGlassBackButton onPress={() => router.back()} />
            </View>

            {/* Title Row */}
            <View style={styles.titleRow}>
              <Text className="font-bold" style={[styles.title, { color: colors.text }]}>
                Weekly Challenges
              </Text>
              {stats.unclaimed > 0 && (
                <View style={[styles.unclaimedBadge, { backgroundColor: 'rgba(250, 17, 79, 0.15)' }]}>
                  <Gift size={14} color="#FA114F" />
                  <Text style={[styles.unclaimedText, { color: '#FA114F' }]}>
                    {stats.unclaimed}
                  </Text>
                </View>
              )}
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View
                style={[
                  styles.statCard,
                  { backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                ]}
              >
                <Trophy size={18} color="#FFD700" />
                <View>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {stats.completed}/{stats.total}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    Completed
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.statCard,
                  { backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                ]}
              >
                <Clock size={18} color={colors.textSecondary} />
                <View>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {getTimeRemaining(challenges[0]?.ends_at)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    Remaining
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>

        {/* Challenges List */}
        {challenges.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="trophy"
              title="No Challenges This Week"
              description="Check back Monday for new weekly challenges!"
            />
          </View>
        ) : (
          <View style={styles.listContainer}>
            {/* Active Challenges */}
            {activeChallenges.length > 0 && (
              <Animated.View entering={FadeInUp.delay(100).springify()}>
                <Text
                  className="font-semibold"
                  style={[styles.sectionTitle, { color: colors.text }]}
                >
                  Active
                </Text>
                <View style={styles.challengesList}>
                  {activeChallenges.map((challenge, index) => (
                    <ChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      onPress={handleChallengePress}
                      onClaimReward={handleClaimReward}
                      index={index}
                    />
                  ))}
                </View>
              </Animated.View>
            )}

            {/* Completed Challenges */}
            {completedChallenges.length > 0 && (
              <Animated.View
                entering={FadeInUp.delay(200).springify()}
                style={styles.completedSection}
              >
                <View style={styles.completedHeader}>
                  <Check size={18} color="#92E82A" />
                  <Text
                    className="font-semibold"
                    style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}
                  >
                    Completed
                  </Text>
                </View>
                <View style={styles.challengesList}>
                  {completedChallenges.map((challenge, index) => (
                    <ChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      onPress={handleChallengePress}
                      index={index + activeChallenges.length}
                    />
                  ))}
                </View>
              </Animated.View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Challenge Detail Sheet */}
      {selectedChallenge && (
        <ChallengeDetailSheet
          sheetRef={bottomSheetRef}
          challenge={selectedChallenge}
          onClaimReward={handleClaimReward}
          onClose={() => setSelectedChallenge(null)}
        />
      )}

      {/* Reward Claim Celebration Modal */}
      <RewardClaimCelebrationModal
        visible={showCelebration}
        onClose={handleCloseCelebration}
        rewardType={claimedReward.type}
        rewardValue={claimedReward.value}
        challengeTitle={claimedReward.title}
      />
    </View>
  );
}

// Helper function
function getTimeRemaining(endsAt: string | undefined): string {
  if (!endsAt) return '—';

  const now = new Date();
  const endDate = new Date(endsAt);
  const diffMs = endDate.getTime() - now.getTime();

  if (diffMs <= 0) return 'Ended';

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return '<1h';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
    flexGrow: 1,
  },
  pullDownBg: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    zIndex: -1,
  },
  header: {
    paddingLeft: 16,
    paddingRight: 20,
    paddingBottom: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
  },
  unclaimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  unclaimedText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 10,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  challengesList: {
    gap: 12,
  },
  completedSection: {
    marginTop: 24,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
});
