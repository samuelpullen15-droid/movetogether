import { View, ScrollView, Pressable, Image, Dimensions } from 'react-native';
import { Text, DisplayText } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFitnessStore, Competition } from '@/lib/fitness-store';
import { useAuthStore } from '@/lib/auth-store';
import { useFitnessStore as useFitnessStoreState } from '@/lib/fitness-store';
import { getUserCompetitionState } from '@/lib/competition-service';
import { Trophy, Users, Calendar, ChevronRight, Crown, Medal, Plus, Globe, Archive, Star, ShoppingBag } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { sectionEnter, cardEnter, statEnter } from '@/lib/animations';
import { TripleActivityRings } from '@/components/ActivityRing';
import { LiquidGlassIconButton } from '@/components/LiquidGlassIconButton';
import { SkeletonCompetitionCard } from '@/components/SkeletonLoader';
import { EmptyState } from '@/components/EmptyState';
import { Card } from '@/components/Card';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Trophy as TrophyIcon } from 'lucide-react-native';
import { useEffect, useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useThemeColors } from '@/lib/useThemeColors';

const { width } = Dimensions.get('window');

/**
 * Parse a date string (YYYY-MM-DD) as a local date, not UTC.
 * This prevents the date from shifting to the previous day in timezones west of UTC.
 */
function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getTotalDuration(startDate: string, endDate: string): number {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
}

