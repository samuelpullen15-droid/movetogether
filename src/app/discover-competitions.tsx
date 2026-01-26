import { View, ScrollView, Pressable, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import { useThemeColors } from '@/lib/useThemeColors';
import { useAuthStore } from '@/lib/auth-store';
import { useFitnessStore } from '@/lib/fitness-store';
import { fetchPublicCompetitions, joinPublicCompetition, PublicCompetition } from '@/lib/competition-service';
import { Globe, Calendar, Users, Trophy } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

function getCompetitionTypeLabel(type: string, startDate: string, endDate: string): string {
  if (type === 'custom') {
    const start = new Date(startDate);
    const end = new Date(endDate);
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
                  {new Date(competition.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                  {new Date(competition.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const loadCompetitions = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { competitions: publicCompetitions } = await fetchPublicCompetitions(user.id);
      setCompetitions(publicCompetitions);
    } catch (error) {
      console.error('Error loading public competitions:', error);
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

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Remove from list
        setCompetitions((prev) => prev.filter((c) => c.id !== competitionId));
        // Refresh user's competitions
        fetchUserCompetitions(user.id);
        Alert.alert('Success', 'You have joined the competition!');
      } else {
        Alert.alert('Error', result.error || 'Failed to join competition');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to join competition');
    } finally {
      setJoiningId(null);
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
    </View>
  );
}
