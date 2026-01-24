import { View, ScrollView, Pressable, Image, Dimensions } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFitnessStore, Competition } from '@/lib/fitness-store';
import { useAuthStore } from '@/lib/auth-store';
import { useFitnessStore as useFitnessStoreState } from '@/lib/fitness-store';
import { Trophy, Users, Calendar, ChevronRight, Crown, Medal, Plus, Globe } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { TripleActivityRings } from '@/components/ActivityRing';
import { useEffect } from 'react';
import { useThemeColors } from '@/lib/useThemeColors';

const { width } = Dimensions.get('window');

function getTotalDuration(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
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

  const statusColors = {
    active: { bg: '#22c55e', text: 'Active' },
    upcoming: { bg: '#3b82f6', text: 'Starting Soon' },
    completed: { bg: '#6b7280', text: 'Completed' },
  };

  const status = statusColors[competition.status];

  return (
    <Animated.View entering={FadeInDown.duration(500).delay(index * 100)}>
      <Pressable className="mb-4 active:opacity-80" onPress={onPress}>
        <LinearGradient
          colors={colors.cardGradient}
          style={{ borderRadius: 20, padding: 20 }}
        >
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
              </View>
              <Text className="text-black dark:text-white text-xl font-bold">{competition.name}</Text>
              <Text className="text-gray-600 dark:text-gray-400 text-sm mt-1">{competition.description}</Text>
            </View>
            {userRank > 0 && competition.status === 'active' && (
              <View className="bg-fitness-accent/20 px-4 py-2 rounded-xl items-center">
                <Text className="text-fitness-accent text-xs">Your Rank</Text>
                <Text className="text-black dark:text-white text-xl font-bold">#{userRank}</Text>
              </View>
            )}
          </View>

          {/* Leaderboard Preview */}
          <View style={{ backgroundColor: colors.isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)' }} className="rounded-xl p-4 mb-4">
            <Text className="text-gray-500 dark:text-gray-400 text-sm mb-3 font-medium">Leaderboard</Text>
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
          </View>

          {/* Footer */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Calendar size={16} color="#6b7280" />
              <Text className="text-gray-400 dark:text-gray-500 text-sm ml-2">
                {new Date(competition.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                {new Date(competition.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Users size={16} color="#6b7280" />
              <Text className="text-gray-400 dark:text-gray-500 text-sm ml-2">
                {competition.participants.length} {competition.participants.length === 1 ? 'person' : 'people'}
              </Text>
            </View>
          </View>
        </LinearGradient>
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
  const authUser = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Load competitions from Supabase when component mounts and user is authenticated
  useEffect(() => {
    if (isAuthenticated && authUser?.id) {
      fetchUserCompetitions(authUser.id);
    }
  }, [isAuthenticated, authUser?.id, fetchUserCompetitions]); // Only run when auth state changes

  const activeCompetitions = competitions.filter((c) => c.status === 'active');
  const upcomingCompetitions = competitions.filter((c) => c.status === 'upcoming');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
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
          <Animated.View entering={FadeInDown.duration(600)}>
            <Text className="text-black dark:text-white text-3xl font-bold">Competitions</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-base mt-1">Compete with friends & groups</Text>
          </Animated.View>
        </View>

        {/* Create Competition Button */}
        <Animated.View entering={FadeInRight.duration(600).delay(100)} className="px-5 mb-3">
          <Pressable
            onPress={() => router.push('/create-competition')}
            className="active:opacity-80"
          >
            <LinearGradient
              colors={['#FA114F', '#D10040']}
              style={{ borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus size={20} color="white" strokeWidth={2.5} />
              <Text className="text-white text-lg font-semibold ml-2">Create Competition</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* Discover Public Competitions Button */}
        <Animated.View entering={FadeInRight.duration(600).delay(150)} className="px-5 mb-6">
          <Pressable
            onPress={() => router.push('/discover-competitions')}
            className="active:opacity-80"
          >
            <View
              style={{
                borderRadius: 16,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: colors.isDark ? 'rgba(250, 17, 79, 0.5)' : 'rgba(250, 17, 79, 0.3)',
                backgroundColor: colors.isDark ? 'rgba(250, 17, 79, 0.1)' : 'rgba(250, 17, 79, 0.05)',
              }}
            >
              <Globe size={20} color="#FA114F" strokeWidth={2.5} />
              <Text style={{ color: '#FA114F' }} className="text-lg font-semibold ml-2">Discover Public Competitions</Text>
            </View>
          </Pressable>
        </Animated.View>

        {/* Active Competitions */}
        {activeCompetitions.length > 0 && (
          <View className="px-5 mb-6">
            <Text className="text-black dark:text-white text-xl font-semibold mb-4">Active</Text>
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

        {/* Upcoming Competitions */}
        {upcomingCompetitions.length > 0 && (
          <View className="px-5">
            <Text className="text-black dark:text-white text-xl font-semibold mb-4">Coming Up</Text>
            {upcomingCompetitions.map((competition, index) => (
              <CompetitionCard
                key={competition.id}
                competition={competition}
                index={index + activeCompetitions.length}
                onPress={() => router.push(`/competition-detail?id=${competition.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