function getCompetitionTypeLabel(type: string, startDate: string, endDate: string): string {
  if (type === 'custom') {
    const days = getTotalDuration(startDate, endDate);
    return `${days} Days`;
  }
  // Capitalize first letter for weekend, weekly, monthly
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function CompetitionCard({ competition, index, onPress }: { competition: Competition; index: number; onPress: () => void }) {
  const colors = useThemeColors();
  const currentUser = useFitnessStore((s) => s.currentUser);
  const authUser = useAuthStore((s) => s.user);
  // Use auth user ID if available, otherwise fall back to fitness store currentUser ID
  const userId = authUser?.id || currentUser.id;
  const sortedParticipants = [...competition.participants].sort((a, b) => b.points - a.points);
  const userRank = sortedParticipants.findIndex((p) => p.id === userId) + 1;

  // Team competition data
  const isTeamComp = competition.isTeamCompetition || false;
  const teams = competition.teams || [];
  const sortedTeams = [...teams].sort((a, b) => b.avgPoints - a.avgPoints);
  const userParticipant = sortedParticipants.find((p) => p.id === userId);
  const userTeamId = userParticipant?.teamId || null;
  const userTeamRank = userTeamId ? sortedTeams.findIndex((t) => t.id === userTeamId) + 1 : 0;

  const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: '#22c55e', text: 'Active' },
    upcoming: { bg: '#3b82f6', text: 'Starting Soon' },
    completed: { bg: '#6b7280', text: 'Completed' },
    locked: { bg: '#EAB308', text: 'Score Locked' },
  };

  // Get the user's local competition state (accounts for local midnight and score locking)
  const userLocalState = getUserCompetitionState(competition.startDate, competition.endDate, competition.status);
  const isScoreLocked = userLocalState === 'locked';

  // Use locked status badge if user's local midnight has passed
  const displayStatus = isScoreLocked ? 'locked' : competition.status;
  const status = statusColors[displayStatus];

  return (
    <Animated.View entering={cardEnter(index)}>
      <Pressable className="mb-4 active:scale-[0.98]" onPress={onPress}>
        <Card variant="surface" radius={20}>
          {/* Seasonal event accent stripe */}
          {competition.isSeasonalEvent && competition.eventTheme && (
            <LinearGradient
              colors={[competition.eventTheme.color, competition.eventTheme.secondaryColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
            />
          )}
          {/* Header */}
          <View className="flex-row justify-between items-start mb-4">
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
                <Text className="text-gray-400 dark:text-gray-500 text-xs">
                  {getCompetitionTypeLabel(competition.type, competition.startDate, competition.endDate)}
                </Text>
                {competition.isTeamCompetition && (
                  <View className="px-2 py-1 rounded-full ml-2" style={{ backgroundColor: '#8B5CF620' }}>
                    <Text style={{ color: '#8B5CF6' }} className="text-xs font-medium">
                      Teams
                    </Text>
                  </View>
                )}
                {competition.hasPrizePool && (
                  <View className="px-2 py-1 rounded-full ml-2 flex-row items-center" style={{ backgroundColor: competition.poolType === 'buy_in' ? '#F59E0B20' : '#FFD70020' }}>
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
                {competition.isSeasonalEvent && competition.eventTheme && (
                  <View className="px-2 py-1 rounded-full ml-2 flex-row items-center" style={{ backgroundColor: competition.eventTheme.color + '20' }}>
                    <Text style={{ fontSize: 12 }}>{competition.eventTheme.emoji}</Text>
                    <Text style={{ color: competition.eventTheme.color }} className="text-xs font-medium ml-1">
                      Event
                    </Text>
                  </View>
                )}
              </View>
              <DisplayText className="text-black dark:text-white text-xl font-bold">{competition.name}</DisplayText>
              <Text className="text-gray-600 dark:text-gray-400 text-sm mt-1">{competition.description}</Text>
            </View>
            {(competition.status === 'active' || isScoreLocked) && (
              isTeamComp && userTeamRank > 0 ? (
                <View className="px-4 py-2 rounded-xl items-center" style={{ backgroundColor: '#8B5CF620' }}>
                  <Text style={{ color: '#8B5CF6' }} className="text-xs">Your Team</Text>
                  <Text className="text-black dark:text-white text-xl font-bold">#{userTeamRank}</Text>
                </View>
              ) : !isTeamComp && userRank > 0 ? (
                <View className="bg-fitness-accent/20 px-4 py-2 rounded-xl items-center">
                  <Text className="text-fitness-accent text-xs">Your Rank</Text>
                  <Text className="text-black dark:text-white text-xl font-bold">#{userRank}</Text>
                </View>
              ) : null
            )}
          </View>

          {/* Leaderboard Preview */}
          <View style={{ backgroundColor: colors.isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)' }} className="rounded-xl p-4 mb-4">
            <Text className="text-gray-500 dark:text-gray-400 text-sm mb-3 font-medium">
              {isTeamComp ? 'Team Standings' : 'Leaderboard'}
            </Text>
            {isTeamComp && sortedTeams.length > 0 ? (
              <>
                {sortedTeams.map((team, i) => (
                  <View
                    key={team.id}
                    className="flex-row items-center py-2"
                    style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                  >
                    <View className="w-8 items-center">
                      <Text className="text-black dark:text-white font-bold">#{i + 1}</Text>
                    </View>
                    <Text style={{ fontSize: 22, marginLeft: 4 }}>{team.emoji}</Text>
                    <View className="flex-1 ml-3">
                      <Text
                        className="font-medium text-black dark:text-white"
                        style={team.id === userTeamId ? { color: '#8B5CF6' } : undefined}
                      >
                        {team.name}
                        {team.id === userTeamId && ' (You)'}
                      </Text>
                      <Text className="text-gray-400 dark:text-gray-500 text-xs">
                        {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                      </Text>
                    </View>
                    <Text className="text-black dark:text-white font-bold">{team.avgPoints.toLocaleString()}</Text>
                    <Text className="text-gray-400 dark:text-gray-500 text-xs ml-1">avg</Text>
                  </View>
                ))}
              </>
            ) : (
              <>
                {sortedParticipants.slice(0, 3).map((participant, i) => (
                  <View
                    key={participant.id}
                    className="flex-row items-center py-2"
                    style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                  >
                    <View className="w-8 items-center">
                      {i === 0 ? (
                        <Crown size={18} color="#FFD700" />
                      ) : i === 1 ? (
                        <Medal size={18} color="#C0C0C0" />
                      ) : (
                        <Medal size={18} color="#CD7F32" />
                      )}
                    </View>
                    <Image
                      source={{ uri: participant.avatar }}
                      className="w-8 h-8 rounded-full ml-2"
                    />
                    <View className="flex-1 ml-3">
                      <Text
                        className={`font-medium ${
                          participant.id === userId ? 'text-fitness-accent' : 'text-black dark:text-white'
                        }`}
                      >
                        {participant.name}
                        {participant.id === userId && ' (You)'}
                      </Text>
                    </View>
                    <View className="items-center mr-3">
                      <TripleActivityRings
                        size={36}
                        moveProgress={participant.moveProgress}
                        exerciseProgress={participant.exerciseProgress}
                        standProgress={participant.standProgress}
                      />
                    </View>
                    <Text className="text-black dark:text-white font-bold">{participant.points}</Text>
                    <Text className="text-gray-400 dark:text-gray-500 text-xs ml-1">pts</Text>
                  </View>
                ))}
                {sortedParticipants.length > 3 && (
                  <View style={{ borderTopColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} className="flex-row items-center justify-center mt-3 pt-3 border-t">
                    <Text className="text-gray-400 dark:text-gray-500 text-sm">
                      +{sortedParticipants.length - 3} more participants
                    </Text>
                    <ChevronRight size={16} color="#6b7280" />
                  </View>
                )}
              </>
            )}
          </View>

          {/* Footer */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Calendar size={16} color="#6b7280" />
              <Text className="text-gray-400 dark:text-gray-500 text-sm ml-2">
                {parseLocalDate(competition.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                {parseLocalDate(competition.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Users size={16} color="#6b7280" />
              <Text className="text-gray-400 dark:text-gray-500 text-sm ml-2">
                {competition.participants.length} {competition.participants.length === 1 ? 'person' : 'people'}
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>
    </Animated.View>
  );
}

export default function CompetitionsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const competitions = useFitnessStore((s) => s.competitions);
  const fetchUserCompetitions = useFitnessStore((s) => s.fetchUserCompetitions);
  const isFetchingCompetitions = useFitnessStore((s) => s.isFetchingCompetitions);
  const authUser = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Track if initial load has completed (to distinguish loading vs empty state)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Load competitions from Supabase when screen gains focus and user is authenticated
  // This ensures data is fresh after syncing in competition-detail
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && authUser?.id) {
        fetchUserCompetitions(authUser.id).then(() => {
          if (!hasLoadedOnce) setHasLoadedOnce(true);
        });
      }
    }, [isAuthenticated, authUser?.id, fetchUserCompetitions, hasLoadedOnce])
  );

  // Show skeletons on initial load when we have no data yet
  const showSkeletons = isFetchingCompetitions && !hasLoadedOnce && competitions.length === 0;

  // Separate seasonal events from regular competitions for featured promotion
  const seasonalEvents = competitions.filter((c) => c.isSeasonalEvent);

  // Use local state (not just DB status) to correctly categorize competitions.
  // DB status stays 'active' until a server-side cron processes it, but locally
  // we can detect the competition has ended based on the end date vs local midnight.
  // Exclude seasonal events from regular lists — they get their own featured section.
  const activeCompetitions = competitions.filter((c) => {
    if (c.isSeasonalEvent) return false;
    const localState = getUserCompetitionState(c.startDate, c.endDate, c.status);
    return localState === 'active';
  });
  const endedCompetitions = competitions.filter((c) => {
    if (c.isSeasonalEvent) return false;
    const localState = getUserCompetitionState(c.startDate, c.endDate, c.status);
    return localState === 'locked';
  });
  // Show recently completed competitions (within last 3 days) so they don't
  // vanish from the compete tab the moment the server marks them completed.
  // After 3 days they only appear in the competition history.
  const recentlyCompletedCompetitions = competitions.filter((c) => {
    if (c.isSeasonalEvent) return false;
    if (c.status !== 'completed') return false;
    const endDate = parseLocalDate(c.endDate);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    threeDaysAgo.setHours(0, 0, 0, 0);
    return endDate >= threeDaysAgo;
  });
  const upcomingCompetitions = competitions.filter((c) => !c.isSeasonalEvent && c.status === 'upcoming');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBackground accent="#FA114F" />
      {/* Background Layer - Positioned to fill screen with extra coverage */}
      <Image
        source={require('../../../assets/AppCompetitionScreen.png')}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: width,
          height: width,
        }}
        resizeMode="cover"
      />
      {/* Fill color below image to handle scroll bounce */}
      <View
        style={{
          position: 'absolute',
          top: width,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bg,
        }}
        pointerEvents="none"
      />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}>
          <View className="flex-row justify-between items-start">
            <Animated.View entering={sectionEnter} style={{ flex: 1 }}>
              <DisplayText className="text-black dark:text-white text-3xl font-bold">Compete</DisplayText>
              <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">Challenge friends & groups</Text>
            </Animated.View>
            <View style={{ flexDirection: 'row', gap: 22, marginTop: 10, marginRight: 8 }}>
              {/* Store Icon Button */}
              <LiquidGlassIconButton
                onPress={() => router.push('/store')}
                iconName="bag"
                icon={<ShoppingBag size={22} color="#FFD700" strokeWidth={2} />}
                size={35}
                iconSize={25}
              />
              {/* History Icon Button */}
              <LiquidGlassIconButton
                onPress={() => router.push('/competition-history')}
                iconName="archivebox"
                icon={<Archive size={22} color={colors.textSecondary} strokeWidth={2} />}
                size={35}
                iconSize={25}
              />
            </View>
          </View>
        </View>

        {/* Action Buttons Row */}
        <Animated.View entering={statEnter(100)} className="px-5 mb-6">
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {/* Create Competition Button */}
            <Pressable
              onPress={() => router.push('/create-competition')}
              className="active:opacity-80"
              style={{ flex: 1 }}
            >
              <LinearGradient
                colors={['#FA114F', '#D10040']}
                style={{ borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={18} color="white" strokeWidth={2.5} />
                <Text className="text-white text-base font-semibold ml-2">Create</Text>
              </LinearGradient>
            </Pressable>

            {/* Discover Public Competitions Button */}
            <Pressable
              onPress={() => router.push('/discover-competitions')}
              className="active:opacity-80"
              style={{ flex: 1 }}
            >
              <View
                style={{
                  borderRadius: 16,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.card,
                }}
              >
                <Globe size={18} color="#FA114F" strokeWidth={2} />
                <Text style={{ color: '#FA114F' }} className="text-base font-semibold ml-2">Discover</Text>
              </View>
            </Pressable>
          </View>
        </Animated.View>

        {/* Skeleton Loading State */}
        {showSkeletons && (
          <View className="px-5 mb-6">
            <Text className="text-black dark:text-white text-xl font-semibold mb-4">Loading...</Text>
            <SkeletonCompetitionCard style={{ marginBottom: 16 }} />
            <SkeletonCompetitionCard style={{ marginBottom: 16 }} />
            <SkeletonCompetitionCard />
          </View>
        )}

        {/* Empty State - No Competitions */}
        {!showSkeletons &&
          hasLoadedOnce &&
          seasonalEvents.length === 0 &&
          activeCompetitions.length === 0 &&
          endedCompetitions.length === 0 &&
          recentlyCompletedCompetitions.length === 0 &&
          upcomingCompetitions.length === 0 && (
            <EmptyState
              icon={TrophyIcon}
              iconColor="#FFD700"
              atmosphereWord="COMPETE"
              title="No Competitions Yet"
              description="Create a competition and challenge your friends to see who can stay the most active!"
              actionLabel="Create Competition"
              onAction={() => router.push('/create-competition')}
              secondaryActionLabel="Discover Public"
              onSecondaryAction={() => router.push('/discover-competitions')}
            />
          )}

        {/* Featured Seasonal Events */}
        {!showSkeletons && seasonalEvents.length > 0 && (
          <View className="px-5 mb-6">
            <View className="flex-row items-center mb-4">
              <Star size={20} color="#F59E0B" fill="#F59E0B" />
              <DisplayText className="text-black dark:text-white text-xl font-bold ml-2">Featured Event</DisplayText>
            </View>
            {seasonalEvents.map((event, index) => {
              const theme = event.eventTheme;
              const primaryColor = theme?.color || '#FA114F';
              const secondaryColor = theme?.secondaryColor || '#FF6B9D';
              const endDateParts = (event.endDate.includes('T') ? event.endDate.split('T')[0] : event.endDate).split('-').map(Number);
              const endLocal = new Date(endDateParts[0], endDateParts[1] - 1, endDateParts[2], 23, 59, 59, 999);
              const daysLeft = Math.max(0, Math.ceil((endLocal.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              const sortedParticipants = [...event.participants].sort((a, b) => b.points - a.points);
              const userId = authUser?.id;
              const userRank = userId ? sortedParticipants.findIndex((p) => p.id === userId) + 1 : 0;

              return (
                <Animated.View key={event.id} entering={statEnter(index * 100 + 100)}>
                  <Pressable
                    className="mb-4 active:opacity-80"
                    onPress={() => router.push(`/competition-detail?id=${event.id}`)}
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
                          <DisplayText className="text-white text-xl font-bold">{event.name}</DisplayText>
                          {theme?.tagline && (
                            <Text className="text-white/80 text-sm mt-1">{theme.tagline}</Text>
                          )}
                        </View>
                        {userRank > 0 && (
                          <View className="px-4 py-2 rounded-xl items-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                            <Text className="text-white/80 text-xs">Your Rank</Text>
                            <Text className="text-white text-xl font-bold">#{userRank}</Text>
                          </View>
                        )}
                      </View>

                      {/* Description */}
                      {event.description && (
                        <Text className="text-white/70 text-sm mb-3" numberOfLines={2}>
                          {event.description}
                        </Text>
                      )}

                      {/* Info row */}
                      <View
                        className="rounded-xl p-3 flex-row items-center justify-between"
                        style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                      >
                        <View className="flex-row items-center">
                          <Calendar size={14} color="rgba(255,255,255,0.8)" />
                          <Text className="text-white/80 text-xs ml-1">
                            {daysLeft > 0
                              ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`
                              : 'Ending today'}
                          </Text>
                        </View>
                        <View className="flex-row items-center">
                          <Users size={14} color="rgba(255,255,255,0.8)" />
                          <Text className="text-white/80 text-xs ml-1">
                            {event.participants.length} competing
                          </Text>
                        </View>
                      </View>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* Active Competitions */}
        {!showSkeletons && activeCompetitions.length > 0 && (
          <View className="px-5 mb-6">
            <DisplayText className="text-black dark:text-white text-xl font-semibold mb-4">Active</DisplayText>
            {activeCompetitions.map((competition, index) => (
              <CompetitionCard
                key={competition.id}
                competition={competition}
                index={index}
                onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
              />
            ))}
          </View>
        )}

        {/* Ended Competitions (calculating results) */}
        {!showSkeletons && endedCompetitions.length > 0 && (
          <View className="px-5 mb-6">
            <DisplayText className="text-black dark:text-white text-xl font-semibold mb-4">Calculating Results</DisplayText>
            {endedCompetitions.map((competition, index) => (
              <CompetitionCard
                key={competition.id}
                competition={competition}
                index={index + activeCompetitions.length}
                onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
              />
            ))}
          </View>
        )}

        {/* Recently Completed Competitions */}
        {!showSkeletons && recentlyCompletedCompetitions.length > 0 && (
          <View className="px-5 mb-6">
            <DisplayText className="text-black dark:text-white text-xl font-semibold mb-4">Completed</DisplayText>
            {recentlyCompletedCompetitions.map((competition, index) => (
              <CompetitionCard
                key={competition.id}
                competition={competition}
                index={index + activeCompetitions.length + endedCompetitions.length}
                onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
              />
            ))}
          </View>
        )}

        {/* Upcoming Competitions */}
        {!showSkeletons && upcomingCompetitions.length > 0 && (
          <View className="px-5">
            <DisplayText className="text-black dark:text-white text-xl font-semibold mb-4">Coming Up</DisplayText>
            {upcomingCompetitions.map((competition, index) => (
              <CompetitionCard
                key={competition.id}
                competition={competition}
                index={index + activeCompetitions.length + endedCompetitions.length + recentlyCompletedCompetitions.length}
                onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
