import { View, ScrollView, RefreshControl, ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { fetchCompletedCompetitions, CompletedCompetition } from '@/lib/competition-service';
import { CompletedCompetitionCard } from '@/components/CompletedCompetitionCard';
import { Archive } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

const PAGE_SIZE = 20;

export default function CompetitionHistoryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);

  const [competitions, setCompetitions] = useState<CompletedCompetition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const loadCompetitions = useCallback(async (reset: boolean = false) => {
    if (!user?.id) return;

    const currentOffset = reset ? 0 : offset;

    try {
      const { competitions: completedCompetitions, hasMore: more } = await fetchCompletedCompetitions(
        user.id,
        PAGE_SIZE,
        currentOffset
      );

      if (reset) {
        setCompetitions(completedCompetitions);
        setOffset(PAGE_SIZE);
      } else {
        setCompetitions((prev) => [...prev, ...completedCompetitions]);
        setOffset(currentOffset + PAGE_SIZE);
      }
      setHasMore(more);
    } catch (error) {
      console.error('Error loading completed competitions:', error);
    }
  }, [user?.id, offset]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await loadCompetitions(true);
      setIsLoading(false);
    };
    load();
  }, [user?.id]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadCompetitions(true);
    setIsRefreshing(false);
  }, [loadCompetitions]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    await loadCompetitions(false);
    setIsLoadingMore(false);
  }, [isLoadingMore, hasMore, loadCompetitions]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 100;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isCloseToBottom && hasMore && !isLoadingMore) {
      handleLoadMore();
    }
  }, [hasMore, isLoadingMore, handleLoadMore]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.text}
          />
        }
      >
        {/* Overscroll background */}
        <View
          style={{
            position: 'absolute',
            top: -1000,
            left: 0,
            right: 0,
            height: 1000,
            backgroundColor: colors.isDark ? '#1C1C1E' : '#E8E8ED',
          }}
        />

        {/* Header */}
        <LinearGradient
          colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#E8E8ED', colors.bg]}
          style={{
            paddingTop: 24,
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          {/* Back Button */}
          <View className="mb-4">
            <LiquidGlassBackButton onPress={() => router.back()} />
          </View>

          <Animated.View entering={FadeInDown.duration(600)}>
            <Text style={{ color: colors.text, lineHeight: 34 }} className="text-3xl font-bold">
              Competition History
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-base mt-1">
              Look back at your completed competitions
            </Text>
          </Animated.View>
        </LinearGradient>

        {/* Content */}
        <View className="px-5">
          {isLoading ? (
            <View className="py-16 items-center">
              <ActivityIndicator size="large" color="#FA114F" />
            </View>
          ) : competitions.length === 0 ? (
            <View
              className="rounded-2xl p-8 items-center"
              style={{ backgroundColor: colors.card }}
            >
              <Archive size={56} color={colors.textSecondary} />
              <Text style={{ color: colors.text }} className="text-lg font-semibold mt-4 text-center">
                No Competition History
              </Text>
              <Text style={{ color: colors.textSecondary }} className="text-center text-sm mt-2">
                Complete your first competition to see it here! Join or create a competition to get started.
              </Text>
            </View>
          ) : (
            <>
              {competitions.map((competition, index) => (
                <CompletedCompetitionCard
                  key={competition.id}
                  competition={competition}
                  index={index}
                  onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
                  userId={user?.id || ''}
                />
              ))}
              {isLoadingMore && (
                <View className="py-4 items-center">
                  <ActivityIndicator size="small" color="#FA114F" />
                </View>
              )}
              {!hasMore && competitions.length > 0 && (
                <View className="py-4 items-center">
                  <Text style={{ color: colors.textSecondary }} className="text-sm">
                    You've reached the end
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
