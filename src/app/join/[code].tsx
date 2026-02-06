import { useState, useEffect } from 'react';
import {
  View,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { Text } from '@/components/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useThemeColors } from '@/lib/useThemeColors';
import { inviteApi } from '@/lib/edge-functions';
import { LiquidGlassBackButton } from '@/components/LiquidGlassBackButton';
import {
  Calendar,
  Users,
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key for pending invite
const PENDING_INVITE_KEY = 'pending_invite_code';

interface CompetitionPreview {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string;
  scoring_type: string;
  max_participants: number | null;
  is_public: boolean;
  participant_count: number;
  creator_name: string;
}

export default function JoinCompetitionScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [competition, setCompetition] = useState<CompetitionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<{ success: boolean; alreadyJoined?: boolean; competitionId?: string } | null>(null);

  // Load competition preview
  useEffect(() => {
    if (!code) {
      setError('Invalid invite link');
      setIsLoading(false);
      return;
    }

    loadCompetitionPreview();
  }, [code]);

  const loadCompetitionPreview = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: apiError } = await inviteApi.getCompetitionByInvite(code!);

      if (apiError || !data) {
        setError('This invite link is invalid or has expired.');
        return;
      }

      setCompetition(data);
    } catch (err) {
      console.error('[JoinCompetition] Error loading preview:', err);
      setError('Unable to load competition details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!code) return;

    // If not logged in, save the invite code and redirect to sign-in
    if (!user) {
      await AsyncStorage.setItem(PENDING_INVITE_KEY, code);
      router.push('/sign-in');
      return;
    }

    try {
      setIsJoining(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { data, error: apiError } = await inviteApi.joinByInvite(code);

      if (apiError) {
        Alert.alert('Error', apiError.message || 'Unable to join competition');
        return;
      }

      if (!data?.success) {
        Alert.alert('Error', data?.error || 'Unable to join competition');
        return;
      }

      setJoinResult({
        success: true,
        alreadyJoined: data.already_joined,
        competitionId: data.competition_id,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to competition after a brief delay
      setTimeout(() => {
        router.replace(`/competition-detail?id=${data.competition_id}`);
      }, 1500);
    } catch (err) {
      console.error('[JoinCompetition] Error joining:', err);
      Alert.alert('Error', 'Unable to join competition. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'upcoming':
        return { label: 'Starting Soon', color: '#3B82F6', bgColor: 'rgba(59, 130, 246, 0.15)' };
      case 'active':
        return { label: 'In Progress', color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.15)' };
      case 'completed':
        return { label: 'Completed', color: '#6B7280', bgColor: 'rgba(107, 114, 128, 0.15)' };
      default:
        return { label: status, color: '#6B7280', bgColor: 'rgba(107, 114, 128, 0.15)' };
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FA114F" />
          <Text className="text-gray-500 mt-4">Loading competition...</Text>
        </View>
      </View>
    );
  }

  // Render error state
  if (error) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20 }}>
          <LiquidGlassBackButton onPress={() => router.back()} />
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <XCircle size={64} color="#EF4444" />
          <Text className="text-xl font-bold mt-4 text-center" style={{ color: colors.text }}>
            Invalid Invite
          </Text>
          <Text className="text-gray-500 mt-2 text-center">{error}</Text>
          <Pressable
            onPress={() => router.replace('/(tabs)/compete')}
            className="mt-8 px-8 py-4 rounded-full"
            style={{ backgroundColor: '#FA114F' }}
          >
            <Text className="text-white font-semibold">Browse Competitions</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Render success state
  if (joinResult?.success) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-8">
          <Animated.View entering={FadeInDown.duration(400)}>
            <CheckCircle size={80} color="#10B981" />
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <Text className="text-2xl font-bold mt-6 text-center" style={{ color: colors.text }}>
              {joinResult.alreadyJoined ? "You're Already In!" : "You're In!"}
            </Text>
            <Text className="text-gray-500 mt-2 text-center">
              {joinResult.alreadyJoined
                ? `You've already joined ${competition?.name}`
                : `Welcome to ${competition?.name}!`}
            </Text>
          </Animated.View>
          <ActivityIndicator size="small" color="#FA114F" className="mt-8" />
          <Text className="text-gray-400 text-sm mt-2">Taking you to the competition...</Text>
        </View>
      </View>
    );
  }

  // Render competition preview
  const statusInfo = getStatusInfo(competition?.status || 'unknown');
  const canJoin = competition?.status === 'upcoming' || competition?.status === 'active';

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* Background Gradient */}
      <LinearGradient
        colors={colors.isDark
          ? ['rgba(250, 17, 79, 0.15)', 'transparent']
          : ['rgba(250, 17, 79, 0.08)', 'transparent']
        }
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 300 }}
      />

      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, flex: 1 }}>
        {/* Header */}
        <LiquidGlassBackButton onPress={() => router.back()} />

        {/* Content */}
        <Animated.View entering={FadeInDown.duration(600)} className="mt-8">
          {/* Invite Badge */}
          <View className="items-center mb-6">
            <View className="px-4 py-2 rounded-full bg-fitness-accent/20">
              <Text className="text-fitness-accent font-semibold">You've Been Invited!</Text>
            </View>
          </View>

          {/* Competition Card */}
          <View
            className="rounded-3xl p-6"
            style={{
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              borderWidth: 1,
              borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            }}
          >
            {/* Status Badge */}
            <View className="flex-row mb-4">
              <View className="px-3 py-1 rounded-full" style={{ backgroundColor: statusInfo.bgColor }}>
                <Text style={{ color: statusInfo.color }} className="text-sm font-semibold">
                  {statusInfo.label}
                </Text>
              </View>
            </View>

            {/* Title */}
            <Text className="text-2xl font-bold mb-2" style={{ color: colors.text }}>
              {competition?.name}
            </Text>

            {/* Creator */}
            <Text className="text-gray-500 mb-4">
              Created by {competition?.creator_name}
            </Text>

            {/* Description */}
            {competition?.description && (
              <Text className="text-gray-600 dark:text-gray-400 mb-6">
                {competition.description}
              </Text>
            )}

            {/* Stats */}
            <View className="flex-row flex-wrap gap-4">
              <View className="flex-row items-center gap-2">
                <Calendar size={18} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
                <Text className="text-gray-500">
                  {formatDate(competition?.start_date || '')} - {formatDate(competition?.end_date || '')}
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <Users size={18} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
                <Text className="text-gray-500">
                  {competition?.participant_count} participant{competition?.participant_count !== 1 ? 's' : ''}
                  {competition?.max_participants && ` / ${competition.max_participants} max`}
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <Trophy size={18} color={colors.isDark ? '#9CA3AF' : '#6B7280'} />
                <Text className="text-gray-500 capitalize">
                  {competition?.scoring_type?.replace('_', ' ')}
                </Text>
              </View>
            </View>
          </View>

          {/* Join Button */}
          {canJoin ? (
            <Pressable
              onPress={handleJoin}
              disabled={isJoining}
              className="mt-8 py-4 rounded-2xl items-center"
              style={{
                backgroundColor: isJoining ? 'rgba(250, 17, 79, 0.5)' : '#FA114F',
              }}
            >
              {isJoining ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-white text-lg font-bold">
                  {user ? 'Join Competition' : 'Sign In to Join'}
                </Text>
              )}
            </Pressable>
          ) : (
            <View className="mt-8 py-4 rounded-2xl items-center bg-gray-500/50">
              <Text className="text-gray-400 text-lg font-semibold">
                Competition {competition?.status === 'completed' ? 'Ended' : 'Unavailable'}
              </Text>
            </View>
          )}

          {/* Sign In Note */}
          {!user && canJoin && (
            <Text className="text-gray-500 text-center mt-4 text-sm">
              You'll need to sign in or create an account to join
            </Text>
          )}
        </Animated.View>
      </View>
    </View>
  );
}
