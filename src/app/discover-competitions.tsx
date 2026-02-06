import { View, ScrollView, Pressable, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { useFitnessStore } from '@/lib/fitness-store';
import { fetchPublicCompetitions, joinPublicCompetition, joinPublicCompetitionWithoutBuyIn, PublicCompetition } from '@/lib/competition-service';
import { competitionApi, type SeasonalEvent } from '@/lib/edge-functions';
import { Globe, Calendar, Users, Trophy, Star } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BottomSheetMethods } from '@gorhom/bottom-sheet';
import { BuyInPaymentSheet } from '@/components/BuyInPaymentSheet';
import { BuyInChoiceSheet } from '@/components/BuyInChoiceSheet';

/**
 * Parse a date string (YYYY-MM-DD) as a local date, not UTC.
 * This prevents the date from shifting to the previous day in timezones west of UTC.
 */
function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getCompetitionTypeLabel(type: string, startDate: string, endDate: string): string {
  if (type === 'custom') {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return `${days} Days`;
  }
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function PublicCompetitionCard({
  competition,
  index,
  onJoin,
  isJoining,
  colors,
}: {
  competition: PublicCompetition;
  index: number;
  onJoin: () => void;
  isJoining: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const statusColors = {
    active: { bg: '#22c55e', text: 'Active' },
    upcoming: { bg: '#3b82f6', text: 'Starting Soon' },
  };

  const status = statusColors[competition.status];

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(index * 100)}>
      <View className="mb-4">
        <LinearGradient
          colors={colors.cardGradient}
          style={{ borderRadius: 20, padding: 20 }}
        >
          {/* Header */}
          <View className="flex-row justify-between items-start mb-3">
            <View className="flex-1">
              <View className="flex-row items-center mb-2">
                <View
                  className="px-2 py-1 rounded-full mr-2"
                  style={{ backgroundColor: status.bg + '30' }}
                >
                  <Text style={{ color: status.bg }} className="text-xs font-medium">
                    {status.text}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Globe size={12} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary }} className="text-xs ml-1">
                    Public
                  </Text>
                </View>
                <Text style={{ color: colors.textSecondary }} className="text-xs ml-2">
                  {getCompetitionTypeLabel(competition.type, competition.startDate, competition.endDate)}
                </Text>
                {competition.isTeamCompetition && (
                  <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: '#8B5CF620' }}>
                    <Text style={{ color: '#8B5CF6' }} className="text-xs font-medium">
                      {competition.teamCount} Teams
                    </Text>
                  </View>
                )}
                {competition.hasPrizePool && (
                  <View className="px-2 py-0.5 rounded-full ml-2 flex-row items-center" style={{ backgroundColor: competition.poolType === 'buy_in' ? '#F59E0B20' : '#FFD70020' }}>
                    <Trophy size={10} color={competition.poolType === 'buy_in' ? '#F59E0B' : '#DAA520'} />
                    <Text style={{ color: competition.poolType === 'buy_in' ? '#F59E0B' : '#DAA520' }} className="text-xs font-medium ml-1">
                      {competition.poolType === 'buy_in' && competition.buyInAmount
                        ? `$${competition.buyInAmount} Buy-In`
                        : competition.prizePoolAmount != null
                          ? `$${competition.prizePoolAmount} Prize`
                          : 'Prize Pool'}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ color: colors.text }} className="text-xl font-bold">
                {competition.name}
              </Text>
              {competition.description && (
                <Text style={{ color: colors.textSecondary }} className="text-sm mt-1">
                  {competition.description}
                </Text>
              )}
            </View>
          </View>

          {/* Info Row */}
          <View
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Calendar size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary }} className="text-sm ml-2">
                  {parseLocalDate(competition.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                  {parseLocalDate(competition.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Users size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary }} className="text-sm ml-2">
                  {competition.participantCount} {competition.participantCount === 1 ? 'person' : 'people'}
                </Text>
              </View>
            </View>
          </View>

          {/* Join Button */}
          <Pressable
            onPress={onJoin}
            disabled={isJoining}
            className="active:opacity-80"
          >
            <LinearGradient
              colors={isJoining ? ['#6b7280', '#4b5563'] : ['#FA114F', '#D10040']}
              style={{ borderRadius: 12, padding: 14, alignItems: 'center' }}
            >
              {isJoining ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white text-base font-semibold">
                  Join Competition
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

export default function DiscoverCompetitionsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const fetchUserCompetitions = useFitnessStore((s) => s.fetchUserCompetitions);

  const [competitions, setCompetitions] = useState<PublicCompetition[]>([]);
  const [seasonalEvents, setSeasonalEvents] = useState<SeasonalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  const buyInSheetRef = useRef<BottomSheetMethods>(null);
  const choiceSheetRef = useRef<BottomSheetMethods>(null);
  const [buyInData, setBuyInData] = useState<{
    competitionId: string;
    competitionName: string;
    buyInAmount: number;
  } | null>(null);
  const [choiceData, setChoiceData] = useState<{
    competitionId: string;
    competitionName: string;
    buyInAmount: number;
  } | null>(null);

  const loadCompetitions = useCallback(async () => {
    if (!user?.id) return;

    try {
      const [publicResult, seasonalResult] = await Promise.all([
        fetchPublicCompetitions(user.id),
        competitionApi.getSeasonalEvents(),
      ]);
      setCompetitions(publicResult.competitions);
      if (seasonalResult.data) {
        setSeasonalEvents(seasonalResult.data);
      }
    } catch (error) {
      console.error('Error loading competitions:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await loadCompetitions();
      setIsLoading(false);
    };
    load();
  }, [loadCompetitions]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadCompetitions();
    setIsRefreshing(false);
  }, [loadCompetitions]);

  const handleJoin = async (competitionId: string) => {
    if (!user?.id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningId(competitionId);

    try {
      const result = await joinPublicCompetition(competitionId, user.id);

      if (result.requiresBuyIn && result.buyInAmount) {
        // Competition requires buy-in — show choice sheet (pay or join without)
        const comp = competitions.find((c) => c.id === competitionId);
        setChoiceData({
          competitionId,
          competitionName: comp?.name || 'Competition',
          buyInAmount: result.buyInAmount,
        });
        choiceSheetRef.current?.snapToIndex(0);
        return;
      }

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Remove from list
        setCompetitions((prev) => prev.filter((c) => c.id !== competitionId));
        // Refresh user's competitions
        fetchUserCompetitions(user.id);

        // For team competitions, navigate to detail so user can pick a team
        const joinedComp = competitions.find((c) => c.id === competitionId);
        if (joinedComp?.isTeamCompetition) {
          router.push(`/competition-detail?id=${competitionId}`);
        } else {
          Alert.alert('Success', 'You have joined the competition!');
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to join competition');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to join competition');
    } finally {
      setJoiningId(null);
    }
  };

  const handleBuyInSuccess = useCallback(() => {
    if (buyInData) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCompetitions((prev) => prev.filter((c) => c.id !== buyInData.competitionId));
      fetchUserCompetitions(user?.id || '');
      Alert.alert('Success', 'Payment complete! You have joined the competition.');
      setBuyInData(null);
    }
  }, [buyInData, fetchUserCompetitions, user?.id]);

  const handlePayToJoin = useCallback(() => {
    if (choiceData) {
      choiceSheetRef.current?.close();
      setBuyInData(choiceData);
      setTimeout(() => buyInSheetRef.current?.snapToIndex(0), 300);
    }
  }, [choiceData]);

  const handleJoinWithout = useCallback(async () => {
    if (!choiceData || !user?.id) return;
    const result = await joinPublicCompetitionWithoutBuyIn(choiceData.competitionId, user.id);
    choiceSheetRef.current?.close();
    setChoiceData(null);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCompetitions((prev) => prev.filter((c) => c.id !== choiceData.competitionId));
      fetchUserCompetitions(user.id);
      Alert.alert('Joined!', 'You joined without the prize pool. You can opt in later from the competition page.');
    } else {
      Alert.alert('Error', result.error || 'Failed to join competition');
    }
  }, [choiceData, user?.id, fetchUserCompetitions]);

  const handleJoinEvent = async (eventId: string) => {
    if (!user?.id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningEventId(eventId);

    try {
      const { error } = await competitionApi.joinSeasonalEvent(eventId);
      if (!error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSeasonalEvents((prev) =>
          prev.map((e) =>
            e.id === eventId
              ? { ...e, user_joined: true, participant_count: e.participant_count + 1 }
              : e
          )
        );
        fetchUserCompetitions(user.id);
        Alert.alert('Success', 'You have joined the event!');
      } else {
        Alert.alert('Error', 'Failed to join event');
      }
    } catch {
      Alert.alert('Error', 'Failed to join event');
    } finally {
      setJoiningEventId(null);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
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
            backgroundColor: colors.isDark ? '#1C1C1E' : '#E3F2FD',
          }}
        />

        {/* Header */}
        <LinearGradient
          colors={colors.isDark ? ['#1C1C1E', colors.bg] : ['#E3F2FD', colors.bg]}
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
              Discover Competitions
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-base mt-1">
              Join public competitions and compete with people around the world!
            </Text>
          </Animated.View>
        </LinearGradient>

        {/* Featured Events */}
        {seasonalEvents.length > 0 && (
          <View className="px-5 mb-6">
            <View className="flex-row items-center mb-4">
              <Star size={20} color="#F59E0B" fill="#F59E0B" />
              <Text style={{ color: colors.text }} className="text-xl font-bold ml-2">
                Featured Events
              </Text>
            </View>
            {seasonalEvents.map((event, index) => {
              const theme = event.event_theme;
              const primaryColor = theme?.color || '#FA114F';
              const secondaryColor = theme?.secondaryColor || '#FF6B9D';
              const startDate = parseLocalDate(event.start_date);
              const endDate = parseLocalDate(event.end_date);
              const now = new Date();
              const isActive = event.status === 'active';
              const daysLeft = isActive
                ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
                : Math.max(0, Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

              return (
                <Animated.View
                  key={event.id}
                  entering={FadeInDown.duration(500).delay(index * 100)}
                >
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/competition-detail?id=${event.id}`);
                    }}
                    className="mb-4"
                  >
                    <LinearGradient
                      colors={[primaryColor, secondaryColor]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ borderRadius: 20, padding: 20 }}
                    >
                      {/* Header */}
                      <View className="flex-row items-center mb-2">
                        {theme?.emoji && (
                          <Text style={{ fontSize: 28, marginRight: 10 }}>{theme.emoji}</Text>
                        )}
                        <View className="flex-1">
                          <Text className="text-white text-xl font-bold">{event.name}</Text>
                          {theme?.tagline && (
                            <Text className="text-white/80 text-sm mt-1">{theme.tagline}</Text>
                          )}
                        </View>
                      </View>

                      {/* Description */}
                      {event.description && (
                        <Text className="text-white/70 text-sm mb-3" numberOfLines={2}>
                          {event.description}
                        </Text>
                      )}

                      {/* Info row */}
                      <View
                        className="rounded-xl p-3 mb-3 flex-row items-center justify-between"
                        style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                      >
                        <View className="flex-row items-center">
                          <Calendar size={14} color="rgba(255,255,255,0.8)" />
                          <Text className="text-white/80 text-xs ml-1">
                            {isActive
                              ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`
                              : `Starts in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                          </Text>
                        </View>
                        <View className="flex-row items-center">
                          <Users size={14} color="rgba(255,255,255,0.8)" />
                          <Text className="text-white/80 text-xs ml-1">
                            {event.participant_count} competing
                          </Text>
                        </View>
                      </View>

                      {/* Reward teaser */}
                      {theme?.rewardDescription && (
                        <Text className="text-white/70 text-xs text-center mb-3">
                          {theme.rewardDescription}
                        </Text>
                      )}

                      {/* CTA */}
                      {event.user_joined ? (
                        <View
                          className="rounded-xl py-3 items-center"
                          style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
                        >
                          <Text className="text-white text-sm font-semibold">View Leaderboard</Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            handleJoinEvent(event.id);
                          }}
                          disabled={joiningEventId === event.id}
                        >
                          <View
                            className="rounded-xl py-3 items-center"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.95)',
                              opacity: joiningEventId === event.id ? 0.7 : 1,
                            }}
                          >
                            {joiningEventId === event.id ? (
                              <ActivityIndicator size="small" color={primaryColor} />
                            ) : (
                              <Text style={{ color: primaryColor }} className="text-sm font-semibold">
                                Join Challenge
                              </Text>
                            )}
                          </View>
                        </Pressable>
                      )}
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* Public Competitions */}
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
              <Globe size={56} color={colors.textSecondary} />
              <Text style={{ color: colors.text }} className="text-lg font-semibold mt-4 text-center">
                No Public Competitions
              </Text>
              <Text style={{ color: colors.textSecondary }} className="text-center text-sm mt-2">
                There are no public competitions available right now. Check back later or create your own!
              </Text>
              <Pressable
                onPress={() => {
                  router.back();
                  setTimeout(() => router.push('/create-competition?public=true'), 100);
                }}
                className="mt-6 active:opacity-80"
              >
                <LinearGradient
                  colors={['#FA114F', '#D10040']}
                  style={{ borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                >
                  <Text className="text-white font-semibold">Create Competition</Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            competitions.map((competition, index) => (
              <PublicCompetitionCard
                key={competition.id}
                competition={competition}
                index={index}
                onJoin={() => handleJoin(competition.id)}
                isJoining={joiningId === competition.id}
                colors={colors}
              />
            ))
          )}
        </View>
      </ScrollView>

      {choiceData && (
        <BuyInChoiceSheet
          sheetRef={choiceSheetRef}
          competitionName={choiceData.competitionName}
          buyInAmount={choiceData.buyInAmount}
          onPayToJoin={handlePayToJoin}
          onJoinWithout={handleJoinWithout}
          onCancel={() => setChoiceData(null)}
        />
      )}

      {buyInData && (
        <BuyInPaymentSheet
          sheetRef={buyInSheetRef}
          competitionId={buyInData.competitionId}
          competitionName={buyInData.competitionName}
          buyInAmount={buyInData.buyInAmount}
          onSuccess={handleBuyInSuccess}
          onCancel={() => setBuyInData(null)}
        />
      )}
    </View>
  );
}
