import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFitnessStore, Competition } from '@/lib/fitness-store';
import { useAuthStore } from '@/lib/auth-store';
import { useFitnessStore as useFitnessStoreState } from '@/lib/fitness-store';
import { Trophy, Users, Calendar, ChevronRight, Crown, Medal, Plus } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { TripleActivityRings } from '@/components/ActivityRing';
import { useEffect } from 'react';

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
          colors={['#1C1C1E', '#0D0D0D']}
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
                <Text className="text-gray-500 text-xs">
                  {getCompetitionTypeLabel(competition.type, competition.startDate, competition.endDate)}
                </Text>
              </View>
              <Text className="text-white text-xl font-bold">{competition.name}</Text>
              <Text className="text-gray-400 text-sm mt-1">{competition.description}</Text>
            </View>
            {userRank > 0 && competition.status === 'active' && (
              <View className="bg-fitness-accent/20 px-4 py-2 rounded-xl items-center">
                <Text className="text-fitness-accent text-xs">Your Rank</Text>
                <Text className="text-white text-xl font-bold">#{userRank}</Text>
              </View>
            )}
          </View>

          {/* Leaderboard Preview */}
          <View className="bg-black/30 rounded-xl p-4 mb-4">
            <Text className="text-gray-400 text-sm mb-3 font-medium">Leaderboard</Text>
            {sortedParticipants.slice(0, 3).map((participant, i) => (
              <View
                key={participant.id}
                className="flex-row items-center py-2"
                style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.05)' }}
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
                      participant.id === userId ? 'text-fitness-accent' : 'text-white'
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
                <Text className="text-white font-bold">{participant.points}</Text>
                <Text className="text-gray-500 text-xs ml-1">pts</Text>
              </View>
            ))}
            {sortedParticipants.length > 3 && (
              <View className="flex-row items-center justify-center mt-3 pt-3 border-t border-white/5">
                <Text className="text-gray-500 text-sm">
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
              <Text className="text-gray-500 text-sm ml-2">
                {new Date(competition.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                {new Date(competition.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Users size={16} color="#6b7280" />
              <Text className="text-gray-500 text-sm ml-2">
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
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: '#000000' }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: '#1a1a2e', zIndex: -1 }} />
        {/* Header */}
        <LinearGradient
          colors={['#1a1a2e', '#000000']}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            <Text className="text-white text-3xl font-bold">Competitions</Text>
            <Text className="text-gray-400 text-base mt-1">Compete with friends & groups</Text>
          </Animated.View>
        </LinearGradient>

        {/* Create Competition Button */}
        <Animated.View entering={FadeInRight.duration(600).delay(100)} className="px-5 mb-6">
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

        {/* Active Competitions */}
        {activeCompetitions.length > 0 && (
          <View className="px-5 mb-6">
            <Text className="text-white text-xl font-semibold mb-4">Active</Text>
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
            <Text className="text-white text-xl font-semibold mb-4">Coming Up</Text>
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
